import { Connection } from '@solana/web3.js'

export function createConnection(rpcUrl: string) {
  return new Connection(rpcUrl, { commitment: 'confirmed' })
}
