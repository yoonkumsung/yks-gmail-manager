/**
 * HTML을 구조화된 마크다운으로 변환하는 스크립트
 *
 * 개선 사항 (v2):
 * - 시맨틱 HTML 태그를 마크다운으로 변환 (h1-h6, strong, em, table, list, blockquote)
 * - 아이템 경계 마커 보존 (hr → ---SECTION_BREAK---)
 * - 링크 URL 보존 (UTM/추적 파라미터만 제거, base URL 유지)
 * - 테이블 → 마크다운 테이블 변환 (레이아웃 테이블 자동 감지)
 * - 리스트 → 마크다운 리스트 변환
 * - HTML 엔티티 디코딩 확장 (50+ 엔티티)
 * - 비뉴스 메일 사전 필터링 함수
 */

const fs = require('fs');
const path = require('path');

// ============================================
// HTML 엔티티 디코딩 (확장)
// ============================================

function decodeHtmlEntities(text) {
  const entities = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&ndash;': '–',
    '&mdash;': '—',
    '&hellip;': '…',
    '&lsquo;': '\u2018',
    '&rsquo;': '\u2019',
    '&ldquo;': '\u201C',
    '&rdquo;': '\u201D',
    '&bull;': '•',
    '&middot;': '·',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
    '&laquo;': '«',
    '&raquo;': '»',
    '&cent;': '¢',
    '&pound;': '£',
    '&yen;': '¥',
    '&euro;': '€',
    '&sect;': '§',
    '&para;': '¶',
    '&dagger;': '†',
    '&Dagger;': '‡',
    '&permil;': '‰',
    '&prime;': '′',
    '&Prime;': '″',
    '&larr;': '←',
    '&rarr;': '→',
    '&uarr;': '↑',
    '&darr;': '↓',
    '&harr;': '↔',
    '&times;': '×',
    '&divide;': '÷',
    '&plusmn;': '±',
    '&ne;': '≠',
    '&le;': '≤',
    '&ge;': '≥',
    '&infin;': '∞',
    '&frac12;': '½',
    '&frac14;': '¼',
    '&frac34;': '¾',
    '&deg;': '°',
    '&micro;': 'µ',
    '&ensp;': ' ',
    '&emsp;': ' ',
    '&thinsp;': ' ',
    '&zwnj;': '',
    '&zwj;': '',
  };

  let result = text;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.split(entity).join(char);
  }

  // Numeric entities (decimal)
  result = result.replace(/&#(\d+);/g, (_, code) => {
    const num = parseInt(code, 10);
    if (num > 0 && num < 0x10FFFF) {
      try { return String.fromCodePoint(num); } catch { return ''; }
    }
    return '';
  });

  // Numeric entities (hex)
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
    const num = parseInt(code, 16);
    if (num > 0 && num < 0x10FFFF) {
      try { return String.fromCodePoint(num); } catch { return ''; }
    }
    return '';
  });

  return result;
}

// ============================================
// URL 정리 (추적 파라미터만 제거, base URL 보존)
// ============================================

function cleanTrackingParams(url) {
  if (!url || !url.startsWith('http')) return url;

  try {
    const urlObj = new URL(url);
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
      'mc_cid', 'mc_eid', 'fbclid', 'gclid', '_hsenc', '_hsmi',
      'oly_enc_id', 'oly_anon_id', 'vero_id', 'mkt_tok',
      '__s', 'ss_source', 'ss_campaign_id', 'ss_email_id',
      'bbeml', 'sc_campaign', 'sc_channel', 'sc_content', 'sc_medium',
      'sc_outcome', 'sc_geo', 'sc_country',
      '_ke', 'ref', 'referer'
    ];

    for (const param of trackingParams) {
      urlObj.searchParams.delete(param);
    }

    return urlObj.toString();
  } catch {
    return url;
  }
}

// ============================================
// 테이블 → 마크다운 변환
// ============================================

