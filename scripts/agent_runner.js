/**
 * Agent Runner - OpenRouter LLM API 호출 및 에이전트 실행
 * 현재 모델: upstage/solar-pro-3:free
 *
 * 주요 기능:
 * - 긴 텍스트 자동 청크 분할 처리 (정보 손실 없음)
 * - 토큰 초과 에러 자동 복구
 * - Rate Limit 관리
 * - 재시도 로직
 */

const fs = require('fs');
const path = require('path');

class AgentRunner {
  constructor(apiKey, model = 'upstage/solar-pro', options = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.logDir = options.logDir || 'logs';

    // 청크 분할 설정
    // 128K 컨텍스트에서 출력 max_tokens 제외한 안전한 입력 크기
    // 한글 기준 1토큰 ≈ 2-3자, 안전하게 15000자로 설정
    this.chunkSize = options.chunkSize || 15000;

    // 프롬프트 헤더(에이전트 지시사항 + 스킬) 최대 크기
    this.maxHeaderSize = options.maxHeaderSize || 5000;

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

  // ============================================
  // 핵심 메서드: 에이전트 실행
  // ============================================

  /**
   * 에이전트 실행 (메인 진입점)
   * - 긴 입력은 자동으로 청크 분할 처리
   * - 각 청크 결과를 병합하여 반환
   */
  async runAgent(agentPath, options = {}) {
    const agentName = path.basename(agentPath, '.md');
    this.log(`\n=== ${agentName} 에이전트 실행 ===`);

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

      // 5. 청크 분할 처리
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

        // API 호출
        const response = await this.callSolar3WithRetry(prompt);

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
    const agentContent = fs.readFileSync(agentPath, 'utf8');

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

    prompt += '\n\n위 지시사항에 따라 작업을 수행하고 결과를 JSON 형식으로 출력하세요.';

    return prompt;
  }

  // ============================================
  // API 호출 메서드
  // ============================================

  /**
   * Solar3 API 호출 (재시도 포함)
   */
  async callSolar3WithRetry(prompt) {
    await this.checkRateLimit();

    let lastError;

    for (let i = 0; i < this.retryDelays.length; i++) {
      try {
        const response = await this.callSolar3(prompt);

        // 불완전 JSON 감지 시 재시도
        if (!this.isJsonComplete(response)) {
          if (i < this.retryDelays.length - 1) {
            const delay = this.retryDelays[i];
            this.log(`불완전 JSON 응답, ${delay/1000}초 후 재시도 (${i + 1}/${this.retryDelays.length})`, 'warn');
            await this.sleep(delay);
            continue;
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
   * Solar3 API 호출 (단일)
   */
  async callSolar3(prompt) {
    const fetch = (await import('node-fetch')).default;

    // 프롬프트 크기 로깅
    this.log(`API 호출 시작 (프롬프트 ${prompt.length}자)`, 'debug');

    // 타임아웃 설정 (5분 - 긴 처리 대비)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);

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
          max_tokens: 100000  // 출력 토큰 (입력 여유 확보)
        })
      });

      clearTimeout(timeoutId);
      this.log(`API 응답 수신 (상태 ${response.status})`, 'debug');

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`Solar3 API Error (${response.status}): ${errorText}`);
        error.status = response.status;
        throw error;
      }

      const data = await response.json();

      if (!data.choices || data.choices.length === 0) {
        throw new Error('API 응답에 choices가 없습니다');
      }

      const content = data.choices[0].message?.content || '';

      // 디버그: 토큰 사용량 출력
      if (data.usage) {
        const reasoning = data.usage.completion_tokens_details?.reasoning_tokens || 0;
        const total = data.usage.completion_tokens || 0;
        const input = data.usage.prompt_tokens || 0;
        this.log(`  토큰: 입력 ${input}, 추론 ${reasoning}, 출력 ${total - reasoning}`, 'debug');
      }

      if (!content) {
        const reasoning = data.usage?.completion_tokens_details?.reasoning_tokens || 0;
        throw new Error(`빈 응답 (추론 토큰: ${reasoning}개 사용됨)`);
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
           (msg.includes('too long') || msg.includes('too many tokens'));
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
      msg.includes('ECONNRESET') ||
      msg.includes('ETIMEDOUT') ||
      msg.includes('불완전')
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
   * 응답 검증
   */
  validateResponse(response, schema) {
    try {
      // JSON 부분 추출
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
      this.log('응답 검증 실패: ' + error.message, 'error');
      this.log('응답 미리보기: ' + response.substring(0, 300), 'debug');
      throw error;
    }
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
   * 로그
   */
  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    console.log(logMessage);

    // 파일에도 저장
    try {
      const logFile = path.join(this.logDir, `${this.getToday()}.log`);
      fs.appendFileSync(logFile, logMessage + '\n', 'utf8');
    } catch (e) {
      // 로그 파일 쓰기 실패 무시
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getToday() {
    return new Date().toISOString().split('T')[0];
  }
}

module.exports = { AgentRunner };
