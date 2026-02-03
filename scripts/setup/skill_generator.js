/**
 * SKILL 자동 생성기
 * 뉴스레터 구조 분석 기반 SKILL 문서 생성
 */

const fs = require('fs');
const path = require('path');

class SkillGenerator {
  constructor() {
    this.skillsDir = path.join(__dirname, '..', '..', 'skills', 'newsletters');
  }

  /**
   * 뉴스레터 분석 결과로 SKILL 생성
   */
  async generate(newsletter, structure) {
    const skillContent = this.buildSkillDocument(newsletter, structure);
    return skillContent;
  }

  /**
   * SKILL 문서 빌드
   */
  buildSkillDocument(newsletter, structure) {
    const id = this.generateId(newsletter.sender || newsletter.name);
    const name = newsletter.name || newsletter.sender;
    const sender = newsletter.sender || 'unknown@example.com';
    const frequency = newsletter.frequency || 1;
    const type = structure?.type || 'multi-item';
    const avgItemCount = structure?.avgItemCount || 5;
    const charset = newsletter.charset || 'utf-8';

    return `# SKILL_${id}

## 메타데이터

- **이름**: ${name}
- **발신자**: ${sender}
- **빈도**: 주 ${frequency}회
- **유형**: ${type}
- **평균 아이템 수**: ${avgItemCount}개
- **인코딩**: ${charset}

---

## 구조

### HTML 패턴

- **컨테이너**: 분석 필요
- **아이템 경계**: 분석 필요
- **제목**: h1, h2, strong 태그
- **본문**: p, div 태그
- **링크**: a 태그

### 콘텐츠 계층

\`\`\`
뉴스레터
├── 헤더 (로고, 날짜)
├── 메인 콘텐츠
│   ├── 아이템 1
│   │   ├── 제목
│   │   ├── 요약
│   │   └── 링크
│   ├── 아이템 2
│   └── ...
├── 광고 섹션 (제외)
└── 푸터 (제외)
\`\`\`

---

## 추출 규칙

### 제목 추출

- \`<h1>\`, \`<h2>\` 태그 내용
- \`<strong>\` 태그 내 링크 텍스트
- 첫 번째 굵은 텍스트

### 요약 추출

- 제목 다음 \`<p>\` 태그
- 150자 이내로 자르기
- 불완전한 문장 방지

### 링크 추출

- 메인 CTA 링크 우선
- 트래킹 파라미터 제거
- utm_* 파라미터 제거

---

## 필터링

### 제외 패턴

- 구독 취소 링크
- 소셜 미디어 링크
- 광고 배너
- 푸터 정보

### 제외 키워드

- "구독", "unsubscribe"
- "광고", "sponsored"
- "문의", "contact"

---

## 인코딩 처리

- **HTML 엔티티 디코딩**: 필요
- **charset 변환**: ${charset !== 'utf-8' ? '필요' : '불필요'}
- **특수 처리**: 없음

---

## 검증 규칙

1. 제목이 비어있으면 스킵
2. 요약이 20자 미만이면 원문 사용
3. 중복 링크 제거
`;
  }

  /**
   * ID 생성 (이메일 → ID)
   */
  generateId(email) {
    return email
      .split('@')[0]
      .replace(/[^a-zA-Z0-9]/g, '_')
      .toLowerCase();
  }

  /**
   * SKILL 파일 저장
   */
  save(newsletter, content) {
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
    }

    const id = this.generateId(newsletter.sender || newsletter.name);
    const filePath = path.join(this.skillsDir, `SKILL_${id}.md`);
    fs.writeFileSync(filePath, content, 'utf8');

    return filePath;
  }
}

module.exports = { SkillGenerator };
