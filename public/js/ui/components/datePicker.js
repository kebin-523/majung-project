// 도착 날짜 달력 (DesignGuide 6장 "날짜 달력"). 날짜 칸(버튼)을 누르면 바로 아래에 달력이 열린다.
// 날짜 계산은 domain/calendar.js 의 순수 함수가 하고, 이 파일은 그리기와 키보드·포커스만 맡는다.
// 날짜는 "YYYY-MM-DD" 문자열이다.
import { addDays, addMonths, clampDate, dateRange, isSelectable, monthGrid, monthHasSelectable } from '../../domain/calendar.js';
import { dayLabel } from '../../domain/time.js';
import { icon } from './icon.js';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const parts = (iso) => iso.split('-').map(Number);
const spoken = (iso) => {
  const [, m, d] = parts(iso);
  return `${m}월 ${d}일`;
};

/**
 * @param {object} options
 * @param {HTMLElement} options.root       달력을 그릴 빈 요소 (position: relative 인 .date-picker)
 * @param {string} options.labelId         보이는 라벨 요소의 id ("도착 날짜")
 * @param {string} options.value           처음 날짜. 범위 밖이면 가까운 날로 맞춘다
 * @param {string} options.today           오늘("YYYY-MM-DD")
 * @param {() => number} options.now       "오늘 / 내일" 라벨 기준 시각(epoch ms)
 * @param {(value: string) => void} options.onChange  사용자가 날짜를 골랐을 때(처음 값·setValue 는 부르지 않는다)
 * @returns {{ getValue: () => string, setValue: (value: string) => void }}
 */
