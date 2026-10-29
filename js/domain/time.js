// 시각 처리. 내부에서는 항상 epoch 밀리초(number)로 다루고, 표시할 때만 Asia/Seoul로 바꾼다.
import { TIME_ZONE } from '../config.js';

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

const partsFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

/**
 * 문자열·Date·숫자를 epoch 밀리초로 정규화한다.
 * 오프셋이 없는 문자열("2026-10-29 17:50")은 한국 시각으로 본다.
 * 형식만 다른 같은 시각은 같은 값이 된다.
 */
export function toMs(value) {
  let ms;
  if (typeof value === 'number') {
    ms = value;
  } else if (value instanceof Date) {
    ms = value.getTime();
  } else if (typeof value === 'string') {
    const iso = value.trim().replace(' ', 'T');
    const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(iso);
    ms = Date.parse(hasZone ? iso : `${iso}+09:00`);
  } else {
    ms = NaN;
  }
  if (!Number.isFinite(ms)) {
    throw new TypeError(`해석할 수 없는 시각: ${String(value)}`);
  }
  return ms;
}

/** 한국 시각 기준 연·월·일·시·분 */
export function partsKst(value) {
  const p = {};
  for (const { type, value: v } of partsFormat.formatToParts(new Date(toMs(value)))) {
    if (type !== 'literal') p[type] = Number(v);
  }
  return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute };
}

const pad2 = (n) => String(n).padStart(2, '0');

/** 숫자 영역용 24시간제: "17:10" */
export function formatClock(value) {
  const { h, mi } = partsKst(value);
  return `${pad2(h)}:${pad2(mi)}`;
}

/** 문장·화면 읽기 프로그램용 12시간제: "오후 5시 10분", "오전 12시" */
export function formatSpoken(value) {
  const { h, mi } = partsKst(value);
  const period = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mi === 0 ? `${period} ${h12}시` : `${period} ${h12}시 ${mi}분`;
}

const dayNumber = ({ y, m, d }) => Date.UTC(y, m - 1, d) / DAY;

/** 기준 시각(now)과 비교한 날짜 라벨: "오늘" / "내일" / "10월 30일" */
export function dayLabel(value, nowValue) {
  const target = partsKst(value);
  const diff = dayNumber(target) - dayNumber(partsKst(nowValue));
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  return `${target.m}월 ${target.d}일`;
}

/** 두 시각이 한국 달력 기준으로 같은 날인지 */
export function isSameDayKst(a, b) {
  return dayNumber(partsKst(a)) === dayNumber(partsKst(b));
}

/** 기준 시각과 다른 날이면 날짜 라벨을 앞에 붙인다: "17:50" / "내일 00:20" */
export function formatClockWithDay(value, nowValue) {
  return `${isSameDayKst(value, nowValue) ? '' : `${dayLabel(value, nowValue)} `}${formatClock(value)}`;
}

/** 화면 읽기용: "오후 5시 50분" / "내일 오전 12시 20분" */
export function formatSpokenWithDay(value, nowValue) {
  return `${isSameDayKst(value, nowValue) ? '' : `${dayLabel(value, nowValue)} `}${formatSpoken(value)}`;
}

export const minutes = (n) => n * MIN;
