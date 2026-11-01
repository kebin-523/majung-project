// 4단계 · 추천 출발 시각
// - 저장된 항공편·이동 시간·여유 시간으로 추천 시각 카드를 그린다.
// - "여유" 칩을 누르면 바텀시트로 여유 시간을 고친다.
// - 화면을 열면 최신 항공편 정보를 다시 확인하고, 도착 시각이 바뀌었으면 이동 시간을 다시 조회해 재계산한 뒤
//   변경 안내 띠로 이전 → 새 값을 보여 준다. 같은 변경은 한 번만 안내한다.
// - 화면을 연 채 응답을 받은 지 STALE_AFTER_MIN(10분)이 지나면 자동으로 한 번 다시 확인한다. (기준은 기기 시계로 잰 경과 시간이다. 서버가 적은 확인 시각은 "N:NN에 확인했어요" 표시에만 쓴다)
//   확인하는 동안 "확인 중이에요"를 보여 주고, 실패하면 반복하지 않고 "다시 시도"로 넘긴다. (domain/autoRecheck.js)
// - 재확인 결과가 올 때마다 항공편의 최신 상태로 화면(추천 카드 · 안내 상자 · 말풍선)을 다시 정한다. (domain/status.js 의 resolveFlightView)
//   도착(arrived)은 더 바뀌지 않는다고 보고 다시 확인하지 않는다. 운항 상태 확인 필요(unknown)는 계속 확인해 상태가 되돌아오면 따라간다.
// - 화면이 이미 보인 뒤 카드 ↔ 안내 상자로 바뀌면 보이지 않는 알림 영역(#flight-announcer)으로 한 번 알린다. 처음 그릴 때는 알리지 않는다. (domain/announce.js)
//   포커스는 사라진 요소에 있었을 때만 "항공편 바꾸기" 버튼으로 돌려주고, 열려 있던 여유 시간 시트는 저장하지 않고 닫는다.
// - 상태 화면: 확인 중 / 최신 확인 못함(오래됨, 추천 시각과 마지막 확인 시각은 계속 보인다) /
//   추천 출발 시각 지남(이동 시간 다시 확인) / 이미 도착한 항공편 · 운항 상태 확인 필요(안내 상자, 추천 시각 계산 안 함) / 이동 시간 못 불러옴.
// - 실제 모드에서 도착 터미널을 모르는 편(없거나 P02)은 이동 시간을 계산하지 않고 추천 카드 대신 안내 상자를 보여 준다. (resolveFlightView 의 'terminal')
//   시나리오 모드의 목업 항공편에는 터미널이 없으므로 이 규칙을 쓰지 않는다. 도착 · 운항 상태 확인 필요 안내가 먼저다.
// - 착륙한 항공편은 추천 카드를 유지하고 말풍선만 바꾼다. (근거 칩의 비행기 도착 시각은 그대로 보여 준다)
// - 확인 시각 줄의 새로고침 버튼: 항공편을 다시 확인하고, 도착 시각이 바뀌지 않았어도 이동 시간을 다시 조회해 추천 시각을 다시 계산한다. (호출은 한 번에 항공편 1 + 이동 시간 1, 확인하는 동안 버튼을 막는다)
// - 모션: 카드 등장, 값이 바뀔 때의 숫자 교체(여유 저장 250ms, 도착 변경 400ms), "곧 나갈 시간이에요" 상태 줄의 아이콘 한 번 커졌다 돌아옴.
import { getFlight } from '../../adapters/flightAdapter.js';
import { getDriveTime } from '../../adapters/routeAdapter.js';
import { DEFAULT_AIRPORT_BUFFER_MIN, DEFAULT_MEETUP_MIN, STATUS_RECHECK_INTERVAL_MS } from '../../config.js';
import { isScenarioMode } from '../../clock.js';
import { detectArrivalChange, isRealTravelRecheck, shouldAnnounce, summarizeChange } from '../../domain/change.js';
import { latestArrival, recommendDeparture } from '../../domain/recommend.js';
import { announcementFor, cardLeadSpoken, focusTargetAfterTransition } from '../../domain/announce.js';
import { TERMINAL_HOLD_MESSAGE } from '../../domain/routeNotice.js';
import { terminalCodeOf } from '../../domain/terminal.js';
import { createAutoRecheck } from '../../domain/autoRecheck.js';
import { describeUntil } from '../../domain/countdown.js';
import { isStale, lastConfirmedAt, resolveBadge, resolveFlightView } from '../../domain/status.js';
import {
  dayLabel, formatClock, formatClockWithDay, formatDateLabel, formatSpoken, formatSpokenWithDay, isSameDayKst, minutes,
} from '../../domain/time.js';
import { load, save } from '../../store.js';
import { closeCurrentSheet, openBufferSheet } from '../components/bottomSheet.js';
import { renderChangeBanner } from '../components/changeBanner.js';
import { renderTimeline } from '../components/routeTimeline.js';
import { renderCheckedLine, renderNowRow, renderRecommendCardContent } from '../components/recommendCard.js';
import { icon } from '../components/icon.js';

