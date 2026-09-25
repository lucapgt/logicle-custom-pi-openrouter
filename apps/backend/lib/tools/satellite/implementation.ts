import * as dto from '@/types/dto'
import {
  ToolFunction,
  ToolFunctionContext,
  ToolFunctions,
  ToolImplementation,
  ToolInvokeParams,
  ToolParams,
} from '@/lib/chat/tools'
import { UserVisibleError } from '@/backend/lib/chat/exceptions'
import { LlmModel, modelSupportsReasoning } from '@/lib/chat/models'
import { saveFile } from '@/backend/lib/tools/file-output-normalization'
import { normalizeMcpToolResult } from '@/backend/lib/tools/file-output-normalization'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types'
import { jsonSchema, streamText } from 'ai'
import { logger } from '@/lib/logging'

const toToolResult = async (
  result: CallToolResult,
  invokeParams: ToolInvokeParams
): Promise<dto.ToolCallResultOutput> => {
  const { content, structuredContent } = result
  const toolResult: dto.ToolCallResultOutput = {
    type: 'content',
    value: [],
  }

  for (const item of content) {
    if (item.type === 'image' && typeof item.data === 'string') {
      const persisted = await saveFile({
        rootOwner: invokeParams.rootOwner,
        conversationId: invokeParams.conversationId,
        userId: invokeParams.userId,
        assistantId: invokeParams.assistantId,
        content: Buffer.from(item.data, 'base64'),
        mimeType: item.mimeType ?? 'application/octet-stream',
        source: 'Satellite',
      })
      toolResult.value.push(persisted)
      continue
    }

    if (item.type === 'resource') {
      const normalized = await normalizeMcpToolResult(
        { content: [item] },
        {
          rootOwner: invokeParams.rootOwner,
          conversationId: invokeParams.conversationId,
          userId: invokeParams.userId,
          assistantId: invokeParams.assistantId,
        }
      )
      if (normalized.type === 'content') {
        toolResult.value.push(...normalized.value)
      } else {
        toolResult.value.push({ type: 'text', text: JSON.stringify(normalized.value) })
      }
      continue
    }

    if (item.type === 'text' && typeof item.text === 'string') {
      toolResult.value.push({ type: 'text', text: item.text })
      continue
    }

    toolResult.value.push({ type: 'text', text: JSON.stringify(item) })
  }

  if (structuredContent) {
    toolResult.value.push({
      type: 'text',
      text: JSON.stringify(structuredContent),
    })
  }

  return toolResult
}

const samplingBlocks = (content: any): any[] => {
  if (Array.isArray(content)) return content
  if (content == null) return []
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  return [content]
}

const samplingText = (content: any): string =>
  samplingBlocks(content)
    .map((item) => {
      if (typeof item === 'string') return item
      if (item?.type === 'text' && typeof item.text === 'string') return item.text
      if (item?.type === 'image') return '[image]'
      if (item?.type === 'audio') return '[audio]'
      return JSON.stringify(item)
    })
    .join('\n')

