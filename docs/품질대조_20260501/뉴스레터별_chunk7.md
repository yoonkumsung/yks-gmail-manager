# 뉴스레터별 품질대조 — chunk7 (워크리스트 index 70~79)

> 대상: `output/audit_missing_20260601/worklist_88.json` index 70~79 (총 10건)
> 방식: 각 뉴스레터 `items` ↔ `clean_text` 1:1 대조. ①누락 ②할루시네이션 ③번역품질 ④정크 ⑤중복 ⑥출처정확성(멀티주소 발신처) ⑦요약완결성. orphan은 SKILL 필요성 평가.
> 작성: 2026-06-14

---

## 요약표

| # | 발신자 | 뉴스레터 | 라벨 | orphan | items | 누락 | 할루 | 번역 | 정크 | 중복 | 출처오류 | 비고 |
|---|--------|----------|------|--------|-------|------|------|------|------|------|----------|------|
| 70 | kdieiec@kdi.re.kr | KDI | 경제 | O | 5 | 0 | 0 | - | 0 | 0 | 0 | **목록형/잡지형** 정상 처리 |
| 71 | inspire@donga.com | 영감한스푼 | 라이프 | X | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 단일 인터뷰형, 양호 |
| 72 | svweekly@substack.com | Ian Park 주간 실리콘밸리 | IT | X | 1 | △ | △ | 0 | 0 | 0 | 0 | 단일 에세이(허구 시나리오), 수치 1건 부정확 |
| 73 | culturalpolicy@seoul.go.kr | 서울시청(서울문화소식) | 라이프 | O | 22 | 0 | 0 | - | 0 | 0 | 0 | **목록형** 정상, source=주최기관별 |
| 74 | newsletter@mail.awareinvest.com | AWARE 뉴스레터 | 투자 | O | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 단일 분석글, 양호 |
| 75 | vincent.chow@e.scmp.com | SCMP China Future Tech | 중국_시사 | O | 7 | △ | 0 | **2** | 0 | 0 | △ | "방콕 카"·"핸테크" 오역, ByteDance 누락 |
| 76 | holly.chik@e.scmp.com | SCMP Dark Matters | 중국_시사 | O | 8 | 0 | △ | **3** | 0 | 0 | 0 | "청화대"·"바린"·"비아이디어 매체" 오역 |
| 77 | mailer@nurimedia.co.kr | DBpia | 기타 | O | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 계정삭제 행정공지, 뉴스성 아님 |
| 78 | superhuman@mail.joinsuperhuman.ai | Superhuman | IT | X | 9 | △ | 0 | 0 | 0 | 0 | 0 | 소셜밈 5개 미추출(정크 판단 타당) |
| 79 | jw@pspd.org | 참여연대 참돌이(끄의세계) | 시사 | O | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 검찰개혁 뉴스레터, 양호 |

(△ = 경미/판단필요, **굵게** = 명확한 결함)

---

## 70. KDI — `kdieiec@kdi.re.kr` (경제, orphan, 목록형)

- 제목: [KDI EIEC 특집] 날개 단 K방산, 세계를 겨누다 (『나라경제』 5월호 소개 메일)
- **목록형/잡지형 특수처리**: 본문은 링크-텍스트 위주의 잡지 목차 구조. items 5건이 본문의 5개 코너(① K방산 초호황-최기일, ② 스핀온 전략-장원준, ③ 김영훈 고용노동부 장관 인터뷰, ④ 퇴직연금 기금화-이재훈, ⑤ 스포츠 이코노미 AI-김명락)에 1:1 정확 대응.
- 누락: 없음. 5개 주요 코너 모두 추출.
- 할루시네이션: 없음. 인물명/소속/발언 모두 본문 인용문과 정확 일치.
- 정크/중복: 없음.
- 출처: 전 항목 `source="KDI EIEC"` 일관.
- **SKILL 필요성**: orphan이나 본문이 단순 잡지 목차(코너=인용문 블록) 구조라 현 추출이 안정적. KDI 전용 SKILL이 있으면 코너 단위 추출을 명문화 가능하나, 현 결과 품질은 양호하여 우선순위 낮음. (참고: 별도 `경제_KDI_전건.md` 존재)

