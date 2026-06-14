# 품질 대조: NYT_라이프 (Wirecutter) — 6/1 백필 누락분 검증

대상: `output/audit_missing_20260601/labels/NYT_라이프/` 7개 메일 (NYT Wirecutter / nytdirect@nytimes.com / 'The Recommendation' 일간 뉴스레터)
추출 규칙: `agents/labels/NYT_라이프.md`, `_공통규칙.md`, `skills/newsletters/SKILL_nytimes.md`(Wirecutter 절)
검증 방식: clean_text 본문(뉴스레터 영역) ↔ items 1:1 대조

---

## Wirecutter 구조 특이점

NYT_라이프는 전부 **Wirecutter 'The Recommendation' 데일리**로, DealBook과 완전히 다른 **제품 추천 레이아웃**이다. 뉴스가 아니라 쇼핑/리뷰 콘텐츠라 SKILL 지침대로 "제품명 + 추천 이유"만 간결히 추출. 거의 모든 에디션이 동일 골격:

1. **사전 헤더 한 줄** + 날짜 + **"Today: ... Plus …"** 인트로(상단 3개 링크 미리보기) → 인트로의 3개 링크는 하단 본문에서 다시 등장하므로 **인트로는 제외**(중복 방지).
2. **리드 제품** (subject = 헤드라인. 예: 주머니칼, 스포츠 브라, 창문형 에어컨, 페이스 미스트/매딕스 짐, 헤드폰 가이드).
3. **'Plus:' 메인 라운드업** (아버지날 37선, 스포츠 브라 6선, 셀프태너 등).
4. **중간 섹션** — 에디션마다 이름이 다름: 'More practical (and cute!) gifts' / 'What's hot at Wirecutter' / 'More from Rose' / 'Some of the cool kids' / 'More for your ears' — **3~4개 링크 각각이 별도 아이템**. 각 항목은 `[제목설명→](URL)` 형태로 제목·설명이 한 줄에 붙어 있음(split 주의 구간).
5. **'Your daily deal:'** — 할인 제품 1개.
6. **'One last thing:'** — 마무리 1개.
7. (life_5만) **'Watch Wirecutter'** 영상 3링크 테이블 → 1개로 묶음. (life_7만) **'Editor's pick'** 1개.
8. **푸터**(Subscribe/Privacy/Contact, "You can reach the Wirecutter Newsletters team…", 설문/테스터 모집) + **`=== 원문 기사 전문 ===`** 이하 크롤링 본문 → 전부 제외.

DealBook과 달리 **바이라인 정크 위험은 낮음**(저자명은 "By [이름]" 한 줄로 픽 사이에 들어가며, life_1의 5개 staff 픽은 각 "By 이름" 뒤 문단이 독립 아이템). 핵심 함정은 (a) 상단 'Plus …' 인트로 링크를 본문 아이템과 **중복 카운트**, (b) 중간 섹션 4개 링크를 한 덩어리로 뭉개기.

---

## 이메일별 카운트표

| mid | subject | 구조 | 추출 items | 누락 | 정크 |
|---|---|---|---|---|---|
| 19e7e0485ec27595 | A jack-of-all-trades stain remover (May 31) | 5 staff픽 + 인기100 + cool kids 4 + 데일리딜 + 피클 | 12 | 0 | 0 |
| 19eaed557cadf12e | A very giftable knife | 리드 + 아버지날37 + 4링크 + 데일리딜 + 마지막 | 8 | 0 | 0 |
| 19eb3a3eb6bcdab4 | This sports bra feels like nothing | 리드 + 브라6선 + More from Rose 4 + 데일리딜 + 마지막 | 8 | 0 | 0 |
| 19eb89916528d30a | The best ACs out there | 리드 + 가짜AC + 3링크 + 데일리딜 + 마지막 | 7 | 0 | 0 |
| 19ebd7cb590ada28 | A soothing face mist | 리드(매딕스) + 셀프태너 + 3링크 + 데일리딜 + 영상3 + 마지막 | 9 | 0 | 0 |
| 19ec0f6ef2539b59 | Our 8 favorite white sneakers | 단일 라운드업만 | 1 | 0 | 0 |
| 19ec61df893cca5e | desert-island headphones | 리드(가이드) + 와이어커터쇼 + 3링크 + 에디터픽 + 마지막 | 8 | 0 | 0 |
| **합계** | | | **53** | **0** | **0** |

### 세부 매핑 메모
- **19e7e0485ec27595**: "best things we bought in May" 특집이라 staff 픽 5개(네일폴리시·바닐라 아이스크림·사운드바·얼룩제거제·벌레포집기)가 각각 독립 아이템. 이어 인기 100선, 'Some of the cool kids' 4개(시트·공기청정기·브라렛·캐리어), 데일리딜(수건), One last thing(피클 가이드) = 12개. 상단 'Plus' 3링크(브라렛/공기청정기/수건)는 본문과 중복이라 별도 카운트 안 함.
- **19ec0f6ef2539b59**: subject "8 favorite white sneakers"가 곧 본문 전부인 **단일 라운드업 에디션**. SKILL의 "단일 콘텐츠 → 최소 1개" 규칙대로 1개 추출(0개 금지 회피).
- **19ebd7cb590ada28**: 'Watch Wirecutter' 영상 3개(휴대용 선풍기/피클 만들기/라모른 모리스 리액션)는 테이블 한 행 프로모 영상이라 **1개로 통합**(정크 fragmentation 회피).

