import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import { OPENING_COURSES } from "@/features/chess/openings";

describe("opening courses", () => {
  it("has at least five courses per side", () => {
    expect(OPENING_COURSES.filter((c) => c.side === "w").length).toBeGreaterThanOrEqual(5);
    expect(OPENING_COURSES.filter((c) => c.side === "b").length).toBeGreaterThanOrEqual(5);
  });

  it("has unique line ids within each course (progress is keyed by them)", () => {
    for (const course of OPENING_COURSES) {
      const ids = course.lines.map((l) => l.id);
      expect(new Set(ids).size, course.id).toBe(ids.length);
      expect(course.lines.length, course.id).toBeGreaterThanOrEqual(4);
    }
  });

  for (const course of OPENING_COURSES) {
    for (const line of course.lines) {
      it(`${course.id}/${line.id} is a legal line ending on the trainee's move`, () => {
        const chess = new Chess();
        for (const move of line.moves) {
          expect(() => chess.move(move.san), `${move.san} after ${chess.history().join(" ")}`).not.toThrow();
          expect(move.note.en && move.note.fr).toBeTruthy();
        }
        // The last move should be the trainee's, so the line ends on their success.
        const lastMover = line.moves.length % 2 === 1 ? "w" : "b";
        expect(lastMover).toBe(course.side);
      });
    }
  }
});
