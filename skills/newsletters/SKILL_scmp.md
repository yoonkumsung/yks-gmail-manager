# SKILL_scmp

South China Morning Post <news@e.scmp.com> 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | South China Morning Post <news@e.scmp.com> |
| 발신자 | news@e.scmp.com |
| 유형 | multi-item |
| 언어 | en |
| 평균 아이템 수 | 9개 |
| 생성일 | 2026-04-10 |

---

## 구조 분석

### 뉴스레터 특징
- 각 아이템은 카테고리명(예: Entertainment, Food & Drink)과 제목으로 구성
- 카테고리명은 대문자로 표시되고 제목은 그 아래 줄에 위치
- 뉴스레터는 SCMP의 Life & Culture 섹션 콘텐츠를 제공

### 아이템 경계
- 각 아이템은 카테고리명(예: 'Entertainment', 'Food & Drink', 'Arts')으로 시작하는 라인이 경계
- 카테고리명과 제목 사이에 빈 줄 없음

### 제목 위치
- 카테고리명 바로 다음 줄에 위치한 텍스트가 제목 (예: 'Entertainment' 다음 줄의 'How Gingle Wang went from clueless novice...')

### 본문 위치
- 본문 텍스트는 제공되지 않음. clean_text에는 제목만 포함

### 링크 위치
- 링크는 제공되지 않음. clean_text에는 URL이 없음. 'Read more in the SCMP App'는 일반적인 액션 호출

---

## 추출 규칙

1. 'LIFE & CULTURE' 헤더와 날짜 이후부터 '| Read more in the SCMP App |' 표 이전까지의 텍스트에서 아이템 추출
2. 카테고리명으로 시작하는 각 라인과 그 바로 다음 줄의 제목을 하나의 아이템으로 구성
3. 카테고리명은 'source' 필드에 사용, 제목은 'title' 필드에 사용

---

## 제외 영역

- 'LIFE & CULTURE' 헤더와 날짜 라인
- '| Read more in the SCMP App |' 표 및 이후의 모든 텍스트
- 'This email was sent to...' 및 Copyright 라인

---

## 특이사항

본문 내용(요약)이 clean_text에 포함되지 않음. 제목만 추출 가능. 링크 URL도 없음.