---

## 문제 목록

### 누락
- **0건.** 7개 메일의 리드·라운드업·중간섹션 링크·데일리딜·마지막·영상까지 전부 매핑. 53/53. 상단 인트로 링크는 의도적 비추출(본문 중복).

### 할루시네이션
- **0건.** 수치 1:1 대조:
  - white sneakers: 2019년부터 40개 후보/288켤레 검토/8선 — 크롤링 원문(life_6)과 일치.
  - 무알코올맥주 44종, 수영복 54종, 셀프태너 15종, 헤드폰 2000개 이상, 소니 MDR-7506 15년/이어패드만 교체, 허기 귀걸이 $4,000, 캐리어 67개 가방, 아버지날 37선, 수건/에어컨 20% 할인, 로퍼 $75 할인, 음악선물 13선, 벌레기피제 $4 — 전부 원문 표현 일치. 원문에 없는 가격/수치 생성 0건(가격 미명시 제품은 추측 가격 넣지 않음).

### 정크
- **0건.** "We independently review everything…"(제휴 고지), "Were you forwarded…"(구독 권유), 푸터, 테스터 모집/설문, "원문 기사 전문" 이하 크롤링 본문 모두 제외. "By [저자]" 줄은 staff 픽의 작성자 표기로만 쓰고 별도 아이템화하지 않음.

### 중복
- **0건(라벨 내 동일 사건/link).** 상단 'Today … Plus' 인트로가 하단 본문 링크와 **동일 URL로 중복**되는 구조적 함정이 있으나, 인트로를 추출 대상에서 제외해 중복 0. 예: life_2의 데일리딜 로퍼와 인트로 '#3 leather loafers'는 같은 URL(QV1M9…)이며 인트로를 뺐으므로 1회만 추출됨(정상).
  - cross-mid: 7개 에디션 간 동일 제품 반복은 없음(매일 다른 제품군).

### 출처(source) 정확성
- **오류 0건.** 7개 메일 모두 source를 `"NYT Wirecutter"`로 통일(SKILL 메타 이름 일치). NYT가 여러 source명으로 분리되는 문제 없음. ※ from 헤더가 `NYT Wirecutter <nytdirect@nytimes.com>`로 DealBook과 동일 발신주소를 공유하나 subject/콘텐츠로 Wirecutter 식별 → source 분리 정확.

### 번역 품질
- 영문 잔존 0건. 고유명사 음역: Essie→에시, Wirecutter→와이어커터, AirPods→에어팟(원어 병기), New Balance→뉴발란스, Bormioli Rocco→보르미올리 로코, Banana Republic→바나나 리퍼블릭, Ariana Madix→아리아나 매딕스, Sony MDR-7506→소니 MDR-7506, Lauren Dragan→로런 드래건, Sofia Sokolove→소피아 소콜로베, Away→어웨이, Lamorne Morris→라모른 모리스, huggie→허기(원어 병기) — 표준 음역, 혼종 CJK 없음.
- 제품 영문명은 한국어 번역 병기 또는 원어 유지(브랜드명). "jack-of-all-trades"→'만능', "buy-it-for-life"→'평생 쓸', "desert-island"→'무인도' 등 자연스러운 의역. items 내부 텍스트에 영어 섹션명 잔존 없음.

### 요약 완결성
- 리드·가이드 아이템(헤드폰 가이드, 매딕스, white sneakers, 에어컨)은 200~500자로 제품 특징+근거 충족. 중간섹션 티저 링크는 50~150자로 분량 비례(짧은 티저 허용). "원문 링크에서 확인" 식 회피 표현 0건 — SKILL이 경고한 "해당 링크에서 확인 가능" 패턴 미발생.

---

## 요약표

| 항목 | 건수 |
|---|---|
| 총 아이템 | 53 |
| 누락 | 0 |
| 할루시네이션 | 0 |
| 정크 | 0 |
| 중복(라벨 내 동일 사건/link) | 0 |
| 출처 오류 | 0 |
| 번역 문제(미번역·음역오류·혼종) | 0 |

**종합 판정: 통과.** 6/1 백필이 0건으로 놓쳤던 NYT_라이프(Wirecutter) 7개 메일은 정상 추출 가능. 단일 라운드업 에디션(white sneakers)의 0개 추출 위험과 상단 인트로 링크 중복 함정을 모두 회피함. 백필 0건은 추출 품질이 아닌 수집/파이프라인 누락이 원인.
