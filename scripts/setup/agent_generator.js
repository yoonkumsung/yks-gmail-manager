/**
 * Agent 자동 생성기
 * 라벨별로 표준 추출 에이전트 문서 생성
 */

const fs = require('fs');
const path = require('path');

class AgentGenerator {
  constructor() {
    this.agentsDir = path.join(__dirname, '..', '..', 'agents', 'labels');
  }

  /**
   * 라벨에 대한 Agent 문서 생성
   */
  async generate(label) {
    const labelName = label.name || label;
    return this.buildAgentDocument(labelName);
  }

  /**
   * Agent 문서 빌드 (표준 템플릿)
   * - 요약 길이 등 상세 규칙은 _공통규칙.md에서 가져옴
   */
  buildAgentDocument(labelName) {
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
      'NYT': 'New York Times 영어 뉴스',
      '미국': '미국 정치/경제/외교/빅테크',
      '중국': '중국 경제/미중관계/기술/홍콩',
      '기타': '기타 분류되지 않은 콘텐츠'
    };

    const labelDesc = labelDescriptions[labelName] || '뉴스레터';

    return `# ${labelName} 에이전트

${labelDesc} 뉴스레터에서 핵심 정보를 추출합니다.

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

1. **빠짐없이 추출**: 광고/푸터/구독안내만 제외하고 원문의 모든 뉴스 아이템을 추출. 하나라도 누락 금지.
2. **요약 길이**: 원문 분량에 비례 (긴 원문 300~500자, 짧은 원문은 50~200자도 허용).
   - 필수 구성: 핵심사실(WHO+WHAT) → 구체적 수치/데이터 → 배경맥락
   - 원문에 수치/시사점이 있으면 반드시 포함, 없으면 정성 분석으로 대체 (가짜 수치 생성 금지)
3. **긴 콘텐츠 (단일 주제 심층)**: 400~800자, 도입-전개-결론 구조 + 핵심 인용/수치
4. **제목**: 20~50자, 주어+동사+핵심정보
5. **키워드**: 3~5개, 명사형 (고유명사 우선)
6. **금지**: 이모지, 미완성 문장, 원문 복붙, 자의적 추론, "원문 참조" 등 회피 표현
7. **링크**: 각 아이템의 원문 URL을 반드시 추출 (없으면 빈 문자열)
8. **번역**: 영문 → 자연스러운 한국어 의역 (직역 금지). 고유명사는 원어 유지 가능
9. **자기검증**: 추출 완료 후 원문과 대조하여 누락 아이템이 없는지 확인

## 출력

\`\`\`json
{
  "items": [
    {
      "title": "간결하고 구체적인 제목 (20~50자)",
      "summary": "원문 분량 비례 요약 (50~500자, 단일 콘텐츠는 400~800자)",
      "keywords": ["키워드1", "키워드2", "키워드3"],
      "link": "원문 URL (없으면 빈 문자열)",
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