## 71. 영감한스푼 — `inspire@donga.com` (라이프)

- 단일 인터뷰 뉴스레터(이소영 샌프란시스코 아시아미술관장). item 1건 정확.
- 누락/할루/정크/중복/출처오류: 없음. 메트 한국실, '황금의 나라 신라'(2013), 베이에리어 아시아계 40%, RM×SFMOMA·하종현 회고전 등 핵심사실 본문과 일치.
- 말미 구글폼 크롤링 잔재("=== 원문 기사 전문 ===" 이하 구독의견 폼)는 정크지만 items에는 반영 안 됨(정상 필터링).

## 72. Ian Park 주간 실리콘밸리 — `svweekly@substack.com` (IT)

- 단일 장문 에세이(저자가 명시한 "100% 소설" 가상 시나리오: 2026~2027 사모펀드발 AI 버블 붕괴). item 1건.
- **요약 주의**: 본문이 허구 시나리오임을 summary가 "가상의 시나리오"로 명시 → 양호.
- **수치 부정확(△)**: "토마브라보가 메달리아 인수에서 약 50억 달러를 손실" — 원문은 "$5.1bn 에퀴티 와이프아웃"(≈51억 달러). 반올림 차이로 경미. 그 외 "Anthropic 1조달러→3000억달러(-70%)"=원문 $1T→$300B 정확, "엔비디아 1.5조달러 증발"=원문 $1.5T 정확.
- **누락(△)**: 마이클 버리 $5T 패시브 손실, FS KKR 사모대출 펀드 등 2차 요소는 단일 요약으로 통합되며 생략. 단일 에세이라 통합 자체는 타당.
- 할루/정크/중복/출처오류: 없음.

## 73. 서울시청(서울문화소식 5월호) — `culturalpolicy@seoul.go.kr` (라이프, orphan, 목록형)

- **목록형 특수처리**: 서울시 5월 문화행사 일람. items 22건이 본문 공연/전시/교육 항목과 1:1 대응(드럼페스티벌·라트라비아타·마당페스타·강강술래·까망돌·슈텐츠/글루즈만·안동별궁·키크니·탑승록·뉴미디어·중간의끝·야외도서관·정원박람회·어린이마을·쉬운미술관·장영혜중공업·미술사산책·SEMU LETTER 2건 등 전수 grep 확인).
- 누락: 본문 주요 항목 전수 포함. 누락 없음.
- **출처(중요·정상)**: 동일 뉴스레터지만 source가 "서울시청/세종문화회관/서울시립교향악단/서울남산국악당/동작문화재단/서울시립미술관/서울공예박물관/서울디자인재단/서울기록원/중랑문화재단/동대문문화재단/서울도서관/남산골한옥마을/서울역사박물관" 등으로 분산. → **이는 발신처 철자불일치 오류가 아니라, 행사별 주최기관을 정확히 source로 기재한 것**(목록형의 올바른 동작). 멀티주소 발신처 혼동 아님.
- 할루/정크/중복: 없음. 일시·장소·요금 수치 정확.
- **SKILL 필요성**: orphan. 목록형 22건 안정 추출 중이나, 서울시청 계열(culturalpolicy/inews11/magazine/sema 등 멀티주소·동일 "서울시청" 표기)은 SKILL로 source 표기 규칙(주최기관명 우선)을 명문화하면 일관성↑. 권장.

## 74. AWARE 뉴스레터 — `newsletter@mail.awareinvest.com` (투자, orphan)

- 단일 심층분석(스페이스X 1.75조달러 IPO, AI기업 재정의 비판). item 1건.
- 누락/할루/번역/정크/중복/출처오류: 없음.
- 수치 정확: 시총 1.75조달러, 2025 매출 150억~160억달러, EV/EBITDA 218배, 테라팹 550억~1190억달러, 신주 개인배정 30% 등 본문 일치.
- **SKILL 필요성**: orphan이나 단일 에세이형이라 현 1건 추출로 충분. 우선순위 낮음.

