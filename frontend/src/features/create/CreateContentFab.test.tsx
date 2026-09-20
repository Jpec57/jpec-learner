import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/i18n/i18n";
import { getCredential, sendChatMessage } from "@/features/assistant/api";
import { createCard } from "@/features/cards/api";
import { getCategory, listCategories, updateCategory } from "@/features/categories/api";
import { CreateContentFab } from "@/features/create/CreateContentFab";
import { createNode, listFlat } from "@/features/hierarchy/api";
import { linkOcrScan } from "@/features/ocr/api";
import { translateText } from "@/features/translation/api";

vi.mock("@/features/assistant/api", () => ({ getCredential: vi.fn(), sendChatMessage: vi.fn() }));
vi.mock("@/features/cards/api", () => ({ createCard: vi.fn() }));
vi.mock("@/features/categories/api", () => ({
  getCategory: vi.fn(),
  listCategories: vi.fn(),
  updateCategory: vi.fn(),
}));
vi.mock("@/features/translation/api", () => ({ translateText: vi.fn() }));
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

function deckOf(deck_type: string, extra: Record<string, unknown> = {}) {
  return { id: "cat-1", name: "Deck", deck_type, source_language: null, target_language: null, ...extra } as never;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listFlat).mockResolvedValue([
    { id: "group-1", parent_id: null, node_kind: "group", title: "Analysis" },
    { id: "lesson-1", parent_id: "group-1", node_kind: "lesson", title: "Limits" },
  ]);
  vi.mocked(linkOcrScan).mockResolvedValue({} as never);
  vi.mocked(getCategory).mockResolvedValue(deckOf("general"));
  vi.mocked(updateCategory).mockResolvedValue({} as never);
  vi.mocked(getCredential).mockResolvedValue({ configured: true, provider: "gemini", model: null, updated_at: null });
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
        answer_mode: "reveal",
        accepted_answers: [],
        answer_language: null,
        hint: null,
        create_reverse: false,
        reverse_answer_language: null,
      })
    );
    await waitFor(() => expect(linkOcrScan).toHaveBeenCalledWith("scan-1", { card_id: "card-1" }));

    // Dialog stays open for the next card, with the fields cleared and a link
    // (new tab) to the card that was just created.
    await screen.findByText(/Card added/);
    const link = screen.getByRole("link", { name: /Open in a new tab/ });
    expect(link.getAttribute("href")).toBe("/categories/cat-1/cards/card-1");
    expect(link.getAttribute("target")).toBe("_blank");
    expect((screen.getByPlaceholderText("Front (question)") as HTMLTextAreaElement).value).toBe("");
  });

  it("creates a typed card with one input per accepted answer and a blank in the front", async () => {
    vi.mocked(createCard).mockResolvedValue({ id: "card-2" } as never);
    renderFab();
    fireEvent.click(screen.getByLabelText("Create a card or lesson"));
    await screen.findByText(/Limits/);

    // Fill-in-the-blank belongs to typed answers: not offered for flip cards.
    expect(screen.queryByRole("button", { name: /Insert a blank/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Type answer" }));

    fireEvent.change(screen.getByPlaceholderText("Front (question)"), { target: { value: "あの試合は見たい" } });
    fireEvent.click(screen.getByRole("button", { name: /Insert a blank/ }));
    // No reverse card for a fill-in-the-blank sentence.
    expect(screen.queryByText(/reverse card/)).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("An accepted answer"), { target: { value: "どうしても" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add another answer" }));
    const inputs = screen.getAllByPlaceholderText("An accepted answer");
    expect(inputs).toHaveLength(2);
    fireEvent.change(inputs[1], { target: { value: "是非" } });
    fireEvent.change(screen.getByPlaceholderText(/Hint shown on request/), { target: { value: "no matter what" } });
    fireEvent.submit(screen.getByRole("dialog"));

    await waitFor(() =>
      expect(createCard).toHaveBeenCalledWith(
        expect.objectContaining({
          front_text: expect.stringContaining("__"),
          // back is optional once answers are listed
          back_text: "どうしても / 是非",
          answer_mode: "typed",
          accepted_answers: ["どうしても", "是非"],
          hint: "no matter what",
        })
      )
    );
  });

  it("on a language deck (flip card): starts from the saved direction, translates the back, remembers the direction", async () => {
    vi.mocked(getCategory).mockResolvedValue(deckOf("language", { source_language: "fr", target_language: "en" }));
    vi.mocked(translateText).mockResolvedValue({
      translation: "closure",
      answers: ["closure"],
      alternatives: ["closure", "fast", "search"],
      provider: "mymemory",
    });
    vi.mocked(createCard).mockResolvedValue({ id: "card-3" } as never);
    renderFab();
    fireEvent.click(screen.getByLabelText("Create a card or lesson"));

    const source = (await screen.findByLabelText("From…")) as HTMLSelectElement;
    const target = screen.getByLabelText("To…") as HTMLSelectElement;
    await waitFor(() => expect([source.value, target.value]).toEqual(["fr", "en"]));

    // Switch the direction, then translate.
    fireEvent.click(screen.getByRole("button", { name: "Swap languages" }));
    expect([source.value, target.value]).toEqual(["en", "fr"]);
    fireEvent.click(screen.getByRole("button", { name: "Swap languages" }));

    fireEvent.change(screen.getByPlaceholderText("Front (question)"), { target: { value: "rapide" } });
    fireEvent.click(screen.getByRole("button", { name: /Translate/ }));
    await waitFor(() =>
      expect(translateText).toHaveBeenCalledWith({ text: "rapide", source: "fr", target: "en" })
    );
    await waitFor(() => expect((screen.getByPlaceholderText("Back (answer)") as HTMLTextAreaElement).value).toBe("closure"));

    // Other candidates are one click away.
    fireEvent.click(await screen.findByRole("button", { name: "fast" }));
    expect((screen.getByPlaceholderText("Back (answer)") as HTMLTextAreaElement).value).toBe("fast");

    // The card is created with the chosen direction saved on the deck.
    fireEvent.change(target, { target: { value: "es" } });
    fireEvent.submit(screen.getByRole("dialog"));
    await waitFor(() => expect(createCard).toHaveBeenCalled());
    await waitFor(() =>
      expect(updateCategory).toHaveBeenCalledWith("cat-1", { source_language: "fr", target_language: "es" })
    );
  });

  it("on a language deck (typed): no verso or answer-language field, and each Jisho answer gets its own input", async () => {
    vi.mocked(getCategory).mockResolvedValue(deckOf("language", { source_language: "ja", target_language: "en" }));
    vi.mocked(translateText).mockResolvedValue({
      translation: "study",
      answers: ["study", "diligence", "working hard"],
      alternatives: ["study", "diligence", "working hard", "experience"],
      provider: "jisho",
    });
    vi.mocked(createCard).mockResolvedValue({ id: "card-4" } as never);
    renderFab();
    fireEvent.click(screen.getByLabelText("Create a card or lesson"));
    await waitFor(() => expect((screen.getByLabelText("To…") as HTMLSelectElement).value).toBe("en"));

    fireEvent.click(screen.getByRole("button", { name: "Type answer" }));
    // The answers are the verso, and the language is the deck's target.
    expect(screen.queryByPlaceholderText("Back (answer)")).toBeNull();
    expect(screen.queryByPlaceholderText(/Details shown after answering/)).toBeNull();
    expect(screen.queryByText("Expected answer language (optional)")).toBeNull();
    expect(screen.getByRole("button", { name: /Insert a blank/ })).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText("Front (question)"), { target: { value: "勉強" } });
    fireEvent.click(screen.getByRole("button", { name: /Translate/ }));

    await waitFor(() => expect(screen.getAllByPlaceholderText("An accepted answer")).toHaveLength(3));
    expect(
      (screen.getAllByPlaceholderText("An accepted answer") as HTMLInputElement[]).map((input) => input.value)
    ).toEqual(["study", "diligence", "working hard"]);

    // A suggestion that isn't an answer yet is added as one more input.
    fireEvent.click(await screen.findByRole("button", { name: "+ experience" }));
    expect(screen.getAllByPlaceholderText("An accepted answer")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "+ study" })).toBeNull();

    fireEvent.click(screen.getByLabelText(/reverse card/));
    fireEvent.submit(screen.getByRole("dialog"));

    await waitFor(() =>
      expect(createCard).toHaveBeenCalledWith(
        expect.objectContaining({
          front_text: "勉強",
          // the verso is all the answers joined
          back_text: "study / diligence / working hard / experience",
          answer_mode: "typed",
          accepted_answers: ["study", "diligence", "working hard", "experience"],
          answer_language: "en",
          create_reverse: true,
          reverse_answer_language: "ja",
        })
      )
    );
  });

  it("requires at least one answer for a typed card on a language deck", async () => {
    vi.mocked(getCategory).mockResolvedValue(deckOf("language", { source_language: "fr", target_language: "en" }));
    renderFab();
    fireEvent.click(screen.getByLabelText("Create a card or lesson"));
    await waitFor(() => expect((screen.getByLabelText("To…") as HTMLSelectElement).value).toBe("en"));
    fireEvent.click(screen.getByRole("button", { name: "Type answer" }));

    expect((screen.getByPlaceholderText("An accepted answer") as HTMLInputElement).required).toBe(true);
  });

  it("offers no language or translate controls on a general deck", async () => {
    renderFab();
    fireEvent.click(screen.getByLabelText("Create a card or lesson"));
    await screen.findByPlaceholderText("Front (question)");
    expect(screen.queryByLabelText("From…")).toBeNull();
    expect(screen.queryByRole("button", { name: /Translate/ })).toBeNull();
  });

  it("shows a friendly message when no translation is found", async () => {
    vi.mocked(getCategory).mockResolvedValue(deckOf("language", { source_language: "fr", target_language: "en" }));
    vi.mocked(translateText).mockRejectedValue(new Error("boom"));
    renderFab();
    fireEvent.click(screen.getByLabelText("Create a card or lesson"));
    await waitFor(() => expect((screen.getByLabelText("To…") as HTMLSelectElement).value).toBe("en"));

    fireEvent.change(screen.getByPlaceholderText("Front (question)"), { target: { value: "rapide" } });
    fireEvent.click(screen.getByRole("button", { name: /Translate/ }));
    expect(await screen.findByText(/No translation found/)).toBeDefined();
  });

  it("gives a scientific deck's lesson editor a LaTeX toolbar and shortcuts", async () => {
    vi.mocked(getCategory).mockResolvedValue(deckOf("scientific"));
    renderFab();
    fireEvent.click(screen.getByLabelText("Create a card or lesson"));
    fireEvent.click(screen.getByRole("button", { name: "Lesson" }));

    // The toolbar appears once the deck type has loaded (it replaces the plain textarea).
    const fraction = await screen.findByTitle("\\frac{▢}{}");
    const body = screen.getByPlaceholderText("Lesson content (Markdown, optional)") as HTMLTextAreaElement;
    fireEvent.click(fraction);
    await waitFor(() => expect(body.value).toBe("$\\frac{}{}$"));

    // Shortcut: "alpha " inside math becomes \alpha.
    fireEvent.change(body, { target: { value: "Let $alpha ", selectionStart: 11 } });
    await waitFor(() => expect(body.value).toBe("Let $\\alpha "));
  });

  it("creates a lesson at the top level and links to it in a new tab", async () => {
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
    const link = await screen.findByRole("link", { name: /Open in a new tab/ });
    expect(link.getAttribute("href")).toBe("/categories/cat-1/lessons/node-9");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.getByTestId("path").textContent).toBe("/categories/cat-1");
  });

  it("generates cards with the AI assistant into the chosen lesson and shows what it did", async () => {
    vi.mocked(sendChatMessage).mockResolvedValue({
      message: { role: "assistant", content: "Added 2 cards." },
      tool_events: [{ tool: "create_cards_bulk", args: {}, ok: true, summary: "Created 2 card(s)" }],
    });
    renderFab();
    fireEvent.click(screen.getByLabelText("Create a card or lesson"));
    await screen.findByText(/Limits/);
    fireEvent.click(screen.getByRole("button", { name: "AI" }));

    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "lesson-1" } });
    fireEvent.change(screen.getByPlaceholderText(/Describe the cards you want/), {
      target: { value: "2 cards about limits" },
    });
    fireEvent.submit(screen.getByRole("dialog"));

    await waitFor(() =>
      expect(sendChatMessage).toHaveBeenCalledWith({
        messages: [{ role: "user", content: expect.stringContaining("2 cards about limits") }],
        categoryId: "cat-1",
      })
    );
    const sent = vi.mocked(sendChatMessage).mock.calls[0][0].messages[0].content;
    expect(sent).toContain('lesson "Limits" (id=lesson-1)');
    expect(await screen.findByText("Added 2 cards.")).toBeDefined();
    expect(screen.getByText("Created 2 card(s)")).toBeDefined();
    expect(createCard).not.toHaveBeenCalled();
  });

  it("points to Settings in the AI tab when no provider is configured", async () => {
    vi.mocked(getCredential).mockResolvedValue({ configured: false, provider: null, model: null, updated_at: null });
    renderFab();
    fireEvent.click(screen.getByLabelText("Create a card or lesson"));
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    expect(await screen.findByText(/Add an API key in Settings/)).toBeDefined();
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

    it("preselects the only deck, and lessons link into that deck", async () => {
      vi.mocked(listCategories).mockResolvedValue([deck("deck-a", "Maths")]);
      vi.mocked(createNode).mockResolvedValue({ id: "node-9" } as never);
      renderFab(null);
      fireEvent.click(screen.getByLabelText("Create a card or lesson"));
      await waitFor(() => expect((screen.getAllByRole("combobox")[0] as HTMLSelectElement).value).toBe("deck-a"));

      fireEvent.click(screen.getByRole("button", { name: "Lesson" }));
      fireEvent.change(screen.getByPlaceholderText("Lesson title (e.g. Limits)"), { target: { value: "L" } });
      fireEvent.submit(screen.getByRole("dialog"));

      const link = await screen.findByRole("link", { name: /Open in a new tab/ });
      expect(link.getAttribute("href")).toBe("/categories/deck-a/lessons/node-9");
    });

    it("tells the user to create a deck first when they have none", async () => {
      vi.mocked(listCategories).mockResolvedValue([]);
      renderFab(null);
      fireEvent.click(screen.getByLabelText("Create a card or lesson"));
      await screen.findByText(/no decks yet/);
    });
  });
});
