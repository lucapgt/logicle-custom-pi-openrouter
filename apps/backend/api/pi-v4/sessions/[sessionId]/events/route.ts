import { z } from 'zod'
import { operation, ok, notFound, conflict, responseSpec, errorSpec } from '@/lib/routes'
import { DatabasePiSessionStore } from '@/lib/satellite/pi-session-store'
import { v4ControlRequest } from '@/backend/lib/pi-v4/control-client'
import { projectV4TerminalEvent } from '@/backend/lib/pi-v4/history-projection'

const event = z.object({
  seq: z.number().int().nonnegative(),
  sessionId: z.string(),
  turnId: z.string().optional(),
  kind: z.string(),
  payload: z.unknown().optional(),
  emittedAt: z.string(),
})
const output = z.object({ events: z.array(event).max(100) })

export const GET = operation({
  name: 'Replay Pi Native V4 timeline',
  authentication: 'user',
  querySchema: z.object({ after: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0) }),
  responses: [responseSpec(200, output), errorSpec(404), errorSpec(409)] as const,
  implementation: async ({ session, params, query }) => {
    const owned = await new DatabasePiSessionStore().getSession(session.userId, params.sessionId)
    if (!owned) return notFound()
    try {
      const data = await v4ControlRequest(owned.sessionId, 'events', { after: query.after })
      const parsed = output.parse(data)
      // The upstream control plane is a separate trust boundary: don't leak events for another session.
      if (parsed.events.some(item => item.sessionId !== owned.sessionId || item.seq <= query.after))
        return conflict('Invalid V4 event replay')
      for (const item of [...parsed.events].sort((a,b) => a.seq - b.seq)) {
        await projectV4TerminalEvent(owned.conversationId, item)
      }
      return ok(parsed)
    } catch {
      return conflict('V4 event service unavailable')
    }
  },
})
