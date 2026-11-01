// 2단계 · 항공편 확인: 찾은 항공편 중 맞는 것을 사용자가 직접 고른다. (잘못된 항공편 선택 방지)
import {
  filterByOrigin, filterByQuery, listOrigins, listOriginsMatching, orderOrigins, sortByScheduled, visibleSelection,
} from '../../domain/originFilter.js';
import { formatClock, formatDateLabel, formatSpoken } from '../../domain/time.js';
import { load, save } from '../../store.js';
import { icon } from '../components/icon.js';
import { renderProgress } from '../components/progress.js';
import { escapeHtml } from '../html.js';

/**
 * 항공편 결과 카드 한 장. 비행기 티켓 모양이다. (DesignGuide 6장 "항공편 결과 카드", 가정)
 *   위 구역:  편명 · 항공사 ──────── 도착 예정 시각   (가장 중요한 정보)
 *   ┄┄┄ 절취선(양옆이 파인 홈) ┄┄┄
 *   아래 칸:  출발(도시) ──────── 도착 날짜            (라벨 14px + 값 16px)
 * 도착한 편은 변경 시각이 실제 도착 시각처럼 보일 수 있어 원래 예정만 보여 준다. (DesignGuide 12장)
 * 출발 도시·항공사는 API가 제공하는 편만 보이고, 값이 없는 항목은 만들지 않는다.
 */
export function cardHtml(flight, { now, checked }) {
  const changed = !flight.landed && flight.changed != null;
  const arrival = changed ? flight.changed : flight.scheduled;
  const label = changed ? '변경된 도착 예정' : '도착 예정';
  // 변경 전후는 색뿐 아니라 취소선 + 화살표 + 문구로 구분한다. (변경 안내 띠와 같은 규칙, DesignGuide 7장)
  const changedFrom = changed ? `<del class="flight-card__was">${formatClock(flight.scheduled)}</del><span class="flight-card__arrow">→</span>` : '';

  const airline = flight.airline ? `<span class="flight-card__meta">${escapeHtml(flight.airline)}</span>` : '';
  const city = flight.departureCity
    ? `<span class="flight-card__field"><span class="flight-card__meta">출발</span><span class="flight-card__value">${escapeHtml(flight.departureCity)}</span></span>`
    : '';

  return `
    <label class="flight-card">
      <input class="flight-card__input" type="radio" name="flight" value="${escapeHtml(flight.flightId)}"${checked ? ' checked' : ''}>
      <span class="flight-card__body">
        <span class="flight-card__top">
          <span class="flight-card__id">
            <span class="flight-card__idrow">
              <span class="flight-card__no">${escapeHtml(flight.flightNo)}</span>
              <span class="flight-card__check">${icon('check', 24)}<span class="sr-only">선택됨</span></span>
            </span>
            ${airline}
          </span>
          <span class="flight-card__time">
            <span class="flight-card__meta" aria-hidden="true">${label}</span>
            <span class="flight-card__clock tabular" aria-hidden="true">${changedFrom}<span>${formatClock(arrival)}</span></span>
            <span class="sr-only">${label} ${formatSpoken(arrival)}${changed ? `, 원래 도착 예정 ${formatSpoken(flight.scheduled)}` : ''}</span>
          </span>
        </span>
        <span class="flight-card__stub">
          <span class="flight-card__fields">
            ${city}
            <span class="flight-card__field flight-card__field--end"><span class="flight-card__meta">도착 날짜</span><span class="flight-card__value tabular">${formatDateLabel(arrival, now)}</span></span>
          </span>
          ${flight.landed ? '<span class="flight-card__meta">이 항공편은 이미 도착했어요.</span>' : ''}
        </span>
      </span>
    </label>`;
}

const ORIGIN_PLACEHOLDER = '어디에서 오시나요?';

/** 칩 하나. 체크 아이콘 없이 선택한 칩의 색만 바뀐다. (라디오라 선택 상태는 화면 읽기 프로그램에 전해진다) */
function chipHtml(value, label, selected) {
  return `
      <label class="choice">
        <input class="choice__input" type="radio" name="origin" value="${escapeHtml(value)}"${value === selected ? ' checked' : ''}>
        <span class="chip choice__body">${escapeHtml(label)}</span>
      </label>`;
}

