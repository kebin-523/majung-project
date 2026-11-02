// 티켓 출력 모션의 계획 계산 (public/js/ui/motion/ticketPrintPlan.js). DOM·시계 접근이 없는 순수 함수만 확인한다.
// 재생(playTicketPrint)은 브라우저에서 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_FADE_IN_MS,
  EDGE_HEIGHT_PX,
  FADE_OUT_MS,
  FULL_MOTION_ONLY_FIRST,
  KEEP_SLOT_VISIBLE,
  MAX_PRINT_MS,
  MIN_PRINT_MS,
  PRINT_SPEED_VH_PER_S,
  READY_MAX_WAIT_MS,
  SHORT_FADE_OUT_MS,
  SHORT_PRINT_MS,
  SLOT_FADE_OUT_MS,
  SLOT_PAUSE_MS,
  computePrintMs,
  hasPrinted,
  markPrinted,
  planFadeOut,
  planTicketPrint,
} from '../public/js/ui/motion/ticketPrintPlan.js';

const VH = 844; // 기준 뷰포트 높이

const memoryStorage = () => {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
};
const brokenStorage = () => ({
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('blocked'); },
});

test('기본값: 페이드 아웃 300ms, 슬롯 정지 400ms, 속도 뷰포트 높이의 초당 55%, 출력 1800~2800ms, 슬롯 사라짐 200ms', () => {
  assert.equal(FADE_OUT_MS, 300);
  assert.equal(SLOT_PAUSE_MS, 400);
  assert.equal(PRINT_SPEED_VH_PER_S, 55);
  assert.equal(MIN_PRINT_MS, 1800);
  assert.equal(MAX_PRINT_MS, 2800);
  assert.equal(SLOT_FADE_OUT_MS, 200);
  assert.equal(EDGE_HEIGHT_PX, 10); // 종이 끝 그림자 두께
  assert.ok(ACTION_FADE_IN_MS > 0);
  assert.equal(FULL_MOTION_ONLY_FIRST, true);
  assert.equal(SHORT_PRINT_MS, 600);
});

test('슬롯은 출력이 끝난 뒤에도 계속 보인다 (KEEP_SLOT_VISIBLE)', () => {
  assert.equal(KEEP_SLOT_VISIBLE, true);
  assert.equal(planTicketPrint({ heightPx: 977, viewportHeightPx: VH }).keepSlot, true); // 풀 모션
  assert.equal(planTicketPrint({ heightPx: 977, viewportHeightPx: VH, hasPrinted: true }).keepSlot, true); // 짧은 모션
});

test('keepSlot 옵션을 끄면 슬롯이 출력 뒤에 사라진다 (페이드 아웃 시간이 있다)', () => {
  const plan = planTicketPrint({ heightPx: 977, viewportHeightPx: VH, keepSlot: false });
  assert.equal(plan.keepSlot, false);
  assert.ok(plan.slotFadeOutMs > 0);
});

test('computePrintMs: 출력 시간 = 티켓 높이 ÷ (뷰포트 높이 × 0.55) 초. 844px 화면에서 화면 한 높이를 지나는 데 약 1.8초', () => {
  assert.equal(computePrintMs(844, 844), 1818);
  assert.equal(computePrintMs(977, 844), 2105); // 지금 결과 카드(390px 화면)
  assert.equal(computePrintMs(1000, 844), 2154);
});

test('computePrintMs: 속도가 뷰포트 높이 기준이라 화면이 달라도 "화면 한 높이"를 지나는 시간이 같다', () => {
  assert.equal(computePrintMs(800, 800), computePrintMs(844, 844));
  assert.equal(computePrintMs(700, 700), computePrintMs(844, 844));
  assert.ok(computePrintMs(1000, 700) > computePrintMs(1000, 900)); // 같은 티켓은 낮은 화면에서 더 느리다
});

test('computePrintMs: 결과는 MIN_PRINT_MS~MAX_PRINT_MS 로 clamp 한다', () => {
  assert.equal(computePrintMs(300, VH), MIN_PRINT_MS); // 계산값 646ms → 1800ms
  assert.equal(computePrintMs(1688, VH), MAX_PRINT_MS); // 계산값 3636ms → 2800ms
  assert.equal(computePrintMs(2000, VH), MAX_PRINT_MS);
  assert.equal(computePrintMs(844, 844, 100), MIN_PRINT_MS); // 속도를 올려도 하한 아래로 내려가지 않는다
  assert.equal(computePrintMs(844, 844, 55, { minMs: 1000, maxMs: 5000 }), 1818); // 범위를 바꿀 수 있다
});

test('computePrintMs: 속도 옵션이 반영된다 (낮추면 느려진다)', () => {
  assert.equal(computePrintMs(844, 844, 40), 2500);
  assert.ok(computePrintMs(844, 844, 40) > computePrintMs(844, 844, 55));
});

test('computePrintMs: 높이·뷰포트·속도가 쓸 수 없는 값이면 0 (clamp 하지 않는다 — 조용히 이상한 시간을 만들지 않는다)', () => {
  for (const bad of [0, -10, Number.NaN, undefined, null, Infinity]) {
    assert.equal(computePrintMs(bad, VH), 0, `높이 ${String(bad)}`);
    assert.equal(computePrintMs(900, bad), 0, `뷰포트 ${String(bad)}`);
  }
  assert.equal(computePrintMs(900, VH, 0), 0);
  assert.equal(computePrintMs(900, VH, -55), 0);
});

test('planTicketPrint: 움직임 줄이기가 켜져 있으면 모션 없이 바로 보여 준다 (skip)', () => {
  assert.deepEqual(planTicketPrint({ heightPx: 900, viewportHeightPx: VH, reducedMotion: true }), { skip: true });
  assert.deepEqual(planTicketPrint({ heightPx: 900, viewportHeightPx: VH, reducedMotion: true, mode: 'full' }), { skip: true }); // 모드를 강제해도 지킨다
});

