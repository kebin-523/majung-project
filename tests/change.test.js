import test from 'node:test';
import assert from 'node:assert/strict';
import { changeId, detectArrivalChange, shouldAnnounce, summarizeChange } from '../public/js/domain/change.js';
import { minutes } from '../public/js/domain/time.js';
import { toMs } from '../public/js/domain/time.js';

const flight = (extra) => ({ flightId: 'KE123@2026-10-29', scheduled: '2026-10-29 17:30', ...extra });

test('값이 같으면 변경 아님', () => {
  assert.equal(detectArrivalChange(flight(), flight()), null);
});

test('형식만 다른 같은 시각은 변경이 아니다', () => {
  const prev = flight({ scheduled: '2026-10-29 17:30' });
  const next = flight({ scheduled: '2026-10-29T17:30:00+09:00' });
  assert.equal(detectArrivalChange(prev, next), null);

  const nextUtc = flight({ scheduled: '2026-10-29T08:30:00Z' });
  assert.equal(detectArrivalChange(prev, nextUtc), null);
});

test('변경 도착 시각이 생기면 변경으로 감지한다', () => {
  const change = detectArrivalChange(flight(), flight({ changed: '2026-10-29 17:50' }));
  assert.equal(change.fromMs, toMs('2026-10-29 17:30'));
  assert.equal(change.toMs, toMs('2026-10-29 17:50'));
});

test('변경 도착 시각이 예정 시각과 같으면 변경이 아니다', () => {
  assert.equal(detectArrivalChange(flight(), flight({ changed: '2026-10-29 17:30' })), null);
});

test('변경된 시각이 다시 바뀌면 새 변경으로 감지한다', () => {
  const prev = flight({ changed: '2026-10-29 17:50' });
  const next = flight({ changed: '2026-10-29 18:10' });
  const change = detectArrivalChange(prev, next);
  assert.equal(change.fromMs, toMs('2026-10-29 17:50'));
  assert.equal(change.toMs, toMs('2026-10-29 18:10'));
});

test('날짜가 바뀌는 변경도 감지한다', () => {
  const prev = flight({ scheduled: '2026-10-29 23:50' });
  const next = flight({ scheduled: '2026-10-29 23:50', changed: '2026-10-30 00:20' });
  assert.notEqual(detectArrivalChange(prev, next), null);
});

test('같은 변경은 같은 식별값을 갖고, 이미 안내했다면 다시 안내하지 않는다', () => {
  const a = detectArrivalChange(flight(), flight({ changed: '2026-10-29 17:50' }));
  const b = detectArrivalChange(flight(), flight({ changed: '2026-10-29T17:50:00+09:00' }));
  assert.equal(a.id, b.id);

  assert.equal(shouldAnnounce(a, null), true);
  assert.equal(shouldAnnounce(a, a.id), false);
  assert.equal(shouldAnnounce(null, null), false);

  const c = detectArrivalChange(flight(), flight({ changed: '2026-10-29 18:10' }));
  assert.equal(shouldAnnounce(c, a.id), true);
});

test('changeId는 항공편·이전 값·새 값으로 만든다', () => {
  assert.notEqual(changeId('A', 1, 2), changeId('B', 1, 2));
  assert.notEqual(changeId('A', 1, 2), changeId('A', 1, 3));
});

test('서로 다른 항공편은 비교할 수 없다', () => {
  assert.throws(() => detectArrivalChange(flight(), { ...flight(), flightId: 'OZ555@2026-10-29' }));
});

const buffers = { airportBufferMin: 20, meetupMin: 40 };
const changedFlight = flight({ changed: '2026-10-29 17:50' });

test('summarizeChange: 도착이 그대로면 null', () => {
  assert.equal(summarizeChange({ prev: flight(), next: flight(), prevTravelMin: 55, nextTravelMin: null, buffers }), null);
});

test('summarizeChange: 이동 시간을 다시 조회하면 도착이 20분 늦어져도 출발은 15분만 밀린다', () => {
  const s = summarizeChange({ prev: flight(), next: changedFlight, prevTravelMin: 55, nextTravelMin: 60, buffers });
  assert.equal(s.arrival.toMs - s.arrival.fromMs, minutes(20));
  assert.equal(s.departure.toMs - s.departure.fromMs, minutes(15));
  assert.deepEqual(s.travel, { fromMin: 55, toMin: 60, rechecked: true });
});

test('summarizeChange: 이동 시간을 다시 조회하지 못하면 이전 이동 시간을 쓰고 재조회로 표시하지 않는다', () => {
  const s = summarizeChange({ prev: flight(), next: changedFlight, prevTravelMin: 55, nextTravelMin: null, buffers });
  assert.equal(s.departure.toMs - s.departure.fromMs, minutes(20));
  assert.deepEqual(s.travel, { fromMin: 55, toMin: 55, rechecked: false });
});

test('summarizeChange: 다시 조회했지만 이동 시간이 같으면 rechecked는 true, 값은 그대로', () => {
  const s = summarizeChange({ prev: flight(), next: changedFlight, prevTravelMin: 55, nextTravelMin: 55, buffers });
  assert.deepEqual(s.travel, { fromMin: 55, toMin: 55, rechecked: true });
});

test('summarizeChange: id는 detectArrivalChange와 같다 (중복 안내 방지에 쓴다)', () => {
  const s = summarizeChange({ prev: flight(), next: changedFlight, prevTravelMin: 55, nextTravelMin: 60, buffers });
  assert.equal(s.id, detectArrivalChange(flight(), changedFlight).id);
});
