import { Kysely } from 'kysely'

/** Keep timestamp fields as TEXT for SQLite and PostgreSQL portability. */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.createTable('PiSession')
    .addColumn('sessionId', 'text', col => col.primaryKey())
    .addColumn('userId', 'text', col => col.notNull().references('User.id').onDelete('cascade'))
    .addColumn('conversationId', 'text', col => col.notNull().unique().references('Conversation.id').onDelete('cascade'))
    .addColumn('satelliteId', 'text', col => col.notNull().references('Satellite.id').onDelete('cascade'))
    .addColumn('modelRef', 'text', col => col.notNull())
    .addColumn('lastSeq', 'integer', col => col.notNull().defaultTo(0))
    .addColumn('createdAt', 'text', col => col.notNull())
    .execute()

  await db.schema.createIndex('PiSession_userId')
    .on('PiSession').column('userId').execute()
  await db.schema.createIndex('PiSession_satelliteId')
    .on('PiSession').column('satelliteId').execute()

  await db.schema.createTable('PiSessionEvent')
    .addColumn('sessionId', 'text', col => col.notNull().references('PiSession.sessionId').onDelete('cascade'))
    .addColumn('seq', 'integer', col => col.notNull())
    .addColumn('kind', 'text', col => col.notNull())
    .addColumn('payload', 'text', col => col.notNull())
    .addColumn('createdAt', 'text', col => col.notNull())
    .addPrimaryKeyConstraint('pi_session_event_pk', ['sessionId', 'seq'])
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('PiSessionEvent').ifExists().execute()
  await db.schema.dropTable('PiSession').ifExists().execute()
}
