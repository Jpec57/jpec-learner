import { create } from "zustand";

import { queryClient } from "@/lib/queryClient";

const ACCESS_TOKEN_KEY = "jpeclearner.accessToken";
const REFRESH_TOKEN_KEY = "jpeclearner.refreshToken";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clearTokens: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: localStorage.getItem(ACCESS_TOKEN_KEY),
  refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY),
  setTokens: (accessToken, refreshToken) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    set({ accessToken, refreshToken });
    // A fresh login (possibly as a different user) must never start from
    // another account's cached query results.
    queryClient.clear();
  },
  clearTokens: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    set({ accessToken: null, refreshToken: null });
    queryClient.clear();
  },
}));
