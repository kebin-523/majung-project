// 장소 검색 함수(server/kakao/handlePlaces.js)를 직접 불러 확인한다. fetch·키는 모두 가짜이고 네트워크는 쓰지 않는다.
// 카카오 응답은 이 파일 안에서 합성한 값이다. docs/samples 의 파일은 쓰지 않는다.
import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handlePlaces, MAX_QUERY_LENGTH, MIN_QUERY_LENGTH, UPSTREAM_TIMEOUT_MS } from '../server/kakao/handlePlaces.js';
import { blockNetwork } from './helpers/blockNetwork.js';

blockNetwork();

const KEY = 'secret-KAKAO-key+/=value';
const QUERY = '합정역';

const doc = (overrides = {}) => ({
  id: '1001',
  place_name: '가상역 1번 출구',
  address_name: '서울 가상구 가상동 1-1',
  road_address_name: '서울 가상구 가상로 1',
  x: '126.5',
  y: '37.5',
  ...overrides,
});
const kakaoBody = (documents) => JSON.stringify({ meta: { total_count: documents.length }, documents });

/** 호출을 기록하는 가짜 fetch. reply 는 { status, text } 이거나 던질 오류. 신호가 중단되면 그 이유로 거절한다. */
function fakeFetch(reply) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (reply === 'hang') {
      return new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason));
      });
    }
    if (reply instanceof Error) throw reply;
    return { status: reply.status ?? 200, text: async () => reply.text };
  };
  return { impl, calls };
}

const post = (rawBody, { method = 'POST' } = {}) =>
  new Request('https://majung.example/api/places', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' || method === 'HEAD' ? undefined : rawBody,
  });
const withQuery = (query) => JSON.stringify({ query });

async function run(rawBody, reply, options = {}) {
  const apiKey = 'apiKey' in options ? options.apiKey : KEY; // apiKey: undefined 는 "환경변수 없음"
  const upstream = fakeFetch(reply);
  const response = await handlePlaces(post(rawBody, options), {
    apiKey,
    fetch: upstream.impl,
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  });
  return { response, calls: upstream.calls };
}
const json = (response) => response.clone().json();

let logged;
let originals;
beforeEach(() => {
  logged = [];
  originals = { error: console.error, log: console.log, info: console.info, warn: console.warn };
  for (const name of Object.keys(originals)) console[name] = (...args) => logged.push(args.join(' '));
});
afterEach(() => {
  Object.assign(console, originals);
});

test('성공: 카카오를 한 번만 부르고 변환된 장소를 ok: true 로 돌려준다', async () => {
  const { response, calls } = await run(withQuery(QUERY), { text: kakaoBody([doc()]) });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.deepEqual(await json(response), {
    ok: true,
    data: [{ id: '1001', name: '가상역 1번 출구', address: '서울 가상구 가상로 1', lng: 126.5, lat: 37.5 }],
  });
});

test('요청 주소: page=1, size=15, 한글 검색어는 UTF-8 퍼센트 인코딩, 인증 헤더는 KakaoAK', async () => {
  const { calls } = await run(withQuery(`  ${QUERY}  `), { text: kakaoBody([doc()]) });
  const url = new URL(calls[0].url);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'dapi.kakao.com');
  assert.ok(calls[0].url.includes('query=%ED%95%A9%EC%A0%95%EC%97%AD&'), calls[0].url); // 합정역, 앞뒤 공백은 뺀다
  assert.equal(url.searchParams.get('page'), '1');
  assert.equal(url.searchParams.get('size'), '15');
  assert.equal(calls[0].init.headers.Authorization, `KakaoAK ${KEY}`);
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.ok(!calls[0].url.includes(KEY)); // 키는 주소에 들어가지 않는다
});

test('시간 제한 기본값은 8초', () => {
  assert.equal(UPSTREAM_TIMEOUT_MS, 8000);
});

test('결과 없음은 오류가 아니라 빈 배열이다', async () => {
  const { response } = await run(withQuery(QUERY), { text: kakaoBody([]) });
  assert.equal(response.status, 200);
  assert.deepEqual(await json(response), { ok: true, data: [] });
});

