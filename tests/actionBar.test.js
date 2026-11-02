// 결과 화면 하단 버튼 그룹: 항공편 변경 · 공유하기 · 알림 받기 (아이콘 + 글자 알약 버튼)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderActionBar } from '../public/js/ui/components/actionBar.js';
import {
  ALERT_LEAD_OPTIONS_MIN,
  DEFAULT_ALERT_LEAD_MIN,
  alertLeadLabel,
  alertSavedMessage,
  readAlertLead,
} from '../public/js/domain/alertLead.js';
import {
  SHARE_COPIED_MESSAGE,
  SHARE_FAILED_MESSAGE,
  buildShareUrl,
  copyText,
} from '../public/js/domain/share.js';
import { resolveBadge } from '../public/js/domain/status.js';
import { minutes, toMs } from '../public/js/domain/time.js';
import { SOON_THRESHOLD_MIN } from '../public/js/config.js';

test('버튼 그룹: 항공편 변경 · 공유하기 · 알림 받기 세 개가 이 순서로 있다', () => {
  const html = renderActionBar();
  const labels = [...html.matchAll(/<span class="action-btn__label">([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['항공편 변경', '공유하기', '알림 받기']);
  const actions = [...html.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(actions, ['change-flight', 'share', 'alert']);
});

test('버튼 그룹: 아이콘이 위, 글자가 아래다 (아이콘은 꾸밈이라 화면 읽기에서 숨긴다)', () => {
  const html = renderActionBar();
  const buttons = [...html.matchAll(/<button class="action-btn[^"]*"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1]);
  assert.equal(buttons.length, 3);
  for (const body of buttons) {
    assert.ok(body.indexOf('class="icon"') >= 0 && body.indexOf('class="icon"') < body.indexOf('action-btn__label'));
    assert.ok(body.includes('aria-hidden="true"'));
  }
  // 세 버튼은 서로 다른 아이콘이다
  const icons = buttons.map((b) => b.match(/\/icons\/([a-z-]+)\.svg/)[1]);
  assert.equal(new Set(icons).size, 3);
  assert.deepEqual(icons, ['swap', 'share', 'bell']);
});

test('버튼 그룹: 첫 버튼만 Ink로 채운 모양이고, 모두 type="button"이다', () => {
  const html = renderActionBar();
  assert.equal(html.split('action-btn--filled').length - 1, 1);
  assert.ok(html.indexOf('action-btn--filled') < html.indexOf('data-action="share"'));
  assert.equal(html.split('type="button"').length - 1, 3);
});

test('버튼 그룹: 묶음 이름이 있고, 알림 받기는 대화상자를 연다는 뜻(aria-haspopup)을 알린다', () => {
  const html = renderActionBar();
  assert.match(html, /role="group" aria-label="[^"]+"/);
  assert.match(html, /data-action="alert"[^>]*aria-haspopup="dialog"/);
});

test('버튼 그룹: 터치 영역과 글자 크기는 CSS 에서 지킨다 (높이 44px 이상, 글자 14px 이상)', () => {
  const css = readFileSync(new URL('../public/css/components.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const rule = css.match(/(^|\n)\.action-btn \{([^}]*)\}/)[2];
  assert.match(rule, /min-height: (\d+)px/);
  assert.ok(Number(rule.match(/min-height: (\d+)px/)[1]) >= 44);
  assert.match(rule, /border-radius: var\(--radius-pill\)/);
  const label = css.match(/\.action-btn__label \{([^}]*)\}/)[1];
  assert.match(label, /font-size: var\(--fs-chip\)/); // 14px SemiBold
});

// ---------- 알림 받기: 출발 몇 분 전부터 화면 안에서 알릴지 ----------

test('알림 시점: 선택지는 10 · 20 · 30 · 60 · 90분 전이고 기본값은 지금 "곧 출발" 기준(60분)이다', () => {
  assert.deepEqual(ALERT_LEAD_OPTIONS_MIN, [10, 20, 30, 60, 90]);
  assert.equal(DEFAULT_ALERT_LEAD_MIN, SOON_THRESHOLD_MIN);
  assert.ok(ALERT_LEAD_OPTIONS_MIN.includes(DEFAULT_ALERT_LEAD_MIN));
});

test('알림 시점: 저장된 값이 선택지에 없거나 깨졌으면 기본값으로 읽는다', () => {
  assert.equal(readAlertLead(30), 30);
  for (const bad of [undefined, null, '30', 25, -10, 0, Number.NaN, {}, 999]) assert.equal(readAlertLead(bad), DEFAULT_ALERT_LEAD_MIN, String(bad));
});

test('알림 시점: 문구는 "N분 전"이고, 저장 안내는 알림이 발송된 것처럼 말하지 않는다 (화면 안 안내)', () => {
  assert.equal(alertLeadLabel(30), '30분 전');
  const message = alertSavedMessage(30);
  assert.ok(message.includes('출발 30분 전'));
  assert.ok(message.includes('화면'));
  assert.ok(!/푸시|보내|발송|문자|카카오/.test(message));
});

test('알림 시점이 "곧 출발" 판단을 정한다 — 기본 60분, 바꾸면 그 분 전부터 곧 출발이다', () => {
  const now = toMs('2026-11-02 12:00');
  const at = (minutesLeft, soonMin) => resolveBadge({ now, departure: now + minutes(minutesLeft), lastChecked: now, soonMin });
  assert.equal(at(45, undefined), 'soon'); // 기본 60분
  assert.equal(at(61, undefined), 'relaxed');
  assert.equal(at(45, 30), 'relaxed'); // 30분 전부터로 바꾸면 45분 전에는 아직 아니다
  assert.equal(at(30, 30), 'soon');
  assert.equal(at(80, 90), 'soon'); // 90분 전부터
  assert.equal(at(-5, 30), 'passed'); // 지난 뒤는 그대로 지남이 우선
});

// ---------- 공유하기: 링크 복사 ----------

test('공유 링크: 현재 주소에서 해시·쿼리를 뗀 앱 주소다 (출발지·항공편 같은 개인 정보가 주소에 없다)', () => {
  assert.equal(buildShareUrl({ origin: 'https://majung.app', pathname: '/index.html', search: '?scenario=landed&printlog', hash: '#/result' }), 'https://majung.app/index.html');
  assert.equal(buildShareUrl({ origin: 'https://majung.app', pathname: '/', search: '', hash: '#/result' }), 'https://majung.app/');
});

test('공유 문구: 성공 문구는 요청한 그대로, 실패 문구는 무엇을 하면 되는지 알려 준다', () => {
  assert.equal(SHARE_COPIED_MESSAGE, '링크가 복사되었습니다');
  assert.ok(SHARE_FAILED_MESSAGE.includes('복사하지 못했어요'));
});

test('copyText: 클립보드 API 로 복사하면 true', async () => {
  let copied = null;
  const ok = await copyText('https://x.test/', { clipboard: { writeText: async (t) => { copied = t; } }, doc: null });
  assert.equal(ok, true);
  assert.equal(copied, 'https://x.test/');
});

test('copyText: 클립보드 API 가 막히면 임시 입력칸 복사(execCommand)로 다시 시도한다', async () => {
  const calls = [];
  const doc = {
    body: { appendChild: (el) => calls.push(['append', el.value]), removeChild: () => calls.push(['remove']) },
    createElement: () => ({ style: {}, setAttribute() {}, select() {}, focus() {}, value: '' }),
    execCommand: (name) => { calls.push([name]); return true; },
  };
  const ok = await copyText('https://x.test/', { clipboard: { writeText: async () => { throw new Error('denied'); } }, doc });
  assert.equal(ok, true);
  assert.deepEqual(calls.map((c) => c[0]), ['append', 'copy', 'remove']);
});

test('copyText: 둘 다 안 되면 false (던지지 않는다)', async () => {
  const doc = {
    body: { appendChild() {}, removeChild() {} },
    createElement: () => ({ style: {}, setAttribute() {}, select() {}, focus() {}, value: '' }),
    execCommand: () => false,
  };
  assert.equal(await copyText('x', { clipboard: null, doc }), false);
  assert.equal(await copyText('x', { clipboard: { writeText: async () => { throw new Error('no'); } }, doc: null }), false);
});
