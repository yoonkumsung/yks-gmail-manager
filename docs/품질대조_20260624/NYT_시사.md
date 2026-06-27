# 품질 전수 대조 — NYT_시사 (2026-06-24)

> 라벨: **NYT_시사** (영문/스페인어 NYT 뉴스레터)
> 대상: **34개 메일 / 745 추출 아이템 / 병합후 341 아이템**
> 방법: `clean_<msgid>.json`(원문, 정답) ↔ `items_<msgid>.json`(추출) 1:1 대조 + 병합 결과 검증
> **전건 검토 완료**: 34개 메일 전수. 표본 추출 없음. 추측 배제, 원문 대조·결정적 스크립트 검증만 채택.
> 검증 도구: 결정적 스크립트(헤드라인 카운트·할루시네이션 시그니처·원문 영어 앵커 부재 검증) + 병렬 콘텐츠 대조 에이전트 6개(에이전트 주장은 원문 raw clean_text로 재검증 후 채택).

---

## 0. 핵심 결론 (심각도 순)

| # | 발견 | 심각도 | 규모 |
|---|------|--------|------|
| RC-1 | **꼬리 할루시네이션**: 고볼륨 메일 끝에 원문에 없는 미국 정치/지정학 단신(관세·금리동결·휴전·우크라이나·바이든·대법원)이 통째로 날조되어 붙음 | **치명** | 11개 메일, 최소 **38건** 확정 날조 (병합후에도 생존) |
| RC-2 | **제로 추출(완전 누락)**: 정상 뉴스가 가득한 메일 2건이 0 아이템 | **치명** | 2개 메일 = **17개 뉴스 전손** |
| RC-3 | **게임/내비 정크 추출**: Wordle/Connections 등 게임링크, "더보기" 링크, NFL 오프시즌 내비, 연락처 boilerplate를 뉴스로 추출 | 높음 | 6+개 메일, 약 **25건** |
| RC-4 | **인명 음역 오류**: 핵심 인물 오기(맘다니→"마무드 마마다니" 등) | 높음 | 개별 |
| RC-5 | **메일내 중복/과분할**: 같은 사건(메시·에탄패츠·베조스·노래) 2~4회 추출 | 중간 | 다수 |
| RC-6 | **번역 결함**: "airborne disease"→"공기 질병" 등 직역 오류, 음역 불일치(패츠/파츠) | 중간 | 소수 |
| — | 금지표현("원문 참조" 등) | — | **0건** (검출 안 됨) |
| — | 50자 미만 단신 118건 | 대부분 정상 | 진짜 정크는 일부(게임/더보기), 나머지는 정상 짧은 헤드라인 |

**병합 평가(745→341, 중복제거 404건)**: 의미 병합 자체는 부분적으로 작동(메시·그린스펀·호날두·파츠 collapse 확인). 그러나 **RC-1 날조 아이템이 병합 필터를 그대로 통과해 최종 341건에 생존**("해방의 날 관세", "2026 중간선거 공화당", "하버드 총장 사임", "후티 반군", "보잉 737 맥스" 모두 merged에 존재). 병합후 <50자 요약도 44/341 잔존.

---

## 1. RC-1 — 꼬리 할루시네이션 (치명, 시스템적 패턴)

### 패턴 정의
고볼륨 메일의 **마지막 정상 아이템 뒤**에, 원문 clean_text에 **영어 앵커가 전혀 없는** 한국어 단신이 5~12개 붙는다. 주제가 일정함: 트럼프 관세("해방의 날"/"의회 연설"), 연준 금리 동결, 이스라엘-하마스 휴전 협상, 우크라이나 전황, 바이든 이민/기후 정책, 대법원 판결, NYT 칼럼. 이는 추출 청크 경계에서 LLM이 "그럴듯한 NYT 단신"을 자가 생성한 것으로 보인다(할루시네이션).

### 검증 방법(결정적)
각 의심 아이템의 제목/요약에서 시그니처 키워드를 추출 → 해당 메일 **원문 clean_text에 대응 영어 앵커(tariff/Liberation Day/Federal Reserve/cease-fire/Ukraine/Biden/Harvard/Houthi/Boeing 등)가 존재하는지** 정규식 검사. 부재 시 확정 날조. 경계 케이스(Putin/Donbas·Iran sanctions 등 실제 존재)는 재검증 후 **제외**.

### 확정 날조 목록 (원문에 영어 앵커 부재 확인)

