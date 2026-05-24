/**
 * Agent Runner - Ollama LLM API 호출 및 에이전트 실행
 * 모델: 단계별 다중 모델 사용
 *   - 빠른 모델 (추출/분석): deepseek-v4-flash:cloud
 *   - 추론 모델 (병합/인사이트/크로스인사이트): deepseek-v4-pro:cloud
 *
 * 주요 기능:
 * - Ollama API (OpenAI 호환) 지원
 * - 긴 텍스트 자동 청크 분할 처리 (정보 손실 없음)
 * - 토큰 초과 에러 자동 복구
 * - Rate Limit 관리
 * - 재시도 로직
 */

const fs = require('fs');
const path = require('path');

// node-fetch 캐싱 (모듈 레벨에서 한 번만 로드)
let fetchModule = null;
async function getFetch() {
  if (!fetchModule) {
    fetchModule = (await import('node-fetch')).default;
  }
  return fetchModule;
}

class AgentRunner {
  constructor(apiKey, model = 'deepseek-v4-flash:cloud', options = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.logDir = options.logDir || 'logs';

    // API 프로바이더 (Ollama Cloud 전용)
    this.provider = 'ollama';

    // 청크 분할 설정 - 섹션 기반 적응형 청킹
    // Ollama Cloud: Cloudflare 100초 타임아웃 + 출력 토큰 16K 제한
    // 5K 입력 → 섹션 기반으로 기사 경계를 유지하면서 분할
    // 각 청크에서 추출되는 아이템 수가 적어져 JSON 잘림 방지
    this.chunkSize = options.chunkSize || 5000;
    this.minChunkSize = 2000;  // 최소 청크 크기

    // 프롬프트 헤더(에이전트 지시사항 + 스킬) 최대 크기
    this.maxHeaderSize = options.maxHeaderSize || 5000;

    // 재시도 설정 (7회, 524 타임아웃 대비 긴 대기)
    this.retryDelays = [5000, 10000, 15000, 30000, 45000, 60000, 90000];

    // Rate Limit 설정 (Ollama Pro: 넉넉한 제한)
    this.requestCount = 0;
    this.requestWindowStart = Date.now();
    this.maxRequestsPerMinute = options.maxRequestsPerMinute || 30;
    this.minRequestInterval = options.minRequestInterval || 2000;   // 2초 간격
    this.lastRequestTime = 0;

    // 로그 디렉토리 생성
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  // ============================================
  // 작업 유형별 최적 설정
  // ============================================

  /**
   * 작업 유형별 최적 설정 반환
   * - 추론 모델(R1T Chimera)의 reasoning 파라미터로 추론량 제어
   * - 추출/병합: reasoning low (추론 최소화 → JSON 출력에 토큰 집중)
   * - 인사이트: reasoning medium (적절한 추론 → 깊은 통찰)
   */
  getTaskConfig(taskType) {
    const configs = {
      extract: {
        systemPrompt: `당신은 한국어 뉴스레터 분석 전문가입니다.

[핵심 임무] 뉴스레터 본문에서 모든 뉴스 아이템을 단 하나도 빠짐없이 추출합니다.

[누락 방지 규칙]
- 본문을 처음부터 끝까지 순서대로 읽으며 모든 뉴스 아이템을 추출
- 헤드라인, 간추린 뉴스, 짧은 한 줄 뉴스도 모두 개별 아이템으로 추출
- "=== 원문 기사 전문 ===" 영역이 있으면 원문 내용을 요약에 적극 반영
- 광고/푸터/구독안내만 제외, 나머지는 중요도와 무관하게 전부 추출
- 추출 완료 후 원문과 대조하여 누락 여부 자기검증

[요약 품질 규칙]
- 각 요약에 필수 포함: 핵심사실(WHO+WHAT) + 구체적 수치 + 배경맥락 + 시사점
- 요약은 300~500자, 그 자체로 완결된 정보 제공 (외부 참조 금지)
- 영문 콘텐츠는 자연스러운 한국어로 번역 (고유명사 원어 병기)

[출력 규칙]
- 유효한 JSON만 출력 ({로 시작, }로 끝남)
- 설명, 추론 과정, 마크다운 코드블록 없이 순수 JSON만 출력

[금지 행위 — 최우선 규칙]
- 절대 금지: 본문에 없는 내용 생성 (할루시네이션). 본문에서 직접 확인할 수 없는 수치, 인물, 사실은 절대 추가하지 마시오. 이 규칙은 요약 길이보다 우선함.
- 절대 금지: 다른 청크나 이전 지식에서 가져온 내용 혼합. 현재 입력 텍스트에 있는 내용만 추출.
- 본문에 충분한 내용이 있는 아이템: 요약 300~500자 필수.
- 본문에 제목/한 줄만 있는 아이템 (간추린 뉴스 등): 있는 내용만으로 요약. 100자 미만도 허용. 절대로 내용을 지어내서 늘리지 마시오.
- 뉴스 클리핑/헤드라인 리스트형 뉴스레터: 제목만 있는 경우 제목 자체를 요약으로 사용. 30자 미만도 허용.

[금지 표현 — 이 표현 사용 시 실패 처리]
절대 사용 금지: "원문 참조", "원문에서 확인", "자세한 내용은 링크", "더 알아보기", "기사 참조", "본문 참고", "상세 내용은", "링크를 통해", "확인해 보세요", "확인할 수 있다", "확인 가능하다", "본문에 포함되지 않았으나"
대신: 본문에 정보가 부족하면 있는 내용만 짧게 서술하고 끝내시오. "링크에서 확인" 류의 회피 표현은 절대 사용 금지.`,
        temperature: 0.1,
        reasoningEffort: 'low',
        tailInstruction: '위 에이전트 지시사항과 SKILL 규칙에 따라 모든 뉴스 아이템을 빠짐없이 추출하고 JSON으로 출력하세요. 하나라도 누락하면 안 됩니다. 최우선 규칙: 입력 텍스트에 없는 내용을 절대 지어내지 마시오. 본문이 충분한 아이템은 300자 이상, 제목만 있는 아이템은 있는 내용만 요약하시오.'
      },
      analyze: {
        systemPrompt: `당신은 뉴스레터 구조 분석 전문가입니다.

[핵심 임무] 새로운 뉴스레터의 구조를 분석하고, 동시에 아이템을 추출합니다.

[출력 규칙]
- 유효한 JSON만 출력 ({로 시작, }로 끝남)
- analysis 필드 + items 필드 모두 포함
- items의 모든 내용은 반드시 한국어로 작성
- 설명, 추론 과정, 마크다운 코드블록 없이 순수 JSON만 출력`,
        temperature: 0.1,
        reasoningEffort: 'low',
        tailInstruction: '위 지시사항에 따라 뉴스레터 구조를 분석하고 아이템을 추출하여 JSON으로 출력하세요.'
      },
      merge: {
        systemPrompt: `당신은 뉴스 중복 탐지 전문가입니다.

[핵심 임무] 동일한 사건/발표를 다루는 아이템만 병합합니다.

[병합 규칙]
- 같은 사건/발표/수치 → 병합: 가장 내용이 충실한(summary가 긴) 아이템을 기준으로 삼고, 다른 아이템에만 있는 추가 정보를 기준 아이템의 summary에 합침
- 병합 시 모든 source를 콤마로 연결 (예: "A뉴스레터, B뉴스레터")
- 병합 시 keywords도 합집합으로 통합

[분리 규칙]
- 같은 기업이지만 다른 뉴스 → 분리 유지
- 같은 분야이지만 다른 사건 → 분리 유지
- 애매하면 반드시 분리 유지 (잘못된 병합이 가장 나쁨)

[출력 규칙]
- 유효한 JSON만 출력 ({로 시작, }로 끝남)
- 메타데이터(message_id, source_email) 반드시 보존
- 설명, 추론 과정, 마크다운 코드블록 없이 순수 JSON만 출력`,
        temperature: 0.1,
        reasoningEffort: 'low',
        tailInstruction: '위 지시사항에 따라 중복 아이템을 병합하고 JSON으로 출력하세요.'
      },
      summarize: {
        systemPrompt: `당신은 뉴스 아이템을 주제별로 요약하는 전문가입니다.

[핵심 임무] 라벨 내 뉴스 아이템들을 주제(theme)별로 분류하고 간결하게 요약합니다.

[출력 규칙]
- 유효한 JSON만 출력 ({로 시작, }로 끝남)
- 설명, 추론 과정, 마크다운 코드블록 없이 순수 JSON만 출력`,
        temperature: 0.2,
        reasoningEffort: 'low',
        tailInstruction: '위 지시사항에 따라 뉴스 아이템을 주제별로 분류/요약하고 JSON으로 출력하세요.'
      },
      insight: {
        systemPrompt: `당신은 세계 최고 수준의 경영 전략 컨설턴트이자 인문학 석학입니다.

[핵심 임무] 각 뉴스 아이템에 2가지 인사이트를 추가합니다:
1. domain: 사용자의 사업에 구체적 영향과 액션 제시. 반드시 수치, 비교, 구체적 방법론 포함. (사용자 컨텍스트는 에이전트 지시사항 참고)
2. cross_domain: 실명의 철학자, 구체적 역사적 사건, 실제 심리학 실험명을 인용한 본질적 통찰. 이름/연도/출처를 반드시 명시.

[출력 규칙]
- 유효한 JSON만 출력 ({로 시작, }로 끝남)
- 입력된 모든 필드(title, summary, keywords, link, source, message_id, source_email) 그대로 유지
- 설명, 추론 과정, 마크다운 코드블록 없이 순수 JSON만 출력

[금지 표현] "패러다임 전환", "혁신적", "새로운 지평", "가속화할 것", "핵심이 될 것", "시사점을 제공", "중요성을 보여준다"`,
        temperature: 0.3,
        reasoningEffort: 'medium',
        tailInstruction: '위 지시사항에 따라 각 아이템에 domain과 cross_domain 인사이트를 추가하고 JSON으로 출력하세요. 모든 기존 필드를 반드시 유지하세요.'
      },
      crossInsight: {
        systemPrompt: `당신은 세계 최고 수준의 경영 전략 컨설턴트이자 인문학 석학입니다.

[핵심 임무] 여러 라벨의 뉴스를 종합 분석하여 메가트렌드, 크로스 연결, CEO 액션을 도출합니다.

[출력 규칙]
- 유효한 JSON만 출력 ({로 시작, }로 끝남)
- mega_trends, cross_connections, ceo_actions 3개 필드 필수
- 설명, 추론 과정, 마크다운 코드블록 없이 순수 JSON만 출력

[금지 표현] "패러다임 전환", "혁신적", "새로운 지평", "가속화할 것", "핵심이 될 것", "시사점을 제공", "중요성을 보여준다"`,
        temperature: 0.3,
        reasoningEffort: 'medium',
        tailInstruction: '위 지시사항에 따라 메가트렌드, 크로스 연결, CEO 액션을 생성하고 JSON으로 출력하세요.'
      }
    };
    return configs[taskType] || configs.extract;
  }

  // ============================================
  // 핵심 메서드: 에이전트 실행
  // ============================================

  /**
   * 에이전트 실행 (메인 진입점)
   * - 긴 입력은 자동으로 청크 분할 처리
   * - 각 청크 결과를 병합하여 반환
   */
  async runAgent(agentPath, options = {}) {
    this.currentTaskType = options.taskType || 'extract';
    const agentName = path.basename(agentPath, '.md');
    this.log(`\n=== ${agentName} 에이전트 실행 (${this.currentTaskType}) ===`);

    try {
      // 1. 에이전트/스킬 문서 읽기 (헤더 부분)
      const header = await this.buildHeader(agentPath, options);

      // 2. 입력 데이터 읽기
      const inputData = this.readInputData(options.inputs);

      // 3. 입력 데이터가 없으면 단일 호출
      if (!inputData || inputData.length === 0) {
        this.log(`입력 데이터 없음`, 'debug');
        return await this.runSinglePrompt(header, '', options);
      }

      this.log(`입력 데이터: ${inputData.length}자`, 'debug');

      // 4. 입력 데이터 크기에 따라 청크 분할 여부 결정
      const availableChars = this.chunkSize - Math.min(header.length, this.maxHeaderSize);

      if (inputData.length <= availableChars) {
        // 단일 청크로 처리 가능
        return await this.runSinglePrompt(header, inputData, options);
      }

      // 5. 전체 컨텍스트가 필요한 작업은 청크 분할하지 않음
      //    - analyze: 뉴스레터 구조 분석에 전체 본문 필요
      //    - skipChunking: 크로스 인사이트 등 전체 데이터 간 연결이 필요한 작업
      if (this.currentTaskType === 'analyze' || options.skipChunking) {
        this.log(`전체 컨텍스트 필요, 단일 처리 (${inputData.length}자)`, 'info');
        return await this.runSinglePrompt(header, inputData, options);
      }

      // 6. 청크 분할 처리
      this.log(`입력 데이터가 큼 (${inputData.length}자), 청크 분할 처리`, 'info');
      return await this.runChunkedPrompt(header, inputData, availableChars, options);

    } catch (error) {
      this.log(`✗ ${agentName} 실패: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * 단일 프롬프트 실행 (토큰 초과 시 축소 재시도)
   */
  async runSinglePrompt(header, inputData, options) {
    const truncateRatios = [1.0, 0.8, 0.6, 0.4];

    for (let attempt = 0; attempt < truncateRatios.length; attempt++) {
      try {
        const ratio = truncateRatios[attempt];
        let currentInput = inputData;

        // 첫 시도가 아니면 축소
        if (ratio < 1.0) {
          const maxChars = Math.floor(inputData.length * ratio);
          currentInput = this.truncateText(inputData, maxChars);
          this.log(`토큰 초과로 입력 ${Math.round(ratio * 100)}%로 축소 (${attempt}/${truncateRatios.length - 1})`, 'warn');
        }

        // 프롬프트 구성
        const prompt = this.buildFullPrompt(header, currentInput);

        // API 호출 (시간 예산 전달)
        const response = await this.callSolar3WithRetry(prompt, options.maxTimeMs || 0);

        // 응답 검증
        const validated = this.validateResponse(response, options.schema);

        // 결과 저장
        if (options.output) {
          this.saveOutput(validated, options.output);
        }

        this.log(`[완료]`);
        return validated;

      } catch (error) {
        // 토큰 초과 에러인지 확인
        if (this.isTokenLimitError(error) && attempt < truncateRatios.length - 1) {
          continue; // 다음 축소 비율로 재시도
        }
        throw error;
      }
    }
  }

  /**
   * 청크 분할 처리 (긴 입력을 여러 청크로 나눠서 처리)
   * - 각 청크 결과를 임시 파일에 저장 (안전성 확보)
   * - 최종적으로 병합 후 임시 파일 삭제
   */
  async runChunkedPrompt(header, inputData, chunkSize, options) {
    // 1. 입력 데이터를 청크로 분할
    const chunks = this.splitTextIntoChunks(inputData, chunkSize);
    this.log(`${chunks.length}개 청크로 분할 처리`, 'info');

    // 2. 임시 파일 디렉토리 설정
    const tempDir = options.output
      ? path.dirname(options.output)
      : path.join(this.logDir, 'temp');

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFiles = [];
    let successCount = 0;
    let failCount = 0;

    // 3. 각 청크 처리 및 임시 파일 저장
    for (let i = 0; i < chunks.length; i++) {
      this.log(`  청크 ${i + 1}/${chunks.length} 처리 중...`, 'info');

      const tempFile = path.join(tempDir, `_chunk_${i + 1}_of_${chunks.length}_${Date.now()}.json`);

      try {
        const result = await this.runSinglePrompt(header, chunks[i], {
          ...options,
          output: null // 여기서는 저장하지 않음
        });

        // 임시 파일에 저장
        if (result) {
          fs.writeFileSync(tempFile, JSON.stringify(result, null, 2), 'utf8');
          tempFiles.push(tempFile);
          successCount++;
          this.log(`  청크 ${i + 1} 저장: ${path.basename(tempFile)}`, 'debug');
        }

      } catch (error) {
        // 524 타임아웃 시 청크를 더 작게 쪼개서 재시도
        if (error.status === 524 && chunks[i].length > this.minChunkSize * 2) {
          this.log(`  청크 ${i + 1} 타임아웃, 하위 분할 재시도...`, 'warn');
          const subChunks = this.splitTextIntoChunks(chunks[i], Math.floor(chunks[i].length / 2));
          for (let j = 0; j < subChunks.length; j++) {
            try {
              const subResult = await this.runSinglePrompt(header, subChunks[j], { ...options, output: null });
              if (subResult) {
                const subFile = path.join(tempDir, `_chunk_${i + 1}_sub${j + 1}_${Date.now()}.json`);
                fs.writeFileSync(subFile, JSON.stringify(subResult, null, 2), 'utf8');
                tempFiles.push(subFile);
                successCount++;
              }
            } catch (subError) {
              this.log(`  청크 ${i + 1} 하위 ${j + 1} 실패: ${subError.message}`, 'warn');
              failCount++;
            }
          }
        } else {
          this.log(`  청크 ${i + 1} 실패: ${error.message}`, 'warn');
          failCount++;
        }
      }
    }

    this.log(`청크 처리 완료: 성공 ${successCount}, 실패 ${failCount}`, 'info');

    // 4. 임시 파일들에서 결과 읽어서 병합
    const allItems = [];
    for (const tempFile of tempFiles) {
      try {
        const content = fs.readFileSync(tempFile, 'utf8');
        const data = JSON.parse(content);

        if (data && data.items && Array.isArray(data.items)) {
          allItems.push(...data.items);
        } else if (data && typeof data === 'object') {
          allItems.push(data);
        }
      } catch (error) {
        this.log(`임시 파일 읽기 실패: ${tempFile}`, 'warn');
      }
    }

    // 5. 결과 병합
    const mergedResult = this.mergeChunkResults(allItems, options);

    // 6. 최종 결과 저장
    if (options.output) {
      this.saveOutput(mergedResult, options.output);
    }

    // 7. 임시 파일 삭제
    for (const tempFile of tempFiles) {
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // 삭제 실패 무시
      }
    }

    // 8. 청크 처리 결과가 0건이면 전체 텍스트로 폴백 재시도
    if ((mergedResult.items?.length || 0) === 0 && successCount > 0) {
      this.log(`청크 처리 결과 0건, 전체 텍스트로 폴백 재시도`, 'warn');
      try {
        const fallbackResult = await this.runSinglePrompt(header, inputData, options);
        if (fallbackResult && fallbackResult.items && fallbackResult.items.length > 0) {
          this.log(`[완료] 폴백 성공, 총 ${fallbackResult.items.length}개 아이템 추출`);
          return fallbackResult;
        }
      } catch (fallbackError) {
        this.log(`폴백 재시도 실패: ${fallbackError.message}`, 'warn');
      }
    }

    this.log(`[완료] 총 ${mergedResult.items?.length || 0}개 아이템 추출`);
    return mergedResult;
  }

  // ============================================
  // 텍스트 처리 메서드
  // ============================================

  /**
   * 텍스트를 청크로 분할 (뉴스레터 섹션 경계 우선)
   *
   * 분할 우선순위:
   * 1. 뉴스레터 섹션 마커 (FUNDING, GLOBAL NEWS, Afternoon Must-Reads 등)
   * 2. 이모지 헤더 (🎯, 🛒, 📗 등으로 시작하는 줄)
   * 3. 해시태그 헤더 (#신상, #패션 등)
   * 4. 빈 줄 + --- 구분자 (폴백)
   */
  splitTextIntoChunks(text, maxCharsPerChunk) {
    if (!text || text.length <= maxCharsPerChunk) {
      return [text];
    }

    // 섹션 경계 패턴 (뉴스레터 공통)
    const sectionPattern = /\n(?=(?:FUNDING|GLOBAL NEWS|MORE NEWS|MARKETS|WORLD|NEWS|RECS|QUIZ|Afternoon Must-Reads|Top (?:news|stories)|More top news|In other|Also[,:]|깊게 보는|더하기\+|비욘드 트렌드|주말토리|에디터스 노트))/gi;
    const emojiPattern = /\n+(?=(?:[📌🔥💡⚡🎯✅❗▶🛒🚀📗💡🦄🌎📃💄☀️🍪📘🍎⌚🎤☕🖥️🎬👉■●▸]|#[가-힣a-zA-Z]))/g;

    // 1단계: 섹션 경계로 먼저 나누기
    let sections = text.split(sectionPattern);

    // 섹션이 1개(=경계 없음)면 이모지/해시태그로 나누기
    if (sections.length <= 1) {
      sections = text.split(emojiPattern);
    }

    // 섹션이 여전히 1개면 기존 문단 분할로 폴백
    if (sections.length <= 1) {
      sections = text.split(/\n\n+|(?=^---+$)/m);
    }

    // 2단계: 섹션들을 maxCharsPerChunk 이내로 병합
    const chunks = [];
    let currentChunk = '';

    for (const section of sections) {
      const trimmed = section.trim();
      if (!trimmed) continue;

      const potential = currentChunk
        ? currentChunk + '\n\n' + trimmed
        : trimmed;

      if (potential.length > maxCharsPerChunk) {
        if (currentChunk) {
          chunks.push(currentChunk);
        }

        // 단일 섹션이 청크 크기 초과하면 강제 분할
        if (trimmed.length > maxCharsPerChunk) {
          const subChunks = this.forceSplitText(trimmed, maxCharsPerChunk);
          chunks.push(...subChunks.slice(0, -1));
          currentChunk = subChunks[subChunks.length - 1];
        } else {
          currentChunk = trimmed;
        }
      } else {
        currentChunk = potential;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    if (chunks.length > 1) {
      this.log(`섹션 기반 분할: ${sections.length}개 섹션 → ${chunks.length}개 청크`, 'debug');
    }

    return chunks.length > 0 ? chunks : [text];
  }

  /**
   * 텍스트 강제 분할 (문장 경계 유지 시도)
   */
  forceSplitText(text, maxChars) {
    const chunks = [];
    let remaining = text;

    while (remaining.length > maxChars) {
      let cutPoint = maxChars;

      // 문장 끝에서 자르기 시도 (. ! ? 다음)
      const searchArea = remaining.substring(Math.floor(maxChars * 0.7), maxChars);
      const sentenceEnd = Math.max(
        searchArea.lastIndexOf('. '),
        searchArea.lastIndexOf('.\n'),
        searchArea.lastIndexOf('! '),
        searchArea.lastIndexOf('? ')
      );

      if (sentenceEnd > 0) {
        cutPoint = Math.floor(maxChars * 0.7) + sentenceEnd + 1;
      }

      chunks.push(remaining.substring(0, cutPoint).trim());
      remaining = remaining.substring(cutPoint).trim();
    }

    if (remaining) {
      chunks.push(remaining);
    }

    return chunks;
  }

  /**
   * 텍스트 truncate (문장 경계 유지)
   */
  truncateText(text, maxChars) {
    if (!text || text.length <= maxChars) {
      return text;
    }

    const truncated = text.substring(0, maxChars);

    // 마지막 완전한 문장에서 자르기
    const lastSentence = Math.max(
      truncated.lastIndexOf('.\n'),
      truncated.lastIndexOf('. '),
      truncated.lastIndexOf('!\n'),
      truncated.lastIndexOf('! '),
      truncated.lastIndexOf('?\n'),
      truncated.lastIndexOf('? ')
    );

    const cutPoint = lastSentence > maxChars * 0.5 ? lastSentence + 1 : maxChars;
    return truncated.substring(0, cutPoint).trim() + '\n\n[... 계속 ...]';
  }

  /**
   * 청크 결과 병합
   */
  mergeChunkResults(allItems, options) {
    // items 배열로 통합
    const items = [];

    for (const item of allItems) {
      if (item && item.items && Array.isArray(item.items)) {
        items.push(...item.items);
      } else if (item && typeof item === 'object' && !Array.isArray(item)) {
        items.push(item);
      }
    }

    // 불완전한 아이템 제거 (제목 없는 것만 제거)
    const validItems = items.filter(item => {
      if (!item || !item.title || item.title.length < 3) return false;
      return true;
    });

    // 중복 제거 (title 유사도 기준)
    const seen = new Set();
    const uniqueItems = validItems.filter(item => {
      const key = item.title.toLowerCase().trim().replace(/[^가-힣a-z0-9]/g, '');
      // 60% 이상 겹치는 제목 제거 (청크 경계 중복 방지)
      for (const existing of seen) {
        if (this.titleSimilarity(key, existing) > 0.6) return false;
      }
      seen.add(key);
      return true;
    });

    return { items: uniqueItems };
  }

  /**
   * 제목 유사도 (Jaccard)
   */
  titleSimilarity(a, b) {
    if (!a || !b) return 0;
    // 단어 단위 Jaccard (문자 단위는 긴 제목에서 과도한 유사도 산출)
    const wordsA = new Set(a.split(/[\s,·]+/).filter(w => w.length > 0));
    const wordsB = new Set(b.split(/[\s,·]+/).filter(w => w.length > 0));
    if (wordsA.size === 0 && wordsB.size === 0) return 0;
    const intersection = [...wordsA].filter(x => wordsB.has(x)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    return union === 0 ? 0 : intersection / union;
  }

  // ============================================
  // 프롬프트 구성 메서드
  // ============================================

  /**
   * 프롬프트 헤더 구성 (에이전트 + 스킬)
   */
  async buildHeader(agentPath, options) {
    // Agent 문서 읽기
    let agentContent = fs.readFileSync(agentPath, 'utf8');

    // 사용자 프로필 주입 ({{USER_CONTEXT}} 플레이스홀더 치환)
    if (agentContent.includes('{{USER_CONTEXT}}')) {
      const userContext = this.loadUserContext();
      agentContent = agentContent.replace('{{USER_CONTEXT}}', userContext);
    }

    // 라벨별 우선순위 주제 주입 ({{FOCUS_TOPICS}} 플레이스홀더 치환)
    if (agentContent.includes('{{FOCUS_TOPICS}}')) {
      const focusTopics = this.loadFocusTopics(agentPath);
      agentContent = agentContent.replace('{{FOCUS_TOPICS}}', focusTopics);
    }

    // SKILL 문서 읽기
    let skillsContent = '';
    if (options.skills && Array.isArray(options.skills)) {
      for (const skillFile of options.skills) {
        const skillContent = this.readSkillFile(skillFile);
        if (skillContent) {
          skillsContent += '\n\n' + skillContent;
        }
      }
    }

    // 헤더 구성
    let header = `당신은 Gmail 뉴스레터 정리 시스템의 에이전트입니다.

# 에이전트 지시사항
${agentContent}`;

    if (skillsContent) {
      header += `\n\n# 사용 가능한 SKILL${skillsContent}`;
    }

    return header;
  }

  /**
   * config/user_profile.json에서 사용자 컨텍스트를 읽어 프롬프트용 텍스트로 변환
   */
  loadUserContext() {
    const profilePath = path.join(__dirname, '..', 'config', 'user_profile.json');
    try {
      const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
      const user = profile?.user;
      if (!user?.occupation) {
        this.log('user_profile.json: user 또는 occupation 누락', 'warn');
        return '프로필 정보 없음';
      }
      const occ = user.occupation;
      const interests = user.interests || {};

      let context = `- **직업**: ${occ.title}\n- **상세**: ${occ.description}`;

      if (interests.technical?.length > 0) {
        context += `\n- **기술 관심**: ${interests.technical.join(', ')}`;
      }
      if (interests.business?.length > 0) {
        context += `\n- **비즈니스 관심**: ${interests.business.join(', ')}`;
      }
      if (interests.intellectual?.length > 0) {
        context += `\n- **지적 관심**: ${interests.intellectual.join(', ')}`;
      }

      return context;
    } catch (e) {
      this.log(`user_profile.json 로드 실패: ${e.message}`, 'warn');
      return '- 사용자 프로필 미설정 (config/user_profile.json 참고)';
    }
  }

  /**
   * 에이전트 파일 경로에서 라벨명을 추출하고 labels.json의 focus_topics를 반환
   */
  loadFocusTopics(agentPath) {
    try {
      const labelName = path.basename(agentPath, '.md');
      const labelsPath = path.join(__dirname, '..', 'config', 'labels.json');
      const labelsJson = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
      const labelConfig = labelsJson.labels.find(l => l.name === labelName);

      if (labelConfig && labelConfig.focus_topics && labelConfig.focus_topics.length > 0) {
        return `다음 주제를 우선 추출: ${labelConfig.focus_topics.join(', ')}`;
      }
      return '모든 주요 아이템 추출';
    } catch (e) {
      this.log(`focus_topics 로드 실패: ${e.message}`, 'warn');
      return '모든 주요 아이템 추출';
    }
  }

  /**
   * 스킬 파일 읽기
   */
  readSkillFile(skillFile) {
    const projectRoot = path.join(__dirname, '..');
    const possiblePaths = [
      path.join(projectRoot, 'skills', skillFile),
      path.join(projectRoot, 'skills', 'newsletters', skillFile),
      skillFile  // 이미 절대 경로인 경우
    ];

    for (const skillPath of possiblePaths) {
      try {
        if (fs.existsSync(skillPath)) {
          return fs.readFileSync(skillPath, 'utf8');
        }
      } catch (e) {
        // 무시
      }
    }
    return null;
  }

  /**
   * 입력 데이터 읽기
   */
  readInputData(inputs) {
    if (!inputs) return '';

    if (typeof inputs === 'string') {
      // 파일 경로
      try {
        if (fs.existsSync(inputs)) {
          const stat = fs.statSync(inputs);
          if (stat.isFile()) {
            return fs.readFileSync(inputs, 'utf8');
          }
        }
      } catch (e) {
        this.log(`입력 파일 읽기 실패: ${e.message}`, 'warn');
      }
      return '';
    }

    // 직접 전달된 데이터
    return JSON.stringify(inputs, null, 2);
  }

  /**
   * 전체 프롬프트 구성
   */
  buildFullPrompt(header, inputData) {
    let prompt = header;

    if (inputData) {
      prompt += `\n\n# 처리할 데이터\n${inputData}`;
    }

    const taskConfig = this.getTaskConfig(this.currentTaskType);
    prompt += `\n\n${taskConfig.tailInstruction}`;

    return prompt;
  }

  // ============================================
  // API 호출 메서드
  // ============================================

  /**
   * Solar3 API 호출 (재시도 포함, 시간 예산 + 불완전 JSON 복구)
   * @param {string} prompt - 프롬프트
   * @param {number} maxTimeMs - 시간 예산 (ms). 0이면 무제한
   */
  async callSolar3WithRetry(prompt, maxTimeMs = 0) {
    let lastError;
    let retryOverrides = {};
    let bestIncompleteResponse = null;
    const startTime = Date.now();
    const requiredFields = this.getRequiredFieldsForTask(this.currentTaskType);

    for (let i = 0; i < this.retryDelays.length; i++) {
      // 시간 예산 체크
      if (maxTimeMs > 0 && Date.now() - startTime >= maxTimeMs) {
        this.log(`시간 예산 초과 (${Math.round(maxTimeMs/1000)}초), 복구 시도...`, 'warn');
        const recovered = this.tryRecoverIncompleteJson(bestIncompleteResponse, requiredFields);
        if (recovered) return JSON.stringify(recovered);
        throw new Error(`시간 예산 초과 (${Math.round(maxTimeMs/1000)}초), 복구 실패`);
      }

      try {
        // 매 시도마다 rate limit 체크 (재시도 시에도 준수)
        await this.checkRateLimit();

        const response = await this.callSolar3(prompt, retryOverrides);

        // 불완전 JSON 감지 시 복구 시도 후 재시도
        if (!this.isJsonComplete(response)) {
          // bestIncompleteResponse 갱신 (가장 긴 응답 저장)
          if (!bestIncompleteResponse || response.length > bestIncompleteResponse.length) {
            bestIncompleteResponse = response;
          }

          // 복구 시도: repairJson → parse → 필수 필드 체크
          const recovered = this.tryRecoverIncompleteJson(response, requiredFields);
          if (recovered) {
            this.log(`불완전 JSON 복구 성공`, 'info');
            return JSON.stringify(recovered);
          }

          if (i < this.retryDelays.length - 1) {
            const delay = this.retryDelays[i];
            this.log(`불완전 JSON 응답, 복구 실패, ${delay/1000}초 후 재시도 (${i + 1}/${this.retryDelays.length})`, 'warn');
            await this.sleep(delay);
            continue;
          }

          // 마지막 재시도: bestIncompleteResponse에서 최후 복구 시도
          const lastRecover = this.tryRecoverIncompleteJson(bestIncompleteResponse, requiredFields);
          if (lastRecover) {
            this.log(`최종 불완전 JSON 복구 성공 (bestIncompleteResponse)`, 'info');
            return JSON.stringify(lastRecover);
          }
          throw new Error('불완전한 JSON 응답 (토큰 끊김)');
        }

        return response;

      } catch (error) {
        lastError = error;

        const isRetryable = this.isRetryableError(error);
        const hasMoreRetries = i < this.retryDelays.length - 1;

        if (isRetryable && hasMoreRetries) {
          const delay = this.retryDelays[i];

          // 빈 응답(추론 토큰만 소진)인 경우 reasoningEffort를 낮춰서 재시도
          if (error.isEmptyResponse) {
            this.log(`빈 응답 감지, reasoningEffort를 'low'로 낮춰서 재시도 (${i + 1}/${this.retryDelays.length})`, 'warn');
            await this.sleep(delay);
            retryOverrides = { reasoningEffort: 'low' };
            continue;
          }

          this.log(`에러 발생, ${delay/1000}초 후 재시도 (${i + 1}/${this.retryDelays.length}): ${error.message}`, 'warn');
          await this.sleep(delay);
          continue;
        }

        throw error;
      }
    }

    throw lastError || new Error('알 수 없는 오류');
  }

  /**
   * 불완전 JSON 복구 시도
   * repairJson → JSON.parse → 필수 필드 확인 → 성공 시 파싱 결과 반환
   */
  tryRecoverIncompleteJson(response, requiredFields) {
    if (!response || typeof response !== 'string') return null;

    try {
      const jsonStr = this.extractFirstJson(response);
      if (!jsonStr) return null;

      const repaired = this.repairJson(jsonStr);
      const parsed = JSON.parse(repaired);

      // 필수 필드 확인
      if (requiredFields && requiredFields.length > 0) {
        const hasAllRequired = requiredFields.every(field => field in parsed);
        if (!hasAllRequired) return null;
      }

      return parsed;
    } catch (e) {
      return null;
    }
  }

  /**
   * 태스크별 필수 필드 매핑
   */
  getRequiredFieldsForTask(taskType) {
    const fieldMap = {
      extract: ['items'],
      analyze: ['items'],
      merge: ['items'],
      insight: ['items'],
      summarize: ['label', 'themes'],
      crossInsight: ['mega_trends', 'cross_connections', 'ceo_actions']
    };
    return fieldMap[taskType] || [];
  }

  /**
   * LLM API 호출 (단일) - Ollama Cloud API
   * @param {string} prompt - 프롬프트
   * @param {object} overrides - 설정 오버라이드
   */
  async callSolar3(prompt, overrides = {}) {
    const taskConfig = this.getTaskConfig(this.currentTaskType);
    const fetch = await getFetch();

    // 프롬프트 크기 로깅
    this.log(`API 호출 시작 (프롬프트 ${prompt.length}자, 모델: ${this.model}, 작업: ${this.currentTaskType})`, 'debug');

    // 타임아웃 설정 (5분 - 긴 처리 대비)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);

    try {
      let content;

      content = await this.callOllama(prompt, taskConfig, controller, fetch);

      clearTimeout(timeoutId);

      if (!content) {
        const error = new Error('빈 응답');
        error.isEmptyResponse = true;
        throw error;
      }

      return content;

    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error('API 호출 타임아웃 (5분 초과)');
      }
      throw error;
    }
  }

  /**
   * Ollama Cloud API 호출 (api.ollama.com 네이티브 엔드포인트)
   */
  async callOllama(prompt, taskConfig, controller, fetch) {
    const apiUrl = 'https://api.ollama.com/api/chat';

    const requestBody = {
      model: this.model,
      messages: [
        { role: 'system', content: taskConfig.systemPrompt },
        { role: 'user', content: prompt }
      ],
      stream: false,
      options: {
        temperature: taskConfig.temperature,
        num_predict: 16384   // 출력 토큰 충분히 확보 (잘림 방지)
      }
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    this.log(`API 응답 수신 (상태 ${response.status})`, 'debug');

    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(`Ollama API Error (${response.status}): ${errorText}`);
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    const content = data.message?.content || '';

    // 토큰 부족으로 응답이 잘린 경우 감지
    if (data.done_reason === 'length') {
      this.log(`⚠️ 출력 토큰 부족으로 응답 잘림 (done_reason: length)`, 'warn');
      // 잘린 JSON을 repair 시도 (callSolar3WithRetry에서 처리)
    }

    // 디버그: 토큰 사용량 출력
    if (data.prompt_eval_count || data.eval_count) {
      this.log(`  토큰: 입력 ${data.prompt_eval_count || 0}, 출력 ${data.eval_count || 0}, 소요 ${Math.round((data.total_duration || 0) / 1e9)}초`, 'debug');
    }

    return content;
  }


  // ============================================
  // 에러 처리 메서드
  // ============================================

  /**
   * 토큰 초과 에러 여부 확인
   */
  isTokenLimitError(error) {
    const msg = error.message || '';
    return msg.includes('context length') ||
           (msg.includes('maximum') && msg.includes('tokens')) ||
           msg.includes('too many tokens') ||
           (msg.includes('input') && msg.includes('too long'));
  }

  /**
   * 재시도 가능한 에러 여부 확인
   */
  isRetryableError(error) {
    // 토큰 초과는 재시도하지 않음 (상위에서 축소 후 재시도)
    if (this.isTokenLimitError(error)) {
      return false;
    }

    const status = error.status;
    const msg = error.message || '';

    return (
      [429, 408, 500, 502, 503, 504, 524].includes(status) ||
      error.name === 'AbortError' ||
      msg.includes('timeout') ||
      msg.includes('ECONNRESET') ||
      msg.includes('ETIMEDOUT') ||
      msg.includes('불완전') ||
      msg.includes('빈 응답')
    );
  }

  // ============================================
  // Rate Limit 관리
  // ============================================

  /**
   * Rate Limit 체크 및 대기
   */
  async checkRateLimit() {
    const now = Date.now();

    // 1분 경과 시 카운터 리셋
    if (now - this.requestWindowStart >= 60000) {
      this.requestCount = 0;
      this.requestWindowStart = now;
    }

    // 분당 한도 도달 시 대기
    if (this.requestCount >= this.maxRequestsPerMinute) {
      const waitTime = 60000 - (now - this.requestWindowStart) + 1000;
      this.log(`분당 요청 한도 도달, ${Math.ceil(waitTime/1000)}초 대기...`, 'warn');
      await this.sleep(waitTime);
      this.requestCount = 0;
      this.requestWindowStart = Date.now();
    }

    // 최소 요청 간격 유지
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitMs = this.minRequestInterval - timeSinceLastRequest;
      this.log(`요청 간격 유지: ${Math.ceil(waitMs/1000)}초 대기`, 'debug');
      await this.sleep(waitMs);
    }

    this.requestCount++;
    this.lastRequestTime = Date.now();
  }

  // ============================================
  // 검증 및 저장
  // ============================================

  /**
   * 첫 번째 완전한 JSON 객체 추출 (balanced bracket 기반)
   */
  extractFirstJson(str) {
    if (!str || typeof str !== 'string') return null;

    // JSON 시작 위치 찾기
    const startIdx = str.indexOf('{');
    if (startIdx === -1) return null;

    let braceCount = 0;
    let inString = false;
    let escaped = false;

    for (let i = startIdx; i < str.length; i++) {
      const char = str[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"' && !escaped) {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '{') braceCount++;
      else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          // 첫 번째 완전한 JSON 객체 발견
          return str.substring(startIdx, i + 1);
        }
      }
    }

    // 불완전한 JSON - 전체 반환 (repair에서 처리)
    return str.substring(startIdx);
  }

