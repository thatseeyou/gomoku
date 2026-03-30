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
  label: string; emoji: string; maxD: number; maxC: number;
  time: number; thr: number; color: string; desc: string;
}

export interface FindBestResult {
  move: Pos | null; nodes: number; depth: number;
}

interface LineInfoResult { s: number; oe: number; }
interface TTEntry { s: number; d: number; f: 0 | 1 | 2; }

// ── Constants ──
export const createBoard = (): Board =>
  Array.from({ length: N }, () => Array(N).fill(EMPTY) as Stone[]);

export const DIR: [number, number][] = [[0,1],[1,0],[1,1],[1,-1]];
const ib = (r: number, c: number): boolean => r >= 0 && r < N && c >= 0 && c < N;

export const DIFF: Record<DiffKey, DiffConfig> = {
  easy:   { label:"초급", emoji:"🌱", maxD:2,  maxC:8,  time:200,  thr:0,  color:"#4ade80", desc:"깊이 2 · 후보 8수" },
  medium: { label:"중급", emoji:"⚔️",  maxD:4,  maxC:12, time:1000, thr:4,  color:"#fbbf24", desc:"깊이 4 · 위협 탐색 4" },
  hard:   { label:"상급", emoji:"🔥", maxD:6,  maxC:15, time:3000, thr:8,  color:"#f87171", desc:"깊이 6 · 위협 탐색 8" },
  expert: { label:"최강", emoji:"💀", maxD:10, maxC:20, time:8000, thr:16, color:"#a855f7", desc:"반복 심화 · 위협 탐색 16" },
};

export const SC = { FIVE:1e7, OF:5e5, FOUR:5e4, OT:2e4, THREE:2e3, OW:500, TWO:100, ONE:10 };

// ── RENJU FORBIDDEN (BLACK only) ──
export function lineInfo(b: Board, r: number, c: number, dr: number, dc: number, p: Stone): LineInfoResult {
  let f = 0, nr = r + dr, nc = c + dc;
  while (ib(nr, nc) && b[nr][nc] === p) { f++; nr += dr; nc += dc; }
  const oa = ib(nr, nc) && b[nr][nc] === EMPTY;
  let bw = 0; nr = r - dr; nc = c - dc;
  while (ib(nr, nc) && b[nr][nc] === p) { bw++; nr -= dr; nc -= dc; }
  const ob = ib(nr, nc) && b[nr][nc] === EMPTY;
  return { s: f + bw + 1, oe: (ob ? 1 : 0) + (oa ? 1 : 0) };
}

export function exact5(b: Board, r: number, c: number): boolean {
  for (const [dr, dc] of DIR) if (lineInfo(b, r, c, dr, dc, BLACK).s === 5) return true;
  return false;
}

export function overline(b: Board, r: number, c: number): boolean {
  for (const [dr, dc] of DIR) if (lineInfo(b, r, c, dr, dc, BLACK).s >= 6) return true;
  return false;
}

function openThreeDir(b: Board, r: number, c: number, dr: number, dc: number, depth: number = 0): boolean {
  const ln: { r: number; c: number; v: Stone }[] = [];
  let sr = r, sc = c;
  for (let i = 0; i < 6; i++) { const p = sr - dr, q = sc - dc; if (!ib(p, q)) break; sr = p; sc = q; }
  let cr = sr, cc = sc;
  while (ib(cr, cc) && ln.length < 12) { ln.push({ r: cr, c: cc, v: b[cr][cc] }); cr += dr; cc += dc; }
  const mi = ln.findIndex(p => p.r === r && p.c === c);
  if (mi < 0) return false;
  for (let s = Math.max(0, mi - 4); s <= mi && s + 4 < ln.length; s++) {
    const w = ln.slice(s, s + 5);
    if (w.filter(p => p.v === BLACK).length === 3 && w.filter(p => p.v === EMPTY).length === 2) {
      for (const p of w) {
        if (p.v !== EMPTY) continue;
        b[p.r][p.c] = BLACK;
        const info = lineInfo(b, p.r, p.c, dr, dc, BLACK);
        if (info.s === 4 && info.oe === 2) {
          // Find both open ends of this four
          let fr = p.r + dr, fc = p.c + dc;
          while (ib(fr, fc) && b[fr][fc] === BLACK) { fr += dr; fc += dc; }
          let br = p.r - dr, bc = p.c - dc;
          while (ib(br, bc) && b[br][bc] === BLACK) { br -= dr; bc -= dc; }
          const fj = fr + dr, fk = fc + dc, bj = br - dr, bk = bc - dc;
          const jumped = (ib(fj, fk) && b[fj][fk] === BLACK) || (ib(bj, bk) && b[bj][bk] === BLACK);
          b[p.r][p.c] = EMPTY;
          // Jumped four pattern — this is a four, not a three
          if (jumped) continue;
          // Recursive check: the move that extends three→four must not itself be forbidden
          if (depth < 2 && isForbidden(b, p.r, p.c, depth + 1)) continue;
          return true;
        } else {
          b[p.r][p.c] = EMPTY;
        }
      }
    }
  }
  return false;
}

