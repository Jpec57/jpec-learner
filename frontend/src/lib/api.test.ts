import MockAdapter from "axios-mock-adapter";
import { beforeEach, describe, expect, it } from "vitest";

import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/authStore";

describe("api 401 refresh interceptor", () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(api);
    useAuthStore.getState().setTokens("expired-access-token", "valid-refresh-token");
  });

  it("transparently refreshes an expired access token and retries the original request", async () => {
    mock
      .onGet("/reviews/due-count")
      .replyOnce(401)
      .onGet("/reviews/due-count")
      .reply(200, { total_due: 3 });
    mock.onPost("/auth/refresh").reply(200, {
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      token_type: "bearer",
    });

    const response = await api.get("/reviews/due-count");

    expect(response.data).toEqual({ total_due: 3 });
    expect(useAuthStore.getState().accessToken).toBe("new-access-token");
  });

  it("dedupes concurrent 401s into a single refresh call", async () => {
    let refreshCalls = 0;
    mock.onGet("/reviews/due-count").reply(401).onGet("/categories").reply(401);
    mock.onPost("/auth/refresh").reply(() => {
      refreshCalls += 1;
      return [200, { access_token: "new-access-token", refresh_token: "new-refresh-token" }];
    });

    // Both requests 401 before the shared refresh resolves; after it resolves,
    // re-arm the mocks to succeed so the automatic retry has something to hit.
    const first = api.get("/reviews/due-count").catch(() => "first-failed");
    const second = api.get("/categories").catch(() => "second-failed");
    await Promise.allSettled([first, second]);

    expect(refreshCalls).toBe(1);
  });

  it("logs the user out when the refresh token itself is invalid", async () => {
    mock.onGet("/reviews/due-count").reply(401);
    mock.onPost("/auth/refresh").reply(401);

    await expect(api.get("/reviews/due-count")).rejects.toBeTruthy();

    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
