# SKILL_strictlyvc

StrictlyVC <connie@strictlyvc.com> 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | StrictlyVC <connie@strictlyvc.com> |
| 발신자 | connie@strictlyvc.com |
| 유형 | multi-item |
| 언어 | en |
| 평균 아이템 수 | 15개 |
| 생성일 | 2026-02-11 |

---

## 구조 분석

### 뉴스레터 특징
- 다중 섹션으로 구성된 뉴스 요약
- 헤드라인 → 간략한 설명 → 출처 링크 구조

### 아이템 경계
- 섹션 제목(예: Top News, Massive Fundings)으로 아이템 그룹화
- 개별 아이템은 줄바꿈과 간격으로 구분

### 제목 위치
- 각 아이템 첫 문장에서 주제 명시

### 본문 위치
- 제목 직후 2~3문장 요약

### 링크 위치
- 본문 말미 '~ has more here' 형태의 텍스트 링크

---

## 추출 규칙

1. 섹션 제목 하위 내용 추출
2. 광고(Sponsored By...) 및 비뉴스 콘텐츠 제외
3. 링크가 없는 아이템 제외

---

## 제외 영역

- Sponsored By 섹션
- People/Post-Its/Detours/Brain Rot/Retail Therapy
- 푸터 법률 정보

---

## 특이사항

기사 원문 링크 포함 but 본문 내용 요약 제공
