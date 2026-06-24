/**
 * callOpenRouter 통합 테스트 (mock fetch 기반)
 * 실제 API 호출 없이 다양한 응답 시나리오 검증
 *
 * 주의: agent_runner의 내부 fetchModule은 모듈 레벨 캐시되므로,
 * require.cache에서 모듈 자체를 갈아치워야 mock 적용됨.
 * 여기서는 AgentRunner.callOpenRouter를 직접 호출하면서 fetch를 인자로 주입.
 *
 * OpenRouter(OpenAI Chat Completions 호환) 응답 구조:
 *   { choices: [{ message: { content }, finish_reason }], usage: { prompt_tokens, completion_tokens } }
 */

const path = require('path');
const os = require('os');

const { AgentRunner } = require('../scripts/agent_runner');

module.exports = async function () {

  /**
   * Mock fetch 빌더 (FYI: 실제 node-fetch v3는 ESM이라 require가 불가능하여 동적 import 사용)
   * 우리는 callOpenRouter에 fetch를 직접 인자로 전달하므로 가짜 함수만 만들면 됨
   */
  function mockFetch(responseBuilder) {
    return async (url, options) => {
      const body = responseBuilder({ url, options });
      return {
        ok: body.ok !== false,
        status: body.status || 200,
        text: async () => body.text || JSON.stringify(body.json || {}),
        json: async () => body.json || {}
      };
    };
  }

  function makeRunner() {
    const runner = new AgentRunner('test-key', 'test-model', {
      logDir: path.join(os.tmpdir(), 'callopenrouter-test-' + Date.now())
    });
    runner.log = () => {};
    runner.currentTaskType = 'extract';
    return runner;
  }

  await describe('callOpenRouter 정상 응답', async () => {
    await it('정상 JSON content 반환', async () => {
      const runner = makeRunner();
      const fetch = mockFetch(() => ({
        json: {
          choices: [{ message: { content: '{"items":[{"title":"테스트"}]}' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 100, completion_tokens: 50 }
        }
      }));

      const controller = new AbortController();
      const taskConfig = runner.getTaskConfig('extract');
      const content = await runner.callOpenRouter('prompt text', taskConfig, controller, fetch);

      assert.equal(content, '{"items":[{"title":"테스트"}]}');
    });

    await it('빈 message → 빈 문자열 반환', async () => {
      const runner = makeRunner();
      const fetch = mockFetch(() => ({
        json: { choices: [{ message: { content: '' }, finish_reason: 'stop' }] }
      }));

      const controller = new AbortController();
      const taskConfig = runner.getTaskConfig('extract');
      const content = await runner.callOpenRouter('p', taskConfig, controller, fetch);
      assert.equal(content, '');
    });

    await it('choices 누락 → 빈 문자열', async () => {
      const runner = makeRunner();
      const fetch = mockFetch(() => ({
        json: { usage: { prompt_tokens: 0, completion_tokens: 0 } }
      }));

      const controller = new AbortController();
      const taskConfig = runner.getTaskConfig('extract');
      const content = await runner.callOpenRouter('p', taskConfig, controller, fetch);
      assert.equal(content, '');
    });

    await it('finish_reason: length 일 때도 content 반환 (잘림 감지는 위층)', async () => {
      const runner = makeRunner();
      const fetch = mockFetch(() => ({
        json: {
          choices: [{ message: { content: '{"items":[{"title":"잘림' }, finish_reason: 'length' }]
        }
      }));

      const controller = new AbortController();
      const taskConfig = runner.getTaskConfig('extract');
      const content = await runner.callOpenRouter('p', taskConfig, controller, fetch);
      assert.includes(content, '잘림');
    });

    await it('200 응답 본문 내 error 필드 → 에러 throw', async () => {
      const runner = makeRunner();
      const fetch = mockFetch(() => ({
        json: { error: { message: 'rate limited', code: 429 } }
      }));

      let caught = null;
      try {
        await runner.callOpenRouter('p', runner.getTaskConfig('extract'), new AbortController(), fetch);
      } catch (e) {
        caught = e;
      }
      assert.ok(caught);
      assert.equal(caught.status, 429);
      assert.includes(caught.message, 'rate limited');
    });
  });

  await describe('callOpenRouter HTTP 에러', async () => {
    await it('429 응답 → status 포함 에러 throw', async () => {
      const runner = makeRunner();
      const fetch = mockFetch(() => ({ ok: false, status: 429, text: 'Rate limited' }));

      let caught = null;
      try {
        await runner.callOpenRouter('p', runner.getTaskConfig('extract'), new AbortController(), fetch);
      } catch (e) {
        caught = e;
      }
      assert.ok(caught);
      assert.equal(caught.status, 429);
      assert.includes(caught.message, '429');
    });

    await it('524 (Cloudflare 타임아웃) → retryable', async () => {
      const runner = makeRunner();
      const fetch = mockFetch(() => ({ ok: false, status: 524, text: 'Origin timeout' }));

      let caught = null;
      try {
        await runner.callOpenRouter('p', runner.getTaskConfig('extract'), new AbortController(), fetch);
      } catch (e) {
        caught = e;
      }
      assert.equal(caught.status, 524);
      assert.equal(runner.isRetryableError(caught), true);
    });

    await it('401 (인증 실패) → not retryable', async () => {
      const runner = makeRunner();
      const fetch = mockFetch(() => ({ ok: false, status: 401, text: 'Unauthorized' }));

      let caught = null;
      try {
        await runner.callOpenRouter('p', runner.getTaskConfig('extract'), new AbortController(), fetch);
      } catch (e) {
        caught = e;
      }
      assert.equal(caught.status, 401);
      assert.equal(runner.isRetryableError(caught), false);
    });
  });

  await describe('callOpenRouter 요청 구조 검증', async () => {
    await it('Authorization Bearer + OpenRouter 헤더 + JSON body 포함', async () => {
      const runner = makeRunner();
      let captured = null;
      const fetch = mockFetch(({ url, options }) => {
        captured = { url, options };
        return { json: { choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] } };
      });

      await runner.callOpenRouter('test prompt', runner.getTaskConfig('extract'), new AbortController(), fetch);

      assert.includes(captured.url, 'openrouter.ai/api/v1/chat/completions');
      assert.equal(captured.options.method, 'POST');
      assert.equal(captured.options.headers['Content-Type'], 'application/json');
      assert.equal(captured.options.headers['Authorization'], 'Bearer test-key');
      assert.ok(captured.options.headers['HTTP-Referer'], 'HTTP-Referer 헤더 존재');
      assert.ok(captured.options.headers['X-Title'], 'X-Title 헤더 존재');

      const body = JSON.parse(captured.options.body);
      assert.equal(body.model, 'test-model');
      assert.equal(body.stream, false);
      assert.equal(body.max_tokens, 16384);
      assert.ok(body.temperature !== undefined);
      assert.deepEqual(body.reasoning, { enabled: false });
      // extract는 기본 json 포맷 → response_format json_object
      assert.deepEqual(body.response_format, { type: 'json_object' });
      assert.equal(body.messages.length, 2);
      assert.equal(body.messages[0].role, 'system');
      assert.equal(body.messages[1].role, 'user');
      assert.equal(body.messages[1].content, 'test prompt');
    });

    await it('AbortSignal 전달됨', async () => {
      const runner = makeRunner();
      const controller = new AbortController();
      let captured = null;
      const fetch = mockFetch(({ options }) => {
        captured = options;
        return { json: { choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] } };
      });

      await runner.callOpenRouter('p', runner.getTaskConfig('extract'), controller, fetch);
      assert.equal(captured.signal, controller.signal);
    });
  });

  await describe('callLLMWithRetry 재시도 + 복구 시나리오', async () => {
    // callOpenRouter를 직접 mock하여 callLLM와 callLLMWithRetry의 동작 검증

    await it('재시도 가능 에러는 지연 후 재시도, 결국 성공', async () => {
      const runner = makeRunner();
      runner.retryDelays = [10, 10, 10];  // 빠른 테스트
      let attempts = 0;

      // callOpenRouter 호출 시 처음 2번은 524, 3번째 성공
      runner.callOpenRouter = async () => {
        attempts++;
        if (attempts < 3) {
          const err = new Error('524 timeout');
          err.status = 524;
          throw err;
        }
        return '{"items":[{"title":"성공"}]}';
      };

      const response = await runner.callLLMWithRetry('p');
      assert.equal(attempts, 3);
      assert.includes(response, '성공');
    });

    await it('빈 응답 감지 시 isEmptyResponse 에러 → 재시도', async () => {
      const runner = makeRunner();
      runner.retryDelays = [10, 10];
      let attempts = 0;

      runner.callOpenRouter = async () => {
        attempts++;
        if (attempts < 2) return '';  // 빈 응답
        return '{"items":[]}';
      };

      const response = await runner.callLLMWithRetry('p');
      assert.equal(attempts, 2);
    });

    await it('not-retryable 에러는 즉시 throw', async () => {
      const runner = makeRunner();
      runner.retryDelays = [10, 10];
      let attempts = 0;

      runner.callOpenRouter = async () => {
        attempts++;
        const err = new Error('401 unauthorized');
        err.status = 401;
        throw err;
      };

      let caught = null;
      try {
        await runner.callLLMWithRetry('p');
      } catch (e) { caught = e; }

      assert.equal(attempts, 1);  // 재시도 안 함
      assert.ok(caught);
    });

    await it('불완전 JSON 응답 → 복구 시도, 성공 시 복구된 JSON 반환', async () => {
      const runner = makeRunner();
      runner.retryDelays = [10];

      // 첫 시도: 불완전 JSON (마지막 } / ] 누락, 단 문자열은 닫힘)
      runner.callOpenRouter = async () => '{"items":[{"title":"a"}';

      const response = await runner.callLLMWithRetry('p');
      // tryRecoverIncompleteJson이 ]와 } 보충
      const parsed = JSON.parse(response);
      assert.ok(parsed.items);
      assert.gte(parsed.items.length, 1);
      assert.equal(parsed.items[0].title, 'a');
    });

    await it('시간 예산 초과 시 throw', async () => {
      const runner = makeRunner();
      runner.retryDelays = [200, 200, 200];

      runner.callOpenRouter = async () => {
        await new Promise(r => setTimeout(r, 50));
        const err = new Error('524 timeout');
        err.status = 524;
        throw err;
      };

      let caught = null;
      try {
        await runner.callLLMWithRetry('p', 100);  // 100ms 예산
      } catch (e) { caught = e; }

      assert.ok(caught);
      assert.includes(caught.message, '시간 예산');
    });
  });

  await describe('통합: callLLM ↔ callOpenRouter 호출 사슬', async () => {
    await it('callLLM가 callOpenRouter 호출하여 content 반환', async () => {
      const runner = makeRunner();
      runner.callOpenRouter = async () => '{"items":[]}';

      const content = await runner.callLLM('test prompt');
      assert.equal(content, '{"items":[]}');
    });

    await it('callLLM가 빈 응답 받으면 isEmptyResponse 에러', async () => {
      const runner = makeRunner();
      runner.callOpenRouter = async () => '';

      let caught = null;
      try {
        await runner.callLLM('p');
      } catch (e) { caught = e; }

      assert.ok(caught);
      assert.equal(caught.isEmptyResponse, true);
    });

    await it('callLLM에서 AbortError → 타임아웃 메시지로 변환', async () => {
      const runner = makeRunner();
      runner.callOpenRouter = async () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      };

      let caught = null;
      try {
        await runner.callLLM('p');
      } catch (e) { caught = e; }

      assert.includes(caught.message, '타임아웃');
    });
  });
};
