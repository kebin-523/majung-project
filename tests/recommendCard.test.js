// 추천 카드의 구성: 비행기 티켓 모양(줄무늬 띠 · 구역 · 쪽지), 근거(출발지 → 이동 → 공항 → 여유 → 비행기 도착), 합쳐진 추천 문구, 새로고침 버튼.
// DOM 접근 없는 함수만 확인한다. (색·배치는 CSS라 단위 테스트로 확인하지 않는다)
import test from 'node:test';
import assert from 'node:assert/strict';
import { minutes, toMs } from '../public/js/domain/time.js';
import { renderFlightHeader, renderRecommendCardContent } from '../public/js/ui/components/recommendCard.js';
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
const LATE = toMs('2026-10-30 21:30'); // 추천 시각 19:20 이 이미 지난 때: 말풍선과 상태 태그가 모두 나오는 상태
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

test('타임라인: 출발지 → 이동 → 공항 → 여유 → 비행기 도착 순서이고 칩 모양이 없다', () => {
  const html = renderTimeline(vmOf());
  const order = ['합정역', '이동 40분', '자동차 기준', '인천공항', '>여유<', '>60분<', '비행기 도착'].map((text) => html.indexOf(text));
  assert.ok(order.every((index) => index >= 0), String(order));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.ok(html.includes('서울 마포구 양화로 지하 55')); // 출발지를 한 번 더 알아볼 수 있게 주소도 보여 준다
  assert.ok(!html.includes('class="chip'));
  assert.ok(!html.includes('class="chips"'));
});

test('타임라인: 여유 구간은 수정 버튼(바텀시트 연결용 data-chip, 읽기용 이름)이고 비행기 도착 시각은 읽기용 문구가 따로 있다', () => {
  const html = renderTimeline(vmOf());
  assert.match(html, /<button class="route__edit"[^>]*data-chip="buffer"[^>]*aria-haspopup="dialog"/);
  assert.ok(html.includes('aria-label="여유 시간 60분, 수정하려면 누르세요"'));
  assert.ok(html.includes('aria-hidden="true">21:00<'));
  assert.ok(html.includes('<span class="sr-only">오후 9시</span>'));
  assert.ok(html.includes('aria-label="추천 시각을 계산한 근거"'));
});

test('타임라인: 합계가 맞다 (추천 출발 시각 + 이동 + 여유 = 비행기 도착)', () => {
  const vm = vmOf();
  assert.equal(vm.departureMs + minutes(vm.travelMin) + minutes(vm.bufferTotalMin), toMs('2026-10-30 21:00'));
});

test('타임라인: 장소 이름·주소는 이스케이프한다 (외부 데이터)', () => {
  const html = renderTimeline(vmOf({ origin: { name: '<img src=x onerror=alert(1)>', address: 'a & "b"' } }));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('a &amp; &quot;b&quot;'));
});

