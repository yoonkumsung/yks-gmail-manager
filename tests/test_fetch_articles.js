/**
 * fetch_articles.js 단위 테스트 — fetch mock 기반
 * setFetch/resetFetch hook으로 모든 네트워크 경로 격리
 */

const {
  enrichWithArticles,
  extractUrls,
  filterArticleUrls,
  fetchUrl,
  _test: { extractArticleBody, setFetch, resetFetch }
} = require('../scripts/fetch_articles');

module.exports = async function () {

  /**
   * Mock fetch 빌더
   * @param {function} responder - (url, options) => { ok, status, contentType, body, throw }
   */
  function mockFetch(responder) {
    return async (url, options) => {
      const r = responder(url, options) || {};
      if (r.throw) throw new Error(r.throw);

      const headers = new Map();
      headers.set('content-type', r.contentType || 'text/html; charset=utf-8');

      return {
        ok: r.ok !== false,
        status: r.status || 200,
        url: r.finalUrl || url,
        headers: {
          get: (key) => headers.get(key.toLowerCase())
        },
        text: async () => r.body || ''
      };
    };
  }

  afterEach(() => resetFetch());

  // ============================================
  // extractUrls
  // ============================================
  await describe('extractUrls', async () => {
    await it('일반 URL 추출', () => {
      const urls = extractUrls('check https://example.com/article and https://other.com');
      assert.includes(urls, 'https://example.com/article');
      assert.includes(urls, 'https://other.com');
    });

    await it('[URL] 형태 추출', () => {
      const urls = extractUrls('see [https://example.com/x]');
      assert.includes(urls, 'https://example.com/x');
    });

    await it('중복 URL 제거', () => {
      const urls = extractUrls('https://x.com https://x.com');
      assert.lengthOf(urls, 1);
    });

    await it('URL 없음 → 빈 배열', () => {
      assert.lengthOf(extractUrls('plain text'), 0);
    });

    await it('http 와 https 모두 추출', () => {
      const urls = extractUrls('http://old.com and https://new.com');
      assert.equal(urls.length, 2);
    });
  });

  // ============================================
  // filterArticleUrls
  // ============================================
  await describe('filterArticleUrls', async () => {
    await it('SNS URL 제외', () => {
      const filtered = filterArticleUrls([
        'https://facebook.com/page',
        'https://twitter.com/user',
        'https://x.com/post',
        'https://instagram.com/p/x',
        'https://youtube.com/watch?v=x',
        'https://tiktok.com/@user'
      ]);
      assert.lengthOf(filtered, 0);
    });

    await it('이미지/CDN URL 제외', () => {
      const filtered = filterArticleUrls([
        'https://example.com/photo.jpg',
        'https://x.com/img.png',
        'https://y.com/icon.svg',
        'https://z.com/anim.gif'
      ]);
      assert.lengthOf(filtered, 0);
    });

    await it('mailto/tel 제외', () => {
      const filtered = filterArticleUrls([
        'mailto:x@y.com',
        'tel:+82101234'
      ]);
      assert.lengthOf(filtered, 0);
    });

    await it('구독/언서브스크라이브 URL 제외', () => {
      const filtered = filterArticleUrls([
        'https://x.com/unsubscribe',
        'https://x.com/subscription/manage',
        'https://x.com/manage-preferences'
      ]);
      assert.lengthOf(filtered, 0);
    });

    await it('beacon/tracking 제외', () => {
      const filtered = filterArticleUrls([
        'https://x.com/beacon/123',
        'https://x.com/tracking/pixel'
      ]);
      assert.lengthOf(filtered, 0);
    });

    await it('정상 기사 URL 통과', () => {
      const filtered = filterArticleUrls([
        'https://techcrunch.com/2026/01/01/news',
        'https://bloomberg.com/article/abc'
      ]);
      assert.lengthOf(filtered, 2);
    });
  });

  // ============================================
  // fetchUrl
  // ============================================
  await describe('fetchUrl with mock', async () => {
    await it('200 HTML 응답 → {url, html} 반환', async () => {
      setFetch(mockFetch(() => ({ body: '<p>Article</p>' })));
      const result = await fetchUrl('https://example.com/article');
      assert.ok(result);
      assert.includes(result.html, 'Article');
    });

    await it('non-2xx 응답 → null', async () => {
      setFetch(mockFetch(() => ({ ok: false, status: 404 })));
      const result = await fetchUrl('https://example.com/404');
      assert.equal(result, null);
    });

    await it('JSON content-type → null (HTML 아님)', async () => {
      setFetch(mockFetch(() => ({ contentType: 'application/json', body: '{}' })));
      const result = await fetchUrl('https://example.com/api');
      assert.equal(result, null);
    });

    await it('text/plain → 통과', async () => {
      setFetch(mockFetch(() => ({ contentType: 'text/plain', body: 'plain text' })));
      const result = await fetchUrl('https://example.com/raw');
      assert.ok(result);
    });

    await it('fetch throw (네트워크 에러) → null', async () => {
      setFetch(mockFetch(() => ({ throw: 'network error' })));
      const result = await fetchUrl('https://example.com/dead');
      assert.equal(result, null);
    });

    await it('타임아웃 (AbortError) → null', async () => {
      setFetch(mockFetch(() => ({ throw: 'aborted' })));
      const result = await fetchUrl('https://example.com/slow', 100);
      assert.equal(result, null);
    });

    await it('리다이렉트 결과의 최종 URL 반환', async () => {
      setFetch(mockFetch(() => ({
        body: '<p>x</p>',
        finalUrl: 'https://example.com/final-after-redirect'
      })));
      const result = await fetchUrl('https://example.com/short');
      assert.equal(result.url, 'https://example.com/final-after-redirect');
    });
  });

  // ============================================
  // extractArticleBody
  // ============================================
  await describe('extractArticleBody', async () => {
    await it('<article> 태그 안 내용만 추출', () => {
      const html = '<header>HEAD</header><article>본문이야</article><footer>FOOT</footer>';
      const text = extractArticleBody(html);
      assert.includes(text, '본문');
      assert.notIncludes(text, 'HEAD');
      assert.notIncludes(text, 'FOOT');
    });

    await it('<article> 없으면 <main> 사용', () => {
      const html = '<header>H</header><main>메인 본문</main>';
      const text = extractArticleBody(html);
      assert.includes(text, '메인 본문');
      assert.notIncludes(text, 'H</header');
    });

    await it('nav/header/footer/aside 제거', () => {
      const html = `
        <nav>NAV</nav>
        <main>핵심 내용</main>
        <aside>ASIDE</aside>
      `;
      const text = extractArticleBody(html);
      assert.includes(text, '핵심 내용');
      assert.notIncludes(text, 'NAV');
      assert.notIncludes(text, 'ASIDE');
    });

    await it('Copyright/All rights reserved 라인 제거', () => {
      const html = '<article>실제 내용\nCopyright 2026\nAll rights reserved</article>';
      const text = extractArticleBody(html);
      assert.includes(text, '실제 내용');
      assert.notIncludes(text, 'Copyright');
    });

    await it('관련 기사/추천 기사 제거', () => {
      const html = '<article>본문\n관련 기사: 다른 글\n추천 기사: 또 다른 글</article>';
      const text = extractArticleBody(html);
      assert.includes(text, '본문');
      assert.notIncludes(text, '관련 기사');
    });

    await it('Latest/Startups 메뉴 라벨 제거', () => {
      const html = '<article>Real content\nLatest news\nStartups menu</article>';
      const text = extractArticleBody(html);
      assert.includes(text, 'Real content');
      assert.notIncludes(text, 'Latest news');
    });

    await it('Share this article 제거', () => {
      const html = '<article>content here\nShare this article\nmore</article>';
      const text = extractArticleBody(html);
      assert.includes(text, 'content here');
      assert.notIncludes(text, 'Share this article');
    });
  });

  // ============================================
  // enrichWithArticles 통합 (fetch mock)
  // ============================================
  await describe('enrichWithArticles 통합', async () => {
    await it('URL 없는 텍스트 → 원본 그대로', async () => {
      const result = await enrichWithArticles('plain text without urls', { log: () => {} });
      assert.equal(result, 'plain text without urls');
    });

    await it('SNS만 있는 텍스트 → 원본 그대로 (필터됨)', async () => {
      const result = await enrichWithArticles(
        'check https://facebook.com/x',
        { log: () => {} }
      );
      assert.includes(result, 'facebook.com');
      assert.notIncludes(result, '원문 기사 전문');
    });

    await it('정상 기사 URL → 본문 보강', async () => {
      setFetch(mockFetch(() => ({
        body: '<article>' + '풍부한 기사 본문 '.repeat(50) + '</article>'
      })));
      const text = 'see https://techcrunch.com/article-12345';
      const result = await enrichWithArticles(text, { log: () => {}, maxUrls: 1 });
      assert.includes(result, '원문 기사 전문');
      assert.includes(result, '풍부한 기사 본문');
    });

    await it('짧은 본문 (minArticleLength 미달) → 보강 안 함', async () => {
      setFetch(mockFetch(() => ({ body: '<article>너무 짧음</article>' })));
      const result = await enrichWithArticles(
        'see https://example.com/short-article-12345',
        { log: () => {}, minArticleLength: 1000 }
      );
      assert.notIncludes(result, '원문 기사 전문');
    });

    await it('maxCharsPerArticle 초과 시 truncate + [...] 추가', async () => {
      setFetch(mockFetch(() => ({
        body: '<article>' + 'X'.repeat(5000) + '</article>'
      })));
      const result = await enrichWithArticles(
        'see https://example.com/long-article-12345',
        { log: () => {}, maxCharsPerArticle: 500, minArticleLength: 100 }
      );
      assert.includes(result, '[...]');
    });

    await it('paywall 키워드 감지 → "유료 구독 콘텐츠" 표시', async () => {
      setFetch(mockFetch(() => ({
        body: '<article>' + '본문 일부. '.repeat(40) + 'Subscribe to read the rest</article>'
      })));
      const result = await enrichWithArticles(
        'see https://example.com/paywall-article-12345',
        { log: () => {}, minArticleLength: 50 }
      );
      assert.includes(result, '유료 구독 콘텐츠');
    });

    await it('한국어 paywall 키워드 감지', async () => {
      setFetch(mockFetch(() => ({
        body: '<article>' + '본문 일부 내용입니다. '.repeat(20) + '구독자 전용 콘텐츠</article>'
      })));
      const result = await enrichWithArticles(
        'see https://example.com/korean-paywall-12345',
        { log: () => {}, minArticleLength: 50 }
      );
      assert.includes(result, '유료 구독 콘텐츠');
    });

    await it('모든 URL 크롤링 실패 → 원본 그대로 + "결과 없음" 로그', async () => {
      setFetch(mockFetch(() => ({ ok: false, status: 500 })));
      const logs = [];
      const result = await enrichWithArticles(
        'see https://example.com/fail1-article-12345 and https://example.com/fail2-article-12345',
        { log: (msg) => logs.push(msg), maxUrls: 2 }
      );
      assert.equal(result.includes('원문 기사 전문'), false);
      assert.ok(logs.some(l => l.includes('결과 없음')));
    });

    await it('maxUrls 옵션으로 크롤링 수 제한', async () => {
      let callCount = 0;
      setFetch(mockFetch(() => {
        callCount++;
        return { body: '<article>' + 'content '.repeat(100) + '</article>' };
      }));
      const text = Array.from({ length: 10 }, (_, i) =>
        `https://example.com/article${i}-test12345`
      ).join(' ');
      await enrichWithArticles(text, { log: () => {}, maxUrls: 2 });
      assert.equal(callCount, 2);
    });

    await it('options 누락 시 기본값으로 정상 동작', async () => {
      // log: console.log 기본값, maxUrls: 5, maxCharsPerArticle: 3000, minArticleLength: 200
      const origLog = console.log;
      console.log = () => {};
      try {
        const result = await enrichWithArticles('plain text', {});
        assert.equal(result, 'plain text');
      } finally {
        console.log = origLog;
      }
    });
  });
};
