/**
 * Agent Runner - OpenRouter LLM API 호출 및 에이전트 실행
 * 현재 모델: upstage/solar-pro (2월까지 무료)
 */

const fs = require('fs');
const path = require('path');

class AgentRunner {
  constructor(apiKey, model = 'upstage/solar-pro', options = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.logDir = options.logDir || 'logs';

    // 토큰 제한 설정 (128K 컨텍스트 - 출력 120K = 입력 8K 여유)
    // 한글 기준 1토큰 ≈ 2-3자, 안전하게 20000자로 제한
    this.maxInputChars = options.maxInputChars || 20000;

    // 토큰 초과 시 텍스트 축소 비율
    this.truncateRatios = [0.8, 0.6, 0.4];

    // 재시도 설정 (7회, 점진적 대기)
    this.retryDelays = [2000, 4000, 6000, 10000, 30000, 60000, 90000];

    // Rate Limit 설정 (분당 20회)
    this.requestCount = 0;
    this.requestWindowStart = Date.now();
    this.maxRequestsPerMinute = 20;
    this.minRequestInterval = 4000; // 요청 간 최소 4초 대기
    this.lastRequestTime = 0;

    // 로그 디렉토리 생성
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * 텍스트 truncate (토큰 초과 방지)
   */
  truncateText(text, maxChars = this.maxInputChars) {
    if (!text || text.length <= maxChars) {
      return text;
    }

    // 마지막 완전한 문장/문단에서 자르기 시도
    const truncated = text.substring(0, maxChars);
    const lastBreak = Math.max(
      truncated.lastIndexOf('\n\n'),
      truncated.lastIndexOf('.\n'),
      truncated.lastIndexOf('. ')
    );

    const cutPoint = lastBreak > maxChars * 0.7 ? lastBreak : maxChars;
    return truncated.substring(0, cutPoint) + '\n\n[... 텍스트가 너무 길어 일부 생략됨 ...]';
  }

  /**
   * 토큰 초과 에러 여부 확인
   */
  isTokenLimitError(error) {
    return error.message?.includes('context length') ||
           error.message?.includes('maximum') && error.message?.includes('tokens');
  }

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

    // 분당 20회 도달 시 남은 시간 대기
    if (this.requestCount >= this.maxRequestsPerMinute) {
      const waitTime = 60000 - (now - this.requestWindowStart) + 1000;
      this.log(`분당 요청 한도 도달, ${Math.ceil(waitTime/1000)}초 대기...`, 'warn');
      await this.sleep(waitTime);
      this.requestCount = 0;
      this.requestWindowStart = Date.now();
    }

    // 최소 요청 간격 유지 (4초)
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await this.sleep(this.minRequestInterval - timeSinceLastRequest);
    }

