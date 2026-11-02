// 토스트: 짧은 확인 문구가 화면 아래에 잠깐 떴다 사라진다. (DesignGuide 6장 "토스트", 가정)
// 화면 읽기 프로그램에는 aria-live="polite" 영역으로 한 번 알린다. 포커스를 옮기지 않고, 누를 수 있는 것도 없다.
// 움직임 줄이기가 켜져 있으면 base.css 의 전역 규칙이 전환을 없애 바로 나타났다 사라진다.

export const TOAST_MS = 2400; // 추정값: 문구가 떠 있는 시간. ↑ 올리면 오래 보인다
const LEAVE_MS = 250; // tokens.css 의 --dur-base 와 같게 유지

let timer = null;

function region() {
  let el = document.querySelector('.toast-region');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast-region';
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  return el;
}

/**
 * @param {string} message
 * @param {{ duration?: number }} [options]
 */
export function showToast(message, { duration = TOAST_MS } = {}) {
  clearTimeout(timer);
  const host = region();
  host.replaceChildren(); // 이전 토스트는 바로 치운다. (겹쳐 쌓이지 않는다)

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  host.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible')); // 다음 프레임에 붙여야 나타나는 전환이 재생된다

  timer = setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), LEAVE_MS);
  }, duration);
}
