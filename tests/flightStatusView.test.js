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

test('착륙한 편은 추천 카드를 유지하고 말풍선만 바뀐다', () => {
  const vm = view({ status: 'touchdown' }, 300);
  assert.equal(vm.bubbleText, '비행기가 착륙했어요, 입국 절차가 끝나면 만날 수 있어요.');
  assert.equal(vm.badgeKey, 'relaxed');
  assert.ok(vm.timeText && vm.arrivalText); // 근거 칩의 비행기 도착 시각은 그대로 있다
});

test('착륙한 편도 추천 시각이 지났다면 "지남" 말풍선이 먼저다', () => {
  const vm = view({ status: 'touchdown' }, 60);
  assert.equal(vm.badgeKey, 'passed');
  assert.equal(vm.bubbleText, '추천 출발 시각이 지났어요. 이동 시간을 다시 확인해 볼까요?');
});

test('착륙이 아닌 편의 말풍선은 기본 문장', () => {
  assert.equal(view({ status: 'none' }, 300).bubbleText, '곧 만나겠네요, 슬슬 준비해 볼까요?');
});
