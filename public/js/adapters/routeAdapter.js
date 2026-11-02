// 이동 시간 조회 어댑터.
//   실제 모드    서버 함수(POST /api/route)가 카카오모빌리티 자동차 길찾기로 공항(도착 터미널)까지의 이동 시간을 조회한다.
//                브라우저는 카카오 REST API 키와 목적지 좌표를 다루지 않는다. 출발지 좌표와 터미널 코드(P01 · P03)만 본문으로 보낸다.
//   시나리오 모드 주소에 ?scenario=이름 이 있으면 서버를 부르지 않고 목업을 쓴다. (clock.js 의 isScenarioMode)
//
// 반환: { ok: true, data: { minutes, distanceKm, fetchedAt, source } } | { ok: false, reason }
//   source: 'kakao' 실제 모드의 길찾기 결과 / 'mock' 시나리오 모드의 목업 값 (domain/change.js 의 isRealTravelRecheck 가 이 값을 본다)
//   reason: 'noroute'    출발지에서 공항까지 길을 찾지 못함 (서버가 HTTP 200 + ok: false 로 보낸다. 다른 출발지를 골라야 한다)
//           'quota'      호출 한도 초과 / 'timeout' 응답 시간 초과
//           'noterminal' 도착 터미널을 몰라(없거나 P02) 서버를 부르지 않음 (화면은 계산 보류 안내를 보여 준다)
//           'error'      그 밖의 실패 (서버의 invalid · config 도 여기로 합친다)
//   응답은 HTTP 상태가 아니라 본문의 ok 로 판단한다. 실제 모드에서는 실패했을 때 가짜 이동 시간(MOCK_DRIVE · EXAMPLE_DRIVE)을 돌려주지 않는다.
// refresh: true 는 "도착 정보가 바뀌어 이동 시간을 다시 조회"하는 경우다. (실제 모드에서는 같은 요청이다)
//
// 출발지 좌표는 위치 정보라 콘솔에 남기지 않는다. (오류 객체도 이름이 아니라 메시지에 좌표가 들 수 있어 아무것도 남기지 않는다)
import { clockNow, isScenarioMode } from '../clock.js';
import { ROUTE_TERMINALS } from '../domain/terminal.js';
import { EXAMPLE_DRIVE, MOCK_DRIVE, MOCK_DRIVE_REFRESH_DELTA_MIN } from '../mock/places.js';
import { getScenario, wait } from '../mock/scenarios.js';

const API_PATH = '/api/route';
export const CLIENT_TIMEOUT_MS = 12000; // 서버가 카카오를 기다리는 시간(8초)보다 길게

const fail = (reason) => ({ ok: false, reason });

// ---------- 목업 (시나리오 모드) ----------

async function mockDriveTime(origin, { refresh }) {
  const scenario = getScenario();
  await wait();

  if (scenario === 'routefail') return fail('error');
  // recheckfail: 처음 조회는 성공하고, 다시 조회(refresh)만 실패한다.
  if (scenario === 'recheckfail' && refresh) return fail('error');

  // 목업 id 가 아닌 장소는 고정 예시 값을 쓴다. (시나리오 모드 전용이다. 실제 모드는 이 값을 쓰지 않는다.)
  const base = MOCK_DRIVE[origin?.id] ?? EXAMPLE_DRIVE;

  // changed 시나리오: 다시 조회하면 이동 시간도 달라진다.
  const delta = scenario === 'changed' && refresh ? MOCK_DRIVE_REFRESH_DELTA_MIN : 0;

  return {
    ok: true,
    data: {
      minutes: base.minutes + delta,
      distanceKm: base.distanceKm,
      fetchedAt: clockNow(), // 시나리오 모드는 데모 시계
      source: 'mock',
    },
  };
}

// ---------- 실제 (서버 함수) ----------

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/** 서버 reason → 화면 reason. quota · noroute 는 따로 두고 invalid · config · 모르는 값은 error. */
function mapReason(reason) {
  return reason === 'quota' || reason === 'noroute' ? reason : 'error';
}

async function realDriveTime(origin, terminal) {
  if (typeof terminal !== 'string' || !ROUTE_TERMINALS.includes(terminal)) return fail('noterminal'); // 서버를 부르지 않는다
  if (!isNumber(origin?.lng) || !isNumber(origin?.lat)) return fail('error');

  let response;
  try {
    response = await fetch(API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ origin: { lng: origin.lng, lat: origin.lat }, terminal }),
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });
  } catch (error) {
    return fail(error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'error');
  }

  let body;
  try {
    body = await response.json();
  } catch {
    return fail('error'); // 함수가 없거나(404) 서버 오류 등으로 JSON 이 아닌 응답이 왔다.
  }

  if (body?.ok !== true) return fail(mapReason(body?.reason));
  const { minutes, distanceKm } = body.data ?? {};
  if (!isNumber(minutes) || minutes <= 0 || !isNumber(distanceKm)) return fail('error');
  return { ok: true, data: { minutes, distanceKm, fetchedAt: clockNow(), source: 'kakao' } };
}

// ---------- 화면이 부르는 함수 ----------

/**
 * 출발지에서 인천공항 도착 터미널까지 자동차 이동 시간을 조회한다.
 * @param {{ lng: number, lat: number, id?: string }} origin  고른 출발지(Place)
 * @param {{ refresh?: boolean, terminal?: string }} [options]  terminal: 도착 터미널 코드(P01 · P03). 실제 모드에서 필요하다
 */
export function getDriveTime(origin, { refresh = false, terminal } = {}) {
  return isScenarioMode() ? mockDriveTime(origin, { refresh }) : realDriveTime(origin, terminal);
}
