import { beforeEach, describe, expect, it } from "vitest";

import { useAuthStore } from "@/lib/authStore";
import { queryClient } from "@/lib/queryClient";

describe("authStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ accessToken: null, refreshToken: null });
    queryClient.clear();
  });

  it("clears cached query data on login, so a new session never starts from a previous account's data", () => {
    queryClient.setQueryData(["categories", "mine"], [{ id: "leaked-category" }]);

    useAuthStore.getState().setTokens("access-token", "refresh-token");

    expect(queryClient.getQueryData(["categories", "mine"])).toBeUndefined();
    expect(useAuthStore.getState().accessToken).toBe("access-token");
  });

  it("clears cached query data on logout", () => {
    useAuthStore.getState().setTokens("access-token", "refresh-token");
    queryClient.setQueryData(["categories", "mine"], [{ id: "own-category" }]);

    useAuthStore.getState().clearTokens();

    expect(queryClient.getQueryData(["categories", "mine"])).toBeUndefined();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(localStorage.getItem("jpeclearner.accessToken")).toBeNull();
  });

  it("persists tokens to localStorage on login", () => {
    useAuthStore.getState().setTokens("access-token", "refresh-token");

    expect(localStorage.getItem("jpeclearner.accessToken")).toBe("access-token");
    expect(localStorage.getItem("jpeclearner.refreshToken")).toBe("refresh-token");
  });
});
