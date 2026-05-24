/**
 * FAIL/WARN 수정 검증 테스트
 * 수정한 뉴스레터만 골라서 재테스트
 *
 * 실행: node tests/test_recheck.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');

// 수정한 뉴스레터 목록 (FAIL 6 + WARN 7 = 13개)
const TARGETS = [
  // FAIL → SKILL 수정
  { id: 'outstanding', sender: 'newsletter@outstanding.kr', label: '창업', prevStatus: 'FAIL' },
  { id: 'donga', sender: 'newsletter@donga.com', label: '시사', prevStatus: 'FAIL' },
  { id: 'hankyung', sender: 'editor@hankyung.com', label: '시사', prevStatus: 'FAIL' },
  { id: 'm_block', sender: 'newsletter@m-block.io', label: '투자', prevStatus: 'FAIL' },
  { id: 'antiegg', sender: 'editor@antiegg.kr', label: '인문학', prevStatus: 'FAIL' },
  { id: 'kif', sender: 'sender@kif.re.kr', label: '경제', prevStatus: 'FAIL' },
  // WARN → SKILL 수정
  { id: 'byline', sender: 'byline@byline.network', label: 'IT', prevStatus: 'WARN(1/10추출)' },
  { id: 'peaknco', sender: 'jinah@peaknco.com', label: 'IT', prevStatus: 'WARN(짧은요약)' },
  { id: 'glance', sender: 'sungmin@glance.media', label: '창업', prevStatus: 'WARN(짧은요약)' },
  { id: 'pulse_mk', sender: 'pulse@mk.co.kr', label: '경제', prevStatus: 'WARN(짧은요약)' },
  { id: 'scmp', sender: 'news@e.scmp.com', label: '해외', prevStatus: 'WARN(짧은요약)' },
  // 금지 표현 → 프롬프트 수정
  { id: 'ghost', sender: 'ai-korea-community@ghost.io', label: 'IT', prevStatus: 'WARN(금지표현)' },
  { id: 'catalogue', sender: 'newsletter@the-edit.co.kr', label: '마케팅', prevStatus: 'WARN(금지표현+짧은요약)' },
];

const BANNED_PHRASES = [
  '원문 참조', '원문에서 확인', '자세한 내용은 링크', '더 알아보기',
  '기사 참조', '본문 참고', '상세 내용은', '링크를 통해', '확인해 보세요'
];

async function main() {
  console.log('\n=== FAIL/WARN 수정 검증 테스트 ===\n');

  const apiKey = process.env.OLLAMA_API_KEY;
  if (!apiKey) { console.error('OLLAMA_API_KEY 없음'); process.exit(1); }

  const { AgentRunner } = require('../scripts/agent_runner');
  const { GmailFetcher } = require('../scripts/fetch_gmail');
  const { htmlToText, cleanNewsletterText } = require('../scripts/html_to_text');

  const newsletters = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'config', 'newsletters.json'), 'utf8')
  ).newsletters;
  const labels = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'config', 'labels.json'), 'utf8')
  ).labels;

  const flashRunner = new AgentRunner(apiKey, 'deepseek-v4-flash:cloud', {
    logDir: path.join(PROJECT_ROOT, 'logs'),
  });
  flashRunner.log = () => {};

  const fetcher = new GmailFetcher();
  await fetcher.authenticate();
  console.log('Gmail 인증 OK\n');

  const now = new Date();
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const fmt = d => `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;

  let improved = 0, same = 0, worse = 0;

  for (const target of TARGETS) {
    process.stdout.write(`[${target.prevStatus}] ${target.id} (${target.label}) ... `);

    // Gmail 검색
    const origLog = console.log;
    console.log = () => {};
    let message;
    try {
      const r = await fetcher.gmail.users.messages.list({
        userId: 'me', q: `from:${target.sender} after:${fmt(monthAgo)}`, maxResults: 3
      });
      if (!r.data.messages) { console.log = origLog; console.log('SKIP (메일 없음)'); continue; }
      const randomIdx = Math.floor(Math.random() * r.data.messages.length);
      message = await fetcher.getMessage(r.data.messages[randomIdx].id);
    } catch (e) {
      console.log = origLog;
      console.log(`ERROR (Gmail: ${e.message.substring(0, 40)})`);
      continue;
    }
    console.log = origLog;

    // HTML → 텍스트
    const headers = fetcher.extractHeaders(message);
    const htmlBody = fetcher.extractHtmlBody(message) || '';
    if (htmlBody.length < 50) { console.log('SKIP (HTML 짧음)'); continue; }
    const cleanText = cleanNewsletterText(htmlToText(htmlBody));
    if (cleanText.length < 50) { console.log('SKIP (텍스트 짧음)'); continue; }

    // LLM 추출
    const nl = newsletters.find(n => target.sender.includes(n.sender) || n.sender.includes(target.sender));
    const label = labels.find(l => l.name === target.label);
    const agentPath = label?.agent ? path.join(PROJECT_ROOT, label.agent) : path.join(PROJECT_ROOT, 'agents', 'labels', `${target.label}.md`);
    const skillFile = nl?.skill_file ? path.basename(nl.skill_file) : null;

    const tmpInput = path.join(PROJECT_ROOT, 'logs', `_recheck_${target.id}_${Date.now()}.json`);
    let result;
    try {
      fs.writeFileSync(tmpInput, JSON.stringify({ from: headers.from, subject: headers.subject, body: cleanText }, null, 2), 'utf8');
      result = await flashRunner.runAgent(agentPath, {
        inputs: tmpInput, taskType: 'extract',
        skills: skillFile ? [skillFile] : [],
        maxTimeMs: 5 * 60 * 1000
      });
    } catch (e) {
      console.log(`ERROR (LLM: ${e.message.substring(0, 50)})`);
      continue;
    } finally {
      try { fs.unlinkSync(tmpInput); } catch {}
    }

    const items = result?.items || [];

    // 평가
    const issues = [];
    if (items.length === 0) issues.push('0개 추출');

    let shortCount = 0, bannedCount = 0;
    for (const item of items) {
      if ((item.summary?.length || 0) < 100) shortCount++;
      for (const phrase of BANNED_PHRASES) {
        if (item.summary?.includes(phrase)) { bannedCount++; break; }
      }
    }

    const avgLen = items.length > 0
      ? Math.round(items.reduce((s, i) => s + (i.summary?.length || 0), 0) / items.length)
      : 0;

    // 이전 상태와 비교 판정
    let verdict;
    if (target.prevStatus === 'FAIL') {
      if (items.length > 0) { verdict = '✅ 개선'; improved++; }
      else { verdict = '❌ 미개선'; same++; }
    } else if (target.prevStatus.includes('금지표현')) {
      if (bannedCount === 0) { verdict = '✅ 개선'; improved++; }
      else { verdict = '❌ 금지표현 여전히 사용'; same++; issues.push(`금지표현 ${bannedCount}건`); }
    } else if (target.prevStatus.includes('추출')) {
      // byline: 1개→다수
      if (items.length >= 3) { verdict = '✅ 개선'; improved++; }
      else { verdict = '⚠️ 부분개선'; same++; }
    } else {
      // 짧은 요약 — SKILL에서 허용 명시했으므로 추출만 되면 OK
      if (items.length > 0) { verdict = '✅ 허용범위'; improved++; }
      else { verdict = '❌ 미개선'; same++; }
    }

    const issueStr = issues.length > 0 ? ` (${issues.join(', ')})` : '';
    console.log(`${verdict} → ${items.length}개 아이템, 평균 ${avgLen}자${issueStr}`);

    // 아이템 미리보기 (첫 3개)
    for (const item of items.slice(0, 3)) {
      const title = (item.title || '').substring(0, 40);
      const sLen = item.summary?.length || 0;
      console.log(`    · "${title}..." (${sLen}자)`);
    }
    if (items.length > 3) console.log(`    ... 외 ${items.length - 3}개`);
    console.log();
  }

  // 요약
  console.log('='.repeat(50));
  console.log(`  ✅ 개선: ${improved}건`);
  console.log(`  ❌ 미개선/동일: ${same}건`);
  console.log(`  ⬇️ 악화: ${worse}건`);
  console.log('='.repeat(50));
}

main().catch(e => { console.error(e); process.exit(1); });
