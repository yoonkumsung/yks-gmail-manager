# Gmail 뉴스레터 다이제스트 시스템

> LLM 기반 Gmail 뉴스레터 자동 정리 및 요약

## 특징

- **자동 설정**: 사용자 프로필 기반 Agent 자동 생성
- **LLM 기반 분석**: OpenRouter API (Solar Pro) 사용
- **개인화된 인사이트**: 사용자 관심사 반영
- **라벨별 정리**: Gmail 라벨로 뉴스레터 분류
- **병렬 처리**: 여러 라벨 동시 처리
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

개인화된 Agent가 자동 생성되어:
- IT 라벨: 사용자 기술 관심사 기반 뉴스 우선 추출
- 인사이트: 사용자 지적 관심사와 연결

#### 수동 설정 (선택)

마법사 없이 직접 Agent 파일을 작성하려면 `agents/labels/{label}.md` 파일을 생성합니다:

```markdown
# IT 에이전트

당신은 IT 뉴스 분석 전문가입니다.

## 역할
기술, AI, 스타트업 뉴스레터에서 중요한 정보를 추출합니다.

## 추출 규칙
1. 제목: 간결하고 명확하게 (15자 이내)
2. 요약: 핵심 내용만 2-3문장
3. 키워드: 3-5개

## 출력 형식
JSON:
{
  "items": [
    { "title": "...", "summary": "...", "keywords": ["..."] }
  ]
}
```

### 5. 라벨 설정 (선택)

`config/labels.json`에서 원하는 라벨만 활성화:
```json
{
  "labels": [
    { "name": "IT", "enabled": true },
    { "name": "경제", "enabled": true },
    { "name": "문화", "enabled": false }
  ]
}
```

### 6. 실행

```bash
# 기본 실행 (최근 24시간)
npm run digest

# 특정 날짜
npm run digest -- --mode custom --date 2026-01-30

# 오늘 (0시~현재)
npm run digest -- --mode today
```

## 작동 방식

### 파이프라인

```
1. Gmail 수집 (Node.js)
   → output/runs/{run_id}/raw/{label}/msg_*.json

2. HTML → Text 변환
   → output/runs/{run_id}/clean/{label}/clean_*.json

3. LLM 아이템 추출 (Agent 사용)
   → output/runs/{run_id}/items/{label}/items_*.json

4. 병합 및 중복 제거
   → output/runs/{run_id}/merged/{label}/merged.json

5. 최종 출력 (이중 인사이트 포함)
   → output/runs/{run_id}/final/{label}.md
   → output/runs/{run_id}/final/{label}.html
```

### Agent 시스템 (자동 생성)

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
- 예: "빅테크 커스텀 칩 트렌드. NPU 설계 내재화로 성능 차별화 기회"

**Insight B (교차 도메인)**:
- 사용자의 비관련 관심사와 연결
- 철학적 각도, 창의적 종합
- 예: "기술 주권의 경제학. 푸코의 권력 분산 개념과 유사"

## 프로젝트 구조

