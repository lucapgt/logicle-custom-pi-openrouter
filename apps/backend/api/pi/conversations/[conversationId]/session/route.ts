import { z } from 'zod'
import { operation, ok, notFound, responseSpec, errorSpec } from '@/lib/routes'
import { DatabasePiSessionStore } from '@/lib/satellite/pi-session-store'

const output = z.object({ sessionId: z.string(), conversationId: z.string(), satelliteId: z.string(), lastSeq: z.number() })

export const GET = operation({
  name: 'Get Pi session for conversation',
  authentication: 'user',
  responses: [responseSpec(200, output), errorSpec(404)] as const,
  implementation: async ({ params, session }) => {
    const record = await new DatabasePiSessionStore().getSessionForConversation(
      session.userId, params.conversationId,
    )
    if (!record) return notFound()
    return ok({
      sessionId: record.sessionId,
      conversationId: record.conversationId,
      satelliteId: record.satelliteId,
      lastSeq: record.lastSeq,
    })
  },
})