/**
 * 출발 도시 검색바 + 접히는 칩 줄 (시간대로 찾았고 도시가 둘 이상일 때만). (DesignGuide 6장, 가정)
 * 검색바는 칩과 아래 항공편 목록을 함께 좁힌다. 칩 줄은 처음에 한 줄만 보이고, 오른쪽 토글로 나머지를 펼친다.
 * 칩과 토글은 화면에서 그리고(renderFlightConfirm 안), 여기서는 틀만 만든다.
 */
function originPickerHtml() {
  return `
    <div class="origin-picker">
      <div class="origin-search">
        <label class="sr-only" for="origin-query">출발 도시 검색</label>
        ${icon('search', 20)}
        <input id="origin-query" class="field__input origin-search__input" type="search" enterkeyhint="search"
          autocomplete="off" spellcheck="false" placeholder="${ORIGIN_PLACEHOLDER}">
        <button id="origin-clear" class="icon-btn" type="button" aria-label="검색어 지우기" hidden>${icon('close', 20)}</button>
      </div>
      <p id="origin-status" class="sr-only" role="status" aria-live="polite"></p>
      <div class="origin-chips">
        <fieldset id="origin-chips" class="choice-group origin-chips__list"></fieldset>
        <button id="origin-toggle" class="icon-btn origin-chips__toggle" type="button" aria-expanded="false" aria-controls="origin-chips" aria-label="출발 도시 더 보기" hidden>${icon('chevron-down', 24)}</button>
      </div>
    </div>`;
}

