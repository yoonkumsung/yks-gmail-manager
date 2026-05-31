/**
 * generate_html.js 단위 테스트
 * - faviconImg / extractDomainForFavicon
 * - safeUrl, safeId, formatReceivedAtKST
 * - renderStatsBento 통계 카드 출력
 */

const {
  escapeHtml,
  getLabelColor,
  LABEL_COLORS,
  _test: {
    extractDomainForFavicon,
    faviconImg,
    safeUrl,
    safeId,
    formatReceivedAtKST,
    renderStatsBento
  }
} = require('../scripts/generate_html');

module.exports = async function () {

  await describe('extractDomainForFavicon', async () => {
    await it('일반 이메일에서 도메인 추출', () => {
      assert.equal(extractDomainForFavicon('markets@axios.com'), 'axios.com');
    });

    await it('서브도메인 mail. 제거', () => {
      assert.equal(extractDomainForFavicon('news@mail.example.com'), 'example.com');
    });

    await it('서브도메인 e. 제거 (e.scmp.com)', () => {
      assert.equal(extractDomainForFavicon('news@e.scmp.com'), 'scmp.com');
    });

    await it('일반 서브도메인 newsletter., bounce. 제거', () => {
      assert.equal(extractDomainForFavicon('x@newsletter.foo.io'), 'foo.io');
      assert.equal(extractDomainForFavicon('x@bounce.bar.co'), 'bar.co');
    });

    await it('비일반 서브도메인은 보존', () => {
      // joinsuperhuman.ai는 일반명 아님, 통째로 도메인
      assert.equal(extractDomainForFavicon('superhuman@joinsuperhuman.ai'), 'joinsuperhuman.ai');
    });

    await it('null/빈/잘못된 입력 → 빈 문자열', () => {
      assert.equal(extractDomainForFavicon(null), '');
      assert.equal(extractDomainForFavicon(''), '');
      assert.equal(extractDomainForFavicon('notanemail'), '');
      assert.equal(extractDomainForFavicon('a@b'), '');  // TLD 없음
    });

    await it('대문자 → 소문자', () => {
      assert.equal(extractDomainForFavicon('User@Mail.EXAMPLE.com'), 'example.com');
    });
  });

  await describe('faviconImg', async () => {
    await it('유효 이메일 → img 태그 반환', () => {
      const html = faviconImg('news@axios.com');
      assert.includes(html, '<img');
      assert.includes(html, 'class="item-favicon"');
      assert.includes(html, 'google.com/s2/favicons');
      assert.includes(html, 'axios.com');
      assert.includes(html, 'loading="lazy"');
      assert.includes(html, 'onerror=');
    });

    await it('빈/잘못된 이메일 → 빈 문자열', () => {
      assert.equal(faviconImg(null), '');
      assert.equal(faviconImg(''), '');
      assert.equal(faviconImg('notanemail'), '');
    });

    await it('도메인 URL 인코딩', () => {
      // 특수문자는 도메인에 없지만 encodeURIComponent 호출 자체 확인
      const html = faviconImg('x@mail.example.com');
      assert.includes(html, 'domain=example.com');  // mail. 제거됨
    });
  });

  await describe('safeUrl', async () => {
    await it('http/https URL 통과', () => {
      assert.equal(safeUrl('https://example.com'), 'https://example.com');
      assert.equal(safeUrl('http://example.com'), 'http://example.com');
    });

    await it('mailto 통과', () => {
      assert.equal(safeUrl('mailto:x@y.com'), 'mailto:x@y.com');
    });

    await it('javascript: 차단', () => {
      assert.equal(safeUrl('javascript:alert(1)'), '');
    });

    await it('data: URL 차단', () => {
      assert.equal(safeUrl('data:text/html,<script>'), '');
    });

    await it('상대 경로 / # 통과', () => {
      assert.equal(safeUrl('/path'), '/path');
      assert.equal(safeUrl('#anchor'), '#anchor');
    });

    await it('null/빈 → 빈 문자열', () => {
      assert.equal(safeUrl(null), '');
      assert.equal(safeUrl(''), '');
      assert.equal(safeUrl('   '), '');
    });

    await it('잘못된 https URL → 빈 문자열', () => {
      // new URL이 throw하는 경우
      assert.equal(safeUrl('https://'), '');
    });
  });

  await describe('safeId', async () => {
    await it('한글 라벨 보존', () => {
      assert.equal(safeId('경제'), '경제');
      assert.equal(safeId('IT'), 'IT');
    });

    await it('슬래시 → 언더스코어', () => {
      assert.equal(safeId('IT/AI'), 'IT_AI');
    });

    await it('공백 → 언더스코어', () => {
      assert.equal(safeId('소셜 포럼'), '소셜_포럼');
    });
  });

  await describe('formatReceivedAtKST', async () => {
    await it('ISO 문자열 → MM/DD HH:MM 포맷', () => {
      const result = formatReceivedAtKST('2026-03-15T01:30:00Z');
      // UTC 01:30 + 9h = KST 10:30, 3/15
      assert.equal(result, '03/15 10:30');
    });

    await it('null/빈 → 빈 문자열', () => {
      assert.equal(formatReceivedAtKST(null), '');
      assert.equal(formatReceivedAtKST(''), '');
    });

    await it('잘못된 날짜 → 빈 문자열', () => {
      assert.equal(formatReceivedAtKST('not-a-date'), '');
    });
  });

  await describe('renderStatsBento (사용자 관점)', async () => {
    await it('아이템/출처/읽기시간 카드 3개 출력', () => {
      const labels = [
        { items: [
          { source: 'Axios', summary: 'A'.repeat(400), title: '뉴스1' },
          { source: 'Axios', summary: 'B'.repeat(400), title: '뉴스2' },
          { source: 'Bloomberg', summary: 'C'.repeat(400), title: '뉴스3' }
        ]}
      ];
      const html = renderStatsBento(null, labels);

      assert.includes(html, '모은 뉴스');
      assert.includes(html, '출처');
      assert.includes(html, '예상 읽기 시간');
      // 3개 아이템
      assert.includes(html, '>3<');
      // 2개 출처 (Axios, Bloomberg)
      assert.includes(html, '>2<');
    });

    await it('runStats 없으면 시스템 정보는 - 로 표시', () => {
      const html = renderStatsBento(null, [{ items: [{ source: 'X', summary: 'A' }] }]);
      assert.includes(html, '처리 시간</span> -');
      assert.includes(html, 'API 호출</span> -회');
    });

    await it('runStats 있으면 토큰/비용 표시', () => {
      const stats = {
        duration_ms: 65000,
        usage: { totalPromptTokens: 50000, totalCompletionTokens: 30000, totalCalls: 42 },
        cost: { total_usd: 0.123 }
      };
      const html = renderStatsBento(stats, [{ items: [{ source: 'X', summary: 'A' }] }]);
      assert.includes(html, '1m 5s');
      assert.includes(html, '80K');  // 80000 tokens
      assert.includes(html, '42회');
      assert.includes(html, '$0.123');
    });

    await it('빈 라벨 데이터 안전 처리', () => {
      const html = renderStatsBento(null, []);
      assert.includes(html, '>0<');  // 0개
    });

    await it('source_email만 있어도 출처 카운트', () => {
      const labels = [{ items: [
        { source_email: 'a@x.com', summary: 'A', title: 'T' },
        { source_email: 'b@y.com', summary: 'B', title: 'T' }
      ]}];
      const html = renderStatsBento(null, labels);
      assert.includes(html, '>2<');
    });
  });

  await describe('escapeHtml (XSS 방어)', async () => {
    await it('script 태그 escape', () => {
      const result = escapeHtml('<script>alert(1)</script>');
      assert.notIncludes(result, '<script>');
      assert.includes(result, '&lt;script&gt;');
    });

    await it('따옴표 escape', () => {
      const result = escapeHtml(`"single' "double"`);
      assert.includes(result, '&quot;');
      assert.includes(result, '&#039;');
    });

    await it('null/undefined → 빈 문자열', () => {
      assert.equal(escapeHtml(null), '');
      assert.equal(escapeHtml(undefined), '');
    });

    await it('숫자 → 문자열', () => {
      assert.equal(escapeHtml(42), '42');
    });
  });

  await describe('getLabelColor', async () => {
    await it('정의된 라벨 → 고유 색상', () => {
      assert.equal(getLabelColor('IT'), '#3b82f6');
      assert.equal(getLabelColor('경제'), '#10b981');
    });

    await it('정의 안 된 라벨 → 기본 색상', () => {
      const color = getLabelColor('알수없는라벨');
      assert.ok(color.startsWith('#'));
    });

    await it('LABEL_COLORS 객체 export 확인', () => {
      assert.ok(LABEL_COLORS);
      assert.ok(typeof LABEL_COLORS === 'object');
      assert.gt(Object.keys(LABEL_COLORS).length, 0);
    });
  });
};
