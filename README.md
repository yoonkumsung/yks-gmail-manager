# yks-gmail-manager

> Gmail 뉴스레터를 AI가 매일 자동으로 추출·중복 제거하여 HTML/Markdown 다이제스트로 만들어주는 시스템

매일 쏟아지는 뉴스레터를 하나하나 읽을 시간이 없다면, yks-gmail-manager가 대신 읽고 핵심만 정리해드립니다. Gmail 라벨별로 분류된 뉴스레터를 수집하고, **OpenRouter의 DeepSeek V4 Pro** 모델이 핵심 아이템을 추출하고 중복을 병합하여 깔끔한 HTML/Markdown 리포트로 만들어줍니다. 추가 분석(인사이트·트렌드 종합 등)이 필요하면 생성된 MD 파일을 별도 LLM에 넣어 그때그때 돌리는 방식입니다.

## 주요 기능

- **AI 기반 뉴스 추출**: DeepSeek V4 Pro 모델이 뉴스레터에서 핵심 아이템을 빠짐없이 추출
- **라벨별 분류 처리**: Gmail 라벨 기준으로 IT, 경제, 시사, NYT 등 16개 영역 병렬 처리
- **자동 중복 제거**: 코드 사전필터링(Jaccard 유사도) + LLM 병합으로 같은 뉴스를 하나로 통합
- **적응형 SKILL 학습**: 새 뉴스레터를 자동 감지해 발신자별 구조 분석 SKILL 파일 자동 생성
- **원문 링크 크롤링**: 티저만 제공하는 뉴스레터는 원문을 따라가 본문 보강
- **증분 처리**: 중간 실패 시 완료된 단계는 건너뛰고 이어서 처리
- **GitHub Actions 자동화**: 매일 정해진 시간에 자동 실행, Telegram으로 결과물 자동 전송
- **웹 기반 설정 마법사**: 브라우저에서 클릭 몇 번으로 초기 설정 완료

## 사전 준비 (Prerequisites)

### 1. Gmail 라벨 분류 (필수)

> **이 시스템은 Gmail 라벨로 분류된 뉴스레터를 처리합니다. 라벨이 없으면 작동하지 않습니다.**

Gmail에서 수신하는 뉴스레터를 주제별 라벨로 분류해야 합니다. 기본 제공 라벨:

| 라벨 | 용도 |
|------|------|
| `IT` | 기술, AI, 개발 관련 뉴스레터 (하위 라벨 `IT/AI` 자동 포함) |
| `경제` | 경제, 금융 뉴스레터 (`경제/기관 홍보` 포함) |
| `시사` | 정치, 사회, 국제 뉴스 |
| `창업` | 스타트업, VC, 액셀러레이터 |
| `투자` | 주식, 펀드, 채권, 부동산, 가상자산 |
| `해외`, `마케팅`, `라이프`, `인문학`, `스포츠`, `소셜/포럼`, `기타` | 영역별 뉴스레터 |
| `New York Times`, `미국`, `중국` | 해외 매체 |

전체 활성 라벨 목록은 `config/labels.json` 참고. 라벨명은 자유롭게 정할 수 있으며, 하위 라벨(예: `IT/AI`)도 지원됩니다.

**라벨 설정 방법:**

1. Gmail 웹 → 좌측 사이드바 → "라벨 관리" 또는 설정(톱니바퀴) → "라벨" 탭
2. 원하는 라벨을 생성
3. 각 뉴스레터에 필터를 만들어 자동으로 라벨이 붙도록 설정
   - 해당 뉴스레터 메일 열기 → 더보기(⋮) → "메일 필터링"
   - "라벨 적용" 선택 → 원하는 라벨 지정 → "필터 만들기"

### 2. Node.js 20 이상

```bash
node --version  # v20.0.0 이상 필요 (jsdom@29 의존성)
```

