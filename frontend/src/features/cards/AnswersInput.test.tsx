import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import "@/i18n/i18n";
import { AnswersInput, cleanAnswers } from "@/features/cards/AnswersInput";

function Harness({ initial = [] as string[] }) {
  const [answers, setAnswers] = useState(initial);
  return (
    <>
      <AnswersInput value={answers} onChange={setAnswers} />
      <output data-testid="value">{JSON.stringify(answers)}</output>
    </>
  );
}

const value = () => JSON.parse(screen.getByTestId("value").textContent!);

describe("AnswersInput", () => {
  it("shows one empty input when there are no answers", () => {
    render(<Harness />);
    expect(screen.getAllByPlaceholderText("An accepted answer")).toHaveLength(1);
  });

  it("gives each answer its own input (commas stay part of the answer)", () => {
    render(<Harness initial={["rapide", "prompt"]} />);
    const inputs = screen.getAllByPlaceholderText("An accepted answer") as HTMLInputElement[];
    expect(inputs.map((input) => input.value)).toEqual(["rapide", "prompt"]);

    fireEvent.change(inputs[0], { target: { value: "rapide, vite" } });
    expect(value()).toEqual(["rapide, vite", "prompt"]);
  });

  it("adds a row with the button or Enter, and removes rows", () => {
    render(<Harness initial={["a"]} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add another answer" }));
    expect(screen.getAllByPlaceholderText("An accepted answer")).toHaveLength(2);

    fireEvent.change(screen.getAllByPlaceholderText("An accepted answer")[1], { target: { value: "b" } });
    fireEvent.keyDown(screen.getAllByPlaceholderText("An accepted answer")[1], { key: "Enter" });
    expect(screen.getAllByPlaceholderText("An accepted answer")).toHaveLength(3);

    fireEvent.click(screen.getAllByRole("button", { name: "Remove this answer" })[0]);
    expect(value()).toEqual(["b", ""]);
  });

  it("cleanAnswers drops blanks and trims", () => {
    expect(cleanAnswers([" a ", "", "  ", "b"])).toEqual(["a", "b"]);
  });
});
