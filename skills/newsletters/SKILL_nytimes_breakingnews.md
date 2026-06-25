# SKILL_nytimes_breakingnews

The New York Times <breakingnews@nytimes.com> 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | The New York Times <breakingnews@nytimes.com> |
| 발신자 | breakingnews@nytimes.com |
| 유형 | multi-item |
| 언어 | en |
| 평균 아이템 수 | 4개 |
| 생성일 | 2026-05-31 |

---

## 구조 분석

### 뉴스레터 특징
- Breaking news 이메일 형식
- 주요 기사 1개 + 'More Top Stories' 섹션에 3개 기사
- 각 기사는 '###'로 시작하는 제목과 링크로 구성
- 링크는 'Read more' 또는 '→' 기호로 표시

### 아이템 경계
- 주요 기사: '###'로 시작하는 라인 이후 'Read more' 링크까지
- More Top Stories: 'More Top Stories' 텍스트 이후 '###'로 시작하는 각 라인과 '→' 링크까지

### 제목 위치
- '###' 바로 뒤의 텍스트 (예: 'Platner’s Texts With Women Concerned Campaign as Senate Race Took Off')

### 본문 위치
- 주요 기사: 제목 위에 있는 'The wife of the Democratic candidate...' 문장 (본문 요약)
- More Top Stories: 제목만 있고 본문 없음 (링크만 제공)

### 링크 위치
- 주요 기사: 'Read more' 하이퍼링크 (URL)
- More Top Stories: '→' 기호 뒤의 하이퍼링크 (URL)

---

## 추출 규칙

1. '###'로 시작하는 라인을 제목으로 추출
2. 주요 기사는 제목 위의 문장을 본문으로 사용
3. More Top Stories는 제목만 추출하고 본문은 없음 (링크만 있음)
4. 모든 제목과 본문은 한국어로 번역

---

## 제외 영역

- 'Sign up for the On Politics newsletter' 섹션
- 'Subscribe to The Times' 및 앱 다운로드 링크
- 'Change Your Email', 'Privacy Policy', 'Contact Us', 'California Notices' 등 푸터
- 'The New York Times Company' 저작권 문구

---

## 특이사항

이 뉴스레터는 주요 기사에 간단한 요약 문장이 포함되어 있고, 나머지 기사는 제목과 링크만 제공. 'More Top Stories' 섹션의 기사는 본문이 없으므로 요약을 생성할 수 없음 (링크만 있는 경우 스킵 규칙에 따라 해당 아이템은 제외해야 하나, 지시사항에 따라 추출하되 요약은 제목 기반으로 간략히 작성)
