import { useQuery } from '@tanstack/react-query'
import { PublicKey } from '@solana/web3.js'
import { useConnection } from '@solana/wallet-adapter-react'

export function useMintDecimals(mint: string | undefined) {
  const { connection } = useConnection()

  return useQuery({
    queryKey: ['mint-decimals', mint, connection.rpcEndpoint],
    enabled: Boolean(mint && mint.length > 30),
    queryFn: async () => {
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
