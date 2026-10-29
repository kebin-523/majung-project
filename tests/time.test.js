import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dayLabel, formatClock, formatClockWithDay, formatSpoken, formatSpokenWithDay, isSameDayKst, partsKst, toMs,
} from '../js/domain/time.js';

test('toMs: 형식만 다른 같은 시각은 같은 값이 된다', () => {
  const a = toMs('2026-10-29 17:50');
  assert.equal(toMs('2026-10-29T17:50'), a);
  assert.equal(toMs('2026-10-29T17:50:00+09:00'), a);
  assert.equal(toMs('2026-10-29T08:50:00Z'), a);
  assert.equal(toMs(new Date(a)), a);
  assert.equal(toMs(a), a);
});

test('toMs: 해석할 수 없는 값은 오류', () => {
  assert.throws(() => toMs('abc'), TypeError);
  assert.throws(() => toMs(undefined), TypeError);
  assert.throws(() => toMs(NaN), TypeError);
});

test('Asia/Seoul 기준으로 표시한다 (UTC 값이 들어와도)', () => {
  // 2026-10-29 15:30 UTC = 2026-10-30 00:30 KST
  const ms = toMs('2026-10-29T15:30:00Z');
  assert.deepEqual(partsKst(ms), { y: 2026, m: 10, d: 30, h: 0, mi: 30 });
  assert.equal(formatClock(ms), '00:30');
});

test('formatClock: 24시간제, 숫자 두 자리', () => {
  assert.equal(formatClock('2026-10-29 17:10'), '17:10');
  assert.equal(formatClock('2026-10-29 05:07'), '05:07');
  assert.equal(formatClock('2026-10-29 00:00'), '00:00');
});

test('formatSpoken: 화면 읽기용 12시간제', () => {
  assert.equal(formatSpoken('2026-10-29 17:10'), '오후 5시 10분');
  assert.equal(formatSpoken('2026-10-29 17:00'), '오후 5시');
  assert.equal(formatSpoken('2026-10-29 00:05'), '오전 12시 5분');
  assert.equal(formatSpoken('2026-10-29 12:00'), '오후 12시');
  assert.equal(formatSpoken('2026-10-29 09:30'), '오전 9시 30분');
});

test('dayLabel: 오늘 / 내일 / 월일', () => {
  const now = '2026-10-29 18:42';
  assert.equal(dayLabel('2026-10-29 23:59', now), '오늘');
  assert.equal(dayLabel('2026-10-30 00:00', now), '내일');
  assert.equal(dayLabel('2026-10-31 09:00', now), '10월 31일');
  assert.equal(dayLabel('2026-10-28 23:00', now), '10월 28일');
});

test('formatClockWithDay / formatSpokenWithDay: 다른 날일 때만 날짜 라벨을 붙인다', () => {
  const now = '2026-10-29 14:00';
  assert.equal(formatClockWithDay('2026-10-29 17:50', now), '17:50');
  assert.equal(formatClockWithDay('2026-10-30 00:20', now), '내일 00:20');
  assert.equal(formatSpokenWithDay('2026-10-29 17:50', now), '오후 5시 50분');
  assert.equal(formatSpokenWithDay('2026-10-30 00:20', now), '내일 오전 12시 20분');
});

test('dayLabel: 자정 전후는 한국 달력 날짜로 구분한다', () => {
  // 한국 23:30(UTC 14:30)과 한국 00:10(UTC 15:10)은 UTC로는 같은 날이지만 한국에서는 다른 날
  const late = '2026-10-29T14:30:00Z';
  const early = '2026-10-29T15:10:00Z';
  assert.equal(isSameDayKst(late, early), false);
  assert.equal(dayLabel(early, late), '내일');
});
