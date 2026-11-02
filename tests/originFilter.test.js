// 시간대 검색 결과의 출발 도시 필터(public/js/domain/originFilter.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterByOrigin, filterByQuery, listOrigins, listOriginsMatching, matchesOrigin, orderOrigins, sortByScheduled, visibleSelection } from '../public/js/domain/originFilter.js';

const f = (flightId, scheduled, departureCity, flightNo = 'KE1') => ({ flightId, flightNo, scheduled, departureCity });

test('listOrigins 는 값이 없는 편을 빼고 중복 없이 가나다순', () => {
  const flights = [f('a', 1, '도쿄'), f('b', 2, '방콕'), f('c', 3, null), f('d', 4, '도쿄'), f('e', 5, '')];
  assert.deepEqual(listOrigins(flights), ['도쿄', '방콕']);
});

test('filterByOrigin(null)은 전체, 도시를 주면 그 도시만(값 없는 편은 빠진다)', () => {
  const flights = [f('a', 1, '도쿄'), f('b', 2, '방콕'), f('c', 3, null)];
  assert.deepEqual(filterByOrigin(flights, null).map((x) => x.flightId), ['a', 'b', 'c']);
  assert.deepEqual(filterByOrigin(flights, '도쿄').map((x) => x.flightId), ['a']);
});

test('sortByScheduled 는 같은 시각이면 입력 순서를 지키고 원본을 바꾸지 않는다', () => {
  const flights = [f('late', 9, null), f('x', 5, null), f('y', 5, null)];
  assert.deepEqual(sortByScheduled(flights).map((x) => x.flightId), ['x', 'y', 'late']);
  assert.deepEqual(flights.map((x) => x.flightId), ['late', 'x', 'y']);
});

test('sortByScheduled 는 같은 편명의 두 행(Master/Slave)을 모두 남긴다', () => {
  const flights = [f('m', 5, '도쿄', 'KE1'), f('s', 5, '도쿄', 'KE1')];
  assert.equal(sortByScheduled(flights).length, 2);
});

test('visibleSelection 은 가려진 선택을 null 로', () => {
  assert.equal(visibleSelection([f('a', 1, '도쿄')], 'b'), null);
  assert.equal(visibleSelection([f('a', 1, '도쿄')], null), null);
});

test('visibleSelection 은 보이는 선택을 그대로', () => {
  assert.equal(visibleSelection([f('a', 1, '도쿄')], 'a'), 'a');
});

// ---------- 출발 도시 검색 · 칩 순서 ----------

test('matchesOrigin: 부분 일치, 띄어쓰기·"/"·괄호·대소문자는 무시한다', () => {
  assert.equal(matchesOrigin('도쿄/나리타', '나리타'), true);
  assert.equal(matchesOrigin('도쿄/나리타', '도쿄'), true);
  assert.equal(matchesOrigin('오사카/ 간사이', '오사카간사이'), true); // 칩에 보이는 모양 그대로 이어 써도 찾는다
  assert.equal(matchesOrigin('오사카/ 간사이', ' 간사이 '), true);
  assert.equal(matchesOrigin('선양(심양)', '심양'), true);
  assert.equal(matchesOrigin('선양(심양)', '선양심양'), true);
  assert.equal(matchesOrigin('Paris/CDG', 'paris'), true);
  assert.equal(matchesOrigin('도쿄/나리타', '방콕'), false);
  assert.equal(matchesOrigin('도쿄/나리타', '나리타도쿄'), false); // 순서가 다르면 찾지 않는다
});

test('matchesOrigin: 검색어가 비어 있으면(공백만 있어도) 모두 일치하고, 출발 도시 값이 없는 편은 검색어가 있을 때만 빠진다', () => {
  assert.equal(matchesOrigin('도쿄/나리타', ''), true);
  assert.equal(matchesOrigin('도쿄/나리타', '   '), true);
  assert.equal(matchesOrigin(null, ''), true);
  assert.equal(matchesOrigin(undefined, '  '), true);
  assert.equal(matchesOrigin(null, '도쿄'), false);
  assert.equal(matchesOrigin('', '도쿄'), false);
});

