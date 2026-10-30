import test from 'node:test';
import assert from 'node:assert/strict';
import { KEYWORD_URL, PAGE_SIZE, buildKeywordUrl, normalizePlaces } from '../server/kakao/normalizePlaces.js';
import {
  REASONS,
  classifyHttpStatus,
  classifyThrown,
  isValidationError,
} from '../server/kakao/classifyError.js';
import { blockNetwork } from './helpers/blockNetwork.js';

blockNetwork();

// 카카오 응답과 같은 모양의 합성 데이터. 실제 응답(docs/samples)을 복사하지 않았다.
const doc = (overrides = {}) => ({
  address_name: '가나도 다라시 마바동 1',
  category_group_code: 'SW8',
  category_group_name: '지하철역',
  category_name: '교통,수송 > 지하철,전철 > 가상1호선',
  distance: '',
  id: '1001',
  phone: '',
  place_name: '가상역 1호선',
  place_url: 'http://place.map.kakao.com/1001',
  road_address_name: '가나도 다라시 역전로 10',
  x: '126.5',
  y: '37.25',
  ...overrides,
});

const body = (documents, meta = {}) => ({
  documents,
  meta: { is_end: true, pageable_count: documents.length, total_count: documents.length, ...meta },
});

test('normalizePlaces: 필드를 Place 로 바꾼다 (id, name, 도로명 주소, 숫자 좌표)', () => {
  const result = normalizePlaces(body([doc()]));
  assert.deepEqual(result, {
    ok: true,
    data: [{ id: '1001', name: '가상역 1호선', address: '가나도 다라시 역전로 10', lng: 126.5, lat: 37.25 }],
    dropped: 0,
  });
  assert.equal(typeof result.data[0].lng, 'number');
  assert.equal(typeof result.data[0].lat, 'number');
});

test('normalizePlaces: 도로명 주소가 비어 있으면(빈 문자열·공백·없음) 지번 주소를 쓴다', () => {
  for (const road of ['', '   ', undefined, null]) {
    const { data } = normalizePlaces(body([doc({ road_address_name: road })]));
    assert.equal(data[0].address, '가나도 다라시 마바동 1');
  }
});

test('normalizePlaces: 두 주소가 모두 비어 있어도 항목은 남기고 주소는 빈 글자다', () => {
  const { data } = normalizePlaces(body([doc({ road_address_name: '', address_name: '' })]));
  assert.equal(data.length, 1);
  assert.equal(data[0].address, '');
});

test('normalizePlaces: 좌표가 숫자가 아니면 그 항목만 버리고 dropped 로 센다', () => {
  const documents = [
    doc({ id: '1' }),
    doc({ id: '2', x: 'abc' }),
    doc({ id: '3', y: '' }),
    doc({ id: '4', x: undefined }),
    doc({ id: '5', y: null }),
    doc({ id: '6', x: 'NaN' }),
    doc({ id: '7', y: 'Infinity' }),
    doc({ id: '8', x: 126.5 }), // 문자열이 아니면 받아들이지 않는다 (카카오는 문자열로 준다)
    doc({ id: '9', x: '127.0', y: '37.0' }),
  ];
  const result = normalizePlaces(body(documents));
  assert.deepEqual(result.data.map((p) => p.id), ['1', '9']);
  assert.equal(result.dropped, 7);
});

test('normalizePlaces: id·이름이 없거나 항목이 객체가 아니면 버린다', () => {
  const documents = [doc({ id: '' }), doc({ id: undefined }), doc({ place_name: '  ' }), null, 'text', 7, doc({ id: '10' })];
  const result = normalizePlaces(body(documents));
  assert.deepEqual(result.data.map((p) => p.id), ['10']);
  assert.equal(result.dropped, 6);
});

test('normalizePlaces: documents 가 빈 배열이면 오류가 아니라 빈 결과다', () => {
  const result = normalizePlaces({ documents: [], meta: { is_end: true, pageable_count: 0, total_count: 0 } });
  assert.deepEqual(result, { ok: true, data: [], dropped: 0 });
});

test('normalizePlaces: 건수는 total_count 가 아니라 받은 개수다', () => {
  const result = normalizePlaces(body([doc({ id: '1' }), doc({ id: '2' })], { total_count: 23, pageable_count: 20, is_end: false }));
  assert.equal(result.data.length, 2);
});

