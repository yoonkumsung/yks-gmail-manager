# NYT_시사 라벨 / 2026-05-15 전수 품질 대조 리포트

## 요약
- 메일 20건 / 아이템 222개 / 이슈 7유형. 영문(+스페인어 El Times) NYT라 A-2 검증 핵심.
- A-2 번역 양호(발신자 전건 PASS)나 **A-1 스키마(link·숫자)에서 3개 심각 코드 버그** 확인.

## A-1 스키마 — FAIL (3개 버그)
구조는 정상(222/222 5필드). 그러나:
1. **link 빈칸 52/222(23%)** — 원문에 링크 멀쩡한데 비움. Climate(19e27f649f0c22a2) **13/13 전부 빈칸**↔원문 nyt 링크 39개 실재(NYT_경제 13/13 버그 동형). The Morning 20/22 빈칸, Today's Headlines 앞쪽 0–15 빈칸.
2. **link에 마크다운 원문 혼입 35/222** — 전부 Today's Headlines(19e259d4). `"[Man Pleads Guilty…](https://nl…)"` 통째 저장(URL만 들어가야 하는데 `[텍스트](URL)` 누수).
3. **달러+숫자 토큰 소실(StrictlyVC 버그 동형)** — 원문 8메일에 `$`-숫자 29토큰(Climate $20M·$4.6M·$354,000·$77.59/MWh 등). 출력 222개 중 **`$` 포함 summary=0**. Climate 요약 "수억 달러"로 뭉갬. link 필드 마크다운엔 `$4 Billion` 생존 → **소실은 summary/텍스트 직렬화 경로 한정.**

## A-2 번역 — 발신자 전건 PASS
nytdirect(Evening/Morning/Docket/Climate/World)·El Times(스페인어)·David French·McWhorter·breakingnews/foryou/todaysheadlines 모두 영문/스페인어 잔존 0, 고유명사 원어병기 양호(Graham Platner, Kevin Warsh, D'Artagnan 등). before도 이미 한국어 → 극적 변화 없음. 잔여 영문은 link 필드 마크다운(버그2 부수효과)에 갇힘.
- **source 정규화 난립**: New York Times/NYT/뉴욕타임스/뉴욕타임즈/El Times/The Morning… → 룰 정규화 필요.

## 이슈 목록
- [누락·최대] 후반 섹션 통째: El Times(19e2609c) 후반 3섹션(LA GUERRA EN IRÁN·Otras noticias·EN INGLÉS, ~40% 손실), The Docket 9중 6(독서섹션 3 누락), The Morning culture 후반 누락.
- [할루] 0 — NYT 고볼륨 긴 메일 청크 끝 가짜 단신(RC C-O ⓑ) 점검 결과 **없음**(청크경계 문제는 할루 아닌 "후반 누락"으로 발현).
- [0건·타당] The Headlines(19e25fccc) 0 items = 오디오 브리핑 티저+푸터뿐(본문 없음). SKILL 규칙9와 형식충돌 → 오디오전용 예외 명문화.
- [번역 minor] raw milk→"원유"(생우유 정확).
- 중복·정크 0.

## before/after
| 지표 | 222 아이템 |
|---|---|
| link 빈칸 | 52(23%) |
| link 마크다운 혼입 | 35(todaysheadlines) |
| 정상 URL link | 135(61%) |
| summary `$`숫자 포함 | 0(원문 29토큰) |
| 후반 누락 메일 | 3 |
| 영문잔존 title/summary | 0 |

## 종합 판정 — A-1 FAIL / A-2 PASS
A-2 번역·원어병기 발신자 전건 PASS. A-1은 3개 룰베이스 버그(link 빈칸 23%·Climate 100%, todaysheadlines 마크다운 누수 35, `$`숫자 100% 소실) + 후반 섹션 누락 3 + source 난립. 귀속: link 파싱·`$`보존·source 정규화=룰(코드), 후반 누락=LLM/청킹.