test('타임라인: 출발지 이름이 없으면 "출발지"로 쓰고 주소 줄은 만들지 않는다', () => {
  const stopFrom = (html) => html.slice(html.indexOf('route__stop--from'), html.indexOf('route__leg'));
  const without = renderTimeline(vmOf({ origin: null }));
  assert.ok(without.includes('class="route__place">출발지<'));
  assert.ok(!stopFrom(without).includes('route__sub'));
  assert.ok(stopFrom(renderTimeline(vmOf())).includes('서울 마포구 양화로 지하 55'));
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
    [vmOf({ now: toMs('2026-10-30 18:40'), flight: flight({ fetchedAt: toMs('2026-10-30 18:40'), receivedAt: toMs('2026-10-30 18:40') }) }), 'soon', '곧 나갈 시간이에요.'], // 추천 시각 19:20 의 40분 전
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

test('이동 구간에는 "이동 N분 / 자동차 기준"만 있고 확인 시각 줄은 없다', () => {
  const html = card(vmOf({ drive: { ...drive, fetchedAt: toMs('2026-10-30 18:45') } }));
  const leg = html.slice(html.indexOf('class="route__leg"'), html.indexOf('</li>', html.indexOf('class="route__leg"')));
  assert.ok(leg.includes('이동 40분') && leg.includes('자동차 기준'));
  assert.ok(!leg.includes('확인'));
  assert.ok(!html.includes('18:45 확인'));
  assert.ok(!html.includes('reco__travel-checked'));
  assert.ok(!html.includes('이동 시간은 '));
});

test('카드: 추천 시각은 화면 읽기에 "오후 N시 M분"으로 읽히고, 다른 날이면 날짜 라벨이 함께 보이고 읽힌다', () => {
  const sameDay = card(vmOf()); // 추천 시각 19:20 (오늘)
  assert.match(sameDay, /<span class="sr-only">오후 7시 20분<\/span>/);
  assert.ok(!sameDay.includes('reco__day'));

  // 비행기 도착이 내일 20:00 이면 추천 시각은 내일 18:20 이다.
  const tomorrow = vmOf({ flight: flight({ scheduled: toMs('2026-10-31 20:00') }) });
  assert.equal(tomorrow.dayText, '내일');
  const html = card(tomorrow);
  assert.ok(html.includes('class="reco__day" aria-hidden="true">내일<'));
  assert.ok(html.includes('<span class="sr-only">내일 오후 6시 20분</span>'));
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

test('카드: 구성 순서는 줄무늬 띠 → 상태 줄 → 추천 시각 → 근거 → 쪽지(확인 시각 줄) (상태 줄이 나오는 상태)', () => {
  const html = card(vmOf({ now: LATE }));
  const positions = ['class="ticket__band"', 'ticket__status ', 'class="reco__time ', 'class="route"', 'class="ticket__stub"', 'class="caption reco__checked"'].map((text) => html.indexOf(text));
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

test('카드: 항공권의 칸 나누기처럼 "여유", "터미널 도착", "비행기 도착"이 아래 한 줄의 세 칸이다', () => {
  const html = card(vmOf());
  const fields = html.slice(html.indexOf('route--fields'));
  assert.equal(fields.split('class="route__field').length - 1, 3);
  const order = ['data-chip="buffer"', '터미널 도착', '비행기 도착'].map((text) => fields.indexOf(text));
  assert.ok(order.every((index) => index >= 0), String(order));
  assert.deepEqual(order, [...order].sort((a, b) => a - b)); // 여유 → 터미널 도착 → 비행기 도착
});


// ---------- 터미널 도착 (예상) ----------

test('뷰모델: 터미널 도착 예상은 추천 출발 시각 + 이동 시간이고, 거기에 여유를 더하면 비행기 도착이다', () => {
  const vm = vmOf();
  assert.equal(vm.terminalArrivalMs, vm.departureMs + minutes(40));
  assert.equal(vm.terminalArrivalMs + minutes(vm.bufferTotalMin), toMs('2026-10-30 21:00'));
  assert.equal(vm.terminalArrivalText, '20:00');
  assert.equal(vm.terminalArrivalSpoken, '오후 8시');
});

test('뷰모델: 이동 시간이 바뀌면 터미널 도착 예상도 바뀐다 (추천 시각은 반대로 움직여 합계는 그대로)', () => {
  const longer = vmOf({ drive: { ...drive, minutes: 70 } });
  assert.equal(longer.terminalArrivalMs + minutes(longer.bufferTotalMin), toMs('2026-10-30 21:00'));
  assert.equal(longer.terminalArrivalMs, vmOf().terminalArrivalMs); // 비행기 도착과 여유가 같으면 터미널 도착 시각도 같다
  assert.equal(longer.departureMs, vmOf().departureMs - minutes(30));
});

test('뷰모델: 터미널 도착 예상이 다른 날이면 날짜 라벨이 붙는다', () => {
  const vm = vmOf({ now: toMs('2026-10-30 23:00'), flight: flight({ scheduled: toMs('2026-10-31 02:00'), fetchedAt: toMs('2026-10-30 23:00'), receivedAt: toMs('2026-10-30 23:00') }) });
  assert.equal(vm.terminalArrivalText, '내일 01:00'); // 비행기 도착 02:00 - 여유 60분 = 01:00 (오늘 밤 23:00 기준으로 내일)
});

test('카드: 터미널 도착은 "예상"이라는 말과 함께 보이고, 화면 읽기에도 "예상"이 붙는다', () => {
  const html = renderTimeline(vmOf());
  const field = html.slice(html.indexOf('route__field--terminal'), html.indexOf('route__field--arrival'));
  assert.ok(field.includes('터미널 도착'));
  assert.ok(field.includes('aria-hidden="true">20:00<'));
  assert.ok(field.includes('aria-hidden="true">예상<'));
  assert.ok(field.includes('<span class="sr-only">예상 오후 8시</span>'));
  assert.ok(!field.includes('만날')); // 승객을 만나는 시각처럼 읽히지 않게 한다
});

// ---------- 선택한 항공편 정보 ----------

const picked = { flightNo: 'VZ850', airline: '타이비엣젯항공', departureCity: '방콕/수완나품' };

test('뷰모델: 선택한 항공편의 편명·항공사·출발 도시와 도착 날짜를 담고, 없는 값은 null', () => {
  const vm = vmOf({ flight: flight(picked) });
  assert.equal(vm.flightNo, 'VZ850');
  assert.equal(vm.airline, '타이비엣젯항공');
  assert.equal(vm.departureCity, '방콕/수완나품');
  assert.equal(vm.flightDateText, '오늘 · 10월 30일');
  const bare = vmOf();
  assert.equal(bare.flightNo, null);
  assert.equal(bare.airline, null);
  assert.equal(bare.departureCity, null);
});

test('항공편 정보 칸: 왼쪽 편명·항공사, 오른쪽 "도시 출발"과 "날짜 도착"이고 카드 맨 위(상태 줄 앞)에 있다', () => {
  const html = card(vmOf({ flight: flight(picked), now: LATE }));
  assert.ok(html.includes('role="group" aria-label="선택한 항공편"'));
  assert.ok(html.includes('class="ticket__flight-no">VZ850<'));
  assert.ok(html.includes('타이비엣젯항공'));
  assert.ok(html.includes('방콕/수완나품 출발'));
  assert.ok(html.includes('오늘 · 10월 30일 도착'));
  const order = ['class="ticket__band"', 'ticket__flight"', 'ticket__status '].map((text) => html.indexOf(text));
  assert.ok(order.every((index) => index >= 0) && order[0] < order[1] && order[1] < order[2], String(order));
});

test('항공편 정보 칸: 값이 없는 항목은 만들지 않고, 보여 줄 값이 하나도 없으면 칸이 없다', () => {
  assert.equal(renderFlightHeader(vmOf()), '');
  assert.ok(!card(vmOf()).includes('ticket__flight'));
  const onlyNo = renderFlightHeader(vmOf({ flight: flight({ flightNo: 'LJ202' }) }));
  assert.ok(onlyNo.includes('LJ202'));
  assert.ok(!onlyNo.includes('출발</span>'));
  assert.ok(!onlyNo.includes('ticket__flight-city'));
  const noCity = renderFlightHeader(vmOf({ flight: flight({ flightNo: 'OZ541', airline: '아시아나항공' }) }));
  assert.ok(noCity.includes('아시아나항공') && !noCity.includes('ticket__flight-city'));
});

test('윗 선이 없는 "맨 위 구역"은 항공편 정보 칸 → 상태 줄 → 추천 시각 순으로 가장 위에 있는 구역 하나뿐이다', () => {
  const first = (html) => html.split('ticket__section--first').length - 1;
  const quiet = card(vmOf()); // 항공편 정보도 상태 줄도 없다
  assert.equal(first(quiet), 1);
  assert.ok(quiet.includes('class="ticket__section ticket__hero ticket__section--first"'));

  const statusOnly = card(vmOf({ now: LATE })); // 상태 줄만
  assert.equal(first(statusOnly), 1);
  assert.match(statusOnly, /ticket__status--passed ticket__section--first/);
  assert.ok(statusOnly.includes('class="ticket__section ticket__hero"')); // 추천 시각 구역에는 윗 선이 있다

  const headerOnly = card(vmOf({ flight: flight(picked) })); // 항공편 정보만
  assert.equal(first(headerOnly), 1);
  assert.ok(headerOnly.includes('ticket__flight ticket__section--first') || headerOnly.includes('ticket__section--first ticket__flight'));
  assert.ok(headerOnly.includes('class="ticket__section ticket__hero"'));

  const both = card(vmOf({ flight: flight(picked), now: LATE })); // 둘 다
  assert.equal(first(both), 1);
  assert.ok(!/ticket__status--passed ticket__section--first/.test(both)); // 상태 줄은 윗 선이 있는 일반 구역
});

test('항공편 정보 칸: 외부 데이터는 이스케이프한다', () => {
  const html = renderFlightHeader(vmOf({ flight: flight({ flightNo: 'A<b>1', airline: '<i>x</i>', departureCity: '"도시" & 1' }) }));
  assert.ok(!html.includes('<b>') && !html.includes('<i>'));
  assert.ok(html.includes('A&lt;b&gt;1') && html.includes('&lt;i&gt;x&lt;/i&gt;'));
  assert.ok(html.includes('&quot;도시&quot; &amp; 1 출발'));
});
