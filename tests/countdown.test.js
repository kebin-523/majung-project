// 추천 출발 시각까지 남은 시간(public/js/domain/countdown.js): "지금" 줄에 쓰는 문구. DOM·시계 접근 없는 순수 함수다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeUntil, durationText } from '../public/js/domain/countdown.js';
import { minutes, toMs } from '../public/js/domain/time.js';

const NOW = toMs('2026-11-01 14:30');

test('durationText: 60분 미만은 분, 그 이상은 시간(+분), 하루 이상은 일(+시간)', () => {
  assert.equal(durationText(1), '1분');
  assert.equal(durationText(54), '54분');
  assert.equal(durationText(60), '1시간');
  assert.equal(durationText(65), '1시간 5분');
  assert.equal(durationText(174), '2시간 54분');
  assert.equal(durationText(24 * 60), '1일');
  assert.equal(durationText(24 * 60 + 3 * 60 + 20), '1일 3시간'); // 하루 이상에서는 분을 쓰지 않는다
});

test('describeUntil: 출발 전이면 "출발까지 …"', () => {
  assert.deepEqual(describeUntil(NOW + minutes(174), NOW), { kind: 'until', minutes: 174, text: '출발까지 2시간 54분' });
  assert.equal(describeUntil(NOW + minutes(54), NOW).text, '출발까지 54분');
  assert.equal(describeUntil(NOW + minutes(60), NOW).text, '출발까지 1시간');
});

test('describeUntil: 분 단위 미만의 남은 시간은 올림한다 (아직 시간이 남았는데 0분이라고 하지 않는다)', () => {
  assert.equal(describeUntil(NOW + minutes(10) + 1_000, NOW).text, '출발까지 11분');
  assert.equal(describeUntil(NOW + 59_000, NOW).kind, 'now'); // 1분이 안 남았다
});

test('describeUntil: 출발할 시각이 되었을 때(1분 안)는 "지금 출발할 시간이에요"', () => {
  assert.deepEqual(describeUntil(NOW, NOW), { kind: 'now', minutes: 0, text: '지금 출발할 시간이에요' });
  assert.equal(describeUntil(NOW + 30_000, NOW).text, '지금 출발할 시간이에요');
});

test('describeUntil: 출발 시각이 지났으면 "N분 지났어요" (내림, 1분이 안 지났으면 "방금 지났어요")', () => {
  assert.deepEqual(describeUntil(NOW - minutes(17), NOW), { kind: 'passed', minutes: 17, text: '17분 지났어요' });
  assert.equal(describeUntil(NOW - minutes(65), NOW).text, '1시간 5분 지났어요');
  assert.equal(describeUntil(NOW - 20_000, NOW).text, '방금 지났어요');
  assert.equal(describeUntil(NOW - 20_000, NOW).kind, 'passed');
});

test('describeUntil: 하루 이상 남았거나 지났어도 문장이 어색하지 않다', () => {
  assert.equal(describeUntil(NOW + minutes(26 * 60), NOW).text, '출발까지 1일 2시간');
  assert.equal(describeUntil(NOW - minutes(49 * 60), NOW).text, '2일 1시간 지났어요');
});

test('describeUntil: 값이 숫자가 아니면 던진다 (조용히 잘못된 문구를 만들지 않는다)', () => {
  assert.throws(() => describeUntil(Number.NaN, NOW), TypeError);
  assert.throws(() => describeUntil(NOW, undefined), TypeError);
});
