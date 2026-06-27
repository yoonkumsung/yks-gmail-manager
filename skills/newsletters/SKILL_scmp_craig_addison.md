# SKILL_scmp_craig_addison

"Craig Addison, SCMP" <craig.addison@e.scmp.com> 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | "Craig Addison, SCMP" <craig.addison@e.scmp.com> |
| 발신자 | craig.addison@e.scmp.com |
| 유형 | multi-item |
| 언어 | en |
| 평균 아이템 수 | 3개 |
| 생성일 | 2026-05-24 |

---

## 구조 분석

### 뉴스레터 특징
- Sections with markdown headings (##), each covering a distinct story
- Introductory paragraph with a link, then two main sections, then a 'best of' section with short links
- Inline hyperlinks within paragraphs to full articles

### 아이템 경계
- Sections separated by '##' headings (e.g., '## Passives break out', '## Tell it like it is')
- Also horizontal lines (| | |) and image placeholders

### 제목 위치
- Within '##' heading text, e.g., 'Passives break out' or 'Tell it like it is'

### 본문 위치
- After the heading, until next '##' heading or end of section
- Includes paragraphs and inline links

### 링크 위치
- Inline hyperlinks within the text, typically with anchor text like 'emerging as the latest AI-driven investor darling' or 'In an interview with SCMP'

---

## 추출 규칙

> ⚠️ **번역 필수 (해외 영문 소스)**: 모든 title·summary·keywords를 자연스러운 한국어로 의역한다. 직역·영문 잔존·임의 음역 금지. 인명·회사명·제품명 등 고유명사는 한국어(원어) 병기.

1. Identify sections by '##' headings
2. For each section, extract the heading as title (clean up)
3. Extract the following paragraphs as summary
4. Find the first hyperlink that points to a full article (scmp.com) and use as link
5. Skip 'best of' section items if no body text

---

## 제외 영역

- The appended full articles after '=== 원문 기사 전문 ==='
- The 'best of' section if only titles and no body text

---

## 특이사항

The newsletter includes an introductory paragraph that may contain a link, but it's not a separate item. The main items are the two sections. Also includes a 'best of' section with four article titles but no summaries.
