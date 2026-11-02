// 온보딩의 순수 로직(public/js/domain/onboarding.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { ONBOARDING_PAGES, clampPage, markOnboardingDone, pageControls, shouldShowOnboarding } from '../public/js/domain/onboarding.js';

test('shouldShowOnboarding: 처음 들어온 빈 상태에서만 보인다', () => {
  assert.equal(shouldShowOnboarding({}), true);
  assert.equal(shouldShowOnboarding(undefined), true);
});

test('shouldShowOnboarding: 이미 마쳤거나 진행 중인 상태(검색·선택·출발지)면 보이지 않는다', () => {
  assert.equal(shouldShowOnboarding({ onboardingDone: true }), false);
  assert.equal(shouldShowOnboarding({ search: { mode: 'flightNo' } }), false);
  assert.equal(shouldShowOnboarding({ selectedFlightId: 'a' }), false);
  assert.equal(shouldShowOnboarding({ origin: { name: '합정역' } }), false);
});

test('shouldShowOnboarding: 시나리오(목업) 모드는 바로 시작한다', () => {
  assert.equal(shouldShowOnboarding({}, { scenarioMode: true }), false);
});

test('markOnboardingDone: 다른 값은 그대로 두고 마쳤다는 표시만 더한다 (원본은 바꾸지 않는다)', () => {
  const state = { alertLeadMin: 30 };
  assert.deepEqual(markOnboardingDone(state), { alertLeadMin: 30, onboardingDone: true });
  assert.deepEqual(state, { alertLeadMin: 30 });
});

test('clampPage: 처음과 마지막 사이로 맞춘다', () => {
  assert.equal(clampPage(-1, 3), 0);
  assert.equal(clampPage(1, 3), 1);
  assert.equal(clampPage(9, 3), 2);
});

test('pageControls: 마지막 페이지만 "시작하기"와 "이전", 그 앞은 "다음"과 "건너뛰기"', () => {
  assert.deepEqual(pageControls(0, 3), { primary: '다음', secondary: { action: 'skip', label: '건너뛰기' } });
  assert.deepEqual(pageControls(1, 3), { primary: '다음', secondary: { action: 'skip', label: '건너뛰기' } });
  assert.deepEqual(pageControls(2, 3), { primary: '시작하기', secondary: { action: 'prev', label: '이전' } });
});

test('소개 페이지는 3장이고 제목과 설명이 있다 (알림을 보낸다는 말은 쓰지 않는다)', () => {
  assert.equal(ONBOARDING_PAGES.length, 3);
  for (const page of ONBOARDING_PAGES) {
    assert.ok(page.title.length > 0 && page.body.length > 0);
    assert.doesNotMatch(`${page.title} ${page.body}`, /푸시|알림을 (보내|드려)|지연|경고/);
  }
});

// ---------- 확정본 숫자 검산 (화면의 그림 값은 이 계산에서 나온다) ----------
import { EXAMPLE, exampleChange, exampleTimes, spokenClock } from '../public/js/domain/onboarding.js';

test('1장 예시: 도착 17:45 + 입국 40분 = 예상 만남 18:25, 만남 − 대기 20분 − 이동 55분 = 출발 17:10', () => {
  assert.deepEqual(exampleTimes(), { arrival: '17:45', meet: '18:25', departure: '17:10' });
  assert.equal(EXAMPLE.travelMin, 55);
});

test('3장 예시: 1장 값에서 이어져 도착·만남·출발이 모두 +20분 (이동 시간·대기·입국은 그대로)', () => {
  const { before, after } = exampleChange();
  assert.deepEqual(before, { arrival: '17:45', meet: '18:25', departure: '17:10' });
  assert.deepEqual(after, { arrival: '18:05', meet: '18:45', departure: '17:30' });
});

test('spokenClock: "17시 45분", 정각은 "18시"', () => {
  assert.equal(spokenClock('17:45'), '17시 45분');
  assert.equal(spokenClock('18:00'), '18시');
  assert.equal(spokenClock('09:05'), '9시 5분');
});

test('확정 문구: 제목·본문·버튼 문구가 그대로다', () => {
  assert.deepEqual(ONBOARDING_PAGES.map((p) => p.title), ['나갈 시각을 계산해 드려요', '항공편과 출발지만 알려주세요', '도착이 바뀌면 다시 계산해요']);
  assert.equal(ONBOARDING_PAGES[0].body, '항공편 도착 정보와 이동 시간을 함께 따져서, 언제 출발하면 좋을지 추천해요.');
  assert.equal(ONBOARDING_PAGES[1].body, '나머지는 마중이 계산해요.');
  assert.equal(ONBOARDING_PAGES[2].body, '바뀐 내용은 이전 값과 비교해 먼저 보여드려요. 추천 시각은 예상이라서, 마지막으로 확인한 시각도 함께 알려요.');
});
