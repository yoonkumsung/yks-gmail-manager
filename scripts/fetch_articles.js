/**
 * 뉴스레터 내 원문 링크 크롤링
 *
 * 뉴스레터 본문에서 "더 알아보기", "기사 읽기" 등의 링크를 추출하고
 * 해당 URL을 방문하여 기사 본문을 가져옵니다.
 */

const { htmlToText } = require('./html_to_text');

let fetchModule = null;
// 테스트용 hook: setFetchForTesting(fn)으로 fetch 구현 교체 가능
let _testFetch = null;
async function getFetch() {
  if (_testFetch) return _testFetch;
  if (!fetchModule) {
    fetchModule = (await import('node-fetch')).default;
  }
  return fetchModule;
}

/**
 * 텍스트에서 URL 추출
 * - 대괄호 [URL] 형태
 * - 일반 https:// URL
 * - 트래킹 URL (stibee, mailchimp 등) 포함
 */
function extractUrls(text) {
  const urls = new Set();

  // [URL] 형태 추출
  const bracketPattern = /\[?(https?:\/\/[^\s\]\)]+)\]?/g;
  let match;
  while ((match = bracketPattern.exec(text)) !== null) {
    urls.add(match[1]);
  }

  return [...urls];
}

/**
 * 뉴스 기사 URL만 필터링 (광고, 구독, SNS 등 제외)
 */
function filterArticleUrls(urls) {
  const excludePatterns = [
    /unsubscribe/i, /subscription/i, /manage.*preference/i,
    /facebook\.com/i, /twitter\.com/i, /x\.com/i, /instagram\.com/i,
    /linkedin\.com\/share/i, /youtube\.com/i, /tiktok\.com/i,
    /play\.google\.com/i, /apps\.apple\.com/i,
    /mailto:/i, /tel:/i,
    /\.png$/i, /\.jpg$/i, /\.gif$/i, /\.svg$/i,
    /cdn-cgi/i, /cloudflare/i,
    /page\.stibee\.com\/subscription/i,  // 구독 페이지 (기사 아님)
    /beacon/i, /pixel/i, /tracking/i
  ];

  return urls.filter(url => {
    return !excludePatterns.some(pattern => pattern.test(url));
  });
}

/**
 * URL을 따라가서 최종 URL과 HTML 본문을 가져옴
 * - 리다이렉트 추적 (stibee, mailchimp 트래킹 URL)
 * - 타임아웃 10초
 */
async function fetchUrl(url, timeoutMs = 10000) {
  const fetch = await getFetch();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
      },
      redirect: 'follow'  // 리다이렉트 자동 추적
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return null;  // HTML이 아닌 응답 무시
    }

    const html = await response.text();
    return {
      url: response.url,  // 리다이렉트 후 최종 URL
      html
    };
  } catch (e) {
    clearTimeout(timeoutId);
    return null;  // 타임아웃, 네트워크 오류 등 무시
  }
}

/**
 * HTML에서 기사 본문만 추출 (네비게이션, 광고 등 제거)
 */
function extractArticleBody(html) {
  // <article>, <main>, 또는 본문 div만 추출 시도
  let bodyHtml = html;

  // article 태그가 있으면 그 안의 내용만 사용
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) {
    bodyHtml = articleMatch[1];
  } else {
    // main 태그 시도
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (mainMatch) {
      bodyHtml = mainMatch[1];
    }
  }

  // nav, header, footer, aside, script, style 제거
  bodyHtml = bodyHtml.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  bodyHtml = bodyHtml.replace(/<header[\s\S]*?<\/header>/gi, '');
  bodyHtml = bodyHtml.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  bodyHtml = bodyHtml.replace(/<aside[\s\S]*?<\/aside>/gi, '');

  // HTML→텍스트 변환
  let text = htmlToText(bodyHtml);

  // 비-본문 패턴 제거
  const removePatterns = [
    /관련\s*기사.*$/gm,
    /추천\s*기사.*$/gm,
    /댓글\s*\d*.*$/gm,
    /Copyright.*$/gim,
    /All rights reserved.*$/gim,
    /구독.*뉴스레터.*$/gm,
    /뉴스레터를?\s*구독/gm,
    /팔로우.*$/gm,
    /^(Latest|Startups|Venture|Topics|Search|Menu|Navigation).*$/gm,
    /Share this article/gim,
    /^\s*(Facebook|Twitter|LinkedIn|Instagram|YouTube)\s*$/gm,
  ];

  for (const pattern of removePatterns) {
    text = text.replace(pattern, '');
  }

  // 빈 줄 정리
  text = text.replace(/\n{4,}/g, '\n\n\n').trim();

  return text;
}

