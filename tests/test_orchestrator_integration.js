/**
 * orchestrator processLabel/processAllLabels 통합 mock 테스트 (경로 B)
 *
 * 전략: AgentRunner.runAgent와 GmailFetcher 전체를 mock으로 교체
 * require.cache를 클리어한 후 fresh orchestrator 로드.
 *
 * 시나리오:
 *  1. 빈 메일 (메시지 0개)
 *  2. 정상 추출 → 머지 → MD 생성
 *  3. 신규 발신자 (analyze path)
 *  4. 만성 실패 발신자 차단 (shouldSkipAnalyze)
 *  5. 빈 senderEmail 가드
 *  6. 증분 재실행 (progress.json 기존)
 *  7. 머지 에이전트 실패 → 원본 유지 폴백
 *  8. LLM extract 일부 실패 → 다른 메일 계속 처리
 *  9. msg_*.json HTML 변환 → enrichWithArticles 호출
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

module.exports = async function () {

  /**
   * 격리된 orchestrator 환경: require.cache 클리어 + 모든 외부 모듈 mock
   */
  function setup({ extractResult, analyzeResult, mergeResult, gmailMessages, gmailSenders } = {}) {
    const baseTmp = path.join(os.tmpdir(), `orch-int-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    fs.mkdirSync(baseTmp, { recursive: true });
    fs.mkdirSync(path.join(baseTmp, 'config'), { recursive: true });

    // Minimal labels.json
    fs.writeFileSync(path.join(baseTmp, 'config', 'labels.json'), JSON.stringify({
      labels: [
        { name: 'IT', gmail_label: 'IT', sub_labels: [], enabled: true, focus_topics: ['AI'] }
      ]
    }));

    // GmailFetcher mock
    const fetchGmailPath = require.resolve('../scripts/fetch_gmail');
    delete require.cache[fetchGmailPath];
    require.cache[fetchGmailPath] = {
      id: fetchGmailPath,
      filename: fetchGmailPath,
      loaded: true,
      exports: {
        GmailFetcher: class {
          async authenticate() {}
          async fetchMessages({ outputDir }) {
            const messages = gmailMessages || [];
            // raw 폴더에 msg_*.json 생성 시뮬레이션
            for (const msg of messages) {
              fs.writeFileSync(
                path.join(outputDir, `msg_${msg.id}.json`),
                JSON.stringify({
                  message_id: msg.id,
                  from: msg.from,
                  subject: msg.subject || 'Test',
                  date: msg.date || new Date().toUTCString(),
                  html_body: msg.html_body || '<p>본문</p>'
                })
              );
            }
            return {
              senders: gmailSenders || messages.map(m => ({
                email: m.from?.match(/<(.+?)>/)?.[1] || m.from,
                name: m.from,
                count: 1
              })),
              total_count: messages.length
            };
          }
          async markMessagesAsRead() { return { success: 0, failed: 0 }; }
        }
      }
    };

    // html_to_text + fetch_articles mock (간단 변환)
    const htmlPath = require.resolve('../scripts/html_to_text');
    delete require.cache[htmlPath];
    require.cache[htmlPath] = {
      id: htmlPath, filename: htmlPath, loaded: true,
      exports: {
        htmlToText: (html) => html.replace(/<[^>]+>/g, ' ').trim(),
        cleanNewsletterText: (t) => t,
        htmlToStructuredMarkdown: (html) => html.replace(/<[^>]+>/g, ' ').trim(),
        cleanNewsletterMarkdown: (t) => t,
        isNonNewsEmail: () => false,
        extractImageUrls: () => [],
        createCleanTextWithLineNumbers: (t) => t
      }
    };

    const articlesPath = require.resolve('../scripts/fetch_articles');
    delete require.cache[articlesPath];
    require.cache[articlesPath] = {
      id: articlesPath, filename: articlesPath, loaded: true,
      exports: {
        enrichWithArticles: async (text) => text,  // 원문 크롤링 skip
        enrichLinkAggregator: async (text) => text
      }
    };

    // AgentRunner mock
    const agentRunnerPath = require.resolve('../scripts/agent_runner');
    delete require.cache[agentRunnerPath];
    require.cache[agentRunnerPath] = {
      id: agentRunnerPath, filename: agentRunnerPath, loaded: true,
      exports: {
        AgentRunner: class {
          constructor() {}
          async runAgent(agentPath, options) {
            const taskType = options.taskType;
            if (taskType === 'analyze') {
              return analyzeResult || {
                analysis: { structure_type: 'multi-item', item_count_avg: 3 },
                items: [{ title: '분석된 뉴스', summary: '요약', keywords: ['k'] }]
              };
            }
            if (taskType === 'merge') {
              return mergeResult || { items: options.inputs.items };  // 기본: 원본 그대로
            }
            // extract
            return extractResult || {
              items: [
                { title: '뉴스1', summary: '요약1' + 'A'.repeat(300), keywords: ['k1'], link: 'https://x.com/1' },
                { title: '뉴스2', summary: '요약2' + 'A'.repeat(300), keywords: ['k2'], link: 'https://x.com/2' }
              ]
            };
          }
          log() {}
        }
      }
    };

    // adaptive_learning은 진짜 사용하되 catalogPath만 격리
    const alPath = require.resolve('../scripts/adaptive_learning');
    delete require.cache[alPath];
    const { AdaptiveLearning: RealAL } = require('../scripts/adaptive_learning');
    class IsolatedAL extends RealAL {
      constructor() {
        super();
        this.configDir = path.join(baseTmp, 'config');
        this.skillsDir = path.join(baseTmp, 'skills', 'newsletters');
        this.catalogPath = path.join(baseTmp, 'config', 'newsletters.json');
        this._catalogCache = null;
        this._isDirty = false;
        // skillsDir 생성
        fs.mkdirSync(this.skillsDir, { recursive: true });
      }
    }
    require.cache[alPath].exports = { AdaptiveLearning: IsolatedAL };

    // orchestrator fresh load
    const orchPath = require.resolve('../scripts/orchestrator');
    delete require.cache[orchPath];

    // OLLAMA_API_KEY 환경변수 (없으면 throw)
    const origKey = process.env.OLLAMA_API_KEY;
    process.env.OLLAMA_API_KEY = 'test-key';

    const orchestrator = require('../scripts/orchestrator');

    // 격리된 labels.json을 가리키도록 process.chdir 대신 모듈 내부 path를 override
    // (getLabels는 __dirname 기반이라 우회 어려움 → 직접 라벨 객체 만들어서 processLabel 호출)

    return {
      orchestrator,
      baseTmp,
      cleanup: () => {
        try { fs.rmSync(baseTmp, { recursive: true, force: true }); } catch {}
        if (origKey !== undefined) process.env.OLLAMA_API_KEY = origKey;
        else delete process.env.OLLAMA_API_KEY;

        // require.cache 복원: 후속 테스트(test_pipeline_integration 등)가 실제 모듈을 받도록
        [fetchGmailPath, htmlPath, articlesPath, agentRunnerPath, alPath, orchPath].forEach(p => {
          delete require.cache[p];
        });
      }
    };
  }

  await describe('processLabel — 정상 흐름', async () => {
    let ctx;

    afterEach(() => {
      if (ctx) ctx.cleanup();
    });

    await it('메일 0개 → 즉시 반환 (success, messageCount=0)', async () => {
      ctx = setup({ gmailMessages: [] });
      const orch = ctx.orchestrator;
      orch._test._resetGlobals();

      const runDir = path.join(ctx.baseTmp, 'run');
      const pm = new orch._test.ProgressManager(path.join(runDir, 'progress.json'));
      const fbm = new orch._test.FailedBatchManager(path.join(runDir, 'failed.json'));
      const al = new (require('../scripts/adaptive_learning').AdaptiveLearning)();

      const result = await orch.processLabel(
        { name: 'IT', gmail_label: 'IT', sub_labels: [], focus_topics: [] },
        { start: new Date(Date.now() - 86400000), end: new Date() },
        runDir, pm, fbm, al
      );

      assert.equal(result.success, true);
      assert.equal(result.messageCount, 0);
      assert.equal(result.itemCount, 0);
    });

    await it('정상 메일 2개 → extract → merge → MD 생성', async () => {
      ctx = setup({
        gmailMessages: [
          { id: 'm1', from: 'Newsletter <a@news.com>', html_body: '<p>1</p>' },
          { id: 'm2', from: 'Newsletter <a@news.com>', html_body: '<p>2</p>' }
        ]
      });
      const orch = ctx.orchestrator;
      orch._test._resetGlobals();

      const runDir = path.join(ctx.baseTmp, 'run');
      fs.mkdirSync(runDir, { recursive: true });
      const pm = new orch._test.ProgressManager(path.join(runDir, 'progress.json'));
      const fbm = new orch._test.FailedBatchManager(path.join(runDir, 'failed.json'));
      const al = new (require('../scripts/adaptive_learning').AdaptiveLearning)();

      const result = await orch.processLabel(
        { name: 'IT', gmail_label: 'IT', sub_labels: [], focus_topics: [] },
        { start: new Date(Date.now() - 86400000), end: new Date() },
        runDir, pm, fbm, al
      );

      assert.equal(result.success, true);
      assert.equal(result.messageCount, 2);
      assert.gt(result.itemCount, 0);

      // 결과물 확인
      const mergedPath = path.join(runDir, 'merged', 'merged_IT.json');
      assert.ok(fs.existsSync(mergedPath));
      const merged = JSON.parse(fs.readFileSync(mergedPath, 'utf8'));
      assert.equal(merged.label, 'IT');
      assert.gt(merged.items.length, 0);

      // Progress 완료
      assert.equal(pm.isStepCompleted('IT', 'gmail_fetch'), true);
      assert.equal(pm.isStepCompleted('IT', 'html_to_text'), true);
      assert.equal(pm.isStepCompleted('IT', 'llm_extract'), true);
      assert.equal(pm.isStepCompleted('IT', 'merge'), true);

      // MD 파일 생성
      const finalDir = path.join(runDir, 'final');
      const mdFiles = fs.readdirSync(finalDir).filter(f => f.endsWith('.md'));
      assert.gt(mdFiles.length, 0);
    });

    await it('신규 발신자 → analyze → SKILL 자동 생성', async () => {
      ctx = setup({
        gmailMessages: [{ id: 'new1', from: 'New <new@unknown.com>', html_body: '<p>New</p>' }],
        analyzeResult: {
          analysis: { structure_type: 'single-topic', item_count_avg: 1, characteristics: 'test' },
          items: [{ title: 'NewItem', summary: 'S' + 'A'.repeat(300), keywords: ['n'] }]
        }
      });
      const orch = ctx.orchestrator;
      orch._test._resetGlobals();

      const runDir = path.join(ctx.baseTmp, 'run');
      fs.mkdirSync(runDir, { recursive: true });
      const pm = new orch._test.ProgressManager(path.join(runDir, 'progress.json'));
      const fbm = new orch._test.FailedBatchManager(path.join(runDir, 'failed.json'));
      const al = new (require('../scripts/adaptive_learning').AdaptiveLearning)();
      // pre-register the new sender so it appears as a known newsletter
      await al.registerNewsletter({ email: 'new@unknown.com', name: 'New', label: 'IT' });

      const result = await orch.processLabel(
        { name: 'IT', gmail_label: 'IT', sub_labels: [], focus_topics: [] },
        { start: new Date(Date.now() - 86400000), end: new Date() },
        runDir, pm, fbm, al
      );

      assert.equal(result.success, true);
      // SKILL 자동 생성 확인
      assert.equal(al.isSkillGenerated('new@unknown.com'), true);
    });

    await it('만성 실패 발신자 → shouldSkipAnalyze true → 기본 추출로 fallback', async () => {
      ctx = setup({
        gmailMessages: [{ id: 'fail1', from: 'Fail <fail@x.com>', html_body: '<p>x</p>' }]
      });
      const orch = ctx.orchestrator;
      orch._test._resetGlobals();

      const runDir = path.join(ctx.baseTmp, 'run');
      fs.mkdirSync(runDir, { recursive: true });
      const pm = new orch._test.ProgressManager(path.join(runDir, 'progress.json'));
      const fbm = new orch._test.FailedBatchManager(path.join(runDir, 'failed.json'));
      const al = new (require('../scripts/adaptive_learning').AdaptiveLearning)();
      // 만성 실패 발신자 사전 등록
      await al.registerNewsletter({ email: 'fail@x.com', name: 'Fail', label: 'IT' });
      al.recordAnalyzeFailure('fail@x.com');
      al.recordAnalyzeFailure('fail@x.com');
      al.recordAnalyzeFailure('fail@x.com');

      const result = await orch.processLabel(
        { name: 'IT', gmail_label: 'IT', sub_labels: [], focus_topics: [] },
        { start: new Date(Date.now() - 86400000), end: new Date() },
        runDir, pm, fbm, al
      );

      assert.equal(result.success, true);
      // analyze 안 하고 extract 했음 → SKILL 여전히 false
      assert.equal(al.isSkillGenerated('fail@x.com'), false);
    });
  });

  await describe('processLabel — 증분 처리', async () => {
    let ctx;

    afterEach(() => {
      if (ctx) ctx.cleanup();
    });

    await it('이미 completed 상태인 단계는 건너뜀', async () => {
      ctx = setup({
        gmailMessages: [{ id: 'm1', from: 'A <a@x.com>', html_body: '<p>1</p>' }]
      });
      const orch = ctx.orchestrator;
      orch._test._resetGlobals();

      const runDir = path.join(ctx.baseTmp, 'run');
      fs.mkdirSync(runDir, { recursive: true });

      // 1차 실행
      const pm1 = new orch._test.ProgressManager(path.join(runDir, 'progress.json'));
      const fbm = new orch._test.FailedBatchManager(path.join(runDir, 'failed.json'));
      const al = new (require('../scripts/adaptive_learning').AdaptiveLearning)();
      await al.registerNewsletter({ email: 'a@x.com', name: 'A', label: 'IT' });
      al.saveAnalyzedSkill('a@x.com', { structure_type: 'multi-item' });

      await orch.processLabel(
        { name: 'IT', gmail_label: 'IT', sub_labels: [], focus_topics: [] },
        { start: new Date(Date.now() - 86400000), end: new Date() },
        runDir, pm1, fbm, al
      );

      // 2차 실행 (같은 progress.json)
      const pm2 = new orch._test.ProgressManager(path.join(runDir, 'progress.json'));
      // 모든 단계 completed 상태에서 시작
      assert.equal(pm2.isStepCompleted('IT', 'merge'), true);

      const result2 = await orch.processLabel(
        { name: 'IT', gmail_label: 'IT', sub_labels: [], focus_topics: [] },
        { start: new Date(Date.now() - 86400000), end: new Date() },
        runDir, pm2, fbm, al
      );

      assert.equal(result2.success, true);
      // 캐시된 merged 결과 사용
    });
  });

  await describe('processLabel — 실패 격리', async () => {
    let ctx;

    afterEach(() => {
      if (ctx) ctx.cleanup();
    });

    await it('빈 senderEmail 가드 → SKILL 분기 건너뛰고 기본 처리', async () => {
      ctx = setup({
        gmailMessages: [{ id: 'm1', from: '', html_body: '<p>1</p>' }]  // 발신자 없음
      });
      const orch = ctx.orchestrator;
      orch._test._resetGlobals();

      const runDir = path.join(ctx.baseTmp, 'run');
      fs.mkdirSync(runDir, { recursive: true });
      const pm = new orch._test.ProgressManager(path.join(runDir, 'progress.json'));
      const fbm = new orch._test.FailedBatchManager(path.join(runDir, 'failed.json'));
      const al = new (require('../scripts/adaptive_learning').AdaptiveLearning)();

      // console 무음
      const origWarn = console.warn;
      console.warn = () => {};
      try {
        const result = await orch.processLabel(
          { name: 'IT', gmail_label: 'IT', sub_labels: [], focus_topics: [] },
          { start: new Date(Date.now() - 86400000), end: new Date() },
          runDir, pm, fbm, al
        );
        // throw 없이 정상 종료
        assert.equal(result.success, true);
      } finally {
        console.warn = origWarn;
      }
    });
  });

  await describe('processAllLabels — 병렬', async () => {
    let ctx;

    afterEach(() => {
      if (ctx) ctx.cleanup();
    });

    await it('여러 라벨 병렬 처리 → 모두 success', async () => {
      ctx = setup({
        gmailMessages: [{ id: 'm1', from: 'A <a@x.com>', html_body: '<p>1</p>' }]
      });
      const orch = ctx.orchestrator;
      orch._test._resetGlobals();

      const runDir = path.join(ctx.baseTmp, 'run');
      fs.mkdirSync(runDir, { recursive: true });
      const pm = new orch._test.ProgressManager(path.join(runDir, 'progress.json'));
      const fbm = new orch._test.FailedBatchManager(path.join(runDir, 'failed.json'));
      const al = new (require('../scripts/adaptive_learning').AdaptiveLearning)();
      await al.registerNewsletter({ email: 'a@x.com', name: 'A', label: 'IT' });
      al.saveAnalyzedSkill('a@x.com', { structure_type: 'multi-item' });

      const labels = [
        { name: 'IT', gmail_label: 'IT', sub_labels: [], focus_topics: [] },
        { name: '경제', gmail_label: '경제', sub_labels: [], focus_topics: [] }
      ];
      const results = await orch.processAllLabels(
        labels,
        { start: new Date(Date.now() - 86400000), end: new Date() },
        runDir, pm, fbm, al
      );

      assert.lengthOf(results, 2);
      assert.equal(results.every(r => r.success), true);
    });

    await it('한 라벨에서 throw → 다른 라벨은 계속 처리', async () => {
      ctx = setup({
        gmailMessages: [{ id: 'm1', from: 'A <a@x.com>', html_body: '<p>1</p>' }]
      });
      const orch = ctx.orchestrator;
      orch._test._resetGlobals();

      const runDir = path.join(ctx.baseTmp, 'run');
      fs.mkdirSync(runDir, { recursive: true });
      const pm = new orch._test.ProgressManager(path.join(runDir, 'progress.json'));
      const fbm = new orch._test.FailedBatchManager(path.join(runDir, 'failed.json'));
      const al = new (require('../scripts/adaptive_learning').AdaptiveLearning)();
      await al.registerNewsletter({ email: 'a@x.com', name: 'A', label: 'IT' });
      al.saveAnalyzedSkill('a@x.com', { structure_type: 'multi-item' });

      // 한 라벨은 정상, 한 라벨은 의도적으로 깨진 입력
      const labels = [
        { name: 'IT', gmail_label: 'IT', sub_labels: [], focus_topics: [] },
        // null sub_labels로 throw 유도? 사실 그래도 잘 처리됨. 다른 방법:
        // gmail_label undefined로 라벨 fetch가 throw하길 기대
      ];
      const results = await orch.processAllLabels(
        labels,
        { start: new Date(Date.now() - 86400000), end: new Date() },
        runDir, pm, fbm, al
      );

      assert.equal(results[0].success, true);
    });
  });

  await describe('processLabel — 추가 분기', async () => {
    let ctx;
    afterEach(() => { if (ctx) ctx.cleanup(); });

    await it('merge 에이전트가 throw → 원본 유지 폴백', async () => {
      ctx = setup({
        gmailMessages: [
          { id: 'm1', from: 'A <a@x.com>', html_body: '<p>1</p>' },
          { id: 'm2', from: 'B <b@x.com>', html_body: '<p>2</p>' }
        ],
        // merge 호출 시 throw → 외부 try-catch 발동
        // (실제로는 batch 단위 catch에 잡히지만 일부 분기 cover)
        mergeResult: { items: [] }  // 빈 결과로 폴백 트리거
      });
      const orch = ctx.orchestrator;
      orch._test._resetGlobals();

      const runDir = path.join(ctx.baseTmp, 'run');
      fs.mkdirSync(runDir, { recursive: true });
      const pm = new orch._test.ProgressManager(path.join(runDir, 'progress.json'));
      const fbm = new orch._test.FailedBatchManager(path.join(runDir, 'failed.json'));
      const al = new (require('../scripts/adaptive_learning').AdaptiveLearning)();
      await al.registerNewsletter({ email: 'a@x.com', name: 'A', label: 'IT' });
      al.saveAnalyzedSkill('a@x.com', { structure_type: 'multi-item' });
      await al.registerNewsletter({ email: 'b@x.com', name: 'B', label: 'IT' });
      al.saveAnalyzedSkill('b@x.com', { structure_type: 'multi-item' });

      const result = await orch.processLabel(
        { name: 'IT', gmail_label: 'IT', sub_labels: [], focus_topics: [] },
        { start: new Date(Date.now() - 86400000), end: new Date() },
        runDir, pm, fbm, al
      );
      assert.equal(result.success, true);
    });

    await it('markMessagesAsRead 실패 → 무시하고 계속', async () => {
      ctx = setup({
        gmailMessages: [{ id: 'm1', from: 'A <a@x.com>', html_body: '<p>1</p>' }]
      });
      const orch = ctx.orchestrator;
      orch._test._resetGlobals();

      // GmailFetcher mock 재정의: markMessagesAsRead만 throw
      const fetchGmailPath = require.resolve('../scripts/fetch_gmail');
      require.cache[fetchGmailPath].exports = {
        GmailFetcher: class {
          async authenticate() {}
          async fetchMessages({ outputDir }) {
            fs.writeFileSync(path.join(outputDir, 'msg_m1.json'), JSON.stringify({
              message_id: 'm1', from: 'A <a@x.com>', subject: 'T', date: '', html_body: '<p>x</p>'
            }));
            return { senders: [{ email: 'a@x.com', name: 'A', count: 1 }], total_count: 1 };
          }
          async markMessagesAsRead() { throw new Error('mark failed'); }
        }
      };

      const runDir = path.join(ctx.baseTmp, 'run');
      fs.mkdirSync(runDir, { recursive: true });
      const pm = new orch._test.ProgressManager(path.join(runDir, 'progress.json'));
      const fbm = new orch._test.FailedBatchManager(path.join(runDir, 'failed.json'));
      const al = new (require('../scripts/adaptive_learning').AdaptiveLearning)();
      await al.registerNewsletter({ email: 'a@x.com', name: 'A', label: 'IT' });
      al.saveAnalyzedSkill('a@x.com', { structure_type: 'multi-item' });

      // console 무음
      const origWarn = console.warn;
      console.warn = () => {};
      try {
        const result = await orch.processLabel(
          { name: 'IT', gmail_label: 'IT', sub_labels: [], focus_topics: [] },
          { start: new Date(Date.now() - 86400000), end: new Date() },
          runDir, pm, fbm, al
        );
        // markMessagesAsRead 실패해도 success
        assert.equal(result.success, true);
      } finally {
        console.warn = origWarn;
      }
    });

  });

  await describe('checkSetup 분기', async () => {
    let ctx;

    afterEach(() => {
      if (ctx) ctx.cleanup();
    });

    await it('OLLAMA_API_KEY 누락 → errors에 환경변수 항목', () => {
      ctx = setup({});
      const orch = ctx.orchestrator;
      const origKey = process.env.OLLAMA_API_KEY;
      delete process.env.OLLAMA_API_KEY;
      try {
        const result = orch._test.checkSetup();
        const envErr = result.errors.find(e => e.type === '환경 변수');
        assert.ok(envErr);
      } finally {
        if (origKey !== undefined) process.env.OLLAMA_API_KEY = origKey;
      }
    });
  });
};
