// 티켓 출력 모션: 항공 티켓 모양의 결과 카드가 화면 위쪽 슬롯(투입구)에서 프린터처럼 위에서 아래로 출력되며 나타난다.
// 값(시간·속도)과 계획 계산은 ticketPrintPlan.js 에 있다. 이 파일은 DOM 에서 재생만 한다.
//
//   슬롯 나타남 → 정지(기대감) → 데이터 준비를 기다림 → 출력 → 하단 액션 페이드 인 (슬롯은 계속 보인다. KEEP_SLOT_VISIBLE)
//
// 출력은 용지(paper)의 clip-path: inset(0 0 X% 0) 를 100% → 0% 로 linear 하게 줄여 위쪽이 고정된 채 아래쪽 끝이 내려오며 드러난다.
// 티켓이 미끄러져 내려오지 않고, 내용 위치는 출력 중 바뀌지 않는다. 애니메이션하는 속성은 clip-path · transform · opacity 뿐이다. (레이아웃 변경 없음)
// 드러나는 끝에 붙는 얕은 그림자(edge)는 용지 바깥 형제 요소라 clip-path 에 잘리지 않고, 같은 시간·같은 곡선(linear)으로 translateY 한다.
import {
  ASSET_MAX_WAIT_MS,
  FADE_EASE,
  KEEP_SLOT_VISIBLE,
  READY_MAX_WAIT_MS,
  hasPrinted,
  markPrinted,
  planTicketPrint,
} from './ticketPrintPlan.js';

export { FADE_OUT_MS } from './ticketPrintPlan.js';

const HIDDEN_CLIP = 'inset(0 0 100% 0)';
const SHOWN_CLIP = 'inset(0 0 0% 0)';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * 폰트와 이미지가 준비되기를 기다린다. (출력 도중 글자 폭이 바뀌거나 이미지가 늦게 떠 끊겨 보이는 것을 막는다)
 * 상한(ASSET_MAX_WAIT_MS)이 있어 끝없이 기다리지 않고, 기다릴 것이 없으면 바로 끝난다.
 * 아이콘은 CSS 마스크 이미지라 여기서 기다리지 않는다.
 */
function waitForAssets(root) {
  const pending = [globalThis.document?.fonts?.ready];
  for (const img of root.querySelectorAll('img')) {
    if (!img.complete) pending.push(img.decode?.().catch(() => {}));
  }
  return Promise.race([Promise.all(pending.filter(Boolean)).catch(() => {}), wait(ASSET_MAX_WAIT_MS)]);
}

/**
 * 출력 시작·종료 시각을 performance.mark 로 남긴다. (performance.getEntriesByName('ticket-print'))
 * 주소에 ?printlog 가 있으면 콘솔에도 performance.now() 로 찍는다. 평소에는 콘솔에 아무것도 찍지 않는다.
 */
function logTiming(label, detail) {
  try {
    performance.mark(label);
    if (globalThis.location?.search.includes('printlog')) console.info(`[ticket-print] ${label}`, Math.round(performance.now()), detail ?? '');
  } catch {
    // 성능 API 를 못 쓰는 환경: 기록만 건너뛴다.
  }
}