| msgid | 메일 | 날조 아이템 index : 제목(발췌) |
|-------|------|------------------------------|
| 19ef41e17ed723b1 | The Morning: Bread and roses (61) | #42 트럼프 관세 옹호 의회연설 / #45 이스라엘-하마스 휴전(카타르) / #48 연준 금리동결 / #52 NYT칼럼 트럼프 관세 / #54 연준 금리동결(중복) / #55 휴전(카이로) — **6건** |
| 19ef12373b053be7 | The World: Charisma (42) | #32 트럼프 "해방의 날" 상호관세 / #40 오피니언 트럼프 관세 — **2건**(에이전트는 #32-41 전부 의심했으나 스크립트로 확정된 건 2건; 나머지는 영어 앵커 일부 존재로 보류) |
| 19ef3c3943d10e98 | N.Y. Today: Penn Station (25) | #18 '유령총기' 규제 / #19 휴전 카이로 / #21 연준 금리동결 / #23 NYT칼럼 바이든 이스라엘 — **4건** |
| 19ef63ae9893df29 | For You from Opinion (37) | #19 바이든 기후정책 / #20 우크라이나 전황 / #28 바이든 이민 대전환 / #29 이스라엘-하마스 휴전 / #34 우크라이나 지원피로 — **5건**(원문에 Ukraine/Biden/climate 영어 전부 부재 확인) |
| 19ef649d5f876071 | The World: Colombia (51) | #43 러시아, 우크라이나 어린이병원 공습 / #46 바이든 NATO정상회의 — **2건**(children's hospital·NATO·Biden·Ukraine 전부 부재 확인) |
| 19ef6b6f49481061 | On Politics: NY (20) | #13 트럼프 관세 / #14 가자 공습 / #15 우크라 드론 / #17 연준 금리동결 / #19 NYT칼럼 '해방의 날' — **5건** |
| 19ef8e9cf70d2f07 | N.Y. Today: Mamdani (33) | #21 NYC 이민자 예산삭감(Eric Adams 부재) / #23 하버드 총장 사임(Harvard 부재) / #24 가자 / #25 후티 반군(Houthi 부재) / #28 보잉 737맥스(Boeing 부재) — **5건** (단, #26~32은 원문 "원문 기사 전문" 부록(char 24104~)에 일부 근거 가능) |
| 19ef92187ebee5bb | The Headlines: heat wave (11) | #3 트럼프 관세 / #4 연준 금리동결 / #5 휴전 카타르 / #7 러시아 우크라 에너지 공습 / #8 바이든 국경 행정명령 / #10 헌터 바이든 유죄 — **6건** (11개 중 6개가 날조 = 55%) |
| 19ef93d0516ae05d | The Morning: Q&A (43) | #35 2026 중간선거 트럼프 / #36 바이든 이민 / #37 연준 금리동결 / #39 대법원 소셜미디어 / #40 바이든 기후규제 / #42 우크라이나 — **6건**(midterm·ceasefire·social media·Ukraine·Fed·Biden immigration 전부 부재. 이 메일은 부록 없음) |

