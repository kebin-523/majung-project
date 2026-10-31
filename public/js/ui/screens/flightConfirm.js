// 2단계 · 항공편 확인: 찾은 항공편 중 맞는 것을 사용자가 직접 고른다. (잘못된 항공편 선택 방지)
import { filterByOrigin, listOrigins, sortByScheduled, visibleSelection } from '../../domain/originFilter.js';
import { dayLabel, formatClock, formatSpoken, partsKst } from '../../domain/time.js';
import { load, save } from '../../store.js';
import { icon } from '../components/icon.js';
import { renderProgress } from '../components/progress.js';
import { escapeHtml } from '../html.js';

/** "오늘 · 10월 29일" / "10월 31일" (라벨이 이미 날짜면 한 번만) */
function dateText(ms, now) {
  const { m, d } = partsKst(ms);
  const date = `${m}월 ${d}일`;
  const label = dayLabel(ms, now);
  return label === date ? date : `${label} · ${date}`;
}

function cardHtml(flight, { now, checked }) {
  // 도착한 편은 변경 시각이 실제 도착 시각처럼 보일 수 있어, 원래 예정만 보여 준다. (DesignGuide 12장)
  const changed = !flight.landed && flight.changed != null;
  const arrival = changed ? flight.changed : flight.scheduled;
  const label = changed ? '변경된 도착 예정' : '도착 예정';
  // 변경 전후는 색뿐 아니라 취소선 + 화살표 + 문구로 구분한다. (변경 안내 띠와 같은 규칙, DesignGuide 7장)
  const changedFrom = changed ? `<del class="flight-card__was">${formatClock(flight.scheduled)}</del><span class="flight-card__arrow">→</span>` : '';

  // 출발 도시·항공사는 API가 제공하는지 확인 전이라, 값이 있을 때만 보여 준다.
  const city = flight.departureCity ? `<span class="flight-card__city">${escapeHtml(flight.departureCity)} 출발</span>` : '';
  const airline = flight.airline ? `<span class="flight-card__meta">${escapeHtml(flight.airline)}</span>` : '';

  // 정보 위계 (DesignGuide 6장 "항공편 결과 카드"): 편명 > 도착 예정 시각 > 출발 도시 > 항공사·날짜
  return `
    <label class="flight-card">
      <input class="flight-card__input" type="radio" name="flight" value="${escapeHtml(flight.flightId)}"${checked ? ' checked' : ''}>
      <span class="flight-card__body">
        <span class="flight-card__head">
          <span class="flight-card__no">${escapeHtml(flight.flightNo)}</span>
          <span class="flight-card__check">${icon('check', 24)}<span class="sr-only">선택됨</span></span>
        </span>
        <span class="flight-card__detail">
          <span class="flight-card__route">${city}${airline}</span>
          <span class="flight-card__time">
            <span class="flight-card__meta" aria-hidden="true">${label}</span>
            <span class="flight-card__clock tabular" aria-hidden="true">${changedFrom}<span>${formatClock(arrival)}</span></span>
            <span class="sr-only">${label} ${formatSpoken(arrival)}${changed ? `, 원래 도착 예정 ${formatSpoken(flight.scheduled)}` : ''}</span>
            <span class="flight-card__meta tabular">${dateText(arrival, now)}</span>
          </span>
        </span>
        ${flight.landed ? '<span class="flight-card__meta">이 항공편은 이미 도착했어요.</span>' : ''}
      </span>
    </label>`;
}

/** 출발 도시 칩 줄 (시간대로 찾았고 도시가 둘 이상일 때만). 체크 아이콘 없이 선택한 칩의 색만 바뀐다. (라디오라 선택 상태는 화면 읽기 프로그램에 전해진다) */
function originChipsHtml(origins, selected) {
  const chip = (value, label) => `
      <label class="choice">
        <input class="choice__input" type="radio" name="origin" value="${escapeHtml(value)}"${value === selected ? ' checked' : ''}>
        <span class="chip choice__body">${escapeHtml(label)}</span>
      </label>`;
  return `
    <fieldset class="choice-group">
      <legend class="sr-only">출발 도시</legend>
      ${chip('', '전체')}
      ${origins.map((origin) => chip(origin, origin)).join('')}
    </fieldset>`;
}

export function renderFlightConfirm({ main, footer }, ctx) {
  const state = load();
  const byWindow = state.search.mode === 'window';
  // 시간대로 찾은 결과는 예정 도착 시각순으로 보여 준다. 같은 편명의 여러 줄도 합치지 않는다.
  const allFlights = byWindow ? sortByScheduled(state.search.results) : state.search.results;
  const origins = byWindow ? listOrigins(allFlights) : [];
  const now = ctx.now();

  let origin = null; // 이 화면 안에서만 유지하고 저장하지 않는다.
  let selectedId = allFlights.some((f) => f.flightId === state.selectedFlightId) ? state.selectedFlightId : null;

  main.innerHTML = `
    ${renderProgress(2)}
    <div>
      <h1 tabindex="-1">이 항공편이 맞나요?</h1>
      <p class="caption">맞는 항공편을 눌러서 골라 주세요.</p>
    </div>
    ${origins.length >= 2 ? originChipsHtml(origins, '') : ''}
    <fieldset id="flight-list" class="flight-list"></fieldset>`;

  footer.innerHTML = `
    <button id="continue-btn" class="btn btn--primary" type="button">이 항공편으로 계속</button>
    <button id="back-btn" class="btn btn--text" type="button">이전</button>`;

  const list = main.querySelector('#flight-list');
  const continueBtn = footer.querySelector('#continue-btn');

  function renderList() {
    const visible = filterByOrigin(allFlights, origin);
    // 고른 항공편이 필터로 가려지면 선택을 풀어, 보이지 않는 항공편으로 계속 진행하지 않게 한다.
    selectedId = visibleSelection(visible, selectedId);
    list.innerHTML = `
      <legend class="sr-only">항공편 선택</legend>
      ${visible.map((f) => cardHtml(f, { now, checked: f.flightId === selectedId })).join('')}`;
    continueBtn.disabled = selectedId === null;
  }

  renderList();

  main.addEventListener('change', (event) => {
    if (event.target.name === 'flight') {
      selectedId = event.target.value;
      continueBtn.disabled = false;
    } else if (event.target.name === 'origin') {
      origin = event.target.value === '' ? null : event.target.value;
      renderList();
    }
  });

  continueBtn.addEventListener('click', () => {
    if (selectedId === null) return;
    // 항공편을 새로 고르면 이전 항공편의 변경 기록과 안내 이력은 지운다.
    save({ ...load(), selectedFlightId: selectedId, change: null, lastAnnouncedChangeId: null });
    ctx.navigate('origin');
  });

  footer.querySelector('#back-btn').addEventListener('click', () => ctx.navigate('flight'));
}
