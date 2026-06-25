# SKILL_hypebeast

Hypebeast <noreply@hypebeast.com> 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | Hypebeast <noreply@hypebeast.com> |
| 발신자 | noreply@hypebeast.com |
| 유형 | multi-item |
| 언어 | en |
| 평균 아이템 수 | 5개 |
| 생성일 | 2026-05-25 |

---

## 구조 분석

### 뉴스레터 특징
- 이메일 본문은 '---SECTION_BREAK---'로 구분된 여러 섹션으로 구성
- 각 주요 기사는 '## '로 시작하는 제목과 이모지(🌎, 👕, 🇵🇷 등)로 시작하는 요약 bullet points로 구성
- 'Your Fashion Briefing This Week' 섹션은 짧은 코멘트와 링크가 있는 여러 아이템을 나열
- 'Across the Board'와 'Upcoming Drops' 섹션은 제목과 링크만 제공
- 광고(Advertisement)와 푸터 정보 포함

### 아이템 경계
- 주요 기사: '---SECTION_BREAK---'로 각 기사 구분
- 'Your Fashion Briefing This Week' 내 아이템: 각 줄이 이모지(⚠️, 👖, 👀, 💥, 🦶🏼)로 시작하고, 그 뒤에 인용문과 링크가 있음
- 'Across the Board': 각 줄이 'Hypeart', 'Hypeform' 등 섹션명으로 시작하고, 그 뒤에 기사 제목이 이어짐 (링크 없음)
- 'Upcoming Drops': 각 줄이 날짜(예: 'May 21, 2026:')와 제품명, 링크로 구성

### 제목 위치
- 주요 기사: '## ' 다음의 텍스트 (예: '## Bad Bunny and Zara Launch the Expansive BENITO ANTONIO Collection')
- 'Your Fashion Briefing': 각 아이템의 첫 번째 문장 (예: '"Starts raining and your ass is a Spider-Man villain"' 등)
- 'Across the Board': 섹션명 뒤의 기사 제목 (예: 'Unauthorized Larry Gagosian Documentary Goes Inside His Art Empire')
- 'Upcoming Drops': 날짜 뒤의 제품명 (예: 'Carpet Company x Salomon XT-Whisper Void')

### 본문 위치
- 주요 기사: 제목 아래 이모지로 시작하는 bullet points (🌎, 👕, 🇵🇷 등)가 본문 역할. 각 bullet은 짧은 설명과 링크 포함.
- 'Your Fashion Briefing': 각 아이템의 인용문과 링크가 본문. 별도 설명 없음.
- 'Across the Board' 및 'Upcoming Drops': 본문 없음 (제목과 링크만)

### 링크 위치
- 주요 기사: 첫 번째 bullet point 내 하이퍼링크 (예: '[150-piece collaboration](http://...)'). 이후 bullet에는 링크 없음.
- 'Your Fashion Briefing': 각 아이템의 인용문 내 하이퍼링크 (예: '[⁠jacket with 180 speakers](http://...)')
- 'Upcoming Drops': 각 제품명 뒤의 하이퍼링크 (예: '[Carpet Company x Salomon XT-Whisper Void](http://...)')

---

## 추출 규칙

> ⚠️ **번역 필수 (해외 영문 소스)**: 모든 title·summary·keywords를 자연스러운 한국어로 의역한다. 직역·영문 잔존·임의 음역 금지. 인명·회사명·제품명 등 고유명사는 한국어(원어) 병기.

1. 주요 기사: '## ' 제목을 아이템 제목으로 사용. 첫 번째 bullet point의 링크를 아이템 링크로 사용. 모든 bullet point의 내용을 합쳐 요약 작성.
2. 'Your Fashion Briefing': 각 아이템의 첫 문장(인용문)을 제목으로 사용. 인용문 내 링크를 아이템 링크로 사용. 본문이 짧으므로 인용문과 함께 간단한 설명 추가.
3. 'Across the Board' 및 'Upcoming Drops': 본문이 없으므로 스킵 (링크만 있는 경우).

---

## 제외 영역

- 'Advertisement' 섹션
- 'Download the Hype App' 섹션
- 푸터 (구독 정보, 주소, 저작권)
- 'Across the Board' 및 'Upcoming Drops' (본문 부재)
- 원문 기사 전문 (=== 원문 기사 전문 === 이후)

---

## 특이사항

이 뉴스레터는 주요 기사 3개와 짧은 뉴스 브리핑, 드롭 일정으로 구성. 주요 기사는 각각 하나의 링크만 제공하며, 나머지 bullet은 설명만 있음. 'Your Fashion Briefing'은 소셜 미디어 인용문 형태로 간결함.
