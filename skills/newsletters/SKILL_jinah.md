# SKILL_jinah

"류진아" <jinah@peaknco.com> 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | "류진아" <jinah@peaknco.com> |
| 발신자 | jinah@peaknco.com |
| 유형 | multi-item |
| 언어 | ko |
| 평균 아이템 수 | 8개 |
| 생성일 | 2026-02-03 |

---

## 구조 분석

### 뉴스레터 특징
- hashtag-based sections for categorization
- article titles and authors separated by '|' character
- no explicit URLs; titles serve as links
- multiple categories: ICT, Data, Security, Column, Global, Interesting
- items separated by blank lines

### 아이템 경계
- each article line ends with a newline, followed by a blank line before the next article
- sections start with a line containing '#Category' tags

### 제목 위치
- title appears before the '|' separator in each article line, often preceded by category hashtags

### 본문 위치
- body content is not present in this clipping; only title and author are provided

### 링크 위치
- title line includes a clickable link to the article; no explicit URL is shown

---

## 추출 규칙

1. Identify sections by hashtags (#ICT, #Data, #Security, #Column, #Global, #Interesting)
2. Extract each article line as title and author
3. Summarize based on title and infer content
4. Use title as link; if no URL, set empty string
5. Exclude header/footer and subscription info

---

## 제외 영역

- ICT NEWS CLIPPING header
- date line
- subscription link
- company info footer

---

## 특이사항

no explicit URLs; rely on title as link; multiple categories separated by hashtags; items not numbered
