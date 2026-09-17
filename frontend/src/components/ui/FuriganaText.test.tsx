import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FuriganaText } from "@/components/ui/FuriganaText";

describe("FuriganaText", () => {
  it("hides the reading until the annotated word is clicked", () => {
    render(<FuriganaText text="勉強[べんきょう]します" />);

    expect(screen.getByText("勉強")).toBeDefined();
    expect(screen.queryByText("べんきょう")).toBeNull();

    fireEvent.click(screen.getByText("勉強"));
    expect(screen.getByText("べんきょう")).toBeDefined();
  });

  it("toggles the reading back off on a second click", () => {
    render(<FuriganaText text="勉強[べんきょう]" />);

    const word = screen.getByText("勉強");
    fireEvent.click(word);
    expect(screen.getByText("べんきょう")).toBeDefined();

    fireEvent.click(word);
    expect(screen.queryByText("べんきょう")).toBeNull();
  });

  it("renders plain text (no annotation, nothing clickable) unchanged", () => {
    render(<FuriganaText text="hello" />);
    expect(screen.getByText("hello")).toBeDefined();
  });
});
