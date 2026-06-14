# 뉴스레터별 품질대조 — chunk0 (worklist index 0~9)

대상: `output/audit_missing_20260601/worklist_88.json` index 0~9
방식: Haiku 추출 items ↔ clean_text 원문 1:1 대조

---

## 0. 더밀크 김도현 (viewsletter@themiilk.com)
- 라벨: IT / orphan: false
- mid: 19e715bbdffd3f31

| 항목 | 값 |
|---|---|
| 본문 뉴스/콘텐츠 블록 | 6 (기사3 + STK광고 + 리포트프로모 + 멤버십프로모) |
| 추출 items | 6 |
| 누락 | 0 |
| source | "더밀크" 일관 |

문제목록:
- (경미) item1 summary 내 "섀도 AI(무조건 제한하면 더 이상 보이는 현상)" — 원문 "무조건 막으면 더 안 보이는 섀도 AI 현상"을 어색하게 옮김(의미 왜곡 경계). 할루는 아님.
- item4~6은 광고/자사 프로모션(STK2026, 토큰팩토리 리포트, 멤버십 50%할인). 뉴스가 아닌 프로모션이나 본문 비중이 커서 추출된 것은 허용 범위. **정크성 프로모션 3건**으로 분류 가능(누락은 아님).
- 핵심 기사 3건(토큰맥싱/FDE/중간관리자)은 수치(가트너 15만개·거버넌스 13%, 오픈AI 토모로 150명·40억달러, 시니어81%/60%) 모두 원문과 일치. 할루 없음.

---

## 1. Claude Team (no-reply@email.claude.com)
- 라벨: IT / **orphan: true** (전용 SKILL 없음, 제네릭 추출)
- mid: 19e71768429d1128

| 항목 | 값 |
|---|---|
| 본문 기능 블록 | 7 (Opus4.8 + Claude Code 6기능) + 부가 2 |
| 추출 items | 7 |
| 누락 | 0 (핵심 누락 없음) |
| source | "Claude Team" 일관 |

문제목록:
- 제품 마케팅 메일(Anthropic 자사 뉴스레터). 7개 기능 모두 정확 추출, 수치(2.5x, $10/$50 MTok, 주간한도 50%) 일치. 할루 없음.
- "Build more with increased weekly limits"(주간 한도 50% 증가) 항목이 별도 item으로는 누락됨 — Week22 요약 item에 부분 흡수됨. 경미한 누락 1건.
- orphan 판정: **제네릭 추출 품질 양호**. 단 자사 제품광고라 뉴스 가치는 낮음. 전용 SKILL 불필요, 단 카탈로그에서 광고성으로 다운웨이트 고려 가능.

---

## 2. Andrew Ross Sorkin / NYT DealBook (nytdirect@nytimes.com)
- 라벨: NYT_경제 / orphan: false
- mid: 19e73b0d74768cd4

| 항목 | 값 |
|---|---|
| 추출 items | 7 |
| 누락 | 미상(원문 거대, 헤드라인 구조 대조 일부만) |
| source | "NYT DealBook" 일관 |

문제목록:
- item1 title "OpenAI 제치음" — **오타("제치음")**. 번역품질 결함.
- item1 "$900B vs OpenAI $730B", "Mythos 모델 사이버보안" 등 수치/고유명사 포함 — 원문 대조 필요하나 DealBook 특성상 plausible. 할루 의심 낮음.
- **link 빈값 2건**(SiriusXM, LabCorp, SpaceX 등 일부 link="") — 본문 내 링크 없는 항목이라 정상일 수 있음.
- source 일관성은 양호.

---

## 3. NYT Today's Headlines (todaysheadlines-noreply@nytimes.com)
- 라벨: NYT_시사 / orphan: false
- mid: 19e72dc9eaf92d4c

| 항목 | 값 |
|---|---|
| 추출 items | **51** |
| 누락 | 낮음(대량 헤드라인 망라형, 양호) |
| source | **7종 혼재 — 심각** |

