# SKILL_substack_philosophors

Philosophors from Philosophy Quotes <philosophors@substack.com> 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | Philosophors from Philosophy Quotes <philosophors@substack.com> |
| 발신자 | philosophors@substack.com |
| 유형 | multi-item |
| 언어 | en |
| 평균 아이템 수 | 3개 |
| 생성일 | 2026-02-07 |

---

## 구조 분석

### 뉴스레터 특징
- 각 아이템은 명시된 번호(Quote №)로 구분
- 각 인용문 뒤에 철학적 질문(Follow-up Question)이 포함

### 아이템 경계
- 'Quote №'로 시작하는 구분 패턴 사용
- 각 인용문은 번호와 함께 구분선 없이 텍스트로 명시

### 제목 위치
- 메일 제목과 본문 시작 부분에 주제 표기
- 각 인용문은 'Quote №'로 시작하는 제목 형식

### 본문 위치
- 인용문 바로 아래에 출처 표기
- 인용문 다음 줄에 '~ Follow-up Question:'으로 질문 제시

### 링크 위치
- 원문 링크 없음
- 후원 링크만 하단에 존재

---

## 추출 규칙

1. 'Quote №'로 시작하는 섹션을 아이템으로 구분
2. 인용문 텍스트와 출처를 본문으로 추출
3. Follow-up Question을 요약에 포함

---

## 제외 영역

- 헤더 및 푸터 영역
- 후원 요청 섹션
- 구독 관련 메시지

---

## 특이사항

각 아이템은 인용문과 질문으로 구성되며, 원문 링크는 제공되지 않음
