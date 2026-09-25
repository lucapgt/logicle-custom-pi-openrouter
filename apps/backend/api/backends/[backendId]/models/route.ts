import { notFound, ok, operation, responseSpec, errorSpec } from '@/lib/routes'
import { getBackend, getModelsForBackend } from '@/models/backend'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export const GET = operation({
  name: 'List models for backend',
  description: 'List available models for a backend.',
  authentication: 'user',
  responses: [
    responseSpec(
      200,
      z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          providerType: z.string(),
        })
      )
    ),
    errorSpec(404),
  ] as const,
  implementation: async ({ params }) => {
    const backend = await getBackend(params.backendId)
    if (!backend) {
      return notFound()
    }
    const models = await getModelsForBackend(backend)
    return ok(
      models.map((m) => ({
        id: m.id,
        name: m.name,
        providerType: String(backend.providerType),
      }))
    )
  },
})
