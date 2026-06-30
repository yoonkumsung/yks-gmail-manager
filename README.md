# yks-gmail-manager

> Gmail 뉴스레터를 매일 자동으로 추출·중복 제거하여 HTML/Markdown 다이제스트로 만드는 시스템

구독 중인 모든 뉴스레터를 라벨별로 수집하고, **OpenRouter의 DeepSeek V4 Pro**가 핵심 아이템을 빠짐없이 추출·중복 병합하여 깔끔한 리포트로 만듭니다. 인사이트·트렌드 종합 같은 추가 가공은 시스템에서 분리되어 있으며, 필요하면 생성된 MD를 별도 LLM에 넣어 처리합니다.

## 주요 기능

- **AI 추출**: DeepSeek V4 Pro가 뉴스레터에서 핵심 아이템을 누락 없이 추출
- **라벨별 병렬 처리**: Gmail 라벨 기준 21개 영역(IT·경제·시사·NYT 등) 동시 처리
- **자동 중복 제거**: 코드 사전필터(Jaccard 유사도) + LLM 병합으로 같은 뉴스를 하나로 통합
- **적응형 SKILL 학습**: 새 뉴스레터를 자동 감지해 발신자별 구조 분석 SKILL 자동 생성
- **2단 tier 표시**: 본문이 충실하면 완결 요약(카드), 티저뿐이면 한 줄 요약 + 원문 링크 위임(간단 소식). 원문 링크 크롤링은 옵션(`ENABLE_CRAWL`, 기본 off)
- **증분 처리**: 중간 실패 시 완료된 단계는 건너뛰고 이어서 처리
- **서버 자동 운영**: 노트북 systemd 타이머가 매일 정시 실행 → gh-pages 발행 + Google Drive 업로드 + Telegram 전송

## 사전 준비

### 1. Gmail 라벨 분류 (필수)

> 이 시스템은 **Gmail 라벨로 분류된** 뉴스레터를 처리합니다. 라벨이 없으면 작동하지 않습니다.

뉴스레터를 주제별 라벨로 분류하세요. 활성 라벨 21개는 지역·주제 체계로 구성됩니다(예: `IT`, `경제`, `시사`, `스타트업`, `투자`, `마케팅`, `라이프`, `인문학`, `스포츠`, `소셜포럼`, `지원사업`, `기타`, `NYT_시사/경제/라이프`, `미국_시사/경제`, `중국_시사/경제`, `글로벌_시사/경제`). 하위 라벨(예: `IT/AI`)도 지원됩니다.

**전체 목록·정의는 `config/labels.json`이 단일 소스입니다.**

라벨 설정: Gmail 설정 → 라벨 생성 → 각 뉴스레터에 필터를 만들어 자동 라벨 적용(메일 열기 → 더보기 → "메일 필터링" → "라벨 적용").

### 2. Node.js 20 이상

```bash
node --version   # v20.0.0 이상 (jsdom 의존성)
```

### 3. Google Cloud OAuth

