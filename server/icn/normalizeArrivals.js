// 인천공항 여객기 운항 현황(도착) 응답을 어댑터가 쓰는 항공편 모양으로 바꾼다. 네트워크·환경변수·현재 시각을 직접 쓰지 않는 순수 함수다.
// (현재 시각은 fetchedAt 으로 받는다.) 실제 어댑터는 DesignGuide를 정할 때까지 화면에 연결하지 않는다.
//
// 지연 기준·변경 시각의 의미는 공식 활용가이드에 없다. 아래는 2026-10-30 관찰이다.
// - remark "지연"은 착륙 전 편 중 변경−예정이 16분 이상인 편에만 붙었다.
// - "도착"이 되면 지연 라벨이 사라진다. (도착 401건 중 15분 이상 늦은 121건이 모두 remark "도착")
//   "착륙"일 때 라벨이 어떻게 되는지는 표본이 2행뿐이라 확인 못 함이다.
// - "도착"의 변경 시각은 이미 지난 시각이라 실제 도착 시각으로 보인다. (estimateBasis 'recorded')
// - "착륙"의 변경 시각은 호출 시각보다 뒤인 경우가 있어 실제 시각이 아니다. 의미는 확인 못 함이다. (estimateBasis 'touchdown')
// 어댑터는 임의의 지연 기준을 두지 않고 변경−예정 차이를 분 단위 숫자(scheduleDiffMinutes)와 estimateBasis 로만 돌려준다.
// 몇 분 이상 안내할지는 화면 쪽 설정(EARLY_NOTICE_MIN, LATE_NOTICE_MIN)이 정한다.
//
// 항공편 한 건(Flight):
//   flightId             어댑터가 쓰는 식별값(API의 fid). 상태가 바뀌어도 같았다. 날짜를 넘어 안정적인지는 확인 못 함
//   flightNo             편명(API의 flightId)
//   arrivalDate          예정 시각의 한국 달력 날짜 "YYYY-MM-DD". 요청한 날짜와 다른 행도 걸러 내지 않으므로 화면이 비교한다
//   scheduled            예정 도착 시각(epoch ms)
//   estimated            API의 변경 일시 그대로(epoch ms). 값이 없으면 null
//   changed              estimated 가 있고 scheduled 와 다를 때만 estimated, 아니면 null (기존 코드와의 호환)
//   scheduleDiffMinutes  estimated − scheduled (분, 늦으면 +, 빠르면 −). estimated 가 없으면 null
//   status               'none' | 'delayed' | 'touchdown' | 'arrived' | 'unknown'
//   statusRaw            remark 원문(없으면 null)
//   estimateBasis        'forecast'(착륙 전 예상) | 'touchdown'(착륙) | 'recorded'(도착) | 'unknown'. 안내는 'forecast'일 때만 한다
//   terminal             { code, name } | null
//   origin, originCode   출발지 공항 한글명(원문 그대로) / 공항 코드
//   airline              항공사(없으면 null)
//   codeshare            "Master" | "Slave" 등 원문(없으면 null), masterFlightNo  Slave 일 때 마스터 편명(없으면 null)
//   fetchedAt, source    조회 시각(ms), 'icn'
// landed 는 만들지 않는다. 착륙·도착을 "이미 도착"으로 볼지는 DesignGuide를 정한 뒤에 정한다.
import { classifyErrorText, classifyHttpStatus, classifyResultCode } from './classifyError.js';
import { parseKstDateTime, toKstDateString } from './kst.js';

const MINUTE_MS = 60 * 1000;

const TERMINALS = new Map([
  ['P01', { code: 'P01', name: '제1터미널' }],
  ['P02', { code: 'P02', name: '탑승동' }],
  ['P03', { code: 'P03', name: '제2터미널' }],
]);

