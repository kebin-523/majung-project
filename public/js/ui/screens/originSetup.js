// 3단계 · 출발지 설정: 주소를 검색해 하나를 고르고, 공항까지의 이동 시간을 조회한다.
import { getDriveTime } from '../../adapters/routeAdapter.js';
import { searchAddress } from '../../adapters/placeAdapter.js';
import { ADDRESS_MIN_QUERY_LENGTH, ADDRESS_SEARCH_DEBOUNCE_MS } from '../../config.js';
import { load, save } from '../../store.js';
import { icon } from '../components/icon.js';
import { renderProgress } from '../components/progress.js';
import { escapeHtml } from '../html.js';

const MESSAGES = {
  tooShort: `${ADDRESS_MIN_QUERY_LENGTH}글자 이상 입력해 주세요.`,
  loading: '주소를 찾고 있어요.',
  empty: '이 주소를 찾지 못했어요. 다른 검색어로 찾아볼까요?',
  searchError: '지금은 주소를 검색하지 못했어요. 잠시 후 다시 시도해 주세요.',
  routeLoading: '이동 시간을 확인하고 있어요.',
  routeError: '이동 시간을 불러오지 못해서 추천 시각을 계산하지 못했어요.',
};

function rowHtml(place, checked) {
  return `
    <label class="place-row">
      <input class="place-row__input" type="radio" name="place" value="${escapeHtml(place.id)}"${checked ? ' checked' : ''}>
      <span class="place-row__body">
        <span class="place-row__text">
          <span class="place-row__name">${escapeHtml(place.name)}</span>
          <span class="place-row__address">${escapeHtml(place.address)}</span>
        </span>
        <span class="place-row__check">${icon('check', 24)}<span class="sr-only">선택됨</span></span>
      </span>
    </label>`;
}

export function renderOriginSetup({ main, footer }, ctx) {
  const saved = load().origin ?? null;

  // 이전에 고른 출발지가 있으면 검색 없이 선택된 상태로 먼저 보여 준다.
  let places = saved ? [saved] : [];
  let selectedId = saved?.id ?? null;

  main.innerHTML = `
    ${renderProgress(3)}
    <div class="heading-group">
      <h1 tabindex="-1">어디서 출발하시나요?</h1>
      <p class="caption privacy">${icon('pin')}<span>입력한 주소는 이동 시간을 계산하는 데만 사용해요. 탭을 닫으면 지워져요.</span></p>
    </div>
    <form id="place-form" class="form" role="search" novalidate>
      <div class="field">
        <label class="field__label" for="place-query">출발지 주소</label>
        <input id="place-query" class="field__input" type="search" enterkeyhint="search"
          autocomplete="off" spellcheck="false"
          placeholder="주소나 장소 이름을 입력해 주세요 (예: 합정역)" aria-describedby="place-status">
      </div>
      <div id="place-status" aria-live="polite"></div>
      <fieldset id="place-list" class="place-list"></fieldset>
    </form>
    <div id="route-notice" aria-live="polite"></div>`;

  footer.innerHTML = `
    <button id="continue-btn" class="btn btn--primary" type="button">이동 시간 확인하기</button>
    <button id="back-btn" class="btn btn--text" type="button">이전</button>`;

  const form = main.querySelector('#place-form');
  const queryInput = main.querySelector('#place-query');
  const status = main.querySelector('#place-status');
  const list = main.querySelector('#place-list');
  const routeNotice = main.querySelector('#route-notice');
  const continueBtn = footer.querySelector('#continue-btn');

  if (saved) queryInput.value = saved.name;

  function renderList() {
    list.innerHTML = places.length
      ? `<legend class="sr-only">출발지 선택</legend>${places.map((p) => rowHtml(p, p.id === selectedId)).join('')}`
      : '';
    continueBtn.disabled = selectedId === null;
  }

  function showStatus(kind, count) {
    if (!kind) status.innerHTML = '';
    else if (kind === 'results') status.innerHTML = `<p class="caption">검색 결과 ${count}건</p>`;
    else if (kind === 'empty' || kind === 'searchError') {
      status.innerHTML = `<p class="field__error">${icon('info')}<span>${MESSAGES[kind]}</span></p>`;
    } else status.innerHTML = `<p class="caption">${MESSAGES[kind]}</p>`;
  }

  function showRouteNotice(kind) {
    if (!kind) {
      routeNotice.innerHTML = '';
    } else if (kind === 'loading') {
      routeNotice.innerHTML = `<p class="caption">${MESSAGES.routeLoading}</p>`;
    } else {
      routeNotice.innerHTML = `
        <div class="notice">
          <p class="notice__text">${icon('info')}<span>${MESSAGES.routeError}</span></p>
          <button class="btn btn--text" type="button" data-retry>다시 시도</button>
        </div>`;
      routeNotice.querySelector('[data-retry]').addEventListener('click', confirmOrigin);
    }
  }

  // 응답이 순서대로 오지 않아도 가장 마지막 검색 결과만 화면에 반영한다.
  let searchSeq = 0;
  let debounceTimer = null;

  async function runSearch() {
    const query = queryInput.value.trim();
    const seq = ++searchSeq;

    if (query === '') {
      showStatus(null);
      places = [];
      selectedId = null;
      renderList();
      return;
    }
    if (query.length < ADDRESS_MIN_QUERY_LENGTH) {
      showStatus('tooShort');
      return;
    }

    showStatus('loading');
    const result = await searchAddress(query);
    if (seq !== searchSeq || !form.isConnected) return;

    if (!result.ok) {
      showStatus('searchError');
      return;
    }
    places = result.data;
    if (!places.some((p) => p.id === selectedId)) selectedId = null;
    renderList();
    showStatus(places.length ? 'results' : 'empty', places.length);
  }

  let busy = false;

  async function confirmOrigin() {
    const place = places.find((p) => p.id === selectedId);
    if (!place || busy) return;

    busy = true;
    continueBtn.disabled = true;
    showRouteNotice('loading');
    const result = await getDriveTime(place);
    busy = false;

    if (!form.isConnected) return; // 응답을 기다리는 사이 다른 화면으로 이동했다.
    continueBtn.disabled = false;

    if (!result.ok) {
      showRouteNotice('error');
      return;
    }

    save({ ...load(), origin: place, drive: result.data });
    ctx.navigate('result');
  }

  renderList();

  queryInput.addEventListener('input', () => {
    showRouteNotice(null);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSearch, ADDRESS_SEARCH_DEBOUNCE_MS);
  });

  // Enter를 누르면 기다리지 않고 바로 검색한다.
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearTimeout(debounceTimer);
    runSearch();
  });

  list.addEventListener('change', (event) => {
    if (event.target.name !== 'place') return;
    selectedId = event.target.value;
    continueBtn.disabled = false;
    showRouteNotice(null);
  });

  continueBtn.addEventListener('click', confirmOrigin);
  footer.querySelector('#back-btn').addEventListener('click', () => ctx.navigate('confirm'));
}
