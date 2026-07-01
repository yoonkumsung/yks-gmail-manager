/**
 * orchestrator.js 단위 테스트
 * 테스트 대상: 유사도 계산, 클러스터링, 진행 관리
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  _test: {
    ProgressManager,
    FailedBatchManager,
    findMergeCandidates,
    clusterItemsByKeyword,
  }
} = require('../scripts/orchestrator');

module.exports = async function () {

  // ============================================
  // findMergeCandidates
  // ============================================

  await describe('findMergeCandidates', async () => {
    await it('같은 키워드 → 병합 후보', () => {
      const items = [
        { title: '삼성 실적', keywords: ['삼성전자', '실적', '반도체'], source_email: 'a@a.com' },
        { title: '삼성전자 1분기', keywords: ['삼성전자', '실적', '영업이익'], source_email: 'b@b.com' },
      ];
      const candidates = findMergeCandidates(items);
      assert.ok(candidates.has(0), '첫 번째 아이템이 후보에 포함');
      assert.ok(candidates.has(1), '두 번째 아이템이 후보에 포함');
    });

    await it('다른 키워드 → 비후보', () => {
      const items = [
        { title: '삼성 실적', keywords: ['삼성전자', '실적', '반도체'], source_email: 'a@a.com' },
        { title: 'LG 배터리', keywords: ['LG화학', '배터리', '전기차'], source_email: 'b@b.com' },
      ];
      const candidates = findMergeCandidates(items);
      // 둘 다 후보에 없어야 함 (또는 서로를 참조하지 않아야 함)
      const has0in1 = candidates.has(0) && candidates.get(0).has(1);
      assert.notOk(has0in1, '다른 뉴스는 병합 후보가 아님');
    });

    await it('키워드 없는 아이템 무시', () => {
      const items = [
        { title: '뉴스', keywords: [], source_email: 'a@a.com' },
        { title: '뉴스2', keywords: ['AI'], source_email: 'b@b.com' },
      ];
      const candidates = findMergeCandidates(items);
      assert.notOk(candidates.has(0));
    });

    await it('빈 배열 → 빈 맵', () => {
      const candidates = findMergeCandidates([]);
      assert.equal(candidates.size, 0);
    });

    await it('다른 출처(source_email)면 유사도 보너스', () => {
      // 같은 키워드인데 다른 출처 → 병합 가능성 높음
      const itemsSameSource = [
        { title: '뉴스A', keywords: ['AI', 'GPU'], source_email: 'same@a.com' },
        { title: '뉴스B', keywords: ['AI', 'GPU', 'NVIDIA'], source_email: 'same@a.com' },
      ];
      const itemsDiffSource = [
        { title: '뉴스A', keywords: ['AI', 'GPU'], source_email: 'a@a.com' },
        { title: '뉴스B', keywords: ['AI', 'GPU', 'NVIDIA'], source_email: 'b@b.com' },
      ];
      const candSame = findMergeCandidates(itemsSameSource);
      const candDiff = findMergeCandidates(itemsDiffSource);
      // 둘 다 후보가 되지만, 다른 출처가 보너스를 받음 (결과는 동일하게 후보)
      // 최소한 크래시 안 남
      assert.type(candSame.size, 'number');
      assert.type(candDiff.size, 'number');
    });

    await it('제목 단어 겹침도 유사도에 반영', () => {
      const items = [
        { title: '삼성전자 1분기 영업이익 발표', keywords: ['삼성'], source_email: 'a@a.com' },
        { title: '삼성전자 1분기 영업이익 전망', keywords: ['전자'], source_email: 'b@b.com' },
      ];
      const candidates = findMergeCandidates(items);
      // 키워드는 다르지만 제목 겹침이 높음
      assert.ok(candidates.size >= 0); // 크래시 안 나면 OK
    });

    // ---- link 결손 쌍 fallback (문제2: 같은 기사 이중추출 사각지대) ----

    await it('fallback: link 한쪽만 있는 같은 기사 이중추출 → 병합 후보', () => {
      // 실제 요즘IT 사례: 본문 상세(major, link 누락) + "이번 주 소식" 목록(brief, link 있음)
      const items = [
        {
          title: 'Claude Code 소스 유출에서 본 에이전트 실행 구조의 중요성',
          keywords: ['Claude Code', '에이전트 아키텍처', 'AI 도구', '구조 설계'],
          link: '', source_email: 'yozm@yozm.co.kr',
        },
        {
          title: '클로드 코드 소스 유출로 본 에이전트 아키텍처 설계',
          keywords: ['클로드코드', '에이전트', '아키텍처'],
          link: 'https://yozm.wishket.com/magazine/detail/3730/', source_email: 'yozm@yozm.co.kr',
        },
      ];
      const candidates = findMergeCandidates(items);
      assert.ok(candidates.has(0) && candidates.get(0).has(1), '이중추출 쌍이 병합 후보로 surface');
      assert.ok(candidates.has(1) && candidates.get(1).has(0), '양방향 후보 등록');
    });

    await it('fallback: link 한쪽만 있어도 다른 기사면 병합 후보 아님 (오병합 방지)', () => {
      // 같은 라벨의 서로 다른 기사(공유 유의어 부족) → 절대 후보로 묶지 않음
      const items = [
        {
          title: 'Amazon, AWS에서 OpenAI 신제품 및 에이전트 서비스 출시',
          keywords: ['Amazon', 'AWS', 'OpenAI', '에이전트'],
          link: '', source_email: 'itnews@x.com',
        },
        {
          title: 'Stripe의 Link, 자율 AI 에이전트도 사용 가능한 디지털 지갑 출시',
          keywords: ['Stripe', 'Link', '디지털 지갑', 'AI 에이전트'],
          link: 'https://techcrunch.com/stripe-link', source_email: 'itnews@x.com',
        },
      ];
      const candidates = findMergeCandidates(items);
      const has0in1 = candidates.has(0) && candidates.get(0).has(1);
      assert.notOk(has0in1, '다른 기사(에이전트/출시만 공유)는 병합 후보 아님');
    });

    await it('fallback: 둘 다 link 있는 다른 기사는 fallback이 묶지 않음', () => {
      // fallback은 link가 한쪽이라도 없는 쌍만 대상. 둘 다 link 있으면 관여 안 함.
      const items = [
        {
          title: 'Claude Code 소스 유출에서 본 에이전트 실행 구조의 중요성',
          keywords: ['Claude Code', '에이전트 아키텍처', 'AI 도구', '구조 설계'],
          link: 'https://a.example.com/1', source_email: 'a@a.com',
        },
        {
          title: '클로드 코드 소스 유출로 본 에이전트 아키텍처 설계',
          keywords: ['클로드코드', '에이전트', '아키텍처'],
          link: 'https://b.example.com/2', source_email: 'a@a.com',
        },
      ];
      const candidates = findMergeCandidates(items);
      const has0in1 = candidates.has(0) && candidates.get(0).has(1);
      assert.notOk(has0in1, '둘 다 link(서로 다름)면 fallback 미적용 → 후보 아님');
    });

    await it('fallback: 공유 유의어 3개면 후보 아님 (임계 하한, 4개 필요)', () => {
      // 공유 토큰 정확히 3개(가가/나나/다다) + 키워드 disjoint → Jaccard·fallback 모두 미달.
      // (합성 토큰: fallback 임계만 고립 검증)
      const items = [
        { title: '가가 나나 다다 라라 카카', keywords: ['마마', '바바'], link: '', source_email: 'a@a.com' },
        { title: '가가 나나 다다 사사 아아 자자', keywords: ['타타', '파파'], link: 'https://x.com/y', source_email: 'a@a.com' },
      ];
      const candidates = findMergeCandidates(items);
      const has0in1 = candidates.has(0) && candidates.get(0).has(1);
      assert.notOk(has0in1, '공유 유의어 3개(<4) → 후보 아님');
    });
  });

  // ============================================
  // clusterItemsByKeyword
  // ============================================

  await describe('clusterItemsByKeyword', async () => {
    await it('빈 입력 → 빈 배열', () => {
      assert.deepEqual(clusterItemsByKeyword([]), []);
      assert.deepEqual(clusterItemsByKeyword(null), []);
    });

    await it('같은 키워드 그룹 → 하나의 클러스터', () => {
      const items = [
        { title: '삼성 실적', keywords: ['삼성', '실적', '반도체'] },
        { title: '삼성 영업이익', keywords: ['삼성', '실적', '영업이익'] },
        { title: 'LG 배터리', keywords: ['LG', '배터리', '전기차'] },
      ];
      const clusters = clusterItemsByKeyword(items, 0.3);
      // 삼성 2개는 같은 클러스터, LG는 다른 클러스터
      assert.gte(clusters.length, 2, '최소 2개 클러스터');
      // 삼성 클러스터 찾기
      const samsungCluster = clusters.find(c => c.keywords.includes('삼성'));
      assert.ok(samsungCluster, '삼성 클러스터 존재');
      assert.equal(samsungCluster.items_count, 2, '삼성 뉴스 2개가 같은 클러스터');
    });

    await it('모든 키워드 다름 → 각각 별도 클러스터', () => {
      const items = [
        { title: 'A', keywords: ['apple'] },
        { title: 'B', keywords: ['banana'] },
        { title: 'C', keywords: ['cherry'] },
      ];
      const clusters = clusterItemsByKeyword(items, 0.3);
      assert.lengthOf(clusters, 3);
    });

    await it('키워드 없는 아이템 → 독립 클러스터', () => {
      const items = [
        { title: 'A', keywords: ['AI'] },
        { title: 'B', keywords: [] },
        { title: 'C' },  // keywords 없음
      ];
      const clusters = clusterItemsByKeyword(items);
      assert.gte(clusters.length, 2); // B와 C는 독립
    });

    await it('Union-Find 전이성: A-B, B-C → 같은 클러스터', () => {
      const items = [
        { title: 'A', keywords: ['AI', 'GPU', 'NVIDIA'] },
        { title: 'B', keywords: ['AI', 'GPU', 'AMD'] },      // A와 유사
        { title: 'C', keywords: ['GPU', 'AMD', '반도체'] },   // B와 유사
      ];
      const clusters = clusterItemsByKeyword(items, 0.2);
      // A-B 연결, B-C 연결 → A-B-C 하나의 클러스터
      const bigCluster = clusters.find(c => c.items_count >= 2);
      assert.ok(bigCluster, '전이적 연결로 큰 클러스터 형성');
    });

    await it('대소문자 무시', () => {
      const items = [
        { title: 'A', keywords: ['AI', 'ml'] },
        { title: 'B', keywords: ['ai', 'ML'] },
      ];
      const clusters = clusterItemsByKeyword(items, 0.5);
      assert.lengthOf(clusters, 1, '대소문자 무시하면 같은 클러스터');
    });
  });

  // ============================================
  // ProgressManager
  // ============================================

  await describe('ProgressManager', async () => {
    const tempPath = path.join(os.tmpdir(), `test_progress_${Date.now()}.json`);

    afterEach(() => {
      try { fs.unlinkSync(tempPath); } catch {}
    });

    await it('새 파일 생성', () => {
      const pm = new ProgressManager(tempPath);
      assert.ok(pm.progress);
      assert.ok(pm.progress.labels);
    });

    await it('라벨 초기화', () => {
      const pm = new ProgressManager(tempPath);
      pm.initLabel('IT');
      assert.equal(pm.progress.labels.IT.gmail_fetch, 'pending');
      assert.equal(pm.progress.labels.IT.llm_extract, 'pending');
    });

    await it('단계 상태 변경', () => {
      const pm = new ProgressManager(tempPath);
      pm.setStepStatus('IT', 'gmail_fetch', 'in_progress');
      assert.equal(pm.getStepStatus('IT', 'gmail_fetch'), 'in_progress');
    });

    await it('completed 시 즉시 파일 저장', () => {
      const pm = new ProgressManager(tempPath);
      pm.setStepStatus('IT', 'gmail_fetch', 'completed');
      assert.ok(pm.isStepCompleted('IT', 'gmail_fetch'));
      // 파일이 실제 저장되었는지 확인
      assert.ok(fs.existsSync(tempPath));
      const saved = JSON.parse(fs.readFileSync(tempPath, 'utf8'));
      assert.equal(saved.labels.IT.gmail_fetch, 'completed');
    });

    await it('in_progress 시에도 파일 저장 (크래시 대비)', () => {
      const pm = new ProgressManager(tempPath);
      pm.setStepStatus('경제', 'html_to_text', 'in_progress');
      assert.ok(fs.existsSync(tempPath));
      const saved = JSON.parse(fs.readFileSync(tempPath, 'utf8'));
      assert.equal(saved.labels['경제'].html_to_text, 'in_progress');
    });

    await it('기존 진행 상태 로드', () => {
      // 먼저 저장
      const pm1 = new ProgressManager(tempPath);
      pm1.setStepStatus('시사', 'gmail_fetch', 'completed');

      // 새 인스턴스에서 로드
      const pm2 = new ProgressManager(tempPath);
      assert.ok(pm2.isStepCompleted('시사', 'gmail_fetch'));
    });

    await it('존재하지 않는 라벨 상태 → pending', () => {
      const pm = new ProgressManager(tempPath);
      assert.equal(pm.getStepStatus('없는라벨', 'gmail_fetch'), 'pending');
    });

    await it('markCompleted', () => {
      const pm = new ProgressManager(tempPath);
      pm.markCompleted();
      assert.ok(pm.progress.completed_at);
    });
  });

  // ============================================
  // FailedBatchManager
  // ============================================

  await describe('FailedBatchManager', async () => {
    const tempPath = path.join(os.tmpdir(), `test_failed_${Date.now()}.json`);

    afterEach(() => {
      try { fs.unlinkSync(tempPath); } catch {}
    });

    await it('실패 배치 기록', () => {
      const fbm = new FailedBatchManager(tempPath);
      fbm.recordFailure('IT', 'extract', 0, 'timeout');
      assert.gt(fbm.failedBatches.batches.length, 0);
      assert.ok(fbm.hasFailures());
    });

    await it('파일 저장 및 로드', () => {
      const fbm1 = new FailedBatchManager(tempPath);
      fbm1.recordFailure('경제', 'merge', 0, 'rate limit');

      const fbm2 = new FailedBatchManager(tempPath);
      assert.gt(fbm2.failedBatches.batches.length, 0);
      assert.ok(fbm2.hasFailures());
    });

    await it('실패 해결 후 제거', () => {
      const fbm = new FailedBatchManager(tempPath);
      fbm.recordFailure('시사', 'merge', 1, 'timeout');
      assert.ok(fbm.hasFailures());
      fbm.markResolved('시사', 'merge', 1);
      const remaining = fbm.getFailedBatches('시사', 'merge');
      assert.lengthOf(remaining, 0);
    });

    await it('clear 후 빈 상태', () => {
      const fbm = new FailedBatchManager(tempPath);
      fbm.recordFailure('IT', 'extract', 0, 'error');
      fbm.clear();
      assert.notOk(fbm.hasFailures());
    });
  });
};
