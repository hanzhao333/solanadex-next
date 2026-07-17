import type { Connection } from '@solana/web3.js'

export async function confirmSignatureWithPolling(
  connection: Connection,
  signature: string,
  opts?: { timeoutMs?: number; intervalMs?: number },
): Promise<void> {
  const timeoutMs = opts?.timeoutMs ?? 90_000
  const intervalMs = opts?.intervalMs ?? 2_000
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    const res = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })
    const st = res.value[0]
    if (!st) {
      await sleep(intervalMs)
      continue
    }
    if (st.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(st.err)}`)
    }
    if (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized') {
      return
    }
    await sleep(intervalMs)
  }

  throw new Error('Confirmation timeout')
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
