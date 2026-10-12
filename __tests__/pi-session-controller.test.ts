import { describe, expect, it, vi } from 'vitest'
import {
  PiSessionController,
  type PiSessionStore,
  type SessionRecord,
  type SessionEvent,
} from '@/lib/satellite/pi-session-controller'
import type { PiSessionCommand } from '@/lib/satellite/pi-session-protocol'

function setup() {
  const records = new Map<string, SessionRecord>()
  const persisted: SessionEvent[] = []
  const commands: PiSessionCommand[] = []
  const store: PiSessionStore = {
    async saveSession(record) { records.set(record.sessionId, record) },
    async getSession(userId, sessionId) {
      const value = records.get(sessionId)
      return value?.userId === userId ? value : null
    },
    async getSessionForSatellite(satelliteId, sessionId) {
      const value = records.get(sessionId)
      return value?.satelliteId === satelliteId ? value : null
    },
    async appendEvent(record, event) {
      if (record.sessionId !== event.sessionId) throw new Error('mismatched session')
      persisted.push(event)
    },
  }
  const controller = new PiSessionController({ send(_satellite, command) { commands.push(command) } }, store, 2_000)
  const identity = { sessionId: 'pi-1', conversationId: 'chat-1', satelliteId: 'sat-1', userId: 'user-1', modelRef: '{}', lastSeq: 0 }
  records.set(identity.sessionId, identity)
  return { controller, commands, persisted }
}

describe('Pi session controller', () => {
  it('enforces session ownership before dispatching a prompt', async () => {
    const { controller, commands } = setup()
    await expect(controller.promptWithContext('another-user', 'pi-1', 'turn-1', 'text', async () => ({})))
      .rejects.toThrow('unauthorized')
    expect(commands).toHaveLength(0)
  })

  it('never accepts a response from a different satellite', async () => {
    const { controller, commands } = setup()
    const request = controller.resume('user-1', 'pi-1')
    await vi.waitFor(() => expect(commands).toHaveLength(1))
    const command = commands[0]
    expect(await controller.receive('sat-2', {
      type: 'session-accepted', requestId: command.requestId, sessionId: 'pi-1',
    })).toBe(false)
    expect(await controller.receive('sat-1', {
      type: 'session-accepted', requestId: command.requestId, sessionId: 'pi-1',
    })).toBe(true)
    await expect(request).resolves.toBeUndefined()
  })

  it('retains sampling through acceptance and clears it at the matching turn terminal event', async () => {
    const { controller, commands, persisted } = setup()
    const sample = vi.fn(async () => ({ role: 'assistant', content: { type: 'text', text: 'ok' } }))
    const prompt = controller.promptWithContext('user-1', 'pi-1', 'turn-a', 'hello', sample)
    await vi.waitFor(() => expect(commands).toHaveLength(1))
    const command = commands[0]
    expect(command.type).toBe('session-prompt')
    expect(controller.getSamplingContext('sat-1', command.requestId)).toBe(sample)
    await controller.receive('sat-1', {
      type: 'session-accepted', requestId: command.requestId, sessionId: 'pi-1', turnId: 'turn-a',
    })
    await prompt
    expect(controller.getSamplingContext('sat-1', command.requestId)).toBe(sample)
    await controller.receive('sat-1', {
      type: 'session-event', sessionId: 'pi-1', turnId: 'turn-a', seq: 1,
      kind: 'turn-complete', payload: { content: [{ type: 'text', text: 'ok' }] },
      emittedAt: new Date().toISOString(),
    })
    expect(persisted).toHaveLength(1)
    expect(controller.getSamplingContext('sat-1', command.requestId)).toBeUndefined()
  })

  it('rejects events from a satellite not bound to the Pi session', async () => {
    const { controller, persisted } = setup()
    await expect(controller.receive('other-sat', {
      type: 'session-event', sessionId: 'pi-1', turnId: 'turn-a',
      seq: 1, kind: 'turn-complete', emittedAt: new Date().toISOString(),
    })).rejects.toThrow('unauthorized')
    expect(persisted).toHaveLength(0)
  })
})
