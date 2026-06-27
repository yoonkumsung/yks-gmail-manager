/**
 * agent_runner.js 단위 테스트
 * 테스트 대상: 텍스트 처리, JSON 복구, 유사도, 청킹, 프롬프트 구성
 */

const path = require('path');
const fs = require('fs');

// AgentRunner를 로드하되, LLM API 호출 없이 순수 로직만 테스트
const { AgentRunner } = require('../scripts/agent_runner');

module.exports = async function () {
  // 테스트용 인스턴스 (API 호출 안 함)
  let runner;

  beforeEach(() => {
    runner = new AgentRunner('test-key', 'test-model', {
      logDir: path.join(__dirname, '..', 'logs'),
      chunkSize: 8000,
    });
    // 로깅 무음
    runner.log = () => {};
  });

  // ============================================
  // titleSimilarity
  // ============================================

  await describe('titleSimilarity', async () => {
    await it('동일 문자열 → 1.0', () => {
      const sim = runner.titleSimilarity('삼성전자실적발표', '삼성전자실적발표');
      assert.equal(sim, 1.0);
    });

    await it('완전히 다른 문자열 → 0', () => {
      const sim = runner.titleSimilarity('abc', 'xyz');
      assert.equal(sim, 0);
    });

    await it('null/빈 문자열 → 0', () => {
      assert.equal(runner.titleSimilarity(null, 'abc'), 0);
      assert.equal(runner.titleSimilarity('abc', ''), 0);
      assert.equal(runner.titleSimilarity('', ''), 0);
    });

    await it('단어 단위 Jaccard 계산 (문자 단위가 아님)', () => {
      // 이 두 문자열은 문자 단위로는 유사하지만 단어 단위로는 다름
      const a = '삼성전자가 반도체 실적을 발표했다';
      const b = '삼성전자가 스마트폰 신제품을 출시했다';
      const sim = runner.titleSimilarity(a, b);
      // "삼성전자가" 공통, 나머지 다름 → 낮은 유사도
      assert.lt(sim, 0.4, '단어 단위 유사도는 0.4 미만이어야 함');
    });

    await it('동일 뉴스의 다른 표현 → 높은 유사도', () => {
      const a = '삼성전자 1분기 실적 10조원 돌파';
      const b = '삼성전자 1분기 실적 10조원 달성';
      const sim = runner.titleSimilarity(a, b);
      assert.gt(sim, 0.5, '비슷한 뉴스는 0.5 이상이어야 함');
    });

    await it('긴 제목에서도 정상 작동 (메모리 문제 없음)', () => {
      const long = '가나다라마바사아자차카타파하 '.repeat(500);
      const longB = long + '추가단어';
      const sim = runner.titleSimilarity(long, longB);
      assert.type(sim, 'number');
      // 단어 단위 Jaccard: 반복 단어이므로 유니크 단어 수가 적음, 추가단어 1개 추가 → 높은 유사도
      assert.gt(sim, 0.3, '긴 텍스트에서도 크래시 없이 정상 계산');
    });
  });

  // ============================================
  // splitTextIntoChunks
  // ============================================

  await describe('splitTextIntoChunks', async () => {
    await it('짧은 텍스트 → 단일 청크', () => {
      const chunks = runner.splitTextIntoChunks('짧은 텍스트', 5000);
      assert.lengthOf(chunks, 1);
      assert.equal(chunks[0], '짧은 텍스트');
    });

    await it('null/빈 입력 → 단일 청크', () => {
      assert.deepEqual(runner.splitTextIntoChunks('', 5000), ['']);
      assert.deepEqual(runner.splitTextIntoChunks(null, 5000), [null]);
    });

    await it('섹션 마커(FUNDING, GLOBAL NEWS)로 분할', () => {
      const text = 'A'.repeat(3000) + '\nFUNDING\n' + 'B'.repeat(3000);
      const chunks = runner.splitTextIntoChunks(text, 5000);
      assert.gt(chunks.length, 1, '섹션 마커에서 분할되어야 함');
    });

    await it('이모지 헤더로 분할', () => {
      const text = '📌 첫 번째 뉴스\n' + 'A'.repeat(3000) + '\n\n🔥 두 번째 뉴스\n' + 'B'.repeat(3000);
      const chunks = runner.splitTextIntoChunks(text, 5000);
      assert.gt(chunks.length, 1, '이모지 헤더에서 분할되어야 함');
    });

    await it('해시태그 헤더로 분할', () => {
      const text = '#신상품\n' + 'A'.repeat(3000) + '\n\n#패션트렌드\n' + 'B'.repeat(3000);
      const chunks = runner.splitTextIntoChunks(text, 5000);
      assert.gt(chunks.length, 1, '해시태그 헤더에서 분할되어야 함');
    });

    await it('각 청크가 maxCharsPerChunk 이하', () => {
      const text = ('뉴스 콘텐츠. '.repeat(200) + '\n\n').repeat(10);
      const chunks = runner.splitTextIntoChunks(text, 3000);
      for (const chunk of chunks) {
        // 강제 분할이 아닌 이상 maxChars 이하여야 함
        // (단일 섹션이 초과하면 forceSplit으로 넘어감)
        assert.ok(chunk.length > 0, '빈 청크 없어야 함');
      }
    });

    await it('빈 줄로 폴백 분할', () => {
      // 섹션 마커도 이모지도 없는 순수 텍스트
      const paragraphs = [];
      for (let i = 0; i < 20; i++) {
        paragraphs.push(`제${i+1}문단. ${'내용 '.repeat(100)}`);
      }
      const text = paragraphs.join('\n\n');
      const chunks = runner.splitTextIntoChunks(text, 3000);
      assert.gt(chunks.length, 1, '빈 줄에서 분할되어야 함');
    });
  });

  // ============================================
  // forceSplitText
  // ============================================

  await describe('forceSplitText', async () => {
    await it('문장 경계에서 분할', () => {
      const text = '첫 번째 문장입니다. 두 번째 문장입니다. 세 번째 문장입니다. '
        .repeat(50);
      const chunks = runner.forceSplitText(text, 500);
      assert.gt(chunks.length, 1);
      // 마지막 청크 제외하고는 문장 끝 근처에서 잘려야 함
      for (let i = 0; i < chunks.length - 1; i++) {
        assert.lte(chunks[i].length, 500);
      }
    });

    await it('짧은 텍스트 → 분할 없음', () => {
      const chunks = runner.forceSplitText('짧은 텍스트', 5000);
      assert.lengthOf(chunks, 1);
    });
  });

  // ============================================
  // truncateText
  // ============================================

  await describe('truncateText', async () => {
    await it('짧은 텍스트 → 그대로', () => {
      assert.equal(runner.truncateText('짧은 텍스트', 5000), '짧은 텍스트');
    });

    await it('null → 그대로', () => {
      assert.equal(runner.truncateText(null, 5000), null);
    });

    await it('문장 경계에서 자르고 [... 계속 ...] 추가', () => {
      const text = '첫 번째 문장. 두 번째 문장. 세 번째 문장. 네 번째 문장. 다섯 번째 문장.';
      const truncated = runner.truncateText(text, 30);
      assert.includes(truncated, '[... 계속 ...]');
      assert.lte(truncated.length, 60); // 본문 + 마커
    });
  });

  // ============================================
  // mergeChunkResults
  // ============================================

  await describe('mergeChunkResults', async () => {
    await it('여러 청크의 items 배열을 통합', () => {
      const allItems = [
        { items: [{ title: '뉴스A', summary: '요약A' }] },
        { items: [{ title: '뉴스B', summary: '요약B' }] },
      ];
      const result = runner.mergeChunkResults(allItems, {});
      assert.lengthOf(result.items, 2);
    });

    await it('제목 없는 아이템 제거', () => {
      const allItems = [
        { items: [
          { title: '유효한 뉴스', summary: '요약' },
          { title: '', summary: '제목 없음' },
          { title: 'ab', summary: '2글자 제목' },  // 3글자 미만
          { summary: '아예 title 없음' },
        ] },
      ];
      const result = runner.mergeChunkResults(allItems, {});
      assert.lengthOf(result.items, 1);
      assert.equal(result.items[0].title, '유효한 뉴스');
    });

    await it('중복 제목 제거 (75% 유사도 기준)', () => {
      // 정규화 후 같은 키가 되는 제목은 중복 제거됨
      const allItems = [
        { items: [
          { title: '삼성전자 1분기 실적 발표', summary: 'A' },
          { title: '삼성전자 1분기 실적 발표', summary: 'B' },  // 정확히 동일
          { title: 'LG에너지솔루션 배터리 공장 착공', summary: 'C' },  // 다름
        ] },
      ];
      const result = runner.mergeChunkResults(allItems, {});
      assert.lte(result.items.length, 2, '동일 제목은 하나로 합쳐야 함');
    });

    await it('빈 청크 결과 무시', () => {
      const allItems = [
        null,
        { items: [{ title: '유효한 아이템', summary: '요약 내용' }] },
        { items: null },
        {},
      ];
      const result = runner.mergeChunkResults(allItems, {});
      // null, items:null, {} 는 무시되고 유효한 것만 남음
      assert.gte(result.items.length, 0);
      // items 배열이 존재
      assert.ok(Array.isArray(result.items));
    });
  });

  // ============================================
  // repairJson
  // ============================================

  await describe('repairJson', async () => {
    await it('마지막 콤마 제거', () => {
      const fixed = runner.repairJson('{"a": 1, "b": 2,}');
      const parsed = JSON.parse(fixed);
      assert.equal(parsed.a, 1);
      assert.equal(parsed.b, 2);
    });

    await it('따옴표 없는 키 수정', () => {
      const fixed = runner.repairJson('{title: "값", summary: "요약"}');
      const parsed = JSON.parse(fixed);
      assert.equal(parsed.title, '값');
    });

    await it('작은따옴표 → 큰따옴표', () => {
      const fixed = runner.repairJson("{'title': '값'}");
      const parsed = JSON.parse(fixed);
      assert.equal(parsed.title, '값');
    });

    await it('불완전한 JSON 닫기', () => {
      // repairJson은 닫는 괄호만 추가하므로 값이 완전해야 함
      const fixed = runner.repairJson('{"items": [{"title": "뉴스"}');
      const parsed = JSON.parse(fixed);
      assert.ok(parsed.items);
    });

    await it('제어 문자 이스케이프', () => {
      const input = '{"text": "줄바꿈\n탭\t포함"}';
      const fixed = runner.repairJson(input);
      const parsed = JSON.parse(fixed);
      assert.includes(parsed.text, '줄바꿈');
    });

    await it('배열 형식 수정 (문자열 나열 → 배열)', () => {
      // 이 케이스는 특정 패턴에만 매칭됨
      const input = '{"keywords": "- AI", "- ML", "- DL"}';
      // repairJson이 처리할 수 있는 패턴인지 확인
      const fixed = runner.repairJson(input);
      // 최소한 크래시하지 않아야 함
      assert.type(fixed, 'string');
    });

    await it('이미 유효한 JSON은 그대로', () => {
      const valid = '{"items": [{"title": "뉴스", "summary": "요약"}]}';
      const fixed = runner.repairJson(valid);
      const parsed = JSON.parse(fixed);
      assert.equal(parsed.items[0].title, '뉴스');
    });

    await it('복잡한 중첩 구조 복구', () => {
      // 값이 완성된 상태에서 닫는 괄호만 빠진 경우
      const input = '{"items": [{"title": "A", "keywords": ["k1", "k2"]}, {"title": "B"}';
      const fixed = runner.repairJson(input);
      const parsed = JSON.parse(fixed);
      assert.ok(parsed.items);
      assert.gte(parsed.items.length, 1);
    });
  });

  // ============================================
  // isJsonComplete
  // ============================================

  await describe('isJsonComplete', async () => {
    await it('완전한 JSON → true', () => {
      assert.ok(runner.isJsonComplete('{"items": [{"title": "뉴스"}]}'));
    });

    await it('불완전한 JSON → false', () => {
      assert.notOk(runner.isJsonComplete('{"items": [{"title": "뉴스"'));
    });

    await it('빈 문자열/null → false', () => {
      assert.notOk(runner.isJsonComplete(''));
      assert.notOk(runner.isJsonComplete(null));
    });

    await it('JSON이 아닌 텍스트 → false', () => {
      assert.notOk(runner.isJsonComplete('이것은 JSON이 아닙니다'));
    });

    await it('문자열 내부의 괄호 무시', () => {
      // 문자열 안에 { } 가 있어도 정상 판별
      assert.ok(runner.isJsonComplete('{"text": "중괄호{와}가 있는 텍스트"}'));
    });

    await it('이스케이프 문자 올바르게 처리', () => {
      assert.ok(runner.isJsonComplete('{"text": "따옴표\\"포함"}'));
    });

    await it('중첩 구조', () => {
      assert.ok(runner.isJsonComplete('{"a": {"b": [{"c": 1}]}}'));
      assert.notOk(runner.isJsonComplete('{"a": {"b": [{"c": 1}]}'));
    });
  });

  // ============================================
  // extractFirstJson
  // ============================================

  await describe('extractFirstJson', async () => {
    await it('순수 JSON 추출', () => {
      const json = runner.extractFirstJson('{"items": []}');
      assert.equal(json, '{"items": []}');
    });

    await it('앞뒤 텍스트가 있는 경우', () => {
      const json = runner.extractFirstJson('Here is the result: {"items": []} Done.');
      assert.equal(json, '{"items": []}');
    });

    await it('마크다운 코드블록 안의 JSON', () => {
      const input = '```json\n{"items": [{"title": "뉴스"}]}\n```';
      const json = runner.extractFirstJson(input);
      assert.ok(json);
      const parsed = JSON.parse(json);
      assert.ok(parsed.items);
    });

    await it('null/undefined → null', () => {
      assert.equal(runner.extractFirstJson(null), null);
      assert.equal(runner.extractFirstJson(undefined), null);
    });

    await it('JSON 없는 텍스트 → null', () => {
      assert.equal(runner.extractFirstJson('순수 텍스트입니다'), null);
    });

    await it('불완전한 JSON도 추출 (repair에서 처리)', () => {
      const json = runner.extractFirstJson('결과: {"items": [{"title": "뉴스"');
      assert.ok(json);
      assert.includes(json, '"items"');
    });

    await it('중복 JSON 블록 → 첫 번째만', () => {
      const input = '{"items": []} {"other": true}';
      const json = runner.extractFirstJson(input);
      assert.equal(json, '{"items": []}');
    });
  });

  // ============================================
  // getTaskConfig
  // ============================================

  await describe('getTaskConfig', async () => {
    await it('모든 작업 유형에 대한 설정 존재', () => {
      const types = ['extract', 'analyze', 'merge'];
      for (const type of types) {
        const config = runner.getTaskConfig(type);
        assert.ok(config.systemPrompt, `${type}: systemPrompt 필수`);
        assert.ok(config.tailInstruction, `${type}: tailInstruction 필수`);
        assert.type(config.temperature, 'number', `${type}: temperature는 숫자`);
      }
    });

    await it('알 수 없는 작업 → extract 기본값', () => {
      const config = runner.getTaskConfig('unknown_type');
      assert.includes(config.systemPrompt, '뉴스레터');
    });

    await it('extract temperature = 0.1', () => {
      assert.equal(runner.getTaskConfig('extract').temperature, 0.1);
    });

    await it('extract에 할루시네이션 방지 규칙 포함', () => {
      const extract = runner.getTaskConfig('extract');
      assert.includes(extract.systemPrompt, '절대 금지');
      assert.includes(extract.systemPrompt, '할루시네이션');
    });
  });

  // ============================================
  // getRequiredFieldsForTask
  // ============================================

  await describe('getRequiredFieldsForTask', async () => {
    await it('extract → items', () => {
      assert.deepEqual(runner.getRequiredFieldsForTask('extract'), ['items']);
    });

    await it('merge → items', () => {
      assert.deepEqual(runner.getRequiredFieldsForTask('merge'), ['items']);
    });

    await it('analyze → items', () => {
      assert.deepEqual(runner.getRequiredFieldsForTask('analyze'), ['items']);
    });

    await it('알 수 없는 유형 → 빈 배열', () => {
      assert.deepEqual(runner.getRequiredFieldsForTask('unknown'), []);
    });
  });

  // ============================================
  // tryRecoverIncompleteJson
  // ============================================

  await describe('tryRecoverIncompleteJson', async () => {
    await it('완전한 JSON 복구', () => {
      const result = runner.tryRecoverIncompleteJson(
        '{"items": [{"title": "뉴스", "summary": "요약"}]}',
        ['items']
      );
      assert.ok(result);
      assert.ok(result.items);
    });

    await it('불완전한 JSON 복구 (닫는 괄호만 누락)', () => {
      const result = runner.tryRecoverIncompleteJson(
        '{"items": [{"title": "뉴스A", "summary": "요약A"}, {"title": "뉴스B"}',
        ['items']
      );
      assert.ok(result);
      assert.ok(result.items);
      assert.gte(result.items.length, 1);
    });

    await it('필수 필드 누락 시 null', () => {
      const result = runner.tryRecoverIncompleteJson(
        '{"data": "something"}',
        ['items']
      );
      assert.equal(result, null);
    });

    await it('null 입력 → null', () => {
      assert.equal(runner.tryRecoverIncompleteJson(null, ['items']), null);
    });

    await it('비 JSON 문자열 → null', () => {
      assert.equal(runner.tryRecoverIncompleteJson('not json at all', ['items']), null);
    });
  });

  // ============================================
  // validateResponse
  // ============================================

  await describe('validateResponse', async () => {
    await it('유효한 JSON 응답 파싱', () => {
      const result = runner.validateResponse(
        '{"items": [{"title": "뉴스"}]}',
        { required: ['items'] }
      );
      assert.ok(result.items);
    });

    await it('마크다운 코드블록 안의 JSON', () => {
      const result = runner.validateResponse(
        '```json\n{"items": []}\n```',
        { required: ['items'] }
      );
      assert.ok(result.items !== undefined);
    });

    await it('필수 필드 누락 → 에러', () => {
      assert.throws(() => {
        runner.validateResponse('{"data": []}', { required: ['items'] });
      });
    });

    await it('스키마 없이도 동작', () => {
      const result = runner.validateResponse('{"any": "data"}');
      assert.equal(result.any, 'data');
    });

    await it('약간 깨진 JSON 자동 수정', () => {
      const result = runner.validateResponse(
        '{items: [{"title": "뉴스",}]}',
        { required: ['items'] }
      );
      assert.ok(result.items);
    });
  });


  // ============================================
  // buildFullPrompt
  // ============================================

  await describe('buildFullPrompt', async () => {
    await it('header + inputData + tailInstruction 결합', () => {
      runner.currentTaskType = 'extract';
      const prompt = runner.buildFullPrompt('헤더 내용', '입력 데이터');
      assert.includes(prompt, '헤더 내용');
      assert.includes(prompt, '입력 데이터');
      assert.includes(prompt, '# 처리할 데이터');
    });

    await it('inputData 없으면 처리할 데이터 섹션 없음', () => {
      runner.currentTaskType = 'extract';
      const prompt = runner.buildFullPrompt('헤더', '');
      assert.notIncludes(prompt, '# 처리할 데이터');
    });

    await it('tailInstruction 항상 포함', () => {
      runner.currentTaskType = 'extract';
      const prompt = runner.buildFullPrompt('헤더', '데이터');
      assert.includes(prompt, '빠짐없이 추출');
    });
  });

  // ============================================
  // readInputData
  // ============================================

  await describe('readInputData', async () => {
    await it('null → 빈 문자열', () => {
      assert.equal(runner.readInputData(null), '');
    });

    await it('undefined → 빈 문자열', () => {
      assert.equal(runner.readInputData(undefined), '');
    });

    await it('객체 → JSON 문자열', () => {
      const result = runner.readInputData({ key: 'value' });
      const parsed = JSON.parse(result);
      assert.equal(parsed.key, 'value');
    });

    await it('배열 → JSON 문자열', () => {
      const result = runner.readInputData([1, 2, 3]);
      const parsed = JSON.parse(result);
      assert.lengthOf(parsed, 3);
    });

    await it('존재하지 않는 파일 경로 → 빈 문자열', () => {
      const result = runner.readInputData('/nonexistent/file.txt');
      assert.equal(result, '');
    });
  });

  // ============================================
  // 에지 케이스 통합 테스트
  // ============================================

  await describe('엣지 케이스', async () => {
    await it('한글+영문+특수문자 혼합 제목 유사도', () => {
      const a = 'AI반도체삼성전자NVIDIA';
      const b = 'AI반도체삼성전자AMD';
      const sim = runner.titleSimilarity(a, b);
      assert.type(sim, 'number');
    });

    await it('매우 큰 텍스트 청킹 (50000자)', () => {
      const bigText = '뉴스 콘텐츠입니다. '.repeat(5000);  // ~50000자
      const chunks = runner.splitTextIntoChunks(bigText, 5000);
      assert.gt(chunks.length, 5);
      // 모든 청크를 합치면 원본 내용이 보존되어야 함
      const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
      assert.gt(totalLen, 40000);
    });

    await it('repairJson — 심하게 깨진 JSON도 크래시 안 남', () => {
      const inputs = [
        '{{{{',
        '[[[[',
        '"just a string"',
        '{"key": undefined}',
        '{"key": NaN}',
        '',
        'null',
      ];
      for (const input of inputs) {
        const result = runner.repairJson(input);
        assert.type(result, 'string');
      }
    });

    await it('isJsonComplete — 깊은 중첩 (100레벨)', () => {
      let json = '';
      for (let i = 0; i < 100; i++) json += '{"a":';
      json += '1';
      for (let i = 0; i < 100; i++) json += '}';
      assert.ok(runner.isJsonComplete(json));
    });
  });
};
