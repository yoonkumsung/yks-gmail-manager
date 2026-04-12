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
        merge: 'pending',
        insight: 'pending'
      };
      this._markDirty();
    }
  }

  setStepStatus(labelName, step, status) {
    this.initLabel(labelName);
    this.progress.labels[labelName][step] = status;
    // completed 상태일 때만 즉시 저장 (중간 상태는 캐싱)
    if (status === 'completed') {
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
  try {
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
    let copied = 0;
    for (const file of files) {
      if (file.endsWith('.html') || file.endsWith('.md')) {
        fs.copyFileSync(
          path.join(tempFinalDir, file),
          path.join(finalOutputDir, file)
        );
        copied++;
      }
    }

    if (copied > 0) {
      console.log(`  결과물 복사됨: ${finalOutputDir} (${copied}개 파일)`);
    }
  } catch (e) {
    console.error(`  결과물 복사 실패: ${e.message}`);
  }
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

// settings.json에서 LLM 설정 로드
const settingsPath = path.join(__dirname, '..', 'config', 'settings.json');
let settings;
try {
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
} catch (e) {
  console.error(`settings.json 로드 실패: ${e.message}`);
  process.exit(1);
}

const CONFIG = {
  concurrencyLimit: 3,    // 병렬 3개 처리

  // LLM 설정은 settings.json에서 로드
  // ⚠️ 모델/프로바이더 변경 시: config/settings.json의 llm 섹션만 수정
  llm: settings.llm || {},

  mergeBatchSize: 15,     // 병합 배치 크기
  insightBatchSize: 10,   // 인사이트 배치 크기 기본값
  insightBatchFallback: [10, 8, 6, 4, 2, 1],  // 실패 시 축소 순서

  // 시간 예산 (ms)
  crossInsightBudgetMs: 15 * 60 * 1000,  // 크로스 인사이트 전체: 15분
  insightBudgetMs: 45 * 60 * 1000         // 인사이트 전체: 45분
};

/**
 * 아이템 복잡도 기반 동적 배치 크기 계산
 * 복잡한 아이템일수록 작은 배치로 처리하여 품질 확보
 */
function calculateOptimalBatchSize(items) {
  if (!items || items.length === 0) return CONFIG.insightBatchSize;

  // 각 아이템의 복잡도 점수 계산
  const complexityScores = items.map(item => {
    let score = 0;

    // 요약 길이 기반 점수 (긴 요약 = 더 복잡한 내용)
    const summaryLen = item.summary?.length || 0;
    if (summaryLen > 400) score += 2;
    else if (summaryLen > 250) score += 1;

    // 키워드 수 기반 점수 (키워드 많음 = 다양한 주제)
    const keywordCount = item.keywords?.length || 0;
    if (keywordCount >= 5) score += 1;

    // 제목 길이 기반 점수 (긴 제목 = 복잡한 내용)
    const titleLen = item.title?.length || 0;
    if (titleLen > 40) score += 1;

    return score;
  });

  const avgComplexity = complexityScores.reduce((a, b) => a + b, 0) / items.length;

  // 복잡도에 따른 배치 크기 결정 (품질 우선)
  if (avgComplexity >= 3) return 4;   // 매우 복잡 → 소규모 배치
  if (avgComplexity >= 2) return 6;   // 복잡 → 중소 배치
  if (avgComplexity >= 1) return 8;   // 보통 → 중간 배치
  return CONFIG.insightBatchSize;      // 단순 → 기본 배치
}

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

/**
 * 출력 품질 검증 - 코드 기반 (API 호출 없음)
 * 요약 길이, 키워드, 인사이트 품질, 금지 표현 등 검사
 */
function validateOutputQuality(items, labelName) {
  const issues = [];
  const banned = ['패러다임 전환', '혁신적', '새로운 지평', '가속화할 것', '핵심이 될 것', '시사점을 제공', '중요성을 보여준다'];

  items.forEach((item, idx) => {
    const itemRef = `[${labelName}] #${idx + 1} "${(item.title || '').substring(0, 20)}..."`;

    // 요약 길이 검사
    const summaryLen = item.summary?.length || 0;
    if (summaryLen > 0 && summaryLen < 200) {
      issues.push(`${itemRef}: 요약 너무 짧음 (${summaryLen}자, 최소 200자 필수)`);
    }

    // 키워드 검사
    if (!item.keywords || item.keywords.length === 0) {
      issues.push(`${itemRef}: 키워드 없음`);
    }

    // 인사이트 품질 검사
    if (item.insights) {
      const domainLen = item.insights.domain?.content?.length || 0;
      const crossLen = item.insights.cross_domain?.content?.length || 0;

      if (domainLen > 0 && domainLen < 50) {
        issues.push(`${itemRef}: domain 인사이트 너무 짧음 (${domainLen}자)`);
      }
      if (crossLen > 0 && crossLen < 50) {
        issues.push(`${itemRef}: cross_domain 인사이트 너무 짧음 (${crossLen}자)`);
      }

      // 금지 표현 검사
      const allInsightText = (item.insights.domain?.content || '') + (item.insights.cross_domain?.content || '');
      for (const phrase of banned) {
        if (allInsightText.includes(phrase)) {
          issues.push(`${itemRef}: 금지 표현 "${phrase}" 사용됨`);
        }
      }
    }
  });

  if (issues.length > 0) {
    console.warn(`\n  [품질 검증] ${labelName}: ${issues.length}개 이슈 발견`);
    issues.forEach(issue => console.warn(`    - ${issue}`));
  } else {
    console.log(`  [품질 검증] ${labelName}: 통과`);
  }

  return issues;
}

// ============================================
// [개선 #3] 아이템 품질 검증 + 재추출
// ============================================

/**
 * 아이템 개별 품질 검사
 * @returns {string[]} 품질 이슈 목록 (빈 배열이면 통과)
 */
function checkItemQuality(item) {
  const issues = [];

  // 1. 요약 최소 길이
  if (!item.summary || item.summary.length < 150) {
    issues.push('summary_too_short');
  }

  // 2. 요약이 제목의 단순 반복
  if (item.title && item.summary) {
    const titleNorm = item.title.replace(/[^가-힣a-zA-Z0-9\s]/g, '').toLowerCase().trim();
    const summaryStart = item.summary.substring(0, Math.min(item.summary.length, titleNorm.length + 20))
      .replace(/[^가-힣a-zA-Z0-9\s]/g, '').toLowerCase().trim();
    if (titleNorm.length > 5 && summaryStart.includes(titleNorm) && item.summary.length < 200) {
      issues.push('summary_equals_title');
    }
  }

  // 3. 요약에 구체성 부족 (수치/고유명사 없음)
  if (item.summary && item.summary.length > 0 && item.summary.length < 250) {
    const hasNumbers = /\d+/.test(item.summary);
    const hasEnglishProperNoun = /[A-Z][a-z]{2,}/.test(item.summary);
    if (!hasNumbers && !hasEnglishProperNoun) {
      issues.push('summary_too_vague');
    }
  }

  return issues;
}

/**
 * 품질 검증 후 미달 아이템 재추출
 */
async function validateAndReextractItems(items, cleanData, runner, label, skills, senderEmail, messageId) {
  if (!items || items.length === 0) return items;

  const qualityFailedItems = [];
  for (let i = 0; i < items.length; i++) {
    const issues = checkItemQuality(items[i]);
    if (issues.length > 0) {
      qualityFailedItems.push({ index: i, item: items[i], issues });
    }
  }

  if (qualityFailedItems.length === 0) return items;

  console.log(`      [품질검증] ${qualityFailedItems.length}/${items.length}개 아이템 미달, 재추출 시도...`);

  for (const { index, item, issues } of qualityFailedItems) {
    try {
      // 원문에서 해당 아이템 관련 텍스트 발췌 (제목 기반 검색)
      const cleanText = cleanData?.clean_text || '';
      const titleWords = (item.title || '').split(/\s+/).filter(w => w.length > 2);
      let excerpt = cleanText;

      // 원문에서 제목 키워드가 포함된 영역 추출
      if (titleWords.length > 0 && cleanText.length > 500) {
        const titleKeyword = titleWords[0];
        const keywordIdx = cleanText.indexOf(titleKeyword);
        if (keywordIdx >= 0) {
          const start = Math.max(0, keywordIdx - 200);
          const end = Math.min(cleanText.length, keywordIdx + 1500);
          excerpt = cleanText.substring(start, end);
        }
      }

      // itemExtract 태스크로 재추출
      const reResult = await runner.runAgent(
        path.join(__dirname, '..', 'agents', 'labels', `${label.name}.md`),
        {
          skills,
          inputs: { clean_text: excerpt, subject: item.title, from: senderEmail },
          taskType: 'itemExtract'
        }
      );

      if (reResult && reResult.items && reResult.items.length > 0) {
        const reItem = reResult.items[0];
        // 재추출 결과가 원본보다 나으면 교체 (원본 메타데이터 모두 보존)
        if (reItem.summary && reItem.summary.length > (item.summary?.length || 0)) {
          items[index] = {
            ...item,             // 원본 메타데이터 먼저 (source, source_email, received_at, message_id)
            ...reItem,           // 재추출된 콘텐츠로 덮어쓰기 (title, summary, keywords, link 등)
            source: reItem.source || item.source,
            source_email: item.source_email || senderEmail,
            received_at: item.received_at,
            message_id: item.message_id || messageId
          };
          console.log(`        아이템 #${index + 1} 재추출 성공 (${reItem.summary.length}자)`);
        }
      }
    } catch (e) {
      // 재추출 실패 시 원본 유지
      console.warn(`        아이템 #${index + 1} 재추출 실패 (원본 유지): ${e.message}`);
    }
  }

  return items;
}

// ============================================
// [개선 #7] SKILL 건강도 관리
// ============================================

// ============================================
// 뉴스레터 이름 맵 (sender email → name)
// ============================================

let _newsletterMapCache = null;
function loadNewsletterNameMap() {
  if (_newsletterMapCache) return _newsletterMapCache;
  const nlPath = path.join(__dirname, '..', 'config', 'newsletters.json');
  const map = {};
  if (fs.existsSync(nlPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(nlPath, 'utf8'));
      for (const nl of (data.newsletters || [])) {
        const senders = [];
        if (nl.sender) senders.push(nl.sender);
        if (Array.isArray(nl.senders)) senders.push(...nl.senders);
        for (const s of senders) {
          if (s && nl.name) map[s.toLowerCase()] = nl.name;
        }
      }
    } catch (e) {
      console.warn(`[뉴스레터 맵] 로드 실패: ${e.message}`);
    }
  }
  _newsletterMapCache = new Proxy(map, {
    get(target, prop) {
      if (typeof prop !== 'string') return target[prop];
      return target[prop.toLowerCase()];
    }
  });
  return _newsletterMapCache;
}

// ============================================
// 수신 시각 포맷팅 (KST, MM/DD HH:MM)
// ============================================

function formatReceivedAt(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    // KST로 변환
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(kst.getUTCDate()).padStart(2, '0');
    const hh = String(kst.getUTCHours()).padStart(2, '0');
    const mi = String(kst.getUTCMinutes()).padStart(2, '0');
    return `${mm}/${dd} ${hh}:${mi}`;
  } catch {
    return '';
  }
}

