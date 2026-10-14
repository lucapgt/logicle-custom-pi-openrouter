/**
 * Internal Logicle -> V4 control bridge.
 * Explicit single-session grant until a per-user/session grant issuer is implemented.
 * Secrets never transit through frontend route payloads.
 */
export function v4ControlConfig(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.V4_CONTROL_INTERNAL_URL
  const token = env.V4_CONTROL_UI_TOKEN
  const sessionId = env.V4_CONTROL_SESSION_ID
  if (!raw || !token || token.length < 32) throw new Error('V4 control unavailable')
  const url = new URL(raw)
  if (url.username || url.password || url.search || url.hash ||
      (url.pathname !== '/' && url.pathname !== '') ||
      !['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid V4 control origin')
  if (!['v4-control', '127.0.0.1', 'localhost'].includes(url.hostname))
    throw new Error('Untrusted V4 control host')
  // Plaintext is only permitted for the explicitly named internal Docker service or loopback.
  if (url.protocol === 'http:' && !['v4-control', '127.0.0.1', 'localhost'].includes(url.hostname))
    throw new Error('V4 plaintext control transport not allowed')
  return { origin: url.origin, token, sessionId }
}

export async function v4ControlRequest(sessionId: string, path: 'turns' | 'events', options?: {
  message?: string; turnId?: string; after?: number; fetchImpl?: typeof fetch
}): Promise<unknown> {
  const config = v4ControlConfig()
  if (config.sessionId && sessionId !== config.sessionId) throw new Error('V4 session binding mismatch')
  const url = new URL('/v4/sessions/' + encodeURIComponent(sessionId) + '/' + path, config.origin)
  if (path === 'events') {
    if (!Number.isSafeInteger(options?.after) || (options?.after ?? -1) < 0)
      throw new Error('Invalid event cursor')
    url.searchParams.set('after', String(options?.after))
    url.searchParams.set('limit', '100')
  } else if (!options?.message?.trim() || !options?.turnId) {
    throw new Error('Missing idempotent V4 turn')
  }
  const response = await (options?.fetchImpl ?? fetch)(url.toString(), {
    method: path === 'turns' ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + config.token, ...(path === 'turns' ? { 'Content-Type': 'application/json' } : {}) },
    ...(path === 'turns' ? { body: JSON.stringify({ turnId: options?.turnId, message: options?.message }) } : {}),
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  })
  if (response.status !== (path === 'turns' ? 202 : 200))
    throw new Error('V4 control HTTP ' + response.status)
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/json'))
    throw new Error('Unexpected V4 control response media type')
  return response.json()
}

/**
 * Create a new native Pi session in the V4 control plane before persisting a
 * Logicle binding. This is an explicit REQUIRED satellite/control-plane API.
 * A 404/501 is an error: never claim that a session was created.
 */
export async function v4CreateNativeSession(sessionId: string, conversationId: string): Promise<void> {
  const config = v4ControlConfig()
  // A legacy fixed-session grant cannot securely mint a different session.
  if (config.sessionId) throw new Error('Dynamic native session creation requires V4_CONTROL_SESSION_ID to be unset')
  const url = new URL('/v4/sessions', config.origin)
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + config.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, conversationId }),
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  })
  if (response.status !== 201) throw new Error('V4 native session creation not confirmed')
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) throw new Error('Invalid native session creation response')
  const data: unknown = await response.json()
  if (!data || typeof data !== 'object' || (data as { sessionId?: unknown }).sessionId !== sessionId)
    throw new Error('V4 native session response mismatch')
}
