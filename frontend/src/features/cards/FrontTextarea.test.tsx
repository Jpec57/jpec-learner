import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import "@/i18n/i18n";
import { FrontTextarea } from "@/features/cards/FrontTextarea";

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return <FrontTextarea value={value} onChange={setValue} placeholder="front" className="" />;
}

describe("FrontTextarea readings", () => {
  it("shows no reading field without kanji", () => {
    render(<Harness initial="hello" />);
    expect(screen.queryByText(/furigana/i)).toBeNull();
  });

  it("writes a typed reading into the front", () => {
    render(<Harness initial="私は勉強[べんきょう]します" />);
    expect(screen.getByDisplayValue("べんきょう")).toBeTruthy();
    fireEvent.change(screen.getAllByPlaceholderText(/reading|lecture/)[0], { target: { value: "わたし" } });
    expect((screen.getByPlaceholderText("front") as HTMLTextAreaElement).value).toBe(
      "私[わたし]は勉強[べんきょう]します"
    );
  });
});

describe("FrontTextarea readings on a Japanese deck", () => {
  it("shows the readings box before any kanji is typed", () => {
    render(<FrontTextarea value="" onChange={() => {}} placeholder="front" className="" furigana />);
    expect(screen.getByText(/furigana/i)).toBeTruthy();
  });
});
