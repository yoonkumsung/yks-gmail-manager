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
    this.retries = options.retries || 3;
    this.retryDelay = options.retryDelay || 2000;

    // 로그 디렉토리 생성
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * 에이전트 실행
   */
  async runAgent(agentPath, options = {}) {
    const agentName = path.basename(agentPath, '.md');
    this.log(`\n=== ${agentName} 에이전트 실행 ===`);

    try {
      // 1. 프롬프트 구성
      const prompt = await this.buildPrompt(agentPath, options);

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
      this.log(`✗ ${agentName} 실패: ${error.message}`, 'error');
      throw error;
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
        // 여러 경로에서 SKILL 파일 탐색
        const possiblePaths = [
          path.join('skills', skillFile),
          path.join('skills', 'newsletters', skillFile),
          skillFile  // 절대 경로인 경우
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
    for (let i = 0; i < this.retries; i++) {
      try {
        const response = await this.callSolar3(prompt);
        return response;
      } catch (error) {
        if (error.status === 429 && i < this.retries - 1) {
          // Rate Limit - 재시도
          this.log(`Rate Limit 도달, ${this.retryDelay}ms 후 재시도 (${i + 1}/${this.retries})`, 'warn');
          await this.sleep(this.retryDelay * (i + 1));
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

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
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
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,  // 구조화된 출력에 적합한 낮은 temperature
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Solar3 API Error (${response.status}): ${error}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    return content;
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
