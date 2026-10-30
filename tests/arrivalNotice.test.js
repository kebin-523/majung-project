import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EARLY_NOTICE_MIN, LATE_NOTICE_MIN } from '../public/js/config.js';
import { arrivalDiffNotice } from '../public/js/domain/arrivalNotice.js';
import { normalizeArrivalsBody } from '../server/icn/normalizeArrivals.js';
import { blockNetwork } from './helpers/blockNetwork.js';
import { FIXTURES, loadFixture } from './helpers/fixtures.js';

blockNetwork();

const forecast = (scheduleDiffMinutes) => ({ scheduleDiffMinutes, estimateBasis: 'forecast' });

test('기준 값: 일찍 10분, 늦게 15분 (가정, 제품 판단)', () => {
  assert.equal(EARLY_NOTICE_MIN, 10);
  assert.equal(LATE_NOTICE_MIN, 15);
});

test('일찍: -10 이하부터 안내하고 경계(-10)를 포함한다', () => {
  assert.equal(arrivalDiffNotice(forecast(-11)), 'early');
  assert.equal(arrivalDiffNotice(forecast(-10)), 'early');
  assert.equal(arrivalDiffNotice(forecast(-9)), null);
});

test('늦게: +15 이상부터 안내하고 경계(+15)를 포함한다', () => {
  assert.equal(arrivalDiffNotice(forecast(14)), null);
  assert.equal(arrivalDiffNotice(forecast(15)), 'late');
  assert.equal(arrivalDiffNotice(forecast(16)), 'late');
});

test('예정과 같거나 조금 다르면 안내하지 않는다', () => {
  for (const diff of [0, 1, -1, 5, -5, 14, -9]) assert.equal(arrivalDiffNotice(forecast(diff)), null, String(diff));
});

test('변경 시각이 없으면(null) 안내하지 않는다', () => {
  for (const diff of [null, undefined, NaN, Infinity, '15']) assert.equal(arrivalDiffNotice(forecast(diff)), null, String(diff));
});

test('착륙 전 예상(forecast)이 아니면 기준을 넘어도 항상 null', () => {
  for (const estimateBasis of ['touchdown', 'recorded', 'unknown', undefined, 'delayed']) {
    assert.equal(arrivalDiffNotice({ scheduleDiffMinutes: 40, estimateBasis }), null, `late ${estimateBasis}`);
    assert.equal(arrivalDiffNotice({ scheduleDiffMinutes: -40, estimateBasis }), null, `early ${estimateBasis}`);
  }
});

test('기준 값은 인자로 바꿀 수 있고, 잘못된 값은 오류', () => {
  assert.equal(arrivalDiffNotice(forecast(-5), { earlyMin: 5, lateMin: 30 }), 'early');
  assert.equal(arrivalDiffNotice(forecast(20), { earlyMin: 5, lateMin: 30 }), null);
  assert.equal(arrivalDiffNotice(forecast(30), { earlyMin: 5, lateMin: 30 }), 'late');
  for (const bad of [0, -1, NaN, '10', null]) {
    assert.throws(() => arrivalDiffNotice(forecast(0), { earlyMin: bad }), RangeError, `earlyMin ${bad}`);
    assert.throws(() => arrivalDiffNotice(forecast(0), { lateMin: bad }), RangeError, `lateMin ${bad}`);
  }
});

test('실제 샘플 변환 결과와 이어 쓴다 (착륙 전 / 착륙 / 도착)', () => {
  const options = { fetchedAt: Date.UTC(2026, 9, 30, 2, 0) };
  const before = normalizeArrivalsBody(loadFixture(FIXTURES.beforeLanding), options).data;
  const ze606 = before.find((f) => f.flightNo === 'ZE606'); // 25분 일찍, 착륙 전
  const tw614 = before.find((f) => f.flightNo === 'TW614'); // 예정과 같음
  assert.equal(arrivalDiffNotice(ze606), 'early');
  assert.equal(arrivalDiffNotice(tw614), null);

  // 착륙 전 편이 16분 늦으면 late
  assert.equal(arrivalDiffNotice({ ...tw614, scheduleDiffMinutes: 16 }), 'late');

  // 같은 변경 시각이라도 착륙·도착 이후에는 안내하지 않는다
  const touchdown = normalizeArrivalsBody(loadFixture(FIXTURES.touchdown), options).data;
  const arrived = normalizeArrivalsBody(loadFixture(FIXTURES.arrived), options).data;
  assert.equal(arrivalDiffNotice({ ...touchdown[0], scheduleDiffMinutes: 40 }), null);
  assert.equal(arrivalDiffNotice({ ...arrived, scheduleDiffMinutes: -40 }), null);
});

test('안내 기준은 추천 출발 시각 계산과 변경 감지에 쓰이지 않는다', () => {
  for (const name of ['recommend.js', 'change.js']) {
    const source = readFileSync(new URL(`../public/js/domain/${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /NOTICE_MIN|arrivalNotice|arrivalDiffNotice/, `${name} 이 안내 기준을 쓰고 있어요`);
  }
});

test('arrivalNotice.js 는 브라우저 전용 기능을 쓰지 않는다 (서버·테스트에서도 불러올 수 있는 순수 규칙 코드)', () => {
  const source = readFileSync(new URL('../public/js/domain/arrivalNotice.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(window|document|localStorage|sessionStorage|navigator|location)\b/);
});
