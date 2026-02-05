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
| 평균 아이템 수 | 8개 |
| 생성일 | 2026-02-05 |

---

## 구조 분석

### 뉴스레터 특징
- Top 3 주요 기사 강조
- Morning Must-Reads 섹션 포함
- 광고 및 이벤트 메시지 삽입

### 아이템 경계
- 제목과 'Read More' 링크로 구분
- 섹션별로 아이템 그룹화 (TechCrunch Top 3, Morning Must-Reads 등)

### 제목 위치
- 제목은 본문 시작 부분에 bold 없이 명시
- 이미지 캡션 형태로 추가 제목 포함

### 본문 위치
- 제목 바로 아래 한 문장 요약
- 인용문이 있는 경우 따옴표로 표시

### 링크 위치
- 각 아이템 끝에 'Read More' 링크 포함

---

## 추출 규칙

1. 'Read More' 전까지의 텍스트를 요약
2. 인용문은 따옴표 안 내용 포함
3. 광고 섹션은 제외

---

## 제외 영역

- 광고 메시지
- 뉴스레터 구독 관련 안내
- 소셜 미디어 링크

---

## 특이사항

영문 콘텐츠 번역 필요
