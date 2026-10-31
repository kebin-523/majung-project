// 출발지 검색의 "가장 마지막 검색만 반영" 규칙과 결과 종류 판단. (화면 코드와 분리해 테스트한다)
//
// run(입력값, { onLoading }) 의 결과 kind
//   cleared      입력이 비어 있음 (목록을 비운다)
//   tooShort     앞뒤 공백을 뺀 글자 수가 최소(ADDRESS_MIN_QUERY_LENGTH)보다 적음 (검색하지 않는다)
//   results      결과 있음 { places }  받은 그대로 담는다 (같은 이름이어도 합치지 않는다)
//   empty        결과 없음 (오류가 아니다. "이 주소를 찾지 못했어요")
//   searchError  검색 실패 (어댑터 reason 이 무엇이든 같은 "검색 실패" 문구)
//   stale        이 검색이 끝나기 전에 새 검색·취소가 있었음 (화면은 이 결과를 쓰지 않는다)
// 새 검색이 시작되면 이전 요청에는 취소 신호를 보낸다. 취소가 늦거나 무시돼도 늦게 온 응답은 stale 로 버린다.
import { ADDRESS_MIN_QUERY_LENGTH } from '../config.js';

/**
 * @param {(query: string, options: { signal: AbortSignal }) => Promise<{ ok: boolean, data?: object[] }>} search
 */
export function createPlaceSearch(search, minLength = ADDRESS_MIN_QUERY_LENGTH) {
  let seq = 0;
  let controller = null;

  function cancel() {
    seq += 1;
    controller?.abort();
    controller = null;
  }

  async function run(rawQuery, { onLoading } = {}) {
    cancel();
    const mine = seq;
    const query = String(rawQuery ?? '').trim();

    if (query === '') return { kind: 'cleared' };
    if ([...query].length < minLength) return { kind: 'tooShort' };

    controller = new AbortController();
    onLoading?.();
    const result = await search(query, { signal: controller.signal });
    if (mine !== seq) return { kind: 'stale' };

    if (!result.ok) return { kind: 'searchError' };
    return result.data.length > 0 ? { kind: 'results', places: result.data } : { kind: 'empty' };
  }

  return { run, cancel };
}
