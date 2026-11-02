// 항공편 최신 상태에 따른 화면 결정(resolveFlightView)과 오래됨 기준 시각(lastConfirmedAt). DOM 접근 없음.
// 재확인 결과가 올 때마다 화면을 최신 상태로 다시 정하므로, 상태 전환별로 "전환 뒤의 화면"을 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lastConfirmedAt, resolveFlightView } from '../public/js/domain/status.js';
import { minutes, toMs } from '../public/js/domain/time.js';
import { renderBadge } from '../public/js/ui/components/badge.js';
import { buildResultViewModel } from '../public/js/ui/screens/result.js';

// 어댑터가 만드는 모양: landed 는 status 가 arrived 일 때만 true
const flight = (status) => ({ status, landed: status === 'arrived' });

const CARD = { screen: 'card', touchdown: false };
const TOUCHDOWN_CARD = { screen: 'card', touchdown: true };
const ARRIVED = { screen: 'arrived', touchdown: false };
const UNKNOWN = { screen: 'unknown', touchdown: false };

const transitions = [
  ['none → touchdown', 'none', 'touchdown', TOUCHDOWN_CARD],
  ['none → arrived', 'none', 'arrived', ARRIVED],
  ['touchdown → arrived', 'touchdown', 'arrived', ARRIVED],
  ['none → unknown', 'none', 'unknown', UNKNOWN],
  ['unknown → none (되돌아옴)', 'unknown', 'none', CARD],
  // 되돌아오는 경우도 최신 상태를 따라간다.
  ['touchdown → none', 'touchdown', 'none', CARD],
  ['unknown → touchdown', 'unknown', 'touchdown', TOUCHDOWN_CARD],
  ['arrived → none', 'arrived', 'none', CARD],
  ['arrived → unknown', 'arrived', 'unknown', UNKNOWN],
];

for (const [name, from, to, expected] of transitions) {
  test(`화면 결정: ${name}`, () => {
    // 전환 전 화면도 올바르게 정해지고, 전환 뒤에는 최신 상태만 보고 정한다.
    resolveFlightView(flight(from));
    assert.deepEqual(resolveFlightView(flight(to)), expected);
  });
}

test('화면 결정: 상태 없음·지연(delayed)·값 없음은 기본 추천 카드', () => {
  for (const status of ['none', 'delayed', undefined]) {
    assert.deepEqual(resolveFlightView({ status }), CARD, String(status));
  }
});

test('화면 결정: 착륙(touchdown)은 landed 가 아니다. 안내 상자가 아니라 카드 + 말풍선 교체', () => {
  assert.deepEqual(resolveFlightView({ status: 'touchdown', landed: false }), TOUCHDOWN_CARD);
});

const NOW = toMs('2026-10-30 14:00');
const drive = { minutes: 60 };
const buffers = { airportBufferMin: 20, meetupMin: 40 };

test('도착한 편으로 카드 값을 계산해도 "landed" 배지 키가 나오지 않아 renderBadge 가 던지지 않는다', () => {
  const arrivedFlight = {
    scheduled: NOW + minutes(300), changed: null, fetchedAt: NOW, receivedAt: NOW, status: 'arrived', landed: true,
  };
  const vm = buildResultViewModel({ flight: arrivedFlight, drive, buffers, now: NOW });
  assert.notEqual(vm.badgeKey, 'landed');
  assert.doesNotThrow(() => renderBadge(vm.badgeKey));
});

test('lastConfirmedAt: 응답을 받은 시각이 우선이고, 서버 시각은 예전 저장값에만 대신 쓴다', () => {
  assert.equal(lastConfirmedAt({ receivedAt: 200, fetchedAt: 100 }), 200);
  assert.equal(lastConfirmedAt({ fetchedAt: 100 }), 100);
  assert.equal(lastConfirmedAt({}), null);
});

test('오래됨 판단은 서버 시각(fetchedAt)이 아니라 응답을 받은 시각(receivedAt)을 쓴다', () => {
  const base = { scheduled: NOW + minutes(300), changed: null, status: 'none' };
  // 서버 시계가 기기보다 한 시간 뒤처진 것처럼 보이는 응답: fetchedAt 은 한 시간 전, 응답은 방금 받았다.
  const skewed = buildResultViewModel({
    flight: { ...base, fetchedAt: NOW - minutes(60), receivedAt: NOW }, drive, buffers, now: NOW,
  });
  assert.equal(skewed.stale, false);
  assert.notEqual(skewed.badgeKey, 'stale');
  assert.equal(skewed.checkedText, '13:00'); // 표시는 서버가 적은 확인 시각 그대로

  const old = buildResultViewModel({
    flight: { ...base, fetchedAt: NOW, receivedAt: NOW - minutes(11) }, drive, buffers, now: NOW,
  });
  assert.equal(old.stale, true);
  assert.equal(old.badgeKey, 'stale');
});