test('filterByQuery: 검색어에 맞는 도시의 편만 남기고 입력 순서를 지킨다 (빈 검색어는 전체)', () => {
  const flights = [f('a', 1, '도쿄/나리타'), f('b', 2, '방콕/수완나품'), f('c', 3, null), f('d', 4, '도쿄/하네다')];
  assert.deepEqual(filterByQuery(flights, '도쿄').map((x) => x.flightId), ['a', 'd']);
  assert.deepEqual(filterByQuery(flights, '').map((x) => x.flightId), ['a', 'b', 'c', 'd']);
  assert.deepEqual(filterByQuery(flights, '없는도시'), []);
});

test('listOriginsMatching: 검색어에 맞는 출발 도시만 가나다순으로 (값 없는 편 제외)', () => {
  const flights = [f('a', 1, '도쿄/나리타'), f('b', 2, '방콕'), f('c', 3, null), f('d', 4, '도쿄/하네다'), f('e', 5, '도쿄/나리타')];
  assert.deepEqual(listOriginsMatching(flights, '도쿄'), ['도쿄/나리타', '도쿄/하네다']);
  assert.deepEqual(listOriginsMatching(flights, ''), ['도쿄/나리타', '도쿄/하네다', '방콕'].sort((a, b) => a.localeCompare(b, 'ko')));
  assert.deepEqual(listOriginsMatching(flights, '로마'), []);
});

test('orderOrigins: 접었을 때는 선택한 도시를 맨 앞으로 (가려진 줄에 선택이 숨지 않게), 펼쳤을 때는 그대로', () => {
  const origins = ['가고시마', '나고야', '다낭', '라오스'];
  assert.deepEqual(orderOrigins(origins, '다낭', false), ['다낭', '가고시마', '나고야', '라오스']);
  assert.deepEqual(orderOrigins(origins, '다낭', true), origins);
  assert.deepEqual(orderOrigins(origins, null, false), origins);
  assert.deepEqual(orderOrigins(origins, '없는도시', false), origins);
  assert.notEqual(orderOrigins(origins, null, true), origins); // 새 배열이다 (원본을 바꾸지 않는다)
  assert.deepEqual(origins, ['가고시마', '나고야', '다낭', '라오스']);
});

// ---------- 항공사 이름 검색 (같은 검색바) ----------
import { matchesFlight } from '../public/js/domain/originFilter.js';

const g = (flightId, departureCity, airline) => ({ flightId, flightNo: 'KE1', scheduled: 1, departureCity, airline });

test('matchesFlight: 출발 도시 또는 항공사 이름이 맞으면 맞다 (띄어쓰기·대소문자 무시, 부분 일치)', () => {
  assert.equal(matchesFlight(g('a', '도쿄/나리타', '대한항공'), '대한'), true);
  assert.equal(matchesFlight(g('a', '도쿄/나리타', '대한항공'), '도쿄'), true);
  assert.equal(matchesFlight(g('a', '도쿄/나리타', '아시아나 항공'), '아시아나항공'), true);
  assert.equal(matchesFlight(g('a', '도쿄/나리타', '대한항공'), '아시아나'), false);
  assert.equal(matchesFlight(g('a', null, null), '대한'), false);
  assert.equal(matchesFlight(g('a', null, null), '  '), true); // 빈 검색어는 모두 맞는다
});

test('filterByQuery: 항공사 이름으로도 거르고 입력 순서를 지킨다', () => {
  const flights = [g('a', '도쿄', '대한항공'), g('b', '방콕', '아시아나항공'), g('c', '파리', '대한항공'), g('d', null, null)];
  assert.deepEqual(filterByQuery(flights, '대한항공').map((x) => x.flightId), ['a', 'c']);
  assert.deepEqual(filterByQuery(flights, '아시아나').map((x) => x.flightId), ['b']);
});

test('listOriginsMatching: 항공사 이름에 맞는 편의 출발 도시만 보인다', () => {
  const flights = [g('a', '도쿄', '대한항공'), g('b', '방콕', '아시아나항공'), g('c', '파리', '대한항공')];
  assert.deepEqual(listOriginsMatching(flights, '대한항공'), ['도쿄', '파리']);
  assert.deepEqual(listOriginsMatching(flights, '방콕'), ['방콕']);
});
