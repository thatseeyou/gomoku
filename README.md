# 五目 - 오목 AI 대전

렌주 룰(Renju Rule)이 적용된 오목 게임입니다. AI와 대전할 수 있습니다.

## 기능

- **렌주 룰** — 흑돌 금수(3×3, 4×4, 장목) 자동 판정
- **4단계 AI 난이도** — 초급 / 중급 / 상급 / 최강
- **흑/백 선택** — 선공(흑) 또는 후공(백) 선택 가능
- **무르기** — 수를 되돌릴 수 있음
- **금수 표시** — 금수 위치를 보드에 표시
- **효과음** — 착수, 승리, 패배 사운드

## AI 엔진

- Minimax + Alpha-Beta Pruning
- 반복 심화 탐색 (Iterative Deepening)
- 위협 탐색 (Threat Space Search)
- 전치 테이블 (Transposition Table)
- Killer Heuristic

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 으로 접속합니다.

## 빌드

```bash
npm run build
```

`dist/` 폴더에 정적 파일이 생성됩니다.

## 테스트

```bash
npm test            # 1회 실행
npm run test:watch  # 감시 모드
npm run typecheck   # TypeScript 타입 검사
```

## GitHub Pages 배포

1. GitHub에 리포지토리를 push합니다.
2. Settings → Pages → Source를 **GitHub Actions**로 설정합니다.
3. `main` 브랜치에 push하면 자동으로 배포됩니다.

## 프로젝트 구조

```
src/
  engine.ts        — 게임 로직 (보드, AI, 렌주 룰, 승리 판정)
  Gomoku.tsx       — React UI 컴포넌트
  main.tsx         — 엔트리 포인트
  engine.test.ts   — 엔진 테스트 (Vitest)
```

## 브라우저 지원

Chrome, Safari, Firefox, Edge

## 기술 스택

- React 19 + TypeScript
- Vite
- Vitest (38 unit tests)
- SVG 렌더링
- Web Audio API (효과음)
