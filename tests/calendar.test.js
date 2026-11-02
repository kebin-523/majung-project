// 도착 날짜 달력의 순수 함수(public/js/domain/calendar.js). 날짜는 "YYYY-MM-DD" 문자열이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, addMonths, clampDate, dateRange, isSelectable, monthGrid, monthHasSelectable } from '../public/js/domain/calendar.js';

test('monthGrid: 2026년 10월은 일요일 시작 5주, 그 달이 아닌 칸은 null', () => {
  const grid = monthGrid(2026, 10);
  assert.equal(grid.length, 5);
  assert.ok(grid.every((week) => week.length === 7));
  assert.deepEqual(grid[0], [null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']); // 10/1 은 목요일
  assert.deepEqual(grid[4], ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']);
});

test('monthGrid: 모든 날짜가 한 번씩, 순서대로 들어 있다 (2월 윤년·6주짜리 달 포함)', () => {
  for (const [y, m, days] of [[2028, 2, 29], [2026, 2, 28], [2026, 8, 31]]) {
    const dates = monthGrid(y, m).flat().filter(Boolean);
    assert.equal(dates.length, days, `${y}-${m}`);
    assert.deepEqual(dates, [...dates].sort());
  }
  assert.equal(monthGrid(2026, 8).length, 6); // 8/1 이 토요일, 31일이라 6주
});

test('addDays: 달·해를 넘긴다', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});

test('addMonths: 날짜가 없는 달이면 그 달의 마지막 날로 맞춘다', () => {
  assert.equal(addMonths('2026-10-31', 1), '2026-11-30');
  assert.equal(addMonths('2026-03-31', -1), '2026-02-28');
  assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
  assert.equal(addMonths('2026-01-15', -1), '2025-12-15');
});

test('dateRange: 어제부터 6일 뒤까지 (자정을 넘는 달 경계 포함)', () => {
  assert.deepEqual(dateRange('2026-10-31'), { min: '2026-10-30', max: '2026-11-06' });
});

test('isSelectable: 경계 포함, 범위 밖은 false', () => {
  const range = { min: '2026-10-30', max: '2026-11-06' };
  assert.equal(isSelectable('2026-10-29', range.min, range.max), false);
  assert.equal(isSelectable('2026-10-30', range.min, range.max), true);
  assert.equal(isSelectable('2026-11-06', range.min, range.max), true);
  assert.equal(isSelectable('2026-11-07', range.min, range.max), false);
});

test('clampDate: 범위 안으로 맞춘다', () => {
  assert.equal(clampDate('2026-10-01', '2026-10-30', '2026-11-06'), '2026-10-30');
  assert.equal(clampDate('2026-12-01', '2026-10-30', '2026-11-06'), '2026-11-06');
  assert.equal(clampDate('2026-11-02', '2026-10-30', '2026-11-06'), '2026-11-02');
});

test('monthHasSelectable: 고를 수 있는 날이 있는 달만 true (이동 버튼 비활성 판단)', () => {
  const { min, max } = dateRange('2026-10-31'); // 10/30 ~ 11/06
  assert.equal(monthHasSelectable(2026, 9, min, max), false);
  assert.equal(monthHasSelectable(2026, 10, min, max), true);
  assert.equal(monthHasSelectable(2026, 11, min, max), true);
  assert.equal(monthHasSelectable(2026, 12, min, max), false);
});
