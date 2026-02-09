# yks-gmail-manager

> Gmail 뉴스레터를 AI가 자동으로 정리·요약하고, 나만의 인사이트를 더해주는 개인화된 뉴스 다이제스트 시스템

매일 쏟아지는 뉴스레터를 하나하나 읽을 시간이 없다면, yks-gmail-manager가 대신 읽고 핵심만 정리해드립니다. Gmail 라벨별로 분류된 뉴스레터를 수집하고, LLM이 핵심 아이템을 추출한 뒤, 사용자의 관심사에 맞는 인사이트까지 생성하여 깔끔한 HTML 리포트로 만들어줍니다.

## 주요 기능

- **AI 기반 뉴스 요약**: OpenRouter LLM이 뉴스레터에서 핵심 아이템만 추출
- **개인화된 이중 인사이트**: 내 관심사와 연결한 실용적 인사이트 + 교차 도메인 창의적 인사이트
- **라벨별 분류 처리**: Gmail 라벨 기준으로 IT, 경제, 투자 등 영역별 정리
- **자동 중복 제거**: 여러 뉴스레터에 중복된 뉴스를 지능적으로 병합
- **GitHub Actions 자동화**: 매일 정해진 시간에 자동 실행, Telegram 알림 지원
- **웹 기반 설정 마법사**: 브라우저에서 클릭 몇 번으로 초기 설정 완료

## 사전 준비 (Prerequisites)

### 1. Gmail 라벨 분류 (필수)

> **이 시스템은 Gmail 라벨로 분류된 뉴스레터를 처리합니다. 라벨이 없으면 작동하지 않습니다.**

Gmail에서 수신하는 뉴스레터를 주제별 라벨로 분류해야 합니다. 예를 들어:

| 라벨 | 용도 |
|------|------|
| `IT` | 기술, AI, 개발 관련 뉴스레터 |
| `경제` | 경제, 금융 뉴스레터 |
| `투자` | 주식, 펀드, 부동산 뉴스레터 |
| `시사` | 정치, 사회 뉴스레터 |

**라벨 설정 방법:**

1. Gmail 웹에서 좌측 사이드바 → "라벨 관리" 또는 설정(톱니바퀴) → "라벨" 탭
2. 원하는 라벨을 생성 (예: `IT`, `경제`, `투자`, `시사`)
3. 각 뉴스레터에 필터를 만들어 자동으로 라벨이 붙도록 설정
   - Gmail에서 해당 뉴스레터 메일 열기 → 더보기(⋮) → "메일 필터링"
   - "라벨 적용" 선택 → 원하는 라벨 지정 → "필터 만들기"

라벨명은 자유롭게 정할 수 있으며, 하위 라벨(예: `IT/AI`)도 지원됩니다.

### 2. Node.js 18 이상

```bash
node --version  # v18.0.0 이상 필요
```

