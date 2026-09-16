import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

import { useAuthStore } from "@/lib/authStore";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1",
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

// Access tokens expire after 15 minutes; without this, any session left open
// longer than that would 401 on every request with nothing telling the user
// why the app suddenly looks empty. Shared across concurrent 401s so a burst
// of requests triggers one refresh call, not one per request (each refresh
// call rotates and invalidates the previous refresh token).
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) throw new Error("No refresh token available");

  const { data } = await api.post("/auth/refresh", { refresh_token: refreshToken });
  useAuthStore.getState().setTokens(data.access_token, data.refresh_token);
  return data.access_token;
}

function isAuthEndpoint(url?: string): boolean {
  return !!url && /\/auth\/(login|register|refresh)$/.test(url);
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    if (error.response?.status !== 401 || !config || config._retried || isAuthEndpoint(config.url)) {
      throw error;
    }
    config._retried = true;

    try {
      refreshPromise ??= refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
      const newAccessToken = await refreshPromise;
      config.headers.Authorization = `Bearer ${newAccessToken}`;
      return api(config);
    } catch {
      useAuthStore.getState().clearTokens();
      window.location.href = "/login";
      throw error;
    }
  }
);
