// 4단계 · 추천 출발 시각
// - 저장된 항공편·이동 시간·여유 시간으로 추천 시각 카드를 그린다.
// - "여유" 칩을 누르면 바텀시트로 여유 시간을 고친다.
// - 화면을 열면 최신 항공편 정보를 다시 확인하고, 도착 시각이 바뀌었으면 이동 시간을 다시 조회해 재계산한 뒤
//   변경 안내 띠로 이전 → 새 값을 보여 준다. 같은 변경은 한 번만 안내한다.
// - 화면을 연 채 마지막 확인이 STALE_AFTER_MIN(10분)을 넘기면 자동으로 한 번 다시 확인한다.
//   확인하는 동안 "확인 중이에요"를 보여 주고, 실패하면 반복하지 않고 "다시 시도"로 넘긴다.
// - 상태 화면: 확인 중 / 최신 확인 못함(오래됨, 추천 시각과 마지막 확인 시각은 계속 보인다) /
//   추천 출발 시각 지남(이동 시간 다시 확인) / 이미 도착한 항공편 / 이동 시간 못 불러옴.
// - 모션: 카드 등장, 값이 바뀔 때의 숫자 교체(여유 저장 250ms, 도착 변경 400ms + 항적선 이동), "출발" 배지 한 번 커졌다 돌아옴.
import { getFlight } from '../../adapters/flightAdapter.js';
import { getDriveTime } from '../../adapters/routeAdapter.js';
import { DEFAULT_AIRPORT_BUFFER_MIN, DEFAULT_MEETUP_MIN, STATUS_RECHECK_INTERVAL_MS } from '../../config.js';
import { detectArrivalChange, shouldAnnounce, summarizeChange } from '../../domain/change.js';
import { latestArrival, recommendDeparture } from '../../domain/recommend.js';
import { isStale, resolveBadge, shouldAutoRecheck } from '../../domain/status.js';
import {
  dayLabel, formatClock, formatClockWithDay, formatSpoken, formatSpokenWithDay, isSameDayKst,
} from '../../domain/time.js';
import { load, save } from '../../store.js';
import { openBufferSheet } from '../components/bottomSheet.js';
import { renderChangeBanner } from '../components/changeBanner.js';
import { renderChips } from '../components/chips.js';
import { renderCheckedLine, renderRecommendCardContent } from '../components/recommendCard.js';
import { icon } from '../components/icon.js';

const BUBBLES = {
  default: '곧 만나겠네요, 슬슬 준비해 볼까요?',
  passed: '추천 출발 시각이 지났어요. 이동 시간을 다시 확인해 볼까요?',
};

const MESSAGES = {
  landed: '이 항공편은 이미 도착했어요.',
  noTravel: '이동 시간을 불러오지 못해서 추천 시각을 계산하지 못했어요.',
  travelChecking: '이동 시간을 확인하고 있어요.',
  travelRecheckFailed: '이동 시간을 다시 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',
};

/**
 * 화면에 그릴 값을 계산한다. (DOM 접근 없음)
 * 도착 시각은 변경 도착 시각이 있으면 그것을 쓴다.
 *
 * @param {boolean} [input.hasChange]  도착 정보가 바뀐 적이 있는가 → "도착 시각이 바뀌었어요" 배지 (안내 띠를 이미 본 뒤에도 배지로 남는다)
 * @param {boolean} [input.checking]   최신 정보를 확인하는 중인가
 */
