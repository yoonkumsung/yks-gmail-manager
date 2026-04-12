/**
 * reports/ 디렉토리의 모든 HTML 리포트를 나열하는 인덱스 페이지 생성
 *
 * 사용법:
 *   node scripts/generate_index_page.js                    # 기본: <repo>/docs 를 base로 사용 (하위 호환)
 *   node scripts/generate_index_page.js --base-dir <path>  # 지정한 디렉토리를 base로 사용
 *     (예: gh-pages 브랜치 worktree 경로)
 *
 * 출력: <base-dir>/index.html, <base-dir>/reports/index.html
 */

const fs = require('fs');
const path = require('path');

// CLI 인자 파싱: --base-dir <path>
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base-dir' && i + 1 < argv.length) {
      out.baseDir = argv[i + 1];
      i++;
    }
  }
  return out;
}

const cliArgs = parseArgs(process.argv.slice(2));
const REPO_ROOT = path.join(__dirname, '..');
const BASE_DIR = cliArgs.baseDir
  ? path.resolve(cliArgs.baseDir)
  : path.join(REPO_ROOT, 'docs');
const REPORTS_DIR = path.join(BASE_DIR, 'reports');
const INDEX_PATH = path.join(BASE_DIR, 'index.html');
const REPORTS_INDEX_PATH = path.join(REPORTS_DIR, 'index.html');

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function listReports() {
  if (!fs.existsSync(REPORTS_DIR)) return [];
  const files = fs.readdirSync(REPORTS_DIR)
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .sort()
    .reverse(); // 최신 우선

  return files.map(filename => {
    // 파일명에서 날짜 추출 (YYYY-MM-DD.html 또는 YYMMDD_*.html)
    let dateStr = filename.replace(/\.html$/, '');
    let displayDate = dateStr;

    const ymdMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const yymmddMatch = dateStr.match(/^(\d{2})(\d{2})(\d{2})/);

    if (ymdMatch) {
      displayDate = `${ymdMatch[1]}년 ${ymdMatch[2]}월 ${ymdMatch[3]}일`;
    } else if (yymmddMatch) {
      displayDate = `20${yymmddMatch[1]}년 ${yymmddMatch[2]}월 ${yymmddMatch[3]}일`;
    }

    return { filename, displayDate, dateStr };
  });
}

function generateIndexHtml(reports) {
  const yearGroups = {};
  for (const r of reports) {
    const year = r.dateStr.match(/^(\d{4})/)?.[1] || `20${r.dateStr.match(/^(\d{2})/)?.[1] || '26'}`;
    if (!yearGroups[year]) yearGroups[year] = [];
    yearGroups[year].push(r);
  }

  const sortedYears = Object.keys(yearGroups).sort().reverse();

  const sections = sortedYears.map(year => {
    const items = yearGroups[year].map(r => `
      <li>
        <a href="reports/${escapeHtml(r.filename)}">
          <span class="date">${escapeHtml(r.displayDate)}</span>
          <span class="arrow">→</span>
        </a>
      </li>
    `).join('');

    return `
      <section class="year-section">
        <h2>${escapeHtml(year)}년</h2>
        <ul class="report-list">${items}</ul>
      </section>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>YKS Newsletter Report</title>
  <style>
    :root {
      --primary: #2563eb;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #1e293b;
      --text-muted: #64748b;
      --border: #e2e8f0;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans KR', sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }
    header {
      text-align: center;
      margin-bottom: 3rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid var(--border);
    }
    h1 {
      font-size: 1.75rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
    }
    .subtitle {
      color: var(--text-muted);
      font-size: 0.9rem;
    }
    .empty {
      text-align: center;
      color: var(--text-muted);
      padding: 3rem;
    }
    .year-section {
      margin-bottom: 2.5rem;
    }
    .year-section h2 {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 0.75rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--border);
    }
    .report-list {
      list-style: none;
    }
    .report-list li {
      margin-bottom: 0.5rem;
    }
    .report-list a {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.875rem 1rem;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      text-decoration: none;
      color: var(--text);
      transition: all 0.15s;
    }
    .report-list a:hover {
      border-color: var(--primary);
      transform: translateX(2px);
    }
    .date {
      font-size: 0.95rem;
      font-weight: 500;
    }
    .arrow {
      color: var(--text-muted);
      font-size: 1.1rem;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0f172a;
        --card-bg: #1e293b;
        --text: #f1f5f9;
        --text-muted: #94a3b8;
        --border: #334155;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>YKS Newsletter Report</h1>
      <p class="subtitle">매일 자동으로 정리되는 뉴스 다이제스트</p>
    </header>
    ${reports.length === 0 ? '<p class="empty">아직 생성된 리포트가 없습니다.</p>' : sections}
  </div>
</body>
</html>`;
}

function main() {
  const reports = listReports();
  console.log(`리포트 ${reports.length}개 발견`);

  const html = generateIndexHtml(reports);
  fs.writeFileSync(INDEX_PATH, html, 'utf8');
  fs.writeFileSync(REPORTS_INDEX_PATH, html, 'utf8');
  console.log(`인덱스 생성: ${INDEX_PATH}`);
  console.log(`리포트 인덱스 생성: ${REPORTS_INDEX_PATH}`);
}

if (require.main === module) {
  main();
}

module.exports = { listReports, generateIndexHtml };
