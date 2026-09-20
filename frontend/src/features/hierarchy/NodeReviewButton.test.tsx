import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/i18n/i18n";
import { NodeReviewButton } from "@/features/hierarchy/NodeReviewButton";
import { getNodeProgression } from "@/features/progression/api";

vi.mock("@/features/progression/api", () => ({ getNodeProgression: vi.fn() }));

const progress = (due_count: number) => ({
  node_id: "n1",
  title: "Algebra",
  total_items: 5,
  avg_level: 2,
  due_count,
});

function renderButton() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <NodeReviewButton categoryId="cat-1" nodeId="n1" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("NodeReviewButton", () => {
  beforeEach(() => vi.resetAllMocks());

  it("links to a review session scoped to the node when something is due", async () => {
    vi.mocked(getNodeProgression).mockResolvedValue(progress(3));
    renderButton();
    const link = await screen.findByRole("link", { name: "Review (3 due)" });
    expect(link.getAttribute("href")).toBe("/categories/cat-1/review?node=n1");
  });

  it("renders nothing when no review is available from here", async () => {
    vi.mocked(getNodeProgression).mockResolvedValue(progress(0));
    const { container } = renderButton();
    await waitFor(() => expect(getNodeProgression).toHaveBeenCalledWith("n1"));
    expect(container.textContent).toBe("");
  });
});