function loadSkillHealth(healthPath) {
  if (fs.existsSync(healthPath)) {
    try { return JSON.parse(fs.readFileSync(healthPath, 'utf8')); }
    catch { return {}; }
  }
  return {};
}

function saveSkillHealth(healthPath, health) {
  try {
    fs.writeFileSync(healthPath, JSON.stringify(health, null, 2), 'utf8');
  } catch (e) {
    console.warn(`  SKILL 건강도 저장 실패: ${e.message}`);
  }
}

function recordSkillResult(health, senderEmail, success) {
  if (!senderEmail) return;
  if (!health[senderEmail]) {
    health[senderEmail] = { success: 0, fail: 0, lastRenewal: null };
  }
  if (success) {
    health[senderEmail].success++;
  } else {
    health[senderEmail].fail++;
  }
}

function shouldRenewSkill(health, senderEmail) {
  const record = health[senderEmail];
  if (!record) return false;

  const total = record.success + record.fail;
  if (total < 3) return false; // 데이터 부족

  const failRate = record.fail / total;
  if (failRate < 0.3) return false; // 임계치 미달

  // 너무 자주 갱신하지 않음 (최소 7일 간격)
  if (record.lastRenewal) {
    const daysSince = (Date.now() - new Date(record.lastRenewal).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 7) return false;
  }

  return true;
}

function markSkillRenewed(health, senderEmail) {
  if (!senderEmail) return;
  if (!health[senderEmail]) {
    health[senderEmail] = { success: 0, fail: 0, lastRenewal: null };
  }
  health[senderEmail].lastRenewal = new Date().toISOString();
  health[senderEmail].success = 0;
  health[senderEmail].fail = 0;
}

// ============================================
// [개선 #6] original_excerpt 생성
// ============================================

/**
 * 아이템의 원문 발췌를 생성 (인사이트 품질 향상용)
 * @param {object} item - 추출된 아이템
 * @param {string} cleanDir - clean 파일 디렉토리
 * @returns {string} 원문 발췌 (최대 400자)
 */
function getOriginalExcerpt(item, cleanDir) {
  if (!item.message_id) return '';
  try {
    const cleanPath = path.join(cleanDir, `clean_${item.message_id}.json`);
    if (!fs.existsSync(cleanPath)) return '';
    const cleanData = JSON.parse(fs.readFileSync(cleanPath, 'utf8'));
    const cleanText = cleanData.clean_text || '';
    if (!cleanText || cleanText.length < 50) return '';

    // 제목 키워드 기반으로 관련 영역 찾기
    const titleWords = (item.title || '').split(/\s+/).filter(w => w.length > 2);
    if (titleWords.length > 0) {
      for (const word of titleWords) {
        const idx = cleanText.indexOf(word);
        if (idx >= 0) {
          const start = Math.max(0, idx - 50);
          const end = Math.min(cleanText.length, idx + 350);
          return cleanText.substring(start, end).trim();
        }
      }
    }

    // 키워드 매칭 실패 시 앞부분 발췌
    return cleanText.substring(0, 400).trim();
  } catch {
    return '';
  }
}

/**
 * Split 폴백 - Reduce 단계 실패 시 3개 하위 태스크로 분리 호출
 * mega_trends / cross_connections / action_items 각각 독립 호출 후 결합
 */
async function generateCrossInsightSplit(labelSummaries, dateFormatted, runner, crossAgentPath, outputPath) {
  console.log('  Split 폴백: 3개 하위 태스크로 분리 호출...');

  const subTasks = [
    { key: 'mega_trends', instruction: 'mega_trends(메가트렌드) 부분만 생성하세요. cross_connections와 action_items는 빈 배열로 출력하세요.' },
    { key: 'cross_connections', instruction: 'cross_connections(크로스 연결) 부분만 생성하세요. mega_trends와 action_items는 빈 배열로 출력하세요.' },
    { key: 'action_items', instruction: 'action_items(사용자 액션) 부분만 생성하세요. mega_trends와 cross_connections는 빈 배열로 출력하세요.' }
  ];

  const splitBudgetMs = 5 * 60 * 1000;  // 각 하위 태스크 5분

  const results = await Promise.all(
    subTasks.map(async (task) => {
      try {
        const input = {
          date: dateFormatted,
          labels: labelSummaries,
          _focus: task.instruction
        };

        const result = await runner.runAgent(crossAgentPath, {
          skills: [],
          inputs: input,
          taskType: 'crossInsight',
          skipChunking: true,
          maxTimeMs: splitBudgetMs
        });

        if (result && result[task.key]) {
          console.log(`    Split ${task.key}: 성공 (${result[task.key].length}개)`);
          return { key: task.key, data: result[task.key] };
        }
        console.warn(`    Split ${task.key}: 결과 없음`);
        return { key: task.key, data: [] };
      } catch (err) {
        console.warn(`    Split ${task.key}: 실패 (${err.message})`);
        return { key: task.key, data: [] };
      }
    })
  );

  // 결합
  const combined = {
    mega_trends: [],
    cross_connections: [],
    action_items: []
  };

  for (const r of results) {
    combined[r.key] = r.data;
  }

  // 하나라도 결과가 있으면 반환
  if (combined.mega_trends.length > 0 || combined.cross_connections.length > 0 || combined.action_items.length > 0) {
    // 결과 저장
    if (outputPath) {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(combined, null, 2), 'utf8');
    }
    console.log(`  Split 폴백 완료: 메가트렌드 ${combined.mega_trends.length}개, 크로스 연결 ${combined.cross_connections.length}개, 사용자 액션 ${combined.action_items.length}개`);
    return combined;
  }

  console.warn('  Split 폴백도 결과 없음');
  return null;
}