## 75. SCMP — Vincent Chow `vincent.chow@e.scmp.com` (중국_시사, orphan)

- 뉴스레터명 "China Future Tech"(Vincent Chow). 메인기사(Meta-Manus 차단) + "best of SCMP Tech" 링크기사들. items 7건.
- 매핑: 메인(Manus) + MiroMind + Moonshot + FCC + 로봇붐 + AI해고판결 + 만카드클러스터 = 7건. 모두 크롤링된 원문 기반.
- **누락(△)**: "best of" 목록의 **ByteDance AI 챗봇 수익화**(tc=8) 항목 미추출. 해당 링크는 본문에 헤드라인만 있고 원문 크롤링이 안 돼(tc=8·tc=2 미크롤) 누락. 경미하나 헤드라인 누락.
- **번역품질(2건, 명확)**:
  - **"방콕 카"** — 원문 "Brendan Carr"(FCC 위원장)를 "방콕 카"로 오역. Bangkok으로 오인. → 수정필요.
  - **"핸테크 회사"** — 원문 "fintech firm"을 "핸테크"로 오기(핀테크여야 함).
  - 그 외 "적재 목록"(원문 Covered List/안보목록), "무어 스래드"(Moore Threads→무어 스레드) 경미.
- **출처(△)**: 전 항목 `source="SCMP Inside China Tech"`. 실제 뉴스레터 브랜드는 "China Future Tech"이며 자매 newsletter "Inside China Tech"와 혼용 표기. 동일 발신자 내 일관은 함. SCMP 다발신처(vincent/holly/victoria/wendy/craig/jen 등) 중 라벨링 통일 필요.
- 할루/정크/중복: 없음.
- **SKILL 필요성**: orphan. SCMP 기자별 멀티주소(@e.scmp.com) 다수 → 공통 SCMP SKILL로 (a)메인+best-of 구조, (b)source 표기 규칙, (c)인명 음역 가이드 명문화 강력 권장.

## 76. SCMP — Holly Chik `holly.chik@e.scmp.com` (중국_시사, orphan)

- 뉴스레터명 "Dark Matters". 메인(장보 인터뷰) + best-of 7건 = items 8건. 전건 매핑(미크롤 항목 없음, 7개 원문 모두 크롤됨).
- 누락: 없음.
- **번역품질(3건, 명확)**:
  - **"청화대"** — Tsinghua(칭화대)를 "청화대"로 오기(반복).
  - **"바린 기아현상"** — 아미노산 "valine"을 "바린"으로 오역(발린이 표준).
  - **"비아이디어 매체"** — 영국 매체 "City AM"을 "비아이디어 매체"로 오역/창작(원문엔 City AM).
  - 경미: "동제대학"(Tongji, 통지대 일반적), "인금"(임금 오타).
- **할루시네이션(△)**: "비올렐 구투" — 원문 "Viorel Gutu"인데 item이 "Violel Gutu(비올렐)"로 철자 변형. 인명 garble.
- **수치(△)**: "1882경 회(88자리 수)" — 1882 quintillion을 "88자리 수"로 잘못 부연(엑사플롭=10^18, 자릿수 설명 오류). 본 수치 1882 엑사플롭은 정확.
- 정크/중복: 없음.
- 출처: 전 항목 `source="South China Morning Post - Dark Matters"` 일관(75번과 표기 방식 다름 → SCMP 계열 통일 필요).

## 77. DBpia — `mailer@nurimedia.co.kr` (기타, orphan)

- **뉴스성 아님**: 누리미디어 장기 미이용 계정 삭제·약관변경 행정공지. item 1건 정확(약관 제21조 개정, 2023.1.16 이전 가입+1년 미접속, 6/10 삭제, 6/10 전 로그인 시 제외).
- 누락/할루/번역/정크/중복/출처오류: 없음.
- **SKILL 필요성**: orphan이나 정기 뉴스레터가 아닌 일회성 공지 → SKILL 불필요.

