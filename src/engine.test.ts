import { describe, it, expect } from "vitest";
import {
  N, EMPTY, BLACK, WHITE,
  type Board, type Stone,
  createBoard, forbidden, allForbidden, chkWin, winStones,
  findBest, evalBoard, getCands, lineInfo, exact5, overline,
  DIFF, SC, DIR,
} from "./engine";

function place(b: Board, stones: [number, number, Stone][]): Board {
  for (const [r, c, s] of stones) b[r][c] = s;
  return b;
}

describe("Board basics", () => {
  it("createBoard returns 15x15 grid of EMPTY", () => {
    const b = createBoard();
    expect(b.length).toBe(N);
    expect(b[0].length).toBe(N);
    expect(b.flat().every(c => c === EMPTY)).toBe(true);
  });

  it("board is mutable", () => {
    const b = createBoard();
    b[7][7] = BLACK;
    expect(b[7][7]).toBe(BLACK);
  });
});

describe("Win detection", () => {
  it("detects horizontal 5-in-a-row for BLACK", () => {
    const b = createBoard();
    for (let c = 3; c < 8; c++) b[7][c] = BLACK;
    expect(chkWin(b, BLACK)).toBe(true);
  });

  it("detects vertical 5-in-a-row for WHITE", () => {
    const b = createBoard();
    for (let r = 2; r < 7; r++) b[r][5] = WHITE;
    expect(chkWin(b, WHITE)).toBe(true);
  });

  it("detects diagonal win", () => {
    const b = createBoard();
    for (let i = 0; i < 5; i++) b[i][i] = BLACK;
    expect(chkWin(b, BLACK)).toBe(true);
  });

  it("BLACK 6-in-a-row still matches chkWin (overline checked separately via forbidden)", () => {
    // chkWin checks for n===5 for BLACK, but 6-in-a-row contains a 5-length subsequence
    const b = createBoard();
    for (let c = 3; c < 9; c++) b[7][c] = BLACK;
    // chkWin finds a 5 subsequence within the 6, so returns true
    // The overline rule is enforced by the forbidden() function, not chkWin
    expect(chkWin(b, BLACK)).toBe(true);
  });

  it("WHITE 6-in-a-row DOES win", () => {
    const b = createBoard();
    for (let c = 3; c < 9; c++) b[7][c] = WHITE;
    expect(chkWin(b, WHITE)).toBe(true);
  });

  it("4-in-a-row does not win", () => {
    const b = createBoard();
    for (let c = 3; c < 7; c++) b[7][c] = BLACK;
    expect(chkWin(b, BLACK)).toBe(false);
  });

  it("winStones returns 5 positions for a win", () => {
    const b = createBoard();
    for (let c = 3; c < 8; c++) b[7][c] = BLACK;
    const ws = winStones(b, BLACK);
    expect(ws.length).toBe(5);
    ws.forEach(([r, c]) => expect(b[r][c]).toBe(BLACK));
  });

  it("winStones returns empty array when no win", () => {
    const b = createBoard();
    b[7][7] = BLACK;
    expect(winStones(b, BLACK)).toEqual([]);
  });
});

