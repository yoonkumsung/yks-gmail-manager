# SKILL_hypebae

Hypebae <noreply@hypebae.com> 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | Hypebae <noreply@hypebae.com> |
| 발신자 | noreply@hypebae.com |
| 유형 | multi-item |
| 언어 | en |
| 평균 아이템 수 | 6개 |
| 생성일 | 2026-05-25 |

---

## 구조 분석

### 뉴스레터 특징
- Uses '##' headings for main article sections
- Subheadings with emoji + bold text (e.g., '🏈 ** From Super Bowl to the Store:**')
- Sections separated by '---SECTION_BREAK---'
- Includes a 'More You Need to Know' section with bullet-style items
- Has an 'Across the Board' list of headlines without links
- Footer with unsubscribe and copyright info

### 아이템 경계
- Main sections separated by '---SECTION_BREAK---' line
- Within 'More You Need to Know', items are separated by newlines and start with emoji (💅🏻, 🕶️, 🩲)

### 제목 위치
- For main sections: text after '## ' heading (e.g., '## Bad Bunny and Zara Is Actually Happening')
- For 'More You Need to Know': text after emoji and before the link (e.g., '💅🏻 Did Patrick Ta Just Reinvent Blush?')

### 본문 위치
- For main sections: text after the heading and subheadings, until next '---SECTION_BREAK---' or end of section
- For 'More You Need to Know': text after the title until the next emoji or end of section

### 링크 위치
- Hyperlinked text within the body, often after emoji and bold text (e.g., '[The collection](URL)', '[Sadi Studios](URL)', '[Unboxing the Pink Pack](URL)', '[Liquid Transition Brightening Blush](URL)')

---

## 추출 규칙

1. Identify main sections by '##' headings
2. For each main section, extract title from heading, body from following paragraphs until next section break
3. For 'More You Need to Know', treat each emoji-prefixed line as separate item
4. Extract link from the first hyperlink within the item's body
5. Skip items without links (e.g., 'Across the Board' list)

---

## 제외 영역

- 'Advertisement' lines
- 'Across the Board' section (no links)
- Footer with subscription info and copyright
- Full article text after '=== 원문 기사 전문 ==='

---

## 특이사항

None
