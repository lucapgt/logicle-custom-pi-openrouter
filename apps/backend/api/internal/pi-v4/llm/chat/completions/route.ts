/**
 * Logicle-owned, service-authenticated OpenAI-compatible completion endpoint for Pi V4.
 * No provider credential or user-controlled provider selection leaves the backend.
 * Disabled unless V4_LOGICLE_SERVICE_TOKEN is explicitly configured.
 */
import { timingSafeEqual } from 'node:crypto'
import * as ai from 'ai'
import { db } from 'db/database'
import { getConversationWithBackendAssistant } from '@/models/conversation'
import { getBackend, getModelsForBackend } from '@/models/backend'
import { createLanguageModel } from '@/lib/chat/provider-factory'

export const runtime = 'nodejs'

type ChatMessage = { role: 'system' | 'developer' | 'user' | 'assistant'; content: string }
type CompletionInput = {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  max_tokens?: number
  max_completion_tokens?: number
  temperature?: number
}

const jsonError = (message: string, status: number) =>
  Response.json({ error: { message, type: 'invalid_request_error' } }, {
    status, headers: { 'Cache-Control': 'no-store' },
  })

function constantTimeToken(header: string | null, configured: string | undefined): boolean {
  if (!configured || configured.length < 32 || !header?.startsWith('Bearer ')) return false
  const actual = Buffer.from(header.slice(7))
  const expected = Buffer.from(configured)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function validInput(value: unknown): value is CompletionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const p = value as Record<string, unknown>
  if (typeof p.model !== 'string' || p.model.length > 256 ||
      !Array.isArray(p.messages) || p.messages.length < 1 || p.messages.length > 100 ||
      p.stream !== undefined && typeof p.stream !== 'boolean') return false
  if (p.temperature !== undefined &&
      (typeof p.temperature !== 'number' || !Number.isFinite(p.temperature) || p.temperature < 0 || p.temperature > 2)) return false
  for (const message of p.messages) {
    if (!message || typeof message !== 'object' ||
        !['system', 'developer', 'user', 'assistant'].includes(message.role) ||
        typeof message.content !== 'string' || message.content.length > 100_000) return false
  }
  return JSON.stringify(p.messages).length <= 400_000
}

export async function POST(request: Request): Promise<Response> {
  if (!constantTimeToken(request.headers.get('authorization'), process.env.V4_LOGICLE_SERVICE_TOKEN)) {
    return jsonError('Unauthorized', 401)
  }
  const sessionId = request.headers.get('x-v4-session') ?? ''
  const satelliteId = request.headers.get('x-v4-satellite') ?? ''
  if (!/^v4-[a-f0-9]{32}$/.test(sessionId) ||
      !satelliteId || satelliteId.length > 128) return jsonError('Invalid session scope', 403)

  const length = Number(request.headers.get('content-length') ?? 0)
  if (!Number.isFinite(length) || length > 1_048_576) return jsonError('Request too large', 413)
  let payload: unknown
  try {
    const body = await request.text()
    if (body.length > 1_048_576) return jsonError('Request too large', 413)
    payload = JSON.parse(body)
  } catch {
    return jsonError('Invalid JSON', 400)
  }
  if (!validInput(payload)) return jsonError('Invalid completion payload', 400)
  const input = payload as CompletionInput
  const cap = Number(process.env.V4_LOGICLE_MAX_OUTPUT_TOKENS ?? '4096')
  if (!Number.isSafeInteger(cap) || cap < 1 || cap > 32768) return jsonError('Gateway configuration unavailable', 503)
  const requested = input.max_completion_tokens ?? input.max_tokens
  if (!Number.isSafeInteger(requested) || requested! < 1 || requested! > cap ||
      (input.max_completion_tokens !== undefined && input.max_tokens !== undefined &&
       input.max_completion_tokens !== input.max_tokens)) return jsonError('Output token limit exceeded', 403)

  // Verify both the session ownership chain and satellite identity before loading provider keys.
  const binding = await db.selectFrom('PiSession as p')
    .innerJoin('Conversation as c', 'c.id', 'p.conversationId')
    .innerJoin('Satellite as s', 's.id', 'p.satelliteId')
    .select(['p.conversationId', 'p.userId', 'p.modelRef'])
    .where('p.sessionId', '=', sessionId)
    .where('p.satelliteId', '=', satelliteId)
    .where('p.modelRef', '=', 'pi-v4-native')
    .whereRef('c.ownerId', '=', 'p.userId')
    .whereRef('s.userId', '=', 'p.userId')
    .executeTakeFirst()
  if (!binding) return jsonError('Unknown or unauthorized V4 binding', 403)

  const linked = await getConversationWithBackendAssistant(binding.conversationId)
  if (!linked || linked.conversation.ownerId !== binding.userId ||
      linked.assistant.deleted) return jsonError('Conversation unavailable', 403)
  // Never permit the Pi client to choose a different model or backend than the chat owner selected.
  if (input.model !== linked.assistant.model) return jsonError('Model not authorized for conversation', 403)
  const backend = await getBackend(linked.backend.id)
  if (!backend) return jsonError('Provider unavailable', 503)
  const allowed = (await getModelsForBackend(backend)).find(m => m.id === input.model)
  if (!allowed) return jsonError('Model unavailable on configured backend', 403)

  const model = createLanguageModel(backend, allowed, { user: binding.userId })
  const messages: ai.ModelMessage[] = input.messages.map(m => ({
    role: m.role === 'developer' ? 'system' as const : m.role,
    content: m.content,
  }))
  const args = {
    model, messages, maxOutputTokens: requested,
    ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
  }
  try {
    if (!input.stream) {
      const result = await ai.generateText(args)
      return Response.json({
        id: 'chatcmpl-v4-' + sessionId, object: 'chat.completion',
        choices: [{ index: 0, message: { role: 'assistant', content: result.text }, finish_reason: 'stop' }],
      }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const result = ai.streamText(args)
    const encoder = new TextEncoder()
    const id = 'chatcmpl-v4-' + sessionId
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (delta: Record<string, unknown>, finish: string | null = null) => {
          controller.enqueue(encoder.encode('data: ' + JSON.stringify({
            id, object: 'chat.completion.chunk',
            choices: [{ index: 0, delta, finish_reason: finish }],
          }) + '\n\n'))
        }
        try {
          send({ role: 'assistant' })
          for await (const chunk of result.textStream) send({ content: chunk })
          send({}, 'stop')
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        } catch {
          controller.error(new Error('LLM generation failed'))
        } finally {
          controller.close()
        }
      },
    })
    return new Response(stream, { headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no',
    } })
  } catch {
    return jsonError('LLM generation failed', 502)
  }
}
