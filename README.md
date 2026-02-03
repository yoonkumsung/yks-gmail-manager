# Gmail 뉴스레터 다이제스트 시스템

> LLM 기반 Gmail 뉴스레터 자동 정리 및 요약

## 특징

- **자동 설정**: 사용자 프로필 기반 Agent 자동 생성
- **LLM 기반 분석**: OpenRouter API (Solar Pro) 사용
- **개인화된 인사이트**: 사용자 관심사 반영
- **라벨별 정리**: Gmail 라벨로 뉴스레터 분류
- **증분 처리**: 중단 시 재개 가능
- **자동 복구**: 실패 배치 자동 기록 및 디버깅 지원
- **중복 제거**: LLM 기반 지능형 병합
- **다중 출력**: Markdown + HTML

## 빠른 시작

### 1. 설치

```bash
git clone https://github.com/your-username/gmail-manager.git
cd gmail-manager
npm install
```

### 2. Gmail 인증

```bash
npm run auth
```

Google Cloud Console에서 OAuth2 credentials 생성 후 `config/credentials/client_secret.json`에 저장합니다.

### 3. 환경 변수 설정

`.env` 파일 생성:
```env
OPENROUTER_API_KEY=sk-or-v1-your_key_here

# 선택적
TELEGRAM_TOKEN=
TELEGRAM_CHAT_ID=
```

### 4. 초기 설정 (웹 마법사)

```bash
npm run setup
```

웹 브라우저가 자동으로 열리며 다음 단계로 진행:

1. **사용자 프로필 입력**: 직업, 관심사 (기술/비즈니스/지적/창의/사회)
2. **라벨 선택**: 분석할 Gmail 라벨 선택
3. **분석 진행**: 뉴스레터 구조 분석 (프로그레스 바)
4. **Agent 생성**: 프로필 기반 개인화된 Agent 자동 생성
5. **완료**: 자동 생성된 파일로 바로 사용

### 5. 실행

```bash
# 기본 실행 (스케줄 모드: 전날 10:01 ~ 당일 10:00)
npm run digest

# 오늘 (0시~현재)
npm run digest -- --mode today

# 최근 24시간
npm run digest -- --mode last-24h

# 특정 날짜
npm run digest -- --mode custom --date 2026-01-30

# 특정 라벨만
npm run digest -- --mode today --labels IT,경제
```

## 작동 방식

### 파이프라인

```
1. Gmail 수집 (Node.js)
   → %TEMP%/gmail-manager/{runId}/labels/{라벨}/raw/

2. HTML → Text 변환
   → %TEMP%/gmail-manager/{runId}/labels/{라벨}/clean/

3. LLM 아이템 추출 (Agent 사용)
   → %TEMP%/gmail-manager/{runId}/labels/{라벨}/items/

4. 병합 및 중복 제거
   → %TEMP%/gmail-manager/{runId}/merged/

5. 인사이트 생성 (이중 인사이트)
   → merged 파일에 인사이트 추가

6. 최종 출력 (성공 시)
   → output/final/{runId}/{날짜}_통합_메일정리.html
   → 임시 폴더 자동 삭제
```

### 임시 폴더 구조

```
%TEMP%/gmail-manager/{runId}/
├── labels/
│   └── {라벨}/
│       ├── raw/          # Gmail 원본
│       ├── clean/        # 텍스트 변환
│       └── items/        # 추출된 아이템
├── merged/               # 병합 결과
├── final/                # HTML/MD 출력
├── logs/                 # 실행 로그
├── progress.json         # 증분 처리 상태
└── failed_batches.json   # 실패 배치 기록
```

- **성공 시**: 임시 폴더 자동 삭제, `output/final/{runId}/`에 HTML만 보존
- **실패 시**: 임시 폴더 유지 (디버깅용)

### 증분 처리

각 단계별 진행 상태가 `progress.json`에 저장됩니다:

```json
{
  "labels": {
    "IT": {
      "gmail_fetch": "completed",
      "html_to_text": "completed",
      "llm_extract": "in_progress",
      "merge": "pending",
      "insight": "pending"
    }
  }
}
```

중간에 중단되면 재실행 시 완료된 단계는 건너뜁니다.

### 실패 복구

LLM 호출 실패 시 `failed_batches.json`에 기록:

```json
{
  "batches": [
    {
      "label": "IT",
      "step": "llm_extract",
      "batch_index": 3,
      "error": "API timeout",
      "context": { "messageId": "abc123" }
    }
  ]
}
```

