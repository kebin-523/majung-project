// 변경 안내(public/js/ui/components/changeBanner.js): 비행기 티켓 모양(위 구역 = 바뀐 항목, 절취선, 쪽지 = 안내 문장).
// DOM 접근 없는 마크업 함수만 확인한다. (색·배치는 CSS라 단위 테스트로 확인하지 않는다)
import test from 'node:test';
import assert from 'node:assert/strict';
import { toMs } from '../public/js/domain/time.js';
import { renderChangeBanner } from '../public/js/ui/components/changeBanner.js';
import { blockNetwork } from './helpers/blockNetwork.js';

blockNetwork();

const NOW = toMs('2026-10-30 14:00');
const at = (clock) => toMs(`2026-10-30 ${clock}`);
const change = (overrides = {}) => ({
  arrival: { fromMs: at('17:30'), toMs: at('17:50') },
  departure: { fromMs: at('15:40'), toMs: at('16:00') },
  travel: { rechecked: false, fromMin: 55, toMin: 55 },
  ...overrides,
});
const banner = (overrides) => renderChangeBanner(change(overrides), NOW);
const rowsOf = (html) => [...html.matchAll(/<li class="change-banner__row">([\s\S]*?)<\/li>/g)].map((match) => match[1]);
const top = (html) => html.slice(html.indexOf('class="change-banner__top"'), html.indexOf('class="change-banner__stub"'));
const stub = (html) => html.slice(html.indexOf('class="change-banner__stub"'));

test('티켓 구조: 위 구역(바뀐 항목) 다음에 절취선이 있는 쪽지(안내 문장)가 온다', () => {
  const html = banner();
  const topAt = html.indexOf('class="change-banner__top"');
  const stubAt = html.indexOf('class="change-banner__stub"');
  assert.ok(topAt >= 0 && stubAt > topAt, `${topAt},${stubAt}`);
  assert.ok(top(html).includes('change-banner__rows'));
  assert.ok(stub(html).includes('도착 시각이 변경되어 출발 시각을 다시 계산했어요.'));
});

