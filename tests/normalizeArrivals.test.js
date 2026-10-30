import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { interpretArrivalsResponse, normalizeArrivalsBody, readStatus } from '../server/icn/normalizeArrivals.js';
import { blockNetwork } from './helpers/blockNetwork.js';
import { FIXTURES, loadFixture, loadFixtureText } from './helpers/fixtures.js';

blockNetwork();

const FETCHED_AT = Date.UTC(2026, 9, 30, 2, 5); // 2026-10-30 11:05 KST
const kst = (y, m, d, h, mi) => Date.UTC(y, m - 1, d, h - 9, mi);
const search = (body) => normalizeArrivalsBody(body, { fetchedAt: FETCHED_AT });
const refresh = (body, fid) => normalizeArrivalsBody(body, { mode: 'refresh', fid, fetchedAt: FETCHED_AT });

// 실제 샘플의 행 하나를 바탕으로, 일부 값만 바꾼 응답을 만든다.
const baseRow = () => structuredClone(loadFixture(FIXTURES.slave).response.body.items[0]); // KE5854 (Slave)
const makeRow = (overrides = {}) => ({ ...baseRow(), ...overrides });
const makeBody = (items, totalCount = items.length) => ({
  response: {
    header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' },
    body: { numOfRows: 10, pageNo: 1, totalCount, items },
  },
});

test('fetch 가 막혀 있다 (테스트는 네트워크를 쓰지 않는다)', () => {
  assert.throws(() => fetch('https://example.invalid/'), /fetch/);
});

test('fixture 에 키·서비스 주소가 들어 있지 않다', () => {
  const dir = new URL('./fixtures/', import.meta.url);
  const names = readdirSync(dir).filter((name) => name.endsWith('.json'));
  assert.ok(names.length >= 5);
  for (const name of names) {
    assert.doesNotMatch(loadFixtureText(name), /serviceKey|apis\.data\.go\.kr|KEY=/i, name);
  }
});

// ── 도착 / 착륙 / 착륙 전 샘플 ─────────────────────────────

test('도착(arrived): 한 건을 규칙대로 변환한다', () => {
  const result = search(loadFixture(FIXTURES.arrived));
  assert.equal(result.ok, true);
  assert.equal(result.skippedRows, 0);
  assert.deepEqual(result.data, [
    {
      flightId: '2026102400000007900382',
      flightNo: 'CZ313',
      arrivalDate: '2026-10-30',
      scheduled: kst(2026, 10, 30, 11, 0),
      estimated: kst(2026, 10, 30, 11, 3),
      changed: kst(2026, 10, 30, 11, 3),
      scheduleDiffMinutes: 3,
      status: 'arrived',
      statusRaw: '도착',
      estimateBasis: 'recorded',
      terminal: { code: 'P02', name: '탑승동' },
      origin: '상하이/푸동',
      originCode: 'PVG',
      airline: '중국남방항공',
      codeshare: 'Master',
      masterFlightNo: null,
      fetchedAt: FETCHED_AT,
      source: 'icn',
    },
  ]);
  assert.equal('landed' in result.data[0], false, 'landed 는 DesignGuide를 정할 때까지 만들지 않는다');
});

