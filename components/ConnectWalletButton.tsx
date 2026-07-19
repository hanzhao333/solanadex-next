"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { WalletName } from "@solana/wallet-adapter-base";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { flushSync } from "react-dom";
import { PhantomExtWalletName } from "../lib/PhantomExtWalletAdapter";
import { useSettingsStore } from "../stores/settingsStore";

const CONNECT_TIMEOUT_MS = 22_000;
const CONNECT_TIMEOUT_MSG = "钱包连接超时，请解锁钱包扩展后重试。";
const UNSAFE_ORIGIN_MSG =
  "Phantom 不会在普通 HTTP 局域网地址上弹出授权。请在本机打开 http://localhost:3000；如需其他设备访问，请使用 HTTPS 域名。";

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function displayName(name: string) {
  return name === PhantomExtWalletName ? "Phantom" : name;
}

function formatWalletError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (
    normalized.includes("already pending") ||
    normalized.includes("wallet_requestpermissions") ||
    normalized.includes("-32002")
  ) {
    return "MetaMask 中已有连接请求等待处理。请点击浏览器工具栏的 MetaMask 图标，批准或拒绝该请求后再试；若扩展中没有显示请求，请重启 MetaMask 或浏览器。";
  }

  return message || "连接失败，请重试";
}

function isWalletSafeOrigin() {
  const { protocol, hostname } = window.location;
  return (
    protocol === "https:" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        window.clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        window.clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export function ConnectWalletButton() {
  const isClient = useIsClient();
  const {
    publicKey,
    wallet,
    wallets,
    connected,
    connecting,
    disconnect,
    select,
  } = useWallet();
  const cluster = useSettingsStore((s) => s.cluster);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const connectLockRef = useRef(false);
  const prevClusterRef = useRef(cluster);

  // Prefer custom "Phantom Ext"; hide stock Standard "Phantom" to avoid duplicates.
  const listed = useMemo(
    () =>
      wallets.filter(
        (w) =>
          w.adapter.name !== "Phantom" &&
          w.readyState !== WalletReadyState.Unsupported,
      ),
    [wallets],
  );

  // Cluster switch (not first mount): clear sticky state and force re-pick wallet.
  useEffect(() => {
    if (prevClusterRef.current === cluster) return;
    prevClusterRef.current = cluster;

    connectLockRef.current = false;
    setBusy(false);
    setOpen(false);
    setError(null);
    void (async () => {
      try {
        if (connected) await disconnect();
      } catch {
        // ignore
      }
      select(null);
    })();
  }, [cluster, connected, disconnect, select]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const runConnect = useCallback(async (task: () => Promise<unknown>) => {
    if (connectLockRef.current) return;
    connectLockRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await withTimeout(task(), CONNECT_TIMEOUT_MS, CONNECT_TIMEOUT_MSG);
    } catch (e) {
      setError(formatWalletError(e));
    } finally {
      connectLockRef.current = false;
      setBusy(false);
    }
  }, []);

  const selectAdapter = useCallback(
    async (name: WalletName) => {
      const target = wallets.find((w) => w.adapter.name === name);
      if (!target) {
        setError("钱包不可用");
        return;
      }

      if (name === PhantomExtWalletName && !isWalletSafeOrigin()) {
        setError(UNSAFE_ORIGIN_MSG);
        setOpen(false);
        return;
      }

      // Commit selection in the same click tick so the wallet popup keeps the user gesture.
      flushSync(() => {
        select(name);
      });
      setOpen(false);

      await runConnect(async () => {
        await target.adapter.connect();
        // Re-emit if WalletProvider listeners attach just after a fast connect.
        if (target.adapter.publicKey) {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 0);
          });
          target.adapter.emit("connect", target.adapter.publicKey);
        }
      });
    },
    [wallets, select, runConnect],
  );

  const onPrimaryClick = useCallback(async () => {
    setError(null);

    if (connected) {
      try {
        await disconnect();
      } catch (e) {
        setError(e instanceof Error ? e.message : "断开连接失败");
      }
      return;
    }

    // Stale "Connecting…" after a cluster switch / hung connect — allow reopen.
    if (connectLockRef.current || busy) {
      connectLockRef.current = false;
      setBusy(false);
    }

    // Always open the picker when disconnected. Silent connect() with a leftover
    // selected wallet (common after remount / cluster change) looks like no-op.
    setOpen((v) => !v);
  }, [connected, busy, disconnect]);

  if (!isClient) {
    return (
      <button
        type="button"
        className="h-9 rounded bg-emerald-600 px-4 text-sm font-semibold text-white opacity-70"
        disabled
      >
        Select Wallet
      </button>
    );
  }

  let label = "Select Wallet";
  if (busy || connecting) label = "Connecting ...";
  else if (connected && publicKey) {
    const base58 = publicKey.toBase58();
    label = `${base58.slice(0, 4)}..${base58.slice(-4)}`;
  }

  return (
    <div ref={rootRef} className="relative flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => {
          void onPrimaryClick();
        }}
        className="wallet-adapter-button wallet-adapter-button-trigger h-9! bg-emerald-600! hover:bg-emerald-500!"
      >
        {connected && wallet?.adapter.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={wallet.adapter.icon}
            alt=""
            width={24}
            height={24}
            className="wallet-adapter-button-start-icon"
          />
        ) : null}
        {label}
      </button>

      {open && !connected ? (
        <div className="absolute top-full right-0 z-50 mt-2 min-w-[220px] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
          {listed.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400">未检测到钱包扩展</p>
          ) : (
            listed.map((w) => (
              <button
                key={w.adapter.name}
                type="button"
                disabled={busy}
                onClick={() => {
                  void selectAdapter(w.adapter.name);
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-100 hover:bg-slate-800 disabled:opacity-60"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={w.adapter.icon} alt="" width={24} height={24} />
                <span>{displayName(String(w.adapter.name))}</span>
                {w.readyState === WalletReadyState.Installed ? (
                  <span className="ml-auto text-[10px] text-emerald-400">
                    Detected
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}

      {error ? (
        <p className="max-w-[300px] text-right text-xs text-rose-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
