# SKILL_scmp_jen_paolini

"Jen Paolini, SCMP" <jen.paolini@e.scmp.com> 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | "Jen Paolini, SCMP" <jen.paolini@e.scmp.com> |
| 발신자 | jen.paolini@e.scmp.com |
| 유형 | multi-item |
| 언어 | ko |
| 평균 아이템 수 | 10개 |
| 생성일 | 2026-06-24 |

---

## 구조 분석

### 뉴스레터 특징
- SCMP PostMag의 주간 큐레이션 뉴스레터
- 'Life. Culture. Discovery.' 태그라인 사용
- 각 아이템은 섹션명(예: Culture, Passions, Food & Drink)과 함께 제시
- 'Highlights' 및 'More from PostMag' 섹션으로 추가 콘텐츠 소개
- 에디터의 편지(Editor's Letter) 섹션 포함

### 아이템 경계
- 각 아이템은 '[IMAGE: ]' 태그 또는 섹션명(예: 'Culture', 'Passions', 'Food & Drink')으로 시작
- 아이템 간 구분은 빈 줄과 새로운 섹션명 등장으로 식별
- 'Highlights' 및 'More from PostMag' 헤더로 추가 섹션 구분

### 제목 위치
- '[IMAGE: ]' 태그 다음에 오는 첫 번째 링크 텍스트가 제목
- 링크 텍스트는 대괄호([])로 감싸여 있으며, URL과 함께 표시됨
- 예: '[Sophia the robot learns to sing as Hong Kong teaches androids the joys of music](URL)'

### 본문 위치
- 뉴스레터 본문에는 요약문이 포함되지 않음
- 각 아이템의 본문은 원문 기사 전문에서 추출
- 원문 기사는 '=== 원문 기사 전문 ===' 이후에 제공됨
- 각 기사는 '--- URL ---' 구분자로 시작하며, 기사 제목과 본문이 포함됨

### 링크 위치
- 각 아이템의 제목이 하이퍼링크로 제공됨
- URL은 제목 텍스트의 링크 대상에서 추출
- 예: 'https://www.scmp.com/postmag/culture/article/3357588/...'

---

## 추출 규칙

1. '=== 원문 기사 전문 ===' 이후의 각 기사 섹션을 개별 아이템으로 처리
2. 각 기사 섹션은 '--- URL ---' 구분자로 시작
3. 기사 제목은 '#' 마크다운 헤더 또는 첫 번째 큰 텍스트에서 추출
4. 기사 본문은 제목 이후부터 다음 '---' 구분자까지의 텍스트
5. 'Advertisement', 'Select Voice', 'Select Speed' 등 비본문 요소는 제외
6. 유료 구독 콘텐츠로 인해 본문이 잘린 경우 '(유료 구독 콘텐츠 - 공개 부분만 수집)' 표시 이후는 무시

---

## 제외 영역

- 'You’ve seen them dance...'로 시작하는 뉴스레터 헤더 영역
- 'Highlights' 섹션 (별도 아이템으로 처리 가능하나, 본문 없으면 스킵)
- 'More from PostMag' 섹션 (별도 아이템으로 처리 가능)
- 'READ POSTMAG' 및 'FOLLOW US ON' 영역
- 'Copyright ©' 이후의 푸터 영역
- 'Advertisement' 텍스트
- 'Select Voice', 'Select Speed' 오디오 플레이어 영역
- 'YouTube video player' 임베디드 영역

---

## 특이사항

- 뉴스레터 본문은 큐레이션 링크만 제공하고, 실제 기사 내용은 '원문 기사 전문' 섹션에 별도 제공됨
- 각 기사는 유료 구독 콘텐츠로, 공개된 부분만 수집됨
- Editor's Letter는 별도 아이템으로 추출 가능하나, 뉴스레터 소개 성격이 강함
- 일부 기사는 '7-MIN READ', '2-MIN READ' 등 읽기 시간 표시 포함