/**
 * 뉴스레터 텍스트를 원문 링크의 전체 기사로 보강
 *
 * @param {string} newsletterText - 정제된 뉴스레터 본문
 * @param {object} options
 * @param {number} options.maxUrls - 최대 크롤링 URL 수 (기본 5)
 * @param {number} options.maxCharsPerArticle - 기사당 최대 글자수 (기본 3000)
 * @param {number} options.minArticleLength - 유효 기사 최소 길이 (기본 200)
 * @param {Function} options.log - 로깅 함수
 * @returns {string} 보강된 텍스트
 */
async function enrichWithArticles(newsletterText, options = {}) {
  const {
    maxUrls = 5,
    maxCharsPerArticle = 3000,
    minArticleLength = 200,
    log = console.log
  } = options;

  // 1. URL 추출
  const allUrls = extractUrls(newsletterText);
  const articleUrls = filterArticleUrls(allUrls);

  if (articleUrls.length === 0) {
    return newsletterText;
  }

  // 상위 N개만 처리
  const targetUrls = articleUrls.slice(0, maxUrls);
  log(`  원문 링크 ${targetUrls.length}개 크롤링 시도...`);

  // 2. 각 URL 크롤링 (순차 처리 - 서버 부하 방지)
  const fetchedArticles = [];

  for (const url of targetUrls) {
    const result = await fetchUrl(url);
    if (!result) continue;

    const articleText = extractArticleBody(result.html);
    if (articleText.length < minArticleLength) continue;

    // 기사 길이 제한
    const trimmed = articleText.length > maxCharsPerArticle
      ? articleText.substring(0, maxCharsPerArticle) + '\n[...]'
      : articleText;

    // 페이월/유료 콘텐츠 감지
    const paywallKeywords = [
      '구독자 전용', '유료 구독', '프리미엄 콘텐츠', '전문 보기',
      'subscribe to read', 'premium content', 'members only',
      'paywall', 'sign in to continue', '로그인 후 이용'
    ];
    const isPaywalled = paywallKeywords.some(kw =>
      articleText.toLowerCase().includes(kw.toLowerCase()) || result.html.toLowerCase().includes(kw.toLowerCase())
    );

    fetchedArticles.push({
      url: result.url,
      text: isPaywalled ? trimmed + '\n(유료 구독 콘텐츠 - 공개 부분만 수집)' : trimmed
    });
  }

  if (fetchedArticles.length === 0) {
    log(`  크롤링 결과 없음 (페이월/차단 등)`);
    return newsletterText;
  }

  log(`  ${fetchedArticles.length}개 원문 기사 보강 완료`);

  // 3. 원본 텍스트에 크롤링 결과 추가
  let enriched = newsletterText;
  enriched += '\n\n\n=== 원문 기사 전문 ===\n';

  for (const article of fetchedArticles) {
    enriched += `\n--- ${article.url} ---\n`;
    enriched += article.text;
    enriched += '\n';
  }

  return enriched;
}

module.exports = {
  enrichWithArticles,
  extractUrls,
  filterArticleUrls,
  fetchUrl,
  // 테스트용
  _test: {
    extractArticleBody,
    setFetch: (fn) => { _testFetch = fn; },
    resetFetch: () => { _testFetch = null; }
  }
};