```
gmail-manager/
├── README.md                    # 이 파일
├── SPEC.md                      # 기술 명세서
│
├── .github/workflows/
│   └── daily-digest.yml         # GitHub Actions 설정
│
├── config/
│   ├── credentials/             # Gmail 인증
│   │   ├── client_secret.json
│   │   └── token.json
│   ├── labels.json              # 라벨 설정
│   ├── user_profile.json        # [NEW] 사용자 프로필 (자동 생성)
│   └── newsletters.json         # [NEW] 뉴스레터 목록 (자동 생성)
│
├── agents/
│   ├── labels/                  # [NEW] 라벨별 Agent (자동 생성)
│   │   ├── IT.md
│   │   ├── 경제.md
│   │   └── ...
│   ├── 병합.md                   # 중복 제거 Agent
│   ├── 인사이트.md               # 이중 인사이트 생성 Agent
│   └── 출력.md                   # 출력 형식 참조용
│
├── skills/
│   └── newsletters/             # [NEW] 뉴스레터별 SKILL (자동 생성)
│       ├── SKILL_작성규칙.md
│       ├── SKILL_더밀크.md
│       └── ...
│
├── scripts/
│   ├── orchestrator.js          # 메인 파이프라인
│   ├── agent_runner.js          # LLM API 호출
│   ├── fetch_gmail.js           # Gmail 수집 (Node.js)
│   ├── adaptive_learning.js     # 새 뉴스레터 자동 감지
│   ├── html_to_text.js          # HTML 변환
│   ├── generate_html.js         # 최종 출력 생성
│   └── setup/                   # [NEW] 웹 기반 설정 마법사
│       ├── server.js            # Express 웹 서버
│       ├── wizard.js            # 마법사 백엔드 로직
│       ├── newsletter_analyzer.js  # 이메일 분석
│       ├── skill_generator.js   # SKILL 자동 생성
│       ├── agent_generator.js   # Agent 자동 생성
│       ├── validator.js         # 품질 검증
│       └── public/              # [NEW] 웹 UI
│           ├── index.html       # 마법사 페이지
│           ├── style.css
│           └── app.js
│
└── output/
    └── runs/{run_id}/           # 실행 결과
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

- **시간**: 매일 오전 11시 KST
- **범위**: 최근 24시간
- **결과**: GitHub Artifacts + Telegram 알림 (선택)

### 수동 실행

1. GitHub → Actions 탭
2. "Gmail 메일 정리" 워크플로우 선택
3. "Run workflow" 클릭
4. 실행 모드 선택 (today, last-24h, custom)

## 개발 상태

### 구현 완료 O
- Gmail 수집 파이프라인 (Node.js)
- HTML → Text 변환
- LLM 아이템 추출 (OpenRouter Solar Pro)
- Markdown/HTML 출력
- GitHub Actions 워크플로우
- **웹 기반 설정 마법사** (`npm run setup`)
- **Agent/SKILL 자동 생성**
- **이중 인사이트 시스템** (도메인 관련 + 교차 도메인)
- **병합 로직** (agents/병합.md 호출)

### 최근 추가 [NEW]
- **적응형 학습**: 새 뉴스레터 자동 감지 및 SKILL 생성
- **Node.js Gmail 수집**: PowerShell 대체로 크로스 플랫폼 지원
- **SKILL 자동 매칭**: 발신자 기반 적절한 SKILL 선택

자세한 내용은 [SPEC.md](./SPEC.md) 섹션 3 참조.

## 커스터마이징

### LLM 모델 변경

`scripts/agent_runner.js`에서 모델 수정:
```javascript
const MODEL = 'upstage/solar-pro';  // 기본값

// 다른 모델 옵션:
// 'anthropic/claude-3.5-haiku'
// 'google/gemini-2.0-flash-exp'
// 'openai/gpt-4o-mini'
```

OpenRouter 모델 목록: https://openrouter.ai/models

## 로그 및 디버깅

### 로그 위치

- 로컬: `output/runs/{run_id}/logs/{date}.log`
- GitHub Actions: Actions 탭에서 워크플로우 실행 로그 확인

### 주요 로그 패턴

```
[INFO] === IT 에이전트 실행 ===
[WARN] Rate Limit 도달, 6000ms 후 재시도 (1/3)
[ERROR] JSON 형식을 찾을 수 없습니다
```

### 문제 해결

**Gmail 인증 실패 (401)**:
```bash
npm run refresh
```

**한글 깨짐**:
- Windows에서 실행 시 인코딩 문제 가능
- 해결 방법은 [SPEC.md](./SPEC.md) 부록 9.1 참조

**Rate Limit 429**:
- 동시 요청 과다
- `agent_runner.js`에서 Rate Limiter 설정 확인

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