export function createDatePicker({ root, labelId, value, today, now, onChange }) {
  const { min, max } = dateRange(today);
  let current = clampDate(value, min, max);
  let focusDate = current;
  let view = { year: parts(current)[0], month: parts(current)[1] };
  let open = false;

  root.innerHTML = `
    <button type="button" class="date-field" aria-haspopup="dialog" aria-expanded="false" aria-controls="date-panel" aria-labelledby="${labelId} date-field-text">
      <span class="date-field__value tabular" aria-hidden="true"></span>
      <span class="date-field__hint" aria-hidden="true">날짜 바꾸기</span>
      <span id="date-field-text" class="sr-only"></span>
    </button>
    <div id="date-panel" class="date-panel" role="dialog" aria-label="도착 날짜 고르기" hidden></div>`;

  const trigger = root.querySelector('.date-field');
  const valueText = root.querySelector('.date-field__value');
  const srText = root.querySelector('#date-field-text');
  const panel = root.querySelector('#date-panel');

  function renderTrigger() {
    valueText.textContent = dayLabel(`${current} 12:00`, now());
    srText.textContent = `${spoken(current)}, 고를 수 있는 날짜는 ${spoken(min)}부터 ${spoken(max)}까지`;
  }

  function dayCell(iso) {
    if (iso === null) return '<div class="date-panel__cell date-panel__cell--empty" role="gridcell" aria-hidden="true"></div>';
    const selectable = isSelectable(iso, min, max);
    const classes = ['date-panel__day', 'tabular'];
    if (iso === today) classes.push('date-panel__day--today');
    if (iso === current) classes.push('date-panel__day--selected');
    const label = `${spoken(iso)}${iso === today ? ', 오늘' : ''}`;
    return `
      <div class="date-panel__cell" role="gridcell" aria-selected="${iso === current}">
        <button type="button" class="${classes.join(' ')}" data-date="${iso}" aria-label="${label}"
          tabindex="${iso === focusDate ? 0 : -1}"${selectable ? '' : ' disabled'}${iso === today ? ' aria-current="date"' : ''}>${parts(iso)[2]}</button>
      </div>`;
  }

  function renderPanel() {
    const { year, month } = view;
    const prev = addMonths(`${year}-${String(month).padStart(2, '0')}-01`, -1);
    const next = addMonths(`${year}-${String(month).padStart(2, '0')}-01`, 1);
    const canPrev = monthHasSelectable(...parts(prev).slice(0, 2), min, max);
    const canNext = monthHasSelectable(...parts(next).slice(0, 2), min, max);
    panel.innerHTML = `
      <div class="date-panel__head">
        <button type="button" class="date-panel__nav" data-nav="prev" aria-label="이전 달"${canPrev ? '' : ' disabled'}>${icon('chevron-left', 24)}</button>
        <h3 class="date-panel__title" aria-live="polite">${year}년 ${month}월</h3>
        <button type="button" class="date-panel__nav" data-nav="next" aria-label="다음 달"${canNext ? '' : ' disabled'}>${icon('chevron-right', 24)}</button>
      </div>
      <div class="date-panel__grid" role="grid" aria-label="${year}년 ${month}월">
        <div class="date-panel__row" role="row">
          ${WEEKDAYS.map((name) => `<div class="date-panel__weekday" role="columnheader">${name}</div>`).join('')}
        </div>
        ${monthGrid(year, month)
          .map((week) => `<div class="date-panel__row" role="row">${week.map(dayCell).join('')}</div>`)
          .join('')}
      </div>`;
  }

  function focusDay() {
    panel.querySelector(`[data-date="${focusDate}"]`)?.focus();
  }

  /** 포커스할 날을 옮긴다. 범위 밖이면 옮기지 않는다. 다른 달로 넘어가면 달력도 그 달로 바꾼다. */
  function moveFocus(target) {
    if (!isSelectable(target, min, max)) return;
    focusDate = target;
    const [year, month] = parts(target);
    if (year !== view.year || month !== view.month) {
      view = { year, month };
      renderPanel();
    } else {
      for (const button of panel.querySelectorAll('.date-panel__day')) button.tabIndex = button.dataset.date === focusDate ? 0 : -1;
    }
    focusDay();
  }

  function openPanel() {
    open = true;
    focusDate = current;
    view = { year: parts(current)[0], month: parts(current)[1] };
    renderPanel();
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    focusDay();
  }

  function closePanel({ restoreFocus }) {
    if (!open) return;
    open = false;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  }

  function choose(iso) {
    if (!isSelectable(iso, min, max)) return;
    const changed = iso !== current;
    current = iso;
    renderTrigger();
    closePanel({ restoreFocus: true });
    if (changed) onChange(iso);
  }

  function shiftView(step, which) {
    const first = `${view.year}-${String(view.month).padStart(2, '0')}-01`;
    const [year, month] = parts(addMonths(first, step));
    view = { year, month };
    focusDate = clampDate(addMonths(focusDate, step), min, max);
    // 옮긴 달에 포커스가 갈 날이 없으면(범위 경계) 그 달의 첫·마지막 날로 맞춘다.
    if (parts(focusDate)[1] !== month) focusDate = step < 0 ? max : min;
    renderPanel();
    const nav = panel.querySelector(`[data-nav="${which}"]`);
    if (nav && !nav.disabled) nav.focus();
    else focusDay();
  }

  trigger.addEventListener('click', () => (open ? closePanel({ restoreFocus: false }) : openPanel()));

  panel.addEventListener('click', (event) => {
    const day = event.target.closest('[data-date]');
    if (day) return choose(day.dataset.date);
    const nav = event.target.closest('[data-nav]');
    if (nav && !nav.disabled) shiftView(nav.dataset.nav === 'prev' ? -1 : 1, nav.dataset.nav);
  });

  panel.addEventListener('keydown', (event) => {
    const day = event.target.closest?.('[data-date]');
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closePanel({ restoreFocus: true });
      return;
    }
    if (!day) return;
    const date = day.dataset.date;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const moves = {
      ArrowLeft: () => moveFocus(addDays(date, -1)),
      ArrowRight: () => moveFocus(addDays(date, 1)),
      ArrowUp: () => moveFocus(addDays(date, -7)),
      ArrowDown: () => moveFocus(addDays(date, 7)),
      Home: () => moveFocus(clampDate(addDays(date, -weekday), min, max)),
      End: () => moveFocus(clampDate(addDays(date, 6 - weekday), min, max)),
      PageUp: () => moveFocus(clampDate(addMonths(date, -1), min, max)),
      PageDown: () => moveFocus(clampDate(addMonths(date, 1), min, max)),
    };
    if (moves[event.key]) {
      event.preventDefault();
      moves[event.key]();
    }
  });

  // 달력 바깥을 누르거나 포커스가 밖으로 나가면 고르지 않고 닫는다.
  function onOutsidePress(event) {
    if (!root.isConnected) {
      document.removeEventListener('pointerdown', onOutsidePress); // 화면이 바뀌어 달력이 사라졌다
    } else if (open && !root.contains(event.target)) {
      closePanel({ restoreFocus: false });
    }
  }
  document.addEventListener('pointerdown', onOutsidePress);
  root.addEventListener('focusout', (event) => {
    if (open && event.relatedTarget && !root.contains(event.relatedTarget)) closePanel({ restoreFocus: false });
  });

  renderTrigger();

  return {
    getValue: () => current,
    setValue(next) {
      current = clampDate(next, min, max);
      renderTrigger();
    },
  };
}
