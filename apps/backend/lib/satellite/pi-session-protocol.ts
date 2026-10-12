/** Opt-in Pi session wire protocol over the existing authenticated satellite socket. */
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

export function isPiSessionResponse(value: unknown): value is PiSessionResponse {
  if (!value || typeof value !== 'object') return false
  const msg = value as Record<string, unknown>
  switch (msg.type) {
    case 'session-started':
      return typeof msg.requestId === 'string' && typeof msg.sessionId === 'string'
    case 'session-accepted':
    case 'session-cancelled':
      return typeof msg.requestId === 'string' && typeof msg.sessionId === 'string'
    case 'session-error':
      return typeof msg.requestId === 'string' && typeof msg.error === 'string'
    case 'session-event':
      return typeof msg.sessionId === 'string' && Number.isSafeInteger(msg.seq) &&
        (msg.seq as number) > 0 && typeof msg.kind === 'string' && typeof msg.emittedAt === 'string'
    default:
      return false
  }
}
