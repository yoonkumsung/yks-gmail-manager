/**
 * Orchestrator - 메일 정리 파이프라인 실행
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { AgentRunner } = require('./agent_runner');
const { AdaptiveLearning } = require('./adaptive_learning');
const pLimit = require('p-limit');

const CONFIG = {
  concurrencyLimit: 3,    // 동시 처리 라벨 수
  openrouterModel: 'upstage/solar-pro',
  outputRoot: './output'
};

/**
 * 메인 함수
 */
async function main() {
  console.log('\n========================================');
  console.log('     Gmail 메일 정리 시스템');
  console.log('========================================\n');

  try {
    // 1. 인자 파싱
    const args = parseArgs(process.argv.slice(2));

    // 2. 시간 범위 계산
    const timeRange = calculateTimeRange(args.mode, args.date);

    console.log(`모드: ${args.mode}`);
    console.log(`시작: ${formatKST(timeRange.start)}`);
    console.log(`종료: ${formatKST(timeRange.end)}`);

    // 3. 라벨 목록
    const labels = getLabels(args.labels);
    console.log(`라벨: ${labels.map(l => l.name).join(', ')} (${labels.length}개)\n`);

    // 4. Run ID 생성
    const runId = generateRunId();
    const runDir = path.join(CONFIG.outputRoot, 'runs', runId);

    console.log(`Run ID: ${runId}\n`);

    // 5. 메일 정리 실행
    const results = await processAllLabels(labels, timeRange, runDir);

    // 6. 통합 HTML 생성
    console.log('\n--- 통합 HTML 생성 ---');
    const mergedDir = path.join(runDir, 'merged');
    const finalDir = path.join(runDir, 'final');
    const dateStr = timeRange.start.toISOString().split('T')[0].replace(/-/g, '').substring(2);
    const combinedHtmlPath = path.join(finalDir, `${dateStr}_통합_메일정리.html`);

    if (fs.existsSync(mergedDir)) {
      const { generateCombinedFromMergedFiles } = require('./generate_html');
      const dateFormatted = formatKST(timeRange.start).split(' ')[0];
      generateCombinedFromMergedFiles(mergedDir, combinedHtmlPath, dateFormatted);
    }

    // 7. 결과 요약
    printSummary(results);

    // 8. 성공 메시지
    console.log('\n[완료] 전체 처리 완료!');
    console.log(`\n결과물: ${runDir}/final/\n`);

  } catch (error) {
    console.error('\n[오류] 발생:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * 모든 라벨 처리 (병렬)
 */
async function processAllLabels(labels, timeRange, runDir) {
  const limit = pLimit(CONFIG.concurrencyLimit);

  const results = await Promise.all(
    labels.map(label =>
      limit(async () => {
        try {
          return await processLabel(label, timeRange, runDir);
        } catch (error) {
          console.error(`\n${label.name} 라벨 처리 실패:`, error.message);
          return {
            label: label.name,
            success: false,
            error: error.message
          };
        }
      })
    )
  );

  return results;
}

/**
 * 단일 라벨 처리
 */
async function processLabel(label, timeRange, runDir) {
  console.log(`\n--- ${label.name} 라벨 처리 시작 ---`);

  const labelDir = path.join(runDir, 'labels', label.name);
  const rawDir = path.join(labelDir, 'raw');
  const cleanDir = path.join(labelDir, 'clean');
  const itemsDir = path.join(labelDir, 'items');

  // 디렉토리 생성
  [rawDir, cleanDir, itemsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // 1. Gmail API 호출 (Node.js)
  console.log('  Gmail API 호출 중...');
  const fetchResult = await fetchGmailMessages(label, timeRange, rawDir);

  // 2. 새 뉴스레터 감지 (적응형 학습)
  const adaptiveLearning = new AdaptiveLearning();
  const newNewsletters = await adaptiveLearning.processNewSenders(fetchResult, label.name);

  if (newNewsletters.newCount > 0) {
    console.log(`  새 뉴스레터 ${newNewsletters.newCount}개 등록 완료`);
  }

  // 메일 개수 확인
  const msgFiles = fs.readdirSync(rawDir).filter(f => f.startsWith('msg_'));
  if (msgFiles.length === 0) {
    console.log(`  메일 없음, 건너뜀`);
    return {
      label: label.name,
      success: true,
      messageCount: 0,
      itemCount: 0,
      newNewsletters: newNewsletters.newsletters
    };
  }

  console.log(`  메일 ${msgFiles.length}개 수집 완료`);

  // 2. HTML → Text
  console.log('  HTML → Text 변환 중...');
  await convertHtmlToText(rawDir, cleanDir);

  // 3. LLM 에이전트 실행
  const runner = new AgentRunner(
    process.env.OPENROUTER_API_KEY,
    CONFIG.openrouterModel,
    { logDir: path.join(runDir, 'logs') }
  );

  console.log('  아이템 추출 중 (LLM)...');

  // clean 파일 목록
  const cleanFiles = fs.readdirSync(cleanDir).filter(f => f.startsWith('clean_'));

  // 각 메일 처리
  for (const cleanFile of cleanFiles) {
    const messageId = cleanFile.replace('clean_', '').replace('.json', '');
    const cleanPath = path.join(cleanDir, cleanFile);
    const itemsPath = path.join(itemsDir, `items_${messageId}.json`);

    // 발신자 기반 SKILL 자동 매칭
    let skills = ['SKILL_작성규칙.md'];
    try {
      const cleanData = JSON.parse(fs.readFileSync(cleanPath, 'utf8'));
      const senderEmail = extractSenderEmail(cleanData.from);
      const skillPath = adaptiveLearning.getSkillPath(senderEmail);

      if (skillPath && fs.existsSync(skillPath)) {
        const skillFile = path.basename(skillPath);
        skills = [skillFile, 'SKILL_작성규칙.md'];
      }
    } catch (e) {
      // SKILL 매칭 실패 시 기본값 사용
    }

    await runner.runAgent(`agents/labels/${label.name}.md`, {
      skills,
      inputs: cleanPath,
      output: itemsPath
    });
  }

  // 4. 병합
  console.log('  병합 중 (LLM)...');
  const mergedDir = path.join(runDir, 'merged');
  if (!fs.existsSync(mergedDir)) {
    fs.mkdirSync(mergedDir, { recursive: true });
  }

  const mergedPath = path.join(mergedDir, `merged_${label.name}.json`);

  // 모든 items 파일 읽기
  const allItems = [];
  const itemFiles = fs.readdirSync(itemsDir).filter(f => f.startsWith('items_'));
  for (const itemFile of itemFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(itemsDir, itemFile), 'utf8'));
    if (data.items) {
      allItems.push(...data.items);
    }
  }

  // 병합 Agent 호출 (중복 제거)
  let merged;
  const mergeAgentPath = path.join(__dirname, '..', 'agents', '병합.md');

  if (fs.existsSync(mergeAgentPath) && allItems.length > 1) {
    console.log('  병합 에이전트 실행 중 (중복 제거)...');
    try {
      const runner = new AgentRunner(process.env.OPENROUTER_API_KEY, CONFIG.openrouterModel, {
        logDir: path.join(runDir, 'logs')
      });

      merged = await runner.runAgent(mergeAgentPath, {
        inputs: {
          label: label.name,
          items: allItems
        },
        schema: {
          required: ['items']
        }
      });

      // 필수 필드 보정
      if (!merged.label) merged.label = label.name;
      if (!merged.merged_at) merged.merged_at = new Date().toISOString();
      if (!merged.stats) {
        merged.stats = {
          total_items: merged.items.length,
          original_count: allItems.length,
          duplicates_removed: allItems.length - merged.items.length
        };
      }

      console.log(`    → ${allItems.length}개 → ${merged.items.length}개 (${allItems.length - merged.items.length}개 중복 제거)`);
    } catch (error) {
      console.warn(`  병합 에이전트 실패, 단순 병합으로 대체: ${error.message}`);
      merged = {
        label: label.name,
        merged_at: new Date().toISOString(),
        total_items: allItems.length,
        items: allItems,
        stats: { total_items: allItems.length, duplicates_removed: 0 }
      };
    }
  } else {
    // 아이템이 1개 이하거나 병합 Agent가 없으면 단순 병합
    merged = {
      label: label.name,
      merged_at: new Date().toISOString(),
      total_items: allItems.length,
      items: allItems,
      stats: { total_items: allItems.length, duplicates_removed: 0 }
    };
  }

  fs.writeFileSync(mergedPath, JSON.stringify(merged, null, 2), 'utf8');

  // 5. 인사이트 생성 (이중 관점)
  console.log('  인사이트 생성 중 (LLM)...');
  const insightAgentPath = path.join(__dirname, '..', 'agents', '인사이트.md');
  const profilePath = path.join(__dirname, '..', 'config', 'user_profile.json');

  if (fs.existsSync(insightAgentPath) && merged.items.length > 0) {
    try {
      // 사용자 프로필 로드
      let profile = null;
      if (fs.existsSync(profilePath)) {
        profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
      }

      const insightRunner = new AgentRunner(process.env.OPENROUTER_API_KEY, CONFIG.openrouterModel, {
        logDir: path.join(runDir, 'logs')
      });

      const insightResult = await insightRunner.runAgent(insightAgentPath, {
        inputs: {
          profile: profile?.user || null,
          label: label.name,
          items: merged.items
        },
        schema: {
          required: ['items']
        }
      });

      // 인사이트가 추가된 아이템으로 교체
      if (insightResult && insightResult.items) {
        merged.items = insightResult.items;
        merged.has_insights = true;
        fs.writeFileSync(mergedPath, JSON.stringify(merged, null, 2), 'utf8');
        console.log(`    → ${merged.items.length}개 아이템에 인사이트 추가`);
      }
    } catch (error) {
      console.warn(`  인사이트 생성 실패 (무시): ${error.message}`);
      merged.has_insights = false;
    }
  } else {
    merged.has_insights = false;
  }

  // 6. MD 파일 생성 (라벨별 개별 파일 - 옵시디언용)
  console.log('  MD 파일 생성 중...');
  const finalDir = path.join(runDir, 'final');
  if (!fs.existsSync(finalDir)) {
    fs.mkdirSync(finalDir, { recursive: true });
  }

  const dateStr = timeRange.start.toISOString().split('T')[0].replace(/-/g, '').substring(2);
  const finalMd = path.join(finalDir, `${dateStr}_${label.name}_메일정리.md`);

  // MD 파일 생성
  const mdContent = generateMarkdown(merged, timeRange.start);
  fs.writeFileSync(finalMd, mdContent, 'utf8');

  // HTML은 통합 파일로 main()에서 생성됨

  console.log(`[완료] ${label.name} (${allItems.length}개 아이템)`);

  return {
    label: label.name,
    success: true,
    messageCount: msgFiles.length,
    itemCount: allItems.length,
    newNewsletters: newNewsletters.newsletters
  };
}

/**
 * Gmail 메시지 가져오기 (Node.js 버전)
 */
async function fetchGmailMessages(label, timeRange, outputDir) {
  const { GmailFetcher } = require('./fetch_gmail');

  const dateStart = formatGmailDate(new Date(timeRange.start.getTime() - 24 * 60 * 60 * 1000));
  const dateEnd = formatGmailDate(new Date(timeRange.end.getTime() + 24 * 60 * 60 * 1000));
  const targetDate = timeRange.start.toISOString().split('T')[0]; // YYYY-MM-DD 형식

  try {
    const fetcher = new GmailFetcher();
    await fetcher.authenticate();

    const result = await fetcher.fetchMessages({
      label: label.gmail_label || label.name,
      subLabels: (label.sub_labels || []).join(','),
      dateStart,
      dateEnd,
      targetDate,
      outputDir
    });

    return result;
  } catch (error) {
    console.warn(`  Gmail API 오류 (메일 없을 수 있음): ${error.message}`);
    return null;
  }
}

/**
 * HTML → Text 변환
 */
async function convertHtmlToText(rawDir, cleanDir) {
  const processScript = `
const fs = require('fs');
const path = require('path');
const { htmlToText, cleanNewsletterText } = require('./scripts/html_to_text.js');

const rawDir = '${rawDir.replace(/\\/g, '\\\\')}';
const cleanDir = '${cleanDir.replace(/\\/g, '\\\\')}';

const msgFiles = fs.readdirSync(rawDir).filter(f => f.startsWith('msg_'));

for (const file of msgFiles) {
  const msgData = JSON.parse(fs.readFileSync(path.join(rawDir, file), 'utf8'));
  const messageId = file.replace('msg_', '').replace('.json', '');

  let cleanText = '';
  if (msgData.html_body) {
    cleanText = htmlToText(msgData.html_body);
    cleanText = cleanNewsletterText(cleanText);
  }

  const cleanData = {
    message_id: messageId,
    from: msgData.from,
    subject: msgData.subject,
    date: msgData.date,
    labels: msgData.labels,
    clean_text: cleanText
  };

  fs.writeFileSync(
    path.join(cleanDir, 'clean_' + messageId + '.json'),
    JSON.stringify(cleanData, null, 2),
    'utf8'
  );
}
`;

  const tempScript = path.join(__dirname, 'temp_convert.js');
  fs.writeFileSync(tempScript, processScript, 'utf8');
  execSync(`node "${tempScript}"`, { stdio: 'pipe' });
  fs.unlinkSync(tempScript);
}

/**
 * 마크다운 생성
 */
function generateMarkdown(merged, date) {
  const dateStr = formatKST(date).split(' ')[0];

  let md = `# ${merged.label} 메일 정리 (${dateStr})\n\n`;
  md += `> 총 ${merged.items.length}개 아이템`;
  if (merged.has_insights) {
    md += ` | 인사이트 포함`;
  }
  md += `\n\n`;
  md += `---\n\n`;

  merged.items.forEach((item, i) => {
    md += `## ${i + 1}. ${item.title}\n\n`;
    md += `${item.summary}\n\n`;

    if (item.keywords && item.keywords.length > 0) {
      md += `**키워드**: ${item.keywords.map(k => `#${k}`).join(' ')}\n\n`;
    }

    // 인사이트 추가
    if (item.insights) {
      // 도메인 관련 인사이트
      if (item.insights.domain) {
        md += `### 실용적 인사이트\n\n`;
        if (item.insights.domain.perspective) {
          md += `*${item.insights.domain.perspective}*\n\n`;
        }
        md += `${item.insights.domain.content}\n\n`;
        if (item.insights.domain.action_items && item.insights.domain.action_items.length > 0) {
          md += `**액션 아이템**:\n`;
          item.insights.domain.action_items.forEach(action => {
            md += `- ${action}\n`;
          });
          md += `\n`;
        }
      }

      // 교차 도메인 인사이트
      if (item.insights.cross_domain) {
        md += `### 확장 인사이트\n\n`;
        if (item.insights.cross_domain.perspective) {
          md += `*${item.insights.cross_domain.perspective}*\n\n`;
        }
        md += `${item.insights.cross_domain.content}\n\n`;
        if (item.insights.cross_domain.connections && item.insights.cross_domain.connections.length > 0) {
          md += `**연결 키워드**: ${item.insights.cross_domain.connections.join(', ')}\n\n`;
        }
      }
    }

    md += `---\n\n`;
  });

  return md;
}

/**
 * 인자 파싱
 */
function parseArgs(argv) {
  const args = {
    mode: 'schedule',
    date: null,
    labels: null
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--mode' && i + 1 < argv.length) {
      args.mode = argv[i + 1];
      i++;
    } else if (argv[i] === '--date' && i + 1 < argv.length) {
      args.date = argv[i + 1];
      i++;
    } else if (argv[i] === '--labels' && i + 1 < argv.length) {
      args.labels = argv[i + 1];
      i++;
    }
  }

  return args;
}

/**
 * 시간 범위 계산
 */
function calculateTimeRange(mode, customDate) {
  const now = new Date();

  switch (mode) {
    case 'schedule':
      // 자동 실행: 전날 11:00 ~ 당일 11:00
      const yesterday11 = new Date(now);
      yesterday11.setDate(yesterday11.getDate() - 1);
      yesterday11.setHours(11, 0, 0, 0);

      const today11 = new Date(now);
      today11.setHours(11, 0, 0, 0);

      return {
        start: yesterday11,
        end: today11
      };

    case 'today':
      // 오늘 0시 ~ 현재
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      return {
        start: todayStart,
        end: now
      };

    case 'last-24h':
      // 24시간 전 ~ 현재
      return {
        start: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        end: now
      };

    case 'custom':
      // 특정 날짜
      const date = new Date(customDate + 'T00:00:00+09:00');
      const dateEnd = new Date(date);
      dateEnd.setHours(23, 59, 59, 999);
      return {
        start: date,
        end: dateEnd
      };
  }
}

/**
 * 라벨 목록 가져오기
 */
function getLabels(labelFilter) {
  const labelsJson = JSON.parse(fs.readFileSync('config/labels.json', 'utf8'));
  let labels = labelsJson.labels.filter(l => l.enabled);

  if (labelFilter) {
    const filterList = labelFilter.split(',').map(s => s.trim());
    labels = labels.filter(l => filterList.includes(l.name));
  }

  return labels;
}

/**
 * 결과 요약 출력
 */
function printSummary(results) {
  console.log('\n========================================');
  console.log('          처리 결과 요약');
  console.log('========================================\n');

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const totalItems = successful.reduce((sum, r) => sum + (r.itemCount || 0), 0);

  // 새 뉴스레터 집계
  const allNewNewsletters = successful.flatMap(r => r.newNewsletters || []);

  console.log(`성공: ${successful.length}개 라벨`);
  console.log(`실패: ${failed.length}개 라벨`);
  console.log(`총 아이템: ${totalItems}개`);

  if (allNewNewsletters.length > 0) {
    console.log(`\n[NEW] 새로 등록된 뉴스레터: ${allNewNewsletters.length}개`);
    allNewNewsletters.forEach(n => {
      console.log(`  - ${n.name} <${n.sender}>`);
    });
  }

  console.log('');

  if (failed.length > 0) {
    console.log('실패한 라벨:');
    failed.forEach(r => {
      console.log(`  - ${r.label}: ${r.error}`);
    });
  }
}

/**
 * 유틸리티
 */
function generateRunId() {
  const now = new Date();
  return now.toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '_')
    .substring(0, 15);
}

function formatKST(date) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .substring(0, 19) + ' KST';
}

function formatGmailDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

/**
 * 발신자 이메일 추출
 */
function extractSenderEmail(from) {
  if (!from) return null;
  const match = from.match(/<(.+?)>/);
  return match ? match[1] : from.trim();
}

// 실행
if (require.main === module) {
  main();
}

module.exports = { processAllLabels };
