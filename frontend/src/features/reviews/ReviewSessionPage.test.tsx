import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/i18n/i18n";
import { getCategory } from "@/features/categories/api";
import { listFlat } from "@/features/hierarchy/api";
import { getDue } from "@/features/reviews/api";
import { ReviewSessionPage } from "@/features/reviews/ReviewSessionPage";

vi.mock("@/features/categories/api", () => ({ getCategory: vi.fn() }));
vi.mock("@/features/hierarchy/api", () => ({ listFlat: vi.fn(), updateNode: vi.fn() }));
vi.mock("@/features/cards/api", () => ({ deleteCard: vi.fn(), updateCard: vi.fn() }));
vi.mock("@/features/reviews/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/reviews/api")>()),
  getDue: vi.fn(),
  submitReview: vi.fn(),
}));

function Search() {
  return <span data-testid="search">{useLocation().search}</span>;
}

function renderPage(initial: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/categories/:categoryId/review" element={<ReviewSessionPage />} />
        </Routes>
        <Search />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ReviewSessionPage node filter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getCategory).mockResolvedValue({ id: "cat-1", name: "Maths" } as never);
    vi.mocked(listFlat).mockResolvedValue([
      { id: "a", parent_id: null, node_kind: "group", title: "Algebra" },
      { id: "m", parent_id: "a", node_kind: "lesson", title: "Matrices" },
    ]);
    vi.mocked(getDue).mockResolvedValue([]);
  });

  it("starts scoped to ?node= and re-queries when the filter changes", async () => {
    renderPage("/categories/cat-1/review?node=m");

    await waitFor(() =>
      expect(getDue).toHaveBeenCalledWith("cat-1", ["card", "lesson"], undefined, "m")
    );
    const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
    expect(select.value).toBe("m");
    expect(screen.getByText(/Nothing due right now in “Matrices”/)).toBeTruthy();

    fireEvent.change(select, { target: { value: "a" } });
    await waitFor(() =>
      expect(getDue).toHaveBeenLastCalledWith("cat-1", ["card", "lesson"], undefined, "a")
    );
    expect(screen.getByTestId("search").textContent).toBe("?node=a");

    fireEvent.change(select, { target: { value: "" } });
    await waitFor(() =>
      expect(getDue).toHaveBeenLastCalledWith("cat-1", ["card", "lesson"], undefined, null)
    );
    expect(screen.getByTestId("search").textContent).toBe("");
  });

  it("ignores a ?node= that isn't in this deck and reviews the whole deck", async () => {
    renderPage("/categories/cat-1/review?node=gone");
    await waitFor(() =>
      expect(getDue).toHaveBeenCalledWith("cat-1", ["card", "lesson"], undefined, null)
    );
    expect(getDue).not.toHaveBeenCalledWith("cat-1", expect.anything(), undefined, "gone");
  });
});