// 카드의 "상태 줄": 알려야 하는 경우(지남 · 착륙 · 곧 출발)에만 한 문장을 보여 준다. 평소 상태에는 없다. (사용자 요청)
// 도착 변경은 카드 위의 변경 안내가, 최신 정보 확인 못 함은 쪽지의 확인 시각 줄이 알리므로 여기서는 다시 말하지 않는다.
const STATUS_TEXT = {
  passed: '추천 출발 시각이 지났어요. 이동 시간을 다시 확인해 볼까요?',
  touchdown: '비행기가 착륙했어요, 입국 절차가 끝나면 만날 수 있어요.',
  soon: '곧 나갈 시간이에요.',
};

/** 상태 줄 종류. 우선순위: 지남 > 착륙 > 곧 출발. 도착 변경·오래됨이 곧 출발보다 앞서므로(badgeKey 우선순위) 그때는 곧 출발을 말하지 않는다. */
function statusKindOf(badgeKey, touchdown) {
  if (badgeKey === 'passed') return 'passed';
  if (touchdown) return 'touchdown';
  if (badgeKey === 'soon') return 'soon';
  return null;
}

const MESSAGES = {
  arrived: '이 항공편은 이미 도착했어요. 입국 절차를 마친 뒤에 만날 수 있어요. 다른 항공편을 찾아볼까요?',
  unknown: '이 항공편의 운항 상태를 확인해 주세요. 확인이 필요한 표시가 있어서 추천 출발 시각은 계산하지 않았어요. 항공사에 먼저 확인해 보세요.',
  terminal: TERMINAL_HOLD_MESSAGE,
  noTravel: '이동 시간을 불러오지 못해서 추천 시각을 계산하지 못했어요.',
  refreshFailed: '지금은 항공편 정보를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.',
  travelChecking: '이동 시간을 확인하고 있어요.',
  travelRecheckFailed: '이동 시간을 다시 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',
};

/**
 * 화면에 그릴 값을 계산한다. (DOM 접근 없음)
 * 도착 시각은 변경 도착 시각이 있으면 그것을 쓴다.
 *
 * @param {boolean} [input.hasChange]  도착 정보가 바뀐 적이 있는가 → "도착 시각이 바뀌었어요" 배지 (안내 띠를 이미 본 뒤에도 배지로 남는다)
 * @param {boolean} [input.checking]   최신 정보를 확인하는 중인가
 * @param {{name?: string, address?: string} | null} [input.origin]  사용자가 고른 출발지. 근거 타임라인의 첫 점에 이름과 주소를 다시 보여 준다.
 * @param {boolean} [input.refreshing]  새로고침으로 이동 시간을 다시 조회하는 중인가 (버튼을 막는다)
 */
/** 지금과 다른 날이면 날짜 라벨("내일" 등), 같은 날이면 null */
const dayOrNull = (ms, now) => (isSameDayKst(ms, now) ? null : dayLabel(ms, now));

