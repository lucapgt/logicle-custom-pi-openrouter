import type { PiSessionCommand, PiSessionResponse } from './pi-session-protocol'

type Sampling = (request: unknown) => Promise<unknown>
export type SessionIdentity = { satelliteId: string; conversationId: string; userId: string; modelRef: string }
export type SessionRecord = SessionIdentity & { sessionId: string; lastSeq: number }
export type SessionEvent = Extract<PiSessionResponse, { type: 'session-event' }>
export interface PiSessionStore {
  saveSession(record: SessionRecord): Promise<void>
  getSession(userId: string, sessionId: string): Promise<SessionRecord | null>
  appendEvent(record: SessionRecord, event: SessionEvent): Promise<void>
  getSessionForSatellite(satelliteId: string, sessionId: string): Promise<SessionRecord | null>
}
export interface PiSessionTransport {
  send(satelliteId: string, command: PiSessionCommand): void
}
type Pending = {
  satelliteId: string
  resolve: (message: PiSessionResponse) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/** Opt-in controller: the caller must authorize user, conversation, satellite and model. */
export class PiSessionController {
  private pending = new Map<string, Pending>()
  private sampling = new Map<string, { satelliteId: string; sessionId: string; turnId: string; sample: Sampling }>()
  private turnTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private eventQueue = new Map<string, Promise<void>>()
  private counter = 0
  constructor(
    private transport: PiSessionTransport,
    private store: PiSessionStore,
    private timeoutMs = 30_000
  ) {}

  private command(satelliteId: string, value: Omit<PiSessionCommand, 'requestId'>): Promise<PiSessionResponse> {
    const requestId = `pi-${++this.counter}-${Date.now()}`
    const command = { ...value, requestId } as PiSessionCommand
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error(`Pi request timeout: ${command.type}`))
      }, this.timeoutMs)
      this.pending.set(requestId, { satelliteId, resolve, reject, timer })
      try { this.transport.send(satelliteId, command) }
      catch (error) { clearTimeout(timer); this.pending.delete(requestId); reject(error as Error) }
    })
  }

  async start(identity: SessionIdentity, workspaceId: '/workspace'): Promise<SessionRecord> {
    const result = await this.command(identity.satelliteId, {
      type: 'session-start', conversationId: identity.conversationId, workspaceId, modelRef: identity.modelRef,
    } as Omit<PiSessionCommand, 'requestId'>)
    if (result.type !== 'session-started') throw new Error('Unexpected session-start response')
    const record: SessionRecord = { ...identity, sessionId: result.sessionId, lastSeq: 0 }
    await this.store.saveSession(record)
    return record
  }

  async promptWithContext(userId: string, sessionId: string, turnId: string, text: string, sample: Sampling): Promise<void> {
    const record = await this.store.getSession(userId, sessionId)
    if (!record) throw new Error('Session not found or unauthorized')
    if ([...this.sampling.values()].some(x => x.satelliteId === record.satelliteId)) {
      throw new Error('Satellite already running a Pi turn')
    }
    const requestId = `pi-${++this.counter}-${Date.now()}`
    this.sampling.set(requestId, { satelliteId: record.satelliteId, sessionId, turnId, sample })
    const acknowledged = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = this.pending.get(requestId)
        if (pending) {
          this.pending.delete(requestId)
          this.sampling.delete(requestId)
          pending.reject(new Error('Pi prompt acknowledgement timeout'))
        }
      }, this.timeoutMs)
      this.pending.set(requestId, {
        satelliteId: record.satelliteId,
        resolve: msg => {
          if (msg.type === 'session-accepted') resolve()
          else { this.sampling.delete(requestId); reject(new Error('Unexpected Pi prompt response')) }
        },
        reject, timer,
      })
    })
    try {
      this.transport.send(record.satelliteId, { type: 'session-prompt', requestId, sessionId, turnId, text })
      await acknowledged
    } catch (error) {
      const pending = this.pending.get(requestId)
      if (pending) clearTimeout(pending.timer)
      this.pending.delete(requestId)
      this.sampling.delete(requestId)
      throw error
    }
    this.turnTimers.set(requestId, setTimeout(() => {
      this.sampling.delete(requestId)
      this.turnTimers.delete(requestId)
    }, 30 * 60_000))
  }

  async resume(userId: string, sessionId: string): Promise<void> {
    const record = await this.store.getSession(userId, sessionId)
    if (!record) throw new Error('Session not found or unauthorized')
    const result = await this.command(record.satelliteId, {
      type: 'session-resume', sessionId, afterSeq: record.lastSeq,
    } as Omit<PiSessionCommand, 'requestId'>)
    if (result.type !== 'session-accepted') throw new Error('Unexpected resume response')
  }

  /** Only call after checking the authenticated WebSocket identity. */
  async receive(satelliteId: string, msg: PiSessionResponse): Promise<boolean> {
    if (msg.type === 'session-event') {
      // WebSocket callbacks may run concurrently. Event writes and cursor changes
      // must preserve the per-session on-wire ordering, including replay bursts.
      const key = `${satelliteId}:${msg.sessionId}`
      const before = this.eventQueue.get(key) ?? Promise.resolve()
      const work = before.then(async () => {
        const record = await this.store.getSessionForSatellite(satelliteId, msg.sessionId)
        if (!record) throw new Error('Pi session event is unauthorized')
        await this.store.appendEvent(record, msg)
        if ((msg.kind === 'turn-complete' || msg.kind === 'turn-error') && msg.turnId) {
          for (const [id, context] of this.sampling) {
            if (context.satelliteId !== satelliteId || context.sessionId !== msg.sessionId ||
                context.turnId !== msg.turnId) continue
            this.sampling.delete(id)
            const timer = this.turnTimers.get(id)
            if (timer) clearTimeout(timer)
            this.turnTimers.delete(id)
          }
        }
      })
      const tail = work.then(() => undefined, () => undefined)
      this.eventQueue.set(key, tail)
      try {
        await work
        return true
      } finally {
        if (this.eventQueue.get(key) === tail) this.eventQueue.delete(key)
      }
    }
    const pending = this.pending.get(msg.requestId)
    if (!pending || pending.satelliteId !== satelliteId) return false
    this.pending.delete(msg.requestId)
    clearTimeout(pending.timer)
    if (msg.type === 'session-error') {
      this.sampling.delete(msg.requestId)
      pending.reject(new Error(msg.error))
    } else pending.resolve(msg)
    return true
  }

  getSamplingContext(satelliteId: string, parentRequestId: string): Sampling | undefined {
    const context = this.sampling.get(parentRequestId)
    return context?.satelliteId === satelliteId ? context.sample : undefined
  }

  disconnected(satelliteId: string): void {
    for (const [id, pending] of this.pending) if (pending.satelliteId === satelliteId) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Satellite disconnected'))
      this.pending.delete(id)
    }
    for (const [id, context] of this.sampling) if (context.satelliteId === satelliteId) {
      this.sampling.delete(id)
      const timer = this.turnTimers.get(id)
      if (timer) clearTimeout(timer)
      this.turnTimers.delete(id)
    }
  }
}
