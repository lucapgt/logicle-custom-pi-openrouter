import { z } from 'zod'
import { operation, ok, responseSpec } from '@/lib/routes'
import { getUserSatellites } from '@/models/satellite'

export const GET = operation({
  name: 'List only owned satellites for Pi V4 activation',
  authentication: 'user',
  responses: [responseSpec(200, z.object({ satellites: z.array(z.object({ id: z.string(), name: z.string() })) }))] as const,
  implementation: async ({ session }) => {
    const records = await getUserSatellites(session.userId)
    return ok({ satellites: records.map(s => ({ id: s.id, name: s.name })) })
  },
})