describe("Renju forbidden moves", () => {
  it("detects double-three (33)", () => {
    // Open three pattern: two open threes crossing at (7,7)
    //   . B . .       . . . .
    //   . B . .       . . . .
    //   . X B B       . . . .
    // Horizontal: B at (7,6) and (7,8) — placing (7,7) makes open three
    // Vertical: B at (6,7) and (5,7) — placing (7,7) makes open three
    const b = createBoard();
    place(b, [
      [7, 6, BLACK], [7, 8, BLACK], // horizontal
      [5, 7, BLACK], [6, 7, BLACK], // vertical
    ]);
    const re = forbidden(b, 7, 7);
    expect(re).toBe("33");
  });

  it("detects double-four (44)", () => {
    // Two separate fours crossing at (7,7), each with a gap so exact5 is not triggered
    // Horizontal: B _ B B _ B — placing at (7,7) makes 4 in one segment
    // Vertical: same pattern
    const b = createBoard();
    // Horizontal four: (7,5),(7,6) + (7,8),(7,9) — placing (7,7) makes B B B _ B B pattern
    // but we need two fours, not a five. Use gapped fours:
    // Direction 1 (horizontal): stones at 5,6,8 — placing 7 makes _BBxB_ = 4 with open end
    // Direction 2 (vertical): stones at 4,6,8 — placing 7 makes _B_BxB_ = broken pattern
    // Simpler: use diagonal and horizontal
    // Horizontal: (7,5),(7,6),(7,8) — placing (7,7) makes 4-in-a-row _BBBB_
    // Diagonal ↘: (5,5),(6,6),(8,8) — placing (7,7) makes 4-in-a-row _BBBB_
    place(b, [
      [7, 5, BLACK], [7, 6, BLACK], [7, 8, BLACK],       // horizontal
      [5, 5, BLACK], [6, 6, BLACK], [8, 8, BLACK],       // diagonal
    ]);
    const re = forbidden(b, 7, 7);
    expect(re).toBe("44");
  });

  it("detects jumped four + consecutive four as 44 (뛴사+연속사)", () => {
    // Horizontal: B B [X] . B → jumped four
    // Vertical: B B B [X] → consecutive four
    const b = createBoard();
    place(b, [
      [7, 4, BLACK], [7, 5, BLACK], [7, 8, BLACK],  // horizontal jumped four
      [4, 6, BLACK], [5, 6, BLACK], [6, 6, BLACK],   // vertical consecutive four
    ]);
    expect(forbidden(b, 7, 6)).toBe("44");
  });

  it("detects double jumped four as 44 (뛴사+뛴사)", () => {
    // Horizontal: B B [X] . B → jumped four
    // Vertical: B B [X] . B → jumped four
    const b = createBoard();
    place(b, [
      [7, 4, BLACK], [7, 5, BLACK], [7, 8, BLACK],  // horizontal jumped four
      [5, 6, BLACK], [6, 6, BLACK], [9, 6, BLACK],   // vertical jumped four
    ]);
    expect(forbidden(b, 7, 6)).toBe("44");
  });

  it("detects B.B[X]B pattern as jumped four for 44", () => {
    // Horizontal: B . B [X] B → jumped four (gap on left)
    // Vertical: B B B [X] → consecutive four
    const b = createBoard();
    place(b, [
      [7, 3, BLACK], [7, 5, BLACK], [7, 8, BLACK],  // B . B [X] . . B — wait
    ]);
    // Actually: B at col3, B at col5, X at col6, B at col8 → B . B [X] . B — not 5-window
    // Let me fix: B . B [X] B → (7,3)B, (7,5)B, X=(7,6), (7,7)B
    const b2 = createBoard();
    place(b2, [
      [7, 3, BLACK], [7, 5, BLACK], [7, 7, BLACK],   // B . B [X] B
      [4, 6, BLACK], [5, 6, BLACK], [6, 6, BLACK],    // vertical consecutive four
    ]);
    expect(forbidden(b2, 7, 6)).toBe("44");
  });

  it("detects B[X].BB pattern as jumped four for 44", () => {
    // Horizontal: B [X] . B B → jumped four (gap on right)
    // Vertical: B B B [X] → consecutive four
    const b = createBoard();
    place(b, [
      [7, 5, BLACK], [7, 8, BLACK], [7, 9, BLACK],   // B [X] . B B
      [4, 6, BLACK], [5, 6, BLACK], [6, 6, BLACK],    // vertical consecutive four
    ]);
    expect(forbidden(b, 7, 6)).toBe("44");
  });

  it("detects overline", () => {
    const b = createBoard();
    // 5 blacks in a row with a gap that would make 6
    for (let c = 2; c < 8; c++) { if (c !== 5) b[7][c] = BLACK; }
    // placing at (7,5) makes 6 in a row
    const re = forbidden(b, 7, 5);
    expect(re).toBe("overline");
  });

  it("exact 5 is NOT forbidden", () => {
    const b = createBoard();
    // 4 blacks in a row, placing the 5th completes exactly 5
    for (let c = 3; c < 7; c++) b[7][c] = BLACK;
    expect(forbidden(b, 7, 7)).toBeNull();
  });

  it("jumped four + three is NOT forbidden (4-3)", () => {
    // Diagonal: B _ B B X — placing X creates a jumped four (뛴사), not a three
    // Vertical: B B X — placing X creates an open three
    // 4-3 is allowed, not 3-3
    const b = createBoard();
    place(b, [
      [4, 4, BLACK], [6, 6, BLACK], [7, 7, BLACK], // diagonal jumped four
      [6, 8, BLACK], [7, 8, BLACK],                 // vertical open three
    ]);
    expect(forbidden(b, 8, 8)).toBeNull();
  });

  it("dead three (blocked by WHITE) + open three is NOT 33", () => {
    const b = createBoard();
    place(b, [
      [7, 4, WHITE], [7, 5, BLACK], [7, 6, BLACK], // W B B X → blocked three
      [5, 7, BLACK], [6, 7, BLACK],                  // open three (vertical)
    ]);
    expect(forbidden(b, 7, 7)).toBeNull();
  });

  it("dead three (blocked by wall) + open three is NOT 33", () => {
    const b = createBoard();
    place(b, [
      [7, 1, BLACK], [7, 2, BLACK], // [wall] B B X → blocked by edge
      [5, 0, BLACK], [6, 0, BLACK], // open three (vertical)
    ]);
    expect(forbidden(b, 7, 0)).toBeNull();
  });

  it("three blocked on far side + open three is NOT 33", () => {
    const b = createBoard();
    place(b, [
      [7, 6, BLACK], [7, 8, BLACK], [7, 9, WHITE], // _ B X B W → blocked right
      [5, 7, BLACK], [6, 7, BLACK],                  // open three (vertical)
    ]);
    expect(forbidden(b, 7, 7)).toBeNull();
  });

  it("jumped three (뛴삼) + open three = 33", () => {
    const b = createBoard();
    place(b, [
      [7, 4, BLACK], [7, 6, BLACK], // B . X → jumped three (horizontal)
      [5, 7, BLACK], [6, 7, BLACK], // open three (vertical)
    ]);
    expect(forbidden(b, 7, 7)).toBe("33");
  });

  it("double jumped three = 33", () => {
    const b = createBoard();
    place(b, [
      [7, 4, BLACK], [7, 6, BLACK], // B . X B → jumped three (horizontal)
      [4, 7, BLACK], [6, 7, BLACK], // B . X B → jumped three (vertical)
    ]);
    expect(forbidden(b, 7, 7)).toBe("33");
  });

  it("consecutive four + open three = 4-3 NOT forbidden", () => {
    const b = createBoard();
    place(b, [
      [7, 4, BLACK], [7, 5, BLACK], [7, 6, BLACK], // B B B X → four
      [5, 7, BLACK], [6, 7, BLACK],                  // open three
    ]);
    expect(forbidden(b, 7, 7)).toBeNull();
  });

  it("exact 5 overrides 33", () => {
    const b = createBoard();
    for (let c = 3; c < 7; c++) b[7][c] = BLACK;   // 4 in a row → placing makes 5
    place(b, [[5, 7, BLACK], [6, 7, BLACK]]);         // would be open three
    expect(forbidden(b, 7, 7)).toBeNull();
  });

  it("exact 5 in one dir + overline in another = NOT forbidden", () => {
    const b = createBoard();
    for (let c = 3; c < 7; c++) b[7][c] = BLACK;   // horizontal 4 → exact 5
    for (let r = 2; r < 7; r++) b[r][7] = BLACK;   // vertical 5 → overline (6)
    expect(forbidden(b, 7, 7)).toBeNull();
  });

  it("7 in a row = overline", () => {
    const b = createBoard();
    for (let c = 1; c < 8; c++) { if (c !== 4) b[7][c] = BLACK; }
    expect(forbidden(b, 7, 4)).toBe("overline");
  });

  it("edge four + regular four = 44", () => {
    const b = createBoard();
    place(b, [
      [7, 0, BLACK], [7, 1, BLACK], [7, 2, BLACK], // [wall] B B B X → four (oe=1)
      [5, 3, BLACK], [6, 3, BLACK], [8, 3, BLACK],  // B B X B → four
    ]);
    expect(forbidden(b, 7, 3)).toBe("44");
  });

  it("single open three is NOT forbidden", () => {
    const b = createBoard();
    place(b, [[7, 6, BLACK], [7, 8, BLACK]]);
    expect(forbidden(b, 7, 7)).toBeNull();
  });

  it("single four is NOT forbidden", () => {
    const b = createBoard();
    place(b, [[7, 4, BLACK], [7, 5, BLACK], [7, 6, BLACK]]);
    expect(forbidden(b, 7, 7)).toBeNull();
  });

  it("recursive: both extension points are 44 → three is not open → 33 lifted", () => {
    // X=(7,7), horizontal three: (7,5)(7,6)[X] → extension points (7,4) and (7,8)
    // vertical three: (5,7)(6,7)[X] → normal open three
    // Make (7,4) and (7,8) both 44 forbidden (after placing X):
    //   (7,8): horizontal four + vertical four via (4,8)(5,8)(6,8)
    //   (7,4): horizontal four + vertical four via (4,4)(5,4)(6,4)
    // → horizontal three is not a real open three → only 1 open three → not 33
    const b = createBoard();
    place(b, [
      [7, 5, BLACK], [7, 6, BLACK],                   // horizontal three
      [5, 7, BLACK], [6, 7, BLACK],                    // vertical three
      [4, 8, BLACK], [5, 8, BLACK], [6, 8, BLACK],    // make (7,8) → 44
      [4, 4, BLACK], [5, 4, BLACK], [6, 4, BLACK],    // make (7,4) → 44
    ]);
    expect(forbidden(b, 7, 7)).toBeNull();
  });

  it("recursive: one extension point is 44 but other is not → still open three → 33", () => {
    const b = createBoard();
    place(b, [
      [7, 5, BLACK], [7, 6, BLACK],                   // horizontal three
      [5, 7, BLACK], [6, 7, BLACK],                    // vertical three
      [4, 8, BLACK], [5, 8, BLACK], [6, 8, BLACK],    // make (7,8) → 44
      // (7,4) is NOT forbidden → horizontal three can still extend
    ]);
    expect(forbidden(b, 7, 7)).toBe("33");
  });

  it("recursive: both extension points are overline → three is not open → 33 lifted", () => {
    const b = createBoard();
    place(b, [
      [7, 6, BLACK], [7, 8, BLACK],                   // horizontal three with gap
      [5, 7, BLACK], [6, 7, BLACK],                    // vertical three
      [7, 2, BLACK], [7, 3, BLACK], [7, 4, BLACK],    // make (7,5) → overline
      [7, 10, BLACK], [7, 11, BLACK], [7, 12, BLACK], // make (7,9) → overline
    ]);
    expect(forbidden(b, 7, 7)).toBeNull();
  });

  it("empty board has no forbidden positions", () => {
    const b = createBoard();
    const f = allForbidden(b);
    expect(f.size).toBe(0);
  });

  it("forbidden returns null for non-empty cell", () => {
    const b = createBoard();
    b[7][7] = BLACK;
    expect(forbidden(b, 7, 7)).toBeNull();
  });
});

