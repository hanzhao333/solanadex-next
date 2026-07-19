"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthButton } from "./AuthButton";
import { ConnectWalletButton } from "./ConnectWalletButton";
import { useSettingsStore } from "../stores/settingsStore";

const nav = [
  { to: "/swap", label: "Swap" },
  { to: "/pool", label: "Liquidity" },
  { to: "/trade", label: "Trade" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const cluster = useSettingsStore((s) => s.cluster);
  const setCluster = useSettingsStore((s) => s.setCluster);
  const slippageBps = useSettingsStore((s) => s.slippageBps);
  const setSlippageBps = useSettingsStore((s) => s.setSlippageBps);
  const savedCustomRpc = useSettingsStore((s) => s.customRpcUrl);
  const setCustomRpcUrl = useSettingsStore((s) => s.setCustomRpcUrl);
  const [customRpcDraft, setCustomRpcDraft] = useState(savedCustomRpc);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="text-lg font-bold tracking-tight text-emerald-400"
            >
              Solana DEX
            </Link>
            <nav className="flex gap-1">
              {nav.map((item) => {
                const isActive =
                  pathname === item.to || pathname.startsWith(`${item.to}/`);

                return (
                  <Link
                    key={item.to}
                    href={item.to}
                    className={`rounded-lg px-3 py-1.5 text-sm ${
                      isActive
                        ? "bg-slate-800 text-white"
                        : "text-slate-400 hover:bg-slate-800/60"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={cluster}
              onChange={(e) =>
                setCluster(e.target.value as "mainnet" | "devnet")
              }
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs"
            >
              <option value="mainnet">Mainnet</option>
              <option value="devnet">Devnet</option>
            </select>
            <label className="flex items-center gap-1 text-xs text-slate-400">
              Slippage (bps)
              <input
                type="number"
                min={1}
                max={5000}
                value={slippageBps}
                onChange={(e) => setSlippageBps(Number(e.target.value) || 50)}
                className="w-16 rounded border border-slate-700 bg-slate-950 px-1 py-1"
              />
            </label>
            <input
              value={customRpcDraft}
              onChange={(e) => setCustomRpcDraft(e.target.value)}
              onBlur={() => setCustomRpcUrl(customRpcDraft)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              placeholder="Custom RPC (optional) — blur/Enter"
              title="若出现 RPC 403，可填 Helius/Alchemy 等免费节点；留空用默认 publicnode"
              className="min-w-[180px] max-w-xs rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs"
            />
            <AuthButton />
            <ConnectWalletButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>
      <footer className="border-t border-slate-800 py-4 text-center text-xs text-slate-500">
        Jupiter aggregator swap · Raydium CPMM v2 pool / liquidity · Demo UI —
        verify txs on explorer
      </footer>
    </div>
  );
}