test('컴퓨터 시간대가 달라도 변환 결과가 같다 (실행 중에 TZ 를 바꿔 확인)', () => {
  const original = process.env.TZ;
  const convert = () => search(loadFixture(FIXTURES.beforeLanding));
  try {
    process.env.TZ = 'Asia/Seoul';
    const inSeoul = convert();
    process.env.TZ = 'America/Los_Angeles';
    const inLosAngeles = convert();
    assert.deepEqual(inLosAngeles, inSeoul);
    assert.equal(inSeoul.data[0].arrivalDate, '2026-10-30');
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test('착륙(touchdown): estimateBasis 는 recorded 가 아니라 touchdown, 같은 편의 fid 는 도착 때와 같다', () => {
  const touchdown = search(loadFixture(FIXTURES.touchdown)).data;
  assert.equal(touchdown.length, 2);

  const cz313 = touchdown.find((f) => f.flightNo === 'CZ313');
  assert.equal(cz313.status, 'touchdown');
  assert.equal(cz313.statusRaw, '착륙');
  assert.equal(cz313.estimateBasis, 'touchdown');
  assert.equal(cz313.scheduleDiffMinutes, 3);

  const arrived = search(loadFixture(FIXTURES.arrived)).data[0];
  assert.equal(cz313.flightId, arrived.flightId);
  assert.equal(cz313.estimated, arrived.estimated);

  const lj422 = touchdown.find((f) => f.flightNo === 'LJ422'); // 예정보다 4분 일찍
  assert.equal(lj422.scheduleDiffMinutes, -4);
  assert.deepEqual(lj422.terminal, { code: 'P03', name: '제2터미널' });
  assert.equal(lj422.origin, '후쿠오카');
});

test('착륙 전(remark 없음): status none, statusRaw null, estimateBasis forecast', () => {
  const [ze606, tw614] = search(loadFixture(FIXTURES.beforeLanding)).data;

  assert.equal(ze606.flightNo, 'ZE606');
  assert.equal(ze606.status, 'none');
  assert.equal(ze606.statusRaw, null);
  assert.equal(ze606.estimateBasis, 'forecast');
  assert.equal(ze606.scheduleDiffMinutes, -25); // 14:15 예정, 13:50 변경
  assert.equal(ze606.changed, kst(2026, 10, 30, 13, 50));
  assert.equal(ze606.origin, '도쿄/나리타');

  // 일정대로인 편: 변경 시각이 예정과 같은 값으로 온다 → changed 는 null, estimated 는 그대로
  assert.equal(tw614.flightNo, 'TW614');
  assert.equal(tw614.scheduleDiffMinutes, 0);
  assert.equal(tw614.changed, null);
  assert.equal(tw614.estimated, tw614.scheduled);
  assert.equal(tw614.origin, '선양(심양)'); // 공항명은 원문 그대로
});

test('Slave 편명 검색: 그 행만 돌려주고 마스터와 합치지 않는다', () => {
  const result = search(loadFixture(FIXTURES.slave));
  assert.equal(result.data.length, 1);
  const [ke5854] = result.data;
  assert.equal(ke5854.flightNo, 'KE5854');
  assert.equal(ke5854.codeshare, 'Slave');
  assert.equal(ke5854.masterFlightNo, 'MU2039');
  assert.equal(ke5854.flightId, '2026102400000007900709');
});

test('Master 행의 masterflightid 는 빈 문자열이라 masterFlightNo 는 null', () => {
  const master = search(makeBody([makeRow({ flightId: 'MU2039', fid: 'F-M', codeshare: 'Master', masterflightid: '' })])).data[0];
  assert.equal(master.codeshare, 'Master');
  assert.equal(master.masterFlightNo, null);
});

test('Master 와 Slave 가 한 응답에 함께 와도 행마다 한 건씩 그대로 돌려준다 (합치지 않음)', () => {
  const rows = [
    makeRow({ flightId: 'MU2039', fid: 'F1', codeshare: 'Master', masterflightid: '' }),
    makeRow({ flightId: 'KE5854', fid: 'F2' }),
    makeRow({ flightId: 'FM3077', fid: 'F3' }),
  ];
  const { data } = search(makeBody(rows));
  assert.deepEqual(data.map((f) => f.flightNo), ['MU2039', 'KE5854', 'FM3077']);
  assert.deepEqual(data.map((f) => f.flightId), ['F1', 'F2', 'F3']);
});

// ── 0건 / 재확인 ──────────────────────────────────────────

test('0건(totalCount 0, items []): 처음 검색은 notfound, 재확인은 missing', () => {
  const none = loadFixture(FIXTURES.none);
  assert.deepEqual(search(none), { ok: false, reason: 'notfound' });
  assert.deepEqual(refresh(none, 'whatever'), { ok: false, reason: 'missing' });
});

test('0건일 때 items 가 아예 없어도 0건으로 본다 (관찰하지 못한 경우)', () => {
  const body = makeBody([], 0);
  delete body.response.body.items;
  assert.deepEqual(search(body), { ok: false, reason: 'notfound' });
});

test('재확인(refresh): fid 가 일치하는 한 건을 돌려준다', () => {
  const result = refresh(loadFixture(FIXTURES.touchdown), '2026102400000007900382');
  assert.equal(result.ok, true);
  assert.equal(Array.isArray(result.data), false);
  assert.equal(result.data.flightNo, 'CZ313');
});

test('재확인(refresh): 행은 오는데 fid 가 하나도 일치하지 않으면 error', () => {
  assert.deepEqual(refresh(loadFixture(FIXTURES.touchdown), 'NOT-THERE'), { ok: false, reason: 'error' });
});

test('재확인(refresh): 일치하는 행이 무효(시각 오류)면 error', () => {
  const body = makeBody([makeRow({ fid: 'F1', scheduleDateTime: '2026103011' }), makeRow({ fid: 'F2' })]);
  assert.deepEqual(refresh(body, 'F1'), { ok: false, reason: 'error' });
  assert.equal(refresh(body, 'F2').ok, true);
});

test('옵션 오류는 오류 분류에 가려지지 않고 바로 던진다', () => {
  const body = loadFixture(FIXTURES.arrived);
  assert.throws(() => normalizeArrivalsBody(body, {}), TypeError);
  assert.throws(() => normalizeArrivalsBody(body, { fetchedAt: NaN }), TypeError);
  assert.throws(() => normalizeArrivalsBody(body, { fetchedAt: FETCHED_AT, mode: 'other' }), TypeError);
  assert.throws(() => normalizeArrivalsBody(body, { fetchedAt: FETCHED_AT, mode: 'refresh' }), TypeError);
  assert.throws(() => interpretArrivalsResponse({ status: 200, text: 'Unauthorized' }, {}), TypeError);
});

// ── 잘림 표시(truncated) ──────────────────────────────────

test('truncated: 전체(totalCount)가 받은 행보다 크면 true 이고, 받은 행만 돌려준다 (다음 페이지는 부르지 않음)', () => {
  const result = search(makeBody([makeRow({ fid: 'A' }), makeRow({ fid: 'B' })], 12));
  assert.equal(result.ok, true);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.data.map((f) => f.flightId), ['A', 'B']);
});

test('truncated: 전체와 받은 행이 같으면 false 이고, 재확인(refresh)·오류 결과에는 붙이지 않는다', () => {
  for (const name of [FIXTURES.arrived, FIXTURES.touchdown, FIXTURES.beforeLanding, FIXTURES.slave]) {
    assert.equal(search(loadFixture(name)).truncated, false, name);
  }
  assert.equal(search(makeBody([makeRow({ fid: 'A' }), makeRow({ fid: 'B' })], 2)).truncated, false);

  // 재확인 성공 결과: 전체가 더 커도 붙이지 않는다
  const refreshed = refresh(makeBody([makeRow({ fid: 'A' })], 5), 'A');
  assert.equal(refreshed.ok, true);
  assert.equal('truncated' in refreshed, false);

  // 실패 결과(notfound · missing · 응답 모양 오류 · 유효한 행 없음)에도 붙이지 않는다
  const failures = [
    search(loadFixture(FIXTURES.none)),
    refresh(loadFixture(FIXTURES.none), 'x'),
    search(null),
    search(makeBody([makeRow({ scheduleDateTime: 'x' })], 5)),
  ];
  for (const failure of failures) {
    assert.equal(failure.ok, false);
    assert.equal('truncated' in failure, false);
  }
});

test('truncated: 무효 행이 섞여도 받은 행(유효한 행 + 버린 행) 기준으로 비교한다', () => {
  const items = [makeRow({ fid: 'OK1' }), makeRow({ fid: 'BAD', scheduleDateTime: 'x' }), makeRow({ fid: 'OK2' })];

  const same = search(makeBody(items, 3)); // 받은 행 3 = 전체 3 (유효한 행은 2)
  assert.equal(same.skippedRows, 1);
  assert.equal(same.data.length, 2);
  assert.equal(same.truncated, false);

  assert.equal(search(makeBody(items, 4)).truncated, true); // 전체 4 > 받은 행 3
});

// ── 도착 날짜 ────────────────────────────────────────────

test('arrivalDate: 예정 시각의 한국 달력 날짜 (한국 00:20 은 UTC로는 전날)', () => {
  const [flight] = search(makeBody([makeRow({ scheduleDateTime: '202610300020', estimatedDateTime: '202610300030' })])).data;
  assert.equal(flight.arrivalDate, '2026-10-30');
  assert.equal(flight.scheduled, Date.UTC(2026, 9, 29, 15, 20));
});

test('arrivalDate: 자정을 넘겨 도착해도 예정 날짜를 따른다 (예정 23:50 → 변경 00:20)', () => {
  const [flight] = search(makeBody([makeRow({ scheduleDateTime: '202610292350', estimatedDateTime: '202610300020' })])).data;
  assert.equal(flight.arrivalDate, '2026-10-29');
  assert.equal(flight.scheduleDiffMinutes, 30);
  assert.equal(flight.changed, kst(2026, 10, 30, 0, 20));
});

test('요청한 날짜와 다른 행도 제외하지 않고 arrivalDate 를 함께 돌려준다', () => {
  const rows = [
    makeRow({ fid: 'A', scheduleDateTime: '202610302350', estimatedDateTime: '202610302350' }),
    makeRow({ fid: 'B', scheduleDateTime: '202610310010', estimatedDateTime: '202610310010' }),
  ];
  const { data } = search(makeBody(rows));
  assert.deepEqual(data.map((f) => f.arrivalDate), ['2026-10-30', '2026-10-31']);
});

// ── 상태 값 ─────────────────────────────────────────────

test('readStatus: 지연은 delayed(forecast), 목록에 없는 값은 unknown + statusRaw', () => {
  assert.deepEqual(readStatus('지연'), { status: 'delayed', statusRaw: '지연' });
  assert.deepEqual(readStatus('착륙'), { status: 'touchdown', statusRaw: '착륙' });
  assert.deepEqual(readStatus('도착'), { status: 'arrived', statusRaw: '도착' });
  assert.deepEqual(readStatus('결항'), { status: 'unknown', statusRaw: '결항' });
  assert.deepEqual(readStatus('회항'), { status: 'unknown', statusRaw: '회항' });
  assert.deepEqual(readStatus('처음 보는 값'), { status: 'unknown', statusRaw: '처음 보는 값' });
  assert.deepEqual(readStatus(' 도착 '), { status: 'arrived', statusRaw: '도착' });
  assert.deepEqual(readStatus(7), { status: 'unknown', statusRaw: '7' });
});

test('readStatus: 값이 없으면(null·undefined·빈 문자열) none, statusRaw 는 null', () => {
  for (const value of [null, undefined, '', '   ']) assert.deepEqual(readStatus(value), { status: 'none', statusRaw: null });
});

test('estimateBasis: 상태에 따라 forecast / touchdown / recorded / unknown', () => {
  const basisOf = (remark) => search(makeBody([makeRow({ remark })])).data[0].estimateBasis;
  assert.equal(basisOf(null), 'forecast');
  assert.equal(basisOf('지연'), 'forecast');
  assert.equal(basisOf('착륙'), 'touchdown');
  assert.equal(basisOf('도착'), 'recorded');
  assert.equal(basisOf('결항'), 'unknown');
  assert.equal(basisOf('회항'), 'unknown');
});

// ── 변경 시각 · 무효 행 ──────────────────────────────────

test('변경 시각이 없으면(없음·null·빈 문자열) 행은 유효하고 changed·diff 는 null', () => {
  for (const mutate of [(r) => { delete r.estimatedDateTime; }, (r) => { r.estimatedDateTime = null; }, (r) => { r.estimatedDateTime = ''; }]) {
    const row = makeRow();
    mutate(row);
    const result = search(makeBody([row]));
    assert.equal(result.ok, true);
    const [flight] = result.data;
    assert.equal(flight.estimated, null);
    assert.equal(flight.changed, null);
    assert.equal(flight.scheduleDiffMinutes, null);
  }
});

test('변경 시각 값이 있는데 형식이 틀리면 그 행은 무효', () => {
  for (const bad of ['2026103011', 'abc', '202613301100', '202610302400', ' ', 20261030, '2026-10-30 11:00']) {
    const result = search(makeBody([makeRow({ estimatedDateTime: bad })]));
    assert.deepEqual(result, { ok: false, reason: 'error' }, JSON.stringify(bad));
  }
});

test('필수 값(flightId · fid · scheduleDateTime)이 없거나 틀리면 그 행은 무효', () => {
  const bads = [
    { flightId: '' }, { flightId: null }, { fid: '' }, { fid: undefined },
    { scheduleDateTime: '' }, { scheduleDateTime: null }, { scheduleDateTime: '202613301100' }, { scheduleDateTime: '2026103011' },
  ];
  for (const bad of bads) {
    assert.deepEqual(search(makeBody([makeRow(bad)])), { ok: false, reason: 'error' }, JSON.stringify(bad));
  }
  assert.deepEqual(search(makeBody([null])), { ok: false, reason: 'error' });
  assert.deepEqual(search(makeBody(['글자'])), { ok: false, reason: 'error' });
});

test('유효한 행이 하나라도 있으면 무효 행은 버리고 개수만 알린다', () => {
  const body = makeBody([makeRow({ fid: 'BAD', scheduleDateTime: 'x' }), makeRow({ fid: 'OK1' }), makeRow({ fid: 'BAD2', estimatedDateTime: 'x' })]);
  const result = search(body);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.map((f) => f.flightId), ['OK1']);
  assert.equal(result.skippedRows, 2);
});

test('유일한 결과가 무효 행이면 notfound 가 아니라 error', () => {
  assert.deepEqual(search(makeBody([makeRow({ scheduleDateTime: '202602301100' })])), { ok: false, reason: 'error' });
});

test('터미널: P01·P02·P03 이름, 그 밖의 값이나 없는 값은 null', () => {
  const terminalOf = (terminalid) => search(makeBody([makeRow({ terminalid })])).data[0].terminal;
  assert.deepEqual(terminalOf('P01'), { code: 'P01', name: '제1터미널' });
  assert.deepEqual(terminalOf('P02'), { code: 'P02', name: '탑승동' });
  assert.deepEqual(terminalOf('P03'), { code: 'P03', name: '제2터미널' });
  for (const value of ['C01', 'p01', '', null, undefined]) assert.equal(terminalOf(value), null, String(value));
});

test('선택 값(출발지·항공사 등)이 없으면 null', () => {
  const [flight] = search(makeBody([makeRow({ airport: '', airportCode: null, airline: undefined, codeshare: '' })])).data;
  assert.equal(flight.origin, null);
  assert.equal(flight.originCode, null);
  assert.equal(flight.airline, null);
  assert.equal(flight.codeshare, null);
});

// ── 응답 모양 · 오류 ─────────────────────────────────────

test('resultCode: 99 는 config, 그 밖의 비정상 코드는 error', () => {
  const withCode = (resultCode) => {
    const body = loadFixture(FIXTURES.arrived);
    body.response.header.resultCode = resultCode;
    return search(body);
  };
  assert.deepEqual(withCode('99'), { ok: false, reason: 'config' });
  assert.deepEqual(withCode('30'), { ok: false, reason: 'error' });
  assert.equal(withCode('00').ok, true);
});

test('응답 모양이 이상하면 error (header 없음, body 없음, totalCount 이상, items 이상)', () => {
  const error = { ok: false, reason: 'error' };
  assert.deepEqual(search(null), error);
  assert.deepEqual(search({}), error);
  assert.deepEqual(search({ response: {} }), error);
  assert.deepEqual(search({ response: { header: { resultCode: '00' } } }), error);

  const noTotal = makeBody([makeRow()]);
  delete noTotal.response.body.totalCount;
  assert.deepEqual(search(noTotal), error);
  assert.deepEqual(search(makeBody([makeRow()], '1')), error);
  assert.deepEqual(search(makeBody([makeRow()], -1)), error);

  const notArray = makeBody([makeRow()]);
  notArray.response.body.items = makeRow();
  assert.deepEqual(search(notArray), error);
});

test('totalCount 와 items 가 모순이면 error', () => {
  assert.deepEqual(search(makeBody([makeRow()], 0)), { ok: false, reason: 'error' });
  assert.deepEqual(search(makeBody([], 3)), { ok: false, reason: 'error' });
});

test('interpretArrivalsResponse: fixture 원문을 그대로 해석한다', () => {
  const options = { fetchedAt: FETCHED_AT };
  const ok = interpretArrivalsResponse({ status: 200, text: loadFixtureText(FIXTURES.touchdown) }, options);
  assert.equal(ok.ok, true);
  assert.equal(ok.data.length, 2);
  assert.deepEqual(interpretArrivalsResponse({ status: 200, text: loadFixtureText(FIXTURES.none) }, options), { ok: false, reason: 'notfound' });
});

test('interpretArrivalsResponse: 포털의 글자 오류를 reason 으로 나눈다 (상태 코드와 상관없이)', () => {
  const options = { fetchedAt: FETCHED_AT };
  const expected = {
    'API token quota exceeded': 'quota',
    Unauthorized: 'config',
    Forbidden: 'config',
    'API not found': 'config',
    'API rate limit exceeded': 'error',
    'Error forwarding request to backend server': 'error',
    'Error receiving response from backend server': 'error',
    'Unexpected error': 'error',
  };
  for (const [text, reason] of Object.entries(expected)) {
    for (const status of [200, 401, 403, 429, 500, undefined]) {
      assert.deepEqual(interpretArrivalsResponse({ status, text: `${text}\n` }, options), { ok: false, reason }, `${text} / ${status}`);
    }
  }
});

test('interpretArrivalsResponse: 서버 오류(5xx)·해석 못 하는 본문·글자가 아닌 값은 error', () => {
  const options = { fetchedAt: FETCHED_AT };
  const error = { ok: false, reason: 'error' };
  assert.deepEqual(interpretArrivalsResponse({ status: 502, text: '<html>Bad Gateway</html>' }, options), error);
  assert.deepEqual(interpretArrivalsResponse({ status: 200, text: '<html>?</html>' }, options), error);
  assert.deepEqual(interpretArrivalsResponse({ status: 200, text: '' }, options), error);
  assert.deepEqual(interpretArrivalsResponse({ status: 200, text: undefined }, options), error);
  assert.deepEqual(interpretArrivalsResponse({ status: 200, text: '{"response":' }, options), error);
  assert.deepEqual(interpretArrivalsResponse(undefined, options), error);
});

test('interpretArrivalsResponse: 재확인(refresh)도 같은 규칙으로 해석한다', () => {
  const options = { mode: 'refresh', fid: '2026102400000007900709', fetchedAt: FETCHED_AT };
  const found = interpretArrivalsResponse({ status: 200, text: loadFixtureText(FIXTURES.slave) }, options);
  assert.equal(found.ok, true);
  assert.equal(found.data.flightNo, 'KE5854');
  assert.deepEqual(interpretArrivalsResponse({ status: 200, text: loadFixtureText(FIXTURES.none) }, options), { ok: false, reason: 'missing' });
});
