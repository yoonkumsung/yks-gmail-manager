/**
 * SKILL/에이전트 검증 스크립트
 *
 * 검증 항목:
 * 1. SKILL 파일 ↔ newsletters.json 발신자 매칭 검증
 * 2. SKILL 미생성 뉴스레터 탐지
 * 3. 고아 SKILL 파일 (newsletters.json에 없는 파일)
 * 4. SKILL 내 메타데이터 정합성 (이름, 발신자, 유형 등)
 * 5. (선택) 실제 메일로 추출 품질 평가
 *
 * 사용법:
 *   node scripts/validate_skills.js               # 정적 검증만
 *   node scripts/validate_skills.js --live         # 실제 메일 추출 테스트 포함
 *   node scripts/validate_skills.js --live --label IT  # 특정 라벨만
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');

// ============================================
// 1. 정적 검증 (파일 기반)
// ============================================

function staticValidation() {
  const report = {
    total_newsletters: 0,
    total_skills: 0,
    issues: [],
    warnings: [],
    ok: []
  };

  // newsletters.json 로드
  const nlPath = path.join(PROJECT_ROOT, 'config', 'newsletters.json');
  if (!fs.existsSync(nlPath)) {
    report.issues.push({ type: 'FATAL', message: 'config/newsletters.json 파일이 없습니다.' });
    return report;
  }

  const { newsletters } = JSON.parse(fs.readFileSync(nlPath, 'utf8'));
  report.total_newsletters = newsletters.length;

  // SKILL 파일 목록
  const skillDir = path.join(PROJECT_ROOT, 'skills', 'newsletters');
  const skillFiles = fs.existsSync(skillDir)
    ? fs.readdirSync(skillDir).filter(f => f.startsWith('SKILL_') && f.endsWith('.md'))
    : [];
  report.total_skills = skillFiles.length;

  // newsletters.json에서 참조하는 SKILL 파일 집합
  const referencedSkills = new Set();

  for (const nl of newsletters) {
    const skillFile = nl.skill_file ? path.basename(nl.skill_file) : null;
    if (skillFile) referencedSkills.add(skillFile);

    // --- 검증 1: skill_generated 상태 ---
    if (!nl.skill_generated) {
      report.issues.push({
        type: 'SKILL_미생성',
        newsletter: nl.name,
        sender: nl.sender,
        label: nl.labels?.join(', '),
        message: `SKILL이 생성되지 않음 (structure: ${nl.structure?.type || 'unknown'})`
      });
      continue;
    }

    // --- 검증 2: SKILL 파일 존재 여부 ---
    if (!skillFile) {
      report.issues.push({
        type: 'SKILL_경로_없음',
        newsletter: nl.name,
        sender: nl.sender,
        message: 'skill_file 경로가 비어있음'
      });
      continue;
    }

    const skillPath = path.join(PROJECT_ROOT, nl.skill_file);
    if (!fs.existsSync(skillPath)) {
      report.issues.push({
        type: 'SKILL_파일_누락',
        newsletter: nl.name,
        sender: nl.sender,
        expected_file: nl.skill_file,
        message: `SKILL 파일이 존재하지 않음`
      });
      continue;
    }

    // --- 검증 3: SKILL 내 발신자 매칭 ---
    const skillContent = fs.readFileSync(skillPath, 'utf8');

    // 발신자 이메일이 SKILL 내용에 포함되어 있는지
    if (!skillContent.includes(nl.sender)) {
      // SKILL 내 실제 발신자 추출 시도
      const senderMatch = skillContent.match(/발신자\s*\|\s*([^\n|]+)/);
      const nameMatch = skillContent.match(/이름\s*\|\s*([^\n|]+)/);
      const actualSender = senderMatch ? senderMatch[1].trim() : '(추출 불가)';
      const actualName = nameMatch ? nameMatch[1].trim() : '(추출 불가)';

      report.issues.push({
        type: 'SKILL_발신자_불일치',
        newsletter: nl.name,
        expected_sender: nl.sender,
        skill_file: skillFile,
        skill_sender: actualSender,
        skill_name: actualName,
        message: `SKILL 파일 내용이 다른 뉴스레터를 가리킴`
      });
    } else {
      // --- 검증 4: 구조 타입 일치 ---
      const typeMatch = skillContent.match(/유형\s*\|\s*([^\n|]+)/);
      if (typeMatch) {
        const skillType = typeMatch[1].trim();
        const nlType = nl.structure?.type;
        if (nlType && skillType !== nlType && nlType !== 'unknown') {
          report.warnings.push({
            type: 'SKILL_구조_불일치',
            newsletter: nl.name,
            skill_file: skillFile,
            newsletter_type: nlType,
            skill_type: skillType,
            message: `newsletters.json(${nlType}) ≠ SKILL(${skillType})`
          });
        }
      }

      // --- 검증 5: 아이템 수 일치 ---
      const countMatch = skillContent.match(/평균 아이템 수\s*\|\s*(\d+)/);
      if (countMatch && nl.structure?.item_count_avg) {
        const skillCount = parseInt(countMatch[1]);
        const nlCount = nl.structure.item_count_avg;
        if (Math.abs(skillCount - nlCount) > 5) {
          report.warnings.push({
            type: 'SKILL_아이템수_차이',
            newsletter: nl.name,
            skill_file: skillFile,
            newsletter_count: nlCount,
            skill_count: skillCount,
            message: `아이템 수 차이 큼: newsletters.json(${nlCount}) vs SKILL(${skillCount})`
          });
        }
      }

      report.ok.push({
        newsletter: nl.name,
        sender: nl.sender,
        skill_file: skillFile,
        label: nl.labels?.join(', ')
      });
    }
  }

  // --- 검증 6: 고아 SKILL 파일 ---
  for (const file of skillFiles) {
    if (!referencedSkills.has(file)) {
      report.warnings.push({
        type: '고아_SKILL',
        file,
        message: 'newsletters.json에서 참조하지 않는 SKILL 파일'
      });
    }
  }

  // --- 검증 7: 에이전트 파일 존재 여부 ---
  const labelsPath = path.join(PROJECT_ROOT, 'config', 'labels.json');
  if (fs.existsSync(labelsPath)) {
    const { labels } = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
    for (const label of labels) {
      if (!label.enabled) continue;
      if (label.agent) {
        const agentPath = path.join(PROJECT_ROOT, label.agent);
        if (!fs.existsSync(agentPath)) {
          report.issues.push({
            type: '에이전트_파일_누락',
            label: label.name,
            expected_file: label.agent,
            message: `라벨 에이전트 파일이 없음`
          });
        }
      }
    }
  }

  return report;
}

// ============================================
// 2. 라이브 검증 (실제 메일 추출 테스트)
// ============================================

async function liveValidation(targetLabel) {
  const { AgentRunner } = require('./agent_runner');
  const { GmailFetcher } = require('./fetch_gmail');
  const { htmlToText, cleanNewsletterText } = require('./html_to_text');

  const apiKey = process.env.OLLAMA_API_KEY;

  if (!apiKey) {
    console.error('OLLAMA_API_KEY가 설정되지 않았습니다');
    return [];
  }

  const flashRunner = new AgentRunner(apiKey, 'deepseek-v4-flash:cloud', { logDir: 'logs' });
  const proRunner = new AgentRunner(apiKey, 'deepseek-v4-pro:cloud', { logDir: 'logs', minRequestInterval: 3000 });

  // newsletters.json 로드
  const { newsletters } = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'config', 'newsletters.json'), 'utf8')
  );
  const { labels } = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'config', 'labels.json'), 'utf8')
  );

  // 대상 라벨 필터링
  const enabledLabels = labels.filter(l => l.enabled && (!targetLabel || l.name === targetLabel));

  if (enabledLabels.length === 0) {
    console.log('대상 라벨이 없습니다.');
    return [];
  }

  // Gmail 인증
  const fetcher = new GmailFetcher();
  await fetcher.authenticate();

  // 최근 7일 범위 (YYYY/MM/DD 형식)
  const now = new Date();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const formatDate = (d) => `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;

  const results = [];

  for (const label of enabledLabels) {
    console.log(`\n=== ${label.name} 라벨 검증 ===`);

    // 해당 라벨의 뉴스레터 목록
    const labelNewsletters = newsletters.filter(
      nl => nl.labels?.includes(label.name) && nl.skill_generated
    );

    if (labelNewsletters.length === 0) {
      console.log('  등록된 뉴스레터 없음, 건너뜀');
      continue;
    }

    // 라벨에서 최근 메일 가져오기 (최대 5통)
    let messages;
    try {
      messages = await fetcher.listMessages({
        label: label.gmail_label || label.name,
        subLabels: label.sub_labels || [],
        dateStart: formatDate(weekAgo),
        dateEnd: formatDate(now),
        maxResults: 5
      });
    } catch (e) {
      console.log(`  Gmail 조회 실패: ${e.message}`);
      continue;
    }

    if (!messages || messages.length === 0) {
      console.log('  최근 7일간 메일 없음');
      continue;
    }

    // 발신자별로 1통씩만 (중복 제거)
    const seenSenders = new Set();
    const uniqueMessages = [];
    for (const msg of messages) {
      try {
        const full = await fetcher.getMessage(msg.id);
        const headers = fetcher.extractHeaders(full);
        const from = headers.from || '';
        const senderEmail = from.match(/<([^>]+)>/)?.[1] || from.split(' ').pop();

        if (seenSenders.has(senderEmail)) continue;
        seenSenders.add(senderEmail);

        uniqueMessages.push({ ...full, senderEmail, from, subject: headers.subject });
        if (uniqueMessages.length >= 3) break; // 라벨당 최대 3개 뉴스레터
      } catch (e) {
        // 개별 메시지 실패 무시
      }
    }

    console.log(`  ${uniqueMessages.length}개 뉴스레터 테스트`);

    for (const msg of uniqueMessages) {
      const nl = newsletters.find(n => msg.senderEmail.includes(n.sender) || n.sender.includes(msg.senderEmail));
      const nlName = nl?.name || msg.from;
      const skillFile = nl?.skill_file ? path.basename(nl.skill_file) : null;

      console.log(`  [${nlName}] ${msg.senderEmail}`);

      // HTML → 텍스트 변환
      let cleanText;
      try {
        const htmlBody = fetcher.extractHtmlBody(msg) || '';
        if (!htmlBody) {
          console.log('    → HTML 본문 없음, 건너뜀');
          continue;
        }
        const rawText = htmlToText(htmlBody);
        cleanText = cleanNewsletterText(rawText);
      } catch (e) {
        console.log(`    → HTML 변환 실패: ${e.message}`);
        continue;
      }

      if (!cleanText || cleanText.length < 100) {
        console.log('    → 본문 너무 짧음, 건너뜀');
        continue;
      }

      // SKILL + 에이전트로 추출
      const tmpInput = path.join(PROJECT_ROOT, 'logs', `_validate_input_${Date.now()}.json`);
      const subject = msg.subject || '';

      fs.writeFileSync(tmpInput, JSON.stringify({
        from: msg.from,
        subject,
        body: cleanText  // 전체 본문 전달 (chunking은 agent_runner가 처리)
      }, null, 2), 'utf8');

      try {
        const skills = skillFile ? [skillFile] : [];
        const agentPath = path.join(PROJECT_ROOT, 'agents', 'labels', `${label.name}.md`);

        const extractResult = await flashRunner.runAgent(agentPath, {
          inputs: tmpInput,
          taskType: 'extract',
          skills
        });

        const itemCount = extractResult?.items?.length || 0;
        console.log(`    → 추출: ${itemCount}개 아이템`);

        // Pro 모델로 품질 평가
        proRunner.currentTaskType = 'extract';
        const evalResult = await proRunner.callSolar3WithRetry(
          `당신은 뉴스레터 추출 품질 평가 전문가입니다.

아래는 원문 뉴스레터의 처음 3000자와 LLM이 추출한 결과입니다.
냉정하게 평가해주세요.

## 원문 (총 ${cleanText.length}자, 아래는 처음+끝 각 3000자)
=== 원문 앞부분 ===
${cleanText.substring(0, 3000)}
=== 원문 뒷부분 ===
${cleanText.substring(Math.max(0, cleanText.length - 3000))}

## 추출 결과 (총 ${extractResult?.items?.length || 0}개)
${JSON.stringify(extractResult, null, 2).substring(0, 5000)}

## 평가 기준
중요: 원문은 앞+뒷부분만 표시됩니다. 중간 부분에서 추출된 아이템도 정상입니다.
- coverage: 원문의 주요 뉴스가 빠짐없이 추출되었는가 (0~10)
- accuracy: 추출된 내용이 원문과 일치하는가 (0~10)
- quality: 요약의 구체성, 수치 포함, 300자 이상(짧은 뉴스 예외) (0~10)
- skill_match: SKILL 규칙이 이 뉴스레터에 적합한가 (0~10, SKILL 없으면 5)

JSON만 출력:
{
  "scores": { "coverage": 0, "accuracy": 0, "quality": 0, "skill_match": 0 },
  "total": 0,
  "missing_items": ["누락된 뉴스 제목1", "..."],
  "issues": ["구체적 문제점1", "..."],
  "verdict": "PASS/WARN/FAIL"
}`
        );

        let evaluation;
        try {
          const jsonMatch = evalResult.match(/\{[\s\S]*\}/);
          evaluation = JSON.parse(jsonMatch[0]);
        } catch (e) {
          evaluation = { scores: {}, total: 0, verdict: 'PARSE_ERROR', raw: evalResult.substring(0, 200) };
        }

        console.log(`    → 평가: ${evaluation.verdict} (총점 ${evaluation.total}/40)`);
        if (evaluation.missing_items?.length > 0) {
          console.log(`    → 누락: ${evaluation.missing_items.join(', ')}`);
        }
        if (evaluation.issues?.length > 0) {
          console.log(`    → 문제: ${evaluation.issues.join(', ')}`);
        }

        results.push({
          label: label.name,
          newsletter: nlName,
          sender: msg.senderEmail,
          skill_file: skillFile,
          subject,
          items_extracted: itemCount,
          original_length: cleanText.length,
          evaluation
        });

      } catch (e) {
        console.log(`    → 추출/평가 실패: ${e.message}`);
        results.push({
          label: label.name,
          newsletter: nlName,
          sender: msg.senderEmail,
          skill_file: skillFile,
          error: e.message
        });
      } finally {
        try { fs.unlinkSync(tmpInput); } catch (e) {}
      }
    }
  }

  return results;
}

// ============================================
// 리포트 출력
// ============================================

function printReport(staticReport, liveResults) {
  console.log('\n' + '='.repeat(70));
  console.log('  SKILL/에이전트 검증 리포트');
  console.log('='.repeat(70));

  // 정적 검증 결과
  console.log(`\n📊 전체 현황`);
  console.log(`  등록 뉴스레터: ${staticReport.total_newsletters}개`);
  console.log(`  SKILL 파일: ${staticReport.total_skills}개`);
  console.log(`  정상: ${staticReport.ok.length}개`);
  console.log(`  문제: ${staticReport.issues.length}개`);
  console.log(`  경고: ${staticReport.warnings.length}개`);

  if (staticReport.issues.length > 0) {
    console.log(`\n❌ 문제 (${staticReport.issues.length}건)`);
    for (const issue of staticReport.issues) {
      console.log(`  [${issue.type}] ${issue.newsletter || issue.label || ''}`);
      console.log(`    ${issue.message}`);
      if (issue.expected_sender && issue.skill_sender) {
        console.log(`    기대: ${issue.expected_sender}`);
        console.log(`    실제 SKILL: ${issue.skill_sender} (${issue.skill_name})`);
      }
    }
  }

  if (staticReport.warnings.length > 0) {
    console.log(`\n⚠️  경고 (${staticReport.warnings.length}건)`);
    for (const warn of staticReport.warnings) {
      console.log(`  [${warn.type}] ${warn.newsletter || warn.file || ''}`);
      console.log(`    ${warn.message}`);
    }
  }

  // 라이브 검증 결과
  if (liveResults && liveResults.length > 0) {
    console.log(`\n\n🔬 라이브 추출 테스트 (${liveResults.length}건)`);
    console.log('-'.repeat(70));

    let passCount = 0, warnCount = 0, failCount = 0, errorCount = 0;

    for (const r of liveResults) {
      if (r.error) {
        errorCount++;
        console.log(`  ❌ [${r.label}] ${r.newsletter} → 오류: ${r.error}`);
        continue;
      }

      const v = r.evaluation?.verdict || 'UNKNOWN';
      const total = r.evaluation?.total || 0;
      const icon = v === 'PASS' ? '✅' : v === 'WARN' ? '⚠️' : '❌';

      if (v === 'PASS') passCount++;
      else if (v === 'WARN') warnCount++;
      else failCount++;

      console.log(`  ${icon} [${r.label}] ${r.newsletter}`);
      console.log(`     SKILL: ${r.skill_file || '없음'} | 추출: ${r.items_extracted}개 | 점수: ${total}/40`);

      if (r.evaluation?.scores) {
        const s = r.evaluation.scores;
        console.log(`     커버리지:${s.coverage} 정확도:${s.accuracy} 품질:${s.quality} SKILL적합:${s.skill_match}`);
      }
      if (r.evaluation?.missing_items?.length > 0) {
        console.log(`     누락: ${r.evaluation.missing_items.slice(0, 3).join(', ')}`);
      }
      if (r.evaluation?.issues?.length > 0) {
        console.log(`     문제: ${r.evaluation.issues.slice(0, 2).join(', ')}`);
      }
    }

    console.log(`\n  요약: PASS ${passCount} / WARN ${warnCount} / FAIL ${failCount} / ERROR ${errorCount}`);
  }

  // 결과 파일 저장
  const outputPath = path.join(PROJECT_ROOT, 'output', 'validation_report.json');
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(outputPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    static: staticReport,
    live: liveResults || []
  }, null, 2), 'utf8');

  console.log(`\n📄 상세 리포트: ${outputPath}`);
  console.log('='.repeat(70));
}

// ============================================
// 메인
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const isLive = args.includes('--live');
  const labelIdx = args.indexOf('--label');
  const targetLabel = labelIdx >= 0 ? args[labelIdx + 1] : null;

  console.log('SKILL/에이전트 검증 시작...');
  console.log(`모드: ${isLive ? '정적 + 라이브' : '정적만'}`);
  if (targetLabel) console.log(`대상 라벨: ${targetLabel}`);

  // 1. 정적 검증
  const staticReport = staticValidation();

  // 2. 라이브 검증 (선택)
  let liveResults = null;
  if (isLive) {
    liveResults = await liveValidation(targetLabel);
  }

  // 3. 리포트 출력
  printReport(staticReport, liveResults);
}

main().catch(err => {
  console.error('검증 실패:', err);
  process.exit(1);
});
