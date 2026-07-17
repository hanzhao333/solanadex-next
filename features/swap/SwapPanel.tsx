'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { VersionedTransaction } from '@solana/web3.js'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { jupiterClient } from '../../lib/jupiterClient'
import { confirmSignatureWithPolling } from '../../lib/confirmSignature'
import { debounced } from '../../lib/debounceThrottle'
import { useSettingsStore } from '../../stores/settingsStore'
import { useActivityStore } from '../../stores/activityStore'
import { useMintDecimals } from '../../hooks/useMintDecimals'
import { useWalletBalances } from '../../hooks/useWalletBalances'
import { USDC_MINT, WSOL_MINT } from '../../types/dex'

function toSmallestUnits(amountStr: string, decimals: number): string {
  const n = Number(amountStr)
  if (!Number.isFinite(n) || n <= 0) return '0'
  const factor = 10 ** decimals
  return Math.floor(n * factor).toString()
}

export function SwapPanel() {
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const slippageBps = useSettingsStore((s) => s.slippageBps)
  const pushActivity = useActivityStore((s) => s.push)
  const updateActivity = useActivityStore((s) => s.update)

  const [inputMint, setInputMint] = useState(WSOL_MINT)
  const [outputMint, setOutputMint] = useState(USDC_MINT)
  const [amountIn, setAmountIn] = useState('0.1')
  const [debouncedAmount, setDebouncedAmount] = useState(amountIn)

  const setDebounced = useMemo(
    () =>
      debounced((v: string) => {
        setDebouncedAmount(v)
      }, 450),
    [],
  )

  useEffect(() => {
    setDebounced(amountIn)
  }, [amountIn, setDebounced])

  const { data: inDecimals } = useMintDecimals(inputMint)
  const balances = useWalletBalances()

  const quoteQuery = useQuery({
    queryKey: ['jupiter-quote', inputMint, outputMint, debouncedAmount, inDecimals, slippageBps],
    enabled: Boolean(
      publicKey && inDecimals != null && Number(debouncedAmount) > 0 && inputMint !== outputMint,
    ),
    queryFn: async () => {
      const amountStr = toSmallestUnits(debouncedAmount, inDecimals!)
      if (amountStr === '0') throw new Error('Invalid amount')
      const amount = Number(amountStr)
      if (!Number.isSafeInteger(amount)) throw new Error('Amount too large for quote API')
      return jupiterClient.quoteGet({
        inputMint,
        outputMint,
        amount,
        slippageBps,
        onlyDirectRoutes: false,
        asLegacyTransaction: false,
      })
    },
  })

  const swapMutation = useMutation({
    mutationFn: async () => {
      if (!publicKey) throw new Error('Connect wallet')
      const quote = quoteQuery.data
      if (!quote) throw new Error('No quote')

      const swapResponse = await jupiterClient.swapPost({
        swapRequest: {
          quoteResponse: quote,
          userPublicKey: publicKey.toBase58(),
          dynamicComputeUnitLimit: true,
          wrapAndUnwrapSol: true,
        },
      })

      const tx = VersionedTransaction.deserialize(
        Buffer.from(swapResponse.swapTransaction, 'base64'),
      )

      const signature = await sendTransaction(tx, connection, {
        skipPreflight: false,
        maxRetries: 3,
      })

      const id = pushActivity({
        kind: 'swap',
        signature,
        detail: `Swap ${inputMint.slice(0, 4)}… → ${outputMint.slice(0, 4)}…`,
      })

      try {
        await confirmSignatureWithPolling(connection, signature)
        updateActivity(id, { status: 'confirmed' })
      } catch (e) {
        updateActivity(id, {
          status: 'failed',
          detail: e instanceof Error ? e.message : 'Failed',
        })
        throw e
      }

      return signature
    },
    onSuccess: () => {
      void balances.refetch()
    },
  })

  const onFlip = useCallback(() => {
    setInputMint(outputMint)
    setOutputMint(inputMint)
  }, [inputMint, outputMint])

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <h2 className="mb-4 text-lg font-semibold">Swap (Jupiter)</h2>

      <div className="space-y-3">
        <label className="block text-xs text-slate-400">From mint</label>
        <input
          value={inputMint}
          onChange={(e) => setInputMint(e.target.value.trim())}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm"
        />
        <label className="block text-xs text-slate-400">To mint</label>
        <input
          value={outputMint}
          onChange={(e) => setOutputMint(e.target.value.trim())}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onFlip}
            className="rounded-lg border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            Flip
          </button>
          <button
            type="button"
            onClick={() => {
              setInputMint(WSOL_MINT)
              setOutputMint(USDC_MINT)
            }}
            className="rounded-lg border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            SOL → USDC
          </button>
        </div>
        <label className="block text-xs text-slate-400">Amount in (human)</label>
        <input
          value={amountIn}
          onChange={(e) => setAmountIn(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
        />
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm">
        {quoteQuery.isFetching && <p className="text-slate-400">Fetching quote…</p>}
        {quoteQuery.error && (
          <p className="text-rose-400">{(quoteQuery.error as Error).message}</p>
        )}
        {quoteQuery.data && (
          <div className="space-y-1 text-slate-300">
            <p>
              Out (raw): <span className="font-mono">{quoteQuery.data.outAmount}</span>
            </p>
            <p className="text-xs text-slate-500">
              Min out: {quoteQuery.data.otherAmountThreshold} · Impact:{' '}
              {quoteQuery.data.priceImpactPct ?? 'n/a'}
            </p>
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={!publicKey || !quoteQuery.data || swapMutation.isPending}
        onClick={() => swapMutation.mutate()}
        className="mt-4 w-full rounded-xl bg-emerald-600 py-3 font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
      >
        {swapMutation.isPending ? 'Signing…' : 'Swap'}
      </button>

      {balances.data && (
        <div className="mt-4 text-xs text-slate-500">
          <p>Balance: {balances.data.sol.toFixed(4)} SOL</p>
          <p className="mt-1 max-h-24 overflow-y-auto">
            {balances.data.spl.slice(0, 6).map((t) => (
              <span key={t.mint} className="mr-2 block font-mono">
                {t.mint.slice(0, 6)}… {t.uiAmount}
              </span>
            ))}
          </p>
        </div>
      )}
    </div>
  )
}