test('바뀐 내용을 먼저, 안심 문구는 그다음 순서다 (비교 → 핵심 안내 → 보조 안내)', () => {
  const html = banner({ travel: { rechecked: true, fromMin: 55, toMin: 60 } });
  const order = ['change-banner__rows', '도착 시각이 변경되어', '이동 시간도 다시 확인했어요.', '바뀐 시각에 맞춰 새로 정리해 뒀어요.'].map((text) => html.indexOf(text));
  assert.ok(order.every((index) => index >= 0), String(order));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test('바뀐 항목마다 "라벨 / 이전(취소선) → 새 값" 한 줄이고, 화살표와 문구로도 구분한다 (색만으로 구분하지 않는다)', () => {
  const [arrival] = rowsOf(banner());
  assert.ok(arrival.includes('class="change-banner__label"'));
  assert.ok(arrival.includes('비행기 도착'));
  const was = arrival.indexOf('<del class="change-banner__from">17:30</del>');
  const arrow = arrival.indexOf('class="change-banner__arrow"');
  const now = arrival.indexOf('<strong>17:50</strong>');
  assert.ok(was >= 0 && arrow > was && now > arrow, `${was},${arrow},${now}`);
  assert.ok(arrival.includes('→'));
});

test('각 줄에는 화면 읽기용 문장이 따로 있다 ("오후 5시 30분에서 오후 5시 50분으로 바뀌었어요")', () => {
  const [arrival, departure] = rowsOf(banner());
  assert.ok(arrival.includes('<span class="sr-only">비행기 도착 오후 5시 30분에서 오후 5시 50분으로 바뀌었어요</span>'));
  assert.ok(departure.includes('추천 출발 시각 오후 3시 40분에서 오후 4시로 바뀌었어요'));
});

test('비행기 도착 줄은 항상 있고, 추천 출발 시각 줄은 달라졌을 때만 있다', () => {
  assert.equal(rowsOf(banner()).length, 2);
  const same = banner({ departure: { fromMs: at('15:40'), toMs: at('15:40') } });
  assert.equal(rowsOf(same).length, 1);
  assert.ok(rowsOf(same)[0].includes('비행기 도착'));
});

test('이동 시간 줄은 다시 조회해서 값이 달라진 경우에만 보이고, "이동 시간도 다시 확인했어요"는 다시 조회에 성공했을 때만 쓴다', () => {
  const none = banner();
  assert.ok(!none.includes('이동 시간'));
  assert.ok(!none.includes('이동 시간도 다시 확인했어요'));

  const changed = banner({ travel: { rechecked: true, fromMin: 55, toMin: 60 } });
  const travel = rowsOf(changed).find((row) => row.includes('이동 시간'));
  assert.ok(travel.includes('<del class="change-banner__from">55분</del>') && travel.includes('<strong>60분</strong>'));
  assert.ok(stub(changed).includes('이동 시간도 다시 확인했어요.'));

  // 다시 조회했지만 값이 같으면 비교 줄은 없고 안내 문장만 있다
  const same = banner({ travel: { rechecked: true, fromMin: 55, toMin: 55 } });
  assert.ok(!rowsOf(same).some((row) => row.includes('이동 시간')));
  assert.ok(stub(same).includes('이동 시간도 다시 확인했어요.'));

  // 다시 조회하지 못했으면(rechecked false) 값이 달라 보여도 비교 줄을 만들지 않는다 (기계적으로 미룬 것처럼 보이지 않게)
  const failed = banner({ travel: { rechecked: false, fromMin: 55, toMin: 60 } });
  assert.ok(!rowsOf(failed).some((row) => row.includes('이동 시간')));
});

test('다른 날로 넘어가면 날짜 라벨이 붙는다 ("내일 00:20")', () => {
  const next = banner({ arrival: { fromMs: at('23:50'), toMs: toMs('2026-10-31 00:20') } });
  assert.ok(rowsOf(next)[0].includes('<strong>내일 00:20</strong>'));
  assert.ok(rowsOf(next)[0].includes('<del class="change-banner__from">23:50</del>'));
});

test('쪽지의 핵심 안내 문장 앞에 시계 아이콘이 있고, 불안을 키우는 말·표시를 쓰지 않는다', () => {
  const html = banner({ travel: { rechecked: true, fromMin: 55, toMin: 60 } });
  const lead = stub(html).slice(stub(html).indexOf('class="change-banner__lead"'));
  assert.ok(lead.indexOf('class="icon"') >= 0 && lead.indexOf('class="icon"') < lead.indexOf('도착 시각이 변경되어'));
  assert.ok(!/지연|경고|주의|늦어|실패|오류/.test(html.replace(/<[^>]*>/g, '')));
  assert.ok(!/#[0-9a-f]{6}/i.test(html)); // 색은 CSS 토큰으로만 정한다
});

test('화면 읽기 문장의 조사가 맞다: 받침 없는 "시"는 "로", 받침 있는 "분"은 "으로"', () => {
  const html = banner({
    arrival: { fromMs: at('17:30'), toMs: at('18:00') }, // 새 값이 정시
    departure: { fromMs: at('15:40'), toMs: at('16:10') },
    travel: { rechecked: true, fromMin: 55, toMin: 60 },
  });
  const spoken = [...html.matchAll(/<span class="sr-only">([^<]*)<\/span>/g)].map((match) => match[1]);
  assert.ok(spoken.includes('비행기 도착 오후 5시 30분에서 오후 6시로 바뀌었어요'), spoken.join(' | '));
  assert.ok(spoken.includes('추천 출발 시각 오후 3시 40분에서 오후 4시 10분으로 바뀌었어요'), spoken.join(' | '));
  assert.ok(spoken.includes('이동 시간 55분에서 60분으로 바뀌었어요'), spoken.join(' | '));
  assert.ok(!spoken.some((text) => /시으로/.test(text)));
});
