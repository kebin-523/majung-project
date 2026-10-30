// 예정과의 차이가 "안내를 띄울 만큼"인지 판단한다. DOM 접근 없음.
// 추천 출발 시각 계산(recommend.js)과 변경 감지(change.js)는 이 기준을 쓰지 않는다. 계산은 항상 최신 변경 시각을 쓴다.
// 기준 값(EARLY_NOTICE_MIN, LATE_NOTICE_MIN)과 그 근거는 config.js 에 있다. (가정, 제품 판단, 문서 근거 없음)
import { EARLY_NOTICE_MIN, LATE_NOTICE_MIN } from '../config.js';

function assertThreshold(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name}은(는) 0보다 큰 숫자(분)여야 해요: ${String(value)}`);
  }
}

/**
 * 예정과의 차이가 안내 기준을 넘는지 판단한다.
 * 착륙 전 예상(estimateBasis === 'forecast')일 때만 의미가 있다. 착륙·도착 이후와 알 수 없는 상태는 항상 null 이다.
 *
 * @param {object} flight
 * @param {number|null} flight.scheduleDiffMinutes  변경−예정(분). 늦으면 +, 빠르면 −. 변경 시각이 없으면 null
 * @param {string} flight.estimateBasis             'forecast' | 'touchdown' | 'recorded' | 'unknown'
 * @param {object} [thresholds]
 * @param {number} [thresholds.earlyMin]            이만큼 이상 일찍이면 'early' (경계 포함)
 * @param {number} [thresholds.lateMin]             이만큼 이상 늦게면 'late' (경계 포함)
 * @returns {'early'|'late'|null}
 */
export function arrivalDiffNotice(
  { scheduleDiffMinutes, estimateBasis },
  { earlyMin = EARLY_NOTICE_MIN, lateMin = LATE_NOTICE_MIN } = {},
) {
  assertThreshold('일찍 도착 기준', earlyMin);
  assertThreshold('늦게 도착 기준', lateMin);

  if (estimateBasis !== 'forecast') return null;
  if (typeof scheduleDiffMinutes !== 'number' || !Number.isFinite(scheduleDiffMinutes)) return null;

  if (scheduleDiffMinutes <= -earlyMin) return 'early';
  if (scheduleDiffMinutes >= lateMin) return 'late';
  return null;
}
