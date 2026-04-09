/**
 * 11개 품질 개선 시나리오 테스트
 *
 * 실행: node scripts/test_improvements.js
 */

const path = require('path');
const fs = require('fs');

// 테스트 결과 추적
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, testName, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ ${testName}`);
  } else {
    failed++;
    failures.push({ testName, detail });
    console.log(`  ✗ ${testName}${detail ? ': ' + detail : ''}`);
  }
}

// ============================================
// 개선 #1: HTML 구조 보존 변환
// ============================================

function testStructuredMarkdown() {
  console.log('\n[개선 #1] HTML → 구조화 마크다운 변환');
  const { htmlToStructuredMarkdown } = require('./html_to_text');

  // 헤딩 변환
  const h2 = htmlToStructuredMarkdown('<h2>AI 시대의 투자 전략</h2>');
  assert(h2.includes('## AI 시대의 투자 전략'), '헤딩 h2 → ## 변환', `got: ${h2}`);

  const h3 = htmlToStructuredMarkdown('<h3>핵심 분석</h3>');
  assert(h3.includes('### 핵심 분석'), '헤딩 h3 → ### 변환', `got: ${h3}`);

  // 볼드/이탤릭
  const bold = htmlToStructuredMarkdown('<p>이것은 <strong>중요한</strong> 내용입니다</p>');
  assert(bold.includes('**중요한**'), 'strong → **bold** 변환', `got: ${bold}`);

  const italic = htmlToStructuredMarkdown('<p>이것은 <em>강조</em> 텍스트</p>');
  assert(italic.includes('*강조*'), 'em → *italic* 변환', `got: ${italic}`);

  // 링크 (URL 보존)
  const link = htmlToStructuredMarkdown('<a href="https://example.com/article?id=1">기사 보기</a>');
  assert(link.includes('[기사 보기](https://example.com/article?id=1)'), '링크 URL 보존', `got: ${link}`);

  // HR → SECTION_BREAK
  const hr = htmlToStructuredMarkdown('<p>내용1</p><hr><p>내용2</p>');
  assert(hr.includes('---SECTION_BREAK---'), 'hr → SECTION_BREAK 변환', `got: ${hr}`);

  // 이미지 alt
  const img = htmlToStructuredMarkdown('<img src="test.png" alt="차트 이미지">');
  assert(img.includes('[IMAGE: 차트 이미지]'), '이미지 alt 텍스트 보존', `got: ${img}`);

  // script/style 제거
  const script = htmlToStructuredMarkdown('<script>alert("xss")</script><p>안전한 텍스트</p>');
  assert(!script.includes('alert') && script.includes('안전한 텍스트'), 'script 태그 제거', `got: ${script}`);

  // 테이블 변환
  const table = htmlToStructuredMarkdown('<table><tr><th>이름</th><th>값</th></tr><tr><td>A</td><td>100</td></tr></table>');
  assert(table.includes('| 이름 | 값 |') && table.includes('| A | 100 |'), '테이블 → 마크다운 테이블', `got: ${table}`);

  // 리스트 변환
  const list = htmlToStructuredMarkdown('<ul><li>항목1</li><li>항목2</li></ul>');
  assert(list.includes('- 항목1') && list.includes('- 항목2'), '리스트 → 마크다운 리스트', `got: ${list}`);

  // 블록인용
  const quote = htmlToStructuredMarkdown('<blockquote>인용문 내용</blockquote>');
  assert(quote.includes('> 인용문 내용'), 'blockquote → > 인용', `got: ${quote}`);

  // 빈 입력 처리
  assert(htmlToStructuredMarkdown('') === '', '빈 입력 처리');
  assert(htmlToStructuredMarkdown(null) === '', 'null 입력 처리');

  // 중첩 태그: bold 안의 link → **[텍스트](url)** 형태로 보존
  const nested = htmlToStructuredMarkdown('<strong><a href="https://test.com">링크 텍스트</a></strong>');
  assert(nested.includes('**') && nested.includes('[링크 텍스트]'), '중첩 태그 (bold + link)', `got: ${nested}`);
}

// ============================================
// 개선 #9: 추적 URL 정리 개선
// ============================================

function testTrackingUrlCleanup() {
  console.log('\n[개선 #9] 추적 URL 정리');
  const { cleanTrackingParams } = require('./html_to_text');

  // UTM 파라미터 제거, base URL 보존
  const cleaned = cleanTrackingParams('https://example.com/article?id=123&utm_source=newsletter&utm_medium=email');
  assert(cleaned.includes('example.com/article') && cleaned.includes('id=123'), 'UTM 제거, base URL 보존', `got: ${cleaned}`);
  assert(!cleaned.includes('utm_source'), 'utm_source 제거됨', `got: ${cleaned}`);

  // 추적 파라미터 없는 URL은 그대로
  const clean = cleanTrackingParams('https://example.com/article?id=123');
  assert(clean === 'https://example.com/article?id=123', '추적 파라미터 없으면 그대로');

  // fbclid 제거
  const fb = cleanTrackingParams('https://example.com/?fbclid=abc123&page=1');
  assert(!fb.includes('fbclid') && fb.includes('page=1'), 'fbclid 제거, 다른 파라미터 보존', `got: ${fb}`);

  // 잘못된 URL 처리
  assert(cleanTrackingParams('not-a-url') === 'not-a-url', '잘못된 URL은 원본 반환');
  assert(cleanTrackingParams('') === '', '빈 문자열 처리');
  assert(cleanTrackingParams(null) === null, 'null 처리');
}

// ============================================
// 개선 #8: 비뉴스 메일 사전 필터링
// ============================================

function testNonNewsFilter() {
  console.log('\n[개선 #8] 비뉴스 메일 사전 필터링');
  const { isNonNewsEmail } = require('./html_to_text');

  // 필터링 대상
  assert(isNonNewsEmail('(광고) 특별 할인!', '').isNonNews, '(광고) 접두사 감지');
  assert(isNonNewsEmail('수신 동의 갱신 요청', '').isNonNews, '수신 동의 갱신 감지');
  assert(isNonNewsEmail('개인정보 이용 동의 갱신', '').isNonNews, '개인정보 동의 감지');
  assert(isNonNewsEmail('Special Offer from Newsletter', '').isNonNews, 'Special Offer 감지');
  assert(isNonNewsEmail('Pro Subscription Usage', '').isNonNews, '구독 사용량 감지');
  assert(isNonNewsEmail('비밀번호 재설정', '').isNonNews, '비밀번호 관련 감지');
  assert(isNonNewsEmail('Verify your email address', '').isNonNews, '이메일 인증 감지');
  assert(isNonNewsEmail('결제 완료 안내', '').isNonNews, '결제 관련 감지');

  // 필터링 비대상 (뉴스)
  assert(!isNonNewsEmail('AI 시대의 투자 전략', '').isNonNews, '일반 뉴스는 통과');
  assert(!isNonNewsEmail('[IT 뉴스] 반도체 시장 전망', '').isNonNews, 'IT 뉴스는 통과');
  assert(!isNonNewsEmail('🦔 지방선거 개헌 논의', '').isNonNews, '시사 뉴스는 통과');
  assert(!isNonNewsEmail('Hong Kong stocks surge', '').isNonNews, '해외 뉴스는 통과');
  assert(!isNonNewsEmail('', '').isNonNews, '빈 제목은 통과');

  // 반환 형식 확인
  const result = isNonNewsEmail('(광고) 테스트', '');
  assert(typeof result.isNonNews === 'boolean' && typeof result.reason === 'string', '반환 형식 확인');
}

// ============================================
// 개선 #1 보충: 뉴스레터 마크다운 정제
// ============================================

function testNewsletterMarkdownCleanup() {
  console.log('\n[개선 #1 보충] 뉴스레터 마크다운 정제');
  const { cleanNewsletterMarkdown } = require('./html_to_text');

  // 구독 관련 문구 제거
  const unsub = cleanNewsletterMarkdown('뉴스 내용\nunsubscribe from this list\n다음 뉴스');
  assert(!unsub.includes('unsubscribe'), 'unsubscribe 문구 제거', `got: ${unsub}`);

  // 빈 마크다운 링크 제거
  const emptyLink = cleanNewsletterMarkdown('텍스트 [](https://empty.link) 이후');
  assert(!emptyLink.includes('[]'), '빈 마크다운 링크 제거', `got: ${emptyLink}`);

  // 추적 전용 링크에서 텍스트 보존
  const trackLink = cleanNewsletterMarkdown('[기사 보기](https://click.example.com/redirect?url=real)');
  assert(trackLink.includes('기사 보기') && !trackLink.includes('click.example.com'), '추적 링크에서 텍스트 보존', `got: ${trackLink}`);

  // 연속 SECTION_BREAK 병합
  const breaks = cleanNewsletterMarkdown('내용1\n---SECTION_BREAK---\n---SECTION_BREAK---\n내용2');
  const breakCount = (breaks.match(/---SECTION_BREAK---/g) || []).length;
  assert(breakCount === 1, '연속 SECTION_BREAK 병합', `count: ${breakCount}`);

  // 빈 입력 처리
  assert(cleanNewsletterMarkdown('') === '', '빈 입력 처리');
}

// ============================================
// 개선 #3: 아이템 품질 검증
// ============================================

function testItemQualityValidation() {
  console.log('\n[개선 #3] 아이템 품질 검증');

  // orchestrator.js에서 checkItemQuality를 직접 테스트할 수 없으므로 로직을 인라인 검증

  function checkItemQuality(item) {
    const issues = [];
    if (!item.summary || item.summary.length < 150) issues.push('summary_too_short');
    if (item.title && item.summary) {
      const titleNorm = item.title.replace(/[^가-힣a-zA-Z0-9\s]/g, '').toLowerCase().trim();
      const summaryStart = item.summary.substring(0, Math.min(item.summary.length, titleNorm.length + 20))
        .replace(/[^가-힣a-zA-Z0-9\s]/g, '').toLowerCase().trim();
      if (titleNorm.length > 5 && summaryStart.includes(titleNorm) && item.summary.length < 200) {
        issues.push('summary_equals_title');
      }
    }
    if (item.summary && item.summary.length > 0 && item.summary.length < 250) {
      const hasNumbers = /\d+/.test(item.summary);
      const hasEnglishProperNoun = /[A-Z][a-z]{2,}/.test(item.summary);
      if (!hasNumbers && !hasEnglishProperNoun) {
        issues.push('summary_too_vague');
      }
    }
    return issues;
  }

  // 양호한 아이템
  const good = checkItemQuality({
    title: 'OpenAI, GPT-5 출시 발표',
    summary: 'OpenAI가 차세대 AI 모델 GPT-5를 공식 출시했다. 기존 GPT-4 대비 추론 속도가 2배 향상되었으며, 멀티모달 처리 성능이 크게 개선되었다. 가격은 API 기준 입력 토큰 100만 개당 5달러로 책정되었으며, 기업용 플랜은 별도 협의가 필요하다. 샘 알트만 CEO는 "이번 모델이 AGI로 가는 가장 중요한 이정표"라고 밝혔다.'
  });
  assert(good.length === 0, '양호한 아이템은 이슈 없음', `issues: ${good.join(', ')}`);

  // 짧은 요약
  const short = checkItemQuality({
    title: '삼성 실적 발표',
    summary: '삼성 실적이 발표되었다.'
  });
  assert(short.includes('summary_too_short'), '짧은 요약 감지');

  // 제목 반복 요약
  const titleRepeat = checkItemQuality({
    title: 'AI 반도체 시장 동향',
    summary: 'AI 반도체 시장 동향에 대해 보도했다. 여러 기업들이 투자를 확대하고 있다.'
  });
  assert(titleRepeat.includes('summary_equals_title'), '제목 반복 요약 감지', `issues: ${titleRepeat.join(', ')}`);

  // 구체성 부족
  const vague = checkItemQuality({
    title: '새로운 정책 발표',
    summary: '정부에서 새로운 정책을 발표했다. 이번 정책은 여러 분야에 영향을 미칠 것으로 예상된다. 관련 부처에서 후속 조치를 준비하고 있다.'
  });
  assert(vague.includes('summary_too_vague'), '구체성 부족 감지');

  // 수치가 있는 아이템은 구체성 통과
  const withNumbers = checkItemQuality({
    title: '투자 동향',
    summary: '벤처 투자 규모가 전년 대비 23% 증가해 5조원을 돌파했다. 특히 인공지능 분야에서 활발한 투자가 이루어지고 있다.'
  });
  assert(!withNumbers.includes('summary_too_vague'), '수치 있으면 구체성 통과');
}

// ============================================
// 개선 #7: SKILL 건강도 관리
// ============================================

function testSkillHealth() {
  console.log('\n[개선 #7] SKILL 건강도 관리');

  // 로직 인라인 테스트
  function shouldRenewSkill(health, sender) {
    const record = health[sender];
    if (!record) return false;
    const total = record.success + record.fail;
    if (total < 3) return false;
    const failRate = record.fail / total;
    if (failRate < 0.3) return false;
    if (record.lastRenewal) {
      const daysSince = (Date.now() - new Date(record.lastRenewal).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) return false;
    }
    return true;
  }

  // 데이터 부족
  assert(!shouldRenewSkill({ 'a@b.com': { success: 1, fail: 1, lastRenewal: null } }, 'a@b.com'), '데이터 부족 시 갱신 안 함');

  // 실패율 낮음
  assert(!shouldRenewSkill({ 'a@b.com': { success: 8, fail: 2, lastRenewal: null } }, 'a@b.com'), '실패율 20%면 갱신 안 함');

  // 실패율 높음 → 갱신
  assert(shouldRenewSkill({ 'a@b.com': { success: 2, fail: 5, lastRenewal: null } }, 'a@b.com'), '실패율 71%면 갱신 필요');

  // 최근 갱신됨 → 갱신 안 함
  assert(!shouldRenewSkill({
    'a@b.com': { success: 0, fail: 5, lastRenewal: new Date().toISOString() }
  }, 'a@b.com'), '최근 갱신이면 스킵');

  // 미등록 sender
  assert(!shouldRenewSkill({}, 'unknown@test.com'), '미등록 sender는 갱신 안 함');
}

// ============================================
// 개선 #1+#2: 스마트 청킹
// ============================================

function testSmartChunking() {
  console.log('\n[개선 #1+#2] 구조 기반 스마트 청킹');

  // AgentRunner의 청킹 로직을 테스트하기 위해 간단히 시뮬레이션
  function splitByStructure(text, maxChars) {
    if (!text || text.length <= maxChars) return [text];

    // SECTION_BREAK 분할
    const sectionParts = text.split(/\n*---SECTION_BREAK---\n*/);
    if (sectionParts.length > 1) {
      return groupSections(sectionParts, maxChars);
    }

    // 헤딩 분할
    const headingSections = text.split(/(?=\n##+ )/);
    if (headingSections.length > 1) {
      return groupSections(headingSections, maxChars);
    }

    return [text]; // fallback
  }

  function groupSections(sections, maxChars) {
    const chunks = [];
    let current = '';
    for (const sec of sections) {
      const trimmed = sec.trim();
      if (!trimmed) continue;
      const potential = current ? current + '\n\n' + trimmed : trimmed;
      if (potential.length > maxChars) {
        if (current) chunks.push(current);
        current = trimmed;
      } else {
        current = potential;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  // SECTION_BREAK 기반 분할
  const sectionText = 'A'.repeat(100) + '\n---SECTION_BREAK---\n' + 'B'.repeat(100) + '\n---SECTION_BREAK---\n' + 'C'.repeat(100);
  const sectionChunks = splitByStructure(sectionText, 150);
  assert(sectionChunks.length >= 2, 'SECTION_BREAK 기반 분할', `chunks: ${sectionChunks.length}`);

  // 헤딩 기반 분할
  const headingText = '## 제목1\n' + 'A'.repeat(100) + '\n## 제목2\n' + 'B'.repeat(100) + '\n## 제목3\n' + 'C'.repeat(100);
  const headingChunks = splitByStructure(headingText, 150);
  assert(headingChunks.length >= 2, '헤딩 기반 분할', `chunks: ${headingChunks.length}`);

  // 짧은 텍스트는 분할 안 함
  assert(splitByStructure('짧은 텍스트', 1000).length === 1, '짧은 텍스트 분할 안 함');
}

// ============================================
// 개선 #11: tier mixed 처리
// ============================================

function testTierMixed() {
  console.log('\n[개선 #11] tier "mixed" 처리');

  // settings.json 확인
  const settingsPath = path.join(__dirname, '..', 'config', 'settings.json');
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

    assert(settings.llm.tier === 'mixed', 'tier가 mixed로 설정됨');
    assert(settings.llm.providers.openrouter.tier === 'paid', 'openrouter tier가 paid');
    assert(settings.llm.providers.google.tier === 'free', 'google tier가 free');
    assert(settings.llm.models.extract.primary.model === 'deepseek/deepseek-v3.2', 'primary 모델 DeepSeek V3.2');
    assert(settings.llm.models.extract.fallback.model === 'gemini-3-flash-preview', 'fallback 모델 Gemini 3 Flash');

    // paid provider 존재 확인
    const hasPaid = Object.values(settings.llm.providers).some(p => p.tier === 'paid');
    assert(hasPaid, '유료 프로바이더 존재 확인');
  } else {
    assert(false, 'settings.json 파일 존재 확인');
  }
}

// ============================================
// 개선 #10: 병합 프롬프트 강화 (구조 검증)
// ============================================

function testMergePromptEnhanced() {
  console.log('\n[개선 #10] 병합 프롬프트 강화');

  const mergePath = path.join(__dirname, '..', 'agents', '병합.md');
  if (fs.existsSync(mergePath)) {
    const content = fs.readFileSync(mergePath, 'utf8');
    assert(content.includes('정보 합성 필수'), '병합 시 정보 합성 규칙 존재');
    assert(content.includes('고유한 정보'), '고유 정보 추출 규칙 존재');
    assert(content.includes('통합 요약으로 합성'), '통합 합성 규칙 존재');
    assert(content.includes('원본 중 더 긴 요약 이상'), '최소 길이 규칙 존재');
  } else {
    assert(false, '병합.md 파일 존재');
  }
}

// ============================================
// 개선 #2: 추출 프롬프트 강화 (구조 검증)
// ============================================

function testExtractionPromptEnhanced() {
  console.log('\n[개선 #2] 추출 프롬프트 강화');

  const rulesPath = path.join(__dirname, '..', 'agents', 'labels', '_공통규칙.md');
  if (fs.existsSync(rulesPath)) {
    const content = fs.readFileSync(rulesPath, 'utf8');
    assert(content.includes('최소 200자'), '최소 200자 규칙 존재');
    assert(content.includes('WHO(주체)'), 'WHO 필수 요소 존재');
    assert(content.includes('WHAT(핵심 사실)'), 'WHAT 필수 요소 존재');
    assert(content.includes('자기검증'), '자기검증 규칙 존재');
    assert(content.includes('단일 콘텐츠'), '단일 콘텐츠 처리 규칙 존재');
    assert(content.includes('SECTION_BREAK'), 'SECTION_BREAK 마커 안내 존재');
    assert(content.includes('구조화된 마크다운'), '마크다운 입력 안내 존재');
    assert(content.includes('제목을 반복'), '제목 반복 금지 규칙 존재');
  } else {
    assert(false, '_공통규칙.md 파일 존재');
  }
}

// ============================================
// 개선 #6: 인사이트 original_excerpt (구조 검증)
// ============================================

function testInsightOriginalExcerpt() {
  console.log('\n[개선 #6] 인사이트 original_excerpt');

  const insightPath = path.join(__dirname, '..', 'agents', '인사이트.md');
  if (fs.existsSync(insightPath)) {
    const content = fs.readFileSync(insightPath, 'utf8');
    assert(content.includes('original_excerpt'), 'original_excerpt 규칙 존재');
    assert(content.includes('원문 발췌'), '원문 발췌 참고 안내 존재');
  } else {
    assert(false, '인사이트.md 파일 존재');
  }
}

// ============================================
// 개선 #5: 단일 콘텐츠 전용 (구조 검증)
// ============================================

function testSingleTopicTaskType() {
  console.log('\n[개선 #5] 단일 콘텐츠 전용 태스크 타입');

  const agentRunnerPath = path.join(__dirname, 'agent_runner.js');
  if (fs.existsSync(agentRunnerPath)) {
    const content = fs.readFileSync(agentRunnerPath, 'utf8');
    assert(content.includes('singleTopic'), 'singleTopic 태스크 타입 존재');
    assert(content.includes('itemExtract'), 'itemExtract 태스크 타입 존재');
    assert(content.includes('하나의 주제를 심층 분석'), 'singleTopic 프롬프트 존재');
    assert(content.includes('400~800자'), 'singleTopic 400~800자 규칙');
    assert(content.includes('하나의 뉴스 아이템을 정밀하게'), 'itemExtract 프롬프트 존재');
  } else {
    assert(false, 'agent_runner.js 파일 존재');
  }
}

// ============================================
// 개선 #4: Vision 임계치 변경 (구조 검증)
// ============================================

function testVisionThreshold() {
  console.log('\n[개선 #4] Vision 임계치 500자');

  const orchPath = path.join(__dirname, 'orchestrator.js');
  if (fs.existsSync(orchPath)) {
    const content = fs.readFileSync(orchPath, 'utf8');
    assert(content.includes('cleanText.length < 500'), 'Vision 임계치 500자 설정됨');
    assert(!content.includes('cleanText.length < 150 &&'), '이전 150자 임계치 제거됨');
  } else {
    assert(false, 'orchestrator.js 파일 존재');
  }
}

// ============================================
// HTML 엔티티 디코딩 확장 테스트
// ============================================

function testEntityDecoding() {
  console.log('\n[보충] HTML 엔티티 디코딩 확장');
  const { decodeHtmlEntities } = require('./html_to_text');

  assert(decodeHtmlEntities('&euro;') === '€', '유로 기호');
  assert(decodeHtmlEntities('&hellip;') === '…', '말줄임표');
  assert(decodeHtmlEntities('&ndash;') === '–', 'en dash');
  assert(decodeHtmlEntities('&mdash;') === '—', 'em dash');
  assert(decodeHtmlEntities('&rarr;') === '→', '오른쪽 화살표');
  assert(decodeHtmlEntities('&times;') === '×', '곱하기');
  assert(decodeHtmlEntities('&#8364;') === '€', 'decimal numeric entity');
  assert(decodeHtmlEntities('&#x20AC;') === '€', 'hex numeric entity');
  assert(decodeHtmlEntities('&frac12;') === '½', '분수');
  assert(decodeHtmlEntities('&deg;') === '°', '도 기호');
}

// ============================================
// 통합 검증: 파일 간 일관성
// ============================================

function testFileConsistency() {
  console.log('\n[통합] 파일 간 일관성 검증');

  // html_to_text.js 모듈 export 확인
  const htModule = require('./html_to_text');
  assert(typeof htModule.htmlToStructuredMarkdown === 'function', 'htmlToStructuredMarkdown export 존재');
  assert(typeof htModule.cleanNewsletterMarkdown === 'function', 'cleanNewsletterMarkdown export 존재');
  assert(typeof htModule.cleanTrackingParams === 'function', 'cleanTrackingParams export 존재');
  assert(typeof htModule.isNonNewsEmail === 'function', 'isNonNewsEmail export 존재');
  assert(typeof htModule.htmlToText === 'function', 'htmlToText 하위호환 export 존재');
  assert(typeof htModule.cleanNewsletterText === 'function', 'cleanNewsletterText 하위호환 export 존재');
  assert(typeof htModule.extractImageUrls === 'function', 'extractImageUrls export 존재');

  // orchestrator.js에서 새 함수 import 확인
  const orchPath = path.join(__dirname, 'orchestrator.js');
  const orchContent = fs.readFileSync(orchPath, 'utf8');
  assert(orchContent.includes('htmlToStructuredMarkdown'), 'orchestrator가 htmlToStructuredMarkdown 사용');
  assert(orchContent.includes('cleanNewsletterMarkdown'), 'orchestrator가 cleanNewsletterMarkdown 사용');
  assert(orchContent.includes('isNonNewsEmail') || orchContent.includes('isNonNewsFn'), 'orchestrator가 isNonNewsEmail 사용');
  assert(orchContent.includes('getOriginalExcerpt'), 'orchestrator가 getOriginalExcerpt 사용');
  assert(orchContent.includes('checkItemQuality') || orchContent.includes('validateAndReextractItems'), 'orchestrator가 품질검증 사용');
  assert(orchContent.includes('SkillHealth') || orchContent.includes('skillHealth'), 'orchestrator가 SKILL 건강도 관리');
  assert(orchContent.includes('singleTopic'), 'orchestrator가 singleTopic 라우팅');
  assert(orchContent.includes('hasPaidProvider'), 'orchestrator가 tier mixed 처리');

  // agent_runner.js 구문 검증
  try {
    require('./agent_runner');
    assert(true, 'agent_runner.js 모듈 로드 성공');
  } catch (e) {
    assert(false, 'agent_runner.js 모듈 로드 성공', e.message);
  }
}

// ============================================
// 레이아웃 테이블 감지 테스트
// ============================================

function testLayoutTableDetection() {
  console.log('\n[보충] 레이아웃 테이블 감지');
  const { htmlToStructuredMarkdown } = require('./html_to_text');

  // 데이터 테이블 (여러 열, 짧은 셀)
  const dataTable = htmlToStructuredMarkdown(
    '<table><tr><th>회사</th><th>매출</th><th>성장률</th></tr>' +
    '<tr><td>삼성</td><td>100조</td><td>15%</td></tr>' +
    '<tr><td>LG</td><td>50조</td><td>10%</td></tr></table>'
  );
  assert(dataTable.includes('|') && dataTable.includes('회사'), '데이터 테이블은 마크다운 테이블로 변환', `got: ${dataTable.substring(0, 100)}`);

  // 레이아웃 테이블 (1-2열, 긴 셀)
  const layoutTable = htmlToStructuredMarkdown(
    '<table><tr><td>' + '이것은 매우 긴 뉴스레터 본문 텍스트입니다. '.repeat(10) + '</td></tr>' +
    '<tr><td>' + '또 다른 긴 문단의 내용이 여기에 들어갑니다. '.repeat(10) + '</td></tr></table>'
  );
  assert(!layoutTable.includes('|---'), '레이아웃 테이블은 마크다운 테이블이 아님');
}

// ============================================
// 메인 실행
// ============================================

console.log('='.repeat(60));
console.log('11개 품질 개선 시나리오 테스트');
console.log('='.repeat(60));

testStructuredMarkdown();
testTrackingUrlCleanup();
testNonNewsFilter();
testNewsletterMarkdownCleanup();
testItemQualityValidation();
testSkillHealth();
testSmartChunking();
testTierMixed();
testMergePromptEnhanced();
testExtractionPromptEnhanced();
testInsightOriginalExcerpt();
testSingleTopicTaskType();
testVisionThreshold();
testEntityDecoding();
testFileConsistency();
testLayoutTableDetection();

console.log('\n' + '='.repeat(60));
console.log(`결과: ${passed} 통과, ${failed} 실패 (총 ${passed + failed}개)`);

if (failures.length > 0) {
  console.log('\n실패 목록:');
  failures.forEach(f => console.log(`  - ${f.testName}: ${f.detail}`));
}

console.log('='.repeat(60));
process.exit(failed > 0 ? 1 : 0);