test('성공·오류 응답 모두 Cache-Control: no-store', async () => {
  const replies = [{ text: kakaoBody([doc()]) }, { text: kakaoBody([]) }, { status: 429, text: '' }, { status: 503, text: '' }];
  for (const reply of replies) {
    const { response } = await run(withQuery(QUERY), reply);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  const invalid = await run('not json', { text: '' });
  assert.equal(invalid.response.headers.get('Cache-Control'), 'no-store');
  const missingKey = await run(withQuery(QUERY), { text: '' }, { apiKey: undefined });
  assert.equal(missingKey.response.headers.get('Cache-Control'), 'no-store');
  const wrongMethod = await run('', { text: '' }, { method: 'GET' });
  assert.equal(wrongMethod.response.headers.get('Cache-Control'), 'no-store');
});

test('오류 reason 과 HTTP 상태: 429 quota, 400·401·403 config, 5xx error', async () => {
  const cases = [
    [{ status: 429, text: '' }, 'quota', 429],
    [{ status: 401, text: '{}' }, 'config', 500],
    [{ status: 403, text: '{}' }, 'config', 500],
    [{ status: 400, text: '{}' }, 'config', 500],
    [{ status: 500, text: 'oops' }, 'error', 502],
    [{ status: 503, text: '' }, 'error', 502],
    [{ status: 404, text: '' }, 'error', 502],
    [{ status: 200, text: 'not json' }, 'error', 502],
    [{ status: 200, text: JSON.stringify({ meta: {} }) }, 'error', 502], // documents 가 없는 응답
    [{ status: 200, text: JSON.stringify({ errorType: 'ValidationError', message: 'x' }) }, 'config', 500],
  ];
  for (const [reply, reason, status] of cases) {
    const { response } = await run(withQuery(QUERY), reply);
    assert.equal(response.status, status, `${reply.status} ${reply.text}`);
    assert.deepEqual(await json(response), { ok: false, reason });
  }
});

test('연결 실패는 error 이고 한 번만 부른다', async () => {
  const failure = new TypeError('fetch failed');
  const { response, calls } = await run(withQuery(QUERY), failure);
  assert.equal(response.status, 502);
  assert.deepEqual(await json(response), { ok: false, reason: 'error' });
  assert.equal(calls.length, 1);
});

test('시간 초과는 timeout 이 아니라 error 로 돌려준다 (항공편 함수와 같은 체계)', async () => {
  const { response, calls } = await run(withQuery(QUERY), 'hang', { timeoutMs: 20 });
  assert.equal(response.status, 502);
  assert.deepEqual(await json(response), { ok: false, reason: 'error' });
  assert.equal(calls.length, 1);
});

test('잘못된 본문은 외부를 부르지 않고 400 invalid', async () => {
  const bad = {
    '비어 있는 본문': '',
    'JSON 이 아님': 'query=합정역',
    '깨진 JSON': '{"query": "합정',
    '배열': JSON.stringify(['합정역']),
    null: 'null',
    'query 없음': JSON.stringify({}),
    '숫자 query': JSON.stringify({ query: 12345 }),
    '객체 query': JSON.stringify({ query: { a: 1 } }),
    '배열 query': JSON.stringify({ query: ['합정역'] }),
    'null query': JSON.stringify({ query: null }),
    '빈 문자열': withQuery(''),
    '공백만': withQuery('   '),
    '1글자': withQuery('역'),
    '공백 포함 1글자': withQuery('  역 '),
    '너무 긺': withQuery('가'.repeat(MAX_QUERY_LENGTH + 1)),
    '본문이 너무 큼': JSON.stringify({ query: QUERY, extra: 'x'.repeat(5000) }),
  };
  for (const [name, raw] of Object.entries(bad)) {
    const { response, calls } = await run(raw, { text: kakaoBody([doc()]) });
    assert.equal(response.status, 400, name);
    assert.deepEqual(await json(response), { ok: false, reason: 'invalid' }, name);
    assert.equal(calls.length, 0, name);
  }
});

test('글자 수 경계: 2글자와 최대 글자 수는 통과, 이모지는 한 글자로 센다', async () => {
  assert.equal(MIN_QUERY_LENGTH, 2);
  for (const query of ['합정', '가'.repeat(MAX_QUERY_LENGTH), '😀'.repeat(MAX_QUERY_LENGTH)]) {
    const { response, calls } = await run(withQuery(query), { text: kakaoBody([]) });
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
  }
});

test('POST 가 아니면 405 이고 외부를 부르지 않는다', async () => {
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const { response, calls } = await run(withQuery(QUERY), { text: kakaoBody([doc()]) }, { method });
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.get('Allow'), 'POST');
    assert.equal(calls.length, 0);
  }
});

