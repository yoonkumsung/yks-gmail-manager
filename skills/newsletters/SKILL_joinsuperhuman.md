# SKILL_joinsuperhuman

"Superhuman – Zain Kahn" <superhuman@mail.joinsuperhuman.ai> 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | "Superhuman – Zain Kahn" <superhuman@mail.joinsuperhuman.ai> |
| 발신자 | superhuman@mail.joinsuperhuman.ai |
| 유형 | multi-item |
| 언어 | ko |
| 평균 아이템 수 | 5개 |
| 생성일 | 2026-02-03 |

---

## 구조 분석

### 뉴스레터 특징
- 여러 섹션으로 구분된 뉴스 아이템
- 번호 목록과 제목 기반 구분
- 각 섹션에 별도 링크 제공
- 광고 및 피드백 링크 포함
- 미드저니 프롬프트와 소셜 미디어 아이콘 포함

### 아이템 경계
- 섹션별 제목(예: TODAY IN AI, FROM THE FRONTIER)으로 구분
- 번호 목록(1., 2., 3.)으로 아이템 경계 표시

### 제목 위치
- 섹션 제목(h2/h3 수준)으로 위치
- 각 아이템 제목이 별도 라인에 명시

### 본문 위치
- 제목 바로 아래 단락(p 태그)으로 본문 배치
- 각 아이템 요약이 3~5문장으로 구성

### 링크 위치
- 각 아이템 하단에 Learn more 또는 Browse available plug-ins here 링크 포함
- 원문 링크는 별도 URL로 제공

---

## 추출 규칙

1. 섹션 제목을 기준으로 아이템 구분
2. 번호 목록과 본문 단락을 매칭하여 요약 추출
3. 링크 텍스트와 URL 분리
4. 광고 및 피드백 영역은 제외

---

## 제외 영역

- 헤더 및 푸터 영역
- 피드백 링크 및 소셜 미디어 아이콘
- 미드저니 프롬프트와 이미지 설명

---

## 특이사항

특이사항 없음
