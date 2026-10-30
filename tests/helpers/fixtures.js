// tests/fixtures/ 의 실제 응답 샘플을 읽는다. (키·네트워크 없이 쓴다)
// fixtures 는 저장소 공개 여부를 정할 때까지 .gitignore 로 커밋하지 않으므로, 새로 받은 저장소에는 없을 수 있다.
import { readFileSync } from 'node:fs';

const urlOf = (name) => new URL(`../fixtures/${name}`, import.meta.url);

export function loadFixtureText(name) {
  try {
    return readFileSync(urlOf(name), 'utf8');
  } catch (error) {
    throw new Error(`fixture 를 읽지 못했어요: tests/fixtures/${name} (${error.code ?? error.message})`);
  }
}

export const loadFixture = (name) => JSON.parse(loadFixtureText(name));

export const FIXTURES = Object.freeze({
  arrived: 'icn-arrival-arrived.json',
  touchdown: 'icn-arrival-touchdown.json',
  beforeLanding: 'icn-arrival-before-landing.json',
  slave: 'icn-arrival-slave.json',
  none: 'icn-arrival-none.json',
});
