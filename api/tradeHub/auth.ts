import { tradeHubClient, unwrapData, type ApiBody } from "./http";
import { setSessionEmail, setToken } from "./token";

export async function login(email: string, password: string) {
  const data = await unwrapData(
    tradeHubClient.post<ApiBody<{ token: string }>>("/api/v1/auth/login", {
      email,
      password,
    }),
  );
  setToken(data.token);
  setSessionEmail(email);
  return data;
}

export async function register(email: string, password: string) {
  return unwrapData(
    tradeHubClient.post<ApiBody<{ registered: boolean }>>(
      "/api/v1/auth/register",
      { email, password },
    ),
  );
}