export function buildResultViewModel({ flight, drive, buffers, now, hasChange = false, checking = false, refreshing = false, origin = null }) {
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
    lastChecked: lastConfirmedAt(flight),
    hasUnseenChange: hasChange, // status.js의 이름은 "unseen"이지만, 여기서는 "변경이 있었음"을 배지로 남기는 데 쓴다.
    // landed 는 넘기지 않는다. 도착한 편은 이 함수를 부르기 전에 안내 상자로 가므로, 카드의 상태 줄에 'landed' 가 들어가는 일이 없다.
  });

  const statusKind = statusKindOf(badgeKey, resolveFlightView(flight).touchdown);

  // 추천 시각이 도착 날짜와 다른 날이거나 오늘이 아니면(자정 전후) 날짜 라벨을 함께 보여 준다.
  const showDay = !isSameDayKst(departureMs, arrival) || !isSameDayKst(departureMs, now);

  return {
    badgeKey,
    departureMs,
    dayText: showDay ? dayLabel(departureMs, now) : null,
    timeText: formatClock(departureMs),
    timeSpoken: formatSpoken(departureMs),
    // 상태 줄: 추천 시각이 지났다면 "지남"이 먼저다. 그 밖에 착륙한 편, 곧 출발일 때만 있다.
    statusKind,
    statusText: statusKind === null ? null : STATUS_TEXT[statusKind],
    arrivalText: formatClockWithDay(arrival, now),
    arrivalSpoken: formatSpokenWithDay(arrival, now),
    travelMin: drive.minutes,
    bufferTotalMin: buffers.airportBufferMin + buffers.meetupMin,
    // 터미널 도착 예상: 추천 출발 시각 + 이동 시간. API가 주는 값이 아니라 우리가 계산한 예상이다. (추천 출발 시각 + 이동 + 여유 = 비행기 도착)
    terminalArrivalMs: departureMs + minutes(drive.minutes),
    terminalArrivalText: formatClockWithDay(departureMs + minutes(drive.minutes), now),
    terminalArrivalClock: formatClock(departureMs + minutes(drive.minutes)),
    terminalArrivalDay: dayOrNull(departureMs + minutes(drive.minutes), now),
    departureDay: dayOrNull(departureMs, now),
    arrivalClock: formatClock(arrival),
    arrivalDay: dayOrNull(arrival, now),
    // 지금 시각(기기 시계)과 추천 출발 시각까지 남은 시간. 남은 시간은 우리가 계산한 값이다.
    nowText: formatClock(now),
    nowSpoken: formatSpoken(now),
    untilKind: describeUntil(departureMs, now).kind,
    untilText: describeUntil(departureMs, now).text,
    terminalArrivalSpoken: formatSpokenWithDay(departureMs + minutes(drive.minutes), now),
    // 사용자가 앞서 고른 항공편 정보. 값이 없는 항목은 화면에서 만들지 않는다.
    flightNo: flight.flightNo || null,
    airline: flight.airline || null,
    departureCity: flight.departureCity || null,
    flightDateText: formatDateLabel(arrival, now),
    originName: origin?.name ?? null,
    originAddress: origin?.address || null,
    // API가 터미널을 준 편만 터미널 이름을 붙인다. 모르면 "인천공항"만 쓴다. (없는 값을 만들지 않는다)
    destinationText: flight.terminal?.name ? `인천공항 ${flight.terminal.name}` : '인천공항',
    checking,
    refreshing,
    stale: isStale({ now, lastChecked: lastConfirmedAt(flight) }),
    // 서버가 인천공항 API 를 부른 시각. 표시에만 쓰고 오래됨 판단에는 쓰지 않는다.
    checkedText: formatClock(flight.fetchedAt),
    checkedSpoken: formatSpoken(flight.fetchedAt),
  };
}

const noticeHtml = (text) => `<div class="notice"><p class="notice__text">${icon('info')}<span>${text}</span></p></div>`;

