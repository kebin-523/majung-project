import test from 'node:test';
import assert from 'node:assert/strict';
import { BADGE_PRIORITY, SOON_THRESHOLD_MIN, STALE_AFTER_MIN } from '../js/config.js';
import { isStale, resolveBadge, shouldAutoRecheck } from '../js/domain/status.js';
import { minutes, toMs } from '../js/domain/time.js';

const NOW = toMs('2026-10-29 15:00');
const fresh = NOW - minutes(1);

const badge = (overrides) =>
  resolveBadge({ now: NOW, departure: NOW + minutes(SOON_THRESHOLD_MIN + 30), lastChecked: fresh, ...overrides });

test('출발까지 충분하면 "여유 있어요"', () => {
  assert.equal(badge({}), 'relaxed');
});

test('출발 기준 시간 전부터 "곧 출발" (경계 포함)', () => {
  assert.equal(badge({ departure: NOW + minutes(SOON_THRESHOLD_MIN + 1) }), 'relaxed');
  assert.equal(badge({ departure: NOW + minutes(SOON_THRESHOLD_MIN) }), 'soon');
  assert.equal(badge({ departure: NOW + minutes(1) }), 'soon');
});

test('출발 시각 정각까지는 아직 "곧 출발", 1분이라도 지나면 "지남"', () => {
  assert.equal(badge({ departure: NOW }), 'soon');
  assert.equal(badge({ departure: NOW - minutes(1) }), 'passed');
});

test('마지막 확인 후 기준 시간을 넘기면 "오래됨" (경계는 넘어야 해당)', () => {
  assert.equal(badge({ lastChecked: NOW - minutes(STALE_AFTER_MIN) }), 'relaxed');
  assert.equal(badge({ lastChecked: NOW - minutes(STALE_AFTER_MIN) - 1 }), 'stale');
});

test('isStale: 기준 시간을 넘겨야 오래된 것이고, 배지와 같은 기준을 쓴다', () => {
  assert.equal(isStale({ now: NOW, lastChecked: NOW - minutes(STALE_AFTER_MIN) }), false);
  assert.equal(isStale({ now: NOW, lastChecked: NOW - minutes(STALE_AFTER_MIN) - 1 }), true);
  assert.equal(isStale({ now: NOW, lastChecked: null }), true);
  assert.equal(isStale({ now: NOW, lastChecked: NOW + minutes(1) }), false);
});

test('shouldAutoRecheck: 오래됐고 아직 자동으로 시도하지 않았을 때만 참', () => {
  const stale = NOW - minutes(STALE_AFTER_MIN) - 1;
  assert.equal(shouldAutoRecheck({ now: NOW, lastChecked: stale, alreadyTried: false }), true);
  assert.equal(shouldAutoRecheck({ now: NOW, lastChecked: null, alreadyTried: false }), true);
});

test('shouldAutoRecheck: 이미 자동으로 시도했다면(실패했다면) 반복하지 않는다', () => {
  const stale = NOW - minutes(STALE_AFTER_MIN) - 1;
  assert.equal(shouldAutoRecheck({ now: NOW, lastChecked: stale, alreadyTried: true }), false);
});

test('shouldAutoRecheck: 아직 오래되지 않았으면(기준 시간 정각 포함) 하지 않는다', () => {
  assert.equal(shouldAutoRecheck({ now: NOW, lastChecked: NOW - minutes(STALE_AFTER_MIN), alreadyTried: false }), false);
  assert.equal(shouldAutoRecheck({ now: NOW, lastChecked: fresh, alreadyTried: false }), false);
});

test('shouldAutoRecheck: 오래됨 기준은 isStale과 같다 (간격은 STALE_AFTER_MIN 재사용)', () => {
  for (const age of [0, 5, STALE_AFTER_MIN, STALE_AFTER_MIN + 1, 60]) {
    const lastChecked = NOW - minutes(age);
    assert.equal(shouldAutoRecheck({ now: NOW, lastChecked, alreadyTried: false }), isStale({ now: NOW, lastChecked }));
  }
});

test('확인한 적이 없으면 "오래됨"으로 본다', () => {
  assert.equal(badge({ lastChecked: null }), 'stale');
});

test('확인하지 않은 변경이 있으면 "변경"', () => {
  assert.equal(badge({ hasUnseenChange: true }), 'changed');
});

test('이미 도착한 항공편은 다른 상태보다 먼저 처리한다', () => {
  assert.equal(badge({ landed: true, hasUnseenChange: true, lastChecked: null }), 'landed');
});

test('겹치면 config.js의 우선순위를 따른다: 지남 > 오래됨 > 변경 > 곧 출발 > 여유', () => {
  assert.deepEqual(BADGE_PRIORITY, ['passed', 'stale', 'changed', 'soon', 'relaxed']);

  const soon = NOW + minutes(10);
  const stale = NOW - minutes(STALE_AFTER_MIN + 5);

  assert.equal(badge({ departure: NOW - minutes(5), lastChecked: stale, hasUnseenChange: true }), 'passed');
  assert.equal(badge({ departure: soon, lastChecked: stale, hasUnseenChange: true }), 'stale');
  assert.equal(badge({ departure: soon, hasUnseenChange: true }), 'changed');
  assert.equal(badge({ departure: soon }), 'soon');
});
