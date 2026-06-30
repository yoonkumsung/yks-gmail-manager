# MEMORY — 개발 히스토리·결정·미해결 (세션 시작 시 필독)

> 새 세션은 **이 문서부터 읽는다.** 그동안 무엇이 문제였고, 어떻게 고쳤고, 지금 무엇이 열려 있는지의 단일 기록.
> 시스템 규칙·아키텍처는 `CLAUDE.md`, 사용/운영은 `README.md`. 이 문서는 **히스토리와 의사결정**만 담는다.
> 최종 갱신: 2026-06-25

---

## 한 줄 현재 상태

인프라 마이그레이션(OpenRouter + 노트북 systemd)은 완료. **2026-06-14에 규명한 품질 근본원인 18개(RC-A~R)의 코드 수정(보완계획 Phase 0~5)은 대부분 미착수.** 2026-06-25 현재 신선한 OpenRouter 런으로 재감사 진행 중이며, 그 결과로 우선순위를 재확정한다.

---

## 개발 타임라인

### 2026-05 (대량 품질 반복)
- Haiku 전수 테스트 프로토콜 확립(`e24b773`). 79개 뉴스레터 전수 감사 → SKILL 20개+ 대량 수정(`230c8fc`).
- 파손 에이전트 파일 완성, 중복제거 버그 수정(`f806578`), 금지표현 프롬프트 예시 기반 전면 재작성(`4966cb8`).
- NYT 단일기사 에디션 0개 추출 방지(`ec372c9`), custom 모드 시간범위 확장으로 마케팅/라이프 누락 해결(`920c979`).
- 인사이트 가공 제거 + 모델 단일화 + 리포트 토스 UI화(`bad92af`). OAuth Production 게시 완료(`844a526`).

### 2026-06-01 (라벨 체계 재편 + production 발행)
- **라벨 체계 재편**: 지역_주제 중첩(NYT/미국/중국/글로벌 × 시사·경제) + 스타트업·지원사업 도입(`1be75a5`). 옛 15라벨(창업·해외·NYT 단일) → 현재 21활성.
- gh-pages + Google Drive 자동 발행 연결(`e25c0d6`), 라벨 중복 가드 + JSON 강제(`8ba488a`).

### 2026-06-14 (품질 전수 분석 — 문서만, 코드 미구현)
- 6/1 리포트의 사용자 지적 16개 → 파이프라인 전 코드+실제 데이터+전 뉴스레터 전수 조사 → **근본원인 18개(RC-A~R)** 규명, 보완계획 Phase 0~5 확정(`287f3a6`).
- **중요: 이 계획은 문서화만 됨. 이후 커밋은 전부 인프라라 RC 코드 수정은 미착수 상태.** (link dedup·출처 룰베이스화 등 P1 핵심이 코드에 부재 확인됨)

### 2026-06-24 (인프라 마이그레이션)
- LLM 프로바이더 Ollama → **OpenRouter**(deepseek-v4-pro, reasoning OFF) 전환(`cb18801`).
- **GitHub Actions 제거 → 노트북(WSL) systemd 타이머**가 `run_digest.sh` 직접 실행(`6952543`). 정시 10:00→09:00→**09:40 KST**.

### 2026-06-25 (재감사 + 정리 — 진행 중)
- 비용 분석: deepseek-v4-pro = $0.435/M 입력, $0.87/M 출력(2026-06 OpenRouter). 30일 ≈ **$15~24** (프롬프트 캐싱 작동 확인 — 청크 헤더가 캐시히트 256~2k+). Flash 전환 시 ≈$8.
- 토큰/비용 계측 코드 추가: `agent_runner.getStats()` + `_run_stats.json` + `KEEP_TEMP=1` 임시폴더 보존(품질분석 필수). CLAUDE.md 테스트 프로토콜에 [HARD] 로그보존 규칙 명문화.
- 2026-06-24 데이터로 **신선한 deepseek-v4-pro 전수 런** 실행(`output`/temp 보존) → 유사도분포·토큰·전수 콘텐츠 대조 분석 중. 산출물: `docs/품질대조_20260624/`.
- 문서 정리: README 392→210줄(GitHub Actions 섹션 삭제→systemd 운영으로 교체, 라벨 16→21 수정), CLAUDE.md 라벨/중복 정리.

