/**
 * E2E 시나리오 테스트 — 전체 파이프라인 엣지 케이스
 *
 * 테스트 시나리오:
 * 1. 빈 입력 / 매우 큰 입력 처리
 * 2. 뉴스레터 구조 무결성 (SKILL ↔ newsletters.json ↔ agents)
 * 3. 청킹 → 추출 → 중복제거 → 병합 파이프라인 시뮬레이션
 * 4. 에러 복구 시나리오
 * 5. 설정 파일 정합성
 * 6. 금지 표현 / 할루시네이션 방지 규칙 검증
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');

module.exports = async function () {

  // ============================================
  // 설정 파일 정합성 검증
  // ============================================

  await describe('설정 파일 정합성', async () => {
    let newsletters, labels;

    await it('newsletters.json 파싱 가능', () => {
      const data = JSON.parse(
        fs.readFileSync(path.join(PROJECT_ROOT, 'config', 'newsletters.json'), 'utf8')
      );
      newsletters = data.newsletters;
      assert.ok(Array.isArray(newsletters));
      assert.gt(newsletters.length, 0);
    });

    await it('labels.json 파싱 가능', () => {
      const data = JSON.parse(
        fs.readFileSync(path.join(PROJECT_ROOT, 'config', 'labels.json'), 'utf8')
      );
      labels = data.labels;
      assert.ok(Array.isArray(labels));
      assert.gt(labels.length, 0);
    });

    await it('모든 뉴스레터 라벨이 labels.json에 존재', () => {
      const validLabels = new Set(labels.map(l => l.name));
      const invalidLabels = [];
      for (const nl of newsletters) {
        for (const label of (nl.labels || [])) {
          if (!validLabels.has(label)) {
            invalidLabels.push(`${nl.id}: "${label}"`);
          }
        }
      }
      assert.lengthOf(invalidLabels, 0,
        `labels.json에 없는 라벨: ${invalidLabels.join(', ')}`);
    });

    await it('모든 뉴스레터 ID가 유니크', () => {
      const ids = newsletters.map(nl => nl.id);
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      assert.lengthOf(dupes, 0, `중복 ID: ${dupes.join(', ')}`);
    });

    await it('모든 skill_file 경로가 Unix 형식', () => {
      const windowsPaths = newsletters
        .filter(nl => nl.skill_file && nl.skill_file.includes('\\'))
        .map(nl => `${nl.id}: ${nl.skill_file}`);
      assert.lengthOf(windowsPaths, 0,
        `Windows 경로 발견: ${windowsPaths.join(', ')}`);
    });

    await it('활성 라벨에 에이전트 파일 존재', () => {
      const missing = [];
      for (const label of labels) {
        if (!label.enabled) continue;
        if (label.agent) {
          const agentPath = path.join(PROJECT_ROOT, label.agent);
          if (!fs.existsSync(agentPath)) {
            missing.push(`${label.name}: ${label.agent}`);
          }
        }
      }
      assert.lengthOf(missing, 0,
        `누락된 에이전트 파일: ${missing.join(', ')}`);
    });

    await it('모든 활성 뉴스레터의 SKILL 파일 존재', () => {
      const missing = [];
      for (const nl of newsletters) {
        if (!nl.skill_generated || !nl.skill_file) continue;
        const skillPath = path.join(PROJECT_ROOT, nl.skill_file);
        if (!fs.existsSync(skillPath)) {
          missing.push(`${nl.id}: ${nl.skill_file}`);
        }
      }
      assert.lengthOf(missing, 0,
        `누락된 SKILL 파일: ${missing.join(', ')}`);
    });

    await it('SKILL 파일 내 발신자가 newsletters.json과 일치', () => {
      const mismatches = [];
      for (const nl of newsletters) {
        if (!nl.skill_generated || !nl.skill_file) continue;
        const skillPath = path.join(PROJECT_ROOT, nl.skill_file);
        if (!fs.existsSync(skillPath)) continue;

        const content = fs.readFileSync(skillPath, 'utf8');
        if (!content.includes(nl.sender)) {
          mismatches.push(`${nl.id}: sender="${nl.sender}" not in SKILL`);
        }
      }
      assert.lengthOf(mismatches, 0,
        `발신자 불일치: ${mismatches.slice(0, 5).join('; ')}`);
    });

    await it('settings.json 유효', () => {
      const settingsPath = path.join(PROJECT_ROOT, 'config', 'settings.json');
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        assert.ok(settings);
      }
    });
  });

  // ============================================
  // SKILL 파일 품질 검증
  // ============================================

  await describe('SKILL 파일 품질', async () => {
    const skillDir = path.join(PROJECT_ROOT, 'skills', 'newsletters');
    const skillFiles = fs.existsSync(skillDir)
      ? fs.readdirSync(skillDir).filter(f => f.startsWith('SKILL_') && f.endsWith('.md'))
      : [];

    await it('SKILL 파일 존재', () => {
      assert.gt(skillFiles.length, 0, 'SKILL 파일이 하나도 없음');
    });

    await it('모든 SKILL 파일에 필수 메타데이터 존재', () => {
      const missingMeta = [];
      const requiredFields = ['이름', '발신자', '유형', '언어'];

      for (const file of skillFiles) {
        const content = fs.readFileSync(path.join(skillDir, file), 'utf8');
        for (const field of requiredFields) {
          if (!content.includes(field)) {
            missingMeta.push(`${file}: "${field}" 누락`);
          }
        }
      }
      assert.lengthOf(missingMeta, 0,
        `메타데이터 누락: ${missingMeta.slice(0, 10).join('; ')}`);
    });

    await it('모든 SKILL 파일에 추출 규칙 섹션 존재', () => {
      const missing = [];
      for (const file of skillFiles) {
        const content = fs.readFileSync(path.join(skillDir, file), 'utf8');
        const hasRules = content.includes('아이템 경계') ||
                         content.includes('추출 규칙') ||
                         content.includes('구조');
        if (!hasRules) {
          missing.push(file);
        }
      }
      // 약간의 변형은 허용
      assert.lte(missing.length, 3,
        `추출 규칙 없는 SKILL: ${missing.join(', ')}`);
    });

    await it('SKILL 파일 크기 적정 (100자 이상)', () => {
      const tooSmall = [];
      for (const file of skillFiles) {
        const content = fs.readFileSync(path.join(skillDir, file), 'utf8');
        if (content.length < 100) {
          tooSmall.push(`${file} (${content.length}자)`);
        }
      }
      assert.lengthOf(tooSmall, 0,
        `너무 작은 SKILL 파일: ${tooSmall.join(', ')}`);
    });
  });

  // ============================================
  // 에이전트 문서 품질 검증
  // ============================================

  await describe('에이전트 문서 품질', async () => {
    const agentDir = path.join(PROJECT_ROOT, 'agents');

    await it('핵심 에이전트 문서 존재', () => {
      const coreAgents = ['뉴스레터분석.md', '라벨요약.md', '병합.md', '인사이트.md', '크로스인사이트.md'];
      const missing = coreAgents.filter(a => !fs.existsSync(path.join(agentDir, a)));
      assert.lengthOf(missing, 0,
        `누락된 핵심 에이전트: ${missing.join(', ')}`);
    });

    await it('공통규칙 파일 존재', () => {
      assert.ok(
        fs.existsSync(path.join(agentDir, 'labels', '_공통규칙.md')),
        '_공통규칙.md 파일 없음'
      );
    });

    await it('인사이트 에이전트에 금지 표현 목록 존재', () => {
      const insightPath = path.join(agentDir, '인사이트.md');
      const content = fs.readFileSync(insightPath, 'utf8');
      const bannedPhrases = ['패러다임 전환', '혁신적', '새로운 지평'];
      for (const phrase of bannedPhrases) {
        assert.includes(content, phrase,
          `인사이트 에이전트에 금지 표현 "${phrase}" 명시 필요`);
      }
    });

    await it('병합 에이전트에 분리 우선 원칙 명시', () => {
      const mergePath = path.join(agentDir, '병합.md');
      const content = fs.readFileSync(mergePath, 'utf8');
      assert.ok(
        content.includes('분리') && content.includes('유지'),
        '병합 에이전트에 "분리 유지" 원칙 필요'
      );
    });

    await it('라벨 에이전트에 필수 규칙 포함', () => {
      const labelAgentDir = path.join(agentDir, 'labels');
      const agentFiles = fs.readdirSync(labelAgentDir)
        .filter(f => f.endsWith('.md') && !f.startsWith('_'));

      const missingRules = [];
      for (const file of agentFiles) {
        const content = fs.readFileSync(path.join(labelAgentDir, file), 'utf8');
        if (!content.includes('빠짐없이') && !content.includes('누락')) {
          missingRules.push(`${file}: 누락 방지 규칙 없음`);
        }
      }
      assert.lengthOf(missingRules, 0,
        `규칙 누락: ${missingRules.join('; ')}`);
    });
  });

  // ============================================
  // 파이프라인 시뮬레이션
  // ============================================

  await describe('파이프라인 시뮬레이션', async () => {
    const { AgentRunner } = require('../scripts/agent_runner');
    const {
      _test: { findMergeCandidates, clusterItemsByKeyword, validateOutputQuality }
    } = require('../scripts/orchestrator');

    await it('추출 → 중복제거 → 병합 후보 → 검증 플로우', () => {
      // 여러 뉴스레터에서 추출된 아이템 시뮬레이션
      const extractedItems = [
        { title: '삼성전자 1분기 영업이익 10조원', summary: 'A'.repeat(400), keywords: ['삼성전자', '실적', '반도체'], source_email: 'a@a.com' },
        { title: '삼성전자 1분기 실적 발표', summary: 'B'.repeat(350), keywords: ['삼성전자', '실적', '영업이익'], source_email: 'b@b.com' },
        { title: 'NVIDIA RTX 5090 출시', summary: 'C'.repeat(400), keywords: ['NVIDIA', 'GPU', 'RTX'], source_email: 'c@c.com' },
        { title: 'LG화학 미국 배터리 공장', summary: 'D'.repeat(400), keywords: ['LG화학', '배터리', '전기차'], source_email: 'd@d.com' },
        { title: 'NVIDIA 시가총액 3조달러', summary: 'E'.repeat(400), keywords: ['NVIDIA', '시가총액', 'GPU'], source_email: 'e@e.com' },
      ];

      // 1. 병합 후보 탐색
      const candidates = findMergeCandidates(extractedItems);
      // 삼성 2개, NVIDIA 2개가 후보여야 함
      assert.ok(candidates.size > 0, '병합 후보가 존재해야 함');

      // 2. 클러스터링
      const clusters = clusterItemsByKeyword(extractedItems, 0.2);
      assert.gte(clusters.length, 2, '최소 2개 이상 클러스터 (삼성, NVIDIA, LG)');

      // 3. 품질 검증
      const originalConsoleWarn = console.warn;
      const originalConsoleLog = console.log;
      console.warn = () => {};
      console.log = () => {};
      const issues = validateOutputQuality(extractedItems, 'IT');
      console.warn = originalConsoleWarn;
      console.log = originalConsoleLog;
      // 모든 아이템이 300자 이상이므로 이슈 없어야 함
      assert.lengthOf(issues, 0, '품질 이슈 없어야 함');
    });

    await it('빈 입력 파이프라인', () => {
      const candidates = findMergeCandidates([]);
      assert.equal(candidates.size, 0);

      const clusters = clusterItemsByKeyword([]);
      assert.lengthOf(clusters, 0);
    });

    await it('단일 아이템 파이프라인', () => {
      const items = [
        { title: '단독 뉴스', keywords: ['뉴스'], source_email: 'a@a.com' }
      ];
      const candidates = findMergeCandidates(items);
      assert.equal(candidates.size, 0, '단일 아이템은 병합 후보 없음');

      const clusters = clusterItemsByKeyword(items);
      assert.lengthOf(clusters, 1);
    });

    await it('대량 아이템 성능 (100개)', () => {
      const items = [];
      for (let i = 0; i < 100; i++) {
        items.push({
          title: `뉴스 ${i}`,
          keywords: [`키워드${i % 10}`, `분야${i % 5}`],
          source_email: `sender${i % 20}@example.com`
        });
      }
      const start = Date.now();
      const candidates = findMergeCandidates(items);
      const clusters = clusterItemsByKeyword(items);
      const elapsed = Date.now() - start;

      assert.lt(elapsed, 5000, `100개 아이템 처리가 5초 이내여야 함 (${elapsed}ms)`);
      assert.gt(clusters.length, 0);
    });
  });

  // ============================================
  // JSON 복구 스트레스 테스트
  // ============================================

  await describe('JSON 복구 스트레스 테스트', async () => {
    const { AgentRunner } = require('../scripts/agent_runner');
    const runner = new AgentRunner('test', 'test', { logDir: path.join(PROJECT_ROOT, 'logs') });
    runner.log = () => {};

    const realWorldBrokenJsons = [
      // LLM이 실제로 생성하는 패턴들
      `{"items": [{"title": "뉴스1", "summary": "요약1", "keywords": ["AI", "ML"]},
{"title": "뉴스2", "summary": "요약이 중간에 잘린`,  // 토큰 한도에서 잘림

      `\`\`\`json
{"items": [{"title": "코드블록 안의 JSON", "summary": "test"}]}
\`\`\``,  // 마크다운 코드블록

      `Let me analyze this newsletter.

{"items": [{"title": "앞에 설명이 있는 JSON", "summary": "test", "keywords": ["k"]}]}

I hope this helps!`,  // 앞뒤 설명 포함

      `{"items":[{"title":"공백없는JSON","summary":"요약","keywords":["a","b"]}]}`,  // 공백 없는 JSON

      `{
  items: [
    {
      title: "따옴표 없는 키",
      summary: "요약 내용",
      keywords: ['작은따옴표', '사용']
    }
  ]
}`,  // 따옴표 없는 키 + 작은따옴표
    ];

    for (let i = 0; i < realWorldBrokenJsons.length; i++) {
      await it(`실전 패턴 ${i + 1} 복구`, () => {
        try {
          const result = runner.validateResponse(realWorldBrokenJsons[i]);
          assert.ok(result, '복구된 결과가 있어야 함');
        } catch (e) {
          // 첫 번째 (잘린 JSON)는 실패할 수 있음
          if (i === 0) {
            // 잘린 JSON은 복구 실패 가능 → extractFirstJson으로 부분 추출 시도
            const extracted = runner.extractFirstJson(realWorldBrokenJsons[i]);
            assert.ok(extracted, '최소한 JSON 부분 추출은 가능해야 함');
          } else {
            throw e; // 나머지는 통과해야 함
          }
        }
      });
    }
  });

  // ============================================
  // HTML 변환 엣지 케이스
  // ============================================

  await describe('HTML 변환 엣지 케이스', async () => {
    const { htmlToText, cleanNewsletterText, isNonNewsEmail } = require('../scripts/html_to_text');

    await it('깊은 중첩 HTML', () => {
      let html = '';
      for (let i = 0; i < 50; i++) html += '<div>';
      html += '<p>깊은 중첩 내용</p>';
      for (let i = 0; i < 50; i++) html += '</div>';

      const result = htmlToText(html);
      assert.includes(result, '깊은 중첩 내용');
    });

    await it('매우 큰 HTML (100KB)', () => {
      const html = '<p>' + '뉴스 콘텐츠. '.repeat(10000) + '</p>';
      const start = Date.now();
      const result = htmlToText(html);
      const elapsed = Date.now() - start;

      assert.gt(result.length, 0);
      assert.lt(elapsed, 10000, `100KB HTML 변환이 10초 이내여야 함 (${elapsed}ms)`);
    });

    await it('깨진 HTML 태그', () => {
      const html = '<p>시작<strong>중간</p>잘못된 닫기</strong>';
      const result = htmlToText(html);
      assert.ok(result.length > 0, '깨진 HTML도 크래시 없이 처리');
    });

    await it('빈 테이블', () => {
      const html = '<table></table>';
      const result = htmlToText(html);
      assert.type(result, 'string');
    });

    await it('이모지가 포함된 HTML', () => {
      const html = '<p>📌 주요뉴스</p><p>🔥 트렌드</p>';
      const result = htmlToText(html);
      assert.includes(result, '📌');
      assert.includes(result, '🔥');
    });

    await it('한중일 문자 혼합', () => {
      const html = '<p>한국어 日本語 中文 Mixed Content</p>';
      const result = htmlToText(html);
      assert.includes(result, '한국어');
      assert.includes(result, '日本語');
      assert.includes(result, '中文');
    });
  });

  // ============================================
  // 비뉴스 필터링 엣지 케이스
  // ============================================

  await describe('비뉴스 필터링 정밀도', async () => {
    const { isNonNewsEmail } = require('../scripts/html_to_text');

    // False Positive 방지 — 뉴스인데 걸러지면 안 되는 것들
    const shouldPassAsNews = [
      '삼성전자, 비밀번호 관리 앱 출시',  // "비밀번호"가 포함되지만 뉴스
      'AI Survey Results: Industry Trends',  // "Survey"가 포함되지만 결과 기사
      '오늘의 감사 경제 뉴스',  // "감사"가 포함되지만 뉴스
      'Special Report: Market Analysis',  // "Special"이 포함
      'Password Manager Market Growing',  // "Password"가 포함
      '결제 시장 트렌드 분석',  // "결제"가 포함
    ];

    for (const subject of shouldPassAsNews) {
      await it(`뉴스로 통과해야 함: "${subject}"`, () => {
        const { isNonNews } = isNonNewsEmail(subject, 'news@example.com');
        assert.notOk(isNonNews, `"${subject}"는 뉴스로 통과해야 함`);
      });
    }

    // True Positive — 비뉴스로 걸러져야 하는 것들
    const shouldFilterAsNonNews = [
      '(광고) 주간 할인 행사',
      'Confirm your email address',
      '비밀번호 재설정 링크',
      '결제 완료 영수증',
      '설문 참여 부탁드립니다',
    ];

    for (const subject of shouldFilterAsNonNews) {
      await it(`비뉴스로 필터링해야 함: "${subject}"`, () => {
        const { isNonNews } = isNonNewsEmail(subject, 'noreply@example.com');
        assert.ok(isNonNews, `"${subject}"는 필터링되어야 함`);
      });
    }
  });

  // ============================================
  // 프롬프트 품질 검증
  // ============================================

  await describe('프롬프트 품질 검증', async () => {
    const { AgentRunner } = require('../scripts/agent_runner');
    const runner = new AgentRunner('test', 'test', { logDir: path.join(PROJECT_ROOT, 'logs') });
    runner.log = () => {};

    await it('추출/인사이트 taskType에 할루시네이션 방지 포함', () => {
      // merge는 중복 탐지 전용이므로 제외
      const types = ['extract', 'insight'];
      for (const type of types) {
        const config = runner.getTaskConfig(type);
        const prompt = config.systemPrompt;
        assert.ok(
          prompt.includes('금지') || prompt.includes('절대'),
          `${type}: 금지 규칙이 시스템 프롬프트에 포함되어야 함`
        );
      }
    });

    await it('extract 프롬프트에 누락 방지 규칙 포함', () => {
      const config = runner.getTaskConfig('extract');
      assert.includes(config.systemPrompt, '빠짐없이');
      assert.includes(config.systemPrompt, '자기검증');
    });

    await it('모든 프롬프트에 JSON 출력 지시 포함', () => {
      const types = ['extract', 'analyze', 'merge', 'summarize', 'insight', 'crossInsight'];
      for (const type of types) {
        const config = runner.getTaskConfig(type);
        assert.includes(config.systemPrompt, 'JSON',
          `${type}: JSON 출력 지시 필요`);
      }
    });
  });
};