**확정 소계: 9개 메일 / 약 41건** (407f81·1119 경계건 제외 후). 추가로 에이전트가 의심한 건 중 일부(예: 41e1 #43·#46·#49 등, 12373 #33~39)는 본 보고에선 스크립트로 확정된 것만 집계 — 실제 날조는 이보다 많을 가능성.

### 병합후 생존 확인 (치명)
merged_NYT_시사.json(341건)에 다음 날조가 **그대로 생존**:
- "트럼프, 2026년 중간선거 앞두고 공화당에 강한 영향력 행사" ✅생존
- "트럼프, 4월 2일 '해방의 날'에 상호 관세 부과 예고" ✅생존
- "하버드대 총장 사임, 표절 의혹과 의회 증언 논란 속" ✅생존
- "미국, 후티 반군 공격에 대응해 예멘 내 목표물 타격" ✅생존
- "보잉 737 맥스 9 사고, 알래스카 항공기 운항 재개 지연" ✅생존

→ **병합 단계는 할루시네이션을 거르지 못한다.** RC-1은 최종 리포트 독자에게 거짓 정보로 그대로 노출됨.

### 근본원인 분류
LLM 추출 단계 문제(룰베이스로 못 막음). 청크 경계에서 모델이 출력을 "채우는" 자가생성. **대책 영역: LLM(프롬프트에 '입력에 없는 항목 생성 절대 금지' 강화 + 추출 후 각 아이템의 link/원문 근거 존재 검증 룰).**

---

## 2. RC-2 — 제로 추출 / 완전 누락 (치명)

정상 뉴스가 가득한 메일 2건이 **items=0**. "헤드라인+By저자" 파싱결함 + Opinion Today 포맷("헤드라인. '인용' — 저자") 미처리로 추정.

### 19ef9834758a06b2 — Opinion Today: Israel dependency (0 아이템)
원문에 오피니언 8건 존재, **전손**:
1. "Israel's true weakness: American patronage." — Yonatan Touval
2. "This is the perfect film for our age of Trump and theft." — Lydia Polgreen
3. "Kevin Warsh is missing Alan Greenspan's point." — David Wessel
4. "The Clash at the Core of the Iran Deal" — Thomas L. Friedman (오디오)
5. "Ten years after Brexit, the dismal verdict is in." — Philip Stephens
6. "If You Love America, Cringe for It" — Bret Stephens (`[Bret StephensIf You Love America...By Bret Stephens]` 연결 바이라인 포맷)
7. "The Pool That Reflects Trump's Presidency" — 독자 letters
8. 독자 코멘트(Bill H, Florida) — "What's the Matter With Congress?"

원인: 이 포맷은 `### Notable` 아래 "문장. '인용문.' — 저자" 구조이고, More in Opinion은 `[저자명+제목+부제By 저자명]`이 공백 없이 붙어 있어 헤드라인 경계 파싱 실패 → 0 추출.

### 19ef9d473c8c9a8f — California Today: World Cup backyard (0 아이템)
원문에 뉴스 9건 존재, **전손**:
1. "The World Cup Came to His Backyard. He's Not Thrilled." (SoFi Stadium $5B)
2. "Federal Judge Bars ICE From Making Arrests in Immigration Courts" (전국 적용 집단소송)
3. "Lions, Tigers and Bomb-Sniffing Dogs: Zoos Face Scores of Swatting Calls" (40여 곳 허위신고)
4. "U.S. Eases Travel Restrictions on Iran's World Cup Team"
5. "She Was Just Working Security During the World Cup. Now She's Famous in Jordan" (Shannon Manson)
6. "A Solution to A.I.'s Growing Power Demand: Homes" (Tesla/Sunrun)
7. "French Fishnets for an Unplanned Stay in San Francisco"
8. "Lorcan O'Herlihy, Architect of Innovative Urban Housing, Dies at 66" (부고)
9. "How the Veteran Dodgers Crafted One of Baseball's Best Defenses" (Mookie Betts, 원문 전문 포함)

원인: 헤드라인이 `[제목+부제Read more]` 형식으로 링크 안에 붙어 있고("Today's Top Story" 다음 한 줄에 제목·부제·"Read more"가 연결됨), "More California News" 블록도 동일 구조 → 헤드라인 분리 실패.

**대책 영역: 파싱/룰 + LLM.** 이 두 포맷(Opinion Today, California Today)의 `[제목부제Read more]`·`[저자제목부제By저자]` 연결 패턴을 전처리에서 분리하거나 SKILL에 명시.

---

## 3. RC-3 — 게임/내비게이션 정크 추출 (높음)

원문의 boilerplate(게임링크·섹션 더보기·연락처)가 뉴스 아이템으로 추출됨. 50자 미만 118건의 정크 vs 정상 판정 결과의 핵심.

| msgid | 정크 아이템 | 종류 |
|-------|-------------|------|
| 19ef8e9cf70d2f07 | #15~20 Wordle/Connections/Strands/Spelling Bee/Crossword/Mini "게임 안내" (6건) | 게임링크 |
| 19ef680338f2c788 | #34 Connections / #35 Spelling Bee / #36 Mini Crossword / #37 "NYT 게임 전체 보기" | 게임링크 |
| 19ef1503db404fd3 | #24 "Wordle 하드 모드가 실제로 더 쉽다" | 게임링크(기사화 가장) |
| 19ef4ff7945b625f | #14 스위스vs캐나다 중계 / #15 보스니아vs카타르 중계 / #16~18 월드컵 대진표·선수 트래커 위젯 | 라이브스코어 위젯 |
| 19ef4ad79618fa8c | #10 NFL 훈련캠프 일정 / #11 미니캠프 스토리라인 / #12 램스 / #13 레이븐스 / #14 패커스 (5건) | 오프시즌 내비 헤더 |
| 19ef39b88fc49793 | #19 "뉴욕 뉴스 더보기" / #23 "예술 뉴스 더보기" / #26 "더 많은 책 뉴스" / #28 "더 많은 음식 뉴스" / #32 "그늘로 수분 증발 방지"(부속 한 줄) | 섹션 더보기 링크 |
| 19ef8e9cf70d2f07 | #15~20(상기) | — |
| 19ef3fb312c8b90c | #3 "NYT 뉴스룸 연락처 안내" | boilerplate |
| 19ef0f03b9164e53 | #6 "가족들이 부모를 변호하지 않는 이유에 대한 독자 의견" | 독자 코멘트 섹션 |

**정상 짧은 단신(정크 아님, 유지 마땅)** — 50자 미만이지만 진짜 뉴스: "메시 기록적 골 달성"(#3), "앨런 그린스펀 100세 별세", "키어 스타머 영국 총리 사임", "리오넬 메시 또 기록 경신", "에어컨 청소 권장"(서비스), "교대 주차 7월3일까지"(서비스), "유럽 폭염"(헤드라인), "호날두 월드컵 기록" 등 — **이들은 NYT "In Short"/"The Evening" 단신 포맷의 정상 출력**. 짧다는 이유로 일괄 제거하면 안 됨.

**판정: 118건 중 진짜 정크는 게임링크/더보기/연락처 약 20~25건. 나머지 ~95건은 정상 짧은 헤드라인.**

**대책 영역: 룰베이스.** URL 패턴(`/f/a/...` 게임링크, "더보기"/"See more"/"Find all our games", 연락처/구독 문구)을 추출 전·후 필터로 제거.

---

## 4. RC-4 — 인명 음역 오류 (높음)

| msgid | 위치 | 원문 | 추출 | 비고 |
|-------|------|------|------|------|
| 19ef122a3e1729db | #3 | Zohran **Mamdani** | "마무드 마마다니"(Mahmoud Mamadani) | **완전 오인** — 인물 자체가 틀림. 동일 메일 다른 곳은 "맘다니" 정상 |
| 19ef1503db404fd3 | #1 vs #7 | Etan **Patz** | "에탄 패츠" vs "에탄 파츠" | 동일 메일 내 음역 불일치 |

병합 영향: "마무다니" 표기는 merged에서 0건(맘다니 6건으로 흡수 또는 탈락) — 표기 분열이 병합 클러스터링을 방해할 수 있음.

**대책 영역: LLM(음역 일관성) + 룰(주요 고유명사 사전).**

---

## 5. RC-5 — 메일내 중복 / 과분할 (중간)

| msgid | 중복 쌍 | 사건 |
|-------|---------|------|
| 19ef1503db404fd3 | #1↔#7 (에탄 패츠), #2↔#18 (메시), #26↔#27 (클라이브 데이비스) | 동일사건 2회 |
| 19ef12373b053be7 | #3↔#18 (메시 기록) | 동일사건 2회 |
| 19ef407f81e7e7c2 | #22↔#23 (메시), #15↔#16 (희토류 1건을 2개로 분할) | 과분할 |
| 19ef5a3e4efd1070 (Amplifier) | 7곡을 22아이템으로 — 곡별 2~3회(인트로·상세·플레이리스트 요약 중복). 약 11~12건 잉여 | **심한 과분할** |
| 19ef60d4be95bd29 (Climate) | #6↔#21↔#22 (베조스 어스펀드 미달, 3회) | 동일사건 3회 |
| 19ef611e801b24cf | #0↔#6 (네브래스카 서평) | 동일사건 2회 |
| 19ef680338f2c788 | #1↔#5 (호르무즈 해협 교통량) | 동일사건 2회 |
| 19ef8e9cf70d2f07 | #1↔#12 (ICE 마스크금지 소송) | 동일사건 2회 |
| 19ef3c3943d10e98 | #13↔#15 (13지구 경선) | 동일사건 2회 |

병합후 검증: 메시 standalone 1건 유지+맥락 흡수, 그린스펀/호날두/파츠 collapse 양호. 그러나 폭염 6건·맘다니 6건·월드컵 7건은 일부 정당한 다른 각도(유럽 한계·2003조치·런던 에어컨·텍사스 석유화학)와 vague 근접중복("폭염에 대해 알아야 할 사항")이 섞임.

**대책 영역: 의미병합=LLM, 단 추출 단계 과분할(Amplifier·희토류)은 SKILL/프롬프트로 "1 사건=1 아이템" 강화.**

---

## 6. RC-6 — 번역 결함 (중간)

| msgid | 위치 | 원문 | 추출 | 문제 |
|-------|------|------|------|------|
| 19ef43efd038a7c1 | #4 | "Buildings May Soon Have 'Immune Systems' That Fight **Airborne Disease**" | "건물에 **공기 질병**과 싸우는 '면역 체계'" | 직역 오류("공기 중 전파 질병"이 맞음) |
| 19ef407f81e7e7c2 (스페인어) | #34 | "purgatorio"(연옥) | "지옥" | 의미 오역(연옥→지옥) — 경미 |
| 19ef1503db404fd3 | #1/#7 | Patz | 패츠/파츠 혼용 | 음역 불일치 |

**스페인어 메일 번역 품질은 전반 양호**: 19ef407f81e7e7c2, 19ef91307c2c146b 모두 스→한 번역 정확("Sin agujas ni pastillas"→"알약도 주사기도 아닌", "drogas sintéticas"→"합성 마약"). 영문→한국어도 음역 대체로 정확(호날두·블룸버그·그린스펀·조지프 플럼 마틴 등). **미번역 영어 잔존은 브랜드명(Surf·Hyrox·The Ethicist) 외 거의 없음.**

---

## 7. 누락 분석 (헤드라인 수 vs 추출 수)

대부분 메일은 **누락보다 과잉(RC-1 할루)이 문제**. 실제 정상 헤드라인 누락:
- **RC-2 두 메일(17건 전손)** — 유일한 대량 누락.
- 19ef93d0516ae05d: 독자 Q&A 중 "Social Security 22% 삭감"(Tara Siegel Bernard), "휘발유 가격 결정요인"(Emmett Lindner) 2개 섹션 미추출(에이전트 보고, 약 200자씩 실질 콘텐츠).
- 그 외 메일: 정상 헤드라인 누락 거의 없음(게임/구독/footer는 정상적으로 제외).

---

## 8. 메일별 전건 검토 결과표 (34/34)

| msgid | 메일 | 추출 | 판정 | 주요 이슈 |
|-------|------|------|------|-----------|
| 19eefd91f1175910 | In Short: Cottage cheese | 11 | PASS | 없음 |
| 19ef07e72a03aeff | Great Read: 3 Governors | 1 | PASS | 없음 |
| 19ef0f03b9164e53 | Good Advice | 11 | 부분 | #6 독자코멘트 정크, #7 에어비앤비 기제 추정 |
| 19ef1119cea33eb3 | For You: Reflecting Pool | 17 | PASS | (Putin/Donbas는 실제) |
| 19ef122a3e1729db | On Politics: swing left | 20 | 부분 | #3 인명오류(마무다니), #19 중복 |
| 19ef12373b053be7 | The World: Charisma | 42 | FAIL | RC-1 ≥2 확정 날조, 메시 중복 |
| 19ef1503db404fd3 | The Evening: Iran oil | 32 | 부분 | 게임/요리/라이프 정크 6, 중복 3, 음역불일치 |
| 19ef15965dd9540c | On Tech: Musk | 6 | PASS | 없음 |
| 19ef39b88fc49793 | Today's Headlines: Vance | 49 | 부분 | "더보기" 내비 5건 정크 |
| 19ef3c3943d10e98 | N.Y. Today: Penn Station | 25 | FAIL | RC-1 4확정 날조, 13지구 중복 |
| 19ef3fb312c8b90c | Headlines: SCOTUS | 4 | 부분 | #3 연락처 boilerplate |
| 19ef407f81e7e7c2 | The World(스페인어) | 37 | 부분 | #11 사진캡션 정크, 희토류 과분할, 메시 중복 (번역 양호) |
| 19ef41e17ed723b1 | The Morning: Bread/roses | 61 | FAIL | RC-1 6확정 날조 |
| 19ef43efd038a7c1 | Science Times | 18 | 부분 | #9 false split, #4 번역오류(공기질병) |
| 19ef45cdb04e6a9f | Opinion: Iran gift | 8 | PASS | 없음 |
| 19ef4ad79618fa8c | California: L.A. Fire | 15 | 부분 | #10~14 NFL 내비 정크 5건 |
| 19ef4ff7945b625f | In Short: Hyper goo | 19 | 부분 | #14~18 월드컵 위젯 정크 5, 메시 중복 |
| 19ef5a3e4efd1070 | The Amplifier: 7 songs | 22 | FAIL | 과분할 ~11~12 잉여(곡 2~3회) |
| 19ef5a4e44820a06 | Great Read: Epstein | 1 | PASS | 없음 |
| 19ef5a63d2f5e780 | Global Update: Ebola | 5 | PASS | 없음 |
| 19ef60d4be95bd29 | Climate: cash | 24 | 부분 | 베조스 3중복, 일부 수치 추정 |
| 19ef611e801b24cf | The Book Review | 7 | 부분 | #0↔#6 네브래스카 중복 |
| 19ef63ae9893df29 | For You from Opinion | 37 | FAIL | RC-1 5확정 날조 |
| 19ef64965c895cb8 | Many founders of US | 10 | PASS | 깨끗(최우수) |
| 19ef649d5f876071 | The World: Colombia | 51 | FAIL | RC-1 2확정 날조 |
| 19ef680338f2c788 | The Evening: NY primaries | 39 | 부분 | 게임 4 정크, 호르무즈 중복 |
| 19ef6b6f49481061 | On Politics: NY tonight | 20 | FAIL | RC-1 5확정 날조 + 결과트래커 내비 다수 |
| 19ef8c1d6c829907 | Today's Headlines: Mamdani | 63 | 부분 | #14·#55 회피요약("본문 내용 없음")—**금지표현 변종**, 일부 헤드라인 확장 의심 |
| 19ef8e9cf70d2f07 | N.Y. Today: Mamdani win | 33 | FAIL | RC-1 5확정 날조 + 게임 6 정크 |
| 19ef91307c2c146b | Sin agujas(스페인어) | 3 | PASS | 번역 양호 |
| 19ef92187ebee5bb | Headlines: heat wave | 11 | FAIL | RC-1 6확정 날조(11중 6=55%) |
| 19ef93d0516ae05d | The Morning: Q&A | 43 | FAIL | RC-1 6확정 날조 + Q&A 2섹션 누락 |
| 19ef9834758a06b2 | Opinion: Israel dep. | **0** | **전손** | RC-2 오피니언 8건 전손 |
| 19ef9d473c8c9a8f | California: WC backyard | **0** | **전손** | RC-2 뉴스 9건 전손 |

집계: PASS 8 / 부분 14 / FAIL 10 / 전손 2 = **34**.

### 부가 발견 — 회피 요약(금지표현 변종)
19ef8c1d6c829907 #14("…(본문 내용이 충분하지 않아 추가 정보 없음)"), #55("제목만 제공되고 본문 요약은 없음") — "원문 참조"는 아니지만 **요약을 포기한 회피 표현**. 금지표현 정책 위반에 준함. (정규 금지표현 "원문 참조"/"자세한 내용은 링크"는 745건 전체에서 0건.)

---

## 9. 근본원인 → 대책 분류

| RC | 증상 | 결정 주체 |
|----|------|-----------|
| RC-1 꼬리 할루시네이션 | 청크 경계 LLM 자가생성, 병합 미필터 | **LLM**(프롬프트 강화: 입력 외 생성 금지) + **룰**(아이템마다 원문 link/근거 존재 검증, 미존재 시 drop) |
| RC-2 제로 추출 | Opinion/California Today `[제목부제Read more]`·`[저자제목By저자]` 연결포맷 파싱 실패 | **룰/파싱**(전처리 분리) + **SKILL**(두 포맷 명시) |
| RC-3 게임/내비 정크 | boilerplate를 아이템화 | **룰**(URL·문구 필터) |
| RC-4 인명 오류 | 음역 비일관 | **LLM** + **룰**(고유명사 사전) |
| RC-5 중복/과분할 | 추출 과분할 + 병합 부분작동 | **LLM**(1사건1아이템) + 병합 |
| RC-6 번역 | 직역 오류 | **LLM** |

**최우선**: RC-1(거짓정보가 최종 리포트에 노출, "할루시네이션 제로" 원칙 정면 위반) → RC-2(누락 제로 원칙 위반, 17건 전손). 이 둘이 CLAUDE.md 핵심 원칙 1·품질기준 "할루시네이션 제로/누락 제로"를 동시에 깨고 있음.

---

## 부록 — 검증 산출물 위치
- 메일별 대조 덤프(원문+추출): `scratchpad/nyt_dump/<msgid>.txt` (임시)
- 정량/할루 시그니처 스크립트: 결정적 검증, 본 보고 §1·병합 §0에 결과 반영
- 병합 검증: 폭염6·맘다니6·월드컵7 클러스터, 날조 5종 생존 확인
