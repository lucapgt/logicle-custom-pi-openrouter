import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { operation, ok, notFound, conflict, responseSpec, errorSpec } from '@/lib/routes'
import { DatabasePiSessionStore } from '@/lib/satellite/pi-session-store'
import { v4ControlRequest } from '@/backend/lib/pi-v4/control-client'

const input = z.object({ text: z.string().trim().min(1).max(60000), turnId: z.string().uuid().optional() })
const output = z.object({ accepted: z.literal(true), turnId: z.string().uuid(), status: z.literal('queued') })

/** Require browser writes to originate from the same origin; do not trust a client Origin as a control origin. */
function validBrowserOrigin(headers: Headers, url: URL): boolean {
  const origin = headers.get('origin')
  if (!origin) return true // non-browser clients: authenticated separately by the session
  try { return new URL(origin).origin === url.origin } catch { return false }
}

export const POST = operation({
  name: 'Queue Pi Native V4 turn',
  authentication: 'user', requestBodySchema: input,
  responses: [responseSpec(200, output), errorSpec(404), errorSpec(409)] as const,
  implementation: async ({ session, params, body, headers, url }) => {
    if (!validBrowserOrigin(headers, url)) return conflict('Invalid request origin')
    const owned = await new DatabasePiSessionStore().getSession(session.userId, params.sessionId)
    if (!owned) return notFound()
    const turnId = body.turnId ?? randomUUID()
    try {
      await v4ControlRequest(owned.sessionId, 'turns', { turnId, message: body.text })
      return ok({ accepted: true as const, turnId, status: 'queued' as const })
    } catch {
      // Timeouts do not prove failure: never retry with a new turn ID.
      return conflict('V4 control unavailable or turn state uncertain')
    }
  },
})
