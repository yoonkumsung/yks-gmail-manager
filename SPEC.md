# Gmail 뉴스레터 다이제스트 시스템 - 기술 명세서

최종 수정: 2026-02-03

---

## 목차

1. [시스템 개요](#1-시스템-개요)
2. [아키텍처](#2-아키텍처)
3. [현재 문제점 및 개선 과제](#3-현재-문제점-및-개선-과제)
4. [데이터 스키마](#4-데이터-스키마)
5. [핵심 기능](#5-핵심-기능)
6. [자동 설정 시스템 (개발 예정)](#6-자동-설정-시스템-개발-예정)
7. [구현 가이드](#7-구현-가이드)
8. [API 레퍼런스](#8-api-레퍼런스)
9. [부록](#9-부록)

---

## 1. 시스템 개요

### 1.1 목적

Gmail 뉴스레터 소비를 수동적 읽기에서 능동적 인텔리전스 수집으로 전환합니다.

**핵심 가치**:
- 라벨별 자동 정리 및 요약
- LLM 기반 인사이트 추출
- 중복 제거 및 병합
- 일일 다이제스트 자동 생성

### 1.2 대상 사용자

- 다수의 뉴스레터를 구독하는 전문가
- 도메인 전문성을 넘어 지적 지평 확장 희망
- 분야 간 비자명한 연결 발견
- 수동 정리에 시간 쓰고 싶지 않음

### 1.3 주요 기능

**현재 기능**:
1. Gmail 라벨별 메일 수집
2. HTML → Text 변환
3. LLM Agent 기반 아이템 추출
4. Markdown/HTML 다이제스트 생성

**구현 완료**:
1. 자동 설정 시스템 (웹 기반 마법사)
2. 이중 인사이트 (도메인 관련 + 교차 도메인)
3. 개인화된 인사이트 생성

**구현 완료**:
4. 적응형 학습 (새 뉴스레터 자동 감지)
5. Node.js Gmail 수집 (크로스 플랫폼)
6. SKILL 자동 매칭 (발신자 기반)

---

## 2. 아키텍처

### 2.1 디렉토리 구조

```
gmail-manager/
├── SPEC.md                              # 본 문서
├── README.md                            # 사용자 문서
├── package.json
│
├── scripts/
│   ├── orchestrator.js                  # 메인 파이프라인
│   ├── agent_runner.js                  # LLM API 호출
│   ├── fetch_all_messages.ps1          # Gmail 수집
│   ├── html_to_text.js                  # HTML 변환
│   └── generate_html.js                 # 최종 출력
│
├── config/
│   ├── credentials/                     # Gmail 인증
│   │   ├── client_secret.json
│   │   └── token.json
│   └── labels.json                      # 라벨 설정
│
├── agents/
│   ├── labels/                          # 라벨별 Agent (수동 작성 필요)
│   ├── 병합.md                          # 중복 제거
│   └── 출력.md                          # 최종 포맷팅
│
├── skills/
│   └── newsletters/
│       ├── SKILL_작성규칙.md            # 기본 규칙
│       └── SKILL_더밀크.md               # 뉴스레터별 SKILL
│
└── output/
    └── runs/{run_id}/
        ├── raw/                         # Gmail 원본
        ├── clean/                       # 변환 텍스트
        ├── items/                       # 추출 아이템
        ├── merged/                      # 병합 결과
        └── final/                       # MD/HTML 출력
```

### 2.2 실행 플로우

```
1. Gmail 수집 (fetch_all_messages.ps1)
   ├─ 라벨별 최근 메일 조회
   ├─ JSON 형식으로 저장 (raw/)
   └─ 인코딩: UTF-8

2. HTML → Text 변환 (orchestrator.js)
   ├─ html_to_text.js 호출
   ├─ 한글 인코딩 안전 처리
   └─ 정제 텍스트 저장 (clean/)

3. LLM 아이템 추출 (agent_runner.js)
   ├─ 라벨별 Agent 실행
   ├─ SKILL 문서 참조
   ├─ OpenRouter Solar Pro 호출
   ├─ Rate Limit 재시도 (3회)
   └─ 아이템 JSON 저장 (items/)

4. 병합 (orchestrator.js)
   ├─ agents/병합.md 호출 (현재 미사용)
   ├─ 중복 제거
   └─ 병합 JSON 저장 (merged/)

5. 최종 출력 (generate_html.js)
   ├─ Markdown 생성
   ├─ HTML 생성
   └─ final/ 저장
```

### 2.3 기술 스택

| 구성요소 | 기술 |
|---------|------|
| 런타임 | Node.js 18+ |
| Gmail API | PowerShell + REST API |
| LLM API | OpenRouter (upstage/solar-pro) |
| 인코딩 | UTF-8, html-entities |
| 병렬 처리 | p-limit |
| 자동화 | GitHub Actions |

---

## 3. 현재 문제점 및 개선 과제

### 3.1 작동 상태 요약

#### [O] 정상 작동
- Gmail API 인증 및 메일 수집
- HTML → Text 변환 (UTF-8 안전)
- LLM 아이템 추출 (OpenRouter Solar Pro)
- MD/HTML 최종 출력

#### ⚠️ 부분 작동
- 라벨 병렬 처리 (3개 동시)
- Rate Limit 재시도 (3회, exponential backoff)
- GitHub Actions 워크플로우 (PowerShell 문제)

#### [O] 최근 구현
- **병합 로직**: agents/병합.md 호출하여 중복 제거 (구현 완료)
- **Agent 파일**: 웹 마법사로 자동 생성 가능 (구현 완료)
- **이중 인사이트**: agents/인사이트.md로 생성 (구현 완료)

#### ⚠️ 주의 필요
- **GitHub Actions Ubuntu**: PowerShell Core 설치 필요 (워크플로우에 추가됨)

### 3.2 치명적 이슈 (P0) - 모두 해결됨 [O]

#### P0-1: 병합 로직 미적용 [O] 해결

**위치**: `orchestrator.js:174-226`

**해결**: 병합 Agent 호출 로직이 추가됨. 중복 제거가 정상 작동합니다.

#### P0-2: PowerShell Ubuntu 비호환 [O] 해결

**위치**: `.github/workflows/daily-digest.yml`

**해결**: PowerShell Core 설치 단계가 추가됨.

```yaml
- name: Install PowerShell Core
  run: |
    sudo apt-get update
    sudo apt-get install -y powershell
```

#### P0-3: credentials 경로 불일치 [O] 해결

**해결**: 경로가 `config/credentials/` 아래로 통일됨.

#### P0-4: Agent 파일 누락 [O] 해결

**해결**: 웹 기반 설정 마법사로 Agent 파일 자동 생성 가능.

```bash
npm run setup
```

사용자 프로필과 선택한 라벨 기반으로 개인화된 Agent가 자동 생성됩니다.

### 3.3 중요 이슈 (P1)

#### P1-1: 한글 인코딩 깨짐

**위치**: `orchestrator.js` convertHtmlToText()

**현상**:
```javascript
const tempScript = path.join(__dirname, 'temp_convert.js');
fs.writeFileSync(tempScript, processScript, 'utf8');  // OK
execSync(`node "${tempScript}"`, { stdio: 'pipe' });  // Windows에서 가능
```

**문제**:
- Windows: 기본 인코딩 CP949 → UTF-8 BOM 없으면 깨짐
- Linux: UTF-8 (안전)

**영향**: Windows 로컬 실행 시 한글 깨짐 가능

**해결**: 임시 파일 거치지 않고 직접 호출

```javascript
// 직접 호출 방식
const { htmlToText, cleanNewsletterText } = require('./html_to_text.js');

for (const file of msgFiles) {
  try {
    const msgData = JSON.parse(fs.readFileSync(path.join(rawDir, file), 'utf8'));
    const messageId = file.replace('msg_', '').replace('.json', '');

    let cleanText = '';
    if (msgData.html_body) {
      cleanText = htmlToText(msgData.html_body);
      cleanText = cleanNewsletterText(cleanText);
    }

    const cleanData = {
      message_id: messageId,
      from: msgData.from,
      subject: msgData.subject,
      date: msgData.date,
      labels: msgData.labels,
      clean_text: cleanText
    };

    fs.writeFileSync(
      path.join(cleanDir, `clean_${messageId}.json`),
      JSON.stringify(cleanData, null, 2),
      'utf8'
    );
  } catch (error) {
    console.warn(`메일 ${file} 변환 실패, 건너뜀: ${error.message}`);
    continue;
  }
}
```

#### P1-2: Rate Limit 전역 관리 부재

**위치**: `agent_runner.js`

**현상**: 각 요청이 독립적으로 재시도

**문제**:
- 동시에 5개 요청 → 모두 429 → 5개 동시 재시도 → 더 많은 요청
- Solar Pro: 20 req/min → 병렬 처리 중 충돌

**해결**: p-queue 전역 관리

```javascript
const PQueue = require('p-queue').default;
const globalQueue = new PQueue({
  concurrency: 1,
  interval: 3000,  // 3초당 1개 = 20 req/min
  intervalCap: 1
});

class AgentRunner {
  async callSolar3(prompt) {
    return await globalQueue.add(async () => {
      const fetch = (await import('node-fetch')).default;
      // ... 기존 로직
    });
  }
}
```

#### P1-3: 메일별 LLM 호출 순차 처리

**위치**: `orchestrator.js` processLabel():142

**현상**:
```javascript
for (const cleanFile of cleanFiles) {
  await runner.runAgent(...);  // 순차
}
```

**영향**: 메일 10개 × 5초 = 50초/라벨

**해결**: Rate Limiter 아래서 병렬 처리

```javascript
const limit = pLimit(5);  // Rate Limiter 고려
const results = await Promise.all(
  cleanFiles.map(cleanFile =>
    limit(async () => {
      const messageId = cleanFile.replace('clean_', '').replace('.json', '');
      const cleanPath = path.join(cleanDir, cleanFile);
      const itemsPath = path.join(itemsDir, `items_${messageId}.json`);

      try {
        await runner.runAgent(`agents/labels/${label.name}.md`, {
          skills: ['SKILL_작성규칙.md'],
          inputs: cleanPath,
          output: itemsPath
        });
      } catch (error) {
        console.warn(`메일 ${messageId} 처리 실패, 건너뜀: ${error.message}`);
      }
    })
  )
);
```

#### P1-4: HTML 변환 에러 처리 없음

**위치**: `orchestrator.js` convertHtmlToText()

**현상**: 하나의 메일 변환 실패 시 전체 라벨 중단

**해결**: try-catch로 실패한 메일 스킵 (위 P1-1 해결안에 포함)

#### P1-5: Gmail 에러 코드 구분 없음

**위치**: `orchestrator.js` fetchGmailMessages():230

**현상**:
```javascript
try {
  execSync(cmd, { stdio: 'pipe' });
} catch (error) {
  // Gmail API 오류 무시 (메일 없을 수 있음)
}
```

**문제**: 401 (인증 만료)와 404 (메일 없음)를 구분 못함

**해결**: PowerShell에서 exit code 반환

```powershell
# fetch_all_messages.ps1
try {
    $response = Invoke-RestMethod -Uri $uri -Headers $headers
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 401) {
        Write-Error "AUTH_EXPIRED"
        exit 401
    } elseif ($statusCode -eq 403) {
        Write-Error "PERMISSION_DENIED"
        exit 403
    } else {
        Write-Error $_.Exception.Message
        exit 1
    }
}
```

```javascript
// orchestrator.js
try {
  execSync(cmd, { stdio: 'pipe' });
} catch (error) {
  if (error.status === 401) {
    console.error('Gmail 인증 만료. npm run refresh 실행 필요');
    throw error;
  }
  // 다른 에러는 메일 없음으로 간주
}
```

### 3.4 개선 권장 (P2)

#### P2-1: PowerShell → Node.js 마이그레이션

**이유**: 크로스 플랫폼 지원, 인코딩 문제 해결

**대상**: `fetch_all_messages.ps1` → `fetch_gmail.js`

**방법**: googleapis 라이브러리 사용

#### P2-2: SKILL 자동 매칭

**현재**: `options.skills`에 'SKILL_작성규칙.md'만 전달

**문제**: 뉴스레터별 SKILL (SKILL_더밀크.md) 활용 안 됨

**해결**: from 필드 기반 자동 매칭

```javascript
// from 필드에서 발신자 추출
const cleanData = JSON.parse(fs.readFileSync(cleanPath, 'utf8'));
const senderEmail = cleanData.from.match(/<(.+)>/)?.[1] || cleanData.from;

// newsletters.json에서 매칭
const newsletter = newsletters.find(n => n.sender === senderEmail);
const skills = newsletter
  ? [newsletter.skill_file, 'SKILL_작성규칙.md']
  : ['SKILL_작성규칙.md'];

await runner.runAgent(`agents/labels/${label.name}.md`, {
  skills: skills,
  inputs: cleanPath,
  output: itemsPath
});
```

#### P2-3: 마크다운 원문 섹션

**현재**: HTML에만 원문, MD에는 없음

**해결**: `generateMarkdown()`에 원문 추가

#### P2-4: 로그 자동 정리

**현재**: `logs/{date}.log` 무한 누적

**해결**: 30일 이상 로그 자동 삭제

---

## 4. 데이터 스키마

### 4.1 설정 파일

#### labels.json

```json
{
  "labels": [
    {
      "name": "IT",
      "enabled": true,
      "description": "기술, AI, 스타트업 뉴스"
    },
    {
      "name": "경제",
      "enabled": false,
      "description": "경제, 금융, 시장 뉴스"
    }
  ]
}
```

### 4.2 중간 데이터

#### raw/{label}/msg_{id}.json

```json
{
  "message_id": "18d7f3a2c9e4b1f0",
  "from": "viewsletter@themiilk.com",
  "subject": "더밀크 #123 | OpenAI 새 모델 발표",
  "date": "2026-02-01T09:00:00Z",
  "labels": ["IT"],
  "html_body": "<html>...</html>"
}
```

#### clean/{label}/clean_{id}.json

```json
{
  "message_id": "18d7f3a2c9e4b1f0",
  "from": "viewsletter@themiilk.com",
  "subject": "더밀크 #123 | OpenAI 새 모델 발표",
  "date": "2026-02-01T09:00:00Z",
  "labels": ["IT"],
  "clean_text": "OpenAI가 새로운 모델을 발표했습니다..."
}
```

#### items/{label}/items_{id}.json

```json
{
  "items": [
    {
      "title": "OpenAI, GPT-5 발표",
      "summary": "OpenAI가 GPT-5를 발표하며 멀티모달 성능 향상...",
      "keywords": ["OpenAI", "GPT-5", "AI"],
      "source": "더밀크",
      "original_text": "원문 내용..."
    }
  ]
}
```

#### merged/{label}/merged.json

```json
{
  "label": "IT",
  "merged_at": "2026-02-01T10:00:00Z",
  "total_items": 25,
  "duplicates_removed": 5,
  "items": [
    {
      "title": "OpenAI, GPT-5 발표",
      "summary": "...",
      "keywords": ["OpenAI", "GPT-5", "AI"],
      "sources": ["더밀크", "바이라인"],
      "merged_from": 2,
      "original_text": "..."
    }
  ],
  "stats": {
    "original_count": 30,
    "merged_count": 25,
    "duplicate_count": 5
  }
}
```

### 4.3 최종 출력

#### final/{label}.md

```markdown
# IT 메일 정리 (2026-02-01)

> 총 25개 아이템 | 병합: 3개 | 중복 제거: 5개

---

## 1. OpenAI, GPT-5 발표

OpenAI가 GPT-5를 발표하며 멀티모달 성능을 대폭 향상시켰다.
텍스트, 이미지, 음성을 동시에 처리할 수 있으며...

**키워드**: #OpenAI #GPT-5 #AI

**출처**: 더밀크, 바이라인

<details>
<summary>원문 보기</summary>
[원문 내용...]
</details>

---
```

---

## 5. 핵심 기능

### 5.1 Gmail 수집

**스크립트**: `scripts/fetch_all_messages.ps1`

**기능**:
1. Gmail API 인증 (OAuth2)
2. 라벨별 최근 메일 조회
3. JSON 형식 저장

**제약**:
- PowerShell 전용 (Windows/PowerShell Core)
- 최대 50개/라벨

### 5.2 HTML → Text 변환

**스크립트**: `scripts/html_to_text.js`

**기능**:
1. HTML 태그 제거
2. 한글 인코딩 안전 처리
3. HTML 엔티티 디코딩
4. 뉴스레터 노이즈 필터링

**인코딩 처리**:
```javascript
function decodeHtmlEntities(text) {
  // Numeric entities (decimal and hex)
  text = text.replace(/&#(\d+);/g, (match, dec) => {
    return String.fromCharCode(dec);
  });
  text = text.replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });

  // Named entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&amp;/g, '&');

  return text;
}
```

### 5.3 LLM Agent 분석

**스크립트**: `scripts/agent_runner.js`

**기능**:
1. Agent 문서 로드 (Markdown)
2. SKILL 문서 로드 (선택적)
3. 프롬프트 생성
4. OpenRouter API 호출
5. JSON 응답 파싱

**Agent 구조**:
```markdown
# IT 에이전트

당신은 IT 뉴스 분석 전문가입니다.

## 역할
기술, AI, 스타트업 뉴스레터에서 중요한 정보를 추출합니다.

## 추출 규칙
1. 제목: 간결하고 명확하게 (15자 이내)
2. 요약: 핵심 내용만 2-3문장
3. 키워드: 3-5개
4. 원문: 주요 단락 그대로 보존

## 필터링
- 광고성 콘텐츠 제외
- 구독 취소 링크 제외
- 중복 CTA 제외

## 출력 형식
JSON:
{
  "items": [
    {
      "title": "...",
      "summary": "...",
      "keywords": ["..."],
      "source": "뉴스레터 이름",
      "original_text": "..."
    }
  ]
}
```

**API 호출**:
```javascript
async callSolar3(prompt) {
  const fetch = (await import('node-fetch')).default;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'upstage/solar-pro',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })
  });

  const data = await response.json();
  return data.choices[0].message.content;
}
```

**Rate Limit 재시도**:
```javascript
async callSolar3WithRetry(prompt, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await this.callSolar3(prompt);
    } catch (error) {
      if (error.message.includes('429') && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 3000;  // 3초, 6초, 12초
        console.log(`Rate Limit 도달, ${delay}ms 후 재시도 (${i+1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}
```

### 5.4 병합 및 중복 제거

**Agent**: `agents/병합.md`

**기능**:
1. 키워드 유사도로 후보 그룹 선정
2. Summary 직접 읽고 판단
3. 병합 실행 (같은 뉴스 확신 시)

**중복 판단 프로세스**:
```
1단계: 키워드 유사도 계산
  - Jaccard 유사도 > 0.6 → 후보

2단계: Summary LLM 판단
  - 프롬프트: "다음 두 아이템이 같은 뉴스인지 판단하세요"
  - 응답: "같음" / "다름"

3단계: 병합 실행
  - 같음: 더 긴 summary 선택, sources 합치기
  - 다름: 유지
```

### 5.5 최종 출력 생성

**스크립트**: `scripts/generate_html.js`

**기능**:
1. Markdown 생성
2. HTML 생성 (Tailwind CSS)
3. 통계 정보 포함

**HTML 템플릿**:
```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>IT 메일 정리</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50">
  <div class="container mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold mb-4">IT 메일 정리 (2026-02-01)</h1>
    <p class="text-gray-600 mb-8">총 25개 아이템 | 병합: 3개 | 중복 제거: 5개</p>

    <div class="space-y-6">
      <!-- 아이템 카드 -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-semibold mb-2">1. OpenAI, GPT-5 발표</h2>
        <p class="text-gray-700 mb-4">...</p>
        <div class="flex gap-2 mb-4">
          <span class="bg-blue-100 text-blue-800 px-3 py-1 rounded">#OpenAI</span>
          <span class="bg-blue-100 text-blue-800 px-3 py-1 rounded">#GPT-5</span>
        </div>
        <details>
          <summary class="cursor-pointer text-blue-600">원문 보기</summary>
          <div class="mt-4 p-4 bg-gray-50 rounded">...</div>
        </details>
      </div>
    </div>
  </div>
</body>
</html>
```

---

## 6. 자동 설정 시스템 (구현 완료)

> **상태**: 웹 기반 설정 마법사가 구현되었습니다. `npm run setup`으로 실행할 수 있습니다.

### 6.1 웹 기반 설정 마법사

**목표**: 비개발자도 쉽게 사용할 수 있는 웹 UI로 Agent/SKILL 자동 생성

**실행 방법**:
```bash
npm run setup
```

브라우저가 자동으로 열리며 `http://localhost:3000/setup`에서 마법사가 시작됩니다.

#### 디렉토리 구조

```
scripts/setup/
├── server.js              # Express 웹 서버
├── wizard.js              # 마법사 백엔드 로직
├── newsletter_analyzer.js # 이메일 분석
├── skill_generator.js     # SKILL 자동 생성
├── agent_generator.js     # Agent 자동 생성
├── validator.js           # 품질 검증
└── public/
    ├── index.html         # 마법사 메인 페이지
    ├── style.css          # 스타일
    └── app.js             # 프론트엔드 로직
```

#### 마법사 플로우 (6단계)

```
Step 1: 시작
├── 환영 메시지
├── 예상 시간 안내 (30-40분)
└── [시작하기] 버튼

Step 2: 사용자 프로필
├── 직업/역할 입력
├── 기술적 관심사 (태그 입력)
├── 비즈니스 관심사 (태그 입력)
├── 지적 관심사 (태그 입력)
├── 단기/장기 목표
└── 실시간 입력 검증

Step 3: Gmail 연결
├── Gmail 인증 버튼 (OAuth 팝업)
├── 인증 성공 확인
├── 라벨 목록 표시
└── 사용할 라벨 선택 (체크박스)

Step 4: 분석 진행
├── 프로그레스 바 (%)
├── 현재 작업 표시 (이메일 수집 중...)
├── 라벨별 상태 ([O] IT 완료, [진행중] 경제 분석 중...)
└── 예상 남은 시간

Step 5: 결과 미리보기
├── 생성된 Agent 목록
├── Agent 내용 미리보기 (아코디언)
├── [수정] 버튼 (인라인 편집)
├── 생성된 SKILL 목록
└── SKILL 내용 미리보기

Step 6: 완료
├── 성공 메시지
├── 생성된 파일 목록
├── 다음 단계 안내 (npm run digest)
└── 서버 자동 종료
```

#### 웹 서버 구현

**server.js**:
```javascript
const express = require('express');
const path = require('path');
const { runWizard, analyzeNewsletters, generateAgents } = require('./wizard');

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API 엔드포인트
app.post('/api/profile', async (req, res) => {
  const profile = req.body;
  await saveProfile(profile);
  res.json({ success: true });
});

app.post('/api/gmail/auth', async (req, res) => {
  const authUrl = await getGmailAuthUrl();
  res.json({ authUrl });
});

app.get('/api/gmail/callback', async (req, res) => {
  const { code } = req.query;
  await handleOAuthCallback(code);
  res.redirect('/setup?step=3&auth=success');
});

app.get('/api/labels', async (req, res) => {
  const labels = await getGmailLabels();
  res.json({ labels });
});

app.post('/api/analyze', async (req, res) => {
  const { labels } = req.body;
  // SSE로 진행 상황 전송
  res.setHeader('Content-Type', 'text/event-stream');

  for (const label of labels) {
    res.write(`data: {"status": "analyzing", "label": "${label}"}\n\n`);
    await analyzeLabel(label);
    res.write(`data: {"status": "complete", "label": "${label}"}\n\n`);
  }

  res.write(`data: {"status": "done"}\n\n`);
  res.end();
});

app.post('/api/generate', async (req, res) => {
  const { profile, labels } = req.body;
  const agents = await generateAgents(profile, labels);
  res.json({ agents });
});

app.post('/api/save', async (req, res) => {
  const { agents, skills } = req.body;
  await saveGeneratedFiles(agents, skills);
  res.json({ success: true });
});

app.post('/api/shutdown', (req, res) => {
  res.json({ success: true });
  setTimeout(() => process.exit(0), 1000);
});

// 서버 시작 및 브라우저 열기
app.listen(PORT, () => {
  console.log(`Setup wizard running at http://localhost:${PORT}/setup`);
  const open = require('open');
  open(`http://localhost:${PORT}/setup`);
});
```

#### 프론트엔드 UI

**public/index.html**:
```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>Gmail Manager 설정</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen">
  <div class="container mx-auto py-8 px-4 max-w-2xl">
    <!-- 진행 표시 -->
    <div class="flex justify-between mb-8">
      <div class="step" data-step="1">1. 시작</div>
      <div class="step" data-step="2">2. 프로필</div>
      <div class="step" data-step="3">3. Gmail</div>
      <div class="step" data-step="4">4. 분석</div>
      <div class="step" data-step="5">5. 미리보기</div>
      <div class="step" data-step="6">6. 완료</div>
    </div>

    <!-- 단계별 컨텐츠 -->
    <div id="wizard-content" class="bg-white rounded-lg shadow p-6">
      <!-- 동적 렌더링 -->
    </div>
  </div>
  <script src="app.js"></script>
</body>
</html>
```

#### 출력 파일

**config/user_profile.json**:
```json
{
  "version": "1.0",
  "created_at": "2026-02-03T10:00:00Z",
  "user": {
    "occupation": {
      "title": "AI 스포츠카메라 스타트업 CEO",
      "description": "NPU 기반 엣지 AI 카메라 하드웨어 개발",
      "industry": ["Sports Tech", "AI Hardware"]
    },
    "interests": {
      "technical": ["NPU", "Edge AI", "Computer Vision"],
      "business": ["Sports Tech", "Hardware Manufacturing"],
      "intellectual": ["Phenomenology", "Systems Thinking"]
    },
    "goals": {
      "short_term": "제품 시장 적합성 확보",
      "long_term": "글로벌 스포츠 테크 Top 3"
    }
  }
}
```

### 6.2 뉴스레터 분석기

**기능**:
1. 라벨당 2주치 이메일 수집
2. 보낸사람별 집계 및 빈도 계산
3. 대표 샘플 선택 (빈도 기반)
4. LLM으로 뉴스레터 구조 분석
5. 한글 인코딩 검증

**newsletter_analyzer.js**:
```javascript
async function analyzeLabel(label, onProgress) {
  // 2주치 이메일 수집
  const emails = await fetchEmails(label, {
    after: getDate(-14),
    before: getDate(0)
  });

  onProgress({ status: 'fetched', count: emails.length });

  // 보낸사람별 집계
  const senders = aggregateBySender(emails);

  const results = [];
  for (const sender of senders) {
    onProgress({ status: 'analyzing', sender: sender.email });

    // 인코딩 검증
    sender.encoding_ok = verifyEncodingIntegrity(sender.emails);
    sender.charset = detectCharset(sender.emails);

    // 샘플링 (빈도 기반)
    const sampleCount = calculateSampleSize(sender.frequency);
    const samples = selectRepresentativeSamples(sender.emails, sampleCount);

    // LLM 구조 분석
    const structure = await analyzeStructure(samples);

    results.push({
      sender: sender.email,
      name: sender.name,
      frequency: sender.frequency,
      structure,
      encoding_ok: sender.encoding_ok
    });
  }

  return results;
}

function verifyEncodingIntegrity(emails) {
  for (const email of emails) {
    const text = email.clean_text;
    // 한글 깨짐 패턴 감지
    if (text.includes('ใ') || text.includes('�') || text.includes('ã')) {
      return false;
    }
  }
  return true;
}

function calculateSampleSize(frequency) {
  if (frequency <= 1) return 1;
  if (frequency <= 3) return 2;
  if (frequency <= 7) return 3;
  return Math.min(5, frequency);
}
```

**출력**: `config/newsletters.json`

```json
{
  "newsletters": [
    {
      "id": "themiilk",
      "sender": "viewsletter@themiilk.com",
      "name": "더밀크",
      "labels": ["IT"],
      "frequency": 3,
      "skill_file": "skills/newsletters/SKILL_themiilk.md",
      "encoding": "utf-8",
      "encoding_ok": true,
      "structure": {
        "type": "multi-item",
        "item_count_avg": 4
      },
      "analyzed_at": "2026-02-03T10:00:00Z"
    }
  ],
  "last_scan": "2026-02-03T10:00:00Z"
}
```

### 6.3 SKILL 생성기

**프롬프트**: `templates/prompts/analyze_structure.txt`

```
당신은 뉴스레터 구조 분석 전문가입니다.

작업: 뉴스레터 샘플을 분석하고 SKILL 문서를 생성하세요.

입력:
뉴스레터: {newsletter_name}
발신자: {sender_email}
샘플 수: {sample_count}
인코딩: {charset}

{samples}

분석 요구사항:
1. 구조 패턴 인식 (HTML/CSS 패턴)
2. 콘텐츠 추출 규칙 (제목, 요약, 링크)
3. 노이즈 필터링 (광고, 보일러플레이트)
4. 인코딩 처리 (HTML 엔티티, charset)

출력 형식:
# SKILL_{newsletter_id}

## 메타데이터
- 이름: {name}
- 발신자: {sender}
- 빈도: {frequency}

## 구조
### HTML 패턴
- 컨테이너: {CSS 선택자}
- 아이템 경계: {패턴}
- 제목: {선택자}
- 본문: {선택자}

### 인코딩 처리
- HTML 엔티티 디코딩: {필요/불필요}
- charset 변환: {필요/불필요}
```

### 6.4 Agent 생성기

**기능**: 사용자 프로필 반영하여 Agent 생성

```javascript
async function generateAgent(label, userProfile, newsletters) {
  const relatedInterests = mapRelatedInterests(label, userProfile);
  const unrelatedInterests = mapUnrelatedInterests(label, userProfile);

  const prompt = `
당신은 Agent 문서 생성 전문가입니다.

라벨: ${label.name}
사용자 프로필: ${JSON.stringify(userProfile)}
뉴스레터: ${newsletters.map(n => n.name).join(', ')}

관련 관심사: ${relatedInterests.join(', ')}
비관련 관심사: ${unrelatedInterests.join(', ')}

Agent 문서를 생성하세요:
- 역할 정의
- 추출 규칙
- 필터링 기준
- 출력 형식
  `;

  const agentDocument = await callLLM(prompt);
  await saveAgent(label.name, agentDocument);
}
```

### 6.5 이중 인사이트 시스템

**목표**: 도메인 관련 + 교차 도메인 인사이트

**인사이트 A (도메인 관련)**:
- 아이템을 사용자의 관련 관심사와 연결
- 초점: 실용적 적용, 시장 함의, 기술적 깊이
- 예시: "빅테크 커스텀 칩 트렌드. NPU 설계 내재화로 성능 차별화 기회"

**인사이트 B (교차 도메인)**:
- 아이템을 사용자의 비관련 관심사와 연결
- 초점: 개념적 유사성, 철학적 각도, 창의적 종합
- 예시: "기술 주권의 경제학. 푸코의 권력 분산 개념과 유사"

**프롬프트**:
```
당신은 인사이트 생성 전문가입니다.

사용자 컨텍스트:
{user_profile}

라벨: {label_name}
관련 관심사: {related_interests}
비관련 관심사: {unrelated_interests}

아이템:
제목: {item_title}
요약: {item_summary}

작업: 각각 80-100자 길이의 인사이트 2개 생성

Insight A (도메인 관련):
- 실용적 적용, 시장 함의
- 예시: "빅테크 커스텀 칩 트렌드. NPU 내재화로 차별화"

Insight B (교차 도메인):
- 개념적 유사성, 철학적 각도
- 예시: "기술 주권의 경제학. 푸코 권력 분산과 유사"

출력 JSON:
{
  "insight_a": "...",
  "insight_b": "..."
}
```

**출력 형식**:
```markdown
## 1. 아마존, 자체 AI 칩 개발 본격화

아마존이 자체 AI 칩 개발을 본격화하며 엔비디아 의존도를 낮추고 있다.

**Insight A**: 빅테크 커스텀 칩 트렌드. NPU 설계 내재화로 차별화된
성능 확보 가능. ARM 파트너십 재검토 시점

**Insight B**: 기술 주권의 경제학. 푸코의 권력 분산 개념처럼, 칩 설계
능력이 곧 플랫폼 자율성. 의존성 탈피가 전략적 자유도 확보

**키워드**: #AI칩 #아마존 #엔비디아
**출처**: The Miilk
```

### 6.6 적응형 학습

**목표**: 새 뉴스레터 자동 감지 및 학습

**기능**:
1. 변경사항 감지 (새 발신자, 새 라벨)
2. 자동 분석 트리거
3. SKILL 생성 및 검증
4. 사용자 승인 후 활성화

```javascript
async function detectChanges() {
  const currentNewsletters = loadNewsletters();
  const recentEmails = await fetchRecentEmails(7);  // 7일

  const newSenders = findNewSenders(recentEmails, currentNewsletters);

  for (const sender of newSenders) {
    console.log(`새 뉴스레터 감지: ${sender.email}`);

    // 자동 분석
    const structure = await analyzeNewsletter(sender);

    // SKILL 생성
    const skill = await generateSkill(sender, structure);

    // 검증
    const valid = await validateSkill(skill);

    if (valid) {
      console.log(`SKILL 생성 완료: ${skill.file}`);
      // 사용자 승인 대기
    }
  }
}
```

---

## 7. 구현 가이드

### 7.1 초기 설정

**1단계: Gmail 인증**

```bash
npm run auth
```

- Google Cloud Console에서 OAuth2 credentials 생성
- `config/credentials/client_secret.json` 저장
- 브라우저에서 인증
- `config/credentials/token.json` 자동 생성

**2단계: 라벨 설정**

`config/labels.json` 편집:
```json
{
  "labels": [
    { "name": "IT", "enabled": true }
  ]
}
```

**3단계: 초기 설정 (웹 마법사)**

```bash
npm run setup
```

웹 마법사가 자동으로 브라우저에서 열리며:
1. 사용자 프로필 입력 (직업, 관심사)
2. 사용할 라벨 선택
3. Agent 자동 생성

또는 `agents/labels/{label}.md` 파일을 수동으로 작성할 수도 있습니다.

**4단계: 실행**

```bash
npm run digest
```

### 7.2 개선 적용 순서

**Phase 1: P0 수정 [O] 완료**

1. [O] P0-1: 병합 로직 활성화
2. [O] P0-2: PowerShell Core 설치 (GitHub Actions)
3. [O] P0-3: credentials 경로 통일
4. [O] P0-4: Agent 자동 생성 시스템

**Phase 2: 확장 기능 [O] 완료**

1. [O] 웹 기반 설정 마법사 (`npm run setup`)
2. [O] 이중 인사이트 시스템 (`agents/인사이트.md`)
3. [O] Agent/SKILL 자동 생성

**Phase 3: P1 수정 (단기)**

1. P1-1: 한글 인코딩 안정화
2. P1-2: Rate Limiter 전역 관리
3. P1-3: 메일별 병렬 처리
4. P1-4: HTML 변환 에러 처리
5. P1-5: Gmail 에러 코드 구분

**Phase 4: P2 개선 [O] 대부분 완료**

1. [O] P2-1: PowerShell → Node.js 마이그레이션 (fetch_gmail.js)
2. [O] P2-2: SKILL 자동 매칭 (발신자 기반)
3. P2-3: 마크다운 원문 섹션
4. P2-4: 로그 자동 정리

**Phase 5: 확장 기능 [O] 완료**

1. [O] 적응형 학습 (새 뉴스레터 자동 감지, SKILL 자동 생성)

### 7.3 테스트 전략

**단위 테스트**:
```bash
npm test
```

**통합 테스트**:
```bash
npm run digest -- --mode test --labels IT
```

**검증 체크리스트**:
- [ ] Gmail 인증 성공
- [ ] 메일 수집 성공
- [ ] HTML 변환 (한글 깨짐 없음)
- [ ] LLM 아이템 추출
- [ ] 병합 로직 작동
- [ ] MD/HTML 출력 생성
- [ ] GitHub Actions 성공

---

## 8. API 레퍼런스

### 8.1 CLI 명령어

```bash
# 기본 실행
npm run digest

# 특정 날짜
npm run digest -- --mode custom --date 2026-01-30

# 특정 라벨만
npm run digest -- --labels IT,경제

# Gmail 인증
npm run auth

# 토큰 갱신
npm run refresh
```

### 8.2 내부 API

```javascript
// orchestrator.js
async function runDigest(options)
async function processLabel(label, runId)
async function fetchGmailMessages(label, runDir)
async function convertHtmlToText(label, runDir)
async function mergeItems(label, runDir)

// agent_runner.js
class AgentRunner {
  async runAgent(agentPath, options)
  async callSolar3(prompt)
  async callSolar3WithRetry(prompt, maxRetries)
  parseJson(llmOutput)
}

// html_to_text.js
function htmlToText(html)
function cleanNewsletterText(text)
function decodeHtmlEntities(text)

// generate_html.js
function generateMarkdown(mergedData)
function generateHtml(mergedData)
```

### 8.3 환경 변수

```bash
# .env
OPENROUTER_API_KEY=sk-or-v1-...

# 선택적
TELEGRAM_TOKEN=
TELEGRAM_CHAT_ID=
```

---

## 9. 부록

### 9.1 한글 인코딩 처리 가이드

#### 인코딩 문제 패턴

| 패턴 | 원인 | 해결 |
|------|------|------|
| `ใ`, `ã` | EUC-KR → UTF-8 오해석 | charset 명시적 변환 |
| `�` | 손상된 문자 | 원본 재수집 |
| `&#xHEXX;` | HTML 엔티티 | decodeHtmlEntities() |
| BOM 깨짐 | UTF-8 BOM | BOM 제거 |

#### 검증 체크리스트

```javascript
function validateKoreanText(text) {
  const checks = {
    // 1. 한글 유니코드 범위
    hasKorean: /[가-힣]/.test(text),

    // 2. 깨진 문자 패턴
    hasBroken: /[ใã�]/.test(text),

    // 3. HTML 엔티티 미변환
    hasEntities: /&#\d+;/.test(text),

    // 4. 공백 비정상 (NBSP 등)
    hasWeirdSpace: /\xA0/.test(text)
  };

  return {
    ok: checks.hasKorean && !checks.hasBroken,
    checks
  };
}
```

#### 자동 복구 전략

```javascript
function autoFixEncoding(text, originalCharset) {
  // 1. EUC-KR 오해석 감지
  if (text.includes('ใ')) {
    const buffer = Buffer.from(text, 'binary');
    return iconv.decode(buffer, 'euc-kr');
  }

  // 2. HTML 엔티티 디코딩
  text = decodeHtmlEntities(text);

  // 3. 정규화
  text = text.normalize('NFC');

  return text;
}
```

### 9.2 성능 최적화 가이드

#### 병목 지점 및 해결

| 병목 | 현재 시간 | 최적화 후 | 방법 |
|------|----------|-----------|------|
| LLM 순차 호출 | 50초/라벨 | 15초 | 메일별 병렬 (Rate Limiter 하) |
| PowerShell 호출 | 5초 | 1초 | Node.js 직접 호출 |
| HTML 변환 | 3초 | 1초 | 임시 파일 제거 |

#### 메모리 관리

```javascript
// 대용량 메일 처리
async function processLargeEmail(emailPath) {
  const stream = fs.createReadStream(emailPath, { encoding: 'utf8' });
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(chunk);
    if (chunks.length > 1000) {  // 청크 제한
      break;
    }
  }

  return chunks.join('');
}
```

### 9.3 문제 해결 가이드

#### 자주 발생하는 에러

**에러**: `Gmail API 401 Unauthorized`
- **원인**: 토큰 만료
- **해결**: `npm run refresh`

**에러**: `Agent 파일 없음 (ENOENT)`
- **원인**: IT 외 라벨 활성화
- **해결**: `labels.json`에서 해당 라벨 `enabled: false`

**에러**: `한글 깨짐 (ใ, ã)`
- **원인**: 인코딩 변환 문제
- **해결**: P1-1 적용 (직접 호출 방식)

**에러**: `Rate Limit 429`
- **원인**: 동시 요청 과다
- **해결**: P1-2 적용 (전역 Rate Limiter)

#### 로그 분석

**로그 위치**: `output/runs/{run_id}/logs/{date}.log`

**주요 로그 패턴**:
```
[INFO] === IT 에이전트 실행 ===
[WARN] Rate Limit 도달, 6000ms 후 재시도 (1/3)
[ERROR] JSON 형식을 찾을 수 없습니다
```

**로그 레벨**:
- INFO: 정상 진행
- WARN: 재시도 가능
- ERROR: 처리 실패

#### 디버깅 팁

1. **메일 수집 실패**:
   - PowerShell 로그 확인
   - Gmail API 할당량 확인
   - 라벨 이름 정확성 확인

2. **HTML 변환 실패**:
   - 인코딩 검증 (`validateKoreanText`)
   - HTML 구조 확인
   - 에러 메시지 로그 확인

3. **LLM 추출 실패**:
   - 프롬프트 길이 확인 (최대 토큰)
   - JSON 파싱 에러 확인
   - Rate Limit 로그 확인

4. **병합 실패**:
   - Agent 파일 존재 확인
   - 입력 데이터 형식 확인
   - LLM 응답 형식 확인

---

**명세서 끝**
