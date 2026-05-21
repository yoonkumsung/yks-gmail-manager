# SKILL_community

Morning Brew <crew@community.morningbrew.com> 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | Morning Brew <crew@community.morningbrew.com> |
| 발신자 | crew@community.morningbrew.com |
| 유형 | single-topic |
| 언어 | en |
| 평균 아이템 수 | 1개 |
| 생성일 | 2026-05-21 |

---

## 구조 분석

### 뉴스레터 특징
- 이벤트/웨비나 초대형 뉴스레터
- 강연자 소개 섹션 포함
- 등록 링크와 녹화본 제공 약속 포함

### 아이템 경계
- 전체 메일이 하나의 이벤트(웨비나)를 소개하는 단일 아이템으로 구성됨
- 'Featuring' 섹션 이후는 강연자 소개 및 법적 정보

### 제목 위치
- 'How Smarter Tech Brings Smarter Business Growth' 라인 (제목 형식의 텍스트)

### 본문 위치
- 'Hey there,' 이후부터 'Hope to see you there!' 직전까지의 텍스트 블록
- 불릿 포인트(•)로 주요 내용 나열

### 링크 위치
- 'Register here' 텍스트에 연결된 URL (이벤트 등록 링크)
- 'click here' 텍스트에 연결된 URL (구독 취소 링크, 제외 대상)

---

## 추출 규칙

1. 단일 이벤트 아이템으로 추출
2. 'Hey there,'로 시작하는 본문 텍스트를 요약에 활용
3. 불릿 포인트(•)로 나열된 세부 주제를 요약에 포함
4. 'Featuring' 섹션 이후의 내용은 제외

---

## 제외 영역

- 'Featuring' 섹션 이후의 강연자 소개
- 'Morning Brew Inc.'로 시작하는 법적 정보 및 주소
- 구독 관리 관련 텍스트('To stop receiving emails...')

---

## 특이사항

웨비나 초대 메일로, 등록 링크가 주요 CTA. 녹화본 제공을 약속함.
