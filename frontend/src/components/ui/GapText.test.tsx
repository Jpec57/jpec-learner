import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GapText } from "@/components/ui/GapText";

describe("GapText", () => {
  it("renders the gap as a blank between the two halves of the sentence", () => {
    const { container } = render(<GapText text="あの試合は__見たい" />);
    expect(container.textContent).toContain("あの試合は");
    expect(container.textContent).toContain("見たい");
    expect(container.textContent).not.toContain("__");
    expect(screen.getByRole("img")).not.toBeNull();
  });

  it("writes the answer into a single gap", () => {
    const { container } = render(<GapText text="あの試合は__見たい" fill="どうしても" />);
    expect(container.textContent).toBe("あの試合はどうしても見たい");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("keeps blanks when there are several gaps (one answer can't fill them all)", () => {
    render(<GapText text="a __ b __ c" fill="x" />);
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });

  it("falls back to plain card text when there is no gap", () => {
    const { container } = render(<GapText text="**bold**" />);
    expect(container.querySelector("strong")?.textContent).toBe("bold");
  });
});
