# 품질 대조: NYT_경제 (DealBook) — 6/1 백필 누락분 검증

대상: `output/audit_missing_20260601/labels/NYT_경제/` 4개 메일 (Andrew Ross Sorkin / nytdirect@nytimes.com / DealBook 에디션)
추출 규칙: `agents/labels/NYT_경제.md`, `_공통규칙.md`, `skills/newsletters/SKILL_nytimes.md`
검증 방식: clean_text 본문(뉴스레터 영역 + 크롤링 원문) ↔ items 1:1 대조

---

## DealBook 구조 특이점

DealBook(평일 아침 발송)은 SKILL이 기술한 "M&A 딜 중심"보다 훨씬 복합적인 **하이브리드 구조**다. 매 에디션이 동일 골격을 가진다:

1. **사전 헤더 한 줄** ("Also, ..."/"Plus, ...") + 날짜 + **Andrew의 오프닝 에세이**(인사·시황 코멘트) → 아이템 아님(서두). 추출에서 제외함.
2. **리드 칼럼 1~2개** (예: 'Inflation jitters', 'Warren vs. Musk', 'Liftoff', 'Taxing A.I.') — 가장 충실한 심층 아이템.
3. **'The latest' / 불릿 리스트** — 리드에 종속된 불릿(Oracle/Amazon/OpenAI/Meta 등)은 리드 요약에 흡수.
4. **독립 단신** (Social Security, Anthropic, Kalshi 등) — 굵은 첫 문장이 제목 후보.
5. **'NUMBER/QUOTE/CHART OF THE DAY'** 박스 — 1아이템으로 추출(예: $216M Steyer, Gates 인용, 1조 달러 클럽 차트).
6. **'Deals' / 'Politics, policy and regulation' / 'Tech and AI' / 'Best of the rest'** — 각 섹션 안에 출처표기(WSJ/FT/Bloomberg/NYT 등) 단신 여러 개. **한 문단에 여러 링크가 마침표로 이어붙은 split 위험 구간**(NYT 특유의 정크 발생 지점).
7. **바이라인 블록** (Andrew Ross Sorkin, Founder/Editor-at-Large … @핸들 × 7명) + **푸터**(Subscribe/Privacy/Contact) → 전부 정크. 제외함.
8. **`=== 원문 기사 전문 ===`** 이후 = 링크 크롤링된 외부 기사 전문(NBC/CNBC 등) + "(유료 구독 콘텐츠 - 공개 부분만 수집)". **아이템 아님** — 요약 보강용 근거로만 사용.

핵심 함정: (a) 바이라인 7개를 아이템으로 오인 → 정크 7건 발생 가능. (b) 'Deals' 한 문단의 3개 링크를 1개로 뭉개거나 반대로 split. (c) Andrew 오프닝 에세이를 별도 아이템화. 본 추출은 셋 다 회피함.

---

## 이메일별 카운트표

| mid | subject | 본문 헤드라인(추정) | 추출 items | 누락 | 정크 |
|---|---|---|---|---|---|
| 19eb1470332e8a81 | Bracing for a surprise | 14 | 14 | 0 | 0 |
| 19eb689ee6ea1758 | SpaceX vs. gravity | 13 | 13 | 0 | 0 |
| 19ebbabe6b39eeab | Musk's trillion-dollar day | 13 | 13 | 0 | 0 |
| 19ec0dc7179bd425 | Should we tax A.I.? | 7 | 7 | 0 | 0 |
| **합계** | | **47** | **47** | **0** | **0** |

### 19eb1470332e8a81 (Bracing for a surprise) — 14개
리드2(Inflation jitters / Warren vs. Musk) + 단신3(Social Security, Anthropic Claude Fable 5, Kalshi) + NUMBER OF THE DAY($216M Steyer) + 피처(Cyera $12B) + Deals3(Boehly/Seahawks, SoftBank, Robinhood) + Politics2(Trump 크립토 $2.3B, 월드컵 심판) + Best of rest2(Patriot/우크라, Goldman Horwitz). 'The latest' 불릿(테크주/브렌트유 $91)은 Inflation jitters 요약에 흡수.

### 19eb689ee6ea1758 (SpaceX vs. gravity) — 13개
리드(SpaceX A.I. gravity; Oracle/Amazon/OpenAI/Meta·골드만 $1.1T 불릿 흡수) + 단신3(시장 반등, 관세환급 $22B, EU 파라마운트/WBD) + 피처(Amodei exponential) + QUOTE(Gates) + 피처(디뱅킹 조사) + Deals2(Ares $8.5B, Trump 시티그룹) + Politics2(영국 SNS금지, 독일 구글AI) + Best of rest2(Lee Raymond 별세, SCOTUS 술꾼).

