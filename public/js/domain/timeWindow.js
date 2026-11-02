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

/**
 * 저장된 검색 값에서 시간대를 되살린다. 시간대로 찾았을 때 저장한 값만 쓰고(편명 검색이 남긴 값·이전 버전 값은 제외),
 * 깨졌거나 범위를 벗어난 값(시작 0~23, 종료는 시작보다 늦고 최대 폭 이내, 24 이하)은 null 이다.
 */
export function readSavedWindow(saved, maxHours = WINDOW_MAX_HOURS) {
  if (saved?.mode !== 'window') return null;
  const hourOf = (hhmm) => (/^\d{4}$/.test(hhmm ?? '') && hhmm.slice(2) === '00' ? Number(hhmm.slice(0, 2)) : null);
  const fromHour = hourOf(saved.from);
  const toHour = hourOf(saved.to);
  if (fromHour === null || toHour === null) return null;
  if (fromHour > 23 || toHour <= fromHour || toHour > Math.min(fromHour + maxHours, 24)) return null;
  return { fromHour, toHour };
}

/** 정시 → "HH:00" (24 는 "24:00") */
export function formatHour(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

/** "몇 시부터" 목록: 0~23시 */
export function fromHourOptions() {
  return Array.from({ length: 24 }, (_, hour) => ({ hour, label: formatHour(hour) }));
}

/** "몇 시까지" 목록: 시작 다음 시각부터 최대 폭(기본 3시간) 뒤까지, 24시를 넘기지 않는다 */
export function toHourOptions(fromHour, maxHours = WINDOW_MAX_HOURS) {
  const max = Math.min(fromHour + maxHours, 24);
  const options = [];
  for (let hour = fromHour + 1; hour <= max; hour += 1) options.push({ hour, label: formatHour(hour) });
  return options;
}
