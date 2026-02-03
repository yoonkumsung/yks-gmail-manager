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
  }

  /**
   * 뉴스레터 카탈로그 로드
   */
  loadCatalog() {
    if (fs.existsSync(this.catalogPath)) {
      return JSON.parse(fs.readFileSync(this.catalogPath, 'utf8'));
    }
    return { newsletters: [], last_scan: null };
  }

  /**
   * 뉴스레터 카탈로그 저장
   */
  saveCatalog(catalog) {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    catalog.last_scan = new Date().toISOString();
    fs.writeFileSync(this.catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
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
   * 새 뉴스레터 등록 및 SKILL 생성
   * @param {Object} newsletter - 새 뉴스레터 정보
   * @param {Object} options - 옵션 {generateSkill: boolean, samples: Array}
   */
  async registerNewsletter(newsletter, options = {}) {
    const catalog = this.loadCatalog();
    const id = this.generateId(newsletter.email);

    // 이미 등록되어 있으면 무시
    if (catalog.newsletters.some(n => n.sender.toLowerCase() === newsletter.email.toLowerCase())) {
      console.log(`  이미 등록됨: ${newsletter.email}`);
      return null;
    }

    // 뉴스레터 정보 생성
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
        type: 'multi-item',
        item_count_avg: 5
      },
      detected_at: newsletter.detected_at || new Date().toISOString(),
      auto_generated: true
    };

    // SKILL 생성
    if (options.generateSkill !== false) {
      const skillContent = this.generateSkillContent(newEntry, options.samples);
      this.saveSkill(id, skillContent);
      console.log(`  SKILL 생성됨: SKILL_${id}.md`);
    }

    // 카탈로그에 추가
    catalog.newsletters.push(newEntry);
    this.saveCatalog(catalog);

    return newEntry;
  }

  /**
   * ID 생성
   */
  generateId(email) {
    // 이메일에서 ID 추출 (@ 앞부분, 특수문자 제거)
    const localPart = email.split('@')[0];
    return localPart
      .replace(/[^a-zA-Z0-9]/g, '_')
      .toLowerCase()
      .substring(0, 30);
  }

  /**
   * SKILL 내용 생성 (표준 템플릿 형식)
   */
  generateSkillContent(newsletter, samples = []) {
    const id = newsletter.id;
    const name = newsletter.name;
    const sender = newsletter.sender;
    const frequency = newsletter.frequency || 1;
    const dateStr = new Date().toISOString().split('T')[0];

    return `# SKILL_${id}

${name} 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | ${name} |
| 발신자 | ${sender} |
| 유형 | multi-item |
| 언어 | ko |
| 빈도 | 주 ${frequency}회 (추정) |
| 생성일 | ${dateStr} |
| 자동생성 | true |

---

## 구조 분석

### 아이템 경계

- 패턴: 분석 필요 (자동 감지)
- 평균 아이템 수: 5개 (추정)

### 제목 위치

- 태그: h1, h2, strong
- 특징: 굵은 텍스트 또는 링크 텍스트

### 본문 위치

- 태그: p, div
- 특징: 제목 다음 단락

---

## 추출 규칙

1. 제목: h1, h2, strong 태그 내용 추출
2. 요약: 제목 다음 p 태그, 300~500자로 요약
3. 링크: 메인 CTA 링크, utm_* 파라미터 제거
4. 키워드: 본문에서 핵심 명사 3~5개 추출

---

## 필터링

### 제외 영역

- 헤더: 로고, 날짜, 네비게이션
- 푸터: 구독 관리, 연락처, 저작권
- 광고: sponsored, 배너 영역

### 제외 키워드

- 구독, unsubscribe, 수신거부
- 광고, sponsored, ad
- 문의, contact, 고객센터

---

## 참고

이 SKILL은 자동 생성되었습니다.
실제 뉴스레터 분석 후 구조 정보를 업데이트하면 추출 정확도가 향상됩니다.
`;
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

      // 자동 등록 및 SKILL 생성
      const entry = await this.registerNewsletter(newsletter, {
        generateSkill: true
      });

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