export function renderFlightConfirm({ main, footer }, ctx) {
  const state = load();
  const byWindow = state.search.mode === 'window';
  // 시간대로 찾은 결과는 예정 도착 시각순으로 보여 준다. 같은 편명의 여러 줄도 합치지 않는다.
  const allFlights = byWindow ? sortByScheduled(state.search.results) : state.search.results;
  const hasPicker = byWindow && listOrigins(allFlights).length >= 2;
  const now = ctx.now();

  // 이 화면 안에서만 유지하고 저장하지 않는다.
  let origin = null; // 고른 칩
  let query = ''; // 검색어
  let expanded = false; // 칩 줄을 펼쳤는가
  let selectedId = allFlights.some((f) => f.flightId === state.selectedFlightId) ? state.selectedFlightId : null;

  main.innerHTML = `
    ${renderProgress(2)}
    <div>
      <h1 tabindex="-1">이 항공편이 맞나요?</h1>
      <p class="caption">맞는 항공편을 눌러서 골라 주세요.</p>
    </div>
    ${hasPicker ? originPickerHtml() : ''}
    <fieldset id="flight-list" class="flight-list"></fieldset>`;

  footer.innerHTML = `
    <button id="continue-btn" class="btn btn--primary" type="button">이 항공편으로 계속</button>
    <button id="back-btn" class="btn btn--text" type="button">이전</button>`;

  const list = main.querySelector('#flight-list');
  const continueBtn = footer.querySelector('#continue-btn');
  const chipsEl = main.querySelector('#origin-chips');
  const toggleBtn = main.querySelector('#origin-toggle');
  const queryInput = main.querySelector('#origin-query');
  const clearBtn = main.querySelector('#origin-clear');
  const statusEl = main.querySelector('#origin-status');

  function renderList() {
    const visible = filterByOrigin(filterByQuery(allFlights, query), origin);
    // 고른 항공편이 필터로 가려지면 선택을 풀어, 보이지 않는 항공편으로 계속 진행하지 않게 한다.
    selectedId = visibleSelection(visible, selectedId);
    const empty = visible.length === 0
      ? `<div class="notice"><p class="notice__text">${icon('info')}<span>"${escapeHtml(query.trim())}"에서 출발하는 항공편을 찾지 못했어요. 다른 도시 이름으로 찾아볼까요?</span></p></div>`
      : '';
    list.innerHTML = `
      <legend class="sr-only">항공편 선택</legend>
      ${empty}${visible.map((f) => cardHtml(f, { now, checked: f.flightId === selectedId })).join('')}`;
    continueBtn.disabled = selectedId === null;
    if (statusEl) statusEl.textContent = query.trim() === '' ? '' : `검색 결과 항공편 ${visible.length}건`;
  }

  /** 첫 줄에 들어가지 못해 접힌 칩 (접힌 상태에서만 의미가 있다) */
  const chipsOutsideFirstRow = () => {
    const chips = [...chipsEl.querySelectorAll('.choice')];
    const firstTop = chips[0]?.offsetTop ?? 0;
    return chips.filter((chip) => chip.offsetTop > firstTop + 1);
  };

  /** 접힘 상태를 화면에 맞춘다: 한 줄을 넘지 않으면 토글을 숨기고, 접힌 동안 가려진 칩은 키보드 포커스에서 뺀다. */
  function layoutChips() {
    const outside = chipsOutsideFirstRow();
    const overflows = outside.length > 0;
    if (!overflows) expanded = false; // 한 줄에 다 들어가면 접고 펼칠 것이 없다
    chipsEl.classList.toggle('is-collapsed', !expanded);
    toggleBtn.hidden = !overflows && !expanded;
    toggleBtn.setAttribute('aria-expanded', String(expanded));
    toggleBtn.setAttribute('aria-label', expanded ? '출발 도시 접기' : '출발 도시 더 보기');
    for (const chip of chipsEl.querySelectorAll('.choice')) chip.inert = !expanded && outside.includes(chip);
  }

  function renderChips() {
    const shown = orderOrigins(listOriginsMatching(allFlights, query), origin, expanded);
    chipsEl.innerHTML = `
      <legend class="sr-only">출발 도시</legend>
      ${chipHtml('', '전체', origin === null ? '' : origin)}
      ${shown.map((city) => chipHtml(city, city, origin === null ? '' : origin)).join('')}`;
    layoutChips();
  }

  /** 펼치기·접기: 높이가 부드럽게 바뀐다. (움직임 줄이기가 켜져 있으면 바로 바뀐다) */
  function setExpanded(next) {
    if (next === expanded) return;
    const from = chipsEl.offsetHeight;
    expanded = next;
    if (!expanded) renderChips(); // 접을 때 고른 칩을 맨 앞으로 옮겨 가려진 줄에 숨지 않게 한다
    else layoutChips();
    const to = expanded ? chipsEl.scrollHeight : chipsEl.offsetHeight;
    chipsEl.style.maxHeight = `${from}px`;
    chipsEl.classList.add('is-animating');
    void chipsEl.offsetHeight; // 시작 높이를 먼저 적용한다
    chipsEl.style.maxHeight = `${to}px`;
    const done = () => {
      chipsEl.style.maxHeight = '';
      chipsEl.classList.remove('is-animating');
    };
    chipsEl.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 400); // transitionend 가 오지 않아도 정리한다
  }

  renderList();
  if (hasPicker) {
    renderChips();
    // 폭이 바뀌면 줄바꿈이 달라지므로 다시 맞춘다. (화면을 떠나면 스스로 지운다)
    const onResize = () => {
      if (!chipsEl.isConnected) window.removeEventListener('resize', onResize);
      else layoutChips();
    };
    window.addEventListener('resize', onResize);

    toggleBtn.addEventListener('click', () => setExpanded(!expanded));
    clearBtn.addEventListener('click', () => {
      queryInput.value = '';
      queryInput.dispatchEvent(new Event('input')); // 지우고 바로 다시 입력할 수 있게 포커스를 돌려준다
      queryInput.focus();
    });
    queryInput.addEventListener('input', () => {
      query = queryInput.value;
      clearBtn.hidden = query === '';
      // 검색어에 맞지 않게 된 칩 선택은 풀어 전체로 되돌린다. (보이지 않는 칩으로 걸러지지 않게)
      if (origin !== null && !listOriginsMatching(allFlights, query).includes(origin)) origin = null;
      renderChips();
      renderList();
    });
  }

  main.addEventListener('change', (event) => {
    if (event.target.name === 'flight') {
      selectedId = event.target.value;
      continueBtn.disabled = false;
    } else if (event.target.name === 'origin') {
      origin = event.target.value === '' ? null : event.target.value;
      renderList(); // 칩은 다시 그리지 않는다. (키보드로 칩을 옮기는 중에 포커스를 잃지 않게)
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
