// ── Types ──
export const N = 15;
export const EMPTY = 0 as const;
export const BLACK = 1 as const;
export const WHITE = 2 as const;
export type Stone = typeof EMPTY | typeof BLACK | typeof WHITE;
export type Board = Stone[][];
export type Pos = [number, number];
export type DiffKey = "easy" | "medium" | "hard" | "expert";
export type ForbiddenReason = "33" | "44" | "overline";

export interface DiffConfig {
  label: string;
  emoji: string;
  maxD: number;
  maxC: number;
  time: number;
  thr: number;
  color: string;
  desc: string;
}

export interface FindBestResult {
  move: Pos | null;
  nodes: number;
  depth: number;
}

interface LineInfoResult {
  /** total consecutive stones (including the stone at r,c) */
  s: number;
  /** number of open ends (0, 1, or 2) */
  oe: number;
}

interface TTEntry {
  s: number;
  d: number;
  f: 0 | 1 | 2;
}

// ── Constants ──

export const createBoard = (): Board =>
  Array.from({ length: N }, () => Array(N).fill(EMPTY) as Stone[]);

/** 4 directions: horizontal, vertical, diagonal ↘, diagonal ↗ */
export const DIR: [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/** in-bounds check */
const inBounds = (r: number, c: number): boolean =>
  r >= 0 && r < N && c >= 0 && c < N;

export const DIFF: Record<DiffKey, DiffConfig> = {
  easy: {
    label: "초급", emoji: "🌱", maxD: 2, maxC: 8,
    time: 200, thr: 0, color: "#4ade80", desc: "깊이 2 · 후보 8수",
  },
  medium: {
    label: "중급", emoji: "⚔️", maxD: 4, maxC: 12,
    time: 1000, thr: 4, color: "#fbbf24", desc: "깊이 4 · 위협 탐색 4",
  },
  hard: {
    label: "상급", emoji: "🔥", maxD: 6, maxC: 15,
    time: 3000, thr: 8, color: "#f87171", desc: "깊이 6 · 위협 탐색 8",
  },
  expert: {
    label: "최강", emoji: "💀", maxD: 10, maxC: 20,
    time: 8000, thr: 16, color: "#a855f7", desc: "반복 심화 · 위협 탐색 16",
  },
};

export const SC = {
  FIVE: 1e7,
  OF: 5e5,
  FOUR: 5e4,
  OT: 2e4,
  THREE: 2e3,
  OW: 500,
  TWO: 100,
  ONE: 10,
};

// ────────────────────────────────────────────────────────────────
// ── RENJU FORBIDDEN (BLACK only) ──
// ────────────────────────────────────────────────────────────────

interface Cell {
  r: number;
  c: number;
  v: Stone;
}

/**
 * Count consecutive same-color stones through (r,c) in the given direction,
 * plus how many ends are open (EMPTY).
 */
export function lineInfo(
  b: Board, r: number, c: number,
  dr: number, dc: number, p: Stone,
): LineInfoResult {
  // count forward
  let fwd = 0;
  let nr = r + dr, nc = c + dc;
  while (inBounds(nr, nc) && b[nr][nc] === p) { fwd++; nr += dr; nc += dc; }
  const openAhead = inBounds(nr, nc) && b[nr][nc] === EMPTY;

  // count backward
  let bwd = 0;
  nr = r - dr; nc = c - dc;
  while (inBounds(nr, nc) && b[nr][nc] === p) { bwd++; nr -= dr; nc -= dc; }
  const openBehind = inBounds(nr, nc) && b[nr][nc] === EMPTY;

  return {
    s: fwd + bwd + 1,
    oe: (openBehind ? 1 : 0) + (openAhead ? 1 : 0),
  };
}

/** Does placing BLACK at (r,c) create exactly 5 in a row? */
export function exact5(b: Board, r: number, c: number): boolean {
  for (const [dr, dc] of DIR) {
    if (lineInfo(b, r, c, dr, dc, BLACK).s === 5) return true;
  }
  return false;
}

/** Does placing BLACK at (r,c) create 6+ in a row (overline / 장목)? */
export function overline(b: Board, r: number, c: number): boolean {
  for (const [dr, dc] of DIR) {
    if (lineInfo(b, r, c, dr, dc, BLACK).s >= 6) return true;
  }
  return false;
}

/**
 * Extract a line of up to `maxLen` cells through (r,c) along (dr,dc),
 * starting up to `backSteps` steps behind (r,c).
 */
function extractLine(
  b: Board, r: number, c: number,
  dr: number, dc: number,
  backSteps: number, maxLen: number,
): Cell[] {
  // walk backward to find the start of the scan window
  let sr = r, sc = c;
  for (let i = 0; i < backSteps; i++) {
    const pr = sr - dr, pc = sc - dc;
    if (!inBounds(pr, pc)) break;
    sr = pr; sc = pc;
  }

  // collect cells forward
  const line: Cell[] = [];
  let cr = sr, cc = sc;
  while (inBounds(cr, cc) && line.length < maxLen) {
    line.push({ r: cr, c: cc, v: b[cr][cc] });
    cr += dr; cc += dc;
  }
  return line;
}

/**
 * Check whether the four formed by filling `pr,pc` is actually a jumped four
 * (뛴사) — i.e. there is a BLACK stone one gap beyond either open end,
 * meaning filling that gap would make 5. That makes this a "four", not a "three".
 */
function isJumpedFour(
  b: Board, pr: number, pc: number, dr: number, dc: number,
): boolean {
  // walk to the forward end of the consecutive run
  let fr = pr + dr, fc = pc + dc;
  while (inBounds(fr, fc) && b[fr][fc] === BLACK) { fr += dr; fc += dc; }

  // walk to the backward end
  let br = pr - dr, bc = pc - dc;
  while (inBounds(br, bc) && b[br][bc] === BLACK) { br -= dr; bc -= dc; }

  // fr,fc and br,bc are the first non-BLACK cells at each end (should be EMPTY for oe=2)
  // check one step further beyond each open end
  const fBeyondR = fr + dr, fBeyondC = fc + dc;
  const bBeyondR = br - dr, bBeyondC = bc - dc;

  return (inBounds(fBeyondR, fBeyondC) && b[fBeyondR][fBeyondC] === BLACK)
      || (inBounds(bBeyondR, bBeyondC) && b[bBeyondR][bBeyondC] === BLACK);
}

/**
 * Is there an open three (활삼) through (r,c) in the given direction?
 *
 * An open three = a three that can become an open four (활사) in one move.
 * The stone at (r,c) must already be placed (BLACK) before calling.
 *
 * The function scans 5-cell windows along the line, looking for 3B+2E patterns.
 * For each empty cell in such a window, it simulates filling it and checks
 * whether the result is an open four (s=4, oe=2).
 *
 * Additional checks:
 *  - Jumped four exclusion: if the four has a BLACK stone beyond an open end,
 *    it is a jumped four (뛴사), not a three.
 *  - Recursive forbidden check: the move extending three→four must not itself
 *    be forbidden (삼삼/사사/장목), otherwise this three is not a real open three.
 */
function openThreeDir(
  b: Board, r: number, c: number,
  dr: number, dc: number, depth: number = 0,
): boolean {
  const line = extractLine(b, r, c, dr, dc, 6, 12);
  const myIdx = line.findIndex(p => p.r === r && p.c === c);
  if (myIdx < 0) return false;

  const winStart = Math.max(0, myIdx - 4);
  const winEnd = myIdx; // inclusive start of last valid window

  for (let s = winStart; s <= winEnd && s + 4 < line.length; s++) {
    const window = line.slice(s, s + 5);
    const blackCount = window.filter(p => p.v === BLACK).length;
    const emptyCount = window.filter(p => p.v === EMPTY).length;
    if (blackCount !== 3 || emptyCount !== 2) continue;

    // try filling each empty cell in the window
    for (const cell of window) {
      if (cell.v !== EMPTY) continue;

      b[cell.r][cell.c] = BLACK;
      const info = lineInfo(b, cell.r, cell.c, dr, dc, BLACK);
      const isOpenFour = info.s === 4 && info.oe === 2;

      if (isOpenFour) {
        b[cell.r][cell.c] = EMPTY;

        // exclude jumped four patterns
        if (isJumpedFour(b, cell.r, cell.c, dr, dc)) continue;

        // recursive: the extending move itself must not be forbidden
        if (depth < 2 && isForbidden(b, cell.r, cell.c, depth + 1)) continue;

        return true;
      } else {
        b[cell.r][cell.c] = EMPTY;
      }
    }
  }
  return false;
}

/** Count open threes (활삼) in all 4 directions at (r,c). */
function countOpenThrees(b: Board, r: number, c: number, depth: number = 0): number {
  let count = 0;
  b[r][c] = BLACK;
  for (const [dr, dc] of DIR) {
    if (openThreeDir(b, r, c, dr, dc, depth)) count++;
  }
  b[r][c] = EMPTY;
  return count;
}

/**
 * Does placing BLACK at (r,c) create a four (사) in this direction?
 * Detects both consecutive fours and jumped fours (뛴사).
 */
function hasFourInDir(
  b: Board, r: number, c: number, dr: number, dc: number,
): boolean {
  // consecutive four: 4 stones in a row with at least one open end
  const info = lineInfo(b, r, c, dr, dc, BLACK);
  if (info.s === 4 && info.oe >= 1) return true;

  // jumped four: 5-cell window with 4B+1E, where filling the empty makes exactly 5
  const line = extractLine(b, r, c, dr, dc, 4, 9);
  const myIdx = line.findIndex(p => p.r === r && p.c === c);
  if (myIdx < 0) return false;

  for (let s = Math.max(0, myIdx - 4); s <= myIdx && s + 4 < line.length; s++) {
    const window = line.slice(s, s + 5);
    const blackCount = window.filter(p => p.v === BLACK).length;
    const emptyCount = window.filter(p => p.v === EMPTY).length;
    if (blackCount !== 4 || emptyCount !== 1) continue;

    const emptyCell = window.find(p => p.v === EMPTY)!;
    b[emptyCell.r][emptyCell.c] = BLACK;
    const fi = lineInfo(b, emptyCell.r, emptyCell.c, dr, dc, BLACK);
    b[emptyCell.r][emptyCell.c] = EMPTY;

    if (fi.s === 5) return true;
  }
  return false;
}

/** Count fours (사) in all 4 directions at (r,c). */
function countFours(b: Board, r: number, c: number): number {
  let count = 0;
  b[r][c] = BLACK;
  for (const [dr, dc] of DIR) {
    if (hasFourInDir(b, r, c, dr, dc)) count++;
  }
  b[r][c] = EMPTY;
  return count;
}

/** Internal recursive forbidden check (returns boolean, no reason). */
function isForbidden(b: Board, r: number, c: number, depth: number): boolean {
  if (b[r][c] !== EMPTY) return false;

  b[r][c] = BLACK;
  if (exact5(b, r, c)) { b[r][c] = EMPTY; return false; }
  if (overline(b, r, c)) { b[r][c] = EMPTY; return true; }
  b[r][c] = EMPTY;

  if (countFours(b, r, c) >= 2) return true;
  if (countOpenThrees(b, r, c, depth) >= 2) return true;
  return false;
}

/**
 * Check whether placing BLACK at (r,c) is a forbidden move (금수).
 *
 * Renju rules (BLACK only):
 *  1. exact 5 → always legal (overrides everything)
 *  2. overline (6+) → forbidden (장목)
 *  3. double four → forbidden (사사, 4-4)
 *  4. double three → forbidden (삼삼, 3-3), with recursive check
 *
 * Returns the reason if forbidden, or null if legal.
 */
export function forbidden(b: Board, r: number, c: number): ForbiddenReason | null {
  if (b[r][c] !== EMPTY) return null;

  b[r][c] = BLACK;
  if (exact5(b, r, c)) { b[r][c] = EMPTY; return null; }
  if (overline(b, r, c)) { b[r][c] = EMPTY; return "overline"; }
  b[r][c] = EMPTY;

  if (countFours(b, r, c) >= 2) return "44";
  if (countOpenThrees(b, r, c, 0) >= 2) return "33";
  return null;
}

/** Scan the entire board and return all forbidden positions for BLACK. */
export function allForbidden(b: Board): Map<string, ForbiddenReason> {
  const result = new Map<string, ForbiddenReason>();
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (b[r][c] !== EMPTY) continue;
      const reason = forbidden(b, r, c);
      if (reason) result.set(`${r},${c}`, reason);
    }
  }
  return result;
}