describe("lineInfo", () => {
  it("counts stones in a direction correctly", () => {
    const b = createBoard();
    b[7][7] = BLACK; b[7][8] = BLACK; b[7][9] = BLACK;
    const info = lineInfo(b, 7, 8, 0, 1, BLACK);
    expect(info.s).toBe(3);
  });

  it("counts open ends", () => {
    const b = createBoard();
    b[7][7] = BLACK; b[7][8] = BLACK;
    const info = lineInfo(b, 7, 7, 0, 1, BLACK);
    expect(info.oe).toBe(2); // both ends open
  });

  it("detects blocked end", () => {
    const b = createBoard();
    b[7][0] = BLACK; b[7][1] = BLACK; // left edge blocks one end
    const info = lineInfo(b, 7, 0, 0, 1, BLACK);
    expect(info.oe).toBe(1); // only right end open
  });
});

describe("exact5 and overline", () => {
  it("exact5 true for exactly 5", () => {
    const b = createBoard();
    for (let c = 3; c < 8; c++) b[7][c] = BLACK;
    expect(exact5(b, 7, 5)).toBe(true);
  });

  it("exact5 false for 4", () => {
    const b = createBoard();
    for (let c = 3; c < 7; c++) b[7][c] = BLACK;
    expect(exact5(b, 7, 5)).toBe(false);
  });

  it("overline true for 6+", () => {
    const b = createBoard();
    for (let c = 3; c < 9; c++) b[7][c] = BLACK;
    expect(overline(b, 7, 5)).toBe(true);
  });

  it("overline false for 5", () => {
    const b = createBoard();
    for (let c = 3; c < 8; c++) b[7][c] = BLACK;
    expect(overline(b, 7, 5)).toBe(false);
  });
});

