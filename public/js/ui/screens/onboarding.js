// 온보딩 (DesignGuide 7장 "온보딩"): 로고만 보이는 첫 화면 → 서비스 소개 3장 → "시작하기"로 항공편 찾기(1단계)로 간다.
// 그림 속 값은 실제 값이 아니라 "예시"이고, domain/onboarding.js 의 EXAMPLE 에서 앱과 같은 계산식으로 만든다. (문구는 확정본이라 그대로 쓴다)
import { EXAMPLE, SPLASH_MS, ONBOARDING_PAGES, clampPage, exampleChange, exampleTimes, markOnboardingDone, pageControls, spokenClock } from '../../domain/onboarding.js';
import { load, save } from '../../store.js';
import { icon } from '../components/icon.js';
import { prefersReducedMotion } from '../motion/ticketPrint.js';

const SWIPE_MIN_PX = 48; // 옆으로 밀어서 넘기는 최소 거리 (가정)
const PRINT_MS = 500; // 카드가 위에서 티켓처럼 출력되는 시간 (가정, 0.6초 이내)

/** 첫 화면: 마중 로고만. 두 선이 한 번 이어지고 멈춘다 (반복하지 않는다) */
const splashHtml = () => `
  <div class="intro-splash" role="img" aria-label="마중 majung">
    <svg class="intro-logo" viewBox="1 3 21.5 26" width="80" height="96" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true">
      <path class="intro-logo__line intro-logo__line--a" pathLength="1" d="M3 6c8 0 11 6 13 10"/>
      <path class="intro-logo__line intro-logo__line--b" pathLength="1" d="M3 26c8 0 11-6 13-10"/>
      <circle class="intro-logo__dot" cx="19" cy="16" r="2.5" fill="currentColor" stroke="none"/>
    </svg>
    <p class="intro-wordmark" aria-hidden="true">마중</p>
    <p class="caption" aria-hidden="true">majung</p>
  </div>`;

/** 1장 그림: 추천 출발 시간 ········ 예상 만남 + 근거 한 줄. 라벨은 "시간", 읽기용 문구는 시각을 말한다 */
const valueArt = () => {
  const t = exampleTimes();
  const label = `예시: 추천 출발 시간 ${spokenClock(t.departure)}, 예상 만남 ${spokenClock(t.meet)}. 비행기 도착 ${spokenClock(t.arrival)}, 이동 ${EXAMPLE.travelMin}분. 예시 화면이에요.`;
  return `
  <div class="intro-ticket" role="img" aria-label="${label}">
    <div class="ticket__band"></div>
    <div class="intro-ticket__body" aria-hidden="true">
      <div class="intro-ticket__times">
        <div class="intro-ticket__col"><span class="intro-ticket__label">추천 출발 시간</span><span class="intro-ticket__time tabular">${t.departure}</span></div>
        <span class="intro-ticket__dots"></span>
        <div class="intro-ticket__col intro-ticket__col--end"><span class="intro-ticket__label">예상 만남</span><span class="intro-ticket__time tabular">${t.meet}</span></div>
      </div>
      <p class="intro-ticket__basis tabular">비행기 도착 ${t.arrival} · 이동 ${EXAMPLE.travelMin}분</p>
      <p class="caption">예시 화면이에요.</p>
    </div>
  </div>`;
};

/** 2장 그림: 입력 단계 둘(점선 원) → 결과 단계(남색으로 채운 원). 시간표와 같은 3px 선으로 잇는다 */
const howArt = () => `
  <ol class="intro-steps">
    <li><span class="intro-steps__badge" aria-hidden="true">${icon('plane')}</span><span class="intro-steps__text"><strong>항공편 고르기</strong><span class="caption">편명 또는 도착 시간대</span></span></li>
    <li><span class="intro-steps__badge" aria-hidden="true">${icon('pin')}</span><span class="intro-steps__text"><strong>출발지 정하기</strong><span class="caption">주소나 장소 이름</span></span></li>
    <li><span class="intro-steps__badge intro-steps__badge--result" aria-hidden="true">${icon('clock')}</span><span class="intro-steps__text"><strong>추천 출발 시간 확인</strong><span class="caption">이동 시간은 자동으로 확인해요</span></span></li>
  </ol>`;

/** 이전 값(취소선) → 새 값(강조) 한 줄. 취소선 값은 "이전 값 17시 45분"처럼 읽힌다 */
function changeRow(label, before, after) {
  return `
      <div class="intro-change__row">
        <span class="intro-change__label">${label}</span>
        <span class="intro-change__values tabular">
          <span class="intro-change__old" role="img" aria-label="이전 값 ${spokenClock(before)}"><s>${before}</s></span>
          <span class="intro-change__arrow" aria-hidden="true">→</span>
          <span class="intro-change__new" role="img" aria-label="새 값 ${spokenClock(after)}"><b>${after}</b></span>
        </span>
      </div>`;
}

