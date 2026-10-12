import { z } from 'zod'
import { operation, ok, notFound, responseSpec, errorSpec } from '@/lib/routes'
import { DatabasePiSessionStore } from '@/lib/satellite/pi-session-store'

const output = z.object({
  sessionId: z.string(),
  conversationId: z.string(),
  satelliteId: z.string(),
  lastSeq: z.number(),
})

export const GET = operation({
  name: 'Get owned Pi session',
  authentication: 'user',
  responses: [responseSpec(200, output), errorSpec(404)] as const,
  implementation: async ({ params, session }) => {
    const record = await new DatabasePiSessionStore().getSession(session.userId, params.sessionId)
    if (!record) return notFound()
    // Do not return modelRef: it is an internal server-side routing selector.
    return ok({
      sessionId: record.sessionId,
      conversationId: record.conversationId,
      satelliteId: record.satelliteId,
      lastSeq: record.lastSeq,
    })
  },
})
