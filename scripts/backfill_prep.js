/**
 * 백필 prep: 특정 리포트 날짜의 메일을 fetch → 텍스트화 → 원문크롤링하여 clean_*.json 생성.
 * LLM 미사용. 추출은 별도 단계(Haiku 서브에이전트)에서 수행.
 *
 * 윈도우: 스케줄 모드와 동일하게 (D-1) 09:01 ~ D 09:00 KST (연속 날짜 타일링, 중복/누락 방지)
 * 출력: output/backfill/<YYYYMMDD>/labels/<label>/{raw,clean}/
 *
 * 사용법: node scripts/backfill_prep.js 2026-05-30
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const fs = require('fs');
const orch = require('./orchestrator')._test;

const date = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
  console.error('usage: node scripts/backfill_prep.js YYYY-MM-DD');
  process.exit(1);
}

const [y, m, d] = date.split('-').map(Number);
const prev = new Date(Date.UTC(y, m - 1, d));
prev.setUTCDate(prev.getUTCDate() - 1);
const pad = n => String(n).padStart(2, '0');
const prevStr = `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`;
const timeRange = {
  start: new Date(`${prevStr}T09:01:00+09:00`),
  end: new Date(`${date}T09:00:00+09:00`)
};
const runId = date.replace(/-/g, '');
const baseDir = path.join(__dirname, '..', 'output', 'backfill', runId);
const labels = orch.getLabels(null);

console.log(`백필 prep: ${date} (윈도우 ${prevStr} 09:01 ~ ${date} 09:00 KST)`);
console.log(`출력: ${baseDir}\n`);

(async () => {
  const summary = [];
  for (const label of labels) {
    const labelDir = path.join(baseDir, 'labels', label.name);
    const rawDir = path.join(labelDir, 'raw');
    const cleanDir = path.join(labelDir, 'clean');
    fs.mkdirSync(rawDir, { recursive: true });
    fs.mkdirSync(cleanDir, { recursive: true });

    process.stdout.write(`[${label.name}] fetch...`);
    await orch.fetchGmailMessages(label, timeRange, rawDir);
    const raws = fs.readdirSync(rawDir).filter(f => f.startsWith('msg_'));
    process.stdout.write(` raw ${raws.length}`);

    if (raws.length > 0) {
      process.stdout.write(` → clean/crawl...`);
      await orch.convertHtmlToText(rawDir, cleanDir);
    }
    const cleans = fs.readdirSync(cleanDir).filter(f => f.startsWith('clean_'));
    console.log(` clean ${cleans.length}`);
    summary.push({ label: label.name, raw: raws.length, clean: cleans.length });
  }

  const totalClean = summary.reduce((s, x) => s + x.clean, 0);
  console.log(`\nPREP DONE — 총 clean ${totalClean}개`);
  console.log(JSON.stringify(summary));
})().catch(e => { console.error('\nPREP ERROR:', e.stack); process.exit(1); });
