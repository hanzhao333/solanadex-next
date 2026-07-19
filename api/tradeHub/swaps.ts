import { tradeHubClient, unwrapData, type ApiBody } from "./http";

export type CreateSwapBody = {
  idempotency_key: string;
  tx_hash: string;
  chain?: string;
  pool_id: string;
  amount_in: string;
  amount_out: string;
  status?: string;
};

export async function createSwap(body: CreateSwapBody) {
  return unwrapData(
    tradeHubClient.post<ApiBody<unknown>>("/api/v1/dex/swaps", {
      chain: "solana",
      status: "confirmed",
      ...body,
    }),
  );
}

/** 与 trade-hub `model.DexSwap` JSON 对齐 */
export type DexSwap = {
  id: number;
  user_id: number;
  idempotency_key: string;
  tx_hash: string;
  chain: string;
  pool_id: string;
  amount_in: string;
  amount_out: string;
  status: string;
  slot?: number;
  created_at: string;
};

export type ListSwapsParams = {
  /** 默认 1（与 handler DefaultQuery 一致） */
  page?: number;
  /** 默认 20 */
  page_size?: number;
};

export type ListSwapsResult = {
  list: DexSwap[];
  total: number;
  page: number;
  page_size: number;
};

/**
 * GET /api/v1/dex/swaps — 需 JWT；按当前用户 user_id 隔离。
 * query 默认：page=1，page_size=20
 */
export async function listSwaps(
  params: ListSwapsParams = {},
): Promise<ListSwapsResult> {
  const page = params.page ?? 1;
  const page_size = params.page_size ?? 20;
  return unwrapData(
    tradeHubClient.get<ApiBody<ListSwapsResult>>("/api/v1/dex/swaps", {
      params: { page, page_size },
    }),
  );
}