function cntOT(b: Board, r: number, c: number, depth: number = 0): number {
  let n = 0; b[r][c] = BLACK;
  for (const [dr, dc] of DIR) if (openThreeDir(b, r, c, dr, dc, depth)) n++;
  b[r][c] = EMPTY; return n;
}

function fourDir(b: Board, r: number, c: number, dr: number, dc: number): boolean {
  // Consecutive four: s=4 with at least one open end
  const info = lineInfo(b, r, c, dr, dc, BLACK);
  if (info.s === 4 && info.oe >= 1) return true;
  // Jumped four: 5-cell window with 4B+1E where filling the empty makes 5
  const ln: { r: number; c: number; v: Stone }[] = [];
  let sr = r, sc = c;
  for (let i = 0; i < 4; i++) { const p = sr - dr, q = sc - dc; if (!ib(p, q)) break; sr = p; sc = q; }
  let cr = sr, cc = sc;
  while (ib(cr, cc) && ln.length < 9) { ln.push({ r: cr, c: cc, v: b[cr][cc] }); cr += dr; cc += dc; }
  const mi = ln.findIndex(p => p.r === r && p.c === c);
  if (mi < 0) return false;
  for (let s = Math.max(0, mi - 4); s <= mi && s + 4 < ln.length; s++) {
    const w = ln.slice(s, s + 5);
    if (w.filter(p => p.v === BLACK).length === 4 && w.filter(p => p.v === EMPTY).length === 1) {
      const ep = w.find(p => p.v === EMPTY)!;
      b[ep.r][ep.c] = BLACK;
      const fi = lineInfo(b, ep.r, ep.c, dr, dc, BLACK);
      b[ep.r][ep.c] = EMPTY;
      if (fi.s === 5) return true;
    }
  }
  return false;
}

function cntF(b: Board, r: number, c: number): number {
  let n = 0; b[r][c] = BLACK;
  for (const [dr, dc] of DIR) if (fourDir(b, r, c, dr, dc)) n++;
  b[r][c] = EMPTY; return n;
}

function isForbidden(b: Board, r: number, c: number, depth: number): boolean {
  if (b[r][c] !== EMPTY) return false;
  b[r][c] = BLACK;
  if (exact5(b, r, c)) { b[r][c] = EMPTY; return false; }
  if (overline(b, r, c)) { b[r][c] = EMPTY; return true; }
  b[r][c] = EMPTY;
  if (cntF(b, r, c) >= 2) return true;
  if (cntOT(b, r, c, depth) >= 2) return true;
  return false;
}

export function forbidden(b: Board, r: number, c: number): ForbiddenReason | null {
  if (b[r][c] !== EMPTY) return null;
  b[r][c] = BLACK;
  if (exact5(b, r, c)) { b[r][c] = EMPTY; return null; }
  if (overline(b, r, c)) { b[r][c] = EMPTY; return "overline"; }
  b[r][c] = EMPTY;
  if (cntF(b, r, c) >= 2) return "44";
  if (cntOT(b, r, c, 0) >= 2) return "33";
  return null;
}

export function allForbidden(b: Board): Map<string, ForbiddenReason> {
  const f = new Map<string, ForbiddenReason>();
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (b[r][c] !== EMPTY) continue;
    const re = forbidden(b, r, c);
    if (re) f.set(`${r},${c}`, re);
  }
  return f;
}

