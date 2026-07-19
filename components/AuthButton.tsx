"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import {
  clearToken,
  getSessionEmail,
  getToken,
  login,
  register,
  toTradeHubError,
} from "../api/tradeHub";

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function shortEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return email.slice(0, 12);
  const head = name.length <= 4 ? name : `${name.slice(0, 2)}…`;
  return `${head}@${domain}`;
}

export function AuthButton() {
  const isClient = useIsClient();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("test1@gmail.com");
  const [password, setPassword] = useState("123456");
  const [sessionEmail, setSessionEmailState] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isClient) return;
    if (getToken()) {
      setSessionEmailState(getSessionEmail());
    }
  }, [isClient]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") {
        await register(email.trim(), password);
      }
      await login(email.trim(), password);
      setSessionEmailState(email.trim());
      setOpen(false);
    } catch (err) {
      setError(toTradeHubError(err).message);
    } finally {
      setBusy(false);
    }
  }

  function onLogout() {
    clearToken();
    setSessionEmailState(null);
    setOpen(false);
    setError(null);
  }

  if (!isClient) {
    return (
      <button
        type="button"
        className="h-9 rounded-lg border border-slate-600 px-3 text-sm text-slate-400"
        disabled
      >
        登录
      </button>
    );
  }

  const loggedIn = !!getToken() && !!sessionEmail;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`h-9 rounded-lg px-3 text-sm font-medium ${
          loggedIn
            ? "border border-emerald-800 bg-emerald-950/50 text-emerald-300"
            : "border border-amber-800/80 bg-amber-950/40 text-amber-100 hover:bg-amber-900/40"
        }`}
        title={
          loggedIn
            ? "trade-hub 已登录（链下记账）"
            : "未登录 trade-hub：Swap 成功后无法入库"
        }
      >
        {loggedIn ? shortEmail(sessionEmail!) : "请登录"}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-slate-700 bg-slate-950 p-4 shadow-xl">
          {loggedIn ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">trade-hub 会话</p>
              <p className="truncate text-sm text-emerald-300">
                {sessionEmail}
              </p>
              <button
                type="button"
                onClick={onLogout}
                className="w-full rounded-lg border border-slate-600 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                退出登录
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              <p className="text-xs text-amber-200/90">
                未登录：链上 Swap 仍可进行，但无法 POST /dex/swaps 记账。
              </p>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className={
                    mode === "login" ? "text-emerald-400" : "text-slate-500"
                  }
                >
                  登录
                </button>
                <span className="text-slate-600">|</span>
                <button
                  type="button"
                  onClick={() => setMode("register")}
                  className={
                    mode === "register" ? "text-emerald-400" : "text-slate-500"
                  }
                >
                  注册
                </button>
              </div>
              <label className="block text-xs text-slate-400">
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white"
                />
              </label>
              <label className="block text-xs text-slate-400">
                Password
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white"
                />
              </label>
              {error && <p className="text-xs text-rose-400">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {busy
                  ? "…"
                  : mode === "register"
                    ? "注册并登录"
                    : "登录 trade-hub"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
