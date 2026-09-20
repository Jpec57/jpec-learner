import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/i18n/i18n";
import { getCredential, sendChatMessage } from "@/features/assistant/api";
import { AssistantChatPanel } from "@/features/assistant/AssistantChatPanel";
import { openCoach } from "@/features/assistant/coachBus";

vi.mock("@/features/assistant/api", () => ({ getCredential: vi.fn(), sendChatMessage: vi.fn() }));

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AssistantChatPanel categoryId="cat-1" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AssistantChatPanel coach mode", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getCredential).mockResolvedValue({ configured: true, provider: "claude", model: null, updated_at: null });
    vi.mocked(sendChatMessage).mockResolvedValue({
      message: { role: "assistant", content: "Start with Analyse." },
      tool_events: [],
    });
  });

  it("opens in coach mode and sends the seeded prompt with mode=coach", async () => {
    renderPanel();
    expect(screen.queryByRole("tab", { name: "Coach" })).toBeNull(); // closed until opened

    act(() => openCoach("Assess where I stand"));

    await waitFor(() =>
      expect(sendChatMessage).toHaveBeenCalledWith({
        messages: [{ role: "user", content: "Assess where I stand" }],
        categoryId: "cat-1",
        mode: "coach",
      })
    );
    await screen.findByText("Start with Analyse.");
    expect(screen.getByRole("tab", { name: "Coach" }).getAttribute("aria-selected")).toBe("true");
  });

  it("keeps a separate conversation per mode and defaults the builder to mode=builder", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "AI assistant" }));

    const input = await screen.findByPlaceholderText(/Add 10 flashcards/);
    fireEvent.change(input, { target: { value: "Add cards" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(sendChatMessage).toHaveBeenCalledWith({
        messages: [{ role: "user", content: "Add cards" }],
        categoryId: "cat-1",
        mode: "builder",
      })
    );
    await screen.findByText("Start with Analyse.");

    fireEvent.click(screen.getByRole("tab", { name: "Coach" }));
    expect(screen.queryByText("Add cards")).toBeNull(); // builder history is not shown to the coach
    expect(screen.getByText(/I follow your goal and plan/)).toBeTruthy();
  });

  it("renders the assistant's markdown and LaTeX instead of showing the raw source", async () => {
    vi.mocked(sendChatMessage).mockResolvedValue({
      message: { role: "assistant", content: "Retenez **la règle** : $\\det(AB)=\\det A\\det B$" },
      tool_events: [],
    });
    const { container } = renderPanel();
    act(() => openCoach("Aide-moi"));

    await waitFor(() => expect(container.ownerDocument.querySelector(".katex")).toBeTruthy());
    const bubble = container.ownerDocument.querySelector("strong");
    expect(bubble?.textContent).toBe("la règle");
    expect(container.ownerDocument.body.textContent).not.toContain("$");
    expect(container.ownerDocument.body.textContent).not.toContain("**");
  });

  it("links created items to their pages, each opening in a new tab", async () => {
    vi.mocked(sendChatMessage).mockResolvedValue({
      message: { role: "assistant", content: "Done." },
      tool_events: [
        {
          tool: "create_lesson",
          args: {},
          ok: true,
          summary: "Created lesson 'Determinants' (id=n1).",
          refs: [{ kind: "lesson", id: "n1", category_id: "cat-1", label: "Determinants" }],
        },
        {
          tool: "create_cards_bulk",
          args: {},
          ok: true,
          summary: "Created 2 card(s):\n- q1 -> a1\n- q2 -> a2",
          refs: [
            { kind: "card", id: "c1", category_id: "cat-1", label: "q1" },
            { kind: "card", id: "c2", category_id: "cat-1", label: "q2" },
          ],
        },
      ],
    });
    renderPanel();
    act(() => openCoach("Make cards"));

    const lesson = await screen.findByRole("link", { name: "Determinants" });
    expect(lesson.getAttribute("href")).toBe("/categories/cat-1/lessons/n1");
    const cards = ["q1", "q2"].map((label) => screen.getByRole("link", { name: label }));
    expect(cards.map((a) => a.getAttribute("href"))).toEqual([
      "/categories/cat-1/cards/c1",
      "/categories/cat-1/cards/c2",
    ]);
    for (const link of [lesson, ...cards]) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
    // The raw "(id=…)" and the duplicated card preview are not shown to the reader.
    expect(document.body.textContent).not.toContain("id=n1");
    expect(document.body.textContent).toContain("Created lesson 'Determinants'.");
    expect(document.body.textContent).not.toContain("q1 -> a1");
  });
});