  /**
   * 응답 검증
   */
  validateResponse(response, schema) {
    try {
      // 첫 번째 완전한 JSON 객체 추출 (중복 JSON 블록 문제 해결)
      let jsonStr = this.extractFirstJson(response);
      if (!jsonStr) {
        throw new Error('JSON 형식을 찾을 수 없습니다');
      }

      // 1차 시도: 원본 파싱
      try {
        const parsed = JSON.parse(jsonStr);
        return this.validateSchema(parsed, schema);
      } catch (firstError) {
        // 2차 시도: JSON 자동 수정 후 파싱
        this.log('JSON 파싱 실패, 자동 수정 시도...', 'warn');
        const repaired = this.repairJson(jsonStr);
        const parsed = JSON.parse(repaired);
        this.log('JSON 자동 수정 성공', 'info');
        return this.validateSchema(parsed, schema);
      }

    } catch (error) {
      this.log('응답 검증 실패: ' + error.message, 'error');
      this.log('응답 미리보기: ' + response.substring(0, 300), 'debug');
      throw error;
    }
  }

  /**
   * 스키마 검증
   */
  validateSchema(parsed, schema) {
    if (schema && schema.required) {
      for (const field of schema.required) {
        if (!(field in parsed)) {
          throw new Error(`필수 필드 누락: ${field}`);
        }
      }
    }
    return parsed;
  }

