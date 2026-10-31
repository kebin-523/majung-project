// 길찾기 호출 입력: 출발지 검사·주소 만들기(server/kakao/routeInput.js)와 목적지 표(server/kakao/destinations.js).
// 네트워크는 쓰지 않는다. 목적지 좌표가 docs/samples 의 카카오 장소 검색 샘플과 같은지만 샘플 파일을 읽어 확인한다.
// (docs/samples 는 gitignore 대상이라 없는 환경에서는 그 테스트만 건너뛴다.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DIRECTIONS_URL, ORIGIN_BOUNDS, buildDirectionsUrl, formatLngLat, readOrigin } from '../server/kakao/routeInput.js';
import { DESTINATIONS, getDestination } from '../server/kakao/destinations.js';
import { blockNetwork } from './helpers/blockNetwork.js';

blockNetwork();

// ---------- 출발지 검사 ----------

test('readOrigin: 숫자 경도·위도를 { lng, lat } 로 돌려주고 다른 필드는 버린다', () => {
  assert.deepEqual(readOrigin({ lng: 126.7, lat: 37.4 }), { lng: 126.7, lat: 37.4 });
  assert.deepEqual(readOrigin({ lng: 126.7, lat: 37.4, name: '합성', address: '합성 주소' }), { lng: 126.7, lat: 37.4 });
});

test('readOrigin: 숫자가 아니거나 유한하지 않으면 null', () => {
  const bad = [
    null, undefined, 'x', 1, [], [126.7, 37.4],
    {}, { lng: 126.7 }, { lat: 37.4 },
    { lng: '126.7', lat: '37.4' }, { lng: '126.7', lat: 37.4 }, { lng: 126.7, lat: '37.4' },
    { lng: null, lat: 37.4 }, { lng: 126.7, lat: null },
    { lng: NaN, lat: 37.4 }, { lng: 126.7, lat: NaN },
    { lng: Infinity, lat: 37.4 }, { lng: 126.7, lat: -Infinity },
    { lng: true, lat: 37.4 }, { lng: {}, lat: 37.4 },
  ];
  for (const value of bad) assert.equal(readOrigin(value), null, JSON.stringify(value));
});

test('readOrigin: 경도 -180~180 · 위도 -90~90 밖이면 null (한국 범위 검사보다 먼저 걸러지는 값)', () => {
  for (const value of [{ lng: 181, lat: 37 }, { lng: -181, lat: 37 }, { lng: 126, lat: 91 }, { lng: 126, lat: -91 }, { lng: 1e9, lat: 37 }]) {
    assert.equal(readOrigin(value), null, JSON.stringify(value));
  }
});

test('readOrigin: 한국을 넉넉히 덮는 사각형 밖이면 null, 경계는 포함', () => {
  const { minLng, maxLng, minLat, maxLat } = ORIGIN_BOUNDS;
  assert.deepEqual(readOrigin({ lng: minLng, lat: minLat }), { lng: minLng, lat: minLat });
  assert.deepEqual(readOrigin({ lng: maxLng, lat: maxLat }), { lng: maxLng, lat: maxLat });
  assert.equal(readOrigin({ lng: minLng - 0.0001, lat: 37 }), null);
  assert.equal(readOrigin({ lng: maxLng + 0.0001, lat: 37 }), null);
  assert.equal(readOrigin({ lng: 127, lat: minLat - 0.0001 }), null);
  assert.equal(readOrigin({ lng: 127, lat: maxLat + 0.0001 }), null);
  // 한국이 아닌 곳 (도쿄·런던·적도 원점·뉴욕)
  for (const value of [{ lng: 139.7, lat: 35.7 }, { lng: -0.12, lat: 51.5 }, { lng: 0, lat: 0 }, { lng: -74, lat: 40.7 }]) {
    assert.equal(readOrigin(value), null, JSON.stringify(value));
  }
});

test('범위 값은 이름이 있는 상수이고 경도 124~132 · 위도 33~39 이다 (한국 밖 대부분을 거르는 넉넉한 값, 가정)', () => {
  assert.deepEqual({ ...ORIGIN_BOUNDS }, { minLng: 124, maxLng: 132, minLat: 33, maxLat: 39 });
  assert.ok(Object.isFrozen(ORIGIN_BOUNDS));
});

// ---------- 좌표 문자열 · 호출 주소 ----------

test('formatLngLat: "경도,위도" 순서', () => {
  assert.equal(formatLngLat({ lng: 126.5, lat: 37.25 }), '126.5,37.25');
  assert.equal(formatLngLat({ lng: 126.123456789012, lat: 37.987654321098 }), '126.123456789012,37.987654321098');
  assert.equal(formatLngLat({ lng: -122.5, lat: -33.25 }), '-122.5,-33.25');
});

test('formatLngLat: 숫자가 아니거나 유한하지 않으면 던진다 (검사를 거치지 않은 값이 주소에 들어가지 않게)', () => {
  for (const value of [{ lng: NaN, lat: 1 }, { lng: 1, lat: Infinity }, { lng: '1', lat: 2 }, {}, null]) {
    assert.throws(() => formatLngLat(value), TypeError, JSON.stringify(value));
  }
});