const createSamplingFunction = (llmModel: LlmModel, context: ToolFunctionContext) => {
  return async (request: any) => {
    if (!context.samplingLanguageModel) {
      throw new Error('Satellite sampling language model is not available')
    }

    const toolUseNames = new Map<string, string>()
    for (const message of request?.messages ?? []) {
      for (const block of samplingBlocks(message?.content)) {
        if (
          block?.type === 'tool_use' &&
          typeof block.id === 'string' &&
          typeof block.name === 'string'
        ) {
          toolUseNames.set(block.id, block.name)
        }
      }
    }

    const messages: any[] = []
    for (const message of request?.messages ?? []) {
      const blocks = samplingBlocks(message?.content)
      const toolResults = blocks.filter((block) => block?.type === 'tool_result')

      if (toolResults.length > 0) {
        messages.push({
          role: 'tool',
          content: toolResults.map((block) => {
            const textResult = samplingText(block.content)
            const output =
              block.structuredContent !== undefined
                ? { type: 'json', value: block.structuredContent }
                : block.isError === true
                ? { type: 'error-text', value: textResult }
                : { type: 'text', value: textResult }

            return {
              type: 'tool-result',
              toolCallId: block.toolUseId,
              toolName: toolUseNames.get(block.toolUseId) ?? 'unknown_tool',
              output,
            }
          }),
        })
        continue
      }

      if (message.role === 'assistant') {
        const parts: any[] = []
        for (const block of blocks) {
          if (block?.type === 'text') {
            parts.push({ type: 'text', text: block.text ?? '' })
            continue
          }
          if (block?.type === 'tool_use') {
            const input = block.input ?? {}
            parts.push({
              type: 'tool-call',
              toolCallId: block.id,
              toolName: block.name,
              args: input,
              input,
            })
          }
        }
        messages.push({ role: 'assistant', content: parts })
        continue
      }

      const textParts = blocks
        .filter((block) => block?.type === 'text')
        .map((block) => ({ type: 'text', text: block.text ?? '' }))

      if (textParts.length > 0) {
        messages.push({ role: 'user', content: textParts })
      }
    }

    const requestedTools = Array.isArray(request?.tools) ? request.tools : []
    let aiTools: Record<string, any> | undefined
    let aiToolChoice: 'auto' | 'required' | 'none' | undefined

    if (requestedTools.length > 0) {
      if (llmModel.capabilities?.function_calling === false) {
        throw new Error(`Model ${llmModel.id} does not support function calling`)
      }

      aiTools = Object.fromEntries(
        requestedTools.map((tool: any) => {
          const schema = jsonSchema(
            tool.inputSchema ?? {
              type: 'object',
              properties: {},
              additionalProperties: false,
            }
          )
          return [
            tool.name,
            {
              description: tool.description ?? '',
              parameters: schema,
              inputSchema: schema,
            },
          ]
        })
      )

      const requestedMode = request?.toolChoice?.mode
      aiToolChoice =
        requestedMode === 'required' ? 'required' : requestedMode === 'none' ? 'none' : 'auto'
    }

    const result = streamText({
      model: context.samplingLanguageModel,
      system: typeof request?.systemPrompt === 'string' ? request.systemPrompt : undefined,
      messages,
      tools: aiTools,
      toolChoice: aiToolChoice,
      maxOutputTokens: typeof request?.maxTokens === 'number' ? request.maxTokens : undefined,
      temperature:
        !modelSupportsReasoning(llmModel) &&
        llmModel.capabilities?.temperature !== false &&
        typeof request?.temperature === 'number'
          ? request.temperature
          : undefined,
    })

    let text = ''
    const toolCalls: Array<{ toolCallId: string; toolName: string; input: any }> = []
    let finishReason: string | undefined
    let rawFinishReason: string | undefined

    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        text += (part as any).text ?? (part as any).textDelta ?? ''
        continue
      }
      if (part.type === 'tool-call') {
        toolCalls.push({
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: (part as any).input ?? (part as any).args ?? {},
        })
        continue
      }
      if (part.type === 'finish-step' || part.type === 'finish') {
        finishReason = (part as any).finishReason ?? finishReason
        rawFinishReason = (part as any).rawFinishReason ?? rawFinishReason
        continue
      }
      if (part.type === 'error') {
        throw part.error instanceof Error ? part.error : new Error(String(part.error))
      }
    }

    const outputBlocks: any[] = []
    if (text.length > 0) outputBlocks.push({ type: 'text', text })
    for (const call of toolCalls) {
      outputBlocks.push({
        type: 'tool_use',
        id: call.toolCallId,
        name: call.toolName,
        input: call.input ?? {},
      })
    }
    if (outputBlocks.length === 0) {
      logger.warn('[PiSampling] model returned no text/tool-call', {
        model: llmModel.id,
        finishReason,
        rawFinishReason,
      })
      outputBlocks.push({ type: 'text', text: '' })
    }

    const stopReason =
      toolCalls.length > 0 || finishReason === 'tool-calls' || rawFinishReason === 'tool_use'
        ? 'toolUse'
        : finishReason === 'length'
        ? 'maxTokens'
        : 'endTurn'

    return {
      role: 'assistant',
      content: outputBlocks.length === 1 ? outputBlocks[0] : outputBlocks,
      model: llmModel.id,
      stopReason,
    }
  }
}

const createSatelliteToolFunction = (
  satelliteId: string,
  tool: { name: string; description: string; inputSchema?: any },
  llmModel: LlmModel,
  context: ToolFunctionContext
): ToolFunction => {
  const sample = createSamplingFunction(llmModel, context)

  return {
    description: tool.description,
    parameters: tool.inputSchema,
    invoke: async (invokeParams: ToolInvokeParams): Promise<dto.ToolCallResultOutput> => {
      try {
        const { callSatelliteMethod } = await import('@/lib/satellite/hub')
        const result = await callSatelliteMethod(
          satelliteId,
          tool.name,
          invokeParams.uiLink,
          invokeParams.params,
          { sample }
        )
        return await toToolResult(result, invokeParams)
      } catch (error) {
        return {
          type: 'error-json',
          value: { error: String(error) },
        }
      }
    },
  }
}

export class SatelliteTool implements ToolImplementation {
  static fromConnection(conn: { satelliteId: string; name: string }): SatelliteTool {
    return SatelliteTool.fromSatellite({ id: conn.satelliteId, name: conn.name })
  }

  static fromSatellite(satellite: { id: string; name: string }): SatelliteTool {
    return new SatelliteTool(
      { id: satellite.id, provisioned: false, promptFragment: '', name: satellite.name },
      satellite.id
    )
  }

  constructor(
    public toolParams: ToolParams,
    private satelliteId: string
  ) {}

  supportedMedia = []

  functions = async (model: LlmModel, context: ToolFunctionContext): Promise<ToolFunctions> => {
    const { connections } = await import('@/lib/satellite/hub')
    const conn = connections.get(this.satelliteId)
    if (!conn) {
      throw new UserVisibleError(`Satellite "${this.toolParams.name}" is currently offline`)
    }

    return Object.fromEntries(
      conn.tools.map((tool) => [
        tool.name,
        createSatelliteToolFunction(this.satelliteId, tool, model, context),
      ])
    )
  }
}
