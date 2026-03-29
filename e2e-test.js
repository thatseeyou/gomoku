// E2E test script for gomoku - run with: playwright-cli run-code e2e-test.js
// Tests: lastMove marker count, stone counts, AI response

async function test(page) {
  // Navigate to game
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(500);

  // Click easy difficulty, then start
  await page.getByRole('button', { name: '🌱 초급' }).click();
  await page.getByRole('button', { name: '게 임 시 작' }).click();
  await page.waitForTimeout(300);

  const svg = page.locator('svg');
  const box = await svg.boundingBox();
  const scale = box.width / 560;

  function boardXY(r, c) {
    return {
      x: box.x + (28 + c * 36) * scale,
      y: box.y + (28 + r * 36) * scale,
    };
  }

  async function getCounts() {
    return page.evaluate(() => {
      const svg = document.querySelector('svg');
      const blacks = svg.querySelectorAll('circle[fill="url(#bs)"]').length;
      const whites = svg.querySelectorAll('circle[fill="url(#ws)"]').length;
      // lastMove markers: circle with r=4 and fill #e0e0e0 or #333
      const markerEls = svg.querySelectorAll('circle[r="4"]');
      const markers = Array.from(markerEls).filter(
        m => m.getAttribute('fill') === '#e0e0e0' || m.getAttribute('fill') === '#333'
      ).length;
      return { blacks, whites, markers };
    });
  }

  const results = [];
  const moves = [[7,7], [6,7], [5,7], [8,8], [9,9]];

  for (let i = 0; i < moves.length; i++) {
    const [r, c] = moves[i];
    const { x, y } = boardXY(r, c);
    await page.mouse.click(x, y);

    // Wait for AI response (thinking state to finish)
    await page.waitForTimeout(2000);

    const counts = await getCounts();
    const gameOverEl = await page.evaluate(() => {
      const spans = document.querySelectorAll('span');
      for (const s of spans) {
        if (s.textContent.includes('승리') || s.textContent.includes('AI 승리')) return s.textContent;
      }
      return null;
    });

    results.push({
      move: i + 1,
      placed: `(${r},${c})`,
      ...counts,
      gameOver: gameOverEl,
    });

    if (gameOverEl) break;
  }

  // Verify results
  let allPassed = true;
  for (const r of results) {
    const markerOk = r.gameOver ? true : r.markers === 1;
    const stoneOk = r.blacks === r.move && r.whites === r.move;
    const pass = markerOk && stoneOk;
    if (!pass) allPassed = false;
    console.log(
      `Move ${r.move} ${r.placed}: B=${r.blacks} W=${r.whites} markers=${r.markers} gameOver=${r.gameOver} ${pass ? 'PASS' : 'FAIL'}`
    );
    if (!markerOk) console.log(`  FAIL: Expected 1 marker, got ${r.markers}`);
    if (!stoneOk) console.log(`  FAIL: Expected B=${r.move} W=${r.move}, got B=${r.blacks} W=${r.whites}`);
  }

  console.log(allPassed ? '\n=== ALL TESTS PASSED ===' : '\n=== SOME TESTS FAILED ===');
  return JSON.stringify(results, null, 2);
}

return await test(page);
