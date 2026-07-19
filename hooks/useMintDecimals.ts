import { useQuery } from '@tanstack/react-query'
import { PublicKey } from '@solana/web3.js'
import { useConnection } from '@solana/wallet-adapter-react'
import { USDC_MINT, WSOL_MINT } from '../types/dex'

/** Well-known mints — avoid public RPC getParsedAccountInfo (often rate-limited). */
const KNOWN_DECIMALS: Record<string, number> = {
  [WSOL_MINT]: 9,
  [USDC_MINT]: 6,
}

export function useMintDecimals(mint: string | undefined) {
  const { connection } = useConnection()
  const known = mint ? KNOWN_DECIMALS[mint] : undefined

  return useQuery({
    queryKey: ['mint-decimals', mint, connection.rpcEndpoint, known ?? 'rpc'],
    enabled: Boolean(mint && mint.length > 30),
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      if (known != null) return known

      const pk = new PublicKey(mint!)
      const info = await connection.getParsedAccountInfo(pk)
      const parsed = info.value?.data
      if (parsed && 'parsed' in parsed && parsed.parsed?.info?.decimals != null) {
        return parsed.parsed.info.decimals as number
      }
      throw new Error('Mint not found or invalid')
    },
  })
}