// 가이드의 remark 값은 도착·결항·지연·회항·착륙 5개다. 결항·회항은 아직 관찰하지 못했고 DesignGuide를 정하기 전이라 'unknown' 으로 둔다.
const STATUS_BY_REMARK = new Map([
  ['지연', 'delayed'],
  ['착륙', 'touchdown'],
  ['도착', 'arrived'],
]);

const BASIS_BY_STATUS = new Map([
  ['none', 'forecast'],
  ['delayed', 'forecast'],
  ['touchdown', 'touchdown'],
  ['arrived', 'recorded'],
  ['unknown', 'unknown'],
]);

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';
const orNull = (value) => (isNonEmptyString(value) ? value : null);
const fail = (reason) => ({ ok: false, reason });

/** remark → { status, statusRaw }. 비어 있으면 none, 목록에 없는 값은 unknown(원문은 statusRaw 에 보관). */
export function readStatus(remark) {
  if (remark === null || remark === undefined) return { status: 'none', statusRaw: null };
  if (typeof remark !== 'string') return { status: 'unknown', statusRaw: String(remark) };
  const raw = remark.trim();
  if (raw === '') return { status: 'none', statusRaw: null };
  return { status: STATUS_BY_REMARK.get(raw) ?? 'unknown', statusRaw: raw };
}

/**
 * 응답 행 하나 → 항공편. 쓸 수 없는 행이면 null (무효 행).
 * 필수 값: flightId, fid, scheduleDateTime(12자리 형식·범위).
 * estimatedDateTime 은 값이 없을 때(없음·null·빈 문자열)만 changed 를 null 로 두고, 값이 있는데 형식이 틀리면 행을 무효로 한다.
 */
function normalizeRow(row, fetchedAt) {
  if (row === null || typeof row !== 'object') return null;
  if (!isNonEmptyString(row.flightId) || !isNonEmptyString(row.fid)) return null;

  const scheduled = parseKstDateTime(row.scheduleDateTime);
  if (scheduled === null) return null;

  let estimated = null;
  const rawEstimated = row.estimatedDateTime;
  if (!(rawEstimated === undefined || rawEstimated === null || rawEstimated === '')) {
    estimated = parseKstDateTime(rawEstimated);
    if (estimated === null) return null;
  }

  const { status, statusRaw } = readStatus(row.remark);

  return {
    flightId: row.fid,
    flightNo: row.flightId,
    arrivalDate: toKstDateString(scheduled),
    scheduled,
    estimated,
    changed: estimated !== null && estimated !== scheduled ? estimated : null,
    scheduleDiffMinutes: estimated === null ? null : Math.round((estimated - scheduled) / MINUTE_MS),
    status,
    statusRaw,
    estimateBasis: BASIS_BY_STATUS.get(status),
    terminal: TERMINALS.get(row.terminalid) ?? null,
    origin: orNull(row.airport),
    originCode: orNull(row.airportCode),
    airline: orNull(row.airline),
    codeshare: orNull(row.codeshare),
    masterFlightNo: orNull(row.masterflightid),
    fetchedAt,
    source: 'icn',
  };
}

function checkOptions(options) {
  const { mode = 'search', fid, fetchedAt } = options ?? {};
  if (typeof fetchedAt !== 'number' || !Number.isFinite(fetchedAt)) {
    throw new TypeError('fetchedAt(조회 시각, epoch ms)이 필요해요.');
  }
  if (mode !== 'search' && mode !== 'refresh') {
    throw new TypeError(`mode 는 'search' 또는 'refresh' 여야 해요: ${String(mode)}`);
  }
  if (mode === 'refresh' && !isNonEmptyString(fid)) {
    throw new TypeError("mode 'refresh' 에는 fid 가 필요해요.");
  }
  return { mode, fid, fetchedAt };
}

