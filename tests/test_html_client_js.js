/**
 * generate_html.js가 생성하는 HTML + 클라이언트 JS를 jsdom에서 실행
 * 검증 영역:
 *  - 탭 전환
 *  - 검색 input (모달 + 헤더 인라인) 양방향 동기화
 *  - 필터 칩 활성화 + dot 표시
 *  - 모달 열기/닫기 (검색/필터/통계)
 *  - 모바일 점진 공개 (더 보기 버튼)
 *  - 검색 활성 시 자동 펼침
 *  - 미니맵 (작동 자체)
 *  - 그룹핑 토글 (라벨별 ↔ 출처별)
 */

const { JSDOM } = require('jsdom');
const { generateCombinedHtmlReport } = require('../scripts/generate_html');

module.exports = async function () {

  function buildDom(allLabelsData, opts = {}) {
    const html = generateCombinedHtmlReport(
      allLabelsData,
      opts.date || '2026-05-31',
      opts.excludedMails || [],
      opts.runStats || null
    );

    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      resources: 'usable',
      url: 'http://localhost/'  // sessionStorage 사용을 위해 명시적 origin 필요
    });

    // jsdom은 IntersectionObserver를 기본 미지원 → polyfill
    dom.window.IntersectionObserver = class {
      constructor() {}
      observe() {}
      disconnect() {}
    };

    return dom;
  }

  function makeSampleData(itemCount = 3, opts = {}) {
    const items = Array.from({ length: itemCount }, (_, i) => ({
      title: `뉴스 ${i + 1}`,
      summary: 'A'.repeat(opts.summaryLen || 300),
      keywords: ['뉴스', '키워드'],
      source: `출처${i % 3}`,
      source_email: `source${i % 3}@example.com`,
      link: i % 2 === 0 ? `https://example.com/${i}` : '',
      message_id: `msg_${i}`,
      received_at: '2026-05-31T01:30:00Z'
    }));
    return [{
      label: opts.label || 'IT',
      items,
      stats: { duplicates_removed: 0 }
    }];
  }

  await describe('HTML 구조 검증', async () => {
    await it('헤더에 인라인 검색 input + 모달 input 둘 다 존재', () => {
      const dom = buildDom(makeSampleData(3));
      const headerSearch = dom.window.document.getElementById('search-input-header');
      const modalSearch = dom.window.document.getElementById('search-input');
      assert.ok(headerSearch, 'header inline search input 누락');
      assert.ok(modalSearch, 'modal search input 누락');
    });

    await it('탭 버튼 라벨 수 = data 길이', () => {
      const dom = buildDom([
        { label: 'IT', items: [{ title: 'a', summary: 'a' }], stats: {} },
        { label: '경제', items: [{ title: 'b', summary: 'b' }], stats: {} }
      ]);
      const tabs = dom.window.document.querySelectorAll('.tab-btn');
      assert.equal(tabs.length, 2);
    });

    await it('통계 카드 3개 (모은 뉴스/출처/예상 읽기 시간)', () => {
      const dom = buildDom(makeSampleData(5));
      const primaryCards = dom.window.document.querySelectorAll('.stats-bento-card-primary');
      assert.equal(primaryCards.length, 3);
    });

    await it('모바일 점진 공개: 6개 이상이면 더 보기 버튼 노출', () => {
      const dom = buildDom(makeSampleData(10));
      const btn = dom.window.document.querySelector('.mobile-show-more');
      assert.ok(btn);
      assert.includes(btn.textContent, '5개 더 보기');  // 10 - 5 = 5
    });

    await it('5개 이하면 더 보기 버튼 없음', () => {
      const dom = buildDom(makeSampleData(5));
      const btn = dom.window.document.querySelector('.mobile-show-more');
      assert.notOk(btn);
    });

    await it('파비콘 img 태그 포함', () => {
      const dom = buildDom(makeSampleData(3));
      const favicons = dom.window.document.querySelectorAll('img.item-favicon');
      assert.gt(favicons.length, 0);
      const src = favicons[0].getAttribute('src');
      assert.includes(src, 'google.com/s2/favicons');
      assert.includes(src, 'example.com');
    });

    await it('아이템 카드의 data-has-link 속성', () => {
      const dom = buildDom(makeSampleData(4));  // 짝수 인덱스는 link 있음
      const items = dom.window.document.querySelectorAll('.item');
      const withLink = Array.from(items).filter(i => i.dataset.hasLink === 'true');
      const withoutLink = Array.from(items).filter(i => i.dataset.hasLink === 'false');
      assert.gt(withLink.length, 0);
      assert.gt(withoutLink.length, 0);
    });
  });

  await describe('탭 전환 동작', async () => {
    await it('탭 클릭 → active 전환', () => {
      const dom = buildDom([
        { label: 'IT', items: [{ title: 'a', summary: 'a' }], stats: {} },
        { label: '경제', items: [{ title: 'b', summary: 'b' }], stats: {} }
      ]);
      const doc = dom.window.document;

      // 초기: 첫 탭 active
      const tabs = doc.querySelectorAll('.tab-btn');
      assert.equal(tabs[0].classList.contains('active'), true);
      assert.equal(tabs[1].classList.contains('active'), false);

      // 두 번째 탭 클릭
      tabs[1].click();

      assert.equal(tabs[0].classList.contains('active'), false);
      assert.equal(tabs[1].classList.contains('active'), true);
    });
  });

  await describe('검색 input 양방향 동기화', async () => {
    await it('헤더 입력 → 모달 input 값 동기화', () => {
      const dom = buildDom(makeSampleData(3));
      const doc = dom.window.document;
      const headerInput = doc.getElementById('search-input-header');
      const modalInput = doc.getElementById('search-input');

      headerInput.value = '테스트';
      headerInput.dispatchEvent(new dom.window.Event('input'));

      assert.equal(modalInput.value, '테스트');
    });

    await it('모달 입력 → 헤더 input 값 동기화', () => {
      const dom = buildDom(makeSampleData(3));
      const doc = dom.window.document;
      const headerInput = doc.getElementById('search-input-header');
      const modalInput = doc.getElementById('search-input');

      modalInput.value = '검색어';
      modalInput.dispatchEvent(new dom.window.Event('input'));

      assert.equal(headerInput.value, '검색어');
    });
  });

  await describe('필터 칩 동작', async () => {
    await it('필터 칩 클릭 → active 클래스 토글 + dot 표시', async () => {
      const dom = buildDom(makeSampleData(5));
      const doc = dom.window.document;
      const allChip = doc.querySelector('.filter-chip[data-filter="all"]');
      const linkChip = doc.querySelector('.filter-chip[data-filter="has-link"]');
      const filterBtn = doc.getElementById('filter-btn');

      assert.equal(allChip.classList.contains('active'), true);
      assert.equal(filterBtn.classList.contains('has-active'), false);

      linkChip.click();

      assert.equal(linkChip.classList.contains('active'), true);
      assert.equal(allChip.classList.contains('active'), false);
      assert.equal(filterBtn.classList.contains('has-active'), true);
    });

    await it('전체 칩 다시 클릭 → 필터 해제', () => {
      const dom = buildDom(makeSampleData(5));
      const doc = dom.window.document;
      const allChip = doc.querySelector('.filter-chip[data-filter="all"]');
      const linkChip = doc.querySelector('.filter-chip[data-filter="has-link"]');
      const filterBtn = doc.getElementById('filter-btn');

      linkChip.click();
      assert.equal(filterBtn.classList.contains('has-active'), true);

      allChip.click();
      assert.equal(allChip.classList.contains('active'), true);
      assert.equal(filterBtn.classList.contains('has-active'), false);
    });
  });

  await describe('모달 열기/닫기', async () => {
    await it('search 버튼 클릭 → search-modal open 클래스', () => {
      const dom = buildDom(makeSampleData(3));
      const doc = dom.window.document;
      const btn = doc.getElementById('search-btn');
      const modal = doc.getElementById('search-modal');

      assert.equal(modal.classList.contains('open'), false);
      btn.click();
      assert.equal(modal.classList.contains('open'), true);
    });

    await it('백드롭 클릭 → 모달 닫힘', () => {
      const dom = buildDom(makeSampleData(3));
      const doc = dom.window.document;
      const btn = doc.getElementById('stats-btn');
      const modal = doc.getElementById('stats-modal');

      btn.click();
      assert.equal(modal.classList.contains('open'), true);

      // 백드롭(=모달 자체) 클릭. e.target === backdrop 이어야 함.
      const event = new dom.window.MouseEvent('click', { bubbles: true });
      Object.defineProperty(event, 'target', { value: modal });
      modal.dispatchEvent(event);

      assert.equal(modal.classList.contains('open'), false);
    });

    await it('ESC 키 → 열린 모달 닫힘', () => {
      const dom = buildDom(makeSampleData(3));
      const doc = dom.window.document;
      const btn = doc.getElementById('filter-btn');
      const modal = doc.getElementById('filter-modal');

      btn.click();
      assert.equal(modal.classList.contains('open'), true);

      doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));

      assert.equal(modal.classList.contains('open'), false);
    });
  });

  await describe('모바일 점진 공개', async () => {
    await it('더 보기 클릭 → items-list expanded + 버튼 hidden', () => {
      const dom = buildDom(makeSampleData(10));
      const doc = dom.window.document;
      const btn = doc.querySelector('.mobile-show-more');
      const list = btn.previousElementSibling;

      assert.equal(list.classList.contains('expanded'), false);
      assert.equal(btn.classList.contains('hidden'), false);

      btn.click();

      assert.equal(list.classList.contains('expanded'), true);
      assert.equal(btn.classList.contains('hidden'), true);
      assert.equal(list.dataset.userExpanded, 'true');
    });

    await it('검색 활성 → 모든 items-list 자동 expanded', () => {
      const dom = buildDom(makeSampleData(10));
      const doc = dom.window.document;
      const input = doc.getElementById('search-input');
      const list = doc.querySelector('.items-list');

      assert.equal(list.classList.contains('expanded'), false);

      // 검색 입력 (debounce 우회: 직접 input 이벤트 dispatch + sleep)
      input.value = '뉴스';
      input.dispatchEvent(new dom.window.Event('input'));

      // 검색 디바운스(160ms) 대기
      return new Promise(resolve => setTimeout(() => {
        assert.equal(list.classList.contains('expanded'), true);
        resolve();
      }, 250));
    });
  });

  await describe('그룹핑 토글 (라벨별 ↔ 출처별)', async () => {
    await it('출처별 클릭 → source-group-header 생성', () => {
      const dom = buildDom(makeSampleData(6));  // 3가지 출처
      const doc = dom.window.document;
      const sourceBtn = doc.querySelector('.grouping-toggle-btn[data-group="source"]');

      const beforeHeaders = doc.querySelectorAll('.source-group-header').length;
      assert.equal(beforeHeaders, 0);

      sourceBtn.click();

      const afterHeaders = doc.querySelectorAll('.source-group-header').length;
      assert.gt(afterHeaders, 0);
      assert.equal(sourceBtn.classList.contains('active'), true);
    });
  });

  await describe('XSS 방어 검증 (jsdom 렌더링)', async () => {
    await it('제목에 script 태그 → escape됨, 실행 안 됨', () => {
      const data = [{
        label: 'IT',
        items: [{
          title: '<script>window.__pwned = true;</script>제목',
          summary: '요약',
          keywords: ['k'],
          source_email: 'x@y.com'
        }],
        stats: {}
      }];
      const dom = buildDom(data);
      // 스크립트 실행되지 않았어야 함
      assert.equal(dom.window.__pwned, undefined);
      // DOM에 escape된 형태로 들어감
      const titleEl = dom.window.document.querySelector('.item-title');
      assert.includes(titleEl.textContent, '<script>');  // text로 표시
      // innerHTML에는 escape된 형태
      assert.includes(titleEl.innerHTML, '&lt;script&gt;');
    });

    await it('악성 link → safeUrl가 차단', () => {
      const data = [{
        label: 'IT',
        items: [{
          title: 'test',
          summary: 's',
          keywords: ['k'],
          link: 'javascript:alert(1)',
          source_email: 'x@y.com'
        }],
        stats: {}
      }];
      const dom = buildDom(data);
      const links = dom.window.document.querySelectorAll('.item-btn-primary');
      // javascript: 차단되어 원문 보기 버튼 없음
      assert.equal(links.length, 0);
    });
  });
};
