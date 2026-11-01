// 항공편 운항 상태에 따른 화면 판단: 안내 상자 종류, 착륙 말풍선, 목업 이동 시간의 재조회 표시. DOM 접근 없음.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isRealTravelRecheck } from '../public/js/domain/change.js';
import { flightNoticeKind } from '../public/js/domain/status.js';
import { minutes, toMs } from '../public/js/domain/time.js';
import { buildResultViewModel } from '../public/js/ui/screens/result.js';

test('flightNoticeKind: 도착은 arrived, 모르는 상태는 unknown, 착륙·예정은 카드(null)', () => {
  assert.equal(flightNoticeKind({ status: 'arrived', landed: true }), 'arrived');
  assert.equal(flightNoticeKind({ status: 'arrived' }), 'arrived');
  assert.equal(flightNoticeKind({ landed: true }), 'arrived');
  assert.equal(flightNoticeKind({ status: 'unknown', landed: false }), 'unknown');
  for (const status of ['none', 'delayed', 'touchdown', undefined]) {
    assert.equal(flightNoticeKind({ status, landed: false }), null, String(status));
  }
});

test('isRealTravelRecheck: 목업 이동 시간은 항공편이 실제인 모드에서만 재조회로 치지 않는다', () => {
  assert.equal(isRealTravelRecheck({ source: 'mock' }, { scenarioMode: false }), false);
  assert.equal(isRealTravelRecheck({ source: 'mock' }, { scenarioMode: true }), true); // 시나리오 모드는 전부 목업이라 시연용
  assert.equal(isRealTravelRecheck({ source: 'kakao' }, { scenarioMode: false }), true);
  assert.equal(isRealTravelRecheck(null, { scenarioMode: false }), false);
});

const NOW = toMs('2026-10-30 14:00');
const view = (flight, arrivalFromNowMin) =>
  buildResultViewModel({
    flight: { scheduled: NOW + minutes(arrivalFromNowMin), changed: null, fetchedAt: NOW, ...flight },
    drive: { minutes: 60 },
    buffers: { airportBufferMin: 20, meetupMin: 40 },
    now: NOW,
  });

test('착륙한 편은 추천 카드를 유지하고 상태 줄 문장만 바뀐다', () => {
  const vm = view({ status: 'touchdown' }, 300);
  assert.equal(vm.statusText, '비행기가 착륙했어요, 입국 절차가 끝나면 만날 수 있어요.');
  assert.equal(vm.statusKind, 'touchdown');
  assert.equal(vm.badgeKey, 'relaxed');
  assert.ok(vm.timeText && vm.arrivalText); // 근거 칩의 비행기 도착 시각은 그대로 있다
});

test('착륙한 편도 추천 시각이 지났다면 "지남" 상태 줄이 먼저다', () => {
  const vm = view({ status: 'touchdown' }, 60);
  assert.equal(vm.badgeKey, 'passed');
  assert.equal(vm.statusText, '추천 출발 시각이 지났어요. 이동 시간을 다시 확인해 볼까요?');
  assert.equal(vm.statusKind, 'passed');
});

test('평소 상태에는 상태 줄이 없다 (null)', () => {
  const vm = view({ status: 'none' }, 300);
  assert.equal(vm.statusText, null);
  assert.equal(vm.statusKind, null);
});

test('곧 출발할 때는 "곧 나갈 시간이에요." 상태 줄이 나온다', () => {
  const vm = view({ status: 'none' }, 150); // 비행기 도착 150분 뒤, 추천 출발은 30분 뒤
  assert.equal(vm.badgeKey, 'soon');
  assert.equal(vm.statusText, '곧 나갈 시간이에요.');
  assert.equal(vm.statusKind, 'soon');
});

test('도착 변경·최신 정보 확인 못 함은 상태 줄을 만들지 않는다 (변경 안내와 확인 시각 줄이 각각 알린다)', () => {
  assert.equal(view({ status: 'none' }, 300).statusKind, null);
});
