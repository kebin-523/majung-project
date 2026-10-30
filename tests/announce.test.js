// 화면 읽기 프로그램 알림(announcementFor)과 포커스 판단(focusTargetAfterTransition). DOM 접근 없음.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ANNOUNCEMENTS, announcementFor, cardLeadSpoken, focusTargetAfterTransition } from '../public/js/domain/announce.js';
import { resolveFlightView } from '../public/js/domain/status.js';

const view = (status) => resolveFlightView({ status, landed: status === 'arrived' });
const LEAD = '오후 5시 10분 출발을 추천해요';

// [전환, 전 상태, 후 상태, 알릴 문장]
const transitions = [
  ['none → touchdown (카드 안에서 말풍선만 바뀜: 알리지 않음)', 'none', 'touchdown', null],
  ['none → arrived', 'none', 'arrived', ANNOUNCEMENTS.arrived],
  ['touchdown → arrived', 'touchdown', 'arrived', ANNOUNCEMENTS.arrived],
  ['none → unknown', 'none', 'unknown', ANNOUNCEMENTS.unknown],
  ['unknown → none (카드로 돌아옴)', 'unknown', 'none', LEAD],
  ['touchdown → none (카드 안: 알리지 않음)', 'touchdown', 'none', null],
  ['unknown → touchdown (카드로 돌아옴)', 'unknown', 'touchdown', LEAD],
  ['arrived → none (카드로 돌아옴)', 'arrived', 'none', LEAD],
  ['arrived → unknown (안내 상자끼리)', 'arrived', 'unknown', ANNOUNCEMENTS.unknown],
];

for (const [name, from, to, expected] of transitions) {
  test(`알림: ${name}`, () => {
    assert.equal(announcementFor(view(from), view(to), { cardLead: LEAD }), expected);
  });
}

test('알림: 처음 화면을 그릴 때(이전 화면 없음)는 어떤 화면이어도 알리지 않는다', () => {
  for (const status of ['none', 'touchdown', 'arrived', 'unknown']) {
    assert.equal(announcementFor(null, view(status), { cardLead: LEAD }), null, status);
  }
});

test('알림: 같은 화면 안에서는 알리지 않는다 (안내 상자 → 같은 안내 상자 포함)', () => {
  assert.equal(announcementFor(view('arrived'), view('arrived'), { cardLead: LEAD }), null);
  assert.equal(announcementFor(view('unknown'), view('unknown'), { cardLead: LEAD }), null);
  assert.equal(announcementFor(view('none'), view('none'), { cardLead: LEAD }), null);
});

test('알림: 카드로 돌아올 때 읽을 문장이 없으면 알리지 않는다', () => {
  assert.equal(announcementFor(view('unknown'), view('none')), null);
});

test('카드 핵심 안내 문장: 다른 날이면 날짜 라벨을 앞에 붙인다', () => {
  assert.equal(cardLeadSpoken({ dayText: null, timeSpoken: '오후 5시 10분' }), '오후 5시 10분 출발을 추천해요');
  assert.equal(cardLeadSpoken({ dayText: '내일', timeSpoken: '오전 12시 20분' }), '내일 오전 12시 20분 출발을 추천해요');
});

test('포커스: 사라진 요소에 포커스가 있었을 때만 "항공편 바꾸기" 버튼으로 돌려준다', () => {
  const cases = [
    // [전 상태, 후 상태, 포커스가 사라질 요소에 있었는가, 기대]
    ['none', 'arrived', true, 'change-flight'],
    ['none', 'arrived', false, null],
    ['none', 'unknown', true, 'change-flight'],
    ['none', 'unknown', false, null],
    ['touchdown', 'arrived', true, 'change-flight'],
    ['unknown', 'none', true, 'change-flight'], // 카드로 돌아오면 아래쪽 "항공편 바꾸기" 버튼
    ['unknown', 'none', false, null],
    ['arrived', 'none', true, 'change-flight'],
  ];
  for (const [from, to, focusInRemoved, expected] of cases) {
    assert.equal(
      focusTargetAfterTransition({ before: view(from), after: view(to), focusInRemoved }),
      expected,
      `${from} → ${to}, 포커스 사라짐 ${focusInRemoved}`,
    );
  }
});

test('포커스: 화면이 그대로이거나 처음 그릴 때는 포커스를 옮기지 않는다', () => {
  assert.equal(focusTargetAfterTransition({ before: view('none'), after: view('touchdown'), focusInRemoved: true }), null);
  assert.equal(focusTargetAfterTransition({ before: view('arrived'), after: view('arrived'), focusInRemoved: true }), null);
  assert.equal(focusTargetAfterTransition({ before: null, after: view('arrived'), focusInRemoved: true }), null);
});
