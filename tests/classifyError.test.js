import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REASONS,
  classifyErrorText,
  classifyHttpStatus,
  classifyResultCode,
  classifyThrown,
  redactSecrets,
} from '../server/icn/classifyError.js';
import { blockNetwork } from './helpers/blockNetwork.js';

blockNetwork();

test('reason 은 notfound · quota · config · error 4가지다', () => {
  assert.deepEqual([...REASONS], ['notfound', 'quota', 'config', 'error']);
});

test('classifyErrorText: 가이드의 포털 오류 글자 8개를 나눈다', () => {
  const expected = {
    'API token quota exceeded': 'quota',
    Unauthorized: 'config',
    Forbidden: 'config',
    'API not found': 'config',
    'API rate limit exceeded': 'error',
    'Error forwarding request to backend server': 'error',
    'Error receiving response from backend server': 'error',
    'Unexpected error': 'error',
  };
  for (const [text, reason] of Object.entries(expected)) assert.equal(classifyErrorText(text), reason, text);
});

test('classifyErrorText: 앞뒤 공백·줄바꿈은 무시하고, 대소문자는 구분한다', () => {
  assert.equal(classifyErrorText('  Unauthorized\r\n'), 'config');
  assert.equal(classifyErrorText('﻿API token quota exceeded\n'), 'quota');
  assert.equal(classifyErrorText('unauthorized'), null);
});

test('classifyErrorText: 모르는 글자·JSON·글자가 아닌 값은 null', () => {
  for (const value of ['', 'hello', '{"response":{}}', 'Unauthorized access', null, undefined, 401]) {
    assert.equal(classifyErrorText(value), null, JSON.stringify(value));
  }
});

test('classifyResultCode: 00 은 정상, 99 는 config, 그 밖은 error', () => {
  assert.equal(classifyResultCode('00'), null);
  assert.equal(classifyResultCode(' 00 '), null);
  assert.equal(classifyResultCode('99'), 'config');
  for (const code of ['30', '01', '', null, undefined, 0, 'ERROR']) assert.equal(classifyResultCode(code), 'error', String(code));
});

test('classifyHttpStatus: 5xx 만 error, 그 밖은 null (본문을 계속 해석한다)', () => {
  for (const status of [500, 502, 503, 599]) assert.equal(classifyHttpStatus(status), 'error', String(status));
  for (const status of [200, 301, 400, 401, 403, 404, 429, undefined, null, '500']) {
    assert.equal(classifyHttpStatus(status), null, String(status));
  }
});

test('classifyThrown: 연결 실패·시간 초과는 모두 error', () => {
  assert.equal(classifyThrown(new TypeError('fetch failed')), 'error');
  assert.equal(classifyThrown(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), 'error');
  assert.equal(classifyThrown(), 'error');
});

test('redactSecrets: 키 원문과 인코딩된 키를 가린다', () => {
  const key = 'AbC+123/xyz==';
  const text = `GET /x?serviceKey=${encodeURIComponent(key)}&a=1 실패, 키 ${key} 가 보임`;
  const result = redactSecrets(text, [key]);
  assert.ok(!result.includes(key));
  assert.ok(!result.includes(encodeURIComponent(key)));
  assert.match(result, /serviceKey=\*\*\*&a=1/);
});

test('redactSecrets: 빈 값·글자가 아닌 값은 무시하고, 길면 줄인다', () => {
  assert.equal(redactSecrets('abc', ['', null, undefined, 5]), 'abc');
  assert.equal(redactSecrets(undefined), '');
  const long = redactSecrets('가'.repeat(300), [], 50);
  assert.equal(long.length, 51);
  assert.ok(long.endsWith('…'));
});

test('redactSecrets: 분류 결과(reason)에는 키가 들어갈 자리가 없다', () => {
  const key = 'TESTKEY123';
  const reasons = [classifyErrorText(`Unauthorized ${key}`), classifyResultCode(key), classifyHttpStatus(500), classifyThrown(new Error(key))];
  assert.ok(!JSON.stringify(reasons).includes(key));
  for (const reason of reasons) assert.ok(reason === null || REASONS.includes(reason));
});
