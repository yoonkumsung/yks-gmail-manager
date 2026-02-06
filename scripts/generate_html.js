/**
 * Markdown + Final JSON을 HTML 리포트로 변환
 *
 * 사용법: node scripts/generate_html.js <final_json_path> <output_html_path>
 *
 * 브라우저에서 바로 열 수 있는 스타일링된 HTML 리포트를 생성합니다.
 */

const fs = require('fs');
const path = require('path');

/**
 * HTML 템플릿 생성
 */
function generateHtmlReport(finalData, label, date) {
  const items = finalData.items || [];
  const stats = finalData.stats || {};

  // 기사 HTML 생성
  const itemsHtml = items.map((item, index) => {
    const isLongform = item.is_longform;

    // Gmail 메일 링크 생성 (item_id에서 message_id 추출)
    const messageId = item.item_id ? item.item_id.split('_')[0] : null;
    const gmailUrl = messageId ? `https://mail.google.com/mail/u/0/#all/${messageId}` : null;

    // 키워드 태그
    const keywordTags = (item.keywords || [])
      .slice(0, 5)
      .map(kw => `<span class="tag">${escapeHtml(kw)}</span>`)
      .join('');

    // 장문 원문 (있는 경우)
    const longformSection = isLongform && item.original_text ? `
      <details class="longform">
        <summary>원문 보기</summary>
        <div class="original-text">${escapeHtml(item.original_text).replace(/\n/g, '<br>')}</div>
      </details>
    ` : '';

    // 원문 링크 버튼
    const articleLink = item.link ? `
      <a href="${escapeHtml(item.link)}" target="_blank" class="link-btn article-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
        원문 보기
      </a>
    ` : '';

    // Gmail 링크 버튼
    const gmailLink = gmailUrl ? `
      <a href="${escapeHtml(gmailUrl)}" target="_blank" class="link-btn gmail-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
          <polyline points="22,6 12,13 2,6"></polyline>
        </svg>
        Gmail
      </a>
    ` : '';

    const linkButtons = (articleLink || gmailLink) ? `${articleLink}${gmailLink}` : '<span class="no-link">링크 없음</span>';

    return `
      <article class="item ${isLongform ? 'longform-item' : ''}">
        <div class="item-header">
          <h3 class="item-title">
            ${isLongform ? '<span class="badge longform-badge">장문</span>' : ''}
            ${escapeHtml(item.title)}
          </h3>
          <span class="item-number">#${index + 1}</span>
        </div>
        <p class="item-summary">${escapeHtml(item.summary)}</p>
        <div class="item-meta">
          <div class="keywords">${keywordTags}</div>
          <div class="links">${linkButtons}</div>
        </div>
        ${longformSection}
      </article>
    `;
  }).join('\n');

  // 통계 섹션
  const statsHtml = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${items.length}</div>
        <div class="stat-label">총 기사</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.total_messages || 0}</div>
        <div class="stat-label">처리된 메일</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.merged_count || 0}</div>
        <div class="stat-label">병합된 중복</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${items.filter(i => i.is_longform).length}</div>
        <div class="stat-label">장문 기사</div>
      </div>
    </div>
  `;

  // 전체 HTML
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(label)} 뉴스 다이제스트 - ${date}</title>
  <style>
    :root {
      --primary: #2563eb;
      --primary-light: #3b82f6;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #1e293b;
      --text-muted: #64748b;
      --border: #e2e8f0;
      --success: #10b981;
      --warning: #f59e0b;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans KR', sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem 1rem;
    }

    header {
      text-align: center;
      margin-bottom: 2rem;
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
      font-size: 0.95rem;
    }

    .label-badge {
      display: inline-block;
      background: var(--primary);
      color: white;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.875rem;
      font-weight: 500;
      margin-bottom: 0.5rem;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.25rem;
      text-align: center;
    }

    .stat-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--primary);
    }

    .stat-label {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }

    .items-section h2 {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 1rem;
      color: var(--text-muted);
    }

    .item {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1rem;
      transition: box-shadow 0.2s;
    }

    .item:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    }

    .longform-item {
      border-left: 4px solid var(--warning);
    }

    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.75rem;
    }

    .item-title {
      font-size: 1.1rem;
      font-weight: 600;
      line-height: 1.4;
      flex: 1;
    }

    .item-number {
      color: var(--text-muted);
      font-size: 0.8rem;
      font-weight: 500;
      margin-left: 1rem;
    }

    .badge {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      margin-right: 0.5rem;
    }

    .longform-badge {
      background: #fef3c7;
      color: #92400e;
    }

    .item-summary {
      color: var(--text);
      font-size: 0.95rem;
      margin-bottom: 1rem;
      white-space: pre-wrap;
    }

    .item-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .keywords {
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
    }

    .tag {
      background: #f1f5f9;
      color: var(--text-muted);
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
    }

    .link-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      background: var(--primary);
      color: white;
      padding: 0.375rem 0.75rem;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 500;
      text-decoration: none;
      transition: background 0.2s;
    }

    .link-btn:hover {
      background: var(--primary-light);
    }

    .no-link {
      color: var(--text-muted);
      font-size: 0.8rem;
    }

    .longform {
      margin-top: 1rem;
      border-top: 1px solid var(--border);
      padding-top: 1rem;
    }

    .longform summary {
      cursor: pointer;
      color: var(--primary);
      font-size: 0.875rem;
      font-weight: 500;
    }

    .longform summary:hover {
      text-decoration: underline;
    }

    .original-text {
      margin-top: 1rem;
      padding: 1rem;
      background: #f8fafc;
      border-radius: 8px;
      font-size: 0.9rem;
      color: var(--text-muted);
      max-height: 400px;
      overflow-y: auto;
    }

    footer {
      text-align: center;
      padding: 2rem;
      color: var(--text-muted);
      font-size: 0.8rem;
      border-top: 1px solid var(--border);
      margin-top: 2rem;
    }

    @media (max-width: 640px) {
      .container {
        padding: 1rem;
      }

      .item {
        padding: 1rem;
      }

      .item-meta {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <span class="label-badge">${escapeHtml(label)}</span>
      <h1>뉴스 다이제스트</h1>
      <p class="subtitle">${date} 생성</p>
    </header>

    <section class="stats-section">
      ${statsHtml}
    </section>

    <section class="items-section">
      <h2>정리된 기사</h2>
      ${itemsHtml}
    </section>

    <footer>
      Gmail Manager &mdash; Claude Code로 생성됨
    </footer>
  </div>
</body>
</html>`;
}

