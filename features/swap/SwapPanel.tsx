"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { VersionedTransaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { jupiterClient } from "../../lib/jupiterClient";
import { confirmSignatureWithPolling } from "../../lib/confirmSignature";
import { debounced } from "../../lib/debounceThrottle";
import {
  createSwap,
  getToken,
  toTradeHubError,
} from "../../api/tradeHub";
import { useSettingsStore } from "../../stores/settingsStore";
import { useActivityStore } from "../../stores/activityStore";
import { useMintDecimals } from "../../hooks/useMintDecimals";
import { useWalletBalances } from "../../hooks/useWalletBalances";
import { USDC_MINT, WSOL_MINT } from "../../types/dex";

/** 演示入库用；须存在于 trade-hub Seed 的 dex_pools */
const TRADE_HUB_POOL_ID = "SOL-USDC";

type SwapPhase =
  | "idle"
  | "building"
  | "signing"
  | "confirming"
  | "success"
  | "error";

function toSmallestUnits(amountStr: string, decimals: number): string {
  const n = Number(amountStr);
  if (!Number.isFinite(n) || n <= 0) return "0";
  const factor = 10 ** decimals;
  return Math.floor(n * factor).toString();
}

function shortenSig(sig: string) {
  return `${sig.slice(0, 8)}…${sig.slice(-8)}`;
}

