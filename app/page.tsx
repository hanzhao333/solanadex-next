import Link from "next/link";

export default function Home() {
  return (
    <section className="flex min-h-[60vh] flex-col justify-center gap-6">
      <p className="text-sm font-medium tracking-wide text-emerald-400">
        trade-hub 联调前台
      </p>
      <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
        solanaDex
      </h1>
      <p className="max-w-xl text-base leading-relaxed text-slate-400">
        Next.js App Router 前台：顶栏连钱包；Swap 走 Jupiter 报价与签名并入库；
        History 查看 GET /dex/swaps；Pool 页 SSR 展示池子列表。
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/swap"
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          进入 Swap
        </Link>
        <Link
          href="/history"
          className="rounded-xl border border-slate-600 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800"
        >
          查看 Swap 历史
        </Link>
        <Link
          href="/pool"
          className="rounded-xl border border-slate-600 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800"
        >
          查看 Pool 列表
        </Link>
        <span className="text-sm text-slate-500">
          钱包 / API 登录在右上角
        </span>
      </div>
    </section>
  );
}
