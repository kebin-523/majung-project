// 시간대로 찾기의 순수 함수. 시간대는 한국 시각의 정시(0~24)로 다룬다. 자정을 넘는 시간대는 만들지 않는다.
import { WINDOW_MAX_HOURS } from '../config.js';
import { partsKst } from './time.js';

const DEFAULT_OTHER_DAY_HOUR = 9; // 오늘이 아닌 날의 시작 기본값 (가정)

/** 처음 보여 줄 시간대. 오늘이면 지금의 정시부터, 다른 날이면 9시부터 1시간. */
export function defaultWindow(nowMs, date, today) {
  const hour = date === today ? partsKst(nowMs).h : DEFAULT_OTHER_DAY_HOUR;
  const fromHour = Math.min(hour, 23);
  return { fromHour, toHour: fromHour + 1 };
}

/** 종료 시각을 (시작, 시작+최대 폭] 안으로 맞춘 값. 24 를 넘기지 않는다. */
export function clampToHour(fromHour, toHour, maxHours = WINDOW_MAX_HOURS) {
  const max = Math.min(fromHour + maxHours, 24);
  return Math.min(Math.max(toHour, fromHour + 1), max);
}

/** 정시 → "HHMM" (24 는 "2400") */
export function toHhmm(hour) {
  return `${String(hour).padStart(2, '0')}00`;
}
