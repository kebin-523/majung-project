// 1단계 · 항공편 찾기
import { searchFlights } from '../../adapters/flightAdapter.js';
import { parseFlightNo } from '../../domain/flightNo.js';
import { dayLabel } from '../../domain/time.js';
import { load, save } from '../../store.js';
import { icon } from '../components/icon.js';
import { renderProgress } from '../components/progress.js';

const MESSAGES = {
  format: '편명을 한 번 더 확인해 주실래요?',
  notfound: '이 날짜에 해당하는 항공편을 찾지 못했어요. 편명과 날짜를 확인해 주세요.',
  error: '지금은 항공편 정보를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.',
  loading: '항공편을 찾고 있어요.',
};

export function renderFlightSearch({ main, footer }, ctx) {
  const today = ctx.today();
  const saved = load().search;
  // 저장된 날짜가 이미 지난 날이면 오늘로 되돌린다.
  const initialDate = saved?.date && saved.date >= today ? saved.date : today;

  main.innerHTML = `
    ${renderProgress(1)}
    <h1 tabindex="-1">어떤 편으로 오시나요?</h1>
    <form id="flight-form" class="form" novalidate>
      <div class="field">
        <label class="field__label" for="flight-no">편명</label>
        <input id="flight-no" class="field__input field__input--flight" type="text"
          autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12"
          placeholder="편명을 입력해 주세요 (예: KE123)" aria-describedby="flight-no-error">
        <p id="flight-no-error" class="field__error" aria-live="polite"></p>
      </div>
      <div class="field">
        <label class="field__label" for="arrival-date">도착 날짜</label>
        <div class="date-field">
          <span id="date-text" class="date-field__value tabular" aria-hidden="true"></span>
          <span class="date-field__hint" aria-hidden="true">날짜 바꾸기</span>
          <input id="arrival-date" class="date-field__input" type="date" min="${today}">
        </div>
      </div>
      <div id="search-notice" aria-live="polite"></div>
    </form>`;

  footer.innerHTML = `<button id="submit-btn" class="btn btn--primary" type="submit" form="flight-form">항공편 찾기</button>`;

  const form = main.querySelector('#flight-form');
  const flightInput = main.querySelector('#flight-no');
  const flightError = main.querySelector('#flight-no-error');
  const dateInput = main.querySelector('#arrival-date');
  const dateText = main.querySelector('#date-text');
  const notice = main.querySelector('#search-notice');
  const submitBtn = footer.querySelector('#submit-btn');

  flightInput.value = saved?.flightNo ?? '';
  dateInput.value = initialDate;
  updateDateText();

  function updateDateText() {
    dateText.textContent = dayLabel(`${dateInput.value} 12:00`, ctx.now());
  }

  function showFieldError(text) {
    flightError.innerHTML = text ? `${icon('info')}<span>${text}</span>` : '';
    if (text) flightInput.setAttribute('aria-invalid', 'true');
    else flightInput.removeAttribute('aria-invalid');
  }

  function showNotice(kind) {
    if (!kind) {
      notice.innerHTML = '';
    } else if (kind === 'loading') {
      notice.innerHTML = `<p class="caption">${MESSAGES.loading}</p>`;
    } else {
      notice.innerHTML = `
        <div class="notice">
          <p class="notice__text">${icon('info')}<span>${MESSAGES[kind]}</span></p>
          ${kind === 'error' ? '<button class="btn btn--text" type="button" data-retry>다시 시도</button>' : ''}
        </div>`;
      notice.querySelector('[data-retry]')?.addEventListener('click', submit);
    }
  }

  function setBusy(busy) {
    submitBtn.disabled = busy;
    form.setAttribute('aria-busy', String(busy));
  }

  let busy = false;

  async function submit() {
    if (busy) return;

    const parsed = parseFlightNo(flightInput.value);
    flightInput.value = parsed.value;
    showNotice(null);

    if (!parsed.valid) {
      showFieldError(MESSAGES.format);
      flightInput.focus();
      return;
    }
    showFieldError(null);

    busy = true;
    setBusy(true);
    showNotice('loading');
    const result = await searchFlights(parsed.value, dateInput.value);
    busy = false;

    if (!form.isConnected) return; // 응답을 기다리는 사이 다른 화면으로 이동했다.
    setBusy(false);

    if (!result.ok) {
      showNotice(result.reason === 'notfound' ? 'notfound' : 'error');
      return;
    }

    save({
      ...load(),
      search: { flightNo: parsed.value, date: dateInput.value, results: result.data },
      selectedFlightId: null,
    });
    ctx.navigate('confirm');
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit();
  });

  flightInput.addEventListener('input', () => {
    showFieldError(null);
    showNotice(null);
  });

  dateInput.addEventListener('click', () => {
    try {
      dateInput.showPicker();
    } catch {
      // 지원하지 않는 브라우저는 기본 동작을 따른다.
    }
  });

  dateInput.addEventListener('change', () => {
    if (!dateInput.value) dateInput.value = today; // 날짜를 지우면 오늘로 되돌린다.
    updateDateText();
    showNotice(null);
  });
}
