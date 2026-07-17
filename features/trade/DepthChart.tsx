'use client'

import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
  type ChartData,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const mid = 142.5
const levels = 16
const bidPrices = Array.from({ length: levels }, (_, i) => mid - 0.02 * (i + 1))
const askPrices = Array.from({ length: levels }, (_, i) => mid + 0.02 * (i + 1))
const bidSize = bidPrices.map(() => 5 + Math.random() * 40)
const askSize = askPrices.map(() => 5 + Math.random() * 40)

const labels = [...bidPrices.map((p) => p.toFixed(2)), ...askPrices.map((p) => p.toFixed(2))]

const data: ChartData<'bar'> = {
  labels,
  datasets: [
    {
      label: 'Size',
      data: [...bidSize, ...askSize],
      backgroundColor: [...bidPrices.map(() => 'rgba(52, 211, 153, 0.55)'), ...askPrices.map(() => 'rgba(248, 113, 113, 0.55)')],
      borderWidth: 0,
    },
  ],
}

export function DepthChart() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
      <p className="mb-2 text-xs text-slate-500">Chart.js — mock order book depth</p>
      <div className="h-[280px]">
        <Bar
          data={data}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: {
                ticks: { color: '#64748b', maxRotation: 60, minRotation: 60, autoSkip: true, maxTicksLimit: 12 },
              },
              y: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' } },
            },
          }}
        />
      </div>
    </div>
  )
}
