// 시간표: 추천 시각이 어떻게 나왔는지를 "시간이 흐르는 순서"로 보여 준다. (DesignGuide 6장 "시간표")
// 지점마다 블록 하나로 묶고, 그 지점에 딸린 정보는 블록 안쪽 아래 구분선 밑에 행으로 둔다. 블록 사이에는 선만 있다.
//   (📍) ┌ 출발                      20:40 ┐
//    │   │ 합정역                          │
//    │   │ 서울 마포구 …                   │
//    │   │ ─────────────────────────────── │
//    │   │ 자동차 이동              40분   │  ← 출발에 딸린 정보: 걸리는 시간 (실선으로 이어진다)
//    │   └─────────────────────────────────┘
//   (🚗) ┌ 터미널 도착 · 예상         21:20 ┐
//    ┊   │ 인천공항 제2터미널              │
//    ┊   │ ─────────────────────────────── │
//    ┊   │ 도착 후 대기        20분  변경  │  ← 설정값. "변경"을 누르면 바텀시트가 열린다 (점선으로 이어진다)
//    ┊   └─────────────────────────────────┘
//   (✈) ┌ 만날 수 있는 시각 · 예상    21:40 ┐
//        │ ─────────────────────────────── │
//        │ 비행기 도착              21:00  │  ← 근거
//        │ 입국 후 만남까지   +40분  변경  │  ← 설정값
//        └─────────────────────────────────┘
// 합계가 맞다: 추천 출발 시각 + 이동 = 터미널 도착(예상), 터미널 도착 + 도착 후 대기 = 만날 수 있는 시각 = 비행기 도착 + 입국 후 만남.
// 터미널 도착은 비행기 도착보다 늦을 수도 있다. (입국 후 만남이 도착 후 대기보다 길면)
// "만날 수 있는 시각"은 설정값으로 계산한 예상이다. 입국 처리 시간이나 승객이 나오는 시각을 실시간 정보처럼 보이지 않는다.
import { escapeHtml } from '../html.js';
import { icon } from './icon.js';

const NB = ' '; // 줄바꿈 금지 공백

/** 지점 하나: 블록 밖 왼쪽에 원형 아이콘, 블록 안에 종류 라벨 · (이름) · (주소) · 오른쪽 시각(날짜 라벨이 있으면 위에) · (딸린 정보 행) */
function stop(kind, iconName, { day, clock, spoken, label, place, sub, basis = '' }) {
  return `
        <li class="itinerary__stop itinerary__stop--${kind}">
          <span class="itinerary__badge" aria-hidden="true">${icon(iconName)}</span>
          <div class="itinerary__block">
            <span class="itinerary__what">
              <span class="itinerary__kind">${label}</span>
              ${place ? `<span class="itinerary__place">${escapeHtml(place)}</span>` : ''}
              ${sub ? `<span class="itinerary__sub">${escapeHtml(sub)}</span>` : ''}
            </span>
            <span class="itinerary__when">
              ${day ? `<span class="itinerary__day" aria-hidden="true">${day}</span>` : ''}
              <span class="itinerary__time tabular" aria-hidden="true">${clock}</span>
              <span class="sr-only">${spoken}</span>
            </span>${basis}
          </div>
        </li>`;
}

/** 딸린 정보 행 하나: 라벨(dt) · 값(dd). 눈에는 value, 화면 읽기에는 spoken. */
function basisRow(label, value, spoken) {
  return `
              <div class="itinerary__basis-row">
                <dt>${label}</dt>
                <dd><span aria-hidden="true">${value}</span><span class="sr-only">${spoken}</span></dd>
              </div>`;
}

/**
 * 설정값 행: 값 옆에 "변경" 글자 버튼. 누르면 "여유 시간 정하기" 바텀시트가 열린다. (연결: screens/result.js)
 * 아이콘 없이 글자만 둔다. 값을 고칠 수 있다는 것이 "변경"이라는 말로 바로 읽힌다.
 * @param {'airport'|'meetup'} row  어느 행의 버튼인가 (시트를 닫을 때 같은 버튼으로 포커스를 돌려주려고 구분한다)
 */
