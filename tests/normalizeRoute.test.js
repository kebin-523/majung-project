// 카카오모빌리티 자동차 길찾기 응답 변환(server/kakao/normalizeRoute.js)과 오류 분류(classifyRouteError.js).
// 응답은 카카오 응답과 같은 모양의 합성 데이터다. 실제 응답(docs/samples)을 복사하지 않았다. 네트워크는 쓰지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRoute } from '../server/kakao/normalizeRoute.js';
import {
  ROUTE_REASONS,
  classifyRouteHttpStatus,
  classifyRouteResultCode,
  classifyThrown,
} from '../server/kakao/classifyRouteError.js';
import { REASONS as PLACE_REASONS } from '../server/kakao/classifyError.js';
import { blockNetwork } from './helpers/blockNetwork.js';

blockNetwork();

/** 성공 응답. 쓰지 않는 필드(fare·sections·좌표·도로 이름)를 일부러 채워 두어 결과에 새지 않는지 본다. */
const okBody = (duration, distance, summaryOverrides = {}) => ({
  trans_id: 'synthetic-trans-id',
  routes: [
    {
      result_code: 0,
      result_msg: '길찾기 성공',
      summary: {
        origin: { name: '합성출발', x: 126.11, y: 37.22 },
        destination: { name: '합성도착', x: 126.33, y: 37.44 },
        waypoints: [],
        priority: 'RECOMMEND',
        bound: { min_x: 1, min_y: 2, max_x: 3, max_y: 4 },
        fare: { taxi: 51000, toll: 1700 },
        distance,
        duration,
        ...summaryOverrides,
      },
      sections: [
        {
          distance,
          duration: 10,
          bound: {},
          roads: [{ name: '합성대로', distance: 5, duration: 5, vertexes: [126.11, 37.22] }],
          guides: [{ name: '합성교차로', x: 126.2, y: 37.3, type: 1 }],
        },
      ],
    },
  ],
});

/** 경로 없음 계열: summary 가 없다. */
const codeBody = (code) => ({ trans_id: 'synthetic-trans-id', routes: [{ result_code: code, result_msg: '합성 메시지' }] });

// ---------- 성공 ----------

test('성공: 초는 올림해 분으로, 미터는 km 로 (2383초 → 40분)', () => {
  assert.deepEqual(normalizeRoute(okBody(2383, 38366)), { ok: true, data: { minutes: 40, distanceKm: 38.4 } });
  assert.deepEqual(normalizeRoute(okBody(2500, 41000)), { ok: true, data: { minutes: 42, distanceKm: 41 } });
});

test('올림 경계: 2400초는 40분, 2401초는 41분', () => {
  assert.equal(normalizeRoute(okBody(2400, 1000)).data.minutes, 40);
  assert.equal(normalizeRoute(okBody(2401, 1000)).data.minutes, 41);
  for (const [seconds, minutes] of [[1, 1], [59, 1], [60, 1], [61, 2], [119, 2], [120, 2], [3600, 60], [3601, 61]]) {
    assert.equal(normalizeRoute(okBody(seconds, 1000)).data.minutes, minutes, `${seconds}초`);
  }
});

test('거리는 소수 첫째 자리까지 반올림한 km (정수 미터가 아닌 값도 같은 규칙)', () => {
  const cases = [[38366, 38.4], [38349, 38.3], [38350, 38.4], [400, 0.4], [1000, 1], [100000, 100]];
  for (const [meters, km] of cases) assert.equal(normalizeRoute(okBody(600, meters)).data.distanceKm, km, `${meters}m`);
});

test('결과에는 minutes 와 distanceKm 만 있고 fare · sections · 좌표 · 이름 · trans_id 가 새지 않는다', () => {
  const result = normalizeRoute(okBody(2383, 38366));
  assert.deepEqual(Object.keys(result), ['ok', 'data']);
  assert.deepEqual(Object.keys(result.data), ['minutes', 'distanceKm']);
  const text = JSON.stringify(result);
  for (const leaked of ['fare', 'taxi', 'toll', 'sections', 'roads', 'guides', 'vertexes', '합성', 'synthetic', '126.', '37.', 'bound']) {
    assert.ok(!text.includes(leaked), leaked);
  }
});

// ---------- 경로 없음 · 그 밖의 result_code ----------

test('result_code 1 · 101 · 102 · 103 · 104 는 noroute', () => {
  for (const code of [1, 101, 102, 103, 104]) {
    assert.deepEqual(normalizeRoute(codeBody(code)), { ok: false, reason: 'noroute' }, String(code));
  }
});

test('result_code 가 0 이 아니면 summary 가 있어도 읽지 않는다', () => {
  const body = okBody(2383, 38366);
  body.routes[0].result_code = 104;
  assert.deepEqual(normalizeRoute(body), { ok: false, reason: 'noroute' });
  body.routes[0].result_code = 105;
  assert.deepEqual(normalizeRoute(body), { ok: false, reason: 'error' });
});

test('105~107(주변 유고)과 다중 출발지·목적지 코드(201~207, 301~304)와 모르는 코드는 error', () => {
  const codes = [105, 106, 107, 201, 202, 203, 204, 205, 206, 207, 301, 302, 303, 304, 2, 100, 108, 999, -1];
  for (const code of codes) assert.deepEqual(normalizeRoute(codeBody(code)), { ok: false, reason: 'error' }, String(code));
});

test('result_code 가 정수가 아니면(문자열 · 소수 · 없음 · null) error', () => {
  for (const code of ['0', '104', 0.5, null, undefined, NaN, {}, []]) {
    const body = okBody(2383, 38366);
    body.routes[0].result_code = code;
    assert.deepEqual(normalizeRoute(body), { ok: false, reason: 'error' }, String(code));
  }
});