// ────────────────────────────────────────────────────────────────
// ── EVAL ──
// ────────────────────────────────────────────────────────────────

/** Evaluate a single stone's contribution in all 4 directions. */
function evalPosition(b: Board, r: number, c: number, p: Stone): number {
  let score = 0;

  for (const [dr, dc] of DIR) {
    // count forward consecutive
    let fwd = 0, nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc) && b[nr][nc] === p) { fwd++; nr += dr; nc += dc; }
    const aheadOpen = inBounds(nr, nc) && b[nr][nc] === EMPTY;

    // count gap-forward (stones beyond one empty)
    let gapFwd = 0;
    if (aheadOpen) {
      let gr = nr + dr, gc = nc + dc;
      while (inBounds(gr, gc) && b[gr][gc] === p) { gapFwd++; gr += dr; gc += dc; }
    }

    // count backward consecutive
    let bwd = 0;
    nr = r - dr; nc = c - dc;
    while (inBounds(nr, nc) && b[nr][nc] === p) { bwd++; nr -= dr; nc -= dc; }
    const behindOpen = inBounds(nr, nc) && b[nr][nc] === EMPTY;

    // count gap-backward
    let gapBwd = 0;
    if (behindOpen) {
      let gr = nr - dr, gc = nc - dc;
      while (inBounds(gr, gc) && b[gr][gc] === p) { gapBwd++; gr -= dr; gc -= dc; }
    }

    const cnt = fwd + bwd + 1;
    const oe = (behindOpen ? 1 : 0) + (aheadOpen ? 1 : 0);

    if (cnt >= 5) {
      score += SC.FIVE;
    } else if (cnt === 4) {
      score += oe === 2 ? SC.OF : oe === 1 ? SC.FOUR : 0;
    } else if (cnt === 3) {
      score += oe === 2 ? SC.OT : oe === 1 ? SC.THREE : 0;
      if (gapFwd >= 1 && aheadOpen) score += SC.THREE;
      if (gapBwd >= 1 && behindOpen) score += SC.THREE;
    } else if (cnt === 2) {
      score += oe === 2 ? SC.OW : oe === 1 ? SC.TWO : 0;
      if (gapFwd >= 1) score += SC.TWO;
      if (gapBwd >= 1) score += SC.TWO;
    } else if (cnt === 1 && oe === 2) {
      score += SC.ONE;
    }
  }
  return score;
}

