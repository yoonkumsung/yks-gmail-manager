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
    const safeArticleUrl = safeUrl(item.link);
    const articleLink = safeArticleUrl ? `
      <a href="${escapeHtml(safeArticleUrl)}" target="_blank" rel="noopener noreferrer" class="link-btn article-link">
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
      <a href="${escapeHtml(gmailUrl)}" target="_blank" rel="noopener noreferrer" class="link-btn gmail-link">
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
  <meta name="robots" content="noindex, nofollow">
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

    @media print {
      body { background: white; color: black; }
      .item { break-inside: avoid; box-shadow: none; }
      .links { display: none; }
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
 * 크로스 인사이트 탭 콘텐츠 생성
 */
function generateCrossInsightTab(crossInsight) {
  // 메가트렌드 섹션
  const megaTrendsHtml = (crossInsight.mega_trends || []).map(trend => {
    const relatedHtml = (trend.related_items || []).map(item =>
      `<span class="related-item-tag"><span class="label-name">${escapeHtml(item.label)}</span> ${escapeHtml(item.title)}</span>`
    ).join('');

    return `
      <div class="mega-trend-card">
        <div class="card-title">${escapeHtml(trend.title)}</div>
        <div class="card-description">${escapeHtml(trend.description)}</div>
        ${relatedHtml ? `<div class="related-items">${relatedHtml}</div>` : ''}
      </div>
    `;
  }).join('');

  // 크로스 연결 섹션
  const connectionsHtml = (crossInsight.cross_connections || []).map(conn => {
    const connectedHtml = (conn.connected_items || []).map(item =>
      `<span class="related-item-tag"><span class="label-name">${escapeHtml(item.label)}</span> ${escapeHtml(item.title)}</span>`
    ).join('');

    return `
      <div class="cross-connection-card">
        <div class="card-title">${escapeHtml(conn.title)}</div>
        <div class="card-description">${escapeHtml(conn.description)}</div>
        ${connectedHtml ? `<div class="related-items">${connectedHtml}</div>` : ''}
      </div>
    `;
  }).join('');

  // 액션 아이템 섹션
  const actionsHtml = (crossInsight.action_items || []).map(action => {
    const labelTags = (action.related_labels || []).map(label =>
      `<span class="action-label-tag">${escapeHtml(label)}</span>`
    ).join('');

    return `
      <div class="action-item-card">
        <div class="card-description">
          <span class="action-timeline">${escapeHtml(action.timeline || '')}</span>
          ${escapeHtml(action.action)}
        </div>
        ${labelTags ? `<div class="action-labels">${labelTags}</div>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="tab-content active" id="tab-종합인사이트">
      ${megaTrendsHtml ? `
        <div class="cross-insight-section">
          <div class="cross-section-title">메가트렌드</div>
          ${megaTrendsHtml}
        </div>
      ` : ''}
      ${connectionsHtml ? `
        <div class="cross-insight-section">
          <div class="cross-section-title">크로스 연결</div>
          ${connectionsHtml}
        </div>
      ` : ''}
      ${actionsHtml ? `
        <div class="cross-insight-section">
          <div class="cross-section-title">액션 아이템</div>
          ${actionsHtml}
        </div>
      ` : ''}
    </div>
  `;
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
 * URL 안전성 검증 (XSS 방지)
 * - http(s), mailto만 허용
 * - javascript:, data:, vbscript: 등 위험 스킴 차단
 * - 빈 문자열 또는 null 반환 시 링크 생성 안 함
 */
function safeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  // 절대 URL 스킴 검증
  const schemeMatch = trimmed.match(/^([a-z][a-z0-9+.-]*):/i);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    const allowedSchemes = ['http', 'https', 'mailto'];
    if (!allowedSchemes.includes(scheme)) {
      return ''; // 위험 스킴 차단
    }
  } else if (!trimmed.startsWith('/') && !trimmed.startsWith('#')) {
    // 스킴 없고 상대 경로/앵커도 아니면 차단
    return '';
  }

  // 추가: URL 파싱 검증 (http/https만)
  if (/^https?:/i.test(trimmed)) {
    try {
      new URL(trimmed);
    } catch {
      return '';
    }
  }

  return trimmed;
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
function generateCombinedHtmlReport(allLabelsData, date, crossInsight, excludedMails = [], runStats = null) {
  // 실행 통계 포맷팅
  const formatStats = () => {
    if (!runStats) return '';
    const durMs = runStats.duration_ms || 0;
    const durMin = Math.floor(durMs / 60000);
    const durSec = Math.floor((durMs % 60000) / 1000);
    const durStr = durMin >= 60
      ? `${Math.floor(durMin / 60)}시간 ${durMin % 60}분`
      : `${durMin}분 ${durSec}초`;
    const totalTokens = (runStats.usage?.totalPromptTokens || 0) + (runStats.usage?.totalCompletionTokens || 0);
    const tokensStr = totalTokens >= 1000
      ? `${(totalTokens / 1000).toFixed(0)}K`
      : String(totalTokens);
    const costUsd = runStats.cost?.total_usd || 0;
    const costStr = costUsd > 0 ? `$${costUsd.toFixed(3)}` : '$0';
    const callsStr = runStats.usage?.totalCalls || 0;
    return { durStr, tokensStr, costStr, callsStr, totalTokens };
  };
  const stats = formatStats();
  // 크로스 인사이트 탭 버튼 (있으면 첫 번째)
  const hasCrossInsight = crossInsight && (crossInsight.mega_trends?.length > 0 || crossInsight.cross_connections?.length > 0 || crossInsight.action_items?.length > 0);
  const crossTabButton = hasCrossInsight
    ? `<button class="tab-btn active cross-tab-btn" data-tab="종합인사이트">종합 인사이트</button>\n`
    : '';

  // 라벨별 탭 버튼 생성
  const hasExcluded = excludedMails && excludedMails.length > 0;
  const excludedTabButton = hasExcluded
    ? `\n<button class="tab-btn excluded-tab-btn" data-tab="제외됨">제외<span class="count">${excludedMails.length}</span></button>`
    : '';

  const tabButtons = crossTabButton + allLabelsData.map((data, index) => {
    const isActive = (!hasCrossInsight && index === 0) ? 'active' : '';
    const itemCount = data.items?.length || 0;
    const safeLabel = data.label.replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
    return `<button class="tab-btn ${isActive}" data-tab="${safeLabel}">${escapeHtml(data.label)}<span class="count">${itemCount}</span></button>`;
  }).join('\n') + excludedTabButton;

  // 크로스 인사이트 탭 콘텐츠
  const crossTabContent = hasCrossInsight ? generateCrossInsightTab(crossInsight) : '';

  // 라벨별 콘텐츠 생성
  const tabContents = crossTabContent + allLabelsData.map((data, index) => {
    const isActive = (!hasCrossInsight && index === 0) ? 'active' : '';
    const items = data.items || [];
    // 라벨명을 ID에 사용 (특수문자를 _로 치환, 탭 버튼과 동일 로직)
    const safeLabel = data.label.replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
    const labelId = safeLabel;

    const itemsHtml = items.map((item, itemIndex) => {
      const keywordTags = (item.keywords || [])
        .slice(0, 5)
        .map(kw => `<span class="tag">${escapeHtml(kw)}</span>`)
        .join('');

      // 고유 ID 생성 (라벨명 + 인덱스)
      const uniqueId = `${labelId}-${itemIndex}`;

      // 인사이트 데이터 준비
      const hasDomainInsight = item.insights?.domain?.content;
      const hasCrossDomainInsight = item.insights?.cross_domain?.content;

      // 원문 보기 버튼 (URL 안전성 검증)
      const safeMessageId = item.message_id && /^[a-zA-Z0-9_-]+$/.test(item.message_id) ? item.message_id : null;
      const gmailUrl = safeMessageId ? `https://mail.google.com/mail/u/0/#all/${safeMessageId}` : null;
      let articleLinkHtml = '';
      const safeItemLink = safeUrl(item.link);
      if (safeItemLink) {
        articleLinkHtml = `<a href="${escapeHtml(safeItemLink)}" target="_blank" rel="noopener noreferrer" class="action-btn article-btn">원문 보기</a>`;
      } else if (gmailUrl) {
        articleLinkHtml = `<a href="${escapeHtml(gmailUrl)}" target="_blank" rel="noopener noreferrer" class="action-btn gmail-btn" title="본인 Gmail에서만 열립니다">Gmail에서 보기</a>`;
      }

      const buttonsHtml = articleLinkHtml ? `
        <div class="action-buttons">
          ${articleLinkHtml}
        </div>
      ` : '';

      // 인사이트 내용 영역 (기본 노출 - 프리뷰)
      const domainContentHtml = hasDomainInsight ? `
        <div class="insight-content domain-content" id="domain-${uniqueId}">
          <div class="insight-header">
            <span class="insight-label domain-label">실용적 인사이트</span>
          </div>
          <p>${escapeHtml(item.insights.domain.content)}</p>
        </div>
      ` : '';

      const crossContentHtml = hasCrossDomainInsight ? `
        <div class="insight-content cross-content" id="cross-${uniqueId}">
          <div class="insight-header">
            <span class="insight-label cross-label">확장 인사이트</span>
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

      // 출처 뱃지
      const sourceBadge = item.source ? `<span class="source-badge">${escapeHtml(item.source)}</span>` : '';

      // 인사이트 유무 뱃지
      const hasAnyInsight = hasDomainInsight || hasCrossDomainInsight;
      const insightBadge = hasAnyInsight ? '<span class="insight-badge">insight</span>' : '';

      return `
        <article class="item">
          <div class="item-header">
            <h3 class="item-title">${escapeHtml(item.title)}</h3>
            <span class="item-number">#${itemIndex + 1}</span>
          </div>
          <div class="item-meta-row">
            ${sourceBadge}${insightBadge}
          </div>
          <p class="item-summary">${escapeHtml(item.summary)}</p>
          <div class="keywords">${keywordTags}</div>
          ${buttonsHtml}
          ${insightContentsHtml}
        </article>
      `;
    }).join('\n');

    return `
      <div class="tab-content ${isActive}" id="tab-${safeLabel}">
        <div class="label-stats">
          <span class="stat">기사 ${items.length}개</span>
          ${data.stats?.duplicates_removed ? `<span class="stat">중복 제거 ${data.stats.duplicates_removed}개</span>` : ''}
          ${(() => { const insightCount = items.filter(i => i.insights?.domain?.content || i.insights?.cross_domain?.content).length; return insightCount > 0 ? `<span class="stat stat-insight">인사이트 ${insightCount}/${items.length}</span>` : ''; })()}
          ${data.excluded?.length ? `<span class="stat stat-excluded">제외 ${data.excluded.length}건</span>` : ''}
          ${data.quality_issues ? `<span class="stat stat-warning">품질 이슈 ${data.quality_issues}건</span>` : ''}
        </div>
        <div class="items-list">
          ${itemsHtml || '<p class="no-items">기사가 없습니다.</p>'}
        </div>
      </div>
    `;
  }).join('\n');

  // 제외 탭 콘텐츠 — 사유별 그룹핑
  let excludedTabContent = '';
  if (hasExcluded) {
    // 사유 패턴별 그룹핑
    const groups = {};
    for (const mail of excludedMails) {
      let groupKey = mail.reason || '기타';
      if (groupKey.includes('429')) groupKey = 'API 속도 제한 (429)';
      else if (groupKey.includes('LLM 처리 실패')) groupKey = 'LLM 처리 실패';
      else if (groupKey.includes('비뉴스')) groupKey = '비뉴스 메일 (사전 필터)';
      else if (groupKey.includes('추출 가능한 뉴스 아이템 없음')) groupKey = '추출 가능한 아이템 없음';
      else if (groupKey.includes('텍스트 부족')) groupKey = '본문 텍스트 부족';
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(mail);
    }

    const groupsHtml = Object.entries(groups).map(([reason, mails]) => `
      <div class="excluded-group">
        <div class="excluded-group-header">
          <span class="excluded-reason">${escapeHtml(reason)}</span>
          <span class="excluded-count">${mails.length}건</span>
        </div>
        ${mails.map((mail, i) => `
          <div class="excluded-item">
            <span class="excluded-subject">${escapeHtml(mail.subject)}</span>
            <span class="excluded-from">${escapeHtml(mail.from || '')}</span>
            ${mail.label ? `<span class="excluded-label-tag">${escapeHtml(mail.label)}</span>` : ''}
          </div>
        `).join('\n')}
      </div>
    `).join('\n');

    excludedTabContent = `
      <div class="tab-content" id="tab-제외됨">
        <div class="label-stats">
          <span class="stat">제외 ${excludedMails.length}건</span>
          <span class="stat">${Object.keys(groups).length}개 사유</span>
        </div>
        <div class="items-list">
          ${groupsHtml}
        </div>
      </div>
    `;
  }

  const allTabContents = tabContents + excludedTabContent;

  // 총 기사 수 계산
  const totalItems = allLabelsData.reduce((sum, data) => sum + (data.items?.length || 0), 0);
  const labelCount = allLabelsData.length;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="robots" content="noindex, nofollow">
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

    /* 아이템 메타 행 (출처 + 뱃지) */
    .item-meta-row {
      display: flex;
      gap: 0.375rem;
      align-items: center;
      margin-bottom: 0.5rem;
      flex-wrap: wrap;
    }

    .source-badge {
      font-size: 0.7rem;
      padding: 0.1rem 0.5rem;
      border-radius: 4px;
      background: #eff6ff;
      color: var(--primary);
      font-weight: 500;
    }

    .insight-badge {
      font-size: 0.6rem;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      background: #f5f3ff;
      color: var(--domain);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    /* 통계 색상 */
    .stat-insight { color: var(--domain); }
    .stat-excluded { color: #9ca3af; }
    .stat-warning { color: #f59e0b; }

    /* 제외 그룹 */
    .excluded-group {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      margin-bottom: 0.75rem;
      overflow: hidden;
    }

    .excluded-group-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background: #f8fafc;
      border-bottom: 1px solid var(--border);
    }

    .excluded-reason {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text);
    }

    .excluded-count {
      font-size: 0.75rem;
      color: var(--text-muted);
      background: var(--border);
      padding: 0.1rem 0.5rem;
      border-radius: 10px;
    }

    .excluded-item {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      padding: 0.5rem 1rem;
      border-bottom: 1px solid #f1f5f9;
      font-size: 0.8rem;
    }

    .excluded-item:last-child { border-bottom: none; }

    .excluded-subject {
      flex: 1;
      color: var(--text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .excluded-from {
      color: var(--text-muted);
      font-size: 0.7rem;
      flex-shrink: 0;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .excluded-label-tag {
      font-size: 0.65rem;
      padding: 0.1rem 0.4rem;
      border-radius: 3px;
      background: var(--border);
      color: var(--text-muted);
      flex-shrink: 0;
    }

    .no-items { color: var(--text-muted); text-align: center; padding: 2rem; }

    /* 크로스 인사이트 탭 */
    .cross-tab-btn.active {
      background: linear-gradient(135deg, #667eea, #764ba2);
      color: white;
    }

    .cross-tab-btn.active .count {
      background: rgba(255,255,255,0.3);
    }

    /* 제외 탭 */
    .excluded-tab-btn {
      opacity: 0.6;
    }
    .excluded-tab-btn .count {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }
    .excluded-card {
      border-left: 3px solid #9ca3af;
      opacity: 0.8;
    }

    .cross-insight-section {
      margin-bottom: 1.5rem;
    }

    .cross-section-title {
      font-size: 1rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid var(--border);
      color: var(--text);
    }

    .mega-trend-card, .cross-connection-card, .action-item-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1rem;
      margin-bottom: 0.75rem;
    }

    .mega-trend-card {
      border-left: 4px solid #667eea;
    }

    .cross-connection-card {
      border-left: 4px solid #f59e0b;
    }

    .action-item-card {
      border-left: 4px solid #10b981;
    }

    .card-title {
      font-size: 0.95rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }

    .card-description {
      font-size: 0.875rem;
      line-height: 1.6;
      color: var(--text);
      margin-bottom: 0.75rem;
    }

    .related-items {
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
    }

    .related-item-tag {
      font-size: 0.7rem;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      background: #f1f5f9;
      color: var(--text-muted);
    }

    .related-item-tag .label-name {
      font-weight: 600;
      color: var(--primary);
    }

    .action-timeline {
      display: inline-block;
      font-size: 0.7rem;
      font-weight: 600;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      background: #ecfdf5;
      color: #065f46;
      margin-right: 0.5rem;
    }

    .action-labels {
      display: inline-flex;
      gap: 0.25rem;
      flex-wrap: wrap;
    }

    .action-label-tag {
      font-size: 0.65rem;
      padding: 0.1rem 0.4rem;
      border-radius: 3px;
      background: #eff6ff;
      color: var(--primary);
    }

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

      .source-badge {
        background: #1e3a5f;
        color: #93c5fd;
      }

      .insight-badge {
        background: #1e1b4b;
        color: var(--domain);
      }

      .excluded-group-header {
        background: #1e293b;
      }

      .excluded-item {
        border-bottom-color: #334155;
      }

      .excluded-label-tag {
        background: #334155;
        color: #94a3b8;
      }

      .related-item-tag {
        background: #334155;
        color: #cbd5e1;
      }

      .related-item-tag .label-name {
        color: #93c5fd;
      }

      .action-timeline {
        background: #064e3b;
        color: #6ee7b7;
      }

      .action-label-tag {
        background: #1e3a5f;
        color: #93c5fd;
      }

      .mega-trend-card {
        border-left-color: #818cf8;
      }

      .cross-connection-card {
        border-left-color: #fbbf24;
      }

      .action-item-card {
        border-left-color: #34d399;
      }
    }

    /* 실행 통계 바 */
    .run-stats {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      padding: 0.5rem 0.75rem;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 0.5rem;
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    .run-stat {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }
    .run-stat-icon {
      font-size: 0.85rem;
    }
    .run-stat + .run-stat::before {
      content: '·';
      margin-right: 0.5rem;
      opacity: 0.5;
    }

    /* 검색바 */
    .search-bar {
      position: relative;
      margin-bottom: 0.5rem;
    }
    #search-input {
      width: 100%;
      padding: 0.6rem 0.875rem;
      padding-right: 4rem;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--card-bg);
      color: var(--text);
      font-size: 0.85rem;
      outline: none;
      transition: border-color 0.15s;
      -webkit-appearance: none;
    }
    #search-input:focus {
      border-color: var(--primary);
    }
    .search-count {
      position: absolute;
      right: 0.875rem;
      top: 50%;
      transform: translateY(-50%);
      font-size: 0.7rem;
      color: var(--text-muted);
      pointer-events: none;
    }

    /* 검색 결과 없음 안내 */
    .no-search-results {
      text-align: center;
      color: var(--text-muted);
      padding: 2rem;
      display: none;
    }

    /* 다크모드 검색바 */
    @media (prefers-color-scheme: dark) {
      #search-input::placeholder {
        color: #64748b;
      }
    }

    /* 인쇄/PDF */
    @media print {
      .header-container { position: static; border: none; }
      .tabs-wrapper { display: none; }
      .search-bar { display: none; }
      .run-stats { display: none; }
      .tab-content { display: block !important; page-break-inside: avoid; margin-bottom: 2rem; }
      .tab-content::before { content: attr(id); font-size: 1.2rem; font-weight: 700; display: block; margin-bottom: 1rem; }
      .item { break-inside: avoid; box-shadow: none; border: 1px solid #ddd; }
      .action-buttons { display: none; }
      body { background: white; color: black; font-size: 11pt; }
      .container { max-width: 100%; padding: 0; }
      .insight-content { break-inside: avoid; }
      .excluded-group { break-inside: avoid; }
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
      ${stats ? `
      <div class="run-stats" title="이번 실행 통계">
        <span class="run-stat" title="처리 시간"><span class="run-stat-icon">⏱</span> ${stats.durStr}</span>
        <span class="run-stat" title="토큰 사용량 (입력+출력)"><span class="run-stat-icon">🔤</span> ${stats.tokensStr}</span>
        <span class="run-stat" title="API 호출 횟수"><span class="run-stat-icon">📡</span> ${stats.callsStr}회</span>
        <span class="run-stat" title="비용 (USD)"><span class="run-stat-icon">💰</span> ${stats.costStr}</span>
      </div>
      ` : ''}
      <div class="search-bar">
        <input type="text" id="search-input" placeholder="🔍 제목/요약/키워드/출처에서 검색..." aria-label="검색">
        <span class="search-count" id="search-count"></span>
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
    ${allTabContents}
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

    // 인사이트는 기본 노출 (토글 불필요)

    // 검색/필터 기능
    (function() {
      const searchInput = document.getElementById('search-input');
      const searchCount = document.getElementById('search-count');
      if (!searchInput) return;

      function applyFilter() {
        const query = searchInput.value.toLowerCase().trim();
        const activeTab = document.querySelector('.tab-content.active');
        if (!activeTab) return;

        const items = activeTab.querySelectorAll('.item, .excluded-group');
        let visibleCount = 0;
        let totalCount = 0;

        items.forEach(item => {
          totalCount++;
          if (!query) {
            item.style.display = '';
            visibleCount++;
            return;
          }
          const text = (item.textContent || '').toLowerCase();
          const visible = text.includes(query);
          item.style.display = visible ? '' : 'none';
          if (visible) visibleCount++;
        });

        // 검색 결과 카운트 표시
        if (searchCount) {
          if (query) {
            searchCount.textContent = visibleCount + '/' + totalCount;
          } else {
            searchCount.textContent = '';
          }
        }

        // 결과 없음 안내
        let noResultsEl = activeTab.querySelector('.no-search-results');
        if (query && visibleCount === 0) {
          if (!noResultsEl) {
            noResultsEl = document.createElement('div');
            noResultsEl.className = 'no-search-results';
            noResultsEl.textContent = '검색 결과가 없습니다.';
            const itemsList = activeTab.querySelector('.items-list');
            if (itemsList) itemsList.appendChild(noResultsEl);
          }
          if (noResultsEl) noResultsEl.style.display = 'block';
        } else if (noResultsEl) {
          noResultsEl.style.display = 'none';
        }
      }

      // 입력 시 디바운스 적용 (160ms)
      let timer = null;
      searchInput.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(applyFilter, 160);
      });

      // 탭 전환 시 현재 검색어로 다시 필터 적용
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          setTimeout(applyFilter, 50);
        });
      });

      // ESC로 검색 초기화
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          searchInput.value = '';
          applyFilter();
          searchInput.blur();
        }
      });
    })();
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
    try {
      const data = JSON.parse(fs.readFileSync(path.join(mergedDir, file), 'utf8'));
      allLabelsData.push(data);
    } catch (e) {
      console.warn(`  ${file} 파싱 실패, 건너뜀: ${e.message}`);
    }
  }

  // 제외 메일 수집 (merged 파일 내 excluded + 별도 excluded_*.json)
  const allExcluded = [];
  for (const data of allLabelsData) {
    if (data.excluded && data.excluded.length > 0) {
      allExcluded.push(...data.excluded.map(e => ({ ...e, label: data.label })));
    }
  }
  // 별도 excluded_*.json 파일에서도 수집
  const excludedFiles = fs.readdirSync(mergedDir).filter(f => f.startsWith('excluded_') && f.endsWith('.json'));
  for (const file of excludedFiles) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(mergedDir, file), 'utf8'));
      if (data.excluded) {
        allExcluded.push(...data.excluded.map(e => ({ ...e, label: data.label })));
      }
    } catch (e) { /* skip */ }
  }

  // 아이템 0건인 라벨 제외
  const filteredLabelsData = allLabelsData.filter(data => data.items && data.items.length > 0);

  // 라벨 이름순 정렬
  filteredLabelsData.sort((a, b) => a.label.localeCompare(b.label, 'ko'));

  // 크로스 인사이트 데이터 읽기
  let crossInsight = null;
  const crossInsightPath = path.join(mergedDir, '_cross_insight.json');
  if (fs.existsSync(crossInsightPath)) {
    try {
      crossInsight = JSON.parse(fs.readFileSync(crossInsightPath, 'utf8'));
    } catch (e) {
      console.warn('크로스 인사이트 파일 읽기 실패:', e.message);
    }
  }

  // 실행 통계 읽기
  let runStats = null;
  const runStatsPath = path.join(mergedDir, '_run_stats.json');
  if (fs.existsSync(runStatsPath)) {
    try {
      runStats = JSON.parse(fs.readFileSync(runStatsPath, 'utf8'));
    } catch (e) {
      console.warn('실행 통계 파일 읽기 실패:', e.message);
    }
  }

  const html = generateCombinedHtmlReport(filteredLabelsData, date, crossInsight, allExcluded, runStats);
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
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