// ---------- 모양이 이상한 응답 ----------

test('잘못된 입력(HTTP 400)의 최상위 { code, msg } 모양은 error', () => {
  assert.deepEqual(normalizeRoute({ code: -2, msg: '출발지가 유효하지 않습니다.' }), { ok: false, reason: 'error' });
  assert.deepEqual(normalizeRoute({ code: -10, msg: '합성' }), { ok: false, reason: 'error' });
  // routes 가 같이 있어도 최상위 code·msg 가 있으면 읽지 않는다
  assert.deepEqual(normalizeRoute({ ...okBody(2383, 38366), code: -1, msg: '합성' }), { ok: false, reason: 'error' });
});

test('routes 가 없거나 비었거나 배열이 아니면 error', () => {
  for (const body of [{}, { routes: [] }, { routes: null }, { routes: 'x' }, { routes: {} }, { routes: [null] }, { routes: ['x'] }, { routes: [[]] }]) {
    assert.deepEqual(normalizeRoute(body), { ok: false, reason: 'error' }, JSON.stringify(body));
  }
});

test('본문이 객체가 아니면 error', () => {
  for (const body of [null, undefined, 'text', 123, true, []]) {
    assert.deepEqual(normalizeRoute(body), { ok: false, reason: 'error' }, String(body));
  }
});

test('result_code 0 인데 summary 가 없거나 duration · distance 가 숫자가 아니거나 0 이하이면 error', () => {
  const noSummary = okBody(2383, 38366);
  delete noSummary.routes[0].summary;
  assert.deepEqual(normalizeRoute(noSummary), { ok: false, reason: 'error' });

  const badSummary = okBody(2383, 38366);
  badSummary.routes[0].summary = null;
  assert.deepEqual(normalizeRoute(badSummary), { ok: false, reason: 'error' });

  const bad = ['2383', null, undefined, NaN, Infinity, -Infinity, 0, -1, -2383, {}, [], true];
  for (const value of bad) {
    assert.deepEqual(normalizeRoute(okBody(value, 38366)), { ok: false, reason: 'error' }, `duration ${String(value)}`);
    assert.deepEqual(normalizeRoute(okBody(2383, value)), { ok: false, reason: 'error' }, `distance ${String(value)}`);
  }
});

test('summary 가 아니라 sections 안의 duration 만 있으면 쓰지 않고 error', () => {
  const body = okBody(2383, 38366);
  delete body.routes[0].summary.duration;
  body.routes[0].sections[0].duration = 2365; // 섹션 값은 읽지 않는다
  assert.deepEqual(normalizeRoute(body), { ok: false, reason: 'error' });
});

// ---------- 오류 분류 ----------

test('ROUTE_REASONS: quota · config · noroute · invalid · error', () => {
  assert.deepEqual([...ROUTE_REASONS], ['quota', 'config', 'noroute', 'invalid', 'error']);
  assert.ok(Object.isFrozen(ROUTE_REASONS));
});

test('기존 장소 검색의 reason(quota · config · error)과 이름이 어긋나지 않는다', () => {
  for (const reason of PLACE_REASONS) assert.ok(ROUTE_REASONS.includes(reason), reason);
});

test('classifyRouteHttpStatus: 429 quota, 401 · 403 config, 400 은 config 가 아니라 error, 5xx · 그 밖은 error, 2xx 는 null', () => {
  const expected = {
    200: null, 201: null, 299: null,
    429: 'quota',
    401: 'config', 403: 'config',
    400: 'error', 404: 'error', 408: 'error', 422: 'error',
    500: 'error', 502: 'error', 503: 'error', 504: 'error',
    301: 'error', 302: 'error',
  };
  for (const [status, reason] of Object.entries(expected)) {
    assert.equal(classifyRouteHttpStatus(Number(status)), reason, status);
  }
  for (const value of [undefined, null, '200', 200.5, NaN]) assert.equal(classifyRouteHttpStatus(value), 'error', String(value));
});

test('classifyRouteHttpStatus 는 invalid 를 돌려주지 않는다 (invalid 는 서버가 보내기 전에 입력을 검사해서 정한다)', () => {
  for (let status = 100; status < 600; status += 1) {
    const reason = classifyRouteHttpStatus(status);
    assert.ok(reason === null || (ROUTE_REASONS.includes(reason) && reason !== 'invalid' && reason !== 'noroute'), String(status));
  }
});

test('classifyRouteResultCode: 0 은 null, noroute 다섯 개, 나머지는 error', () => {
  assert.equal(classifyRouteResultCode(0), null);
  for (const code of [1, 101, 102, 103, 104]) assert.equal(classifyRouteResultCode(code), 'noroute', String(code));
  for (const code of [105, 106, 107, 201, 304, 999, -1, '0', null, undefined]) assert.equal(classifyRouteResultCode(code), 'error', String(code));
});

test('classifyThrown: 연결 실패 · 시간 초과는 모두 error', () => {
  assert.equal(classifyThrown(new TypeError('fetch failed')), 'error');
  const timeout = new Error('timeout');
  timeout.name = 'TimeoutError';
  assert.equal(classifyThrown(timeout), 'error');
  assert.equal(classifyThrown(), 'error');
});

test('어떤 입력이든 normalizeRoute 의 reason 은 알려진 reason 이다', () => {
  const inputs = [null, {}, { routes: [] }, codeBody(1), codeBody(105), codeBody(7), okBody(0, 1), okBody(1, 1), { code: -2, msg: 'x' }];
  for (const input of inputs) {
    const result = normalizeRoute(input);
    if (!result.ok) assert.ok(ROUTE_REASONS.includes(result.reason), JSON.stringify(input));
  }
});