function settingRow(label, value, spoken, row) {
  return `
              <div class="itinerary__basis-row">
                <dt>${label}</dt>
                <dd><span aria-hidden="true">${value}</span><span class="sr-only">${spoken}</span><button class="itinerary__change" type="button" data-chip="buffer" data-chip-row="${row}" aria-haspopup="dialog" aria-label="${label} ${spoken}, 변경하려면 누르세요">변경</button></dd>
              </div>`;
}

const basisList = (rows) => `
            <dl class="itinerary__basis">${rows}
            </dl>`;

/**
 * @param {object} vm
 * @param {string|null} [vm.originName]      사용자가 고른 출발지 이름 (없으면 "출발지")
 * @param {string|null} [vm.originAddress]   출발지 주소 (없으면 줄을 만들지 않는다)
 * @param {string} vm.destinationText        "인천공항 제1터미널" / 터미널을 모르면 "인천공항"
 * @param {number} vm.travelMin              이동 시간(분). 출발 블록 아래 행에 "자동차 이동"으로 보여 준다
 * @param {number} vm.airportBufferMin       공항 도착 여유(분) = 터미널에 도착해 승객이 나올 때까지 기다릴 시간. 터미널 도착 블록 아래 행에 "도착 후 대기"로 보여 주고 "변경"으로 고친다
 * @param {number} vm.meetupMin              입국 후 만남까지 예상 시간(분): 비행기 도착 뒤 승객을 만나기까지 (만날 수 있는 시각 블록의 근거 행, "변경"으로 고친다)
 * @param {string} vm.timeText               추천 출발 시각 "19:20"
 * @param {string} vm.timeSpoken             "오후 7시 20분"
 * @param {string|null} vm.departureDay      추천 출발 시각의 날짜 라벨 ("내일" 등, 지금과 같은 날이면 null)
 * @param {string} vm.terminalArrivalClock   내가 터미널에 도착할 예상 시각 "20:00" (추천 출발 시각 + 이동 시간)
 * @param {string} vm.terminalArrivalSpoken  "오후 8시" (날짜 라벨이 있으면 "내일 오전 1시")
 * @param {string|null} vm.terminalArrivalDay
 * @param {string} vm.meetClock              승객을 만날 수 있을 예상 시각 "21:40" (비행기 도착 + 입국 후 만남까지)
 * @param {string} vm.meetSpoken             "오후 9시 40분" (날짜 라벨이 있으면 "내일 오전 2시 40분")
 * @param {string|null} vm.meetDay
 * @param {string} vm.arrivalClock           비행기 도착 시각 "21:00" (만날 수 있는 시각의 근거 행)
 * @param {string} vm.arrivalSpoken
 * @param {string|null} vm.arrivalDay
 */
export function renderTimeline(vm) {
  const arrivalValue = `${vm.arrivalDay ? `${vm.arrivalDay} ` : ''}${vm.arrivalClock}`;
  return `
    <div class="route-group" role="group" aria-label="추천 시각을 계산한 근거">
      <ol class="itinerary">${stop('depart', 'pin', {
    day: vm.departureDay,
    clock: vm.timeText,
    spoken: `${vm.departureDay ? `${vm.departureDay} ` : ''}${vm.timeSpoken}`,
    label: '출발',
    place: vm.originName || '출발지',
    sub: vm.originAddress,
    basis: basisList(basisRow('자동차 이동', `${vm.travelMin}분`, `${vm.travelMin}분`)),
  })}${stop('terminal', 'car', {
    day: vm.terminalArrivalDay,
    clock: vm.terminalArrivalClock,
    spoken: vm.terminalArrivalSpoken,
    label: `터미널 도착${NB}·${NB}예상`, // 좁은 화면에서 "· 예상"만 따로 줄바꿈되지 않게 줄바꿈 금지 공백으로 묶는다
    place: vm.destinationText,
    basis: basisList(settingRow('도착 후 대기', `${vm.airportBufferMin}분`, `${vm.airportBufferMin}분`, 'airport')),
  })}${stop('meet', 'plane', {
    day: vm.meetDay,
    clock: vm.meetClock,
    spoken: vm.meetSpoken,
    label: `만날 수 있는 시각${NB}·${NB}예상`,
    basis: basisList(`${basisRow('비행기 도착', arrivalValue, vm.arrivalSpoken)}${settingRow('입국 후 만남까지', `+${vm.meetupMin}분`, `${vm.meetupMin}분`, 'meetup')}`),
  })}
      </ol>
    </div>`;
}
