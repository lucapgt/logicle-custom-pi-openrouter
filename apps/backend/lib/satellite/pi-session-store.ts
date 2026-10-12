import { db } from 'db/database'
import type { PiSessionStore, SessionEvent, SessionRecord } from './pi-session-controller'

export class DatabasePiSessionStore implements PiSessionStore {
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
    })
  }
}