export function buildResultViewModel({ flight, drive, buffers, now, hasChange = false, checking = false }) {
  const arrival = latestArrival(flight);
  const { departureMs } = recommendDeparture({
    arrival,
    travelMin: drive.minutes,
    airportBufferMin: buffers.airportBufferMin,
    meetupMin: buffers.meetupMin,
  });

  const badgeKey = resolveBadge({
    now,
    departure: departureMs,
    lastChecked: flight.fetchedAt,
    hasUnseenChange: hasChange, // status.js의 이름은 "unseen"이지만, 여기서는 "변경이 있었음"을 배지로 남기는 데 쓴다.
    landed: flight.landed,
  });

  // 추천 시각이 도착 날짜와 다른 날이거나 오늘이 아니면(자정 전후) 날짜 라벨을 함께 보여 준다.
  const showDay = !isSameDayKst(departureMs, arrival) || !isSameDayKst(departureMs, now);

  return {
    badgeKey,
    departureMs,
    dayText: showDay ? dayLabel(departureMs, now) : null,
    timeText: formatClock(departureMs),
    timeSpoken: formatSpoken(departureMs),
    bubbleText: badgeKey === 'passed' ? BUBBLES.passed : BUBBLES.default,
    arrivalText: formatClockWithDay(arrival, now),
    arrivalSpoken: formatSpokenWithDay(arrival, now),
    travelMin: drive.minutes,
    bufferTotalMin: buffers.airportBufferMin + buffers.meetupMin,
    checking,
    stale: isStale({ now, lastChecked: flight.fetchedAt }),
    checkedText: formatClock(flight.fetchedAt),
    checkedSpoken: formatSpoken(flight.fetchedAt),
  };
}

const noticeHtml = (text) => `<div class="notice"><p class="notice__text">${icon('info')}<span>${text}</span></p></div>`;

