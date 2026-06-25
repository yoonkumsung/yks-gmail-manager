# SKILL_nytimes_foryou_noreply

The New York Times <foryou-noreply@nytimes.com> 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | The New York Times <foryou-noreply@nytimes.com> |
| 발신자 | foryou-noreply@nytimes.com |
| 유형 | multi-item |
| 언어 | en |
| 평균 아이템 수 | 10개 |
| 생성일 | 2026-05-25 |

---

## 구조 분석

### 뉴스레터 특징
- Personalized newsletter from The New York Times with multiple sections
- Sections: 'Today's Top Pick for You', 'News you may have missed', 'Things to do', 'More to discover'
- Each item has a title, summary, and a tracking link
- Some sections (News you may have missed) contain only headlines without summaries or visible links in the clean text

### 아이템 경계
- Sections separated by headers like 'Today's Top Pick for You', 'Things to do', 'More to discover'
- Within sections, items are separated by blank lines
- Each item starts with a '###' marker followed by the title

### 제목 위치
- After the '###' marker, on the same line or next line
- Example: '### Inside the Senate G.O.P. Meltdown Over Trump’s Fund'

### 본문 위치
- After the title, the summary text appears on the following lines
- Ends when a URL (long tracking link) is encountered

### 링크 위치
- A long tracking URL (starting with 'https://nl.nytimes.com/f/newsletter/...') appears after the summary
- Sometimes preceded by 'Read more' text, sometimes directly after the summary

---

## 추출 규칙

> ⚠️ **번역 필수 (해외 영문 소스)**: 모든 title·summary·keywords를 자연스러운 한국어로 의역한다. 직역·영문 잔존·임의 음역 금지. 인명·회사명·제품명 등 고유명사는 한국어(원어) 병기.

1. Identify sections by headers
2. Within each section, find lines starting with '###' for title
3. Extract summary from next lines until a URL is found
4. Extract the URL as the link
5. Skip items that have only a title and no summary or link (e.g., 'News you may have missed' list)

---

## 제외 영역

- Header greeting ('Hello there,')
- Footer with games (Wordle, Connections, etc.)
- Subscription and contact links
- 'Go to home page' and similar navigation

---

## 특이사항

The newsletter is personalized based on reading history. Some items have 'Read more' before the link, others do not. The 'News you may have missed' section contains only headlines without summaries or explicit links in the clean text, so those are skipped.
