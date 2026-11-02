// 자동 재확인 상태(domain/autoRecheck.js)와 result.js 의 60초 틱 배선을 같은 규칙으로 흉내 내어 확인한다. DOM 접근 없음.
// 틱마다: 이미 확인 중이 아니고 due 이면 started() 후 확인한다. 성공하면 succeeded() 와 함께 응답을 받은 시각을 갱신하고, 실패하면 그대로 둔다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutoRecheck } from '../public/js/domain/autoRecheck.js';
import { STALE_AFTER_MIN } from '../public/js/config.js';
import { lastConfirmedAt } from '../public/js/domain/status.js';
import { minutes, toMs } from '../public/js/domain/time.js';

const START = toMs('2026-10-30 14:00');
const TICK = minutes(1); // STATUS_RECHECK_INTERVAL_MS 와 같은 60초

/**
 * 화면을 연 뒤 hours 시간 동안의 호출 횟수와 시각을 센다.
 * @param {object} options
 * @param {(call: number) => boolean} options.succeeds   n번째 확인(화면을 열 때가 1번째)의 성공 여부
 * @param {number} [options.serverOffsetMs]              서버가 적은 fetchedAt 이 기기 시계보다 이만큼 앞선(+)·뒤처진(−) 값. 오래됨 판단에는 영향이 없어야 한다
 */
function simulate({ succeeds, serverOffsetMs = 0, hours = 6, openSucceeds = succeeds(1) }) {
  const policy = createAutoRecheck();
  let now = START;
  let flight = { fetchedAt: now + serverOffsetMs, receivedAt: now - minutes(3) }; // 저장돼 있던 값
  const calls = [];

  const confirm = () => {
    calls.push(now);
    if (succeeds(calls.length)) {
      flight = { fetchedAt: now + serverOffsetMs, receivedAt: now };
      policy.succeeded();
    }
  };

  // 화면을 열 때의 확인 (자동 시도 1회로 센다)
  calls.push(now);
  if (openSucceeds) {
    flight = { fetchedAt: now + serverOffsetMs, receivedAt: now };
    policy.succeeded();
  }

  for (let t = 0; t < hours * 60; t += 1) {
    now += TICK;
    if (policy.due({ now, receivedAt: lastConfirmedAt(flight) })) {
      policy.started();
      confirm();
    }
  }
  return calls;
}

const gaps = (calls) => calls.slice(1).map((time, i) => time - calls[i]);

test('열 때의 확인이 실패하면(missing·error·quota·timeout 모두) 자동 재확인은 더 가지 않는다', () => {
  const calls = simulate({ succeeds: () => false });
  assert.equal(calls.length, 1); // 화면을 열 때의 1회뿐
});

test('열 때는 성공하고 자동 재확인이 실패하면 그 한 번으로 멈춘다', () => {
  const calls = simulate({ succeeds: (n) => n === 1 });
  assert.equal(calls.length, 2);
});

test('성공이 이어지면 응답을 받은 뒤 10분이 지날 때마다 한 번씩만 간다', () => {
  const calls = simulate({ succeeds: () => true, hours: 6 });
  const minGap = minutes(STALE_AFTER_MIN);
  assert.ok(gaps(calls).every((gap) => gap > minGap), `간격이 ${STALE_AFTER_MIN}분보다 길어야 해요: ${gaps(calls)}`);
  // 6시간 = 360분, 간격 11분(10분 초과 + 1분 틱)이면 열 때의 1회를 빼고 32번 안팎
  assert.ok(calls.length - 1 >= 30 && calls.length - 1 <= 33, `자동 재확인 ${calls.length - 1}번`);
});

test('서버 시계가 기기보다 한 시간 앞서거나 뒤처져도 성공 직후 곧바로 다시 가지 않는다 (1분마다 반복 금지)', () => {
  const plain = simulate({ succeeds: () => true });
  for (const serverOffsetMs of [minutes(60), minutes(-60), minutes(10), minutes(-10)]) {
    const calls = simulate({ succeeds: () => true, serverOffsetMs });
    assert.equal(calls.length, plain.length, `서버 시각 차이 ${serverOffsetMs / 60000}분`);
    assert.ok(gaps(calls).every((gap) => gap > minutes(STALE_AFTER_MIN)));
  }
});

test('실패한 뒤 사용자가 다시 시도해 성공하면(succeeded) 다시 오래되었을 때 한 번 더 자동으로 확인한다', () => {
  const policy = createAutoRecheck();
  const receivedAt = START;
  const later = START + minutes(STALE_AFTER_MIN) + 1;
  assert.equal(policy.due({ now: later, receivedAt }), false); // 열 때 시도한 것으로 센다
  policy.succeeded(); // 사용자의 "다시 시도"가 성공
  assert.equal(policy.due({ now: later, receivedAt }), true);
  policy.started();
  assert.equal(policy.due({ now: later + TICK, receivedAt }), false); // 이번에는 실패해 시도한 상태로 남는다
});

test('아직 오래되지 않았으면(기준 시간 정각 포함) 가지 않는다', () => {
  const policy = createAutoRecheck();
  policy.succeeded();
  assert.equal(policy.due({ now: START + minutes(STALE_AFTER_MIN), receivedAt: START }), false);
  assert.equal(policy.due({ now: START + minutes(STALE_AFTER_MIN) + 1, receivedAt: START }), true);
});