/** Evaluate the entire board from AI's perspective. */
export function evalBoard(b: Board, ai: Stone): number {
  let score = 0;
  const human = ai === WHITE ? BLACK : WHITE;

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (b[r][c] === ai) score += evalPosition(b, r, c, ai);
      else if (b[r][c] === human) score -= evalPosition(b, r, c, human) * 1.15;
    }
  }
  return score;
}

// ────────────────────────────────────────────────────────────────
// ── WIN DETECTION ──
// ────────────────────────────────────────────────────────────────

/** Check if player `p` has won. BLACK needs exactly 5; WHITE needs 5+. */
export function chkWin(b: Board, p: Stone): boolean {
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (b[r][c] !== p) continue;
      for (const [dr, dc] of DIR) {
        let n = 1;
        for (let i = 1; i < 6; i++) {
          const nr = r + dr * i, nc = c + dc * i;
          if (inBounds(nr, nc) && b[nr][nc] === p) n++;
          else break;
        }
        if (p === BLACK ? n === 5 : n >= 5) return true;
      }
    }
  }
  return false;
}

/** Return the winning 5-stone positions, or empty array if no win. */
export function winStones(b: Board, p: Stone): Pos[] {
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (b[r][c] !== p) continue;
      for (const [dr, dc] of DIR) {
        const stones: Pos[] = [[r, c]];
        for (let i = 1; i < 6; i++) {
          const nr = r + dr * i, nc = c + dc * i;
          if (inBounds(nr, nc) && b[nr][nc] === p) stones.push([nr, nc]);
          else break;
        }
        if (p === BLACK && stones.length === 5) return stones;
        if (p === WHITE && stones.length >= 5) return stones.slice(0, 5);
      }
    }
  }
  return [];
}