/** 도착·운항 상태 확인 필요·도착 터미널 확인 못 함 안내 상자. 상자 안에 "항공편 바꾸기" Text 버튼이 있다. 도착한 편은 원래 예정만 "도착 예정 11:00"으로 보여 준다. */
function flightNoticeHtml(kind, flight) {
  const scheduled = kind === 'arrived'
    ? `<p class="caption tabular"><span aria-hidden="true">도착 예정 ${formatClock(flight.scheduled)}</span><span class="sr-only">도착 예정 ${formatSpoken(flight.scheduled)}</span></p>`
    : '';
  return `<div class="notice">
      <p class="notice__text">${icon('info')}<span>${MESSAGES[kind]}</span></p>
      ${scheduled}
      <button class="btn btn--text" type="button" data-action="change-flight">항공편 바꾸기</button>
    </div>`;
}

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

  // 도착·운항 상태를 알 수 없는 편은 추천 카드 대신 안내 상자를 보여 준다. (추천 시각을 계산하지 않는다)
  // 재확인 결과가 올 때마다 바뀔 수 있으므로 항상 flight 의 최신 값으로 다시 정한다.
  // 실제 모드에서는 도착 터미널을 아는 편만 이동 시간을 계산한다. (시나리오 모드의 목업 항공편에는 터미널이 없다)
  const viewOf = (f) => resolveFlightView(f, { requiresTerminal: !isScenarioMode() });
  const screenOf = () => viewOf(flight).screen;
  const showsCard = () => screenOf() === 'card' && Number.isFinite(drive?.minutes);
  // 항공편을 다시 확인하는 화면인가. 도착(arrived)은 더 바뀌지 않는다고 보고 확인하지 않고, 이동 시간이 없어 카드를 못 그리는 경우도 확인하지 않는다.
  const polls = () => screenOf() === 'unknown' || showsCard();
  // 열자마자 최신 정보를 확인한다. 확인하는 동안 이전 값을 최신처럼 보이게 하지 않는다.
  let checking = polls();
  let travelBusy = false;
  let manualBusy = false; // 새로고침 버튼으로 시작한 확인이 끝나기 전까지 버튼을 막는다
  let pulsed = false; // "출발" 배지 모션은 이 화면에서 한 번만
  let lastVm = null;
  let renderedBadgeKey = null; // 화면에 실제로 그려진 배지. (lastVm은 확인 시각 줄만 바꿀 때도 갱신되어 비교 기준으로 쓸 수 없다)
  // 자동 재확인 상태: 화면을 열 때의 확인도 자동 시도 1회로 세고, 성공하면 되돌리고, 실패하면 반복하지 않는다. (domain/autoRecheck.js)
  const autoRecheck = createAutoRecheck();

  main.innerHTML = `
    <h1 class="sr-only" tabindex="-1">추천 출발 시각</h1>
    <div id="flight-announcer" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>
    <div id="banner-host" class="slot" aria-live="polite"></div>
    <div id="card-host"></div>
    <div id="notice-host" class="slot" aria-live="polite"></div>
    <div id="actions-host" class="slot actions"></div>
    <div class="text-actions">
      <button id="change-flight-btn" class="btn btn--text" type="button">항공편 바꾸기</button>
      <button id="back-btn" class="btn btn--text" type="button">이전</button>
    </div>`;

  const textActions = main.querySelector('.text-actions');
  const changeBtn = main.querySelector('#change-flight-btn');
  const announcer = main.querySelector('#flight-announcer');
  const bannerHost = main.querySelector('#banner-host');
  const host = main.querySelector('#card-host');
  const noticeHost = main.querySelector('#notice-host');
  const actionsHost = main.querySelector('#actions-host');
  const getBufferChip = () => main.querySelector('[data-chip="buffer"]');

  const makeVm = () => buildResultViewModel({
    flight, drive, buffers, now: ctx.now(), hasChange: change !== null, checking, refreshing: travelBusy || manualBusy, origin: state.origin,
  });

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
    if (showsCard() && lastVm && !checking) {
      if (lastVm.stale) items.push('<button class="btn btn--text" type="button" data-action="retry-refresh">다시 시도</button>');
      if (lastVm.badgeKey === 'passed') {
        items.push(`<button class="btn btn--secondary" type="button" data-action="recheck-travel"${travelBusy ? ' disabled' : ''}>이동 시간 다시 확인</button>`);
      }
    }
    actionsHost.innerHTML = items.join('');
    syncRefreshButton();
  }

  /** 새로고침 버튼은 확인 중이거나 이동 시간을 다시 확인하는 동안 막는다. (카드를 다시 그리지 않고 상태만 바꾼다) */
  function syncRefreshButton() {
    const button = host.querySelector('[data-action="refresh"]');
    if (button) button.disabled = checking || refreshing || travelBusy || manualBusy;
  }

  /**
   * 카드를 그린다. 이미 카드가 있으면 바깥 aria-live 영역은 두고 안쪽만 갈아 끼운다.
   * @param {{ animate?: 'buffer' | 'change' | null }} [options]
   *   buffer = 여유 시간을 저장해 다시 계산(숫자만 250ms), change = 도착 정보가 바뀌어 다시 계산(숫자 400ms)
   */
  function drawCard({ animate = null } = {}) {
    const screen = screenOf();

    // 안내 상자 안에 "항공편 바꾸기"가 있으므로, 상자를 보일 때는 아래쪽의 같은 버튼을 뺀다. (카드로 돌아오면 다시 넣는다)
    if (screen === 'card') {
      if (!changeBtn.isConnected) textActions.prepend(changeBtn);
    } else {
      changeBtn.remove();
    }

    if (screen !== 'card') {
      // 추천 시각을 계산하지도 보여 주지도 않는다. 카드 시절의 띠·안내·행동 버튼도 함께 치운다.
      bannerHost.innerHTML = '';
      noticeHost.innerHTML = '';
      lastVm = null;
      renderedBadgeKey = null;
      host.innerHTML = flightNoticeHtml(screen, flight);
      drawActions();
      return;
    }
    if (!Number.isFinite(drive?.minutes)) {
      host.innerHTML = noticeHtml(MESSAGES.noTravel);
      return;
    }

    lastVm = makeVm();
    renderedBadgeKey = lastVm.badgeKey;
    const content = renderRecommendCardContent({ ...lastVm, timelineHtml: renderTimeline(lastVm) });

    const card = host.querySelector('.reco');
    if (card) card.innerHTML = content;
    else host.innerHTML = `<section class="reco" aria-live="polite">${content}</section>`;

    if (animate) {
      const time = host.querySelector('.reco__time');
      time?.classList.add('is-updated');
      if (animate === 'change') time?.classList.add('is-updated--large');
    }

    // 곧 나갈 시간이 되면 상태 줄의 아이콘이 한 번만 살짝 커졌다 돌아온다.
    if (lastVm.statusKind === 'soon' && !pulsed) {
      pulsed = true;
      host.querySelector('.ticket__status--soon .ticket__status-icon')?.classList.add('is-pulse');
    }

    getBufferChip()?.addEventListener('click', openSheet);
    drawActions();
  }

  /** 화면 읽기 프로그램에 한 번 알린다. 같은 문장이 이어져도 읽히도록 먼저 비운 뒤 채운다. */
  function announce(text) {
    announcer.textContent = '';
    setTimeout(() => {
      if (announcer.isConnected) announcer.textContent = text;
    }, 50);
  }

  /** 포커스가 카드 · 행동 버튼 · 아래쪽 "항공편 바꾸기"(곧 사라질 요소) 안에 있는가. (전환하기 전에 부른다) */
  function focusIsInRemovable() {
    const active = document.activeElement;
    if (!active || active === document.body) return false;
    return host.contains(active) || actionsHost.contains(active) || noticeHost.contains(active) || active === changeBtn;
  }

  /** "지금" 줄만 바꾼다. (카드 전체를 다시 그리거나 다시 읽어 주지 않는다. 값이 그대로면 아무것도 하지 않는다) */
  function updateNowRow() {
    const row = host.querySelector('.reco__now');
    if (!row || !showsCard()) return;
    const vm = makeVm();
    const key = `${vm.nowText}|${vm.untilText}`;
    if (row.dataset.key === key) return;
    row.outerHTML = renderNowRow(vm);
    host.querySelector('.reco__now').dataset.key = key;
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
    if (refreshing) return null;
    refreshing = true;
    let ok = false;
    let travelRefreshed = false;
    const latest = await getFlight(flight.flightId, { arrivalDate: flight.arrivalDate });
    if (!host.isConnected) return null; // 기다리는 사이 다른 화면으로 이동했다.

    let newChange = false;
    const before = viewOf(flight);
    if (latest.ok) {
      ok = true;
      const next = latest.data;
      // 안내 상자로 바뀌는 편(도착 · 운항 상태 확인 필요)에는 추천 시각을 보여 주지 않으므로 변경 안내도 만들지 않는다.
      const detected = viewOf(next).screen === 'card' ? detectArrivalChange(flight, next) : null;

      let nextDrive = null;
      if (shouldAnnounce(detected, lastAnnouncedChangeId)) {
        // 도착 시각을 이동 시간만큼 기계적으로 미루지 않고, 이동 시간을 다시 조회한다. 실패하면 이전 값을 쓰고 재조회했다고 표시하지 않는다.
        const route = await getDriveTime(state.origin, { refresh: true, terminal: terminalCodeOf(next) });
        if (!host.isConnected) return null;
        // 이동 시간이 목업이고 항공편이 실제인 모드에서는 "다시 확인했어요"를 쓰지 않는다. (이전 이동 시간으로 계산한다)
        if (route.ok && isRealTravelRecheck(route.data, { scenarioMode: isScenarioMode() })) nextDrive = route.data;
        travelRefreshed = nextDrive !== null;

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
      autoRecheck.succeeded(); // 확인에 성공했으니, 다시 오래되면 자동 확인을 한 번 더 할 수 있다.
      persistLatest();
    }
    // 확인에 실패하면 flight(마지막으로 확인한 값과 응답을 받은 시각)를 그대로 둔다. 오래된 값을 최신처럼 바꾸지 않는다.

    refreshing = false;
    checking = false;

    // 최신 상태에 맞는 화면을 다시 정한다. (카드 ↔ 안내 상자, 착륙 말풍선)
    const after = viewOf(flight);
    const screenChanged = before.screen !== after.screen;
    const viewChanged = screenChanged || before.touchdown !== after.touchdown;

    // 카드 ↔ 안내 상자로 바뀌면: 포커스가 사라질 요소에 있었는지 먼저 보고, 열려 있는 여유 시간 시트는 저장하지 않고 닫는다.
    let focusInRemoved = false;
    if (screenChanged) {
      focusInRemoved = focusIsInRemovable();
      const sheetWasOpen = await closeCurrentSheet();
      if (!host.isConnected) return null;
      focusInRemoved = focusInRemoved || sheetWasOpen;
    }

    if (after.screen !== 'card') {
      if (viewChanged) drawCard();
    } else {
      const vm = makeVm();
      if (viewChanged || newChange || vm.badgeKey !== renderedBadgeKey || vm.timeText !== lastVm.timeText) {
        drawCard({ animate: newChange ? 'change' : null });
      } else {
        updateCheckedLine();
      }
      if (newChange) showBanner();
    }

    if (screenChanged) {
      const text = announcementFor(before, after, { cardLead: lastVm ? cardLeadSpoken(lastVm) : null });
      if (text) announce(text);
      if (focusTargetAfterTransition({ before, after, focusInRemoved }) === 'change-flight') {
        (after.screen === 'card' ? changeBtn : host.querySelector('[data-action="change-flight"]'))?.focus();
      }
    }
    return { ok, travelRefreshed };
  }

  /** 추천 출발 시각이 지났을 때: 이동 시간만 다시 조회해 다시 계산한다. */
  async function recheckTravel() {
    if (travelBusy) return false;
    travelBusy = true;
    noticeHost.innerHTML = `<p class="caption">${MESSAGES.travelChecking}</p>`;
    drawActions();

    const route = await getDriveTime(state.origin, { refresh: true, terminal: terminalCodeOf(flight) });
    if (!host.isConnected) return false;
    travelBusy = false;
    syncRefreshButton();

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
    return route.ok;
  }

  /** "다시 시도"와 자동 재확인이 함께 쓴다. 확인하는 동안 확인 시각 줄이 "확인 중이에요"로 바뀐다. */
  function retryRefresh() {
    if (refreshing || checking) return;
    checking = true;
    noticeHost.innerHTML = '';
    updateCheckedLine();
    refresh();
  }

  /**
   * 확인 시각 줄의 새로고침 버튼: 누른 시각 기준으로 항공편과 이동 시간을 다시 확인해 추천 시각을 다시 계산한다.
   * - 이동 시간은 카카오 길찾기를 다시 호출해 구한다. (이 API 에는 출발 시각 지정이 없고 응답은 "현재" 값이라, 호출한 시각이 곧 기준이다)
   * - 항공편 확인이 실패해도 이동 시간은 다시 구한다. (둘은 서로 영향을 주지 않는다. 한쪽이 실패하면 그 값만 이전 값을 그대로 두고 따로 알린다)
   * - 도착 시각이 바뀌어 이 확인에서 이동 시간을 이미 다시 조회했다면 한 번 더 부르지 않는다.
   */
  async function manualRefresh() {
    if (refreshing || checking || travelBusy || manualBusy || !showsCard()) return;
    manualBusy = true;
    checking = true;
    noticeHost.innerHTML = '';
    updateCheckedLine(); // "확인 중이에요", 버튼을 막는다
    const result = await refresh();
    if (!host.isConnected) return;

    const flightFailed = result !== null && !result.ok;
    let travelOk = true;
    if (result !== null && !result.travelRefreshed && showsCard()) travelOk = await recheckTravel();
    if (!host.isConnected) return;

    manualBusy = false;
    // 실패한 항목마다 안내를 보인다. (이동 시간 안내는 recheckTravel 이 이미 보였을 수 있어 여기서 한 번에 다시 정한다)
    noticeHost.innerHTML = [flightFailed ? noticeHtml(MESSAGES.refreshFailed) : '', travelOk ? '' : noticeHtml(MESSAGES.travelRecheckFailed)].join('');
    syncRefreshButton();
  }

  actionsHost.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'retry-refresh') retryRefresh();
    else if (action === 'recheck-travel') recheckTravel();
  });

  drawCard();
  if (polls()) refresh();

  // 화면을 열어 둔 동안 시간이 흐른 것(곧 출발·지남·오래됨)을 배지에 반영한다.
  // 응답을 받은 지 오래되면 항공편을 자동으로 한 번 다시 확인한다. (실패하면 반복하지 않고 "다시 시도"로 넘긴다)
  const timer = setInterval(() => {
    if (!host.isConnected) {
      clearInterval(timer); // 다른 화면으로 이동했다.
      return;
    }
    updateNowRow(); // 1분마다 "지금" 줄의 시각과 남은 시간을 새로 쓴다.
    const screen = screenOf();
    if (screen === 'arrived') {
      clearInterval(timer); // 도착한 편은 더 확인하지 않는다. (호출 한도)
      return;
    }
    if (!polls() || checking || refreshing || travelBusy) return;

    if (autoRecheck.due({ now: ctx.now(), receivedAt: lastConfirmedAt(flight) })) {
      autoRecheck.started();
      retryRefresh();
      return;
    }

    if (screen !== 'card') return;
    const vm = makeVm();
    if (vm.badgeKey !== renderedBadgeKey) drawCard();
    else if (vm.stale !== lastVm.stale) updateCheckedLine();
  }, STATUS_RECHECK_INTERVAL_MS);

  changeBtn.addEventListener('click', () => ctx.navigate('flight'));
  host.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="change-flight"]')) ctx.navigate('flight');
    else if (event.target.closest('[data-action="refresh"]')) manualRefresh();
  });
  main.querySelector('#back-btn').addEventListener('click', () => ctx.navigate('origin'));
}
