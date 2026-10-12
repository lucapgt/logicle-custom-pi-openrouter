import { z } from 'zod'
import { nanoid } from 'nanoid'
import { operation, ok, notFound, conflict, responseSpec, errorSpec } from '@/lib/routes'
import { piSessionHub, connections } from '@/lib/satellite/hub'
import { DatabasePiSessionStore } from '@/lib/satellite/pi-session-store'
import { decodePiModelSelection, resolvePiLanguageModel } from '@/lib/satellite/pi-model-resolution'
import { createSamplingFunction } from '@/lib/tools/satellite/implementation'

const input = z.object({ text: z.string().trim().min(1).max(100_000) })
const output = z.object({ sessionId: z.string(), turnId: z.string(), accepted: z.literal(true) })

/** Pi owns the agent loop; Logicle authorizes and serves every inference. */
export const POST = operation({
  name: 'Prompt local Pi session',
  authentication: 'user',
  requestBodySchema: input,
  responses: [responseSpec(200, output), errorSpec(404), errorSpec(409)] as const,
  implementation: async ({ session, params, body }) => {
    const record = await new DatabasePiSessionStore().getSession(session.userId, params.sessionId)
    if (!record) return notFound()
    const live = connections.get(record.satelliteId)
    if (!live || live.kind !== 'registered' || live.userId !== session.userId ||
        live.socket.readyState !== live.socket.OPEN) return conflict('Pi satellite is offline')

    // Selection comes from the persisted, ownership-checked session. No client credentials.
    const { model, languageModel } = await resolvePiLanguageModel(
      decodePiModelSelection(record.modelRef), session.userId,
    )
    const sample = createSamplingFunction(model, { samplingLanguageModel: languageModel })
    const turnId = nanoid()
    await piSessionHub.controller.promptWithContext(
      session.userId, record.sessionId, turnId, body.text, sample,
    )
    return ok({ sessionId: record.sessionId, turnId, accepted: true as const })
  },
})