function convertTableToMarkdown(tableHtml) {
  const rows = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    const cells = [];
    const cellRegex = /<(th|td)[^>]*>([\s\S]*?)<\/(th|td)>/gi;
    let cellMatch;
    let isHeader = false;

    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
      if (cellMatch[1].toLowerCase() === 'th') isHeader = true;
      const cellText = cellMatch[2].replace(/<[^>]+>/g, '').trim();
      cells.push(cellText);
    }

    if (cells.length > 0) {
      rows.push({ cells, isHeader });
    }
  }

  if (rows.length === 0) return '';

  // 레이아웃 테이블 감지: 열 1-2개이고 셀 평균 길이가 길면 레이아웃 용도
  const maxCols = Math.max(...rows.map(r => r.cells.length));
  const totalCells = rows.reduce((sum, r) => sum + r.cells.length, 0);
  const avgCellLen = rows.reduce((sum, r) => sum + r.cells.reduce((s, c) => s + c.length, 0), 0) / Math.max(totalCells, 1);

  if (maxCols <= 2 && avgCellLen > 100) {
    // 레이아웃 테이블 → 일반 텍스트로 변환
    return '\n' + rows.map(r => r.cells.filter(c => c.length > 0).join('\n')).join('\n\n') + '\n';
  }

  // 열이 1개뿐인 단순 레이아웃 테이블
  if (maxCols === 1) {
    return '\n' + rows.map(r => r.cells[0]).filter(c => c.length > 0).join('\n') + '\n';
  }

  // 데이터 테이블 → 마크다운 테이블
  let md = '\n';
  let headerProcessed = false;

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const paddedCells = [];
    for (let i = 0; i < maxCols; i++) {
      paddedCells.push(row.cells[i] || '');
    }

    md += '| ' + paddedCells.join(' | ') + ' |\n';

    // 첫 행 뒤에 구분선 추가 (헤더 행이거나 첫 행)
    if (!headerProcessed && (row.isHeader || rowIdx === 0)) {
      md += '|' + paddedCells.map(() => '---').join('|') + '|\n';
      headerProcessed = true;
    }
  }

  return md + '\n';
}

// ============================================
// 리스트 → 마크다운 변환
// ============================================

function convertListToMarkdown(listHtml, type) {
  const items = [];
  const itemRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  let index = 1;

  while ((match = itemRegex.exec(listHtml)) !== null) {
    const text = match[1].replace(/<[^>]+>/g, '').trim();
    if (text) {
      const prefix = type === 'ol' ? `${index}. ` : '- ';
      items.push(prefix + text);
      index++;
    }
  }

  return items.length > 0 ? '\n' + items.join('\n') + '\n' : '';
}

// ============================================
// 메인: HTML → 구조화된 마크다운 변환
// ============================================

function htmlToStructuredMarkdown(html) {
  if (!html || typeof html !== 'string') return '';

  let text = html;

  // 1. 불필요한 요소 제거
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // 2. 인라인 서식: bold/italic → 마크다운 마커 (태그만 교체, 내부 보존)
  text = text.replace(/<(strong|b)(?:\s[^>]*)?>/gi, '**');
  text = text.replace(/<\/(strong|b)>/gi, '**');
  text = text.replace(/<(em|i)(?:\s[^>]*)?>/gi, '*');
  text = text.replace(/<\/(em|i)>/gi, '*');

  // 3. 테이블 → 마크다운 (내부 태그 포함 상태에서 변환)
  text = text.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, tableContent) => {
    return convertTableToMarkdown(tableContent);
  });

  // 4. 리스트 → 마크다운
  text = text.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, content) => {
    return convertListToMarkdown(content, 'ul');
  });
  text = text.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, content) => {
    return convertListToMarkdown(content, 'ol');
  });

  // 5. 블록인용 → 마크다운
  text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content) => {
    const clean = content.replace(/<[^>]+>/g, '').trim();
    if (!clean) return '';
    return '\n> ' + clean.split('\n').map(l => l.trim()).filter(l => l).join('\n> ') + '\n';
  });

  // 6. 헤딩 → 마크다운 (내부에 **마커나 링크가 있을 수 있음)
  for (let i = 1; i <= 6; i++) {
    const hashes = '#'.repeat(i);
    text = text.replace(new RegExp(`<h${i}[^>]*>([\\s\\S]*?)<\\/h${i}>`, 'gi'), (_, content) => {
      const clean = content.replace(/<[^>]+>/g, '').trim();
      return clean ? `\n\n${hashes} ${clean}\n\n` : '';
    });
  }

  // 7. 링크 변환 (URL 보존, 추적 파라미터만 제거)
  text = text.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, url, innerHtml) => {
    const linkText = innerHtml.replace(/<[^>]+>/g, '').trim();
    if (!linkText) return '';
    if (!url || url.startsWith('#') || url.startsWith('javascript:') || url.startsWith('mailto:')) {
      return linkText;
    }
    if (url.startsWith('http')) {
      const cleanUrl = cleanTrackingParams(url);
      return `[${linkText}](${cleanUrl})`;
    }
    return linkText;
  });

  // 8. 이미지 alt 텍스트
  text = text.replace(/<img[^>]*alt=["']([^"']+)["'][^>]*>/gi, (_, alt) => {
    return `[IMAGE: ${alt.trim()}]`;
  });
  text = text.replace(/<img[^>]*>/gi, '');

  // 9. HR → 섹션 구분 마커
  text = text.replace(/<hr[^>]*\/?>/gi, '\n\n---SECTION_BREAK---\n\n');

  // 10. 블록 요소 → 줄바꿈
  const blockElements = [
    'div', 'p', 'article', 'section', 'header', 'footer', 'nav',
    'pre', 'figcaption', 'figure', 'main', 'aside', 'address',
    'details', 'summary', 'fieldset', 'form'
  ];
  for (const tag of blockElements) {
    text = text.replace(new RegExp(`<${tag}[^>]*>`, 'gi'), '\n');
    text = text.replace(new RegExp(`</${tag}>`, 'gi'), '\n');
  }

  // 11. br → 줄바꿈
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // 12. 나머지 HTML 태그 제거
  text = text.replace(/<[^>]+>/g, '');

  // 13. 엔티티 디코딩
  text = decodeHtmlEntities(text);

  // 14. 공백 정리 (마크다운 구조 유지)
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{4,}/g, '\n\n\n'); // 최대 3연속 줄바꿈 (섹션 구분용)
  text = text.split('\n').map(line => line.trim()).join('\n');
  // 빈 마크다운 마커 정리 (내용이 있는 마커는 보존)
  text = text.replace(/\*\*\*\*/g, '');           // 빈 bold: ****
  text = text.replace(/\*\*\s+\*\*/g, '');        // 빈 bold with space: ** **
  text = text.trim();

  return text;
}

