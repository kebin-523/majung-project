// 인천공항 API의 12자리 시각 문자열("YYYYMMDDHHMM")을 다룬다. 한국 시각(Asia/Seoul, UTC+9, 서머타임 없음)으로 해석한다.
// 컴퓨터의 시간대 설정에 영향을 받지 않도록 UTC 기준 함수만 쓴다.
// (public/js/domain/time.js 의 toMs 는 이 형식을 해석하지 못하고 예외를 던지므로 따로 둔다.)
// 시각의 시간대는 공식 가이드에 명시가 없다. 한국 시각으로 보인다는 것은 샘플 관찰이다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const TWELVE_DIGITS = /^\d{12}$/;

const pad = (n, width) => String(n).padStart(width, '0');

/**
 * "202610301100" → 2026-10-30 11:00 KST 의 epoch 밀리초.
 * 12자리 숫자 문자열만 받는다. 앞뒤 공백, 숫자 타입, 범위 밖 값(13월, 2월 30일, 24시, 60분)은 모두 null 이다.
 * @returns {number|null}
 */
export function parseKstDateTime(value) {
  if (typeof value !== 'string' || !TWELVE_DIGITS.test(value)) return null;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

  // 한국 시계 값을 UTC인 것처럼 만든 뒤 9시간을 빼서 실제 시각으로 바꾼다.
  const wallClock = new Date(0);
  wallClock.setUTCFullYear(year, month - 1, day);
  wallClock.setUTCHours(hour, minute, 0, 0);
  // 2월 30일처럼 달력에 없는 날은 다음 달로 넘어가므로 값이 달라진다.
  if (wallClock.getUTCFullYear() !== year || wallClock.getUTCMonth() !== month - 1 || wallClock.getUTCDate() !== day) {
    return null;
  }
  return wallClock.getTime() - KST_OFFSET_MS;
}

/** epoch 밀리초 → 한국 달력 날짜 "YYYY-MM-DD". (UTC 날짜가 아니다: 한국 00:20 은 UTC로는 전날이다.) */
export function toKstDateString(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) {
    throw new TypeError(`epoch 밀리초(number)가 필요해요: ${String(ms)}`);
  }
  const shifted = new Date(ms + KST_OFFSET_MS);
  return `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1, 2)}-${pad(shifted.getUTCDate(), 2)}`;
}
