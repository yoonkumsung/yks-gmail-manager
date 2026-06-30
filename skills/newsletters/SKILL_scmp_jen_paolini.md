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
- 뉴스레터 본문은 큐레이션(제목+짧은 소개) 위주이며 기사 전문은 제공되지 않음
- 각 아이템의 요약은 메일 본문에 실제로 존재하는 텍스트(섹션 소개·티저 문장)만으로 작성
- 본문에 충분한 설명이 있으면 그만큼 충실히 요약(major), 제목·한두 문장 티저만 있으면 한 줄 요약 + 링크 위임(brief)
- 메일 본문에 없는 사실·수치·인물은 절대 생성하지 않음(원문 링크는 반드시 보존)

### 링크 위치
- 각 아이템의 제목이 하이퍼링크로 제공됨
- URL은 제목 텍스트의 링크 대상에서 추출
- 예: 'https://www.scmp.com/postmag/culture/article/3357588/...'

---

> ⚠️ **번역 필수 (해외 영문 소스)**: 모든 title·summary·keywords를 자연스러운 한국어로 의역한다. 직역·영문 잔존·임의 음역 금지. 인명·회사명·제품명 등 고유명사는 한국어(원어) 병기.

1. '[IMAGE: ]' 태그 또는 섹션명(Culture, Passions, Food & Drink 등) 다음 첫 링크 텍스트를 제목으로 식별
2. 제목 링크의 URL을 아이템 링크로 추출(필수)
3. 제목 주변/하단의 메일 본문 텍스트(섹션 소개·티저)를 요약으로 작성 — 본문에 있는 만큼만, 충실하면 major·티저면 brief
4. 본문에 실제 설명이 없고 제목·링크뿐이면 제목을 자연스러운 한국어 한 줄로 요약하고 링크로 위임(brief tier)
5. 'Advertisement', 'Select Voice', 'Select Speed' 등 비본문 요소는 제외

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

- 뉴스레터 본문은 큐레이션(제목+짧은 소개) 위주 → 대부분의 아이템은 brief tier(한 줄 요약 + 링크 위임)가 자연스러움
- 깊은 분석이 필요하면 생성된 MD의 링크를 따라 독자가 원문에서 확인(시스템은 본문에 있는 정보만 무손실 전달)
- Editor's Letter는 별도 아이템으로 추출 가능하나, 뉴스레터 소개 성격이 강함
- 일부 기사는 '7-MIN READ', '2-MIN READ' 등 읽기 시간 표시 포함
