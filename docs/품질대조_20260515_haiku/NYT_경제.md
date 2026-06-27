# NYT_경제 라벨 / 2026-05-15 전수 품질 대조 리포트

## 요약
- 메일 1건(DealBook, nytdirect@nytimes.com, Sorkin). SKILL_nytimes(en, 번역 필수, DealBook=딜규모/밸류 필수). 기존 items 13건.
- A-2 번역 PASS(이미 한국어). **A-1 치명 결함: link 13/13 전부 빈 문자열**(원문에 NYT 링크 명백 존재). 할루 2, 오타·오역 다수, 누락 경미.

## A-1 스키마 — 부분 FAIL
- 구조/5필드/keywords 배열/source: PASS.
- **link 채움: FAIL** — 13건 전부 `""`. 원문 clean_text에 각 아이템 `[text](nl.nytimes.com/...)` 링크 존재(예: Modal `[a $4.5 billion valuation](https://nl.nytimes.com/f/a/...)`). **링크 추출 0%** = 처리규칙5 위반. 룰/파싱 문제(추출기가 멀쩡한 markdown 링크를 비움).

## A-2 번역 — PASS (이미 한국어, 품질 차원 교정)
- 전건 한국어 의역. before→after 품질: Honda "손상차각"→"손상차손(write-down)" 오타, Mamdani "LA 주도"→"뉴욕시장(NYC)" 오역, "활성화 블리자드"→"액티비전 블리자드(Activision Blizzard)" 회사명 직역오류, "암과 소프트뱅크"→"암(Arm)·소프트뱅크(SoftBank)" 병기.

## 이슈 목록
- [치명·할루] 켄 그리핀 "**LA 주도** 마문다니 시장" ← Mamdani는 **뉴욕시(NYC)** 시장. "LA"는 원문 무근거 할루.
- [할루·경미] 프랫 "칼시 27% 승률"만 적고 "배스 54% 1위" 맥락 누락.
- [치명·룰] link 13건 전무(A-1 FAIL).
- [오타] Honda "손상차각", Mamdani "직점 언급".
- [오역] "활성화 블리자드"(Activision 기계직역).
- [과편집] Treasury 단일 분석섹션을 3 아이템 분할(병합 권장).
- 누락(개수) 0. 빈배열 0.

## before/after
| 지표 | before | after |
|---|---|---|
| 아이템 | 13 | 12(Treasury 3→2 병합) |
| link 채움 | 0/13(0%) | 11/12(92%) |
| 할루 | 2 | 0 |
| 고유명사 오역/오타 | 3 | 0 |

## 종합 판정 — A-1 부분 FAIL(link) / A-2 PASS / 할루 교정 필요
최대 결함 2: **link 추출 0%(룰/파싱 — clean_text에 링크 멀쩡한데 비움, 즉시 점검)** + **Mamdani LA→NYC 도시 할루(LLM 프롬프트 가드)**. 누락·중복 없음. 회사명 원어병기 강제 규칙 SKILL 명시 가치.
