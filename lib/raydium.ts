import type { WalletContextState } from '@solana/wallet-adapter-react'
import { Connection } from '@solana/web3.js'
import {
  ALL_PROGRAM_ID,
  DEVNET_PROGRAM_ID,
  Percent,
  Raydium,
  TxVersion,
  type Cluster,
} from '@raydium-io/raydium-sdk-v2'
import BN from 'bn.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'

export function programIdsForCluster(cluster: Cluster) {
  return cluster === 'devnet' ? DEVNET_PROGRAM_ID : ALL_PROGRAM_ID
}

export async function loadRaydium(params: {
  connection: Connection
  cluster: Cluster
  wallet: WalletContextState
}) {
  const { connection, cluster, wallet } = params
  if (!wallet.publicKey || !wallet.signAllTransactions) {
    throw new Error('Wallet not connected or does not support signAllTransactions')
  }

  return Raydium.load({
    connection,
    cluster,
    owner: wallet.publicKey,
    signAllTransactions: wallet.signAllTransactions,
    disableFeatureCheck: true,
  })
}

export function tokenMetaMint(address: string, decimals: number) {
  return {
    address,
    decimals,
    programId: TOKEN_PROGRAM_ID.toBase58(),
  }
}

export function liquiditySlippagePercent(slippageBps: number) {
  return new Percent(slippageBps, 10_000)
}

export { BN, TxVersion }

export type { Cluster }