// ────────────────────────────────────────────────────────────────
// ── AI ──
// ────────────────────────────────────────────────────────────────

/** Get candidate moves (empty cells within distance 2 of any stone). */
export function getCands(b: Board): Pos[] {
  const hasAnyStone = b.some(row => row.some(cell => cell !== EMPTY));
  if (!hasAnyStone) return [[7, 7]];

  const candidates: Pos[] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (b[r][c] !== EMPTY) continue;
      let near = false;
      for (let dr = -2; dr <= 2 && !near; dr++) {
        for (let dc = -2; dc <= 2 && !near; dc++) {
          if (!dr && !dc) continue;
          const nr = r + dr, nc = c + dc;
          if (inBounds(nr, nc) && b[nr][nc] !== EMPTY) near = true;
        }
      }
      if (near) candidates.push([r, c]);
    }
  }
  return candidates;
}

/** Move score: sum of attack + defense value at (r,c). */
function moveScore(b: Board, r: number, c: number, ai: Stone): number {
  const human = ai === WHITE ? BLACK : WHITE;
  b[r][c] = ai;
  const attack = evalPosition(b, r, c, ai);
  b[r][c] = human;
  const defense = evalPosition(b, r, c, human);
  b[r][c] = EMPTY;
  return attack + defense;
}

