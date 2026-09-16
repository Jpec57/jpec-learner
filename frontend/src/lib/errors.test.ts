import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";

import { getErrorMessage } from "@/lib/errors";

function axiosErrorWithDetail(detail: unknown, status = 409): AxiosError {
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "Conflict",
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
    data: { detail },
  });
}

describe("getErrorMessage", () => {
  it("returns the backend's detail message when present", () => {
    const error = axiosErrorWithDetail("A group or lesson with this title already exists at this level.");
    expect(getErrorMessage(error, "fallback")).toBe(
      "A group or lesson with this title already exists at this level."
    );
  });

  it("falls back when detail is missing", () => {
    const error = axiosErrorWithDetail(undefined);
    expect(getErrorMessage(error, "fallback")).toBe("fallback");
  });

  it("falls back when detail is not a string (e.g. Pydantic validation array)", () => {
    const error = axiosErrorWithDetail([{ msg: "field required" }]);
    expect(getErrorMessage(error, "fallback")).toBe("fallback");
  });

  it("falls back for a non-axios error", () => {
    expect(getErrorMessage(new Error("boom"), "fallback")).toBe("fallback");
  });
});
