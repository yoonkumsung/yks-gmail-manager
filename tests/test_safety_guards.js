/**
 * 무인 자동 실행 안전장치 단위 테스트
 * 대상:
 *   1) isValidItemsCache  — 0아이템/에러/손상 캐시 무효화(누락 캐시 가드)
 *   2) assessRunHealth    — 대량 실패 vs 정상 0건 구분(0건 발행 차단)
 *   3) AgentRunner 인증 실패 폴백(claude → OpenRouter) / 폴백 불가 시 명확 에러
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  _test: { isValidItemsCache, assessRunHealth }
} = require('../scripts/orchestrator');
const { AgentRunner } = require('../scripts/agent_runner');

module.exports = async function () {

  // ============================================
  // 1) isValidItemsCache (누락 캐시 가드)
  // ============================================
  await describe('isValidItemsCache', async () => {
    let tmpDir;
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yks-cache-'));
    });
    afterEach(() => {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    });

    const writeCache = (name, obj) => {
      const p = path.join(tmpDir, name);
      fs.writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj), 'utf8');
      return p;
    };

    await it('1개 이상 아이템 → 유효(true)', () => {
      const p = writeCache('items_a.json', { items: [{ title: '뉴스', summary: 's' }] });
      assert.ok(isValidItemsCache(p));
    });

    await it('빈 배열 → 무효(false)', () => {
      const p = writeCache('items_b.json', { items: [] });
      assert.notOk(isValidItemsCache(p));
    });

    await it('items 필드 없음 → 무효(false)', () => {
      const p = writeCache('items_c.json', { foo: 1 });
      assert.notOk(isValidItemsCache(p));
    });

    await it('에러 마커 → 무효(false)', () => {
      const p = writeCache('items_d.json', { error: '401', items: [{ title: 'x' }] });
      assert.notOk(isValidItemsCache(p));
    });

    await it('손상 JSON → 무효(false)', () => {
      const p = writeCache('items_e.json', '{ broken json');
      assert.notOk(isValidItemsCache(p));
    });

    await it('파일 없음 → 무효(false)', () => {
      assert.notOk(isValidItemsCache(path.join(tmpDir, 'nope.json')));
    });
  });

  // ============================================
  // 2) assessRunHealth (0건 발행 차단)
  // ============================================
  await describe('assessRunHealth', async () => {
    await it('수집 메일 0건 → 정상 0건(healthy & empty)', () => {
      const r = assessRunHealth([
        { label: 'IT', success: true, messageCount: 0, itemCount: 0, extractFail: 0, extractAttempted: 0 },
        { label: 'NYT_경제', success: true, messageCount: 0, itemCount: 0, extractFail: 0, extractAttempted: 0 },
      ]);
      assert.ok(r.healthy);
      assert.ok(r.empty);
    });

    await it('메일 있는데 최종 아이템 0 → 대량 실패(unhealthy)', () => {
      const r = assessRunHealth([
        { label: 'IT', success: true, messageCount: 12, itemCount: 0, extractFail: 12, extractAttempted: 12 },
      ]);
      assert.notOk(r.healthy);
      assert.notOk(r.empty);
    });

    await it('LLM 추출 실패율 50%+ → 대량 실패(unhealthy)', () => {
      const r = assessRunHealth([
        { label: 'IT', success: true, messageCount: 10, itemCount: 5, extractFail: 6, extractAttempted: 10 },
      ]);
      assert.notOk(r.healthy);
    });

    await it('실패율 50% 미만 → 정상(healthy)', () => {
      const r = assessRunHealth([
        { label: 'IT', success: true, messageCount: 10, itemCount: 40, extractFail: 2, extractAttempted: 10 },
      ]);
      assert.ok(r.healthy);
      assert.notOk(r.empty);
    });

    await it('라벨 처리 예외 → 대량 실패(unhealthy)', () => {
      const r = assessRunHealth([
        { label: 'IT', success: false, error: '인증 실패' },
        { label: '경제', success: true, messageCount: 5, itemCount: 20, extractFail: 0, extractAttempted: 5 },
      ]);
      assert.notOk(r.healthy);
    });

    await it('빈 라벨(NYT_경제 등)이 섞여도 전체 정상이면 healthy — 빈 라벨 정상 인지', () => {
      const r = assessRunHealth([
        { label: 'IT', success: true, messageCount: 10, itemCount: 50, extractFail: 0, extractAttempted: 10 },
        { label: 'NYT_경제', success: true, messageCount: 0, itemCount: 0, extractFail: 0, extractAttempted: 0 },
        { label: '글로벌_경제', success: true, messageCount: 0, itemCount: 0, extractFail: 0, extractAttempted: 0 },
      ]);
      assert.ok(r.healthy);
      assert.notOk(r.empty);
    });

    await it('빈 입력 → 정상 0건', () => {
      const r = assessRunHealth([]);
      assert.ok(r.healthy);
      assert.ok(r.empty);
    });
  });

  // ============================================
  // 3) AgentRunner 인증 실패 폴백
  // ============================================
  await describe('AgentRunner claude 인증 실패 폴백', async () => {
    let savedKey;
    beforeEach(() => { savedKey = process.env.OPENROUTER_API_KEY; });
    afterEach(() => {
      if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = savedKey;
    });

    await it('인증 실패 + 키 있음 → OpenRouter 폴백, backend 전환', async () => {
      const runner = new AgentRunner('or-key', 'deepseek/deepseek-v4-pro', { backend: 'claude' });
      runner.log = () => {};
      runner.currentTaskType = 'extract';
      runner.callClaudeCLI = async () => {
        const e = new Error('Invalid authentication: OAuth token');
        e.isAuthFailure = true;
        throw e;
      };
      let orCalled = false;
      runner.callOpenRouter = async () => { orCalled = true; return '{"items":[]}'; };

      const out = await runner.callLLM('prompt');
      assert.equal(out, '{"items":[]}');
      assert.ok(orCalled, 'OpenRouter 폴백 호출됨');
      assert.equal(runner.backend, 'openrouter', 'backend가 openrouter로 전환됨');
    });

    await it('인증 실패 + 키 없음 → 명확한 에러(폴백 안 함)', async () => {
      delete process.env.OPENROUTER_API_KEY;
      const runner = new AgentRunner('', 'deepseek/deepseek-v4-pro', { backend: 'claude' });
      runner.log = () => {};
      runner.currentTaskType = 'extract';
      runner.callClaudeCLI = async () => {
        const e = new Error('Not logged in');
        e.isAuthFailure = true;
        throw e;
      };
      let orCalled = false;
      runner.callOpenRouter = async () => { orCalled = true; return 'x'; };

      let msg = '';
      try { await runner.callLLM('prompt'); } catch (e) { msg = e.message; }
      assert.includes(msg, '폴백 불가');
      assert.notOk(orCalled, 'OpenRouter 폴백은 호출되지 않음');
    });

    await it('인증 실패 아님(5xx 등) → rethrow, 폴백 안 함', async () => {
      const runner = new AgentRunner('or-key', 'deepseek/deepseek-v4-pro', { backend: 'claude' });
      runner.log = () => {};
      runner.currentTaskType = 'extract';
      runner.callClaudeCLI = async () => {
        const e = new Error('claude CLI 실패 (code 1): 529 overloaded');
        e.isRateLimit = true;
        throw e;
      };
      let orCalled = false;
      runner.callOpenRouter = async () => { orCalled = true; return 'x'; };

      let threw = false;
      try { await runner.callLLM('prompt'); } catch (e) { threw = true; }
      assert.ok(threw, '비인증 에러는 rethrow');
      assert.notOk(orCalled, '비인증 에러는 폴백하지 않음(상위 재시도에 위임)');
      assert.equal(runner.backend, 'claude', 'backend 유지');
    });
  });
};
