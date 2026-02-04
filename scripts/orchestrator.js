/**
 * Orchestrator - 메일 정리 파이프라인 실행
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const { AgentRunner } = require('./agent_runner');
const { AdaptiveLearning } = require('./adaptive_learning');

/**
 * ProgressManager - 증분 처리를 위한 진행 상태 관리
 */
class ProgressManager {
  constructor(progressPath) {
    this.progressPath = progressPath;
    this.progress = this.load();
  }

  load() {
    if (fs.existsSync(this.progressPath)) {
      return JSON.parse(fs.readFileSync(this.progressPath, 'utf8'));
    }
    return { labels: {}, started_at: new Date().toISOString() };
  }

  save() {
    const dir = path.dirname(this.progressPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.progress.updated_at = new Date().toISOString();
    fs.writeFileSync(this.progressPath, JSON.stringify(this.progress, null, 2), 'utf8');
  }

  initLabel(labelName) {
    if (!this.progress.labels[labelName]) {
      this.progress.labels[labelName] = {
        gmail_fetch: 'pending',
        html_to_text: 'pending',
        llm_extract: 'pending',
        merge: 'pending',
        insight: 'pending'
      };
    }
  }

  setStepStatus(labelName, step, status) {
    this.initLabel(labelName);
    this.progress.labels[labelName][step] = status;
    this.save();
  }

  isStepCompleted(labelName, step) {
    return this.progress.labels?.[labelName]?.[step] === 'completed';
  }

  getStepStatus(labelName, step) {
    return this.progress.labels?.[labelName]?.[step] || 'pending';
  }

  markCompleted() {
    this.progress.completed_at = new Date().toISOString();
    this.save();
  }
}

/**
 * FailedBatchManager - 실패한 배치 관리 및 복구
 */
class FailedBatchManager {
  constructor(failedBatchesPath) {
    this.failedBatchesPath = failedBatchesPath;
    this.failedBatches = this.load();
  }

  load() {
    if (fs.existsSync(this.failedBatchesPath)) {
      return JSON.parse(fs.readFileSync(this.failedBatchesPath, 'utf8'));
    }
    return { batches: [] };
  }

  save() {
    const dir = path.dirname(this.failedBatchesPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.failedBatches.updated_at = new Date().toISOString();
    fs.writeFileSync(this.failedBatchesPath, JSON.stringify(this.failedBatches, null, 2), 'utf8');
  }

  recordFailure(labelName, step, batchIndex, error, context = {}) {
    this.failedBatches.batches.push({
      label: labelName,
      step,
      batch_index: batchIndex,
      error: error.message || error,
      context,
      failed_at: new Date().toISOString(),
      retry_count: 0
    });
    this.save();
  }

  getFailedBatches(labelName, step) {
    return this.failedBatches.batches.filter(
      b => b.label === labelName && b.step === step
    );
  }

  markResolved(labelName, step, batchIndex) {
    this.failedBatches.batches = this.failedBatches.batches.filter(
      b => !(b.label === labelName && b.step === step && b.batch_index === batchIndex)
    );
    this.save();
  }

  hasFailures() {
    return this.failedBatches.batches.length > 0;
  }

  clear() {
    this.failedBatches.batches = [];
    this.save();
  }
}

/**
 * 임시 폴더 경로 생성
 */
function getTempDir(runId) {
  return path.join(os.tmpdir(), 'gmail-manager', runId);
}

/**
 * 임시 폴더 정리 (성공 시)
 */
function cleanupTempDir(tempDir) {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log(`  임시 폴더 삭제됨: ${tempDir}`);
  }
}

/**
 * 최종 결과물을 영구 저장소로 복사
 */
function copyToFinalOutput(tempDir, runId, projectRoot) {
  const finalOutputDir = path.join(projectRoot, 'output', 'final', runId);
  const tempFinalDir = path.join(tempDir, 'final');

  if (!fs.existsSync(tempFinalDir)) {
    return;
  }

  if (!fs.existsSync(finalOutputDir)) {
    fs.mkdirSync(finalOutputDir, { recursive: true });
  }

  // HTML 파일만 복사
  const files = fs.readdirSync(tempFinalDir);
  for (const file of files) {
    if (file.endsWith('.html')) {
      fs.copyFileSync(
        path.join(tempFinalDir, file),
        path.join(finalOutputDir, file)
      );
    }
  }

  console.log(`  결과물 복사됨: ${finalOutputDir}`);
}

// 간단한 concurrency limiter 구현 (p-limit 대체)
function createLimiter(concurrency) {
  let running = 0;
  const queue = [];

  const next = () => {
    if (running >= concurrency || queue.length === 0) return;
    running++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve).catch(reject).finally(() => {
      running--;
      next();
    });
  };

  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}

