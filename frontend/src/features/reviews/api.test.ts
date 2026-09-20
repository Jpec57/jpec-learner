import MockAdapter from "axios-mock-adapter";
import { afterEach, describe, expect, it } from "vitest";

import { getDue } from "@/features/reviews/api";
import { api } from "@/lib/api";

describe("getDue", () => {
  const mock = new MockAdapter(api);
  afterEach(() => mock.reset());

  // FastAPI only reads repeated keys (types=card&types=lesson); a bracketed
  // key (types[]=lesson) is ignored and the server returns every type.
  it("sends the type filter as repeated keys the backend understands", async () => {
    let query = "";
    mock.onGet("/reviews/due").reply((config) => {
      query = api.getUri(config).split("?")[1] ?? "";
      return [200, []];
    });

    await getDue("cat-1", ["lesson"]);
    expect(new URLSearchParams(query).getAll("types")).toEqual(["lesson"]);

    await getDue("cat-1", ["card", "lesson"]);
    expect(new URLSearchParams(query).getAll("types")).toEqual(["card", "lesson"]);
    expect(query).not.toContain("%5B%5D");
  });
});
