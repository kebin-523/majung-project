// 상단 표시(domain/mockBadge.js 의 mockBadgeText)와 config.js 의 ADDRESS_ROUTE_IS_MOCK. DOM 접근 없음.
// 실제 모드에서 항공편·장소·이동 시간이 모두 실제면 표시가 없고, 시나리오 모드(?scenario=)는 "목업 데이터"다. (DesignGuide §7 상단 표시)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ADDRESS_ROUTE_IS_MOCK } from '../public/js/config.js';
import { isScenarioMode } from '../public/js/clock.js';
import { SCENARIOS, getScenario } from '../public/js/mock/scenarios.js';
import { mockBadgeText } from '../public/js/domain/mockBadge.js';
import { blockNetwork } from './helpers/blockNetwork.js';

blockNetwork();

/** 주소창(search)으로 앱이 실제로 쓰는 판단을 거쳐 상단 표시 문구를 구한다. 표시가 없으면 null. */
const badgeFor = (search, flag = ADDRESS_ROUTE_IS_MOCK) =>
  mockBadgeText({ scenarioMode: isScenarioMode(search), scenario: getScenario(search), addressRouteIsMock: flag });

test('설정: 주소·이동 시간이 모두 실제라서 ADDRESS_ROUTE_IS_MOCK 는 false', () => {
  assert.equal(ADDRESS_ROUTE_IS_MOCK, false);
});

test('실제 모드(주소에 ?scenario= 가 없음)에서 모두 실제면 상단 표시가 없다', () => {
  assert.equal(badgeFor(''), null);
  assert.equal(badgeFor('?other=1'), null);
});

test('알 수 없는 시나리오 이름(오타)은 실제 모드라서 표시가 없다', () => {
  assert.equal(badgeFor('?scenario=typo'), null);
  assert.equal(badgeFor('?scenario='), null);
});

test('시나리오 모드는 "목업 데이터" (normal), 그 밖의 시나리오는 "목업 · 이름"', () => {
  assert.equal(badgeFor('?scenario=normal'), '목업 데이터');
  for (const scenario of SCENARIOS.filter((name) => name !== 'normal')) {
    assert.equal(badgeFor(`?scenario=${scenario}`), `목업 · ${scenario}`, scenario);
  }
});

test('시나리오 모드의 표시는 ADDRESS_ROUTE_IS_MOCK 값과 상관없다', () => {
  for (const flag of [true, false]) {
    assert.equal(badgeFor('?scenario=normal', flag), '목업 데이터');
    assert.equal(badgeFor('?scenario=changed', flag), '목업 · changed');
  }
});

test('플래그가 true 인 실제 모드는 "주소·이동 시간은 예시" (예전 상태를 되돌릴 때를 위한 규칙)', () => {
  assert.equal(badgeFor('', true), '주소·이동 시간은 예시');
});

test('app.js 는 상단 문구를 직접 정하지 않고 mockBadgeText 와 설정 값을 쓴다', () => {
  const source = readFileSync(fileURLToPath(new URL('../public/js/app.js', import.meta.url)), 'utf8');
  assert.match(source, /from '\.\/domain\/mockBadge\.js'/);
  assert.match(source, /mockBadgeText\(\{[^}]*addressRouteIsMock: ADDRESS_ROUTE_IS_MOCK/s);
  assert.ok(!source.includes('주소·이동 시간은 예시\''), 'app.js 에 상단 문구를 직접 쓰지 않는다');
  assert.ok(!source.includes('목업 데이터\''), 'app.js 에 상단 문구를 직접 쓰지 않는다');
});

test('ADDRESS_ROUTE_IS_MOCK 는 상단 표시에만 쓰인다 (다른 소스 파일에서 읽지 않는다)', () => {
  const root = new URL('../public/js/', import.meta.url);
  const importers = ['app.js', 'clock.js', 'adapters/routeAdapter.js', 'adapters/placeAdapter.js', 'adapters/flightAdapter.js',
    'domain/change.js', 'ui/screens/result.js', 'ui/screens/originSetup.js'];
  for (const file of importers) {
    const source = readFileSync(fileURLToPath(new URL(file, root)), 'utf8');
    const reads = source.split('\n').filter((line) => line.includes('ADDRESS_ROUTE_IS_MOCK') && !line.trim().startsWith('//'));
    if (file === 'app.js') assert.ok(reads.length >= 1, 'app.js 는 이 값을 읽는다');
    else assert.equal(reads.length, 0, `${file} 에서 ADDRESS_ROUTE_IS_MOCK 를 읽지 않는다`);
  }
});
