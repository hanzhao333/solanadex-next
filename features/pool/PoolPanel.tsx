"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMemo, useState } from "react";
import type { Cluster } from "@raydium-io/raydium-sdk-v2";
import { TxVersion } from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import {
  loadRaydium,
  liquiditySlippagePercent,
  programIdsForCluster,
  tokenMetaMint,
} from "../../lib/raydium";
import { useSettingsStore } from "../../stores/settingsStore";
import { useActivityStore } from "../../stores/activityStore";
import type { DexPool } from "../../api/tradeHub";
import { USDC_MINT, WSOL_MINT } from "../../types/dex";

function humanToRaw(amount: string, decimals: number): BN {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return new BN(0);
  const s = n.toFixed(decimals);
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const combined = `${whole}${fracPadded}`.replace(/^0+/, "") || "0";
  return new BN(combined);
}

type PoolPanelProps = {
  /** Server Component 传入的 trade-hub 池子快照（可序列化 props） */
  pools: DexPool[];
  loadError?: string | null;
};

export function PoolPanel({ pools, loadError = null }: PoolPanelProps) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const cluster = useSettingsStore((s) => s.cluster) as Cluster;
  const slippageBps = useSettingsStore((s) => s.slippageBps);
  const pushActivity = useActivityStore((s) => s.push);
  const updateActivity = useActivityStore((s) => s.update);

  const pids = useMemo(() => programIdsForCluster(cluster), [cluster]);

  const [mintA, setMintA] = useState(WSOL_MINT);
  const [mintB, setMintB] = useState(USDC_MINT);
  const [decA, setDecA] = useState(9);
  const [decB, setDecB] = useState(6);
  const [amtCreateA, setAmtCreateA] = useState("0.05");
  const [amtCreateB, setAmtCreateB] = useState("10");

  const [poolId, setPoolId] = useState("");
  const [addAmount, setAddAmount] = useState("1");
  const [baseIn, setBaseIn] = useState(true);
  const [withdrawLpHuman, setWithdrawLpHuman] = useState("0.1");

  const configsQuery = useQuery({
    queryKey: ["raydium-cpmm-configs", cluster],
    queryFn: async () => {
      const raydium = await loadRaydium({ connection, cluster, wallet });
      return raydium.api.getCpmmConfigs();
    },
    enabled: wallet.connected && !!wallet.signAllTransactions,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!configsQuery.data?.length)
        throw new Error("No CPMM fee configs from API");
      const raydium = await loadRaydium({ connection, cluster, wallet });
      await raydium.account.fetchWalletTokenAccounts({ forceUpdate: true });

      const feeConfig = configsQuery.data[0];
      const mintAAmount = humanToRaw(amtCreateA, decA);
      const mintBAmount = humanToRaw(amtCreateB, decB);
      if (mintAAmount.isZero() || mintBAmount.isZero())
        throw new Error("Initial amounts must be > 0");

      const built = await raydium.cpmm.createPool({
        programId: pids.CREATE_CPMM_POOL_PROGRAM,
        poolFeeAccount: pids.CREATE_CPMM_POOL_FEE_ACC,
        mintA: tokenMetaMint(mintA, decA),
        mintB: tokenMetaMint(mintB, decB),
        mintAAmount,
        mintBAmount,
        startTime: new BN(Math.floor(Date.now() / 1000)),
        feeConfig,
        associatedOnly: true,
        ownerInfo: { useSOLBalance: true },
        txVersion: TxVersion.V0,
      });

      const id = pushActivity({
        kind: "pool-create",
        signature: "",
        detail: `Create CPMM pool ${mintA.slice(0, 4)}… / ${mintB.slice(0, 4)}…`,
      });

      try {
        const { txId } = await built.execute({ sendAndConfirm: true });
        updateActivity(id, { signature: txId, status: "confirmed" });
        if (built.extInfo?.address?.poolId) {
          setPoolId(built.extInfo.address.poolId.toBase58());
        }
        return txId;
      } catch (e) {
        updateActivity(id, {
          status: "failed",
          detail: e instanceof Error ? e.message : "Create failed",
        });
        throw e;
      }
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const raydium = await loadRaydium({ connection, cluster, wallet });
      await raydium.account.fetchWalletTokenAccounts({ forceUpdate: true });
      const { poolInfo, poolKeys, rpcData } =
        await raydium.cpmm.getPoolInfoFromRpc(poolId.trim());
      const epochInfo = await connection.getEpochInfo();
      const slip = liquiditySlippagePercent(slippageBps);

      const pair = raydium.cpmm.computePairAmount({
        poolInfo,
        baseReserve: rpcData.baseReserve,
        quoteReserve: rpcData.quoteReserve,
        amount: addAmount,
        slippage: slip,
        epochInfo,
        baseIn,
      });

      const built = await raydium.cpmm.addLiquidity({
        poolInfo,
        poolKeys,
        inputAmount: pair.inputAmountFee.amount,
        baseIn,
        slippage: slip,
        computeResult: {
          inputAmountFee: pair.inputAmountFee,
          anotherAmount: pair.anotherAmount,
          maxAnotherAmount: pair.maxAnotherAmount,
          liquidity: pair.liquidity,
        },
        txVersion: TxVersion.V0,
      });

      const id = pushActivity({
        kind: "pool-add",
        signature: "",
        detail: `Add liquidity ${poolId.slice(0, 8)}…`,
      });

      try {
        const { txId } = await built.execute({ sendAndConfirm: true });
        updateActivity(id, { signature: txId, status: "confirmed" });
        return txId;
      } catch (e) {
        updateActivity(id, {
          status: "failed",
          detail: e instanceof Error ? e.message : "Add liquidity failed",
        });
        throw e;
      }
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const raydium = await loadRaydium({ connection, cluster, wallet });
      await raydium.account.fetchWalletTokenAccounts({ forceUpdate: true });
      const { poolInfo, poolKeys } = await raydium.cpmm.getPoolInfoFromRpc(
        poolId.trim(),
      );
      const lpDec = poolInfo.lpMint.decimals;
      const lpAmount = humanToRaw(withdrawLpHuman, lpDec);
      if (lpAmount.isZero()) throw new Error("LP amount must be > 0");

      const built = await raydium.cpmm.withdrawLiquidity({
        poolInfo,
        poolKeys,
        lpAmount,
        slippage: liquiditySlippagePercent(slippageBps),
        txVersion: TxVersion.V0,
        closeWsol: true,
      });

      const id = pushActivity({
        kind: "pool-remove",
        signature: "",
        detail: `Remove liquidity ${poolId.slice(0, 8)}…`,
      });

      try {
        const { txId } = await built.execute({ sendAndConfirm: true });
        updateActivity(id, { signature: txId, status: "confirmed" });
        return txId;
      } catch (e) {
        updateActivity(id, {
          status: "failed",
          detail: e instanceof Error ? e.message : "Withdraw failed",
        });
        throw e;
      }
    },
  });

  const busy =
    createMutation.isPending ||
    addMutation.isPending ||
    withdrawMutation.isPending;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <section className="rounded-2xl border border-emerald-900/50 bg-slate-900/60 p-6">
        <h2 className="mb-1 text-lg font-semibold">trade-hub 池子快照</h2>
        <p className="mb-4 text-xs text-slate-500">
          上表 = Server 拉取的链下列表（GET /dex/pools）；下区 = 链上 Raydium
          操作。
        </p>
        {loadError ? (
          <p className="rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
            {loadError}
          </p>
        ) : pools.length === 0 ? (
          <p className="text-sm text-slate-500">暂无池子数据</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="border-b border-slate-700 text-xs text-slate-400">
                <tr>
                  <th className="py-2 pr-3 font-medium">pool_id</th>
                  <th className="py-2 pr-3 font-medium">chain</th>
                  <th className="py-2 pr-3 font-medium">price</th>
                  <th className="py-2 font-medium">tvl</th>
                </tr>
              </thead>
              <tbody>
                {pools.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-slate-800/80 text-slate-200"
                  >
                    <td className="py-2 pr-3 font-mono text-emerald-400">
                      {p.pool_id}
                    </td>
                    <td className="py-2 pr-3">{p.chain}</td>
                    <td className="py-2 pr-3 font-mono">{p.price}</td>
                    <td className="py-2 font-mono">{p.tvl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="mb-2 text-lg font-semibold">Create CPMM pool</h2>
        <p className="mb-4 text-xs text-slate-500">
          Fee tier:{" "}
          {configsQuery.data?.[0]
            ? `${configsQuery.data[0].tradeFeeRate} bps trade`
            : "…"}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-400">
            Mint A
            <input
              value={mintA}
              onChange={(e) => setMintA(e.target.value.trim())}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-sm"
            />
          </label>
          <label className="text-xs text-slate-400">
            Decimals A
            <input
              type="number"
              value={decA}
              onChange={(e) => setDecA(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-slate-400">
            Mint B
            <input
              value={mintB}
              onChange={(e) => setMintB(e.target.value.trim())}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-sm"
            />
          </label>
          <label className="text-xs text-slate-400">
            Decimals B
            <input
              type="number"
              value={decB}
              onChange={(e) => setDecB(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-slate-400">
            Initial amount A (human)
            <input
              value={amtCreateA}
              onChange={(e) => setAmtCreateA(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-slate-400">
            Initial amount B (human)
            <input
              value={amtCreateB}
              onChange={(e) => setAmtCreateB(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={!wallet.connected || busy || configsQuery.isLoading}
          onClick={() => createMutation.mutate()}
          className="mt-4 w-full rounded-xl bg-violet-600 py-2.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-40"
        >
          {createMutation.isPending ? "Creating…" : "Create pool"}
        </button>
        {createMutation.error && (
          <p className="mt-2 text-sm text-rose-400">
            {(createMutation.error as Error).message}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="mb-4 text-lg font-semibold">Add / remove liquidity</h2>
        <label className="block text-xs text-slate-400">
          Pool id (address)
          <input
            value={poolId}
            onChange={(e) => setPoolId(e.target.value.trim())}
            placeholder="CPMM pool public key"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-sm"
          />
        </label>

        <div className="mt-4 space-y-3">
          <p className="text-xs font-medium text-slate-500">Add</p>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={baseIn}
                onChange={(e) => setBaseIn(e.target.checked)}
              />
              Base side in (mint A)
            </label>
          </div>
          <input
            value={addAmount}
            onChange={(e) => setAddAmount(e.target.value)}
            placeholder="Amount (human, base side)"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            disabled={!wallet.connected || !poolId || busy}
            onClick={() => addMutation.mutate()}
            className="w-full rounded-xl bg-sky-600 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40"
          >
            {addMutation.isPending ? "Adding…" : "Add liquidity"}
          </button>
          {addMutation.error && (
            <p className="text-sm text-rose-400">
              {(addMutation.error as Error).message}
            </p>
          )}
        </div>

        <div className="mt-6 space-y-3 border-t border-slate-800 pt-6">
          <p className="text-xs font-medium text-slate-500">Remove</p>
          <input
            value={withdrawLpHuman}
            onChange={(e) => setWithdrawLpHuman(e.target.value)}
            placeholder="LP amount to burn (human)"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            disabled={!wallet.connected || !poolId || busy}
            onClick={() => withdrawMutation.mutate()}
            className="w-full rounded-xl border border-amber-700/80 bg-amber-950/40 py-2 text-sm font-medium text-amber-100 hover:bg-amber-900/50 disabled:opacity-40"
          >
            {withdrawMutation.isPending ? "Withdrawing…" : "Withdraw liquidity"}
          </button>
          {withdrawMutation.error && (
            <p className="text-sm text-rose-400">
              {(withdrawMutation.error as Error).message}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
