/**
 * Server Component 用：原生 fetch 打 trade-hub（不走浏览器 axios，无 CORS）。
 * 勿在 Client 组件里 import 本文件去读 TRADE_HUB_API_URL。
 */

export interface DexPool {
  id: number;
  pool_id: string;
  chain: string;
  base_mint: string;
  quote_mint: string;
  price: string;
  tvl: string;
  updated_at: string;
}

type ApiBody<T> = {
  code: number;
  message: string;
  data?: T;
};

function getTradeHubBaseUrl() {
  const base = process.env.TRADE_HUB_API_URL;
  if (!base) {
    throw new Error("TRADE_HUB_API_URL is not set (check .env.local)");
  }
  return base.replace(/\/$/, "");
}

export type FetchPoolsResult = {
  pools: DexPool[];
  error: string | null;
};

export async function fetchPools(): Promise<FetchPoolsResult> {
  try {
    const base = getTradeHubBaseUrl();
    const res = await fetch(`${base}/api/v1/dex/pools`, {
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`trade-hub pools HTTP ${res.status}`);
    }
    const body = (await res.json()) as ApiBody<DexPool[]>;
    if (body.code !== 0 || !body.data) {
      throw new Error(body.message || "trade-hub returned non-zero code");
    }
    return { pools: body.data, error: null };
  } catch (error) {
    console.error("fetchPools error---", error);
    return {
      pools: [],
      error: "无法连接 trade-hub，请确认 API 已在 :8080 启动",
    };
  }
}
