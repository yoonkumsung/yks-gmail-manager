# SKILL_scmp_wendy_wu

"Wendy Wu, SCMP" <wendy.wu@e.scmp.com> 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | "Wendy Wu, SCMP" <wendy.wu@e.scmp.com> |
| 발신자 | wendy.wu@e.scmp.com |
| 유형 | multi-item |
| 언어 | en |
| 평균 아이템 수 | 4개 |
| 생성일 | 2026-04-12 |

---

## 구조 분석

### 뉴스레터 특징
- 섹션별로 주요 뉴스 아이템을 나열하는 구조
- 각 섹션은 '**The Big Picture**', '**Strait forward**', '**Lessons learned**', '**Wins and Falls**', '**Big Numbers**', '**Direct Quote**' 등의 대문자 섹션명으로 구분
- 각 섹션 내에서 아이템은 '**Why it matters:**', '**Meanwhile,**', '**So,**', '**And,**' 등의 구분자로 시작하는 문단으로 구성
- 섹션명은 강조 텍스트(예: **The Big Picture**)로 표시

### 아이템 경계
- 대문자 섹션명(예: **The Big Picture**)으로 새로운 섹션 시작
- 섹션 내에서 아이템은 '**Why it matters:**', '**Meanwhile,**', '**So,**', '**And,**' 등의 구분자로 시작하는 새로운 문단으로 구분
- 섹션 간에는 빈 줄 또는 명확한 텍스트 구분자 존재

### 제목 위치
- 각 섹션의 이름이 아이템의 주제를 나타냄 (예: 'The Big Picture' 섹션은 미국-이란 전쟁 관련 아이템)
- 섹션 내 개별 아이템의 제목은 구분자 뒤의 텍스트에서 추출 (예: '**Why it matters:**' 뒤의 텍스트)

### 본문 위치
- 각 아이템의 본문은 구분자(예: '**Why it matters:**') 뒤에 바로 시작하는 텍스트
- 본문은 다음 구분자(예: '**Meanwhile,**') 또는 섹션 종료(빈 줄/다음 섹션명)까지의 텍스트
- 본문은 일반적으로 1-3문장으로 구성

### 링크 위치
- 뉴스레터 본문 내에 명시적인 URL 링크가 없음
- 'For a deep dive into... read our three-part series' 등의 텍스트는 내부 콘텐츠 참조를 나타내지만 외부 URL은 제공되지 않음
- 아이템 추출 시 링크 필드는 빈 문자열로 처리

---

## 추출 규칙

1. **The Big Picture**, **Strait forward**, **Lessons learned** 섹션을 주요 아이템 소스로 사용
2. 각 섹션 내 '**Why it matters:**', '**Meanwhile,**', '**So,**', '**And,**' 구분자로 시작하는 문단을 개별 아이템으로 처리
3. **Wins and Falls**, **Big Numbers**, **Direct Quote** 섹션은 보조 정보로 간주하고 별도 아이템으로 추출하지 않음
4. 제목은 구분자 뒤의 핵심 내용을 20-50자 한국어로 재구성
5. 요약은 구분자 뒤의 전체 본문 텍스트를 300-500자 한국어로 요약
6. 링크가 없으므로 link 필드는 빈 문자열

---

## 제외 영역

- 초반 'Dear reader,' 소개 부분
- 'Oil spillovers' 헤더 및 편집자 정보
- 'SCMP NEWSLETTERS THAT MAY INTEREST YOU' 이후의 추천 뉴스레터 및 앱 다운로드 섹션
- 하단의 '[IMAGE: ]' 링크 및 지역 카테고리
- 'This email was sent to...' 이후의 발신자 정보 및 저작권 표시

---

## 특이사항

이 뉴스레터는 미국-이란 전쟁, 대만-중국 관계, 중국의 군사 학습 등 여러 주제를 섹션별로 나열하는 multi-item 구조입니다. 각 섹션 내에서 아이템은 'Why it matters:', 'Meanwhile:', 'So:', 'And:' 등의 구분자로 시작하며, 명시적인 외부 URL 링크가 제공되지 않습니다.
