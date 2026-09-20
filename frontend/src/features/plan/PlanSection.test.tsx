import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/i18n/i18n";
import { onOpenCoach } from "@/features/assistant/coachBus";
import { getPlan, getPlanProgress, updatePlan, type PlanProgress } from "@/features/plan/api";
import { PlanSection } from "@/features/plan/PlanSection";

vi.mock("@/features/plan/api", () => ({ getPlan: vi.fn(), getPlanProgress: vi.fn(), updatePlan: vi.fn() }));
vi.mock("@/features/progression/ProgressBar", () => ({ ProgressBar: () => <div data-testid="bar" /> }));

const PROGRESS: PlanProgress = {
  goal: "Master maths",
  total_due: 2,
  weakest_cards: [
    { card_id: "c1", front_text: "Compute det(A)", lesson_node_id: "n1", current_level: 1, ease_factor: 1.5, lapses: 3 },
  ],
  sections: [
    {
      level: 2,
      title: "Algèbre linéaire",
      node_id: "n1",
      status: "weak",
      total_items: 4,
      reviewed_items: 3,
      avg_level: 2,
      due_count: 2,
      lapse_rate: 0.6,
      weakness_score: 0.9,
      last_reviewed_at: null,
      checklist: [
        { text: "Espaces vectoriels", done: true },
        { text: "Déterminants", done: false },
      ],
    },
    {
      level: 2,
      title: "Analyse",
      node_id: null,
      status: "no_content",
      total_items: 0,
      reviewed_items: 0,
      avg_level: 0,
      due_count: 0,
      lapse_rate: null,
      weakness_score: 0.6,
      last_reviewed_at: null,
      checklist: [],
    },
  ],
};

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PlanSection categoryId="cat-1" deckType="scientific" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PlanSection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getPlan).mockResolvedValue({ goal: "Master maths", plan_markdown: "## Algèbre linéaire\n## Analyse" });
    vi.mocked(getPlanProgress).mockResolvedValue(PROGRESS);
  });

  it("shows each sub-goal with its status, stats and the weakest cards", async () => {
    renderSection();
    await screen.findByText("Algèbre linéaire");
    expect(screen.getByText("Weak")).toBeTruthy();
    expect(screen.getByText("No content yet")).toBeTruthy();
    expect(screen.getByText(/4 items · 2 due · 60% missed recently · 1\/2 milestones/)).toBeTruthy();
    expect(screen.getByText("Compute det(A)").getAttribute("href")).toBe("/categories/cat-1/cards/c1");
    expect(screen.getByText("3 misses")).toBeTruthy();
    // Only sections that have content draw a progress bar.
    expect(screen.getAllByTestId("bar")).toHaveLength(1);
  });

  it("opens the coach with a ready-made prompt", async () => {
    const opened: (string | undefined)[] = [];
    const off = onOpenCoach((prompt) => opened.push(prompt));
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Give me exercises on my weakest area" }));
    fireEvent.click(screen.getByRole("button", { name: "Ask the coach" }));
    off();
    expect(opened).toEqual(["Give me exercises on my weakest area", undefined]);
  });

  it("saves the goal and plan text through the editor", async () => {
    vi.mocked(updatePlan).mockResolvedValue({ goal: "New goal", plan_markdown: "## Probabilités" });
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));

    fireEvent.change(screen.getByLabelText("Main goal"), { target: { value: "New goal" } });
    fireEvent.change(screen.getByPlaceholderText(/# My plan/), { target: { value: "## Probabilités" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updatePlan).toHaveBeenCalledWith("cat-1", { goal: "New goal", plan_markdown: "## Probabilités" })
    );
    await waitFor(() => expect(screen.queryByLabelText("Main goal")).toBeNull());
  });
});
