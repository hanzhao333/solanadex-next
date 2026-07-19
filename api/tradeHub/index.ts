/**
 * trade-hub API 聚合出口。
 *
 * 分层：
 * - http.ts / token.ts → axios 与会话（无业务路径）
 * - auth.ts / swaps.ts → 浏览器 Client 接口
 * - pools.ts → Server Component 专用 fetch
 */

export {
  tradeHubClient,
  unwrapData,
  toTradeHubError,
  TradeHubApiError,
  type ApiBody,
} from "./http";

export {
  getToken,
  getSessionEmail,
  setToken,
  setSessionEmail,
  clearToken,
} from "./token";

export { login, register } from "./auth";

export {
  createSwap,
  listSwaps,
  type CreateSwapBody,
  type DexSwap,
  type ListSwapsParams,
  type ListSwapsResult,
} from "./swaps";

export { fetchPools, type DexPool, type FetchPoolsResult } from "./pools";
