// 시간대 검색 결과의 출발 도시 필터(public/js/domain/originFilter.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterByOrigin, listOrigins, sortByScheduled, visibleSelection } from '../public/js/domain/originFilter.js';

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
