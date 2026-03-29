import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import {
  N, EMPTY, BLACK, WHITE,
  type Board, type Stone, type Pos, type DiffKey, type ForbiddenReason,
  createBoard, forbidden, allForbidden, chkWin, winStones, findBest, DIFF,
} from "./engine";

declare global {
  interface Window { webkitAudioContext: typeof AudioContext; }
}

// ── SOUND ──
function useSound() {
  const ac = useRef<AudioContext | null>(null);
  const cx = (): AudioContext => { if (!ac.current) ac.current = new (window.AudioContext || window.webkitAudioContext)(); return ac.current; };
  const playPlace = useCallback(() => { try { const c = cx(), o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.setValueAtTime(800, c.currentTime); o.frequency.exponentialRampToValueAtTime(400, c.currentTime + 0.08); g.gain.setValueAtTime(0.15, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1); o.start(c.currentTime); o.stop(c.currentTime + 0.1); } catch (_) { /* no audio */ } }, []);
  const playForbidden = useCallback(() => { try { const c = cx(), o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.type = "square"; o.frequency.setValueAtTime(200, c.currentTime); g.gain.setValueAtTime(0.1, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2); o.start(c.currentTime); o.stop(c.currentTime + 0.2); } catch (_) { /* no audio */ } }, []);
  const playWin = useCallback(() => { try { const c = cx(); [523, 659, 784, 1047].forEach((f, i) => { const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.setValueAtTime(f, c.currentTime + i * 0.15); g.gain.setValueAtTime(0.12, c.currentTime + i * 0.15); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.15 + 0.3); o.start(c.currentTime + i * 0.15); o.stop(c.currentTime + i * 0.15 + 0.3); }); } catch (_) { /* no audio */ } }, []);
  const playLose = useCallback(() => { try { const c = cx(); [400, 350, 300, 250].forEach((f, i) => { const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.type = "sawtooth"; o.frequency.setValueAtTime(f, c.currentTime + i * 0.2); g.gain.setValueAtTime(0.08, c.currentTime + i * 0.2); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.2 + 0.3); o.start(c.currentTime + i * 0.2); o.stop(c.currentTime + i * 0.2 + 0.3); }); } catch (_) { /* no audio */ } }, []);
  return { playPlace, playForbidden, playWin, playLose };
}

// ── UI mappings ──
const FL: Record<ForbiddenReason, string> = { "33": "3×3", "44": "4×4", overline: "장목" };
const FC: Record<ForbiddenReason, string> = { "33": "#f59e0b", "44": "#ef4444", overline: "#a855f7" };

interface HistoryEntry { board: Board; lastMove: Pos | null; moveCount: number; curTurn: Stone; }

