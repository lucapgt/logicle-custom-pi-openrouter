import { nanoid } from 'nanoid'
import { z } from 'zod'
import { operation, ok, notFound, conflict, responseSpec, errorSpec } from '@/lib/routes'
import { DatabasePiSessionStore } from '@/lib/satellite/pi-session-store'
import { v4ControlRequest } from '@/backend/lib/pi-v4/control-client'

const input = z.object({ text: z.string().trim().min(1).max(60000), turnId: z.string().uuid().optional() })
const output = z.object({ accepted: z.literal(true), turnId: z.string(), status: z.literal('queued') })
export const POST = operation({
  name: 'Queue Pi Native V4 turn',
  authentication: 'user', requestBodySchema: input,
  responses: [responseSpec(200, output), errorSpec(404), errorSpec(409)] as const,
  implementation: async ({ session, params, body }) => {
    const owned = await new DatabasePiSessionStore().getSession(session.userId, params.sessionId)
    if (!owned) return notFound()
    const turnId = body.turnId ?? nanoid()
    try {
      await v4ControlRequest(owned.sessionId, 'turns', { turnId, message: body.text })
      return ok({ accepted: true as const, turnId, status: 'queued' as const })
    } catch {
      // A timeout is not proof of failure: do not generate a second id or retry automatically.
      return conflict('V4 control unavailable or turn state uncertain: preserve the same turn ID')
    }
  },
})
