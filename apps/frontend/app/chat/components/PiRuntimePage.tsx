import { useCallback, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

type SatelliteChoice = { id: string; name: string; kind: 'registered' | 'ephemeral'; connected: boolean }
type PiEvent = {
  type: 'session-event'
  sessionId: string
  seq: number
  kind: string
  turnId?: string
  payload?: unknown
  emittedAt: string
}
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload?.error?.message ?? `HTTP ${response.status}`)
  }
  return response.json() as Promise<T>
}

/**
 * Isolated Pi execution panel in Logicle's authenticated chat layout.
 * Pi executes the agent loop locally; this client only starts sessions,
 * submits text and renders persisted server events. No provider keys here.
 */
export default function PiRuntimePage({ conversationIdOverride }: { conversationIdOverride?: string } = {}) {
  const routeParams = useParams<{ conversationId: string }>()
  const conversationId = conversationIdOverride ?? routeParams.conversationId
  const [search, setSearch] = useSearchParams()
  const sessionId = search.get('session') ?? ''
  const [satelliteId, setSatelliteId] = useState('')
  const [satellites, setSatellites] = useState<SatelliteChoice[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [events, setEvents] = useState<PiEvent[]>([])
  const [lastSeq, setLastSeq] = useState(0)
  const [activeTurnId, setActiveTurnId] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (session: string, after: number): Promise<void> => {
    const result = await api<{ events: PiEvent[] }>(
      `/api/pi/sessions/${encodeURIComponent(session)}/events?afterSeq=${after}&limit=100`
    )
    if (!result.events.length) return
    setEvents(current => {
      const seen = new Set(current.map(event => event.seq))
      const next = result.events.filter(event => !seen.has(event.seq))
      return [...current, ...next].sort((a, b) => a.seq - b.seq)
    })
    setLastSeq(last => Math.max(last, ...result.events.map(event => event.seq)))
    if (result.events.some(event => (event.kind === 'turn-complete' || event.kind === 'turn-error') &&
      (!activeTurnId || event.turnId === activeTurnId))) {
      setActiveTurnId('')
    }
  }, [activeTurnId])

  useEffect(() => {
    let cancelled = false
    api<SatelliteChoice[]>('/api/me/satellites')
      .then(data => { if (!cancelled) setSatellites(data.filter(s => s.kind === 'registered' && s.connected)) })
      .catch(err => { if (!cancelled) setError(String(err)) })
    return () => { cancelled = true }
  }, [])

  // Reopen the durable Pi session for this conversation after navigation/refresh.
  useEffect(() => {
    if (!conversationId || sessionId) return
    let cancelled = false
    fetch(`/api/pi/conversations/${encodeURIComponent(conversationId)}/session`, {
      credentials: 'same-origin',
    }).then(async response => {
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`Could not load Pi session: ${response.status}`)
      return response.json() as Promise<{ sessionId: string }>
    }).then(existing => {
      if (!cancelled && existing) setSearch({ session: existing.sessionId }, { replace: true })
    }).catch(error => { if (!cancelled) setError(String(error)) })
    return () => { cancelled = true }
  }, [conversationId, sessionId, setSearch])

  useEffect(() => {
    setEvents([])
    setLastSeq(0)
    setActiveTurnId('')
    if (!sessionId) return
    let cancelled = false
    api<{ sessionId: string; conversationId: string; satelliteId: string }>(
      `/api/pi/sessions/${encodeURIComponent(sessionId)}`
    ).then(info => {
      if (cancelled) return
      if (info.conversationId !== conversationId) throw new Error('Session belongs to another conversation')
      setSatelliteId(info.satelliteId)
    }).catch(err => { if (!cancelled) setError(String(err.message ?? err)) })
    return () => { cancelled = true }
  }, [sessionId, conversationId])

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    const poll = async () => {
      if (cancelled) return
      setRefreshing(true)
      try { await load(sessionId, lastSeq) }
      catch (err) { if (!cancelled) setError(String(err instanceof Error ? err.message : err)) }
      finally { if (!cancelled) setRefreshing(false) }
    }
    void poll()
    const interval = setInterval(() => void poll(), 2000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [sessionId, lastSeq, load])

  // SSE is the low-latency path; paginated polling above remains a fallback.
  useEffect(() => {
    if (!sessionId) return
    const stream = new EventSource(
      `/api/pi/sessions/${encodeURIComponent(sessionId)}/stream?afterSeq=0`,
    )
    const onEvent = (raw: Event) => {
      const message = raw as MessageEvent<string>
      try {
        const event = JSON.parse(message.data) as PiEvent
        if (!Number.isSafeInteger(event.seq) || event.sessionId !== sessionId) return
        setEvents(current => {
          if (current.some(previous => previous.seq === event.seq)) return current
          return [...current, event].sort((a, b) => a.seq - b.seq)
        })
        setLastSeq(last => Math.max(last, event.seq))
        if (event.kind === 'turn-complete' || event.kind === 'turn-error') {
          setActiveTurnId(current => current === event.turnId ? '' : current)
        }
      } catch { /* Ignore malformed events; server-side history stays authoritative. */ }
    }
    stream.addEventListener('pi-event', onEvent)
    return () => {
      stream.removeEventListener('pi-event', onEvent)
      stream.close()
    }
  }, [sessionId])

  const start = async () => {
    if (!conversationId) return
    setBusy(true)
    setError('')
    try {
      const result = await api<{ sessionId: string }>('/api/pi/sessions', {
        method: 'POST',
        body: JSON.stringify({ conversationId, satelliteId }),
      })
      setSearch({ session: result.sessionId })
    } catch (err) { setError(String(err instanceof Error ? err.message : err)) }
    finally { setBusy(false) }
  }

  const prompt = async () => {
    if (!sessionId || !text.trim()) return
    setBusy(true)
    setError('')
    try {
      const result = await api<{ turnId: string }>(
        `/api/pi/sessions/${encodeURIComponent(sessionId)}/prompt`,
        { method: 'POST', body: JSON.stringify({ text: text.trim() }) },
      )
      setActiveTurnId(result.turnId)
      setText('')
    } catch (err) { setError(String(err instanceof Error ? err.message : err)) }
    finally { setBusy(false) }
  }

  return (
    <main className="mx-auto flex h-full w-full max-w-4xl flex-col gap-4 overflow-auto p-5">
      <header>
        <h1 className="text-xl font-semibold">Pi Agent — sessione locale</h1>
        <p className="text-sm opacity-70">Logicle conserva la sessione; Pi esegue autonomamente il lavoro nel satellite.</p>
      </header>
      <p className="text-xs opacity-70">Conversazione: {conversationId ?? 'non selezionata'}</p>
      {!sessionId ? (
        <section className="grid gap-3 rounded-lg border p-4">
          <label className="grid gap-1 text-sm">Satellite connesso
            <select aria-label="Satellite connesso" className="rounded border bg-background p-2"
              value={satelliteId} onChange={e => setSatelliteId(e.target.value)}>
              <option value="">Seleziona un satellite</option>
              {satellites.map(satellite => <option key={satellite.id} value={satellite.id}>{satellite.name}</option>)}
            </select>
          </label>
          <button className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-40"
            disabled={busy || !conversationId || !satelliteId}
            onClick={() => void start()}>Avvia sessione Pi</button>
        </section>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs opacity-70">Sessione: {sessionId} {refreshing ? '· aggiornamento…' : ''}</p>
            <button type="button" className="rounded border px-3 py-1 text-sm disabled:opacity-40"
              disabled={busy}
              onClick={() => {
                setError('')
                setBusy(true)
                void api(`/api/pi/sessions/${encodeURIComponent(sessionId)}/resume`, { method: 'POST' })
                  .catch(err => setError(String(err)))
                  .finally(() => setBusy(false))
              }}>
              Riprendi / recupera eventi
            </button>
          </div>
          <section aria-label="Eventi Pi" className="min-h-48 flex-1 space-y-3 overflow-auto rounded-lg border p-3">
            {events.length === 0 ? <p className="text-sm opacity-60">Nessun evento. Invia un messaggio per iniziare.</p> : null}
            {events.map(event => (
              <article key={event.seq} className="rounded border p-3">
                <div className="mb-1 text-xs opacity-60">#{event.seq} · {event.kind}</div>
                <pre className="whitespace-pre-wrap break-words text-sm">{typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload ?? '', null, 2)}</pre>
              </article>
            ))}
          </section>
          <div className="grid gap-2">
            <textarea aria-label="Messaggio a Pi" className="min-h-24 rounded border bg-transparent p-2"
              value={text} onChange={e => setText(e.target.value)} placeholder="Scrivi a Pi…" />
            <button className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-40"
              disabled={busy || !!activeTurnId || !text.trim()} onClick={() => void prompt()}>
              {activeTurnId ? 'Pi sta lavorando…' : 'Invia a Pi'}
            </button>
          </div>
        </>
      )}
      {error && <p role="alert" className="rounded border border-red-500 p-2 text-sm">{error}</p>}
    </main>
  )
}
