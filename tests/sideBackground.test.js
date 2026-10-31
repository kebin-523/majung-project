// 양옆 모션 배경(public/js/ui/components/sideBackground.js): 점선 항적을 따라 비행기가 천천히 난다. (DesignGuide 5장 "양옆 모션 배경")
// SVG 마크업과 시작·멈춤 판단만 확인한다. (실제 움직임·모양은 브라우저에서 눈으로 확인한다)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FLIGHT_ROUTES, MIN_TRIP_SECONDS, initSideBackground, renderSideBackground } from '../public/js/ui/components/sideBackground.js';

const html = renderSideBackground();
const panels = html.split('<svg').slice(1).map((svg) => `<svg${svg}`);
const idsOf = (text) => [...text.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const seconds = (text) => Number(/^(-?\d+(?:\.\d+)?)s$/.exec(text)?.[1]);

test('왼쪽·오른쪽 두 패널이 같은 좌표계(viewBox 400×800, 가운데 쪽에 붙여 자르기)로 만들어진다', () => {
  assert.equal(panels.length, 2);
  assert.ok(panels[0].includes('side-bg__panel--left') && panels[1].includes('side-bg__panel--right'));
  for (const panel of panels) {
    assert.ok(panel.includes('viewBox="0 0 400 800"'));
    assert.ok(panel.includes('preserveAspectRatio="xMaxYMid slice"'));
    assert.ok(panel.includes('focusable="false"'));
  }
});

test('id 는 문서 전체에서 겹치지 않고, 모든 비행기는 실제로 있는 궤도(path)를 따라 난다', () => {
  const ids = idsOf(html);
  assert.equal(new Set(ids).size, ids.length);
  for (const panel of panels) {
    const own = new Set(idsOf(panel));
    const refs = [...panel.matchAll(/<mpath href="#([^"]+)"/g)].map((match) => match[1]);
    assert.ok(refs.length > 0);
    for (const ref of refs) assert.ok(own.has(ref), `${ref} 궤도가 같은 패널 안에 있어야 한다`);
  }
});

test('궤도는 점선 항적(.side-bg__trail)으로 그려지고 비행기는 궤도마다 1대 이상, 전체는 절제된 수다', () => {
  const planes = FLIGHT_ROUTES.reduce((sum, route) => sum + route.planes.length, 0);
  assert.ok(FLIGHT_ROUTES.length >= 5);
  assert.ok(FLIGHT_ROUTES.every((route) => route.planes.length >= 1));
  assert.ok(planes >= 6 && planes <= 14, `비행기 ${planes}대 (한 패널 기준)`);
  for (const panel of panels) {
    assert.equal(panel.split('class="side-bg__trail"').length - 1, FLIGHT_ROUTES.length);
    assert.equal(panel.split('<animateMotion').length - 1, planes);
  }
});

test('한 번 나는 시간은 20초 이상으로 아주 천천히이고, 곡선을 따라 방향을 돌린다(rotate=auto)', () => {
  assert.equal(MIN_TRIP_SECONDS, 20);
  for (const motion of html.matchAll(/<animateMotion([^>]*)>/g)) {
    const attrs = motion[1];
    assert.ok(attrs.includes('rotate="auto"'));
    assert.ok(attrs.includes('repeatCount="indefinite"'));
    assert.ok(seconds(/dur="([^"]+)"/.exec(attrs)?.[1]) >= MIN_TRIP_SECONDS);
  }
});

test('모든 비행기는 음수 begin 으로 시작해 서로 다른 위치에 있다 (멈춘 배경에서도 곳곳에 보인다)', () => {
  const begins = [...html.matchAll(/<animateMotion[^>]*begin="([^"]+)"/g)].map((match) => seconds(match[1]));
  assert.ok(begins.length > 0 && begins.every((begin) => begin < 0));
  assert.ok(new Set(begins.slice(0, FLIGHT_ROUTES.reduce((sum, route) => sum + route.planes.length, 0))).size > 3);
});

test('비행기는 궤도 끝에서 갑자기 나타나거나 사라지지 않고 서서히 나타났다 사라진다 (깜빡임 없음)', () => {
  for (const group of html.matchAll(/<g class="side-bg__plane"([^>]*)>([\s\S]*?)<\/g>/g)) {
    assert.ok(group[1].includes('opacity="0"')); // 첫 그림에서 튀지 않게 투명으로 시작
    const fade = /<animate attributeName="opacity" values="([^"]+)" keyTimes="([^"]+)"/.exec(group[2]);
    assert.ok(fade, '불투명도 애니메이션이 있어야 한다');
    const values = fade[1].split(';').map(Number);
    assert.equal(values[0], 0);
    assert.equal(values.at(-1), 0);
    assert.ok(Math.max(...values) <= 1);
    const times = fade[2].split(';').map(Number);
    assert.ok(times[1] >= 0.05 && times[1] <= 0.2, '서서히 나타나야 한다'); // 한 번 나는 시간의 5~20%에 걸쳐 나타남
  }
});

test('글자·링크·버튼이 없고, Amber·Sunset 색을 쓰지 않는다 (출발 신호·선택·버튼 색과 헷갈리지 않게)', () => {
  assert.equal(html.replace(/<[^>]*>/g, '').trim(), '');
  assert.ok(!/<(a|button|text|image)\b/.test(html));
  assert.ok(!/#F7B955|#C94A25|amber|sunset/i.test(html));
});

test('index.html 의 배경 영역은 화면 읽기에서 숨겨져 있고 SVG 를 직접 들고 있지 않다 (JS 가 768px 이상에서만 만든다)', () => {
  const page = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(page, /<div class="side-bg" aria-hidden="true"><\/div>/);
  assert.ok(!page.includes('side-bg__panel'));
});

// ---------- 시작 · 멈춤 ----------

function fakeRoot() {
  const svgs = [];
  return {
    svgs,
    set innerHTML(value) {
      svgs.length = 0;
      for (let i = 0; i < (value.match(/<svg/g) ?? []).length; i += 1) {
        svgs.push({ paused: null, pauseAnimations() { this.paused = true; }, unpauseAnimations() { this.paused = false; } });
      }
    },
    get innerHTML() { return svgs.length > 0 ? 'x' : ''; },
    querySelectorAll() { return svgs; },
  };
}

function fakeEnv({ wide = true, reduce = false, hidden = false } = {}) {
  const state = { wide, reduce };
  const listeners = {};
  const media = (query) => {
    const key = query.includes('min-width') ? 'wide' : 'reduce';
    return {
      get matches() { return state[key]; },
      addEventListener(type, fn) { (listeners[key] ??= []).push(fn); },
    };
  };
  const doc = { hidden, addEventListener(type, fn) { (listeners[type] ??= []).push(fn); } };
  const fire = (key) => (listeners[key] ?? []).forEach((fn) => fn());
  return { state, doc, matchMedia: media, fire };
}

test('좁은 화면(767px 이하)에서는 SVG 를 아예 만들지 않는다', () => {
  const root = fakeRoot();
  const env = fakeEnv({ wide: false });
  initSideBackground(root, env);
  assert.equal(root.innerHTML, '');
  assert.equal(root.svgs.length, 0);
});

test('넓은 화면에서는 두 패널을 만들고 움직인다', () => {
  const root = fakeRoot();
  initSideBackground(root, fakeEnv());
  assert.equal(root.svgs.length, 2);
  assert.ok(root.svgs.every((svg) => svg.paused === false));
});

test('"움직임 줄이기"가 켜져 있으면 만들되 멈춘다 (곳곳에 비행기가 서 있는 정지된 배경)', () => {
  const root = fakeRoot();
  const env = fakeEnv({ reduce: true });
  initSideBackground(root, env);
  assert.equal(root.svgs.length, 2);
  assert.ok(root.svgs.every((svg) => svg.paused === true));
  env.state.reduce = false; // 설정을 끄면 다시 움직인다
  env.fire('reduce');
  assert.ok(root.svgs.every((svg) => svg.paused === false));
});

test('탭이 보이지 않는 동안에는 멈추고 다시 보이면 이어서 움직인다 (배터리)', () => {
  const root = fakeRoot();
  const env = fakeEnv({ hidden: true });
  initSideBackground(root, env);
  assert.ok(root.svgs.every((svg) => svg.paused === true));
  env.doc.hidden = false;
  env.fire('visibilitychange');
  assert.ok(root.svgs.every((svg) => svg.paused === false));
});

test('창 폭이 767px 이하로 줄면 지우고, 다시 넓어지면 새로 만든다', () => {
  const root = fakeRoot();
  const env = fakeEnv();
  initSideBackground(root, env);
  env.state.wide = false;
  env.fire('wide');
  assert.equal(root.svgs.length, 0);
  env.state.wide = true;
  env.fire('wide');
  assert.equal(root.svgs.length, 2);
  assert.ok(root.svgs.every((svg) => svg.paused === false));
});

test('배경 영역이 없거나 matchMedia 가 없는 환경에서도 던지지 않는다', () => {
  assert.doesNotThrow(() => initSideBackground(null, fakeEnv()));
  const root = fakeRoot();
  assert.doesNotThrow(() => initSideBackground(root, { doc: { hidden: false, addEventListener() {} } }));
});
