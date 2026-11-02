// 주소(장소) 검색 어댑터.
//   실제 모드    서버 함수(POST /api/places)가 카카오 로컬 API 로 장소를 검색한다. 브라우저는 카카오 REST API 키를 다루지 않는다.
//   시나리오 모드 주소에 ?scenario=이름 이 있으면 서버를 부르지 않고 목업 목록을 쓴다. (clock.js 의 isScenarioMode)
//
// 반환: { ok: true, data: Place[] } | { ok: false, reason: 'quota' | 'timeout' | 'aborted' | 'error' }
//   결과가 없으면 오류가 아니라 ok: true 와 빈 배열이다. (화면에서 "이 주소를 찾지 못했어요" 안내)
//   reason: 'quota' 호출 한도 초과 / 'timeout' 응답 시간 초과 / 'aborted' 호출한 쪽이 취소함 (화면은 이 결과를 쓰지 않는다)
//           'error' 그 밖의 실패 (서버의 invalid · config 도 여기로 합친다. 화면은 모두 "검색 실패" 문구로 보여 준다)
// Place: { id, name, address, lng, lat }
//   같은 이름의 장소(예: 4호선·수인분당선으로 나뉜 같은 역)도 합치지 않고 받은 그대로 돌려준다.
//
// 검색어(사용자 입력 주소)는 주소(URL)가 아니라 본문으로 보내고, 콘솔에도 남기지 않는다.
// 앞뒤 공백을 뺀 2글자 미만이면 서버를 부르지 않는다.
import { ADDRESS_MIN_QUERY_LENGTH } from '../config.js';
import { isScenarioMode } from '../clock.js';
import { MOCK_PLACES } from '../mock/places.js';
import { wait } from '../mock/scenarios.js';

const API_PATH = '/api/places';
export const CLIENT_TIMEOUT_MS = 12000; // 서버가 카카오를 기다리는 시간(8초)보다 길게

const fail = (reason) => ({ ok: false, reason });

// ---------- 목업 (시나리오 모드) ----------

async function mockSearch(query) {
  await wait();

  const q = String(query ?? '').trim().toLowerCase();
  if (q === '') return { ok: true, data: [] };

  const data = MOCK_PLACES.filter(
    (p) => p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q),
  );
  return { ok: true, data };
}

// ---------- 실제 (서버 함수) ----------

/** 서버 reason → 화면 reason. quota 만 따로 두고 invalid · config · 모르는 값은 error. */
function mapReason(reason) {
  return reason === 'quota' ? 'quota' : 'error';
}

async function realSearch(query, signal) {
  const text = String(query ?? '').trim();
  if ([...text].length < ADDRESS_MIN_QUERY_LENGTH) return { ok: true, data: [] };

  const timeout = AbortSignal.timeout(CLIENT_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: text }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (signal?.aborted) return fail('aborted');
    return fail(error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'error');
  }

  let body;
  try {
    body = await response.json();
  } catch {
    return signal?.aborted ? fail('aborted') : fail('error'); // 함수가 없거나(404) 서버 오류 등으로 JSON 이 아닌 응답이 왔다.
  }
  if (body?.ok === true) return Array.isArray(body.data) ? { ok: true, data: body.data } : fail('error');
  return fail(mapReason(body?.reason));
}

// ---------- 화면이 부르는 함수 ----------

/**
 * 장소를 검색한다.
 * @param {string} query
 * @param {{ signal?: AbortSignal }} [options]  실제 모드에서 이전 요청을 취소할 때 쓴다
 */
export function searchAddress(query, { signal } = {}) {
  return isScenarioMode() ? mockSearch(query) : realSearch(query, signal);
}
