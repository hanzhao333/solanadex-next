import { PoolPanel } from "../../features/pool/PoolPanel";
import { fetchPools } from "../../api/tradeHub";

export default async function PoolPage() {
  const { pools, error } = await fetchPools();
  return (
    <div>
      <p className="mb-6 text-sm text-slate-400">
        上方列表来自 trade-hub SSR；下方 Raydium CPMM v2：建池 /
        加撤流动性（Client）。Prefer devnet for experiments；mainnet
        会花真实手续费。
      </p>
      <PoolPanel pools={pools} loadError={error} />
    </div>
  );
}
