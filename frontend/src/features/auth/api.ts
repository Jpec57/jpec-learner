import { api } from "@/lib/api";

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface UserOut {
  id: string;
  email: string;
  display_name: string | null;
  locale: string;
}

export async function register(input: {
  email: string;
  password: string;
  display_name?: string;
  locale?: string;
}): Promise<UserOut> {
  const { data } = await api.post<UserOut>("/auth/register", input);
  return data;
}

export async function login(input: { email: string; password: string }): Promise<TokenPair> {
  const { data } = await api.post<TokenPair>("/auth/login", input);
  return data;
}

export async function me(): Promise<UserOut> {
  const { data } = await api.get<UserOut>("/auth/me");
  return data;
}