/** Zobrist-like hash for transposition table. */
function boardHash(b: Board): number {
  let h = 0;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (b[r][c]) h = ((h * 3 + b[r][c]) * 31 + r * 15 + c) | 0;
    }
  }
  return h;
}

/** Find threat moves (positions that create or block a four/five). */
function getThreats(b: Board, p: Stone): Pos[] {
  const threats: Pos[] = [];
  const opponent = p === WHITE ? BLACK : WHITE;

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (b[r][c] !== EMPTY) continue;

      // check if placing `p` here creates a threat
      b[r][c] = p;
      let isAttackThreat = false;
      for (const [dr, dc] of DIR) {
        const info = lineInfo(b, r, c, dr, dc, p);
        if (info.s >= 5 || (info.s === 4 && info.oe >= 1)) {
          isAttackThreat = true;
          break;
        }
      }
      b[r][c] = EMPTY;

      if (isAttackThreat) {
        threats.push([r, c]);
        continue;
      }

      // check if opponent placing here would be a threat (defensive)
      b[r][c] = opponent;
      for (const [dr, dc] of DIR) {
        const info = lineInfo(b, r, c, dr, dc, opponent);
        if (info.s >= 5 || (info.s === 4 && info.oe >= 1)) {
          threats.push([r, c]);
          break;
        }
      }
      b[r][c] = EMPTY;
    }
  }
  return threats;
}

