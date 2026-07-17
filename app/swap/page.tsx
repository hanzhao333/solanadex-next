import { SwapPanel } from "../../features/swap/SwapPanel";

export default function SwapPage() {
  return (
    <div>
      <p className="mb-6 text-sm text-slate-400">
        Quotes and routes from Jupiter v6. Amount field is debounced before
        requesting a quote.
      </p>
      <SwapPanel />
    </div>
  );
}
