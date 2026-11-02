// 양옆 모션 배경: 점선 항적을 따라 비행기가 천천히 난다. (DesignGuide 5장 "양옆 모션 배경", 가정)
// 마중의 브랜드 시그니처 "두 길이 만난다"를 배경에서도 느끼게 한다: 양옆의 궤도가 모두 가운데 콘텐츠 쪽으로 모인다.
// - 768px 이상에서만 SVG 를 만든다. 767px 이하에서는 아예 만들지 않는다. (콘텐츠에 집중하고 배터리·성능 부담을 줄인다)
// - 정보·글자·버튼이 없는 장식이다. index.html 의 .side-bg 가 aria-hidden 이라 화면 읽기에서 숨겨진다.
// - 움직임은 SVG animateMotion(궤도를 따라 이동, 곡선 방향대로 회전)과 불투명도뿐이다. 영상·캔버스·JS 프레임 루프를 쓰지 않는다.
//   비행기는 궤도 끝에서 갑자기 나타나거나 사라지지 않고 서서히 나타났다 사라진다. 깜빡임 없음.
// - "움직임 줄이기"가 켜져 있으면 멈춘다. 모든 비행기가 음수 begin 이라 멈춘 배경에서도 곳곳에 서 있다. (정지된 배경)
//   탭이 보이지 않는 동안에도 멈춘다.
// 색은 Dusk Blue(항적·비행기)와 Peach(면)만 쓴다. Amber·Sunset 은 출발 신호·선택·버튼 색이라 쓰지 않는다.

export const VIEWBOX = Object.freeze({ width: 400, height: 800 });
export const MIN_TRIP_SECONDS = 20; // 한 번 나는 시간의 하한. DesignGuide: 한 주기는 20초 이상
const WIDE_QUERY = '(min-width: 768px)';
const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

// 궤도(항적). 중간에 고리가 있는 부드러운 곡선이고, 대부분 왼쪽 바깥에서 들어와 가운데 쪽(오른쪽 가장자리)으로 모인다.
// r5 만 반대로 아래에서 위쪽 왼쪽 바깥으로 나가며 흐름이 한쪽으로 쏠리지 않게 한다.
// planes: 한 번 나는 데 걸리는 시간(durationS)과 시작 위치(beginS, 음수 = 이미 그만큼 날아 있다). 모두 20초 이상.
export const FLIGHT_ROUTES = Object.freeze([
  { id: 'r1', d: 'M-30 70C60 20 150 60 170 120C190 185 110 215 80 170C50 125 120 90 190 120C270 155 330 150 392 110', planes: [{ durationS: 64, beginS: -9 }, { durationS: 64, beginS: -41 }] },
  { id: 'r2', d: 'M-30 260C40 300 120 300 150 250C175 205 235 215 235 270C235 330 160 345 140 310C120 275 190 240 260 280C320 315 350 380 392 360', planes: [{ durationS: 58, beginS: -27 }] },
  { id: 'r3', d: 'M-30 470C60 430 130 440 150 490C168 535 120 560 90 530C60 500 100 460 160 470C230 482 270 560 330 540C360 530 380 500 392 470', planes: [{ durationS: 70, beginS: -48 }, { durationS: 70, beginS: -13 }] },
  { id: 'r4', d: 'M-30 650C50 690 120 700 160 660C195 625 255 635 255 690C255 745 190 760 170 725C150 690 215 650 285 690C335 718 360 770 392 790', planes: [{ durationS: 62, beginS: -33 }] },
  { id: 'r5', d: 'M170 830C150 770 70 770 60 710C52 660 110 630 125 670C140 710 70 725 40 670C10 620 20 560 -30 540', planes: [{ durationS: 54, beginS: -19 }] },
  { id: 'r6', d: 'M392 -20C330 40 250 20 232 70C215 120 290 135 295 90C300 45 220 50 200 105C180 160 230 205 300 215C350 222 380 260 392 290', planes: [{ durationS: 60, beginS: -4 }] },
]);

const FADE_KEY_TIMES = '0;0.1;0.9;1'; // 한 번 나는 시간의 처음 10%에 걸쳐 나타나고 마지막 10%에 걸쳐 사라진다
const PLANE_OPACITY = 0.7;

