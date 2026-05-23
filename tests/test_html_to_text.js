/**
 * html_to_text.js 단위 테스트
 * 테스트 대상: HTML 파싱, 엔티티 디코딩, URL 정리, 뉴스레터 정제, 비뉴스 필터링
 */

const {
  htmlToText,
  htmlToStructuredMarkdown,
  cleanNewsletterText,
  cleanNewsletterMarkdown,
  createCleanTextWithLineNumbers,
  decodeHtmlEntities,
  extractImageUrls,
  cleanTrackingParams,
  isNonNewsEmail,
  enrichLinkAggregator,
} = require('../scripts/html_to_text');

module.exports = async function () {

  // ============================================
  // decodeHtmlEntities
  // ============================================

  await describe('decodeHtmlEntities', async () => {
    await it('기본 HTML 엔티티 변환', () => {
      assert.equal(decodeHtmlEntities('&amp;'), '&');
      assert.equal(decodeHtmlEntities('&lt;'), '<');
      assert.equal(decodeHtmlEntities('&gt;'), '>');
      assert.equal(decodeHtmlEntities('&quot;'), '"');
      assert.equal(decodeHtmlEntities('&#39;'), "'");
    });

    await it('특수 엔티티 변환', () => {
      assert.equal(decodeHtmlEntities('&ndash;'), '–');
      assert.equal(decodeHtmlEntities('&mdash;'), '—');
      assert.equal(decodeHtmlEntities('&hellip;'), '…');
      assert.equal(decodeHtmlEntities('&nbsp;'), ' ');
    });

    await it('숫자 엔티티 (10진수)', () => {
      assert.equal(decodeHtmlEntities('&#65;'), 'A');
      assert.equal(decodeHtmlEntities('&#44032;'), '가');  // 한글
    });

    await it('숫자 엔티티 (16진수)', () => {
      assert.equal(decodeHtmlEntities('&#x41;'), 'A');
      assert.equal(decodeHtmlEntities('&#xAC00;'), '가');
    });

    await it('복합 엔티티', () => {
      const input = 'AT&amp;T &ldquo;Hello&rdquo; 100&deg;C';
      const result = decodeHtmlEntities(input);
      assert.includes(result, 'AT&T');
      assert.includes(result, '\u201CHello\u201D');
      assert.includes(result, '100°C');
    });

    await it('엔티티 없는 텍스트 → 그대로', () => {
      assert.equal(decodeHtmlEntities('Hello World'), 'Hello World');
    });

    await it('빈/null 입력', () => {
      assert.equal(decodeHtmlEntities(''), '');
    });

    await it('잘못된 숫자 엔티티 → 빈 문자열', () => {
      assert.equal(decodeHtmlEntities('&#99999999;'), '');
    });

    await it('화폐 기호', () => {
      assert.equal(decodeHtmlEntities('&yen;'), '¥');
      assert.equal(decodeHtmlEntities('&euro;'), '€');
      assert.equal(decodeHtmlEntities('&pound;'), '£');
    });
  });

  // ============================================
  // cleanTrackingParams
  // ============================================

  await describe('cleanTrackingParams', async () => {
    await it('UTM 파라미터 제거', () => {
      const url = 'https://example.com/article?utm_source=newsletter&utm_medium=email&id=123';
      const cleaned = cleanTrackingParams(url);
      assert.notIncludes(cleaned, 'utm_source');
      assert.notIncludes(cleaned, 'utm_medium');
      assert.includes(cleaned, 'id=123');
    });

    await it('fbclid/gclid 제거', () => {
      const url = 'https://example.com/?fbclid=abc123&gclid=xyz789';
      const cleaned = cleanTrackingParams(url);
      assert.notIncludes(cleaned, 'fbclid');
      assert.notIncludes(cleaned, 'gclid');
    });

    await it('추적 파라미터 없는 URL → 그대로', () => {
      const url = 'https://example.com/article?page=2&sort=date';
      const cleaned = cleanTrackingParams(url);
      assert.includes(cleaned, 'page=2');
      assert.includes(cleaned, 'sort=date');
    });

    await it('null/빈 URL → 그대로', () => {
      assert.equal(cleanTrackingParams(null), null);
      assert.equal(cleanTrackingParams(''), '');
    });

    await it('비 HTTP URL → 그대로', () => {
      assert.equal(cleanTrackingParams('ftp://server/file'), 'ftp://server/file');
      assert.equal(cleanTrackingParams('mailto:test@test.com'), 'mailto:test@test.com');
    });

    await it('잘못된 URL → 그대로', () => {
      assert.equal(cleanTrackingParams('http://[invalid'), 'http://[invalid');
    });

    await it('모든 추적 파라미터 종류', () => {
      const params = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'mc_cid', 'mc_eid', 'fbclid', 'gclid', '_hsenc', '_hsmi',
        'mkt_tok', '__s', 'ss_source', 'bbeml', 'sc_campaign', '_ke'
      ];
      const url = 'https://example.com/?' + params.map(p => `${p}=val`).join('&');
      const cleaned = cleanTrackingParams(url);
      for (const p of params) {
        assert.notIncludes(cleaned, p, `${p} 파라미터가 제거되어야 함`);
      }
    });
  });

  // ============================================
  // htmlToStructuredMarkdown
  // ============================================

  await describe('htmlToStructuredMarkdown', async () => {
    await it('null/undefined → 빈 문자열', () => {
      assert.equal(htmlToStructuredMarkdown(null), '');
      assert.equal(htmlToStructuredMarkdown(undefined), '');
      assert.equal(htmlToStructuredMarkdown(''), '');
    });

    await it('script/style 태그 제거', () => {
      const html = '<p>내용</p><script>alert("xss")</script><style>.a{color:red}</style>';
      const result = htmlToStructuredMarkdown(html);
      assert.notIncludes(result, 'alert');
      assert.notIncludes(result, 'color:red');
      assert.includes(result, '내용');
    });

    await it('bold/italic → 마크다운', () => {
      const html = '<strong>굵게</strong> <em>기울임</em>';
      const result = htmlToStructuredMarkdown(html);
      assert.includes(result, '**굵게**');
      assert.includes(result, '*기울임*');
    });

    await it('헤딩 → 마크다운 헤딩', () => {
      const html = '<h1>제목1</h1><h2>제목2</h2><h3>제목3</h3>';
      const result = htmlToStructuredMarkdown(html);
      assert.includes(result, '# 제목1');
      assert.includes(result, '## 제목2');
      assert.includes(result, '### 제목3');
    });

    await it('링크 → 마크다운 링크 (UTM 파라미터 제거)', () => {
      const html = '<a href="https://example.com/article?utm_source=email">기사 링크</a>';
      const result = htmlToStructuredMarkdown(html);
      assert.includes(result, '[기사 링크]');
      assert.notIncludes(result, 'utm_source');
    });

    await it('ul/ol 리스트 → 마크다운', () => {
      const html = '<ul><li>항목1</li><li>항목2</li></ul>';
      const result = htmlToStructuredMarkdown(html);
      assert.includes(result, '- 항목1');
      assert.includes(result, '- 항목2');
    });

    await it('ol 리스트 → 번호 매김', () => {
      const html = '<ol><li>첫째</li><li>둘째</li></ol>';
      const result = htmlToStructuredMarkdown(html);
      assert.includes(result, '1. 첫째');
      assert.includes(result, '2. 둘째');
    });

    await it('hr → SECTION_BREAK', () => {
      const html = '<p>위</p><hr><p>아래</p>';
      const result = htmlToStructuredMarkdown(html);
      assert.includes(result, '---SECTION_BREAK---');
    });

    await it('HTML 주석 제거', () => {
      const html = '<p>내용</p><!-- 주석 --><p>계속</p>';
      const result = htmlToStructuredMarkdown(html);
      assert.notIncludes(result, '주석');
    });

    await it('데이터 테이블 → 마크다운 테이블', () => {
      const html = `<table>
        <tr><th>이름</th><th>값</th><th>단위</th></tr>
        <tr><td>GDP</td><td>1.2</td><td>%</td></tr>
        <tr><td>CPI</td><td>3.5</td><td>%</td></tr>
      </table>`;
      const result = htmlToStructuredMarkdown(html);
      assert.includes(result, '|');
      assert.includes(result, '---');
      assert.includes(result, 'GDP');
    });

    await it('실제 뉴스레터 HTML 스니펫', () => {
      const html = `
        <div class="content">
          <h2>오늘의 주요 뉴스</h2>
          <p><strong>삼성전자</strong>가 1분기 실적을 발표했다.
            영업이익은 <em>10조원</em>을 기록했다.
            <a href="https://news.example.com/samsung?utm_source=newsletter">자세히 보기</a>
          </p>
          <hr>
          <h2>글로벌 소식</h2>
          <p>미국 연준이 금리를 동결했다.</p>
        </div>`;
      const result = htmlToStructuredMarkdown(html);
      assert.includes(result, '## 오늘의 주요 뉴스');
      assert.includes(result, '**삼성전자**');
      assert.includes(result, '*10조원*');
      assert.includes(result, '---SECTION_BREAK---');
      assert.includes(result, '## 글로벌 소식');
    });

    await it('head 태그 제거', () => {
      const html = '<html><head><title>테스트</title><meta charset="utf-8"></head><body><p>본문</p></body></html>';
      const result = htmlToStructuredMarkdown(html);
      assert.notIncludes(result, '<title>');
      assert.includes(result, '본문');
    });
  });

  // ============================================
  // cleanNewsletterMarkdown
  // ============================================

  await describe('cleanNewsletterMarkdown', async () => {
    await it('null → 빈 문자열', () => {
      assert.equal(cleanNewsletterMarkdown(null), '');
    });

    await it('빈 마크다운 링크 제거', () => {
      const text = '내용 [](https://tracking.com) 계속';
      const result = cleanNewsletterMarkdown(text);
      assert.notIncludes(result, '[]');
    });

    await it('구독 취소 문구 제거', () => {
      const text = '뉴스 내용\nTo unsubscribe click here\n더 많은 뉴스';
      const result = cleanNewsletterMarkdown(text);
      assert.notIncludes(result, 'unsubscribe');
    });

    await it('수신 거부 문구 제거', () => {
      const text = '내용\n수신 거부하시려면 여기를 클릭\n계속';
      const result = cleanNewsletterMarkdown(text);
      assert.notIncludes(result, '수신 거부');
    });

    await it('웹에서 보기 문구 제거', () => {
      const text = '웹에서 보기\n실제 뉴스 내용';
      const result = cleanNewsletterMarkdown(text);
      assert.notIncludes(result, '웹에서 보기');
    });

    await it('연속된 SECTION_BREAK 병합', () => {
      const text = '위\n---SECTION_BREAK---\n---SECTION_BREAK---\n---SECTION_BREAK---\n아래';
      const result = cleanNewsletterMarkdown(text);
      const breakCount = (result.match(/---SECTION_BREAK---/g) || []).length;
      assert.equal(breakCount, 1);
    });

    await it('연속 줄바꿈 3줄로 제한', () => {
      const text = '위\n\n\n\n\n\n아래';
      const result = cleanNewsletterMarkdown(text);
      assert.notIncludes(result, '\n\n\n\n');
    });

    await it('추적 링크 → 텍스트만 보존', () => {
      const text = '[기사 제목](https://click.track.example.com/redirect?url=actual)';
      const result = cleanNewsletterMarkdown(text);
      assert.includes(result, '기사 제목');
      assert.notIncludes(result, 'click.track');
    });

    await it('Powered by 문구 제거', () => {
      const text = '내용\nPowered by Stibee\n끝';
      const result = cleanNewsletterMarkdown(text);
      assert.notIncludes(result, 'Powered by');
    });
  });

  // ============================================
  // isNonNewsEmail
  // ============================================

  await describe('isNonNewsEmail', async () => {
    await it('정상 뉴스레터 → false', () => {
      const { isNonNews } = isNonNewsEmail('오늘의 IT 뉴스', 'news@example.com');
      assert.notOk(isNonNews);
    });

    await it('(광고) 시작 → true', () => {
      const { isNonNews, reason } = isNonNewsEmail('(광고) 특가 세일', 'shop@example.com');
      assert.ok(isNonNews);
      assert.includes(reason, '광고');
    });

    await it('수신 동의 갱신 → true', () => {
      const { isNonNews } = isNonNewsEmail('수신 동의 갱신 안내', 'noreply@example.com');
      assert.ok(isNonNews);
    });

    await it('비밀번호 재설정 → true', () => {
      assert.ok(isNonNewsEmail('비밀번호 재설정 안내', '').isNonNews);
      assert.ok(isNonNewsEmail('Password Reset Required', '').isNonNews);
    });

    await it('결제 완료 → true', () => {
      assert.ok(isNonNewsEmail('결제 완료 안내', '').isNonNews);
    });

    await it('verify email → true', () => {
      assert.ok(isNonNewsEmail('Verify Your Email Address', '').isNonNews);
    });

    await it('설문 조사 → true', () => {
      assert.ok(isNonNewsEmail('설문 조사 참여 안내', '').isNonNews);
      assert.ok(isNonNewsEmail('Survey: Your feedback', '').isNonNews);
    });

    await it('인사 메일 → true', () => {
      assert.ok(isNonNewsEmail('함께해 주셔서 감사합니다', '').isNonNews);
      assert.ok(isNonNewsEmail('Happy New Year!', '').isNonNews);
      assert.ok(isNonNewsEmail("Season's Greetings", '').isNonNews);
    });

    await it('null 제목 → false', () => {
      assert.notOk(isNonNewsEmail(null, 'any@email.com').isNonNews);
    });

    await it('개인정보 동의 → true', () => {
      assert.ok(isNonNewsEmail('개인정보 수집 동의 안내', '').isNonNews);
      assert.ok(isNonNewsEmail('개인정보 이용 갱신', '').isNonNews);
    });

    await it('Special Offer → true', () => {
      assert.ok(isNonNewsEmail('Special Offer: 50% off', '').isNonNews);
    });

    await it('일반 영문 뉴스레터 → false', () => {
      assert.notOk(isNonNewsEmail('The Morning Brew - Markets Update', '').isNonNews);
      assert.notOk(isNonNewsEmail('TechCrunch Daily', '').isNonNews);
    });
  });

  // ============================================
  // extractImageUrls
  // ============================================

  await describe('extractImageUrls', async () => {
    await it('콘텐츠 이미지 추출', () => {
      const html = '<img src="https://example.com/photo.jpg" alt="사진">';
      const urls = extractImageUrls(html);
      assert.lengthOf(urls, 1);
      assert.equal(urls[0], 'https://example.com/photo.jpg');
    });

    await it('추적 픽셀 제외 (1x1)', () => {
      const html = '<img src="https://track.com/pixel.gif" width="1" height="1">';
      const urls = extractImageUrls(html);
      assert.lengthOf(urls, 0);
    });

    await it('소셜 아이콘 제외', () => {
      const html = `
        <img src="https://cdn.com/facebook-icon.png">
        <img src="https://cdn.com/twitter-icon.png">
        <img src="https://example.com/real-photo.jpg">
      `;
      const urls = extractImageUrls(html);
      assert.lengthOf(urls, 1);
      assert.includes(urls[0], 'real-photo');
    });

    await it('null/빈 HTML → 빈 배열', () => {
      assert.deepEqual(extractImageUrls(null), []);
      assert.deepEqual(extractImageUrls(''), []);
    });

    await it('beacon/tracker URL 제외', () => {
      const html = '<img src="https://beacon.example.com/track?id=123">';
      const urls = extractImageUrls(html);
      assert.lengthOf(urls, 0);
    });

    await it('여러 이미지 추출', () => {
      const html = `
        <img src="https://cdn.com/img1.jpg">
        <img src="https://cdn.com/img2.png">
        <img src="https://cdn.com/img3.webp">
      `;
      const urls = extractImageUrls(html);
      assert.lengthOf(urls, 3);
    });
  });

  // ============================================
  // createCleanTextWithLineNumbers
  // ============================================

  await describe('createCleanTextWithLineNumbers', async () => {
    await it('라인 번호 생성', () => {
      const text = '첫 줄\n\n세 번째 줄';
      const result = createCleanTextWithLineNumbers(text);
      assert.equal(result.total_lines, 3);
      assert.equal(result.total_chars, text.length);
      assert.equal(result.full_text, text);
      // 빈 줄은 제외됨
      assert.lengthOf(result.lines, 2);
      assert.equal(result.lines[0].line_number, 1);
      assert.equal(result.lines[0].content, '첫 줄');
      assert.equal(result.lines[1].line_number, 3);
    });
  });

  // ============================================
  // htmlToText (하위 호환)
  // ============================================

  await describe('htmlToText (하위 호환)', async () => {
    await it('htmlToStructuredMarkdown과 동일 결과', () => {
      const html = '<p>테스트 <strong>내용</strong></p>';
      assert.equal(htmlToText(html), htmlToStructuredMarkdown(html));
    });
  });

  // ============================================
  // cleanNewsletterText (하위 호환)
  // ============================================

  await describe('cleanNewsletterText (하위 호환)', async () => {
    await it('cleanNewsletterMarkdown과 동일 결과', () => {
      const text = '내용 [](link) unsubscribe';
      assert.equal(cleanNewsletterText(text), cleanNewsletterMarkdown(text));
    });
  });

  // ============================================
  // 실제 뉴스레터 HTML 통합 테스트
  // ============================================

  await describe('실제 패턴 통합', async () => {
    await it('Stibee 뉴스레터 패턴', () => {
      const html = `
        <html>
        <head><title>뉴스레터</title></head>
        <body>
          <div style="max-width:600px">
            <h2>📌 오늘의 뉴스</h2>
            <p><strong>1. 삼성전자 실적 발표</strong></p>
            <p>삼성전자가 1분기 영업이익 10조원을 기록했다.</p>
            <a href="https://event.stibee.com/v2/click/abc123">자세히 보기</a>
            <hr>
            <p><strong>2. LG화학 배터리 공장</strong></p>
            <p>LG화학이 미국에 신규 배터리 공장을 건설한다.</p>
            <hr>
            <div class="footer">
              <p>구독 취소 | <a href="https://stibee.com/unsub">수신 거부</a></p>
              <p>Powered by Stibee</p>
            </div>
          </div>
        </body>
        </html>`;

      let text = htmlToStructuredMarkdown(html);
      text = cleanNewsletterMarkdown(text);

      // 뉴스 내용 보존
      assert.includes(text, '삼성전자');
      assert.includes(text, '10조원');
      assert.includes(text, 'LG화학');
      assert.includes(text, '배터리 공장');

      // 구독/푸터 제거
      assert.notIncludes(text, 'Powered by');

      // 섹션 분리
      assert.includes(text, '---SECTION_BREAK---');
    });

    await it('영문 뉴스레터 (TechCrunch 스타일)', () => {
      const html = `
        <div>
          <h1>TechCrunch Daily</h1>
          <h2>MARKETS</h2>
          <p><strong>NVIDIA hits $3T market cap</strong></p>
          <p>NVIDIA&rsquo;s market capitalization surpassed $3 trillion, making it the world&rsquo;s most valuable company.</p>
          <a href="https://techcrunch.com/nvidia?utm_source=newsletter&utm_medium=email">Read more</a>
          <hr>
          <h2>AI &amp; ML</h2>
          <p><strong>OpenAI launches GPT-5</strong></p>
          <p>OpenAI unveiled its latest model with &ldquo;significantly improved reasoning.&rdquo;</p>
        </div>`;

      let text = htmlToStructuredMarkdown(html);
      text = cleanNewsletterMarkdown(text);

      assert.includes(text, 'NVIDIA');
      assert.includes(text, '$3 trillion');
      assert.includes(text, 'OpenAI');
      // 엔티티 변환 확인
      assert.includes(text, '\u2019');  // rsquo
      assert.includes(text, '&');  // &amp; → &
      // UTM 제거
      assert.notIncludes(text, 'utm_source');
    });
  });

  // ============================================
  // enrichLinkAggregator (외부 fetch 없이)
  // ============================================

  await describe('enrichLinkAggregator', async () => {
    await it('빈 HTML → 원본 반환', async () => {
      const result = await enrichLinkAggregator('', '원본 텍스트');
      assert.equal(result.enriched, '원본 텍스트');
      assert.equal(result.linksFetched, 0);
    });

    await it('링크 5개 미만 → 원본 반환', async () => {
      const html = '<a href="https://a.com">A</a><a href="https://b.com">BB</a>';
      const result = await enrichLinkAggregator(html, '원본');
      assert.equal(result.linksFetched, 0);
    });

    await it('이미 충분한 본문 → fetch 안 함', async () => {
      // 링크 10개 있지만 본문이 충분히 긴 경우 (링크당 150자 이상)
      const links = [];
      for (let i = 0; i < 10; i++) {
        links.push(`<a href="https://example${i}.com/article">Article Title Number ${i+1}</a>`);
      }
      const html = links.join('\n');
      const longText = '뉴스 본문 '.repeat(500);  // ~3000자
      const result = await enrichLinkAggregator(html, longText);
      assert.equal(result.linksFetched, 0);
    });
  });
};
