// 추천 카드의 구성: 근거 타임라인(출발지 → 이동 → 공항 → 여유 → 비행기 도착), 합쳐진 추천 문구, 새로고침 버튼. DOM 접근 없는 함수만 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { minutes, toMs } from '../public/js/domain/time.js';
import { renderRecommendCardContent } from '../public/js/ui/components/recommendCard.js';
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
  const order = ['합정역', '이동 40분 · 자동차 기준', '인천공항', '여유 60분', '비행기 도착'].map((text) => html.indexOf(text));
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
  const html = renderTimeline(vmOf({ origin: null }));
  assert.ok(html.includes('class="route__place">출발지<'));
  assert.ok(!html.includes('route__sub'));
});

test('카드: 항적선 그래픽과 별도의 핵심 안내 문장 줄이 없고, "출발을 추천해요"는 숫자 옆 알약 하나뿐이다', () => {
  const html = card(vmOf());
  assert.ok(!html.includes('class="trail'));
  assert.ok(!html.includes('<svg'));
  assert.ok(!html.includes('reco__lead'));
  assert.equal(html.split('출발을 추천해요').length - 1, 1);
  assert.ok(html.includes('<span class="pill-depart">출발을 추천해요</span>'));
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

test('카드: 구성 순서는 말풍선 → 추천 시각 → 상태 배지 → 근거 타임라인 → 확인 시각 줄', () => {
  const html = card(vmOf());
  const positions = ['class="bubble"', 'class="reco__time ', 'class="badge ', 'class="route"', 'class="caption reco__checked"'].map((text) => html.indexOf(text));
  assert.ok(positions.every((index) => index >= 0), String(positions));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.ok(html.includes('실제 도착과 교통에 따라 달라질 수 있어요')); // 추정치 안내는 지우지 않는다
});
