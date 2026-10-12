import type { LanguageModelV3 } from '@ai-sdk/provider'
import { getBackend, getModelsForBackend } from '@/models/backend'
import { createLanguageModel } from '@/backend/lib/chat/provider-factory'
import type { LlmModel } from '@/lib/chat/models'
import type { ProviderConfig } from '@/types/provider'
import { isUserProvidedApiKey, USER_SECRET_TYPE } from '@/lib/userSecrets/constants'
import { getUserSecretValue } from '@/models/userSecrets'
import { canUserAccessAssistant } from '@/models/assistant'
import { getConversationWithBackendAssistant } from '@/models/conversation'
import type { SessionRecord } from './pi-session-controller'

/**
 * Reference stored in PiSession.modelRef. Never contains provider credentials.
 * The model and backend are always revalidated on the server when a turn starts.
 */
export type PiModelSelection = { backendId: string; modelId: string }

export function encodePiModelSelection(selection: PiModelSelection): string {
  if (!selection.backendId.trim() || !selection.modelId.trim()) {
    throw new Error('Invalid Pi model selection')
  }
  return JSON.stringify(selection)
}

export function decodePiModelSelection(value: string): PiModelSelection {
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { throw new Error('Invalid stored Pi model selection') }
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid stored Pi model selection')
  const record = parsed as Record<string, unknown>
  if (typeof record.backendId !== 'string' || !record.backendId.trim() ||
      typeof record.modelId !== 'string' || !record.modelId.trim()) {
    throw new Error('Invalid stored Pi model selection')
  }
  return { backendId: record.backendId, modelId: record.modelId }
}

export async function resolvePiLanguageModel(
  selection: PiModelSelection,
  userId: string,
): Promise<{ languageModel: LanguageModelV3; model: LlmModel }> {
  const backend = await getBackend(selection.backendId)
  if (!backend) throw new Error('Selected Pi backend no longer exists')
  const models = await getModelsForBackend(backend)
  const model = models.find(item => item.id === selection.modelId)
  if (!model) throw new Error('Selected Pi model is unavailable')
  if (model.capabilities?.function_calling === false) {
    throw new Error('Selected Pi model does not support tool calling')
  }
  let provider = backend as ProviderConfig
  if ('apiKey' in provider && typeof provider.apiKey === 'string' &&
      isUserProvidedApiKey(provider.apiKey)) {
    const resolution = await getUserSecretValue(userId, backend.id, USER_SECRET_TYPE)
    if (resolution.status !== 'ok') {
      throw new Error('Selected backend requires an accessible user API key')
    }
    provider = { ...provider, apiKey: resolution.value } as ProviderConfig
  }
  return { model, languageModel: createLanguageModel(provider, model, { user: userId }) }
}

/** Re-authorize the assistant before every Pi inference turn. */
export async function resolveAuthorizedPiSessionModel(record: SessionRecord) {
  const conversation = await getConversationWithBackendAssistant(record.conversationId)
  if (!conversation || conversation.conversation.ownerId !== record.userId ||
      conversation.assistant.deleted !== 0 ||
      !(await canUserAccessAssistant(record.userId, conversation.conversation.assistantId))) {
    throw new Error('Pi conversation or assistant is no longer authorized')
  }
  const selection = decodePiModelSelection(record.modelRef)
  if (selection.backendId !== conversation.backend.id ||
      selection.modelId !== conversation.assistant.model) {
    throw new Error('Assistant model configuration has changed; start a fresh Pi session')
  }
  return resolvePiLanguageModel(selection, record.userId)
}
