/**
 * 통합 테스트 — 실제 뉴스레터 추출 품질 검증
 *
 * 실행 조건: --live 플래그 + Gmail OAuth 인증 + OLLAMA_API_KEY 환경변수
 *   node tests/test_runner.js integration --live
 *
 * 테스트 내용:
 * 1. 모든 활성 라벨에서 뉴스레터 1개씩 랜덤 가져오기 (1달 이내)
 * 2. HTML→텍스트 변환 검증
 * 3. LLM 추출 실행 + 품질 자동 평가
 * 4. 결과를 output/test_results_{date}.json에 저장
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');

module.exports = async function () {

  if (!global.IS_LIVE) {
    await describe('통합 테스트 (LIVE 전용)', async () => {
      skip('--live 플래그 없이 실행됨. 통합 테스트를 실행하려면: node tests/test_runner.js --live');
    });
    return;
  }

  // 의존성 로드 (live 모드에서만)
  const { AgentRunner } = require('../scripts/agent_runner');
  const { GmailFetcher } = require('../scripts/fetch_gmail');
  const { htmlToText, cleanNewsletterText, isNonNewsEmail } = require('../scripts/html_to_text');

  const apiKey = process.env.OLLAMA_API_KEY;
  if (!apiKey) {
    await describe('통합 테스트', async () => {
      skip('OLLAMA_API_KEY 환경변수 없음');
    });
    return;
  }

  const flashRunner = new AgentRunner(apiKey, 'deepseek-v4-flash:cloud', { logDir: 'logs' });
  flashRunner.log = () => {}; // 로깅 무음

  let fetcher;
  let newsletters;
  let labels;
  const testResults = [];

  await describe('통합 테스트 — 실제 뉴스레터 추출', async () => {

    await it('Gmail OAuth 인증 성공', async () => {
      fetcher = new GmailFetcher();
      await fetcher.authenticate();
      assert.ok(fetcher.gmail, 'Gmail API 클라이언트 초기화됨');
    });

    await it('설정 파일 로드', () => {
      newsletters = JSON.parse(
        fs.readFileSync(path.join(PROJECT_ROOT, 'config', 'newsletters.json'), 'utf8')
      ).newsletters;
      labels = JSON.parse(
        fs.readFileSync(path.join(PROJECT_ROOT, 'config', 'labels.json'), 'utf8')
      ).labels;

      const enabledLabels = labels.filter(l => l.enabled);
      assert.gt(enabledLabels.length, 0, '최소 1개 이상 활성 라벨');
      assert.gt(newsletters.length, 0, '최소 1개 이상 뉴스레터');
    });

    // 각 활성 라벨에서 1개씩 테스트
    await it('라벨별 뉴스레터 추출 품질 테스트', async () => {
      const enabledLabels = labels.filter(l => l.enabled);

      // 1달 전 ~ 오늘
      const now = new Date();
      const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
      const fmt = (d) => `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;

      let totalTested = 0;
      let totalPassed = 0;

      for (const label of enabledLabels) {
        const labelNewsletters = newsletters.filter(
          nl => nl.labels?.includes(label.name) && nl.skill_generated
        );
        if (labelNewsletters.length === 0) continue;

        // 라벨에서 최근 메일 가져오기
        let messages;
        try {
          messages = await fetcher.listMessages({
            label: label.gmail_label || label.name,
            subLabels: label.sub_labels || [],
            dateStart: fmt(monthAgo),
            dateEnd: fmt(now),
            maxResults: 10
          });
        } catch (e) {
          console.log(`    [${label.name}] Gmail 조회 실패: ${e.message}`);
          continue;
        }

        if (!messages || messages.length === 0) continue;

        // 랜덤 1개 선택
        const randomIdx = Math.floor(Math.random() * Math.min(messages.length, 10));
        const msg = messages[randomIdx];

        try {
          const full = await fetcher.getMessage(msg.id);
          const headers = fetcher.extractHeaders(full);
          const from = headers.from || '';
          const subject = headers.subject || '';
          const senderEmail = from.match(/<([^>]+)>/)?.[1] || from.split(' ').pop();

          // 비뉴스 필터링
          const { isNonNews } = isNonNewsEmail(subject, from);
          if (isNonNews) continue;

          // HTML → 텍스트
          const htmlBody = fetcher.extractHtmlBody(full) || '';
          if (!htmlBody || htmlBody.length < 100) continue;

          const rawText = htmlToText(htmlBody);
          const cleanText = cleanNewsletterText(rawText);
          if (!cleanText || cleanText.length < 100) continue;

          // 뉴스레터 매칭
          const nl = newsletters.find(n =>
            senderEmail.includes(n.sender) || n.sender.includes(senderEmail)
          );
          const skillFile = nl?.skill_file ? path.basename(nl.skill_file) : null;
          const nlName = nl?.name || from;

          // LLM 추출
          const agentPath = path.join(PROJECT_ROOT, 'agents', 'labels', `${label.name}.md`);
          if (!fs.existsSync(agentPath)) continue;

          const tmpInput = path.join(PROJECT_ROOT, 'logs', `_test_${Date.now()}.json`);
          fs.writeFileSync(tmpInput, JSON.stringify({
            from, subject, body: cleanText
          }, null, 2), 'utf8');

          try {
            const result = await flashRunner.runAgent(agentPath, {
              inputs: tmpInput,
              taskType: 'extract',
              skills: skillFile ? [skillFile] : [],
              maxTimeMs: 5 * 60 * 1000  // 5분 타임아웃
            });

            const items = result?.items || [];
            totalTested++;

            // 품질 기준 검증
            const qualityIssues = [];

            if (items.length === 0) {
              qualityIssues.push('아이템 0개 추출 (완전 실패)');
            }

            for (const item of items) {
              if (!item.title || item.title.length < 3) {
                qualityIssues.push(`제목 없음/너무 짧음: "${item.title}"`);
              }
              if (item.summary && item.summary.length > 0 && item.summary.length < 50) {
                qualityIssues.push(`요약 너무 짧음 (${item.summary.length}자): "${item.title}"`);
              }
              // 금지 표현 체크
              const banned = ['원문 참조', '원문에서 확인', '자세한 내용은 링크', '더 알아보기'];
              for (const phrase of banned) {
                if (item.summary?.includes(phrase)) {
                  qualityIssues.push(`금지 표현 "${phrase}": "${item.title}"`);
                }
              }
            }

            const passed = qualityIssues.length === 0;
            if (passed) totalPassed++;

            const status = passed ? '✓' : '✗';
            console.log(`    ${status} [${label.name}] ${nlName} → ${items.length}개 아이템`);
            if (!passed) {
              qualityIssues.forEach(i => console.log(`      - ${i}`));
            }

            testResults.push({
              label: label.name,
              newsletter: nlName,
              sender: senderEmail,
              skill_file: skillFile,
              subject,
              items_count: items.length,
              text_length: cleanText.length,
              quality_issues: qualityIssues,
              passed,
              tested_at: new Date().toISOString()
            });

          } finally {
            try { fs.unlinkSync(tmpInput); } catch {}
          }

        } catch (e) {
          console.log(`    ✗ [${label.name}] 추출 실패: ${e.message}`);
          testResults.push({
            label: label.name,
            error: e.message,
            passed: false
          });
        }
      }

      // 결과 저장
      const outputPath = path.join(PROJECT_ROOT, 'output',
        `test_results_${new Date().toISOString().split('T')[0]}.json`);
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify({
        generated_at: new Date().toISOString(),
        summary: { total: totalTested, passed: totalPassed, failed: totalTested - totalPassed },
        results: testResults
      }, null, 2), 'utf8');

      console.log(`\n    총 ${totalTested}개 테스트, ${totalPassed}개 통과`);
      console.log(`    결과 저장: ${outputPath}`);

      assert.gt(totalTested, 0, '최소 1개 이상 뉴스레터 테스트 완료');
    });
  });
};
