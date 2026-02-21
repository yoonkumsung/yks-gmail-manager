/**
 * HTML을 정제된 텍스트로 변환하는 스크립트
 *
 * 사용법:
 *   node scripts/html_to_text.js <input_file> [output_file]
 *   echo "<html>..." | node scripts/html_to_text.js
 *
 * Gmail 메시지의 HTML 본문을 깔끔한 텍스트로 변환합니다.
 * 뉴스레터 처리에 최적화되어 있습니다.
 */

const fs = require('fs');
const path = require('path');

/**
 * HTML 엔티티 디코딩
 */
function decodeHtmlEntities(text) {
  const entities = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&ndash;': '-',
    '&mdash;': '-',
    '&hellip;': '...',
    '&lsquo;': "'",
    '&rsquo;': "'",
    '&ldquo;': '"',
    '&rdquo;': '"',
    '&bull;': '*',
    '&middot;': '*',
    '&copy;': '(c)',
    '&reg;': '(R)',
    '&trade;': '(TM)',
  };

  let result = text;

  // Named entities
  for (const [entity, char] of Object.entries(entities)) {
    result = result.split(entity).join(char);
  }

  // Numeric entities (decimal)
  result = result.replace(/&#(\d+);/g, (_, code) => {
    return String.fromCharCode(parseInt(code, 10));
  });

  // Numeric entities (hex)
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
    return String.fromCharCode(parseInt(code, 16));
  });

  return result;
}

/**
 * HTML을 텍스트로 변환
 */
function htmlToText(html) {
  let text = html;

  // 1. 스크립트, 스타일, 헤드 태그 제거
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');

  // 2. HTML 주석 제거
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // 3. 블록 요소 앞뒤에 줄바꿈 추가
  const blockElements = [
    'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'table', 'tr', 'td', 'th',
    'article', 'section', 'header', 'footer', 'nav',
    'blockquote', 'pre', 'hr', 'br'
  ];

  for (const tag of blockElements) {
    // 여는 태그 앞에 줄바꿈
    text = text.replace(new RegExp(`<${tag}[^>]*>`, 'gi'), '\n');
    // 닫는 태그 뒤에 줄바꿈
    text = text.replace(new RegExp(`</${tag}>`, 'gi'), '\n');
  }

  // 4. <br> 태그 처리
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // 5. 링크 텍스트 추출 (URL 포함)
  text = text.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([^<]*)<\/a>/gi, (_, url, linkText) => {
    linkText = linkText.trim();
    if (linkText && url && !url.startsWith('#') && !url.startsWith('javascript:')) {
      // 뉴스레터에서 유용한 링크만 유지
      if (url.startsWith('http')) {
        return `${linkText} [${url}]`;
      }
    }
    return linkText;
  });

  // 6. 이미지 alt 텍스트 추출
  text = text.replace(/<img[^>]*alt=["']([^"']*)["'][^>]*>/gi, (_, alt) => {
    return alt ? `[이미지: ${alt}]` : '';
  });
  text = text.replace(/<img[^>]*>/gi, '');

  // 7. 나머지 HTML 태그 제거
  text = text.replace(/<[^>]+>/g, '');

  // 8. HTML 엔티티 디코딩
  text = decodeHtmlEntities(text);

  // 9. 공백 정리
  // 연속된 공백을 하나로
  text = text.replace(/[ \t]+/g, ' ');
  // 연속된 줄바꿈을 최대 2개로
  text = text.replace(/\n{3,}/g, '\n\n');
  // 각 줄의 앞뒤 공백 제거
  text = text.split('\n').map(line => line.trim()).join('\n');
  // 전체 앞뒤 공백 제거
  text = text.trim();

  return text;
}

/**
 * 뉴스레터용 텍스트 정제
 * - 추적 링크 필터링
 * - 구독 해지 문구 제거
 * - 불필요한 푸터 제거
 */
function cleanNewsletterText(text) {
  // 추적 파라미터가 있는 URL 정리
  text = text.replace(/\[https?:\/\/[^\]]*(?:utm_|click\.|track\.|redirect)[^\]]*\]/g, '');

  // 구독 관련 문구 제거
  const subscriptionPatterns = [
    /unsubscribe.*$/gim,
    /구독.*취소.*$/gim,
    /수신.*거부.*$/gim,
    /받지.*않으시려면.*$/gim,
    /view.*in.*browser.*$/gim,
    /브라우저에서.*보기.*$/gim,
    /email.*preferences.*$/gim,
    /update.*preferences.*$/gim,
  ];

  for (const pattern of subscriptionPatterns) {
    text = text.replace(pattern, '');
  }

  // 빈 괄호 제거
  text = text.replace(/\[\s*\]/g, '');
  text = text.replace(/\(\s*\)/g, '');

  // 연속된 줄바꿈 다시 정리
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();

  return text;
}

/**
 * 라인 번호가 포함된 정제 텍스트 생성
 * Claude Code의 provenance 추적용
 */
function createCleanTextWithLineNumbers(text) {
  const lines = text.split('\n');
  const result = {
    total_lines: lines.length,
    total_chars: text.length,
    full_text: text,       // 원문 전체 (호환성 유지)
    original_text: text,   // 원문 전체 (표준 필드명)
    lines: []
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim()) { // 빈 줄 제외
      result.lines.push({
        line_number: i + 1,
        content: line
      });
    }
  }

  return result;
}

// CLI 실행
async function main() {
  let html = '';

  // 인자로 파일 경로가 주어진 경우
  if (process.argv[2]) {
    const inputPath = process.argv[2];
    if (!fs.existsSync(inputPath)) {
      console.error('파일을 찾을 수 없습니다:', inputPath);
      process.exit(1);
    }
    html = fs.readFileSync(inputPath, 'utf8');
  } else {
    // stdin에서 읽기
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    html = Buffer.concat(chunks).toString('utf8');
  }

  if (!html.trim()) {
    console.error('입력이 비어있습니다.');
    process.exit(1);
  }

  // 변환
  let text = htmlToText(html);
  text = cleanNewsletterText(text);

  // 출력 파일이 지정된 경우
  if (process.argv[3]) {
    const outputPath = process.argv[3];
    fs.writeFileSync(outputPath, text, 'utf8');
    console.log(`저장됨: ${outputPath}`);
    console.log(`총 ${text.split('\n').length} 라인`);
  } else {
    // stdout으로 출력
    console.log(text);
  }
}

/**
 * HTML에서 이미지 URL 추출 (vision 모델용)
 * 작은 아이콘/추적 픽셀 제외, 콘텐츠 이미지만 추출
 */
function extractImageUrls(html) {
  const urls = [];
  const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = imgRegex.exec(html)) !== null) {
    const url = match[0];
    const src = match[1];

    // 추적 픽셀/아이콘 제외 (1x1, spacer, pixel, tracking 등)
    if (/width=["']1["']|height=["']1["']|spacer|pixel|track|beacon|open\./i.test(url)) continue;
    // data URI 제외 (너무 작은 것)
    if (src.startsWith('data:') && src.length < 200) continue;
    // http(s) URL만 포함
    if (!src.startsWith('http') && !src.startsWith('data:image')) continue;

    urls.push(src);
  }

  return urls;
}

// 모듈 내보내기
module.exports = {
  htmlToText,
  cleanNewsletterText,
  createCleanTextWithLineNumbers,
  decodeHtmlEntities,
  extractImageUrls
};

// 직접 실행시
if (require.main === module) {
  main().catch(console.error);
}
