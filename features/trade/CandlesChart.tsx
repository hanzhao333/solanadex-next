'use client'

import { useEffect, useRef } from 'react'
import { CandlestickSeries, createChart, type ISeriesApi, type CandlestickData } from 'lightweight-charts'

function buildMockCandles(count: number): CandlestickData[] {
  const out: CandlestickData[] = []
  let price = 140 + Math.random() * 5
  const now = Math.floor(Date.now() / 1000)
  for (let i = count - 1; i >= 0; i--) {
    const time = (now - i * 60) as CandlestickData['time']
    const o = price
    const change = (Math.random() - 0.48) * 0.8
    const c = o + change
    const h = Math.max(o, c) + Math.random() * 0.4
    const l = Math.min(o, c) - Math.random() * 0.4
    out.push({ time, open: o, high: h, low: l, close: c })
    price = c
  }
  return out
}

export function CandlesChart() {
  const ref = useRef<HTMLDivElement>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const lastRef = useRef<CandlestickData | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const chart = createChart(el, {
      layout: { background: { color: '#0f172a' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
      rightPriceScale: { borderColor: '#334155' },
      timeScale: { borderColor: '#334155' },
      width: el.clientWidth,
      height: 320,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#34d399',
      downColor: '#f87171',
      borderVisible: false,
      wickUpColor: '#34d399',
      wickDownColor: '#f87171',
    })
    const initial = buildMockCandles(120)
    series.setData(initial)
    lastRef.current = initial[initial.length - 1] ?? null

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth })
    })
    ro.observe(el)

    seriesRef.current = series

    return () => {
      ro.disconnect()
      chart.remove()
      seriesRef.current = null
    }
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => {
      const series = seriesRef.current
      const prev = lastRef.current
      if (!series || !prev) return
      const now = Math.floor(Date.now() / 1000) as CandlestickData['time']
      const c = prev.close + (Math.random() - 0.5) * 0.15
      const bar: CandlestickData = {
        time: now,
        open: prev.close,
        high: Math.max(prev.close, c) + 0.05,
        low: Math.min(prev.close, c) - 0.05,
        close: c,
      }
      series.update(bar)
      lastRef.current = bar
    }, 3000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
      <p className="mb-2 text-xs text-slate-500">Lightweight Charts — mock candles (1m), live tick</p>
      <div ref={ref} className="h-[320px] w-full" />
    </div>
  )
}
