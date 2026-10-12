import { z } from 'zod'
import { operation, ok, conflict, notFound, responseSpec, errorSpec } from '@/lib/routes'
import { DatabasePiSessionStore } from '@/lib/satellite/pi-session-store'
import { piSessionHub, connections } from '@/lib/satellite/hub'

export const POST = operation({
  name: 'Resume an owned Pi session after satellite reconnect',
  authentication: 'user',
  responses: [responseSpec(200, z.object({ accepted: z.literal(true) })), errorSpec(404), errorSpec(409)] as const,
  implementation: async ({ session, params }) => {
    const record = await new DatabasePiSessionStore().getSession(session.userId, params.sessionId)
    if (!record) return notFound()
    const conn = connections.get(record.satelliteId)
    if (!conn || conn.kind !== 'registered' || conn.userId !== session.userId ||
        conn.socket.readyState !== conn.socket.OPEN) return conflict('Satellite is disconnected')
    await piSessionHub.controller.resume(session.userId, record.sessionId)
    return ok({ accepted: true as const })
  },
})