### 19ebbabe6b39eeab (Musk's trillion-dollar day) — 13개
리드(Liftoff; 수혜자 Gracias/파운더스/a16z/세쿼이아·중국 차단 흡수) + 단신3(Jay Clayton DNI, ECB 금리, LIV Golf) + CHART(1조 달러 클럽) + 피처(Oil's hazy outlook) + 피처(Uber CEO 인터뷰) + Deals2(Crowe/KKR, Moelis 내부자) + Tech/AI2(Bezos Prometheus $12B, 구글 제미니 중국) + Best of rest2(GQ 경호원, Isle of Man 도박).

### 19ec0dc7179bd425 (Should we tax A.I.?) — 7개
단일 심층 칼럼(Peter Coy 'Taxing A.I.' — 5개 하위섹션을 **1개 아이템으로 통합**, 800자 내) + 단신/딜 묶음(SpaceX 상장완료, CPI 4.1%, Kalshi, 'More big deals'=H-1B/Anthropic/Apple) + 피처(NBA 소셜미디어) + 피처(World Cup 티켓). 'Taxing A.I.'를 5개로 쪼개지 않고 단일 콘텐츠 규칙(공통규칙 §10) 적용.

---

## 문제 목록

### 누락
- **0건.** 본문 4개 메일의 모든 리드·단신·박스·섹션 단신을 빠짐없이 매핑. 47/47.

### 할루시네이션
- **0건.** 모든 수치를 원문과 1:1 대조:
  - CPI 4.2% 예상(11일자)/실제 4.1%(13일자) — 두 에디션 수치 구분 정확.
  - SpaceX 조달액: 11일 "$74B 이상", 12일 "약 $75B", 밸류 "$1.77~1.8조" — 에디션별 표현 차이 그대로 반영(혼동 없음).
  - Cyera $12B/6개월 전 $9B/$600M·$400M, Steyer $216M·$201M·22.5%·$5.1B·$342M, 머스크 지분 $688B·순자산 $970B, Bezos Prometheus $12B·$41B, Ares $8.5B, SoftBank $6B, Crowe ~$3B 등 전부 원문 일치.
  - 단위 환산: 달러/billion/trillion을 "억/조 달러"로 정확히 변환(예: $1.77 trillion→1조7700억 달러, $216 million→2억1600만 달러). 오변환 0건.

### 정크
- **0건.** 바이라인 7명 블록, Subscribe/Privacy/Contact 푸터, "원문 기사 전문" 이하 크롤링 본문, Andrew 오프닝 에세이를 모두 제외. NYT 특유의 "헤드라인+By저자 단일링크 split 정크"는 발생하지 않음(저자 바이라인을 아이템화하지 않음).

### 중복
- **0건(라벨 내).** 4개 에디션이 연속일(6/10~13)이라 SpaceX IPO·인플레이션·Kalshi·Anthropic Mythos가 **여러 에디션에 반복 등장**하나, 각기 다른 날짜의 다른 진행 단계(상장 전→당일→사후, CPI 예상→확정)이므로 **다른 사건으로 보고 병합하지 않음**(원칙 2: 다른 사건 절대 병합 금지). 동일 link 중복은 없음. ※ 단 라벨 전체를 하나의 다이제스트로 합칠 때는 orchestrator 단계 dedup에서 SpaceX/Kalshi 계열이 병합 후보가 될 수 있음(에디션 경계 넘는 cross-mid 병합은 본 추출 범위 밖).

### 출처(source) 정확성
- **오류 0건.** 4개 메일 모두 발신자가 DealBook 에디션이므로 source를 일관되게 `"DealBook"`으로 통일. NYT가 여러 source명으로 분리되는 문제 없음. (단신 내부의 2차 출처 WSJ/FT/Bloomberg는 summary 본문에 명기, source 필드는 DealBook 유지 — 발신 뉴스레터 기준이므로 일관성 OK.)

### 번역 품질
- 영문 잔존 0건. 고유명사 음역 점검: Andrew Ross Sorkin→'앤드루 로스 소킨'(오프닝 화자, 아이템 외), Kevin Warsh→케빈 워시, Elizabeth Warren→엘리자베스 워런, Tom Steyer→톰 스타이어, Cyera→사이에라, Yotam Segev→요탐 세게브, Dario Amodei→다리오 아모데이, Jeanine Pirro→지닌 피로, Antonio Gracias→안토니오 그라시아스, Dara Khosrowshahi→다라 코스로샤히, Jay Clayton→제이 클레이턴, Bezos→베이조스 — 표준 음역 사용, 혼종 CJK 없음.
- 직역 회피: "hopes-and-dreams I.P.O."→'희망과 꿈의 IPO', "bear-market signposts"→문맥 의역, "debanking"→'디뱅킹'(원어 병기) 등 자연스러운 의역.

### 요약 완결성
- 리드/피처 아이템은 200~500자(단일 심층 Taxing A.I.는 ~800자)로 WHO+WHAT+수치 충족. 'Deals'/'Best of rest'의 티저성 단신은 50~150자로 분량 비례(공통규칙 §3 짧은 원문 허용). "원문 참조"식 회피 표현 0건.

---

## 요약표

| 항목 | 건수 |
|---|---|
| 총 아이템 | 47 |
| 누락 | 0 |
| 할루시네이션 | 0 |
| 정크 | 0 |
| 중복(라벨 내 동일 사건/link) | 0 |
| 출처 오류 | 0 |
| 번역 문제(미번역·음역오류·혼종) | 0 |

**종합 판정: 통과.** 6/1 백필이 0건으로 놓쳤던 NYT_경제(DealBook) 4개 메일은 정상 추출 가능하며, 백필 0건은 추출 품질 문제가 아니라 수집/파이프라인 단계 누락이었음을 확인.