문제목록:
- **source 불일치(최우선)**: 한 발신자에서 `뉴욕타임스 톱뉴스`, `뉴욕타임스 월드`, `뉴욕타임스 미국`, `New York Times`, `뉴욕타임스`, `The New York Times`, `NYT` 7종이 혼재. 단일 발신자는 단일 source명으로 통일 필요.
- **link 포맷 오염**: 다수 item의 link가 `"[기사](https://...)"` / `"[원문 보기](https://...)"` 처럼 **마크다운 래퍼가 link 필드에 그대로 들어감**(순수 URL이어야 함). 파싱 버그.
- 번역 오류 다수:
  - "제니 Z 남성들"(Gen Z 오역), "온라인 쇠어"(shopper 깨짐), "동호의 기록"(맥락불명), "케네디 가문"(원문 미확인 일반화 의심).
  - "샤레이 파리크" 등 음역은 허용.
- 누락: 헤드라인 망라형 구조라 51건은 충실. 명백한 대량 누락 징후 없음.
- **특수처리 필요**: Today's Headlines는 섹션별(톱/월드/미국/오피니언/문화/부동산) 대량 목록형. source 정규화 + link 언래핑 전용 후처리 필요.

---

## 4. NYT For You (foryou-noreply@nytimes.com)
- 라벨: NYT_시사 / orphan: false
- mid: 19e757fcbd964ed4

| 항목 | 값 |
|---|---|
| 추출 items | 11 |
| 누락 | 0 추정 |
| source | "The New York Times" 일관 |

문제목록:
- source/번역 모두 양호. link 순수 URL.
- item7 "자유 250 콘서트"(Freedom 250) — 번역 일부 혼종("나셔널몰" 오타). 경미.
- item8 "FBI, CIA David Rush 금괴 4000만달러" — 고유명사·수치 포함. 원문 대조 필요하나 plausible.
- 전반 품질 양호. 3번과 동일 발신처(NYT)지만 source명이 "The New York Times"로 3번과 또 다름 → **NYT 계열 전체 source 표준화 필요**.

---

## 5. Substack notes digest (no-reply@substack.com)
- 라벨: 기타 / orphan: false
- mid: 19e75d6ade12f1d8

| 항목 | 값 |
|---|---|
| 추출 items | 1 |
| 누락 | — |
| source | "Substack" |

문제목록:
- **정크 발신자**: 실제 뉴스레터가 아니라 Substack 앱의 "팔로우한 사람이 노트를 올렸다" 알림 다이제스트. 본문은 Klement/Philosophors 노트 3건 링크뿐.
- 추출된 1건(FT/Gary Marcus 노트)은 티저 조각 수준. **요약 가치 낮은 정크 1건**.
- **권장: send-domain `no-reply@substack.com`(notes digest)는 카탈로그에서 제외/억제**. 개별 Substack 발행물(philosophors@substack.com 등)과 구분 필요.

---

## 6. 스타트업레시피 (no-reply@startuprecipe.co.kr)
- 라벨: 스타트업 / orphan: false
- mid: 19e763351b4a3ddc

| 항목 | 값 |
|---|---|
| 추출 items | 25 |
| 누락 | 0 추정(투자/지원사업 목록형 망라) |
| source | "스타트업레시피" 일관 |

문제목록:
- 목록형(투자유치/지원사업공고) 25건 충실 추출. 기업명·금액(420억, 200만달러 등) 구체적, 할루 징후 없음.
- IR데모데이 item은 8개사를 한 item에 묶음 — 적절(한 행사).
- link 다수 빈값이나 원문이 내부 링크 없는 단신이라 정상.
- 품질 우수. 특수처리 불요.

---

## 7. 미스터동 뉴스레터 (hello@mrdongnews.com)
- 라벨: 시사 / orphan: false
- mid: 19e714249912682b

| 항목 | 값 |
|---|---|
| 추출 items | 19 |
| 누락 | 0 추정 |
| source | "미스터동" 일관 |

문제목록:
- 시사 브리핑 19건, 수치 풍부(삼성 OPI 12%, 국민연금 14.9%→20.8%, 서울 아파트 68주 등) — 원문 대조 plausible, 할루 징후 없음.
- item5 오타 "아무리 빨아도"(→빨라도). 경미한 번역/오타.
- source 일관, link 전부 빈값(원문이 외부링크 없는 자체 브리핑이라 정상).
- 품질 양호.

