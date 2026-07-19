import axios, { type AxiosError } from "axios";
import { clearToken, getToken } from "./token";

/** 与 trade-hub `pkg/response.Body` 对齐 */
export type ApiBody<T> = {
  code: number;
  message: string;
  data?: T;
};

/**
 * 浏览器走同源 `/hub`（next.config rewrites → :8080），避开 CORS。
 * 也可在 `.env.local` 设 `NEXT_PUBLIC_TRADE_HUB_BASE_URL` 覆盖。
 */
const baseURL = (process.env.NEXT_PUBLIC_TRADE_HUB_BASE_URL || "/hub").replace(
  /\/$/,
  "",
);

/** axios 实例：只负责 transport / 拦截器，不含具体业务接口 */
export const tradeHubClient = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
  timeout: 20_000,
});

tradeHubClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

tradeHubClient.interceptors.response.use(
  (res) => res,
  (error: AxiosError<ApiBody<unknown>>) => {
    const status = error.response?.status;
    const code = error.response?.data?.code;
    if (status === 401 || code === 401) {
      clearToken();
    }
    return Promise.reject(error);
  },
);

export class TradeHubApiError extends Error {
  constructor(
    message: string,
    public httpStatus: number,
    public code: number,
  ) {
    super(message);
    this.name = "TradeHubApiError";
  }
}

export function toTradeHubError(err: unknown): TradeHubApiError {
  if (err instanceof TradeHubApiError) return err;
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError<ApiBody<unknown>>;
    const status = ax.response?.status ?? 0;
    const body = ax.response?.data;
    return new TradeHubApiError(
      body?.message || ax.message || "trade-hub request failed",
      status,
      body?.code ?? status,
    );
  }
  return new TradeHubApiError(
    err instanceof Error ? err.message : String(err),
    0,
    0,
  );
}

/** 解析统一响应壳 `{ code, message, data }` */
export async function unwrapData<T>(
  promise: Promise<{ data: ApiBody<T> }>,
): Promise<T> {
  try {
    const { data: body } = await promise;
    if (body.code !== 0) {
      throw new TradeHubApiError(
        body.message || "trade-hub returned non-zero code",
        200,
        body.code,
      );
    }
    if (body.data === undefined) {
      throw new TradeHubApiError(
        "trade-hub response missing data",
        200,
        body.code,
      );
    }
    return body.data;
  } catch (err) {
    throw toTradeHubError(err);
  }
}
