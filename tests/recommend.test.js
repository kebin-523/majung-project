import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_AIRPORT_BUFFER_MIN, DEFAULT_MEETUP_MIN } from '../public/js/config.js';
import { latestArrival, recommendDeparture } from '../public/js/domain/recommend.js';
import { formatClock, minutes, toMs } from '../public/js/domain/time.js';

test('기본 계산: (도착 + 입국 후 만남) − 공항 도착 여유 − 이동', () => {
  const { departureMs, terminalArrivalMs, meetAtMs } = recommendDeparture({
    arrival: '2026-10-29 17:50',
    travelMin: 55,
    airportBufferMin: 20,
    meetupMin: 30,
  });
  assert.equal(formatClock(meetAtMs), '18:20'); // 승객을 만날 수 있을 예상 시각 = 도착 + 입국 후 만남
  assert.equal(formatClock(terminalArrivalMs), '18:00'); // 터미널 도착 목표 = 만날 시각 − 공항 도착 여유
  assert.equal(formatClock(departureMs), '17:05'); // 추천 출발 = 터미널 도착 목표 − 이동
});

test('13시 도착, 공항 도착 여유 20분, 입국 후 만남 20분이면 터미널에는 13시에 도착한다 (두 값을 더하지 않는다)', () => {
  const { terminalArrivalMs, meetAtMs, departureMs } = recommendDeparture({
    arrival: '2026-10-29 13:00',
    travelMin: 40,
    airportBufferMin: 20,
    meetupMin: 20,
  });
  assert.equal(formatClock(meetAtMs), '13:20');
  assert.equal(formatClock(terminalArrivalMs), '13:00');
  assert.equal(formatClock(departureMs), '12:20');
});

test('입국 후 만남까지 시간을 늘리면 늦게 출발해도 되고, 공항 도착 여유를 늘리면 일찍 출발해야 한다', () => {
  const base = { arrival: '2026-10-29 13:00', travelMin: 40, airportBufferMin: 20, meetupMin: 20 };
  const standard = recommendDeparture(base);
  const slowerExit = recommendDeparture({ ...base, meetupMin: 40 });
  const earlierWait = recommendDeparture({ ...base, airportBufferMin: 40 });
  assert.equal(slowerExit.departureMs - standard.departureMs, minutes(20)); // 입국이 오래 걸리면 더 늦게
  assert.equal(standard.departureMs - earlierWait.departureMs, minutes(20)); // 더 일찍 와 있고 싶으면 더 일찍
});

test('합계가 맞다: 출발 + 이동 = 터미널 도착, 터미널 도착 + 공항 도착 여유 = 만날 시각, 도착 + 입국 후 만남 = 만날 시각', () => {
  const input = { arrival: '2026-10-29 17:50', travelMin: 55, airportBufferMin: 25, meetupMin: 45 };
  const { departureMs, terminalArrivalMs, meetAtMs } = recommendDeparture(input);
  assert.equal(departureMs + minutes(55), terminalArrivalMs);
  assert.equal(terminalArrivalMs + minutes(25), meetAtMs);
  assert.equal(toMs(input.arrival) + minutes(45), meetAtMs);
});

test('입국 후 만남이 공항 도착 여유보다 길면 터미널 도착이 비행기 도착보다 늦을 수 있다', () => {
  const { terminalArrivalMs } = recommendDeparture({ arrival: '2026-10-29 13:00', travelMin: 30, airportBufferMin: 10, meetupMin: 40 });
  assert.equal(formatClock(terminalArrivalMs), '13:30');
});

test('여유 시간을 생략하면 config.js 기본값을 쓴다', () => {
  const arrival = toMs('2026-10-29 17:50');
  const { departureMs, terminalArrivalMs, meetAtMs } = recommendDeparture({ arrival, travelMin: 55 });
  assert.equal(meetAtMs, arrival + minutes(DEFAULT_MEETUP_MIN));
  assert.equal(terminalArrivalMs, meetAtMs - minutes(DEFAULT_AIRPORT_BUFFER_MIN));
  assert.equal(departureMs, terminalArrivalMs - minutes(55));
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
  assert.equal(departureMs, toMs('2026-10-29 23:30')); // 00:20 + 30 − 20 = 00:30 에 터미널, 60분 전 출발
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