1. [Google Cloud Console](https://console.cloud.google.com/) → 프로젝트 생성
2. **API 및 서비스 → 라이브러리** → "Gmail API" 사용 설정 (Drive 업로드 쓰면 "Google Drive API"도)
3. **사용자 인증 정보 → OAuth 클라이언트 ID** → 유형 "데스크톱 앱", 리디렉션 URI `http://localhost:3000/callback`
4. 다운로드한 JSON을 `config/credentials/client_secret.json`으로 저장
5. **OAuth 동의 화면 → "앱 게시(Production)"** (필수)
   - Testing 모드는 refresh token이 7일 후 만료 → 자동화 불가
   - Production은 토큰 무기한(revoke 전까지). 개인 사용(100명 미만)은 심사 없이 즉시 게시 가능

요청 스코프: Gmail readonly / labels / modify / settings.basic (+ Drive)

### 4. OpenRouter API 키

본 시스템은 **OpenRouter의 DeepSeek V4 Pro(reasoning OFF)** 단일 모델을 사용합니다.

1. [OpenRouter](https://openrouter.ai) 가입 → [API Keys](https://openrouter.ai/keys)에서 키 생성
2. `.env`에 `OPENROUTER_API_KEY=...` 추가, (선택) `OPENROUTER_MODEL`로 재정의

| 모델 | 용도 | 비고 |
|------|------|------|
| `deepseek/deepseek-v4-pro` | 추출·구조분석·병합 전 단계 | reasoning OFF. 후보: `deepseek/deepseek-v4-flash`(저비용), `google/gemini-2.5-flash` |

> OpenAI Chat Completions 호환 엔드포인트(`/api/v1/chat/completions`). JSON은 `response_format`으로 강제, 출력 16K 토큰 마진을 위해 청크 8000자 + 재시도(최대 90초)로 대응.

## 설치 및 설정

```bash
git clone https://github.com/yoonkumsung/yks-gmail-manager.git
cd yks-gmail-manager
npm install

npm run auth     # Gmail OAuth → config/credentials/token.json 생성
```

`.env` 생성:

```env
OPENROUTER_API_KEY=your_key
OPENROUTER_MODEL=deepseek/deepseek-v4-pro

# 선택 (서버 운영 시)
TELEGRAM_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
GDRIVE_FOLDER_ID=your_drive_folder_id
```

(선택) `npm run setup` — 웹 마법사(포트 3030)에서 라벨 선택·뉴스레터 구조 분석·라벨 에이전트 생성을 안내.

## 실행 방법

```bash
npm run digest                                   # schedule 모드: 전날 09:41~당일 09:40 KST
npm run digest -- --mode today                   # 오늘 (KST 0시~현재)
npm run digest -- --mode last-24h                # 최근 24시간
npm run digest -- --mode custom --date 2026-01-30  # 특정 날짜(전날 0:00~당일 23:59 KST)
npm run digest -- --mode today --labels IT,경제   # 특정 라벨만
```

결과물은 `output/final/{YYYYMMDD}/`:

- `{YYMMDD}_{라벨}_메일정리.md` — 라벨별 개별 MD
- `{YYMMDD}_통합_메일정리.html` — 통합 HTML 리포트
- `{YYMMDD}_통합_메일정리.md` — 통합 MD (필요 시 별도 LLM 입력용)

## 작동 원리

```
1. Gmail 수집      라벨별 메일 가져오기 (중복 + 시간범위 필터)
       ↓
2. HTML → Text    구조화 마크다운 변환 (원문 링크 크롤링은 옵션 ENABLE_CRAWL, 기본 off)
       ↓
3. 새 발신자 감지   처음 보는 발신자는 적응형 학습이 SKILL 자동 생성
       ↓
4. LLM 추출        DeepSeek V4 Pro + 라벨 에이전트 + 발신자 SKILL로 핵심 추출 (청크 분할)
       ↓
5. 코드 사전필터    Jaccard 유사도로 병합 후보만 추려 LLM 호출 최적화
       ↓
6. LLM 병합        후보 아이템을 배치(15개)로 중복 병합
       ↓
7. 리포트 렌더링   render_report.js가 통합 HTML + MD 생성
```

- **증분 처리**: 중단 후 같은 날짜로 재실행하면 완료 단계를 건너뜀 (`progress.json`)
- **실패 격리**: 실패 배치는 `failed_batches.json`에 기록, 나머지 처리는 계속 진행
- **JSON 잘림 복구**: 출력 토큰 부족으로 끊긴 JSON은 괄호 균형 추정 + 필수 필드 검증으로 복구

진행/임시 데이터는 `os.tmpdir()/yks-gmail-manager/{YYYYMMDD}/`에 저장되며, 성공 시 삭제(디버깅 보존은 `KEEP_TEMP=1`).

## 서버 자동 운영

GitHub Actions는 제거되었고, **노트북(WSL Ubuntu)의 systemd user 타이머**가 매일 정시(09:40 KST)에 `scripts/run_digest.sh`를 실행합니다. 셋업은 `docs/SERVER_SETUP.md` 참조.

`run_digest.sh` 7단계:

1. `git pull` (코드 최신화)
2. `npm install`
3. `node scripts/orchestrator.js --mode schedule` (추출 파이프라인)
4. 자동 생성된 SKILL/카탈로그를 `git commit & push origin main`
5. **gh-pages 발행** — 통합 HTML을 `reports/{날짜}.html`로 커밋·푸시 (worktree 사용)
6. **Google Drive 업로드** — 통합 MD (`GDRIVE_FOLDER_ID` 설정 시)
7. **Telegram 전송** — 완료 알림 + HTML/MD 파일 첨부 (실패 시 에러 알림)

> 처리 0건이면 발행/업로드를 건너뛰고 "처리할 뉴스레터 없음" 알림만 전송합니다.

## 적응형 학습

새 뉴스레터가 도착하면 자동으로:

1. 발신자를 `config/newsletters.json` 카탈로그에 등록
2. 첫 메일을 분석 에이전트(`agents/뉴스레터분석.md`)로 구조 분석 + 추출 동시 수행
3. `skills/newsletters/SKILL_{id}.md` 자동 생성
4. 다음 메일부터 생성된 SKILL로 정확히 추출

생성된 SKILL은 `run_digest.sh` 4단계에서 `git push origin main`으로 자동 커밋됩니다.

## 커스터마이징

### 라벨 추가/변경 — `config/labels.json`

```json
{
  "labels": [
    { "name": "IT", "gmail_label": "IT", "sub_labels": ["IT/AI"], "enabled": true, "agent": "agents/labels/IT.md" }
  ]
}
```

- `gmail_label`: 실제 Gmail 라벨명 (공백은 하이픈으로 치환)
- `sub_labels`: 포함할 하위 라벨 / `enabled: false`: 건너뜀 / `agent`: 라벨 에이전트 경로

새 라벨은 `agents/labels/{라벨}.md`를 직접 만들거나 `npm run setup` 사용.

### 모델 변경 — `scripts/orchestrator.js`

```javascript
const CONFIG = {
  concurrencyLimit: 3,                                              // 병렬 라벨 수
  model: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-pro',
  mergeBatchSize: 15
};
```

`.env`의 `OPENROUTER_MODEL`로 코드 수정 없이 재정의. 후보: `deepseek/deepseek-v4-flash`, `google/gemini-2.5-flash` ([목록](https://openrouter.ai/models)).

### 에이전트 / SKILL

- `agents/labels/*.md` — 라벨별 추출 규칙
- `agents/labels/_공통규칙.md` — 모든 라벨 공통 규칙
- `agents/병합.md`, `agents/뉴스레터분석.md` — 전역 에이전트
- `skills/SKILL_작성규칙.md` — 요약 작성 보충 규칙
- `skills/newsletters/SKILL_*.md` — 발신자별 구조 분석 (적응형 자동 생성, 수동 편집 가능)

정합성 검증: `node scripts/validate_skills.js` (`--live`로 실제 추출 테스트).

## 문제 해결

| 증상 | 대응 |
|------|------|
| **Gmail 401 / 인증 실패** | `npm run refresh`. `invalid_grant`이면 token 삭제 후 `npm run auth` 재인증. Production 게시 상태면 refresh_token은 revoke 전까지 무만료. |
| **429 / Cloudflare 524** | 자동 재시도(최대 7회, 5→90초). 524는 청크를 더 작게 쪼개 재시도. |
| **JSON 잘림 (토큰 끊김)** | 첫 완전 JSON 블록 추출 → 괄호 균형 추정 → 필수 필드 검증. 실패 시 더 작은 입력으로 재시도. |
| **중단 후 재개** | 같은 날짜로 재실행하면 완료 단계 건너뜀. 실패 시 임시 폴더 보존됨. |
| **새 SKILL 생성 실패** | 매우 긴 첫 메일은 입력 자동 축소(80→60→40%)로 재시도, 그래도 실패면 건너뛰고 다음 메일에서 재시도. |
| **초기 설정 누락** | 누락 항목(`token.json`, `OPENROUTER_API_KEY`, `labels.json`) 자동 감지·안내. `npm run setup`(포트 3030)으로 설정. |
| **결과물 누적** | `output/final/`(gitignored)은 매일 누적 → 주기적 정리: `find output/final -maxdepth 1 -type d -mtime +90 -exec rm -rf {} +` |

## 디렉토리 구조

```
yks-gmail-manager/
├── agents/
│   ├── labels/             # 라벨별 추출 에이전트 + _공통규칙.md
│   ├── 뉴스레터분석.md      # 신규 발신자 구조 분석 (적응형 학습)
│   └── 병합.md              # 중복 병합
├── skills/
│   ├── SKILL_작성규칙.md
│   └── newsletters/        # 발신자별 SKILL (적응형 자동 생성)
├── config/
│   ├── labels.json         # 라벨 정의·활성화 (단일 소스)
│   ├── newsletters.json    # 발신자 → SKILL 매핑 카탈로그
│   └── credentials/        # OAuth 자격증명 (gitignored)
├── scripts/
│   ├── orchestrator.js     # 메인 파이프라인
│   ├── agent_runner.js     # OpenRouter 호출 + 청크 분할 + JSON 복구
│   ├── fetch_gmail.js      # Gmail API 래퍼
│   ├── html_to_text.js     # HTML → 구조화 마크다운
│   ├── fetch_articles.js   # 원문 링크 크롤링 보강
│   ├── adaptive_learning.js # 신규 발신자 감지 + SKILL 생성
│   ├── render_report.js    # 통합 HTML/MD 리포트 렌더링
│   ├── upload_to_drive.js  # Google Drive 업로드
│   ├── auth.js / refresh_token.js
│   ├── run_digest.sh       # 서버 정시 실행 스크립트 (systemd)
│   ├── setup/              # 웹 마법사 (Express, 포트 3030)
│   └── validate_skills.js  # SKILL ↔ 카탈로그 정합성 검증
├── tests/                  # 단위/통합/e2e 테스트
├── .github/workflows/      # test.yml (CI)
└── output/final/{YYYYMMDD}/ # 최종 결과물 (gitignored)
```

## 라이선스

MIT License
