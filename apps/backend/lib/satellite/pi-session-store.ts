import { db } from 'db/database'
import type { PiSessionStore, SessionEvent, SessionRecord } from './pi-session-controller'

/** Extract the human-visible result from the local MCP response envelope. */
function piResultText(payload: unknown): string {
  if (typeof payload === 'string') return payload
  if (!payload || typeof payload !== 'object') return String(payload ?? '')
  const object = payload as Record<string, unknown>
  const blocks = object.content
  if (Array.isArray(blocks)) {
    const text = blocks
      .filter((item): item is { text: string } =>
        !!item && typeof item === 'object' &&
        (item as Record<string, unknown>).type === 'text' &&
        typeof (item as Record<string, unknown>).text === 'string'
      ).map(item => item.text).join('\n')
    if (text.length) return text
  }
  return JSON.stringify(payload)
}

export class DatabasePiSessionStore implements PiSessionStore {
  /** Find an existing Pi binding for an owned Logicle conversation. */
  async getSessionForConversation(userId: string, conversationId: string): Promise<SessionRecord | null> {
    const row = await db.selectFrom('PiSession as p')
      .innerJoin('Conversation as c', 'c.id', 'p.conversationId')
      .select(['p.sessionId','p.userId','p.conversationId','p.satelliteId','p.modelRef','p.lastSeq'])
      .where('p.conversationId', '=', conversationId)
      .where('p.userId', '=', userId)
      .where('c.ownerId', '=', userId)
      .executeTakeFirst()
    return row ?? null
  }

  /** Read stored events only after checking session and conversation ownership. */
  async listEvents(userId: string, sessionId: string, afterSeq = 0, limit = 100): Promise<SessionEvent[] | null> {
    if (!Number.isSafeInteger(afterSeq) || afterSeq < 0 ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      throw new Error('Invalid Pi event pagination')
    }
    return db.transaction().execute(async trx => {
      const owned = await trx.selectFrom('PiSession as p')
        .innerJoin('Conversation as c', 'c.id', 'p.conversationId')
        .select('p.sessionId')
        .where('p.sessionId', '=', sessionId)
        .where('p.userId', '=', userId)
        .where('c.ownerId', '=', userId)
        .executeTakeFirst()
      if (!owned) return null
      const rows = await trx.selectFrom('PiSessionEvent')
        .select('payload')
        .where('sessionId', '=', sessionId)
        .where('seq', '>', afterSeq)
        .orderBy('seq', 'asc')
        .limit(limit)
        .execute()
      return rows.map(row => JSON.parse(row.payload) as SessionEvent)
    })
  }

  async saveSession(record: SessionRecord): Promise<void> {
    await db.transaction().execute(async trx => {
      const conversation = await trx.selectFrom('Conversation').select('id')
        .where('id', '=', record.conversationId).where('ownerId', '=', record.userId).executeTakeFirst()
      const satellite = await trx.selectFrom('Satellite').select('id')
        .where('id', '=', record.satelliteId).where('userId', '=', record.userId).executeTakeFirst()
      if (!conversation || !satellite) throw new Error('Unauthorized Pi session binding')
      const existing = await trx.selectFrom('PiSession').selectAll()
        .where('conversationId', '=', record.conversationId).executeTakeFirst()
      if (existing) {
        if (existing.sessionId !== record.sessionId) throw new Error('Conversation already bound to Pi')
        return
      }
      await trx.insertInto('PiSession').values({ ...record, createdAt: new Date().toISOString() }).execute()
    })
  }
  async getSession(userId: string, sessionId: string): Promise<SessionRecord | null> {
    const row = await db.selectFrom('PiSession as p')
      .innerJoin('Conversation as c', 'c.id', 'p.conversationId')
      .select(['p.sessionId','p.userId','p.conversationId','p.satelliteId','p.modelRef','p.lastSeq'])
      .where('p.sessionId', '=', sessionId).where('p.userId', '=', userId)
      .where('c.ownerId', '=', userId).executeTakeFirst()
    return row ?? null
  }
  async getSessionForSatellite(satelliteId: string, sessionId: string): Promise<SessionRecord | null> {
    const row = await db.selectFrom('PiSession as p')
      .innerJoin('Conversation as c', 'c.id', 'p.conversationId')
      .select(['p.sessionId','p.userId','p.conversationId','p.satelliteId','p.modelRef','p.lastSeq'])
      .where('p.sessionId', '=', sessionId).where('p.satelliteId', '=', satelliteId)
      .whereRef('c.ownerId', '=', 'p.userId').executeTakeFirst()
    return row ?? null
  }
  async appendEvent(record: SessionRecord, event: SessionEvent): Promise<void> {
    await db.transaction().execute(async trx => {
      const current = await trx.selectFrom('PiSession').selectAll()
        .where('sessionId', '=', record.sessionId)
        .where('satelliteId', '=', record.satelliteId).executeTakeFirst()
      if (!current) throw new Error('Pi session not found')
      if (event.seq <= current.lastSeq) {
        const duplicate = await trx.selectFrom('PiSessionEvent').select(['payload','kind'])
          .where('sessionId', '=', record.sessionId).where('seq', '=', event.seq).executeTakeFirst()
        if (duplicate?.payload === JSON.stringify(event) && duplicate.kind === event.kind) return
        throw new Error('Conflicting Pi event replay')
      }
      if (event.seq !== current.lastSeq + 1) throw new Error('Pi event sequence gap')
      const updated = await trx.updateTable('PiSession').set({ lastSeq: event.seq })
        .where('sessionId', '=', record.sessionId).where('lastSeq', '=', current.lastSeq).executeTakeFirst()
      if (Number(updated.numUpdatedRows) !== 1) throw new Error('Concurrent Pi event write')
      await trx.insertInto('PiSessionEvent').values({
        sessionId: record.sessionId, seq: event.seq, kind: event.kind,
        payload: JSON.stringify(event), createdAt: new Date().toISOString(),
      }).execute()
      // Project terminal Pi events into the canonical Logicle chat history.
      // The event and message commit atomically. Intermediate Pi tool events remain
      // in PiSessionEvent and are shown in the Pi activity view.
      if (event.turnId && (event.kind === 'turn-complete' || event.kind === 'turn-error')) {
        const userMessageId = `pi-user-${event.turnId}`
        const userMessage = await trx.selectFrom('Message').select('id')
          .where('id', '=', userMessageId)
          .where('conversationId', '=', record.conversationId)
          .where('role', '=', 'user')
          .executeTakeFirst()
        if (!userMessage) throw new Error('Terminal Pi event has no persisted user prompt')
        const isError = event.kind === 'turn-error'
        const text = piResultText(event.payload)
        const sentAt = new Date().toISOString()
        await trx.insertInto('Message').values({
          id: `pi-assistant-${event.turnId}`,
          conversationId: record.conversationId,
          parent: userMessageId,
          role: 'assistant',
          content: JSON.stringify({
            parts: isError
              ? [{ type: 'error', error: text }]
              : [{ type: 'text', text }],
            finishReason: isError ? 'error' : 'stop',
          }),
          sentAt,
          version: 4,
        }).execute()
        await trx.updateTable('Conversation')
          .set({ lastMsgSentAt: sentAt })
          .where('id', '=', record.conversationId).execute()
      }
    })
  }
}
