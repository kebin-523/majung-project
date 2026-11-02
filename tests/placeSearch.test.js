// 출발지 검색의 "가장 마지막 검색만 반영" 규칙과 결과 종류 판단 (public/js/domain/placeSearch.js).
// 어댑터는 가짜 함수(또는 가짜 fetch 를 단 실제 어댑터)이고 네트워크는 쓰지 않는다. 장소 값은 합성했다.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPlaceSearch } from '../public/js/domain/placeSearch.js';
import { searchAddress } from '../public/js/adapters/placeAdapter.js';
import { blockNetwork } from './helpers/blockNetwork.js';

blockNetwork();

const place = (id, name = `가상역 ${id}`) => ({ id, name, address: '서울 가상구 가상로 1', lng: 126.5, lat: 37.5 });

/** 호출마다 직접 끝낼 수 있는 가짜 검색 함수 */
function manualSearch() {
  const pending = [];
  const search = (query, { signal } = {}) =>
    new Promise((resolve) => {
      pending.push({ query, signal, resolve });
    });
  return { search, pending };
}

test('2글자 미만은 검색 함수를 부르지 않고 tooShort, 빈 입력은 cleared', async () => {
  const { search, pending } = manualSearch();
  const searcher = createPlaceSearch(search);
  assert.deepEqual(await searcher.run('역'), { kind: 'tooShort' });
  assert.deepEqual(await searcher.run('  역 '), { kind: 'tooShort' });
  assert.deepEqual(await searcher.run('   '), { kind: 'cleared' });
  assert.deepEqual(await searcher.run(''), { kind: 'cleared' });
  assert.equal(pending.length, 0);
});

test('앞뒤 공백을 뺀 검색어로 부르고, 시작할 때 onLoading 을 한 번 부른다', async () => {
  const { search, pending } = manualSearch();
  const searcher = createPlaceSearch(search);
  let loading = 0;
  const run = searcher.run('  합정역 ', { onLoading: () => (loading += 1) });
  assert.equal(loading, 1);
  assert.equal(pending[0].query, '합정역');
  pending[0].resolve({ ok: true, data: [place('1')] });
  assert.deepEqual(await run, { kind: 'results', places: [place('1')] });
});

test('응답 순서가 뒤바뀌어도 마지막 검색어의 결과만 남는다', async () => {
  const { search, pending } = manualSearch();
  const searcher = createPlaceSearch(search);
  const first = searcher.run('합정');
  const second = searcher.run('합정역');

  // 나중에 보낸 요청이 먼저 돌아오고, 이전 요청이 늦게 돌아온다
  pending[1].resolve({ ok: true, data: [place('B')] });
  pending[0].resolve({ ok: true, data: [place('A')] });

  assert.deepEqual(await second, { kind: 'results', places: [place('B')] });
  assert.deepEqual(await first, { kind: 'stale' });
});

test('새 요청이 나가면 이전 요청의 취소 신호가 켜진다', async () => {
  const { search, pending } = manualSearch();
  const searcher = createPlaceSearch(search);
  const first = searcher.run('합정');
  assert.equal(pending[0].signal.aborted, false);
  const second = searcher.run('합정역');
  assert.equal(pending[0].signal.aborted, true);
  assert.equal(pending[1].signal.aborted, false);
  pending[0].resolve({ ok: false, reason: 'aborted' });
  pending[1].resolve({ ok: true, data: [] });
  assert.deepEqual(await first, { kind: 'stale' });
  assert.deepEqual(await second, { kind: 'empty' });
});

test('요청이 진행 중일 때 입력을 지우거나 짧게 줄이면 그 요청의 결과는 버린다', async () => {
  const { search, pending } = manualSearch();
  const searcher = createPlaceSearch(search);
  const first = searcher.run('합정역');
  assert.deepEqual(await searcher.run('합'), { kind: 'tooShort' });
  assert.equal(pending[0].signal.aborted, true);
  pending[0].resolve({ ok: true, data: [place('A')] });
  assert.deepEqual(await first, { kind: 'stale' });

  const second = searcher.run('합정역');
  assert.deepEqual(await searcher.run(''), { kind: 'cleared' });
  pending[1].resolve({ ok: true, data: [place('B')] });
  assert.deepEqual(await second, { kind: 'stale' });
});

test('cancel() 하면 진행 중인 요청의 결과를 버린다 (화면을 떠날 때)', async () => {
  const { search, pending } = manualSearch();
  const searcher = createPlaceSearch(search);
  const run = searcher.run('합정역');
  searcher.cancel();
  assert.equal(pending[0].signal.aborted, true);
  pending[0].resolve({ ok: true, data: [place('A')] });
  assert.deepEqual(await run, { kind: 'stale' });
});

test('결과 없음은 empty(주소 없음), 실패는 searchError(검색 실패)', async () => {
  const results = [
    [{ ok: true, data: [] }, { kind: 'empty' }],
    [{ ok: false, reason: 'error' }, { kind: 'searchError' }],
    [{ ok: false, reason: 'quota' }, { kind: 'searchError' }],
    [{ ok: false, reason: 'timeout' }, { kind: 'searchError' }],
  ];
  for (const [reply, expected] of results) {
    const searcher = createPlaceSearch(async () => reply);
    assert.deepEqual(await searcher.run('합정역'), expected, JSON.stringify(reply));
  }
});

test('같은 이름의 장소가 두 줄이어도 합치지 않고 그대로 results 에 담는다', async () => {
  const data = [place('1', '가상역 4호선'), place('2', '가상역 수인분당선')];
  const searcher = createPlaceSearch(async () => ({ ok: true, data }));
  assert.deepEqual(await searcher.run('가상역'), { kind: 'results', places: data });
});

// ---- 실제 어댑터(가짜 fetch)를 거쳐 서버 reason 별 화면 연결을 확인한다 ----
let original;
afterEach(() => {
  if (original) globalThis.fetch = original;
  original = undefined;
  delete globalThis.location;
});

function withServerReply(reply) {
  original = globalThis.fetch;
  globalThis.fetch = async () => ({ json: async () => reply });
}

test('서버 reason invalid · config · quota · error 는 모두 화면의 "검색 실패" 로 이어진다', async () => {
  for (const reason of ['invalid', 'config', 'quota', 'error']) {
    withServerReply({ ok: false, reason });
    const searcher = createPlaceSearch(searchAddress);
    assert.deepEqual(await searcher.run('합정역'), { kind: 'searchError' }, reason);
  }
});

test('서버가 빈 배열을 돌려주면 "주소 없음" 으로 이어진다', async () => {
  withServerReply({ ok: true, data: [] });
  const searcher = createPlaceSearch(searchAddress);
  assert.deepEqual(await searcher.run('합정역'), { kind: 'empty' });
});

test('서버가 장소를 돌려주면 그대로 results 로 이어진다', async () => {
  withServerReply({ ok: true, data: [place('9')] });
  const searcher = createPlaceSearch(searchAddress);
  assert.deepEqual(await searcher.run('합정역'), { kind: 'results', places: [place('9')] });
});
