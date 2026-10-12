import { z } from 'zod'
import { operation, ok, notFound, responseSpec, errorSpec } from '@/lib/routes'
import { DatabasePiSessionStore } from '@/lib/satellite/pi-session-store'

const eventSchema = z.object({
  type: z.literal('session-event'),
  sessionId: z.string(),
  seq: z.number().int().positive(),
  kind: z.string(),
  emittedAt: z.string(),
  turnId: z.string().optional(),
  payload: z.unknown().optional(),
})

export const GET = operation({
  name: 'Read Pi session events',
  description: 'Read events belonging to an authenticated user Pi session.',
  authentication: 'user',
  querySchema: z.object({
    afterSeq: z.coerce.number().int().nonnegative().default(0),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  }),
  responses: [
    responseSpec(200, z.object({ events: z.array(eventSchema) })),
    errorSpec(404),
  ] as const,
  implementation: async ({ params, session, query }) => {
    const events = await new DatabasePiSessionStore().listEvents(
      session.userId, params.sessionId, query.afterSeq, query.limit,
    )
    if (events === null) return notFound()
    return ok({ events })
  },
})
