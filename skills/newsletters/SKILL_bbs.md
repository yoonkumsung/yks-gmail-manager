# SKILL_bbs

Behind the Balance Sheet <behindthebalancesheet@substack.com> 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | Behind the Balance Sheet <behindthebalancesheet@substack.com> |
| 발신자 | behindthebalancesheet@substack.com |
| 유형 | single-topic |
| 언어 | en |
| 평균 아이템 수 | 1개 |
| 생성일 | 2026-05-23 |

---

## 구조 분석

### 뉴스레터 특징
- 본문 길이: 약 14786자
- 유형: 다수 아이템 포함

### 섹션 마커
- READ IN APP

### 아이템 경계
- 빈 줄, 구분선(---), 번호, 이모지 등으로 기사 구분

---

## 추출 규칙

1. 모든 뉴스 아이템을 빠짐없이 추출
2. 제목 20~50자, 핵심 주제 + 구체적 수치
3. 요약: 본문 내용만으로 완결. 핵심사실+수치+배경+시사점
4. 키워드 3~5개, 명사형
5. 원문 URL 추출 (없으면 빈 문자열)

---

## 제외 영역

- 뉴스레터 헤더/푸터
- 광고/스폰서 콘텐츠
- 구독/수신거부 안내

---

## 특이사항

- 본문에 없는 내용 생성 절대 금지
- 영문 투자 분석 에세이. 전체를 1개 아이템으로 추출. 한국어 자연스러운 번역 필수.
