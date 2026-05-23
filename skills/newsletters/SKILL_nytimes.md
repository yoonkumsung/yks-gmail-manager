# SKILL_nytimes

The New York Times <nytdirect@nytimes.com> 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | The New York Times <nytdirect@nytimes.com> |
| 발신자 | nytdirect@nytimes.com |
| 유형 | multi-item |
| 언어 | en |
| 평균 아이템 수 | 8개 |
| 생성일 | 2026-05-23 |

---

## 구조 분석

### 동일 발신자에서 여러 에디션 발송
같은 nytdirect@nytimes.com에서 다양한 에디션이 옴. Subject로 구분:

1. **The Evening** (가장 긴, 10~35K자)
   - "Good evening. Here's the latest" 로 시작
   - 섹션: 주요 뉴스 → "More top news" → "In other politics news" → "Immigration" 등
   - 각 뉴스에 사진 크레딧 + 본문 + nytimes.com 링크

2. **The World** (해외 뉴스 요약)
   - "Five stories you might have missed" 등
   - 5개 주요 국제 뉴스 + 사진 + 본문

3. **DealBook** (Andrew Ross Sorkin)
   - M&A, 투자, 금융 딜 중심
   - 딜 규모, 밸류에이션 수치 중요

4. **In Short** (짧은 뉴스 모음)
   - 5~10개 짧은 뉴스 항목

5. **NYT Wirecutter** (제품 리뷰/추천)
   - 뉴스가 아닌 쇼핑/리뷰 콘텐츠
   - 제품명과 추천 이유 위주로 추출

### 섹션 마커
- "More top news" → 추가 뉴스 섹션 시작
- "In other politics news:" → 정치 뉴스
- "In other news:" → 기타 뉴스
- "Immigration" → 이민 뉴스
- "Also," → 부가 뉴스 시작
- "Plus," → 부가 콘텐츠
- "What's hot at Wirecutter" → Wirecutter 인기 상품

### 아이템 경계
- 사진 크레딧 줄(/The New York Times, /Getty Images)이 기사 시작 표시
- 굵은 제목 또는 링크 텍스트가 각 아이템의 제목

### 링크 위치
- 대괄호 안 nytimes.com URL

---

## 추출 규칙

1. **모든 섹션의 모든 뉴스를 빠짐없이 추출** — "More top news", "In other" 포함
2. The Evening/The World: 각 뉴스 300~500자 한국어 요약
3. DealBook: 딜 규모, 기업, 밸류에이션 수치 필수
4. In Short: 각 항목 짧은 한국어 요약
5. Wirecutter: 제품명 + 추천 이유 (뉴스가 아니므로 간략하게)
6. 제목 20~50자 (한국어 번역)
7. 키워드 3~5개
8. nytimes.com 원문 URL 추출

### ⚠️ 번역 필수
- 모든 출력 한국어. 직역 금지, 자연스러운 의역.
- 고유명사(인물명, 기관명)는 원어 유지 가능.

---

## 제외 영역

- 사진 크레딧 줄 자체 (기사 구분 마커로만 사용)
- "The New York Times" 로고/헤더
- Podcast 안내 (Host:, Editor:)
- 하단 구독/수신거부

---

## 특이사항

- 본문이 매우 길 수 있음 (35K자) → 섹션 마커 기반 분할 필요
- 같은 날 여러 에디션이 올 수 있음 → 각 에디션 독립 처리
- 페이월 콘텐츠이므로 뉴스레터 본문에 있는 내용만 활용
