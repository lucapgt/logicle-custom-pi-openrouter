import { db } from 'db/database'
import * as dto from '@/types/dto'
import * as schema from '@/db/schema'
import { nanoid } from 'nanoid'
import { llmModels } from '@/lib/models'
import { LlmModel, EngineOwner } from '@/lib/chat/models'
import { expandEnv } from 'templates'
import { logger } from '@/lib/logging'

export const dtoBackendFromSchemaBackend = (backend: schema.Backend): dto.Backend => {
  return {
    ...backend,
    ...JSON.parse(backend.configuration),
    provisioned: !!backend.provisioned,
    configuration: undefined,
  }
}

export const getBackends = async (): Promise<dto.Backend[]> => {
  return (await db.selectFrom('Backend').selectAll().execute()).map(dtoBackendFromSchemaBackend)
}

const getBackendRaw = async (backendId: dto.Backend['id']): Promise<schema.Backend | undefined> => {
  return await db.selectFrom('Backend').selectAll().where('id', '=', backendId).executeTakeFirst()
}

export const getBackend = async (
  backendId: dto.Backend['id']
): Promise<dto.Backend | undefined> => {
  const dbResult = await getBackendRaw(backendId)
  return dbResult ? dtoBackendFromSchemaBackend(dbResult) : undefined
}

export const createBackend = async (backend: dto.InsertableBackend) => {
  return await createBackendWithId(nanoid(), backend, false)
}

export const createBackendWithId = async (
  id: string,
  backend: dto.InsertableBackend,
  provisioned: boolean
) => {
  const { name, providerType, ...configuration } = backend
  await db
    .insertInto('Backend')
    .values({
      id: id,
      name,
      providerType,
      configuration: JSON.stringify(configuration),
      provisioned: provisioned ? 1 : 0,
    })
    .executeTakeFirstOrThrow()
  const created = await getBackend(id)
  if (!created) {
    throw new Error('Creation failed')
  }
  return created
}

export const updateBackend = async (id: string, data: dto.UpdateableBackend) => {
  const { name, providerType, ...configuration } = data
  const backend = await getBackendRaw(id)
  if (!backend) {
    throw new Error('Backend not found')
  }
  if (Object.keys(data).length === 0) return []
  return db
    .updateTable('Backend')
    .set({
      name,
      providerType,
      configuration: JSON.stringify({
        ...JSON.parse(backend.configuration),
        ...configuration,
      }),
      provisioned: undefined, // protect against malicious API usage
    })
    .where('id', '=', id)
    .execute()
}

export const deleteBackend = async (backendId: dto.Backend['id']) => {
  return db.deleteFrom('Backend').where('id', '=', backendId).executeTakeFirstOrThrow()
}

const inferOwner = (modelId: string): EngineOwner => {
  const prefix = modelId.split('/')[0]?.toLowerCase() ?? ''
  if (prefix === 'anthropic') return 'anthropic'
  if (prefix === 'google') return 'google'
  if (prefix === 'meta-llama' || prefix === 'meta') return 'meta'
  if (prefix === 'perplexity') return 'perplexity'
  return 'openai'
}

const dynamicModel = (
  id: string,
  provider: dto.Backend['providerType'],
  options: {
    name?: string
    description?: string
    contextLength?: number
    vision?: boolean
    functionCalling?: boolean
  } = {}
): LlmModel => ({
  id,
  model: id,
  name: options.name ?? id,
  description: options.description ?? id,
  provider,
  owned_by: provider === 'openrouter' ? inferOwner(id) : 'openai',
  context_length: options.contextLength ?? 32768,
  capabilities: {
    vision: options.vision ?? false,
    function_calling: options.functionCalling ?? true,
  },
})

const fetchJson = async (url: string, apiKey?: string) => {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
  if (!response.ok) {
    throw new Error(`Model discovery failed with HTTP ${response.status}`)
  }
  return await response.json()
}

const discoverOpenRouterModels = async (backend: dto.Backend): Promise<LlmModel[]> => {
  if (backend.providerType !== 'openrouter') return []
  const key = backend.provisioned ? expandEnv(backend.apiKey) : backend.apiKey
  const payload = (await fetchJson('https://openrouter.ai/api/v1/models', key)) as {
    data?: Array<{
      id?: string
      name?: string
      description?: string
      context_length?: number
      architecture?: { input_modalities?: string[] }
      supported_parameters?: string[]
    }>
  }
  return (payload.data ?? [])
    .filter((m): m is typeof m & { id: string } => typeof m.id === 'string' && m.id.length > 0)
    .map((m) =>
      dynamicModel(m.id, 'openrouter', {
        name: m.name,
        description: m.description,
        contextLength: m.context_length,
        vision: m.architecture?.input_modalities?.includes('image') ?? false,
        functionCalling:
          m.supported_parameters?.some((p) => p === 'tools' || p === 'tool_choice') ?? true,
      })
    )
}

const discoverOpenAICompatibleModels = async (backend: dto.Backend): Promise<LlmModel[]> => {
  if (backend.providerType !== 'openai-compatible') return []
  const key = backend.provisioned ? expandEnv(backend.apiKey ?? '') : backend.apiKey ?? ''
  const base = backend.endPoint.replace(/\/$/, '')
  const payload = (await fetchJson(`${base}/models`, key || undefined)) as {
    data?: Array<{ id?: string }>
  }
  return (payload.data ?? [])
    .filter((m): m is { id: string } => typeof m.id === 'string' && m.id.length > 0)
    .map((m) => dynamicModel(m.id, 'openai-compatible'))
}

export const getModelsForBackend = async (backend: dto.Backend): Promise<LlmModel[]> => {
  try {
    if (backend.providerType === 'openrouter') {
      return await discoverOpenRouterModels(backend)
    }
    if (backend.providerType === 'openai-compatible') {
      return await discoverOpenAICompatibleModels(backend)
    }
  } catch (error) {
    logger.warn(`Dynamic model discovery failed for backend "${backend.name}"`, error)
  }
  return llmModels.filter((m) => m.provider === backend.providerType)
}

export const getBackendsWithModels = async (): Promise<dto.BackendModels[]> => {
  const backends = await getBackends()
  const result: dto.BackendModels[] = []
  for (const backend of backends) {
    result.push({
      backendId: backend.id,
      backendName: backend.name,
      models: await getModelsForBackend(backend),
    })
  }
  return result
}