// ── EVAL ──
function ep(b: Board, r: number, c: number, p: Stone): number {
  let sc = 0;
  for (const [dr, dc] of DIR) {
    let f = 0, nr = r + dr, nc = c + dc;
    while (ib(nr, nc) && b[nr][nc] === p) { f++; nr += dr; nc += dc; }
    const ao = ib(nr, nc) && b[nr][nc] === EMPTY;
    let gf = 0;
    if (ao) { let gr = nr + dr, gc = nc + dc; while (ib(gr, gc) && b[gr][gc] === p) { gf++; gr += dr; gc += dc; } }
    let bw = 0; nr = r - dr; nc = c - dc;
    while (ib(nr, nc) && b[nr][nc] === p) { bw++; nr -= dr; nc -= dc; }
    const bo = ib(nr, nc) && b[nr][nc] === EMPTY;
    let gb = 0;
    if (bo) { let gr = nr - dr, gc = nc - dc; while (ib(gr, gc) && b[gr][gc] === p) { gb++; gr -= dr; gc -= dc; } }
    const cnt = f + bw + 1, oe = (bo ? 1 : 0) + (ao ? 1 : 0);
    if (cnt >= 5) sc += SC.FIVE;
    else if (cnt === 4) sc += oe === 2 ? SC.OF : oe === 1 ? SC.FOUR : 0;
    else if (cnt === 3) { sc += oe === 2 ? SC.OT : oe === 1 ? SC.THREE : 0; if (gf >= 1 && ao) sc += SC.THREE; if (gb >= 1 && bo) sc += SC.THREE; }
    else if (cnt === 2) { sc += oe === 2 ? SC.OW : oe === 1 ? SC.TWO : 0; if (gf >= 1) sc += SC.TWO; if (gb >= 1) sc += SC.TWO; }
    else if (cnt === 1 && oe === 2) sc += SC.ONE;
  }
  return sc;
}

export function evalBoard(b: Board, ai: Stone): number {
  let s = 0; const hu = ai === WHITE ? BLACK : WHITE;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (b[r][c] === ai) s += ep(b, r, c, ai);
    else if (b[r][c] === hu) s -= ep(b, r, c, hu) * 1.15;
  }
  return s;
}

export function chkWin(b: Board, p: Stone): boolean {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (b[r][c] !== p) continue;
    for (const [dr, dc] of DIR) {
      let n = 1;
      for (let i = 1; i < 6; i++) { const nr = r + dr * i, nc = c + dc * i; if (ib(nr, nc) && b[nr][nc] === p) n++; else break; }
      if (p === BLACK ? n === 5 : n >= 5) return true;
    }
  }
  return false;
}

export function winStones(b: Board, p: Stone): Pos[] {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (b[r][c] !== p) continue;
    for (const [dr, dc] of DIR) {
      const l: Pos[] = [[r, c]];
      for (let i = 1; i < 6; i++) { const nr = r + dr * i, nc = c + dc * i; if (ib(nr, nc) && b[nr][nc] === p) l.push([nr, nc]); else break; }
      if (p === BLACK && l.length === 5) return l;
      if (p === WHITE && l.length >= 5) return l.slice(0, 5);
    }
  }
  return [];
}

// ── AI ──
export function getCands(b: Board): Pos[] {
  const cs: Pos[] = [];
  const has = b.some(r => r.some(c => c !== EMPTY));
  if (!has) return [[7, 7]];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (b[r][c] !== EMPTY) continue;
    let near = false;
    for (let dr = -2; dr <= 2 && !near; dr++) for (let dc = -2; dc <= 2 && !near; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (ib(nr, nc) && b[nr][nc] !== EMPTY) near = true;
    }
    if (near) cs.push([r, c]);
  }
  return cs;
}

function ms(b: Board, r: number, c: number, ai: Stone): number {
  const hu = ai === WHITE ? BLACK : WHITE;
  b[r][c] = ai; const a = ep(b, r, c, ai);
  b[r][c] = hu; const d = ep(b, r, c, hu);
  b[r][c] = EMPTY; return a + d;
}

function bHash(b: Board): number {
  let h = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (b[r][c]) h = ((h * 3 + b[r][c]) * 31 + r * 15 + c) | 0;
  return h;
}

