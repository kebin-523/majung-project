// 외부 데이터(편명·도시·주소 등)를 HTML에 넣을 때 쓰는 이스케이프. 템플릿에 값을 넣기 전에 반드시 거친다.
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ENTITIES[ch]);
}
