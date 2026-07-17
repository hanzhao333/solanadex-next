import { createJupiterApiClient, type QuoteResponse } from '@jup-ag/api'

const basePath =
  process.env.NEXT_PUBLIC_JUPITER_API_URL || 'https://quote-api.jup.ag/v6'

export const jupiterClient = createJupiterApiClient({ basePath })

export type { QuoteResponse }
