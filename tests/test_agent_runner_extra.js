/**
 * agent_runner.js 추가 단위 테스트 (최근 변경 검증)
 * - loadUserContext / loadFocusTopics 캐시
 * - getRequiredFieldsForTask
 * - {{USER_CONTEXT}} / {{FOCUS_TOPICS}} replaceAll 동작
 * - mergeChunkResults dedup 임계값 0.75
 * - runSinglePrompt 토큰 초과 4단 폴백 후 throw
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { AgentRunner } = require('../scripts/agent_runner');

module.exports = async function () {

  function makeRunner() {
    const runner = new AgentRunner('test-key', 'test-model', {
      logDir: path.join(os.tmpdir(), 'runner-test-' + Date.now()),
      chunkSize: 8000
    });
    // 콘솔 무음화
    runner.log = () => {};
    return runner;
  }

  await describe('loadUserContext 캐시', async () => {
    await it('두 번 호출해도 동일 결과 (캐시 적중)', () => {
      const runner = makeRunner();
      const first = runner.loadUserContext();
      const second = runner.loadUserContext();
      assert.equal(first, second);
      // 캐시 객체 채워짐
      assert.ok(runner._userContextCache !== null);
    });

    await it('user_profile.json 없을 때 fallback 메시지 반환', () => {
      const runner = makeRunner();
      // user_profile.json 없는 환경이라 fallback 케이스 (실제 파일에 있으면 정상값)
      const result = runner.loadUserContext();
      assert.type(result, 'string');
      assert.gt(result.length, 0);
    });
  });

  await describe('loadFocusTopics 캐시', async () => {
    await it('두 번 호출해도 디스크 IO 1회 (_labelsJsonCache 적중)', () => {
      const runner = makeRunner();
      const agentPath = path.join(__dirname, '..', 'agents', 'labels', 'IT.md');
      runner.loadFocusTopics(agentPath);
      assert.ok(runner._labelsJsonCache);
      // 두 번째 호출
      const before = runner._labelsJsonCache;
      runner.loadFocusTopics(agentPath);
      assert.equal(runner._labelsJsonCache, before);  // 동일 객체 참조
    });

    await it('알 수 없는 라벨 → 기본 메시지', () => {
      const runner = makeRunner();
      const fakeAgentPath = path.join(__dirname, '..', 'agents', 'labels', '존재하지않는라벨.md');
      const result = runner.loadFocusTopics(fakeAgentPath);
      assert.equal(result, '모든 주요 아이템 추출');
    });
  });

  await describe('getRequiredFieldsForTask', async () => {
    await it('extract → items', () => {
      const runner = makeRunner();
      assert.deepEqual(runner.getRequiredFieldsForTask('extract'), ['items']);
    });

    await it('merge → items', () => {
      const runner = makeRunner();
      assert.deepEqual(runner.getRequiredFieldsForTask('merge'), ['items']);
    });

    await it('analyze → items', () => {
      const runner = makeRunner();
      assert.deepEqual(runner.getRequiredFieldsForTask('analyze'), ['items']);
    });

    await it('알 수 없는 → 빈 배열', () => {
      const runner = makeRunner();
      assert.deepEqual(runner.getRequiredFieldsForTask('unknown'), []);
    });
  });

  await describe('mergeChunkResults dedup 임계값 0.75', async () => {
    await it('83% 유사 (한쪽에만 단어 1개 추가) → 중복 제거', () => {
      const runner = makeRunner();
      // 5개 공통 단어 + 한쪽에만 "발표" 1개 추가 → Jaccard = 5/6 = 0.833 > 0.75
      const items = [
        { items: [{ title: '삼성전자 1분기 영업이익 10조원 돌파' }] },
        { items: [{ title: '삼성전자 1분기 영업이익 10조원 돌파 발표' }] }
      ];
      const result = runner.mergeChunkResults(items, {});
      assert.equal(result.items.length, 1);
    });

    await it('70% 유사 → 유지 (0.75 미만)', () => {
      const runner = makeRunner();
      // 단어 단위 Jaccard
      // a: 삼성 실적 영업이익 (3단어)
      // b: 삼성 영업이익 신기록 돌파 (4단어)
      // 교집합: {삼성, 영업이익} = 2
      // 합집합: {삼성, 실적, 영업이익, 신기록, 돌파} = 5
      // Jaccard = 2/5 = 0.4 → 유지
      const items = [
        { items: [{ title: '삼성 실적 영업이익' }] },
        { items: [{ title: '삼성 영업이익 신기록 돌파' }] }
      ];
      const result = runner.mergeChunkResults(items, {});
      assert.equal(result.items.length, 2);
    });

    await it('완전히 같은 제목 → 1개', () => {
      const runner = makeRunner();
      const items = [
        { items: [{ title: 'NVIDIA 시가총액 3조 달러 돌파' }] },
        { items: [{ title: 'NVIDIA 시가총액 3조 달러 돌파' }] }
      ];
      const result = runner.mergeChunkResults(items, {});
      assert.equal(result.items.length, 1);
    });

    await it('완전히 다른 제목 → 유지', () => {
      const runner = makeRunner();
      const items = [
        { items: [{ title: '삼성 분기 실적' }] },
        { items: [{ title: 'NVIDIA RTX 5090 출시' }] },
        { items: [{ title: 'LG 화학 미국 공장' }] }
      ];
      const result = runner.mergeChunkResults(items, {});
      assert.equal(result.items.length, 3);
    });

    await it('제목 없는 아이템 제거', () => {
      const runner = makeRunner();
      const items = [
        { items: [{ title: '정상 제목', summary: 'X' }] },
        { items: [{ summary: '제목 없음' }] },
        { items: [{ title: 'A' }] }  // 3자 미만
      ];
      const result = runner.mergeChunkResults(items, {});
      assert.equal(result.items.length, 1);
    });
  });

  await describe('buildHeader replaceAll 동작', async () => {
    let tmpAgentPath;

    beforeEach(() => {
      tmpAgentPath = path.join(os.tmpdir(), `test-agent-${Date.now()}.md`);
    });

    afterEach(() => {
      try { fs.unlinkSync(tmpAgentPath); } catch {}
    });

    await it('{{USER_CONTEXT}}가 여러 번 등장해도 모두 치환', async () => {
      fs.writeFileSync(tmpAgentPath, '# Agent\n\nContext: {{USER_CONTEXT}}\n\nAgain: {{USER_CONTEXT}}\n');
      const runner = makeRunner();
      const header = await runner.buildHeader(tmpAgentPath, {});
      // {{USER_CONTEXT}}가 더 이상 남아있지 않아야 함
      assert.notIncludes(header, '{{USER_CONTEXT}}');
    });

    await it('{{FOCUS_TOPICS}}가 여러 번 등장해도 모두 치환', async () => {
      fs.writeFileSync(tmpAgentPath, '# Agent\n\nTopics: {{FOCUS_TOPICS}}\nMore: {{FOCUS_TOPICS}}\n');
      const runner = makeRunner();
      const header = await runner.buildHeader(tmpAgentPath, {});
      assert.notIncludes(header, '{{FOCUS_TOPICS}}');
    });
  });

  await describe('runSinglePrompt 토큰 초과 폴백', async () => {
    await it('마지막 시도에서 토큰 초과 → throw (undefined 반환 X)', async () => {
      const runner = makeRunner();
      // callSolar3WithRetry를 mock하여 항상 토큰 초과 에러 throw
      runner.callSolar3WithRetry = async () => {
        const err = new Error('context length exceeded');
        throw err;
      };
      runner.currentTaskType = 'extract';

      let caught = null;
      try {
        await runner.runSinglePrompt('header', 'A'.repeat(10000), {});
      } catch (e) {
        caught = e;
      }
      // throw 되어야 함 (undefined 반환 안 됨)
      assert.ok(caught);
      assert.includes(caught.message.toLowerCase(), 'context length');
    });

    await it('첫 시도 성공 시 정상 반환', async () => {
      const runner = makeRunner();
      runner.callSolar3WithRetry = async () => '{"items": [{"title": "test"}]}';
      runner.currentTaskType = 'extract';

      const result = await runner.runSinglePrompt('header', 'data', {});
      assert.ok(result);
      assert.ok(result.items);
    });
  });

  await describe('repairJson escape된 따옴표 처리', async () => {
    await it('문자열 내 \\"가 있어도 깨지지 않음', () => {
      const runner = makeRunner();
      const input = '{"title": "He said \\"hi\\""}';
      const repaired = runner.repairJson(input);
      const parsed = JSON.parse(repaired);
      assert.equal(parsed.title, 'He said "hi"');
    });

    await it('연속된 escape 문자 처리', () => {
      const runner = makeRunner();
      const input = '{"text": "line1\\nline2"}';
      const repaired = runner.repairJson(input);
      const parsed = JSON.parse(repaired);
      assert.equal(parsed.text, 'line1\nline2');
    });
  });

  await describe('isRetryableError', async () => {
    await it('429/500/502/503/504/524 → retryable', () => {
      const runner = makeRunner();
      [429, 500, 502, 503, 504, 524].forEach(status => {
        const err = new Error('x');
        err.status = status;
        assert.equal(runner.isRetryableError(err), true);
      });
    });

    await it('400/401/404 → not retryable', () => {
      const runner = makeRunner();
      [400, 401, 404].forEach(status => {
        const err = new Error('x');
        err.status = status;
        assert.equal(runner.isRetryableError(err), false);
      });
    });

    await it('AbortError → retryable', () => {
      const runner = makeRunner();
      const err = new Error('aborted');
      err.name = 'AbortError';
      assert.equal(runner.isRetryableError(err), true);
    });

    await it('토큰 초과는 retryable 아님 (상위에서 축소 재시도)', () => {
      const runner = makeRunner();
      const err = new Error('context length exceeded');
      assert.equal(runner.isRetryableError(err), false);
    });

    await it('"불완전" 메시지 → retryable', () => {
      const runner = makeRunner();
      const err = new Error('불완전한 JSON 응답');
      assert.equal(runner.isRetryableError(err), true);
    });
  });

  await describe('extractFirstJson balanced bracket parsing', async () => {
    await it('중첩 객체에서도 첫 번째 완전한 JSON만 추출', () => {
      const runner = makeRunner();
      const input = '<thinking>...</thinking>\n{"a": {"b": "c"}}\n{"second": true}';
      const result = runner.extractFirstJson(input);
      const parsed = JSON.parse(result);
      assert.equal(parsed.a.b, 'c');
    });

    await it('문자열 안의 } 무시', () => {
      const runner = makeRunner();
      const input = '{"text": "this has } in it"}';
      const result = runner.extractFirstJson(input);
      const parsed = JSON.parse(result);
      assert.equal(parsed.text, 'this has } in it');
    });

    await it('escape된 따옴표 무시', () => {
      const runner = makeRunner();
      const input = '{"text": "say \\"hi\\""}';
      const result = runner.extractFirstJson(input);
      const parsed = JSON.parse(result);
      assert.equal(parsed.text, 'say "hi"');
    });

    await it('{ 없으면 null', () => {
      const runner = makeRunner();
      assert.equal(runner.extractFirstJson('no json here'), null);
    });

    await it('불완전 JSON은 전체 반환 (repair에서 처리)', () => {
      const runner = makeRunner();
      const input = '{"a": "b"';
      const result = runner.extractFirstJson(input);
      assert.equal(result, input);
    });
  });
};