  /**
   * JSON 자동 수정 (흔한 LLM 오류 패턴 교정)
   */
  repairJson(jsonStr) {
    let repaired = jsonStr;

    // 1. 마지막 콤마 제거 (}, 뒤나 ], 뒤)
    repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

    // 2. 따옴표 없는 키 → 따옴표 추가
    repaired = repaired.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3');

    // 3. 작은따옴표 → 큰따옴표 (문자열 값)
    repaired = repaired.replace(/'([^']*?)'/g, '"$1"');

    // 4. 배열이어야 할 곳에 문자열 나열된 경우 수정
    // "key": "- item1", "- item2" → "key": ["- item1", "- item2"]
    repaired = repaired.replace(
      /"([^"]+)":\s*"(-[^"]*)"((?:\s*,\s*"-[^"]*")+)/g,
      (match, key, firstItem, rest) => {
        const restMatches = rest.match(/"-[^"]*"/g);
        if (!restMatches) return match;
        const items = [firstItem, ...restMatches.map(s => s.slice(1, -1))];
        return `"${key}": [${items.map(i => `"${i}"`).join(', ')}]`;
      }
    );

    // 5. 문자열 값 내 제어 문자 이스케이프
    repaired = repaired.replace(/"[^"]*"/g, (match) => {
      return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    });

    // 6. 불완전한 JSON 닫기 시도 (문자열 내부 무시)
    let braceCount = 0, bracketCount = 0, inStr = false, esc = false;
    for (let i = 0; i < repaired.length; i++) {
      const c = repaired[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{') braceCount++;
      else if (c === '}') braceCount--;
      else if (c === '[') bracketCount++;
      else if (c === ']') bracketCount--;
    }

    // 부족한 닫는 괄호 추가
    for (let i = 0; i < bracketCount; i++) {
      repaired = repaired.trimEnd();
      if (repaired.endsWith(',')) repaired = repaired.slice(0, -1);
      repaired += ']';
    }
    for (let i = 0; i < braceCount; i++) {
      repaired = repaired.trimEnd();
      if (repaired.endsWith(',')) repaired = repaired.slice(0, -1);
      repaired += '}';
    }

    return repaired;
  }

  /**
   * JSON 완전성 검사
   */
  isJsonComplete(str) {
    if (!str || typeof str !== 'string') return false;

    const jsonMatch = str.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return false;

    const jsonStr = jsonMatch[0];

    // 브라켓 균형 검사 (문자열 내부 무시)
    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < jsonStr.length; i++) {
      const char = jsonStr[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '{') braceCount++;
      else if (char === '}') braceCount--;
      else if (char === '[') bracketCount++;
      else if (char === ']') bracketCount--;
    }

    return braceCount === 0 && bracketCount === 0;
  }

  /**
   * 결과 저장
   */
  saveOutput(data, outputPath) {
    try {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      fs.writeFileSync(outputPath, content, 'utf8');

      this.log(`저장: ${outputPath}`);
    } catch (error) {
      this.log(`저장 실패: ${error.message}`, 'error');
      throw error;
    }
  }

  // ============================================
  // 유틸리티
  // ============================================

  /**
   * 로그 (비동기 파일 쓰기)
   */
  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    console.log(logMessage);

    // 파일에도 저장 (비동기, 에러 무시)
    const logFile = path.join(this.logDir, `${this.getToday()}.log`);
    fs.appendFile(logFile, logMessage + '\n', 'utf8', () => {});
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getToday() {
    return new Date().toISOString().split('T')[0];
  }
}

module.exports = { AgentRunner };
