// 추천 시각 화면 하나가 열려 있는 동안의 자동 재확인 상태. DOM 접근 없음.
//   - 화면을 열 때의 확인도 자동 시도 1회로 센다. (처음부터 시도한 상태로 시작한다)
//   - 확인에 성공하면 시도하지 않은 상태로 되돌려, 응답을 받은 뒤 다시 오래되면 한 번 더 자동으로 확인한다.
//   - 확인에 실패(missing · error · quota · timeout)하면 시도한 상태로 남아 반복하지 않는다. 사용자의 "다시 시도"로 넘긴다.
// 오래됨 기준 시각은 서버 시각이 아니라 화면이 응답을 받은 시각(lastConfirmedAt)을 쓴다. 그래서 기기 시계가 서버보다 앞서 있어도
// 성공 직후에 곧바로 다시 오래된 것으로 판단해 1분마다 반복 호출하는 일이 없다.
import { shouldAutoRecheck } from './status.js';

export function createAutoRecheck() {
  let tried = true;
  return {
    /** 지금 자동으로 한 번 다시 확인해야 하는가. receivedAt 은 lastConfirmedAt(flight) 값 */
    due({ now, receivedAt }) {
      return shouldAutoRecheck({ now, lastChecked: receivedAt, alreadyTried: tried });
    },
    /** 자동 확인을 시작했다. */
    started() {
      tried = true;
    },
    /** 확인에 성공했다. */
    succeeded() {
      tried = false;
    },
  };
}