---

## 알려진 근본원인 18개 (RC-A~R) — 대부분 미해결

> 출처: 2026-06-01 데이터 전수 조사. 상세 증거는 git `287f3a6`의 `docs/분석_근본원인.md`(삭제됐다면 git history 참조). 계층 = RULE(코드/JSON 결정) / LLM(의미 판단) / 복구.

| RC | 문제 | 계층 | 상태 |
|---|---|---|---|
| A | 출처가 LLM 자유생성 → 불안정(SCMP 5분리, 철자 드리프트) | RULE | 미해결 — 카탈로그 name 룰베이스 주입 필요 |
| B | link 기반 중복제거 부재(티저+원문, cross-메일) | RULE | 미해결 — `dedup_links` 코드 없음 |
| C | 라벨 가드 침묵 실패(gmail_labels 없으면 no-op) | RULE | 부분(6/1 가드 추가) |
| D | 무의미 한줄 정크(바이라인/헤더; NYT "By저자" 파서결함) | RULE+LLM | 미해결 |
| E | 번역 누락(소셜포럼 파손, 해외 22개 번역규칙 없음, 인명 음역오류) | LLM | 부분(일부 SKILL) |
| F | 렌더모드(목록/카드/브리핑) 미분류 | RULE/CONFIG | 미해결 |
| G | 리포트 인덱스 404(reports/reports 경로 중복) | RULE | 미확인 |
| H | 코드경로별 enrich 불일치 | RULE | 미해결 |
| I | 라벨 에이전트 파손(스키마 손상) | 복구 | **미해결 — 9개 파손**(2026-06-25 census). 아래 상세 |
| J | 혼종 CJK(일본어 한자 누출) | RULE+LLM | 미해결 |
| K | 카탈로그 메타 stale(item_count_avg, 중복 엔트리) | CONFIG | **해소**(2026-06-25 census: 104엔트리/104 SKILL 정합, 중복·고아·라벨불일치 0) |
| L | validate_skills 얕음(파손·번역결핍 못 잡음) | 검증 | 미해결 |
| M | 정보 누락(대형 브리핑 헤드라인 폐기, 중국_시사 17건) | RULE+LLM | 미해결 — **1원칙 위배, 최우선** |
| N | 크롤링 오염(footer/지난호/홍보 무차별 → 정크·날짜오염) | RULE | 미해결 |
| O | 할루시네이션(김범석→김봉진, $57B→57억) | LLM+RULE | 부분(금지표현 강화) |
| P | html_to_text 본문 전소실(KOTRA·녹색소비자) | RULE | 미해결 |
| Q | 라벨 fetch silent 0(NYT 고볼륨인데 0건 무경보) | RULE+알림 | 미해결 |
| R | NYT류 멀티에디션 라벨내 대량 중복 | RULE | 미해결(B의 link dedup으로 흡수 예정) |

**P0 핵심**(16개 중 12개 해소): A(출처 룰베이스) · B(link dedup) · I(파손복구). 추가 P0급: M(누락)·N(크롤오염)·Q(fetch 0).

### 2026-06-25 정적 census 확정 결과 (런 무관, 결정적)

테스트 베이스라인: `npm test` 606 passed / 2 skipped.