test('키가 없으면 외부를 부르지 않고 config', async () => {
  for (const apiKey of [undefined, '', '   ']) {
    const { response, calls } = await run(withQuery(QUERY), { text: kakaoBody([doc()]) }, { apiKey });
    assert.equal(response.status, 500);
    assert.deepEqual(await json(response), { ok: false, reason: 'config' });
    assert.equal(calls.length, 0);
  }
});

test('응답과 로그에 키가 없다', async () => {
  const failure = new Error(`failed with Authorization: KakaoAK ${KEY}`);
  const results = [
    await run(withQuery(QUERY), failure),
    await run(withQuery(QUERY), { status: 401, text: `bad key ${KEY}` }),
    await run(withQuery(QUERY), { text: kakaoBody([doc()]) }),
  ];
  for (const { response } of results) {
    const text = await response.clone().text();
    assert.ok(!text.includes(KEY) && !text.includes(encodeURIComponent(KEY)));
  }
  assert.ok(logged.length > 0);
  assert.ok(logged.every((line) => !line.includes(KEY) && !line.includes(encodeURIComponent(KEY))));
});

test('로그에는 검색어·주소가 없고 reason, 상태 코드, 건수만 남는다', async () => {
  const secretQuery = '비밀스러운검색어';
  const failure = new Error(`failed query=${secretQuery}`);
  await run(withQuery(secretQuery), { text: kakaoBody([doc(), doc({ id: '1002' })]) });
  await run(withQuery(secretQuery), { text: kakaoBody([]) });
  await run(withQuery(secretQuery), { status: 429, text: secretQuery });
  await run(withQuery(secretQuery), { status: 503, text: '' });
  await run(withQuery(secretQuery), failure);
  await run(withQuery(secretQuery), { text: 'not json' });
  await run(withQuery(secretQuery), { text: '' }, { apiKey: undefined });
  // invalid: 본문이 어떤 이유로 거절돼도 본문 글(검색어)이 로그에 남지 않아야 한다
  await run(withQuery(secretQuery.slice(0, 1)), { text: '' }); // 너무 짧음
  await run(withQuery(secretQuery + '가'.repeat(MAX_QUERY_LENGTH)), { text: '' }); // 너무 긺
  await run(`{"query": "${secretQuery}`, { text: '' }); // 깨진 JSON
  await run(JSON.stringify({ query: 123, memo: secretQuery }), { text: '' }); // 문자열이 아님

  assert.ok(logged.length >= 11);
  const everything = logged.join('\n');
  for (const forbidden of [secretQuery, encodeURIComponent(secretQuery), '서울 가상구', '가상역', KEY]) {
    assert.ok(!everything.includes(forbidden), forbidden);
  }
  assert.ok(logged.some((line) => line.includes('quota') && line.includes('429')));
  assert.ok(logged.some((line) => line.includes('count=2')));
  assert.ok(logged.some((line) => line.includes('count=0')));
});

test('키·권한 오류 로그에 errorType·키 지문이 남고 키 원문·메시지(검색어)는 남지 않는다', async () => {
  const message = `cannot access ${QUERY} 서울 가상구`;
  await run(withQuery(QUERY), { status: 403, text: JSON.stringify({ errorType: 'AccessDeniedError', message }) });
  const log = logged.at(-1);
  assert.match(log, /config status=403 errorType=AccessDeniedError code=none keyLen=24 keySha=[0-9a-f]{8}/);
  assert.ok(!log.includes(KEY) && !log.includes(QUERY) && !log.includes('서울 가상구'));
  await run(withQuery(QUERY), { status: 401, text: JSON.stringify({ code: -401, msg: QUERY }) });
  assert.match(logged.at(-1), /errorType=none code=-401/);
  assert.ok(!logged.at(-1).includes(QUERY));
});

test('다음 페이지를 자동으로 부르지 않는다: 15건이 꽉 차도 호출은 한 번', async () => {
  const documents = Array.from({ length: 15 }, (_, i) => doc({ id: String(2000 + i) }));
  const { response, calls } = await run(withQuery(QUERY), { text: kakaoBody(documents) });
  assert.equal((await json(response)).data.length, 15);
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).searchParams.get('page'), '1');
});