test('normalizePlaces: meta.same_name 은 읽지 않는다 (없어도, 어떤 모양이어도 같은 결과)', () => {
  const documents = [doc()];
  const base = normalizePlaces({ documents });
  for (const same_name of [undefined, null, 'x', { keyword: '??', region: [], selected_region: '' }, { region: ['서울'] }]) {
    assert.deepEqual(normalizePlaces({ documents, meta: { same_name } }), base);
  }
});

test('normalizePlaces: 받은 순서를 그대로 지킨다', () => {
  const result = normalizePlaces(body([doc({ id: 'b' }), doc({ id: 'a' }), doc({ id: 'c' })]));
  assert.deepEqual(result.data.map((p) => p.id), ['b', 'a', 'c']);
});

test('normalizePlaces: 카카오의 오류 본문·모르는 모양은 error 다', () => {
  const validationError = {
    errorType: 'ValidationError',
    message: 'Request validation is failed',
    details: [{ field: 'query.size', error: 'should be a number' }],
  };
  for (const input of [validationError, {}, { documents: null }, { documents: 'x' }, null, undefined, 'text', 3]) {
    assert.deepEqual(normalizePlaces(input), { ok: false, reason: 'error' });
  }
});

test('buildKeywordUrl: 한글 검색어를 UTF-8 로 퍼센트 인코딩한다 (CP949 가 아니다)', () => {
  const url = buildKeywordUrl('오이도역');
  assert.equal(url, `${KEYWORD_URL}?query=%EC%98%A4%EC%9D%B4%EB%8F%84%EC%97%AD&page=1&size=${PAGE_SIZE}`);
  assert.equal(new URL(url).searchParams.get('query'), '오이도역');
  // CP949 로 바뀌었다면 나왔을 값 (오 = BF C0)
  assert.ok(!url.includes('%BF%C0'));
});

test('buildKeywordUrl: 띄어쓰기·& · # · ? 가 든 검색어가 다른 파라미터로 새지 않는다', () => {
  const query = '서울 중구 세종대로 110 & size=1#a?b';
  const url = new URL(buildKeywordUrl(query));
  assert.equal(url.searchParams.get('query'), query);
  assert.equal(url.searchParams.get('size'), String(PAGE_SIZE));
  assert.equal(url.searchParams.get('page'), '1');
  assert.equal(url.hash, '');
});

test('buildKeywordUrl: https 이고 키가 주소에 들어가지 않는다', () => {
  const url = buildKeywordUrl('합정역');
  assert.ok(url.startsWith('https://dapi.kakao.com/'));
  assert.ok(!/KakaoAK|api_?key|authorization|[?&]key=/i.test(url));
});

test('buildKeywordUrl: 검색어가 없으면 빈 query 다 (undefined 글자가 들어가지 않는다)', () => {
  assert.equal(new URL(buildKeywordUrl(undefined)).searchParams.get('query'), '');
  assert.equal(new URL(buildKeywordUrl(null)).searchParams.get('query'), '');
});

test('reason 은 quota · config · error 3가지다 (notfound · missing 은 없다)', () => {
  assert.deepEqual([...REASONS], ['quota', 'config', 'error']);
});

test('classifyHttpStatus: 2xx 는 null, 429 는 quota 로 따로 나눈다', () => {
  assert.equal(classifyHttpStatus(200), null);
  assert.equal(classifyHttpStatus(204), null);
  assert.equal(classifyHttpStatus(429), 'quota');
});

test('classifyHttpStatus: 400 · 401 · 403 은 config 다 (401·403 은 추정, 확인 못 함)', () => {
  for (const status of [400, 401, 403]) assert.equal(classifyHttpStatus(status), 'config');
});

test('classifyHttpStatus: 서버 오류와 모르는 상태는 error 다', () => {
  for (const status of [500, 502, 503, 504, 404, 302, 0, NaN, undefined, null, '429']) {
    assert.equal(classifyHttpStatus(status), 'error');
  }
});

test('isValidationError: 카카오의 ValidationError 본문만 알아본다', () => {
  assert.equal(isValidationError({ errorType: 'ValidationError', message: 'x', details: [] }), true);
  for (const input of [{}, { errorType: 'Other' }, { documents: [] }, null, undefined, 'ValidationError']) {
    assert.equal(isValidationError(input), false);
  }
});

test('classifyThrown: 연결 실패·시간 초과는 error 다', () => {
  assert.equal(classifyThrown(), 'error');
});
