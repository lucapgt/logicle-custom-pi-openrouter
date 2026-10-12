import { z } from 'zod'
import { operation, notFound, responseSpec, errorSpec } from '@/lib/routes'
import { DatabasePiSessionStore } from '@/lib/satellite/pi-session-store'

const querySchema = z.object({
  afterSeq: z.coerce.number().int().nonnegative().default(0),
})

/**
 * Authenticated, replayable Pi event stream.
 * Events are persisted before being exposed; clients can reconnect with afterSeq.
 */
export const GET = operation({
  name: 'Stream Pi session activity',
  authentication: 'user',
  querySchema,
  responses: [responseSpec(200), errorSpec(404)] as const,
  implementation: async ({ session, params, query, signal }) => {
    const store = new DatabasePiSessionStore()
    const record = await store.getSession(session.userId, params.sessionId)
    if (!record) return notFound()

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let seq = query.afterSeq
        let busy = false
        let closed = false
        let interval: ReturnType<typeof setInterval> | undefined
        let lastHeartbeat = Date.now()
        const finish = () => {
          if (closed) return
          closed = true
          if (interval) clearInterval(interval)
          signal.removeEventListener('abort', finish)
          try { controller.close() } catch { /* already closed */ }
        }
        const emit = (data: string) => controller.enqueue(encoder.encode(data))
        const pump = async () => {
          if (busy || closed) return
          busy = true
          try {
            const events = await store.listEvents(session.userId, params.sessionId, seq, 100)
            if (closed) return
            if (events === null) { finish(); return }
            for (const event of events) {
              emit(`id: ${event.seq}\nevent: pi-event\ndata: ${JSON.stringify(event)}\n\n`)
              seq = event.seq
            }
            if (!events.length && Date.now() - lastHeartbeat > 15_000) {
              emit(': keep-alive\n\n')
              lastHeartbeat = Date.now()
            }
          } catch (error) {
            if (!closed) {
              emit(`event: pi-error\ndata: ${JSON.stringify({ error: 'Pi event stream failed' })}\n\n`)
              finish()
            }
          } finally { busy = false }
        }
        signal.addEventListener('abort', finish, { once: true })
        if (signal.aborted) { finish(); return }
        void pump()
        interval = setInterval(() => void pump(), 1000)
      },
    })
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  },
})
