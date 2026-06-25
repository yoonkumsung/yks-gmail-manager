# SKILL_nytimes_yourplaces_globalupdate_noreply

The New York Times <yourplaces-globalupdate-noreply@nytimes.com> 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | The New York Times <yourplaces-globalupdate-noreply@nytimes.com> |
| 발신자 | yourplaces-globalupdate-noreply@nytimes.com |
| 유형 | multi-item |
| 언어 | en |
| 평균 아이템 수 | 5개 |
| 생성일 | 2026-06-24 |

---

## 구조 분석

### 뉴스레터 특징
- 각 아이템은 제목, 요약, 장소 태그, 'Follow this place' 링크로 구성됨
- 아이템 제목과 요약이 하나의 텍스트 블록으로 결합되어 있음
- 'Places mentioned:' 태그로 관련 지역 명시
- 뉴스레터 상단에 'Select places' CTA, 하단에 'Manage places' CTA 존재

### 아이템 경계
- 빈 줄 + 하이퍼링크 시작 패턴으로 아이템 구분
- 각 아이템은 URL 링크로 시작하며, 링크 텍스트 내에 제목과 요약이 연속적으로 포함됨

### 제목 위치
- 하이퍼링크 텍스트의 첫 번째 문장 (요약 설명 전까지)
- 예: 'Ebola Symptoms in Current Outbreak May Be Milder Than in Previous Ones'

### 본문 위치
- 하이퍼링크 텍스트 내에서 제목 바로 다음에 이어지는 설명 문장
- 'Places mentioned:' 태그 직전까지의 텍스트

### 링크 위치
- 각 아이템 블록의 최상위 하이퍼링크 URL
- 'Follow this place' 텍스트 뒤의 별도 URL

---

## 추출 규칙

> ⚠️ **번역 필수 (해외 영문 소스)**: 모든 title·summary·keywords를 자연스러운 한국어로 의역한다. 직역·영문 잔존·임의 음역 금지. 인명·회사명·제품명 등 고유명사는 한국어(원어) 병기.

1. 'News on places you can follow' 헤더 이후의 각 하이퍼링크 블록을 아이템으로 식별
2. 하이퍼링크 텍스트에서 첫 문장을 제목으로, 후속 문장을 요약으로 분리
3. 'Places mentioned:' 다음 텍스트를 키워드 참고용으로 활용
4. 'Follow this place' 링크가 아닌 기사 본문 링크를 item.link로 사용

---

## 제외 영역

- 'This is a preview of our Your Places: Global Update email' 설명문
- '[Select places]' 버튼과 '[Manage places]' 버튼
- 'Is this the kind of coverage you expected to see?' 피드백 섹션
- 'Subscribe to The Times', 'Get The New York Times app' 등 구독 CTA
- 'Change Your Email', 'Privacy Policy', 'Contact Us', 'California Notices' 등 푸터 링크
- 'The New York Times Company. 620 Eighth Avenue...' 주소
- '=== 원문 기사 전문 ===' 이후의 모든 콘텐츠

---

## 특이사항

이 뉴스레터는 사용자가 선택한 지역(places)에 기반한 맞춤형 글로벌 업데이트 프리뷰입니다. 각 아이템은 'Places mentioned:' 태그로 관련 지역을 명시하며, 'Follow this place' 링크를 통해 해당 지역 팔로우를 유도합니다. 아이템 제목과 요약이 하나의 하이퍼링크 텍스트 안에 결합되어 있어 파싱 시 분리가 필요합니다.
