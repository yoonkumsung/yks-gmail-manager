# SKILL_scmp_victoria_bela

"Victoria Bela, SCMP" <victoria.bela@e.scmp.com> 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | "Victoria Bela, SCMP" <victoria.bela@e.scmp.com> |
| 발신자 | victoria.bela@e.scmp.com |
| 유형 | multi-item |
| 언어 | en |
| 평균 아이템 수 | 5개 |
| 생성일 | 2026-05-25 |

---

## 구조 분석

### 뉴스레터 특징
- 메인 에세이(단일 주제) 후 관련 기사 목록 제공
- 에디터의 개인적인 논평 형식
- 각 관련 기사는 이미지와 제목, 날짜로 표시

### 아이템 경계
- 메인 에세이는 'Best,\n\nVictoria Bela'로 종료
- 이후 관련 기사는 [IMAGE] 블록으로 구분되며, 각 기사는 제목과 날짜 라인으로 구성

### 제목 위치
- 메인 에세이 제목: '##' 또는 '###' 마크다운 헤더 내 텍스트
- 관련 기사 제목: [IMAGE] 다음 줄의 일반 텍스트 (예: 'How China and Russia could team up...')

### 본문 위치
- 메인 에세이 본문: 제목 다음 줄부터 'Best,' 직전까지의 모든 텍스트
- 관련 기사: 본문 없음 (제목과 날짜만)

### 링크 위치
- 명시적 링크 없음 (이미지에 하이퍼링크가 있을 수 있으나 clean_text에 표시되지 않음)

---

## 추출 규칙

> ⚠️ **번역 필수 (해외 영문 소스)**: 모든 title·summary·keywords를 자연스러운 한국어로 의역한다. 직역·영문 잔존·임의 음역 금지. 인명·회사명·제품명 등 고유명사는 한국어(원어) 병기.

1. 메인 에세이는 헤더에서 제목 추출, 본문 전체를 요약
2. 관련 기사는 제목만 있고 본문이 없으므로 스킵 (SKILL_작성규칙에 따라)

---

## 제외 영역

- 'This email was sent to...' 이후 푸터
- 'Copyright ©' 문구
- 이미지 태그 자체는 제외하나 그 뒤 텍스트는 포함

---

## 특이사항

뉴스레터는 SCMP의 'Dark Matters' 컬럼으로, 에디터 Victoria Bela가 직접 작성한 논평 형식. 관련 기사는 'In case you missed it' 섹션으로 별도 분류.
