// 처음 들어온 사용자를 위한 온보딩의 순수 로직. 화면 그리기는 ui/screens/onboarding.js 가 맡는다.
// "마쳤다"는 표시는 이 탭의 sessionStorage(store.js)에만 남긴다. (오래 남는 저장을 하지 않는다. 탭을 닫으면 다시 처음이다)

export const SPLASH_MS = 2000; // 로고만 보여 주는 시간 (가정)

/**
 * 소개 페이지 문구 (확정본, DesignGuide 7장 "온보딩"). 문장(제목·본문)은 "시각", 카드·이미지 라벨은 "시간"을 쓴다.
 * 그림 속 숫자는 아래 EXAMPLE 에서 계산해 만든다.
 */
export const ONBOARDING_PAGES = [
  {
    id: 'value',
    title: '나갈 시각을 계산해 드려요',
    body: '항공편 도착 정보와 이동 시간을 함께 따져서, 언제 출발하면 좋을지 추천해요.',
  },
  {
    id: 'how',
    title: '항공편과 출발지만 알려주세요',
    body: '나머지는 마중이 계산해요.',
  },
  {
    id: 'change',
    title: '도착이 바뀌면 다시 계산해요',
    body: '바뀐 내용은 이전 값과 비교해 먼저 보여드려요. 추천 시각은 예상이라서, 마지막으로 확인한 시각도 함께 알려요.',
  },
];

// ---------- 그림 속 예시 값 (실제 값이 아니다. 앱의 계산식과 같은 식으로 만든다) ----------
// 만남 = 도착 + 입국 후 만남까지, 터미널 도착 = 만남 − 도착 후 대기, 출발 = 터미널 도착 − 이동 시간
export const EXAMPLE = { arrival: '17:45', meetupMin: 40, bufferMin: 20, travelMin: 55, delayMin: 20, checkedAt: '16:20' };

const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const toClock = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** 도착 시각 하나로 예상 만남·추천 출발 시각을 계산한다 */
export function exampleTimes(arrival = EXAMPLE.arrival) {
  const meet = toMin(arrival) + EXAMPLE.meetupMin;
  return { arrival, meet: toClock(meet), departure: toClock(meet - EXAMPLE.bufferMin - EXAMPLE.travelMin) };
}

/** 3장: 1장 값에서 도착이 delayMin 분 늦어진 예시. 이동 시간·대기·입국은 그대로라 세 값이 모두 같은 분만큼 늦어진다 */
export function exampleChange() {
  return { before: exampleTimes(), after: exampleTimes(toClock(toMin(EXAMPLE.arrival) + EXAMPLE.delayMin)) };
}

/** 화면 읽기용: "17:45" → "17시 45분" (정각은 "18시") */
export function spokenClock(hhmm) {
  const h = Number(hhmm.slice(0, 2));
  const m = Number(hhmm.slice(3));
  return m === 0 ? `${h}시` : `${h}시 ${m}분`;
}

/**
 * 첫 진입에서 온보딩을 보여 줄까. 이미 마쳤거나 검색·선택·출발지가 있는(진행 중인) 탭이면 보이지 않고,
 * 시나리오(목업) 모드는 데모라서 바로 시작한다. (주소 #/intro 로는 언제든 다시 볼 수 있다)
 */
export function shouldShowOnboarding(state, { scenarioMode = false } = {}) {
  if (scenarioMode) return false;
  const s = state ?? {};
  return !s.onboardingDone && !s.search && !s.selectedFlightId && !s.origin;
}

export const markOnboardingDone = (state) => ({ ...(state ?? {}), onboardingDone: true });

export const clampPage = (index, count) => Math.min(Math.max(index, 0), count - 1);

/** 페이지별 버튼: Primary 하나 + 아래 Text 버튼 하나 (마지막 페이지는 "시작하기"와 "이전") */
export function pageControls(index, count) {
  const last = index === count - 1;
  return last
    ? { primary: '시작하기', secondary: { action: 'prev', label: '이전' } }
    : { primary: '다음', secondary: { action: 'skip', label: '건너뛰기' } };
}