export function renderResult({ main }, ctx) {
  const state = load();
  let flight = state.search.results.find((f) => f.flightId === state.selectedFlightId);
  if (!flight) {
    ctx.navigate('confirm'); // 저장된 항공편을 찾을 수 없으면 다시 고르게 한다.
    return;
  }

  let drive = state.drive;
  let change = state.change ?? null;
  let lastAnnouncedChangeId = state.lastAnnouncedChangeId ?? null;
  let buffers = state.buffers ?? {
    airportBufferMin: DEFAULT_AIRPORT_BUFFER_MIN,
    meetupMin: DEFAULT_MEETUP_MIN,
  };

  const canShowCard = !flight.landed && Number.isFinite(drive?.minutes);
  let checking = canShowCard; // 열자마자 최신 정보를 확인한다. 확인하는 동안 이전 값을 최신처럼 보이게 하지 않는다.
  let travelBusy = false;
  let pulsed = false; // "출발" 배지 모션은 이 화면에서 한 번만
  let lastVm = null;
  let renderedBadgeKey = null; // 화면에 실제로 그려진 배지. (lastVm은 확인 시각 줄만 바꿀 때도 갱신되어 비교 기준으로 쓸 수 없다)
  // 이번 "오래됨" 구간에서 자동 확인을 이미 했는가. 화면을 열 때의 확인도 자동 시도 1회로 센다.
  // 확인에 성공하면 false로 되돌려, 다시 오래되었을 때 한 번 더 자동으로 확인할 수 있게 한다. 실패하면 true로 남아 반복하지 않는다.
  let autoTried = canShowCard;

  main.innerHTML = `
    <h1 class="sr-only" tabindex="-1">추천 출발 시각</h1>
    <div id="banner-host" class="slot" aria-live="polite"></div>
    <div id="card-host"></div>
    <div id="notice-host" class="slot" aria-live="polite"></div>
    <div id="actions-host" class="slot actions"></div>
    <div class="text-actions">
      <button id="change-flight-btn" class="btn btn--text" type="button">항공편 바꾸기</button>
      <button id="back-btn" class="btn btn--text" type="button">이전</button>
    </div>`;

  const bannerHost = main.querySelector('#banner-host');
  const host = main.querySelector('#card-host');
  const noticeHost = main.querySelector('#notice-host');
  const actionsHost = main.querySelector('#actions-host');
  const getBufferChip = () => main.querySelector('[data-chip="buffer"]');

  const makeVm = () => buildResultViewModel({ flight, drive, buffers, now: ctx.now(), hasChange: change !== null, checking });

  function openSheet() {
    openBufferSheet({
      current: buffers,
      // 시트가 열려 있는 동안 자동 확인이 끝나 카드가 다시 그려져도 닫는 시점에 새 칩을 찾으므로, 포커스가 새 "여유" 칩으로 돌아온다.
      getReturnFocus: getBufferChip,
      onSave(values) {
        buffers = values;
        save({ ...load(), buffers });
        drawCard({ animate: 'buffer' });
      },
    });
  }

  /** 카드 아래 행동 버튼: 최신 확인 못함 → "다시 시도", 출발 시각 지남 → "이동 시간 다시 확인" */
  function drawActions() {
    const items = [];
    if (canShowCard && lastVm && !checking) {
      if (lastVm.stale) items.push('<button class="btn btn--text" type="button" data-action="retry-refresh">다시 시도</button>');
      if (lastVm.badgeKey === 'passed') {
        items.push(`<button class="btn btn--secondary" type="button" data-action="recheck-travel"${travelBusy ? ' disabled' : ''}>이동 시간 다시 확인</button>`);
      }
    }
    actionsHost.innerHTML = items.join('');
  }

  /**
   * 카드를 그린다. 이미 카드가 있으면 바깥 aria-live 영역은 두고 안쪽만 갈아 끼운다.
   * @param {{ animate?: 'buffer' | 'change' | null }} [options]
   *   buffer = 여유 시간을 저장해 다시 계산(숫자만 250ms), change = 도착 정보가 바뀌어 다시 계산(숫자 + 항적선 400ms)
   */
  function drawCard({ animate = null } = {}) {
    if (flight.landed) {
      // 이미 도착한 항공편은 추천 시각 대신 상태만 안내한다.
      host.innerHTML = noticeHtml(MESSAGES.landed);
      return;
    }
    if (!Number.isFinite(drive?.minutes)) {
      host.innerHTML = noticeHtml(MESSAGES.noTravel);
      return;
    }

    lastVm = makeVm();
    renderedBadgeKey = lastVm.badgeKey;
    const content = renderRecommendCardContent({ ...lastVm, chipsHtml: renderChips(lastVm) });

    const card = host.querySelector('.reco');
    if (card) card.innerHTML = content;
    else host.innerHTML = `<section class="reco" aria-live="polite">${content}</section>`;

    if (animate) {
      const time = host.querySelector('.reco__time');
      time?.classList.add('is-updated');
      if (animate === 'change') {
        time?.classList.add('is-updated--large');
        host.querySelector('.trail')?.classList.add('is-moving');
      }
    }

    // 곧 나갈 시간이 되면 "출발" 배지가 한 번만 살짝 커졌다 돌아온다.
    if (lastVm.badgeKey === 'soon' && !pulsed) {
      pulsed = true;
      host.querySelector('.pill-depart')?.classList.add('is-pulse');
    }

    getBufferChip()?.addEventListener('click', openSheet);
    drawActions();
  }

  /** 확인 시각 줄만 바꾼다. (카드 전체를 다시 읽어 주지 않도록) */
  function updateCheckedLine() {
    const line = host.querySelector('.reco__checked');
    if (!line) return;
    lastVm = makeVm();
    line.innerHTML = renderCheckedLine(lastVm);
    drawActions();
  }

  /** 변경 안내 띠는 새 변경을 처음 보여 줄 때만 띄운다. 본 뒤에는 배지로만 남는다. */
  function showBanner() {
    bannerHost.innerHTML = renderChangeBanner(change, ctx.now());
    change = { ...change, bannerSeen: true };
    save({ ...load(), change });
  }

  function persistLatest() {
    const current = load();
    save({
      ...current,
      search: {
        ...current.search,
        results: current.search.results.map((f) => (f.flightId === flight.flightId ? flight : f)),
      },
      drive,
      change,
      lastAnnouncedChangeId,
    });
  }

  let refreshing = false;

  /** 최신 항공편 정보를 확인하고, 도착 시각이 바뀌었으면 이동 시간을 다시 조회해 재계산한다. */
  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    const latest = await getFlight(flight.flightId);
    if (!host.isConnected) return; // 기다리는 사이 다른 화면으로 이동했다.

    let newChange = false;
    if (latest.ok) {
      const next = latest.data;
      const detected = detectArrivalChange(flight, next);

      let nextDrive = null;
      if (shouldAnnounce(detected, lastAnnouncedChangeId)) {
        // 도착 시각을 이동 시간만큼 기계적으로 미루지 않고, 이동 시간을 다시 조회한다. 실패하면 이전 값을 쓰고 재조회했다고 표시하지 않는다.
        const route = await getDriveTime(state.origin, { refresh: true });
        if (!host.isConnected) return;
        if (route.ok) nextDrive = route.data;

        change = {
          ...summarizeChange({
            prev: flight,
            next,
            prevTravelMin: drive.minutes,
            nextTravelMin: nextDrive?.minutes ?? null,
            buffers,
          }),
          bannerSeen: false,
        };
        lastAnnouncedChangeId = change.id;
        newChange = true;
      }

      flight = next;
      if (nextDrive) drive = nextDrive;
      autoTried = false; // 확인에 성공했으니, 다시 오래되면 자동 확인을 한 번 더 할 수 있다.
      persistLatest();
    }
    // 확인에 실패하면 flight(마지막으로 확인한 값과 시각)를 그대로 둔다. 오래된 값을 최신처럼 바꾸지 않는다.

    refreshing = false;
    checking = false;
    const vm = makeVm();
    if (newChange || vm.badgeKey !== renderedBadgeKey || vm.timeText !== lastVm.timeText) {
      drawCard({ animate: newChange ? 'change' : null });
    } else {
      updateCheckedLine();
    }
    if (newChange) showBanner();
  }

  /** 추천 출발 시각이 지났을 때: 이동 시간만 다시 조회해 다시 계산한다. */
  async function recheckTravel() {
    if (travelBusy) return;
    travelBusy = true;
    noticeHost.innerHTML = `<p class="caption">${MESSAGES.travelChecking}</p>`;
    drawActions();

    const route = await getDriveTime(state.origin, { refresh: true });
    if (!host.isConnected) return;
    travelBusy = false;

    if (route.ok) {
      drive = route.data;
      persistLatest();
      noticeHost.innerHTML = '';
      drawCard();
    } else {
      // 이전 이동 시간으로 계산한 값은 그대로 두고, 다시 확인하지 못했음을 알린다.
      noticeHost.innerHTML = noticeHtml(MESSAGES.travelRecheckFailed);
      drawActions();
    }
  }

  /** "다시 시도"와 자동 재확인이 함께 쓴다. 확인하는 동안 확인 시각 줄이 "확인 중이에요"로 바뀐다. */
  function retryRefresh() {
    if (refreshing || checking) return;
    checking = true;
    noticeHost.innerHTML = '';
    updateCheckedLine();
    refresh();
  }

  actionsHost.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'retry-refresh') retryRefresh();
    else if (action === 'recheck-travel') recheckTravel();
  });

  drawCard();
  if (canShowCard) refresh();

  // 화면을 열어 둔 동안 시간이 흐른 것(곧 출발·지남·오래됨)을 배지에 반영한다.
  // 마지막 확인이 오래되면 항공편을 자동으로 한 번 다시 확인한다. (실패하면 반복하지 않고 "다시 시도"로 넘긴다)
  if (canShowCard) {
    const timer = setInterval(() => {
      if (!host.isConnected) {
        clearInterval(timer); // 다른 화면으로 이동했다.
        return;
      }
      if (checking || refreshing || travelBusy) return;

      if (shouldAutoRecheck({ now: ctx.now(), lastChecked: flight.fetchedAt, alreadyTried: autoTried })) {
        autoTried = true;
        retryRefresh();
        return;
      }

      const vm = makeVm();
      if (vm.badgeKey !== renderedBadgeKey) drawCard();
      else if (vm.stale !== lastVm.stale) updateCheckedLine();
    }, STATUS_RECHECK_INTERVAL_MS);
  }

  main.querySelector('#change-flight-btn').addEventListener('click', () => ctx.navigate('flight'));
  main.querySelector('#back-btn').addEventListener('click', () => ctx.navigate('origin'));
}
