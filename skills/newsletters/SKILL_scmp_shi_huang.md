# SKILL_scmp_shi_huang

"Shi Huang, SCMP" <shi.huang@e.scmp.com> 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | "Shi Huang, SCMP" <shi.huang@e.scmp.com> |
| 발신자 | shi.huang@e.scmp.com |
| 유형 | multi-item |
| 언어 | ko |
| 평균 아이템 수 | 5개 |
| 생성일 | 2026-03-05 |

---

## 구조 분석

### 뉴스레터 특징
- 카테고리별 섹션 구조 (정치, 외교, 과학 등)
- 메인 심층 분석 기사와 추가 뉴스 항목 병행

### 아이템 경계
- 'Politics', 'Diplomacy', 'Science' 등 카테고리 제목으로 시작하는 섹션 경계

### 제목 위치
- 카테고리 제목 다음 줄의 기사 제목 (예: 'Politics' 다음 줄 'US ‘kill line’ shocks...')

### 본문 위치
- 제목 다음 줄의 날짜 및 이미지 설명 직후 본문 시작, 다음 카테고리 시작 또는 'Cheers,' 문구 전까지

### 링크 위치
- 'Read more in the SCMP App' 라벨과 연동된 이미지 링크

---

## 추출 규칙

1. 카테고리 구분자를 기준으로 아이템 경계 설정
2. 제목은 카테고리 다음 첫 번째 텍스트 라인
3. 본문은 제목 직후부터 다음 섹션 시작 전까지 추출

---

## 제외 영역

- 이메일 서명('Cheers,\n\nShi Huang')
- 수신자 정보('This email was sent to ...')
- 저작권 문구('Copyright (c) ...')

---

## 특이사항

메인 기사는 장문의 분석 내용 포함, 나머지 섹션은 제목과 이미지 위주의 간략한 뉴스