---

## 8. NEWNEEK 고슴이의 비트 (whatsup@newneek.co)
- 라벨: 시사 / orphan: false
- mid: 19e71c1b9d11b1d3

| 항목 | 값 |
|---|---|
| 본문 콘텐츠 블록 | 위클리바이럴 4(밈/영화/음악/유튜브) + 인터뷰 + 안타스포츠 + 북스테이 |
| 추출 items | 9 |
| 누락 | 0(핵심 섹션 모두 포함) |
| source | "NEWNEEK 고슴이의 비트" 일관 |

문제목록:
- 라벨이 "시사"지만 실제 내용은 **트렌드/문화(비욘드 트렌드)** — 라벨 오분류 의심.
- 북스테이 item은 4개 숙소를 1건으로 묶음 — 적절.
- item8(중국MZ 애국소비) keywords에 앞 item 태그 일부 잔존 가능성 외 내용 정확.
- "에디터스 노트/독자피드백/커뮤니티 종료공지"는 비뉴스라 정상 제외.
- 품질 양호. 큐레이션형 특수구조지만 추출 적절.

---

## 9. Philosophors from Philosophy Quotes (philosophors@substack.com)
- 라벨: 인문학 / orphan: false
- mid: 19e73bf52e0ae398

| 항목 | 값 |
|---|---|
| 추출 items | 5 |
| 누락 | — |
| source | "Philosophors from Philosophy Quotes" 일관 |

문제목록:
- **중복 link(최우선)**: 5개 item 전부 **동일 link(post_id=199734504)**. 한 게시물(Bukowski 인용 모음)을 5개 인용구로 분할.
- clean_text 원문은 사실상 Substack 노트 알림(Einstein 인용 등 다른 노트도 섞임)인데 추출은 Bukowski 5분할에 집중 → 원문-추출 정합성 불안정.
- 인용구 뉴스레터 특성상 "기사" 단위가 모호. **인용 모음은 1 item으로 병합**하는 편이 dedup 원칙에 부합.
- 할루는 없음(인용 출처 Factotum/Ham On Rye/Notes of a Dirty Old Man 명시).

---

# 청크 요약표

| # | 발신자 | 라벨 | orphan | items | 누락 | 할루 | 번역 | 정크 | 중복 | 출처오류 |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 더밀크 김도현 | IT | F | 6 | 0 | 0 | 1(경미) | 3(프로모) | 0 | 0 |
| 1 | Claude Team | IT | **T** | 7 | 1(경미) | 0 | 0 | 0(자사광고) | 0 | 0 |
| 2 | Sorkin/DealBook | NYT_경제 | F | 7 | ? | 0 | 1(오타) | 0 | 0 | 0 |
| 3 | NYT Today's HL | NYT_시사 | F | 51 | 낮음 | 0 | 4+ | 0 | 0 | **7종+link래퍼** |
| 4 | NYT For You | NYT_시사 | F | 11 | 0 | 0 | 1(경미) | 0 | 0 | 1(NYT명 불일치) |
| 5 | Substack digest | 기타 | F | 1 | — | 0 | 0 | **1(전체)** | 0 | 0 |
| 6 | 스타트업레시피 | 스타트업 | F | 25 | 0 | 0 | 0 | 0 | 0 | 0 |
| 7 | 미스터동 | 시사 | F | 19 | 0 | 0 | 1(오타) | 0 | 0 | 0 |
| 8 | NEWNEEK 비트 | 시사 | F | 9 | 0 | 0 | 0 | 0 | 0 | 라벨오분류? |
| 9 | Philosophors | 인문학 | F | 5 | — | 0 | 0 | 0 | **5(동일link)** | 0 |

총계: 누락 2(경미), 할루 0, 번역결함 8(대부분 경미/오타), 정크 4(프로모3+digest1), 중복 5(Philosophors 동일link), 출처오류 NYT계열(source 7종+명칭불일치+link 마크다운래퍼).
