import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseKstDateTime, toKstDateString } from '../server/icn/kst.js';
import { blockNetwork } from './helpers/blockNetwork.js';

blockNetwork();

test('parseKstDateTime: 12자리를 한국 시각으로 해석한다 (11:00 KST = 02:00 UTC)', () => {
  assert.equal(parseKstDateTime('202610301100'), Date.UTC(2026, 9, 30, 2, 0));
  assert.equal(parseKstDateTime('202610302359'), Date.UTC(2026, 9, 30, 14, 59));
});

test('parseKstDateTime: 한국 자정 직후는 UTC로는 전날이다', () => {
  assert.equal(parseKstDateTime('202610300020'), Date.UTC(2026, 9, 29, 15, 20));
  assert.equal(parseKstDateTime('202610300000'), Date.UTC(2026, 9, 29, 15, 0));
});

test('parseKstDateTime: 윤년의 2월 29일은 되고 평년은 안 된다', () => {
  assert.equal(parseKstDateTime('202402291200'), Date.UTC(2024, 1, 29, 3, 0));
  assert.equal(parseKstDateTime('202302291200'), null);
});

test('parseKstDateTime: 잘못된 값은 null', () => {
  const invalid = [
    '', '  ', null, undefined, 202610301100, {},
    '20261030110', '2026103011000',        // 자리 수
    ' 202610301100', '202610301100 ',      // 앞뒤 공백
    '2026-10-30 11:00', 'abcdefghijkl',    // 숫자가 아님
    '202613301100',                        // 13월
    '202600301100',                        // 0월
    '202610001100', '202610321100',        // 0일, 32일
    '202602301100', '202604311100',        // 달력에 없는 날
    '202610302400', '202610302500',        // 24시: 샘플에 없는 형식이라 무효로 둔다
    '202610301160',                        // 60분
  ];
  for (const value of invalid) assert.equal(parseKstDateTime(value), null, `null 이어야 해요: ${JSON.stringify(value)}`);
});

test('toKstDateString: UTC 날짜가 아니라 한국 달력 날짜를 돌려준다', () => {
  assert.equal(toKstDateString(Date.UTC(2026, 9, 29, 15, 20)), '2026-10-30'); // 한국 00:20
  assert.equal(toKstDateString(Date.UTC(2026, 9, 29, 14, 59)), '2026-10-29'); // 한국 23:59
  assert.equal(toKstDateString(parseKstDateTime('202601010000')), '2026-01-01');
  assert.equal(toKstDateString(parseKstDateTime('202512312359')), '2025-12-31');
});

test('toKstDateString: 숫자가 아니면 오류', () => {
  for (const value of [NaN, Infinity, '1', null, undefined]) {
    assert.throws(() => toKstDateString(value), TypeError);
  }
});

test('컴퓨터 시간대를 바꿔도 결과가 같다 (실행 중에 TZ 를 바꿔 가며 확인)', () => {
  const original = process.env.TZ;
  const sample = () => [
    parseKstDateTime('202610300020'),
    toKstDateString(parseKstDateTime('202610300020')),
    parseKstDateTime('202402291200'),
    toKstDateString(parseKstDateTime('202512312359')),
  ];
  const hourIn = (tz) => {
    process.env.TZ = tz;
    return new Date(Date.UTC(2026, 9, 30, 2, 0)).getHours();
  };
  try {
    // TZ 변경이 실제로 적용되는지 먼저 확인한다. 적용되지 않으면 아래 비교는 아무것도 증명하지 못한다.
    assert.notEqual(hourIn('UTC'), hourIn('America/Los_Angeles'), '이 환경에서는 TZ 변경이 적용되지 않아요');

    const results = ['Asia/Seoul', 'UTC', 'America/Los_Angeles', 'Pacific/Auckland'].map((tz) => {
      process.env.TZ = tz;
      return sample();
    });
    for (const result of results) assert.deepEqual(result, results[0]);
    assert.equal(results[0][1], '2026-10-30');
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test('server/icn 은 컴퓨터의 시간대에 따라 달라지는 함수를 쓰지 않는다 (UTC 기준 함수만 사용)', () => {
  const local = /\b(getFullYear|getMonth|getDate|getDay|getHours|getMinutes|getTimezoneOffset|toLocale\w*|Intl\.)/;
  for (const name of ['kst.js', 'classifyError.js', 'normalizeArrivals.js']) {
    const source = readFileSync(new URL(`../server/icn/${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, local, `${name} 에 지역 시간대 함수가 있어요`);
  }
});
