// 추천 카드의 "이동 시간 확인 줄": 문구·숨김 조건(domain/travelChecked.js), 뷰모델 연결(buildResultViewModel), 카드 안 위치(recommendCard.js).
// DOM 접근 없는 함수만 확인한다. 이동 시간 값은 합성했고 네트워크는 쓰지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { travelCheckedLine } from '../public/js/domain/travelChecked.js';
import { formatClock, formatSpoken, minutes, toMs } from '../public/js/domain/time.js';
import { renderChips } from '../public/js/ui/components/chips.js';
import { renderRecommendCardContent, renderTravelCheckedLine } from '../public/js/ui/components/recommendCard.js';
import { buildResultViewModel } from '../public/js/ui/screens/result.js';
import { blockNetwork } from './helpers/blockNetwork.js';

blockNetwork();

const NOW = toMs('2026-10-30 14:00');
const T1845 = toMs('2026-10-30 18:45');
const buffers = { airportBufferMin: 20, meetupMin: 40 };
const kakao = (overrides = {}) => ({ minutes: 55, distanceKm: 53, fetchedAt: T1845, source: 'kakao', ...overrides });
const flightAt = (fetchedAt, receivedAt = fetchedAt) => ({
  scheduled: NOW + minutes(300), changed: null, status: 'none', fetchedAt, receivedAt,
});

// ---------- 문구 · 시각 형식 ----------

test('문구: "이동 시간은 18:45에 확인했어요" (24시간제), 화면 읽기는 "오후 6시 45분"', () => {
  const line = travelCheckedLine(kakao());
  assert.equal(line.text, '18:45');
  assert.equal(line.sentence, '이동 시간은 18:45에 확인했어요');
  assert.equal(line.spoken, '오후 6시 45분');
  assert.equal(line.spokenSentence, '이동 시간은 오후 6시 45분에 확인했어요');
});

test('시각 형식은 기존 formatClock · formatSpoken 과 같다 (자정 직후 포함)', () => {
  for (const clock of ['00:05', '09:30', '12:00', '23:59']) {
    const ms = toMs(`2026-10-30 ${clock}`);
    const line = travelCheckedLine(kakao({ fetchedAt: ms }));
    assert.equal(line.text, formatClock(ms), clock);
    assert.equal(line.spoken, formatSpoken(ms), clock);
    assert.equal(line.text, clock);
  }
});

test('문구에 교통을 반영했다는 뜻의 말이 없다 (카카오가 실시간 교통을 반영하는지 확인 못 함)', () => {
  const line = travelCheckedLine(kakao());
  for (const word of ['교통', '실시간', '반영', '막힘', '혼잡']) {
    assert.ok(!line.sentence.includes(word) && !line.spokenSentence.includes(word), word);
  }
});

// ---------- 보이는 조건 · 숨기는 조건 ----------

test('실제 모드에서 source 가 kakao 이고 시각과 분이 있으면 보인다', () => {
  assert.notEqual(travelCheckedLine(kakao()), null);
  assert.notEqual(travelCheckedLine(kakao(), { scenarioMode: false }), null);
});

test('목업 이동 시간(source mock · none · 없음)에는 "확인했어요"를 붙이지 않는다', () => {
  for (const source of ['mock', 'none', 'icn', undefined, null, '']) {
    assert.equal(travelCheckedLine(kakao({ source })), null, String(source));
  }
});

test('시나리오 모드에서는 source 가 kakao 여도(이전 실제 모드의 저장값) 숨긴다', () => {
  assert.equal(travelCheckedLine(kakao(), { scenarioMode: true }), null);
  assert.equal(travelCheckedLine(kakao({ source: 'mock' }), { scenarioMode: true }), null);
});

test('확인 시각이 없거나 숫자가 아니면(이전 저장값) 숨긴다', () => {
  for (const fetchedAt of [undefined, null, NaN, Infinity, 0, -1, '18:45', String(T1845), {}, []]) {
    assert.equal(travelCheckedLine(kakao({ fetchedAt })), null, String(fetchedAt));
  }
  const noField = kakao();
  delete noField.fetchedAt;
  assert.equal(travelCheckedLine(noField), null);
});

test('이동 시간이 없으면(minutes 가 null · 숫자가 아님, 터미널 보류의 빈 자리표시 값) 숨긴다', () => {
  for (const value of [null, undefined, NaN, '55', Infinity]) {
    assert.equal(travelCheckedLine(kakao({ minutes: value })), null, String(value));
  }
  assert.equal(travelCheckedLine({ minutes: null, source: 'none' }), null); // originSetup 이 저장하는 보류 값
});

test('drive 자체가 없거나 객체가 아니면 숨긴다', () => {
  for (const value of [null, undefined, 'x', 1, []]) assert.equal(travelCheckedLine(value), null, String(value));
});

// ---------- 뷰모델 연결 ----------

test('뷰모델: 이동 시간 확인 줄 값이 들어가고, 항공편 확인 시각(하단 줄)은 그대로 항공편 값이다', () => {
  const flightFetched = toMs('2026-10-30 13:40');
  const vm = buildResultViewModel({ flight: flightAt(flightFetched, NOW), drive: kakao(), buffers, now: NOW });
  assert.equal(vm.travelChecked.sentence, '이동 시간은 18:45에 확인했어요');
  assert.equal(vm.checkedText, '13:40'); // 항공편 시각(서버가 적은 시각). 이동 시간 시각과 비교하거나 합치지 않는다
  assert.equal(vm.checkedSpoken, formatSpoken(flightFetched));
});

