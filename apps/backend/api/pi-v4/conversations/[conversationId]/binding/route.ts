import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { operation, ok, notFound, conflict, responseSpec, errorSpec } from '@/lib/routes'
import { getConversationWithBackendAssistant } from '@/models/conversation'
import { getUserSatellites } from '@/models/satellite'
import { DatabasePiSessionStore } from '@/lib/satellite/pi-session-store'
import { v4ControlConfig, v4CreateNativeSession } from '@/backend/lib/pi-v4/control-client'

const schema = z.object({ mode: z.enum(['logicle','pi-v4']), sessionId: z.string().nullable(), available: z.boolean() })
const input = z.object({ satelliteId: z.string().min(1).max(128) })
async function isOwned(userId: string, conversationId: string) {
  const conversation = await getConversationWithBackendAssistant(conversationId)
  return !!conversation && conversation.conversation.ownerId === userId
}
function configured() {
  try { v4ControlConfig(); return true } catch { return false }
}
export const GET = operation({
  name: 'Resolve Pi Native V4 chat mode',
  authentication: 'user',
  responses: [responseSpec(200,schema),errorSpec(404)] as const,
  implementation: async ({params,session}) => {
    if (!await isOwned(session.userId,params.conversationId)) return notFound()
    const existing = await new DatabasePiSessionStore().getSessionForConversation(session.userId,params.conversationId)
    const native = existing?.modelRef === 'pi-v4-native' && configured()
    return ok({mode: native ? 'pi-v4' as const:'logicle' as const,sessionId:native ? existing.sessionId:null,
      available:configured() && (!existing || native)})
  },
})
export const POST = operation({
  name:'Create native Pi V4 session and bind it to an owned Logicle conversation',
  authentication:'user',preventCrossSite:true,requestBodySchema:input,
  responses:[responseSpec(200,schema),errorSpec(404),errorSpec(409)] as const,
  implementation:async ({params,session,body,headers,url})=>{
    if (headers.get('sec-fetch-site') === 'cross-site' ||
        (headers.get('origin') && headers.get('origin') !== url.origin)) return conflict('Invalid origin')
    if (!await isOwned(session.userId,params.conversationId)) return notFound()
    if (!configured()) return conflict('Native V4 control not configured')
    const sats = await getUserSatellites(session.userId)
    if (!sats.some(s=>s.id===body.satelliteId)) return notFound()
    const store=new DatabasePiSessionStore()
    const existing=await store.getSessionForConversation(session.userId,params.conversationId)
    if(existing) {
      if(existing.modelRef==='pi-v4-native') return ok({mode:'pi-v4' as const,sessionId:existing.sessionId,available:true})
      return conflict('Conversation already has an MCP Pi binding')
    }
    const sessionId='v4-'+randomUUID().replaceAll('-','')
    try {
      // Do not insert Logicle binding before remote native creation is acknowledged.
      await v4CreateNativeSession(sessionId,params.conversationId)
      await store.saveSession({sessionId,conversationId:params.conversationId,
        satelliteId:body.satelliteId,userId:session.userId,modelRef:'pi-v4-native',lastSeq:0})
      return ok({mode:'pi-v4' as const,sessionId,available:true})
    } catch {
      // Remote success + database failure is ambiguous; recovery/reconciliation needed.
      return conflict('Native session creation or binding failed; check control plane before retrying')
    }
  },
})