## 78. Superhuman — `superhuman@mail.joinsuperhuman.ai` (IT)

- 영문 AI 뉴스레터. items 9건: TODAY IN AI 3건(Interact AI, SpaceX×Anthropic, Claude Dreams) + FROM THE FRONTIER 에세이(AI fog) + 5 New AI Tools(Replit/Plurai/Kanwas/Shadow/Bitgrain).
- 누락 판단(△): "IN THE KNOW / Meme of the day" 소셜밈 5건(Interrupting Movies, Romantic Vibecoding, Job Applications, AI Deepfakes, Data Center)과 Prompt Station은 미추출. → **밈/프롬프트성 잡문이라 정크 판단 타당**. 광고(Slack/IBM)도 정상 제외.
- 할루: 없음. SpaceX-Anthropic 22만 NVIDIA GPU·Colossus 1, Interact AI 280만뷰 등 정확.
- 번역(경미): 한 summary에서 "에이 안개" vs 타이틀 "AI 안개" 표기 불일치.
- **링크 경미오류**: Shadow 항목 link가 `h001.vAVAxlwz…`인데 본문은 `h001.vOVAxlwz…`(O→A 1자 변형). 추적 링크라 영향 미미.
- 중복/출처오류: 없음.

## 79. 참여연대 참돌이(끄의세계) — `jw@pspd.org` (시사, orphan)

- 뉴스레터명 "끄의세계 (참여연대 검찰개혁 뉴스레터)". 제목 "노동자보다 사장 편에 선 검찰". items 5건.
- 매핑: ① 유성기업 노조파괴 12년(창조컨설팅 14억·용역폭력·현대차 지원·2017 1심 실형) ② 정치검찰 국정조사(박상용·정일권·강백신 검사) ③ 검찰 비공개 내규 정보공개 1심 승소 ④ 화물연대 충돌사망+아리셀 2심 감형(15년→4년) ⑤ 사법감시 강좌(6/15~). 전건 본문 대응(grep 확인).
- 누락/정크/중복: 없음.
- **출처(정상)**: source="끄의세계(참여연대 검찰개혁 뉴스레터)" — 본문 내 실제 브랜드명 인용으로 할루 아님. 단, PSPD 멀티주소(jw@pspd.org=참돌이/검찰개혁, webmaster@pspd.org=미지) 존재 → 라벨 동일(시사)이나 발신페르소나·뉴스레터 상이.
- 할루시네이션: 명확한 건 없음. 사건번호(2025구합56543)·금액·날짜는 크롤링 원문 기반으로 추정 타당(전체 원문 미정독, 잔여 리스크 낮음).
- **SKILL 필요성**: orphan. 검찰개혁 정기 뉴스레터(사건 브리핑 다건형) → 항목 구분 규칙 명문화 위해 SKILL 권장.

---

## 멀티주소 발신처 점검 결과

- **서울시청 계열**(culturalpolicy/inews11/magazine/sema @seoul.go.kr): 본 청크의 73번(culturalpolicy)은 목록형으로 source를 **행사 주최기관별로 정확히 분산** 기재 → 철자/출처 오류 아님. 단 발신자명이 모두 "서울시청"으로 표기되는 점은 SKILL 통일 대상.
- **SCMP 계열**(@e.scmp.com 다수 기자): 75번 source="SCMP Inside China Tech", 76번 source="South China Morning Post - Dark Matters" → **동일 매체인데 표기 형식 불일치**. 출처명 자체 오류는 아니나 SCMP 공통 SKILL로 표기 규칙 통일 필요.
- **PSPD 계열**(jw/webmaster @pspd.org): 79번 "끄의세계", 별건 "미지" — 페르소나·뉴스레터가 실제로 다름. 정상.
- KDI(70)는 단일주소, 본 청크 내 동일발신처 철자불일치 사례 없음.
