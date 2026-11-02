// 추천 카드의 "이동 시간 확인 줄" 문구와 숨김 조건. (DOM 접근 없음, DesignGuide §6 "이동 시간 확인 줄" 초안과 같다)
//   "이동 시간은 18:45에 확인했어요"
// 시각은 store.drive.fetchedAt(routeAdapter 가 기기 시계로 저장한 이동 시간 조회 시각)이다. 표시에만 쓴다.
//   - 항공편 확인 시각(서버가 적은 fetchedAt)과 비교하거나 합치지 않는다. 시계가 다르다.
//   - 오래됨 판단·자동 재확인·"마지막 확인은 N:NN예요" 문구는 항공편 기준 그대로다. 이 값은 그쪽에 쓰이지 않는다.
//   - "교통을 반영했다"는 뜻의 말은 쓰지 않는다. (카카오 길찾기가 실시간 교통을 반영하는지 확인 못 함)
import { formatClock, formatSpoken } from './time.js';

const isTimestamp = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * 이동 시간 확인 줄에 쓸 값. 보여 주지 않는 경우는 null.
 * 보이는 조건: 실제 모드(scenarioMode 가 아님) + source 'kakao' + 이동 시간(minutes)이 숫자 + 확인 시각(fetchedAt)이 있음.
 * 숨기는 경우: 시나리오 모드나 목업 값(목업에 "확인했어요"를 붙이지 않는다), 이전 저장값(확인 시각 없음), 터미널을 몰라 보류한 빈 값(minutes 가 null).
 *
 * @param {{ minutes?: number|null, fetchedAt?: number|null, source?: string } | null | undefined} drive  store.drive
 * @param {{ scenarioMode?: boolean }} [options]
 * @returns {null | { text: string, spoken: string, sentence: string, spokenSentence: string }}
 */
export function travelCheckedLine(drive, { scenarioMode = false } = {}) {
  if (scenarioMode) return null;
  if (drive === null || typeof drive !== 'object') return null;
  if (drive.source !== 'kakao') return null;
  if (typeof drive.minutes !== 'number' || !Number.isFinite(drive.minutes)) return null;
  if (!isTimestamp(drive.fetchedAt)) return null;

  const text = formatClock(drive.fetchedAt);
  const spoken = formatSpoken(drive.fetchedAt);
  return {
    text,
    spoken,
    sentence: `이동 시간은 ${text}에 확인했어요`,
    spokenSentence: `이동 시간은 ${spoken}에 확인했어요`,
  };
}