/** Quiescence search: extend search on threat moves to avoid horizon effect. */
function quiesce(
  b: Board, alpha: number, beta: number,
  isMaximizing: boolean, depthLeft: number,
  nodeCount: { count: number }, ai: Stone,
): number {
  nodeCount.count++;

  if (chkWin(b, ai)) return SC.FIVE * 10;
  const human = ai === WHITE ? BLACK : WHITE;
  if (chkWin(b, human)) return -SC.FIVE * 10;

  const standPat = evalBoard(b, ai);
  if (depthLeft <= 0) return standPat;

  if (isMaximizing) {
    if (standPat >= beta) return standPat;
    alpha = Math.max(alpha, standPat);
  } else {
    if (standPat <= alpha) return standPat;
    beta = Math.min(beta, standPat);
  }

  const player = isMaximizing ? ai : human;
  const threats = getThreats(b, player);
  if (!threats.length) return standPat;

  const sorted = threats
    .map(([r, c]) => ({ r, c, s: moveScore(b, r, c, ai) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 8);

  if (isMaximizing) {
    let best = standPat;
    for (const { r, c } of sorted) {
      if (player === BLACK && forbidden(b, r, c)) continue;
      b[r][c] = player;
      const val = quiesce(b, alpha, beta, false, depthLeft - 1, nodeCount, ai);
      b[r][c] = EMPTY;
      best = Math.max(best, val);
      alpha = Math.max(alpha, val);
      if (alpha >= beta) break;
    }
    return best;
  } else {
    let best = standPat;
    for (const { r, c } of sorted) {
      if (player === BLACK && forbidden(b, r, c)) continue;
      b[r][c] = player;
      const val = quiesce(b, alpha, beta, true, depthLeft - 1, nodeCount, ai);
      b[r][c] = EMPTY;
      best = Math.min(best, val);
      beta = Math.min(beta, val);
      if (alpha >= beta) break;
    }
    return best;
  }
}

/** Minimax with alpha-beta pruning, killer heuristic, and transposition table. */
function minimax(
  b: Board, depth: number, alpha: number, beta: number,
  isMaximizing: boolean, nodeCount: { count: number },
  cfg: DiffConfig, tt: Map<number, TTEntry>,
  killers: Record<number, Pos[]>, startTime: number, ai: Stone,
): number {
  if (performance.now() - startTime > cfg.time) return evalBoard(b, ai);
  nodeCount.count++;

  const human = ai === WHITE ? BLACK : WHITE;
  if (chkWin(b, ai)) return SC.FIVE * 10;
  if (chkWin(b, human)) return -SC.FIVE * 10;

  if (depth <= 0) {
    return cfg.thr > 0
      ? quiesce(b, alpha, beta, isMaximizing, cfg.thr, nodeCount, ai)
      : evalBoard(b, ai);
  }

  // transposition table lookup
  const hash = boardHash(b);
  const entry = tt.get(hash);
  if (entry && entry.d >= depth) {
    if (entry.f === 0) return entry.s;                    // exact
    if (entry.f === 1 && entry.s >= beta) return entry.s; // lower bound
    if (entry.f === 2 && entry.s <= alpha) return entry.s; // upper bound
  }

  // generate and sort candidates
  let candidates = getCands(b);
  if (!candidates.length) return 0;

  const killerSet = new Set(
    (killers[depth] || []).map(k => `${k[0]},${k[1]}`),
  );
  candidates.sort((x, y) => {
    const xBonus = killerSet.has(`${x[0]},${x[1]}`) ? 1e8 : 0;
    const yBonus = killerSet.has(`${y[0]},${y[1]}`) ? 1e8 : 0;
    return (yBonus + moveScore(b, y[0], y[1], ai))
         - (xBonus + moveScore(b, x[0], x[1], ai));
  });
  candidates = candidates.slice(0, cfg.maxC);

  const origAlpha = alpha;

  if (isMaximizing) {
    let best = -Infinity;
    for (const [r, c] of candidates) {
      if (ai === BLACK && forbidden(b, r, c)) continue;

      b[r][c] = ai;
      // check for extension (threat creates urgency)
      let extension = 0;
      for (const [dr, dc] of DIR) {
        const info = lineInfo(b, r, c, dr, dc, ai);
        if (info.s === 4 && info.oe >= 1) { extension = 1; break; }
      }

      const val = minimax(
        b, depth - 1 + extension, alpha, beta,
        false, nodeCount, cfg, tt, killers, startTime, ai,
      );
      b[r][c] = EMPTY;

      best = Math.max(best, val);
      alpha = Math.max(alpha, val);
      if (beta <= alpha) {
        // killer move heuristic
        if (!killers[depth]) killers[depth] = [];
        killers[depth].unshift([r, c]);
        if (killers[depth].length > 2) killers[depth].pop();
        break;
      }
    }
    const flag = best <= origAlpha ? 2 : best >= beta ? 1 : 0;
    tt.set(hash, { s: best, d: depth, f: flag });
    return best;
  } else {
    let best = Infinity;
    for (const [r, c] of candidates) {
      if (human === BLACK && forbidden(b, r, c)) continue;

      b[r][c] = human;
      let extension = 0;
      for (const [dr, dc] of DIR) {
        const info = lineInfo(b, r, c, dr, dc, human);
        if (info.s === 4 && info.oe >= 1) { extension = 1; break; }
      }

      const val = minimax(
        b, depth - 1 + extension, alpha, beta,
        true, nodeCount, cfg, tt, killers, startTime, ai,
      );
      b[r][c] = EMPTY;

      best = Math.min(best, val);
      beta = Math.min(beta, val);
      if (beta <= alpha) {
        if (!killers[depth]) killers[depth] = [];
        killers[depth].unshift([r, c]);
        if (killers[depth].length > 2) killers[depth].pop();
        break;
      }
    }
    const flag = best <= origAlpha ? 2 : best >= beta ? 1 : 0;
    tt.set(hash, { s: best, d: depth, f: flag });
    return best;
  }
}

/** Find the best move for the AI using iterative deepening. */
export function findBest(b: Board, diff: DiffKey, ai: Stone): FindBestResult {
  const cfg = DIFF[diff];
  const human = ai === WHITE ? BLACK : WHITE;
  const candidates = getCands(b);
  const startTime = performance.now();

  // immediate win check
  for (const [r, c] of candidates) {
    if (ai === BLACK && forbidden(b, r, c)) continue;
    b[r][c] = ai;
    if (chkWin(b, ai)) { b[r][c] = EMPTY; return { move: [r, c], nodes: 1, depth: 1 }; }
    b[r][c] = EMPTY;
  }

  // immediate block check
  for (const [r, c] of candidates) {
    if (human === BLACK && forbidden(b, r, c)) continue;
    b[r][c] = human;
    if (chkWin(b, human)) { b[r][c] = EMPTY; return { move: [r, c], nodes: 1, depth: 1 }; }
    b[r][c] = EMPTY;
  }

  // sort candidates by heuristic score
  const sorted = [...candidates].sort(
    (x, y) => moveScore(b, y[0], y[1], ai) - moveScore(b, x[0], x[1], ai),
  );

  // easy difficulty: shallow search with some randomness
  if (diff === "easy") {
    const top = sorted.slice(0, 3);
    const pick = top[Math.floor(Math.random() * Math.min(2, top.length))];
    const tt = new Map<number, TTEntry>();
    const killers: Record<number, Pos[]> = {};
    const nodeCount = { count: 0 };

    let bestScore = -Infinity;
    let bestMove: Pos = pick;
    for (const [r, c] of sorted.slice(0, cfg.maxC)) {
      if (ai === BLACK && forbidden(b, r, c)) continue;
      b[r][c] = ai;
      const score = minimax(b, 1, -Infinity, Infinity, false, nodeCount, cfg, tt, killers, startTime, ai);
      b[r][c] = EMPTY;
      if (score > bestScore) { bestScore = score; bestMove = [r, c]; }
    }
    return { move: bestMove, nodes: nodeCount.count, depth: 2 };
  }

  // iterative deepening for harder difficulties
  const tt = new Map<number, TTEntry>();
  const killers: Record<number, Pos[]> = {};
  const nodeCount = { count: 0 };
  let bestMove: Pos = candidates[0];
  let bestScore = -Infinity;
  let reachedDepth = 1;

  for (let d = 2; d <= cfg.maxD; d += 2) {
    let depthBest = -Infinity;
    let depthMove: Pos = bestMove;
    let completed = true;

    for (const [r, c] of sorted.slice(0, cfg.maxC)) {
      if (performance.now() - startTime > cfg.time * 0.8) { completed = false; break; }
      if (ai === BLACK && forbidden(b, r, c)) continue;

      b[r][c] = ai;
      const score = minimax(b, d - 1, -Infinity, Infinity, false, nodeCount, cfg, tt, killers, startTime, ai);
      b[r][c] = EMPTY;

      if (score > depthBest) { depthBest = score; depthMove = [r, c]; }
      if (score >= SC.FIVE) return { move: depthMove, nodes: nodeCount.count, depth: d };
    }

    if (completed || depthBest > bestScore) {
      bestScore = depthBest;
      bestMove = depthMove;
      reachedDepth = d;
    }

    // promote best move to front of sorted list for next iteration
    const idx = sorted.findIndex(([r, c]) => r === bestMove[0] && c === bestMove[1]);
    if (idx > 0) {
      const [top] = sorted.splice(idx, 1);
      sorted.unshift(top);
    }

    if (performance.now() - startTime > cfg.time * 0.6) break;
  }

  return { move: bestMove, nodes: nodeCount.count, depth: reachedDepth };
}