/**
 * HTML 이스케이프
 */
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Final JSON에서 HTML 생성
 */
function generateFromFinalJson(finalJsonPath, outputPath) {
  if (!fs.existsSync(finalJsonPath)) {
    throw new Error(`파일을 찾을 수 없습니다: ${finalJsonPath}`);
  }

  const finalData = JSON.parse(fs.readFileSync(finalJsonPath, 'utf8'));
  const label = finalData.label || path.basename(finalJsonPath, '.json').replace('final_', '');
  const date = finalData.date || new Date().toISOString().split('T')[0];

  const html = generateHtmlReport(finalData, label, date);

  fs.writeFileSync(outputPath, html, 'utf8');
  console.log(`HTML 리포트 생성됨: ${outputPath}`);

  return outputPath;
}

/**
 * 통합 HTML 리포트 생성 (모든 라벨 포함)
 */
function generateCombinedHtmlReport(allLabelsData, date) {
  // 라벨별 탭 버튼 생성
  const tabButtons = allLabelsData.map((data, index) => {
    const isActive = index === 0 ? 'active' : '';
    const itemCount = data.items?.length || 0;
    return `<button class="tab-btn ${isActive}" data-tab="${data.label}">${escapeHtml(data.label)}<span class="count">${itemCount}</span></button>`;
  }).join('\n');

  // 라벨별 콘텐츠 생성
  const tabContents = allLabelsData.map((data, index) => {
    const isActive = index === 0 ? 'active' : '';
    const items = data.items || [];
    // 라벨명을 ID에 사용 (특수문자 제거)
    const labelId = data.label.replace(/[^a-zA-Z0-9가-힣]/g, '');

    const itemsHtml = items.map((item, itemIndex) => {
      const keywordTags = (item.keywords || [])
        .slice(0, 5)
        .map(kw => `<span class="tag">${escapeHtml(kw)}</span>`)
        .join('');

      // 고유 ID 생성 (라벨명 + 인덱스)
      const uniqueId = `${labelId}-${itemIndex}`;

      // 인사이트 데이터 준비
      const hasDomainInsight = item.insights?.domain?.content;
      const hasCrossInsight = item.insights?.cross_domain?.content;

      // 버튼 행 (항상 한 줄 유지)
      const domainBtnHtml = hasDomainInsight ? `
        <button class="action-btn insight-btn domain-btn" data-target="domain-${uniqueId}">실용적 인사이트</button>
      ` : '';

      const crossBtnHtml = hasCrossInsight ? `
        <button class="action-btn insight-btn cross-btn" data-target="cross-${uniqueId}">확장 인사이트</button>
      ` : '';

      // 원문 보기 버튼 (원문 링크 없으면 Gmail 링크로 fallback)
      const gmailUrl = item.message_id ? `https://mail.google.com/mail/u/0/#all/${item.message_id}` : null;
      let articleLinkHtml = '';
      if (item.link) {
        articleLinkHtml = `<a href="${escapeHtml(item.link)}" target="_blank" class="action-btn article-btn">원문 보기</a>`;
      } else if (gmailUrl) {
        // 원문 링크 없을 때만 Gmail 버튼 표시 (해당 뉴스레터로 이동)
        articleLinkHtml = `<a href="${escapeHtml(gmailUrl)}" target="_blank" class="action-btn gmail-btn" title="본인 Gmail에서만 열립니다">Gmail에서 보기</a>`;
      }

      // 버튼 행 (버튼만, 펼침 영역 분리)
      const hasButtons = domainBtnHtml || crossBtnHtml || articleLinkHtml;
      const buttonsHtml = hasButtons ? `
        <div class="action-buttons">
          ${domainBtnHtml}
          ${crossBtnHtml}
          ${articleLinkHtml}
        </div>
      ` : '';

      // 인사이트 내용 영역 (버튼 아래 별도 영역)
      const domainContentHtml = hasDomainInsight ? `
        <div class="insight-content domain-content" id="domain-${uniqueId}" style="display:none;">
          <div class="insight-header">
            <span class="insight-label domain-label">실용적 인사이트</span>
            <button class="insight-close" data-target="domain-${uniqueId}">&times;</button>
          </div>
          <p>${escapeHtml(item.insights.domain.content)}</p>
        </div>
      ` : '';

      const crossContentHtml = hasCrossInsight ? `
        <div class="insight-content cross-content" id="cross-${uniqueId}" style="display:none;">
          <div class="insight-header">
            <span class="insight-label cross-label">확장 인사이트</span>
            <button class="insight-close" data-target="cross-${uniqueId}">&times;</button>
          </div>
          <p>${escapeHtml(item.insights.cross_domain.content)}</p>
        </div>
      ` : '';

      const insightContentsHtml = (domainContentHtml || crossContentHtml) ? `
        <div class="insight-contents">
          ${domainContentHtml}
          ${crossContentHtml}
        </div>
      ` : '';

      return `
        <article class="item">
          <div class="item-header">
            <h3 class="item-title">${escapeHtml(item.title)}</h3>
            <span class="item-number">#${itemIndex + 1}</span>
          </div>
          <p class="item-summary">${escapeHtml(item.summary)}</p>
          <div class="keywords">${keywordTags}</div>
          ${buttonsHtml}
          ${insightContentsHtml}
        </article>
      `;
    }).join('\n');

    return `
      <div class="tab-content ${isActive}" id="tab-${data.label}">
        <div class="label-stats">
          <span class="stat">기사 ${items.length}개</span>
          ${data.stats?.duplicates_removed ? `<span class="stat">중복 제거 ${data.stats.duplicates_removed}개</span>` : ''}
        </div>
        <div class="items-list">
          ${itemsHtml || '<p class="no-items">기사이 없습니다.</p>'}
        </div>
      </div>
    `;
  }).join('\n');

  // 총 기사 수 계산
  const totalItems = allLabelsData.reduce((sum, data) => sum + (data.items?.length || 0), 0);
  const labelCount = allLabelsData.length;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>메일 정리 - ${date}</title>
  <style>
    :root {
      --primary: #2563eb;
      --primary-light: #3b82f6;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #1e293b;
      --text-muted: #64748b;
      --border: #e2e8f0;
      --success: #10b981;
      --domain: #8b5cf6;
      --cross: #f59e0b;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans KR', sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }

    /* 헤더 - 고정 */
    .header-container {
      position: sticky;
      top: 0;
      background: var(--bg);
      z-index: 100;
      border-bottom: 1px solid var(--border);
    }

    .header-inner {
      max-width: 900px;
      margin: 0 auto;
      padding: 0.75rem 1rem;
    }

    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    .header-title {
      font-size: 1.1rem;
      font-weight: 700;
    }

    .header-meta {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .badge {
      display: inline-block;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 500;
    }

    .badge-date {
      background: var(--border);
      color: var(--text-muted);
    }

    .badge-count {
      background: var(--primary);
      color: white;
    }

    /* 탭 - 가로 스크롤 */
    .tabs-wrapper {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    .tabs-wrapper::-webkit-scrollbar {
      display: none;
    }

    .tabs {
      display: flex;
      gap: 0.5rem;
      padding-bottom: 0.5rem;
      min-width: max-content;
    }

    .tab-btn {
      padding: 0.5rem 0.875rem;
      border: none;
      border-radius: 20px;
      background: var(--card-bg);
      color: var(--text-muted);
      font-size: 0.8rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }

    .tab-btn:hover {
      background: var(--border);
    }

    .tab-btn.active {
      background: var(--primary);
      color: white;
    }

    .tab-btn .count {
      display: inline-block;
      margin-left: 0.25rem;
      padding: 0.1rem 0.4rem;
      background: rgba(255,255,255,0.2);
      border-radius: 10px;
      font-size: 0.7rem;
    }

    .tab-btn.active .count {
      background: rgba(255,255,255,0.3);
    }

    /* 메인 콘텐츠 */
    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 1rem;
    }

    .tab-content {
      display: none;
      animation: fadeIn 0.2s ease;
    }

    .tab-content.active {
      display: block;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .label-stats {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
      padding: 0.6rem 0.75rem;
      background: var(--card-bg);
      border-radius: 8px;
      border: 1px solid var(--border);
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .item {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1rem;
      margin-bottom: 0.75rem;
      transition: box-shadow 0.2s;
    }

    .item:active {
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }

    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.5rem;
    }

    .item-title {
      font-size: 0.95rem;
      font-weight: 600;
      flex: 1;
      line-height: 1.4;
    }

    .item-number {
      color: var(--text-muted);
      font-size: 0.7rem;
      margin-left: 0.5rem;
      flex-shrink: 0;
    }

    .item-summary {
      font-size: 0.875rem;
      margin-bottom: 0.75rem;
      white-space: pre-wrap;
      color: var(--text);
      line-height: 1.6;
    }

    .keywords { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-bottom: 0.75rem; }
    .tag {
      background: #f1f5f9;
      color: var(--text-muted);
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      font-size: 0.7rem;
    }

    /* 버튼 행 - 항상 한 줄 유지 */
    .action-buttons {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.75rem;
    }

    .action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.5rem 0.875rem;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 500;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
      flex: 1;
      min-width: 0;
      text-align: center;
    }

    .article-btn {
      background: var(--primary);
      color: white;
    }

    .article-btn:hover {
      background: var(--primary-light);
    }

    .gmail-btn {
      background: #ea4335;
      color: white;
    }

    .gmail-btn:hover {
      background: #d33426;
    }

    .insight-btn {
      border: 1px solid var(--border);
      background: var(--card-bg);
    }

    .domain-btn {
      color: var(--domain);
      border-color: var(--domain);
      background: #f5f3ff;
    }

    .domain-btn:hover, .domain-btn.active {
      background: #ede9fe;
    }

    .cross-btn {
      color: #b45309;
      border-color: #f59e0b;
      background: #fffbeb;
    }

    .cross-btn:hover, .cross-btn.active {
      background: #fef3c7;
    }

    /* 인사이트 내용 영역 - 버튼 아래 별도 표시 */
    .insight-contents {
      margin-top: 0.75rem;
    }

    .insight-content {
      padding: 0.75rem;
      border-radius: 8px;
      font-size: 0.85rem;
      line-height: 1.6;
      margin-bottom: 0.5rem;
      animation: slideDown 0.2s ease;
    }

    @keyframes slideDown {
      from { opacity: 0; max-height: 0; }
      to { opacity: 1; max-height: 500px; }
    }

    .insight-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .insight-label {
      font-weight: 600;
      font-size: 0.75rem;
    }

    .domain-label { color: var(--domain); }
    .cross-label { color: #b45309; }

    .insight-close {
      background: none;
      border: none;
      font-size: 1.2rem;
      cursor: pointer;
      color: var(--text-muted);
      padding: 0 0.25rem;
      line-height: 1;
    }

    .insight-close:hover {
      color: var(--text);
    }

    .domain-content {
      background: #faf5ff;
      border: 1px solid #e9d5ff;
    }

    .cross-content {
      background: #fffbeb;
      border: 1px solid #fde68a;
    }

    .no-items { color: var(--text-muted); text-align: center; padding: 2rem; }

    /* 반응형 - 모바일 */
    @media (max-width: 640px) {
      .header-inner {
        padding: 0.5rem 0.75rem;
      }

      .header-title {
        font-size: 1rem;
      }

      .badge {
        font-size: 0.65rem;
        padding: 0.15rem 0.4rem;
      }

      .tab-btn {
        padding: 0.4rem 0.7rem;
        font-size: 0.75rem;
      }

      .container {
        padding: 0.75rem;
      }

      .item {
        padding: 0.875rem;
        margin-bottom: 0.5rem;
        border-radius: 10px;
      }

      .item-title {
        font-size: 0.9rem;
      }

      .item-summary {
        font-size: 0.8rem;
      }

      .tag {
        font-size: 0.65rem;
      }

      .insight-content {
        padding: 0.6rem;
        font-size: 0.8rem;
      }

      .label-stats {
        padding: 0.5rem;
        font-size: 0.75rem;
      }

      /* 모바일에서도 버튼 한 줄 유지 */
      .action-buttons {
        flex-wrap: nowrap;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }

      .action-btn {
        flex: 0 0 auto;
        min-width: auto;
        padding: 0.5rem 0.65rem;
        font-size: 0.7rem;
        white-space: nowrap;
      }
    }

    /* 태블릿 */
    @media (min-width: 641px) and (max-width: 1024px) {
      .container {
        padding: 1rem;
      }
    }

    /* 다크모드 지원 (시스템 설정 따름) */
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0f172a;
        --card-bg: #1e293b;
        --text: #f1f5f9;
        --text-muted: #94a3b8;
        --border: #334155;
        --domain: #a78bfa;
        --cross: #fbbf24;
      }

      .tag {
        background: #334155;
        color: #cbd5e1;
      }

      .domain-content {
        background: #1e1b4b;
        border-color: #4c1d95;
      }

      .cross-content {
        background: #292524;
        border-color: #78350f;
      }

      .domain-btn {
        background: #1e1b4b;
        color: var(--domain);
        border-color: var(--domain);
      }

      .domain-btn:hover, .domain-btn.active {
        background: #2e1065;
      }

      .cross-btn {
        background: #292524;
        color: var(--cross);
        border-color: var(--cross);
      }

      .cross-btn:hover, .cross-btn.active {
        background: #3f3f3f;
      }

      .article-btn {
        background: #1d4ed8;
      }

      .gmail-btn {
        background: #b91c1c;
      }

      .label-stats {
        background: var(--card-bg);
        border-color: var(--border);
      }

      .insight-close {
        color: #94a3b8;
      }

      .insight-close:hover {
        color: #f1f5f9;
      }
    }
  </style>
</head>
<body>
  <!-- 고정 헤더 -->
  <header class="header-container">
    <div class="header-inner">
      <div class="header-top">
        <span class="header-title">메일 정리</span>
        <div class="header-meta">
          <span class="badge badge-date">${date}</span>
          <span class="badge badge-count">${totalItems}개</span>
        </div>
      </div>
      <div class="tabs-wrapper">
        <nav class="tabs">
          ${tabButtons}
        </nav>
      </div>
    </div>
  </header>

  <!-- 메인 콘텐츠 -->
  <main class="container">
    ${tabContents}
  </main>

  <script>
    // 탭 전환
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');

        // 스크롤 위치 초기화
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    // 탭 버튼을 뷰포트에 보이도록 스크롤
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      });
    });

    // 인사이트 버튼 토글
    document.querySelectorAll('.insight-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const content = document.getElementById(targetId);
        if (content) {
          const isVisible = content.style.display !== 'none';
          content.style.display = isVisible ? 'none' : 'block';
          btn.classList.toggle('active', !isVisible);
        }
      });
    });

    // 인사이트 닫기 버튼
    document.querySelectorAll('.insight-close').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const content = document.getElementById(targetId);
        if (content) {
          content.style.display = 'none';
          // 해당 버튼의 active 클래스 제거
          const toggleBtn = document.querySelector('[data-target="' + targetId + '"].insight-btn');
          if (toggleBtn) toggleBtn.classList.remove('active');
        }
      });
    });
  </script>
