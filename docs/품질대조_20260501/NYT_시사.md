# NYT_시사 품질 대조 (2026-06-01 재수집분)

추출 규칙(`agents/labels/NYT_시사.md`, `agents/labels/_공통규칙.md`, `skills/newsletters/SKILL_nytimes*.md`)대로 추출 후 `clean_text` 원문과 1:1 대조. 대상 10개 메일.

추출 결과: `output/audit_missing_20260601/labels/NYT_시사/items/items_{id}.json`

---

## 메일별 카운트표

| message_id | 발신/에디션 | SKILL | 원문 헤드라인 수 | 추출 수 | 누락 | 정크 | 비고 |
|---|---|---|---|---|---|---|---|
| 19e7d293784c2703 | Today's Headlines | todaysheadlines | 42 기사 + 15 'See more'(섹션푸터) | 42 | 0 | 0 | 섹션헤더/See more 정확히 제외 |
| 19e7d7a8effaed18 | NYT Magazine | nytimes | 리드1+FEATURES4+칼럼7 (실질 12; COVER/COMMENT 제외) | 12 | 0 | 0 | 저자 바이라인 링크(Elena Saavedra Buckley) 제외됨 |
| 19e7d9a9b5dd752b | N.Y. Today | nytimes | 7 + 크롤링 Knicks 1 | 8 | 0 | 0 | **EDC 바이라인 정크 미발생(아래 ★)** |
| 19e7dbfe86d64038 | David French 칼럼 | nytimes | 1 (단일, 본문 페이월) | 1 | 0 | 0 | SKILL 규칙9 단일에디션 |
| 19e7dd1370246df7 | The Morning | nytimes | 리드1 + 불릿 26 | 27 | 0 | 0 | 저자 바이라인(Taffy/Elisabeth/Lulu) 정크 미발생 |
| 19e7e569b5b608e2 | The Great Read | nytimes | 1 (단일, 본문 페이월) | 1 | 0 | 0 | SKILL 규칙9 단일에디션 |
| 19e7e96d1ef2d94d | El Times (스페인어) | nytimes | 5 | 5 | 0 | 0 | 게임(Pips) 제외 |
| 19e7ec443a730aee | The week in climate | nytimes | 8 헤드라인 + 2 에디션 | 10 | 0 | 0 | 사진크레딧 줄 제외 |
| 19e7fcd040c4dad7 | For You | foryou_noreply | Top Pick1 + Magazine/discover 10 (+ 헤드라인전용 6) | 11 | 6(설계상) | 0 | **헤드라인전용은 SKILL 규칙5대로 스킵(아래 ☆)** |
| 19e7fd716bc4dd00 | The World | nytimes | 리드1 + 불릿 21 | 22 | 0 | 0 | 저자 바이라인(Katrin Bennhold) 정크 미발생 |

합계: 추출 **139** 아이템.

---

## ★ 정크(최중요) — 바이라인 한줄 재현 여부 판정

**판정: 본 추출에서는 재현되지 않음(정크 0건). 단, 원문 구조상 재현 위험이 명확히 존재함.**

- 사용자가 지적한 정확한 사례 = `19e7d9a9b5dd752b` (N.Y. Today)의 4번째 기사
  - 원문 링크 텍스트: `Among Mamdani's Priorities, Economic Development Seems Low on the List … By Dana Rubinstein, Sally Goldenberg, Jeffery C. Mays and Emma Goldberg`
  - NYT 링크는 `[헤드라인 + 부제 + "By 저자들"]` 전체가 **하나의 마크다운 링크 텍스트**로 붙어 있음. 줄바꿈/구분자 없이 연결됨.
  - 정규식·줄 단위 파서가 `By ...` 또는 콤마 뒤를 별도 라인으로 끊으면 `"Mays and Emma Goldberg"` 같은 **의미 없는 한줄짜리 아이템**이 떨어져 나옴 → 이것이 사용자가 본 정크의 발생 메커니즘.
  - 본 대조에서는 규칙대로 "헤드라인=title, 부제=summary, 바이라인은 summary 말미에 흡수"로 처리해 **단일 정상 아이템**으로 추출(정크 미발생).
- 동일 위험이 The Morning(`By Taffy Brodesser-Akner`, `By Elisabeth Egan`, `By Lulu Garcia-Navarro`)과 The Magazine(`By Elena Saavedra Buckley`, `Adam Iscoe begins his piece…`)에도 존재. 모두 정상 흡수 처리함.

**결론: "The Morning"류(및 N.Y. Today/Magazine)에서 바이라인이 정크 아이템화하는 것은 — 규칙을 지키면 발생하지 않으나, NYT가 헤드라인+부제+바이라인을 한 링크에 묶는 구조 탓에 단순 split 파서에서는 거의 확실히 재현된다. 즉 "정크 발생 = 파서 결함"이지 입력 데이터 한계가 아님.**

---

## ☆ For You 헤드라인 전용 항목 — 규칙 충돌

