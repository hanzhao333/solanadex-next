"use client";

import { useTickerSocket } from "../../hooks/useTickerSocket";

const STATUS_LABEL: Record<string, string> = {
  connecting: "连接中",
  connected: "已连接",
  disconnected: "已断开",
};

export function LiveTicker() {
  const { tickers, status, raw } = useTickerSocket();
  const rows = Object.values(tickers);

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="font-medium text-slate-200">Live ticker</h2>
        <span className="text-xs text-slate-400">
          {STATUS_LABEL[status] ?? status}
        </span>
      </div>
      {rows.length > 0 ? (
        <table className="mt-2 w-full font-mono text-xs text-slate-300">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1 pr-4 font-normal">pool_id</th>
              <th className="py-1 pr-4 font-normal">price</th>
              <th className="py-1 font-normal">ts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.pool_id} className="border-t border-slate-800/80">
                <td className="py-1.5 pr-4">{t.pool_id}</td>
                <td className="py-1.5 pr-4">{t.price}</td>
                <td className="py-1.5">
                  {new Date(t.ts * 1000).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-2 text-xs text-slate-500">等待推送…</p>
      )}
      {raw ? (
        <pre className="mt-2 overflow-x-auto text-[11px] text-slate-600">
          {raw}
        </pre>
      ) : null}
    </section>
  );
}
