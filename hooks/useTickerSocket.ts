"use client";

import { useEffect, useState } from "react";

export type TickerMsg = {
  pool_id: string;
  price: string;
  ts: number;
};

export type TickerStatus = "connecting" | "connected" | "disconnected";

const DEFAULT_WS_URL = "ws://127.0.0.1:8080/ws/ticker";
const RECONNECT_MS = 2500;

export function useTickerSocket(
  url = process.env.NEXT_PUBLIC_TRADE_HUB_WS_URL || DEFAULT_WS_URL,
) {
  const [tickers, setTickers] = useState<Record<string, TickerMsg>>({});
  const [status, setStatus] = useState<TickerStatus>("connecting");
  const [raw, setRaw] = useState("");

  useEffect(() => {
    let disposed = false;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const clearTimer = () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    };

    const detach = (socket: WebSocket) => {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
    };

    const scheduleReconnect = () => {
      if (disposed) return;
      clearTimer();
      timer = setTimeout(() => {
        timer = undefined;
        connect();
      }, RECONNECT_MS);
    };

    const connect = () => {
      if (disposed) return;
      clearTimer();

      // 已有进行中/已打开的连接则不重复建连
      if (
        ws &&
        (ws.readyState === WebSocket.CONNECTING ||
          ws.readyState === WebSocket.OPEN)
      ) {
        return;
      }

      if (ws) {
        detach(ws);
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        ws = null;
      }

      setStatus("connecting");
      const socket = new WebSocket(url);
      ws = socket;

      socket.onopen = () => {
        if (!disposed && ws === socket) setStatus("connected");
      };

      socket.onmessage = (ev) => {
        if (disposed || ws !== socket) return;
        const text = typeof ev.data === "string" ? ev.data : String(ev.data);
        setRaw(text);
        try {
          const msg = JSON.parse(text) as TickerMsg;
          if (msg.pool_id && msg.price != null && msg.ts != null) {
            setTickers((prev) => ({ ...prev, [msg.pool_id]: msg }));
          }
        } catch {
          // ignore non-JSON
        }
      };

      socket.onerror = () => {
        // 部分环境可能只报 error、晚到/不到 close；两边都 schedule，靠 clearTimer 去重
        if (disposed || ws !== socket) return;
        setStatus("disconnected");
        scheduleReconnect();
      };

      socket.onclose = () => {
        if (disposed) return;
        // 已被新连接替换时，忽略旧 socket 的迟到 close，避免把状态打回 disconnected
        if (ws !== socket) return;
        ws = null;
        setStatus("disconnected");
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      disposed = true;
      clearTimer();
      if (ws) {
        detach(ws); // 先摘掉 onclose，避免 close() 再触发重连套娃
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        ws = null;
      }
    };
  }, [url]);

  return { tickers, status, raw };
}
