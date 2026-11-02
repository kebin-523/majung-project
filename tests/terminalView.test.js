// 터미널 코드 판단(domain/terminal.js), 터미널 보류 화면(resolveFlightView), 알림 문장, 이동 시간 실패 안내 종류(domain/routeNotice.js),
// 이동 시간을 다시 확인했다는 문구의 조건(isRealTravelRecheck). DOM 접근 없는 함수만 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTE_TERMINALS, terminalCodeOf } from '../public/js/domain/terminal.js';
import { resolveFlightView } from '../public/js/domain/status.js';
import { ANNOUNCEMENTS, announcementFor, focusTargetAfterTransition } from '../public/js/domain/announce.js';
import { NO_ROUTE_MESSAGE, TERMINAL_HOLD_MESSAGE, routeNoticeKind } from '../public/js/domain/routeNotice.js';
import { isRealTravelRecheck } from '../public/js/domain/change.js';

const flightWith = (terminal, extra = {}) => ({ flightId: 'F1', status: 'none', landed: false, terminal, ...extra });

test('terminalCodeOf: P01 · P03 만 코드로 돌려주고 P02 · 없음 · 모르는 값은 null', () => {
  assert.deepEqual([...ROUTE_TERMINALS], ['P01', 'P03']);
  assert.equal(terminalCodeOf({ terminal: { code: 'P01', name: '제1터미널' } }), 'P01');
  assert.equal(terminalCodeOf({ terminal: { code: 'P03', name: '제2터미널' } }), 'P03');
  const nulls = [
    { terminal: { code: 'P02', name: '탑승동' } },
    { terminal: null }, { terminal: undefined }, {}, null, undefined,
    { terminal: {} }, { terminal: { code: 'p01' } }, { terminal: { code: 'P04' } }, { terminal: { code: 1 } },
    { terminal: 'P01' }, { terminal: ['P01'] }, { terminal: { name: '제1터미널' } },
  ];
  for (const flight of nulls) assert.equal(terminalCodeOf(flight), null, JSON.stringify(flight) ?? 'undefined');
});

test('resolveFlightView: 터미널이 필요한 모드에서 터미널이 없거나 P02 면 terminal 화면(계산 보류)', () => {
  const options = { requiresTerminal: true };
  assert.deepEqual(resolveFlightView(flightWith({ code: 'P01' }), options), { screen: 'card', touchdown: false });
  assert.deepEqual(resolveFlightView(flightWith({ code: 'P03' }), options), { screen: 'card', touchdown: false });
  for (const terminal of [null, undefined, { code: 'P02', name: '탑승동' }, {}]) {
    assert.deepEqual(resolveFlightView(flightWith(terminal), options), { screen: 'terminal', touchdown: false });
  }
  // 착륙한 편도 터미널을 모르면 보류
  assert.deepEqual(resolveFlightView(flightWith(null, { status: 'touchdown' }), options), { screen: 'terminal', touchdown: false });
  assert.deepEqual(resolveFlightView(flightWith({ code: 'P01' }, { status: 'touchdown' }), options), { screen: 'card', touchdown: true });
});

test('resolveFlightView: 도착·운항 상태 확인 필요 안내가 터미널 보류보다 먼저다', () => {
  const options = { requiresTerminal: true };
  assert.equal(resolveFlightView(flightWith(null, { status: 'arrived', landed: true }), options).screen, 'arrived');
  assert.equal(resolveFlightView(flightWith(null, { status: 'unknown' }), options).screen, 'unknown');
});

test('resolveFlightView: 터미널이 필요하지 않은 모드(시나리오 모드)나 옵션이 없으면 터미널이 없어도 카드', () => {
  assert.equal(resolveFlightView(flightWith(null)).screen, 'card');
  assert.equal(resolveFlightView(flightWith(null), {}).screen, 'card');
  assert.equal(resolveFlightView(flightWith(null), { requiresTerminal: false }).screen, 'card');
  assert.equal(resolveFlightView(flightWith({ code: 'P02' }), { requiresTerminal: false }).screen, 'card');
});

test('안내 문구: 새 안내 상자 문장은 DesignGuide 초안과 같다', () => {
  assert.equal(TERMINAL_HOLD_MESSAGE, '이 항공편의 도착 터미널을 확인하지 못해서 이동 시간을 계산하지 못했어요.');
  assert.match(NO_ROUTE_MESSAGE, /다른 출발지/);
  assert.equal(ANNOUNCEMENTS.terminal, TERMINAL_HOLD_MESSAGE);
});

test('화면 읽기 알림: 카드 ↔ 터미널 보류 전환도 알리고, 처음 그릴 때는 알리지 않는다', () => {
  const card = { screen: 'card' };
  const terminal = { screen: 'terminal' };
  assert.equal(announcementFor(card, terminal), TERMINAL_HOLD_MESSAGE);
  assert.equal(announcementFor(terminal, card, { cardLead: '오후 5시 10분 출발을 추천해요' }), '오후 5시 10분 출발을 추천해요');
  assert.equal(announcementFor(terminal, { screen: 'arrived' }), ANNOUNCEMENTS.arrived);
  assert.equal(announcementFor(null, terminal), null);
  assert.equal(announcementFor(terminal, terminal), null);
  assert.equal(focusTargetAfterTransition({ before: card, after: terminal, focusInRemoved: true }), 'change-flight');
  assert.equal(focusTargetAfterTransition({ before: card, after: terminal, focusInRemoved: false }), null);
});

test('routeNoticeKind: noroute 는 "다른 출발지" 안내, 그 밖의 실패는 "이동 시간을 불러오지 못해서" 안내', () => {
  assert.equal(routeNoticeKind('noroute'), 'noRoute');
  for (const reason of ['quota', 'timeout', 'error', 'noterminal', 'invalid', 'config', 'aborted', 'something', undefined, null]) {
    assert.equal(routeNoticeKind(reason), 'error', String(reason));
  }
});

test('isRealTravelRecheck: source 가 kakao 면 실제 모드에서도 "이동 시간도 다시 확인했어요"를 쓴다', () => {
  assert.equal(isRealTravelRecheck({ source: 'kakao' }, { scenarioMode: false }), true);
  assert.equal(isRealTravelRecheck({ source: 'kakao' }, { scenarioMode: true }), true);
  // 목업 값은 실제 모드에서는 쓰지 않고, 시나리오 모드(전부 목업)에서만 쓴다
  assert.equal(isRealTravelRecheck({ source: 'mock' }, { scenarioMode: false }), false);
  assert.equal(isRealTravelRecheck({ source: 'mock' }, { scenarioMode: true }), true);
  assert.equal(isRealTravelRecheck(null, { scenarioMode: false }), false);
  assert.equal(isRealTravelRecheck(undefined, { scenarioMode: true }), false);
});
