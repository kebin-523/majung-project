// 항공편 확인 화면의 결과 카드(public/js/ui/screens/flightConfirm.js 의 cardHtml): 비행기 티켓 모양(위 구역 · 절취선 · 아래 칸).
// DOM 접근 없는 마크업 함수만 확인한다. (색·배치는 CSS라 단위 테스트로 확인하지 않는다)
import test from 'node:test';
import assert from 'node:assert/strict';
import { toMs } from '../public/js/domain/time.js';
import { cardHtml } from '../public/js/ui/screens/flightConfirm.js';
import { blockNetwork } from './helpers/blockNetwork.js';

blockNetwork();

const NOW = toMs('2026-11-01 12:00');
const flight = (overrides = {}) => ({
  flightId: 'F1',
  flightNo: 'VZ850',
  scheduled: toMs('2026-11-01 10:00'),
  changed: null,
  landed: false,
  departureCity: '싱가포르',
  airline: '대한항공',
  ...overrides,
});
const card = (overrides, options = {}) => cardHtml(flight(overrides), { now: NOW, checked: false, ...options });
const part = (html, from, to) => html.slice(html.indexOf(from), to ? html.indexOf(to) : undefined);

test('티켓 구조: 위 구역(편명·항공사·도착 예정 시각) 다음에 절취선이 있는 아래 칸(출발·도착 날짜)이 온다', () => {
  const html = card();
  const top = html.indexOf('class="flight-card__top"');
  const stub = html.indexOf('class="flight-card__stub"');
  assert.ok(top >= 0 && stub > top, `${top},${stub}`);
  const topHtml = part(html, 'class="flight-card__top"', 'class="flight-card__stub"');
  assert.ok(topHtml.includes('class="flight-card__no">VZ850<'));
  assert.ok(topHtml.includes('대한항공'));
  assert.ok(topHtml.includes('도착 예정'));
  assert.ok(topHtml.includes('<span>10:00</span>'));
  const stubHtml = part(html, 'class="flight-card__stub"');
  assert.ok(stubHtml.includes('출발') && stubHtml.includes('싱가포르'));
  assert.ok(stubHtml.includes('도착 날짜') && stubHtml.includes('오늘 · 11월 1일'));
});

test('날짜는 위 구역이 아니라 아래 칸에 있다 (위 구역은 시각만)', () => {
  const html = card();
  assert.ok(!part(html, 'class="flight-card__top"', 'class="flight-card__stub"').includes('11월 1일'));
});

test('출발 도시는 "도시 출발"이 아니라 라벨 "출발" 아래의 값으로 쓴다', () => {
  const stub = part(card(), 'class="flight-card__stub"');
  assert.match(stub, /class="flight-card__meta">출발<\/span>\s*<span class="flight-card__value">싱가포르<\/span>/);
  assert.ok(!stub.includes('싱가포르 출발'));
});

test('변경된 도착 예정이 있으면 이전 시각은 취소선, 화살표, 새 시각 순이고 라벨은 "변경된 도착 예정"이다', () => {
  const html = card({ changed: toMs('2026-11-01 10:05') });
  assert.ok(html.includes('변경된 도착 예정'));
  const was = html.indexOf('<del class="flight-card__was">10:00</del>');
  const arrow = html.indexOf('flight-card__arrow');
  const now = html.indexOf('<span>10:05</span>');
  assert.ok(was >= 0 && arrow > was && now > arrow, `${was},${arrow},${now}`);
  assert.ok(html.includes('원래 도착 예정 오전 10시')); // 화면 읽기용
});

test('이미 도착한 편은 원래 예정 시각만 보이고(변경 시각·취소선 없음) 안내 한 줄이 아래 칸에 있다', () => {
  const html = card({ landed: true, changed: toMs('2026-11-01 10:20') });
  assert.ok(!html.includes('<del'));
  assert.ok(!html.includes('10:20'));
  assert.ok(html.includes('<span>10:00</span>'));
  assert.ok(!html.includes('변경된 도착 예정'));
  assert.ok(part(html, 'class="flight-card__stub"').includes('이 항공편은 이미 도착했어요.'));
});

test('값이 없는 항목(항공사·출발 도시)은 만들지 않는다', () => {
  const noAirline = card({ airline: null });
  assert.ok(!part(noAirline, 'class="flight-card__top"', 'class="flight-card__stub"').includes('flight-card__meta">대한항공'));
  const noCity = card({ departureCity: null });
  assert.ok(!noCity.includes('flight-card__value">싱가포르'));
  assert.ok(!part(noCity, 'class="flight-card__stub"').includes('>출발<'));
  assert.ok(noCity.includes('도착 날짜')); // 날짜는 그대로 있다
});

test('선택하면 radio 가 checked 이고 체크 아이콘(읽기용 "선택됨")이 위 구역에 있다', () => {
  const picked = card({}, { checked: true });
  assert.match(picked, /<input class="flight-card__input" type="radio" name="flight" value="F1" checked>/);
  assert.ok(part(picked, 'class="flight-card__top"', 'class="flight-card__stub"').includes('class="flight-card__check"'));
  assert.ok(picked.includes('선택됨'));
  assert.ok(!/ checked>/.test(card()));
});

test('외부 데이터(편명·항공사·도시)는 이스케이프한다', () => {
  const html = card({ flightNo: 'A<b>1', airline: '<i>x</i>', departureCity: '"도시" & 1' });
  assert.ok(!html.includes('<b>') && !html.includes('<i>'));
  assert.ok(html.includes('A&lt;b&gt;1') && html.includes('&lt;i&gt;x&lt;/i&gt;') && html.includes('&quot;도시&quot; &amp; 1'));
});

test('도착 예정 시각은 화면 읽기용 문구가 따로 있다', () => {
  assert.ok(card().includes('<span class="sr-only">도착 예정 오전 10시</span>'));
});
