// 테스트가 시작할 때 fetch 를 "호출되면 실패"로 바꿔 둔다. 테스트가 실수로 네트워크를 타지 못하게 막는 장치다.
// 테스트 파일 맨 위에서 blockNetwork() 를 한 번 부른다. 끝나면 원래 fetch 로 되돌린다.
import { after, before } from 'node:test';

export function blockNetwork() {
  let original;
  before(() => {
    original = globalThis.fetch;
    globalThis.fetch = () => {
      throw new Error('테스트 중에는 fetch(네트워크) 를 호출할 수 없어요.');
    };
  });
  after(() => {
    globalThis.fetch = original;
  });
}
