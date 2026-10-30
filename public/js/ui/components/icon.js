// 선형 아이콘. SVG 파일을 마스크로 써서 글자색(currentColor)을 따라가게 한다.
// 아이콘은 글자와 함께 쓰므로 화면 읽기 프로그램에서는 숨긴다. (크기는 20 / 24 / 32만)

const SIZES = [20, 24, 32];
const NAMES = ['plane', 'car', 'clock', 'pencil', 'check', 'info', 'pin'];

// CSS 변수 안의 상대 경로 url()은 변수를 '쓰는' CSS 파일(css/components.css) 기준으로 해석되어
// css/assets/icons/... 를 찾게 된다. 그래서 이 파일 위치 기준의 절대 주소를 만들어 쓴다.
const ICON_BASE = new URL('../../../assets/icons/', import.meta.url);

/** @param {'plane'|'car'|'clock'|'pencil'|'check'|'info'|'pin'} name */
export function icon(name, size = 20) {
  if (!NAMES.includes(name)) throw new RangeError(`없는 아이콘이에요: ${name}`);
  if (!SIZES.includes(size)) throw new RangeError(`아이콘 크기는 ${SIZES.join('/')}만 쓸 수 있어요: ${size}`);
  const href = new URL(`${name}.svg`, ICON_BASE).href;
  return `<span class="icon" style="--icon:url('${href}');--icon-size:${size}px" aria-hidden="true"></span>`;
}
