// 슬롯 3겹 구조의 CSS 규칙 (public/css/components.css "티켓 출력" 블록).
// 종이가 슬롯 "안쪽 틈에서 나오는" 것처럼 보이려면 아래 순서로 겹쳐야 한다.
//   1. .ticket-slot (맨 뒤)  알약 전체: 위·아래 어두운 띠 + 가운데 조금 밝은 틈
//   2. .ticket-paper         틈에서 나와 아래쪽 띠 앞을 지나간다. 슬롯보다 좌우로 좁다
//   3. .ticket-lip (맨 앞)   알약의 "위쪽 띠"만 잘라낸 층. 종이 윗부분을 덮고, 아래에 그림자를 드리운다
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/css/components.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const resultJs = readFileSync(new URL('../public/js/ui/screens/result.js', import.meta.url), 'utf8');

const ruleOf = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(^|(?<!,)\\n)${escaped} \\{([^}]*)\\}`));
  assert.ok(m, `규칙을 찾지 못했어요: ${selector}`);
  return m[2];
};

test('조절 변수가 .ticket-stage 에 모여 있다 (슬롯 두께 24px, 윗 띠 10px, 들어가는 길이 8px, 튀어나옴 12px)', () => {
  const stage = ruleOf('.ticket-stage');
  assert.match(stage, /--slot-height: var\(--space-4\)/); // 24px
  assert.match(stage, /--lip-height: 10px/);
  assert.match(stage, /--insert-depth: 8px/);
  assert.match(stage, /--slot-overhang: 12px/);
  assert.match(stage, /--slot-gap-color: /);
  assert.match(stage, /--lip-shadow: 0 \d+px \d+px rgba\(46, 31, 26, 0\.\d+\)/);
});

test('틈 색은 바깥 어두운 색(Ink)을 크림색과 섞어 한 톤만 밝게 만든다 (새 색을 추가하지 않는다)', () => {
  const stage = ruleOf('.ticket-stage');
  assert.match(stage, /--slot-gap-color: color-mix\(in srgb, var\(--color-ink\) \d+%, var\(--color-cream\)\)/);
});

test('들어가는 길이는 윗 띠 두께를 넘지 않는다 (넘으면 용지 윗부분이 띠 위로 비친다)', () => {
  assert.match(ruleOf('.ticket-stage'), /--insert-eff: min\(var\(--insert-depth\), var\(--lip-height\)\)/);
});

test('겹치는 순서: 슬롯(뒤) < 용지 < 종이 끝 그림자 < 윗 띠(앞)', () => {
  const z = (selector) => Number(ruleOf(selector).match(/z-index: (\d+)/)?.[1]);
  assert.ok(z('.ticket-slot') < z('.ticket-paper'), '용지가 슬롯의 아래쪽 띠를 가린다');
  assert.ok(z('.ticket-paper') <= z('.ticket-edge'));
  assert.ok(z('.ticket-edge') < z('.ticket-lip'), '윗 띠가 용지 윗부분을 덮는다');
});

test('슬롯(뒤)은 용지보다 좌우로 넓다 — 양끝이 용지 바깥에 보이고, 알약 모양이다', () => {
  const slot = ruleOf('.ticket-slot');
  assert.match(slot, /left: calc\(-1 \* var\(--slot-overhang\)\)/);
  assert.match(slot, /right: calc\(-1 \* var\(--slot-overhang\)\)/);
  assert.match(slot, /height: var\(--slot-height\)/);
  assert.match(slot, /border-radius: var\(--radius-pill\)/);
  assert.match(slot, /background: var\(--color-ink\)/);
});

test('슬롯 위치: 윗 띠 아래쪽이 용지 윗선보다 --insert-eff 만큼 아래에 있다 (용지 윗부분이 윗 띠 안으로 들어간다)', () => {
  const expected = /top: calc\(var\(--insert-eff\) - var\(--lip-height\)\)/;
  assert.match(ruleOf('.ticket-slot'), expected);
  assert.match(ruleOf('.ticket-lip'), expected);
});

test('가운데 틈: 윗 띠 바로 아래, 양끝에서 안쪽으로 들어간 알약 모양, 틈 색을 쓴다', () => {
  const gap = ruleOf('.ticket-slot::before');
  assert.match(gap, /top: var\(--lip-height\)/);
  assert.match(gap, /background: var\(--slot-gap-color\)/);
  assert.match(gap, /border-radius: var\(--radius-pill\)/);
  assert.match(gap, /left: var\(--gap-inset\)/);
  assert.match(gap, /right: var\(--gap-inset\)/);
});

test('윗 띠(앞)는 알약과 같은 바깥 모양에서 위쪽 띠만 잘라낸다 (clip-path), 그림자는 drop-shadow 로 윗 띠 아래에 드리운다', () => {
  const lip = ruleOf('.ticket-lip');
  assert.match(lip, /height: var\(--slot-height\)/);
  assert.match(lip, /filter: drop-shadow\(var\(--lip-shadow\)\)/);
  const inner = ruleOf('.ticket-lip::before');
  assert.match(inner, /clip-path: inset\(0 0 calc\(var\(--slot-height\) - var\(--lip-height\)\) 0\)/);
  assert.match(inner, /border-radius: var\(--radius-pill\)/); // 뒤 알약과 같은 곡선이라 이음새가 없다
  assert.match(inner, /background: var\(--color-ink\)/);
});

test('슬롯 두 층은 장식이라 클릭·초점을 받지 않고 처음에는 투명하다 (JS 가 나타나게 한다)', () => {
  const shared = css.match(/\.ticket-slot,\n\.ticket-lip,\n\.ticket-edge \{([^}]*)\}/);
  assert.ok(shared);
  assert.match(shared[1], /pointer-events: none/);
  assert.match(shared[1], /opacity: 0/);
});

test('결과 화면 마크업에 슬롯 두 층이 모두 있고 화면 읽기에서 숨겨져 있다', () => {
  assert.match(resultJs, /<span class="ticket-slot" aria-hidden="true"><\/span>/);
  assert.match(resultJs, /<span class="ticket-lip" aria-hidden="true"><\/span>/);
});

test('용지의 맨 위 요소는 윗모서리가 평평하다 (슬롯이 사라지는 설정에서는 둥글게 돌아온다)', () => {
  const m = css.match(/(\.ticket-stage:not\(\.slot-gone\) \.ticket-paper[^{]*:first-child[^{]*)\{([^}]*)\}/);
  assert.ok(m, '맨 위 요소의 윗모서리 규칙이 있다');
  assert.match(m[1], /\.slot:empty \+ #card-host > :first-child/); // 띠가 없을 때: 카드가 맨 위
  assert.match(m[1], /\.slot:not\(:empty\) > :first-child/); // 띠가 있을 때: 변경 안내가 맨 위
  assert.match(m[2], /border-top-left-radius: 0/);
  assert.match(m[2], /border-top-right-radius: 0/);
  assert.ok(!/border-bottom/.test(m[2])); // 아래쪽 모서리는 둥근 채로 둔다
  assert.match(css, /\.ticket-stage:not\(\.slot-gone\) \.ticket-paper > \.slot:empty \+ #card-host > :first-child \.ticket__band \{ border-radius: 0; \}/);
});
