# SKILL_no_reply

SportsPro Daily <no-reply@sportspromedia.com> 뉴스레터의 구조 분석 및 추출 규칙입니다.

---

## 메타데이터

| 항목 | 값 |
|------|-----|
| 이름 | SportsPro Daily <no-reply@sportspromedia.com> |
| 발신자 | no-reply@sportspromedia.com |
| 유형 | multi-item |
| 언어 | ko |
| 평균 아이템 수 | 5개 |
| 생성일 | 2026-02-03 |

---

## 구조 분석

### 뉴스레터 특징
- TODAY'S HEADLINES 섹션에 3개의 주요 뉴스 아이템 포함
- FEATURE OF THE DAY와 EVENT NEWS 등 다양한 섹션 제공
- 파트너 콘텐츠 및 방문 안내 포함

### 아이템 경계
- 각 아이템은 제목 라인 뒤에 빈 줄과 'READ FULL STORY' 링크로 구분됨
- 섹션 헤더와 구분선은 빈 줄과 대문자 표기로 구분

### 제목 위치
- 제목은 대문자 표기와 줄바꿈으로 구분된 h2 스타일 헤딩에 위치

### 본문 위치
- 본문은 제목 바로 아래 단락으로, 'READ FULL STORY' 전까지

### 링크 위치
- 원문 링크는 'READ FULL STORY' 뒤에 하이퍼링크 형태로 제공

---

## 추출 규칙

1. 제목은 20~50자, 주어+동사+핵심정보 형태로 추출
2. 요약은 핵심사실-배경-영향-시사점 구조로 300~500자 작성
3. 키워드는 명사형 3~5개 선정
4. 링크는 원문 URL, 없으면 빈 문자열

---

## 제외 영역

- 뉴스레터 상단 헤더 (SportsPro Daily - All the essential sports industry news...)
- 하단 푸터 (연락처, 관리 옵션)
- 파트너 콘텐츠 섹션 (Trunk named as Sale Shark’s official creative partner)

---

## 특이사항

특이사항 없음