test('뷰모델: 이동 시간 시각이 항공편 시각보다 앞서거나 뒤처져도 서로 영향을 주지 않는다 (오래됨 판단은 항공편 기준)', () => {
  const fresh = flightAt(NOW, NOW);
  const old = flightAt(NOW - minutes(30), NOW - minutes(11));
  // 이동 시간 시각이 아주 오래돼도 항공편이 최신이면 오래됨이 아니다
  const driveOld = kakao({ fetchedAt: NOW - minutes(600) });
  const a = buildResultViewModel({ flight: fresh, drive: driveOld, buffers, now: NOW });
  assert.equal(a.stale, false);
  assert.notEqual(a.badgeKey, 'stale');
  assert.equal(a.checkedText, formatClock(NOW));
  // 이동 시간 시각이 방금이어도 항공편이 오래됐으면 여전히 오래됨이다
  const driveFresh = kakao({ fetchedAt: NOW });
  const b = buildResultViewModel({ flight: old, drive: driveFresh, buffers, now: NOW });
  assert.equal(b.stale, true);
  assert.equal(b.badgeKey, 'stale');
  assert.equal(b.checkedText, formatClock(NOW - minutes(30)));
});

test('뷰모델: 시나리오 모드 · 목업 · 시각 없음 · 이동 시간 없음이면 travelChecked 가 null', () => {
  const flight = flightAt(NOW);
  assert.equal(buildResultViewModel({ flight, drive: kakao(), buffers, now: NOW, scenarioMode: true }).travelChecked, null);
  assert.equal(buildResultViewModel({ flight, drive: kakao({ source: 'mock' }), buffers, now: NOW }).travelChecked, null);
  const noTime = kakao();
  delete noTime.fetchedAt;
  assert.equal(buildResultViewModel({ flight, drive: noTime, buffers, now: NOW }).travelChecked, null);
});

test('이동 시간을 다시 확인해 성공하면 시각이 새 값으로 바뀌고, 실패해 이전 값을 두면 그대로다', () => {
  const flight = flightAt(NOW);
  const before = kakao({ fetchedAt: toMs('2026-10-30 18:45') });
  const after = kakao({ minutes: 62, fetchedAt: toMs('2026-10-30 19:10') }); // 다시 확인에 성공: drive 를 새 값으로 바꾼다
  const first = buildResultViewModel({ flight, drive: before, buffers, now: NOW });
  const succeeded = buildResultViewModel({ flight, drive: after, buffers, now: NOW });
  assert.equal(first.travelChecked.text, '18:45');
  assert.equal(succeeded.travelChecked.text, '19:10');
  assert.equal(succeeded.travelMin, 62);
  // 실패: drive 를 바꾸지 않으므로 같은 값으로 다시 그린다
  const failed = buildResultViewModel({ flight, drive: before, buffers, now: NOW });
  assert.deepEqual(failed.travelChecked, first.travelChecked);
});

// ---------- 카드 안 렌더링 ----------

const card = (vm) => renderRecommendCardContent({ ...vm, chipsHtml: renderChips(vm) });

test('카드: 이동 시간 확인 줄은 근거 칩 줄과 항공편 확인 시각 줄 사이에 있고, 읽기용 문구가 따로 있다', () => {
  const vm = buildResultViewModel({ flight: flightAt(toMs('2026-10-30 13:40'), NOW), drive: kakao(), buffers, now: NOW });
  const html = card(vm);
  const chips = html.indexOf('class="chips"');
  const travel = html.indexOf('이동 시간은 18:45에 확인했어요');
  const flightLine = html.indexOf('reco__checked');
  assert.ok(chips >= 0 && travel > chips && flightLine > travel);
  assert.ok(html.includes('이동 시간은 오후 6시 45분에 확인했어요')); // 화면 읽기용(sr-only)
  assert.ok(html.includes('13:40에 확인했어요')); // 항공편 줄은 그대로
  assert.equal(html.split('class="caption reco__travel-checked"').length - 1, 1);
});

test('카드: 숨김 조건이면 줄 자체가 없고, 항공편 확인 줄과 "달라질 수 있어요" 안내는 그대로 있다', () => {
  const flight = flightAt(NOW);
  const vm = buildResultViewModel({ flight, drive: kakao({ source: 'mock' }), buffers, now: NOW });
  const html = card(vm);
  assert.ok(!html.includes('reco__travel-checked'));
  assert.ok(!html.includes('이동 시간은 '));
  assert.ok(html.includes('에 확인했어요'));
  assert.ok(html.includes('실제 도착과 교통에 따라 달라질 수 있어요'));
});

test('카드: 항공편이 오래되면 "마지막 확인은" 문구는 그대로이고 이동 시간 줄도 함께 보인다', () => {
  const vm = buildResultViewModel({ flight: flightAt(NOW - minutes(30), NOW - minutes(11)), drive: kakao(), buffers, now: NOW });
  const html = card(vm);
  assert.ok(html.includes('마지막 확인은 13:30예요.'));
  assert.ok(html.includes('이동 시간은 18:45에 확인했어요'));
});

test('renderTravelCheckedLine: 값이 없으면 빈 문자열, 있으면 14px 보조 설명 줄(.caption) 하나', () => {
  assert.equal(renderTravelCheckedLine({ travelChecked: null }), '');
  assert.equal(renderTravelCheckedLine({}), '');
  const html = renderTravelCheckedLine({ travelChecked: travelCheckedLine(kakao()) });
  assert.match(html, /^\s*<p class="caption reco__travel-checked">/);
  assert.ok(html.includes('aria-hidden="true">이동 시간은 18:45에 확인했어요<'));
  assert.ok(html.includes('class="sr-only">이동 시간은 오후 6시 45분에 확인했어요<'));
});
