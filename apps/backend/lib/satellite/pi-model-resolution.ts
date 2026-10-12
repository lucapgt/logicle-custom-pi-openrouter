import type { LanguageModelV3 } from '@ai-sdk/provider'
import { getBackend, getModelsForBackend } from '@/models/backend'
import { createLanguageModel } from '@/lib/chat/provider-factory'
import type { LlmModel } from '@/lib/chat/models'
import type { ProviderConfig } from '@/types/provider'

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
  return { model, languageModel: createLanguageModel(backend as ProviderConfig, model, { user: userId }) }
}