    this.requestCount++;
    this.lastRequestTime = Date.now();
  }

  /**
   * 에이전트 실행
   */
  async runAgent(agentPath, options = {}) {
    const agentName = path.basename(agentPath, '.md');
    this.log(`\n=== ${agentName} 에이전트 실행 ===`);

    // 토큰 초과 시 재시도를 위한 설정
    let currentMaxChars = options.maxInputChars || this.maxInputChars;
    let truncateAttempt = 0;

    while (truncateAttempt <= this.truncateRatios.length) {
      try {
        // 1. 프롬프트 구성 (현재 maxInputChars로)
        const prompt = await this.buildPrompt(agentPath, {
          ...options,
          maxInputChars: currentMaxChars
        });

        // 2. Solar3 호출
        const response = await this.callSolar3WithRetry(prompt);

        // 3. 응답 검증
        const validated = this.validateResponse(response, options.schema);

        // 4. 결과 저장
        if (options.output) {
          this.saveOutput(validated, options.output);
        }

        this.log(`[완료] ${agentName}`);
        return validated;

      } catch (error) {
        // 토큰 초과 에러인지 확인
        if (this.isTokenLimitError(error) && truncateAttempt < this.truncateRatios.length) {
          const ratio = this.truncateRatios[truncateAttempt];
          currentMaxChars = Math.floor(this.maxInputChars * ratio);
          truncateAttempt++;
          this.log(`토큰 초과, 입력 텍스트 ${Math.round(ratio * 100)}%로 축소 후 재시도 (${truncateAttempt}/${this.truncateRatios.length})`, 'warn');
          continue;
        }

        this.log(`✗ ${agentName} 실패: ${error.message}`, 'error');
        throw error;
      }
    }
  }

  /**
   * 프롬프트 구성
   */
  async buildPrompt(agentPath, options) {
    // Agent 문서 읽기
    const agentContent = fs.readFileSync(agentPath, 'utf8');

    // SKILL 문서 읽기
    let skillsContent = '';
    if (options.skills) {
      for (const skillFile of options.skills) {
        // 여러 경로에서 SKILL 파일 탐색 (절대 경로 사용)
        const projectRoot = path.join(__dirname, '..');
        const possiblePaths = [
          path.join(projectRoot, 'skills', skillFile),
          path.join(projectRoot, 'skills', 'newsletters', skillFile),
          skillFile  // 이미 절대 경로인 경우
        ];

        for (const skillPath of possiblePaths) {
          if (fs.existsSync(skillPath)) {
            skillsContent += '\n\n' + fs.readFileSync(skillPath, 'utf8');
            break;
          }
        }
      }
    }

    // 입력 데이터 읽기
    let inputData = '';
    if (options.inputs) {
      if (typeof options.inputs === 'string') {
        // 파일 경로
        if (fs.existsSync(options.inputs)) {
          const stat = fs.statSync(options.inputs);
          if (stat.isFile()) {
            inputData = fs.readFileSync(options.inputs, 'utf8');
          }
        }
      } else {
        // 직접 전달된 데이터
        inputData = JSON.stringify(options.inputs, null, 2);
      }
    }

    // 토큰 초과 방지를 위한 텍스트 truncate
    const maxChars = options.maxInputChars || this.maxInputChars;
    if (inputData.length > maxChars) {
      const originalLength = inputData.length;
      inputData = this.truncateText(inputData, maxChars);
      this.log(`입력 데이터 truncate: ${originalLength}자 → ${inputData.length}자`, 'warn');
    }

    // 전체 프롬프트 구성
    const prompt = `
당신은 Gmail 뉴스레터 정리 시스템의 에이전트입니다.

# 에이전트 지시사항
${agentContent}

${skillsContent ? `# 사용 가능한 SKILL\n${skillsContent}` : ''}

${inputData ? `# 처리할 데이터\n${inputData}` : ''}

위 지시사항에 따라 작업을 수행하고 결과를 JSON 형식으로 출력하세요.
`.trim();

    return prompt;
  }

  /**
   * Solar3 API 호출 (재시도 포함)
   */
  async callSolar3WithRetry(prompt) {
    // Rate Limit 체크
    await this.checkRateLimit();

    for (let i = 0; i < this.retryDelays.length; i++) {
      try {
        const response = await this.callSolar3(prompt);

        // 불완전 JSON 감지 시 재시도
        if (!this.isJsonComplete(response)) {
          const hasMoreRetries = i < this.retryDelays.length - 1;
          if (hasMoreRetries) {
            const delay = this.retryDelays[i];
            this.log(`불완전 JSON 응답 감지, ${delay/1000}초 후 재시도 (${i + 1}/${this.retryDelays.length})`, 'warn');
            await this.sleep(delay);
            continue;
          }
          throw new Error('불완전한 JSON 응답 (토큰 끊김)');
        }

        return response;
      } catch (error) {
        const isRetryable =
          [429, 408, 500, 502, 503, 504].includes(error.status) ||
          error.name === 'AbortError' ||
          error.message?.includes('timeout') ||
          error.message?.includes('불완전');
        const hasMoreRetries = i < this.retryDelays.length - 1;

        if (isRetryable && hasMoreRetries) {
          const delay = this.retryDelays[i];
          this.log(`에러 ${error.status || error.message}, ${delay/1000}초 후 재시도 (${i + 1}/${this.retryDelays.length})`, 'warn');
          await this.sleep(delay);
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Solar3 API 호출
   */
  async callSolar3(prompt) {
    const fetch = (await import('node-fetch')).default;

    // 청크 처리: 프롬프트가 너무 길면 나눠서 처리 (비정상적 입력만)
    const MAX_CHARS_PER_CHUNK = 30000;
    const chunks = this.splitIntoChunks(prompt, MAX_CHARS_PER_CHUNK);

    if (chunks.length > 1) {
      this.log(`입력이 커서 ${chunks.length}개 청크로 나눠서 처리`, 'info');
      return await this.processChunks(chunks, fetch);
    }

    // 단일 청크 처리
    return await this.callSingleChunk(prompt, fetch);
  }

  /**
   * 입력을 청크로 분할 (섹션 경계 유지)
   */
  splitIntoChunks(prompt, maxChars) {
    // 프롬프트에서 에이전트 지시사항 부분과 데이터 부분 분리
    const dataMarker = '# 처리할 데이터';
    const dataIdx = prompt.indexOf(dataMarker);

    if (dataIdx === -1 || prompt.length <= maxChars) {
      return [prompt];
    }

    const header = prompt.substring(0, dataIdx + dataMarker.length);
    const data = prompt.substring(dataIdx + dataMarker.length);

    // 데이터 부분만 청크로 분할
    const chunks = [];
    const dataMaxChars = maxChars - header.length - 500; // 여유 공간

    // 문단 단위로 분할 (빈 줄 기준)
    const paragraphs = data.split(/\n\n+/);
    let currentChunk = '';

    for (const para of paragraphs) {
      if ((currentChunk + '\n\n' + para).length > dataMaxChars && currentChunk) {
        chunks.push(header + currentChunk);
        currentChunk = para;
      } else {
        currentChunk = currentChunk ? currentChunk + '\n\n' + para : para;
      }
    }

    if (currentChunk) {
      chunks.push(header + currentChunk);
    }

    return chunks.length > 0 ? chunks : [prompt];
  }

  /**
   * 여러 청크 처리 후 결과 병합
   */
  async processChunks(chunks, fetch) {
    const allItems = [];

    for (let i = 0; i < chunks.length; i++) {
      this.log(`  청크 ${i + 1}/${chunks.length} 처리 중...`, 'info');
      try {
        const content = await this.callSingleChunk(chunks[i], fetch);
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.items && Array.isArray(parsed.items)) {
            allItems.push(...parsed.items);
          }
        }
      } catch (error) {
        this.log(`  청크 ${i + 1} 실패: ${error.message}`, 'warn');
        // 실패해도 다른 청크 계속 처리
      }
    }

    // 결과 병합하여 JSON 문자열로 반환
    return JSON.stringify({ items: allItems });
  }

  /**
   * 단일 청크 API 호출
   */
  async callSingleChunk(prompt, fetch) {
    // 타임아웃 설정 (3분 - 추론 모델이라 더 오래 걸림)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000);

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/gmail-manager',
          'X-Title': 'Gmail Manager'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'Output ONLY a valid JSON object. No explanations, no reasoning text, no markdown. Start with { and end with }.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.1,
          max_tokens: 120000  // 대용량 응답 지원 (병합/인사이트 배치 처리)
        })
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Solar3 API Error (${response.status}): ${error}`);
      }

      const data = await response.json();

      if (!data.choices || data.choices.length === 0) {
        console.log('[DEBUG] API Response:', JSON.stringify(data, null, 2));
        throw new Error('API 응답에 choices가 없습니다');
      }

      const content = data.choices[0].message?.content || '';

      // 디버그: 토큰 사용량 출력
      if (data.usage) {
        const reasoning = data.usage.completion_tokens_details?.reasoning_tokens || 0;
        const total = data.usage.completion_tokens || 0;
        if (reasoning > 0) {
          this.log(`  토큰: 추론 ${reasoning}, 출력 ${total - reasoning}`, 'debug');
        }
      }

      if (!content) {
        // 응답이 비어있으면 에러
        const reasoning = data.usage?.completion_tokens_details?.reasoning_tokens || 0;
        throw new Error(`빈 응답 (추론 토큰: ${reasoning}개 사용됨)`);
      }

      return content;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('API 호출 타임아웃 (3분 초과)');
      }
      throw error;
    }
  }

  /**
   * 응답 검증
   */
  validateResponse(response, schema) {
    try {
      // JSON 파싱 시도
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('JSON 형식을 찾을 수 없습니다');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // 스키마 검증 (선택적)
      if (schema && schema.required) {
        for (const field of schema.required) {
          if (!(field in parsed)) {
            throw new Error(`필수 필드 누락: ${field}`);
          }
        }
      }

      return parsed;

    } catch (error) {
      this.log('응답 검증 실패:', 'error');
      this.log(response.substring(0, 500), 'debug');
      throw error;
    }
  }

  /**
   * 결과 저장
   */
  saveOutput(data, outputPath) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    fs.writeFileSync(outputPath, content, 'utf8');

    this.log(`저장: ${outputPath}`);
  }

  /**
   * 로그
   */
  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    console.log(logMessage);

    // 파일에도 저장
    const logFile = path.join(this.logDir, `${this.getToday()}.log`);
    fs.appendFileSync(logFile, logMessage + '\n', 'utf8');
  }

  /**
   * JSON 완전성 검사 (브라켓 균형 검사)
   * @param {string} str - 검사할 문자열
   * @returns {boolean} 완전한 JSON이면 true
   */
  isJsonComplete(str) {
    if (!str || typeof str !== 'string') return false;

    // JSON 부분 추출
    const jsonMatch = str.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return false;

    const jsonStr = jsonMatch[0];

    // 문자열 내부의 브라켓은 무시하고 균형 검사
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
   * 유틸리티
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getToday() {
    return new Date().toISOString().split('T')[0];
  }
}

module.exports = { AgentRunner };
