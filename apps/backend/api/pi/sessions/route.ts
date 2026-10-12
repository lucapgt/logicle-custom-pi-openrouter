import { z } from 'zod'
import { operation, ok, notFound, conflict, responseSpec, errorSpec } from '@/lib/routes'
import { getConversation } from '@/models/conversation'
import { getSatellite } from '@/models/satellite'
import { piSessionHub, connections } from '@/lib/satellite/hub'
import { encodePiModelSelection, resolvePiLanguageModel } from '@/lib/satellite/pi-model-resolution'

const input = z.object({
  conversationId: z.string().min(1),
  satelliteId: z.string().min(1),
  backendId: z.string().min(1),
  modelId: z.string().min(1),
})
const output = z.object({ sessionId: z.string(), conversationId: z.string() })

/**
 * Experimental endpoint; requires generated route manifest before use.
 * The authenticated user can only start Pi on their own registered satellite.
 */
export const POST = operation({
  name: 'Start local Pi session',
  description: 'Start a Pi runtime session for an owned conversation and satellite.',
  authentication: 'user',
  requestBodySchema: input,
  responses: [responseSpec(200, output), errorSpec(404), errorSpec(409)] as const,
  implementation: async ({ session, body }) => {
    const [conversation, satellite] = await Promise.all([
      getConversation(body.conversationId),
      getSatellite(body.satelliteId),
    ])
    if (!conversation || conversation.ownerId !== session.userId ||
        !satellite || satellite.userId !== session.userId) return notFound()

    const live = connections.get(body.satelliteId)
    if (!live || live.kind !== 'registered' || live.userId !== session.userId ||
        live.socket.readyState !== live.socket.OPEN) {
      return conflict('Selected satellite is offline')
    }

    // Never accept credentials, endpoint URLs, or model definitions from the client.
    await resolvePiLanguageModel({ backendId: body.backendId, modelId: body.modelId }, session.userId)
    const modelRef = encodePiModelSelection({ backendId: body.backendId, modelId: body.modelId })
    const created = await piSessionHub.controller.start({
      conversationId: body.conversationId,
      satelliteId: body.satelliteId,
      userId: session.userId,
      modelRef,
    }, '/workspace')
    return ok({ sessionId: created.sessionId, conversationId: created.conversationId })
  },
})