export default function Gomoku() {
  const [board, setBoard] = useState<Board>(createBoard);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [gameOver, setGameOver] = useState<"black" | "white" | "draw" | null>(null);
  const [thinking, setThinking] = useState(false);
  const [lastMove, setLastMove] = useState<Pos | null>(null);
  const [wStones, setWStones] = useState<Pos[]>([]);
  const [stats, setStats] = useState({ nodes: 0, depth: 0, time: 0 });
  const [moveCount, setMoveCount] = useState(0);
  const [hoverPos, setHoverPos] = useState<Pos | null>(null);
  const [showForbid, setShowForbid] = useState(true);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffKey>("medium");
  const [playerColor, setPlayerColor] = useState<Stone>(BLACK);
  const [curTurn, setCurTurn] = useState<Stone>(BLACK);
  const [started, setStarted] = useState(false);
  const alertT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { playPlace, playForbidden, playWin, playLose } = useSound();

  const aiColor: Stone = playerColor === BLACK ? WHITE : BLACK;
  const isMyTurn = curTurn === playerColor;
  const cs = 36, pd = 28;
  const bpx = cs * (N - 1) + pd * 2;
  const cfg = DIFF[diff];

  const fMap = useMemo(() => {
    if (gameOver || thinking || curTurn !== BLACK) return new Map<string, ForbiddenReason>();
    return allForbidden(board);
  }, [board, gameOver, thinking, curTurn]);

  const showAlert = useCallback((msg: string) => {
    if (alertT.current) clearTimeout(alertT.current);
    setAlertMsg(msg);
    alertT.current = setTimeout(() => setAlertMsg(null), 2000);
  }, []);

  const doAi = useCallback((brd: Board) => {
    setThinking(true);
    setTimeout(() => {
      const t = performance.now();
      const { move, nodes, depth } = findBest(brd, diff, aiColor);
      const el = performance.now() - t;
      if (move) {
        brd[move[0]][move[1]] = aiColor; playPlace();
        setBoard(brd.map(r => [...r]) as Board); setLastMove(move); setMoveCount(m => m + 1);
        setStats({ nodes, depth, time: Math.round(el) });
        setCurTurn(aiColor === BLACK ? WHITE : BLACK);
        if (chkWin(brd, aiColor)) { setGameOver(aiColor === BLACK ? "black" : "white"); setWStones(winStones(brd, aiColor)); playLose(); }
        else if (brd.flat().every(c => c !== EMPTY)) setGameOver("draw");
      }
      setThinking(false);
    }, 50);
  }, [diff, aiColor, playPlace, playLose]);

  useEffect(() => {
    if (started && playerColor === WHITE && curTurn === BLACK && !gameOver && !thinking && moveCount === 0) {
      doAi(board.map(r => [...r]) as Board);
    }
  }, [started, playerColor, curTurn, gameOver, thinking, moveCount, board, doAi]);

  const handleClick = useCallback((r: number, c: number) => {
    if (gameOver || thinking || board[r][c] !== EMPTY || !isMyTurn) return;
    if (playerColor === BLACK) { const re = fMap.get(`${r},${c}`); if (re) { playForbidden(); showAlert(`🚫 금수! (${FL[re]})`); return; } }
    playPlace();
    const nb = board.map(row => [...row]) as Board; nb[r][c] = playerColor;
    setBoard(nb); setLastMove([r, c]); setMoveCount(m => m + 1);
    setHistory(h => [...h, { board: board.map(row => [...row]) as Board, lastMove, moveCount, curTurn }]);
    const nt: Stone = playerColor === BLACK ? WHITE : BLACK; setCurTurn(nt);
    if (chkWin(nb, playerColor)) { setGameOver(playerColor === BLACK ? "black" : "white"); setWStones(winStones(nb, playerColor)); playWin(); return; }
    if (nb.flat().every(c => c !== EMPTY)) { setGameOver("draw"); return; }
    doAi(nb.map(row => [...row]) as Board);
  }, [board, gameOver, thinking, isMyTurn, playerColor, lastMove, moveCount, curTurn, fMap, playPlace, playForbidden, playWin, showAlert, doAi]);

  const undo = useCallback(() => {
    if (!history.length || thinking) return;
    const p = history[history.length - 1];
    setBoard(p.board); setLastMove(p.lastMove); setMoveCount(p.moveCount); setCurTurn(p.curTurn);
    setHistory(h => h.slice(0, -1)); setGameOver(null); setWStones([]); setAlertMsg(null);
  }, [history, thinking]);

  const reset = useCallback(() => {
    setBoard(createBoard()); setHistory([]); setGameOver(null); setThinking(false);
    setLastMove(null); setWStones([]); setStats({ nodes: 0, depth: 0, time: 0 });
    setMoveCount(0); setHoverPos(null); setAlertMsg(null); setCurTurn(BLACK); setStarted(false);
  }, []);

  const start = useCallback((col: Stone) => { reset(); setTimeout(() => { setPlayerColor(col); setStarted(true); }, 10); }, [reset]);

  const isW = (r: number, c: number) => wStones.some(([wr, wc]) => wr === r && wc === c);
  const starDots: Pos[] = [];
  for (const r of [3, 7, 11]) for (const c of [3, 7, 11]) starDots.push([r, c]);
  const hF = hoverPos && curTurn === BLACK ? fMap.get(`${hoverPos[0]},${hoverPos[1]}`) : null;
  const btn: React.CSSProperties = { padding: "8px 16px", borderRadius: "20px", fontSize: "13px", fontWeight: 600, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)", cursor: "pointer", transition: "all 0.2s" };

  // ── SETUP SCREEN ──
  if (!started) { return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Sans KR','Pretendard',sans-serif", background: "linear-gradient(145deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)", color: "#e0e0e0", padding: "24px", gap: "20px" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap" rel="stylesheet" />
      <h1 style={{ fontSize: "40px", fontWeight: 900, margin: 0, background: "linear-gradient(135deg,#e2c391,#f5deb3,#d4a853)", backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", letterSpacing: "10px" }}>五 目</h1>
      <p style={{ fontSize: "12px", color: "#8892a4", letterSpacing: "4px", margin: 0 }}>RENJU RULE — AI CHALLENGE</p>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", marginTop: "8px" }}>
        <p style={{ fontSize: "14px", color: "#93c5fd", fontWeight: 700, margin: 0 }}>돌 색상 선택</p>
        <div style={{ display: "flex", gap: "16px" }}>
          {([{ col: BLACK, label: "흑돌 (선공)", icon: "●", note: "금수 규칙 적용", bc: "#e0e0e0" }, { col: WHITE, label: "백돌 (후공)", icon: "○", note: "금수 규칙 없음", bc: "#93c5fd" }] as const).map(o => (
            <button key={o.col} onClick={() => setPlayerColor(o.col)} style={{ padding: "20px 24px", borderRadius: "16px", cursor: "pointer", border: `2px solid ${playerColor === o.col ? o.bc : "rgba(255,255,255,0.1)"}`, background: playerColor === o.col ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)", color: "#e0e0e0", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", transition: "all 0.2s", minWidth: "120px" }}>
              <span style={{ fontSize: "40px", lineHeight: 1 }}>{o.icon}</span>
              <span style={{ fontSize: "14px", fontWeight: 700 }}>{o.label}</span>
              <span style={{ fontSize: "10px", color: "#8892a4" }}>{o.note}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
        <p style={{ fontSize: "14px", color: "#93c5fd", fontWeight: 700, margin: 0 }}>AI 난이도</p>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
          {(Object.entries(DIFF) as [DiffKey, typeof cfg][]).map(([k, v]) => { const a = diff === k; return (
            <button key={k} onClick={() => setDiff(k)} style={{ ...btn, fontSize: "12px", padding: "8px 16px", background: a ? `${v.color}22` : "rgba(255,255,255,0.05)", border: `1.5px solid ${a ? v.color : "rgba(255,255,255,0.1)"}`, color: a ? v.color : "#6b7280" }}>{v.emoji} {v.label}</button>
          ); })}
        </div>
        <p style={{ fontSize: "10px", color: cfg.color, opacity: 0.7, margin: 0 }}>{cfg.desc} · 제한 {(cfg.time / 1000).toFixed(1)}초</p>
      </div>

      <button onClick={() => start(playerColor)} style={{ padding: "14px 48px", borderRadius: "28px", fontSize: "16px", fontWeight: 900, background: "linear-gradient(135deg,#e2c391,#d4a853)", color: "#1a1a2e", border: "none", cursor: "pointer", boxShadow: "0 4px 20px rgba(212,168,83,0.3)", letterSpacing: "4px", transition: "all 0.2s" }}>게 임 시 작</button>
      <style>{`button:hover{transform:translateY(-2px);filter:brightness(1.1);}`}</style>
    </div>
  ); }

  // ── GAME SCREEN ──
  const stColor = gameOver ? (gameOver === (playerColor === BLACK ? "black" : "white") ? "#4ade80" : gameOver === "draw" ? "#fbbf24" : "#f87171") : thinking ? "#a78bfa" : "#93c5fd";
  const stText = gameOver ? (gameOver === (playerColor === BLACK ? "black" : "white") ? "🎉 승리!" : gameOver === "draw" ? "무승부" : "😤 AI 승리") : thinking ? `AI 계산 중... (${cfg.label})` : `${curTurn === BLACK ? "● 흑돌" : "○ 백돌"} 차례 ${isMyTurn ? "(당신)" : "(AI)"}`;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Noto Sans KR','Pretendard',sans-serif", background: "linear-gradient(145deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)", color: "#e0e0e0", padding: "12px", gap: "8px" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap" rel="stylesheet" />
      <h1 style={{ fontSize: "24px", fontWeight: 900, margin: 0, background: "linear-gradient(135deg,#e2c391,#d4a853)", backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", letterSpacing: "6px" }}>五 目</h1>

      <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: "#8892a4", flexWrap: "wrap", justifyContent: "center" }}>
        <span>당신: {playerColor === BLACK ? "● 흑 (선공)" : "○ 백 (후공)"}</span>
        <span>AI: {aiColor === BLACK ? "● 흑" : "○ 백"} {cfg.emoji}{cfg.label}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 20px", borderRadius: "40px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", fontSize: "13px" }}>
        {thinking && <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⚙️</span>}
        <span style={{ fontWeight: 700, color: stColor }}>{stText}</span>
      </div>

      {alertMsg && <div style={{ padding: "8px 20px", borderRadius: "8px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5", fontSize: "13px", fontWeight: 600, animation: "shakeX 0.4s ease" }}>{alertMsg}</div>}

      <svg width={bpx} height={bpx} viewBox={`0 0 ${bpx} ${bpx}`} style={{ borderRadius: "8px", boxShadow: "0 16px 48px rgba(0,0,0,0.5)", cursor: gameOver || thinking || !isMyTurn ? "default" : "pointer" }}>
        <defs>
          <radialGradient id="bg" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#d4a24e" /><stop offset="100%" stopColor="#b8862d" /></radialGradient>
          <filter id="ss"><feDropShadow dx="1" dy="2" stdDeviation="2" floodOpacity="0.4" /></filter>
          <radialGradient id="bs" cx="35%" cy="30%"><stop offset="0%" stopColor="#555" /><stop offset="100%" stopColor="#111" /></radialGradient>
          <radialGradient id="ws" cx="35%" cy="30%"><stop offset="0%" stopColor="#fff" /><stop offset="100%" stopColor="#ccc" /></radialGradient>
          <filter id="wg"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <rect width={bpx} height={bpx} fill="url(#bg)" rx="8" />
        {Array.from({ length: 20 }).map((_, i) => <line key={`t${i}`} x1={0} y1={pd + i * 26} x2={bpx} y2={pd + i * 26 + 4} stroke="rgba(139,90,43,0.12)" strokeWidth={1.2} />)}
        {Array.from({ length: N }).map((_, i) => <g key={`g${i}`}><line x1={pd} y1={pd + i * cs} x2={pd + 14 * cs} y2={pd + i * cs} stroke="rgba(0,0,0,0.4)" strokeWidth={i === 0 || i === 14 ? 1.5 : 0.8} /><line x1={pd + i * cs} y1={pd} x2={pd + i * cs} y2={pd + 14 * cs} stroke="rgba(0,0,0,0.4)" strokeWidth={i === 0 || i === 14 ? 1.5 : 0.8} /></g>)}
        {starDots.map(([r, c]) => <circle key={`d${r}${c}`} cx={pd + c * cs} cy={pd + r * cs} r={3} fill="rgba(0,0,0,0.5)" />)}
        {Array.from({ length: N }).map((_, i) => <g key={`l${i}`}><text x={pd + i * cs} y={14} textAnchor="middle" fontSize="9" fill="rgba(0,0,0,0.35)" fontWeight="bold">{String.fromCharCode(65 + i)}</text><text x={10} y={pd + i * cs + 3.5} textAnchor="middle" fontSize="9" fill="rgba(0,0,0,0.35)" fontWeight="bold">{15 - i}</text></g>)}

        {showForbid && !gameOver && !thinking && curTurn === BLACK && isMyTurn && Array.from(fMap.entries()).map(([k, re]) => { const [r, c] = k.split(",").map(Number); const cl = FC[re]; return (<g key={`f${k}`}><line x1={pd + c * cs - 5} y1={pd + r * cs - 5} x2={pd + c * cs + 5} y2={pd + r * cs + 5} stroke={cl} strokeWidth="2" opacity="0.7" strokeLinecap="round" /><line x1={pd + c * cs + 5} y1={pd + r * cs - 5} x2={pd + c * cs - 5} y2={pd + r * cs + 5} stroke={cl} strokeWidth="2" opacity="0.7" strokeLinecap="round" /><text x={pd + c * cs} y={pd + r * cs - 10} textAnchor="middle" fontSize="7" fill={cl} fontWeight="bold" opacity="0.8">{FL[re]}</text></g>); })}

        {hoverPos && !gameOver && !thinking && isMyTurn && board[hoverPos[0]][hoverPos[1]] === EMPTY && (
          <circle cx={pd + hoverPos[1] * cs} cy={pd + hoverPos[0] * cs} r={cs / 2 - 3} fill={hF && playerColor === BLACK ? "rgba(239,68,68,0.15)" : "rgba(0,0,0,0.15)"} stroke={hF && playerColor === BLACK ? "rgba(239,68,68,0.4)" : "rgba(0,0,0,0.2)"} strokeWidth="1.5" />
        )}

        {board.map((row, r) => row.map((cell, c) => { if (cell === EMPTY) return null; const iw = isW(r, c); return (<g key={`s${r}${c}`} filter={iw ? "url(#wg)" : "url(#ss)"}><circle cx={pd + c * cs} cy={pd + r * cs} r={cs / 2 - 2} fill={cell === BLACK ? "url(#bs)" : "url(#ws)"} stroke={iw ? (cell === BLACK ? "#4ade80" : "#f87171") : "none"} strokeWidth={iw ? 2.5 : 0}>{iw && <animate attributeName="stroke-opacity" values="1;0.4;1" dur="1.2s" repeatCount="indefinite" />}</circle></g>); }))}

        {lastMove && !wStones.length && board[lastMove[0]][lastMove[1]] !== EMPTY && (
          <circle cx={pd + lastMove[1] * cs} cy={pd + lastMove[0] * cs} r={4} fill={board[lastMove[0]][lastMove[1]] === BLACK ? "#e0e0e0" : "#333"} opacity="0.7" />
        )}

        {board.map((row, r) => row.map((_, c) => <rect key={`z${r}${c}`} x={pd + c * cs - cs / 2} y={pd + r * cs - cs / 2} width={cs} height={cs} fill="transparent" onClick={() => handleClick(r, c)} onMouseEnter={() => setHoverPos([r, c])} onMouseLeave={() => setHoverPos(null)} />))}
      </svg>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
        <button onClick={undo} disabled={!history.length || thinking} style={{ ...btn, color: !history.length || thinking ? "#555" : "#c4b5fd", cursor: !history.length || thinking ? "not-allowed" : "pointer" }}>↩ 무르기</button>
        <button onClick={reset} style={{ ...btn, color: "#93c5fd" }}>↻ 새 게임</button>
        {playerColor === BLACK && <button onClick={() => setShowForbid(v => !v)} style={{ ...btn, border: `1px solid ${showForbid ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.15)"}`, background: showForbid ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.08)", color: showForbid ? "#fbbf24" : "#6b7280" }}>{showForbid ? "🚫 금수 ON" : "🚫 금수 OFF"}</button>}
      </div>

      {showForbid && playerColor === BLACK && !gameOver && fMap.size > 0 && (
        <div style={{ display: "flex", gap: "14px", fontSize: "11px", padding: "5px 14px", borderRadius: "16px", background: "rgba(255,255,255,0.03)" }}>
          {(["33", "44", "overline"] as ForbiddenReason[]).map(k => { const l = FL[k]; const n = Array.from(fMap.values()).filter(v => v === k).length; return n ? <span key={k} style={{ color: FC[k] }}>✕ {l}: <b>{n}</b></span> : null; })}
        </div>
      )}

      {stats.nodes > 0 && (
        <div style={{ display: "flex", gap: "14px", fontSize: "11px", color: "#6b7280", padding: "5px 14px", borderRadius: "16px", background: "rgba(255,255,255,0.03)", flexWrap: "wrap", justifyContent: "center" }}>
          <span>깊이: <b style={{ color: "#a78bfa" }}>{stats.depth}</b></span>
          <span>노드: <b style={{ color: "#a78bfa" }}>{stats.nodes.toLocaleString()}</b></span>
          <span>시간: <b style={{ color: "#a78bfa" }}>{stats.time}ms</b></span>
        </div>
      )}

      <div style={{ fontSize: "10px", color: "#4b5563", textAlign: "center" }}>렌주 룰 (흑돌 금수) | 반복 심화 + 위협 탐색 + TT + Killer</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg);}}@keyframes shakeX{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(2px)}}button:hover:not(:disabled){background:rgba(255,255,255,0.14)!important;transform:translateY(-1px);}`}</style>
    </div>
  );
}
