import { createJupiterApiClient, type QuoteResponse } from '@jup-ag/api'

// quote-api.jup.ag/v6 has been shut down; Metis Swap API lives under /swap/v1.
const basePath =
  process.env.NEXT_PUBLIC_JUPITER_API_URL || 'https://lite-api.jup.ag/swap/v1'

export const jupiterClient = createJupiterApiClient({ basePath })

export type { QuoteResponse }