describe("Evaluation", () => {
  it("empty board evaluates to 0", () => {
    expect(evalBoard(createBoard(), WHITE)).toBe(0);
  });

  it("AI stone gives positive score", () => {
    const b = createBoard();
    b[7][7] = WHITE;
    expect(evalBoard(b, WHITE)).toBeGreaterThan(0);
  });

  it("opponent stone gives negative score", () => {
    const b = createBoard();
    b[7][7] = BLACK;
    expect(evalBoard(b, WHITE)).toBeLessThan(0);
  });

  it("more connected stones give higher score", () => {
    const b1 = createBoard(); b1[7][7] = WHITE;
    const b2 = createBoard(); b2[7][7] = WHITE; b2[7][8] = WHITE;
    expect(evalBoard(b2, WHITE)).toBeGreaterThan(evalBoard(b1, WHITE));
  });
});

describe("Candidate generation", () => {
  it("empty board returns center", () => {
    const cs = getCands(createBoard());
    expect(cs).toEqual([[7, 7]]);
  });

  it("returns positions near existing stones", () => {
    const b = createBoard();
    b[7][7] = BLACK;
    const cs = getCands(b);
    expect(cs.length).toBeGreaterThan(0);
    cs.forEach(([r, c]) => {
      expect(b[r][c]).toBe(EMPTY);
      const dist = Math.max(Math.abs(r - 7), Math.abs(c - 7));
      expect(dist).toBeLessThanOrEqual(2);
    });
  });

  it("does not return occupied positions", () => {
    const b = createBoard();
    b[7][7] = BLACK; b[7][8] = WHITE;
    const cs = getCands(b);
    cs.forEach(([r, c]) => expect(b[r][c]).toBe(EMPTY));
  });
});

