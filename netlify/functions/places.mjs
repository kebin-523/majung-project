// 장소 검색 함수 (Netlify Functions v2). 실제 처리는 server/kakao/handlePlaces.js 에 있다.
// 키는 서버 환경변수 KAKAO_REST_API_KEY 에서만 읽는다. (Netlify 에서는 변수의 범위에 Functions 가 들어 있어야 하고, 바꾼 뒤에는 다시 배포해야 한다.)
import { handlePlaces } from '../../server/kakao/handlePlaces.js';

export default (request) =>
  handlePlaces(request, {
    apiKey: process.env.KAKAO_REST_API_KEY,
    fetch: (...args) => globalThis.fetch(...args),
  });

export const config = { path: '/api/places' };
