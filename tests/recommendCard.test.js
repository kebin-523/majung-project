// 추천 카드의 구성: 비행기 티켓 모양(줄무늬 띠 · 구역 · 쪽지), 시간표(출발 → 이동 → 터미널 도착 → 여유 → 만날 수 있는 시각), 합쳐진 추천 문구, 새로고침 버튼.
// DOM 접근 없는 함수만 확인한다. (색·배치는 CSS라 단위 테스트로 확인하지 않는다)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { minutes, toMs } from '../public/js/domain/time.js';
import { renderFlightInfo, renderRecommendCardContent } from '../public/js/ui/components/recommendCard.js';
import { renderTimeline } from '../public/js/ui/components/routeTimeline.js';
import { buildResultViewModel } from '../public/js/ui/screens/result.js';
import { blockNetwork } from './helpers/blockNetwork.js';

blockNetwork();

const NOW = toMs('2026-10-30 14:00');
const buffers = { airportBufferMin: 20, meetupMin: 40 };
const drive = { minutes: 40, distanceKm: 30, fetchedAt: NOW, source: 'kakao' };
const origin = { name: '합정역', address: '서울 마포구 양화로 지하 55' };
const flight = (overrides = {}) => ({
  scheduled: toMs('2026-10-30 21:00'), changed: null, status: 'none', fetchedAt: NOW, receivedAt: NOW, ...overrides,
});
const LATE = toMs('2026-10-30 21:30'); // 추천 시각 20:40 이 이미 지난 때: 말풍선과 상태 태그가 모두 나오는 상태
const vmOf = (overrides = {}) => buildResultViewModel({ flight: flight(), drive, buffers, now: NOW, origin, ...overrides });
const card = (vm) => renderRecommendCardContent({ ...vm, timelineHtml: renderTimeline(vm) });

test('뷰모델: 고른 출발지 이름·주소와 도착지(터미널을 알 때만 터미널 이름)를 담는다', () => {
  const vm = vmOf();
  assert.equal(vm.originName, '합정역');
  assert.equal(vm.originAddress, '서울 마포구 양화로 지하 55');
  assert.equal(vm.destinationText, '인천공항');
  assert.equal(vmOf({ flight: flight({ terminal: { code: 'P01', name: '제1터미널' } }) }).destinationText, '인천공항 제1터미널');
});

test('뷰모델: 출발지 정보가 없으면 null (없는 값을 만들지 않는다)', () => {
  const vm = vmOf({ origin: null });
  assert.equal(vm.originName, null);
  assert.equal(vm.originAddress, null);
  assert.equal(vmOf({ origin: { name: '서울역', address: '' } }).originAddress, null);
});

test('시간표: 출발(이동) → 터미널 도착(도착 후 대기) → 만날 수 있는 시각(비행기 도착 · 입국 후) 순서이고 칩 모양이 없다', () => {
  const html = renderTimeline(vmOf());
  const order = ['합정역', '>자동차 이동<', '인천공항', '>도착 후 대기<', '만날 수 있는 시각', '>비행기 도착<', '>입국 후 만남까지<'].map((text) => html.indexOf(text));
  assert.ok(order.every((index) => index >= 0), String(order));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.ok(html.includes('서울 마포구 양화로 지하 55')); // 출발지를 한 번 더 알아볼 수 있게 주소도 보여 준다
  assert.ok(!html.includes('class="chip') && !html.includes('class="chips"'));
});

test('시간표: 설정값(도착 후 대기 · 입국 후 만남까지)마다 "변경" 글자 버튼이 있고(아이콘 없음), 바텀시트 연결용 data-chip과 읽기용 이름이 있다', () => {
  const html = renderTimeline(vmOf());
  const buttons = [...html.matchAll(/<button class="itinerary__change"([^>]*)>([\s\S]*?)<\/button>/g)];
  assert.equal(buttons.length, 2);
  const [airport, meetup] = buttons;
  assert.ok(airport[1].includes('data-chip="buffer"') && airport[1].includes('data-chip-row="airport"') && airport[1].includes('aria-haspopup="dialog"'));
  assert.ok(airport[1].includes('aria-label="도착 후 대기 20분, 변경하려면 누르세요"'));
  assert.ok(meetup[1].includes('data-chip="buffer"') && meetup[1].includes('data-chip-row="meetup"'));
  assert.ok(meetup[1].includes('aria-label="입국 후 만남까지 40분, 변경하려면 누르세요"'));
  for (const [, , label] of buttons) assert.equal(label.trim(), '변경'); // 앞뒤 아이콘 없이 글자만
  assert.ok(html.includes('aria-label="추천 시각을 계산한 근거"'));
  assert.ok(!html.includes('itinerary__edit') && !html.includes('pencil.svg'));
});

test('시간표: 이동·대기·입국 후 만남은 블록 안쪽 하단(구분선 아래 행)에 있고, 블록 사이에 따로 떠 있는 구간이 없다', () => {
  const html = renderTimeline(vmOf());
  assert.ok(!html.includes('itinerary__leg'));
  const blockOf = (kind) => {
    const body = html.slice(html.indexOf(`itinerary__stop--${kind}`));
    return body.slice(body.indexOf('class="itinerary__block"'), body.indexOf('</li>'));
  };
  const depart = blockOf('depart');
  assert.ok(depart.includes('<dt>자동차 이동</dt>') && depart.includes('>40분<'));
  assert.ok(depart.indexOf('itinerary__when') < depart.indexOf('itinerary__basis'));
  const terminal = blockOf('terminal');
  assert.ok(terminal.includes('<dt>도착 후 대기</dt>') && terminal.includes('>20분<') && terminal.includes('class="itinerary__change"'));
  assert.ok(terminal.indexOf('itinerary__when') < terminal.indexOf('itinerary__basis'));
  const meet = blockOf('meet');
  assert.ok(meet.includes('<dt>비행기 도착</dt>') && meet.includes('<dt>입국 후 만남까지</dt>'));
  assert.equal(depart.split('class="itinerary__basis"').length - 1, 1);
  assert.ok(!depart.includes('data-chip="buffer"')); // 이동 시간은 길찾기로 구한 값이라 설정값 "변경" 버튼이 없다 (출발지 "변경"은 주소 옆에 따로 있다)
});

