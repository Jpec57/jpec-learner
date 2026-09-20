import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CardText } from "@/components/ui/CardText";

describe("CardText", () => {
  it("renders inline and block LaTeX math with KaTeX", () => {
    const { container } = render(
      <CardText text={"Soit $A=\\mathcal{M}_2(\\mathbb{Z})$\n\n$$\n\\begin{pmatrix} a & b \\\\ 0 & a \\end{pmatrix}\n$$"} />
    );
    expect(container.querySelectorAll(".katex").length).toBe(2);
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });

  it("renders markdown and keeps single newlines as line breaks", () => {
    const { container } = render(<CardText text={"**bold**\nnext line"} />);
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("br")).not.toBeNull();
  });

  it("keeps furigana text on the ruby renderer", () => {
    const { container } = render(<CardText text="食[た]べる" />);
    expect(container.querySelector("ruby")).not.toBeNull();
  });

  it("omits the paragraph wrapper when inline", () => {
    const { container } = render(<CardText text="plain" inline />);
    expect(container.querySelector("p")).toBeNull();
  });
});
