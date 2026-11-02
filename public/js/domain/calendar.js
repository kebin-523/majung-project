// 도착 날짜 달력의 순수 함수. 날짜는 "YYYY-MM-DD" 문자열이고, 같은 형식끼리는 문자열 비교가 날짜 비교와 같다.
import { ARRIVAL_DATE_FUTURE_DAYS, ARRIVAL_DATE_PAST_DAYS } from '../config.js';

const pad2 = (n) => String(n).padStart(2, '0');
const toIso = (date) => `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
const toUtc = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** 해당 달의 주 목록(일요일 시작). 그 달이 아닌 칸은 null. */
export function monthGrid(year, month) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = Array(first.getUTCDay()).fill(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(`${year}-${pad2(month)}-${pad2(day)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
}

export function addDays(iso, days) {
  const date = toUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

/** 달을 옮긴다. 옮긴 달에 그 날짜가 없으면 그 달의 마지막 날로 맞춘다. */
export function addMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return toIso(target);
}

/** 오늘 기준으로 고를 수 있는 날짜 범위(경계 포함) */
export function dateRange(today) {
  return { min: addDays(today, -ARRIVAL_DATE_PAST_DAYS), max: addDays(today, ARRIVAL_DATE_FUTURE_DAYS) };
}

export const isSelectable = (iso, min, max) => iso >= min && iso <= max;

export const clampDate = (iso, min, max) => (iso < min ? min : iso > max ? max : iso);

/** 그 달에 고를 수 있는 날이 하루라도 있는가 (달 이동 버튼의 비활성 판단) */
export function monthHasSelectable(year, month, min, max) {
  return monthGrid(year, month).flat().some((iso) => iso !== null && isSelectable(iso, min, max));
}
