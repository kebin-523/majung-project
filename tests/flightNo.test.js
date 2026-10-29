import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFlightNo, parseFlightNo } from '../js/domain/flightNo.js';

test('소문자·띄어쓰기·하이픈을 맞춰 읽는다', () => {
  assert.equal(normalizeFlightNo('ke 123'), 'KE123');
  assert.equal(normalizeFlightNo(' KE-123 '), 'KE123');
  assert.equal(normalizeFlightNo('oz  555'), 'OZ555');
});

test('올바른 편명 형식', () => {
  // 'B6123'처럼 항공사 코드에 숫자가 섞인 경우도 있어, 'K123'은 코드 'K1' + 23으로 읽혀 형식상 유효하다.
  for (const ok of ['KE123', 'ke 123', 'OZ555', '7C1101', 'B6123', 'KE1234', 'KE123A']) {
    assert.equal(parseFlightNo(ok).valid, true, ok);
  }
});

test('잘못된 편명 형식', () => {
  for (const bad of ['', '   ', 'KE', '123', '1234', 'KE12345', 'KE', 'K', 'KE12 3A4', '한국123']) {
    assert.equal(parseFlightNo(bad).valid, false, JSON.stringify(bad));
  }
});

test('null·undefined도 오류 없이 유효하지 않음으로 처리', () => {
  assert.equal(parseFlightNo(undefined).valid, false);
  assert.equal(parseFlightNo(null).valid, false);
});
