/**
 * orchestrator.js 유틸리티/순수 함수 단위 테스트 (경로 A)
 * - parseArgs, calculateTimeRange, getLabels, printSummary
 * - generateRunId, formatKST, formatGmailDate, extractSenderEmail
 * - generateMarkdown, generateCombinedMarkdown
 * - checkSetup
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const orchestrator = require('../scripts/orchestrator');
const {
  parseArgs,
  calculateTimeRange,
  getLabels,
  printSummary,
  generateRunId,
  formatKST,
  formatGmailDate,
  extractSenderEmail,
  generateMarkdown,
  generateCombinedMarkdown,
  checkSetup
} = orchestrator._test;

module.exports = async function () {

  await describe('parseArgs', async () => {
    await it('기본값: schedule 모드, date/labels null', () => {
      const args = parseArgs([]);
      assert.equal(args.mode, 'schedule');
      assert.equal(args.date, null);
      assert.equal(args.labels, null);
    });

    await it('--mode today', () => {
      const args = parseArgs(['--mode', 'today']);
      assert.equal(args.mode, 'today');
    });

    await it('--mode custom --date 2026-05-31', () => {
      const args = parseArgs(['--mode', 'custom', '--date', '2026-05-31']);
      assert.equal(args.mode, 'custom');
      assert.equal(args.date, '2026-05-31');
    });

    await it('--labels IT,경제', () => {
      const args = parseArgs(['--labels', 'IT,경제']);
      assert.equal(args.labels, 'IT,경제');
    });

    await it('인자 순서 무관', () => {
      const args = parseArgs(['--labels', 'IT', '--mode', 'today', '--date', '2026-01-01']);
      assert.equal(args.mode, 'today');
      assert.equal(args.labels, 'IT');
      assert.equal(args.date, '2026-01-01');
    });

    await it('값 누락된 플래그 → 기본값 유지', () => {
      const args = parseArgs(['--mode']);
      assert.equal(args.mode, 'schedule');  // 기본값
    });

    await it('알 수 없는 플래그 → 무시', () => {
      const args = parseArgs(['--unknown', 'value', '--mode', 'today']);
      assert.equal(args.mode, 'today');
    });
  });

  await describe('calculateTimeRange', async () => {
    await it('schedule 모드: 전날 10:01 ~ 당일 10:00 KST', () => {
      const range = calculateTimeRange('schedule');
      const diffHours = (range.end - range.start) / (1000 * 60 * 60);
      assert.closeTo(diffHours, 24, 0.1);  // 약 24시간
    });

    await it('today 모드: 오늘 0시 ~ 현재', () => {
      const range = calculateTimeRange('today');
      assert.lt(range.start.getTime(), range.end.getTime());
      // 24시간 이내
      const diffHours = (range.end - range.start) / (1000 * 60 * 60);
      assert.lte(diffHours, 24);
    });

    await it('last-24h 모드: 정확히 24시간', () => {
      const range = calculateTimeRange('last-24h');
      const diffHours = (range.end - range.start) / (1000 * 60 * 60);
      assert.closeTo(diffHours, 24, 0.001);
    });

    await it('custom 모드: 전날 0:00 ~ 당일 23:59 (KST)', () => {
      const range = calculateTimeRange('custom', '2026-03-15');
      // KST 시작 = 2026-03-14T00:00:00+09:00
      // KST 종료 = 2026-03-15T23:59:59+09:00
      const diffHours = (range.end - range.start) / (1000 * 60 * 60);
      assert.closeTo(diffHours, 48, 0.01);  // 약 48시간
    });

    await it('custom 모드: 잘못된 날짜 형식 → throw', () => {
      assert.throws(() => calculateTimeRange('custom', '2026/03/15'));
      assert.throws(() => calculateTimeRange('custom', 'not-a-date'));
      assert.throws(() => calculateTimeRange('custom', ''));
      assert.throws(() => calculateTimeRange('custom', null));
    });

    await it('알 수 없는 모드 → schedule로 폴백 + 경고', () => {
      // console.warn 무음화
      const origWarn = console.warn;
      console.warn = () => {};
      try {
        const range = calculateTimeRange('unknown_mode');
        const diffHours = (range.end - range.start) / (1000 * 60 * 60);
        assert.closeTo(diffHours, 24, 0.1);
      } finally {
        console.warn = origWarn;
      }
    });
  });

  await describe('getLabels', async () => {
    await it('전체 활성 라벨 반환 (필터 없음)', () => {
      const labels = getLabels(null);
      assert.gt(labels.length, 0);
      labels.forEach(l => assert.equal(l.enabled, true));
    });

    await it('--labels 필터로 부분집합 반환', () => {
      const labels = getLabels('IT');
      assert.lengthOf(labels, 1);
      assert.equal(labels[0].name, 'IT');
    });

    await it('쉼표 구분 다중 필터', () => {
      const labels = getLabels('IT,경제');
      assert.lengthOf(labels, 2);
      const names = labels.map(l => l.name);
      assert.includes(names, 'IT');
      assert.includes(names, '경제');
    });

    await it('존재하지 않는 라벨 필터 → 빈 배열', () => {
      const labels = getLabels('존재하지않는라벨');
      assert.lengthOf(labels, 0);
    });

    await it('비활성 라벨(enabled: false)은 제외', () => {
      const labels = getLabels(null);
      const names = labels.map(l => l.name);
      // 쇼핑결제는 enabled: false (지원사업은 활성화됨)
      assert.notIncludes(names, '쇼핑결제');
    });
  });

  await describe('printSummary', async () => {
    let logs = [];
    let origLog;

    beforeEach(() => {
      logs = [];
      origLog = console.log;
      console.log = (...args) => logs.push(args.join(' '));
    });

    afterEach(() => {
      console.log = origLog;
    });

    await it('성공/실패/총 아이템 카운트 출력', () => {
      const results = [
        { label: 'IT', success: true, messageCount: 10, itemCount: 50, newNewsletters: [] },
        { label: '경제', success: true, messageCount: 5, itemCount: 20, newNewsletters: [] },
        { label: '시사', success: false, error: 'timeout' }
      ];
      printSummary(results);
      const output = logs.join('\n');
      assert.includes(output, '성공: 2개 라벨');
      assert.includes(output, '실패: 1개 라벨');
      assert.includes(output, '총 아이템: 70개');  // 50 + 20
    });

    await it('새 뉴스레터 목록 출력', () => {
      const results = [
        { label: 'IT', success: true, itemCount: 0,
          newNewsletters: [{ name: 'New', sender: 'new@x.com' }] }
      ];
      printSummary(results);
      const output = logs.join('\n');
      assert.includes(output, 'New');
      assert.includes(output, 'new@x.com');
    });

    await it('실패한 라벨 에러 메시지 출력', () => {
      const results = [
        { label: 'IT', success: false, error: 'rate limit exceeded' }
      ];
      printSummary(results);
      const output = logs.join('\n');
      assert.includes(output, 'IT: rate limit exceeded');
    });

    await it('빈 결과 → 0개 출력', () => {
      printSummary([]);
      const output = logs.join('\n');
      assert.includes(output, '성공: 0개 라벨');
      assert.includes(output, '총 아이템: 0개');
    });
  });

  await describe('generateRunId', async () => {
    await it('timeRange.end 기준 YYYYMMDD (KST)', () => {
      const end = new Date('2026-03-15T01:00:00Z');  // UTC 1시 = KST 10시
      const runId = generateRunId({ end });
      assert.equal(runId, '20260315');
    });

    await it('UTC 자정 직전 → KST 다음 날', () => {
      const end = new Date('2026-03-14T15:30:00Z');  // UTC 15:30 = KST 00:30 (15일)
      const runId = generateRunId({ end });
      assert.equal(runId, '20260315');
    });

    await it('timeRange 없으면 현재 시각 기준', () => {
      const runId = generateRunId(null);
      assert.match(runId, /^\d{8}$/);
    });
  });

  await describe('formatKST', async () => {
    await it('UTC → KST(+9h) 포맷', () => {
      const utc = new Date('2026-03-15T01:00:00Z');
      assert.equal(formatKST(utc), '2026-03-15 10:00:00 KST');
    });

    await it('자정 처리', () => {
      const utc = new Date('2026-03-14T15:00:00Z');
      assert.equal(formatKST(utc), '2026-03-15 00:00:00 KST');
    });
  });

  await describe('formatGmailDate', async () => {
    await it('Date → YYYY/MM/DD', () => {
      const d = new Date(2026, 2, 15);  // 2026-03-15 (월은 0-base)
      assert.equal(formatGmailDate(d), '2026/03/15');
    });

    await it('한 자릿수 월/일 zero-pad', () => {
      const d = new Date(2026, 0, 5);  // 1월 5일
      assert.equal(formatGmailDate(d), '2026/01/05');
    });
  });

  await describe('extractSenderEmail', async () => {
    await it('"Name <email>" 형식', () => {
      assert.equal(extractSenderEmail('John <john@example.com>'), 'john@example.com');
    });

    await it('이메일만 있는 경우', () => {
      assert.equal(extractSenderEmail('plain@example.com'), 'plain@example.com');
    });

    await it('null/undefined → null', () => {
      assert.equal(extractSenderEmail(null), null);
      assert.equal(extractSenderEmail(undefined), null);
    });

    await it('한글 이름 포함', () => {
      assert.equal(extractSenderEmail('"홍길동" <hong@x.com>'), 'hong@x.com');
    });

    await it('빈 < > → trim된 원본', () => {
      assert.equal(extractSenderEmail('  spaced  '), 'spaced');
    });
  });

  await describe('generateMarkdown', async () => {
    const date = new Date('2026-03-15T01:00:00Z');

    await it('빈 items → 기본 헤더만', () => {
      const md = generateMarkdown({ label: 'IT', items: [] }, date);
      assert.includes(md, '# IT 메일 정리');
      assert.includes(md, '총 0개 아이템');
    });

    await it('일반 뉴스레터 (< 30개) → ## 헤더 + 요약 + 키워드 + 링크', () => {
      const merged = {
        label: 'IT',
        items: [
          { title: '제목1', summary: '요약1', keywords: ['k1', 'k2'], link: 'https://x.com/1' }
        ]
      };
      const md = generateMarkdown(merged, date);
      assert.includes(md, '## 1. 제목1');
      assert.includes(md, '요약1');
      assert.includes(md, '#k1 #k2');
      assert.includes(md, '[원문 보기](https://x.com/1)');
    });

    await it('링크 없으면 [원문 보기] 표시 안 함', () => {
      const merged = {
        label: 'IT',
        items: [{ title: 'T', summary: 'S', keywords: [], link: '' }]
      };
      const md = generateMarkdown(merged, date);
      assert.notIncludes(md, '원문 보기');
    });

    await it('목록형 뉴스레터 감지 (30개+, 짧은 요약) → 토글 + 클러스터', () => {
      const items = Array.from({ length: 35 }, (_, i) => ({
        title: `짧은 뉴스 ${i}`,
        summary: `${i}자`,  // 매우 짧음
        keywords: [`k${i % 5}`],
        link: `https://x.com/${i}`
      }));
      const md = generateMarkdown({ label: '뉴스', items }, date);
      assert.includes(md, '<details>');
      assert.includes(md, '전체 목록 펼치기 (35건)');
      assert.includes(md, '이번 호 주요 동향');
    });

    await it('KST 날짜 포맷 적용', () => {
      const md = generateMarkdown({ label: 'IT', items: [] }, new Date('2026-03-15T01:00:00Z'));
      assert.includes(md, '2026-03-15');  // KST 날짜
    });
  });

  await describe('generateCombinedMarkdown', async () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = path.join(os.tmpdir(), `combined-md-${Date.now()}`);
      fs.mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    });

    await it('빈 mergedDir → 빈 문자열', () => {
      const md = generateCombinedMarkdown(tmpDir, new Date());
      assert.equal(md, '');
    });

    await it('정상 merged 파일 통합', () => {
      fs.writeFileSync(path.join(tmpDir, 'merged_IT.json'), JSON.stringify({
        label: 'IT', items: [{ title: 'A', summary: 'sA', keywords: ['k'] }]
      }));
      fs.writeFileSync(path.join(tmpDir, 'merged_경제.json'), JSON.stringify({
        label: '경제', items: [{ title: 'B', summary: 'sB', keywords: [] }]
      }));

      const md = generateCombinedMarkdown(tmpDir, new Date());
      assert.includes(md, '# 전체 메일 정리');
      assert.includes(md, '총 2개 아이템');
      assert.includes(md, '# IT');
      assert.includes(md, '# 경제');
      assert.includes(md, '## 1. A');
      assert.includes(md, '## 1. B');
    });

    await it('손상된 merged 파일 1개는 건너뛰고 나머지 처리', () => {
      // 정상 파일
      fs.writeFileSync(path.join(tmpDir, 'merged_IT.json'), JSON.stringify({
        label: 'IT', items: [{ title: 'A', summary: 'sA', keywords: [] }]
      }));
      // 손상된 파일
      fs.writeFileSync(path.join(tmpDir, 'merged_BROKEN.json'), '{"label": "BROKEN", ...');

      // console.warn 무음
      const origWarn = console.warn;
      console.warn = () => {};
      try {
        const md = generateCombinedMarkdown(tmpDir, new Date());
        // 손상 파일은 건너뛰고 IT는 정상 처리
        assert.includes(md, '# IT');
        assert.notIncludes(md, 'BROKEN');
      } finally {
        console.warn = origWarn;
      }
    });

    await it('모든 파일이 손상 → 빈 문자열', () => {
      fs.writeFileSync(path.join(tmpDir, 'merged_A.json'), 'broken');
      fs.writeFileSync(path.join(tmpDir, 'merged_B.json'), 'also broken');

      const origWarn = console.warn;
      console.warn = () => {};
      try {
        const md = generateCombinedMarkdown(tmpDir, new Date());
        assert.equal(md, '');
      } finally {
        console.warn = origWarn;
      }
    });

    await it('merged_로 시작 안 하는 파일은 무시', () => {
      fs.writeFileSync(path.join(tmpDir, 'other_file.json'), '{}');
      fs.writeFileSync(path.join(tmpDir, 'merged_IT.json'), JSON.stringify({
        label: 'IT', items: [{ title: 'A', summary: 'sA' }]
      }));
      const md = generateCombinedMarkdown(tmpDir, new Date());
      assert.includes(md, '# IT');
      assert.includes(md, '총 1개 아이템');
    });
  });

  await describe('checkSetup', async () => {
    await it('함수 호출 시 ok/errors 구조 반환', () => {
      const result = checkSetup();
      assert.type(result.ok, 'boolean');
      assert.ok(Array.isArray(result.errors));
    });

    await it('errors 각 항목은 {type, message, solution} 형태', () => {
      const result = checkSetup();
      result.errors.forEach(e => {
        assert.ok(e.type);
        assert.ok(e.message);
        assert.ok(e.solution);
      });
    });
  });
};
