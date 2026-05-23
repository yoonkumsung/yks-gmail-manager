# SKILL_techcrunch

TechCrunch Daily News <newsletters@techcrunch.com> 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | TechCrunch Daily News <newsletters@techcrunch.com> |
| 발신자 | newsletters@techcrunch.com |
| 유형 | multi-item |
| 언어 | en |
| 평균 아이템 수 | 10개 |
| 생성일 | 2026-05-23 |

---

## 구조 분석

### 뉴스레터 특징
- 2개 섹션: 메인 뉴스(상단) + **Afternoon Must-Reads**(하단)
- 메인: 2~4개 주요 기사 (제목 + 2~3문단 본문 + 링크)
- Afternoon Must-Reads: 5~8개 추가 기사 (제목 + 1줄 설명 + 링크)
- 모든 기사에 techcrunch.com 원문 링크 포함

### 섹션 구조

1. **메인 뉴스** (상단)
   - 각 기사: 굵은 제목 → 본문 2~3문단 → 링크
   - 기사 간 빈 줄 또는 구분선

2. **Afternoon Must-Reads** (하단)
   - "Afternoon Must-Reads" 헤더로 시작
   - 각 기사: 제목(링크) + 짧은 설명(1줄)
   - 개수가 많으므로 **빠짐없이 모두 추출**

### 아이템 경계
- 메인: 기사 간 빈 줄
- Must-Reads: 각 줄이 하나의 뉴스

### 링크 위치
- 대괄호 안 techcrunch.com URL

---

## 추출 규칙

1. **메인 뉴스와 Afternoon Must-Reads 모두 빠짐없이 추출**
2. 메인 기사: 300~500자 한국어 요약 (핵심사실+수치+배경+시사점)
3. Must-Reads: 제목+설명 기반 한국어 요약 (짧아도 OK)
4. 제목 20~50자 (한국어 번역)
5. 키워드 3~5개
6. techcrunch.com 원문 URL 추출
7. **영문 → 한국어 번역 필수**, 고유명사는 원어 유지 가능

---

## 제외 영역

- 뉴스레터 헤더 (TechCrunch logo, 날짜)
- 하단 푸터 (구독 관리, 소셜 링크)
- 광고/스폰서 배너

---

## 특이사항

- Afternoon Must-Reads 섹션이 누락되기 쉬움 — **반드시 포함**
- 영문이므로 번역 품질 중요 (직역 금지, 자연스러운 한국어)