### 재시도 로직

다음 상황에서 자동 재시도 (최대 7회, 점진적 대기):

- HTTP 에러: 408, 429, 500, 502, 503, 504
- 타임아웃: AbortError, timeout 메시지
- 불완전 JSON: 토큰 끊김으로 인한 응답 절단

### Agent 시스템

마법사가 생성한 Agent 파일(`agents/labels/{label}.md`)이 LLM에게 지시사항을 제공합니다:
- **사용자 프로필 반영**: 관심사에 맞는 정보 우선 추출
- **추출 규칙**: 제목, 요약, 키워드 정의
- **필터링 기준**: 광고, 노이즈 제거
- **출력 형식**: JSON 스키마

SKILL 파일(`skills/newsletters/SKILL_*.md`)은 뉴스레터별 구조 정보를 제공합니다.

### 이중 인사이트 시스템

각 뉴스 아이템에 대해 두 가지 관점의 인사이트 생성:

**Insight A (도메인 관련)**:
- 사용자의 관련 관심사와 연결
- 실용적 적용, 시장 함의

**Insight B (교차 도메인)**:
- 사용자의 비관련 관심사와 연결
- 철학적 각도, 창의적 종합

## 프로젝트 구조

```
gmail-manager/
├── README.md
├── SPEC.md
│
├── .github/workflows/
│   └── daily-digest.yml         # GitHub Actions 설정
│
├── config/
│   ├── credentials/             # Gmail 인증
│   │   ├── client_secret.json
│   │   └── token.json
│   ├── labels.json              # 라벨 설정
│   ├── settings.json            # 처리 설정 (요약 길이, 배치 크기 등)
│   ├── user_profile.json        # 사용자 프로필 (자동 생성)
│   └── newsletters.json         # 뉴스레터 카탈로그 (자동 생성)
│
├── agents/
│   ├── labels/                  # 라벨별 Agent (자동 생성)
│   │   └── {라벨}.md
│   ├── 병합.md                   # 중복 제거 Agent
│   ├── 인사이트.md               # 이중 인사이트 생성 Agent
│   └── 뉴스레터분석.md           # 새 뉴스레터 구조 분석 Agent
│
├── skills/
│   ├── SKILL_작성규칙.md        # SKILL 작성 가이드라인
│   └── newsletters/             # 뉴스레터별 SKILL (자동 생성)
│       └── SKILL_*.md
│
├── scripts/
│   ├── orchestrator.js          # 메인 파이프라인
│   ├── agent_runner.js          # LLM API 호출 (재시도/복구 포함)
│   ├── fetch_gmail.js           # Gmail 수집 (Node.js)
│   ├── adaptive_learning.js     # 새 뉴스레터 자동 감지 (캐싱 포함)
│   ├── html_to_text.js          # HTML 변환
│   ├── generate_html.js         # 최종 출력 생성
│   ├── auth.js                  # Gmail OAuth 인증
│   ├── refresh_token.js         # 토큰 갱신
│   └── setup/                   # 웹 기반 설정 마법사
│       ├── server.js            # Express 서버
│       ├── wizard.js            # 설정 마법사 로직
│       ├── agent_generator.js   # Agent 파일 생성
│       ├── newsletter_analyzer.js  # 뉴스레터 분석
│       ├── skill_generator.js   # SKILL 파일 생성
│       ├── validator.js         # 입력 검증
│       └── public/              # 웹 UI (HTML/CSS/JS)
│
└── output/
    └── final/{runId}/           # 최종 결과물 (HTML)
```

## GitHub Actions 설정

### 필수 Secrets

Repository → Settings → Secrets and variables → Actions에서 설정:

| Secret | 설명 | 필수 |
|--------|------|------|
| `OPENROUTER_API_KEY` | OpenRouter API 키 | O |
| `GMAIL_CREDENTIALS` | `client_secret.json` 내용 | O |
| `GMAIL_TOKEN` | `token.json` 내용 | O |
| `TELEGRAM_TOKEN` | Telegram Bot 토큰 | X |
| `TELEGRAM_CHAT_ID` | Telegram Chat ID | X |

### 자동 실행

- **시간**: 매일 오전 10시 KST
- **범위**: 스케줄 모드 (전날 10:01 ~ 당일 10:00)
- **결과**:
  - GitHub Pages 배포 (통합 HTML → `https://{user}.github.io/{repo}/`)
  - GitHub Artifacts (MD 파일 다운로드)
  - Telegram 알림 (선택)
