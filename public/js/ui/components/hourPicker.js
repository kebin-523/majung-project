// 시간 선택 칸 (DesignGuide 6장 "시간 선택 패널"). 칸(버튼)을 누르면 바로 아래에 목록 패널이 열린다.
// 브라우저 기본 선택 목록(<select>)은 화면 위로 겹쳐 열릴 수 있어 쓰지 않는다. 목록 만들기는 domain/timeWindow.js 가 맡는다.
import { icon } from './icon.js';

let uid = 0;

/**
 * @param {object} options
 * @param {HTMLElement} options.root     빈 요소 (position: relative 인 .hour-picker)
 * @param {string} options.labelId       보이는 라벨 요소의 id ("몇 시부터")
 * @param {string} options.title         목록 이름 ("몇 시부터 고르기")
 * @param {{hour:number,label:string}[]} options.options
 * @param {number} options.value
 * @param {(hour: number) => void} options.onChange  사용자가 골랐을 때(처음 값·setOptions 는 부르지 않는다)
 */
export function createHourPicker({ root, labelId, title, options, value, onChange }) {
  const id = `hour-panel-${(uid += 1)}`;
  let items = options;
  let current = value;
  let open = false;

  root.innerHTML = `
    <button type="button" class="hour-field" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}" aria-labelledby="${labelId}">
      <span class="hour-field__value tabular"></span>
      <span class="hour-field__chevron" aria-hidden="true">${icon('chevron-down', 24)}</span>
    </button>
    <div id="${id}" class="hour-panel" hidden>
      <div class="hour-panel__head">
        <span class="hour-panel__value tabular" aria-hidden="true"></span>
        <button type="button" class="hour-panel__close" aria-label="닫기">${icon('close', 20)}</button>
      </div>
      <ul class="hour-panel__list" role="listbox" aria-label="${title}"></ul>
    </div>`;

  const trigger = root.querySelector('.hour-field');
  const valueText = root.querySelector('.hour-field__value');
  const panel = root.querySelector('.hour-panel');
  const panelValue = root.querySelector('.hour-panel__value');
  const list = root.querySelector('.hour-panel__list');

  const labelOf = (hour) => items.find((item) => item.hour === hour)?.label ?? '';

  function renderValue() {
    valueText.textContent = labelOf(current);
    panelValue.textContent = labelOf(current);
  }

  function renderList() {
    list.innerHTML = items
      .map(({ hour, label }) => {
        const selected = hour === current;
        return `<li role="option" class="hour-panel__option tabular${selected ? ' hour-panel__option--selected' : ''}" data-hour="${hour}" aria-selected="${selected}" tabindex="${selected ? 0 : -1}"><span>${label}</span>${selected ? icon('check', 20) : ''}</li>`;
      })
      .join('');
  }

  function focusOption(hour) {
    for (const el of list.children) el.tabIndex = Number(el.dataset.hour) === hour ? 0 : -1;
    const el = list.querySelector(`[data-hour="${hour}"]`);
    el?.focus();
    el?.scrollIntoView({ block: 'nearest' });
  }

  function openPanel() {
    open = true;
    renderList();
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    focusOption(items.some((item) => item.hour === current) ? current : items[0].hour);
  }

  function closePanel({ restoreFocus }) {
    if (!open) return;
    open = false;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  }

  function choose(hour) {
    const changed = hour !== current;
    current = hour;
    renderValue();
    closePanel({ restoreFocus: true });
    if (changed) onChange(hour);
  }

  trigger.addEventListener('click', () => (open ? closePanel({ restoreFocus: false }) : openPanel()));

  panel.addEventListener('click', (event) => {
    if (event.target.closest('.hour-panel__close')) return closePanel({ restoreFocus: true });
    const option = event.target.closest('[data-hour]');
    if (option) choose(Number(option.dataset.hour));
  });

  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closePanel({ restoreFocus: true });
      return;
    }
    const option = event.target.closest?.('[data-hour]');
    if (!option) return;
    const index = items.findIndex((item) => item.hour === Number(option.dataset.hour));
    const target = {
      ArrowDown: items[Math.min(index + 1, items.length - 1)],
      ArrowUp: items[Math.max(index - 1, 0)],
      Home: items[0],
      End: items[items.length - 1],
    }[event.key];
    if (target) {
      event.preventDefault();
      focusOption(target.hour);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(items[index].hour);
    }
  });

  // 바깥을 누르거나 포커스가 밖으로 나가면 고르지 않고 닫는다.
  function onOutsidePress(event) {
    if (!root.isConnected) {
      document.removeEventListener('pointerdown', onOutsidePress); // 화면이 바뀌어 사라졌다
    } else if (open && !root.contains(event.target)) {
      closePanel({ restoreFocus: false });
    }
  }
  document.addEventListener('pointerdown', onOutsidePress);
  root.addEventListener('focusout', (event) => {
    if (open && event.relatedTarget && !root.contains(event.relatedTarget)) closePanel({ restoreFocus: false });
  });

  renderValue();

  return {
    getValue: () => current,
    /** 목록과 값을 바꾼다. onChange 는 부르지 않는다. */
    setOptions(nextOptions, nextValue) {
      items = nextOptions;
      current = nextValue;
      renderValue();
      if (open) renderList();
    },
    setValue(next) {
      current = next;
      renderValue();
    },
  };
}