</body>
</html>`;
}

/**
 * 통합 HTML 파일 생성
 */
function generateCombinedFromMergedFiles(mergedDir, outputPath, date) {
  const allLabelsData = [];

  // merged 디렉토리의 모든 JSON 파일 읽기
  const files = fs.readdirSync(mergedDir).filter(f => f.startsWith('merged_') && f.endsWith('.json'));

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(mergedDir, file), 'utf8'));
    allLabelsData.push(data);
  }

  // 라벨 이름순 정렬
  allLabelsData.sort((a, b) => a.label.localeCompare(b.label, 'ko'));

  const html = generateCombinedHtmlReport(allLabelsData, date);
  fs.writeFileSync(outputPath, html, 'utf8');

  console.log(`통합 HTML 리포트 생성됨: ${outputPath}`);
  return outputPath;
}

// 모듈 내보내기
module.exports = {
  generateHtmlReport,
  generateFromFinalJson,
  generateCombinedHtmlReport,
  generateCombinedFromMergedFiles,
  escapeHtml
};

// CLI 실행
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('사용법: node generate_html.js <final_json_path> <output_html_path>');
    process.exit(1);
  }

  try {
    generateFromFinalJson(args[0], args[1]);
  } catch (error) {
    console.error('오류:', error.message);
    process.exit(1);
  }
}
