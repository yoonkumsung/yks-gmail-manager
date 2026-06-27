# 품질 대조 — NYT_경제 (전건)

- 라벨: **NYT_경제** (영문 NYT DealBook, 발신 `Andrew Ross Sorkin <nytdirect@nytimes.com>`)
- 메일 2건 / 추출 items 50개(27 + 23) / 병합 후 merged 46개
- 데이터: `…\20260624\labels\NYT_경제\{clean,items}\`, 병합 `…\merged\merged_NYT_경제.json`
- 대조 범위: **전건**. items 50개 전체 × clean_text 원문 1:1. merged 46개 전체. 표본 없음.
- 메일 ID
  - **E1** = `19ef4573e5adb421` (제목 "DealBook: Tech tumbles", 6/23, items 27개)
  - **E2** = `19ef965b69f9cdf3` (제목 "DealBook: The Fed and the midterms", 6/24, items 23개)
- merged stats: `original_count=50, total_items=46, duplicates_removed=4, pre_filtered=35`

---

## 0. 요약 카운트표

| 검증 항목 | E1(27) | E2(23) | 합계/merged | 심각도 |
|---|---|---|---|---|
| 1. 할루시네이션(원문 앵커 없는 수치/사실) 확정 | **1** | 0 | **1** (merged M#9 잔존) | **치명** |
| 2. 누락/제로추출 | 0 | 0 | 0 | — |
| 3. 번역 문제(미번역 토큰 등) | 1 | 1 | 2 | 경미~중 |
| 4-a. LINK 공란 (items) | 6/27 | 3/23 | 9/50 (merged 9/46) | 중 |
| 4-b. LINK 오매핑(엉뚱한 기사로 연결) | 1 | 0 | 1 (M#37↔원문) | 중 |
| 5. 중복(병합 후 잔존, teaser+full) | — | — | **6+ 클러스터 미병합** | **중~높음** |
| 6. 정크/메타-아이템(뉴스 아님) | 0 | 1 | 1 (M#34) | 중 |
| 6-b. merged 메타 파손(source/MID 공란) | — | — | 1 (M#43) | 중 |
| 6-c. 단신(<60자) — 정상 vs 정크 판정 | — | — | 7건 모두 **정상 단신**(정크 아님) | 정상 |

전체 결론: **누락 0(우수)**, 그러나 **(a) 할루시네이션 1건이 merged까지 그대로 통과**, **(b) 의미상 같은 사건의 teaser+full 병합 실패가 다수 잔존**, **(c) 정크 메타-아이템 1건 + merged 메타 파손 1건**이 핵심 결함.

---

## 1. 할루시네이션 (grep 앵커 검증)

### [치명] E1 #9 / merged M#9 — "A24, AI 도입 위해 10억 달러 규모 투자 유치 추진" — 날조 확정

요약 본문:
> "인디 영화 스튜디오 A24가 인공지능 도구 도입을 위해 약 **10억 달러** 규모의 투자 유치를 추진 중이다. 이번 투자 라운드는 A24의 기업 가치를 약 **40억 달러**로 평가할 것으로 예상된다."

grep 검증 (clean_19ef4573e5adb421.txt 전문):
- `"1 billion"` / `"4 billion"` / `"funding round"` / `"raise"` / `"raising"` / `"seeking"` / `"valuation"` / `"valued"` → **A24 관련 매칭 0건**. (매칭된 것은 모두 무관: Fed "raise rates", MGX "$50 billion", SpaceX IPO "$75 billion" 등)
- 원문에서 A24가 등장하는 곳은 단 두 군데:
  1. 본문 line 47: "Google takes a stake … **investing about $75 million** … won't … train its models on A24 titles." (= item #8)
  2. 크롤된 Google Blog (line 275~279): "Google DeepMind and A24 … partnership … **Google has made an investment in A24**" (금액 없음) (= item #26)
- 즉 **"A24가 10억 달러를 유치한다", "기업가치 40억 달러"는 원문 어디에도 없음.** 본문은 구글이 A24에 7,500만 달러를 *투자*한다는 내용이며, A24가 *유치*하는 라운드/밸류에이션은 입력에 존재하지 않는 날조.
- "AI 통제권 유지 / 자사 타이틀로 모델 학습 안 함" 부분만 원문(line 47의 "won't have a say in creative decisions or be able to train its models on A24 titles")에서 따왔고, 거기에 없는 금액 2개를 LLM이 창작해 붙임.
- **이 할루가 dedup을 통과해 merged M#9에 그대로 잔존** (LINK 공란). 같은 사건(구글-A24)인 M#8(7,500만 달러 투자)·M#20(딥마인드-A24 파트너십)과 병합되지 않고 별개 아이템으로 남아, 독자에게 상충하는 금액(7,500만 vs 10억)을 동시 노출.

> 룰베이스 불가, **LLM 프롬프트 레벨 문제**(추출 단계 할루 억제 + dedup 단계에서 A24 3아이템 통합 필요).

### 그 외 할루 음성(앵커 확인됨, 정상)
grep으로 핵심 수치 앵커 전수 확인 — 모두 원문 존재:
- E1: `6.3 billion`(2회), `150 million per month`(2회), Cursor `$60 billion`, Greenspan `100`, Kospi `10 percent`, Samsung/SK `12 percent`, Apollo `$26 billion`, MGX `$50 billion`, AbbVie `$10.9 billion`, Oracle `21,000`/`13 percent`, 기후금융 `$2.1 trillion`/`$332 billion`/`$590 million` → 전부 OK.
- E2: `2.7 million`(Joele Frank), `45 million`(Ellison), `556,850`/`14 percent`(Altrata), `$219 billion`(Ellison 순자산), SK Hynix `$29.4 billion`, Goldman `$5 billion`/`$5.3 billion`, 원자로 `$17.5 billion`, Venezuela `$240 billion`, PCE `4.1%`/`3.3%`/`0.5%` → 전부 OK.
- **Simpsons Wiki 정크 크롤 미유출 확인**: clean E1 꼬리(line 290~373)에 simpsonswiki "Alan Greenspan / Non-canon / Bartless on a Tuesday / The Thing vs. Alan Greenspan" 정크가 크롤되어 있으나, items/merged 어디에도 이 표현이 유입되지 않음(grep `Bartless|Thing vs|Non-canon` → items 0건). 그린스펀 아이템(M#35)은 본문 근거로만 작성됨. → **꼬리 정크 크롤이 추출에 새지 않은 양호 사례.**

---

## 2. 누락 / 제로추출

- **누락 0건.** E1 본문의 모든 뉴스 블록(A.I. jitters 6개 단신 + Greenspan + Red alert/기후 + AI talent war + Deals 2 + Politics 2 + Best of rest 2), E2 본문의 모든 블록(High interest/PCE + 정치 단신 5개 + Meta/Arena + Number of the day + Ellison + Deals 2 + Politics 2 + Best of rest 2)이 모두 1개 이상 아이템으로 매핑됨.
- 헤드라인+By저자 파싱결함(타 라벨 패턴) → **본 라벨에서는 미발생.** "By [저자]" 단독 라인을 아이템으로 오추출한 사례 없음. (E2 #20 "DealBook 뉴스레터 아이템"은 누락이 아니라 별개의 *정크 생성* 문제 → §6 참조.)
- 오히려 **과추출(분할)** 경향: 같은 사건을 teaser(본문 한 줄)와 full(크롤 전문)로 2개씩 만들어냄 → §5 중복으로 분류.

---

## 3. 번역

전반적으로 자연스러운 의역, 직역체/음역 과다 없음. 발견된 결함:

- **[중] E2 #10 / merged M#41 미번역 토큰**: "워싱턴의 추가 규제 **scrutiny**를 불러올 수 있다" — 영단어 `scrutiny`가 번역되지 않고 그대로 박힘. 원문 "draw more regulatory scrutiny". → "정밀 조사/감시" 등으로 번역 필요.
- **[경미] 표기 흔들림**: 같은 인물 Zohran Mamdani가 **"맘다니"(M#21)** 와 **"마므다니"(M#22)** 로 메일별로 다르게 음역. 동일 라벨 내 인명 표기 불일치.
- 그 외 인명·기관 음역(가쓰야마 사쓰키, 셰이크 타흐눈, 노암 샤지어, 존 점퍼, 프레스턴 콜드웰 등)은 표준적이며 문제 없음.

> `scrutiny` 미번역은 LLM 출력 결함, 인명 표기 통일은 룰/용어집으로 보완 가능.

---

## 4. LINK 오매핑 / 공란율

### 4-a. 공란율
- items: E1 6/27, E2 3/23 = **9/50 (18%)**. merged: **9/46 (19.6%)**.
- merged 공란 9건: 칸 인트로(M#0), ASML(M#2), 엔화 인트로(M#5), **A24 할루(M#9)**, 폭염 경제(M#11), 알리바바(M#24), DealBook 정크(M#34), 금리긴장 인트로(M#38), Ellison 파손(M#43).
- 공란 대부분은 **인트로 문단/단신**으로 원문에 개별 링크가 없는 항목이라 구조적으로 불가피(예: "A.I. jitters" 섹션 헤더, ASML은 line 28 문장 안에 링크 없음). 단, M#9·M#34·M#43은 각각 할루/정크/파손이라 별개 문제.

### 4-b. 오매핑
- **[중] E1 #37(merged M#37) LINK 오매핑**: title "스페이스X, 리플렉션 AI와 **월 1억 5천만 달러** 규모 컴퓨팅 계약" + summary(63억 달러/월 1.5억 달러)는 원래 **두 개의 서로 다른 CNBC 기사**(items #24=`/2026/06/22/spacex-ai-colossus…`, #25=`/2026/05/20/cheap-ai-could-derail…`)에서 온 것을 병합한 것인데, merged의 LINK는 06/22 기사만 달림. 그런데 summary의 "90일 통지 해지" 디테일은 #25(05/20 기사)에서만 나온 내용 → 단일 링크로는 출처가 일부만 커버됨. SOURCE도 `"CNBC, CNBC"`로 중복 표기. (= 같은 사건 2아이템 병합의 부산물, §5와 연결)

---

## 5. 중복 (병합 후 잔존) — **가장 큰 구조 결함**

병합기가 4건만 제거(50→46)했으나, **명백히 같은 사건의 teaser(본문 요약)+full(전문/심화) 쌍을 다수 미병합**으로 남김. 전수로 식별한 미병합 중복 클러스터:

| 클러스터(같은 사건) | 잔존 merged 아이템 | 비고 |
|---|---|---|
| 구글-A24 (투자/파트너십) | **M#8**(7,500만 투자) + **M#9**(할루 10억 유치) + **M#20**(딥마인드 파트너십) | 3개로 분산. M#9는 할루까지 포함. 1개로 통합돼야 함 |
| 그린스펀 별세 | M#35만 남음(2개→1 병합 성공) | ✅ 정상 병합된 케이스 |
| 엔화 하락 | **M#5**(인트로 단신) + **M#6**(전문) | teaser+full 미병합 |
| 금리/PCE 인상 전망 | **M#38**(인트로) + **M#39**(3년 최고) + **M#40**(전망 엇갈림) + **M#45**(모닝스타 4.1%) | E2 핵심 주제가 4개로 파편화. 일부는 각도 다르나 #38·#39는 사실상 동일 |
| 메타 예측시장 | M#41만 남음(2개→1 병합 성공, 단 §3 scrutiny 잔존) | ✅ |
| 알리바바/중국 국방부 소송 | **M#24**(알리바바 단신) + **M#25**(중국 전자상거래 전문) | **동일 사건**(알리바바=그 전자상거래 기업). teaser+full 미병합 |
| 래리 엘리슨 트럼프 기부 | **M#42**(순자산 2190억) + **M#43**(파손 단신) + **M#44**(전문) | 3개 분산 + M#43 메타 파손 |
| 스페이스X-리플렉션 AI | M#37(2개 CNBC→1, §4-b 부작용) | 병합됐으나 출처/링크 부정확 |
| AI 인재전쟁 | M#36(2개→1 병합 성공) | ✅ |

→ 병합 성공 4쌍(그린스펀·메타·인재전쟁·리플렉션) 대비, **A24(3)·엔화(2)·금리PCE(2~4)·알리바바(2)·엘리슨(3)** 클러스터가 미병합. 특히 **알리바바=중국전자상거래**는 한쪽이 회사명을 명시(M#24)하고 다른 쪽이 익명화(M#25 "한 전자상거래 대기업")해서 병합기가 동일 사건 인식에 실패한 것으로 보임.

> **LLM(의미 병합) 문제.** dedup 프롬프트가 teaser+full, 그리고 명시명↔익명 표현을 같은 사건으로 묶지 못함.

---

## 6. 정크 vs 정상 단신

### 6-a. [중] 정크 메타-아이템 — E2 #20 / merged M#34 "DealBook 뉴스레터 아이템"
> summary: "DealBook 뉴스레터의 주요 내용을 담고 있습니다. Andrew Ross Sorkin, Brian O'Keefe, Bernhard Warner, Sarah Kessler, Michael J. 등 **편집진이 참여했습니다.**"

- 이것은 뉴스가 아니라 **메일 푸터의 편집진 바이라인 블록**(clean E2 line 157~169의 기자 명단)을 뉴스 아이템으로 오생성한 것. SOURCE도 `"The New York Times <nytdirect@nytimes.com>"`(발신주소 통째). 완전한 정크.
- E1에는 동일 푸터가 있는데도 이런 아이템이 안 생김 → **비결정적 생성(같은 구조에서 한 메일만 정크 생성)**.

> **룰베이스 제거 가능**: "편집진이 참여/뉴스레터의 주요 내용을 담고" 류 + source가 발신주소 그대로 + 기자명 나열 패턴 → 필터링.

### 6-b. [중] merged 메타 파손 — M#43 (source="", message_id="")
- M#43 "래리 엘리슨, 트럼프 행정부에 거액 기부 및 혜택"은 **SOURCE와 MID가 빈 문자열**. items E2 #13에는 정상적으로 source/message_id가 있었으나(원본 확인) 병합 과정에서 Ellison 스토리를 M#42/M#43/M#44로 쪼개며 한 조각의 메타데이터가 유실됨. 출처 추적 불가 상태로 렌더링됨.

> **룰베이스/코드 문제**: 병합 시 메타데이터 승계 로직 결함.

### 6-c. 단신(<60자) 7건 — 전부 정상(정크 아님)
엔화(M#5), 폭염경보(M#10), MGX(M#14), 뉴요커(M#19), 알리바바(M#24), 베네수엘라(M#31), 손정의(M#32). 모두 원문이 한 줄짜리 단신(예: 원문 "A sinking Japanese yen spooks traders.", "Masayoshi Son … promised to run … another 10 to 15 years.")이라 **요약이 짧은 것이 정상**. CLAUDE.md 기준(짧은 원문 50~200자 허용)에 부합. **정크 아님, 누락 아님.** 다만 M#5(엔화)·M#24(알리바바)는 §5처럼 full 버전과 병합됐어야 함.

---

## 7. 근본원인 분류 (LLM vs 룰베이스)

| RC | 증상 | 처리 |
|---|---|---|
| RC-할루 | M#9 A24 "10억 유치/40억 밸류" 날조 | **LLM** (추출 할루 억제 프롬프트) |
| RC-병합 | A24·엔화·금리PCE·알리바바·엘리슨 teaser+full / 명시↔익명 미병합 | **LLM** (의미 병합 프롬프트 강화) |
| RC-번역 | `scrutiny` 미번역, 맘다니/마므다니 표기 흔들림 | LLM + 용어집(룰) |
| RC-정크 | M#34 편집진 바이라인을 아이템화 | **룰** (푸터/바이라인 패턴 필터) |
| RC-메타 | M#43 source/MID 공란(병합 시 유실) | **룰/코드** (병합 메타 승계 수정) |
| RC-링크 | M#37 출처 2개를 1링크로, SOURCE "CNBC, CNBC" | 룰/코드 (다출처 표기·링크 선택) |

핵심 권고: **(1) A24 할루 + A24 3아이템 미병합**이 한 사건에 동시 발생 — dedup이 작동했다면 할루 아이템이 정상 아이템에 흡수되며 모순이 드러났을 것. dedup 강화가 할루 영향도 완화. **(2) 푸터 바이라인 정크(M#34)와 메타 파손(M#43)은 즉시 룰베이스로 제거/수정 가능.**

---

## 부록: 전건 명시

- items 50개(E1 27 + E2 23) **전부** clean_text 원문과 1:1 대조함. merged 46개 **전부** 검토함.
- 표본/샘플링 없음. 모든 수치 앵커는 grep으로 원문 존재 여부 확정(§1).
- 작업 임시파일: 세션 scratchpad(`items_*.txt`, `clean_*.txt`, `merged.txt`)에 전문 덤프 후 정독.
