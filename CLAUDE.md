# yks-gmail-manager

## 🟢 세션 시작 절차 (작업 착수 전 필수)

본격적인 작업 전에 순서대로:

1. **`MEMORY.md` 먼저 읽기** — 개발 히스토리·과거 문제와 개선·미해결 근본원인(RC)·진행 중 결정이 모두 거기에 있다. 이 문서 없이 작업하면 이미 규명된 문제를 다시 판다.
2. **이 `CLAUDE.md` 통독** — 핵심 원칙·아키텍처·모델 전략·수정 시 주의사항.
3. **코드베이스 현황 파악** — 손대려는 경로(orchestrator·agent_runner·fetch_*·render_report 등)와 `config/labels.json`(라벨 단일 소스)·`config/newsletters.json`을 읽고 데이터 흐름 확인.
4. 작업 종료 시 의미 있는 변화(문제 발견·수정·결정)는 **`MEMORY.md`에 갱신**한다.

## 프로젝트 목적

사용자가 구독하는 모든 뉴스레터의 정보를 **단 하나도 누락하지 않고**, 중복은 하나로 합쳐서, 쉽게 읽을 수 있는 다이제스트로 만드는 시스템.

인사이트/요약/분석 같은 부가 가공은 시스템에서 제거됨. 가공이 필요하면 생성된 MD 파일을 별도 LLM(Claude, ChatGPT 등)에 직접 넣어 처리하는 방식으로 분리.

## 핵심 원칙 / 품질 기준

1. **정보 누락 제로**: 모든 뉴스레터의 모든 뉴스 아이템을 빠짐없이 추출. 누락은 가장 큰 실패.
2. **중복 제거**: 같은 사건을 다루는 아이템은 가장 충실한 것 기준으로 병합. 다른 사건은 절대 병합하지 않음.
3. **완결된 요약**: 요약만 읽어도 원문을 안 봐도 될 정도로 핵심사실+수치+배경+시사점 포함. 분량은 원문 비례(긴 원문 300~500자, 짧은 원문 50~200자). "원문 참조"·"자세한 내용은 링크" 등 회피 표현 금지.
4. **원문 보강**: 티저만 제공하고 링크로 전체 기사를 안내하면, 링크를 따라가 전문을 가져와 요약에 반영.
5. **할루시네이션 제로**: 입력 텍스트에 없는 수치·인물·사실을 절대 생성하지 않음.
6. **번역 품질**: 영문 → 한국어 직역 금지, 자연스러운 의역.

## 아키텍처

```
Gmail → HTML→텍스트 → 원문링크 크롤링 → LLM 추출 → LLM 병합 → HTML/MD 리포트
```

## 모델 전략 (OpenRouter)

- **프로바이더: OpenRouter** (OpenAI Chat Completions 호환, 2026-06 도입).
- **단일 모델** (`deepseek/deepseek-v4-pro`, **reasoning OFF**): 추출, 분석, 병합 전 단계에 사용. `OPENROUTER_MODEL` env로 재정의 가능(후보: `deepseek/deepseek-v4-flash`, `google/gemini-2.5-flash`).
- 추론(thinking)은 추출/병합에 불필요 → `reasoning:{enabled:false}`로 비활성화(비용·지연 절감).
- 출력 16K 토큰 안전마진 위해 청크 크기 8000자 유지. (OpenRouter는 게이트웨이 타임아웃 제약 없음.)
- 인증: `.env`의 `OPENROUTER_API_KEY`. JSON 강제는 `response_format:{type:'json_object'}`.

## 라벨 구조 (21개 활성)

IT, 경제, 시사, 스타트업, 투자, 마케팅, 라이프, 인문학, 스포츠, 소셜포럼, 지원사업, 기타, NYT_시사, NYT_경제, NYT_라이프, 미국_시사, 미국_경제, 중국_시사, 중국_경제, 글로벌_시사, 글로벌_경제

- 해외 매체는 `지역_주제` 체계로 분화(NYT/미국/중국/글로벌 × 시사·경제, NYT는 라이프 포함).
- 비활성은 `쇼핑결제` 1개뿐(`config/labels.json`의 `enabled:false`). **단일 소스는 labels.json** — 이 목록과 어긋나면 labels.json이 정답.

## SKILL 시스템

- `skills/newsletters/SKILL_*.md`: 뉴스레터별 구조 분석 및 추출 규칙
- `config/newsletters.json`: 뉴스레터 카탈로그 (발신자→SKILL 매핑)
- SKILL 파일의 발신자 정보는 반드시 newsletters.json과 일치해야 함
- 검증: `node scripts/validate_skills.js` (정적), `--live` (실제 추출 테스트)

## 알려진 이슈

- OpenRouter 5xx/429: 서버 부하·rate limit 시 발생, 재시도로 대응
- PDF 뉴스레터 (센서블박스): 텍스트 추출 불가 → 비활성화
- 청크 경계 잘림: 불완전 아이템(50자 미만) 자동 제거

## 코드 수정 시 주의사항

- `agent_runner.js` 수정 시: 금지 표현 목록 유지, 할루시네이션 방지 규칙 유지, 청크 크기 8K (출력 토큰 16K의 ~25% 사용률). LLM 호출은 `callOpenRouter` 단일 지점(OpenAI 호환).
- `orchestrator.js` 수정 시: 단일 `runner`(OpenRouter) 사용. 멀티모델 재도입 시 `getRunner` 분기 필요
- SKILL 파일 수정 시: 발신자 이메일이 newsletters.json과 반드시 일치, 실제 메일 본문을 읽고 작성
- 새 라벨 추가 시: labels.json + agents/labels/*.md + (필요 시) newsletters.json 업데이트
- 타임아웃: OpenRouter 호출 5분 abort + 재시도(대기 5~90초), Gmail API = 재시도 2~30초

## 실행

```bash
npm run digest          # 전체 파이프라인 실행
npm run auth            # Gmail OAuth 인증
node scripts/validate_skills.js --live  # SKILL 전수 검증
```

## 품질 검증 / 전수 디버깅

품질 테스트·전수 대조·근본원인 조사 절차는 **`digest-quality-audit` 스킬**로 분리됨(`.claude/skills/digest-quality-audit/SKILL.md`). 코드/프롬프트/SKILL 수정 후 품질 검증, 또는 리포트 품질 문제 조사 시 자동 로드된다.

- **핵심 원칙(요약)**: 표본/추측 금지 → **원문 메일과 1:1 전수 대조**. 모든 로그·중간 산출물 빠짐없이 보존(`KEEP_TEMP=1`, `_run_stats.json` 토큰기록, `run.log` 리다이렉트). silent 삭제·요약 금지.
- 상세 6단계(Haiku 전수 테스트) + 7단계(전수 census·콘텐츠 대조·발신자 집계·0건 라벨 확인·RC 수렴)는 스킬 본문 참조.

## OAuth 설정

Google OAuth는 **프로덕션 단계** 게시 완료 — refresh_token이 만료되지 않음.

- 사용자 한도: 100명 (Google 미검증 sensitive scope 앱의 일반 제한, 개인 사용엔 무관)
- access_token은 1시간 만료되지만 googleapis 라이브러리가 자동 갱신
- 새 환경에 토큰 옮길 때만 `npm run auth` 또는 `npm run refresh` 실행
- token.json 분실 시: `npm run auth`로 재발급
