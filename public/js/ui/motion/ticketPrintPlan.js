// 티켓 출력 모션의 값과 계획 계산. DOM·시계 접근이 없다. (재생은 ticketPrint.js)
//
// 모션 시퀀스 (참고 영상 60fps 분석값, 시간은 근사값):
//   1. 이전 화면(입력/로딩)에서 넘어올 때만 이전 내용 페이드 아웃  300ms
//   2. 위쪽 슬롯(검은 둥근 막대)만 남기고 정지                     400ms
//   3. 출력: clip-path 로 위에서 아래로 드러냄, linear              1800~2800ms (뷰포트 높이 기준 초당 55%)
//   4. 출력이 끝나면 하단 액션을 페이드 인. 슬롯은 계속 보인다 (KEEP_SLOT_VISIBLE)
// 아래 값을 고치면 모션이 바뀐다. 이 파일이 값의 단일 출처다.

// ───────── 속도 조절: 아래 값이 모션의 빠르기를 정한다 ─────────
export const FADE_OUT_MS = 300; // 1. 이전 화면 페이드 아웃. ↑ 올리면 이전 화면이 더 천천히 사라진다
export const SLOT_PAUSE_MS = 400; // 2. 슬롯만 남기고 정지(기대감 구간). ↑ 올리면 출력 시작이 늦어진다

// 3. 출력 시간 = 티켓 높이 ÷ (뷰포트 높이 × PRINT_SPEED_VH_PER_S ÷ 100) 초, 결과를 MIN_PRINT_MS ~ MAX_PRINT_MS 로 clamp 한다.
//    속도를 뷰포트 높이에 대한 비율로 정해, 화면이 달라도 "화면 한 높이를 지나가는 시간"이 같다. (844px 화면: 한 높이에 약 1.8초)
//    이징은 항상 linear 다. (clamp 에 걸려도 출력 도중에 속도가 변하지 않는다. 걸린 티켓은 평균 속도만 달라진다)
export const PRINT_SPEED_VH_PER_S = 55; // ↓ 낮추면 느려진다 (뷰포트 높이의 초당 몇 %를 드러내는가). ↑ 올리면 빨라진다
export const MIN_PRINT_MS = 1800; // ↑ 올리면 짧은 티켓도 더 느려진다. (계산값이 이보다 짧으면 이 값으로 늘린다)
export const MAX_PRINT_MS = 2800; // ↑ 올리면 긴 티켓이 더 느려진다. ↓ 내리면 빨라진다. (계산값이 이보다 길면 이 값으로 줄인다)
//    예) 844px 화면에서 390px 폭 결과 카드(약 977px)는 977 ÷ (844 × 0.55) = 약 2.1초라 clamp 범위 안이다.

// ───────── 슬롯 ─────────
export const KEEP_SLOT_VISIBLE = true; // true: 출력이 끝난 뒤에도 슬롯이 계속 보인다 (움직임 줄이기·짧은 모션도 같다). false: 출력 뒤 SLOT_FADE_OUT_MS 동안 사라진다

// ───────── 종이 끝 그림자 ─────────
export const EDGE_HEIGHT_PX = 10; // 드러나는 아래 끝에 붙는 그라데이션 줄의 두께. ↑ 올리면 그림자가 더 넓게 번진다 (CSS 변수 --edge-height 와 같아야 한다)

// ───────── 측정하지 못한 값: 모두 추정값 ─────────
export const SLOT_FADE_IN_MS = 150; // 추정값: 슬롯이 나타나는 시간
export const SLOT_FADE_OUT_MS = 200; // KEEP_SLOT_VISIBLE 이 false 일 때만 쓴다: 출력이 끝난 뒤 슬롯이 사라지는 시간 (사용자 요청 200ms)
export const ACTION_FADE_IN_MS = 300; // 추정값: 하단 액션이 나타나는 시간
export const FADE_EASE = 'ease-in-out'; // 추정값: 페이드 곡선 (출력 자체는 linear)
export const READY_MAX_WAIT_MS = 1500; // 추정값: 데이터가 늦을 때 슬롯에서 기다리는 최대 시간. 넘으면 있는 값으로 출력한다. ↑ 올리면 느린 네트워크에서 슬롯 대기가 길어진다
export const ASSET_MAX_WAIT_MS = 1000; // 추정값: 폰트·이미지가 준비되기를 기다리는 최대 시간. 넘으면 그대로 출력한다 (끝없이 기다리지 않는다)

// ───────── 첫 방문 / 이후 ─────────
export const FULL_MOTION_ONLY_FIRST = true; // true: 첫 방문(탭 세션에서 처음)에만 풀 모션, 이후에는 짧게. false: 항상 풀 모션
export const SHORT_PRINT_MS = 600; // 짧은 모션의 출력 시간(높이와 상관없이 고정)
export const SHORT_FADE_OUT_MS = 150; // 추정값: 짧은 모션의 이전 화면 페이드 아웃
export const SHORT_ACTION_FADE_IN_MS = 150; // 추정값
export const SHORT_SLOT_FADE_OUT_MS = 150; // 추정값

const STORAGE_KEY = 'majung:ticket-printed';

