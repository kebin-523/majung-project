// 진입점: 해시 라우팅(#/flight, #/confirm, #/origin, #/result)과 화면 교체.
import { load } from './store.js';
import { ADDRESS_ROUTE_IS_MOCK } from './config.js';
import { mockBadgeText } from './domain/mockBadge.js';
import { clockNow, clockToday, isScenarioMode } from './clock.js';
import { getScenario } from './mock/scenarios.js';
import { renderFlightConfirm } from './ui/screens/flightConfirm.js';
import { renderFlightSearch } from './ui/screens/flightSearch.js';
import { renderOriginSetup } from './ui/screens/originSetup.js';
import { renderResult } from './ui/screens/result.js';

const header = document.querySelector('.app__header');
const main = document.querySelector('.app__main');
const footer = document.querySelector('.app__footer');

// 화면이 쓰는 공용 도구. 시계(now·today)는 clock.js 가 모드에 맞게 고른다:
// 시나리오 모드(?scenario=)는 데모 시계, 실제 모드는 실제 시각.
const ctx = {
  now: () => clockNow(),
  today: () => clockToday(),
  navigate: (name) => {
    location.hash = `#/${name}`;
  },
};

const ROUTES = ['flight', 'confirm', 'origin', 'result'];

const SCREENS = {
  flight: renderFlightSearch,
  confirm: renderFlightConfirm,
  origin: renderOriginSetup,
  result: renderResult,
};

function currentRoute() {
  const name = location.hash.replace(/^#\/?/, '');
  const route = ROUTES.includes(name) ? name : 'flight';

  // 앞 단계를 거치지 않고 주소로 바로 들어오면, 갈 수 있는 가장 가까운 앞 단계로 보낸다.
  const state = load();
  const ready = {
    flight: true,
    confirm: Boolean(state.search?.results?.length),
    origin: Boolean(state.search?.results?.length && state.selectedFlightId),
    result: Boolean(state.search?.results?.length && state.selectedFlightId && state.origin && state.drive),
  };
  for (let i = ROUTES.indexOf(route); i > 0; i -= 1) {
    if (ready[ROUTES[i]]) return ROUTES[i];
  }
  return 'flight';
}

let firstRender = true;
let previousRoute = null;

/** 단계가 바뀔 때 새 화면이 옆에서 부드럽게 들어온다. (앞 단계로 가면 반대쪽에서) */
function playScreenIn(direction) {
  for (const el of [main, footer]) {
    el.classList.remove('screen-in-forward', 'screen-in-back');
    void el.offsetWidth; // 같은 클래스를 다시 붙여도 처음부터 재생되게 한다.
    el.classList.add(`screen-in-${direction}`);
  }
}

function render() {
  const route = currentRoute();
  if (location.hash !== `#/${route}`) history.replaceState(null, '', `#/${route}`);

  main.replaceChildren();
  footer.replaceChildren();
  SCREENS[route]({ main, footer }, ctx);
  window.scrollTo(0, 0);

  // 추천 시각 화면은 카드가 아래에서 올라오는 자체 모션이 있어, 옆 미끄러짐을 겹치지 않는다.
  if (!firstRender && route !== 'result') {
    playScreenIn(ROUTES.indexOf(route) >= ROUTES.indexOf(previousRoute) ? 'forward' : 'back');
  }
  previousRoute = route;

  // 사용자가 단계를 옮겼을 때만 새 화면의 제목으로 포커스를 보낸다.
  if (!firstRender) main.querySelector('h1')?.focus();
  firstRender = false;
}

// 상단 표시 (DesignGuide 7장 "구현 중 추가한 문구"의 "상단 표시"). 문구는 domain/mockBadge.js 가 정한다.
//   시나리오 모드(전부 목업): "목업 데이터" (시나리오 이름이 normal 이 아니면 이름을 덧붙인다)
//   실제 모드에서 항공편·장소·이동 시간이 모두 실제: 표시 없음
function renderMockBadge() {
  const badge = header.querySelector('.mock-badge');
  const text = mockBadgeText({
    scenarioMode: isScenarioMode(),
    scenario: getScenario(),
    addressRouteIsMock: ADDRESS_ROUTE_IS_MOCK,
  });
  badge.textContent = text ?? '';
  badge.hidden = text === null;
}

renderMockBadge();
window.addEventListener('hashchange', render);
render();