- **Secrets 미설정 시**: 경고 메시지 출력 후 정상 종료 (실패 알림 없음)

### 수동 실행

1. GitHub → Actions 탭
2. "Gmail 메일 정리" 워크플로우 선택
3. "Run workflow" 클릭
4. 실행 모드 선택 (today, last-24h, custom)

## 주요 기능

### 구현 완료

- Gmail 수집 파이프라인 (Node.js, 크로스 플랫폼)
- HTML → Text 변환
- LLM 아이템 추출 (OpenRouter Solar Pro)
- Markdown/HTML 출력
- GitHub Actions 워크플로우
- 웹 기반 설정 마법사 (`npm run setup`)
- Agent/SKILL 자동 생성
- 이중 인사이트 시스템
- 병합 로직 (중복 제거)
- 적응형 학습 (새 뉴스레터 자동 감지)
- **증분 처리** (progress.json)
- **실패 복구** (failed_batches.json)
- **타임아웃/토큰끊김 재시도**
- **임시 폴더 시스템** (성공 시 자동 정리)
- **카탈로그 캐싱** (파일 I/O 최소화)
- **메타데이터 보존** (source_email, message_id)

## 커스터마이징

### LLM 모델 변경

`scripts/orchestrator.js`의 CONFIG에서 모델 수정:
```javascript
const CONFIG = {
  openrouterModel: 'upstage/solar-pro-3:free',
  // 다른 모델 옵션:
  // 'anthropic/claude-3.5-haiku'
  // 'google/gemini-2.0-flash-exp'
  // 'openai/gpt-4o-mini'
};
```

OpenRouter 모델 목록: https://openrouter.ai/models

### 라벨 설정

`config/labels.json`에서 라벨 설정 변경:
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
    },
    {
      "name": "경제",
      "gmail_label": "경제",
      "sub_labels": [],
      "enabled": true,
      "agent": "agents/labels/경제.md",
      "focus_topics": ["금리", "환율", "증시"]
    }
  ]
}
```

- `gmail_label`: Gmail에서 사용하는 실제 라벨명
- `sub_labels`: 하위 라벨 (선택)
- `enabled`: 활성화 여부
- `focus_topics`: 관심 주제 (LLM 힌트용)

## 로그 및 디버깅

### 로그 위치

- 실행 중: `%TEMP%/gmail-manager/{runId}/logs/{date}.log`
- GitHub Actions: Actions 탭에서 워크플로우 실행 로그 확인

### 디버깅 파일 (실패 시)

- `%TEMP%/gmail-manager/{runId}/progress.json` - 어느 단계에서 실패했는지
- `%TEMP%/gmail-manager/{runId}/failed_batches.json` - 실패한 배치 상세 정보

### 주요 로그 패턴

```
[INFO] === IT 에이전트 실행 ===
[WARN] 불완전 JSON 응답 감지, 4초 후 재시도 (1/7)
[WARN] 에러 429, 10초 후 재시도 (2/7)
[ERROR] 불완전한 JSON 응답 (토큰 끊김)
```

### 문제 해결

**Gmail 인증 실패 (401)**:
```bash
npm run refresh
```

**Rate Limit 429**:
- 자동 재시도됨 (최대 7회)
- `agent_runner.js`에서 Rate Limiter 설정 확인

**토큰 끊김 (불완전 JSON)**:
- 자동 재시도됨
- 반복 실패 시 `max_tokens` 값 확인

**중간 중단 후 재실행**:
```bash
# 같은 날 재실행하면 자동으로 이어서 처리
npm run digest
```

**초기 설정 필요 시**:
- 실행 시 자동으로 설정 상태를 감지합니다
- 누락된 항목이 있으면 구체적인 안내 메시지가 출력됩니다
- `npm run setup`으로 웹 마법사를 통해 설정할 수 있습니다

## 문서

- **README.md**: 이 파일 (사용자 가이드)
- **SPEC.md**: 기술 명세서 (아키텍처, 문제점, 개선 과제, API 레퍼런스)

## 라이선스

MIT License

## 기여

1. Fork the Project
2. Create your Feature Branch
3. Commit your Changes
4. Push to the Branch
5. Open a Pull Request

## 문의

Issues 탭에서 문의해주세요.