describe("AI (findBest)", () => {
  it("finds immediate winning move", () => {
    const b = createBoard();
    // WHITE has 4 in a row at (7,3)~(7,6), needs (7,7) or (7,2) to win
    for (let c = 3; c < 7; c++) b[7][c] = WHITE;
    b[6][6] = BLACK; b[6][5] = BLACK; b[6][4] = BLACK;
    const { move } = findBest(b, "easy", WHITE);
    expect(move![0]).toBe(7);
    expect([2, 7]).toContain(move![1]);
  });

  it("blocks opponent's winning threat", () => {
    const b = createBoard();
    // BLACK has 4 in a row, WHITE must block at (7,7)
    for (let c = 3; c < 7; c++) b[7][c] = BLACK;
    b[5][5] = WHITE; b[5][6] = WHITE; b[5][7] = WHITE; // some white stones
    const { move } = findBest(b, "easy", WHITE);
    // AI should block at (7,7) or (7,2)
    expect(move![0]).toBe(7);
    expect([2, 7]).toContain(move![1]);
  });

  it("returns a valid position", () => {
    const b = createBoard();
    b[7][7] = BLACK;
    const { move } = findBest(b, "easy", WHITE);
    expect(move).not.toBeNull();
    const [r, c] = move!;
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(N);
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThan(N);
    expect(b[r][c]).toBe(EMPTY);
  });

  it("does not return forbidden position when AI plays BLACK", () => {
    // Set up a board where some positions are forbidden for BLACK
    const b = createBoard();
    place(b, [
      [7, 5, BLACK], [7, 6, BLACK], [7, 8, BLACK],
      [5, 7, BLACK], [6, 7, BLACK], [8, 7, BLACK],
      [4, 4, WHITE], [4, 5, WHITE], [4, 6, WHITE],
    ]);
    // (7,7) is a 44 forbidden move (two fours crossing)
    expect(forbidden(b, 7, 7)).toBe("44");
    const { move } = findBest(b, "easy", BLACK);
    if (move) {
      expect(forbidden(b, move[0], move[1])).toBeNull();
    }
  });

  it("runs within reasonable time for easy difficulty", () => {
    const b = createBoard();
    b[7][7] = BLACK;
    const t0 = performance.now();
    findBest(b, "easy", WHITE);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(DIFF.easy.time * 3); // generous margin
  });
});

describe("Constants", () => {
  it("DIFF has all difficulty levels", () => {
    expect(Object.keys(DIFF)).toEqual(["easy", "medium", "hard", "expert"]);
  });

  it("DIR has 4 directions", () => {
    expect(DIR.length).toBe(4);
  });

  it("SC.FIVE is the highest score", () => {
    expect(SC.FIVE).toBeGreaterThan(SC.OF);
    expect(SC.OF).toBeGreaterThan(SC.FOUR);
    expect(SC.FOUR).toBeGreaterThan(SC.OT);
  });
});
