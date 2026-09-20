import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/i18n/i18n";
import { createCard } from "@/features/cards/api";
import { listCategories } from "@/features/categories/api";
import { CreateContentFab } from "@/features/create/CreateContentFab";
import { createNode, listFlat } from "@/features/hierarchy/api";
import { linkOcrScan } from "@/features/ocr/api";

vi.mock("@/features/cards/api", () => ({ createCard: vi.fn() }));
vi.mock("@/features/categories/api", () => ({ listCategories: vi.fn() }));
vi.mock("@/features/hierarchy/api", () => ({ createNode: vi.fn(), listFlat: vi.fn() }));
vi.mock("@/features/ocr/api", () => ({ linkOcrScan: vi.fn() }));
vi.mock("@/features/ocr/OcrCaptureButton", () => ({
  OcrCaptureButton: ({ onResult }: { onResult: (r: { text: string; scanId: string }) => void }) => (
    <button type="button" onClick={() => onResult({ text: "scanned text", scanId: "scan-1" })}>
      fake-scan
    </button>
  ),
}));

function LocationProbe() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

// null = no fixed deck (main page); a default param would swallow undefined.
function renderFab(categoryId: string | null = "cat-1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/categories/cat-1"]}>
        <CreateContentFab categoryId={categoryId ?? undefined} />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listFlat).mockResolvedValue([
    { id: "group-1", parent_id: null, node_kind: "group", title: "Analysis" },
    { id: "lesson-1", parent_id: "group-1", node_kind: "lesson", title: "Limits" },
  ]);
  vi.mocked(linkOcrScan).mockResolvedValue({} as never);
});

describe("CreateContentFab", () => {
  it("opens from the FAB and closes on Escape", () => {
    renderFab();
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByLabelText("Create a card or lesson"));
    expect(screen.getByRole("dialog")).toBeDefined();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("creates a card in the chosen lesson, prefilled from OCR, and links the scan", async () => {
    vi.mocked(createCard).mockResolvedValue({ id: "card-1" } as never);
    renderFab();
    fireEvent.click(screen.getByLabelText("Create a card or lesson"));
    await screen.findByText(/Limits/);

    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "lesson-1" } });
    fireEvent.click(screen.getAllByText("fake-scan")[0]);
    expect((screen.getByPlaceholderText("Front (question)") as HTMLTextAreaElement).value).toBe("scanned text");

    fireEvent.change(screen.getByPlaceholderText("Back (answer)"), { target: { value: "answer" } });
    fireEvent.submit(screen.getByRole("dialog"));

    await waitFor(() =>
      expect(createCard).toHaveBeenCalledWith({
        category_id: "cat-1",
        lesson_node_id: "lesson-1",
        front_text: "scanned text",
        back_text: "answer",
        hint: null,
      })
    );
    await waitFor(() => expect(linkOcrScan).toHaveBeenCalledWith("scan-1", { card_id: "card-1" }));

    // Dialog stays open for the next card, with the fields cleared.
    await screen.findByText(/Card added/);
    expect((screen.getByPlaceholderText("Front (question)") as HTMLTextAreaElement).value).toBe("");
  });

  it("creates a lesson at the top level and navigates to it", async () => {
    vi.mocked(createNode).mockResolvedValue({ id: "node-9" } as never);
    renderFab();
    fireEvent.click(screen.getByLabelText("Create a card or lesson"));
    fireEvent.click(screen.getByRole("button", { name: "Lesson" }));

    fireEvent.change(screen.getByPlaceholderText("Lesson title (e.g. Limits)"), { target: { value: "Derivatives" } });
    fireEvent.click(screen.getByText("fake-scan"));
    fireEvent.submit(screen.getByRole("dialog"));

    await waitFor(() =>
      expect(createNode).toHaveBeenCalledWith({
        category_id: "cat-1",
        parent_id: null,
        node_kind: "lesson",
        title: "Derivatives",
        body_markdown: "scanned text",
      })
    );
    await waitFor(() => expect(linkOcrScan).toHaveBeenCalledWith("scan-1", { lesson_node_id: "node-9" }));
    await waitFor(() => expect(screen.getByTestId("path").textContent).toBe("/categories/cat-1/lessons/node-9"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  describe("without a fixed deck (main page)", () => {
    const deck = (id: string, name: string) => ({ id, name, icon: null }) as never;

    it("makes the user pick a deck, then creates the card in it", async () => {
      vi.mocked(listCategories).mockResolvedValue([deck("deck-a", "Maths"), deck("deck-b", "Japanese")]);
      vi.mocked(createCard).mockResolvedValue({ id: "card-1" } as never);
      renderFab(null);
      fireEvent.click(screen.getByLabelText("Create a card or lesson"));
      await screen.findByText(/Japanese/);

      const [deckSelect, nodeSelect] = screen.getAllByRole("combobox") as HTMLSelectElement[];
      expect(deckSelect.value).toBe("");
      expect(nodeSelect.disabled).toBe(true);

      fireEvent.change(deckSelect, { target: { value: "deck-b" } });
      await waitFor(() => expect(listFlat).toHaveBeenCalledWith("deck-b"));
      fireEvent.change(screen.getByPlaceholderText("Front (question)"), { target: { value: "f" } });
      fireEvent.change(screen.getByPlaceholderText("Back (answer)"), { target: { value: "b" } });
      fireEvent.submit(screen.getByRole("dialog"));

      await waitFor(() =>
        expect(createCard).toHaveBeenCalledWith(expect.objectContaining({ category_id: "deck-b" }))
      );
    });

    it("preselects the only deck, and lessons navigate into that deck", async () => {
      vi.mocked(listCategories).mockResolvedValue([deck("deck-a", "Maths")]);
      vi.mocked(createNode).mockResolvedValue({ id: "node-9" } as never);
      renderFab(null);
      fireEvent.click(screen.getByLabelText("Create a card or lesson"));
      await waitFor(() => expect((screen.getAllByRole("combobox")[0] as HTMLSelectElement).value).toBe("deck-a"));

      fireEvent.click(screen.getByRole("button", { name: "Lesson" }));
      fireEvent.change(screen.getByPlaceholderText("Lesson title (e.g. Limits)"), { target: { value: "L" } });
      fireEvent.submit(screen.getByRole("dialog"));

      await waitFor(() => expect(screen.getByTestId("path").textContent).toBe("/categories/deck-a/lessons/node-9"));
    });

    it("tells the user to create a deck first when they have none", async () => {
      vi.mocked(listCategories).mockResolvedValue([]);
      renderFab(null);
      fireEvent.click(screen.getByLabelText("Create a card or lesson"));
      await screen.findByText(/no decks yet/);
    });
  });
});