/**
 * 코드 기반 라벨 요약 폴백 (API 호출 없음)
 * Map 단계 LLM 호출 실패 시 키워드 빈도 기반으로 요약 생성
 */
function codeFallbackLabelSummary(label, items) {
  // 키워드 빈도 계산
  const kwFreq = new Map();
  for (const item of items) {
    for (const kw of (item.keywords || [])) {
      const lower = kw.toLowerCase();
      kwFreq.set(lower, (kwFreq.get(lower) || 0) + 1);
    }
  }
  const topKeywords = [...kwFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([kw]) => kw);

  // 클러스터링으로 테마 생성
  const clusters = clusterItemsByKeyword(items, 0.2);
  const themes = clusters.slice(0, 5).map(cluster => ({
    topic: cluster.keywords.slice(0, 3).join(' / '),
    description: `${cluster.items_count}개 관련 뉴스. 주요 키워드: ${cluster.keywords.slice(0, 5).join(', ')}`,
    representative_items: cluster.item_titles.slice(0, 3)
  }));

  return {
    label,
    themes,
    keywords: topKeywords,
    business_impact: `${label} 라벨에서 ${items.length}개 뉴스 중 ${themes.length}개 주제 식별`
  };
}

/**
 * 크로스 라벨 인사이트 생성 (Map-Reduce 방식)
 * Map: 각 라벨 → 클러스터링 → 라벨요약 에이전트 (병렬 3개)
 * Reduce: 라벨 요약들 → 크로스인사이트 에이전트
 */
async function generateCrossLabelInsight(mergedDir, tempDir, timeRange) {
  const mergedFiles = fs.readdirSync(mergedDir)
    .filter(f => f.startsWith('merged_') && f.endsWith('.json'));

  if (mergedFiles.length < 2) {
    console.log('  라벨이 2개 미만이어서 크로스 인사이트 건너뜀');
    return null;
  }

  // 각 라벨에서 아이템 수집
  const labelsWithItems = [];
  let totalItems = 0;

  for (const file of mergedFiles) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(mergedDir, file), 'utf8'));
      const items = (data.items || []).map(item => ({
        title: item.title,
        summary: item.summary || '',
        keywords: item.keywords || []
      }));

      if (items.length > 0) {
        labelsWithItems.push({ label: data.label, items });
        totalItems += items.length;
      }
    } catch (e) {
      console.warn(`  ${file} 파싱 실패, 건너뜀: ${e.message}`);
    }
  }

  if (labelsWithItems.length < 2 || totalItems < 3) {
    console.log('  데이터 부족 (라벨 2개 이상, 아이템 3개 이상 필요)');
    return null;
  }

  console.log(`  [Stage 1/2] 라벨별 요약 생성 중... (${labelsWithItems.length}개 라벨, ${totalItems}개 아이템)`);

  // === Map 단계: 각 라벨 → 클러스터링 → 라벨요약 에이전트 (병렬) ===
  const logDir = path.join(tempDir, 'logs');
  const runner = await getRunner(logDir);
  const summaryAgentPath = path.join(__dirname, '..', 'agents', '라벨요약.md');
  const limit = createLimiter(CONFIG.concurrencyLimit);

  const labelSummaries = await Promise.all(
    labelsWithItems.map(({ label, items }) =>
      limit(async () => {
        try {
          // 클러스터링으로 전처리
          const clusters = clusterItemsByKeyword(items, 0.2);
          console.log(`    ${label}: ${items.length}개 아이템 → ${clusters.length}개 클러스터`);

          // 라벨요약 에이전트 호출
          const result = await runner.runAgent(summaryAgentPath, {
            skills: [],
            inputs: { label, items },
            taskType: 'summarize',
            skipChunking: true,
            maxTimeMs: Math.floor(CONFIG.crossInsightBudgetMs / 2)  // Map 단계에 예산의 절반
          });

          if (result && result.themes && result.themes.length > 0) {
            console.log(`    ${label}: 요약 성공 (${result.themes.length}개 주제)`);
            return result;
          }

          // 결과 부족 시 코드 폴백
          console.log(`    ${label}: LLM 결과 부족, 코드 폴백 사용`);
          return codeFallbackLabelSummary(label, items);
        } catch (error) {
          console.warn(`    ${label}: 요약 실패 (${error.message}), 코드 폴백 사용`);
          return codeFallbackLabelSummary(label, items);
        }
      })
    )
  );

  // 유효한 요약만 필터
  const validSummaries = labelSummaries.filter(s => s && s.themes && s.themes.length > 0);

  if (validSummaries.length < 2) {
    console.log('  유효한 라벨 요약이 2개 미만, 크로스 인사이트 건너뜀');
    return null;
  }

  // === Reduce 단계: 라벨 요약들 → 크로스인사이트 에이전트 ===
  console.log(`  [Stage 2/2] 크로스 인사이트 종합 중... (${validSummaries.length}개 라벨 요약)`);

  const crossAgentPath = path.join(__dirname, '..', 'agents', '크로스인사이트.md');
  const dateFormatted = formatKST(timeRange.end).split(' ')[0];

  const reduceInput = {
    date: dateFormatted,
    labels: validSummaries
  };

  const outputPath = path.join(mergedDir, '_cross_insight_raw.json');

  try {
    const result = await runner.runAgent(crossAgentPath, {
      skills: [],
      inputs: reduceInput,
      output: outputPath,
      taskType: 'crossInsight',
      skipChunking: true,
      maxTimeMs: Math.floor(CONFIG.crossInsightBudgetMs / 2)  // Reduce 단계에 예산의 절반
    });

    if (result && (result.mega_trends || result.cross_connections || result.action_items)) {
      return result;
    }

    // 파일에서 읽기 시도
    if (fs.existsSync(outputPath)) {
      try {
        return JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      } catch (e) {
        console.error('  크로스 인사이트 파싱 실패:', e.message);
      }
    }
  } catch (reduceError) {
    console.warn(`  Reduce 단계 실패: ${reduceError.message}, Split 폴백 시도...`);
    // Split 폴백 시도
    return await generateCrossInsightSplit(validSummaries, dateFormatted, runner, crossAgentPath, outputPath);
  }

  return null;
}

// 전역 AgentRunner 인스턴스 (Rate Limit 카운터 공유, 작업별 자동 모델 선택)
let globalRunner = null;

