/**
 * 적응형 학습 시스템
 * 새 뉴스레터 자동 감지 및 SKILL 생성
 */

const fs = require('fs');
const path = require('path');

class AdaptiveLearning {
  constructor() {
    this.configDir = path.join(__dirname, '..', 'config');
    this.skillsDir = path.join(__dirname, '..', 'skills', 'newsletters');
    this.catalogPath = path.join(this.configDir, 'newsletters.json');

    // 카탈로그 캐싱
    this._catalogCache = null;
    this._isDirty = false;
  }

  /**
   * 뉴스레터 카탈로그 로드 (캐시 사용)
   */
  loadCatalog() {
    // 캐시 히트 시 파일 읽기 생략
    if (this._catalogCache) {
      return this._catalogCache;
    }

    if (fs.existsSync(this.catalogPath)) {
      this._catalogCache = JSON.parse(fs.readFileSync(this.catalogPath, 'utf8'));
    } else {
      this._catalogCache = { newsletters: [], last_scan: null };
    }
    return this._catalogCache;
  }

  /**
   * 뉴스레터 카탈로그 저장 (메모리만 업데이트, 실제 저장은 flush에서)
   */
  saveCatalog(catalog) {
    catalog.last_scan = new Date().toISOString();
    this._catalogCache = catalog;
    this._isDirty = true;
  }

  /**
   * 캐시된 카탈로그를 파일에 저장 (orchestrator 끝에서 호출)
   */
  flush() {
    if (!this._isDirty || !this._catalogCache) {
      return;
    }

    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    fs.writeFileSync(this.catalogPath, JSON.stringify(this._catalogCache, null, 2), 'utf8');
    this._isDirty = false;
  }

  /**
   * 새 뉴스레터 감지
   * @param {Array} senders - Gmail에서 수집한 발신자 목록 [{email, name, count}]
   * @param {string} label - 라벨 이름
   * @returns {Array} 새로운 뉴스레터 목록
   */
  detectNewNewsletters(senders, label) {
    const catalog = this.loadCatalog();
    const knownEmails = new Set(catalog.newsletters.map(n => n.sender.toLowerCase()));

    const newNewsletters = [];
    for (const sender of senders) {
      const email = sender.email.toLowerCase();
      if (!knownEmails.has(email)) {
        newNewsletters.push({
          email: sender.email,
          name: sender.name || this.extractNameFromEmail(sender.email),
          label,
          count: sender.count || 1,
          detected_at: new Date().toISOString()
        });
      }
    }

    return newNewsletters;
  }

