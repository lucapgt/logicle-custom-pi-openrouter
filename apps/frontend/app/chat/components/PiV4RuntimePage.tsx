import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Markdown } from './Markdown'

type V4Event = { seq: number; sessionId: string; turnId?: string; kind: string; payload?: unknown; emittedAt: string }
type Connection = 'connecting' | 'live' | 'disconnected'
const terminal = new Set(['agent_end', 'turn-complete', 'turn-error', 'turn-uncertain'])
const textOf = (payload: unknown): string => {
  if (typeof payload === 'string') return payload
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    if (typeof obj.text === 'string') return obj.text
    if (typeof obj.message === 'string') return obj.message
  }
  return JSON.stringify(payload ?? '')
}

/** Opt-in Pi RPC view. No credentials, provider keys or session JSONLs enter this component. */
export default function PiV4RuntimePage() {
  const { sessionId = '' } = useParams<{ sessionId: string }>()
  const [draft, setDraft] = useState('')
  const [events, setEvents] = useState<V4Event[]>([])
  const [error, setError] = useState('')
  const [connection, setConnection] = useState<Connection>('connecting')
  const [pending, setPending] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const cursor = useRef(0)
  const pendingRef = useRef<string | null>(null)
  const storeKey = 'pi-v4-pending:' + sessionId
  useEffect(() => {
    cursor.current = 0
    setEvents([])
    pendingRef.current = sessionStorage.getItem(storeKey)
    setPending(pendingRef.current)
    setConnection('connecting')
    let closed = false
    let inFlight = false
    const replay = async () => {
      if (closed || inFlight || !sessionId) return
      inFlight = true
      try {
        const response = await fetch('/api/pi-v4/sessions/' + encodeURIComponent(sessionId) + '/events?after=' + cursor.current, {
          credentials: 'same-origin', cache: 'no-store',
        })
        if (!response.ok) throw new Error('Event replay HTTP ' + response.status)
        const data = await response.json() as { events: V4Event[] }
        if (closed) return
        setEvents(previous => {
          const unique = new Map(previous.map(x => [x.seq, x]))
          for (const item of data.events) unique.set(item.seq, item)
          return [...unique.values()].sort((a, b) => a.seq - b.seq)
        })
        for (const event of [...data.events].sort((a, b) => a.seq - b.seq)) {
          cursor.current = Math.max(cursor.current, event.seq)
          if (event.turnId && event.turnId === pendingRef.current && terminal.has(event.kind)) {
            pendingRef.current = null
            sessionStorage.removeItem(storeKey)
            setPending(null)
          }
        }
        setConnection('live')
        setError('')
      } catch (e) {
        if (!closed) { setConnection('disconnected'); setError(String(e)) }
      } finally { inFlight = false }
    }
    void replay()
    const timer = setInterval(() => void replay(), 1500)
    return () => { closed = true; clearInterval(timer) }
  }, [sessionId, storeKey])
  const send = useCallback(async () => {
    if (!draft.trim() || !sessionId || pendingRef.current || sending) return
    const turnId = crypto.randomUUID()
    pendingRef.current = turnId
    sessionStorage.setItem(storeKey, turnId)
    setPending(turnId)
    setSending(true)
    setError('')
    try {
      const response = await fetch('/api/pi-v4/sessions/' + encodeURIComponent(sessionId) + '/turns', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: draft.trim(), turnId }),
      })
      if (!response.ok) throw new Error('Stato del turno incerto (' + turnId + ', HTTP ' + response.status + '). Non reinviare automaticamente.')
      setDraft('')
    } catch (e) {
      // Preserve the identifier even on error: upstream might have queued the command.
      setError(String(e))
    } finally { setSending(false) }
  }, [draft, sessionId, sending, storeKey])
  return <main className="mx-auto flex h-full max-w-5xl flex-col gap-3 overflow-hidden p-5">
    <header>
      <h1 className="text-xl font-semibold">Pi Native V4</h1>
      <p className="text-sm opacity-70">Sessione {sessionId}. RPC nativo; eventi recuperabili dopo aggiornamento della pagina.</p>
      <p role="status" aria-live="polite" className="text-xs opacity-70">Connessione: {connection}{pending ? ' · Turno in corso o da riconciliare: ' + pending : ''}</p>
    </header>
    <section aria-label="Cronologia Pi Native V4" className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded border p-3" aria-live="polite">
      {events.length === 0 && <p className="text-sm opacity-60">Nessun evento disponibile.</p>}
      {events.map(event => <article key={event.seq} className="rounded-lg border p-3">
        <div className="mb-2 text-xs opacity-60">#{event.seq} · {event.kind} · {event.turnId ?? ''}</div>
        {event.kind === 'message_update' || event.kind === 'agent_message' || event.kind === 'assistant' ?
          <Markdown className="prose max-w-none">{textOf(event.payload)}</Markdown> :
          <pre className="whitespace-pre-wrap break-words text-sm">{textOf(event.payload)}</pre>}
      </article>)}
    </section>
    <label htmlFor="pi-v4-prompt" className="text-sm font-medium">Messaggio</label>
    <textarea id="pi-v4-prompt" aria-label="Prompt Pi V4" className="min-h-24 rounded border bg-transparent p-3"
      value={draft} onChange={event => setDraft(event.target.value)} disabled={!!pending || sending} />
    <button className="rounded bg-primary p-2 text-primary-foreground disabled:opacity-40"
      disabled={!draft.trim() || !!pending || sending || !sessionId} onClick={() => void send()}>
      {pending ? 'In attesa di conferma / riconciliazione' : sending ? 'Invio...' : 'Invia a Pi V4'}
    </button>
    {error && <p role="alert" className="rounded border border-red-500 p-2 text-sm">{error}</p>}
  </main>
}
