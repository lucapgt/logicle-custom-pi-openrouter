import { db } from 'db/database'

/** Canonical Logicle history projection; native Pi JSONL remains owned by Pi. */
function resultText(payload: unknown): string {
  if (typeof payload === 'string') return payload
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    if (typeof record.text === 'string') return record.text
    if (typeof record.message === 'string') return record.message
  }
  return JSON.stringify(payload ?? '')
}

export async function ensureV4UserMessage(conversationId: string, turnId: string, text: string) {
  const id = 'pi-v4-user-' + turnId
  await db.transaction().execute(async trx => {
    const existing = await trx.selectFrom('Message').select(['id', 'content'])
      .where('id', '=', id).where('conversationId', '=', conversationId).executeTakeFirst()
    if (existing) {
      // A replay may use the same turn ID, but must never silently change its prompt.
      const parsed = JSON.parse(existing.content) as { content?: unknown }
      if (parsed.content !== text) throw new Error('V4 turn ID reused with different prompt')
      return
    }
    const previous = await trx.selectFrom('Message').select('id')
      .where('conversationId', '=', conversationId).orderBy('sentAt','desc').executeTakeFirst()
    const sentAt = new Date().toISOString()
    await trx.insertInto('Message').values({
      id, conversationId, parent: previous?.id ?? null, role: 'user',
      content: JSON.stringify({ content: text, attachments: [], metadata: { piV4TurnId: turnId } }),
      sentAt, version: 4,
    }).execute()
    await trx.updateTable('Conversation').set({ lastMsgSentAt: sentAt }).where('id','=',conversationId).execute()
  })
}

/**
 * Idempotent terminal event materialization.
 * Same stable ID means replay and multiple requests cannot create duplicate assistant rows.
 */
export async function projectV4TerminalEvent(
  conversationId: string,
  event: { sessionId: string; seq: number; turnId?: string; kind: string; payload?: unknown; emittedAt: string },
) {
  if (!event.turnId || !['turn-complete', 'turn-error'].includes(event.kind)) return
  const userId = 'pi-v4-user-' + event.turnId
  const assistantId = 'pi-v4-assistant-' + event.turnId
  await db.transaction().execute(async trx => {
    const existing = await trx.selectFrom('Message').select('id')
      .where('id','=',assistantId).where('conversationId','=',conversationId).executeTakeFirst()
    if (existing) return
    const userMessage = await trx.selectFrom('Message').select('id')
      .where('id','=',userId).where('conversationId','=',conversationId).where('role','=','user').executeTakeFirst()
    // Never manufacture a chat answer without a matching accepted user turn.
    if (!userMessage) return
    const sentAt = event.emittedAt || new Date().toISOString()
    const content = resultText(event.payload)
    await trx.insertInto('Message').values({
      id: assistantId, conversationId, parent: userId, role: 'assistant',
      content: JSON.stringify({
        parts: event.kind === 'turn-error'
          ? [{ type: 'error', error: content }]
          : [{ type: 'text', text: content }],
        finishReason: event.kind === 'turn-error' ? 'error' : 'stop',
        metadata: { piV4SessionId: event.sessionId, piV4TurnId: event.turnId, piV4Seq: event.seq },
      }),
      sentAt, version: 4,
    }).execute()
    await trx.updateTable('Conversation').set({lastMsgSentAt:sentAt})
      .where('id','=',conversationId).execute()
  })
}
