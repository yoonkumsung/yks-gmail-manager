# SKILL_nytimes_todaysheadlines_noreply

The New York Times <todaysheadlines-noreply@nytimes.com> 의 'Today's Headlines' 브리핑 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | The New York Times <todaysheadlines-noreply@nytimes.com> |
| 발신자 | todaysheadlines-noreply@nytimes.com |
| 유형 | multi-item |
| 언어 | en |
| 평균 아이템 수 | 25개 |
| 생성일 | 2026-06-01 |

---

## 구조 분석

### 뉴스레터 특징
- NYT 'Today's Headlines' 일간 브리핑. 'Top News' 등 섹션 아래에 헤드라인 + 1~2문장 요약을 다수 나열하는 다중 아이템 구조
- 각 아이템은 헤드라인(### 또는 굵은 제목)과 짧은 요약, 그리고 기사 링크로 구성
- 'More top news', 'Opinion', 'The Morning' 등 보조 섹션 포함
- 영문 뉴스레터 (모든 출력은 한국어로 번역 필요)

### 아이템 경계
- 헤딩(### 헤드라인) 단위로 구분. 헤드라인 다음 줄에 요약문, 그 뒤 'READ MORE'/원문 링크
- 섹션명(Top News, More top news 등)은 아이템이 아니라 그룹 헤더

### 제목/본문/링크 위치
- 제목: 각 헤드라인 텍스트
- 본문: 헤드라인 직후 요약 문장
- 링크: 각 헤드라인에 연결된 nytimes.com URL ([텍스트](URL) 형식)

---

## 추출 규칙

1. 각 헤드라인을 개별 아이템으로 추출 (섹션 헤더는 제외)
2. 헤드라인 → title, 직후 요약 문장 → summary
3. 각 아이템의 nl.nytimes.com / nytimes.com 링크를 link 필드에 추출 (없으면 빈 문자열)
4. ⚠️ 모든 title·summary·keywords를 반드시 자연스러운 한국어로 번역 (영문 잔존 금지, 인명·고유명사 원어 병기 가능)
5. title/summary 안에 큰따옴표(") 사용 금지 (작은따옴표/「」 사용 — JSON 안전)
6. 할루시네이션 금지: 본문에 없는 내용 생성 금지

---

## 제외 영역

- 'View in browser', 'Unsubscribe', 구독 안내, 광고
- 'This email was sent to...' 이후 푸터/저작권
- 섹션 헤더 자체(Top News 등)는 아이템이 아님

---

## 특이사항

- 영문 → 한국어 번역 필수. 헤드라인이 많을 수 있으므로(20~40개) 끝까지 빠짐없이 추출
- 일부 아이템은 헤드라인만 있고 요약이 짧을 수 있음(50자 미만 허용)