- **RC-I 파손 라벨 에이전트 9개**(8개→9개, 투자 신규): `경제·기타·라이프·마케팅·소셜포럼·스포츠·시사·인문학·투자`. 증상 = `## 입력`/`## 출력` 아래 JSON 스키마 블록이 백슬래시 `\` 단독줄로 깨짐. 정상 13개(IT·글로벌×2·미국×2·중국×2·NYT×3·스타트업·지원사업) + `_공통규칙`. **복구: IT.md/_공통규칙.md를 템플릿으로 9개 파일 ## 입력/## 출력 JSON 블록 복원.**
- **RC-E 번역 갭 17개**:
  - en인데 번역규칙 無 (12): scmp, scmp_craig_addison, thewirechina, seekingalpha, strictlyvc, nytimes_foryou, axios_macro, hypebae, sportspromedia, substack_2, substack_londoncentric, substack_philosophors
  - ko 오분류 + 번역규칙 無 (5, 최우선): axios, axios_mike, hypebeast, scmp_victoria_bela, redditmail
  - 필드만 ko 오기(번역규칙은 있음) (3): bbs, klement, nytimes_breakingnews. NYT 4에디션 언어플래그 비일관(en/en/en/ko).
- **RC-K 해소**: 카탈로그 104/104 정합(중복·고아SKILL·라벨불일치 0).
- **개인화 제거 맵**: `{{USER_CONTEXT}}` 21개 파일(각1), `{{FOCUS_TOPICS}}` 22개 파일(`_공통규칙` 포함, 각1) + `loadUserContext`/`loadFocusTopics` 코드.
- **성능 근본원인**(신규, RC 외): 평균 동시성 0.71(limit 3인데 직렬) + deepseek-pro 생성 8.5s/건. 원인=라벨 내 추출 순차(`for`+청크순차)·비-LLM 크롤이 슬롯 점유. rate-gate·네트워크는 무관. 수정=보완계획 BP-1(추출 병렬화)·BP-2(Flash). 하루치 2h+ → 10~20분대 목표.

**LLM vs 룰베이스 경계**: 출처·라벨라우팅·link중복·정크패턴·렌더모드·메타 = **RULE**. 요약합성·번역·의미병합 = **LLM**. (결정적으로 정해지는 값은 코드/JSON으로.)

---

## 콘텐츠 전수 대조 (2026-06-24 런, 완료)

전 21라벨×163메일×3,443아이템 전건 대조 완료(병렬 에이전트 16). 상세 **[docs/품질대조_20260624/_종합.md](품질대조_20260624/_종합.md)** + `{라벨}.md`. 핵심:
- **할루시네이션 ~80+건**(빈약입력/크롤실패/파손라벨 → 날조, merged 생존; 정상라벨+충실본문은 0) — 핵심원칙 위반, **P0**.
- **병합 dedup 저재현율**(전 라벨, link/메타 무결성 붕괴가 원인) — 최다 빈도.
- 누락(NYT By저자 파싱·careet), LINK 오매핑/공란, received_at 위조(병합.md 예시값), 텍스트 mojibake, 정크(광고/티저/카드), 번역(SCMP).
- 번역/할루는 **모델보다 입력품질·가드 문제**(Pro 정상입력서 할루 0). 추출은 Flash 가능성↑.
- 병합 임계값 0.25 유지(실제병합 0.3~0.6 집중), 자동병합 밴드 불필요.

## 보완계획

수정 항목·순서·기대효과·테스트 프로토콜은 **[docs/보완계획.md](docs/보완계획.md)** 참조 (A: 런무관 확정수정 / B: 코드 RC / C: 런분석 기반 / D: Haiku 하루치 2회 검증 → 풀런).

## 방향 전환: 크롤링 제거 + tier 2단 (2026-07-01)

전수 품질대조 결론(추출 205개 중 65% 중복/과추출, 원인이 ①티저+전문 이중추출 ②크롤러의 아카이브 과추출 ③크롤 보강분에서만 발생한 할루)에 따라 **원문 크롤링을 제거**하고 본문만으로 추출하는 방향으로 전환. 깊이는 "충실 요약 + 원문 링크 위임"으로 분리.

- **크롤링 비활성**: `orchestrator.convertHtmlToText`의 `enrichWithArticles` 호출을 `ENABLE_CRAWL=1`일 때만 실행(기본 off). `fetch_articles.js` 함수 자체는 보존. `=== 원문 기사 전문 ===` append가 더는 안 일어남. crawl off 시 `PARALLEL_LIMIT` 3→6.
- **tier 분류**: `classifyTier(item)` 신설 — summary 길이 단일 기준(`MAJOR_TIER_MIN_CHARS=140`), 결정적·LLM 비의존·병합 후 재계산 가능. 추출 enrich 단계에서 각 아이템에 `tier:'major'|'brief'` 기록. 동시에 `cleanItemLink`(=`html_to_text.cleanTrackingParams` 재사용, 오프라인 lp=/utm 언래핑, 네트워크 X)로 link 정리.
- **렌더 2단**: `render_report.renderLabelSection`(production HTML)이 major→카드 위, brief→"간단 소식" 목록(주요기사 0개면 펼침)으로 분리. MD(`generateMarkdown`/`generateCombinedMarkdown`의 `renderItemsByTierMd`)·`generate_html.renderLabelTab`도 동일 2단. 기존 message_id 기반 "KDI류" 목록감지 로직은 tier 분리로 대체.
- **추출 프롬프트**: `agent_runner` extract systemPrompt에서 stale한 "원문 기사 전문" 규칙 제거, 충실기사=200~500자/티저=50~140자+link필수 지침 추가, 회피표현 금지는 충실기사에만 적용(티저는 link 위임 허용)·할루 금지는 동일 유지.
- 테스트: `test_orchestrator_utils`의 MD 포맷 단언을 신포맷으로 수정 + `classifyTier`/`cleanItemLink` 단위테스트 추가. 전체 603 통과. (`test_fetch_articles`는 함수 보존으로 그대로 통과.)
- **다음 검증**: 5/1 IT 재실측 시 기대 — 크롤 없음, 아이템 ~72개로 수렴, 리포트 tier 2단 분리.

## 진행 중 결정 (2026-06-25)

- **개인화 제거 확정**: `{{USER_CONTEXT}}`(user_profile.json — 이미 삭제돼 노이즈 주입 중) + `{{FOCUS_TOPICS}}`(labels.json focus_topics, "우선 추출"이 누락제로와 충돌). 21개 라벨 문서 placeholder + `loadUserContext`/`loadFocusTopics` 코드 제거 예정. (런 종료 후 적용 — 런 중 편집 시 분석 오염)
- **모델 분할 검토**: 해외(SKILL `언어=en` 18개) → Pro, 국내(ko 83개) → Flash, 병합 → Pro. 단 "국내 Flash 충분" 가정은 전수 대조로 검증 후 확정.
- **병합 임계값 튜닝**: 현재 `findMergeCandidates` 유사도>0.25 → LLM. 자동병합(높은 점수)은 "같은 주체·다른 사건"을 단어유사도가 구분 못 해 위험(누락제로 위배) → LLM 유지. 0.25 상향 여지 + near-exact(0.9+) 자동병합 밴드는 2026-06-24 분석 데이터로 결정.

---

## 테스트 데이터 픽스처 (gitignore됨, 디스크에만)

| 경로 | 용도 |
|---|---|
| `output/backfill/20260501/` | 6/1 라벨별 raw/clean/items/merged — 수정 효과 대조 기준 |
| `output/backfill/20260502~30/` | 30일 발신자 census 참고 |
| `output/audit_missing_20260601/` | NYT 재수집·감사 스크립트 |
| temp `os.tmpdir()/yks-gmail-manager/<날짜>/` | 런 중간 산출물. 성공 시 삭제(보존하려면 `KEEP_TEMP=1`) |

---

## 죽은 라벨 (점검 필요)
- **글로벌_경제·스포츠**: 21일+ 수신 0건 추정 → 구독상태/필터 확인 후 비활성 또는 유지 결정(RC-Q 알림과 연계).
