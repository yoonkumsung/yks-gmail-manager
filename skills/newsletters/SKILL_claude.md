# SKILL_claude

Claude Team <no-reply@email.claude.com> 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | Claude Team <no-reply@email.claude.com> |
| 발신자 | no-reply@email.claude.com |
| 유형 | multi-item |
| 언어 | en |
| 평균 아이템 수 | 7개 |
| 생성일 | 2026-04-17 |

---

## 구조 분석

### 뉴스레터 특징
- 제목과 본문이 '|' 테이블 구조로 구분된 아이템들
- 각 아이템은 '| |'로 시작하는 제목 라인과 본문 설명으로 구성
- 'Learn more', 'Get the app', 'Try it' 등의 CTA 링크 포함
- 기술 제품 업데이트 및 기능 소개 중심

### 아이템 경계
- '| |'로 시작하는 라인이 새로운 아이템의 제목
- 각 아이템은 테이블 구조로 구분되어 있으며, 다음 '| |' 라인이 나타날 때까지가 하나의 아이템 영역
- 아이템 간에는 빈 줄로 구분됨

### 제목 위치
- '| |' 테이블 구조 내 첫 번째 셀에 있는 텍스트 (예: 'Routines that run automatically', 'Review without breaking focus')

### 본문 위치
- '| |' 제목 라인 바로 다음 줄부터 해당 아이템 테이블 내 설명 텍스트
- 본문은 테이블의 두 번째 셀에 위치하며, CTA 링크('Create a routine', 'Try it in your terminal') 전까지의 내용

### 링크 위치
- 본문 설명 끝에 'Learn more', 'Get the app', 'Try it', 'Download', 'See the updates' 등의 텍스트 뒤에 URL이 연결됨
- 링크는 텍스트 하이퍼링크 형태로 제공

---

## 추출 규칙

1. '| |'로 시작하는 라인을 아이템 제목으로 추출
2. 해당 테이블 구조 내 설명 텍스트를 본문으로 추출
3. CTA 텍스트('Learn more' 등) 뒤의 URL을 링크로 추출
4. 테이블 구조가 아닌 일반 텍스트 섹션(예: 'Introducing Claude Opus 4.7')도 아이템으로 처리

---

## 제외 영역

- 'Was this email useful?' 이후의 피드백 섹션
- 'Anthropic PBC' 이후의 회사 주소 및 법적 정보
- '͏ &shy;  ' 등의 숨겨진 문자 시퀀스

---

## 특이사항

각 아이템이 테이블(|) 형식으로 표시되어 있으며, 일부 아이템은 'research preview' 상태임. 주요 아이템(Opus 4.7 소개)은 테이블 형식이 아닌 일반 텍스트로 시작됨.
