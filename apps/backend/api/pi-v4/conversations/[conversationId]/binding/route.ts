import { z } from 'zod'
import { operation, ok, notFound, conflict, responseSpec, errorSpec } from '@/lib/routes'
import { getConversationWithBackendAssistant } from '@/models/conversation'
import { getUserSatellites } from '@/models/satellite'
import { DatabasePiSessionStore } from '@/lib/satellite/pi-session-store'
import { v4ControlConfig } from '@/backend/lib/pi-v4/control-client'

const schema = z.object({ mode: z.enum(['logicle', 'pi-v4']), sessionId: z.string().nullable(), available: z.boolean() })
const input = z.object({ satelliteId: z.string().min(1).max(128) })
async function grant() { try { return v4ControlConfig().sessionId } catch { return null } }
async function isOwned(userId: string, conversationId: string) {
  const conversation = await getConversationWithBackendAssistant(conversationId)
  return !!conversation && conversation.conversation.ownerId === userId
}
export const GET = operation({
  name: 'Get Logicle Pi V4 binding',
  authentication: 'user',
  responses: [responseSpec(200, schema), errorSpec(404)] as const,
  implementation: async ({ params, session }) => {
    if (!await isOwned(session.userId, params.conversationId)) return notFound()
    const granted = await grant()
    const binding = await new DatabasePiSessionStore().getSessionForConversation(session.userId, params.conversationId)
    const v4 = !!granted && binding?.sessionId === granted && binding.modelRef === 'pi-v4-native'
    return ok({ mode: v4 ? 'pi-v4' as const : 'logicle' as const,
      sessionId: v4 ? binding.sessionId : null, available: !!granted && (!binding || v4) })
  },
})
export const POST = operation({
  name: 'Activate pre-provisioned Pi V4 session in existing Logicle chat',
  authentication: 'user', preventCrossSite: true, requestBodySchema: input,
  responses: [responseSpec(200, schema), errorSpec(404), errorSpec(409)] as const,
  implementation: async ({ params, session, body, headers, url }) => {
    if (headers.get('sec-fetch-site') === 'cross-site' ||
        (headers.get('origin') && headers.get('origin') !== url.origin)) return conflict('Invalid request origin')
    if (!await isOwned(session.userId, params.conversationId)) return notFound()
    const granted = await grant()
    if (!granted) return conflict('Pi V4 control unavailable')
    const satellites = await getUserSatellites(session.userId)
    if (!satellites.some(s => s.id === body.satelliteId)) return notFound()
    const store = new DatabasePiSessionStore()
    const existing = await store.getSessionForConversation(session.userId, params.conversationId)
    if (existing) {
      if (existing.sessionId === granted && existing.modelRef === 'pi-v4-native')
        return ok({ mode: 'pi-v4' as const, sessionId: granted, available: true })
      return conflict('Conversation already bound to a different Pi runtime')
    }
    try {
      await store.saveSession({ sessionId: granted, conversationId: params.conversationId,
        satelliteId: body.satelliteId, userId: session.userId, modelRef: 'pi-v4-native', lastSeq: 0 })
      return ok({ mode: 'pi-v4' as const, sessionId: granted, available: true })
    } catch { return conflict('Native V4 session already reserved') }
  },
})