/** 3장 그림: 변경 안내 띠(예시). 세 값이 모두 +20분. 빨강·경고 표현은 쓰지 않는다 */
const changeArt = () => {
  const { before, after } = exampleChange();
  return `
  <div class="intro-ticket intro-ticket--change">
    <div class="ticket__band" aria-hidden="true"></div>
    <div class="intro-ticket__body">${changeRow('비행기 도착', before.arrival, after.arrival)}${changeRow('예상 만남', before.meet, after.meet)}${changeRow('추천 출발 시간', before.departure, after.departure)}
      <p class="intro-change__note">${icon('clock')}<span>도착 시각이 변경되어 출발 시각을 다시 계산했어요.</span></p>
      <p class="caption">${EXAMPLE.checkedAt} 확인 · 예시 화면이에요.</p>
    </div>
  </div>`;
};

const ART = { value: valueArt, how: howArt, change: changeArt };

function slideHtml(page, index, count) {
  return `
    <section class="intro-slide" role="group" aria-roledescription="소개" aria-label="${index + 1} / ${count}" data-index="${index}">
      <div class="intro-art">${ART[page.id]()}</div>
      <div class="intro-copy">
        <h1 class="intro-title" tabindex="-1">${page.title}</h1>
        <p class="intro-body">${page.body}</p>
      </div>
    </section>`;
}

export function renderOnboarding({ main, footer }, ctx) {
  const count = ONBOARDING_PAGES.length;
  let index = 0;

  const finish = () => {
    save(markOnboardingDone(load()));
    location.replace('#/flight'); // 뒤로 가기로 온보딩에 되돌아오지 않게 기록을 바꿔 끼운다
  };

  // ── 1. 로고만 보이는 첫 화면. 시간이 지나거나 화면을 누르면 소개로 넘어간다.
  main.innerHTML = splashHtml();
  const splash = main.querySelector('.intro-splash');
  let timer = setTimeout(showPager, SPLASH_MS);
  splash.addEventListener('click', showPager);

  // ── 2. 소개 페이지
  function showPager() {
    clearTimeout(timer);
    if (!main.isConnected || !splash.isConnected) return; // 그 사이 다른 화면으로 갔거나 이미 넘어왔다

    main.innerHTML = `
      <div class="intro-pager intro-fade-in" aria-roledescription="캐러셀" aria-label="마중 소개">
        <div class="intro-track">${ONBOARDING_PAGES.map((page, i) => slideHtml(page, i, count)).join('')}</div>
      </div>`;
    footer.innerHTML = `
      <div class="intro-dots" role="img" aria-label="" >${ONBOARDING_PAGES.map(() => '<span class="intro-dots__dot"></span>').join('')}</div>
      <button id="intro-next" class="btn btn--primary" type="button"></button>
      <button id="intro-second" class="btn btn--text intro-second" type="button"></button>`;
    footer.classList.add('intro-fade-in');

    const pager = main.querySelector('.intro-pager');
    const track = main.querySelector('.intro-track');
    const slides = [...track.children];
    const dots = [...footer.querySelectorAll('.intro-dots__dot')];
    const dotsEl = footer.querySelector('.intro-dots');
    const nextBtn = footer.querySelector('#intro-next');
    const secondBtn = footer.querySelector('#intro-second');
    let secondAction = 'skip';

    /** 카드가 위에서 아래로 티켓처럼 출력된다 (clip-path, 500ms). 움직임 줄이기가 켜져 있으면 바로 보여 준다 */
    function printCard(slide) {
      if (prefersReducedMotion()) return;
      slide.querySelector('.intro-art > *')?.animate(
        { clipPath: ['inset(0 0 100% 0)', 'inset(0 0 0 0)'] },
        { duration: PRINT_MS, easing: 'linear', fill: 'backwards' },
      );
    }

    /** 화면을 index 에 맞춘다. 가려진 장은 키보드·화면 읽기에서 뺀다. */
    function sync({ focusTitle }) {
      track.style.transform = `translateX(${-index * 100}%)`;
      slides.forEach((slide, i) => {
        slide.inert = i !== index;
        slide.setAttribute('aria-hidden', String(i !== index));
        slide.classList.toggle('is-active', i === index);
      });
      printCard(slides[index]);
      dots.forEach((dot, i) => dot.classList.toggle('is-current', i === index));
      dotsEl.setAttribute('aria-label', `${count}단계 중 ${index + 1}단계`);
      const controls = pageControls(index, count);
      nextBtn.textContent = controls.primary;
      secondBtn.textContent = controls.secondary.label;
      secondAction = controls.secondary.action;
      if (focusTitle) slides[index].querySelector('.intro-title').focus({ preventScroll: true });
    }

    function go(next, { focusTitle = true } = {}) {
      const target = clampPage(next, count);
      if (target === index) return;
      index = target;
      sync({ focusTitle });
    }

    nextBtn.addEventListener('click', () => (index === count - 1 ? finish() : go(index + 1)));
    secondBtn.addEventListener('click', () => (secondAction === 'skip' ? finish() : go(index - 1)));

    // 옆으로 밀어 넘기기 (세로 스크롤은 그대로 둔다)
    let start = null;
    pager.addEventListener('pointerdown', (event) => { start = { x: event.clientX, y: event.clientY }; });
    pager.addEventListener('pointerup', (event) => {
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      start = null;
      if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy)) go(index + (dx < 0 ? 1 : -1));
    });
    pager.addEventListener('pointercancel', () => { start = null; });
    pager.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') go(index + 1);
      else if (event.key === 'ArrowLeft') go(index - 1);
    });

    sync({ focusTitle: false });
  }
}
