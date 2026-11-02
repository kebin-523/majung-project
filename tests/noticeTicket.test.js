import test from 'node:test';
import assert from 'node:assert/strict';
import { renderNoticeTicket } from '../public/js/ui/components/noticeTicket.js';

const arrived = {
  lead: '이 항공편은 이미 도착했어요.',
  detail: '입국 절차를 마친 뒤에 만날 수 있어요. 다른 항공편을 찾아볼까요?',
  facts: [{ label: '도착 예정', value: '19:10', spoken: '오후 7시 10분' }],
  action: { label: '항공편 바꾸기', attr: 'data-action="change-flight"' },
};

test('안내 티켓: 윗 띠 → 핵심 문장(아이콘) → 보조 문장 → 보조 정보 → 행동 순서다 (정보 위계)', () => {
  const html = renderNoticeTicket(arrived);
  const at = (text) => html.indexOf(text);
  const order = ['ticket__band', '이 항공편은 이미 도착했어요.', '입국 절차를 마친 뒤에', '도착 예정', '19:10', '항공편 바꾸기'].map(at);
  assert.ok(order.every((index) => index >= 0), String(order));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.ok(html.includes('info.svg'));
});

test('안내 티켓: 핵심 문장·보조 문장·보조 정보가 서로 다른 클래스(= 다른 글자 단계)를 쓴다', () => {
  const html = renderNoticeTicket(arrived);
  assert.match(html, /class="notice-ticket__lead"[^>]*>[\s\S]*이 항공편은 이미 도착했어요\./);
  assert.match(html, /class="notice-ticket__detail">입국 절차를 마친 뒤에/);
  assert.match(html, /class="notice-ticket__fact-label"[^>]*>도착 예정</);
  assert.match(html, /class="notice-ticket__fact-value tabular"><span aria-hidden="true">19:10</);
});

test('안내 티켓: 보조 문장·보조 정보·행동은 없으면 만들지 않는다 (핵심 문장만으로도 된다)', () => {
  const html = renderNoticeTicket({ lead: '이동 시간을 불러오지 못해서 추천 시각을 계산하지 못했어요.' });
  assert.ok(html.includes('notice-ticket__lead'));
  assert.ok(!html.includes('notice-ticket__detail') && !html.includes('notice-ticket__fact') && !html.includes('ticket__stub'));
});

test('안내 티켓: 쪽지(절취선 아래)는 보조 정보나 행동이 있을 때만 만든다', () => {
  assert.ok(!renderNoticeTicket({ lead: '안내' }).includes('ticket__stub'));
  assert.ok(renderNoticeTicket({ lead: '안내', action: arrived.action }).includes('ticket__stub'));
  assert.ok(renderNoticeTicket({ lead: '안내', facts: arrived.facts }).includes('ticket__stub'));
  assert.match(renderNoticeTicket(arrived), /<button class="btn btn--text" type="button" data-action="change-flight">항공편 바꾸기<\/button>/);
});

test('안내 티켓: 보조 정보의 값은 눈에는 24시간제, 화면 읽기에는 읽기용 문구가 나온다', () => {
  const html = renderNoticeTicket(arrived);
  assert.ok(html.includes('<span aria-hidden="true">19:10</span>'));
  assert.ok(html.includes('<span class="sr-only">도착 예정 오후 7시 10분</span>'));
});

test('안내 티켓: 핵심 문장이 여럿이면 한 구역에 아이콘과 함께 차례로, 보조 문장은 한 번만 쓴다', () => {
  const html = renderNoticeTicket({ lead: ['항공편 정보를 가져오지 못했어요.', '이동 시간을 다시 확인하지 못했어요.'], detail: '잠시 후 다시 시도해 주세요.' });
  assert.equal(html.split('class="notice-ticket__lead"').length - 1, 2);
  assert.equal(html.split('class="notice-ticket__detail"').length - 1, 1);
  assert.equal(html.split('class="ticket__band"').length - 1, 1);
  assert.equal(html.split('<div class="ticket__section').length - 1, 1); // 구역도 하나
  assert.ok(html.indexOf('항공편 정보를 가져오지') < html.indexOf('이동 시간을 다시') && html.indexOf('이동 시간을 다시') < html.indexOf('잠시 후'));
});

test('안내 티켓: 띠와 아이콘은 화면 읽기에서 숨기고, 카드 안에 Primary·Secondary 버튼과 경고 표현을 두지 않는다', () => {
  const html = renderNoticeTicket(arrived);
  assert.match(html, /class="ticket__band" aria-hidden="true"/);
  assert.ok(!html.includes('btn--primary') && !html.includes('btn--secondary'));
  assert.ok(!html.includes('경고') && !html.includes('warning'));
});

test('안내 티켓: 문장·라벨·값은 이스케이프한다', () => {
  const html = renderNoticeTicket({
    lead: '<img src=x onerror=alert(1)>',
    detail: '<i>d</i>',
    facts: [{ label: '<u>l</u>', value: '<s>v</s>', spoken: '<b>s</b>' }],
    action: { label: '<b>x</b>', attr: 'data-action="a"' },
  });
  assert.ok(!/<(img|i|u|s|b)[ >]/.test(html));
});
