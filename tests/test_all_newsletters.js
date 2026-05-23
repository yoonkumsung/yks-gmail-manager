/**
 * 모든 뉴스레터 전수 품질 테스트
 *
 * 실행: node tests/test_all_newsletters.js
 *
 * 작동 방식:
 * 1. newsletters.json에서 skill_generated=true인 모든 뉴스레터 목록 로드
 * 2. 각 뉴스레터 발신자로 Gmail 검색 (1달 이내, 1통)
 * 3. HTML→텍스트 변환
 * 4. LLM 추출 실행
 * 5. 코드 기반 품질 평가 (LLM 평가 없이 — 빠르고 저렴)
 * 6. 결과를 output/all_newsletter_test_{date}.json에 저장
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');

async function main() {
  console.log('\n=== 모든 뉴스레터 전수 품질 테스트 ===\n');

  // 환경 검증
  const apiKey = process.env.OLLAMA_API_KEY;
  if (!apiKey) {
    console.error('OLLAMA_API_KEY 환경변수가 없습니다.');
    process.exit(1);
  }

  const tokenPath = path.join(PROJECT_ROOT, 'config', 'credentials', 'token.json');
  if (!fs.existsSync(tokenPath)) {
    console.error('token.json이 없습니다. npm run auth를 먼저 실행하세요.');
    process.exit(1);
  }

  // 모듈 로드
  const { AgentRunner } = require('../scripts/agent_runner');
  const { GmailFetcher } = require('../scripts/fetch_gmail');
  const { htmlToText, cleanNewsletterText, isNonNewsEmail } = require('../scripts/html_to_text');

  // 설정 로드
  const newsletters = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'config', 'newsletters.json'), 'utf8')
  ).newsletters;
  const labels = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'config', 'labels.json'), 'utf8')
  ).labels;

  // 활성 뉴스레터 필터링
  const activeNewsletters = newsletters.filter(nl => nl.skill_generated && nl.skill_file);
  console.log(`총 뉴스레터: ${newsletters.length}개`);
  console.log(`활성 (SKILL 있음): ${activeNewsletters.length}개\n`);

  // LLM 러너 (로그 무음화 — 결과 라인만 출력)
  const flashRunner = new AgentRunner(apiKey, 'deepseek-v4-flash:cloud', {
    logDir: path.join(PROJECT_ROOT, 'logs'),
    minRequestInterval: 2000,
  });
  flashRunner.log = () => {};

  // Gmail 인증
  const fetcher = new GmailFetcher();
  try {
    await fetcher.authenticate();
    console.log('Gmail OAuth 인증 성공\n');
  } catch (e) {
    console.error(`Gmail 인증 실패: ${e.message}`);
    console.error('npm run auth를 실행하세요.');
    process.exit(1);
  }

  // 1달 범위
  const now = new Date();
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const fmt = (d) => `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;

  // 결과 추적
  const results = [];
  let pass = 0, warn = 0, fail = 0, skip = 0, error = 0;
  const startTime = Date.now();

  // 금지 표현 목록
  const BANNED_PHRASES = [
    '원문 참조', '원문에서 확인', '자세한 내용은 링크', '더 알아보기',
    '기사 참조', '본문 참고', '상세 내용은'
  ];

  // ============================================
  // 뉴스레터별 순회
  // ============================================

  for (let idx = 0; idx < activeNewsletters.length; idx++) {
    const nl = activeNewsletters[idx];
    const progress = `[${idx + 1}/${activeNewsletters.length}]`;
    const labelName = nl.labels?.[0] || '기타';
    const label = labels.find(l => l.name === labelName);

    process.stdout.write(`${progress} ${nl.id} (${labelName}) ... `);

    // 에이전트 파일 확인
    const agentPath = label?.agent
      ? path.join(PROJECT_ROOT, label.agent)
      : path.join(PROJECT_ROOT, 'agents', 'labels', `${labelName}.md`);

    if (!fs.existsSync(agentPath)) {
      console.log('SKIP (에이전트 파일 없음)');
      skip++;
      results.push({ id: nl.id, label: labelName, status: 'SKIP', reason: '에이전트 파일 없음' });
      continue;
    }

    // Gmail에서 1달 이내 메일 1통 검색 (Gmail console.log 무음화)
    let message;
    const origLog = console.log;
    console.log = () => {};
    try {
      const query = `from:${nl.sender} after:${fmt(monthAgo)} before:${fmt(now)}`;
      const response = await fetcher.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 5
      });

      const messages = response.data.messages;
      if (!messages || messages.length === 0) {
        console.log('SKIP (1달 내 메일 없음)');
        skip++;
        results.push({ id: nl.id, label: labelName, status: 'SKIP', reason: '1달 내 메일 없음' });
        continue;
      }

      // 랜덤 1통 선택
      const randomIdx = Math.floor(Math.random() * messages.length);
      message = await fetcher.getMessage(messages[randomIdx].id);
    } catch (e) {
      console.log = origLog;
      console.log(`ERROR (Gmail: ${e.message.substring(0, 50)})`);
      error++;
      results.push({ id: nl.id, label: labelName, status: 'ERROR', reason: `Gmail: ${e.message}` });
      continue;
    }
    console.log = origLog;

    // 헤더 추출
    const headers = fetcher.extractHeaders(message);
    const subject = headers.subject || '';

    // 비뉴스 필터링
    const { isNonNews, reason: nonNewsReason } = isNonNewsEmail(subject, headers.from);
    if (isNonNews) {
      console.log(`SKIP (비뉴스: ${nonNewsReason})`);
      skip++;
      results.push({ id: nl.id, label: labelName, status: 'SKIP', reason: `비뉴스: ${nonNewsReason}`, subject });
      continue;
    }

    // HTML → 텍스트 변환
    let cleanText;
    try {
      const htmlBody = fetcher.extractHtmlBody(message) || '';
      if (!htmlBody || htmlBody.length < 50) {
        console.log('SKIP (HTML 본문 없음/너무 짧음)');
        skip++;
        results.push({ id: nl.id, label: labelName, status: 'SKIP', reason: 'HTML 본문 없음', subject });
        continue;
      }
      const rawText = htmlToText(htmlBody);
      cleanText = cleanNewsletterText(rawText);
    } catch (e) {
      console.log(`ERROR (HTML 변환: ${e.message.substring(0, 50)})`);
      error++;
      results.push({ id: nl.id, label: labelName, status: 'ERROR', reason: `HTML 변환: ${e.message}`, subject });
      continue;
    }

    if (!cleanText || cleanText.length < 50) {
      console.log('SKIP (변환 후 텍스트 너무 짧음)');
      skip++;
      results.push({ id: nl.id, label: labelName, status: 'SKIP', reason: '텍스트 < 50자', subject });
      continue;
    }

    // LLM 추출
    const tmpInput = path.join(PROJECT_ROOT, 'logs', `_alltest_${nl.id}_${Date.now()}.json`);
    let extractResult;
    try {
      fs.writeFileSync(tmpInput, JSON.stringify({
        from: headers.from,
        subject,
        body: cleanText
      }, null, 2), 'utf8');

      const skillFile = path.basename(nl.skill_file);
      extractResult = await flashRunner.runAgent(agentPath, {
        inputs: tmpInput,
        taskType: 'extract',
        skills: [skillFile],
        maxTimeMs: 5 * 60 * 1000  // 5분 타임아웃
      });
    } catch (e) {
      console.log(`ERROR (LLM: ${e.message.substring(0, 60)})`);
      error++;
      results.push({
        id: nl.id, label: labelName, status: 'ERROR',
        reason: `LLM: ${e.message}`, subject, text_length: cleanText.length
      });
      continue;
    } finally {
      try { fs.unlinkSync(tmpInput); } catch {}
    }

    // ============================================
    // 품질 평가 (코드 기반, LLM 없이)
    // ============================================

    const items = extractResult?.items || [];
    const issues = [];
    let severity = 'PASS';

    // 1. 아이템 수 체크
    if (items.length === 0) {
      issues.push('아이템 0개 추출 (완전 실패)');
      severity = 'FAIL';
    } else if (nl.structure?.type === 'multi-item' && items.length === 1 && (nl.structure?.item_count_avg || 0) > 3) {
      issues.push(`multi-item인데 1개만 추출 (평균 ${nl.structure.item_count_avg}개 기대)`);
      severity = 'WARN';
    }

    // 2. 각 아이템 품질 검사
    let shortSummaryCount = 0;
    let noKeywordCount = 0;
    let bannedCount = 0;

    for (const item of items) {
      // 제목 검사
      if (!item.title || item.title.length < 3) {
        issues.push(`제목 없음/너무 짧음`);
      }

      // 요약 길이 검사 (single-topic은 더 긴 요약 기대)
      const summaryLen = item.summary?.length || 0;
      if (summaryLen > 0 && summaryLen < 100) {
        shortSummaryCount++;
      }

      // 키워드 검사
      if (!item.keywords || item.keywords.length === 0) {
        noKeywordCount++;
      }

      // 금지 표현 체크
      for (const phrase of BANNED_PHRASES) {
        if (item.summary?.includes(phrase)) {
          bannedCount++;
          issues.push(`금지 표현 "${phrase}"`);
          break;
        }
      }
    }

    if (shortSummaryCount > items.length * 0.5 && items.length > 0) {
      issues.push(`요약 너무 짧은 아이템 ${shortSummaryCount}/${items.length}개`);
      if (severity !== 'FAIL') severity = 'WARN';
    }

    if (noKeywordCount > items.length * 0.5 && items.length > 0) {
      issues.push(`키워드 없는 아이템 ${noKeywordCount}/${items.length}개`);
      if (severity !== 'FAIL') severity = 'WARN';
    }

    if (bannedCount > 0) {
      if (severity !== 'FAIL') severity = 'WARN';
    }

    // 3. 평균 요약 길이
    const avgSummaryLen = items.length > 0
      ? Math.round(items.reduce((sum, i) => sum + (i.summary?.length || 0), 0) / items.length)
      : 0;

    // 결과 기록
    const icon = severity === 'PASS' ? '✓' : severity === 'WARN' ? '⚠' : '✗';
    const issueStr = issues.length > 0 ? ` — ${issues.join(', ')}` : '';
    console.log(`${icon} ${items.length}개 아이템, 평균 요약 ${avgSummaryLen}자${issueStr}`);

    if (severity === 'PASS') pass++;
    else if (severity === 'WARN') warn++;
    else fail++;

    results.push({
      id: nl.id,
      name: nl.name,
      label: labelName,
      sender: nl.sender,
      skill_file: path.basename(nl.skill_file),
      subject,
      status: severity,
      items_count: items.length,
      expected_items: nl.structure?.item_count_avg || '?',
      avg_summary_length: avgSummaryLen,
      text_length: cleanText.length,
      issues,
      items_preview: items.slice(0, 3).map(i => ({
        title: i.title?.substring(0, 50),
        summary_len: i.summary?.length || 0,
        keywords: i.keywords?.slice(0, 3),
        has_link: !!i.link
      }))
    });

    // Rate limit 대비 짧은 대기
    await new Promise(r => setTimeout(r, 500));
  }

  // ============================================
  // 결과 요약
  // ============================================

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const total = pass + warn + fail;

  console.log('\n' + '='.repeat(70));
  console.log('  전수 테스트 결과');
  console.log('='.repeat(70));
  console.log(`  총 뉴스레터: ${activeNewsletters.length}개`);
  console.log(`  테스트 완료: ${total}개`);
  console.log(`  ✓ PASS: ${pass}개`);
  console.log(`  ⚠ WARN: ${warn}개`);
  console.log(`  ✗ FAIL: ${fail}개`);
  console.log(`  - SKIP: ${skip}개`);
  console.log(`  ! ERROR: ${error}개`);
  console.log(`  소요 시간: ${Math.floor(elapsed/60)}분 ${elapsed%60}초`);
  console.log(`  통과율: ${total > 0 ? Math.round(pass / total * 100) : 0}% (PASS only)`);
  console.log(`  성공률: ${total > 0 ? Math.round((pass + warn) / total * 100) : 0}% (PASS + WARN)`);

  // FAIL/WARN 상세
  const failResults = results.filter(r => r.status === 'FAIL');
  const warnResults = results.filter(r => r.status === 'WARN');

  if (failResults.length > 0) {
    console.log(`\n  ✗ FAIL 상세 (${failResults.length}건):`);
    for (const r of failResults) {
      console.log(`    [${r.label}] ${r.id}: ${r.issues.join(', ')}`);
    }
  }

  if (warnResults.length > 0) {
    console.log(`\n  ⚠ WARN 상세 (${warnResults.length}건):`);
    for (const r of warnResults) {
      console.log(`    [${r.label}] ${r.id}: ${r.issues.join(', ')}`);
    }
  }

  // 라벨별 통계
  console.log('\n  라벨별 통계:');
  const labelStats = {};
  for (const r of results) {
    if (!labelStats[r.label]) labelStats[r.label] = { pass: 0, warn: 0, fail: 0, skip: 0, error: 0 };
    const status = r.status.toLowerCase();
    labelStats[r.label][status] = (labelStats[r.label][status] || 0) + 1;
  }
  for (const [label, stats] of Object.entries(labelStats).sort()) {
    const total = stats.pass + stats.warn + stats.fail;
    const rate = total > 0 ? Math.round((stats.pass + stats.warn) / total * 100) : '-';
    console.log(`    ${label}: P${stats.pass}/W${stats.warn}/F${stats.fail}/S${stats.skip}/E${stats.error} (${rate}%)`);
  }

  // 결과 파일 저장
  const outputPath = path.join(PROJECT_ROOT, 'output',
    `all_newsletter_test_${new Date().toISOString().split('T')[0]}.json`);
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(outputPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    elapsed_seconds: elapsed,
    summary: { total, pass, warn, fail, skip, error },
    label_stats: labelStats,
    results
  }, null, 2), 'utf8');

  console.log(`\n  상세 결과: ${outputPath}`);
  console.log('='.repeat(70) + '\n');

  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('테스트 실패:', err);
  process.exit(1);
});
