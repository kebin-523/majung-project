// 2단계 · 항공편 확인: 찾은 항공편 중 맞는 것을 사용자가 직접 고른다. (잘못된 항공편 선택 방지)
import { dayLabel, formatClock, formatSpoken, partsKst } from '../../domain/time.js';
import { load, save } from '../../store.js';
import { icon } from '../components/icon.js';
import { renderProgress } from '../components/progress.js';
import { escapeHtml } from '../html.js';

/** 화면에는 24시간제, 화면 읽기 프로그램에는 "오후 5시 30분"으로 읽히게 한다. */
function timeLine(label, ms) {
  return `<span aria-hidden="true">${label} ${formatClock(ms)}</span><span class="sr-only">${label} ${formatSpoken(ms)}</span>`;
}

/** "오늘 · 10월 29일" / "10월 31일" (라벨이 이미 날짜면 한 번만) */
function dateText(ms, now) {
  const { m, d } = partsKst(ms);
  const date = `${m}월 ${d}일`;
  const label = dayLabel(ms, now);
  return label === date ? date : `${label} · ${date}`;
}

function cardHtml(flight, { now, checked }) {
  const changed = flight.changed != null;
  const arrival = changed ? flight.changed : flight.scheduled;

  // 출발 도시·항공사는 API가 제공하는지 확인 전이라, 값이 있을 때만 보여 준다.
  const origin = [flight.departureCity && `${flight.departureCity} 출발`, flight.airline]
    .filter(Boolean)
    .map(escapeHtml)
    .join(' · ');

  return `
    <label class="flight-card">
      <input class="flight-card__input" type="radio" name="flight" value="${escapeHtml(flight.flightId)}"${checked ? ' checked' : ''}>
      <span class="flight-card__body">
        <span class="flight-card__main">
          <span class="flight-card__no">${escapeHtml(flight.flightNo)}</span>
          <span class="flight-card__meta tabular">${dateText(arrival, now)}</span>
          <span class="flight-card__meta tabular">${timeLine(changed ? '변경된 도착 예정' : '도착 예정', arrival)}</span>
          ${changed ? `<span class="flight-card__meta tabular">${timeLine('원래 도착 예정', flight.scheduled)}</span>` : ''}
          ${origin ? `<span class="flight-card__meta">${origin}</span>` : ''}
          ${flight.landed ? '<span class="flight-card__meta">이 항공편은 이미 도착했어요.</span>' : ''}
        </span>
        <span class="flight-card__check">${icon('check', 24)}<span class="sr-only">선택됨</span></span>
      </span>
    </label>`;
}

export function renderFlightConfirm({ main, footer }, ctx) {
  const state = load();
  const flights = state.search.results;
  const selectedId = flights.some((f) => f.flightId === state.selectedFlightId) ? state.selectedFlightId : null;
  const now = ctx.now();

  main.innerHTML = `
    ${renderProgress(2)}
    <div>
      <h1 tabindex="-1">이 항공편이 맞나요?</h1>
      <p class="caption">맞는 항공편을 눌러서 골라 주세요.</p>
    </div>
    <fieldset class="flight-list">
      <legend class="sr-only">항공편 선택</legend>
      ${flights.map((f) => cardHtml(f, { now, checked: f.flightId === selectedId })).join('')}
    </fieldset>`;

  footer.innerHTML = `
    <button id="continue-btn" class="btn btn--primary" type="button">이 항공편으로 계속</button>
    <button id="back-btn" class="btn btn--text" type="button">이전</button>`;

  const continueBtn = footer.querySelector('#continue-btn');
  continueBtn.disabled = selectedId === null;

  main.addEventListener('change', (event) => {
    if (event.target.name === 'flight') continueBtn.disabled = false;
  });

  continueBtn.addEventListener('click', () => {
    const chosen = main.querySelector('input[name="flight"]:checked');
    if (!chosen) return;
    // 항공편을 새로 고르면 이전 항공편의 변경 기록과 안내 이력은 지운다.
    save({ ...load(), selectedFlightId: chosen.value, change: null, lastAnnouncedChangeId: null });
    ctx.navigate('origin');
  });

  footer.querySelector('#back-btn').addEventListener('click', () => ctx.navigate('flight'));
}