/**
 * 해석한 JSON 응답({ response: { header, body } }) → 결과.
 *
 * @param {object} body
 * @param {object} options
 * @param {'search'|'refresh'} [options.mode='search']  search: 처음 검색(여러 행), refresh: 등록한 편의 재확인(f_id + searchday 조회, 한 건)
 * @param {string} [options.fid]                        refresh 에서 찾을 fid
 * @param {number} options.fetchedAt                    조회 시각(ms)
 * @returns {{ ok: true, data: object|object[], skippedRows: number } | { ok: false, reason: 'notfound'|'missing'|'quota'|'config'|'error' }}
 *
 * 행 처리 규칙
 * - 요청한 날짜와 다른 행도 제외하지 않고 arrivalDate 를 담아 돌려준다. (searchday 가 예정 날짜 기준이라는 것은 JSON에서 확인된 게 아니라 관찰이다.)
 * - 편명 검색에서는 Master/Slave 행을 합치지 않는다.
 * - 무효 행은 버리고 개수만 skippedRows 로 알린다. 유효한 행이 하나도 없는데 행이 있었다면 notfound 가 아니라 error 이다.
 * 판단 규칙
 * - header.resultCode 가 '00' 이 아니면 classifyResultCode 로 나눈다. ('99' → config)
 * - totalCount 는 정수여야 한다. 0 이고 items 가 비었으면 search 는 notfound, refresh 는 missing(조회는 성공했지만 이번 응답에 없음).
 *   items 는 0건일 때 빈 배열 [] 로 오는 것이 관찰됐고, 0건일 때 items 가 아예 없으면 빈 배열로 본다. (이 경우는 관찰하지 못해 확인 못 함)
 * - totalCount 가 0 인데 items 가 있거나, 0보다 큰데 items 가 비어 있으면 응답이 모순이라 error.
 * - refresh 에서 행은 오는데 fid 가 일치하는 유효한 행이 없으면 error.
 */
export function normalizeArrivalsBody(body, options) {
  const { mode, fid, fetchedAt } = checkOptions(options);

  const response = body?.response;
  const header = response?.header;
  if (header === null || typeof header !== 'object') return fail('error');

  const codeReason = classifyResultCode(header.resultCode);
  if (codeReason) return fail(codeReason);

  const content = response.body;
  if (content === null || typeof content !== 'object') return fail('error');

  const total = content.totalCount;
  if (!Number.isInteger(total) || total < 0) return fail('error');

  let items = content.items;
  if (total === 0 && (items === undefined || items === null)) items = [];
  if (!Array.isArray(items)) return fail('error');

  if (total === 0) {
    if (items.length > 0) return fail('error');
    return fail(mode === 'refresh' ? 'missing' : 'notfound');
  }
  if (items.length === 0) return fail('error');

  const flights = [];
  let skippedRows = 0;
  for (const row of items) {
    const flight = normalizeRow(row, fetchedAt);
    if (flight) flights.push(flight);
    else skippedRows += 1;
  }
  if (flights.length === 0) return fail('error');

  if (mode === 'refresh') {
    const found = flights.find((flight) => flight.flightId === fid);
    return found ? { ok: true, data: found, skippedRows } : fail('error');
  }
  return { ok: true, data: flights, skippedRows };
}

/**
 * HTTP 응답({ status, text }) → 결과. 연결 실패처럼 fetch 가 던진 오류는 이 함수 밖에서 classifyThrown 으로 처리한다.
 * 순서: 포털 오류 글자 → 서버 오류(5xx) → JSON 해석 → normalizeArrivalsBody.
 */
export function interpretArrivalsResponse({ status, text } = {}, options) {
  checkOptions(options); // 호출하는 쪽의 실수는 오류 분류에 가려지지 않게 먼저 알린다

  const byText = classifyErrorText(text);
  if (byText) return fail(byText);

  const byStatus = classifyHttpStatus(status);
  if (byStatus) return fail(byStatus);

  if (typeof text !== 'string') return fail('error');
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return fail('error');
  }
  return normalizeArrivalsBody(body, options);
}
