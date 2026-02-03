/**
 * Agent 자동 생성기
 * 사용자 프로필 기반으로 개인화된 Agent 문서 생성
 */

const fs = require('fs');
const path = require('path');

class AgentGenerator {
  constructor() {
    this.agentsDir = path.join(__dirname, '..', '..', 'agents', 'labels');
  }

  /**
   * 라벨과 프로필 기반으로 Agent 생성
   */
  async generate(label, profile) {
    const labelName = label.name || label;
    const userProfile = profile?.user || profile;

    // 관련 관심사 추출
    const relatedInterests = this.getRelatedInterests(labelName, userProfile);
    const unrelatedInterests = this.getUnrelatedInterests(labelName, userProfile);

    // Agent 문서 생성
    const agentContent = this.buildAgentDocument(labelName, userProfile, relatedInterests, unrelatedInterests);

    return agentContent;
  }

  /**
   * 라벨과 관련된 관심사 추출
   */
  getRelatedInterests(labelName, profile) {
    const interests = profile?.interests || {};
    const related = [];

    // 라벨별 관련 관심사 매핑
    const labelInterestMap = {
      'IT': ['technical'],
      '경제': ['business'],
      '투자': ['business'],
      '창업': ['business', 'technical'],
      '마케팅': ['business'],
      '시사': ['social'],
      '해외': ['social', 'business'],
      '인문학': ['intellectual'],
      '라이프': ['creative'],
      '스포츠': ['creative'],
      '문화': ['intellectual', 'creative']
    };

    const interestTypes = labelInterestMap[labelName] || ['technical', 'business'];

    for (const type of interestTypes) {
      if (interests[type] && Array.isArray(interests[type])) {
        related.push(...interests[type]);
      }
    }

    return [...new Set(related)];
  }

  /**
   * 라벨과 관련 없는 관심사 추출 (교차 도메인 인사이트용)
   */
  getUnrelatedInterests(labelName, profile) {
    const interests = profile?.interests || {};
    const unrelated = [];

    // 라벨별 비관련 관심사 매핑
    const labelUnrelatedMap = {
      'IT': ['intellectual', 'creative'],
      '경제': ['intellectual', 'creative'],
      '투자': ['intellectual', 'technical'],
      '창업': ['intellectual'],
      '마케팅': ['intellectual', 'technical'],
      '시사': ['technical', 'creative'],
      '인문학': ['technical', 'business'],
      '라이프': ['technical', 'business'],
      '스포츠': ['intellectual', 'business']
    };

    const interestTypes = labelUnrelatedMap[labelName] || ['intellectual'];

    for (const type of interestTypes) {
      if (interests[type] && Array.isArray(interests[type])) {
        unrelated.push(...interests[type]);
      }
    }

    return [...new Set(unrelated)];
  }

  /**
   * Agent 문서 빌드 (표준 템플릿 형식)
   */
  buildAgentDocument(labelName, profile, relatedInterests, unrelatedInterests) {
    const occupation = profile?.occupation?.title || '전문가';

    const labelDescriptions = {
      'IT': '기술, AI, 스타트업, 소프트웨어 관련',
      '경제': '경제, 금융, 시장 동향 관련',
      '투자': '투자, 주식, 자산 관리 관련',
      '창업': '창업, 스타트업, 비즈니스 모델 관련',
      '마케팅': '마케팅, 브랜딩, 그로스 관련',
      '시사': '시사, 정치, 사회 이슈 관련',
      '해외': '해외 뉴스, 글로벌 트렌드 관련',
      '인문학': '인문학, 철학, 역사 관련',
      '라이프': '라이프스타일, 건강, 웰빙 관련',
      '스포츠': '스포츠, 피트니스 관련',
      '문화': '문화, 예술, 엔터테인먼트 관련',
      '소셜포럼': '커뮤니티, 토론, 의견 관련',
      '기타': '기타 분류되지 않은 콘텐츠'
    };

    const labelDesc = labelDescriptions[labelName] || '뉴스레터';
    const interestStr = relatedInterests.length > 0 ? relatedInterests.join(', ') : '일반';
    const priorityStr = relatedInterests.length > 0
      ? `다음 주제를 우선 추출: ${relatedInterests.join(', ')}`
      : '모든 주요 아이템 추출';

    return `# ${labelName} 에이전트

${labelDesc} 뉴스레터에서 핵심 정보를 추출합니다.

## 사용자

- **역할**: ${occupation}
- **관심사**: ${interestStr}

## 역할

뉴스레터 본문에서 중요한 뉴스 아이템을 추출하고 요약합니다.
광고, 구독 안내, 푸터, 소셜 링크는 제외합니다.

## 입력

\`\`\`json
{
  "message_id": "메시지 ID",
  "from": "발신자",
  "subject": "제목",
  "clean_text": "정제된 본문 텍스트"
}
\`\`\`

## 처리 규칙

1. **우선순위**: ${priorityStr}
2. **요약 길이**: 300~500자 (SKILL_작성규칙 참조)
3. **긴 콘텐츠**: 핵심 내용 + 전개 구조(도입-전개-결론) 포함
4. **제목**: 20~50자, 주어+동사+핵심정보
5. **키워드**: 3~5개, 명사형
6. **금지**: 이모지, 미완성 문장, 원문 복붙

## 출력

\`\`\`json
{
  "items": [
    {
      "title": "간결하고 구체적인 제목 (20~50자)",
      "summary": "핵심 내용 요약 (300~500자)",
      "keywords": ["키워드1", "키워드2", "키워드3"],
      "source": "뉴스레터 이름"
    }
  ]
}
\`\`\`
`;
  }

  /**
   * Agent 파일 저장
   */
  save(labelName, content) {
    if (!fs.existsSync(this.agentsDir)) {
      fs.mkdirSync(this.agentsDir, { recursive: true });
    }

    const filePath = path.join(this.agentsDir, `${labelName}.md`);
    fs.writeFileSync(filePath, content, 'utf8');

    return filePath;
  }
}

module.exports = { AgentGenerator };
