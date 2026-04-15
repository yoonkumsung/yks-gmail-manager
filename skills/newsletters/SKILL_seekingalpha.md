# SKILL_seekingalpha

Must Reads <account@seekingalpha.com> 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | Must Reads <account@seekingalpha.com> |
| 발신자 | account@seekingalpha.com |
| 유형 | multi-item |
| 언어 | en |
| 평균 아이템 수 | 4개 |
| 생성일 | 2026-04-15 |

---

## 구조 분석

### 뉴스레터 특징
- Seeking Alpha의 속보(Breaking News) 형식 뉴스레터
- 주요 뉴스 항목은 제목과 인용문(>)으로 구성
- 관련 종목 티커(RIVN)와 시간, 편집자 정보 포함
- 주요 뉴스 하단에 'You may also like:' 섹션으로 추가 뉴스 헤드라인 나열
- 뉴스레터 구독 및 앱 다운로드 홍보 콘텐츠 포함

### 아이템 경계
- 주요 뉴스: '**'로 강조된 제목 라인으로 시작하여 편집자 정보 라인('01:06 PM **|...') 직전까지
- 추가 뉴스: 'You may also like:' 텍스트 이후에 나오는 일반 텍스트 라인(예: 'Stocks to watch after market on Monday: DELL, HPQ, CRDO, GNK')

### 제목 위치
- 주요 뉴스 제목: '**'로 감싸진 텍스트 라인 (예: '**Rivian and Redwood Materials to repurpose battery packs for energy storage**')
- 추가 뉴스 제목: 'You may also like:' 이후의 일반 텍스트 라인 전체

### 본문 위치
- 주요 뉴스 본문: 제목 바로 다음 줄의 '>'로 시작하는 인용문 (예: '> Rivian and Redwood Materials reuse EV battery packs...')
- 추가 뉴스 본문: 본문 텍스트 없이 제목만 존재

### 링크 위치
- 명시적인 'Read now >>' 텍스트 뒤에 링크가 있을 것으로 추정되나, 제공된 clean_text에는 URL이 포함되어 있지 않음
- 'Claim Offer »' 텍스트 뒤에 프리미엄 구독 링크가 있을 것으로 추정

---

## 추출 규칙

1. '**'로 감싸진 제목과 바로 다음 '>' 인용문을 하나의 아이템으로 추출
2. 'You may also like:' 이후의 일반 텍스트 라인을 각각 별도 아이템으로 추출(본문이 없으므로 요약 생성 시 주의)
3. 편집자 정보('01:06 PM **|...'), 홍보 콘텐츠('Discover how...', 'Manage Alerts' 등)는 제외

---

## 제외 영역

- 'Unlimited access to news. Read now >>You may also like:' 라인
- 'Featured:** Join Seeking Alpha Premium**...'부터 시작하는 홍보 섹션
- 'Manage Alerts | Trending News | Free Newsletters' 이후의 모든 푸터 콘텐츠
- 'Sent by Seeking Alpha...' 주소 정보

---

## 특이사항

제공된 clean_text에 실제 하이퍼링크 URL이 포함되어 있지 않아 링크 필드를 채울 수 없음. 주요 뉴스는 본문(인용문)이 있지만, 추가 뉴스는 헤드라인만 존재함.
