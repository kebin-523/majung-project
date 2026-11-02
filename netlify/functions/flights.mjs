// 항공편 조회 함수 (Netlify Functions v2). 실제 처리는 server/icn/handleFlights.js 에 있다.
// 키는 서버 환경변수 ICN_AIRPORT_API_KEY 에서만 읽는다. (Netlify 에서는 변수의 범위에 Functions 가 들어 있어야 하고, 바꾼 뒤에는 다시 배포해야 한다.)
import { handleFlights } from '../../server/icn/handleFlights.js';

export default (request) =>
  handleFlights(request, {
    apiKey: process.env.ICN_AIRPORT_API_KEY,
    fetch: (...args) => globalThis.fetch(...args),
    now: () => Date.now(),
  });

export const config = { path: '/api/flights' };
