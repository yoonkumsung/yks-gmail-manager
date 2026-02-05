# SKILL_sportspromedia

SportsPro Daily <no-reply@sportspromedia.com> 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | SportsPro Daily <no-reply@sportspromedia.com> |
| 발신자 | no-reply@sportspromedia.com |
| 유형 | multi-item |
| 언어 | en |
| 평균 아이템 수 | 9개 |
| 생성일 | 2026-02-05 |

---

## 구조 분석

### 뉴스레터 특징
- 각 아이템은 제목과 간단한 설명으로 구성
- 이미지와 링크가 포함된 구조

### 아이템 경계
- 제목과 설명으로 구분
- 이미지와 READ FULL STORY로 아이템 경계 표시

### 제목 위치
- 제목은 bold 또는 큰 글씨로 시작

### 본문 위치
- 제목 다음에 본문 텍스트 위치

### 링크 위치
- READ FULL STORY 또는 본문 내 URL

---

## 추출 규칙

1. 제목과 본문 추출
2. 관련 링크 포함
3. 이미지 제외

---

## 제외 영역

- 헤더 이미지
- 푸터 주소 정보

---

## 특이사항

이미지가 많아 본문 추출 시 주의 필요
