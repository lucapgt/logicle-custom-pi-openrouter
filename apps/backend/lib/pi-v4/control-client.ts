/** Backend-only bridge: never expose V4_CONTROL_UI_TOKEN or provider secrets to the browser. */
export function v4ControlConfig(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.V4_CONTROL_INTERNAL_URL
  const token = env.V4_CONTROL_UI_TOKEN
  const sessionId = env.V4_CONTROL_SESSION_ID
  if (!raw || !token || token.length < 32 || !sessionId) throw new Error('V4 control unavailable')
  const url = new URL(raw)
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '') ||
      !['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid V4 control origin')
  if (!['v4-control', '127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Untrusted V4 control host')
  return { origin: url.origin, token, sessionId }
}
export async function v4ControlRequest(sessionId: string, path: 'turns' | 'events', options?: {
  message?: string; turnId?: string; after?: number; fetchImpl?: typeof fetch
}): Promise<unknown> {
  const config = v4ControlConfig()
  // Current control service is single-session. Fail closed until multi-session grants are implemented.
  if (sessionId !== config.sessionId) throw new Error('V4 session binding mismatch')
  const url = new URL('/v4/sessions/' + encodeURIComponent(sessionId) + '/' + path, config.origin)
  if (path === 'events') {
    url.searchParams.set('after', String(options?.after ?? 0))
    url.searchParams.set('limit', '100')
  }
  const response = await (options?.fetchImpl ?? fetch)(url.toString(), {
    method: path === 'turns' ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + config.token, ...(path === 'turns' ? { 'Content-Type': 'application/json' } : {}) },
    ...(path === 'turns' ? { body: JSON.stringify({ turnId: options?.turnId, message: options?.message }) } : {}),
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  })
  if (response.status !== (path === 'turns' ? 202 : 200)) throw new Error('V4 control HTTP ' + response.status)
  return response.json()
}