const CONFIG = {
  concurrencyLimit: 1,    // 순차 처리 (Rate Limit 준수)
  openrouterModel: 'tngtech/deepseek-r1t2-chimera:free',
  mergeBatchSize: 15,     // 병합 배치 크기
  insightBatchSize: 6,    // 인사이트 배치 크기
  insightBatchFallback: [6, 4, 2, 1]  // 실패 시 축소 순서
};

/**
 * 초기 설정 체크
 * @returns {Object} { ok: boolean, errors: string[] }
 */
function checkSetup() {
  const projectRoot = path.join(__dirname, '..');
  const errors = [];

  // 1. Gmail 인증 (token.json)
  const tokenPath = path.join(projectRoot, 'config', 'credentials', 'token.json');
  if (!fs.existsSync(tokenPath)) {
    errors.push({
      type: 'Gmail 인증',
      message: 'token.json 파일이 없습니다.',
      solution: 'npm run auth'
    });
  }

  // 2. 환경 변수 (.env + OPENROUTER_API_KEY)
  const envPath = path.join(projectRoot, '.env');
  if (!fs.existsSync(envPath)) {
    errors.push({
      type: '환경 변수',
      message: '.env 파일이 없습니다.',
      solution: '.env 파일 생성 후 OPENROUTER_API_KEY=sk-or-v1-xxx 추가'
    });
  } else if (!process.env.OPENROUTER_API_KEY) {
    errors.push({
      type: '환경 변수',
      message: 'OPENROUTER_API_KEY가 설정되지 않았습니다.',
      solution: '.env 파일에 OPENROUTER_API_KEY=sk-or-v1-xxx 추가'
    });
  }

  // 3. 라벨 설정 (labels.json)
  const labelsPath = path.join(projectRoot, 'config', 'labels.json');
  if (!fs.existsSync(labelsPath)) {
    errors.push({
      type: '라벨 설정',
      message: 'labels.json 파일이 없습니다.',
      solution: 'npm run setup 또는 config/labels.json 수동 생성'
    });
  }

  // 4. 사용자 프로필 (user_profile.json) - 선택적이지만 권장
  const profilePath = path.join(projectRoot, 'config', 'user_profile.json');
  const hasProfile = fs.existsSync(profilePath);

  // 5. Agent 파일 존재 여부
  const agentsLabelsDir = path.join(projectRoot, 'agents', 'labels');
  let hasAgents = false;
  if (fs.existsSync(agentsLabelsDir)) {
    const agentFiles = fs.readdirSync(agentsLabelsDir).filter(f => f.endsWith('.md'));
    hasAgents = agentFiles.length > 0;
  }

  if (!hasProfile && !hasAgents) {
    errors.push({
      type: '초기 설정',
      message: '사용자 프로필과 Agent가 설정되지 않았습니다.',
      solution: 'npm run setup'
    });
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

/**
 * 설정 오류 출력
 */
function printSetupErrors(errors) {
  console.log('\n========================================');
  console.log('     초기 설정이 필요합니다');
  console.log('========================================\n');

  errors.forEach((err, i) => {
    console.log(`[${i + 1}] ${err.type}`);
    console.log(`    문제: ${err.message}`);
    console.log(`    해결: ${err.solution}`);
    console.log('');
  });

  console.log('----------------------------------------');
  console.log('설정 완료 후 다시 실행해주세요.');
  console.log('----------------------------------------\n');
}

/**
 * 메인 함수
 */
async function main() {
  console.log('\n========================================');
  console.log('     Gmail 메일 정리 시스템');
  console.log('========================================\n');

  // 0. 초기 설정 체크
  const setup = checkSetup();
  if (!setup.ok) {
    printSetupErrors(setup.errors);
    process.exit(1);
  }

  let tempDir = null;
  let runId = null;
  let success = false;

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

    // 4. Run ID 및 임시 폴더 생성
    runId = generateRunId();
    tempDir = getTempDir(runId);
    const projectRoot = path.join(__dirname, '..');

    console.log(`Run ID: ${runId}`);
    console.log(`임시 폴더: ${tempDir}\n`);

    // 임시 폴더 생성
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // 5. Progress 및 FailedBatch 관리자 초기화
    const progressManager = new ProgressManager(path.join(tempDir, 'progress.json'));
    const failedBatchManager = new FailedBatchManager(path.join(tempDir, 'failed_batches.json'));

    // 6. AdaptiveLearning 인스턴스 생성 (전역으로 공유)
    const adaptiveLearning = new AdaptiveLearning();

    // 7. 메일 정리 실행
    const results = await processAllLabels(labels, timeRange, tempDir, progressManager, failedBatchManager, adaptiveLearning);

    // 9. 통합 HTML 생성
    console.log('\n--- 통합 HTML 생성 ---');
    const mergedDir = path.join(tempDir, 'merged');
    const finalDir = path.join(tempDir, 'final');
    const dateStr = timeRange.start.toISOString().split('T')[0].replace(/-/g, '').substring(2);
    const combinedHtmlPath = path.join(finalDir, `${dateStr}_통합_메일정리.html`);

    if (fs.existsSync(mergedDir)) {
      const { generateCombinedFromMergedFiles } = require('./generate_html');
      const dateFormatted = formatKST(timeRange.start).split(' ')[0];
      generateCombinedFromMergedFiles(mergedDir, combinedHtmlPath, dateFormatted);
    }

    // 10. AdaptiveLearning 캐시 플러시 (같은 인스턴스 사용)
    adaptiveLearning.flush();

    // 12. 결과 요약
    printSummary(results);

    // 13. 최종 결과물을 영구 저장소로 복사
    copyToFinalOutput(tempDir, runId, projectRoot);

    // 14. Progress 완료 표시
    progressManager.markCompleted();

    // 15. 성공 메시지
    const finalOutputDir = path.join(projectRoot, 'output', 'final', runId);
    console.log('\n[완료] 전체 처리 완료!');
    console.log(`\n결과물: ${finalOutputDir}\n`);

    success = true;

  } catch (error) {
    console.error('\n[오류] 발생:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // 성공 시 임시 폴더 삭제, 실패 시 유지 (디버깅용)
    if (success && tempDir) {
      cleanupTempDir(tempDir);
    } else if (tempDir) {
      console.log(`\n[디버깅] 임시 폴더 유지됨: ${tempDir}`);
    }
  }
}

/**
 * 모든 라벨 처리 (병렬)
 */
async function processAllLabels(labels, timeRange, runDir, progressManager, failedBatchManager, adaptiveLearning) {
  const limit = createLimiter(CONFIG.concurrencyLimit);

  const results = await Promise.all(
    labels.map(label =>
      limit(async () => {
        try {
          return await processLabel(label, timeRange, runDir, progressManager, failedBatchManager, adaptiveLearning);
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
async function processLabel(label, timeRange, runDir, progressManager, failedBatchManager, adaptiveLearning) {
  console.log(`\n--- ${label.name} 라벨 처리 시작 ---`);

  // Progress 초기화
  progressManager.initLabel(label.name);

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

  // 1. Gmail API 호출 (Node.js) - 증분 처리 지원
  let fetchResult = null;
  if (!progressManager.isStepCompleted(label.name, 'gmail_fetch')) {
    console.log('  Gmail API 호출 중...');
    progressManager.setStepStatus(label.name, 'gmail_fetch', 'in_progress');
    fetchResult = await fetchGmailMessages(label, timeRange, rawDir);
    progressManager.setStepStatus(label.name, 'gmail_fetch', 'completed');
  } else {
    console.log('  Gmail API 호출 (이미 완료, 건너뜀)');
  }

  // 2. 새 뉴스레터 감지 (적응형 학습)
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

  // 2. HTML → Text - 증분 처리 지원
  if (!progressManager.isStepCompleted(label.name, 'html_to_text')) {
    console.log('  HTML → Text 변환 중...');
    progressManager.setStepStatus(label.name, 'html_to_text', 'in_progress');
    await convertHtmlToText(rawDir, cleanDir);
    progressManager.setStepStatus(label.name, 'html_to_text', 'completed');
  } else {
    console.log('  HTML → Text 변환 (이미 완료, 건너뜀)');
  }

  // 3. LLM 에이전트 실행 - 증분 처리 지원
  const runner = new AgentRunner(
    process.env.OPENROUTER_API_KEY,
    CONFIG.openrouterModel,
    { logDir: path.join(runDir, 'logs') }
  );

  let successCount = 0;
  let failCount = 0;
  let newSkillCount = 0;

  if (!progressManager.isStepCompleted(label.name, 'llm_extract')) {
    console.log('  아이템 추출 중 (LLM)...');
    progressManager.setStepStatus(label.name, 'llm_extract', 'in_progress');

    // clean 파일 목록
    const cleanFiles = fs.readdirSync(cleanDir).filter(f => f.startsWith('clean_'));

    for (let idx = 0; idx < cleanFiles.length; idx++) {
      const cleanFile = cleanFiles[idx];
      const messageId = cleanFile.replace('clean_', '').replace('.json', '');
      const cleanPath = path.join(cleanDir, cleanFile);
      const itemsPath = path.join(itemsDir, `items_${messageId}.json`);

      console.log(`    [${idx + 1}/${cleanFiles.length}] ${messageId.substring(0, 12)}...`);

      // 이미 처리된 파일 건너뛰기 (증분 처리)
      if (fs.existsSync(itemsPath)) {
        console.log(`      → 이미 처리됨 (건너뜀)`);
        successCount++;
        continue;
      }

      // 발신자 정보 확인
      let senderEmail = '';
      let isNewSender = false;
      let skills = ['SKILL_작성규칙.md'];

      try {
        const cleanData = JSON.parse(fs.readFileSync(cleanPath, 'utf8'));
        senderEmail = extractSenderEmail(cleanData.from);

        // SKILL이 생성되어 있는지 확인
        const skillGenerated = adaptiveLearning.isSkillGenerated(senderEmail);
        const skillPath = adaptiveLearning.getSkillPath(senderEmail);

        if (skillGenerated && skillPath && fs.existsSync(skillPath)) {
          // 기존 SKILL 사용
          const skillFile = path.basename(skillPath);
          skills = [skillFile, 'SKILL_작성규칙.md'];
        } else {
          // 새 발신자 - 구조 분석 필요
          isNewSender = true;
        }
      } catch (e) {
        // SKILL 매칭 실패 시 기본값 사용
      }

      try {
        if (isNewSender) {
          // 새 발신자: 구조 분석 + 아이템 추출 동시 수행
          console.log(`      → 새 발신자: ${senderEmail} (뉴스레터분석 에이전트 실행)`);

          const result = await runner.runAgent(path.join(__dirname, '..', 'agents', '뉴스레터분석.md'), {
            skills: ['SKILL_작성규칙.md'],
            inputs: cleanPath,
            output: itemsPath
          });

          // 분석 결과로 SKILL 저장
          if (result && result.analysis) {
            adaptiveLearning.saveAnalyzedSkill(senderEmail, result.analysis);
            newSkillCount++;
          }

          // items만 저장 (analysis 제외, 메타데이터 추가)
          if (result && result.items) {
            const enrichedItems = result.items.map(item => ({
              ...item,
              source_email: senderEmail,
              message_id: messageId
            }));
            fs.writeFileSync(itemsPath, JSON.stringify({ items: enrichedItems }, null, 2), 'utf8');
          }
        } else {
          // 기존 발신자: 일반 추출
          console.log(`      → 기존 발신자: ${senderEmail} (${label.name} 에이전트 실행)`);
          const result = await runner.runAgent(path.join(__dirname, '..', 'agents', 'labels', `${label.name}.md`), {
            skills,
            inputs: cleanPath,
            output: itemsPath
          });

          // 결과에 메타데이터 추가하여 저장
          if (result && result.items) {
            const enrichedItems = result.items.map(item => ({
              ...item,
              source_email: senderEmail,
              message_id: messageId
            }));
            fs.writeFileSync(itemsPath, JSON.stringify({ items: enrichedItems }, null, 2), 'utf8');
          }
        }
        successCount++;
      } catch (error) {
        failCount++;
        failedBatchManager.recordFailure(label.name, 'llm_extract', idx, error, { messageId, senderEmail });
        console.warn(`    [실패] ${messageId}: ${error.message}`);
        // 실패해도 계속 진행
      }
    }

    progressManager.setStepStatus(label.name, 'llm_extract', 'completed');
  } else {
    console.log('  아이템 추출 (이미 완료, 건너뜀)');
    // 이미 추출된 아이템 수 계산
    const itemFiles = fs.readdirSync(itemsDir).filter(f => f.startsWith('items_'));
    successCount = itemFiles.length;
  }

  if (newSkillCount > 0) {
    console.log(`  새 SKILL ${newSkillCount}개 생성됨`);
  }

  console.log(`  LLM 처리 완료: 성공 ${successCount}개, 실패 ${failCount}개`);

  // 4. 병합 (배치 처리) - 증분 처리 지원
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

  console.log(`    총 ${allItems.length}개 아이템`);

  // 병합 Agent 호출 (배치 처리)
  let merged;
  const mergeAgentPath = path.join(__dirname, '..', 'agents', '병합.md');

  if (!progressManager.isStepCompleted(label.name, 'merge')) {
    progressManager.setStepStatus(label.name, 'merge', 'in_progress');

    if (fs.existsSync(mergeAgentPath) && allItems.length > 1) {
      console.log(`  배치 병합 시작 (${CONFIG.mergeBatchSize}개씩)...`);
      try {
        const mergeRunner = new AgentRunner(process.env.OPENROUTER_API_KEY, CONFIG.openrouterModel, {
          logDir: path.join(runDir, 'logs')
        });

        const MERGE_BATCH_SIZE = CONFIG.mergeBatchSize;
        let mergedItems = [];
        let totalDuplicates = 0;

        for (let i = 0; i < allItems.length; i += MERGE_BATCH_SIZE) {
          const batch = allItems.slice(i, i + MERGE_BATCH_SIZE);
          const batchNum = Math.floor(i / MERGE_BATCH_SIZE) + 1;
          const totalBatches = Math.ceil(allItems.length / MERGE_BATCH_SIZE);

          console.log(`    배치 ${batchNum}/${totalBatches} (${batch.length}개)...`);

          try {
            const batchResult = await mergeRunner.runAgent(mergeAgentPath, {
              inputs: {
                label: label.name,
                items: batch
              },
              schema: {
                required: ['items']
              }
            });

            if (batchResult && batchResult.items) {
              const batchDuplicates = batch.length - batchResult.items.length;
              totalDuplicates += batchDuplicates;
              mergedItems.push(...batchResult.items);
              console.log(`      → ${batch.length}개 → ${batchResult.items.length}개 (${batchDuplicates}개 중복 제거)`);
            } else {
              // 배치 실패 시 원본 유지 및 기록
              mergedItems.push(...batch);
              failedBatchManager.recordFailure(label.name, 'merge', batchNum, new Error('Empty result'));
              console.warn(`      → 실패, 원본 유지`);
            }
          } catch (batchError) {
            failedBatchManager.recordFailure(label.name, 'merge', batchNum, batchError);
            console.warn(`      → 오류: ${batchError.message}, 원본 유지`);
            mergedItems.push(...batch);
          }
        }

        merged = {
          label: label.name,
          merged_at: new Date().toISOString(),
          total_items: mergedItems.length,
          items: mergedItems,
          stats: {
            original_count: allItems.length,
            total_items: mergedItems.length,
            duplicates_removed: totalDuplicates
          }
        };

        console.log(`  병합 완료: ${allItems.length}개 → ${mergedItems.length}개 (${totalDuplicates}개 중복 제거)`);
      } catch (error) {
        console.warn(`  병합 실패, 원본 유지: ${error.message}`);
        merged = {
          label: label.name,
          merged_at: new Date().toISOString(),
          total_items: allItems.length,
          items: allItems,
          stats: { original_count: allItems.length, total_items: allItems.length, duplicates_removed: 0 }
        };
      }
    } else {
      console.log('  병합 Agent 없음 또는 아이템 1개 이하, 건너뜀');
      merged = {
        label: label.name,
        merged_at: new Date().toISOString(),
        total_items: allItems.length,
        items: allItems,
        stats: { original_count: allItems.length, total_items: allItems.length, duplicates_removed: 0 }
      };
    }

    fs.writeFileSync(mergedPath, JSON.stringify(merged, null, 2), 'utf8');
    progressManager.setStepStatus(label.name, 'merge', 'completed');
  } else {
    console.log('  병합 (이미 완료, 건너뜀)');
    // 기존 병합 결과 로드
    merged = JSON.parse(fs.readFileSync(mergedPath, 'utf8'));
  }

  // 5. 인사이트 생성 (배치 처리) - 증분 처리 지원
  const insightAgentPath = path.join(__dirname, '..', 'agents', '인사이트.md');
  const profilePath = path.join(__dirname, '..', 'config', 'user_profile.json');

  if (!progressManager.isStepCompleted(label.name, 'insight')) {
    progressManager.setStepStatus(label.name, 'insight', 'in_progress');

    if (fs.existsSync(insightAgentPath) && merged.items.length > 0) {
      console.log('  인사이트 생성 중 (LLM 배치 처리)...');
      try {
        // 사용자 프로필 로드
        let profile = null;
        if (fs.existsSync(profilePath)) {
          profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        }

        const insightRunner = new AgentRunner(process.env.OPENROUTER_API_KEY, CONFIG.openrouterModel, {
          logDir: path.join(runDir, 'logs')
        });

        const itemsWithInsights = [];
        let insightSuccessCount = 0;
        let currentBatchSize = CONFIG.insightBatchSize;

        console.log(`  배치 인사이트 시작 (초기 ${currentBatchSize}개씩)...`);

        let i = 0;
        while (i < merged.items.length) {
          const batch = merged.items.slice(i, i + currentBatchSize);
          const processedCount = itemsWithInsights.length;
          const remainingCount = merged.items.length - processedCount;

          console.log(`    처리 중: ${processedCount}/${merged.items.length} (현재 배치 ${batch.length}개, 크기 ${currentBatchSize})...`);

          try {
            const batchResult = await insightRunner.runAgent(insightAgentPath, {
              inputs: {
                profile: profile?.user || null,
                label: label.name,
                items: batch
              },
              schema: {
                required: ['items']
              }
            });

            if (batchResult && batchResult.items && batchResult.items.length > 0) {
              itemsWithInsights.push(...batchResult.items);
              insightSuccessCount += batchResult.items.length;
              console.log(`      → 성공 (${batchResult.items.length}개 인사이트 추가)`);
              i += currentBatchSize;  // 다음 배치로 이동
              // 성공하면 배치 크기 복원 시도 (현재보다 한 단계 위로)
              const fallbackIdx = CONFIG.insightBatchFallback.indexOf(currentBatchSize);
              if (fallbackIdx > 0) {
                currentBatchSize = CONFIG.insightBatchFallback[fallbackIdx - 1];
                console.log(`      → 배치 크기 복원: ${currentBatchSize}`);
              }
            } else {
              // 빈 응답 - 배치 크기 축소 시도
              const fallbackIdx = CONFIG.insightBatchFallback.indexOf(currentBatchSize);
              const nextIdx = fallbackIdx + 1;

              if (nextIdx < CONFIG.insightBatchFallback.length) {
                currentBatchSize = CONFIG.insightBatchFallback[nextIdx];
                console.warn(`      → 빈 응답, 배치 크기 축소: ${currentBatchSize}`);
                // i는 그대로 (같은 위치에서 더 작은 배치로 재시도)
              } else {
                // 최소 크기에서도 실패 - 원본 유지하고 다음으로
                console.warn(`      → 최소 배치에서도 실패, 원본 유지`);
                itemsWithInsights.push(...batch);
                failedBatchManager.recordFailure(label.name, 'insight', i, new Error('Empty result at min batch'));
                i += currentBatchSize;
              }
            }
          } catch (batchError) {
            // 에러 발생 - 배치 크기 축소 시도
            const isTokenError = batchError.message?.includes('토큰') || batchError.message?.includes('빈 응답');
            const fallbackIdx = CONFIG.insightBatchFallback.indexOf(currentBatchSize);
            const nextIdx = fallbackIdx + 1;

            if (isTokenError && nextIdx < CONFIG.insightBatchFallback.length) {
              currentBatchSize = CONFIG.insightBatchFallback[nextIdx];
              console.warn(`      → 오류 (${batchError.message}), 배치 크기 축소: ${currentBatchSize}`);
              // i는 그대로 (같은 위치에서 더 작은 배치로 재시도)
            } else {
              // 축소 불가 또는 다른 종류의 에러 - 원본 유지하고 다음으로
              console.warn(`      → 오류: ${batchError.message}, 원본 유지`);
              itemsWithInsights.push(...batch);
              failedBatchManager.recordFailure(label.name, 'insight', i, batchError);
              i += currentBatchSize;
            }
          }
        }

        // 인사이트가 추가된 아이템으로 교체
        merged.items = itemsWithInsights;
        merged.has_insights = insightSuccessCount > 0;
        fs.writeFileSync(mergedPath, JSON.stringify(merged, null, 2), 'utf8');
        console.log(`  인사이트 완료: ${insightSuccessCount}/${merged.items.length}개 아이템에 추가`);
      } catch (error) {
        console.warn(`  인사이트 생성 실패 (무시): ${error.message}`);
        merged.has_insights = false;
      }
    } else {
      console.log('  인사이트 Agent 없음 또는 아이템 없음, 건너뜀');
      merged.has_insights = false;
    }

    progressManager.setStepStatus(label.name, 'insight', 'completed');
  } else {
    console.log('  인사이트 생성 (이미 완료, 건너뜀)');
    // 기존 결과에 이미 인사이트가 있을 수 있음
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
  const htmlToTextPath = path.join(__dirname, 'html_to_text.js').replace(/\\/g, '\\\\');
  const processScript = `
const fs = require('fs');
const path = require('path');
const { htmlToText, cleanNewsletterText } = require('${htmlToTextPath}');

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

    // 링크 추가
    if (item.link) {
      md += `**링크**: [원문 보기](${item.link})\n\n`;
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
      // 자동 실행: 전날 10:01 ~ 당일 10:00 (KST)
      const todayKST = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const todayStr = todayKST.toISOString().split('T')[0];
      const yesterdayKST = new Date(todayKST.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStr = yesterdayKST.toISOString().split('T')[0];

      return {
        start: new Date(yesterdayStr + 'T10:01:00+09:00'),
        end: new Date(todayStr + 'T10:00:00+09:00')
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
      // 특정 날짜 (schedule과 동일한 로직: 전날 10:01 ~ 당일 10:00)
      // 예: 2월 3일 입력 → 2월 2일 10:01 ~ 2월 3일 10:00
      const targetDate = new Date(customDate + 'T00:00:00+09:00');
      const prevDate = new Date(targetDate.getTime() - 24 * 60 * 60 * 1000);
      const prevDateStr = prevDate.toISOString().split('T')[0];
      return {
        start: new Date(prevDateStr + 'T10:01:00+09:00'),
        end: new Date(customDate + 'T10:00:00+09:00')
      };

    default:
      // 알 수 없는 모드: schedule과 동일하게 처리
      console.warn(`알 수 없는 모드 '${mode}', 'schedule' 모드로 대체합니다.`);
      const defaultTodayKST = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const defaultTodayStr = defaultTodayKST.toISOString().split('T')[0];
      const defaultYesterdayKST = new Date(defaultTodayKST.getTime() - 24 * 60 * 60 * 1000);
      const defaultYesterdayStr = defaultYesterdayKST.toISOString().split('T')[0];

      return {
        start: new Date(defaultYesterdayStr + 'T10:01:00+09:00'),
        end: new Date(defaultTodayStr + 'T10:00:00+09:00')
      };
  }
}

/**
 * 라벨 목록 가져오기
 */
function getLabels(labelFilter) {
  const labelsPath = path.join(__dirname, '..', 'config', 'labels.json');
  const labelsJson = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
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
  // 같은 날짜면 덮어쓰기 (날짜만 사용)
  return now.toISOString()
    .split('T')[0]
    .replace(/-/g, '');  // 예: 20260203
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