// 면: 기존 양옆 배경의 Peach 면 두 장. (느리게 흔들리는 움직임은 css/layout.css)
const SHAPES = '<path class="side-bg__shape side-bg__shape--a" d="M0 0H330C370 180 280 340 330 500C360 620 300 720 340 800H0Z"/>'
  + '<path class="side-bg__shape side-bg__shape--b" d="M0 120H210C250 260 190 380 230 520C250 600 210 700 240 800H0Z"/>';

// 비행기 모양: 부드럽게 둥근 끝(round join·cap)으로 만든다. 뾰족한 비행기·각진 화살표는 쓰지 않는다. 코가 +x 방향이다.
const PLANE_GLYPH = '<path d="M-11 0L10 0" stroke-width="5"/>'
  + '<path d="M3 0L-5 -13L-9 -13L-4 0Z"/>'
  + '<path d="M3 0L-5 13L-9 13L-4 0Z"/>'
  + '<path d="M-9 0L-13 -5L-15 -5L-12.5 0Z"/>'
  + '<path d="M-9 0L-13 5L-15 5L-12.5 0Z"/>';

function renderPlane(side, route, plane) {
  const time = `begin="${plane.beginS}s" dur="${plane.durationS}s" repeatCount="indefinite"`;
  return `<g class="side-bg__plane" opacity="0">`
    + `<animateMotion ${time} rotate="auto"><mpath href="#route-${side}-${route.id}"/></animateMotion>`
    + `<animate attributeName="opacity" values="0;${PLANE_OPACITY};${PLANE_OPACITY};0" keyTimes="${FADE_KEY_TIMES}" ${time}/>`
    + `<use href="#plane-${side}"/>`
    + '</g>';
}

function renderPanel(side) {
  const trails = FLIGHT_ROUTES.map((route) => `<path id="route-${side}-${route.id}" class="side-bg__trail" d="${route.d}"/>`).join('');
  const planes = FLIGHT_ROUTES.flatMap((route) => route.planes.map((plane) => renderPlane(side, route, plane))).join('');
  return `<svg class="side-bg__panel side-bg__panel--${side}" viewBox="0 0 ${VIEWBOX.width} ${VIEWBOX.height}" preserveAspectRatio="xMaxYMid slice" focusable="false">`
    + `<defs><g id="plane-${side}" class="side-bg__glyph">${PLANE_GLYPH}</g></defs>`
    + `${SHAPES}${trails}${planes}</svg>`;
}

/** 왼쪽·오른쪽 두 패널의 SVG 마크업. (오른쪽은 CSS 가 좌우를 뒤집어 두 길이 가운데로 모이게 한다) */
export function renderSideBackground() {
  return renderPanel('left') + renderPanel('right');
}

/**
 * 배경 영역(.side-bg)을 채우고 멈춤·재생을 관리한다.
 * - 768px 이상: 만든다 / 767px 이하: 비운다(아예 만들지 않는다)
 * - "움직임 줄이기" 켜짐이거나 탭이 숨겨졌으면 멈춘다.
 * 환경(matchMedia·document)은 테스트에서 바꿔 끼울 수 있다.
 */
export function initSideBackground(
  root = globalThis.document?.querySelector('.side-bg'),
  { matchMedia = globalThis.matchMedia?.bind(globalThis), doc = globalThis.document } = {},
) {
  if (!root) return;
  const wide = matchMedia?.(WIDE_QUERY);
  const reduce = matchMedia?.(REDUCE_QUERY);

  const sync = () => {
    if (!wide?.matches) {
      root.innerHTML = '';
      return;
    }
    if (!root.innerHTML) root.innerHTML = renderSideBackground();
    const stop = Boolean(reduce?.matches) || Boolean(doc?.hidden);
    for (const svg of root.querySelectorAll('svg')) {
      if (stop) svg.pauseAnimations?.();
      else svg.unpauseAnimations?.();
    }
  };

  wide?.addEventListener?.('change', sync);
  reduce?.addEventListener?.('change', sync);
  doc?.addEventListener?.('visibilitychange', sync);
  sync();
}
