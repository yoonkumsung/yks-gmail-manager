/**
 * Orchestrator - 메일 정리 파이프라인 실행
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const fs = require('fs');
const os = require('os');
const { AgentRunner } = require('./agent_runner');
const { AdaptiveLearning } = require('./adaptive_learning');

/**
 * ProgressManager - 증분 처리를 위한 진행 상태 관리 (캐싱 적용)
 */
class ProgressManager {
  constructor(progressPath) {
    this.progressPath = progressPath;
    this.progress = this.load();
    this._isDirty = false;
  }

  load() {
    if (fs.existsSync(this.progressPath)) {
      try {
        return JSON.parse(fs.readFileSync(this.progressPath, 'utf8'));
      } catch (e) {
        console.warn(`  progress.json 파싱 실패, 초기화: ${e.message}`);
      }
    }
    return { labels: {}, started_at: new Date().toISOString() };
  }

  // 메모리만 업데이트 (실제 저장은 flush에서)
  _markDirty() {
    this._isDirty = true;
  }

  // 캐시를 파일에 저장
  flush() {
    if (!this._isDirty) return;

    const dir = path.dirname(this.progressPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.progress.updated_at = new Date().toISOString();
    fs.writeFileSync(this.progressPath, JSON.stringify(this.progress, null, 2), 'utf8');
    this._isDirty = false;
  }

  // 즉시 저장 (중요 단계 완료 시)
  save() {
    this._markDirty();
    this.flush();
  }

  initLabel(labelName) {
    if (!this.progress.labels[labelName]) {
      this.progress.labels[labelName] = {
        gmail_fetch: 'pending',
        html_to_text: 'pending',
        llm_extract: 'pending',
        merge: 'pending'
      };
      this._markDirty();
    }
  }

  setStepStatus(labelName, step, status) {
    this.initLabel(labelName);
    this.progress.labels[labelName][step] = status;
    // in_progress, completed 모두 즉시 저장 (크래시 시 진행 상태 보존)
    if (status === 'in_progress' || status === 'completed') {
      this.save();
    } else {
      this._markDirty();
    }
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
      try {
        return JSON.parse(fs.readFileSync(this.failedBatchesPath, 'utf8'));
      } catch (e) {
        console.warn(`  failed_batches.json 파싱 실패, 초기화: ${e.message}`);
      }
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
  return path.join(os.tmpdir(), 'yks-gmail-manager', runId);
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

  // HTML 및 MD 파일 복사
  const files = fs.readdirSync(tempFinalDir);
  for (const file of files) {
    if (file.endsWith('.html') || file.endsWith('.md')) {
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
  concurrencyLimit: 3,    // 병렬 3개 처리

  // 모델 설정 (OpenRouter). OPENROUTER_MODEL 환경변수로 재정의 가능 → 모델 A/B 테스트 용이.
  // 후보: 'deepseek/deepseek-v4-flash'(저비용), 'google/gemini-2.5-flash'(CJK 강)
  model: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-pro',

  mergeBatchSize: 15      // 병합 배치 크기
};

/**
 * 병합 사전 필터링 - 코드 기반 유사도 계산으로 LLM 호출 최적화
 * 유사한 아이템만 LLM에 보내고, 유사도 없는 아이템은 바로 통과
 */
function findMergeCandidates(items) {
  const candidateMap = new Map(); // idx -> Set<idx>

  for (let i = 0; i < items.length; i++) {
    const kwA = new Set((items[i].keywords || []).map(k => k.toLowerCase()));
    if (kwA.size === 0) continue;

    for (let j = i + 1; j < items.length; j++) {
      const kwB = new Set((items[j].keywords || []).map(k => k.toLowerCase()));
      if (kwB.size === 0) continue;

      // 키워드 Jaccard 유사도
      const intersection = [...kwA].filter(x => kwB.has(x)).length;
      const union = new Set([...kwA, ...kwB]).size;
      const jaccard = union > 0 ? intersection / union : 0;

      // 제목 단어 겹침 (title이 없으면 빈 Set)
      const wordsA = new Set((items[i].title || '').split(/[\s,·]+/).filter(w => w.length > 1));
      const wordsB = new Set((items[j].title || '').split(/[\s,·]+/).filter(w => w.length > 1));
      const maxWords = Math.max(wordsA.size, wordsB.size, 1);
      const titleOverlap = [...wordsA].filter(x => wordsB.has(x)).length / maxWords;

      // 다른 출처에서 같은 뉴스 = 병합 후보 가능성 높음
      const diffSource = items[i].source_email !== items[j].source_email ? 0.05 : 0;

      const similarity = jaccard * 0.55 + titleOverlap * 0.4 + diffSource;

      if (similarity > 0.25) {
        if (!candidateMap.has(i)) candidateMap.set(i, new Set());
        if (!candidateMap.has(j)) candidateMap.set(j, new Set());
        candidateMap.get(i).add(j);
        candidateMap.get(j).add(i);
      }
    }
  }

  return candidateMap;
}

/**
 * 클러스터링 함수 - 키워드 유사도 기반 아이템 그룹화 (API 호출 없음)
 * findMergeCandidates()의 Jaccard 유사도 로직 재사용 + Union-Find 알고리즘
 * @param {Array} items - 아이템 배열 (title, keywords 필수)
 * @param {number} threshold - Jaccard 유사도 임계값 (기본 0.2)
 * @returns {Array} 클러스터 배열 [{representative_title, keywords, items_count, item_titles}]
 */
function clusterItemsByKeyword(items, threshold = 0.2) {
  if (!items || items.length === 0) return [];

  // Union-Find
  const parent = items.map((_, i) => i);
  const rank = items.map(() => 0);

  function find(x) {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }

  function unite(a, b) {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    if (rank[ra] < rank[rb]) parent[ra] = rb;
    else if (rank[ra] > rank[rb]) parent[rb] = ra;
    else { parent[rb] = ra; rank[ra]++; }
  }

  // Jaccard 유사도 기반 Union
  for (let i = 0; i < items.length; i++) {
    const kwA = new Set((items[i].keywords || []).map(k => k.toLowerCase()));
    if (kwA.size === 0) continue;

    for (let j = i + 1; j < items.length; j++) {
      const kwB = new Set((items[j].keywords || []).map(k => k.toLowerCase()));
      if (kwB.size === 0) continue;

      const intersection = [...kwA].filter(x => kwB.has(x)).length;
      const union = new Set([...kwA, ...kwB]).size;
      const jaccard = union > 0 ? intersection / union : 0;

      if (jaccard >= threshold) {
        unite(i, j);
      }
    }
  }

  // 클러스터 수집
  const clusterMap = new Map();
  for (let i = 0; i < items.length; i++) {
    const root = find(i);
    if (!clusterMap.has(root)) clusterMap.set(root, []);
    clusterMap.get(root).push(i);
  }

  // 클러스터 출력 구성
  const clusters = [];
  for (const [root, memberIdxs] of clusterMap) {
    const allKeywords = new Set();
    const itemTitles = [];

    for (const idx of memberIdxs) {
      const item = items[idx];
      itemTitles.push(item.title || '(제목 없음)');
      (item.keywords || []).forEach(k => allKeywords.add(k.toLowerCase()));
    }

    clusters.push({
      representative_title: items[root].title || '(제목 없음)',
      keywords: [...allKeywords],
      items_count: memberIdxs.length,
      item_titles: itemTitles
    });
  }

  return clusters;
}

// 전역 AgentRunner 인스턴스 (Rate Limit 카운터 공유)
let globalRunner = null;

function getRunner(logDir) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY 환경변수가 설정되지 않았습니다');

  if (!globalRunner) {
    globalRunner = new AgentRunner(
      apiKey,
      CONFIG.model,
      { logDir }
    );
  }
  return globalRunner;
}

// ---------------------------------------------------------------------------
// 카탈로그 라벨 가드
//   같은 Gmail 메일에 여러 라벨(예: '경제' + '미국/경제')이 붙어 있으면, prep은
//   라벨별로 메일을 가져오므로 동일 메일이 두 라벨에서 각각 추출되어
//   (의역 제목이 달라) dedup을 빠져나간 채 양쪽 섹션에 중복 등장한다.
//   newsletters.json 카탈로그는 발신자별 정규 라벨을 명시하므로,
//   "카탈로그에 등록된 발신자인데 현재 라벨이 카탈로그 라벨에 없으면" 그 메일을
//   현재 라벨에서 제외한다. (카탈로그에 없는 발신자는 건드리지 않음 → 보수적)
// ---------------------------------------------------------------------------
let _senderLabelMap = null;
function getSenderLabelMap() {
  if (_senderLabelMap) return _senderLabelMap;
  _senderLabelMap = new Map();
  try {
    const p = path.join(__dirname, '..', 'config', 'newsletters.json');
    const cat = JSON.parse(fs.readFileSync(p, 'utf8'));
    const arr = Array.isArray(cat) ? cat : (cat.newsletters || []);
    for (const n of arr) {
      const email = String(n.sender || n.from || '').toLowerCase().replace(/.*<|>.*/g, '').trim();
      const labels = Array.isArray(n.labels) ? n.labels : (Array.isArray(n.label) ? n.label : (n.labels || n.label ? [n.labels || n.label] : []));
      if (email && labels.length) _senderLabelMap.set(email, labels.map(String));
    }
  } catch (e) { /* 카탈로그 없으면 가드 비활성 (전부 통과) */ }
  return _senderLabelMap;
}

function extractEmail(from) {
  const m = String(from || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(from || '')).toLowerCase().trim();
}

// report 라벨명 → 실제 Gmail 라벨명 (labels.json gmail_label). 예: 미국_경제 → 미국/경제
let _reportToGmail = null;
function getReportToGmailMap() {
  if (_reportToGmail) return _reportToGmail;
  _reportToGmail = new Map();
  try {
    const p = path.join(__dirname, '..', 'config', 'labels.json');
    for (const l of (JSON.parse(fs.readFileSync(p, 'utf8')).labels || [])) {
      _reportToGmail.set(l.name, l.gmail_label || l.name);
    }
  } catch (e) { /* 무시 */ }
  return _reportToGmail;
}

// rawDir의 msg_*.json 중, "현재 라벨(labelName)이 카탈로그 정규 라벨이 아니면서,
// 그 메일이 카탈로그 라벨을 실제 Gmail 라벨로도 보유한 경우"에만 삭제한다.
//   → 진짜 중복(다른 라벨에서도 잡힘)만 제거하고, 카탈로그 라벨 Gmail 라벨이 없는
//     '고아' 메일은 유지(누락 방지). gmail_labels 정보가 없으면 보수적으로 유지.
// 반환: 삭제한 개수
function filterRawByCatalogLabel(rawDir, labelName) {
  if (!labelName || !fs.existsSync(rawDir)) return 0;
  const map = getSenderLabelMap();
  if (map.size === 0) return 0;
  const r2g = getReportToGmailMap();
  let removed = 0;
  for (const f of fs.readdirSync(rawDir).filter(x => x.startsWith('msg_'))) {
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8')); } catch (e) { continue; }
    const labels = map.get(extractEmail(data.from));
    if (!labels || labels.includes(labelName)) continue; // 카탈로그 미등록 or 현재 라벨이 정규 → 유지
    const gmailLabels = Array.isArray(data.gmail_labels) ? data.gmail_labels : null;
    if (!gmailLabels) continue; // 라벨 정보 없으면 보수적으로 유지(누락 방지)
    const belongsToCatalog = labels.some(rl => gmailLabels.includes(r2g.get(rl) || rl) || gmailLabels.includes(rl));
    if (belongsToCatalog) { fs.unlinkSync(path.join(rawDir, f)); removed++; }
  }
  if (removed > 0) console.log(`    [라벨가드] ${labelName}: 카탈로그 정규 라벨로 중복되는 ${removed}건 제외`);
  return removed;
}

// 전역 GmailFetcher (라벨마다 새 인증 회피 → OAuth refresh 중복 방지)
// 병렬 호출 race 방지를 위해 promise 자체를 캐시 (resolved 값이 아닌)
let gmailFetcherPromise = null;

function getGmailFetcher() {
  if (!gmailFetcherPromise) {
    gmailFetcherPromise = (async () => {
      const { GmailFetcher } = require('./fetch_gmail');
      const fetcher = new GmailFetcher();
      await fetcher.authenticate();
      return fetcher;
    })().catch(err => {
      // 인증 실패 시 promise를 reset하여 다음 호출에서 재시도 가능
      gmailFetcherPromise = null;
      throw err;
    });
  }
  return gmailFetcherPromise;
}

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
      solution: '.env 파일 생성 후 OPENROUTER_API_KEY=xxx 추가'
    });
  } else if (!process.env.OPENROUTER_API_KEY) {
    errors.push({
      type: '환경 변수',
      message: 'OPENROUTER_API_KEY가 설정되지 않았습니다.',
      solution: '.env 파일에 OPENROUTER_API_KEY=xxx 추가'
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

    // 4. Run ID 및 임시 폴더 생성 (timeRange.end 기준 = 사용자 요청 날짜)
    runId = generateRunId(timeRange);
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

    // 6.5 Gmail 인증 사전 점검 (실패 시 즉시 중단 → 인증 깨짐을 빈 결과로 삼키는 silent green 방지)
    console.log('--- Gmail 인증 점검 ---');
    const authCheckFetcher = await getGmailFetcher();
    const profile = await authCheckFetcher.verifyAuth();
    console.log(`  인증 OK: ${profile.emailAddress}\n`);

    // 7. 메일 정리 실행
    const results = await processAllLabels(labels, timeRange, tempDir, progressManager, failedBatchManager, adaptiveLearning);

    const mergedDir = path.join(tempDir, 'merged');
    const finalDir = path.join(tempDir, 'final');

    // 8. 통합 HTML 생성
    console.log('\n--- 통합 HTML 생성 ---');
    // KST 기준 날짜로 파일명 생성 (timeRange.end = 사용자 요청 날짜)
    const kstDate = new Date(timeRange.end.getTime() + 9 * 60 * 60 * 1000);
    const dateStr = `${String(kstDate.getUTCFullYear()).slice(2)}${String(kstDate.getUTCMonth() + 1).padStart(2, '0')}${String(kstDate.getUTCDate()).padStart(2, '0')}`;
    const combinedHtmlPath = path.join(finalDir, `${dateStr}_통합_메일정리.html`);

    if (fs.existsSync(mergedDir)) {
      // HTML 통합 파일 생성 (토스 스타일 render_report)
      const { renderReportFromMergedDir } = require('./render_report');
      const dateFormatted = formatKST(timeRange.end).split(' ')[0];
      renderReportFromMergedDir(mergedDir, combinedHtmlPath, dateFormatted);

      // MD 통합 파일 생성
      const combinedMdPath = path.join(finalDir, `${dateStr}_통합_메일정리.md`);
      const combinedMdContent = generateCombinedMarkdown(mergedDir, timeRange.end);
      if (combinedMdContent) {
        fs.writeFileSync(combinedMdPath, combinedMdContent, 'utf8');
        console.log(`\n통합 MD 파일 생성 완료: ${combinedMdPath}`);
      }
    }

    // 10. 캐시 플러시 (AdaptiveLearning, ProgressManager)
    adaptiveLearning.flush();
    progressManager.flush();

    // 11. 결과 요약
    printSummary(results);

    // 12. 최종 결과물을 영구 저장소로 복사
    copyToFinalOutput(tempDir, runId, projectRoot);

    // 13. Progress 완료 표시
    progressManager.markCompleted();

    // 14. 성공 메시지
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

  // AgentRunner 인스턴스 (전역 재사용으로 Rate Limit 카운터 공유)
  const runner = getRunner(path.join(runDir, 'logs'));

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

  // 2. 새 뉴스레터 감지 (적응형 학습) - fetchResult가 null이면 건너뜀 (재실행 시)
  const newNewsletters = fetchResult
    ? await adaptiveLearning.processNewSenders(fetchResult, label.name)
    : { newCount: 0, newsletters: [] };

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

  // 3. HTML → Text - 증분 처리 지원
  if (!progressManager.isStepCompleted(label.name, 'html_to_text')) {
    console.log('  HTML → Text 변환 중...');
    progressManager.setStepStatus(label.name, 'html_to_text', 'in_progress');
    await convertHtmlToText(rawDir, cleanDir);
    progressManager.setStepStatus(label.name, 'html_to_text', 'completed');
  } else {
    console.log('  HTML → Text 변환 (이미 완료, 건너뜀)');
  }

  // 4. LLM 에이전트 실행 - 증분 처리 지원
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

        // 빈 senderEmail 가드: 추출 실패 시 SKILL 분기 자체를 건너뛰고 기본 처리
        if (!senderEmail) {
          console.warn(`      발신자 추출 실패 (from: "${cleanData.from}"), 기본 SKILL로 처리`);
        } else {
          // SKILL이 생성되어 있는지 확인
          const skillGenerated = adaptiveLearning.isSkillGenerated(senderEmail);
          const skillPath = adaptiveLearning.getSkillPath(senderEmail);

          if (skillGenerated && skillPath && fs.existsSync(skillPath)) {
            // 기존 SKILL 사용
            const skillFile = path.basename(skillPath);
            skills = [skillFile, 'SKILL_작성규칙.md'];
          } else if (adaptiveLearning.shouldSkipAnalyze(senderEmail)) {
            // 만성 분석 실패 발신자 → 분석 시도 안 함, 기본 라벨 에이전트로 fallback
            console.log(`      → ${senderEmail}: 분석 3회 실패 → 기본 추출로 처리`);
          } else {
            // 새 발신자 - 구조 분석 필요
            isNewSender = true;
          }
        }
      } catch (e) {
        // SKILL 매칭 실패 시 기본값 사용
        console.warn(`      SKILL 매칭 오류 (기본값 사용): ${e.message}`);
      }

      try {
        let result;

        if (isNewSender) {
          // 새 발신자: 구조 분석 + 아이템 추출 동시 수행
          // (output 지정 안 함 → 아래 메타데이터 enrich 후 단일 쓰기로 통일)
          console.log(`      → 새 발신자: ${senderEmail} (뉴스레터분석 에이전트 실행)`);

          result = await runner.runAgent(path.join(__dirname, '..', 'agents', '뉴스레터분석.md'), {
            skills: ['SKILL_작성규칙.md'],
            inputs: cleanPath,
            taskType: 'analyze'
          });

          // 분석 결과로 SKILL 저장 (실패 시 카운터 +1 → 3회 누적되면 다음부터 분석 건너뜀)
          if (result && result.analysis) {
            adaptiveLearning.saveAnalyzedSkill(senderEmail, result.analysis);
            newSkillCount++;
          } else if (senderEmail) {
            adaptiveLearning.recordAnalyzeFailure(senderEmail);
            console.warn(`      → 분석 결과에 analysis 필드 없음, 실패 카운터 +1`);
          }
        } else {
          // 기존 발신자: 일반 추출
          // (output 지정 안 함 → 아래 메타데이터 enrich 후 단일 쓰기로 통일)
          console.log(`      → 기존 발신자: ${senderEmail} (${label.name} 에이전트 실행)`);
          result = await runner.runAgent(path.join(__dirname, '..', 'agents', 'labels', `${label.name}.md`), {
            skills,
            inputs: cleanPath,
            taskType: 'extract'
          });
        }

        // 공통: 메타데이터 추가 후 저장 (단일 write)
        if (result && result.items) {
          const enrichedItems = result.items.map(item => ({
            ...item,
            source_email: senderEmail,
            message_id: messageId
          }));
          fs.writeFileSync(itemsPath, JSON.stringify({ items: enrichedItems }, null, 2), 'utf8');
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

  // 5. 병합 (배치 처리) - 증분 처리 지원
  const mergedDir = path.join(runDir, 'merged');
  if (!fs.existsSync(mergedDir)) {
    fs.mkdirSync(mergedDir, { recursive: true });
  }

  const mergedPath = path.join(mergedDir, `merged_${label.name}.json`);

  // 모든 items 파일 읽기
  const allItems = [];
  const itemFiles = fs.readdirSync(itemsDir).filter(f => f.startsWith('items_'));
  for (const itemFile of itemFiles) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(itemsDir, itemFile), 'utf8'));
      if (data.items) {
        allItems.push(...data.items);
      }
    } catch (e) {
      console.warn(`    ${itemFile} 파싱 실패, 건너뜀: ${e.message}`);
    }
  }

  console.log(`    총 ${allItems.length}개 아이템`);

  // 병합 Agent 호출 (배치 처리)
  let merged;
  const mergeAgentPath = path.join(__dirname, '..', 'agents', '병합.md');

  if (!progressManager.isStepCompleted(label.name, 'merge')) {
    progressManager.setStepStatus(label.name, 'merge', 'in_progress');

    if (fs.existsSync(mergeAgentPath) && allItems.length > 1) {
      try {
        // 코드 기반 사전 필터링: 유사한 아이템만 LLM에 전달
        const candidateMap = findMergeCandidates(allItems);
        const candidateIdxs = new Set(candidateMap.keys());
        const passThroughItems = allItems.filter((_, idx) => !candidateIdxs.has(idx));
        const mergeCheckItems = allItems.filter((_, idx) => candidateIdxs.has(idx));

        console.log(`  병합 사전 필터링: 총 ${allItems.length}개 중 후보 ${mergeCheckItems.length}개, 통과 ${passThroughItems.length}개`);

        let mergedItems = [...passThroughItems];
        let totalDuplicates = 0;

        if (mergeCheckItems.length > 1) {
          // 후보 아이템만 배치로 LLM 병합
          const MERGE_BATCH_SIZE = CONFIG.mergeBatchSize;
          for (let i = 0; i < mergeCheckItems.length; i += MERGE_BATCH_SIZE) {
            const batch = mergeCheckItems.slice(i, i + MERGE_BATCH_SIZE);
            const batchNum = Math.floor(i / MERGE_BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(mergeCheckItems.length / MERGE_BATCH_SIZE);

            console.log(`    병합 배치 ${batchNum}/${totalBatches} (${batch.length}개 후보)...`);

            try {
              const batchResult = await runner.runAgent(mergeAgentPath, {
                inputs: {
                  label: label.name,
                  items: batch
                },
                schema: {
                  required: ['items']
                },
                taskType: 'merge'
              });

              if (batchResult && batchResult.items) {
                const batchDuplicates = batch.length - batchResult.items.length;
                totalDuplicates += batchDuplicates;
                mergedItems.push(...batchResult.items);
                console.log(`      → ${batch.length}개 → ${batchResult.items.length}개 (${batchDuplicates}개 중복 제거)`);
              } else {
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
        } else if (mergeCheckItems.length === 1) {
          mergedItems.push(...mergeCheckItems);
        }

        merged = {
          label: label.name,
          merged_at: new Date().toISOString(),
          total_items: mergedItems.length,
          items: mergedItems,
          stats: {
            original_count: allItems.length,
            total_items: mergedItems.length,
            duplicates_removed: totalDuplicates,
            pre_filtered: passThroughItems.length
          }
        };

        console.log(`  병합 완료: ${allItems.length}개 → ${mergedItems.length}개 (${totalDuplicates}개 중복 제거, ${passThroughItems.length}개 사전 통과)`);
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

  // 6. MD 파일 생성 (라벨별 개별 파일 - 옵시디언용)
  console.log('  MD 파일 생성 중...');
  const finalDir = path.join(runDir, 'final');
  if (!fs.existsSync(finalDir)) {
    fs.mkdirSync(finalDir, { recursive: true });
  }

  // KST 기준 날짜로 파일명 생성 (timeRange.end = 사용자 요청 날짜)
  const kstDateMd = new Date(timeRange.end.getTime() + 9 * 60 * 60 * 1000);
  const dateStr = `${String(kstDateMd.getUTCFullYear()).slice(2)}${String(kstDateMd.getUTCMonth() + 1).padStart(2, '0')}${String(kstDateMd.getUTCDate()).padStart(2, '0')}`;
  const finalMd = path.join(finalDir, `${dateStr}_${label.name}_메일정리.md`);

  // MD 파일 생성 (timeRange.end = 사용자 요청 날짜)
  const mdContent = generateMarkdown(merged, timeRange.end);
  fs.writeFileSync(finalMd, mdContent, 'utf8');

  // HTML은 통합 파일로 main()에서 생성됨

  console.log(`[완료] ${label.name} (${allItems.length}개 아이템)`);

  // 7. 처리된 메시지 읽음 표시 (전역 fetcher 재사용)
  console.log('  처리된 메일 읽음 표시 중...');
  try {
    const fetcher = await getGmailFetcher();
    const processedIds = msgFiles.map(f => f.replace('msg_', '').replace('.json', ''));
    const markResult = await fetcher.markMessagesAsRead(processedIds);
    console.log(`  읽음 표시: ${markResult.success}개 완료`);
  } catch (error) {
    console.warn(`  읽음 표시 실패 (무시): ${error.message}`);
  }

  // 8. 적응형 학습 catalog flush (라벨 끝날 때마다 → 중간 크래시 시 새 SKILL 등록 보존)
  adaptiveLearning.flush();

  return {
    label: label.name,
    success: true,
    messageCount: msgFiles.length,
    itemCount: allItems.length,
    newNewsletters: newNewsletters.newsletters
  };
}

/**
 * Gmail 메시지 가져오기 (전역 fetcher 재사용)
 */
async function fetchGmailMessages(label, timeRange, outputDir) {
  const dateStart = formatGmailDate(new Date(timeRange.start.getTime() - 24 * 60 * 60 * 1000));
  const dateEnd = formatGmailDate(new Date(timeRange.end.getTime() + 24 * 60 * 60 * 1000));

  // 실제 시간 범위를 ISO 문자열로 전달 (정밀 필터링용)
  const rangeStart = timeRange.start.toISOString();
  const rangeEnd = timeRange.end.toISOString();

  let fetcher = null;
  try {
    fetcher = await getGmailFetcher();

    const result = await fetcher.fetchMessages({
      label: label.gmail_label || label.name,
      subLabels: (label.sub_labels || []).join(','),
      dateStart,
      dateEnd,
      rangeStart,
      rangeEnd,
      outputDir
    });

    // 카탈로그 라벨 가드: 다른 라벨이 정규인 발신자의 메일을 이 라벨에서 제외
    // (중복/오염 방지 — 예: Morning Brew·Axios가 '경제'에 끌려오는 것 차단)
    try { filterRawByCatalogLabel(outputDir, label.name); } catch (e) { /* 가드 실패는 무시 */ }

    return result;
  } catch (error) {
    // 인증 에러(토큰 만료/폐기)는 삼키지 않고 전파 → 전체 run이 실패하여 알림이 가도록
    if (fetcher && typeof fetcher.isAuthError === 'function' && fetcher.isAuthError(error)) {
      throw error;
    }
    // 그 외(일시적 오류, 라벨 없음 등)는 기존대로 관용 처리
    console.warn(`  Gmail API 오류 (메일 없을 수 있음): ${error.message}`);
    return null;
  }
}

/**
 * HTML → Text 변환 (병렬 처리)
 */
async function convertHtmlToText(rawDir, cleanDir) {
  const { htmlToText, cleanNewsletterText } = require('./html_to_text');
  const { enrichWithArticles } = require('./fetch_articles');

  const msgFiles = fs.readdirSync(rawDir).filter(f => f.startsWith('msg_'));

  // 순차 처리 (원문 크롤링 포함으로 병렬 축소)
  const PARALLEL_LIMIT = 3;
  for (let i = 0; i < msgFiles.length; i += PARALLEL_LIMIT) {
    const batch = msgFiles.slice(i, i + PARALLEL_LIMIT);

    await Promise.all(batch.map(async (file) => {
      const messageId = file.replace('msg_', '').replace('.json', '');
      const cleanPath = path.join(cleanDir, 'clean_' + messageId + '.json');

      // 증분 처리: 이미 변환된 파일은 건너뜀 (재실행 시 원문 재크롤링 방지)
      if (fs.existsSync(cleanPath)) {
        return;
      }

      const msgData = JSON.parse(fs.readFileSync(path.join(rawDir, file), 'utf8'));

      let cleanText = '';
      if (msgData.html_body) {
        cleanText = htmlToText(msgData.html_body);
        cleanText = cleanNewsletterText(cleanText);
      }

      // 원문 링크 크롤링으로 본문 보강
      if (cleanText.length > 0) {
        try {
          cleanText = await enrichWithArticles(cleanText, {
            maxUrls: 15,
            maxCharsPerArticle: 3000,
            minArticleLength: 200,
            concurrency: 5,
            log: (msg) => console.log(`    [${messageId.substring(0, 8)}] ${msg}`)
          });
        } catch (e) {
          // 크롤링 실패 시 원본 유지
          console.warn(`    [${messageId.substring(0, 8)}] 원문 크롤링 실패: ${e.message}`);
        }
      }

      const cleanData = {
        message_id: messageId,
        from: msgData.from,
        subject: msgData.subject,
        date: msgData.date,
        labels: msgData.labels,
        clean_text: cleanText
      };

      fs.writeFileSync(cleanPath, JSON.stringify(cleanData, null, 2), 'utf8');
    }));
  }
}

/**
 * 마크다운 생성
 */
function generateMarkdown(merged, date) {
  const dateStr = formatKST(date).split(' ')[0];

  let md = `# ${merged.label} 메일 정리 (${dateStr})\n\n`;
  md += `> 총 ${merged.items.length}개 아이템\n\n`;
  md += `---\n\n`;

  // 목록형 뉴스레터 감지: 아이템 30개 이상 + 평균 요약 100자 미만
  const avgSummaryLen = merged.items.length > 0
    ? merged.items.reduce((s, i) => s + (i.summary?.length || 0), 0) / merged.items.length
    : 999;
  const isListType = merged.items.length >= 30 && avgSummaryLen < 100;

  if (isListType) {
    // === 목록형 뉴스레터: 클러스터링 + 토글 ===
    const clusters = clusterItemsByKeyword(merged.items, 0.15);

    md += `이번 호 주요 동향:\n\n`;
    clusters.forEach(cluster => {
      md += `**${cluster.representative_title}** 외 ${cluster.items_count - 1}건\n\n`;
    });

    md += `\n<details>\n<summary>📂 전체 목록 펼치기 (${merged.items.length}건)</summary>\n\n`;

    merged.items.forEach((item, i) => {
      md += `${i + 1}. **${item.title}**`;
      if (item.summary && item.summary !== item.title) {
        md += ` ${item.summary}`;
      }
      if (item.link) {
        md += ` [원문 보기](${item.link})`;
      }
      md += `\n`;
    });

    md += `\n</details>\n\n---\n\n`;
  } else {
    // === 일반 뉴스레터: 기존 방식 ===
    merged.items.forEach((item, i) => {
      md += `## ${i + 1}. ${item.title}\n\n`;
      md += `${item.summary}\n\n`;

      if (item.keywords && item.keywords.length > 0) {
        md += `**키워드**: ${item.keywords.map(k => `#${k}`).join(' ')}\n\n`;
      }

      if (item.link) {
        md += `[원문 보기](${item.link})\n\n`;
      }

      md += `---\n\n`;
    });
  }

  return md;
}

/**
 * 통합 마크다운 생성 (모든 라벨 통합)
 */
function generateCombinedMarkdown(mergedDir, date) {
  const dateStr = formatKST(date).split(' ')[0];

  // merged 폴더에서 모든 JSON 파일 읽기
  const mergedFiles = fs.readdirSync(mergedDir)
    .filter(f => f.startsWith('merged_') && f.endsWith('.json'))
    .sort();

  if (mergedFiles.length === 0) {
    return '';
  }

  // 손상된 merged 파일 한 개가 통합 MD 생성 전체를 중단시키지 않도록 try-catch
  const allLabelsData = mergedFiles.reduce((acc, file) => {
    try {
      acc.push(JSON.parse(fs.readFileSync(path.join(mergedDir, file), 'utf8')));
    } catch (e) {
      console.warn(`  통합 MD: ${file} 파싱 실패, 건너뜀: ${e.message}`);
    }
    return acc;
  }, []);

  if (allLabelsData.length === 0) {
    return '';
  }

  // 전체 아이템 수 계산
  const totalItems = allLabelsData.reduce((sum, data) => sum + (data.items?.length || 0), 0);

  let md = `# 전체 메일 정리 (${dateStr})\n\n`;
  md += `> 총 ${totalItems}개 아이템\n\n`;
  md += `## 📊 라벨별 요약\n\n`;

  allLabelsData.forEach(data => {
    md += `- **${data.label}**: ${data.items?.length || 0}개\n`;
  });

  md += `\n---\n\n`;

  // 각 라벨별 내용
  allLabelsData.forEach((data, labelIndex) => {
    const items = data.items || [];

    md += `# ${data.label}\n\n`;
    md += `> ${items.length}개 아이템\n\n`;

    items.forEach((item, i) => {
      md += `## ${i + 1}. ${item.title}\n\n`;
      md += `${item.summary}\n\n`;

      if (item.keywords && item.keywords.length > 0) {
        md += `**키워드**: ${item.keywords.map(k => `#${k}`).join(' ')}\n\n`;
      }

      // 링크 추가
      if (item.link) {
        md += `**링크**: [원문 보기](${item.link})\n\n`;
      }

      md += `---\n\n`;
    });

    // 라벨 간 구분선 (마지막 라벨 제외)
    if (labelIndex < allLabelsData.length - 1) {
      md += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n\n`;
    }
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
      // 오늘 0시 ~ 현재 (KST 기준)
      const todayKSTForToday = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const todayStrForToday = todayKSTForToday.toISOString().split('T')[0];
      return {
        start: new Date(todayStrForToday + 'T00:00:00+09:00'),
        end: now
      };

    case 'last-24h':
      // 24시간 전 ~ 현재
      return {
        start: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        end: now
      };

    case 'custom':
      // 특정 날짜의 모든 메일 수집 (전날 0:00 ~ 당일 23:59 KST)
      // schedule 모드보다 넓은 범위로 누락 방지
      if (!customDate || !/^\d{4}-\d{2}-\d{2}$/.test(customDate)) {
        throw new Error(`잘못된 날짜 형식: '${customDate}' (YYYY-MM-DD 형식 필요, 예: --date 2026-02-10)`);
      }
      const [year, month, day] = customDate.split('-').map(Number);
      const prevDay = new Date(year, month - 1, day - 1);
      const prevDateStr = `${prevDay.getFullYear()}-${String(prevDay.getMonth() + 1).padStart(2, '0')}-${String(prevDay.getDate()).padStart(2, '0')}`;
      return {
        start: new Date(prevDateStr + 'T00:00:00+09:00'),
        end: new Date(customDate + 'T23:59:59+09:00')
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
function generateRunId(timeRange) {
  // timeRange.end 기준으로 Run ID 생성 (사용자가 요청한 날짜)
  // Custom: 2월 4일 입력 → end = Feb 4 10:00 → Run ID = 20260204
  // Schedule: 2월 5일 실행 → end = Feb 5 10:00 → Run ID = 20260205
  const targetDate = timeRange ? timeRange.end : new Date();
  const kstTarget = new Date(targetDate.getTime() + 9 * 60 * 60 * 1000);
  const year = kstTarget.getUTCFullYear();
  const month = String(kstTarget.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kstTarget.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;  // 예: 20260204
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

module.exports = {
  processAllLabels,
  processLabel,
  main,
  // 테스트용 내부 함수 export
  _test: {
    ProgressManager,
    FailedBatchManager,
    findMergeCandidates,
    clusterItemsByKeyword,
    parseArgs,
    calculateTimeRange,
    getLabels,
    printSummary,
    generateRunId,
    formatKST,
    formatGmailDate,
    extractSenderEmail,
    generateMarkdown,
    generateCombinedMarkdown,
    checkSetup,
    convertHtmlToText,
    fetchGmailMessages,
    filterRawByCatalogLabel,
    getSenderLabelMap,
    getRunner,
    getGmailFetcher,
    // 전역 상태 리셋 (테스트 격리용)
    _resetGlobals: () => {
      globalRunner = null;
      gmailFetcherPromise = null;
    }
  }
};
