import { z } from 'zod'
import { operation, ok, notFound, conflict, responseSpec, errorSpec } from '@/lib/routes'
import { DatabasePiSessionStore } from '@/lib/satellite/pi-session-store'
import { v4ControlRequest } from '@/backend/lib/pi-v4/control-client'
import { ensureV4UserMessage } from '@/backend/lib/pi-v4/history-projection'

const input = z.object({ text: z.string().trim().min(1).max(32768), turnId: z.string().uuid() })
const output = z.object({ accepted: z.literal(true), turnId: z.string().uuid(), status: z.literal('queued') })

/** Require browser writes to originate from the same origin; do not trust a client Origin as a control origin. */
function validBrowserOrigin(headers: Headers, url: URL): boolean {
  const origin = headers.get('origin')
  if (!origin) return true // non-browser clients: authenticated separately by the session
  try { return new URL(origin).origin === url.origin } catch { return false }
}

export const POST = operation({
  name: 'Queue Pi Native V4 turn',
  authentication: 'user',
  preventCrossSite: true,
  requestBodySchema: input,
  responses: [responseSpec(200, output), errorSpec(404), errorSpec(409)] as const,
  implementation: async ({ session, params, body, headers, url }) => {
    if (!validBrowserOrigin(headers, url)) return conflict('Invalid request origin')
    const owned = await new DatabasePiSessionStore().getSession(session.userId, params.sessionId)
    if (!owned) return notFound()
    // The Go V4 control server enforces 32768 UTF-8 bytes, not Unicode characters.
    if (Buffer.byteLength(body.text, 'utf8') > 32768) return conflict('Prompt exceeds V4 control byte limit')
    const turnId = body.turnId
    try {
      await ensureV4UserMessage(owned.conversationId, turnId, body.text)
      await v4ControlRequest(owned.sessionId, 'turns', { turnId, message: body.text })
      return ok({ accepted: true as const, turnId, status: 'queued' as const })
    } catch {
      // Timeouts do not prove failure: never retry with a new turn ID.
      return conflict('V4 control unavailable or turn state uncertain')
    }
  },
})
