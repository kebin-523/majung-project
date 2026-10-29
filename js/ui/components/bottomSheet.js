// 바텀시트: 아래에서 올라오는 대화상자. 콘텐츠 영역 폭(480px) 안에 둔다.
// 이 파일에는 ① 대화상자 뼈대(openBottomSheet)와 ② "여유 시간 정하기" 내용(openBufferSheet)이 함께 있다.
// 가이드에 바텀시트는 이것 하나뿐이라 파일을 나누지 않았다.
import { BUFFER_MAX_MIN, BUFFER_MIN_MIN, BUFFER_STEP_MIN } from '../../config.js';

/* ───────────────────────── ① 대화상자 뼈대 ───────────────────────── */
// - 열리면 포커스가 시트 제목으로 이동하고, 시트 밖(.app)은 inert로 막아 화면 읽기 프로그램·Tab이 못 들어가게 한다.
// - 닫으면(Esc·막 누르기·저장) 포커스가 getReturnFocus()가 돌려주는 요소로 돌아온다.
//   (저장 후 화면이 다시 그려져 원래 칩이 새 요소로 바뀌어도, 닫는 시점에 찾기 때문에 문제없다.)

const CLOSE_MS = 250; // tokens.css의 --dur-base 와 같게 유지

let current = null;

function prefersReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * @param {object} options
 * @param {string} options.title                  시트 제목 (화면 읽기 프로그램이 먼저 읽는다)
 * @param {string} options.bodyHtml               제목과 저장 버튼 사이에 들어갈 내용
 * @param {string} [options.saveLabel]            Primary 버튼 문구
 * @param {(sheet: HTMLElement) => void} [options.onMount]  내용이 들어간 직후 이벤트를 연결할 때
 * @param {() => void} options.onSave             저장을 누르면 호출한 뒤 시트를 닫는다
 * @param {() => HTMLElement | null} [options.getReturnFocus]
 */
export function openBottomSheet({ title, bodyHtml, saveLabel = '저장', onMount, onSave, getReturnFocus }) {
  if (current) return current;

  const app = document.querySelector('.app');
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <h2 id="sheet-title" class="sheet__title" tabindex="-1">${title}</h2>
      <div class="sheet__body">${bodyHtml}</div>
      <button class="btn btn--primary" type="button" data-sheet-save>${saveLabel}</button>
    </div>`;

  const sheet = backdrop.querySelector('.sheet');
  const titleEl = sheet.querySelector('#sheet-title');
  let closing = false;

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;

    // 시트 안에서만 Tab이 돌게 한다.
    const items = [...sheet.querySelectorAll('button:not(:disabled)')];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === titleEl)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function close() {
    if (closing) return;
    closing = true;
    backdrop.classList.remove('is-open');
    document.removeEventListener('keydown', onKeydown);

    const finish = () => {
      backdrop.remove();
      app.inert = false;
      document.body.classList.remove('sheet-open');
      current = null;
      getReturnFocus?.()?.focus();
    };
    if (prefersReducedMotion()) finish();
    else setTimeout(finish, CLOSE_MS);
  }

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });
  sheet.querySelector('[data-sheet-save]').addEventListener('click', () => {
    onSave();
    close();
  });

  document.body.append(backdrop);
  document.body.classList.add('sheet-open');
  app.inert = true;
  document.addEventListener('keydown', onKeydown);
  onMount?.(sheet);

  // 다음 프레임에 열림 상태를 켜야 아래에서 올라오는 전환이 보인다.
  requestAnimationFrame(() => {
    backdrop.classList.add('is-open');
    titleEl.focus();
  });

  current = { close, element: sheet };
  return current;
}

/* ───────────────────── ② 여유 시간 정하기 (내용) ───────────────────── */
// 항목 2개를 −/+ 로 조절한다.  1. 공항 도착 여유   2. 입국 후 만남까지 예상 시간
// 조절 중인 값은 임시값이며, "저장"을 눌러야 반영된다. (Esc·바깥 누르기는 저장하지 않고 닫는다.)

const FIELDS = [
  { key: 'airportBufferMin', label: '공항 도착 여유', hint: '미리 도착해 있고 싶은 시간' },
  { key: 'meetupMin', label: '입국 후 만남까지', hint: '비행기 도착 뒤 만나기까지 걸릴 것으로 예상하는 시간' },
];

function stepperHtml({ key, label, hint }, value) {
  return `
    <div class="stepper" data-field="${key}">
      <div class="stepper__text">
        <span class="stepper__label">${label}</span>
        <span class="caption">${hint}</span>
      </div>
      <div class="stepper__controls">
        <button class="stepper__btn" type="button" data-step="-1" aria-label="${label} ${BUFFER_STEP_MIN}분 줄이기">−</button>
        <output class="stepper__value tabular" aria-live="polite">${value}분</output>
        <button class="stepper__btn" type="button" data-step="1" aria-label="${label} ${BUFFER_STEP_MIN}분 늘리기">+</button>
      </div>
    </div>`;
}

/**
 * @param {object} options
 * @param {{airportBufferMin: number, meetupMin: number}} options.current  지금 적용 중인 값(시트를 열 때 먼저 보여 준다)
 * @param {(values: {airportBufferMin: number, meetupMin: number}) => void} options.onSave
 * @param {() => HTMLElement | null} options.getReturnFocus
 */
export function openBufferSheet({ current: values, onSave, getReturnFocus }) {
  const draft = { airportBufferMin: values.airportBufferMin, meetupMin: values.meetupMin };

  const bodyHtml = `
    ${FIELDS.map((field) => stepperHtml(field, draft[field.key])).join('')}
    <p class="caption">이 값은 직접 정하는 설정값이에요. 실제 입국에 걸리는 시간과 다를 수 있어요.</p>`;

  return openBottomSheet({
    title: '여유 시간 정하기',
    bodyHtml,
    onSave: () => onSave({ ...draft }),
    getReturnFocus,
    onMount(sheet) {
      function refresh(row) {
        const value = draft[row.dataset.field];
        row.querySelector('.stepper__value').textContent = `${value}분`;
        row.querySelector('[data-step="-1"]').disabled = value <= BUFFER_MIN_MIN;
        row.querySelector('[data-step="1"]').disabled = value >= BUFFER_MAX_MIN;
      }

      sheet.querySelectorAll('.stepper').forEach((row) => {
        refresh(row);
        row.addEventListener('click', (event) => {
          const button = event.target.closest('[data-step]');
          if (!button || button.disabled) return;
          const key = row.dataset.field;
          const next = draft[key] + Number(button.dataset.step) * BUFFER_STEP_MIN;
          draft[key] = Math.min(BUFFER_MAX_MIN, Math.max(BUFFER_MIN_MIN, next));
          refresh(row);
          // 값이 끝에 닿아 누른 버튼이 비활성이 되면 포커스를 잃지 않도록 반대쪽 버튼으로 옮긴다.
          if (button.disabled) row.querySelector(`[data-step="${-Number(button.dataset.step)}"]`).focus();
        });
      });
    },
  });
}