test('planTicketPrint: 첫 방문은 풀 모션 — 슬롯 400ms 정지 후 높이에 비례한 시간으로 출력하고 슬롯은 200ms에 사라진다', () => {
  const plan = planTicketPrint({ heightPx: 977, viewportHeightPx: VH, hasPrinted: false });
  assert.equal(plan.skip, false);
  assert.equal(plan.kind, 'full');
  assert.equal(plan.slotPauseMs, 400);
  assert.equal(plan.printMs, 2105);
  assert.equal(plan.fadeOutMs, FADE_OUT_MS);
  assert.equal(plan.slotFadeOutMs, 200);
  assert.ok(plan.actionsFadeInMs > 0 && plan.slotFadeInMs > 0);
  assert.equal(planTicketPrint({ heightPx: 1688, viewportHeightPx: VH }).printMs, MAX_PRINT_MS);
  assert.equal(planTicketPrint({ heightPx: 300, viewportHeightPx: VH }).printMs, MIN_PRINT_MS);
});

test('planTicketPrint: 이미 본 뒤에는 짧게 — 슬롯 정지 없이 600ms (높이와 상관없이 고정)', () => {
  const short = planTicketPrint({ heightPx: 960, viewportHeightPx: VH, hasPrinted: true });
  assert.equal(short.kind, 'short');
  assert.equal(short.printMs, SHORT_PRINT_MS);
  assert.equal(short.slotPauseMs, 0);
  assert.equal(short.fadeOutMs, SHORT_FADE_OUT_MS);
  assert.equal(planTicketPrint({ heightPx: 300, viewportHeightPx: VH, hasPrinted: true }).printMs, SHORT_PRINT_MS);
  assert.ok(short.fadeOutMs < FADE_OUT_MS);
});

test('planTicketPrint: "첫 방문에만 풀 모션" 옵션을 끄면 항상 풀 모션이다', () => {
  const always = planTicketPrint({ heightPx: 977, viewportHeightPx: VH, hasPrinted: true, fullOnlyFirst: false });
  assert.equal(always.kind, 'full');
  assert.equal(always.printMs, 2105);
});

test('planTicketPrint: mode 로 풀/짧게를 강제할 수 있다 ("다시 보기"에서 쓴다)', () => {
  assert.equal(planTicketPrint({ heightPx: 977, viewportHeightPx: VH, hasPrinted: true, mode: 'full' }).kind, 'full');
  assert.equal(planTicketPrint({ heightPx: 977, viewportHeightPx: VH, hasPrinted: false, mode: 'short' }).kind, 'short');
  assert.equal(planTicketPrint({ heightPx: 1688, viewportHeightPx: VH, hasPrinted: true, mode: 'short' }).printMs, SHORT_PRINT_MS); // 짧은 모션은 clamp 와 상관없이 600ms
  assert.throws(() => planTicketPrint({ heightPx: 977, viewportHeightPx: VH, mode: 'slow' }), RangeError);
});

test('planTicketPrint: 속도 옵션(뷰포트 높이 대비 초당 비율)이 출력 시간에 반영된다', () => {
  assert.equal(planTicketPrint({ heightPx: 844, viewportHeightPx: 844, vhPerS: 40 }).printMs, 2500);
  assert.equal(planTicketPrint({ heightPx: 844, viewportHeightPx: 844, vhPerS: 100 }).printMs, MIN_PRINT_MS);
});

test('planTicketPrint: 높이나 뷰포트 높이를 알 수 없으면 모션 없이 바로 보여 준다', () => {
  assert.deepEqual(planTicketPrint({ heightPx: 0, viewportHeightPx: VH }), { skip: true });
  assert.deepEqual(planTicketPrint({ heightPx: Number.NaN, viewportHeightPx: VH }), { skip: true });
  assert.deepEqual(planTicketPrint({ heightPx: 900, viewportHeightPx: 0 }), { skip: true });
  assert.deepEqual(planTicketPrint({ heightPx: 900 }), { skip: true });
});

test('planFadeOut: 이전 화면 페이드 아웃 시간 — 풀 300ms, 짧게 150ms, 움직임 줄이기는 0', () => {
  assert.equal(planFadeOut({ hasPrinted: false }), FADE_OUT_MS);
  assert.equal(planFadeOut({ hasPrinted: true }), SHORT_FADE_OUT_MS);
  assert.equal(planFadeOut({ hasPrinted: true, fullOnlyFirst: false }), FADE_OUT_MS);
  assert.equal(planFadeOut({ reducedMotion: true }), 0);
  assert.equal(planFadeOut({ hasPrinted: true, mode: 'full' }), FADE_OUT_MS);
});

test('데이터를 기다리는 시간에는 상한이 있다 (끝없이 슬롯에서 기다리지 않는다)', () => {
  assert.ok(READY_MAX_WAIT_MS > 0 && READY_MAX_WAIT_MS <= 3000);
});

test('hasPrinted/markPrinted: 탭 세션 안에서 한 번 본 것을 기억한다', () => {
  const storage = memoryStorage();
  assert.equal(hasPrinted(storage), false);
  markPrinted(storage);
  assert.equal(hasPrinted(storage), true);
});

test('hasPrinted/markPrinted: 저장소를 못 쓰는 환경에서도 던지지 않고 "처음"으로 본다', () => {
  assert.equal(hasPrinted(brokenStorage()), false);
  assert.doesNotThrow(() => markPrinted(brokenStorage()));
  assert.equal(hasPrinted(null), false);
  assert.doesNotThrow(() => markPrinted(null));
});