async function getRunner(logDir) {
  if (!globalRunner) {
    globalRunner = new AgentRunner(
      CONFIG.llm,
      { logDir }
    );
    // 프로바이더별 모델 메타데이터 동적 조회 (reasoning 지원, maxTokens 등)
    await globalRunner.initModelMetadata();
  }
  return globalRunner;
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

  // 2. 환경 변수 (.env + LLM API 키)
  const envPath = path.join(projectRoot, '.env');
  if (!fs.existsSync(envPath)) {
    errors.push({
      type: '환경 변수',
      message: '.env 파일이 없습니다.',
      solution: '.env 파일 생성 후 LLM API 키 추가 (GOOGLE_AI_API_KEY 또는 OPENROUTER_API_KEY)'
    });
  } else {
    // settings.json에 등록된 프로바이더 중 최소 하나의 API 키가 있는지 확인
    const providers = settings.llm?.providers || {};
    const hasAnyKey = Object.values(providers).some(p => process.env[p.envKey]);
    if (!hasAnyKey) {
      const keyNames = Object.values(providers).map(p => p.envKey).join(' 또는 ');
      errors.push({
        type: '환경 변수',
        message: 'LLM API 키가 설정되지 않았습니다.',
        solution: `.env 파일에 ${keyNames} 추가`
      });
    }
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
  const runStartTime = Date.now();

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

    // 7. 메일 정리 실행
    const results = await processAllLabels(labels, timeRange, tempDir, progressManager, failedBatchManager, adaptiveLearning);

    // 7-1. 인증 에러 확인 - 전체 라벨이 인증 에러로 실패하면 워크플로우 실패 처리
    const authErrors = results.filter(r => r.error && r.isAuthError);
    if (authErrors.length > 0) {
      console.error(`\n[치명적 오류] Gmail 인증 실패 (${authErrors.length}개 라벨)`);
      console.error('토큰이 만료되었을 수 있습니다. npm run auth로 재인증하세요.');
      process.exit(1);
    }

    // 8. 크로스 라벨 인사이트 생성
    const mergedDir = path.join(tempDir, 'merged');
    const finalDir = path.join(tempDir, 'final');
    let crossInsightData = null;

    if (fs.existsSync(mergedDir)) {
      console.log('\n--- 크로스 라벨 인사이트 생성 ---');
      try {
        crossInsightData = await generateCrossLabelInsight(mergedDir, tempDir, timeRange);
        if (crossInsightData) {
          console.log(`  메가트렌드 ${crossInsightData.mega_trends?.length || 0}개, 크로스 연결 ${crossInsightData.cross_connections?.length || 0}개, 사용자 액션 ${crossInsightData.action_items?.length || 0}개`);
          // 크로스 인사이트 결과를 파일로 저장 (HTML/MD 생성에서 사용)
          const crossInsightPath = path.join(mergedDir, '_cross_insight.json');
          fs.writeFileSync(crossInsightPath, JSON.stringify(crossInsightData, null, 2), 'utf8');
        }
      } catch (error) {
        console.error('  크로스 인사이트 생성 실패 (건너뜀):', error.message);
      }
    }

    // 8-1. 실행 통계 저장 (HTML/MD 생성에서 사용)
    if (fs.existsSync(mergedDir) && globalRunner) {
      try {
        const usage = globalRunner.getUsageStats();
        const cost = globalRunner.calculateCost();
        const totalItems = results.reduce((sum, r) => sum + (r.itemCount || 0), 0);
        const totalMessages = results.reduce((sum, r) => sum + (r.messageCount || 0), 0);

        const runStats = {
          start_time: new Date(runStartTime).toISOString(),
          end_time: new Date().toISOString(),
          duration_ms: Date.now() - runStartTime,
          total_messages: totalMessages,
          total_items: totalItems,
          successful_labels: results.filter(r => r.success).length,
          failed_labels: results.filter(r => !r.success).length,
          usage,
          cost
        };
        fs.writeFileSync(path.join(mergedDir, '_run_stats.json'), JSON.stringify(runStats, null, 2), 'utf8');
        console.log(`\n[통계] 시간 ${Math.round(runStats.duration_ms / 1000 / 60)}분 / 토큰 입력 ${usage.totalPromptTokens.toLocaleString()} 출력 ${usage.totalCompletionTokens.toLocaleString()} / 비용 $${cost.total_usd.toFixed(4)}`);
      } catch (e) {
        console.warn(`  [통계] 저장 실패 (무시): ${e.message}`);
      }
    }

    // 9. 통합 HTML 생성
    console.log('\n--- 통합 HTML 생성 ---');
    // finalDir 생성 (라벨 처리 중 생성되지 않았을 수 있음)
    if (!fs.existsSync(finalDir)) {
      fs.mkdirSync(finalDir, { recursive: true });
    }
    // KST 기준 날짜로 파일명 생성 (timeRange.end = 사용자 요청 날짜)
    const kstDate = new Date(timeRange.end.getTime() + 9 * 60 * 60 * 1000);
    const dateStr = `${String(kstDate.getUTCFullYear()).slice(2)}${String(kstDate.getUTCMonth() + 1).padStart(2, '0')}${String(kstDate.getUTCDate()).padStart(2, '0')}`;
    const combinedHtmlPath = path.join(finalDir, `${dateStr}_Newsletter_report.html`);

    if (fs.existsSync(mergedDir)) {
      // HTML 통합 파일 생성
      const { generateCombinedFromMergedFiles } = require('./generate_html');
      const dateFormatted = formatKST(timeRange.end).split(' ')[0];
      generateCombinedFromMergedFiles(mergedDir, combinedHtmlPath, dateFormatted);

      // MD 통합 파일 생성
      const combinedMdPath = path.join(finalDir, `${dateStr}_Newsletter_report.md`);
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
            error: error.message,
            isAuthError: error.isAuthError || false
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
  const runner = await getRunner(path.join(runDir, 'logs'));

  // 1. Gmail API 호출 (Node.js) - 증분 처리 지원
  let fetchResult = null;
  if (!progressManager.isStepCompleted(label.name, 'gmail_fetch')) {
    console.log('  Gmail API 호출 중...');
    progressManager.setStepStatus(label.name, 'gmail_fetch', 'in_progress');
    fetchResult = await fetchGmailMessages(label, timeRange, rawDir);  // 인증 에러는 throw됨
    if (fetchResult !== null) {
      progressManager.setStepStatus(label.name, 'gmail_fetch', 'completed');
    } else {
      console.warn('  Gmail API 오류 발생 → 재실행 시 재시도됨');
    }
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

  // 뉴스레터 이름 맵 (sender_email → name)
  const newsletterNameMap = loadNewsletterNameMap();

  // 3. HTML → Text - 증분 처리 지원
  if (!progressManager.isStepCompleted(label.name, 'html_to_text')) {
    console.log('  HTML → Text 변환 중...');
    progressManager.setStepStatus(label.name, 'html_to_text', 'in_progress');
    await convertHtmlToText(rawDir, cleanDir, runner);
    progressManager.setStepStatus(label.name, 'html_to_text', 'completed');
  } else {
    console.log('  HTML → Text 변환 (이미 완료, 건너뜀)');
  }

  // 4. LLM 에이전트 실행 - 증분 처리 지원
  let successCount = 0;
  let failCount = 0;
  let newSkillCount = 0;
  const excludedMails = []; // 제외된 메일 추적

  // SKILL 건강도 추적 파일
  const skillHealthPath = path.join(__dirname, '..', 'config', 'skill_health.json');
  const skillHealth = loadSkillHealth(skillHealthPath);

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
      let isSingleTopic = false;

      let cleanData;
      try {
        cleanData = JSON.parse(fs.readFileSync(cleanPath, 'utf8'));
        senderEmail = extractSenderEmail(cleanData.from);

        // [개선 #8] 비뉴스 메일 사전 필터링
        const { isNonNewsEmail: isNonNewsFn } = require('./html_to_text');
        const nonNewsCheck = isNonNewsFn(cleanData.subject, senderEmail);
        if (nonNewsCheck.isNonNews) {
          console.log(`      → 비뉴스 메일 (사전 필터): ${nonNewsCheck.reason}`);
          excludedMails.push({
            subject: cleanData.subject || '(제목 없음)',
            from: senderEmail,
            reason: `비뉴스 메일 (사전 필터): ${nonNewsCheck.reason}`
          });
          successCount++;
          continue;
        }

        // SKILL 확인 + SKILL 건강도 기반 갱신 판단
        const skillGenerated = adaptiveLearning.isSkillGenerated(senderEmail);
        const skillPath = adaptiveLearning.getSkillPath(senderEmail);

        // [개선 #7] SKILL 자동 갱신: 실패율 높으면 재분석
        const shouldRenew = shouldRenewSkill(skillHealth, senderEmail);

        if (shouldRenew && skillGenerated) {
          console.log(`      → SKILL 갱신 필요 (실패율 초과): ${senderEmail}`);
          isNewSender = true; // 강제 재분석
        } else if (skillGenerated && skillPath && fs.existsSync(skillPath)) {
          const skillFile = path.basename(skillPath);
          skills = [skillFile, 'SKILL_작성규칙.md'];

          // [개선 #5] 단일 콘텐츠 감지: SKILL의 structure_type 확인
          try {
            const skillContent = fs.readFileSync(skillPath, 'utf8');
            if (/type:\s*single[_-]?(topic|feature|item)/i.test(skillContent) ||
                /단일\s*(주제|기사|콘텐츠|토픽)/i.test(skillContent)) {
              isSingleTopic = true;
            }
          } catch (e) { /* ignore */ }
        } else {
          isNewSender = true;
        }
      } catch (e) {
        console.warn(`      SKILL 매칭 오류 (기본값 사용): ${e.message}`);
        try { cleanData = JSON.parse(fs.readFileSync(cleanPath, 'utf8')); } catch { cleanData = null; }
      }

      try {
        let result;

        if (isNewSender) {
          // 새 발신자 또는 SKILL 갱신: 구조 분석 + 아이템 추출 동시 수행
          console.log(`      → ${isNewSender ? '새 발신자' : 'SKILL 갱신'}: ${senderEmail} (뉴스레터분석 에이전트 실행)`);

          result = await runner.runAgent(path.join(__dirname, '..', 'agents', '뉴스레터분석.md'), {
            skills: ['SKILL_작성규칙.md'],
            inputs: cleanPath,
            output: itemsPath,
            taskType: 'analyze'
          });

          // 분석 결과로 SKILL 저장
          if (result && result.analysis) {
            adaptiveLearning.saveAnalyzedSkill(senderEmail, result.analysis);
            newSkillCount++;
            // SKILL 갱신 완료 기록
            markSkillRenewed(skillHealth, senderEmail);
          }
        } else if (isSingleTopic) {
          // [개선 #5] 단일 콘텐츠 전용 파이프라인
          console.log(`      → 단일 콘텐츠: ${senderEmail} (singleTopic 모드)`);
          result = await runner.runAgent(path.join(__dirname, '..', 'agents', 'labels', `${label.name}.md`), {
            skills,
            inputs: cleanPath,
            output: itemsPath,
            taskType: 'singleTopic',
            skipChunking: true
          });
        } else {
          // 기존 발신자: 일반 추출
          console.log(`      → 기존 발신자: ${senderEmail} (${label.name} 에이전트 실행)`);
          result = await runner.runAgent(path.join(__dirname, '..', 'agents', 'labels', `${label.name}.md`), {
            skills,
            inputs: cleanPath,
            output: itemsPath,
            taskType: 'extract'
          });
        }

        // 공통: 메타데이터 추가 후 저장
        if (result && result.items && result.items.length > 0) {
          const newsletterName = newsletterNameMap[senderEmail] || '';
          const receivedAt = cleanData?.date || null;
          const enrichedItems = result.items.map(item => ({
            ...item,
            // LLM이 채운 source가 있으면 우선, 없으면 newsletters.json 조회값
            source: item.source || newsletterName,
            source_email: senderEmail,
            received_at: receivedAt,
            message_id: messageId
          }));

          // [개선 #3] 품질 검증 + 재추출
          const validatedItems = await validateAndReextractItems(
            enrichedItems, cleanData, runner, label, skills, senderEmail, messageId
          );

          fs.writeFileSync(itemsPath, JSON.stringify({ items: validatedItems }, null, 2), 'utf8');

          // SKILL 건강도: 성공 기록
          recordSkillResult(skillHealth, senderEmail, true);
        } else {
          // 아이템 0건 - 제외 사유 기록
          const textLen = (cleanData?.clean_text || '').length;
          let reason = '추출 가능한 뉴스 아이템 없음';
          if (textLen < 200) reason = `본문 텍스트 부족 (${textLen}자) - 이미지 전용 메일 가능성`;
          excludedMails.push({
            subject: cleanData?.subject || '(제목 없음)',
            from: senderEmail,
            reason
          });
          // SKILL 건강도: 실패 기록
          recordSkillResult(skillHealth, senderEmail, false);
        }

        successCount++;
      } catch (error) {
        failCount++;
        failedBatchManager.recordFailure(label.name, 'llm_extract', idx, error, { messageId, senderEmail });
        console.warn(`    [실패] ${messageId}: ${error.message}`);

        // 실패 메일도 제외 목록에 추가
        try {
          excludedMails.push({
            subject: cleanData?.subject || '(제목 없음)',
            from: senderEmail,
            reason: `LLM 처리 실패: ${error.message.substring(0, 150)}`
          });
        } catch (e) { /* skip */ }

        // SKILL 건강도: 실패 기록
        recordSkillResult(skillHealth, senderEmail, false);
      }
    }

    // SKILL 건강도 저장
    saveSkillHealth(skillHealthPath, skillHealth);

    // 실패가 있으면 completed로 표시하지 않음 → 재실행 시 실패 항목 재처리 가능
    if (failCount === 0) {
      progressManager.setStepStatus(label.name, 'llm_extract', 'completed');
    } else {
      console.log(`  [주의] ${failCount}개 실패 → 재실행 시 재처리됨`);
    }
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

  // 아이템 0건이면 merged 파일 생성하지 않고 건너뜀 (제외 메일은 별도 저장)
  if (allItems.length === 0) {
    console.log(`  [${label.name}] 추출된 아이템 없음 - merged 파일 생성 건너뜀 (HTML에서 제외됨)`);
    console.log(`  [디버그] 메일 ${msgFiles.length}개 수집, LLM 성공 ${successCount}개, 실패 ${failCount}개 → 아이템 0건`);

    // clean 파일의 텍스트 길이 로깅
    const cleanFiles = fs.readdirSync(cleanDir).filter(f => f.startsWith('clean_'));
    for (const cf of cleanFiles) {
      try {
        const cleanData = JSON.parse(fs.readFileSync(path.join(cleanDir, cf), 'utf8'));
        const textLen = (cleanData.clean_text || '').length;
        const from = cleanData.from || 'unknown';
        const imgOnly = textLen < 150 ? ' ⚠ 이미지 전용 메일 가능성' : '';
        console.log(`    - ${from}: clean_text ${textLen}자${imgOnly}`);
      } catch (e) { /* skip */ }
    }

    // 제외 메일 정보 저장 (HTML 제외 탭용)
    if (excludedMails.length > 0) {
      const excludedPath = path.join(mergedDir, `excluded_${label.name}.json`);
      fs.writeFileSync(excludedPath, JSON.stringify({ label: label.name, excluded: excludedMails }, null, 2), 'utf8');
    }

    return {
      label: label.name,
      success: true,
      messageCount: msgFiles.length,
      itemCount: 0,
      excludedMails,
      newNewsletters: newNewsletters.newsletters
    };
  }

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

    // 제외 메일 정보 포함
    if (excludedMails.length > 0) {
      merged.excluded = excludedMails;
    }

    fs.writeFileSync(mergedPath, JSON.stringify(merged, null, 2), 'utf8');
    // merged.items가 존재하고 비어있지 않을 때만 완료 처리
    if (merged.items && merged.items.length > 0) {
      progressManager.setStepStatus(label.name, 'merge', 'completed');
    } else {
      console.warn('  [주의] 병합 결과에 아이템 없음 → 재실행 시 재처리됨');
    }
  } else {
    console.log('  병합 (이미 완료, 건너뜀)');
    // 기존 병합 결과 로드
    merged = JSON.parse(fs.readFileSync(mergedPath, 'utf8'));
  }

  // 6. 인사이트 생성 (배치 처리) - 증분 처리 지원
  const insightAgentPath = path.join(__dirname, '..', 'agents', '인사이트.md');
  const profilePath = path.join(__dirname, '..', 'config', 'user_profile.json');

  if (!progressManager.isStepCompleted(label.name, 'insight')) {
    progressManager.setStepStatus(label.name, 'insight', 'in_progress');
    let insightFailed = false;

    if (fs.existsSync(insightAgentPath) && merged.items.length > 0) {
      console.log('  인사이트 생성 중 (LLM 배치 병렬 처리)...');
      try {
        // [개선 #11] 사용자 프로필 로드 (tier "mixed"/"paid" 시 로드)
        let profile = null;
        const tier = CONFIG.llm.tier || 'free';
        const hasPaidProvider = tier === 'paid' || tier === 'mixed' ||
          Object.values(CONFIG.llm.providers || {}).some(p => p.tier === 'paid');
        if (hasPaidProvider && fs.existsSync(profilePath)) {
          profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        } else if (!hasPaidProvider) {
          console.log('  [무료 티어] 사용자 프로필 미로드 (개인정보 보호)');
        }

        // 아이템 복잡도 기반 동적 배치 크기 계산
        const batchSize = calculateOptimalBatchSize(merged.items);
        const insightStartTime = Date.now();

        // 사전 배치 분할
        const batches = [];
        for (let i = 0; i < merged.items.length; i += batchSize) {
          batches.push({
            index: batches.length,
            items: merged.items.slice(i, i + batchSize),
            startIdx: i
          });
        }

        console.log(`  배치 병렬 처리 시작 (${batches.length}개 배치, 각 ${batchSize}개씩, 동시 ${CONFIG.concurrencyLimit}개)...`);

        // 병렬 배치 처리 (createLimiter로 동시 실행 제한)
        const insightLimit = createLimiter(CONFIG.concurrencyLimit);

        const batchResults = await Promise.all(
          batches.map(batch =>
            insightLimit(async () => {
              // 시간 예산 체크
              if (CONFIG.insightBudgetMs > 0 && Date.now() - insightStartTime >= CONFIG.insightBudgetMs) {
                console.warn(`    배치 ${batch.index + 1}: 시간 예산 초과, 원본 유지`);
                return { items: batch.items, success: false, fallback: true };
              }

              // fallback 크기 순서대로 시도 (배치 자체 크기를 첫 번째로)
              const fallbackSizes = [
                batch.items.length,
                ...CONFIG.insightBatchFallback.filter(s => s < batch.items.length)
              ];

              for (const trySize of fallbackSizes) {
                // trySize가 현재 배치보다 작으면, 배치 내 앞쪽만 시도 (나머지는 원본 유지)
                const tryItems = batch.items.slice(0, trySize);
                const remainItems = batch.items.slice(trySize);

                try {
                  // [개선 #6] original_excerpt 추가
                  const itemsWithExcerpt = tryItems.map(item => {
                    const excerpt = getOriginalExcerpt(item, cleanDir);
                    return excerpt ? { ...item, original_excerpt: excerpt } : item;
                  });

                  const batchResult = await runner.runAgent(insightAgentPath, {
                    inputs: {
                      profile: profile?.user || null,
                      label: label.name,
                      items: itemsWithExcerpt
                    },
                    schema: { required: ['items'] },
                    taskType: 'insight',
                    maxTimeMs: Math.min(10 * 60 * 1000, CONFIG.insightBudgetMs)  // 배치당 최대 10분
                  });

                  if (batchResult && batchResult.items && batchResult.items.length > 0) {
                    // 원본의 message_id, source_email 유지
                    const enrichedItems = batchResult.items.map((resultItem, idx) => {
                      const originalItem = tryItems.find(o => o.title === resultItem.title) || tryItems[idx];
                      return {
                        ...resultItem,
                        message_id: resultItem.message_id || originalItem?.message_id,
                        source: resultItem.source || originalItem?.source,
                        source_email: resultItem.source_email || originalItem?.source_email,
                        received_at: resultItem.received_at || originalItem?.received_at
                      };
                    });
                    console.log(`    배치 ${batch.index + 1}/${batches.length}: 성공 (${enrichedItems.length}개 인사이트, 크기 ${trySize})`);
                    return { items: [...enrichedItems, ...remainItems], success: true };
                  }

                  // 빈 응답 - 더 작은 크기로 재시도
                  console.warn(`    배치 ${batch.index + 1}: 빈 응답 (크기 ${trySize}), 축소 시도...`);
                } catch (err) {
                  console.warn(`    배치 ${batch.index + 1}: 오류 (크기 ${trySize}): ${err.message}`);
                }
              }

              // 모든 크기에서 실패 - 원본 유지
              console.warn(`    배치 ${batch.index + 1}: 모든 크기 실패, 원본 유지`);
              failedBatchManager.recordFailure(label.name, 'insight', batch.index, new Error('All sizes failed'));
              return { items: batch.items, success: false };
            })
          )
        );

        // 결과 수집 (배치 순서 유지)
        const itemsWithInsights = [];
        let insightSuccessCount = 0;

        for (const result of batchResults) {
          itemsWithInsights.push(...result.items);
          if (result.success) {
            insightSuccessCount += result.items.length;
          }
        }

        // 인사이트가 추가된 아이템으로 교체
        merged.items = itemsWithInsights;
        merged.has_insights = insightSuccessCount > 0;
        fs.writeFileSync(mergedPath, JSON.stringify(merged, null, 2), 'utf8');
        console.log(`  인사이트 완료: ${insightSuccessCount}/${merged.items.length}개 아이템에 추가`);

        // 품질 검증 (코드 기반, API 호출 없음)
        const qualityIssues = validateOutputQuality(merged.items, label.name);
        if (qualityIssues.length > 0) {
          merged.quality_issues = qualityIssues.length;
        }
      } catch (error) {
        console.warn(`  인사이트 생성 실패 (무시): ${error.message}`);
        merged.has_insights = false;
        insightFailed = true;
      }
    } else {
      console.log('  인사이트 Agent 없음 또는 아이템 없음, 건너뜀');
      merged.has_insights = false;
    }

    // 인사이트 전체 실패 시 completed 미표시 → 재실행 시 재처리
    if (!insightFailed) {
      progressManager.setStepStatus(label.name, 'insight', 'completed');
    } else {
      console.log(`  [주의] 인사이트 생성 실패 → 재실행 시 재처리됨`);
    }
  } else {
    console.log('  인사이트 생성 (이미 완료, 건너뜀)');
    // 기존 결과에 이미 인사이트가 있을 수 있음
  }

  // 7. MD 파일 생성 (라벨별 개별 파일 - 옵시디언용)
  console.log('  MD 파일 생성 중...');
  const finalDir = path.join(runDir, 'final');
  if (!fs.existsSync(finalDir)) {
    fs.mkdirSync(finalDir, { recursive: true });
  }

  // KST 기준 날짜로 파일명 생성 (timeRange.end = 사용자 요청 날짜)
  const kstDateMd = new Date(timeRange.end.getTime() + 9 * 60 * 60 * 1000);
  const dateStr = `${String(kstDateMd.getUTCFullYear()).slice(2)}${String(kstDateMd.getUTCMonth() + 1).padStart(2, '0')}${String(kstDateMd.getUTCDate()).padStart(2, '0')}`;
  const finalMd = path.join(finalDir, `${dateStr}_Newsletter_report_${label.name}.md`);

  // MD 파일 생성 (timeRange.end = 사용자 요청 날짜)
  try {
    const mdContent = generateMarkdown(merged, timeRange.end);
    fs.writeFileSync(finalMd, mdContent, 'utf8');
  } catch (mdError) {
    console.error(`  MD 파일 생성 실패: ${mdError.message}`);
  }

  // HTML은 통합 파일로 main()에서 생성됨

  console.log(`[완료] ${label.name} (${allItems.length}개 아이템)`);

  // 8. 처리된 메시지 읽음 표시
  console.log('  처리된 메일 읽음 표시 중...');
  try {
    const { GmailFetcher } = require('./fetch_gmail');
    const fetcher = new GmailFetcher();
    await fetcher.authenticate();

    // 성공적으로 처리된 메시지만 읽음 표시 (items_ 파일이 존재하는 것만)
    const processedIds = msgFiles
      .map(f => f.replace('msg_', '').replace('.json', ''))
      .filter(id => fs.existsSync(path.join(itemsDir, `items_${id}.json`)));
    const markResult = await fetcher.markMessagesAsRead(processedIds);
    console.log(`  읽음 표시: ${markResult.success}개 완료`);
  } catch (error) {
    console.warn(`  읽음 표시 실패 (무시): ${error.message}`);
  }

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

  // 실제 시간 범위를 ISO 문자열로 전달 (정밀 필터링용)
  const rangeStart = timeRange.start.toISOString();
  const rangeEnd = timeRange.end.toISOString();

  try {
    const fetcher = new GmailFetcher();
    await fetcher.authenticate();

    const result = await fetcher.fetchMessages({
      label: label.gmail_label || label.name,
      subLabels: (label.sub_labels || []).join(','),
      dateStart,
      dateEnd,
      rangeStart,
      rangeEnd,
      outputDir
    });

    return result;
  } catch (error) {
    const msg = error.message || '';
    const isAuthError = msg.includes('invalid_grant') || msg.includes('invalid_client') ||
      msg.includes('unauthorized') || msg.includes('access_denied') ||
      msg.includes('Token has been expired') || msg.includes('401');

    if (isAuthError) {
      console.error(`  [인증 오류] Gmail 인증 실패: ${msg}`);
      const authError = new Error(`Gmail 인증 실패: ${msg}`);
      authError.isAuthError = true;
      throw authError;
    }

    console.warn(`  Gmail API 오류 (메일 없을 수 있음): ${msg}`);
    return null;
  }
}

/**
 * HTML → Text 변환 (병렬 처리)
 */
async function convertHtmlToText(rawDir, cleanDir, runner) {
  const { htmlToStructuredMarkdown, cleanNewsletterMarkdown, extractImageUrls, isNonNewsEmail, enrichLinkAggregator } = require('./html_to_text');

  if (!fs.existsSync(rawDir)) {
    console.warn(`  raw 디렉토리 없음: ${rawDir}`);
    return;
  }
  const msgFiles = fs.readdirSync(rawDir).filter(f => f.startsWith('msg_'));

  // 병렬 처리 (최대 10개 동시 처리)
  const PARALLEL_LIMIT = 10;
  for (let i = 0; i < msgFiles.length; i += PARALLEL_LIMIT) {
    const batch = msgFiles.slice(i, i + PARALLEL_LIMIT);

    await Promise.all(batch.map(async (file) => {
      try {
        const msgData = JSON.parse(fs.readFileSync(path.join(rawDir, file), 'utf8'));
        const messageId = file.replace('msg_', '').replace('.json', '');

        let cleanText = '';
        let visionUsed = false;
        if (msgData.html_body) {
          cleanText = htmlToStructuredMarkdown(msgData.html_body);
          cleanText = cleanNewsletterMarkdown(cleanText);

          // 링크 어그리게이터 감지: 원본 HTML에서 콘텐츠 링크가 많고 본문이 짧으면 외부 og:description fetch
          try {
            const { enriched, linksFetched } = await enrichLinkAggregator(msgData.html_body, cleanText);
            if (linksFetched > 0) {
              cleanText = enriched;
              console.log(`    [LinkEnrich] ${msgData.subject || messageId}: ${linksFetched}개 링크 콘텐츠 보강 (${cleanText.length}자)`);
            }
          } catch (e) {
            // 링크 보강 실패 시 원본 텍스트 유지
          }

          // 이미지 기반 메일 감지: clean_text < 500자이면 vision 모델로 텍스트 추출 시도
          const visionModelId = CONFIG.llm.models?.vision?.model || CONFIG.llm.models?.vision;
          if (cleanText.length < 500 && runner && visionModelId) {
            const imageUrls = extractImageUrls(msgData.html_body);
            if (imageUrls.length > 0) {
              console.log(`    [Vision] ${msgData.subject || messageId}: clean_text ${cleanText.length}자, 이미지 ${imageUrls.length}개 → vision 모델 호출`);
              try {
                const visionText = await runner.callVisionModel(imageUrls, visionModelId);
                if (visionText && visionText.length > cleanText.length) {
                  cleanText = visionText;
                  visionUsed = true;
                  console.log(`    [Vision] 텍스트 추출 성공: ${visionText.length}자`);
                }
              } catch (e) {
                console.warn(`    [Vision] 실패 (원본 텍스트 사용): ${e.message}`);
              }
            }
          }
        }

        const cleanData = {
          message_id: messageId,
          from: msgData.from,
          subject: msgData.subject,
          date: msgData.date,
          labels: msgData.labels,
          clean_text: cleanText,
          vision_used: visionUsed
        };

        fs.writeFileSync(
          path.join(cleanDir, 'clean_' + messageId + '.json'),
          JSON.stringify(cleanData, null, 2),
          'utf8'
        );
      } catch (fileError) {
        console.error(`    HTML→Text 변환 실패 (${file}): ${fileError.message}`);
      }
    }));
  }
}

/**
 * 마크다운 생성
 */
function generateMarkdown(merged, date) {
  const dateStr = formatKST(date).split(' ')[0];

  const insightCount = merged.items.filter(i => i.insights?.domain?.content || i.insights?.cross_domain?.content).length;

  let md = `# YKS Newsletter Report · ${merged.label} (${dateStr})\n\n`;
  md += `> 📰 ${merged.items.length}개 아이템`;
  if (insightCount > 0) md += ` · 💡 ${insightCount}개 인사이트`;
  if (merged.stats?.duplicates_removed) md += ` · 🔗 ${merged.stats.duplicates_removed}개 중복 제거`;
  md += `\n\n---\n\n`;

  merged.items.forEach((item, i) => {
    md += `## ${i + 1}. ${item.title || '(제목 없음)'}\n\n`;

    // 출처 정보 + 수신 시각 (HTML과 동일)
    const sourceDisplay = item.source || item.source_email;
    const timeStr = formatReceivedAt(item.received_at);
    if (sourceDisplay || timeStr) {
      const parts = [];
      if (sourceDisplay) parts.push(`**${sourceDisplay}**`);
      if (timeStr) parts.push(timeStr);
      md += `> 📰 ${parts.join(' · ')}\n\n`;
    }

    md += `${item.summary || ''}\n\n`;

    if (item.keywords && item.keywords.length > 0) {
      md += `**키워드**: ${item.keywords.map(k => `#${k}`).join(' ')}\n\n`;
    }

    // 링크 추가
    if (item.link) {
      md += `**링크**: [원문 보기](${item.link})\n\n`;
    }

    // 인사이트 추가
    if (item.insights) {
      if (item.insights.domain?.content) {
        md += `### 💡 실용적 인사이트\n\n`;
        md += `${item.insights.domain.content}\n\n`;
      }

      if (item.insights.cross_domain?.content) {
        md += `### 🌐 확장 인사이트\n\n`;
        md += `${item.insights.cross_domain.content}\n\n`;
      }
    }

    md += `---\n\n`;
  });

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

  const allLabelsData = [];
  for (const file of mergedFiles) {
    try {
      allLabelsData.push(JSON.parse(fs.readFileSync(path.join(mergedDir, file), 'utf8')));
    } catch (e) {
      console.warn(`  ${file} 파싱 실패, 건너뜀: ${e.message}`);
    }
  }

  // 전체 아이템 수 계산
  const totalItems = allLabelsData.reduce((sum, data) => sum + (data.items?.length || 0), 0);
  const totalInsights = allLabelsData.reduce((sum, data) =>
    sum + (data.items?.filter(i => i.insights?.domain?.content || i.insights?.cross_domain?.content).length || 0), 0);

  // 실행 통계 로드
  let runStats = null;
  const runStatsPath = path.join(mergedDir, '_run_stats.json');
  if (fs.existsSync(runStatsPath)) {
    try { runStats = JSON.parse(fs.readFileSync(runStatsPath, 'utf8')); } catch { /* skip */ }
  }

  let md = `# YKS Newsletter Report (${dateStr})\n\n`;
  md += `> 📰 ${totalItems}개 아이템 · 💡 ${totalInsights}개 인사이트\n\n`;

  // 실행 통계 섹션 (HTML의 Bento 통계와 동일)
  if (runStats) {
    const durMs = runStats.duration_ms || 0;
    const durMin = Math.floor(durMs / 60000);
    const durSec = Math.floor((durMs % 60000) / 1000);
    const durStr = durMin >= 60
      ? `${Math.floor(durMin / 60)}시간 ${durMin % 60}분`
      : `${durMin}분 ${durSec}초`;
    const totalTokens = (runStats.usage?.totalPromptTokens || 0) + (runStats.usage?.totalCompletionTokens || 0);
    const tokensStr = totalTokens >= 1000000
      ? `${(totalTokens / 1000000).toFixed(2)}M`
      : totalTokens >= 1000
      ? `${(totalTokens / 1000).toFixed(0)}K`
      : String(totalTokens);
    const costUsd = runStats.cost?.total_usd || 0;

    md += `## 📊 실행 통계\n\n`;
    md += `| 항목 | 값 |\n|---|---|\n`;
    md += `| ⏱ 소요시간 | ${durStr} |\n`;
    md += `| 🔤 총 토큰 | ${tokensStr} (입력 ${(runStats.usage?.totalPromptTokens || 0).toLocaleString()} + 출력 ${(runStats.usage?.totalCompletionTokens || 0).toLocaleString()}) |\n`;
    md += `| 📡 API 호출 | ${runStats.usage?.totalCalls || 0}회 |\n`;
    md += `| 💰 비용 | $${costUsd.toFixed(4)} |\n\n`;
  }

  md += `## 📋 라벨별 요약\n\n`;
  allLabelsData.forEach(data => {
    const items = data.items || [];
    const ins = items.filter(i => i.insights?.domain?.content || i.insights?.cross_domain?.content).length;
    md += `- **${data.label}**: ${items.length}개${ins > 0 ? ` (💡 ${ins}개)` : ''}\n`;
  });

  md += `\n---\n\n`;

  // 크로스 인사이트 섹션 (있으면 추가)
  const crossInsightPath = path.join(mergedDir, '_cross_insight.json');
  if (fs.existsSync(crossInsightPath)) {
    try {
      const crossInsight = JSON.parse(fs.readFileSync(crossInsightPath, 'utf8'));

      if (crossInsight.mega_trends?.length > 0 || crossInsight.cross_connections?.length > 0) {
        md += `# 종합 인사이트\n\n`;

        if (crossInsight.mega_trends?.length > 0) {
          md += `## 메가트렌드\n\n`;
          crossInsight.mega_trends.forEach((trend, i) => {
            md += `### ${i + 1}. ${trend.title}\n\n`;
            md += `${trend.description}\n\n`;
            if (trend.related_items?.length > 0) {
              md += `**관련 뉴스**: ${trend.related_items.map(item => `[${item.label}] ${item.title}`).join(' / ')}\n\n`;
            }
          });
        }

        if (crossInsight.cross_connections?.length > 0) {
          md += `## 크로스 연결\n\n`;
          crossInsight.cross_connections.forEach((conn, i) => {
            md += `### ${i + 1}. ${conn.title}\n\n`;
            md += `${conn.description}\n\n`;
            if (conn.connected_items?.length > 0) {
              md += `**연결 뉴스**: ${conn.connected_items.map(item => `[${item.label}] ${item.title}`).join(' / ')}\n\n`;
            }
          });
        }

        if (crossInsight.action_items?.length > 0) {
          md += `## 사용자 액션\n\n`;
          crossInsight.action_items.forEach((action, i) => {
            const labels = action.related_labels?.join(', ') || '';
            md += `${i + 1}. **[${action.timeline || ''}]** ${action.action}${labels ? ` (${labels})` : ''}\n`;
          });
          md += `\n`;
        }

        md += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n\n`;
      }
    } catch (e) {
      console.warn('  크로스 인사이트 MD 렌더링 실패:', e.message);
    }
  }

  // 각 라벨별 내용
  allLabelsData.forEach((data, labelIndex) => {
    const items = data.items || [];
    const labelInsights = items.filter(i => i.insights?.domain?.content || i.insights?.cross_domain?.content).length;

    md += `# ${data.label}\n\n`;
    md += `> 📰 ${items.length}개 아이템${labelInsights > 0 ? ` · 💡 ${labelInsights}개 인사이트` : ''}\n\n`;

    items.forEach((item, i) => {
      md += `## ${i + 1}. ${item.title}\n\n`;

      // 출처 정보 (HTML과 동일)
      const sourceDisplay = item.source || item.source_email;
      if (sourceDisplay) {
        md += `> 📰 **${sourceDisplay}**\n\n`;
      }

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
        if (item.insights.domain?.content) {
          md += `### 💡 실용적 인사이트\n\n`;
          md += `${item.insights.domain.content}\n\n`;
        }

        if (item.insights.cross_domain?.content) {
          md += `### 🌐 확장 인사이트\n\n`;
          md += `${item.insights.cross_domain.content}\n\n`;
        }
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
      // 자동 실행: 전날 10:00 ~ 당일 10:00 (KST), 경계값은 start 포함 end 미포함
      const todayKST = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const todayStr = todayKST.toISOString().split('T')[0];
      const yesterdayKST = new Date(todayKST.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStr = yesterdayKST.toISOString().split('T')[0];

      return {
        start: new Date(yesterdayStr + 'T10:00:00+09:00'),
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
      // 특정 날짜 (schedule과 동일한 로직: 전날 10:00 ~ 당일 10:00)
      // 예: 2월 4일 입력 → 2월 3일 10:00 ~ 2월 4일 10:00
      if (!customDate || !/^\d{4}-\d{2}-\d{2}$/.test(customDate)) {
        throw new Error(`잘못된 날짜 형식: '${customDate}' (YYYY-MM-DD 형식 필요, 예: --date 2026-02-10)`);
      }
      const [year, month, day] = customDate.split('-').map(Number);
      const prevDay = new Date(year, month - 1, day - 1);  // JS Date는 자동으로 월 경계 처리
      const prevDateStr = `${prevDay.getFullYear()}-${String(prevDay.getMonth() + 1).padStart(2, '0')}-${String(prevDay.getDate()).padStart(2, '0')}`;
      return {
        start: new Date(prevDateStr + 'T10:00:00+09:00'),
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
        start: new Date(defaultYesterdayStr + 'T10:00:00+09:00'),
        end: new Date(defaultTodayStr + 'T10:00:00+09:00')
      };
  }
}

/**
 * 라벨 목록 가져오기
 */
function getLabels(labelFilter) {
  const labelsPath = path.join(__dirname, '..', 'config', 'labels.json');
  let labelsJson;
  try {
    labelsJson = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
  } catch (e) {
    throw new Error(`labels.json 로드 실패: ${e.message}`);
  }
  if (!labelsJson.labels || !Array.isArray(labelsJson.labels)) {
    throw new Error('labels.json에 labels 배열이 없습니다');
  }
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

module.exports = { processAllLabels };
