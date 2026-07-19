"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  getToken,
  listSwaps,
  toTradeHubError,
  type DexSwap,
} from "../../api/tradeHub";
import { useSettingsStore } from "../../stores/settingsStore";

const PAGE_SIZE = 20;

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function shortTx(hash: string) {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}

function explorerTxUrl(hash: string, cluster: "mainnet" | "devnet") {
  return cluster === "devnet"
    ? `https://solscan.io/tx/${hash}?cluster=devnet`
    : `https://solscan.io/tx/${hash}`;
}

export function SwapHistoryPanel() {
  const isClient = useIsClient();
  const cluster = useSettingsStore((s) => s.cluster);
  const [loggedIn, setLoggedIn] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [list, setList] = useState<DexSwap[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncAuth = useCallback(() => {
    setLoggedIn(!!getToken());
  }, []);

  const load = useCallback(
    async (nextPage: number) => {
      if (!getToken()) {
        setLoggedIn(false);
        setList([]);
        setTotal(0);
        setError(null);
        return;
      }
      setLoggedIn(true);
      setLoading(true);
      setError(null);
      try {
        const data = await listSwaps({ page: nextPage, page_size: PAGE_SIZE });
        setList(data.list ?? []);
        setTotal(data.total ?? 0);
        setPage(data.page ?? nextPage);
      } catch (e) {
        const err = toTradeHubError(e);
        if (err.httpStatus === 401 || err.code === 401) {
          setLoggedIn(false);
          setList([]);
          setTotal(0);
          setError("登录已失效，请点击右上角「API 登录」重新登录");
        } else {
          setError(err.message);
        }
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isClient) return;
    syncAuth();
    void load(1);
  }, [isClient, syncAuth, load]);

  useEffect(() => {
    if (!isClient) return;
    const reload = () => {
      syncAuth();
      void load(1);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === "trade_hub_jwt" || e.key === null) reload();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("trade-hub-auth", reload);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("trade-hub-auth", reload);
    };
  }, [isClient, syncAuth, load]);

  if (!isClient) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-500">
        加载中…
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <div className="rounded-2xl border border-amber-800/60 bg-amber-950/30 p-6">
        <p className="text-sm font-medium text-amber-100">未登录 trade-hub</p>
        <p className="mt-2 text-sm text-amber-200/90">
          Swap 历史按用户隔离，需要 JWT。请先点击右上角「API 未登录 /
          API 登录」完成登录，再查看记录。
        </p>
        {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
        <p className="mt-4 text-xs text-slate-500">
          提示：未登录 ≠ 暂无记录；登录后若仍为空，再去{" "}
          <Link href="/swap" className="text-emerald-400 underline">
            Swap
          </Link>{" "}
          完成一笔并入库。
        </p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-400">
          共 <span className="text-slate-200">{total}</span> 条 · 第 {page} /{" "}
          {totalPages} 页
        </p>
        <button
          type="button"
          disabled={loading}
          onClick={() => void load(page)}
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? "刷新中…" : "刷新"}
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-900/50 bg-rose-950/30 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      {loading && list.length === 0 ? (
        <p className="text-sm text-slate-500">正在拉取历史…</p>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400">
          暂无记录，去{" "}
          <Link href="/swap" className="text-emerald-400 underline">
            Swap
          </Link>{" "}
          完成一笔（需已登录以便 POST 入库）。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-700 bg-slate-900/80 text-xs text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">tx_hash</th>
                <th className="px-3 py-2 font-medium">pool_id</th>
                <th className="px-3 py-2 font-medium">amount_in</th>
                <th className="px-3 py-2 font-medium">amount_out</th>
                <th className="px-3 py-2 font-medium">status</th>
                <th className="px-3 py-2 font-medium">created_at</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-800/80 text-slate-200"
                >
                  <td className="px-3 py-2 font-mono text-xs">
                    <a
                      href={explorerTxUrl(row.tx_hash, cluster)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-400 hover:underline"
                      title={row.tx_hash}
                    >
                      {shortTx(row.tx_hash)}
                    </a>
                  </td>
                  <td className="px-3 py-2">{row.pool_id}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.amount_in}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {row.amount_out}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        row.status === "confirmed"
                          ? "text-emerald-400"
                          : row.status === "failed"
                            ? "text-rose-400"
                            : "text-amber-300"
                      }
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400">
                    {row.created_at
                      ? new Date(row.created_at).toLocaleString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!canPrev || loading}
          onClick={() => void load(page - 1)}
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40"
        >
          上一页
        </button>
        <button
          type="button"
          disabled={!canNext || loading}
          onClick={() => void load(page + 1)}
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40"
        >
          下一页
        </button>
      </div>
    </div>
  );
}
