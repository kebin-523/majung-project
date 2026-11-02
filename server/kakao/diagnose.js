// 카카오 호출이 실패했을 때 로그에 남길 "안전한 진단 정보". 장소 검색(handlePlaces)과 길찾기(handleRoute)가 같이 쓴다.
// 남기는 것: 응답의 errorType(영문 이름만)·code(정수), 키 지문(길이 + SHA-256 앞 8자).
// 남기지 않는 것: 키 원문, 응답의 message(검색어·주소·좌표가 섞일 수 있다), 본문 전체.
// 키 지문은 배포 환경의 키가 내 PC의 키와 같은 값인지 비교하려는 용도다. (키 원문은 복원할 수 없다)
import { keyFingerprint } from '../icn/classifyError.js';

export function kakaoFailureInfo(text, key) {
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    // 본문이 JSON 이 아니면 errorType 을 알 수 없다.
  }
  const errorType = typeof body?.errorType === 'string' && /^[A-Za-z]{1,40}$/.test(body.errorType) ? body.errorType : 'none';
  const code = Number.isInteger(body?.code) ? body.code : 'none';
  const print = keyFingerprint(key);
  return `errorType=${errorType} code=${code} keyLen=${print.length} keySha=${print.sha}`;
}
