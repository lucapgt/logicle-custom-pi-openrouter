import * as z from 'zod'

const zodApiKey = z.string().min(2, { message: 'Api Key must be at least 2 characters' })
const zodOptionalApiKey = z.string().optional().default('')
const zodName = z.string().min(2, { message: 'Backend name must be at least 2 characters.' })
const zodCredentials = z.string().min(2, { message: 'Credentials must be at least 2 characters.' })

const options = [
  z.object({ providerType: z.literal('openai'), name: zodName, apiKey: zodApiKey }),
  z.object({ providerType: z.literal('openrouter'), name: zodName, apiKey: zodApiKey }),
  z.object({
    providerType: z.literal('openai-compatible'),
    name: zodName,
    apiKey: zodOptionalApiKey,
    endPoint: z.string().url(),
  }),
  z.object({ providerType: z.literal('anthropic'), name: zodName, apiKey: zodApiKey }),
  z.object({
    providerType: z.literal('logiclecloud'),
    name: zodName,
    apiKey: zodApiKey,
    endPoint: z.string().url(),
  }),
  z.object({ providerType: z.literal('gcp-vertex'), name: zodName, credentials: zodCredentials }),
  z.object({ providerType: z.literal('perplexity'), name: zodName, apiKey: zodApiKey }),
  z.object({ providerType: z.literal('google-ai-studio'), name: zodName, apiKey: zodApiKey }),
  z.object({ providerType: z.literal('mock'), name: zodName }),
] as const

const withBackendFields = <T extends z.ZodRawShape>(shape: T) =>
  z.object({
    ...shape,
    id: z.string(),
    provisioned: z.boolean(),
  })

const backendOptions = [
  withBackendFields({ providerType: z.literal('openai'), name: zodName, apiKey: zodApiKey }),
  withBackendFields({ providerType: z.literal('openrouter'), name: zodName, apiKey: zodApiKey }),
  withBackendFields({
    providerType: z.literal('openai-compatible'),
    name: zodName,
    apiKey: zodOptionalApiKey,
    endPoint: z.string().url(),
  }),
  withBackendFields({ providerType: z.literal('anthropic'), name: zodName, apiKey: zodApiKey }),
  withBackendFields({
    providerType: z.literal('logiclecloud'),
    name: zodName,
    apiKey: zodApiKey,
    endPoint: z.string().url(),
  }),
  withBackendFields({
    providerType: z.literal('gcp-vertex'),
    name: zodName,
    credentials: zodCredentials,
  }),
  withBackendFields({ providerType: z.literal('perplexity'), name: zodName, apiKey: zodApiKey }),
  withBackendFields({
    providerType: z.literal('google-ai-studio'),
    name: zodName,
    apiKey: zodApiKey,
  }),
  withBackendFields({ providerType: z.literal('mock'), name: zodName }),
] as const

export const backendSchema = z.discriminatedUnion('providerType', backendOptions)
  .meta({ id: 'Backend' })

export const insertableBackendSchema = z.discriminatedUnion('providerType', options)
  .meta({ id: 'InsertableBackend' })

export const updateableBackendSchema = z.discriminatedUnion(
  'providerType',
  backendOptions.map((option) =>
    option.omit({ id: true, provisioned: true }).partial().extend({
      providerType: option.shape.providerType,
    })
  ) as any
).meta({ id: 'UpdateableBackend' })

export type Backend = z.infer<typeof backendSchema>
export type InsertableBackend = z.infer<typeof insertableBackendSchema>
export type UpdateableBackend = z.infer<typeof updateableBackendSchema>
