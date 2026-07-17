'use client'

import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useQuery } from '@tanstack/react-query'
import { useMemo, type CSSProperties } from 'react'
import { List } from 'react-window'
import { throttled } from '../../lib/debounceThrottle'
import { useActivityStore, type ActivityItem } from '../../stores/activityStore'

const ROW_H = 52

function shorten(sig: string) {
  if (!sig) return '—'
  return `${sig.slice(0, 6)}…${sig.slice(-4)}`
}

function ActivityRow({
  index,
  style,
  rows,
}: {
  index: number
  style: CSSProperties
  rows: { sig: string; slot?: number; err?: string }[]
}) {
  const row = rows[index]
  return (
    <div
      style={style}
      className="flex items-center border-b border-slate-800/80 px-2 text-xs font-mono text-slate-300"
    >
      <a
        href={`https://solscan.io/tx/${row.sig}`}
        target="_blank"
        rel="noreferrer"
        className="text-sky-400 hover:underline"
      >
        {shorten(row.sig)}
      </a>
      <span className="ml-3 text-slate-500">{row.slot ?? '—'}</span>
      {row.err && <span className="ml-2 text-rose-400">err</span>}
    </div>
  )
}

function LocalActivityRow({
  index,
  style,
  items,
}: {
  index: number
  style: CSSProperties
  items: ActivityItem[]
}) {
  const a = items[index]
  const color =
    a.status === 'confirmed' ? 'text-emerald-400' : a.status === 'failed' ? 'text-rose-400' : 'text-amber-300'
  return (
    <div style={style} className="flex flex-col justify-center border-b border-slate-800/80 px-2 py-1 text-xs">
      <div className="flex items-center gap-2">
        <span className={color}>{a.kind}</span>
        {a.signature ? (
          <a
            href={`https://solscan.io/tx/${a.signature}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-sky-400 hover:underline"
          >
            {shorten(a.signature)}
          </a>
        ) : (
          <span className="text-slate-500">pending</span>
        )}
      </div>
      <span className="truncate text-slate-500">{a.detail}</span>
    </div>
  )
}

export function TxFeed() {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const localItems = useActivityStore((s) => s.items)

  const sigQuery = useQuery({
    queryKey: ['wallet-sigs', publicKey?.toBase58(), connection.rpcEndpoint],
    enabled: Boolean(publicKey),
    staleTime: 8000,
    refetchInterval: 12_000,
    queryFn: async () => {
      const sigs = await connection.getSignaturesForAddress(publicKey!, { limit: 40 })
      return sigs.map((s) => ({
        sig: s.signature,
        slot: s.slot,
        err: s.err ? 'x' as const : undefined,
      }))
    },
  })

  const rows = sigQuery.data ?? []
  const { refetch } = sigQuery

  const throttledRefresh = useMemo(() => throttled(() => void refetch(), 2500), [refetch])

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <p className="mb-2 text-xs text-slate-500">Local activity (zustand)</p>
        {localItems.length === 0 ? (
          <p className="text-sm text-slate-500">No swap / pool events yet.</p>
        ) : (
          <List<{ items: ActivityItem[] }>
            rowHeight={ROW_H + 8}
            rowCount={localItems.length}
            defaultHeight={Math.min(320, localItems.length * (ROW_H + 8))}
            rowProps={{ items: localItems }}
            rowComponent={LocalActivityRow}
            className="rounded-lg border border-slate-800"
          />
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">On-chain signatures (throttled poll + virtual list)</p>
          <button
            type="button"
            onClick={() => throttledRefresh()}
            className="rounded border border-slate-600 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>
        {!publicKey ? (
          <p className="text-sm text-slate-500">Connect a wallet to load history.</p>
        ) : sigQuery.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">No signatures yet.</p>
        ) : (
          <List<{ rows: { sig: string; slot?: number; err?: string }[] }>
            rowHeight={ROW_H}
            rowCount={rows.length}
            defaultHeight={320}
            rowProps={{ rows }}
            rowComponent={ActivityRow}
            className="rounded-lg border border-slate-800"
          />
        )}
      </div>
    </div>
  )
}