test('출발 블록: 주소 오른쪽에 출발지 "변경" 버튼이 있다 (글자만, 출발지 설정 화면으로 간다)', () => {
  const html = renderTimeline(vmOf());
  const depart = html.slice(html.indexOf('itinerary__stop--depart'), html.indexOf('itinerary__stop--terminal'));
  const button = depart.match(/<button class="itinerary__change itinerary__change--origin"([^>]*)>([\s\S]*?)<\/button>/);
  assert.ok(button, '출발 블록에 출발지 변경 버튼이 있다');
  assert.equal(button[2].trim(), '변경'); // 아이콘 없이 글자만
  assert.match(button[1], /type="button"/);
  assert.match(button[1], /data-action="change-origin"/);
  assert.match(button[1], /aria-label="출발지 합정역, 변경하려면 누르세요"/);
  assert.ok(!/data-chip/.test(button[1])); // 여유 시간 시트를 여는 버튼과 구분된다
  // 주소 다음에, 블록 안 구분선(딸린 정보 행) 앞에 온다
  assert.ok(depart.indexOf('itinerary__sub') < depart.indexOf('itinerary__change--origin'));
  assert.ok(depart.indexOf('itinerary__change--origin') < depart.indexOf('itinerary__basis'));
});

test('출발 블록: 출발지 "변경" 버튼은 출발 블록에만 있고, 출발지 이름은 이스케이프해 읽기용 이름에 쓴다', () => {
  const html = renderTimeline(vmOf());
  assert.equal(html.split('data-action="change-origin"').length - 1, 1);
  const terminal = html.slice(html.indexOf('itinerary__stop--terminal'));
  assert.ok(!terminal.includes('change-origin'));
  const evil = renderTimeline(vmOf({ origin: { name: '"><img src=x>', address: '' } }));
  assert.ok(!evil.includes('<img'));
  assert.ok(evil.includes('aria-label="출발지 &quot;&gt;&lt;img src=x&gt;, 변경하려면 누르세요"'));
});

test('출발 블록: 출발지가 저장돼 있지 않으면 읽기용 이름은 "출발지"다', () => {
  const html = renderTimeline(vmOf({ origin: null }));
  assert.ok(html.includes('aria-label="출발지, 변경하려면 누르세요"'));
});

