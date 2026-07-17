import { PoolPanel } from "../../features/pool/PoolPanel";

export default function PoolPage() {
  return (
    <div>
      <p className="mb-6 text-sm text-slate-400">
        Raydium CPMM v2: create a new constant-product pool, add liquidity, or
        withdraw LP. Uses versioned transactions and Raydium&apos;s{" "}
        <code className="text-slate-300">execute</code> helper with
        confirmation. Prefer devnet for experiments; mainnet creation spends
        real fees and tokens.
      </p>
      <PoolPanel />
    </div>
  );
}