function getThreats(b: Board, p: Stone): Pos[] {
  const ts: Pos[] = [], op = p === WHITE ? BLACK : WHITE;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (b[r][c] !== EMPTY) continue;
    b[r][c] = p; let hit = false;
    for (const [dr, dc] of DIR) { const info = lineInfo(b, r, c, dr, dc, p); if (info.s >= 5 || (info.s === 4 && info.oe >= 1)) { hit = true; break; } }
    b[r][c] = EMPTY;
    if (hit) { ts.push([r, c]); continue; }
    b[r][c] = op;
    for (const [dr, dc] of DIR) { const info = lineInfo(b, r, c, dr, dc, op); if (info.s >= 5 || (info.s === 4 && info.oe >= 1)) { ts.push([r, c]); break; } }
    b[r][c] = EMPTY;
  }
  return ts;
}

function quiesce(b: Board, a: number, bt: number, mx: boolean, dl: number, nc: { count: number }, ai: Stone): number {
  nc.count++;
  if (chkWin(b, ai)) return SC.FIVE * 10;
  const hu = ai === WHITE ? BLACK : WHITE;
  if (chkWin(b, hu)) return -SC.FIVE * 10;
  const sp = evalBoard(b, ai);
  if (dl <= 0) return sp;
  if (mx) { if (sp >= bt) return sp; a = Math.max(a, sp); }
  else { if (sp <= a) return sp; bt = Math.min(bt, sp); }
  const p = mx ? ai : hu;
  const ts = getThreats(b, p);
  if (!ts.length) return sp;
  const sd = ts.map(([r, c]) => ({ r, c, s: ms(b, r, c, ai) })).sort((x, y) => y.s - x.s).slice(0, 8);
  if (mx) {
    let best = sp;
    for (const { r, c } of sd) { if (p === BLACK && forbidden(b, r, c)) continue; b[r][c] = p; const v = quiesce(b, a, bt, false, dl - 1, nc, ai); b[r][c] = EMPTY; best = Math.max(best, v); a = Math.max(a, v); if (a >= bt) break; }
    return best;
  } else {
    let best = sp;
    for (const { r, c } of sd) { if (p === BLACK && forbidden(b, r, c)) continue; b[r][c] = p; const v = quiesce(b, a, bt, true, dl - 1, nc, ai); b[r][c] = EMPTY; best = Math.min(best, v); bt = Math.min(bt, v); if (a >= bt) break; }
    return best;
  }
}

function mmx(b: Board, d: number, a: number, bt: number, mx: boolean, nc: { count: number }, cfg: DiffConfig, tt: Map<number, TTEntry>, kl: Record<number, Pos[]>, t0: number, ai: Stone): number {
  if (performance.now() - t0 > cfg.time) return evalBoard(b, ai);
  nc.count++;
  const hu = ai === WHITE ? BLACK : WHITE;
  if (chkWin(b, ai)) return SC.FIVE * 10;
  if (chkWin(b, hu)) return -SC.FIVE * 10;
  if (d <= 0) return cfg.thr > 0 ? quiesce(b, a, bt, mx, cfg.thr, nc, ai) : evalBoard(b, ai);
  const h = bHash(b);
  const te = tt.get(h);
  if (te && te.d >= d) { if (te.f === 0) return te.s; if (te.f === 1 && te.s >= bt) return te.s; if (te.f === 2 && te.s <= a) return te.s; }
  let cs = getCands(b);
  if (!cs.length) return 0;
  const ks = new Set((kl[d] || []).map(k => `${k[0]},${k[1]}`));
  cs.sort((x, y) => { const xk = ks.has(`${x[0]},${x[1]}`) ? 1e8 : 0; const yk = ks.has(`${y[0]},${y[1]}`) ? 1e8 : 0; return (yk + ms(b, y[0], y[1], ai)) - (xk + ms(b, x[0], x[1], ai)); });
  cs = cs.slice(0, cfg.maxC);
  const oa = a;
  if (mx) {
    let best = -Infinity;
    for (const [r, c] of cs) {
      if (ai === BLACK && forbidden(b, r, c)) continue;
      b[r][c] = ai; let ext = 0;
      for (const [dr, dc] of DIR) { const info = lineInfo(b, r, c, dr, dc, ai); if (info.s === 4 && info.oe >= 1) { ext = 1; break; } }
      const ev = mmx(b, d - 1 + ext, a, bt, false, nc, cfg, tt, kl, t0, ai); b[r][c] = EMPTY;
      best = Math.max(best, ev); a = Math.max(a, ev);
      if (bt <= a) { if (!kl[d]) kl[d] = []; kl[d].unshift([r, c]); if (kl[d].length > 2) kl[d].pop(); break; }
    }
    tt.set(h, { s: best, d, f: best <= oa ? 2 : best >= bt ? 1 : 0 }); return best;
  } else {
    let best = Infinity;
    for (const [r, c] of cs) {
      if (hu === BLACK && forbidden(b, r, c)) continue;
      b[r][c] = hu; let ext = 0;
      for (const [dr, dc] of DIR) { const info = lineInfo(b, r, c, dr, dc, hu); if (info.s === 4 && info.oe >= 1) { ext = 1; break; } }
      const ev = mmx(b, d - 1 + ext, a, bt, true, nc, cfg, tt, kl, t0, ai); b[r][c] = EMPTY;
      best = Math.min(best, ev); bt = Math.min(bt, ev);
      if (bt <= a) { if (!kl[d]) kl[d] = []; kl[d].unshift([r, c]); if (kl[d].length > 2) kl[d].pop(); break; }
    }
    tt.set(h, { s: best, d, f: best <= oa ? 2 : best >= bt ? 1 : 0 }); return best;
  }
}