test('출발지 "변경" 버튼은 오른쪽 열 아래쪽(주소 줄 높이)에 놓이고 출발 시각과 겹치지 않는다 (CSS)', () => {
  const css = readFileSync(new URL('../public/css/components.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const rule = css.match(/\.itinerary__change--origin \{([^}]*)\}/);
  assert.ok(rule, '출발지 변경 버튼 규칙이 있다');
  assert.match(rule[1], /grid-column: 2/);
  assert.match(rule[1], /grid-row: 2/); // 위(1행)는 출발 시각, 아래(2행)가 주소 줄 높이의 변경 버튼이라 서로 겹치지 않는다
  assert.match(rule[1], /align-self: end/);
  assert.match(css, /\.itinerary__stop--depart \.itinerary__block > \.itinerary__what \{ grid-row: 1 \/ span 2; \}/); // 이름·주소는 두 행에 걸친다
});

test('결과 화면: 하단 "이전" 버튼을 없애고, 출발지 "변경"이 출발지 설정 화면으로 이동한다', () => {
  const source = readFileSync(new URL('../public/js/ui/screens/result.js', import.meta.url), 'utf8');
  assert.ok(!source.includes('id="back-btn"') && !source.includes('#back-btn'));
  assert.ok(!source.includes('text-actions'));
  assert.match(source, /\[data-action="change-origin"\]'\)\) ctx\.navigate\('origin'\)/);
});

test('시간표: 도착 후 대기·입국 후 만남에는 "와 있을 시간" 같은 긴 설명 문구를 쓰지 않는다', () => {
  const html = renderTimeline(vmOf());
  assert.ok(!html.includes('와 있을 시간') && !html.includes('승객이 나오기 전에'));
});

test('시간표: 합계가 맞다 (출발 + 이동 = 터미널 도착, 터미널 도착 + 공항 도착 여유 = 만날 시각 = 비행기 도착 + 입국 후 만남)', () => {
  const vm = vmOf();
  assert.equal(vm.departureMs + minutes(vm.travelMin), vm.terminalArrivalMs);
  assert.equal(vm.terminalArrivalMs + minutes(vm.airportBufferMin), vm.meetAtMs);
  assert.equal(toMs('2026-10-30 21:00') + minutes(vm.meetupMin), vm.meetAtMs);
});

test('뷰모델: 공항 도착 여유와 입국 후 만남을 따로 담고, 만날 수 있는 예상 시각은 비행기 도착 + 입국 후 만남이다', () => {
  const vm = vmOf();
  assert.equal(vm.airportBufferMin, 20);
  assert.equal(vm.meetupMin, 40);
  assert.equal(vm.meetClock, '21:40');
  assert.equal(vm.meetSpoken, '오후 9시 40분');
  assert.equal(vm.bufferTotalMin, undefined); // 두 값을 더한 "여유 합계"는 더 이상 쓰지 않는다
});

test('시간표: 터미널 도착은 비행기 도착보다 늦을 수 있고(입국 후 만남이 더 길 때), 출발 → 터미널 → 만날 시각은 항상 시간 순서다', () => {
  const vm = vmOf();
  const times = [vm.departureMs, vm.terminalArrivalMs, vm.meetAtMs];
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  assert.ok(vm.terminalArrivalMs > toMs('2026-10-30 21:00')); // 21:20 > 비행기 도착 21:00
});

test('시간표: 시각 세 개가 오른쪽 한 줄에 시간 순서로 나온다', () => {
  const html = renderTimeline(vmOf());
  const times = [...html.matchAll(/class="itinerary__time tabular" aria-hidden="true">([^<]+)</g)].map((match) => match[1]);
  assert.deepEqual(times, ['20:40', '21:20', '21:40']); // 출발 → 터미널 도착 → 만날 수 있는 시각
});

test('시간표: 지점마다 원형 아이콘(출발=위치, 터미널 도착=자동차, 만날 수 있는 시각=비행기)이 왼쪽에, 시각은 내용 뒤 오른쪽 열에 있다', () => {
  const html = renderTimeline(vmOf());
  const stops = [...html.matchAll(/<li class="itinerary__stop itinerary__stop--(\w+)">([\s\S]*?)<\/li>/g)];
  assert.deepEqual(stops.map((match) => match[1]), ['depart', 'terminal', 'meet']);
  const iconOf = { depart: 'pin.svg', terminal: 'car.svg', meet: 'plane.svg' };
  for (const [, kind, body] of stops) {
    const badge = body.indexOf('class="itinerary__badge"');
    assert.ok(badge >= 0 && body.includes(iconOf[kind]), kind);
    assert.ok(badge < body.indexOf('class="itinerary__what"'), kind); // 아이콘 → 내용 → 시각 순서
    assert.ok(body.indexOf('class="itinerary__what"') < body.indexOf('class="itinerary__when"'), kind);
  }
  assert.ok(!html.includes('itinerary__dot')); // 점은 원형 아이콘으로 바뀌었다
});

test('시간표: 이동 행에는 자동차 아이콘이 따로 없다 (터미널 도착 원이 자동차)', () => {
  const html = renderTimeline(vmOf());
  const depart = html.slice(html.indexOf('itinerary__stop--depart'), html.indexOf('itinerary__stop--terminal'));
  assert.ok(!depart.includes('car.svg'));
});

test('시간표: 시각마다 화면 읽기용 문구가 따로 있고, 터미널 도착에는 "예상"이 붙는다', () => {
  const html = renderTimeline(vmOf());
  assert.ok(html.includes('<span class="sr-only">오후 8시 40분</span>'));
  assert.ok(html.includes('<span class="sr-only">오후 9시 20분</span>'));
  assert.ok(html.includes('<span class="sr-only">오후 9시 40분</span>'));
  const terminal = html.slice(html.indexOf('itinerary__stop--terminal'), html.indexOf('itinerary__stop--meet'));
  assert.ok(terminal.includes('터미널 도착') && terminal.includes('예상'));
  assert.ok(!terminal.includes('만날')); // 승객을 만나는 시각처럼 읽히지 않게 한다
});

test('시간표: 만날 수 있는 시각 블록은 "예상"이라 쓰고, 근거인 비행기 도착 시각과 입국 후 만남(고칠 수 있는 설정값)을 블록 안의 근거 행으로 묶는다', () => {
  const html = renderTimeline(vmOf());
  const meet = html.slice(html.indexOf('itinerary__stop--meet'));
  assert.ok(meet.replace(/ /g, ' ').includes('만날 수 있는 시각 · 예상')); // 좁은 화면에서 안 끊기도록 줄바꿈 금지 공백을 쓴다
  const basis = meet.slice(meet.indexOf('class="itinerary__basis"'), meet.indexOf('</dl>'));
  assert.ok(basis.includes('<dt>비행기 도착</dt>') && basis.includes('aria-hidden="true">21:00<'));
  assert.ok(basis.includes('<span class="sr-only">오후 9시</span>'));
  assert.ok(basis.includes('<dt>입국 후 만남까지</dt>') && basis.includes('aria-hidden="true">+40분<') && basis.includes('>변경</button>')); // 값 옆의 "변경"이 설정값이라는 뜻을 알린다
  assert.ok(basis.includes('<span class="sr-only">40분</span>'));
  assert.ok(!html.includes('itinerary__stop--arrival'));
  // 근거 줄은 만날 수 있는 시각 블록 안에 있다 (블록 밖에 따로 떠 있지 않다)
  const block = meet.slice(meet.indexOf('class="itinerary__block"'));
  assert.ok(block.indexOf('itinerary__when') < block.indexOf('itinerary__basis'));
});

test('시간표: 지점마다 블록(itinerary__block)으로 묶인다', () => {
  const html = renderTimeline(vmOf());
  const blocks = html.split('class="itinerary__block"').length - 1;
  assert.equal(blocks, 3); // 출발 · 터미널 도착 · 만날 수 있는 시각
  const stops = [...html.matchAll(/<li class="itinerary__stop itinerary__stop--(\w+)">([\s\S]*?)<\/li>/g)];
  for (const [, kind, body] of stops) {
    assert.ok(body.indexOf('class="itinerary__badge"') < body.indexOf('class="itinerary__block"'), `${kind}: 아이콘 원은 블록 밖 왼쪽에 있다`);
    const block = body.slice(body.indexOf('class="itinerary__block"'));
    assert.ok(block.includes('class="itinerary__what"') && block.includes('class="itinerary__when"'), `${kind}: 이름과 시각이 같은 블록 안에 있다`);
  }
  assert.ok(!html.includes('itinerary__leg')); // 구간 줄은 블록 안 행으로 들어갔다
});

test('시간표: 비행기 도착이 다른 날이면 근거 줄의 값에도 날짜가 붙는다', () => {
  const html = renderTimeline(vmOf({ now: toMs('2026-10-30 23:00'), flight: flight({ scheduled: toMs('2026-10-31 02:00'), fetchedAt: toMs('2026-10-30 23:00'), receivedAt: toMs('2026-10-30 23:00') }) }));
  assert.ok(html.includes('aria-hidden="true">내일 02:00<')); // 근거 줄의 비행기 도착 값에도 날짜 라벨
});

test('시간표: 다른 날로 넘어가는 시각에는 날짜 라벨이 시각 위에 붙는다', () => {
  const next = renderTimeline(vmOf({ now: toMs('2026-10-30 23:00'), flight: flight({ scheduled: toMs('2026-10-31 02:00'), fetchedAt: toMs('2026-10-30 23:00'), receivedAt: toMs('2026-10-30 23:00') }) }));
  assert.equal(next.split('class="itinerary__day" aria-hidden="true">내일<').length - 1, 3); // 출발 00:20 · 터미널 01:00 · 비행기 02:00 모두 내일
  assert.ok(!renderTimeline(vmOf()).includes('itinerary__day'));
});

test('시간표: 장소 이름·주소는 이스케이프한다 (외부 데이터)', () => {
  const html = renderTimeline(vmOf({ origin: { name: '<img src=x onerror=alert(1)>', address: 'a & "b"' } }));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('a &amp; &quot;b&quot;'));
});

test('시간표: 출발지 이름이 없으면 "출발지"로 쓰고 주소 줄은 만들지 않는다', () => {
  const depart = (html) => html.slice(html.indexOf('itinerary__stop--depart'), html.indexOf('itinerary__stop--terminal'));
  const without = renderTimeline(vmOf({ origin: null }));
  assert.ok(without.includes('class="itinerary__place">출발지<'));
  assert.ok(!depart(without).includes('itinerary__sub'));
  assert.ok(depart(renderTimeline(vmOf())).includes('서울 마포구 양화로 지하 55'));
});

test('카드: 항적선 그래픽·"출발을 추천해요" 알약·별도 안내 문장 줄이 없다', () => {
  const html = card(vmOf());
  assert.ok(!html.includes('class="trail'));
  assert.ok(!html.includes('<svg'));
  assert.ok(!html.includes('reco__lead'));
  assert.ok(!html.includes('pill-depart'));
  assert.ok(!html.includes('출발을 추천해요')); // 부제 "추천 출발 시간"이 그 뜻을 알려 준다
});

test('카드: 추천 시각 위에 부제 "추천 출발 시간"이 있고, 시각 옆에는 알약·태그가 없다 (어떤 상태에서도)', () => {
  const states = [vmOf(), vmOf({ now: LATE }), vmOf({ hasChange: true }), vmOf({ flight: flight({ fetchedAt: NOW - minutes(30), receivedAt: NOW - minutes(30) }) })];
  for (const vm of states) {
    const html = card(vm);
    const subtitle = html.indexOf('<p class="reco__subtitle">추천 출발 시간</p>');
    const row = html.indexOf('class="reco__time-row"');
    const rowHtml = html.slice(row, html.indexOf('class="route-group"'));
    assert.ok(subtitle >= 0 && subtitle < row, vm.badgeKey);
    assert.ok(rowHtml.includes('class="reco__time '), vm.badgeKey);
    assert.ok(!rowHtml.includes('badge') && !rowHtml.includes('pill'), `${vm.badgeKey}: 시각 옆에 아무것도 없어야 한다`);
    assert.ok(!html.includes('class="badge '), vm.badgeKey);
  }
});

test('카드: 평소 상태("여유 있어요")에는 상태 줄도 태그도 만들지 않는다', () => {
  const vm = vmOf();
  assert.equal(vm.badgeKey, 'relaxed');
  assert.equal(vm.statusText, null);
  const html = card(vm);
  assert.ok(!html.includes('여유 있어요'));
  assert.ok(!html.includes('ticket__status'));
  assert.ok(!html.includes('곧 만나겠네요'));
  assert.ok(html.includes('class="reco__time ')); // 추천 시각은 그대로 있다
});

test('카드: 알려야 하는 상태는 "상태 줄" 하나로 알린다 (지남 · 곧 출발 · 착륙)', () => {
  const cases = [
    [vmOf({ now: LATE }), 'passed', '추천 출발 시각이 지났어요. 이동 시간을 다시 확인해 볼까요?'],
    [vmOf({ now: toMs('2026-10-30 20:00'), flight: flight({ fetchedAt: toMs('2026-10-30 20:00'), receivedAt: toMs('2026-10-30 20:00') }) }), 'soon', '곧 나갈 시간이에요.'], // 추천 시각 20:40 의 40분 전
    [vmOf({ flight: flight({ status: 'touchdown' }) }), 'touchdown', '비행기가 착륙했어요, 입국 절차가 끝나면 만날 수 있어요.'],
  ];
  for (const [vm, kind, text] of cases) {
    assert.equal(vm.statusKind, kind);
    const html = card(vm);
    assert.ok(html.includes(`class="ticket__section ticket__status ticket__status--${kind}`), kind);
    assert.ok(html.includes(`<p class="ticket__status-text">${text}</p>`), kind);
    assert.equal(html.split('class="ticket__status-text"').length - 1, 1, `${kind}: 상태 줄은 하나뿐이다`);
  }
});

test('카드: 같은 말을 두 번 보여 주지 않는다 ("추천 출발 시각이 지났어요"는 카드 전체에서 한 번)', () => {
  const html = card(vmOf({ now: LATE }));
  assert.equal(html.split('추천 출발 시각이 지났어요').length - 1, 1);
});

test('카드: 상태 줄은 아이콘(꾸밈, 화면 읽기에서 숨김) + 문장이고, 상태마다 아이콘이 다르거나 색·문구로 구분한다', () => {
  const passed = card(vmOf({ now: LATE }));
  assert.match(passed, /<span class="ticket__status-icon" aria-hidden="true">[\s\S]*?class="icon"/);
  const touchdown = card(vmOf({ flight: flight({ status: 'touchdown' }) }));
  assert.notEqual(passed.match(/--icon:url\('([^']+)'/)[1], touchdown.match(/--icon:url\('([^']+)'/)[1]); // 지남은 시계, 착륙은 비행기
  assert.ok(!/<(button|a)\b/.test(passed.slice(passed.indexOf('ticket__status'), passed.indexOf('reco__subtitle')))); // 상태 줄 안에는 버튼이 없다
});

test('카드: 도착 변경·최신 정보 확인 못 함은 상태 줄을 만들지 않고, 확인 시각 줄과 변경 안내가 각각 알린다', () => {
  const changed = vmOf({ hasChange: true });
  assert.equal(changed.badgeKey, 'changed');
  assert.ok(!card(changed).includes('ticket__status'));
  const stale = vmOf({ flight: flight({ fetchedAt: NOW - minutes(30), receivedAt: NOW - minutes(30) }) });
  assert.equal(stale.badgeKey, 'stale');
  const html = card(stale);
  assert.ok(!html.includes('ticket__status'));
  assert.ok(html.includes('마지막 확인은 13:30예요.') && html.includes('최신 정보를 확인하지 못했어요')); // 쪽지의 확인 시각 줄
});

test('이동 행에는 "자동차 이동 N분"만 있고 확인 시각 줄은 없다', () => {
  const html = card(vmOf({ drive: { ...drive, fetchedAt: toMs('2026-10-30 18:45') } }));
  const depart = html.slice(html.indexOf('itinerary__stop--depart'), html.indexOf('itinerary__stop--terminal'));
  assert.ok(depart.includes('<dt>자동차 이동</dt>') && depart.includes('>40분<'));
  assert.ok(!depart.includes('확인'));
  assert.ok(!html.includes('18:45 확인'));
  assert.ok(!html.includes('이동 시간은 '));
});

test('카드: 추천 시각은 화면 읽기에 "오후 N시 M분"으로 읽히고, 다른 날이면 날짜 라벨이 함께 보이고 읽힌다', () => {
  const sameDay = card(vmOf()); // 추천 시각 20:40 (오늘)
  assert.match(sameDay, /<span class="sr-only">오후 8시 40분<\/span>/);
  assert.ok(!sameDay.includes('reco__day'));

  // 비행기 도착이 내일 20:00 이면 추천 시각은 내일 19:40 이다. (20:00 + 입국 후 40 − 여유 20 − 이동 40)
  const tomorrow = vmOf({ flight: flight({ scheduled: toMs('2026-10-31 20:00') }) });
  assert.equal(tomorrow.dayText, '내일');
  const html = card(tomorrow);
  assert.ok(html.includes('class="reco__day" aria-hidden="true">내일<'));
  assert.ok(html.includes('<span class="sr-only">내일 오후 7시 40분</span>'));
});

test('카드: 확인 시각 줄 옆에 새로고침 아이콘 버튼이 있고, 확인 중이거나 이동 시간을 다시 확인하는 동안은 막힌다', () => {
  const idle = card(vmOf());
  assert.match(idle, /<button class="icon-btn" type="button" data-action="refresh" aria-label="최신 정보 다시 확인">/);
  assert.ok(!/data-action="refresh"[^>]*disabled/.test(idle));
  assert.ok(/data-action="refresh"[^>]*disabled/.test(card(vmOf({ checking: true }))));
  assert.ok(/data-action="refresh"[^>]*disabled/.test(card(vmOf({ refreshing: true }))));
  // 새로고침 버튼은 확인 시각 줄과 같은 줄(.reco__foot)에 있다
  const html = idle;
  assert.ok(html.indexOf('reco__foot') < html.indexOf('reco__checked') && html.indexOf('reco__checked') < html.indexOf('data-action="refresh"'));
});

test('카드: 구성 순서는 줄무늬 띠 → 상태 줄 → 추천 시각 → 지금 → 시간표 → 쪽지(확인 시각 줄) (상태 줄이 나오는 상태)', () => {
  const html = card(vmOf({ now: LATE }));
  const positions = ['class="ticket__band"', 'ticket__status ', 'class="reco__time ', 'class="itinerary"', 'class="ticket__stub"', 'class="caption reco__checked"'].map((text) => html.indexOf(text));
  assert.ok(positions.every((index) => index >= 0), String(positions));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.ok(html.includes('실제 도착과 교통에 따라 달라질 수 있어요')); // 추정치 안내는 지우지 않는다
});

test('카드: 줄무늬 띠는 장식이라 화면 읽기에서 숨기고 글자가 없다', () => {
  const html = card(vmOf());
  assert.ok(html.includes('<div class="ticket__band" aria-hidden="true"></div>'));
});

test('카드: 확인 시각 줄과 새로고침 버튼은 절취선 아래 쪽지 안에 있다', () => {
  const html = card(vmOf());
  const stub = html.indexOf('class="ticket__stub"');
  assert.ok(stub > html.indexOf('class="route--fields"') || stub > html.indexOf('route--fields'));
  assert.ok(html.indexOf('class="caption reco__checked"') > stub);
  assert.ok(html.indexOf('data-action="refresh"') > stub);
  // 쪽지 위(절취선 윗부분)에는 확인 시각 줄이 없다
  assert.ok(!html.slice(0, stub).includes('reco__checked'));
});

test('카드: 옛 "출발지 ── 공항" 줄과 "여유 | 터미널 도착 | 비행기 도착" 세 칸은 시간표 하나로 합쳐졌다', () => {
  const html = card(vmOf());
  assert.ok(!html.includes('route--fields') && !html.includes('class="route"') && !html.includes('route__field'));
  assert.equal(html.split('class="itinerary"').length - 1, 1);
  assert.equal(html.split('itinerary__stop ').length - 1, 3); // 지점은 출발·터미널 도착·만날 수 있는 시각 셋
});

test('뷰모델: 터미널 도착 예상은 추천 출발 시각 + 이동 시간이고, 거기에 공항 도착 여유를 더하면 만날 수 있는 시각이다', () => {
  const vm = vmOf();
  assert.equal(vm.terminalArrivalMs, vm.departureMs + minutes(40));
  assert.equal(vm.terminalArrivalMs + minutes(vm.airportBufferMin), vm.meetAtMs);
  assert.equal(vm.terminalArrivalText, '21:20');
  assert.equal(vm.terminalArrivalSpoken, '오후 9시 20분');
});

test('뷰모델: 이동 시간이 바뀌면 추천 시각만 움직이고 터미널 도착 예상은 그대로다', () => {
  const longer = vmOf({ drive: { ...drive, minutes: 70 } });
  assert.equal(longer.terminalArrivalMs + minutes(longer.airportBufferMin), longer.meetAtMs);
  assert.equal(longer.terminalArrivalMs, vmOf().terminalArrivalMs); // 비행기 도착과 두 설정값이 같으면 터미널 도착 시각도 같다
  assert.equal(longer.departureMs, vmOf().departureMs - minutes(30));
});

test('뷰모델: 입국 후 만남을 늘리면 터미널 도착과 추천 시각이 함께 늦어지고, 공항 도착 여유를 늘리면 함께 이르러진다', () => {
  const base = vmOf();
  const slowerExit = vmOf({ buffers: { airportBufferMin: 20, meetupMin: 60 } });
  assert.equal(slowerExit.departureMs - base.departureMs, minutes(20));
  assert.equal(slowerExit.terminalArrivalMs - base.terminalArrivalMs, minutes(20));
  const earlierWait = vmOf({ buffers: { airportBufferMin: 40, meetupMin: 40 } });
  assert.equal(base.departureMs - earlierWait.departureMs, minutes(20));
});

test('뷰모델: 터미널 도착 예상이 다른 날이면 날짜 라벨이 붙는다', () => {
  const vm = vmOf({ now: toMs('2026-10-30 23:00'), flight: flight({ scheduled: toMs('2026-10-31 02:00'), fetchedAt: toMs('2026-10-30 23:00'), receivedAt: toMs('2026-10-30 23:00') }) });
  assert.equal(vm.terminalArrivalText, '내일 02:20'); // 비행기 도착 02:00 + 입국 후 40 − 여유 20 = 02:20 (오늘 밤 23:00 기준으로 내일)
});

test('카드: 터미널 도착은 "예상"이라는 말과 함께 보이고, 화면 읽기에도 시각이 따로 읽힌다', () => {
  const html = renderTimeline(vmOf());
  const field = html.slice(html.indexOf('itinerary__stop--terminal'), html.indexOf('itinerary__stop--meet'));
  assert.ok(field.includes('터미널 도착') && field.includes('예상'));
  assert.ok(field.includes('aria-hidden="true">21:20<'));
  assert.ok(field.includes('<span class="sr-only">오후 9시 20분</span>'));
});

// ---------- 선택한 항공편 정보 ----------

const picked = { flightNo: 'VZ850', airline: '타이비엣젯항공', departureCity: '방콕/수완나품' };

test('뷰모델: 선택한 항공편의 편명·항공사·출발 도시·도착 날짜·도착 터미널을 담고, 없는 값은 null', () => {
  const vm = vmOf({ flight: flight({ ...picked, terminal: { code: 'P03', name: '제2터미널' } }) });
  assert.equal(vm.flightNo, 'VZ850');
  assert.equal(vm.airline, '타이비엣젯항공');
  assert.equal(vm.departureCity, '방콕/수완나품');
  assert.equal(vm.flightDateText, '오늘 · 10월 30일');
  assert.equal(vm.terminalName, '제2터미널');
  const bare = vmOf();
  assert.equal(bare.flightNo, null);
  assert.equal(bare.airline, null);
  assert.equal(bare.departureCity, null);
  assert.equal(bare.terminalName, null); // API가 주지 않으면 만들어 내지 않는다
});

const labelsOf = (html) => [...html.matchAll(/<dt>([^<]+)<\/dt>/g)].map((match) => match[1]);
const valueOf = (html, label) => html.match(new RegExp(`<dt>${label}</dt>\\s*<dd>([^<]*)</dd>`))?.[1];
const withTerminal = { ...picked, terminal: { code: 'P03', name: '제2터미널' } };

test('항공편 정보(하단): 편명 · 항공사 · 출발 도시 · 도착 날짜 · 비행기 도착 · 도착 터미널을 라벨 위/값 아래 목록으로 보여 준다', () => {
  const html = renderFlightInfo(vmOf({ flight: flight(withTerminal) }));
  assert.ok(html.includes('role="group" aria-label="선택한 항공편"'));
  assert.deepEqual(labelsOf(html), ['편명', '항공사', '출발 도시', '도착 날짜', '비행기 도착', '도착 터미널']);
  assert.equal(valueOf(html, '편명'), 'VZ850');
  assert.equal(valueOf(html, '항공사'), '타이비엣젯항공');
  assert.equal(valueOf(html, '출발 도시'), '방콕/수완나품');
  assert.equal(valueOf(html, '도착 날짜'), '오늘 · 10월 30일');
  assert.equal(valueOf(html, '도착 터미널'), '제2터미널');
  assert.ok(!html.includes('출발지')); // 사용자의 출발지와 헷갈리지 않게 "출발 도시"라고 쓴다
  // 비행기 도착 시각: 눈에는 24시간제 숫자, 화면 읽기에는 읽기용 문구 (기준 시각 21:00)
  const arrival = html.match(/<dt>비행기 도착<\/dt>\s*<dd>([\s\S]*?)<\/dd>/)[1];
  assert.ok(arrival.includes('<span aria-hidden="true">21:00</span>') && arrival.includes('<span class="sr-only">오후 9시</span>'));
});

test('항공편 정보(하단): 값이 없는 항목은 만들지 않는다 (도착 터미널은 API가 준 편만)', () => {
  assert.equal(renderFlightInfo(vmOf()), '');
  const onlyNo = renderFlightInfo(vmOf({ flight: flight({ flightNo: 'LJ202' }) }));
  assert.deepEqual(labelsOf(onlyNo), ['편명', '도착 날짜', '비행기 도착']);
  const noTerminal = renderFlightInfo(vmOf({ flight: flight(picked) }));
  assert.ok(!labelsOf(noTerminal).includes('도착 터미널'));
  const onlyTerminal = renderFlightInfo(vmOf({ flight: flight({ terminal: { code: 'P01', name: '제1터미널' } }) }));
  assert.deepEqual(labelsOf(onlyTerminal), ['도착 날짜', '비행기 도착', '도착 터미널']);
  assert.ok(!card(vmOf()).includes('ticket__flight'));
});

test('항공편 정보(하단): 추천 시각 영역 아래, 시간표 위에 있고 윗 선이 있는 일반 구역이다', () => {
  const html = card(vmOf({ flight: flight(withTerminal), now: LATE }));
  const order = ['class="ticket__band"', 'ticket__status ', 'class="reco__time ', 'ticket__flight"', 'class="itinerary"'].map((text) => html.indexOf(text));
  assert.ok(order.every((index) => index >= 0) && order.every((index, i) => i === 0 || index > order[i - 1]), String(order));
  assert.ok(!/ticket__flight[^"]*ticket__section--first/.test(html) && !/ticket__section--first[^"]*ticket__flight/.test(html));
});

test('윗 선이 없는 "맨 위 구역"은 상태 줄 → 추천 시각 순으로 가장 위에 있는 구역 하나뿐이다', () => {
  const first = (html) => html.split('ticket__section--first').length - 1;
  const quiet = card(vmOf()); // 상태 줄이 없다
  assert.equal(first(quiet), 1);
  assert.ok(quiet.includes('class="ticket__section ticket__hero ticket__section--first"'));

  const statusOnly = card(vmOf({ now: LATE })); // 상태 줄이 있다
  assert.equal(first(statusOnly), 1);
  assert.match(statusOnly, /ticket__status--passed ticket__section--first/);
  assert.ok(statusOnly.includes('class="ticket__section ticket__hero"')); // 추천 시각 구역에는 윗 선이 있다

  const withInfo = card(vmOf({ flight: flight(picked) })); // 항공편 정보는 맨 위 구역이 아니다
  assert.equal(first(withInfo), 1);
  assert.ok(withInfo.includes('class="ticket__section ticket__hero ticket__section--first"'));
});

test('항공편 정보(하단): 외부 데이터는 이스케이프한다', () => {
  const html = renderFlightInfo(vmOf({ flight: flight({ flightNo: 'A<b>1', airline: '<i>x</i>', departureCity: '"도시" & 1', terminal: { code: 'P01', name: '<u>제1</u>' } }) }));
  assert.ok(!html.includes('<b>') && !html.includes('<i>') && !html.includes('<u>'));
  assert.ok(html.includes('A&lt;b&gt;1') && html.includes('&lt;i&gt;x&lt;/i&gt;') && html.includes('&lt;u&gt;제1&lt;/u&gt;'));
  assert.ok(html.includes('&quot;도시&quot; &amp; 1'));
});

// ---------- 상단: 추천 출발 · 이동 픽토그램 · 만날 수 있는 시각 ----------

test('상단: 왼쪽 추천 출발 시각, 가운데 점선, 오른쪽 예상 만남 시각 순서다', () => {
  const html = card(vmOf());
  const hero = html.slice(html.indexOf('ticket__hero'), html.indexOf('class="route-group"'));
  const order = ['class="reco__subtitle"', 'class="reco__time ', 'class="reco__route-line"', 'class="reco__meet-label"', 'class="reco__meet-time '].map((text) => hero.indexOf(text));
  assert.ok(order.every((index) => index >= 0), String(order));
  // 라벨 둘 다 시각보다 앞, 추천 출발 시각 → 픽토그램 → 만날 수 있는 시각
  assert.ok(order[0] < order[1] && order[1] < order[2] && order[2] < order[4], String(order));
  assert.ok(order[3] < order[4]);
});

test('상단: 가운데에는 아이콘 없이 점선만 있고, 꾸밈이라 화면 읽기에서 숨긴다', () => {
  const html = card(vmOf());
  const line = html.match(/<span class="reco__route-line"([^>]*)><\/span>/);
  assert.ok(line, '점선 요소는 내용이 비어 있다');
  assert.ok(line[1].includes('aria-hidden="true"'));
  const hero = html.slice(html.indexOf('ticket__hero'), html.indexOf('class="route-group"'));
  assert.ok(!hero.includes('car.svg') && !hero.includes('class="icon"')); // 상단에는 아이콘이 없다
  assert.ok(!html.includes('reco__route-icon') && !html.includes('reco__route-pin'));
});

test('상단: 점선은 두 시각 사이 남은 폭을 모두 차지한다 (CSS)', () => {
  const css = readFileSync(new URL('../public/css/components.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const rule = css.match(/\.reco__route-line \{([^}]*)\}/);
  assert.ok(rule && /grid-column: 2/.test(rule[1]) && /border-top: var\(--line-trail\) dotted/.test(rule[1]));
  assert.ok(/grid-template-columns: auto minmax\(0, 1fr\) auto/.test(css)); // 가운데 칸이 남은 폭(1fr)
});

test('상단: 오른쪽 라벨은 6자 이내라 줄바꿈되지 않고 "예상"을 함께 쓴다', () => {
  const html = card(vmOf());
  const label = html.match(/<p class="reco__meet-label">([^<]*)<\/p>/)[1];
  assert.equal(label, '예상 만남');
  assert.ok([...label].length <= 6);
  assert.ok(label.includes('예상'));
  assert.ok(!label.includes('만날 수 있는'));
  assert.ok(!html.includes('reco__meet-label') || !/&nbsp;|\u00a0/.test(label)); // 줄바꿈 금지 공백으로 억지로 묶지 않아도 될 만큼 짧다
});

test('상단: 만날 시각은 24시간제 숫자와 화면 읽기용 문구("만날 수 있는 시각 예상 …")가 따로 있다', () => {
  const html = card(vmOf());
  assert.ok(html.includes('class="reco__meet-time tabular" aria-hidden="true">21:40<'));
  assert.ok(html.includes('<span class="sr-only">만날 수 있는 시각 예상 오후 9시 40분</span>'));
});

test('상단: 만날 수 있는 시각이 다른 날이면 날짜 라벨이 시각 위에 붙는다', () => {
  const next = card(vmOf({ now: toMs('2026-10-30 23:00'), flight: flight({ scheduled: toMs('2026-10-31 02:00'), fetchedAt: toMs('2026-10-30 23:00'), receivedAt: toMs('2026-10-30 23:00') }) }));
  assert.ok(next.includes('class="reco__meet-day" aria-hidden="true">내일<'));
  assert.ok(!card(vmOf()).includes('reco__meet-day'));
});

test('상단: 두 시각은 같은 타이포 크기다 — 한 CSS 규칙을 함께 쓰고, 56px(--fs-time)를 상한으로 폭에 맞춰 같이 줄어든다', () => {
  const css = readFileSync(new URL('../public/css/components.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const tokens = readFileSync(new URL('../public/css/tokens.css', import.meta.url), 'utf8');
  assert.match(tokens, /--fs-time: 56px;/);
  const rule = css.match(/\.reco__time,\s*\.reco__meet-time \{([^}]*)\}/);
  assert.ok(rule, '두 시각이 같은 규칙을 쓴다');
  assert.ok(/font-size: min\(var\(--fs-time\), /.test(rule[1]), '56px를 넘지 않고 폭에 맞춰 줄어든다');
  assert.ok(/100cqw/.test(rule[1]), '상단 줄의 폭(컨테이너)을 기준으로 한다');
  assert.ok(/font-weight: 700/.test(rule[1]));
  assert.ok(/container-type: inline-size/.test(css.match(/\.reco__route \{([^}]*)\}/)[1]));
  assert.ok(!/(^|\})\s*\.reco__meet-time \{/.test(css)); // 앞 규칙이 끝난 뒤 따로 시작하는 만날 시각 전용 규칙이 없다 (선택자 목록의 둘째 줄은 해당 없음)
  const html = card(vmOf());
  assert.ok(html.includes('class="reco__time tabular"') && html.includes('class="reco__meet-time tabular"'));
});

// ---------- "지금" 줄(현재 시각 · 출발까지 남은 시간)은 없다 ----------

test('카드: 현재 시각과 출발까지 남은 시간 안내 영역이 없다 (사용자 요청으로 뺐다)', () => {
  const vm = vmOf();
  assert.equal(vm.nowText, undefined);
  assert.equal(vm.untilText, undefined);
  for (const html of [card(vm), card(vmOf({ now: LATE }))]) {
    assert.ok(!html.includes('reco__now') && !html.includes('reco__until'));
    assert.ok(!html.includes('출발까지') && !html.includes('>지금<'));
  }
});

test('카드: 추천 출발 시각이 지났다는 안내는 상태 줄 하나로만 알린다 (남은 시간 줄 없이도)', () => {
  const html = card(vmOf({ now: LATE }));
  assert.ok(html.includes('추천 출발 시각이 지났어요. 이동 시간을 다시 확인해 볼까요?'));
  assert.equal(html.split('추천 출발 시각이 지났어요').length - 1, 1);
  assert.ok(!html.includes('분 지났어요')); // "N분 지났어요" 같은 경과 시간 문구는 없다
});
