import { z } from 'zod'
import { operation, ok, notFound, responseSpec, errorSpec } from '@/lib/routes'
import { DatabasePiSessionStore } from '@/lib/satellite/pi-session-store'
import { v4ControlConfig } from '@/backend/lib/pi-v4/control-client'

const output = z.object({ mode: z.enum(['logicle','pi-v4']), sessionId: z.string().nullable() })

/** A legacy MCP PiSession is NOT automatically a V4 RPC binding. */
export const GET = operation({
  name: 'Resolve Pi V4 chat mode',
  authentication: 'user',
  responses: [responseSpec(200, output), errorSpec(404)] as const,
  implementation: async ({ params, session }) => {
    // Existing Logicle ownership logic applies to the conversation.
    const store = new DatabasePiSessionStore()
    const candidate = await store.getSessionForConversation(session.userId, params.conversationId)
    // No V4 grant -> retain the ordinary chat mode even if an MCP PiSession exists.
    let grantedId: string | undefined
    try { grantedId = v4ControlConfig().sessionId } catch { /* V4 disabled */ }
    if (candidate && grantedId && candidate.sessionId === grantedId)
      return ok({ mode: 'pi-v4' as const, sessionId: candidate.sessionId })
    return ok({ mode: 'logicle' as const, sessionId: null })
  },
})
