# SKILL_substack_klementoninvesting

Klement on Investing <klementoninvesting@substack.com> 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | Klement on Investing <klementoninvesting@substack.com> |
| 발신자 | klementoninvesting@substack.com |
| 유형 | single-topic |
| 언어 | en |
| 평균 아이템 수 | 1개 |
| 생성일 | 2026-04-14 |

---

## 구조 분석

### 뉴스레터 특징
- 단일 주제(석유와 가스의 실제 비용)에 대한 심층 분석
- 연구 데이터와 차트를 인용한 논증 구조
- Substack 플랫폼의 일반적인 서식(READ IN APP, Pledge your support, Like/Comment/Restack 버튼) 포함

### 아이템 경계
- 전체 메일이 하나의 아이템으로 구성됨. 구분 패턴 없음.

### 제목 위치
- '# The true cost of oil and gas' 라인. 해시태그(#)로 시작하는 제목 헤더.

### 본문 위치
- 제목 헤더 아래 'Joachim Klement', 'Apr 13', 'READ IN APP' 이후부터 'Klement on Investing is free today.' 직전까지의 본문 텍스트.

### 링크 위치
- 본문 내 인라인 하이퍼링크: '[A group of economists...](https://substack.com/redirect/...)' 형식
- 하단 CTA 링크: '[Pledge your support](https://substack.com/redirect/...)'

---

## 추출 규칙

1. 전체 텍스트를 하나의 아이템으로 처리.
2. 제목은 '# The true cost of oil and gas'에서 추출.
3. 본문은 'READ IN APP' 이후부터 구독 권유 문구 직전까지의 연속된 텍스트 블록.
4. 연구 데이터(7250억 달러, 6.7조 달러), 차트 설명, 국가별 비교(미국, 영국) 등 핵심 수치와 논점을 요약에 포함.

---

## 제외 영역

- 메일 상단의 광범위한 공백 문자(͏, ­) 블록
- 'Forwarded this email? Subscribe here for more' 라인
- 'Klement on Investing is free today...' 이후의 구독 권유, 플리지, 소셜 버튼(Like/Comment/Restack), 저작권 정보 섹션

---

## 특이사항

원문에 명시된 연구(Black et al. (2026))와 세계은행/IMF 경제학자들의 데이터를 인용하여 화석 연료 보조금의 명시적/암묵적 비용을 분석함. 소득 계층별 영향에 대한 분배적 효과 논의 포함.
