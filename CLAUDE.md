# yks-gmail-manager

## 프로젝트 목적

사용자가 구독하는 모든 뉴스레터의 정보를 **단 하나도 누락하지 않고**, 중복은 하나로 합쳐서, 쉽게 읽을 수 있는 다이제스트로 만드는 시스템.

인사이트/요약/분석 같은 부가 가공은 시스템에서 제거됨. 가공이 필요하면 생성된 MD 파일을 별도 LLM(Claude, ChatGPT 등)에 직접 넣어 처리하는 방식으로 분리.

## 핵심 원칙

1. **정보 누락 제로**: 모든 뉴스레터의 모든 뉴스 아이템을 빠짐없이 추출. 누락은 가장 큰 실패.
2. **중복 제거**: 같은 사건을 다루는 아이템은 가장 충실한 것 기준으로 병합. 다른 사건은 절대 병합하지 않음.
3. **완결된 요약**: 요약만 읽어도 원문을 안 봐도 될 정도로 핵심사실+수치+배경+시사점 포함. "원문 참조" 같은 회피 표현 금지.
4. **원문 보강**: 뉴스레터가 티저만 제공하고 링크로 전체 기사를 안내하는 경우, 링크를 따라가서 전문을 가져와 요약에 반영.

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

## 라벨 구조 (15개 활성)

IT, 경제, 시사, 창업, 투자, 해외, 마케팅, 라이프, 인문학, 스포츠, 소셜포럼, 기타, NYT, 미국, 중국

(`쇼핑결제`, `지원사업`은 `config/labels.json`에서 `enabled: false`)

## SKILL 시스템

- `skills/newsletters/SKILL_*.md`: 뉴스레터별 구조 분석 및 추출 규칙
- `config/newsletters.json`: 뉴스레터 카탈로그 (발신자→SKILL 매핑)
- SKILL 파일의 발신자 정보는 반드시 newsletters.json과 일치해야 함
- 검증: `node scripts/validate_skills.js` (정적), `--live` (실제 추출 테스트)

## 품질 기준

- **할루시네이션 제로**: 입력 텍스트에 없는 수치, 인물, 사실을 절대 생성하지 않음
- **요약**: 원문 분량 비례 (긴 원문 300~500자, 짧은 원문은 50~200자도 허용). 핵심사실+수치+배경 포함
- **누락 제로**: 뉴스레터 본문의 모든 뉴스 아이템을 빠짐없이 추출
- **금지 표현**: "원문 참조", "자세한 내용은 링크" 등 회피 표현 불가
- **번역 품질**: 영문 → 한국어 직역 금지, 자연스러운 의역

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

## 자체 품질 테스트 프로토콜

코드/프롬프트/SKILL 수정 후 반드시 아래 프로세스를 따른다:

1. **Haiku를 LLM으로 사용**하여 추출 프로세스 실행 (프로덕션 OpenRouter 대용)
2. **해당 날짜의 모든 뉴스레터 × 모든 아이템** 대상 (일부 샘플링 금지)
3. Haiku 추출 결과를 **직접 원문 메일을 읽고 확인한 내용과 1:1 비교**
4. 누락 아이템, 금지 표현, 할루시네이션, 번역 품질을 하나하나 체크
5. 문제 발견 시 SKILL/프롬프트/파싱 코드 즉시 수정 → 재테스트
6. 몇 개만 뽑아서 하면 안 됨. 전수 검사.

## 전수 디버깅·근본원인 프로세스 (품질 문제 조사 시)

리포트 품질 문제를 조사할 땐 표본/추측으로 끝내지 말고 아래 순서로 **전수**로 간다. (2026-06 조사에서 정립; 산출물은 `작업현황.md` → `보완계획.md` → `docs/분석_근본원인.md` → `docs/품질대조_*/`)

1. **코드 정독**: orchestrator·agent_runner·fetch_gmail·fetch_articles·html_to_text·render_report·generate_index_page 전 경로를 읽고 데이터 흐름 파악.
2. **실제 데이터로 정량 분석**: `output/backfill/<날짜>/`의 **병합 전(items) vs 병합 후(merged)** 를 스크립트로 비교 — 출처 누락/정크/중복/번역/누락을 수치화. (가설을 데이터로 검증·반증)
3. **구조 전수 census(스크립트, 결정적)**: 라벨 에이전트(파손=백슬래시 단독줄)·SKILL 101개(언어플래그·번역규칙)·카탈로그 structure를 100% 검사. validate_skills로는 부족.
4. **콘텐츠 전수 대조(병렬 에이전트)**: 라벨별/뉴스레터별로 추출 items를 원문 `clean_text`와 1:1 대조(누락·할루·번역·정크·중복·출처·완결성). **표본 금지·전건**, 결과는 임시폴더 말고 `docs/품질대조_*/`에 영구 기록.
5. **발신자 전수 집계**: 30일 백필 clean의 `from`으로 등장 발신자 전수 → 카탈로그 orphan / 미등장 / 멀티주소 누락 규명.
6. **0건 라벨 직접 확인**: 백필 0건은 silent 실패일 수 있음 → Gmail API로 라벨별 실제 볼륨 조회해 **죽은 라벨 vs fetch 실패** 구분(RC-Q).
7. **근본원인으로 수렴**: 증상을 RC로 묶고, 각 RC를 **LLM이 풀 문제 / 룰베이스(코드·JSON)로 결정할 문제**로 분류. 출처·라벨·중복·정크·렌더모드는 룰, 요약·번역·의미병합은 LLM.

원칙: "라벨 하나 0건"이나 "표본 통과"를 정상으로 넘기지 말 것. 고볼륨 라벨(NYT 등)이 silent하게 통째 빠질 수 있다.

## OAuth 설정

Google OAuth는 **프로덕션 단계** 게시 완료 — refresh_token이 만료되지 않음.

- 사용자 한도: 100명 (Google 미검증 sensitive scope 앱의 일반 제한, 개인 사용엔 무관)
- access_token은 1시간 만료되지만 googleapis 라이브러리가 자동 갱신
- 새 환경에 토큰 옮길 때만 `npm run auth` 또는 `npm run refresh` 실행
- token.json 분실 시: `npm run auth`로 재발급
