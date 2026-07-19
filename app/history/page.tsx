import { SwapHistoryPanel } from "../../features/history/SwapHistoryPanel";

export default function HistoryPage() {
  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold text-white">Swap 历史</h1>
      <p className="mb-6 text-sm text-slate-400">
        数据来自 trade-hub <code className="text-slate-300">GET /dex/swaps</code>
        （需登录）。与 D25 入库闭环互证：Swap 成功记账后点刷新即可看到。
      </p>
      <SwapHistoryPanel />
    </div>
  );
}
