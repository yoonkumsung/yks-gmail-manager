# SKILL_scmp_binglin_chen

"Stephen Chen, SCMP" <binglin.chen@e.scmp.com> 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | "Stephen Chen, SCMP" <binglin.chen@e.scmp.com> |
| 발신자 | binglin.chen@e.scmp.com |
| 유형 | single-topic |
| 언어 | en |
| 평균 아이템 수 | 1개 |
| 생성일 | 2026-04-12 |

---

## 구조 분석

### 뉴스레터 특징
- 하나의 주요 기사(칼럼/논평)를 심층 분석하는 구조
- 주요 기사 후 'In case you missed it' 섹션에서 관련 기사 링크 제공
- 서명(Cheers, Stephen)으로 주요 기사가 종료됨

### 아이템 경계
- 주요 기사는 '##' 헤더 라인('Don't buy a Chinese EV without asking this question')으로 시작하여 'Cheers,\n\nStephen' 직전까지.
- 'In case you missed it' 섹션은 별도의 아이템 경계로, 'Science', 'China Economy' 등의 카테고리 라인과 날짜 라인('10 April, 2026')으로 각 하위 기사가 구분됨.

### 제목 위치
- 주요 기사의 제목은 '##' 헤더 태그('## Don't buy a Chinese EV without asking this question') 안에 위치.
- 'In case you missed it' 섹션의 하위 기사 제목은 카테고리 라인 바로 다음 줄에 일반 텍스트로 위치 (예: '2 years on: China proves its ‘desert wheat farms’ are not a hoax').

### 본문 위치
- 주요 기사의 본문은 '##' 헤더 다음 줄부터 시작하여 'Cheers,\n\nStephen' 직전까지의 모든 텍스트.
- 'In case you missed it' 섹션의 하위 기사는 본문 텍스트 없이 제목과 날짜만 존재.

### 링크 위치
- 주요 기사에는 본문 내에 명시적인 'Read More' 링크가 없음.
- 'In case you missed it' 섹션의 하위 기사는 제목이 하이퍼링크일 가능성이 있으나, clean_text에는 URL이 포함되어 있지 않음. 'Read more in the SCMP App'이 공통 링크로 제공됨.

---

## 추출 규칙

1. 주요 기사('##' 헤더로 시작)를 하나의 아이템으로 추출.
2. 'In case you missed it' 섹션의 하위 기사는 본문 내용이 없으므로(제목만 있음) SKIP 규칙에 따라 추출하지 않음.
3. 서명('Cheers,\nStephen') 이후의 텍스트는 부가 정보이므로 제외.

---

## 제외 영역

- 'In case you missed it' 섹션 전체 (본문 없음).
- 'Read more in the SCMP App' 이후의 모든 텍스트 (푸터, 저작권).
- 모든 '[IMAGE: ]' 태그.
- 표 형식의 구분선('| | |').

---

## 특이사항

이 뉴스레터는 'Dark Matters'라는 칼럼/논평 시리즈의 하나로, 저자(Stephen)의 의견을 담은 단일 주제 심층 분석 형식임. 하단의 'In case you missed it'는 본문이 없는 관련 기사 제목 모음으로, 홍보/추천 목적.