/** 움직임 줄이기가 켜져 있는가. (WAAPI 는 base.css 의 전역 규칙이 닿지 않아 여기서 직접 지킨다) */
export function prefersReducedMotion() {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

/** 이 탭 세션에서 이미 티켓을 출력했는가. (app.js 의 이전 화면 페이드 아웃 길이도 이걸로 정한다) */
export function ticketAlreadyPrinted() {
  return hasPrinted(safeStorage());
}

function safeStorage() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** 애니메이션을 끝까지 재생하고 기다린다. 중간에 취소돼도 던지지 않는다. */
async function play(element, keyframes, options) {
  const animation = element.animate(keyframes, { fill: 'forwards', ...options });
  try {
    await animation.finished;
  } catch {
    // 취소됐다 (화면을 떠났거나 다시 재생을 시작했다).
  }
  return animation;
}

/** 모션 없이 최종 상태로 만든다. (움직임 줄이기, 높이를 모를 때, 다시 시작하기 전 정리) */
function settle({ stage, paper, slots, edge, afterGroup }) {
  stage.classList.remove('slot-gone'); // 슬롯이 사라지는 설정에서 붙는 클래스(둥근 윗모서리로 돌아온다)
  paper.style.willChange = ''; // will-change 는 출력 중에만 켠다
  edge.style.willChange = '';
  paper.getAnimations().forEach((a) => a.cancel());
  for (const layer of slots) layer.getAnimations().forEach((a) => a.cancel());
  edge.getAnimations().forEach((a) => a.cancel());
  paper.style.clipPath = '';
  for (const layer of slots) layer.style.opacity = '';
  edge.style.opacity = '';
  for (const el of afterGroup) {
    el.getAnimations().forEach((a) => a.cancel());
    el.inert = false;
    el.style.opacity = '';
  }
}

/**
 * 티켓 출력 모션을 재생한다. "다시 보기"에서는 mode: 'full' 로 다시 부를 수 있다.
 *
 * 부르는 즉시(첫 await 전에) 용지와 하단 액션을 숨기므로, 화면이 처음 그려질 때 티켓이 번쩍 보이지 않는다.
 * 움직임 줄이기가 켜져 있으면 숨기지도 않고 바로 보여 준다.
 *
 * @param {object} input
 * @param {HTMLElement} input.stage     슬롯·용지·그림자를 감싼 기준 요소 (position: relative)
 * @param {HTMLElement} input.paper     출력되는 용지(변경 안내 띠 + 카드). clip-path 로 드러낸다
 * @param {HTMLElement} input.slot      슬롯 뒤층: 알약 전체(위·아래 띠 + 가운데 밝은 틈). 용지보다 뒤에 있다. 장식이라 화면 읽기에서 숨겨져 있다
 * @param {HTMLElement} [input.lip]     슬롯 앞층: 알약의 위쪽 띠만 잘라낸 층. 용지 윗부분을 덮는다. 슬롯 뒤층과 함께 나타난다
 * @param {HTMLElement} input.edge      드러나는 끝의 얕은 그림자. 장식이다
 * @param {HTMLElement[]} [input.afterGroup]  출력이 끝난 뒤 페이드 인할 하단 액션들. 출력 중에는 숨기고 초점도 받지 않는다(inert)
 * @param {Promise<unknown>} [input.ready]    데이터 준비를 알리는 promise. 늦으면 슬롯에서 기다렸다가(최대 READY_MAX_WAIT_MS) 출력을 시작한다
 * @param {'auto'|'full'|'short'} [input.mode]  auto 는 첫 방문에만 풀 모션, 이후에는 짧게
 * @returns {Promise<'played'|'skipped'|'cancelled'>}
 */
export async function playTicketPrint({ stage, paper, slot, lip = null, edge, afterGroup = [], ready = Promise.resolve(), mode = 'auto' }) {
  const slots = [slot, lip].filter(Boolean); // 슬롯 두 층은 항상 같이 나타나고 같이 남는다
  const parts = { stage, paper, slots, edge, afterGroup };
  const run = (stage.dataset.printRun = String((Number(stage.dataset.printRun) || 0) + 1));
  const stale = () => !stage.isConnected || stage.dataset.printRun !== run; // 화면을 떠났거나 더 새 재생이 시작됐다

  settle(parts); // 다시 재생할 때 이전 상태를 지운다.

  // 슬롯을 계속 보이게 하는 설정이면, 모션 없이 바로 보여 주는 경로에서도 슬롯은 정지한 채 보인다.
  const showSlotStatically = () => {
    if (KEEP_SLOT_VISIBLE) for (const layer of slots) layer.style.opacity = '1';
  };

  const reducedMotion = prefersReducedMotion();
  const printed = hasPrinted(safeStorage());
  const options = { reducedMotion, hasPrinted: printed, mode };
  const viewportHeight = () => globalThis.innerHeight;
  let plan = planTicketPrint({ ...options, heightPx: paper.getBoundingClientRect().height, viewportHeightPx: viewportHeight() });
  if (plan.skip) {
    showSlotStatically();
    return 'skipped';
  }

  // 숨김: 용지는 위쪽부터 0% 만 보이게, 하단 액션은 투명 + 초점 불가
  paper.style.clipPath = HIDDEN_CLIP;
  for (const el of afterGroup) {
    el.inert = true;
    el.style.opacity = '0';
  }

  // 1) 슬롯이 나타난다
  if (plan.slotFadeInMs > 0) await Promise.all(slots.map((layer) => play(layer, [{ opacity: 0 }, { opacity: 1 }], { duration: plan.slotFadeInMs, easing: FADE_EASE })));
  for (const layer of slots) layer.style.opacity = '1';
  if (stale()) return 'cancelled';

  // 2) 슬롯만 남기고 정지 (기대감 구간), 데이터가 늦으면 더 기다린다(상한 있음)
  const pause = plan.slotPauseMs > 0 ? wait(plan.slotPauseMs) : Promise.resolve();
  const dataReady = Promise.race([Promise.resolve(ready).catch(() => {}), wait(READY_MAX_WAIT_MS)]);
  await Promise.all([pause, dataReady.then(() => waitForAssets(paper))]);
  if (stale()) return 'cancelled';

  // 레이어를 미리 만들어 두고(will-change, 출력 중에만), 프레임 두 번을 지나 레이아웃·페인트가 가라앉은 뒤에 시작한다.
  paper.style.willChange = 'clip-path';
  edge.style.willChange = 'transform';
  await nextFrame();
  await nextFrame();
  if (stale()) {
    paper.style.willChange = '';
    edge.style.willChange = '';
    return 'cancelled';
  }

  // 3) 출력. 높이는 모든 것이 준비된 뒤에 다시 잰다. (duration = 높이 ÷ 뷰포트 높이 기준 속도, clamp)
  const height = paper.getBoundingClientRect().height;
  plan = planTicketPrint({ ...options, heightPx: height, viewportHeightPx: viewportHeight() });
  if (plan.skip) {
    settle(parts);
    showSlotStatically();
    return 'skipped';
  }
  markPrinted(safeStorage());

  edge.style.opacity = '1';
  const timing = { duration: plan.printMs, easing: 'linear' }; // 출력 속도는 일정해야 한다 (가속·감속 없음)
  logTiming('ticket-print-start', { kind: plan.kind, printMs: plan.printMs, heightPx: Math.round(height), viewportHeightPx: viewportHeight() });
  const edgeRun = play(edge, [{ transform: 'translateY(0px)' }, { transform: `translateY(${height}px)` }], timing);
  await play(paper, [{ clipPath: HIDDEN_CLIP }, { clipPath: SHOWN_CLIP }], timing);
  await edgeRun;
  logTiming('ticket-print-end');
  try {
    performance.measure('ticket-print', 'ticket-print-start', 'ticket-print-end');
  } catch {
    // 시작 표시가 없으면 건너뛴다.
  }
  paper.style.willChange = '';
  edge.style.willChange = '';
  if (stale()) return 'cancelled';

  // 출력 끝: 클립을 완전히 걷어 낸다 (남겨 두면 안쪽 그림자·넘침이 잘린다)
  paper.style.clipPath = '';
  paper.getAnimations().forEach((a) => a.cancel());
  edge.style.opacity = '';
  edge.getAnimations().forEach((a) => a.cancel());

  // 4) 하단 액션이 페이드 인. 슬롯은 계속 보이거나(기본), keepSlot 이 꺼져 있으면 페이드 아웃한다.
  const fades = [];
  if (!plan.keepSlot) for (const layer of slots) fades.push(play(layer, [{ opacity: 1 }, { opacity: 0 }], { duration: plan.slotFadeOutMs, easing: FADE_EASE }));
  for (const el of afterGroup) {
    el.inert = false;
    fades.push(play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: plan.actionsFadeInMs, easing: FADE_EASE }));
  }
  await Promise.all(fades);
  if (stale()) return 'cancelled';

  for (const layer of slots) {
    layer.getAnimations().forEach((a) => a.cancel());
    layer.style.opacity = plan.keepSlot ? '1' : ''; // 계속 보이게 하면 애니메이션이 아니라 값으로 남긴다
  }
  if (!plan.keepSlot) stage.classList.add('slot-gone'); // 슬롯이 사라졌으니 용지 윗모서리를 둥글게 되돌린다
  for (const el of afterGroup) {
    el.getAnimations().forEach((a) => a.cancel());
    el.style.opacity = '';
  }
  return 'played';
}
