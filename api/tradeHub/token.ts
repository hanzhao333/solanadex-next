const TOKEN_KEY = "trade_hub_jwt";
const EMAIL_KEY = "trade_hub_email";

/** 仅在浏览器读写；Server 调用时返回 null */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getSessionEmail(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(EMAIL_KEY);
}

export function setToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new Event("trade-hub-auth"));
}

export function setSessionEmail(email: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(EMAIL_KEY, email);
}

export function clearToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
  window.dispatchEvent(new Event("trade-hub-auth"));
}