[Node.js 다운로드](https://nodejs.org/)

### 3. Google Cloud Console OAuth 설정

Gmail API에 접근하려면 OAuth 인증 정보가 필요합니다.

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 새 프로젝트 생성 (또는 기존 프로젝트 선택)
3. **API 및 서비스 → 라이브러리** → "Gmail API" 검색 → 사용 설정
4. **API 및 서비스 → 사용자 인증 정보** → "사용자 인증 정보 만들기" → "OAuth 클라이언트 ID"
   - 애플리케이션 유형: "데스크톱 앱"
   - 이름: 원하는 이름
5. 생성된 JSON 파일을 다운로드하여 `config/credentials/client_secret.json`으로 저장

### 4. OpenRouter API 키

LLM 호출에 사용되는 API 키입니다.

1. [OpenRouter](https://openrouter.ai/) 가입
2. API Keys 페이지에서 키 생성
3. 무료 모델(Solar Pro 등)을 사용하면 비용 없이 이용 가능

## 설치 및 설정

### Step 1. 프로젝트 다운로드

```bash
git clone https://github.com/your-username/yks-gmail-manager.git
cd yks-gmail-manager
npm install
```

### Step 2. Gmail OAuth 인증

```bash
npm run auth
```

브라우저가 열리면 Google 계정으로 로그인하고 권한을 허용합니다. 인증이 완료되면 `config/credentials/token.json`이 자동 생성됩니다.

### Step 3. 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성합니다:

```env
OPENROUTER_API_KEY=sk-or-v1-your_key_here

# 선택 (Telegram 알림 사용 시)
TELEGRAM_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

### Step 4. 사용자 프로필 설정

`config/user_profile.json`에 직업과 관심사를 설정합니다. 이 정보는 LLM이 개인화된 인사이트를 생성할 때 사용됩니다.

```json
{
  "version": "1.0",
  "user": {
    "occupation": {
      "title": "소프트웨어 엔지니어",
      "description": "AI 및 웹 서비스 개발"
    },
    "interests": {
      "technical": ["AI", "LLM", "클라우드"],
      "business": ["스타트업", "투자"],
      "intellectual": ["철학", "역사"],
      "creative": ["디자인", "음악"],
      "social": ["정치", "환경"]
    }
  }
}
```

### Step 5. 웹 마법사로 설정 완료

```bash
npm run setup
```

브라우저가 자동으로 열리며 다음을 설정합니다:
1. 사용자 프로필 확인/수정
2. 처리할 Gmail 라벨 선택
3. 뉴스레터 구조 자동 분석
4. 라벨별 AI Agent 자동 생성

설정이 완료되면 바로 실행할 수 있습니다.

## 실행 방법

```bash
# 기본 실행 (스케줄 모드: 전날 10:01 ~ 당일 10:00)
npm run digest

# 오늘 (0시 ~ 현재)
npm run digest -- --mode today

# 최근 24시간
npm run digest -- --mode last-24h

# 특정 날짜
npm run digest -- --mode custom --date 2026-01-30

# 특정 라벨만 처리
npm run digest -- --mode today --labels IT,경제
```

결과물은 `output/final/{날짜}/` 폴더에 HTML과 Markdown 파일로 저장됩니다.

## 작동 원리

```
1. Gmail 수집        Gmail API로 라벨별 뉴스레터 메일 가져오기
       ↓
2. HTML → Text      HTML 메일을 깨끗한 텍스트로 변환
       ↓
3. LLM 아이템 추출   AI가 각 뉴스레터에서 핵심 뉴스 아이템 추출
       ↓
4. 병합 · 중복 제거  여러 뉴스레터의 동일 뉴스를 하나로 병합
       ↓
5. 인사이트 생성     사용자 관심사 기반 이중 인사이트 생성
       ↓
6. 최종 출력        HTML + Markdown 리포트 생성
```

- 중간에 중단되면 재실행 시 완료된 단계는 건너뛰고 이어서 처리합니다 (증분 처리)
- 실패한 배치는 자동 기록되어 디버깅이 쉽습니다

## GitHub Actions 자동화

매일 자동으로 뉴스레터를 정리하려면 GitHub Actions를 설정합니다.

### Secrets 설정

Repository → Settings → Secrets and variables → Actions에서 다음 Secrets를 추가합니다:

| Secret | 설명 | 필수 |
|--------|------|:----:|
| `OPENROUTER_API_KEY` | OpenRouter API 키 | O |
| `GMAIL_CREDENTIALS` | `client_secret.json`의 전체 내용 | O |
| `GMAIL_TOKEN` | `token.json`의 전체 내용 | O |
| `USER_PROFILE` | `user_profile.json`의 전체 내용 | O |
| `TELEGRAM_TOKEN` | Telegram Bot 토큰 | X |
| `TELEGRAM_CHAT_ID` | Telegram Chat ID | X |

### 자동 실행

- **시간**: 매일 오전 10시 KST (자동)
- **범위**: 전날 10:01 ~ 당일 10:00 수신 메일
- **결과 수신**:
  - Telegram으로 HTML + 통합 MD 파일 자동 전송 (Secrets에 Telegram 설정 시)
  - GitHub Artifacts에서 다운로드 (Actions 탭 → 해당 실행 → Artifacts)

### 수동 실행

1. GitHub → Actions 탭 → "Gmail 메일 정리" 워크플로우
2. "Run workflow" 클릭
3. 실행 모드 선택 (today / last-24h / custom)

## 커스터마이징

### 라벨 추가/변경

`config/labels.json`에서 라벨을 추가하거나 수정합니다:

```json
{
  "labels": [
    {
      "name": "IT",
      "gmail_label": "IT",
      "sub_labels": ["IT/AI"],
      "enabled": true,
      "agent": "agents/labels/IT.md",
      "focus_topics": ["AI", "LLM", "클라우드"]
    }
  ]
}
```

- `gmail_label`: Gmail에서 사용하는 실제 라벨명
- `sub_labels`: 포함할 하위 라벨 (선택)
- `enabled`: `false`로 설정하면 해당 라벨 건너뜀
- `focus_topics`: LLM에게 우선 추출을 지시하는 관심 주제

새 라벨을 추가한 뒤 `npm run setup`을 실행하면 해당 라벨의 Agent 파일이 자동 생성됩니다.

### LLM 모델 변경

`scripts/orchestrator.js`의 CONFIG에서 모델을 변경할 수 있습니다:

```javascript
const CONFIG = {
  openrouterModel: 'upstage/solar-pro-3:free',
  // 다른 옵션:
  // 'anthropic/claude-3.5-haiku'
  // 'google/gemini-2.0-flash-exp'
  // 'openai/gpt-4o-mini'
};
```

사용 가능한 모델 목록: [OpenRouter Models](https://openrouter.ai/models)

## 문제 해결

### Gmail 인증 실패 (401 에러)

토큰이 만료된 경우:
```bash
npm run refresh
```

그래도 안 되면 `config/credentials/token.json`을 삭제하고 `npm run auth`로 재인증합니다.

### Rate Limit (429 에러)

자동으로 재시도됩니다 (최대 7회, 점진적 대기). 무료 모델 사용 시 요청 간격이 넓어 자주 발생할 수 있습니다. 반복되면 유료 모델로 전환을 고려하세요.

### 불완전한 JSON 응답 (토큰 끊김)

LLM 응답이 도중에 잘리는 경우이며, 자동 재시도됩니다. 반복 실패 시 `scripts/orchestrator.js`에서 `max_tokens` 값을 확인하세요.

### 중간에 중단된 경우

같은 날 다시 실행하면 완료된 단계는 건너뛰고 이어서 처리합니다:
```bash
npm run digest
```

### 초기 설정 누락

실행 시 누락된 설정을 자동 감지하고 안내 메시지를 출력합니다. `npm run setup`으로 웹 마법사를 통해 설정할 수 있습니다.

## 라이선스

MIT License