// ============================================
// 뉴스레터 텍스트 정제 (마크다운 호환)
// ============================================

function cleanNewsletterMarkdown(text) {
  if (!text) return '';

  // 1. 텍스트 없이 추적 URL만 있는 마크다운 링크 제거
  text = text.replace(/\[\s*\]\([^)]*\)/g, '');

  // 2. 추적 전용 링크 제거 (텍스트가 있지만 URL이 순수 리다이렉트/트래커인 경우)
  // 링크 텍스트는 보존하고 URL만 제거
  text = text.replace(/\[([^\]]+)\]\(https?:\/\/[^)]*(?:click\.|track\.|redirect\.|beacon\.|open\.)[^)]*\)/gi, '$1');

  // 3. 구독 관련 문구 제거 (줄 단위)
  const subscriptionPatterns = [
    /^.*unsubscribe.*$/gim,
    /^.*구독\s*취소.*$/gim,
    /^.*수신\s*거부.*$/gim,
    /^.*받지.*않으시려면.*$/gim,
    /^.*view\s+(this\s+)?(email\s+)?in\s+(your\s+)?browser.*$/gim,
    /^.*브라우저에서.*보기.*$/gim,
    /^.*manage\s+(your\s+)?email\s+preferences.*$/gim,
    /^.*update\s+(your\s+)?preferences.*$/gim,
    /^.*이\s*메일이\s*잘\s*안\s*보이.*$/gim,
    /^.*웹에서\s*보기.*$/gim,
    /^.*Powered\s+by\s+\w+.*$/gim,
  ];

  for (const pattern of subscriptionPatterns) {
    text = text.replace(pattern, '');
  }

  // 4. 빈 마크다운 요소 정리
  text = text.replace(/\[\s*\]/g, '');
  text = text.replace(/\(\s*\)/g, '');

  // 5. 연속된 SECTION_BREAK 병합
  text = text.replace(/(---SECTION_BREAK---\s*){2,}/g, '---SECTION_BREAK---\n\n');

  // 6. 연속된 줄바꿈 정리
  text = text.replace(/\n{4,}/g, '\n\n\n');
  text = text.trim();

  return text;
}

// ============================================
// 하위 호환: 기존 함수 래퍼
// ============================================

/**
 * HTML을 텍스트로 변환 (하위 호환)
 * 내부적으로 htmlToStructuredMarkdown 사용
 */
function htmlToText(html) {
  return htmlToStructuredMarkdown(html);
}

/**
 * 뉴스레터 텍스트 정제 (하위 호환)
 * 내부적으로 cleanNewsletterMarkdown 사용
 */
function cleanNewsletterText(text) {
  return cleanNewsletterMarkdown(text);
}

// ============================================
// 비뉴스 메일 사전 필터링
// ============================================

/**
 * 비뉴스 메일 판별 (LLM 호출 전 사전 필터링)
 * 보수적 패턴만 사용하여 오탐 최소화
 * @param {string} subject - 메일 제목
 * @param {string} from - 발신자
 * @returns {{ isNonNews: boolean, reason: string }}
 */