- `News you may have missed` 섹션의 6개(After Voting Decision / Handwritten Police Logs / Legal Talent Exodus / Boat Strike 200 / U.F.O. Demons 등)는 **제목만 있고 요약·요약문 없음**.
- `SKILL_nytimes_foryou_noreply.md` 규칙5 = "요약/링크 없는 항목 스킵" → 스킵.
- 그러나 프로젝트 핵심원칙 "정보 누락 제로"와 충돌. 이 6건은 Today's Headlines·The Morning 등 **같은 날 다른 에디션에 요약과 함께 중복 존재**하므로 디다이제스트 최종 병합 단계에서는 실질 누락이 아님(예: Boat Strike 200·CIA·UFO는 다른 메일에서 풀 요약 추출됨). **권장: foryou SKILL의 스킵 규칙을 유지하되, 최종 병합이 라벨 교차 중복제거를 보장해야 함.**

---

## 1. 누락
- 실질 누락 **0건**. 모든 메일에서 본문 헤드라인 수 = 추출 수(섹션헤더/게임/푸터/사진크레딧 정상 제외).
- For You 6건은 위 ☆대로 설계상 스킵(타 에디션에 중복 존재).

## 2. 할루시네이션
- **0건**. 모든 수치가 원문에 존재: 100억 달러 IRS, 18억 달러 펀드, 200명+ 선박타격, 2,690억 달러 NY예산, 35만 명 댄스파티, 스퍼스 111-103, PSG 4-3, 모랭 104세, 콜롬비아인 약 2.2만 명, 호박 2파운드, 800명 체포(프랑스), 138개국·900회(중국 경찰훈련) 등 전부 대조 확인.

## 3. 번역품질
- **양호, 0 문제**. 영문/스페인어 → 자연스러운 한국어 의역. 고유명사 원어 병기(틸리 노우드, 펑차오, 에티시스트 등). 미번역 영문 잔존·혼종 CJK 없음.
- El Times(스페인어)도 정상 번역(마틴 쇼트, 크레아틴, 모던러브 등).

## 4. 정크 — 위 ★ 참조
- 본 추출 **0건**. 바이라인/섹션헤더/'See more'/게임/사진크레딧 모두 비아이템 처리.

## 5. 중복(같은 link/기사)
- 메일 **내부** 중복 0건.
- 메일 **간** 중복은 다수 존재(정상, 라벨 내 동일일자 여러 에디션):
  - Tilly Norwood 인터뷰 = Magazine·The Great Read·The Morning·Today's Headlines·For You (5중복)
  - 추방/콜롬비아 가족 = Magazine·For You
  - IRS 100억·이란 평화안·CIA 금괴·키즈 피트니스·플래트너 문자 = Today's Headlines·For You·(일부 N.Y.Today) 중복
  - 로리 산토스 행복 = Today's Headlines·Magazine·The Morning·For You
  - **→ 최종 병합(Pro/dedup) 단계에서 반드시 통합 필요. 추출 단계 책임 아님.**

## 6. 출처(source) 정확성
- 모두 에디션명 명시(`The New York Times (Today's Headlines/The Morning/The World/N.Y. Today/Climate Forward/El Times)`, `The New York Times Magazine`). **오류 0건.**

## 7. 요약 완결성
- 티저형(1문장)은 50~200자로 짧게, 단일심층(China surveillance·Tilly·추방)은 길게 작성. 분량 비례 충족.
- "원문 참조"식 회피 표현 없음. 단, 크롤링으로만 확인된 Knicks 아이템 summary에 "(원문에서 확인된 추가 아이템)" 메타표현 1건 — 경미하나 정리 권장.

---

## 심각 문제 Top 3
1. **(구조적/최우선) 바이라인 정크 재현 메커니즘 확인**: NYT가 헤드라인+부제+`By 저자` 를 단일 링크 텍스트로 묶어 보내므로, 줄/콤마 단위 split 파서는 `"Mays and Emma Goldberg"` 같은 한줄 정크를 만든다. N.Y. Today·The Morning·Magazine·The World 모두 동일 위험. 파서에서 "링크 텍스트 = 1아이템, `By` 이후는 summary로 흡수" 규칙을 강제해야 함.
2. **메일 간 대량 중복(라벨 내)**: 같은 날 NYT가 10개 에디션을 보내며 핵심 기사(Tilly·IRS·이란·플래트너)가 최대 5중복. 추출은 정상이나 **dedup/병합이 라벨 내 교차 중복을 못 잡으면 다이제스트가 같은 기사로 도배됨.**
3. **For You 스킵 규칙 vs 누락제로 충돌**: foryou SKILL의 헤드라인전용 스킵이 단독 라벨 처리 시엔 누락처럼 보임. 교차 병합으로 보완되지만, 병합이 라벨 단위로만 돌면 6건이 영구 누락될 수 있음 → 병합 범위 점검 필요.
