// 1단계 · 항공편 찾기: 편명으로 찾기, 편명을 모르면 도착 시간대로 찾기
import { searchFlights, searchFlightsByWindow } from '../../adapters/flightAdapter.js';
import { WINDOW_MAX_HOURS } from '../../config.js';
import { parseFlightNo } from '../../domain/flightNo.js';
import { dayLabel } from '../../domain/time.js';
import { clampToHour, defaultWindow, toHhmm } from '../../domain/timeWindow.js';
import { load, save } from '../../store.js';
import { icon } from '../components/icon.js';
import { renderProgress } from '../components/progress.js';

const MESSAGES = {
  format: '편명을 한 번 더 확인해 주실래요?',
  notfound: '이 날짜에 해당하는 항공편을 찾지 못했어요. 편명과 날짜를 확인해 주세요.',
  windowNotfound: '이 시간대에 도착하는 항공편을 찾지 못했어요. 시간대나 날짜를 바꿔 보세요.',
  error: '지금은 항공편 정보를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.',
  quota: '지금은 항공편 정보를 확인하기 어려워요. 조금 뒤에 다시 시도해 주세요.', // 호출 한도 초과 (DesignGuide 7장)
  loading: '항공편을 찾고 있어요.',
};

const MODES = [
  { value: 'flightNo', label: '편명으로 찾기' },
  { value: 'window', label: '시간대로 찾기' },
];
const pad2 = (n) => String(n).padStart(2, '0');
const hourOf = (hhmm) => Number(hhmm.slice(0, 2));
const hourOption = (hour, selected) => `<option value="${hour}"${hour === selected ? ' selected' : ''}>${pad2(hour)}:00</option>`;

export function renderFlightSearch({ main, footer }, ctx) {
  const today = ctx.today();
  const saved = load().search;
  // 저장된 날짜가 이미 지난 날이면 오늘로 되돌린다.
  const initialDate = saved?.date && saved.date >= today ? saved.date : today;

  main.innerHTML = `
    ${renderProgress(1)}
    <h1 tabindex="-1">어떤 편으로 오시나요?</h1>
    <form id="flight-form" class="form" novalidate>
      <fieldset class="choice-group">
        <legend class="sr-only">찾는 방법</legend>
        ${MODES.map(
          ({ value, label }) => `
        <label class="choice">
          <input class="choice__input" type="radio" name="find-mode" value="${value}">
          <span class="chip choice__body"><span>${label}</span><span class="choice__check">${icon('check')}<span class="sr-only">선택됨</span></span></span>
        </label>`,
        ).join('')}
      </fieldset>
      <div id="flight-field" class="field">
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
      <div id="window-fields" class="field-row" hidden>
        <div class="field">
          <label class="field__label" for="window-from">몇 시부터</label>
          <select id="window-from" class="field__input tabular"></select>
        </div>
        <div class="field">
          <label class="field__label" for="window-to">몇 시까지</label>
          <select id="window-to" class="field__input tabular"></select>
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
  const flightField = main.querySelector('#flight-field');
  const windowFields = main.querySelector('#window-fields');
  const fromSelect = main.querySelector('#window-from');
  const toSelect = main.querySelector('#window-to');

  flightInput.value = saved?.flightNo ?? '';
  dateInput.value = initialDate;
  updateDateText();

  // 이전 버전에 저장된 값에는 mode 가 없다. 그때는 편명으로 찾기다.
  let mode = saved?.mode === 'window' ? 'window' : 'flightNo';
  const savedWindow = saved?.from && saved?.to ? { fromHour: hourOf(saved.from), toHour: hourOf(saved.to) } : null;
  let windowHours = savedWindow ?? defaultWindow(ctx.now(), initialDate, today);
  let windowTouched = savedWindow !== null;

  function renderToOptions() {
    const max = Math.min(windowHours.fromHour + WINDOW_MAX_HOURS, 24);
    const hours = [];
    for (let hour = windowHours.fromHour + 1; hour <= max; hour += 1) hours.push(hour);
    toSelect.innerHTML = hours.map((hour) => hourOption(hour, windowHours.toHour)).join('');
  }

  function renderWindow() {
    fromSelect.innerHTML = Array.from({ length: 24 }, (_, hour) => hourOption(hour, windowHours.fromHour)).join('');
    renderToOptions();
  }

  function applyMode() {
    for (const radio of main.querySelectorAll('input[name="find-mode"]')) radio.checked = radio.value === mode;
    flightField.hidden = mode !== 'flightNo';
    windowFields.hidden = mode !== 'window';
  }

  renderWindow();
  applyMode();

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
    showNotice(null);

    let parsed = null;
    if (mode === 'flightNo') {
      parsed = parseFlightNo(flightInput.value);
      flightInput.value = parsed.value;
      if (!parsed.valid) {
        showFieldError(MESSAGES.format);
        flightInput.focus();
        return;
      }
    }
    showFieldError(null);

    const from = toHhmm(windowHours.fromHour);
    const to = toHhmm(windowHours.toHour);

    busy = true;
    setBusy(true);
    showNotice('loading');
    const result =
      mode === 'window'
        ? await searchFlightsByWindow(dateInput.value, from, to)
        : await searchFlights(parsed.value, dateInput.value);
    busy = false;

    if (!form.isConnected) return; // 응답을 기다리는 사이 다른 화면으로 이동했다.
    setBusy(false);

    if (!result.ok) {
      if (result.reason === 'notfound') showNotice(mode === 'window' ? 'windowNotfound' : 'notfound');
      else showNotice(result.reason === 'quota' ? 'quota' : 'error');
      return;
    }

    save({
      ...load(),
      search: {
        mode,
        flightNo: mode === 'flightNo' ? parsed.value : (saved?.flightNo ?? ''),
        date: dateInput.value,
        from,
        to,
        results: result.data,
      },
      selectedFlightId: null,
    });
    ctx.navigate('confirm');
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit();
  });

  main.addEventListener('change', (event) => {
    if (event.target.name !== 'find-mode') return;
    mode = event.target.value;
    applyMode();
    showFieldError(null);
    showNotice(null);
  });

  fromSelect.addEventListener('change', () => {
    windowTouched = true;
    const fromHour = Number(fromSelect.value);
    windowHours = { fromHour, toHour: clampToHour(fromHour, windowHours.toHour) };
    renderToOptions();
    showNotice(null);
  });

  toSelect.addEventListener('change', () => {
    windowTouched = true;
    windowHours = { ...windowHours, toHour: Number(toSelect.value) };
    showNotice(null);
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
    // 시간대를 직접 고르지 않았다면 새 날짜에 맞는 기본 시간대로 바꾼다.
    if (!windowTouched) {
      windowHours = defaultWindow(ctx.now(), dateInput.value, today);
      renderWindow();
    }
    showNotice(null);
  });
}
