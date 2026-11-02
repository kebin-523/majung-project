import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { clockNow, clockToday, isScenarioMode } from '../public/js/clock.js';
import { SCENARIOS, todayKst } from '../public/js/mock/scenarios.js';
import { partsKst } from '../public/js/domain/time.js';

afterEach(() => {
  delete globalThis.location;
});

test('알려진 ?scenario= 가 있을 때만 시나리오 모드다', () => {
  assert.equal(isScenarioMode(''), false);
  assert.equal(isScenarioMode('?foo=1'), false);
  assert.equal(isScenarioMode('?scenario='), false);
  assert.equal(isScenarioMode('?scenario=bogus'), false); // 알 수 없는 이름은 실제 모드
  for (const name of SCENARIOS) assert.equal(isScenarioMode(`?scenario=${name}`), true, name);
  assert.ok(SCENARIOS.includes('touchdown') && SCENARIOS.includes('unknown'));
});

test('실제 모드는 실제 시각, 시나리오 모드는 데모 시계(14:00 근처)를 쓴다', () => {
  globalThis.location = { search: '' };
  assert.ok(Math.abs(clockNow() - Date.now()) < 1000);

  globalThis.location = { search: '?scenario=normal' };
  assert.equal(partsKst(clockNow()).h, 14);

  globalThis.location = { search: '?scenario=passed' };
  assert.equal(partsKst(clockNow()).h, 16);
});

test('오늘 날짜는 두 모드 모두 실제 한국 날짜다', () => {
  globalThis.location = { search: '?scenario=normal' };
  assert.equal(clockToday(), todayKst());
  globalThis.location = { search: '' };
  assert.equal(clockToday(), todayKst());
});
