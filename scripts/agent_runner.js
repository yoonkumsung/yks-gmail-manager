/**
 * Agent Runner - OpenRouter LLM API 호출 및 에이전트 실행
 * 모델: 작업별 다중 모델 + 폴백 전략 (동적 메타데이터 조회)
 *
 * 주요 기능:
 * - OpenRouter API에서 모델 메타데이터 동적 조회 (reasoning 지원, maxTokens 등)
 * - 모델 변경 시 코드 수정 없이 자동 적응
 * - 작업 유형별 자동 모델 선택
 * - Primary 실패 시 Fallback 모델 자동 전환
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
  /**
   * @param {Object} llmConfig - settings.json의 llm 섹션 전체
   * @param {Object} options - 추가 옵션
   */
  constructor(llmConfig = {}, options = {}) {
    this.logDir = options.logDir || 'logs';

    // 프로바이더 설정 (API URL, 키)
    this.providers = {};
    const providerConfigs = llmConfig.providers || {};
    for (const [name, config] of Object.entries(providerConfigs)) {
      this.providers[name] = {
        baseUrl: config.baseUrl,
        apiKey: process.env[config.envKey] || '',
        metadataUrl: config.metadataUrl || null,
        envKey: config.envKey
      };
    }

    // 하위 호환: llmConfig 없이 apiKey 문자열로 호출 시
    if (typeof llmConfig === 'string') {
      this.providers.openrouter = {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: llmConfig,
        metadataUrl: 'https://openrouter.ai/api/v1/models',
        envKey: 'OPENROUTER_API_KEY'
      };
      llmConfig = {};
    }

    // 모델 설정 (provider + model 쌍)
    // settings.json 형식: { provider: "google", model: "gemini-3-flash-preview" }
    // 내부 형식: { primary: "gemini-3-flash-preview", fallback: "...", primaryProvider: "google", fallbackProvider: "openrouter" }
    const modelsConfig = llmConfig.models || {};
    this.modelConfig = {};
    for (const [category, config] of Object.entries(modelsConfig)) {
      if (typeof config === 'string') {
        // 단일 문자열 (vision 등) → 하위 호환
        this.modelConfig[category] = config;
      } else if (config.provider && config.model) {
        // vision 등 단일 모델: { provider, model }
        this.modelConfig[category] = config.model;
        // 프로바이더 매핑 저장
        if (!this._modelProviderMap) this._modelProviderMap = {};
        this._modelProviderMap[config.model] = config.provider;
      } else {
        // primary/fallback 쌍
        this.modelConfig[category] = {
          primary: config.primary?.model || config.primary || null,
          fallback: config.fallback?.model || config.fallback || null
        };
        if (!this._modelProviderMap) this._modelProviderMap = {};
        if (config.primary?.provider) this._modelProviderMap[config.primary.model] = config.primary.provider;
        if (config.fallback?.provider) this._modelProviderMap[config.fallback.model] = config.fallback.provider;
      }
    }
    this._modelProviderMap = this._modelProviderMap || {};

    // 티어 설정 (free/paid)
    this.tier = llmConfig.tier || 'free';
    this.freeLimits = llmConfig.free_limits || { daily_requests: 500, requests_per_minute: 10 };

    // 일일 요청 카운터 (무료 티어용, 프로바이더별 분리)
    this.dailyRequestCounts = {};  // { providerName: count }
    this.dailyCountResetDate = new Date().toDateString();

    // 청크 분할 설정
    this.chunkSize = options.chunkSize || 15000;
    this.maxHeaderSize = options.maxHeaderSize || 5000;

    // 재시도 설정 (7회, 점진적 대기)
    this.retryDelays = [2000, 4000, 6000, 10000, 30000, 60000, 90000];

    // Rate Limit 설정
    this.requestCount = 0;
    this.requestWindowStart = Date.now();
    const rpm = this.tier === 'free' ? (this.freeLimits.requests_per_minute || 10) : 18;
    this.maxRequestsPerMinute = rpm;
    this.minRequestInterval = Math.ceil(60000 / rpm);
    this.lastRequestTime = 0;

    // 모델 메타데이터 캐시
    this.modelMetadataCache = {};

    // 로그 디렉토리 생성
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * 모델 ID로 해당 프로바이더 설정 반환
   * API 키가 없으면 키가 있는 다른 프로바이더로 폴백
   */
  getProviderForModel(model) {
    const providerName = this._modelProviderMap[model];
    if (providerName && this.providers[providerName]) {
      const provider = this.providers[providerName];
      if (provider.apiKey) {
        return { name: providerName, ...provider };
      }
      // 매핑된 프로바이더에 키가 없으면 경고 후 다른 프로바이더로 폴백
      this.log(`[프로바이더] ${providerName}의 API 키 미설정 (${model}), 다른 프로바이더로 폴백`, 'warn');
    }
    // 키가 있는 첫 번째 프로바이더로 폴백
    for (const [name, config] of Object.entries(this.providers)) {
      if (config.apiKey) return { name, ...config };
    }
    this.log(`[프로바이더] 사용 가능한 API 키가 없습니다`, 'error');
    return { name: 'unknown', baseUrl: '', apiKey: '', metadataUrl: null };
  }

  /**
   * 무료 티어 일일 한도 체크 (프로바이더별)
   * @param {string} providerName - 프로바이더명
   * @returns {boolean} 요청 가능 여부
   */
  checkDailyLimit(providerName) {
    if (this.tier !== 'free') return true;

    // 날짜 변경 시 모든 카운터 리셋
    const today = new Date().toDateString();
    if (this.dailyCountResetDate !== today) {
      this.dailyRequestCounts = {};
      this.dailyCountResetDate = today;
    }

    const count = this.dailyRequestCounts[providerName] || 0;
    if (count >= this.freeLimits.daily_requests) {
      this.log(`[무료 티어] ${providerName} 일일 요청 한도 도달 (${this.freeLimits.daily_requests}회)`, 'error');
      return false;
    }
    return true;
  }

  /**
   * 프로바이더별 일일 요청 카운터 증가
   */
  incrementDailyCount(providerName) {
    this.dailyRequestCounts[providerName] = (this.dailyRequestCounts[providerName] || 0) + 1;
  }

  // ============================================
  // 모델 메타데이터 (프로바이더별 동적 조회)
  // ============================================

  /**
   * 사용할 모델들의 메타데이터를 프로바이더 API에서 조회하여 캐시
   * - OpenRouter: /api/v1/models → supported_parameters, max_completion_tokens
   * - Google AI Studio: 메타데이터 API 없음 → 안전한 기본값 사용
   * - 시작 시 1회만 호출, 이후 캐시 사용
   */
  async initModelMetadata() {
    // 사용할 모델 ID를 프로바이더별로 분류
    const modelsByProvider = {};
    for (const category of Object.values(this.modelConfig)) {
      const models = [];
      if (typeof category === 'string') {
        models.push(category);
      } else if (category && typeof category === 'object') {
        if (category.primary) models.push(category.primary);
        if (category.fallback) models.push(category.fallback);
      }
      for (const modelId of models) {
        const providerName = this._modelProviderMap[modelId] || 'openrouter';
        if (!modelsByProvider[providerName]) modelsByProvider[providerName] = new Set();
        modelsByProvider[providerName].add(modelId);
      }
    }

    const fetch = await getFetch();

    // 프로바이더별 메타데이터 조회
    for (const [providerName, modelIds] of Object.entries(modelsByProvider)) {
      const provider = this.providers[providerName];

      // Google AI Studio: 메타데이터 API 없음 → Gemini 기본값 설정
      if (!provider?.metadataUrl) {
        for (const modelId of modelIds) {
          const isVision = modelId.includes('-vl') || modelId.includes('vision');
          // Gemini 모델은 thinking 지원 (gemini-3-flash 등)
          const supportsReasoning = modelId.includes('gemini') && !modelId.includes('lite');
          this.modelMetadataCache[modelId] = {
            supportsReasoning,
            maxTokens: isVision ? 4000 : 8192,
            timeoutMs: supportsReasoning ? 300000 : 180000,
            contextLength: 1000000,  // Gemini 기본 1M
          };
          this.log(`[모델 메타데이터] ${modelId} (${providerName}): reasoning=${supportsReasoning}, maxTokens=8192 (기본값)`, 'info');
        }
        continue;
      }

      // OpenRouter 등: 메타데이터 API로 동적 조회
      try {
        const response = await fetch(provider.metadataUrl, {
          headers: {
            'Authorization': `Bearer ${provider.apiKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          this.log(`[모델 메타데이터] ${providerName} API 조회 실패 (${response.status}), 기본값 사용`, 'warn');
          continue;
        }

        const data = await response.json();
        const models = data.data || [];

        for (const modelId of modelIds) {
          const meta = models.find(m => m.id === modelId);
          if (meta) {
            const supportedParams = meta.supported_parameters || [];
            const supportsReasoning = supportedParams.includes('reasoning');
            const maxCompletionTokens = meta.top_provider?.max_completion_tokens || null;
            const contextLength = meta.context_length || 128000;
            const isVision = modelId.includes('-vl') || modelId.includes('vision') || modelId.includes('nemotron');

            this.modelMetadataCache[modelId] = {
              supportsReasoning,
              maxTokens: isVision ? 4000 : (maxCompletionTokens || 16000),
              timeoutMs: supportsReasoning ? 300000 : (isVision ? 120000 : 180000),
              contextLength,
            };

            this.log(`[모델 메타데이터] ${modelId} (${providerName}): reasoning=${supportsReasoning}, maxTokens=${this.modelMetadataCache[modelId].maxTokens}, context=${contextLength}`, 'info');
          } else {
            this.log(`[모델 메타데이터] ${modelId}: ${providerName} API에서 찾을 수 없음, 기본값 사용`, 'warn');
          }
        }
      } catch (error) {
        this.log(`[모델 메타데이터] ${providerName} 조회 중 오류: ${error.message}, 기본값 사용`, 'warn');
      }
    }

    // 티어 정보 로깅
    this.log(`[티어] ${this.tier} (일일 한도: ${this.tier === 'free' ? this.freeLimits.daily_requests + '회' : '무제한'})`, 'info');
  }

  // ============================================
  // 모델 선택 메서드
  // ============================================

  /**
   * 작업 유형에 따른 모델 쌍 (primary + fallback) 반환
   */
  getModelsForTask(taskType) {
    const reasoningTasks = ['insight', 'crossInsight'];
    const category = reasoningTasks.includes(taskType) ? 'reasoning' : 'extract';
    return this.modelConfig[category] || this.modelConfig.extract;
  }

  /**
   * 모델별 API 요청 설정 반환
   * - initModelMetadata()로 조회된 캐시 우선 사용
   * - 캐시 미스 시 안전한 기본값 반환 (reasoning 비활성화)
   */
  getModelSpecificConfig(model) {
    // 캐시에 있으면 동적 조회 결과 사용
    if (this.modelMetadataCache[model]) {
      return this.modelMetadataCache[model];
    }

    // 캐시 미스: 비전 모델 감지
    if (model.includes('nemotron') || model.includes('vision') || model.includes('-vl')) {
      return {
        supportsReasoning: false,
        timeoutMs: 120000,
        maxTokens: 4000
      };
    }

    // 캐시 미스: 안전한 기본값 (reasoning 비활성화)
    this.log(`[모델 설정] ${model}: 캐시 없음, 기본값 사용 (reasoning=false)`, 'warn');
    return {
      supportsReasoning: false,
      timeoutMs: 180000,
      maxTokens: 16000
    };
  }

  // ============================================
  // 작업 유형별 최적 설정
  // ============================================

  /**
   * 작업 유형별 최적 설정 반환
   * - reasoning 파라미터로 추론량 제어
   * - 전 작업 reasoning low 통일 (추론 최소화 → 출력 토큰에 집중)
   */
  getTaskConfig(taskType) {
    const configs = {
      extract: {
        systemPrompt: `당신은 한국어 뉴스레터 분석 전문가입니다.

[핵심 임무] 뉴스레터 본문에서 모든 뉴스 아이템을 빠짐없이 추출합니다.

[출력 규칙]
- 유효한 JSON만 출력 ({로 시작, }로 끝남)
- 설명, 추론 과정, 마크다운 코드블록 없이 순수 JSON만 출력
- 에이전트 지시사항과 SKILL 규칙에 따라 처리`,
        temperature: 0.1,
        reasoningEffort: 'low',
        tailInstruction: '위 에이전트 지시사항과 SKILL 규칙에 따라 모든 뉴스 아이템을 빠짐없이 추출하고 JSON으로 출력하세요.'
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

[판단 기준]
- 같은 사건/발표/수치 → 병합 (제목이 달라도 내용이 같으면 병합)
- 같은 기업이지만 다른 뉴스 → 분리 유지
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
1. domain: 원문 데이터 기반의 실용적 분석. 원문에 수치가 있으면 활용, 없으면 정성적 분석.
2. cross_domain: 뉴스의 본질과 자연스럽게 연결되는 경우에만 인문/철학적 통찰을 인용.

[중요] 단순 팩트 뉴스(일정 공지, 휴장 안내 등)는 insights를 null로 출력하세요.
[중요] 원문에 없는 수치, 보고서, 논문, 실험을 절대 생성하지 마세요.

[출력 규칙]
- 유효한 JSON만 출력 ({로 시작, }로 끝남)
- 입력된 모든 필드(title, summary, keywords, link, source, message_id, source_email) 그대로 유지
- 설명, 추론 과정, 마크다운 코드블록 없이 순수 JSON만 출력

[금지 표현] "패러다임 전환", "혁신적", "새로운 지평", "가속화할 것", "핵심이 될 것", "시사점을 제공", "중요성을 보여준다"`,
        temperature: 0.3,
        reasoningEffort: 'low',
        tailInstruction: '위 지시사항에 따라 각 아이템에 domain과 cross_domain 인사이트를 추가하고 JSON으로 출력하세요. 단순 팩트 뉴스는 insights를 null로. 모든 기존 필드를 반드시 유지하세요.'
      },
      crossInsight: {
        systemPrompt: `당신은 세계 최고 수준의 경영 전략 컨설턴트이자 인문학 석학입니다.

[핵심 임무] 여러 라벨의 뉴스를 종합 분석하여 메가트렌드, 크로스 연결, 사용자 액션을 도출합니다.

[중요] 자연스러운 연결이 없으면 빈 배열을 출력하세요. 억지 연결 금지.
[중요] 원문에 없는 수치, 보고서를 생성하지 마세요.

[출력 규칙]
- 유효한 JSON만 출력 ({로 시작, }로 끝남)
- mega_trends, cross_connections, action_items 3개 필드 포함 (빈 배열 허용)
- 설명, 추론 과정, 마크다운 코드블록 없이 순수 JSON만 출력

[금지 표현] "패러다임 전환", "혁신적", "새로운 지평", "가속화할 것", "핵심이 될 것", "시사점을 제공", "중요성을 보여준다"`,
        temperature: 0.3,
        reasoningEffort: 'low',
        tailInstruction: '위 지시사항에 따라 메가트렌드, 크로스 연결, 사용자 액션을 생성하고 JSON으로 출력하세요. 자연스러운 연결이 없으면 빈 배열을 출력하세요.'
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
        const response = await this.callLLMWithRetry(prompt, options.maxTimeMs || 0);

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

      // 청크 위치 힌트 추가 (분할 처리 시 문맥 보존)
      let chunkData = chunks[i];
      if (chunks.length > 1) {
        const hint = `[참고: 이 텍스트는 전체 뉴스레터의 ${i + 1}/${chunks.length} 번째 부분입니다. 텍스트 경계에서 잘린 아이템이 있을 수 있으니, 불완전한 아이템은 건너뛰세요.]\n\n`;
        chunkData = hint + chunkData;
      }

      try {
        const result = await this.runSinglePrompt(header, chunkData, {
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
        this.log(`  청크 ${i + 1} 실패: ${error.message}`, 'warn');
        failCount++;
        // 실패해도 다른 청크 계속 처리
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
   * 텍스트를 청크로 분할 (문단 경계 유지)
   */
  splitTextIntoChunks(text, maxCharsPerChunk) {
    if (!text || text.length <= maxCharsPerChunk) {
      return [text];
    }

    const chunks = [];

    // 문단 단위로 분할 (빈 줄 또는 --- 구분자)
    const paragraphs = text.split(/\n\n+|(?=^---+$)/m);
    let currentChunk = '';

    for (const para of paragraphs) {
      const trimmedPara = para.trim();
      if (!trimmedPara) continue;

      const potentialChunk = currentChunk
        ? currentChunk + '\n\n' + trimmedPara
        : trimmedPara;

      if (potentialChunk.length > maxCharsPerChunk) {
        // 현재 청크 저장
        if (currentChunk) {
          chunks.push(currentChunk);
        }

        // 단일 문단이 청크 크기를 초과하면 강제 분할
        if (trimmedPara.length > maxCharsPerChunk) {
          const subChunks = this.forceSplitText(trimmedPara, maxCharsPerChunk);
          chunks.push(...subChunks.slice(0, -1));
          currentChunk = subChunks[subChunks.length - 1];
        } else {
          currentChunk = trimmedPara;
        }
      } else {
        currentChunk = potentialChunk;
      }
    }

    // 마지막 청크 저장
    if (currentChunk) {
      chunks.push(currentChunk);
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

    // 중복 제거 (title 기준)
    const seen = new Set();
    const uniqueItems = items.filter(item => {
      if (!item || !item.title) return true;
      const key = item.title.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { items: uniqueItems };
  }

  // ============================================
  // 프롬프트 구성 메서드
  // ============================================

  /**
   * 프롬프트 헤더 구성 (에이전트 + 스킬)
   */
  async buildHeader(agentPath, options) {
    // Agent 문서 읽기
    if (!fs.existsSync(agentPath)) {
      throw new Error(`에이전트 파일 없음: ${agentPath}`);
    }
    let agentContent = fs.readFileSync(agentPath, 'utf8');

    // 라벨 에이전트인 경우 _공통규칙.md 자동 합성
    const labelsDir = path.join(path.dirname(agentPath));
    const commonRulesPath = path.join(labelsDir, '_공통규칙.md');
    if (agentPath.includes(path.join('agents', 'labels')) && fs.existsSync(commonRulesPath)) {
      const commonRules = fs.readFileSync(commonRulesPath, 'utf8');
      agentContent += '\n\n' + commonRules;
    }

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
   * 무료 티어에서는 개인정보 보호를 위해 프로필을 로드하지 않음
   */
  loadUserContext() {
    // 무료 티어: 개인정보 미사용
    if (this.tier === 'free') {
      return '- 사용자 프로필 미사용 (무료 티어)';
    }

    const profilePath = path.join(__dirname, '..', 'config', 'user_profile.json');
    try {
      const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
      const user = profile.user;
      const occ = user.occupation;
      const interests = user.interests;

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
   * API 호출 (재시도 + 모델 폴백 포함)
   * 1) Primary 모델로 재시도 → 2) 실패 시 Fallback 모델로 재시도
   * @param {string} prompt - 프롬프트
   * @param {number} maxTimeMs - 시간 예산 (ms). 0이면 무제한
   */
  async callLLMWithRetry(prompt, maxTimeMs = 0) {
    const models = this.getModelsForTask(this.currentTaskType);
    const startTime = Date.now();

    // Primary 모델 시도 (타임아웃 시 최대 3회: reasoning 2회 + no-reasoning 1회)
    try {
      this.log(`[Primary] ${models.primary}`, 'info');
      return await this._retryWithModel(prompt, maxTimeMs, models.primary, startTime, { maxTimeoutRetries: 2 });
    } catch (primaryError) {
      const primaryMsg = primaryError.message || '';
      const isTimeoutError = primaryMsg.includes('타임아웃') || primaryMsg.includes('timeout');

      // 타임아웃이면 reasoning 비활성화 후 1회 더 시도
      if (isTimeoutError) {
        this.log(`[Primary 재시도] reasoning 비활성화 후 마지막 시도`, 'warn');
        try {
          return await this._retryWithModel(prompt, maxTimeMs > 0 ? maxTimeMs - (Date.now() - startTime) : 0, models.primary, Date.now(), { disableReasoning: true, maxTimeoutRetries: 1 });
        } catch (noReasoningError) {
          // no-reasoning도 실패 → Fallback으로 진행
          primaryError = noReasoningError;
        }
      }

      // Fallback 모델이 없으면 그대로 throw
      if (!models.fallback) throw primaryError;

      // 일일 한도 초과: 다른 프로바이더의 Fallback으로 즉시 전환
      if (primaryError.isDailyLimitExceeded) {
        const primaryProvider = this._modelProviderMap[models.primary];
        const fallbackProvider = this._modelProviderMap[models.fallback];
        if (primaryProvider === fallbackProvider) {
          this.log(`[Fallback 건너뜀] 같은 프로바이더(${primaryProvider}) 일일 한도 초과`, 'warn');
          throw primaryError;
        }
        this.log(`[Fallback] ${primaryProvider} 일일 한도 초과 → ${fallbackProvider}로 전환`, 'info');
      }

      // 401/403 인증 에러: 같은 프로바이더의 Fallback은 건너뜀 (다른 프로바이더면 시도)
      const primaryStatus = primaryError.status;
      if (primaryStatus === 401 || primaryStatus === 403) {
        const primaryProvider = this._modelProviderMap[models.primary];
        const fallbackProvider = this._modelProviderMap[models.fallback];
        if (primaryProvider === fallbackProvider) {
          this.log(`[Fallback 건너뜀] 같은 프로바이더(${primaryProvider}) 인증 에러(${primaryStatus})`, 'warn');
          throw primaryError;
        }
        this.log(`[Fallback] 다른 프로바이더(${primaryProvider}→${fallbackProvider})로 전환 시도`, 'info');
      }

      // 시간 예산 잔여 확인
      const elapsed = Date.now() - startTime;
      const remaining = maxTimeMs > 0 ? maxTimeMs - elapsed : 0;
      if (maxTimeMs > 0 && remaining < 30000) {
        this.log(`시간 부족 (${Math.round(remaining/1000)}초), 폴백 건너뜀`, 'warn');
        throw primaryError;
      }

      // Fallback 모델 시도
      this.log(`[Fallback] Primary 실패 (${primaryError.message}), ${models.fallback}으로 전환`, 'warn');
      try {
        return await this._retryWithModel(prompt, remaining || 0, models.fallback, Date.now());
      } catch (fallbackError) {
        // 폴백도 실패하면 원본 에러 메시지에 폴백 실패 정보 추가
        throw new Error(`Primary(${models.primary}): ${primaryError.message} → Fallback(${models.fallback}): ${fallbackError.message}`);
      }
    }
  }

  /**
   * 특정 모델로 재시도 루프 실행
   */
  async _retryWithModel(prompt, maxTimeMs, model, startTime, options = {}) {
    let lastError;
    let retryOverrides = { model };
    let bestIncompleteResponse = null;
    const requiredFields = this.getRequiredFieldsForTask(this.currentTaskType);
    const maxTimeoutRetries = options.maxTimeoutRetries || 7;
    let timeoutCount = 0;

    // reasoning 비활성화 옵션
    if (options.disableReasoning) {
      retryOverrides.disableReasoning = true;
    }

    // 폴백 시 재시도 횟수 축소 (3회)
    const isPrimary = model === this.getModelsForTask(this.currentTaskType).primary;
    const delays = isPrimary ? this.retryDelays : this.retryDelays.slice(0, 3);

    for (let i = 0; i < delays.length; i++) {
      // 시간 예산 체크
      if (maxTimeMs > 0 && Date.now() - startTime >= maxTimeMs) {
        this.log(`시간 예산 초과 (${Math.round(maxTimeMs/1000)}초), 복구 시도...`, 'warn');
        const recovered = this.tryRecoverIncompleteJson(bestIncompleteResponse, requiredFields);
        if (recovered) return JSON.stringify(recovered);
        throw new Error(`시간 예산 초과 (${Math.round(maxTimeMs/1000)}초), 복구 실패`);
      }

      try {
        await this.checkRateLimit();

        const response = await this.callLLM(prompt, retryOverrides);

        // 불완전 JSON 감지 시 복구 시도 후 재시도
        if (!this.isJsonComplete(response)) {
          if (!bestIncompleteResponse || response.length > bestIncompleteResponse.length) {
            bestIncompleteResponse = response;
          }

          const recovered = this.tryRecoverIncompleteJson(response, requiredFields);
          if (recovered) {
            this.log(`불완전 JSON 복구 성공`, 'info');
            return JSON.stringify(recovered);
          }

          if (i < delays.length - 1) {
            const delay = delays[i];
            this.log(`불완전 JSON 응답, ${delay/1000}초 후 재시도 (${i + 1}/${delays.length})`, 'warn');
            await this.sleep(delay);
            continue;
          }

          const lastRecover = this.tryRecoverIncompleteJson(bestIncompleteResponse, requiredFields);
          if (lastRecover) {
            this.log(`최종 불완전 JSON 복구 성공`, 'info');
            return JSON.stringify(lastRecover);
          }
          throw new Error('불완전한 JSON 응답 (토큰 끊김)');
        }

        return response;

      } catch (error) {
        lastError = error;

        // 일일 한도 초과는 재시도 무의미 → 즉시 throw하여 Fallback 전환
        if (error.isDailyLimitExceeded) {
          this.log(`[${model}] 일일 한도 초과, Fallback 전환`, 'warn');
          throw error;
        }

        const isRetryable = this.isRetryableError(error);
        const hasMoreRetries = i < delays.length - 1;

        // 타임아웃 횟수 추적 → 초과 시 즉시 throw하여 상위에서 처리
        const isTimeout = (error.message || '').includes('타임아웃') || (error.message || '').includes('timeout');
        if (isTimeout) {
          timeoutCount++;
          if (timeoutCount >= maxTimeoutRetries) {
            this.log(`타임아웃 ${timeoutCount}회 도달, 현재 모델 시도 중단`, 'warn');
            throw error;
          }
        }

        if (isRetryable && hasMoreRetries) {
          const delay = delays[i];

          if (error.isEmptyResponse) {
            this.log(`빈 응답 감지, reasoningEffort를 'low'로 낮춰서 재시도 (${i + 1}/${delays.length})`, 'warn');
            await this.sleep(delay);
            retryOverrides = { model, reasoningEffort: 'low', ...(options.disableReasoning && { disableReasoning: true }) };
            continue;
          }

          this.log(`에러 발생, ${delay/1000}초 후 재시도 (${i + 1}/${delays.length}): ${error.message}`, 'warn');
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
      crossInsight: ['mega_trends', 'cross_connections', 'action_items']
    };
    return fieldMap[taskType] || [];
  }

  /**
   * Vision 모델로 이미지에서 텍스트 추출
   * @param {string[]} imageUrls - 이미지 URL 배열
   * @param {string} visionModel - 사용할 vision 모델명
   * @returns {string} 추출된 텍스트
   */
  async callVisionModel(imageUrls, visionModel) {
    const fetch = await getFetch();
    const modelConfig = this.getModelSpecificConfig(visionModel);

    this.log(`Vision API 호출: ${visionModel} (이미지 ${imageUrls.length}개)`, 'info');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), modelConfig.timeoutMs);

    try {
      // 멀티모달 content 배열 구성
      const content = [
        { type: 'text', text: '이 이미지들은 뉴스레터 이메일의 본문입니다. 이미지에 포함된 모든 텍스트를 그대로 추출해주세요. 텍스트만 출력하고, 설명이나 해석은 하지 마세요.' }
      ];

      for (const url of imageUrls.slice(0, 5)) { // 최대 5개 이미지
        content.push({ type: 'image_url', image_url: { url } });
      }

      const requestBody = {
        model: visionModel,
        messages: [
          { role: 'user', content }
        ],
        temperature: 0.1,
        max_tokens: modelConfig.maxTokens
      };

      await this.checkRateLimit();

      // 프로바이더별 API URL 및 헤더 구성
      const provider = this.getProviderForModel(visionModel);
      const headers = {
        'Authorization': `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json'
      };
      if (provider.name === 'openrouter') {
        headers['HTTP-Referer'] = 'https://github.com/yks-gmail-manager';
        headers['X-Title'] = 'Gmail Manager';
      }

      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        clearTimeout(timeoutId);
        throw new Error(`Vision API 오류 ${response.status}: ${errorText.substring(0, 200)}`);
      }

      const data = await response.json();
      clearTimeout(timeoutId);

      const extractedText = data.choices?.[0]?.message?.content || '';
      this.log(`Vision 텍스트 추출 완료: ${extractedText.length}자`, 'info');
      return extractedText;
    } catch (error) {
      clearTimeout(timeoutId);
      this.log(`Vision API 실패: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * API 호출 (단일)
   * @param {string} prompt - 프롬프트
   * @param {object} overrides - 설정 오버라이드 (예: { model, reasoningEffort })
   */
  async callLLM(prompt, overrides = {}) {
    const taskConfig = this.getTaskConfig(this.currentTaskType);
    const model = overrides.model || this.getModelsForTask(this.currentTaskType).primary;
    const modelConfig = this.getModelSpecificConfig(model);
    const reasoningEffort = overrides.reasoningEffort || taskConfig.reasoningEffort;
    const fetch = await getFetch();

    // 프롬프트 크기 로깅
    this.log(`API 호출: ${model} (${prompt.length}자, ${this.currentTaskType}, reasoning: ${modelConfig.supportsReasoning ? reasoningEffort : 'N/A'})`, 'debug');

    // 모델별 타임아웃 설정
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), modelConfig.timeoutMs);

    try {
      // 요청 본문 구성 (모델별 분기)
      const requestBody = {
        model: model,
        messages: [
          { role: 'system', content: taskConfig.systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: taskConfig.temperature,
        max_tokens: modelConfig.maxTokens
      };

      // reasoning 파라미터 추가 (disableReasoning 옵션으로 비활성화 가능)
      if (modelConfig.supportsReasoning && !overrides.disableReasoning) {
        requestBody.reasoning = { effort: reasoningEffort };
        // 모델별 추론 토큰 상한 (GLM 등 추론 폭발 방지)
        if (modelConfig.reasoningMaxTokens) {
          requestBody.reasoning.max_tokens = modelConfig.reasoningMaxTokens;
        }
      }

      // 프로바이더별 API URL 및 헤더 구성
      const provider = this.getProviderForModel(model);
      const headers = {
        'Authorization': `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json'
      };
      // OpenRouter 전용 헤더
      if (provider.name === 'openrouter') {
        headers['HTTP-Referer'] = 'https://github.com/yks-gmail-manager';
        headers['X-Title'] = 'Gmail Manager';
      }

      // 무료 티어 일일 한도 체크 (프로바이더별)
      if (!this.checkDailyLimit(provider.name)) {
        clearTimeout(timeoutId);
        const error = new Error(`무료 티어 일일 요청 한도 초과 [${provider.name}] (${this.freeLimits.daily_requests}회)`);
        error.isDailyLimitExceeded = true;
        error.providerName = provider.name;
        throw error;
      }
      this.incrementDailyCount(provider.name);

      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers,
        body: JSON.stringify(requestBody)
      });

      // 타임아웃을 여기서 해제하지 않음! body 수신 완료까지 유지
      this.log(`API 응답 헤더 수신: ${model} (${provider.name}, 상태 ${response.status})`, 'debug');

      if (!response.ok) {
        const errorText = await response.text();
        clearTimeout(timeoutId);
        const error = new Error(`API Error (${response.status}) [${model}]: ${errorText}`);
        error.status = response.status;
        throw error;
      }

      // body 수신도 타임아웃 범위 내에서 완료되어야 함
      const data = await response.json();
      clearTimeout(timeoutId);

      if (!data.choices || data.choices.length === 0) {
        throw new Error(`API 응답에 choices가 없습니다 [${model}]`);
      }

      const content = data.choices[0].message?.content || '';

      // 디버그: 토큰 사용량 출력
      if (data.usage) {
        const reasoning = data.usage.completion_tokens_details?.reasoning_tokens || 0;
        const total = data.usage.completion_tokens || 0;
        const input = data.usage.prompt_tokens || 0;
        this.log(`  토큰 [${model}]: 입력 ${input}, 추론 ${reasoning}, 출력 ${total - reasoning}`, 'debug');
      }

      if (!content) {
        const reasoning = data.usage?.completion_tokens_details?.reasoning_tokens || 0;
        const error = new Error(`빈 응답 [${model}] (추론 토큰: ${reasoning}개 사용됨)`);
        error.isEmptyResponse = true;
        throw error;
      }

      return content;

    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        const timeoutSec = Math.round(modelConfig.timeoutMs / 1000);
        throw new Error(`API 타임아웃 [${model}] (${timeoutSec}초 초과)`);
      }
      throw error;
    }
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
      [429, 408, 500, 502, 503, 504].includes(status) ||
      error.name === 'AbortError' ||
      msg.includes('timeout') ||
      msg.includes('타임아웃') ||
      msg.includes('ECONNRESET') ||
      msg.includes('ETIMEDOUT') ||
      msg.includes('불완전') ||
      msg.includes('빈 응답') ||
      msg.includes('Invalid response body') ||
      msg.includes('network') ||
      msg.includes('ECONNREFUSED')
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
        const items = [firstItem, ...rest.match(/"-[^"]*"/g).map(s => s.slice(1, -1))];
        return `"${key}": [${items.map(i => `"${i}"`).join(', ')}]`;
      }
    );

    // 5. 문자열 값 내 제어 문자 이스케이프 (이미 이스케이프된 것은 제외)
    repaired = repaired.replace(/"[^"]*"/g, (match) => {
      return match
        .replace(/(?<!\\)\n/g, '\\n')
        .replace(/(?<!\\)\r/g, '\\r')
        .replace(/(?<!\\)\t/g, '\\t');
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
