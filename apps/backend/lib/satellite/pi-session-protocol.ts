/** Shared, opt-in Pi session messages over the authenticated satellite websocket. */
export type PiSessionCommand =
  | { type: 'session-start'; requestId: string; conversationId: string; workspaceId: '/workspace'; modelRef: string }
  | { type: 'session-prompt'; requestId: string; sessionId: string; turnId: string; text: string }
  | { type: 'session-resume'; requestId: string; sessionId: string; afterSeq: number }
  | { type: 'session-cancel'; requestId: string; sessionId: string; turnId?: string }
export type PiSessionResponse =
  | { type: 'session-started'; requestId: string; sessionId: string }
  | { type: 'session-accepted'; requestId: string; sessionId: string; turnId?: string }
  | { type: 'session-cancelled'; requestId: string; sessionId: string; turnId?: string }
  | { type: 'session-error'; requestId: string; error: string }
  | { type: 'session-event'; sessionId: string; turnId?: string; seq: number; kind: string; payload?: unknown; emittedAt: string }
export type PiSessionMessage = PiSessionCommand | PiSessionResponse

export const isPiSessionMessage = (value: unknown): value is PiSessionMessage => {
  if (value === null || typeof value !== 'object') return false
  const msg = value as Record<string, unknown>
  switch (msg.type) {
    case 'session-start':
      return typeof msg.requestId === 'string' && typeof msg.conversationId === 'string' &&
        msg.workspaceId === '/workspace' && typeof msg.modelRef === 'string'
    case 'session-prompt':
      return typeof msg.requestId === 'string' && typeof msg.sessionId === 'string' &&
        typeof msg.turnId === 'string' && typeof msg.text === 'string'
    case 'session-resume':
      return typeof msg.requestId === 'string' && typeof msg.sessionId === 'string' &&
        Number.isSafeInteger(msg.afterSeq) && (msg.afterSeq as number) >= 0
    case 'session-cancel':
      return typeof msg.requestId === 'string' && typeof msg.sessionId === 'string'
    case 'session-started':
    case 'session-accepted':
    case 'session-cancelled':
      return typeof msg.requestId === 'string' && typeof msg.sessionId === 'string'
    case 'session-error':
      return typeof msg.requestId === 'string' && typeof msg.error === 'string'
    case 'session-event':
      return typeof msg.sessionId === 'string' && Number.isSafeInteger(msg.seq) &&
        (msg.seq as number) > 0 && typeof msg.kind === 'string' && typeof msg.emittedAt === 'string'
    default: return false
  }
}
export const isPiSessionResponse = (value: unknown): value is PiSessionResponse =>
  isPiSessionMessage(value) &&
  ['session-started', 'session-accepted', 'session-cancelled', 'session-error', 'session-event'].includes(value.type)