[Node.js 다운로드](https://nodejs.org/)

### 3. Google Cloud Console OAuth 설정

Gmail API에 접근하려면 OAuth 인증 정보가 필요합니다.

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 새 프로젝트 생성 (또는 기존 프로젝트 선택)
3. **API 및 서비스 → 라이브러리** → "Gmail API" 검색 → 사용 설정
4. (선택) Google Drive 업로드 기능을 사용하려면 "Google Drive API"도 함께 사용 설정
5. **API 및 서비스 → 사용자 인증 정보** → "사용자 인증 정보 만들기" → "OAuth 클라이언트 ID"
   - 애플리케이션 유형: "데스크톱 앱"
   - **승인된 리디렉션 URI**: `http://localhost:3000/callback` 추가
6. 생성된 JSON 파일을 다운로드하여 `config/credentials/client_secret.json`으로 저장
7. **OAuth 동의 화면 → "앱 게시(PUBLISH APP)"** 클릭하여 Production 모드로 전환 (필수)
   - Testing 모드: refresh token이 **7일 후 만료** → 자동화 운영 불가
   - Production 모드: 토큰 무기한 (revoke 전까지) → 자동화 적합
   - 개인 사용(100명 미만)은 Google 심사 없이 즉시 게시 가능
   - sensitive scope(Gmail readonly/modify/labels)는 미검증 상태로도 본인 사용에는 무제한

요청 권한 (스코프): Gmail readonly / labels / modify / settings.basic, Drive

### 4. OpenRouter API 키

LLM 호출에 사용되는 API 키입니다. 본 시스템은 **OpenRouter의 DeepSeek V4 Pro 모델(reasoning OFF)**을 사용합니다.

1. [OpenRouter](https://openrouter.ai) 가입
2. [API Keys](https://openrouter.ai/keys) 페이지에서 키 생성 → `.env`에 `OPENROUTER_API_KEY=...` 추가
3. (선택) `OPENROUTER_MODEL`로 모델 재정의

| 모델 | 용도 | 비고 |
|------|------|------|
| `deepseek/deepseek-v4-pro` | 추출, 구조 분석, 중복 병합 (전 단계) | reasoning OFF, 후보: `deepseek/deepseek-v4-flash`, `google/gemini-2.5-flash` |

> **참고**: OpenAI Chat Completions 호환 엔드포인트(`/api/v1/chat/completions`)를 사용합니다. JSON은 `response_format`으로 강제, 출력 16K 토큰 안전마진을 위해 청크 크기 8000자 제한 + 재시도(최대 90초 대기)로 대응합니다.

## 설치 및 설정

### Step 1. 프로젝트 다운로드

```bash
git clone https://github.com/yoonkumsung/yks-gmail-manager.git
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
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL=deepseek/deepseek-v4-pro

# 선택 (Telegram 알림 사용 시)
TELEGRAM_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

### Step 4. 사용자 프로필 설정 (선택)

`config/user_profile.json`에 직업과 관심사를 설정합니다. 이 정보는 라벨 에이전트의 `{{USER_CONTEXT}}` 플레이스홀더로 주입되어 추출 시 관심 분야 우선순위를 조정합니다 (필수는 아님).

`config/user_profile.example.json`을 복사해 작성할 수 있습니다:

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

### Step 5. 웹 마법사로 설정 완료 (선택)

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
# 기본 실행 (스케줄 모드: 전날 09:01 ~ 당일 09:00 KST)
npm run digest

# 오늘 (KST 0시 ~ 현재)
npm run digest -- --mode today

# 최근 24시간
npm run digest -- --mode last-24h

# 특정 날짜 (전날 0:00 ~ 당일 23:59 KST 범위)
npm run digest -- --mode custom --date 2026-01-30

# 특정 라벨만 처리
npm run digest -- --mode today --labels IT,경제
```

결과물은 `output/final/{YYYYMMDD}/` 폴더에 다음 파일들로 저장됩니다:

- `{YYMMDD}_{라벨명}_메일정리.md` — 라벨별 개별 MD (옵시디언/노션 등에 사용)
- `{YYMMDD}_통합_메일정리.html` — 모든 라벨 통합 HTML 리포트
- `{YYMMDD}_통합_메일정리.md` — 통합 MD 리포트 (필요 시 별도 LLM에 입력해 추가 분석)

## 작동 원리

```
1. Gmail 수집        Gmail API로 라벨별 뉴스레터 메일 가져오기 (중복 + 시간범위 필터)
       ↓
2. HTML → Text      HTML 메일을 구조화 마크다운으로 변환 + 원문 링크 크롤링 보강
       ↓
3. 새 발신자 감지    처음 보는 발신자는 적응형 학습이 SKILL 자동 생성 (분석+추출 동시)
       ↓
4. LLM 아이템 추출   DeepSeek V4 Pro + 라벨 에이전트 + 발신자별 SKILL로 핵심 추출
       ↓
5. 코드 사전필터링   Jaccard 유사도로 병합 후보만 추려서 LLM 호출 최적화
       ↓
6. LLM 중복 병합     Pro 모델이 후보 아이템들을 배치(15개)로 병합
       ↓
7. 최종 출력        HTML + Markdown 리포트 생성
```

- **증분 처리**: 중간에 중단되면 재실행 시 완료된 단계는 건너뛰고 이어서 처리합니다 (`progress.json`)
- **실패 격리**: 실패한 배치는 `failed_batches.json`에 기록되며, 다른 라벨/아이템 처리는 계속 진행
- **JSON 잘림 복구**: LLM 출력 토큰 부족으로 JSON이 끊긴 경우 자동으로 괄호 추정 및 복구

## 적응형 학습 (Adaptive Learning)

새로운 뉴스레터가 도착하면 시스템이 자동으로:

1. 발신자 이메일을 감지해 `config/newsletters.json` 카탈로그에 등록
2. 첫 메일을 분석 에이전트(`agents/뉴스레터분석.md`)에 보내 구조 분석 + 아이템 추출 동시 수행
3. 분석 결과로 `skills/newsletters/SKILL_{id}.md` 파일 자동 생성
4. 다음 메일부터는 생성된 SKILL을 활용해 정확한 추출 수행

GitHub Actions에서는 새로 생성된 SKILL 파일이 자동으로 commit & push 됩니다 (`contents: write` 권한 필요).

## GitHub Actions 자동화

매일 자동으로 뉴스레터를 정리하려면 GitHub Actions를 설정합니다.

### Secrets 설정

Repository → Settings → Secrets and variables → Actions에서 다음 Secrets를 추가합니다:

| Secret | 설명 | 필수 |
|--------|------|:----:|
| `OPENROUTER_API_KEY` | OpenRouter API 키 | O |
| `OPENROUTER_MODEL` | 모델 슬러그 (미설정 시 deepseek/deepseek-v4-pro) | - |
| `GMAIL_CREDENTIALS` | `client_secret.json`의 전체 내용 | O |
| `GMAIL_TOKEN` | `token.json`의 전체 내용 | O |
| `USER_PROFILE` | `user_profile.json`의 전체 내용 | X (권장) |
| `TELEGRAM_TOKEN` | Telegram Bot 토큰 | X |
| `TELEGRAM_CHAT_ID` | Telegram Chat ID | X |

### 자동 실행

- **시간**: 매일 KST 08:30 (GitHub Actions 지연 감안한 cron `30 23 * * *`)
- **범위**: schedule 모드 = 전날 09:01 ~ 당일 09:00 KST
- **결과 수신**:
  - Telegram으로 HTML + 통합 MD 파일 자동 전송 (Telegram Secrets 설정 시)
  - 시작/완료/에러 알림 자동 발송
  - GitHub Artifacts에서 30일간 다운로드 가능 (Actions 탭 → 해당 실행 → Artifacts)
- **소요시간**: 라벨 수와 뉴스레터 양에 따라 30분~4시간 (타임아웃: 6시간)

### 수동 실행

1. GitHub → Actions 탭 → "Gmail 메일 정리" 워크플로우
2. "Run workflow" 클릭
3. 실행 모드 선택 (today / last-24h / custom)
4. 필요 시 라벨 지정 (쉼표 구분)

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
      "focus_topics": ["AI", "LLM", "클라우드", "반도체", "빅테크"]
    }
  ]
}
```

- `gmail_label`: Gmail에서 사용하는 실제 라벨명 (공백은 자동으로 하이픈으로 치환됨)
- `sub_labels`: 포함할 하위 라벨
- `enabled`: `false`로 설정하면 해당 라벨 건너뜀
- `focus_topics`: LLM에게 우선 추출을 지시하는 관심 주제 (`{{FOCUS_TOPICS}}`로 에이전트에 주입)
- `agent`: 사용할 라벨 에이전트 파일 경로

새 라벨을 추가한 뒤 `agents/labels/{라벨명}.md`를 직접 생성하거나 `npm run setup` 마법사를 사용합니다.

### LLM 모델 변경

`scripts/orchestrator.js` 상단의 `CONFIG.models`에서 모델을 변경할 수 있습니다:

```javascript
const CONFIG = {
  concurrencyLimit: 3,    // 병렬 라벨 처리 수
  model: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-pro',   // 추출/분석/병합 전 단계
  mergeBatchSize: 15
};
```

- 단일 모델 사용 (DeepSeek V4 Pro, reasoning OFF). `.env`의 `OPENROUTER_MODEL`로 1줄 없이 재정의 가능.
- 모델 후보: `deepseek/deepseek-v4-flash`(저비용), `google/gemini-2.5-flash`(CJK 강). 목록: [openrouter.ai/models](https://openrouter.ai/models)

### 에이전트 / SKILL 수정

- `agents/labels/*.md` — 라벨별 추출 규칙 (16개)
- `agents/labels/_공통규칙.md` — 모든 라벨에 적용되는 공통 처리 규칙
- `agents/*.md` — 전역 에이전트 (`병합`, `뉴스레터분석`)
- `skills/SKILL_작성규칙.md` — 요약문 작성 보충 규칙
- `skills/newsletters/SKILL_*.md` — 발신자별 구조 분석 (적응형 학습이 자동 생성, 수동 편집도 가능)

수정한 SKILL이 카탈로그(`config/newsletters.json`)와 일치하는지는 `node scripts/validate_skills.js`로 검증할 수 있습니다 (`--live` 옵션으로 실제 추출 테스트).

## 문제 해결

### Gmail 인증 실패 (401 에러)

access_token은 1시간마다 만료되지만 googleapis 라이브러리가 refresh_token으로 자동 갱신합니다. 그래도 실패하면:

```bash
npm run refresh   # 수동 갱신 시도
```

`invalid_grant` 에러가 나면 refresh_token까지 무효화된 상태 → 토큰 파일 삭제 후 `npm run auth`로 재인증.

> Production 모드 게시 완료 상태라면 refresh_token은 만료되지 않음. revoke되거나 비밀번호 변경 같은 사용자 액션에서만 무효화됨.

### Rate Limit (429 에러) / Cloudflare 524 타임아웃

자동으로 재시도됩니다 (최대 7회, 5초→90초로 점진 대기). 524 타임아웃은 청크를 자동으로 더 작게 쪼개서 재시도합니다.

### 불완전한 JSON 응답 (토큰 끊김)

출력 토큰 부족(`done_reason: length`)으로 응답이 잘리는 경우 자동으로 복구합니다:
- 첫 번째 완전한 JSON 블록 추출 → 괄호 균형 추정 → 누락된 `}`, `]` 보완 → 필수 필드 검증
- 복구 성공 시 그대로 사용, 실패 시 더 작은 입력으로 재시도

### 중간에 중단된 경우

같은 날짜로 다시 실행하면 완료된 단계는 건너뛰고 이어서 처리합니다:

```bash
npm run digest -- --mode custom --date 2026-01-30
```

진행 상태는 `os.tmpdir()/yks-gmail-manager/{YYYYMMDD}/progress.json`에 저장됩니다. 실패 시 임시 폴더가 보존되어 디버깅이 가능합니다.

### 새 뉴스레터 SKILL 생성 실패

매우 긴 첫 메일은 단일 호출에서 토큰을 초과할 수 있습니다. 이 경우 `agents/뉴스레터분석.md`는 입력 자동 축소(80%→60%→40%)로 재시도합니다. 그래도 실패하면 해당 메일은 건너뛰고 다음 메일에서 다시 시도합니다.

### 초기 설정 누락

실행 시 누락된 설정(`token.json`, `OPENROUTER_API_KEY`, `labels.json`)을 자동 감지하고 안내 메시지를 출력합니다. 누락 항목이 있으면 `npm run setup`으로 웹 마법사를 통해 설정할 수 있습니다 (기본 포트 3030).

### 결과물 누적 정리

`output/final/` 폴더는 매일 새 디렉토리(`YYYYMMDD/`)가 누적됩니다. `.gitignore`되어 있어 저장소에는 안 들어가지만 디스크는 차지하므로 주기적으로 정리해 주세요:

```bash
# 90일 이상 된 결과물 삭제 (예시)
find output/final -maxdepth 1 -type d -mtime +90 -exec rm -rf {} +
```

## 디렉토리 구조

```
yks-gmail-manager/
├── agents/
│   ├── labels/             # 16개 라벨별 추출 에이전트
│   ├── 뉴스레터분석.md      # 신규 발신자 구조 분석 (적응형 학습)
│   └── 병합.md              # 중복 병합
├── skills/
│   ├── SKILL_작성규칙.md
│   └── newsletters/        # 발신자별 SKILL (적응형 학습이 자동 생성)
├── config/
│   ├── labels.json         # 라벨 정의 및 활성화 상태
│   ├── newsletters.json    # 발신자 → SKILL 매핑 카탈로그
│   ├── user_profile.json   # 사용자 직업/관심사 (라벨 에이전트 USER_CONTEXT용, 선택)
│   └── credentials/        # OAuth 자격증명 (gitignored)
├── scripts/
│   ├── orchestrator.js     # 메인 파이프라인
│   ├── agent_runner.js     # OpenRouter API 호출 + 청크 분할 + JSON 복구
│   ├── fetch_gmail.js      # Gmail API 래퍼
│   ├── html_to_text.js     # HTML → 구조화 마크다운 변환
│   ├── fetch_articles.js   # 원문 링크 크롤링 보강
│   ├── adaptive_learning.js # 신규 발신자 감지 + SKILL 자동 생성
│   ├── generate_html.js    # 최종 HTML 리포트 생성
│   ├── auth.js / refresh_token.js
│   ├── setup/              # 웹 마법사 (Express 서버)
│   └── validate_skills.js  # SKILL ↔ 카탈로그 정합성 검증
├── templates/              # AGENT_TEMPLATE.md, SKILL_TEMPLATE.md
├── tests/                  # 단위/통합/e2e 테스트
├── .github/workflows/      # daily-digest.yml
└── output/final/{YYYYMMDD}/ # 최종 결과물
```

## 라이선스

MIT License
