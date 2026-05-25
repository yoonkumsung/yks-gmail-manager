/**
 * 전수 품질 감사 — 원문 대조
 *
 * 23일자 리포트의 모든 아이템을 원문 뉴스레터와 1:1 대조하여 평가
 *
 * 평가 항목 (100점 만점):
 * 1. 커버리지 (25점): 원문의 뉴스 아이템이 리포트에 빠짐없이 포함되었는가
 * 2. 정확성 (25점): 추출된 내용이 원문과 일치하는가 (할루시네이션 없는가)
 * 3. 요약 품질 (20점): 요약이 핵심 정보를 담고 있는가 (길이, 구체성)
 * 4. 금지 표현 (15점): 회피 표현 사용하지 않았는가
 * 5. 완결성 (15점): 모든 라벨이 처리되었는가, 파이프라인 에러 없는가
 *
 * 실행: node tests/test_quality_audit.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const REPORT_DIR = path.join(PROJECT_ROOT, 'output', 'final', '20260523');

const BANNED_PHRASES = [
  '원문 참조', '원문에서 확인', '자세한 내용은 링크', '더 알아보기',
  '기사 참조', '본문 참고', '상세 내용은', '링크를 통해', '확인해 보세요',
  '확인할 수 있다', '확인 가능하다', '본문에 포함되지 않았으나'
];

async function main() {
  console.log('\n=== 전수 품질 감사: 원문 대조 ===\n');

  const { GmailFetcher } = require('../scripts/fetch_gmail');
  const { htmlToText, cleanNewsletterText } = require('../scripts/html_to_text');

  const newsletters = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'config', 'newsletters.json'), 'utf8')
  ).newsletters;
  const labels = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'config', 'labels.json'), 'utf8')
  ).labels;

  // Gmail 연결
  const fetcher = new GmailFetcher();
  await fetcher.authenticate();

  // 리포트 파일 로드
  const reportFiles = fs.readdirSync(REPORT_DIR)
    .filter(f => f.endsWith('.md') && !f.includes('통합'));

  let totalScore = { coverage: 0, accuracy: 0, quality: 0, banned: 0, completeness: 0 };
  let totalWeight = { coverage: 0, accuracy: 0, quality: 0, banned: 0, completeness: 0 };
  const labelResults = [];

  // 파이프라인이 처리한 동일 날짜 범위 사용 (custom 모드: 전일 10시~당일 10시)
  const dateStart = '2026/05/22';
  const dateEnd = '2026/05/24';

  for (const file of reportFiles) {
    const labelName = file.replace(/^\d+_/, '').replace('_메일정리.md', '');
    const label = labels.find(l => l.name === labelName);
    if (!label) continue;

    console.log(`\n━━━ ${labelName} 라벨 ━━━`);

    // 리포트 내용 파싱
    const reportContent = fs.readFileSync(path.join(REPORT_DIR, file), 'utf8');
    const reportItems = parseReportItems(reportContent);
    console.log(`  리포트 아이템: ${reportItems.length}개`);

    // Gmail에서 해당 라벨의 원문 메일 가져오기
    let originalMails = [];
    const origLog = console.log;
    console.log = () => {};
    try {
      const messages = await fetcher.listMessages({
        label: label.gmail_label || label.name,
        subLabels: label.sub_labels || [],
        dateStart, dateEnd, maxResults: 50
      });

      if (messages && messages.length > 0) {
        // 발신자별로 1통씩만 (중복 방지)
        const seenSenders = new Set();
        for (const msg of messages.slice(0, 30)) {
          try {
            const full = await fetcher.getMessage(msg.id);
            const headers = fetcher.extractHeaders(full);
            const from = headers.from || '';
            const senderEmail = from.match(/<([^>]+)>/)?.[1] || from.split(' ').pop();
            if (seenSenders.has(senderEmail)) continue;
            seenSenders.add(senderEmail);

            const htmlBody = fetcher.extractHtmlBody(full) || '';
            if (htmlBody.length < 50) continue;
            const text = cleanNewsletterText(htmlToText(htmlBody));
            if (text.length < 50) continue;

            const nl = newsletters.find(n => senderEmail.includes(n.sender) || n.sender.includes(senderEmail));
            originalMails.push({
              sender: senderEmail,
              name: nl?.name || from,
              subject: headers.subject,
              text,
              nlId: nl?.id
            });
          } catch {}
        }
      }
    } catch (e) {
      console.log = origLog;
      console.log(`  Gmail 오류: ${e.message.substring(0, 50)}`);
      continue;
    }
    console.log = origLog;

    console.log(`  원문 메일: ${originalMails.length}통`);

    if (originalMails.length === 0) {
      console.log(`  → 원문 없음, 건너뜀`);
      continue;
    }

    // === 1. 커버리지 평가 ===
    // 원문 메일의 핵심 키워드/제목이 리포트에 포함되어 있는지
    let coverageHits = 0;
    let coverageTotal = 0;
    const missingItems = [];

    // 비뉴스 메일 제외 (알림, 구독확인, notification 등)
    const NON_NEWS_SENDERS = ['noreply@redditmail.com', 'no-reply@substack.com'];

    for (const mail of originalMails) {
      // 비뉴스 발신자 제외
      if (NON_NEWS_SENDERS.some(s => mail.sender?.includes(s))) continue;

      // 원문에서 핵심 키워드 추출
      const keywords = extractKeywords(mail.subject + ' ' + mail.text.substring(0, 500));
      // 영문 뉴스레터: 고유명사로도 검색
      const englishNouns = (mail.subject || '').match(/[A-Z][a-zA-Z]{2,}/g) || [];
      const allSearchTerms = [...keywords, ...englishNouns];

      coverageTotal++;

      // 리포트에서 이 뉴스레터의 내용이 있는지 확인
      const found = allSearchTerms.some(kw => reportContent.includes(kw));
      if (found) {
        coverageHits++;
      } else {
        missingItems.push(`${mail.name}: "${mail.subject?.substring(0, 40)}"`);
      }
    }

    const coverageRate = coverageTotal > 0 ? coverageHits / coverageTotal : 1;
    console.log(`  커버리지: ${coverageHits}/${coverageTotal} (${Math.round(coverageRate * 100)}%)`);
    if (missingItems.length > 0) {
      missingItems.slice(0, 3).forEach(m => console.log(`    누락: ${m}`));
    }

    // === 2. 정확성 평가 ===
    // 리포트 아이템의 제목이 원문에서 찾을 수 있는지 (할루시네이션 체크)
    let accuracyHits = 0;
    const allOriginalText = originalMails.map(m => m.text).join('\n');

    // 영문 뉴스레터 감지: 본문의 처음 200자가 대부분 ASCII이면 영문
    const isTranslated = originalMails.some(m => {
      const sample = (m.text || '').substring(0, 200).replace(/\s+/g, '');
      const asciiCount = (sample.match(/[a-zA-Z0-9.,!?'":\-;()\[\]{}@#$%&*\/]/g) || []).length;
      return asciiCount > sample.length * 0.6;
    });

    for (const item of reportItems.slice(0, 50)) {
      const titleWords = item.title.split(/[\s,·]+/).filter(w => w.length > 2);

      if (isTranslated) {
        // 번역된 뉴스레터: 고유명사(영문), 숫자, 한국어 키워드로 매칭
        const properNouns = item.title.match(/[A-Z][a-zA-Z]+|\d+[%조억만원달러]?/g) || [];
        const summaryNouns = (item.summary || '').match(/[A-Z][a-zA-Z]+|\d+[%조억만원달러]?/g) || [];
        const allNouns = [...properNouns, ...summaryNouns];
        const matchCount = allNouns.filter(w => allOriginalText.toLowerCase().includes(w.toLowerCase())).length;
        if (matchCount >= 1 || allNouns.length === 0) {
          accuracyHits++;
        }
      } else {
        // 한국어 뉴스레터: 기존 로직
        const matchCount = titleWords.filter(w => allOriginalText.includes(w)).length;
        if (matchCount >= Math.min(2, titleWords.length)) {
          accuracyHits++;
        }
      }
    }
    const sampleSize = Math.min(reportItems.length, 50);
    const accuracyRate = sampleSize > 0 ? accuracyHits / sampleSize : 1;
    console.log(`  정확성: ${accuracyHits}/${sampleSize} (${Math.round(accuracyRate * 100)}%)`);

    // === 3. 요약 품질 ===
    let qualityScore = 0;
    let qualityTotal = 0;
    for (const item of reportItems) {
      qualityTotal++;
      const summaryLen = item.summary?.length || 0;
      if (summaryLen >= 200) qualityScore += 1.0;
      else if (summaryLen >= 100) qualityScore += 0.7;
      else if (summaryLen >= 30) qualityScore += 0.4;
      else qualityScore += 0.1;
    }
    const qualityRate = qualityTotal > 0 ? qualityScore / qualityTotal : 0;
    console.log(`  요약 품질: ${Math.round(qualityRate * 100)}%`);

    // === 4. 금지 표현 ===
    let bannedCount = 0;
    for (const phrase of BANNED_PHRASES) {
      bannedCount += (reportContent.match(new RegExp(phrase, 'g')) || []).length;
    }
    const bannedRate = bannedCount === 0 ? 1 : Math.max(0, 1 - bannedCount * 0.1);
    console.log(`  금지 표현: ${bannedCount}건 (${bannedCount === 0 ? '✓ 없음' : '⚠ 발견'})`);

    // 라벨 결과 저장
    const labelScore = {
      label: labelName,
      coverage: coverageRate,
      accuracy: accuracyRate,
      quality: qualityRate,
      banned: bannedRate,
      reportItems: reportItems.length,
      originalMails: originalMails.length,
      missingItems: missingItems.length,
      bannedCount
    };
    labelResults.push(labelScore);

    // 가중치 누적
    totalScore.coverage += coverageRate;
    totalScore.accuracy += accuracyRate;
    totalScore.quality += qualityRate;
    totalScore.banned += bannedRate;
    totalWeight.coverage++;
    totalWeight.accuracy++;
    totalWeight.quality++;
    totalWeight.banned++;
  }

  // === 5. 완결성 ===
  const enabledLabels = labels.filter(l => l.enabled).length;
  const processedLabels = reportFiles.length;
  const completenessRate = processedLabels / enabledLabels;

  // === 최종 점수 ===
  const avgCoverage = totalWeight.coverage > 0 ? totalScore.coverage / totalWeight.coverage : 0;
  const avgAccuracy = totalWeight.accuracy > 0 ? totalScore.accuracy / totalWeight.accuracy : 0;
  const avgQuality = totalWeight.quality > 0 ? totalScore.quality / totalWeight.quality : 0;
  const avgBanned = totalWeight.banned > 0 ? totalScore.banned / totalWeight.banned : 0;

  const finalScore = Math.round(
    avgCoverage * 25 +
    avgAccuracy * 25 +
    avgQuality * 20 +
    avgBanned * 15 +
    completenessRate * 15
  );

  console.log('\n' + '='.repeat(60));
  console.log('  전수 품질 감사 결과 (100점 만점)');
  console.log('='.repeat(60));
  console.log(`  1. 커버리지 (원문 누락 없음): ${Math.round(avgCoverage * 25)}/25 (${Math.round(avgCoverage * 100)}%)`);
  console.log(`  2. 정확성 (할루시네이션 없음): ${Math.round(avgAccuracy * 25)}/25 (${Math.round(avgAccuracy * 100)}%)`);
  console.log(`  3. 요약 품질 (구체성/길이): ${Math.round(avgQuality * 20)}/20 (${Math.round(avgQuality * 100)}%)`);
  console.log(`  4. 금지 표현 없음: ${Math.round(avgBanned * 15)}/15 (${Math.round(avgBanned * 100)}%)`);
  console.log(`  5. 완결성 (라벨 처리율): ${Math.round(completenessRate * 15)}/15 (${processedLabels}/${enabledLabels} 라벨)`);
  console.log(`\n  ★ 총점: ${finalScore}/100`);
  console.log('='.repeat(60));

  // 라벨별 상세
  console.log('\n  라벨별 상세:');
  for (const r of labelResults) {
    const lScore = Math.round(r.coverage * 25 + r.accuracy * 25 + r.quality * 20 + r.banned * 15) + Math.round(completenessRate * 15);
    console.log(`    ${r.label}: ${lScore}점 (커버${Math.round(r.coverage*100)}% 정확${Math.round(r.accuracy*100)}% 품질${Math.round(r.quality*100)}% 금지${r.bannedCount}건)`);
  }

  // 결과 저장
  const outputPath = path.join(PROJECT_ROOT, 'output', 'quality_audit_20260523.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    final_score: finalScore,
    breakdown: { coverage: Math.round(avgCoverage*25), accuracy: Math.round(avgAccuracy*25), quality: Math.round(avgQuality*20), banned: Math.round(avgBanned*15), completeness: Math.round(completenessRate*15) },
    label_results: labelResults
  }, null, 2), 'utf8');
  console.log(`\n  상세 결과: ${outputPath}`);
}

// === 유틸리티 함수 ===

function parseReportItems(md) {
  const items = [];
  const regex = /^## \d+\. (.+)$/gm;
  let match;
  while ((match = regex.exec(md)) !== null) {
    const title = match[1];
    const startIdx = match.index + match[0].length;
    const nextMatch = md.indexOf('\n## ', startIdx);
    const section = md.substring(startIdx, nextMatch > 0 ? nextMatch : md.length);
    // 요약 = 인사이트 전까지
    const insightIdx = section.indexOf('### ');
    const summary = insightIdx > 0 ? section.substring(0, insightIdx).trim() : section.trim();
    items.push({ title, summary });
  }
  return items;
}

function extractKeywords(text) {
  // 고유명사, 숫자+단위, 2글자 이상 명사 추출
  const words = text.split(/[\s,·\-:;()[\]{}'"]+/)
    .filter(w => w.length >= 2)
    .filter(w => /[가-힣]{2,}|[A-Z][a-z]+|[A-Z]{2,}|\d+[%조억만원달러]/.test(w));
  // 상위 5개 핵심 키워드
  return [...new Set(words)].slice(0, 5);
}

main().catch(e => { console.error(e); process.exit(1); });
