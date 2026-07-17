import { useQuery } from '@tanstack/react-query'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'

export interface SplBalanceRow {
  mint: string
  amount: string
  decimals: number
  uiAmount: number
}

export function useWalletBalances() {
  const { connection } = useConnection()
  const { publicKey } = useWallet()

  return useQuery({
    queryKey: ['wallet-balances', publicKey?.toBase58(), connection.rpcEndpoint],
    enabled: Boolean(publicKey),
    queryFn: async () => {
      const pk = publicKey!
      const lamports = await connection.getBalance(pk)
      const accounts = await connection.getParsedTokenAccountsByOwner(pk, {
        programId: TOKEN_PROGRAM_ID,
      })
      const spl: SplBalanceRow[] = accounts.value.map((a) => {
        const parsed = a.account.data.parsed.info
        const amount = parsed.tokenAmount.amount as string
        const decimals = parsed.tokenAmount.decimals as number
        const ui = Number(parsed.tokenAmount.uiAmountString)
        return {
          mint: parsed.mint as string,
          amount,
          decimals,
          uiAmount: ui,
        }
      })
      return {
        sol: lamports / LAMPORTS_PER_SOL,
        spl,
      }
    },
  })
}