test('buildDirectionsUrl: https 길찾기 주소에 origin · destination · priority=RECOMMEND 만 쓴다', () => {
  const destination = getDestination('P01');
  const text = buildDirectionsUrl({ lng: 126.7, lat: 37.4 }, destination);
  const url = new URL(text);

  assert.equal(DIRECTIONS_URL, 'https://apis-navi.kakaomobility.com/v1/directions');
  assert.equal(`${url.origin}${url.pathname}`, DIRECTIONS_URL);
  assert.equal(url.protocol, 'https:');
  assert.deepEqual([...url.searchParams.keys()], ['origin', 'destination', 'priority']);
  assert.equal(url.searchParams.get('origin'), '126.7,37.4');
  assert.equal(url.searchParams.get('destination'), `${destination.lng},${destination.lat}`);
  assert.equal(url.searchParams.get('priority'), 'RECOMMEND');
});

test('buildDirectionsUrl: 키·인증 값이 주소에 없다', () => {
  const text = buildDirectionsUrl({ lng: 126.7, lat: 37.4 }, getDestination('P03'));
  for (const forbidden of ['KakaoAK', 'Authorization', 'appkey', 'apikey', 'api_key', 'key=', 'secret']) {
    assert.ok(!text.toLowerCase().includes(forbidden.toLowerCase()), forbidden);
  }
  assert.equal(text.includes('@'), false); // 주소 안에 사용자 정보도 없다
});

test('buildDirectionsUrl: 두 터미널은 목적지만 다르다', () => {
  const origin = { lng: 126.7, lat: 37.4 };
  const a = new URL(buildDirectionsUrl(origin, getDestination('P01')));
  const b = new URL(buildDirectionsUrl(origin, getDestination('P03')));
  assert.equal(a.searchParams.get('origin'), b.searchParams.get('origin'));
  assert.notEqual(a.searchParams.get('destination'), b.searchParams.get('destination'));
});

// ---------- 목적지 표 ----------

test('표의 키는 P01 과 P03 뿐이다', () => {
  assert.deepEqual(Object.keys(DESTINATIONS), ['P01', 'P03']);
  assert.ok(Object.isFrozen(DESTINATIONS));
  assert.ok(Object.isFrozen(DESTINATIONS.P01));
});

test('getDestination: P01 · P03 은 카카오 장소 id 와 좌표를 돌려준다', () => {
  const t1 = getDestination('P01');
  const t3 = getDestination('P03');
  assert.equal(t1.placeId, '551337979');
  assert.equal(t3.placeId, '1103761188');
  for (const entry of [t1, t3]) {
    assert.equal(typeof entry.name, 'string');
    assert.ok(Number.isFinite(entry.lng) && Number.isFinite(entry.lat));
  }
  assert.notDeepEqual([t1.lng, t1.lat], [t3.lng, t3.lat]);
});

test('getDestination: P02(탑승동)와 그 밖의 값은 null (invalid)', () => {
  const bad = ['P02', 'p01', 'P01 ', ' P01', 'P04', 'P1', '', 'T1', 'constructor', '__proto__', 'toString', 'hasOwnProperty', null, undefined, 1, {}, [], ['P01']];
  for (const code of bad) assert.equal(getDestination(code), null, String(code));
});

test('목적지 좌표는 한국 범위 안이다 (출발지 검사와 같은 사각형)', () => {
  for (const code of Object.keys(DESTINATIONS)) {
    const { lng, lat } = getDestination(code);
    assert.deepEqual(readOrigin({ lng, lat }), { lng, lat }, code);
  }
});

// 목적지 좌표를 샘플의 해당 장소 id 항목과 비교한다. 값을 옮겨 적다 틀리지 않았는지 확인하는 용도다.
const sample = (name) => fileURLToPath(new URL(`../docs/samples/${name}`, import.meta.url));
const SAMPLES = { P01: 'kakao-dest-t1-20261031.json', P03: 'kakao-dest-t2-20261031.json' };

for (const [code, file] of Object.entries(SAMPLES)) {
  test(`${code} 목적지 좌표가 docs/samples/${file} 의 장소 id 항목과 같다`, { skip: !existsSync(sample(file)) && 'docs/samples 가 없어요 (gitignore 대상)' }, () => {
    const body = JSON.parse(readFileSync(sample(file), 'utf8').replace(/^﻿/, ''));
    const entry = getDestination(code);
    const found = body.documents.filter((d) => d.id === entry.placeId);
    assert.equal(found.length, 1);
    assert.equal(found[0].place_name, entry.name);
    assert.equal(String(entry.lng), found[0].x); // 문자열 그대로(자릿수 손실 없이)
    assert.equal(String(entry.lat), found[0].y);
    assert.equal(entry.lng, Number(found[0].x));
    assert.equal(entry.lat, Number(found[0].y));
  });
}