function isNonNewsEmail(subject, from) {
  if (!subject) return { isNonNews: false, reason: '' };

  const patterns = [
    { pattern: /^\s*\(광고\)/, reason: '제목 시작이 (광고)' },
    { pattern: /수신\s*동의\s*(갱신|확인|요청)/, reason: '수신 동의 갱신/확인' },
    { pattern: /개인정보\s*(이용|수집|처리)\s*(동의|갱신|확인)/, reason: '개인정보 동의 관련' },
    { pattern: /^special\s+offer\b/i, reason: 'Special Offer (프로모션)' },
    { pattern: /pro\s+subscription\s+usage/i, reason: '구독 사용량 알림' },
    { pattern: /비밀번호\s*(재설정|변경|초기화)/, reason: '비밀번호 관련' },
    { pattern: /password\s*(reset|change|expired)/i, reason: '비밀번호 관련' },
    { pattern: /verify\s+your\s+(email|account)/i, reason: '이메일/계정 인증' },
    { pattern: /confirm\s+your\s+(email|subscription|account)/i, reason: '구독/이메일 확인' },
    { pattern: /결제\s*(완료|확인|영수증)/, reason: '결제 관련' },
    { pattern: /^(receipt|invoice)\b/i, reason: '결제 영수증' },
    { pattern: /이메일\s*주소\s*(변경|확인|인증)/, reason: '이메일 주소 관련' },
    // 인사/감사/연하장/프로모션 메일
    { pattern: /함께해\s*주셔서\s*감사/, reason: '인사/감사 메일' },
    { pattern: /한\s*해\s*동안.*감사/, reason: '연말 인사 메일' },
    { pattern: /새해\s*복\s*많이/, reason: '새해 인사 메일' },
    { pattern: /happy\s*(new\s*year|holidays?|thanksgiving)/i, reason: '인사 메일 (영문)' },
    { pattern: /season'?s?\s*greetings?/i, reason: '인사 메일 (영문)' },
    { pattern: /^(re:\s*)?감사\s*(합니다|드립니다|인사)/, reason: '감사 인사 메일' },
    { pattern: /설문\s*(조사|참여|응답)/, reason: '설문 요청' },
    { pattern: /^(re:\s*)?survey\b/i, reason: '설문 요청 (영문)' },
  ];

  for (const { pattern, reason } of patterns) {
    if (pattern.test(subject)) {
      return { isNonNews: true, reason };
    }
  }

  return { isNonNews: false, reason: '' };
}

// ============================================
// 유틸리티
// ============================================

/**
 * 라인 번호가 포함된 정제 텍스트 생성
 */
function createCleanTextWithLineNumbers(text) {
  const lines = text.split('\n');
  const result = {
    total_lines: lines.length,
    total_chars: text.length,
    full_text: text,
    original_text: text,
    lines: []
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim()) {
      result.lines.push({
        line_number: i + 1,
        content: line
      });
    }
  }

  return result;
}

/**
 * HTML에서 이미지 URL 추출 (vision 모델용)
 * 작은 아이콘/추적 픽셀 제외, 콘텐츠 이미지만 추출
 */
function extractImageUrls(html) {
  if (!html) return [];
  const urls = [];
  const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = imgRegex.exec(html)) !== null) {
    const fullTag = match[0];
    const src = match[1];

    // 추적 픽셀/아이콘 제외
    if (/width=["']1["']|height=["']1["']|spacer|pixel|track|beacon|open\./i.test(fullTag)) continue;
    // data URI 제외 (너무 작은 것)
    if (src.startsWith('data:') && src.length < 200) continue;
    // http(s) URL 또는 유효 data URI만 포함
    if (!src.startsWith('http') && !src.startsWith('data:image')) continue;
    // 소셜 아이콘 제외
    if (/facebook|twitter|linkedin|instagram|youtube|social|icon/i.test(src)) continue;

    urls.push(src);
  }

  return urls;
}

// ============================================
// CLI 실행
// ============================================

async function main() {
  let html = '';

  if (process.argv[2]) {
    const inputPath = process.argv[2];
    if (!fs.existsSync(inputPath)) {
      console.error('파일을 찾을 수 없습니다:', inputPath);
      process.exit(1);
    }
    html = fs.readFileSync(inputPath, 'utf8');
  } else {
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

  let text = htmlToStructuredMarkdown(html);
  text = cleanNewsletterMarkdown(text);

  if (process.argv[3]) {
    const outputPath = process.argv[3];
    fs.writeFileSync(outputPath, text, 'utf8');
    console.log(`저장됨: ${outputPath}`);
    console.log(`총 ${text.split('\n').length} 라인`);
  } else {
    console.log(text);
  }
}

// ============================================
// 모듈 내보내기
// ============================================

module.exports = {
  htmlToText,
  htmlToStructuredMarkdown,
  cleanNewsletterText,
  cleanNewsletterMarkdown,
  createCleanTextWithLineNumbers,
  decodeHtmlEntities,
  extractImageUrls,
  cleanTrackingParams,
  isNonNewsEmail
};

if (require.main === module) {
  main().catch(console.error);
}