export function findBest(b: Board, diff: DiffKey, ai: Stone): FindBestResult {
  const cfg = DIFF[diff]; const hu = ai === WHITE ? BLACK : WHITE;
  const cs = getCands(b); const t0 = performance.now();
  for (const [r, c] of cs) { if (ai === BLACK && forbidden(b, r, c)) continue; b[r][c] = ai; if (chkWin(b, ai)) { b[r][c] = EMPTY; return { move: [r, c], nodes: 1, depth: 1 }; } b[r][c] = EMPTY; }
  for (const [r, c] of cs) { if (hu === BLACK && forbidden(b, r, c)) continue; b[r][c] = hu; if (chkWin(b, hu)) { b[r][c] = EMPTY; return { move: [r, c], nodes: 1, depth: 1 }; } b[r][c] = EMPTY; }
  if (diff === "easy") {
    const sd = [...cs].sort((x, y) => ms(b, y[0], y[1], ai) - ms(b, x[0], x[1], ai));
    const top = sd.slice(0, 3);
    const pick = top[Math.floor(Math.random() * Math.min(2, top.length))];
    const tt = new Map<number, TTEntry>(), kl: Record<number, Pos[]> = {}, nc = { count: 0 };
    let bs = -Infinity, bm: Pos = pick;
    for (const [r, c] of sd.slice(0, cfg.maxC)) {
      if (ai === BLACK && forbidden(b, r, c)) continue;
      b[r][c] = ai; const s = mmx(b, 1, -Infinity, Infinity, false, nc, cfg, tt, kl, t0, ai); b[r][c] = EMPTY;
      if (s > bs) { bs = s; bm = [r, c]; }
    }
    return { move: bm, nodes: nc.count, depth: 2 };
  }
  const tt = new Map<number, TTEntry>(), kl: Record<number, Pos[]> = {}, nc = { count: 0 };
  let bm: Pos = cs[0], bs = -Infinity, rd = 1;
  const sd = [...cs].sort((x, y) => ms(b, y[0], y[1], ai) - ms(b, x[0], x[1], ai));
  for (let d = 2; d <= cfg.maxD; d += 2) {
    let dbs = -Infinity, dbm: Pos = bm, ok = true;
    for (const [r, c] of sd.slice(0, cfg.maxC)) {
      if (performance.now() - t0 > cfg.time * 0.8) { ok = false; break; }
      if (ai === BLACK && forbidden(b, r, c)) continue;
      b[r][c] = ai; const s = mmx(b, d - 1, -Infinity, Infinity, false, nc, cfg, tt, kl, t0, ai); b[r][c] = EMPTY;
      if (s > dbs) { dbs = s; dbm = [r, c]; }
      if (s >= SC.FIVE) return { move: dbm, nodes: nc.count, depth: d };
    }
    if (ok || dbs > bs) { bs = dbs; bm = dbm; rd = d; }
    const bi = sd.findIndex(([r, c]) => r === bm[0] && c === bm[1]);
    if (bi > 0) { const [x] = sd.splice(bi, 1); sd.unshift(x); }
    if (performance.now() - t0 > cfg.time * 0.6) break;
  }
  return { move: bm, nodes: nc.count, depth: rd };
}
