// "공유하기": 링크 복사. (DOM 접근은 주입받아 테스트할 수 있게 했다)

// 사용자가 요청한 문구 그대로. (DesignGuide 의 해요체와 다르다. 바꾸려면 이 상수만 고친다)
export const SHARE_COPIED_MESSAGE = '링크가 복사되었습니다';
export const SHARE_FAILED_MESSAGE = '링크를 복사하지 못했어요. 주소창의 주소를 복사해 주세요.';

/**
 * 공유할 링크: 현재 주소에서 해시·쿼리를 뗀 앱 주소.
 * 고른 항공편·출발지는 이 탭의 sessionStorage 에만 있고 주소에 담기지 않으므로, 받는 사람은 항공편 검색부터 시작한다.
 * (개인 정보가 주소에 실리지 않는 장점도 있다)
 * @param {{ origin: string, pathname: string }} location
 */
export function buildShareUrl({ origin, pathname }) {
  return `${origin}${pathname}`;
}

/**
 * 글자를 클립보드에 복사한다. 클립보드 API(https · localhost 에서만 된다)가 막히면 임시 입력칸 복사(execCommand)로 다시 시도한다.
 * 둘 다 안 되면 false. 던지지 않는다.
 * @returns {Promise<boolean>}
 */
export async function copyText(text, { clipboard = globalThis.navigator?.clipboard, doc = globalThis.document } = {}) {
  try {
    if (clipboard?.writeText) {
      await clipboard.writeText(text);
      return true;
    }
  } catch {
    // 권한이 없거나 안전하지 않은 주소: 아래 방법으로 다시 시도한다.
  }
  if (!doc?.body || typeof doc.execCommand !== 'function') return false;
  const field = doc.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.setAttribute('aria-hidden', 'true');
  Object.assign(field.style, { position: 'fixed', top: '0', left: '-9999px', opacity: '0' });
  doc.body.appendChild(field);
  try {
    field.focus();
    field.select();
    return doc.execCommand('copy') === true;
  } catch {
    return false;
  } finally {
    doc.body.removeChild(field);
  }
}
