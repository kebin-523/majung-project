import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_AIRPORT_BUFFER_MIN, DEFAULT_MEETUP_MIN } from '../js/config.js';
import { latestArrival, recommendDeparture } from '../js/domain/recommend.js';
import { formatClock, minutes, toMs } from '../js/domain/time.js';

test('기본 계산: 도착 − 이동 − 공항 여유 − 입국 후 만남', () => {
  const { departureMs, totalLeadMin } = recommendDeparture({
    arrival: '2026-10-29 17:50',
    travelMin: 55,
    airportBufferMin: 20,
    meetupMin: 30,
  });
  assert.equal(totalLeadMin, 105);
  assert.equal(formatClock(departureMs), '16:05');
});

test('여유 시간을 생략하면 config.js 기본값을 쓴다', () => {
  const arrival = toMs('2026-10-29 17:50');
  const { departureMs, totalLeadMin } = recommendDeparture({ arrival, travelMin: 55 });
  const expectedLead = 55 + DEFAULT_AIRPORT_BUFFER_MIN + DEFAULT_MEETUP_MIN;
  assert.equal(totalLeadMin, expectedLead);
  assert.equal(departureMs, arrival - minutes(expectedLead));
});

test('여유 시간이 0분이어도 계산된다', () => {
  const { departureMs } = recommendDeparture({
    arrival: '2026-10-29 17:50',
    travelMin: 50,
    airportBufferMin: 0,
    meetupMin: 0,
  });
  assert.equal(formatClock(departureMs), '17:00');
});

test('자정을 넘기면 추천 출발 시각이 전날로 간다', () => {
  const { departureMs } = recommendDeparture({
    arrival: '2026-10-30 00:20',
    travelMin: 60,
    airportBufferMin: 20,
    meetupMin: 30,
  });
  assert.equal(departureMs, toMs('2026-10-29 22:30'));
});

test('변경 도착 시각이 있으면 예정 시각보다 우선한다', () => {
  assert.equal(
    latestArrival({ scheduled: '2026-10-29 17:30', changed: '2026-10-29 17:50' }),
    toMs('2026-10-29 17:50'),
  );
  assert.equal(
    latestArrival({ scheduled: '2026-10-29 17:30', changed: null }),
    toMs('2026-10-29 17:30'),
  );
  assert.equal(latestArrival({ scheduled: '2026-10-29 17:30' }), toMs('2026-10-29 17:30'));
});

test('이동 시간이 바뀌면 결과에 반영된다', () => {
  const base = { arrival: '2026-10-29 17:50', airportBufferMin: 20, meetupMin: 30 };
  const a = recommendDeparture({ ...base, travelMin: 55 });
  const b = recommendDeparture({ ...base, travelMin: 60 });
  assert.equal(a.departureMs - b.departureMs, minutes(5));
});

test('도착이 20분 늦어져도 이동 시간이 5분 늘었다면 출발은 15분만 미뤄진다 (기계적 이동 금지)', () => {
  const base = { airportBufferMin: 20, meetupMin: 30 };
  const before = recommendDeparture({ ...base, arrival: '2026-10-29 17:30', travelMin: 55 });
  const after = recommendDeparture({ ...base, arrival: '2026-10-29 17:50', travelMin: 60 });
  assert.equal(after.departureMs - before.departureMs, minutes(15));
});

test('잘못된 분 값은 오류', () => {
  const ok = { arrival: '2026-10-29 17:50', travelMin: 55 };
  assert.throws(() => recommendDeparture({ ...ok, travelMin: -1 }), RangeError);
  assert.throws(() => recommendDeparture({ ...ok, travelMin: undefined }), RangeError);
  assert.throws(() => recommendDeparture({ ...ok, travelMin: NaN }), RangeError);
  assert.throws(() => recommendDeparture({ ...ok, airportBufferMin: -5 }), RangeError);
  assert.throws(() => recommendDeparture({ ...ok, meetupMin: '30' }), RangeError);
});
