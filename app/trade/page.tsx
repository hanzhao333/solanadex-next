import { CandlesChart } from "../../features/trade/CandlesChart";
import { DepthChart } from "../../features/trade/DepthChart";
import { TxFeed } from "../../features/trade/TxFeed";

export default function TradePage() {
  return (
    <div className="space-y-8">
      <p className="text-sm text-slate-400">
        Charts use mock market data for layout demos. Transaction history uses{" "}
        <code className="text-slate-300">getSignaturesForAddress</code> with
        throttled refresh and{" "}
        <code className="text-slate-300">react-window</code> virtualization.
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <CandlesChart />
        <DepthChart />
      </div>
      <TxFeed />
    </div>
  );
}
