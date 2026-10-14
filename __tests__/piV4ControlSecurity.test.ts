import { afterEach, describe, expect, it, vi } from 'vitest'
import { v4ControlConfig, v4ControlRequest } from '../apps/backend/lib/pi-v4/control-client'

const previous = {
  url: process.env.V4_CONTROL_INTERNAL_URL,
  token: process.env.V4_CONTROL_UI_TOKEN,
  session: process.env.V4_CONTROL_SESSION_ID,
}
afterEach(() => {
  if (previous.url === undefined) delete process.env.V4_CONTROL_INTERNAL_URL
  else process.env.V4_CONTROL_INTERNAL_URL = previous.url
  if (previous.token === undefined) delete process.env.V4_CONTROL_UI_TOKEN
  else process.env.V4_CONTROL_UI_TOKEN = previous.token
  if (previous.session === undefined) delete process.env.V4_CONTROL_SESSION_ID
  else process.env.V4_CONTROL_SESSION_ID = previous.session
  vi.restoreAllMocks()
})
function setup() {
  process.env.V4_CONTROL_INTERNAL_URL = 'http://v4-control:8080'
  process.env.V4_CONTROL_UI_TOKEN = 't'.repeat(40)
  process.env.V4_CONTROL_SESSION_ID = 'sess-v4'
}
describe('V4 backend control trust boundary', () => {
  it('fails closed without service credentials', () => {
    expect(() => v4ControlConfig({} as NodeJS.ProcessEnv)).toThrow()
  })
  it('rejects an off-allowlist upstream and embedded credentials', () => {
    expect(() => v4ControlConfig({
      V4_CONTROL_INTERNAL_URL: 'https://evil.example',
      V4_CONTROL_UI_TOKEN: 't'.repeat(40), V4_CONTROL_SESSION_ID: 'sess-v4',
    } as NodeJS.ProcessEnv)).toThrow()
    expect(() => v4ControlConfig({
      V4_CONTROL_INTERNAL_URL: 'https://user:password@localhost',
      V4_CONTROL_UI_TOKEN: 't'.repeat(40), V4_CONTROL_SESSION_ID: 'sess-v4',
    } as NodeJS.ProcessEnv)).toThrow()
  })
  it('rejects cross-session commands before any network call', async () => {
    setup()
    const fetchImpl = vi.fn()
    await expect(v4ControlRequest('other', 'turns', {turnId: 'id',message: 'test', fetchImpl})).rejects.toThrow()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('rejects redirects and never forwards the secret to a redirect destination', async () => {
    setup()
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://evil.example' } }))
    await expect(v4ControlRequest('sess-v4', 'turns', {turnId: 'id',message: 'test',fetchImpl})).rejects.toThrow()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0][1].redirect).toBe('manual')
  })
  it('requires JSON responses and finite replay cursors', async () => {
    setup()
    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200, headers: {'content-type':'text/plain'} }))
    await expect(v4ControlRequest('sess-v4','events',{after:1,fetchImpl})).rejects.toThrow()
    await expect(v4ControlRequest('sess-v4','events',{after:Number.POSITIVE_INFINITY,fetchImpl})).rejects.toThrow()
  })
})
