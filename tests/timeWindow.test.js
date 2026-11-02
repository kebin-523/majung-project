// 시간대로 찾기의 순수 함수(public/js/domain/timeWindow.js). 시각은 한국 시각 기준이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clampToHour, defaultWindow, readSavedWindow, toHhmm } from '../public/js/domain/timeWindow.js';

const at = (h, mi) => Date.UTC(2026, 9, 31, h - 9, mi); // 2026-10-31 h:mi KST

test('defaultWindow: 오늘은 현재 시(한국 시각)부터 1시간', () => {
  assert.deepEqual(defaultWindow(at(17, 30), '2026-10-31', '2026-10-31'), { fromHour: 17, toHour: 18 });
});

test('defaultWindow: 밤 23시대는 23~24', () => {
  assert.deepEqual(defaultWindow(at(23, 10), '2026-10-31', '2026-10-31'), { fromHour: 23, toHour: 24 });
});

test('defaultWindow: 오늘이 아닌 날은 9~10', () => {
  assert.deepEqual(defaultWindow(at(17, 30), '2026-11-02', '2026-10-31'), { fromHour: 9, toHour: 10 });
});

test('clampToHour: 종료가 시작 이하면 시작+1', () => {
  assert.equal(clampToHour(10, 10), 11);
  assert.equal(clampToHour(10, 8), 11);
});

test('clampToHour: 폭이 3시간을 넘으면 시작+3', () => {
  assert.equal(clampToHour(10, 15), 13);
});

test('clampToHour: 시작 22 에 종료 24 는 그대로, 시작 23 은 24 로', () => {
  assert.equal(clampToHour(22, 24), 24);
  assert.equal(clampToHour(23, 23), 24);
  assert.equal(clampToHour(22, 23), 23);
});

test('toHhmm: 정시를 HHMM 문자열로 (24 는 2400)', () => {
  assert.equal(toHhmm(9), '0900');
  assert.equal(toHhmm(24), '2400');
});

test('readSavedWindow: 시간대로 찾았을 때 저장한 값만 되살린다', () => {
  assert.deepEqual(readSavedWindow({ mode: 'window', from: '1700', to: '1800' }), { fromHour: 17, toHour: 18 });
});

test('readSavedWindow: 편명 검색이 남긴 값, 이전 버전 값(mode 없음)은 쓰지 않는다', () => {
  assert.equal(readSavedWindow({ mode: 'flightNo', from: '1700', to: '1800' }), null);
  assert.equal(readSavedWindow({ from: '1700', to: '1800' }), null);
  assert.equal(readSavedWindow(undefined), null);
});

test('readSavedWindow: 깨졌거나 범위를 벗어난 값은 null', () => {
  for (const [from, to] of [['NaN00', '1800'], ['1700', '1700'], ['1700', '2100'], ['2400', '2400'], ['1700', undefined], ['2500', '2600']]) {
    assert.equal(readSavedWindow({ mode: 'window', from, to }), null, `${from}~${to}`);
  }
});

// 시간 목록 (시간 선택 패널)
import { formatHour, fromHourOptions, toHourOptions } from '../public/js/domain/timeWindow.js';

test('formatHour: 두 자리 24시간제, 24 는 "24:00"', () => {
  assert.equal(formatHour(0), '00:00');
  assert.equal(formatHour(9), '09:00');
  assert.equal(formatHour(24), '24:00');
});

test('fromHourOptions: 0~23시 24개', () => {
  const options = fromHourOptions();
  assert.equal(options.length, 24);
  assert.deepEqual(options[0], { hour: 0, label: '00:00' });
  assert.deepEqual(options[23], { hour: 23, label: '23:00' });
});

test('toHourOptions: 시작 다음 시각부터 최대 3시간 뒤까지', () => {
  assert.deepEqual(toHourOptions(17).map((o) => o.hour), [18, 19, 20]);
  assert.equal(toHourOptions(17)[0].label, '18:00');
});

test('toHourOptions: 24시까지만, 자정을 넘기지 않는다', () => {
  assert.deepEqual(toHourOptions(22).map((o) => o.hour), [23, 24]);
  assert.deepEqual(toHourOptions(23).map((o) => o.hour), [24]);
  assert.equal(toHourOptions(23)[0].label, '24:00');
});
