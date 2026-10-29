// 저장 담당 단일 모듈. 저장 위치를 바꿀 때는 이 파일만 고친다.
// 현재는 sessionStorage에 저장한다. (탭을 닫으면 지워진다. 서버·localStorage에는 저장하지 않는다.)
// 저장소를 쓸 수 없는 환경(시크릿 모드 등)에서는 메모리로만 동작한다.

const KEY = 'majung:v1';

let memory = {};

function storage() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** 저장된 상태를 돌려준다. 없거나 읽을 수 없으면 빈 객체. */
export function load() {
  const s = storage();
  if (s) {
    try {
      const raw = s.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // 읽기 실패·깨진 값이면 메모리 값으로 대체한다.
    }
  }
  return structuredClone(memory);
}

/** 상태 전체를 저장한다. (일부만 바꿀 때는 save({ ...load(), 바꿀값 })) */
export function save(state) {
  memory = structuredClone(state);
  const s = storage();
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify(state));
  } catch {
    // 저장 공간 부족 등: 메모리에는 남아 있으므로 현재 탭에서는 계속 동작한다.
  }
}

/** 저장된 내용을 모두 지운다. */
export function clear() {
  memory = {};
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(KEY);
  } catch {
    // 무시
  }
}
