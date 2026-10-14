import { z } from 'zod'
import { operation, ok, notFound, responseSpec, errorSpec } from '@/lib/routes'
import { getConversationWithBackendAssistant } from '@/models/conversation'
import { DatabasePiSessionStore } from '@/lib/satellite/pi-session-store'
import { v4ControlConfig } from '@/backend/lib/pi-v4/control-client'

const output = z.object({ mode: z.enum(['logicle','pi-v4']), sessionId: z.string().nullable() })

/**
 * V4 mode discovery is strictly scoped to an owned conversation.
 * A legacy MCP PiSession is never treated as a Pi Native V4 grant.
 */
export const GET = operation({
  name: 'Resolve Pi Native V4 chat mode',
  authentication: 'user',
  responses: [responseSpec(200, output), errorSpec(404)] as const,
  implementation: async ({ params, session }) => {
    const conversation = await getConversationWithBackendAssistant(params.conversationId)
    if (!conversation || conversation.conversation.ownerId !== session.userId) return notFound()
    const candidate = await new DatabasePiSessionStore().getSessionForConversation(
      session.userId, params.conversationId,
    )
    let grantedId: string | undefined
    try { grantedId = v4ControlConfig().sessionId } catch { /* V4 is disabled */ }
    if (candidate && grantedId && candidate.sessionId === grantedId)
      return ok({ mode: 'pi-v4' as const, sessionId: candidate.sessionId })
    return ok({ mode: 'logicle' as const, sessionId: null })
  },
})