/**
 * 출력 시간(ms) = 티켓 높이 ÷ (뷰포트 높이 × vhPerS ÷ 100) 초 × 1000, 그 결과를 minMs ~ maxMs 로 clamp 한다.
 * 높이·뷰포트 높이·속도 중 쓸 수 없는 값이 있으면 0 (clamp 하지 않는다: 모션 없이 바로 보여 준다).
 */
export function computePrintMs(heightPx, viewportHeightPx, vhPerS = PRINT_SPEED_VH_PER_S, { minMs = MIN_PRINT_MS, maxMs = MAX_PRINT_MS } = {}) {
  if (!Number.isFinite(heightPx) || heightPx <= 0) return 0;
  if (!Number.isFinite(viewportHeightPx) || viewportHeightPx <= 0) return 0;
  if (!Number.isFinite(vhPerS) || vhPerS <= 0) return 0;
  const ms = Math.round((heightPx / ((viewportHeightPx * vhPerS) / 100)) * 1000);
  return Math.min(maxMs, Math.max(minMs, ms));
}

function kindOf({ hasPrinted, mode, fullOnlyFirst }) {
  if (mode === 'full' || mode === 'short') return mode;
  if (mode !== 'auto') throw new RangeError(`모드는 auto/full/short 중 하나예요: ${String(mode)}`);
  return fullOnlyFirst && hasPrinted ? 'short' : 'full';
}

/**
 * 이전 화면 페이드 아웃 시간(ms). 움직임 줄이기가 켜져 있으면 0.
 * @param {{ reducedMotion?: boolean, hasPrinted?: boolean, mode?: 'auto'|'full'|'short', fullOnlyFirst?: boolean }} [input]
 */
export function planFadeOut({ reducedMotion = false, hasPrinted = false, mode = 'auto', fullOnlyFirst = FULL_MOTION_ONLY_FIRST } = {}) {
  if (reducedMotion) return 0;
  return kindOf({ hasPrinted, mode, fullOnlyFirst }) === 'short' ? SHORT_FADE_OUT_MS : FADE_OUT_MS;
}

/**
 * 출력 모션 계획.
 * 움직임 줄이기가 켜져 있거나 높이를 모르면 { skip: true } (모션 없이 바로 보여 준다).
 *
 * @param {object} input
 * @param {number} input.heightPx            출력할 티켓(용지)의 높이
 * @param {number} input.viewportHeightPx    뷰포트 높이. 출력 속도가 이 높이에 대한 비율이다
 * @param {boolean} [input.reducedMotion]    prefers-reduced-motion: reduce 인가
 * @param {boolean} [input.hasPrinted]       이 탭 세션에서 이미 한 번 출력했는가
 * @param {'auto'|'full'|'short'} [input.mode]  auto 는 첫 방문만 풀 모션. full/short 로 강제할 수 있다("다시 보기")
 * @param {boolean} [input.fullOnlyFirst]    첫 방문에만 풀 모션 옵션
 * @param {number} [input.vhPerS]            출력 속도: 뷰포트 높이의 초당 몇 %
 * @param {boolean} [input.keepSlot]         출력이 끝난 뒤에도 슬롯을 계속 보이는가
 */
export function planTicketPrint({
  heightPx,
  viewportHeightPx,
  reducedMotion = false,
  hasPrinted = false,
  mode = 'auto',
  fullOnlyFirst = FULL_MOTION_ONLY_FIRST,
  vhPerS = PRINT_SPEED_VH_PER_S,
  keepSlot = KEEP_SLOT_VISIBLE,
} = {}) {
  const kind = kindOf({ hasPrinted, mode, fullOnlyFirst });
  if (reducedMotion) return { skip: true };
  const fullPrintMs = computePrintMs(heightPx, viewportHeightPx, vhPerS);
  if (fullPrintMs === 0) return { skip: true };

  if (kind === 'short') {
    return {
      skip: false,
      kind,
      keepSlot,
      fadeOutMs: SHORT_FADE_OUT_MS,
      slotFadeInMs: 0,
      slotPauseMs: 0,
      printMs: SHORT_PRINT_MS,
      slotFadeOutMs: SHORT_SLOT_FADE_OUT_MS,
      actionsFadeInMs: SHORT_ACTION_FADE_IN_MS,
    };
  }
  return {
    skip: false,
    kind,
    keepSlot,
    fadeOutMs: FADE_OUT_MS,
    slotFadeInMs: SLOT_FADE_IN_MS,
    slotPauseMs: SLOT_PAUSE_MS,
    printMs: fullPrintMs,
    slotFadeOutMs: SLOT_FADE_OUT_MS,
    actionsFadeInMs: ACTION_FADE_IN_MS,
  };
}

/** 이 탭 세션에서 이미 출력했는가. 저장소를 못 쓰면 "처음"으로 본다. */
export function hasPrinted(storage) {
  try {
    return storage?.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** 출력했다고 기억한다. (탭을 닫으면 지워진다) 저장소를 못 쓰면 조용히 넘어간다. */
export function markPrinted(storage) {
  try {
    storage?.setItem(STORAGE_KEY, '1');
  } catch {
    // 저장소를 쓸 수 없는 환경(시크릿 모드 등): 매번 풀 모션이 된다.
  }
}
