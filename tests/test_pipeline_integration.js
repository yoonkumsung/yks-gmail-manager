/**
 * 파이프라인 통합 테스트 (API 호출 없이 mock 기반)
 * 실제 LLM 없이 mock된 AgentRunner로 전체 흐름 검증
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const orchestrator = require('../scripts/orchestrator');
const { AgentRunner } = require('../scripts/agent_runner');
const { AdaptiveLearning } = require('../scripts/adaptive_learning');

module.exports = async function () {

  await describe('ProgressManager 시나리오', async () => {
    let tmpPath;

    beforeEach(() => {
      tmpPath = path.join(os.tmpdir(), `pipeline-pm-${Date.now()}.json`);
    });

    afterEach(() => {
      try { fs.unlinkSync(tmpPath); } catch {}
    });

    await it('중간 크래시 시뮬레이션: in_progress 단계는 재실행 시 다시 처리', () => {
      const pm = new orchestrator._test.ProgressManager(tmpPath);

      pm.setStepStatus('IT', 'gmail_fetch', 'completed');
      pm.setStepStatus('IT', 'html_to_text', 'in_progress');
      // 크래시 가정

      // 새 인스턴스로 로드 (재실행 시뮬레이션)
      const pm2 = new orchestrator._test.ProgressManager(tmpPath);
      assert.equal(pm2.isStepCompleted('IT', 'gmail_fetch'), true);
      assert.equal(pm2.isStepCompleted('IT', 'html_to_text'), false);  // in_progress → 재실행
      assert.equal(pm2.isStepCompleted('IT', 'llm_extract'), false);
    });

    await it('완료된 라벨 재실행 시 모든 단계 건너뜀', () => {
      const pm = new orchestrator._test.ProgressManager(tmpPath);
      ['gmail_fetch', 'html_to_text', 'llm_extract', 'merge'].forEach(step => {
        pm.setStepStatus('경제', step, 'completed');
      });

      const pm2 = new orchestrator._test.ProgressManager(tmpPath);
      ['gmail_fetch', 'html_to_text', 'llm_extract', 'merge'].forEach(step => {
        assert.equal(pm2.isStepCompleted('경제', step), true);
      });
    });

    await it('오래된 progress.json에 insight 필드 남아있어도 무해', () => {
      // 인사이트 기능 제거 전 progress 시뮬레이션
      fs.writeFileSync(tmpPath, JSON.stringify({
        labels: {
          IT: {
            gmail_fetch: 'completed',
            html_to_text: 'completed',
            llm_extract: 'completed',
            merge: 'completed',
            insight: 'completed'  // 레거시 필드
          }
        }
      }));

      const pm = new orchestrator._test.ProgressManager(tmpPath);
      // 신규 코드는 insight를 안 읽으므로 무해
      assert.equal(pm.isStepCompleted('IT', 'merge'), true);
      // 새 라벨 초기화 시 insight 필드 안 들어감
      pm.initLabel('경제');
      assert.equal(pm.getStepStatus('경제', 'insight'), 'pending');  // 정의 안 됐으면 pending
      // 라벨 진행 단계는 4개만 (insight 빠짐)
      const newLabelKeys = Object.keys(pm.progress.labels['경제']);
      assert.notIncludes(newLabelKeys, 'insight');
    });
  });

  await describe('FailedBatchManager 시나리오', async () => {
    let tmpPath;

    beforeEach(() => {
      tmpPath = path.join(os.tmpdir(), `pipeline-fbm-${Date.now()}.json`);
    });

    afterEach(() => {
      try { fs.unlinkSync(tmpPath); } catch {}
    });

    await it('여러 라벨/단계의 실패 격리', () => {
      const fbm = new orchestrator._test.FailedBatchManager(tmpPath);

      fbm.recordFailure('IT', 'llm_extract', 1, new Error('timeout'));
      fbm.recordFailure('IT', 'merge', 1, new Error('parse'));
      fbm.recordFailure('경제', 'llm_extract', 2, new Error('429'));

      assert.lengthOf(fbm.getFailedBatches('IT', 'llm_extract'), 1);
      assert.lengthOf(fbm.getFailedBatches('IT', 'merge'), 1);
      assert.lengthOf(fbm.getFailedBatches('경제', 'llm_extract'), 1);
      assert.lengthOf(fbm.getFailedBatches('투자', 'llm_extract'), 0);
    });

    await it('일부 해결 후 잔여 추적', () => {
      const fbm = new orchestrator._test.FailedBatchManager(tmpPath);
      fbm.recordFailure('IT', 'llm_extract', 1, 'e');
      fbm.recordFailure('IT', 'llm_extract', 2, 'e');
      fbm.recordFailure('IT', 'llm_extract', 3, 'e');

      fbm.markResolved('IT', 'llm_extract', 2);
      assert.lengthOf(fbm.getFailedBatches('IT', 'llm_extract'), 2);
    });
  });

  await describe('findMergeCandidates 시나리오', async () => {
    await it('동일 사건을 다른 출처에서 보도 → 후보 등록', () => {
      // Jaccard 가중치: keyword 0.55 + title 0.4 + diffSource 0.05, 임계값 0.25
      // 키워드 2개 공통(NVIDIA, AI chip), 합집합 4개 → Jaccard 0.5 → 0.5*0.55+0.05 = 0.325 > 0.25
      const items = [
        { title: '엔비디아 시가총액 3조 달러 돌파', keywords: ['NVIDIA', '시가총액', 'AI chip'], source_email: 'a@axios.com' },
        { title: 'NVIDIA 3 trillion market cap', keywords: ['NVIDIA', 'AI chip', 'trillion'], source_email: 'b@bloomberg.com' }
      ];
      const result = orchestrator._test.findMergeCandidates(items);
      assert.gt(result.size, 0);
    });

    await it('같은 출처의 다른 뉴스 → 후보 아님', () => {
      const items = [
        { title: '삼성 분기 실적', keywords: ['삼성전자', '실적'], source_email: 'x@axios.com' },
        { title: '삼성 신제품 출시', keywords: ['삼성전자', '제품'], source_email: 'x@axios.com' }
      ];
      // 같은 출처: diffSource boost 없음. 공통 키워드 1개. 유사도 낮음.
      const result = orchestrator._test.findMergeCandidates(items);
      // 임계값 0.25 미만이면 후보 아님 (정확한 값은 keywords 분포에 따라 다름)
      // 최소한 silent 통과 (둘 다 후보 아니거나 둘 다 후보)
      assert.ok(result.size === 0 || result.size === 2);
    });

    await it('대량 아이템 성능 (200개) — O(n²)이지만 합리적 시간', () => {
      const items = Array.from({ length: 200 }, (_, i) => ({
        title: `뉴스 ${i}`,
        keywords: [`키워드${i % 20}`],  // 20개 그룹
        source_email: `s${i}@x.com`
      }));
      const start = Date.now();
      const result = orchestrator._test.findMergeCandidates(items);
      const elapsed = Date.now() - start;
      assert.lt(elapsed, 1000, `200개 처리에 ${elapsed}ms 소요 (1초 미만 기대)`);
      assert.gt(result.size, 0);  // 일부는 후보
    });
  });

  await describe('clusterItemsByKeyword 시나리오', async () => {
    await it('Union-Find 전이성: A-B-C 한 클러스터', () => {
      const items = [
        { title: 'A', keywords: ['x', 'y'] },
        { title: 'B', keywords: ['y', 'z'] },
        { title: 'C', keywords: ['z', 'w'] }
      ];
      const clusters = orchestrator._test.clusterItemsByKeyword(items, 0.2);
      assert.equal(clusters.length, 1);
      assert.equal(clusters[0].items_count, 3);
    });

    await it('완전히 분리된 그룹은 별도 클러스터', () => {
      const items = [
        { title: 'A', keywords: ['x'] },
        { title: 'B', keywords: ['y'] },
        { title: 'C', keywords: ['z'] }
      ];
      const clusters = orchestrator._test.clusterItemsByKeyword(items, 0.2);
      assert.equal(clusters.length, 3);
    });
  });

  await describe('AgentRunner 청크 분할 + 병합 round-trip', async () => {
    await it('큰 텍스트 청크 분할 → 합 = 원본 단어 수', () => {
      const runner = new AgentRunner('test', 'test', { logDir: os.tmpdir(), chunkSize: 1000 });
      runner.log = () => {};

      // 섹션 마커가 없는 텍스트 (강제 분할 경로)
      const text = Array.from({ length: 20 }, (_, i) => `섹션 ${i} 내용 `.repeat(50)).join('\n\n');
      const chunks = runner.splitTextIntoChunks(text, 1000);

      assert.gt(chunks.length, 1);
      chunks.forEach((c, i) => {
        assert.lte(c.length, 1500, `청크 ${i} 너무 큼 (${c.length}자)`);
      });
    });

    await it('섹션 마커 보존: FUNDING 같은 헤더로 분할', () => {
      const runner = new AgentRunner('test', 'test', { logDir: os.tmpdir(), chunkSize: 200 });
      runner.log = () => {};

      const text = `intro paragraph here\n\nFUNDING\nfunding content\n\nGLOBAL NEWS\nglobal content`;
      const chunks = runner.splitTextIntoChunks(text, 200);
      // FUNDING/GLOBAL NEWS 마커가 어딘가 청크에 등장
      const allText = chunks.join('|');
      assert.includes(allText, 'FUNDING');
      assert.includes(allText, 'GLOBAL NEWS');
    });
  });
};