  /**
   * 이메일에서 이름 추출
   */
  extractNameFromEmail(email) {
    // "Name <email@domain.com>" 형식에서 이름 추출
    const match = email.match(/^(.+?)\s*<.+>$/);
    if (match) {
      return match[1].trim().replace(/"/g, '');
    }
    // email만 있는 경우 @ 앞부분 사용
    return email.split('@')[0].replace(/[._-]/g, ' ');
  }

  /**
   * 새 뉴스레터 등록 (SKILL은 나중에 LLM이 분석 후 생성)
   * @param {Object} newsletter - 새 뉴스레터 정보
   */
  async registerNewsletter(newsletter) {
    const catalog = this.loadCatalog();
    const id = this.generateId(newsletter.email);

    // 이미 등록되어 있으면 무시
    if (catalog.newsletters.some(n => n.sender.toLowerCase() === newsletter.email.toLowerCase())) {
      return null;
    }

    // 뉴스레터 정보 생성 (SKILL은 아직 없음)
    const newEntry = {
      id,
      sender: newsletter.email,
      name: newsletter.name,
      labels: [newsletter.label],
      frequency: newsletter.count || 1,
      skill_file: `skills/newsletters/SKILL_${id}.md`,
      encoding: 'utf-8',
      encoding_ok: true,
      structure: {
        type: 'unknown',  // LLM이 분석 후 업데이트
        item_count_avg: null
      },
      detected_at: newsletter.detected_at || new Date().toISOString(),
      skill_generated: false  // SKILL 생성 여부
    };

    // 카탈로그에 추가
    catalog.newsletters.push(newEntry);
    this.saveCatalog(catalog);

    console.log(`  [NEW] ${newsletter.name} <${newsletter.email}> 등록됨 (SKILL 대기)`);

    return newEntry;
  }

  /**
   * LLM 분석 결과로 SKILL 저장
   * @param {string} senderEmail - 발신자 이메일
   * @param {Object} analysis - LLM이 분석한 구조 정보
   */
  saveAnalyzedSkill(senderEmail, analysis) {
    const catalog = this.loadCatalog();
    const newsletter = catalog.newsletters.find(
      n => n.sender.toLowerCase() === senderEmail.toLowerCase()
    );

    if (!newsletter) {
      console.warn(`  뉴스레터를 찾을 수 없음: ${senderEmail}`);
      return false;
    }

    const id = newsletter.id;
    const skillContent = this.buildSkillFromAnalysis(newsletter, analysis);
    this.saveSkill(id, skillContent);

    // 카탈로그 업데이트
    newsletter.skill_generated = true;
    newsletter.structure = {
      type: analysis.structure_type || 'multi-item',
      item_count_avg: analysis.item_count_avg || 5
    };
    this.saveCatalog(catalog);

    console.log(`  [SKILL] ${newsletter.name} 분석 완료 → SKILL_${id}.md`);
    return true;
  }

  /**
   * LLM 분석 결과를 SKILL 문서로 변환
   */
  buildSkillFromAnalysis(newsletter, analysis) {
    const id = newsletter.id;
    const name = newsletter.name;
    const sender = newsletter.sender;
    const dateStr = new Date().toISOString().split('T')[0];

    return `# SKILL_${id}

${name} 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | ${name} |
| 발신자 | ${sender} |
| 유형 | ${analysis.structure_type || 'multi-item'} |
| 언어 | ${analysis.language || 'ko'} |
| 평균 아이템 수 | ${analysis.item_count_avg || '5'}개 |
| 생성일 | ${dateStr} |

---

## 구조 분석

### 뉴스레터 특징
${analysis.characteristics || '- 일반적인 뉴스레터 형식'}

### 아이템 경계
${analysis.item_boundary || '- 제목(h1, h2, strong) 기준으로 구분'}

### 제목 위치
${analysis.title_location || '- 굵은 텍스트 또는 링크 텍스트'}

### 본문 위치
${analysis.body_location || '- 제목 다음 단락'}

### 링크 위치
${analysis.link_location || '- 제목 또는 "자세히 보기" 버튼'}

---

## 추출 규칙

${analysis.extraction_rules || `1. 제목: 핵심 내용을 담은 문장
2. 요약: 300~500자로 핵심 내용 요약
3. 링크: 원문 URL 추출
4. 키워드: 핵심 명사 3~5개`}

---

## 제외 영역

${analysis.exclude_areas || `- 헤더: 로고, 날짜, 네비게이션
- 푸터: 구독 관리, 연락처, 저작권
- 광고: sponsored, 배너 영역`}

---

## 특이사항

${analysis.special_notes || '없음'}
`;
  }

  /**
   * SKILL 생성 여부 확인
   */
  isSkillGenerated(senderEmail) {
    const catalog = this.loadCatalog();
    const newsletter = catalog.newsletters.find(
      n => n.sender.toLowerCase() === senderEmail.toLowerCase()
    );
    return newsletter?.skill_generated === true;
  }

  /**
   * ID 생성 (도메인 우선, 중복 시 도메인_사용자)
   *
   * 규칙:
   * 1. 도메인 추출 (일반명 제외)
   * 2. 이미 같은 도메인이 있으면 도메인_사용자 조합
   * 3. 사용자명이 일반명이면 도메인만 사용
   */
  generateId(email) {
    // 이메일 파싱
    const emailClean = email.toLowerCase().trim();
    const parts = emailClean.split('@');
    if (parts.length !== 2) {
      return emailClean.replace(/[^a-z0-9]/g, '_').substring(0, 30);
    }

    const localPart = parts[0];
    const domain = parts[1];

    // 도메인에서 ID 추출 (서브도메인 제외)
    // 예: mail.joinsuperhuman.ai → joinsuperhuman
    // 예: e.scmp.com → scmp
    const domainParts = domain.split('.');
    let mainDomain;
    if (domainParts.length >= 2) {
      // 서브도메인 제외 (mail, e, www, news 등)
      const genericSubdomains = new Set(['mail', 'e', 'www', 'news', 'email', 'newsletter', 'send', 'bounce']);
      if (domainParts.length > 2 && genericSubdomains.has(domainParts[0])) {
        mainDomain = domainParts[1];
      } else {
        mainDomain = domainParts[0];
      }
    } else {
      mainDomain = domainParts[0];
    }
    const domainId = mainDomain.replace(/[^a-z0-9]/g, '_');

    // 일반적인 사용자명 목록 (의미 없는 이름들)
    const genericNames = new Set([
      'noreply', 'no_reply', 'no-reply', 'newsletter', 'newsletters',
      'hello', 'info', 'news', 'support', 'team', 'mail', 'contact',
      'admin', 'help', 'notification', 'notifications', 'updates',
      'digest', 'alert', 'alerts', 'reply', 'mailer', 'sender',
      'marketing', 'sales', 'service', 'customer', 'feedback'
    ]);

    // 사용자명 정리
    const localId = localPart.replace(/[^a-z0-9]/g, '_');
    const isGenericLocal = genericNames.has(localId) || genericNames.has(localPart);

    // 이미 같은 도메인의 스킬이 있는지 확인
    const existingIds = this.getExistingIds();
    const domainExists = existingIds.has(domainId);

    // ID 결정
    let id;
    if (!domainExists) {
      // 도메인이 처음이면 도메인만 사용
      id = domainId;
    } else if (isGenericLocal) {
      // 도메인 중복 + 일반명이면 도메인_숫자
      let counter = 2;
      while (existingIds.has(`${domainId}_${counter}`)) {
        counter++;
      }
      id = `${domainId}_${counter}`;
    } else {
      // 도메인 중복 + 고유 사용자명이면 도메인_사용자
      id = `${domainId}_${localId}`;
    }

    return id.substring(0, 40);
  }

  /**
   * 기존 ID 목록 조회
   */
  getExistingIds() {
    const catalog = this.loadCatalog();
    return new Set(catalog.newsletters.map(n => n.id));
  }

  /**
   * SKILL 파일 저장
   */
  saveSkill(id, content) {
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
    }
    const skillPath = path.join(this.skillsDir, `SKILL_${id}.md`);
    fs.writeFileSync(skillPath, content, 'utf8');
  }