export function SwapPanel() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const cluster = useSettingsStore((s) => s.cluster);
  const slippageBps = useSettingsStore((s) => s.slippageBps);
  const pushActivity = useActivityStore((s) => s.push);
  const updateActivity = useActivityStore((s) => s.update);
  // Jupiter quote/swap + default mints are mainnet-oriented; Devnet toggle only
  // swaps RPC and can still broadcast mainnet txs via the wallet → real funds move.
  const swapEnabledOnCluster = cluster === "mainnet";

  const [inputMint, setInputMint] = useState(WSOL_MINT);
  const [outputMint, setOutputMint] = useState(USDC_MINT);
  const [amountIn, setAmountIn] = useState("0.1");
  const [debouncedAmount, setDebouncedAmount] = useState(amountIn);
  const [phase, setPhase] = useState<SwapPhase>("idle");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  /** 链下记账提示，与链上成功文案分开，避免入库失败盖掉链上成功 */
  const [hubMsg, setHubMsg] = useState<string | null>(null);
  const [lastSignature, setLastSignature] = useState<string | null>(null);

  const setDebounced = useMemo(
    () =>
      debounced((v: string) => {
        setDebouncedAmount(v);
      }, 450),
    [],
  );

  useEffect(() => {
    setDebounced(amountIn);
  }, [amountIn, setDebounced]);

  const {
    data: inDecimals,
    isFetching: decimalsFetching,
    error: decimalsError,
  } = useMintDecimals(inputMint);
  const balances = useWalletBalances();

  const quoteQuery = useQuery({
    queryKey: [
      "jupiter-quote",
      inputMint,
      outputMint,
      debouncedAmount,
      inDecimals,
      slippageBps,
      cluster,
    ],
    enabled: Boolean(
      swapEnabledOnCluster &&
      publicKey &&
      inDecimals != null &&
      Number(debouncedAmount) > 0 &&
      inputMint !== outputMint,
    ),
    queryFn: async () => {
      const amountStr = toSmallestUnits(debouncedAmount, inDecimals!);
      if (amountStr === "0") throw new Error("Invalid amount");
      const amount = Number(amountStr);
      if (!Number.isSafeInteger(amount))
        throw new Error("Amount too large for quote API");
      return jupiterClient.quoteGet({
        inputMint,
        outputMint,
        amount,
        slippageBps,
        onlyDirectRoutes: false,
        asLegacyTransaction: false,
      });
    },
  });

  const swapMutation = useMutation({
    mutationFn: async () => {
      if (!swapEnabledOnCluster) {
        throw new Error(
          "当前为 Devnet：Swap 仍走主网 Jupiter，已禁止交易，避免误动主网余额。请把顶栏切回 Mainnet，并确认 Phantom 也在 Mainnet。",
        );
      }
      if (!publicKey) throw new Error("Connect wallet");
      const quote = quoteQuery.data;
      if (!quote) throw new Error("No quote");

      setPhase("building");
      setStatusMsg("正在向 Jupiter 请求交易数据…");
      setLastSignature(null);
      setHubMsg(null);

      // 本轮点击生成一次；同一笔流程内重试应沿用（本 mutation 调用内固定）
      const idempotencyKey = crypto.randomUUID();

      const swapResponse = await jupiterClient.swapPost({
        swapRequest: {
          quoteResponse: quote,
          userPublicKey: publicKey.toBase58(),
          dynamicComputeUnitLimit: true,
          wrapAndUnwrapSol: true,
        },
      });

      const tx = VersionedTransaction.deserialize(
        Buffer.from(swapResponse.swapTransaction, "base64"),
      );

      setPhase("signing");
      setStatusMsg("请在 Phantom 中确认签名…");

      const signature = await sendTransaction(tx, connection, {
        skipPreflight: false,
        maxRetries: 3,
      });

      setLastSignature(signature);
      setPhase("confirming");
      setStatusMsg("已广播，正在等待链上确认（可能需数十秒）…");

      const id = pushActivity({
        kind: "swap",
        signature,
        detail: `Swap ${amountIn} · ${inputMint.slice(0, 4)}… → ${outputMint.slice(0, 4)}…`,
      });

      try {
        await confirmSignatureWithPolling(connection, signature);
        updateActivity(id, { status: "confirmed" });
      } catch (e) {
        updateActivity(id, {
          status: "failed",
          detail: e instanceof Error ? e.message : "Failed",
        });
        throw e;
      }

      // 链上已成功：再尝试 trade-hub 记账（失败不抛，避免盖掉链上成功）
      let hubNote: string;
      if (!getToken()) {
        hubNote =
          "链上已确认；未登录 trade-hub，登录后可记账（POST /dex/swaps）";
      } else {
        try {
          await createSwap({
            idempotency_key: idempotencyKey,
            tx_hash: signature,
            chain: "solana",
            pool_id: TRADE_HUB_POOL_ID,
            amount_in: amountIn,
            amount_out: quote.outAmount,
            status: "confirmed",
          });
          hubNote = `已同步到 trade-hub（pool ${TRADE_HUB_POOL_ID}）`;
        } catch (e) {
          const err = toTradeHubError(e);
          if (err.httpStatus === 401 || err.code === 401) {
            // token 已由 axios response 拦截器 clearToken
            hubNote = "链上已确认；登录已失效，请顶栏重新登录后再记账";
          } else if (err.httpStatus === 409 || err.code === 409) {
            hubNote = "链上已确认；trade-hub 已记账（重复提交 / 幂等 409）";
          } else {
            hubNote = `链上已确认；记账失败：${err.message}`;
          }
        }
      }

      return { signature, hubNote };
    },
    onSuccess: ({ signature, hubNote }) => {
      setPhase("success");
      setStatusMsg("交易已确认成功");
      setHubMsg(hubNote);
      setLastSignature(signature);
      void balances.refetch();
    },
    onError: (e) => {
      setPhase("error");
      setStatusMsg(e instanceof Error ? e.message : "Swap 失败");
      setHubMsg(null);
    },
  });

  const busy = swapMutation.isPending;
  const phaseStyles: Record<SwapPhase, string> = {
    idle: "border-slate-800 bg-slate-950/40 text-slate-400",
    building: "border-amber-700/50 bg-amber-950/40 text-amber-200",
    signing: "border-amber-700/50 bg-amber-950/40 text-amber-200",
    confirming: "border-sky-700/50 bg-sky-950/40 text-sky-200",
    success: "border-emerald-700/50 bg-emerald-950/40 text-emerald-300",
    error: "border-rose-700/50 bg-rose-950/40 text-rose-300",
  };

  const onFlip = useCallback(() => {
    setInputMint(outputMint);
    setOutputMint(inputMint);
  }, [inputMint, outputMint]);

  const explorerTx =
    lastSignature == null
      ? null
      : cluster === "devnet"
        ? `https://solscan.io/tx/${lastSignature}?cluster=devnet`
        : `https://solscan.io/tx/${lastSignature}`;

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <h2 className="mb-4 text-lg font-semibold">Swap (Jupiter)</h2>

      {!swapEnabledOnCluster ? (
        <div className="mb-4 rounded-xl border border-amber-700/60 bg-amber-950/50 px-3 py-3 text-sm text-amber-100">
          <p className="font-medium">Devnet 下已禁用 Swap</p>
          <p className="mt-1 text-xs text-amber-200/90">
            顶栏 Devnet 目前只切换 RPC；报价仍用主网 Jupiter + 主网 USDC mint。
            继续点 Swap 可能改到<strong>主网真钱</strong>，却用 Devnet RPC
            去确认（于是出现 Confirmation timeout）。请切回{" "}
            <strong>Mainnet</strong> 测兑换；Devnet 留给以后专门测 Pool。
          </p>
        </div>
      ) : null}

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
              setInputMint(WSOL_MINT);
              setOutputMint(USDC_MINT);
            }}
            className="rounded-lg border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            SOL → USDC
          </button>
        </div>
        <label className="block text-xs text-slate-400">
          Amount in (human)
        </label>
        <input
          value={amountIn}
          onChange={(e) => setAmountIn(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
        />
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm">
        {!publicKey && (
          <p className="text-amber-300">请先连接钱包后再获取报价</p>
        )}
        {publicKey && decimalsFetching && inDecimals == null && (
          <p className="text-slate-400">正在读取代币精度…</p>
        )}
        {decimalsError && (
          <p className="text-rose-400">
            代币精度读取失败：{(decimalsError as Error).message}
            （公共 RPC 易限流，可换自定义 RPC 或使用默认 WSOL/USDC）
          </p>
        )}
        {publicKey && quoteQuery.isFetching && (
          <p className="text-slate-400">Fetching quote…</p>
        )}
        {quoteQuery.error && (
          <p className="text-rose-400">{(quoteQuery.error as Error).message}</p>
        )}
        {quoteQuery.data && (
          <div className="space-y-1 text-slate-300">
            <p>
              Out (raw):{" "}
              <span className="font-mono">{quoteQuery.data.outAmount}</span>
            </p>
            <p className="text-xs text-slate-500">
              Min out: {quoteQuery.data.otherAmountThreshold} · Impact:{" "}
              {quoteQuery.data.priceImpactPct ?? "n/a"}
            </p>
          </div>
        )}
        {publicKey &&
          inDecimals != null &&
          !quoteQuery.isFetching &&
          !quoteQuery.data &&
          !quoteQuery.error && (
            <p className="text-slate-500">输入有效数量后将自动报价</p>
          )}
      </div>

      <button
        type="button"
        disabled={
          !swapEnabledOnCluster || !publicKey || !quoteQuery.data || busy
        }
        onClick={() => {
          setPhase("idle");
          setStatusMsg(null);
          setHubMsg(null);
          swapMutation.mutate();
        }}
        className="mt-4 w-full rounded-xl bg-emerald-600 py-3 font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
      >
        {busy
          ? phase === "building"
            ? "Building transaction…"
            : phase === "signing"
              ? "Waiting for wallet…"
              : "Confirming on-chain…"
          : !swapEnabledOnCluster
            ? "Switch to Mainnet to swap"
            : !publicKey
              ? "Connect wallet first"
              : !quoteQuery.data
                ? "Waiting for quote"
                : "Swap"}
      </button>

      {(statusMsg || lastSignature || hubMsg) && (
        <div
          className={`mt-3 rounded-xl border px-3 py-3 text-sm ${phaseStyles[phase]}`}
        >
          <div className="flex items-start gap-2">
            {busy ? (
              <span
                className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
                aria-hidden
              />
            ) : null}
            <div className="min-w-0 space-y-1">
              {statusMsg ? <p>{statusMsg}</p> : null}
              {phase === "success" ? (
                <p className="text-xs opacity-80">
                  余额将在下方刷新；也可到 Trade 页查看本地活动。
                </p>
              ) : null}
              {hubMsg ? (
                <p
                  className={`text-xs ${
                    hubMsg.includes("失败") || hubMsg.includes("失效")
                      ? "text-amber-200"
                      : "opacity-90"
                  }`}
                >
                  {hubMsg}
                </p>
              ) : null}
              {lastSignature && explorerTx ? (
                <p className="break-all font-mono text-xs opacity-90">
                  Tx: {shortenSig(lastSignature)}{" "}
                  <a
                    href={explorerTx}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-400 underline hover:text-sky-300"
                  >
                    在 Solscan 查看
                  </a>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}

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
  );
}
