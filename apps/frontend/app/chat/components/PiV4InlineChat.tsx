import { useEffect, useRef, useState } from 'react'

type Event = { seq: number; sessionId: string; turnId?: string; kind: string; payload?: unknown; emittedAt: string }
type Props = { sessionId: string; conversationId: string }
const done = new Set(['agent_end', 'turn-complete', 'turn-error', 'turn-uncertain'])
function describe(payload: unknown): string {
  if (typeof payload === 'string') return payload
  if (payload && typeof payload === 'object') {
    const x = payload as Record<string, unknown>
    if (typeof x.text === 'string') return x.text
    if (typeof x.message === 'string') return x.message
  }
  return JSON.stringify(payload ?? '')
}
/** Embedded in standard Logicle Chat: no second route and no provider credentials. */
export function PiV4InlineChat({ sessionId, conversationId }: Props) {
  const [events, setEvents] = useState<Event[]>([])
  const [state, setState] = useState('connecting')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const cursor = useRef(0)
  const flight = useRef(false)
  const pendingKey = 'pi-v4:pending:' + conversationId
  useEffect(() => {
    let alive = true
    cursor.current = 0
    setEvents([])
    setPending(sessionStorage.getItem(pendingKey))
    const poll = async () => {
      if (!alive || flight.current) return
      flight.current = true
      try {
        const r = await fetch('/api/pi-v4/sessions/' + encodeURIComponent(sessionId) + '/events?after=' + cursor.current, { credentials: 'same-origin', cache: 'no-store' })
        if (!r.ok) throw Error('Replay HTTP ' + r.status)
        const batch = (await r.json()) as { events: Event[] }
        if (!alive) return
        const sorted = [...batch.events].sort((a,b) => a.seq-b.seq)
        setEvents(prev => {
          const merged = new Map(prev.map(e => [e.seq,e]))
          for(const e of sorted) if(e.sessionId===sessionId) merged.set(e.seq,e)
          return [...merged.values()].sort((a,b)=>a.seq-b.seq)
        })
        for(const e of sorted) {
          if(e.sessionId !== sessionId) continue
          cursor.current = Math.max(cursor.current,e.seq)
          if(e.turnId === sessionStorage.getItem(pendingKey) && done.has(e.kind)) {
            sessionStorage.removeItem(pendingKey)
            setPending(null)
          }
        }
        setState('connected')
        setError('')
      } catch(e) { if(alive) { setState('disconnected');setError(String(e)) } }
      finally { flight.current = false }
    }
    void poll()
    const timer = window.setInterval(()=>void poll(),1500)
    return ()=>{alive=false; window.clearInterval(timer)}
  },[sessionId,conversationId,pendingKey])
  const send = async () => {
    if (!draft.trim() || pending || !sessionId) return
    const id = crypto.randomUUID()
    sessionStorage.setItem(pendingKey,id)
    setPending(id)
    try {
      const r = await fetch('/api/pi-v4/sessions/'+encodeURIComponent(sessionId)+'/turns',{
        method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text:draft.trim(),turnId:id}),
      })
      if(!r.ok) throw Error('Esito incerto del turno '+id+' (HTTP '+r.status+'); non reinviare')
      setDraft('')
    }catch(e){setError(String(e))}
  }
  return <section className="border-t p-3" aria-label="Pi Native V4">
    <div className="text-sm font-semibold">Pi Native V4 · {state}</div>
    <div className="max-h-64 overflow-y-auto space-y-2" aria-live="polite">
      {events.map(e=><div key={e.seq} className="rounded border p-2 text-sm">
        <strong>{e.kind}</strong><pre className="whitespace-pre-wrap break-words">{describe(e.payload)}</pre>
      </div>)}
    </div>
    <label className="block text-sm" htmlFor="pi-v4-inline-message">Messaggio a Pi</label>
    <textarea id="pi-v4-inline-message" value={draft} onChange={e=>setDraft(e.target.value)}
      disabled={!!pending} className="w-full rounded border p-2 bg-transparent" />
    <button type="button" className="rounded border px-3 py-2" disabled={!draft.trim()||!!pending}
      onClick={()=>void send()}>{pending?'Turno in corso / da riconciliare':'Invia a Pi V4'}</button>
    {error&&<p role="alert" className="text-sm">{error}</p>}
  </section>
}
