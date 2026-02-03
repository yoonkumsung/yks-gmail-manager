# SKILL: Superhuman AI

영문 AI 뉴스레터. 최신 AI 트렌드와 도구 소개.

---

## 메타 정보

```yaml
from_patterns:
  - "superhuman@mail.joinsuperhuman.ai"
  - "joinsuperhuman.ai"
  - "Superhuman"
  - "Zain Kahn"
type: multi_topic
language: en
frequency: daily
requires_translation: true
```

---

## 뉴스레터 구조

```
┌─ 헤더 ─────────────────────────────┐
│ 로고/브랜딩                         │
│ 날짜                                │
└─────────────────────────────────────┘
           │
┌─ 뉴스 아이템들 ────────────────────┐
│ 🌎 Topic 1: 제목                    │
│    요약 내용                        │
│    Why it matters                  │
│                                     │
│ 🤖 Topic 2: 제목                    │
│    요약 내용                        │
│    ...                             │
└─────────────────────────────────────┘
           │
┌─ 도구/리소스 소개 ─────────────────┐
│ Tool of the Day                    │
│ AI 도구 소개                        │
└─────────────────────────────────────┘
           │
┌─ 푸터 ─────────────────────────────┐
│ 후원/광고                           │
│ 구독 관리                           │
└─────────────────────────────────────┘
```

---

## 특징

- **영문** → 출력 에이전트에서 번역
- 짧고 간결한 뉴스 스타일
- 이모지로 섹션 구분
- "Why it matters" 섹션 있음

---

## 추출 규칙

### 포함
| 유형 | 처리 |
|------|------|
| 각 뉴스 토픽 | 개별 아이템 |
| Tool of the Day | AI 도구 소개로 추출 |
| Why it matters | summary에 반영 |

### 제외
| 유형 | 이유 |
|------|------|
| Sponsored content | 광고 |
| 구독 유도 | 프로모션 |

---

## 아이템 경계

### 신호
- 이모지 + 제목 (🌎 🤖 🔧 💡)
- "Why it matters:" 구문
- 빈 줄로 구분

---

## 번역 처리

**이 SKILL에서는 원문 그대로 추출**

번역은 출력 에이전트가 담당:
```
1. 라벨 에이전트: 영문 그대로 추출
2. 출력 에이전트: 한글로 번역
3. 고유명사: 한글(원어) 형식
```

### 번역 예시
```
원문: "OpenAI's GPT-5 shows emergent reasoning capabilities"
번역: "오픈AI(OpenAI)의 GPT-5가 창발적 추론 능력을 보여주다"
```

---

## 예시 출력

### 입력 (영문)
```
🌎 Project Genie: Build 3D worlds

Google DeepMind unveiled Genie, an AI model that can generate playable 3D environments from a single image or text prompt.

The model was trained on 200,000 hours of video game footage and can create interactive worlds with consistent physics.

Why it matters: This could revolutionize game development and virtual world creation, allowing anyone to build immersive 3D experiences without coding skills.
```

### 출력 (영문 그대로 - 번역은 출력 에이전트에서)
```json
{
  "title": "Project Genie: Build 3D worlds",
  "summary": "Google DeepMind unveiled Genie, an AI model that can generate playable 3D environments from a single image or text prompt. The model was trained on 200,000 hours of video game footage and can create interactive worlds with consistent physics. This could revolutionize game development and virtual world creation, allowing anyone to build immersive 3D experiences without coding skills.",
  "keywords": ["AI", "Google", "DeepMind", "Genie", "3D"],
  "language": "en",
  "is_longform": false
}
```

### 최종 출력 (번역 후)
```json
{
  "title": "프로젝트 지니(Project Genie): 3D 세계 생성",
  "summary": "구글 딥마인드(Google DeepMind)가 단일 이미지나 텍스트 프롬프트로 플레이 가능한 3D 환경을 생성하는 AI 모델 '지니(Genie)'를 공개했다. 이 모델은 20만 시간의 비디오 게임 영상으로 학습되었으며, 일관된 물리 법칙을 가진 인터랙티브 세계를 생성할 수 있다. 이는 게임 개발과 가상 세계 창작에 혁명을 일으킬 수 있으며, 코딩 기술 없이도 몰입형 3D 경험을 만들 수 있게 해준다.",
  "keywords": ["AI", "구글", "딥마인드", "지니", "3D"]
}
```