  /**
   * 새 뉴스레터 처리 (메인 함수)
   * @param {Object} fetchResult - fetch_gmail.js의 결과
   * @param {string} label - 라벨 이름
   * @returns {Object} 처리 결과 {newCount, newsletters}
   */
  async processNewSenders(fetchResult, label) {
    if (!fetchResult || !fetchResult.senders || fetchResult.senders.length === 0) {
      return { newCount: 0, newsletters: [] };
    }

    // 새 뉴스레터 감지
    const newNewsletters = this.detectNewNewsletters(fetchResult.senders, label);

    if (newNewsletters.length === 0) {
      return { newCount: 0, newsletters: [] };
    }

    // 사용자에게 알림
    console.log('');
    console.log('  ┌──────────────────────────────────────────────┐');
    console.log(`  │  [NEW] 새 뉴스레터 ${newNewsletters.length}개 감지됨                 │`);
    console.log('  └──────────────────────────────────────────────┘');

    const registered = [];
    for (const newsletter of newNewsletters) {
      console.log(`  → ${newsletter.name} <${newsletter.email}>`);

      // 카탈로그에 등록 (SKILL은 LLM 분석 후 생성)
      const entry = await this.registerNewsletter(newsletter);

      if (entry) {
        registered.push(entry);
      }
    }

    console.log('');

    return {
      newCount: registered.length,
      newsletters: registered
    };
  }

  /**
   * 뉴스레터 목록 조회
   */
  getNewsletters() {
    const catalog = this.loadCatalog();
    return catalog.newsletters;
  }

  /**
   * 라벨별 뉴스레터 조회
   */
  getNewslettersByLabel(label) {
    const catalog = this.loadCatalog();
    return catalog.newsletters.filter(n => n.labels.includes(label));
  }

  /**
   * 발신자로 뉴스레터 찾기
   */
  findBySender(email) {
    const catalog = this.loadCatalog();
    return catalog.newsletters.find(n => n.sender.toLowerCase() === email.toLowerCase());
  }

  /**
   * SKILL 파일 경로 반환
   */
  getSkillPath(senderEmail) {
    const newsletter = this.findBySender(senderEmail);
    if (newsletter && newsletter.skill_file) {
      return path.join(__dirname, '..', newsletter.skill_file);
    }
    return null;
  }
}

module.exports = { AdaptiveLearning };
