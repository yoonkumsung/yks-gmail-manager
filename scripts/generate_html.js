/**
 * Gmail 뉴스레터 리포트 HTML 생성 v2 (UI/UX 재설계)
 *
 * 개선 사항:
 * - Bento 그리드 통계 카드
 * - F-패턴 최적화 아이템 카드 (출처 상단, 큰 제목, 넉넉한 간격)
 * - 라벨별 색상 시스템 (12개 고유 색)
 * - 인사이트 탭화 (카드 내부 탭으로 공간 절약)
 * - 검색 하이라이팅 (<mark>)
 * - 빠른 필터 칩 (인사이트/원문링크)
 * - 출처별 그룹 보기 토글
 * - 미니맵 (데스크톱 사이드바)
 * - 스크롤 위치 기억 (sessionStorage)
 * - 마이크로 인터랙션 (hover, transition)
 * - 다크모드 정교화
 * - 인쇄 최적화
 */

const fs = require('fs');
const path = require('path');

// ============================================
// 라벨별 색상 시스템
// ============================================

const LABEL_COLORS = {
  'IT': '#3b82f6',        // blue
  '경제': '#10b981',      // emerald
  '투자': '#8b5cf6',      // violet
  '시사': '#ef4444',      // red
  '인문학': '#ec4899',    // pink
  '해외': '#f97316',      // orange
  '라이프': '#06b6d4',    // cyan
  '창업': '#f59e0b',      // amber
  '기타': '#64748b',      // slate
  '마케팅': '#84cc16',    // lime
  '스포츠': '#14b8a6',    // teal
  '소셜포럼': '#a855f7',  // purple
};
const DEFAULT_LABEL_COLOR = '#64748b';

function getLabelColor(label) {
  return LABEL_COLORS[label] || DEFAULT_LABEL_COLOR;
}

// ============================================
// 유틸
// ============================================

function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  const schemeMatch = trimmed.match(/^([a-z][a-z0-9+.-]*):/i);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (!['http', 'https', 'mailto'].includes(scheme)) return '';
  } else if (!trimmed.startsWith('/') && !trimmed.startsWith('#')) {
    return '';
  }
  if (/^https?:/i.test(trimmed)) {
    try { new URL(trimmed); } catch { return ''; }
  }
  return trimmed;
}

function safeId(label) {
  return label.replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
}

/**
 * 수신 시각 포맷 (KST, MM/DD HH:MM)
 */
function formatReceivedAtKST(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(kst.getUTCDate()).padStart(2, '0');
    const hh = String(kst.getUTCHours()).padStart(2, '0');
    const mi = String(kst.getUTCMinutes()).padStart(2, '0');
    return `${mm}/${dd} ${hh}:${mi}`;
  } catch {
    return '';
  }
}

// ============================================
// 메인: 통합 HTML 리포트 생성
// ============================================

function generateCombinedHtmlReport(allLabelsData, date, crossInsight, excludedMails = [], runStats = null) {
  const hasCrossInsight = crossInsight && (
    (crossInsight.mega_trends?.length > 0) ||
    (crossInsight.cross_connections?.length > 0) ||
    (crossInsight.action_items?.length > 0)
  );
  const hasExcluded = excludedMails && excludedMails.length > 0;

  // 통계 카드 HTML
  const statsBentoHtml = renderStatsBento(runStats, allLabelsData);

  // 탭 버튼
  const tabButtons = renderTabButtons(allLabelsData, hasCrossInsight, hasExcluded, excludedMails);

  // 탭 콘텐츠
  const crossTabContent = hasCrossInsight ? renderCrossInsightTab(crossInsight) : '';
  const labelTabsContent = allLabelsData.map((data, idx) => renderLabelTab(data, idx, hasCrossInsight)).join('\n');
  const excludedTabContent = hasExcluded ? renderExcludedTab(excludedMails) : '';

  const allTabContents = crossTabContent + labelTabsContent + excludedTabContent;

  // 총 아이템 수 (통계 카드용)
  const totalItems = allLabelsData.reduce((sum, d) => sum + (d.items?.length || 0), 0);

  // 라벨 색상 CSS 변수
  const labelColorCss = Object.entries(LABEL_COLORS)
    .map(([label, color]) => {
      const safe = safeId(label);
      return `[data-label="${safe}"] { --label-color: ${color}; }`;
    }).join('\n    ');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="robots" content="noindex, nofollow">
  <title>YKS Newsletter Report · ${escapeHtml(date)}</title>
  <style>
    ${generateStyles(labelColorCss)}
  </style>
</head>
<body>
  <header class="header-container">
    <div class="header-inner">
      <div class="header-top">
        <div class="header-title-wrap">
          <h1 class="header-title">YKS Newsletter Report</h1>
          <span class="header-date">${escapeHtml(date)}</span>
        </div>
        <div class="header-meta">
          <span class="badge badge-total">${totalItems}개</span>
          <button class="header-action-btn" id="search-btn" type="button" aria-label="검색" title="검색 (Cmd/Ctrl+K)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.3-4.3"></path>
            </svg>
          </button>
          <button class="header-action-btn" id="filter-btn" type="button" aria-label="필터" title="필터">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
            </svg>
            <span class="header-action-dot" id="filter-dot"></span>
          </button>
          <button class="header-action-btn" id="stats-btn" type="button" aria-label="실행 통계" title="실행 통계">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
          </button>
        </div>
      </div>

      <div class="tabs-wrapper">
        <nav class="tabs">${tabButtons}</nav>
      </div>
    </div>
  </header>

  <main class="container">
    ${allTabContents}
  </main>

  <!-- 검색 모달 (검색만) -->
  <div class="modal-backdrop" id="search-modal" aria-hidden="true">
    <div class="modal-content" role="dialog" aria-labelledby="search-modal-title">
      <div class="modal-header">
        <h3 class="modal-title" id="search-modal-title">검색</h3>
        <button class="modal-close" data-close="search-modal" aria-label="닫기">×</button>
      </div>
      <div class="modal-body">
        <div class="search-bar">
          <input type="text" id="search-input" placeholder="제목 · 요약 · 키워드 · 출처" aria-label="검색">
          <span class="search-count" id="search-count"></span>
        </div>
        <p class="modal-hint">ESC로 닫기 · Cmd/Ctrl+K로 다시 열기</p>
      </div>
    </div>
  </div>

  <!-- 필터 모달 -->
  <div class="modal-backdrop" id="filter-modal" aria-hidden="true">
    <div class="modal-content" role="dialog" aria-labelledby="filter-modal-title">
      <div class="modal-header">
        <h3 class="modal-title" id="filter-modal-title">필터</h3>
        <button class="modal-close" data-close="filter-modal" aria-label="닫기">×</button>
      </div>
      <div class="modal-body">
        <div class="modal-section modal-section-first">
          <div class="modal-section-label">콘텐츠 종류</div>
          <div class="filter-chips">
            <button class="filter-chip active" data-filter="all">전체</button>
            <button class="filter-chip" data-filter="has-insight">💡 인사이트 있음</button>
            <button class="filter-chip" data-filter="has-link">🔗 원문 링크 있음</button>
            <button class="filter-chip" data-filter="long">📖 긴 요약 (400자+)</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 통계 모달 -->
  <div class="modal-backdrop" id="stats-modal" aria-hidden="true">
    <div class="modal-content" role="dialog" aria-labelledby="stats-modal-title">
      <div class="modal-header">
        <h3 class="modal-title" id="stats-modal-title">실행 통계</h3>
        <button class="modal-close" data-close="stats-modal" aria-label="닫기">×</button>
      </div>
      <div class="modal-body">
        ${statsBentoHtml}
      </div>
    </div>
  </div>

  <aside class="minimap" id="minimap" aria-hidden="true">
    <div class="minimap-title">빠른 이동</div>
    <div class="minimap-list" id="minimap-list"></div>
  </aside>

  <button class="scroll-top-btn" id="scroll-top-btn" aria-label="맨 위로" title="맨 위로">↑</button>

  <script>
    ${generateScripts()}
  </script>
</body>
</html>`;
}

// ============================================
// 통계 Bento 그리드
// ============================================

function renderStatsBento(runStats, allLabelsData) {
  const totalItems = allLabelsData.reduce((sum, d) => sum + (d.items?.length || 0), 0);
  const itemsWithInsight = allLabelsData.reduce((sum, d) =>
    sum + (d.items?.filter(i => i.insights?.domain?.content || i.insights?.cross_domain?.content).length || 0), 0);

  let durStr = '-';
  let tokensStr = '-';
  let costStr = '-';
  let callsStr = '-';

  if (runStats) {
    const durMs = runStats.duration_ms || 0;
    const durMin = Math.floor(durMs / 60000);
    const durSec = Math.floor((durMs % 60000) / 1000);
    durStr = durMin >= 60 ? `${Math.floor(durMin / 60)}h ${durMin % 60}m` : `${durMin}m ${durSec}s`;

    const totalTokens = (runStats.usage?.totalPromptTokens || 0) + (runStats.usage?.totalCompletionTokens || 0);
    tokensStr = totalTokens >= 1000000
      ? `${(totalTokens / 1000000).toFixed(2)}M`
      : totalTokens >= 1000
      ? `${(totalTokens / 1000).toFixed(0)}K`
      : String(totalTokens);

    const costUsd = runStats.cost?.total_usd || 0;
    costStr = costUsd > 0 ? `$${costUsd.toFixed(3)}` : '$0';
    callsStr = String(runStats.usage?.totalCalls || 0);
  }

  return `
      <div class="stats-bento">
        <div class="stats-bento-card">
          <div class="stats-bento-icon">📄</div>
          <div class="stats-bento-value">${totalItems}</div>
          <div class="stats-bento-label">아이템</div>
        </div>
        <div class="stats-bento-card">
          <div class="stats-bento-icon">💡</div>
          <div class="stats-bento-value">${itemsWithInsight}<span class="stats-bento-suffix">/${totalItems}</span></div>
          <div class="stats-bento-label">인사이트</div>
        </div>
        <div class="stats-bento-card">
          <div class="stats-bento-icon">⏱</div>
          <div class="stats-bento-value">${durStr}</div>
          <div class="stats-bento-label">소요시간</div>
        </div>
        <div class="stats-bento-card">
          <div class="stats-bento-icon">🔤</div>
          <div class="stats-bento-value">${tokensStr}</div>
          <div class="stats-bento-label">토큰</div>
        </div>
        <div class="stats-bento-card">
          <div class="stats-bento-icon">📡</div>
          <div class="stats-bento-value">${callsStr}</div>
          <div class="stats-bento-label">API 호출</div>
        </div>
        <div class="stats-bento-card">
          <div class="stats-bento-icon">💰</div>
          <div class="stats-bento-value">${costStr}</div>
          <div class="stats-bento-label">비용</div>
        </div>
      </div>`;
}

// ============================================
// 탭 버튼
// ============================================

function renderTabButtons(allLabelsData, hasCrossInsight, hasExcluded, excludedMails) {
  const crossBtn = hasCrossInsight
    ? `<button class="tab-btn cross-tab-btn active" data-tab="종합인사이트">✨ 종합 인사이트</button>`
    : '';

  const labelBtns = allLabelsData.map((data, idx) => {
    const isActive = !hasCrossInsight && idx === 0;
    const count = data.items?.length || 0;
    const color = getLabelColor(data.label);
    const safe = safeId(data.label);
    return `<button class="tab-btn ${isActive ? 'active' : ''}" data-tab="${safe}" data-label="${escapeHtml(safe)}" style="--label-color: ${color}">
      <span class="tab-label-dot" style="background: ${color}"></span>
      ${escapeHtml(data.label)}
      <span class="count">${count}</span>
    </button>`;
  }).join('');

  const excludedBtn = hasExcluded
    ? `<button class="tab-btn excluded-tab-btn" data-tab="제외됨">제외<span class="count">${excludedMails.length}</span></button>`
    : '';

  return crossBtn + labelBtns + excludedBtn;
}

// ============================================
// 라벨별 탭 콘텐츠
// ============================================

function renderLabelTab(data, idx, hasCrossInsight) {
  const isActive = !hasCrossInsight && idx === 0;
  const safe = safeId(data.label);
  const color = getLabelColor(data.label);
  const items = data.items || [];

  const itemsHtml = items.map((item, itemIdx) => renderItemCard(item, itemIdx, data.label, color)).join('\n');

  const insightCount = items.filter(i => i.insights?.domain?.content || i.insights?.cross_domain?.content).length;
  const statsLine = `<div class="label-stats-bar">
    <div class="label-stats-left">
      <span class="label-stat-main">📰 ${items.length}개 아이템</span>
      ${insightCount > 0 ? `<span class="label-stat">💡 ${insightCount}개 인사이트</span>` : ''}
      ${data.stats?.duplicates_removed ? `<span class="label-stat">🔗 ${data.stats.duplicates_removed}개 중복 제거</span>` : ''}
    </div>
    <div class="grouping-toggle" role="tablist" aria-label="정렬 방식">
      <button class="grouping-toggle-btn active" data-group="label" title="라벨별">라벨별</button>
      <button class="grouping-toggle-btn" data-group="source" title="출처별">출처별</button>
    </div>
  </div>`;

  return `
      <div class="tab-content ${isActive ? 'active' : ''}" id="tab-${safe}" data-label="${safe}" style="--label-color: ${color}">
        ${statsLine}
        <div class="items-list">
          ${itemsHtml || '<p class="no-items">기사가 없습니다.</p>'}
        </div>
      </div>`;
}

// ============================================
// 아이템 카드 (F-패턴 최적화)
// ============================================

function renderItemCard(item, itemIdx, labelName, labelColor) {
  const uniqueId = `${safeId(labelName)}-${itemIdx}`;
  const source = item.source || '';
  const sourceEmail = item.source_email || '';
  const title = item.title || '(제목 없음)';
  const summary = item.summary || '';
  const keywords = (item.keywords || []).slice(0, 8);
  const receivedAt = formatReceivedAtKST(item.received_at);

  const hasDomain = !!item.insights?.domain?.content;
  const hasCross = !!item.insights?.cross_domain?.content;
  const hasInsight = hasDomain || hasCross;
  const domainContent = item.insights?.domain?.content || '';
  const crossContent = item.insights?.cross_domain?.content || '';

  // 링크
  const safeLink = safeUrl(item.link);
  const safeMessageId = item.message_id && /^[a-zA-Z0-9_-]+$/.test(item.message_id) ? item.message_id : null;
  const gmailUrl = safeMessageId ? `https://mail.google.com/mail/u/0/#all/${safeMessageId}` : null;
  const hasLink = !!safeLink;
  const isLongSummary = summary.length >= 400;

  // 링크 버튼: Gmail은 항상 표시, 원문은 link가 있을 때만 추가
  let linkBtnHtml = '';
  if (gmailUrl) {
    linkBtnHtml += `<a href="${escapeHtml(gmailUrl)}" target="_blank" rel="noopener noreferrer" class="item-btn item-btn-gmail">Gmail에서 보기</a>`;
  }
  if (safeLink) {
    linkBtnHtml += `<a href="${escapeHtml(safeLink)}" target="_blank" rel="noopener noreferrer" class="item-btn item-btn-primary">원문 보기 ↗</a>`;
  }

  // 키워드
  const keywordsHtml = keywords.map(kw =>
    `<span class="tag">#${escapeHtml(kw)}</span>`
  ).join('');

  // 푸터 행 (인사이트 탭 + 원문 링크 버튼)
  let footerHtml = '';
  if (hasInsight || linkBtnHtml) {
    const tabs = [];
    const panels = [];

    if (hasDomain) {
      const active = tabs.length === 0 ? 'active' : '';
      tabs.push(`<button class="insight-tab ${active}" data-panel="domain-${uniqueId}">💡 실용적 인사이트</button>`);
      panels.push(`<div class="insight-panel ${active}" id="domain-${uniqueId}">${escapeHtml(domainContent)}</div>`);
    }
    if (hasCross) {
      const active = tabs.length === 0 ? 'active' : '';
      tabs.push(`<button class="insight-tab ${active}" data-panel="cross-${uniqueId}">🌐 확장 인사이트</button>`);
      panels.push(`<div class="insight-panel ${active}" id="cross-${uniqueId}">${escapeHtml(crossContent)}</div>`);
    }

    footerHtml = `
      <div class="insights-container">
        <div class="item-footer-row">
          ${hasInsight ? `<div class="insights-tabs">${tabs.join('')}</div>` : '<div class="insights-tabs-spacer"></div>'}
          ${linkBtnHtml}
        </div>
        ${panels.join('')}
      </div>`;
  }

  // 키워드를 data 속성으로만 보존 (화면 표시 X, 검색에만 사용)
  const keywordsDataStr = keywords.map(k => `#${k}`).join(' ');

  return `
        <article class="item"
          data-label="${safeId(labelName)}"
          data-source="${escapeHtml(source || sourceEmail)}"
          data-has-insight="${hasInsight ? 'true' : 'false'}"
          data-has-link="${hasLink ? 'true' : 'false'}"
          data-long="${isLongSummary ? 'true' : 'false'}"
          data-keywords="${escapeHtml(keywordsDataStr)}">
          <span class="item-number">#${itemIdx + 1}</span>
          ${(source || sourceEmail || receivedAt) ? `<div class="item-meta-top">
            ${(source || sourceEmail) ? `<span class="item-source">${escapeHtml(source || sourceEmail)}</span>` : ''}
            ${receivedAt ? `<span class="item-time">${escapeHtml(receivedAt)}</span>` : ''}
          </div>` : ''}
          <h3 class="item-title">${escapeHtml(title)}</h3>
          <p class="item-summary">${escapeHtml(summary)}</p>
          ${footerHtml}
        </article>`;
}

// ============================================
// 크로스 인사이트 탭
// ============================================

function renderCrossInsightTab(crossInsight) {
  const megaTrends = crossInsight.mega_trends || [];
  const crossConnections = crossInsight.cross_connections || [];
  const actionItems = crossInsight.action_items || [];

  const megaHtml = megaTrends.map(t => `
    <div class="cross-card mega-trend-card">
      <h4 class="cross-card-title">${escapeHtml(t.title)}</h4>
      <p class="cross-card-desc">${escapeHtml(t.description)}</p>
      ${(t.related_items || []).length > 0 ? `
        <div class="related-items">
          ${t.related_items.map(r => `<span class="related-item-tag" style="--label-color: ${getLabelColor(r.label)}"><span class="label-name">${escapeHtml(r.label)}</span> ${escapeHtml(r.title)}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `).join('');

  const connHtml = crossConnections.map(c => `
    <div class="cross-card cross-connection-card">
      <h4 class="cross-card-title">${escapeHtml(c.title)}</h4>
      <p class="cross-card-desc">${escapeHtml(c.description)}</p>
      ${(c.connected_items || []).length > 0 ? `
        <div class="related-items">
          ${c.connected_items.map(r => `<span class="related-item-tag" style="--label-color: ${getLabelColor(r.label)}"><span class="label-name">${escapeHtml(r.label)}</span> ${escapeHtml(r.title)}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `).join('');

  const actionHtml = actionItems.map(a => `
    <div class="cross-card action-item-card">
      <div class="action-top">
        <span class="action-timeline">${escapeHtml(a.timeline || '')}</span>
        ${(a.related_labels || []).map(l => `<span class="action-label-tag" style="color: ${getLabelColor(l)}">${escapeHtml(l)}</span>`).join('')}
      </div>
      <p class="cross-card-desc">${escapeHtml(a.action)}</p>
    </div>
  `).join('');

  return `
      <div class="tab-content active" id="tab-종합인사이트">
        ${megaTrends.length > 0 ? `
        <section class="cross-section">
          <h3 class="cross-section-title">🌟 메가트렌드</h3>
          ${megaHtml}
        </section>` : ''}
        ${crossConnections.length > 0 ? `
        <section class="cross-section">
          <h3 class="cross-section-title">🔗 크로스 연결</h3>
          ${connHtml}
        </section>` : ''}
        ${actionItems.length > 0 ? `
        <section class="cross-section">
          <h3 class="cross-section-title">🎯 사용자 액션</h3>
          ${actionHtml}
        </section>` : ''}
      </div>`;
}

// ============================================
// 제외 탭
// ============================================

function renderExcludedTab(excludedMails) {
  // 사유별 그룹핑
  const groups = {};
  for (const mail of excludedMails) {
    let key = mail.reason || '기타';
    if (key.includes('429')) key = 'API 속도 제한';
    else if (key.includes('LLM 처리 실패')) key = 'LLM 처리 실패';
    else if (key.includes('비뉴스')) key = '비뉴스 메일';
    else if (key.includes('추출 가능한 뉴스 아이템 없음')) key = '추출 가능한 아이템 없음';
    else if (key.includes('텍스트 부족')) key = '본문 텍스트 부족';
    if (!groups[key]) groups[key] = [];
    groups[key].push(mail);
  }

  const groupsHtml = Object.entries(groups).map(([reason, mails]) => `
    <div class="excluded-group">
      <div class="excluded-group-header">
        <span class="excluded-reason">${escapeHtml(reason)}</span>
        <span class="excluded-count">${mails.length}건</span>
      </div>
      ${mails.map(m => `
        <div class="excluded-item">
          <span class="excluded-subject">${escapeHtml(m.subject || '(제목 없음)')}</span>
          <span class="excluded-from">${escapeHtml(m.from || '')}</span>
          ${m.label ? `<span class="excluded-label-tag" style="color: ${getLabelColor(m.label)}">${escapeHtml(m.label)}</span>` : ''}
        </div>
      `).join('')}
    </div>
  `).join('');

  return `
      <div class="tab-content" id="tab-제외됨">
        <div class="label-stats-bar">
          <span class="label-stat-main">🚫 ${excludedMails.length}건 제외</span>
          <span class="label-stat">${Object.keys(groups).length}개 사유</span>
        </div>
        <div class="items-list">
          ${groupsHtml}
        </div>
      </div>`;
}

// ============================================
// CSS 생성
// ============================================

function generateStyles(labelColorCss) {
  return `
    :root {
      --primary: #2563eb;
      --primary-light: #3b82f6;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #0f172a;
      --text-muted: #64748b;
      --text-subtle: #94a3b8;
      --border: #e2e8f0;
      --border-light: #f1f5f9;
      --success: #10b981;
      --radius: 12px;
      --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.04);
      --shadow-md: 0 2px 8px rgba(15, 23, 42, 0.06);
      --shadow-lg: 0 8px 24px rgba(15, 23, 42, 0.08);
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans KR', sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.7;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
    }

    ${labelColorCss}

    /* ============================================
       Header — 고정
       ============================================ */
    .header-container {
      position: sticky;
      top: 0;
      background: rgba(248, 250, 252, 0.92);
      backdrop-filter: saturate(180%) blur(12px);
      -webkit-backdrop-filter: saturate(180%) blur(12px);
      z-index: 100;
      border-bottom: 1px solid var(--border);
    }
    .header-inner {
      max-width: 900px;
      margin: 0 auto;
      padding: 0.875rem 1rem 0;
    }
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 0.875rem;
    }
    .header-title-wrap {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
    }
    .header-title {
      font-size: 1.25rem;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .header-date {
      font-size: 0.8rem;
      color: var(--text-muted);
      font-weight: 500;
    }
    .header-meta { display: flex; gap: 0.5rem; }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.25rem 0.6rem;
      border-radius: 999px;
      font-size: 0.7rem;
      font-weight: 600;
    }
    .badge-total {
      background: var(--primary);
      color: white;
    }

    /* ============================================
       헤더 액션 버튼 (검색/통계 아이콘)
       ============================================ */
    .header-action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: 1px solid var(--border);
      background: var(--card-bg);
      color: var(--text-muted);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;
      padding: 0;
    }
    .header-action-btn:hover {
      border-color: var(--primary);
      color: var(--primary);
      transform: translateY(-1px);
    }
    .header-action-btn:active {
      transform: translateY(0);
    }
    .header-action-btn svg {
      width: 16px;
      height: 16px;
    }
    .header-action-btn {
      position: relative;
    }
    .header-action-dot {
      position: absolute;
      top: 4px;
      right: 4px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #ef4444;
      display: none;
    }
    .header-action-btn.has-active .header-action-dot {
      display: block;
    }

    /* ============================================
       모달 (검색/통계)
       ============================================ */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.5);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      z-index: 200;
      display: none;
      align-items: flex-start;
      justify-content: center;
      padding: 5rem 1rem 1rem;
      opacity: 0;
      transition: opacity 0.2s ease;
    }
    .modal-backdrop.open {
      display: flex;
      opacity: 1;
    }
    .modal-content {
      width: 100%;
      max-width: 500px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      overflow: hidden;
      transform: translateY(-16px);
      opacity: 0;
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
    }
    .modal-backdrop.open .modal-content {
      transform: translateY(0);
      opacity: 1;
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.875rem 1.125rem;
      border-bottom: 1px solid var(--border);
    }
    .modal-title {
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--text);
    }
    .modal-close {
      width: 28px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 1.4rem;
      line-height: 1;
      border-radius: 6px;
      transition: background 0.15s;
    }
    .modal-close:hover {
      background: var(--border-light);
      color: var(--text);
    }
    .modal-body {
      padding: 1rem 1.125rem 1.25rem;
    }
    .modal-section {
      margin-top: 1rem;
    }
    .modal-section-first { margin-top: 0; }
    .modal-section-label {
      font-size: 0.65rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }
    .modal-hint {
      margin-top: 0.75rem;
      font-size: 0.7rem;
      color: var(--text-subtle);
      text-align: center;
    }

    /* ============================================
       통계 Bento 그리드 (모달 내부)
       ============================================ */
    .stats-bento {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.6rem;
    }
    @media (min-width: 520px) {
      .stats-bento { grid-template-columns: repeat(3, 1fr); }
    }
    @media (max-width: 400px) {
      .stats-bento { grid-template-columns: repeat(2, 1fr); }
    }
    .stats-bento-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 0.75rem 0.5rem;
      text-align: center;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .stats-bento-card:hover {
      transform: translateY(-1px);
      box-shadow: var(--shadow-md);
    }
    .stats-bento-icon {
      font-size: 1rem;
      opacity: 0.8;
      margin-bottom: 0.2rem;
    }
    .stats-bento-value {
      font-size: 1rem;
      font-weight: 700;
      color: var(--text);
      line-height: 1.1;
      font-variant-numeric: tabular-nums;
    }
    .stats-bento-suffix {
      font-size: 0.7rem;
      color: var(--text-subtle);
      font-weight: 500;
    }
    .stats-bento-label {
      font-size: 0.6rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-weight: 600;
    }
    @media (max-width: 900px) {
      .stats-bento { grid-template-columns: repeat(3, 1fr); }
    }
    @media (max-width: 500px) {
      .stats-bento { grid-template-columns: repeat(2, 1fr); }
    }

    /* ============================================
       검색바 + 필터
       ============================================ */
    .search-bar {
      position: relative;
      margin-bottom: 0.5rem;
    }
    #search-input {
      width: 100%;
      padding: 0.7rem 0.9rem;
      padding-right: 4.5rem;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--card-bg);
      color: var(--text);
      font-size: 0.85rem;
      outline: none;
      transition: all 0.15s;
      -webkit-appearance: none;
    }
    #search-input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }
    .search-count {
      position: absolute;
      right: 0.9rem;
      top: 50%;
      transform: translateY(-50%);
      font-size: 0.7rem;
      color: var(--text-muted);
      pointer-events: none;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
    }
    .filter-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
      flex-wrap: wrap;
    }
    .filter-chips {
      display: flex;
      gap: 0.375rem;
      flex-wrap: wrap;
    }
    .filter-chip {
      padding: 0.3rem 0.75rem;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 999px;
      font-size: 0.7rem;
      color: var(--text-muted);
      cursor: pointer;
      font-weight: 600;
      transition: all 0.15s;
      font-family: inherit;
    }
    .filter-chip:hover {
      border-color: var(--primary);
      color: var(--primary);
    }
    .filter-chip.active {
      background: var(--primary);
      color: white;
      border-color: var(--primary);
      box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);
    }
    .grouping-toggle {
      display: inline-flex;
      background: var(--border-light);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 2px;
      flex-shrink: 0;
    }
    .grouping-toggle-btn {
      padding: 0.25rem 0.7rem;
      border: none;
      background: transparent;
      font-size: 0.68rem;
      color: var(--text-muted);
      cursor: pointer;
      border-radius: 999px;
      font-weight: 600;
      font-family: inherit;
      transition: all 0.15s;
    }
    .grouping-toggle-btn:hover {
      color: var(--text);
    }
    .grouping-toggle-btn.active {
      background: var(--card-bg);
      color: var(--label-color, var(--text));
      box-shadow: var(--shadow-sm);
    }

    /* ============================================
       탭 (가로 스크롤)
       ============================================ */
    .tabs-wrapper {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      margin: 0 -1rem;
      padding: 0 1rem 0.6rem;
    }
    .tabs-wrapper::-webkit-scrollbar { display: none; }
    .tabs {
      display: flex;
      gap: 0.375rem;
      min-width: max-content;
    }
    .tab-btn {
      padding: 0.5rem 0.875rem;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--card-bg);
      color: var(--text-muted);
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-family: inherit;
    }
    .tab-btn:hover {
      border-color: var(--label-color, var(--primary));
      color: var(--label-color, var(--primary));
    }
    .tab-btn.active {
      background: var(--label-color, var(--primary));
      color: white;
      border-color: var(--label-color, var(--primary));
      box-shadow: 0 2px 8px color-mix(in srgb, var(--label-color, var(--primary)) 30%, transparent);
    }
    .tab-btn .count {
      background: rgba(0,0,0,0.08);
      padding: 0.1rem 0.45rem;
      border-radius: 999px;
      font-size: 0.65rem;
      font-variant-numeric: tabular-nums;
    }
    .tab-btn.active .count {
      background: rgba(255,255,255,0.25);
    }
    .tab-label-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      display: inline-block;
    }
    .tab-btn.active .tab-label-dot { display: none; }
    .cross-tab-btn {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: white;
      border-color: transparent;
    }
    .cross-tab-btn.active {
      background: linear-gradient(135deg, #4f46e5, #7c3aed);
    }
    .excluded-tab-btn {
      opacity: 0.65;
    }

    /* ============================================
       메인 컨테이너
       ============================================ */
    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 1rem;
    }
    .tab-content { display: none; }
    .tab-content.active { display: block; animation: fadeIn 0.25s ease; }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* ============================================
       라벨 통계 바
       ============================================ */
    .label-stats-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.6rem 0.8rem;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-left: 3px solid var(--label-color, var(--primary));
      border-radius: 8px;
      margin-bottom: 1rem;
      font-size: 0.75rem;
      color: var(--text-muted);
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .label-stats-left {
      display: flex;
      gap: 0.75rem;
      align-items: center;
      flex-wrap: wrap;
    }
    .label-stat-main {
      font-weight: 700;
      color: var(--text);
    }
    .label-stat {
      font-weight: 500;
    }

    /* ============================================
       출처 그룹 헤더 (출처별 모드)
       ============================================ */
    .source-group-header {
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--text-muted);
      padding: 0.5rem 0.75rem;
      background: var(--card-bg);
      border-left: 3px solid var(--label-color, var(--primary));
      border-radius: 6px;
      margin-top: 0.75rem;
      margin-bottom: 0.25rem;
    }
    .items-list > .source-group-header:first-child {
      margin-top: 0;
    }

    /* ============================================
       아이템 카드 (F-패턴 최적화)
       ============================================ */
    .items-list {
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
    }
    .item {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-left: 4px solid var(--label-color, var(--primary));
      border-radius: var(--radius);
      padding: 1.125rem 1.25rem;
      transition: all 0.2s ease;
      position: relative;
    }
    .item:hover {
      box-shadow: var(--shadow-lg);
      transform: translateY(-1px);
    }
    .item-meta-top {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.35rem;
      font-size: 0.7rem;
      flex-wrap: wrap;
      padding-right: 2.5rem; /* #번호 공간 확보 */
    }
    .item-source {
      color: var(--label-color, var(--text-muted));
      font-weight: 700;
      text-transform: none;
      letter-spacing: 0.01em;
    }
    .item-source::before {
      content: '📰';
      margin-right: 0.3rem;
      opacity: 0.7;
    }
    .item-time {
      color: var(--text-subtle);
      font-weight: 500;
      font-size: 0.68rem;
      font-variant-numeric: tabular-nums;
    }
    .item-time::before {
      content: '·';
      margin: 0 0.4rem;
      opacity: 0.5;
    }
    .item-meta-top:not(:has(.item-source)) .item-time::before {
      display: none;
    }
    .item-number {
      position: absolute;
      top: 0.85rem;
      right: 1rem;
      font-size: 0.62rem;
      color: var(--text-subtle);
      background: var(--border-light);
      padding: 0.12rem 0.45rem;
      border-radius: 999px;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      line-height: 1.4;
    }
    .item-title {
      font-size: 1.05rem;
      font-weight: 700;
      line-height: 1.45;
      color: var(--text);
      margin-bottom: 0.6rem;
      letter-spacing: -0.005em;
      padding-right: 2.5rem; /* #번호 공간 확보 */
    }
    .item-summary {
      font-size: 0.875rem;
      line-height: 1.75;
      color: var(--text);
      margin-bottom: 0.875rem;
      white-space: pre-wrap;
      word-break: keep-all;
      overflow-wrap: break-word;
    }
    .keywords {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin-bottom: 0.875rem;
    }
    .tag {
      background: color-mix(in srgb, var(--label-color, var(--primary)) 8%, transparent);
      color: var(--label-color, var(--primary));
      padding: 0.2rem 0.6rem;
      border-radius: 6px;
      font-size: 0.72rem;
      font-weight: 600;
      border: 1px solid color-mix(in srgb, var(--label-color, var(--primary)) 18%, transparent);
    }
    /* 인사이트 탭 + 원문 버튼이 같이 있는 푸터 행 */
    .item-footer-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 0.5rem;
      flex-wrap: wrap;
    }
    .insights-tabs-spacer {
      flex: 1;
    }
    .item-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.5rem 0.9rem;
      border-radius: 8px;
      font-size: 0.78rem;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.15s;
      font-family: inherit;
      border: none;
      cursor: pointer;
    }
    .item-btn-primary {
      background: var(--label-color, var(--primary));
      color: white;
    }
    .item-btn-primary:hover {
      transform: translateX(2px);
      box-shadow: 0 4px 12px color-mix(in srgb, var(--label-color, var(--primary)) 35%, transparent);
    }
    .item-btn-gmail {
      background: #f1f5f9;
      color: #475569;
      border: 1px solid var(--border);
    }
    .item-btn-gmail:hover {
      background: #e2e8f0;
    }

    /* ============================================
       인사이트 탭 (카드 내부) + 원문 버튼
       ============================================ */
    .insights-container {
      margin-top: 0.875rem;
      padding-top: 0.75rem;
      border-top: 1px dashed var(--border);
    }
    .insights-tabs {
      display: flex;
      gap: 0.25rem;
      flex-wrap: wrap;
    }
    .insight-tab {
      padding: 0.4rem 0.75rem;
      background: transparent;
      border: 1px solid transparent;
      font-size: 0.72rem;
      color: var(--text-muted);
      cursor: pointer;
      border-radius: 6px;
      font-weight: 600;
      font-family: inherit;
      transition: all 0.15s;
    }
    .insight-tab:hover {
      background: var(--border-light);
      color: var(--text);
    }
    .insight-tab.active {
      background: color-mix(in srgb, var(--label-color, var(--primary)) 10%, transparent);
      color: var(--label-color, var(--primary));
    }
    .insight-panel {
      display: none;
      padding: 0.875rem 1rem;
      background: color-mix(in srgb, var(--label-color, var(--primary)) 4%, transparent);
      border-radius: 8px;
      font-size: 0.85rem;
      line-height: 1.75;
      color: var(--text);
      animation: fadeIn 0.2s ease;
    }
    .insight-panel.active { display: block; }

    /* ============================================
       크로스 인사이트 카드
       ============================================ */
    .cross-section {
      margin-bottom: 1.5rem;
    }
    .cross-section-title {
      font-size: 1rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
      padding-bottom: 0.4rem;
      border-bottom: 2px solid var(--border);
    }
    .cross-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.125rem 1.25rem;
      margin-bottom: 0.75rem;
      transition: box-shadow 0.15s;
    }
    .cross-card:hover { box-shadow: var(--shadow-md); }
    .mega-trend-card { border-left: 4px solid #6366f1; }
    .cross-connection-card { border-left: 4px solid #f59e0b; }
    .action-item-card { border-left: 4px solid #10b981; }
    .cross-card-title {
      font-size: 0.95rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      line-height: 1.4;
    }
    .cross-card-desc {
      font-size: 0.85rem;
      line-height: 1.7;
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
      padding: 0.2rem 0.55rem;
      border-radius: 6px;
      background: color-mix(in srgb, var(--label-color, var(--text-muted)) 10%, transparent);
      color: var(--text);
      border: 1px solid color-mix(in srgb, var(--label-color, var(--text-muted)) 20%, transparent);
    }
    .related-item-tag .label-name {
      font-weight: 700;
      color: var(--label-color, var(--primary));
      margin-right: 0.3rem;
    }
    .action-top {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      margin-bottom: 0.5rem;
      flex-wrap: wrap;
    }
    .action-timeline {
      font-size: 0.65rem;
      font-weight: 700;
      padding: 0.15rem 0.55rem;
      border-radius: 999px;
      background: #ecfdf5;
      color: #065f46;
      text-transform: uppercase;
    }
    .action-label-tag {
      font-size: 0.7rem;
      font-weight: 700;
    }

    /* ============================================
       제외 그룹
       ============================================ */
    .excluded-group {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
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
    .excluded-reason { font-weight: 700; font-size: 0.85rem; }
    .excluded-count {
      font-size: 0.7rem;
      background: var(--border);
      color: var(--text-muted);
      padding: 0.15rem 0.55rem;
      border-radius: 999px;
      font-weight: 600;
    }
    .excluded-item {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      padding: 0.5rem 1rem;
      border-bottom: 1px solid var(--border-light);
      font-size: 0.78rem;
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
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .excluded-label-tag {
      font-size: 0.65rem;
      font-weight: 700;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      background: var(--border-light);
    }

    /* ============================================
       검색 하이라이트
       ============================================ */
    mark {
      background: #fef08a;
      color: #854d0e;
      padding: 0.1rem 0.25rem;
      border-radius: 3px;
      font-weight: 600;
    }

    /* ============================================
       No results / empty state
       ============================================ */
    .no-items, .no-search-results {
      text-align: center;
      color: var(--text-muted);
      padding: 3rem 1rem;
      font-size: 0.9rem;
    }
    .no-search-results { display: none; }

    /* ============================================
       미니맵 (데스크톱 좌측, 컨테이너에 가까이 배치)
       ============================================ */
    .minimap {
      position: fixed;
      /* 컨테이너(max-width 900px) 좌측 바로 옆 — 12px gap */
      /* minimap width(160) + gap(12) = 172 */
      left: calc(50vw - 450px - 172px);
      top: 50%;
      transform: translateY(-50%);
      width: 160px;
      max-height: 70vh;
      overflow-y: auto;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 0.75rem 0.5rem;
      font-size: 0.7rem;
      box-shadow: var(--shadow-md);
      display: none;
      z-index: 50;
    }
    .minimap-title {
      font-size: 0.65rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.4rem;
      padding: 0 0.4rem;
    }
    .minimap-item {
      display: block;
      padding: 0.3rem 0.5rem;
      color: var(--text-muted);
      cursor: pointer;
      border-radius: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-decoration: none;
      font-size: 0.72rem;
      line-height: 1.4;
      transition: all 0.1s;
      border-left: 2px solid transparent;
    }
    .minimap-item:hover {
      background: var(--border-light);
      color: var(--text);
    }
    .minimap-item.active {
      background: color-mix(in srgb, var(--label-color, var(--primary)) 10%, transparent);
      color: var(--label-color, var(--primary));
      border-left-color: var(--label-color, var(--primary));
      font-weight: 600;
    }
    /* 미니맵 표시: 컨테이너(900) + 미니맵(160) + gap(12) + 여백(24) = 1120px 이상 */
    @media (min-width: 1120px) {
      .minimap { display: block; }
    }

    /* ============================================
       Scroll to top button
       ============================================ */
    .scroll-top-btn {
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      width: 42px;
      height: 42px;
      border-radius: 50%;
      border: none;
      background: var(--primary);
      color: white;
      font-size: 1.2rem;
      font-weight: 700;
      cursor: pointer;
      box-shadow: var(--shadow-lg);
      display: none;
      z-index: 90;
      transition: transform 0.2s;
    }
    .scroll-top-btn.visible { display: block; }
    .scroll-top-btn:hover { transform: translateY(-2px); }

    /* ============================================
       다크모드 (정교화)
       ============================================ */
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0b1120;
        --card-bg: #1e293b;
        --text: #f1f5f9;
        --text-muted: #94a3b8;
        --text-subtle: #64748b;
        --border: #334155;
        --border-light: #1e293b;
      }
      .header-container {
        background: rgba(11, 17, 32, 0.85);
      }
      mark {
        background: #facc15;
        color: #422006;
      }
      .excluded-group-header {
        background: #0f172a;
      }
      .item-btn-gmail {
        background: #334155;
        color: #cbd5e1;
      }
      .item-btn-gmail:hover {
        background: #475569;
      }
      .action-timeline {
        background: #064e3b;
        color: #6ee7b7;
      }
    }

    /* ============================================
       인쇄 최적화
       ============================================ */
    @media print {
      .header-container { position: static; border: none; background: white; }
      .tabs-wrapper, .search-bar, .filter-bar, .minimap, .scroll-top-btn, .item-actions, .insights-tabs { display: none !important; }
      .tab-content { display: block !important; page-break-after: always; }
      .tab-content::before { content: attr(id); font-size: 1.4rem; font-weight: 700; display: block; margin-bottom: 1rem; }
      .item { break-inside: avoid; box-shadow: none; border: 1px solid #ddd; }
      .insight-panel { display: block !important; margin-top: 0.5rem; background: #f8f8f8 !important; }
      body { background: white; color: black; font-size: 10pt; line-height: 1.5; }
      .container { max-width: 100%; padding: 0.5rem; }
      .stats-bento { grid-template-columns: repeat(6, 1fr); page-break-after: avoid; }
    }

    /* ============================================
       모바일
       ============================================ */
    @media (max-width: 640px) {
      .header-inner { padding: 0.625rem 0.75rem 0; }
      .header-title { font-size: 1.1rem; }
      .container { padding: 0.75rem; }
      .item { padding: 1rem; }
      .item-title { font-size: 1rem; }
      .item-summary { font-size: 0.84rem; }
      .filter-bar { gap: 0.375rem; }
      .filter-chip, .grouping-toggle-btn { font-size: 0.65rem; padding: 0.25rem 0.55rem; }
    }
  `;
}

// ============================================
// 클라이언트 스크립트
// ============================================

function generateScripts() {
  return `
    // ============================================
    // 탭 전환
    // ============================================
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        const target = document.getElementById('tab-' + btn.dataset.tab);
        if (target) target.classList.add('active');
        btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        applyAllFilters();
        buildMinimap();
        // 스크롤 위치 기억
        sessionStorage.setItem('activeTab', btn.dataset.tab);
      });
    });

    // ============================================
    // 인사이트 탭 (카드 내부)
    // ============================================
    document.querySelectorAll('.insight-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const targetId = tab.dataset.panel;
        const container = tab.closest('.insights-container');
        if (!container) return;
        container.querySelectorAll('.insight-tab').forEach(t => t.classList.remove('active'));
        container.querySelectorAll('.insight-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = document.getElementById(targetId);
        if (panel) panel.classList.add('active');
      });
    });

    // ============================================
    // 필터 상태
    // ============================================
    const filterState = {
      search: '',
      chips: new Set(['all']),
      grouping: 'label'
    };

    function applyAllFilters() {
      const activeTab = document.querySelector('.tab-content.active');
      if (!activeTab) return;

      const items = activeTab.querySelectorAll('.item');
      let visible = 0, total = 0;

      items.forEach(item => {
        total++;
        let show = true;

        // 검색어 (본문 + 키워드)
        if (filterState.search) {
          const text = (item.textContent || '').toLowerCase();
          const keywords = (item.dataset.keywords || '').toLowerCase();
          if (!text.includes(filterState.search) && !keywords.includes(filterState.search)) show = false;
        }

        // 필터 칩
        if (show && !filterState.chips.has('all')) {
          if (filterState.chips.has('has-insight') && item.dataset.hasInsight !== 'true') show = false;
          if (filterState.chips.has('has-link') && item.dataset.hasLink !== 'true') show = false;
          if (filterState.chips.has('long') && item.dataset.long !== 'true') show = false;
        }

        item.style.display = show ? '' : 'none';
        if (show) visible++;
      });

      // 카운트 업데이트
      const searchCount = document.getElementById('search-count');
      if (searchCount) {
        searchCount.textContent = (filterState.search || !filterState.chips.has('all')) ? (visible + '/' + total) : '';
      }

      // 하이라이팅
      unhighlightMatches(activeTab);
      if (filterState.search) {
        highlightMatches(activeTab, filterState.search);
      }

      // 결과 없음
      let noResults = activeTab.querySelector('.no-search-results');
      if (visible === 0 && (filterState.search || !filterState.chips.has('all'))) {
        if (!noResults) {
          noResults = document.createElement('div');
          noResults.className = 'no-search-results';
          noResults.textContent = '검색 결과가 없습니다.';
          const list = activeTab.querySelector('.items-list');
          if (list) list.appendChild(noResults);
        }
        if (noResults) noResults.style.display = 'block';
      } else if (noResults) {
        noResults.style.display = 'none';
      }

      buildMinimap();
    }

    // ============================================
    // 검색 하이라이팅
    // ============================================
    function highlightMatches(container, query) {
      const items = container.querySelectorAll('.item');
      const selectors = '.item-title, .item-summary, .item-source, .insight-panel';
      const re = new RegExp('(' + query.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + ')', 'gi');

      items.forEach(item => {
        if (item.style.display === 'none') return;
        item.querySelectorAll(selectors).forEach(el => {
          // 이전 하이라이트 제거
          const original = el.dataset.original || el.innerHTML;
          if (!el.dataset.original) el.dataset.original = original;
          el.innerHTML = original.replace(re, '<mark>$1</mark>');
        });
      });
    }

    function unhighlightMatches(container) {
      container.querySelectorAll('[data-original]').forEach(el => {
        el.innerHTML = el.dataset.original;
        delete el.dataset.original;
      });
    }

    // ============================================
    // 검색 입력
    // ============================================
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      let timer = null;
      searchInput.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          filterState.search = searchInput.value.toLowerCase().trim();
          applyAllFilters();
        }, 160);
      });
    }

    // ============================================
    // 필터 칩 + 필터 활성화 표시 (dot)
    // ============================================
    function updateFilterDot() {
      const btn = document.getElementById('filter-btn');
      if (!btn) return;
      const hasActive = !filterState.chips.has('all');
      btn.classList.toggle('has-active', hasActive);
    }

    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const f = chip.dataset.filter;
        if (f === 'all') {
          filterState.chips = new Set(['all']);
          document.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === 'all'));
        } else {
          filterState.chips.delete('all');
          if (filterState.chips.has(f)) {
            filterState.chips.delete(f);
            chip.classList.remove('active');
            if (filterState.chips.size === 0) {
              filterState.chips.add('all');
              const allChip = document.querySelector('.filter-chip[data-filter="all"]');
              if (allChip) allChip.classList.add('active');
            }
          } else {
            filterState.chips.add(f);
            chip.classList.add('active');
            const allChip = document.querySelector('.filter-chip[data-filter="all"]');
            if (allChip) allChip.classList.remove('active');
          }
        }
        updateFilterDot();
        applyAllFilters();
      });
    });

    // ============================================
    // 그룹핑 토글 (이벤트 위임 — 탭마다 존재)
    // ============================================
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.grouping-toggle-btn');
      if (!btn) return;
      const group = btn.dataset.group;
      filterState.grouping = group;
      // 모든 grouping-toggle의 active 상태 동기화
      document.querySelectorAll('.grouping-toggle-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.group === group);
      });
      applyGrouping();
    });

    function applyGrouping() {
      // 모든 라벨 탭에 적용
      document.querySelectorAll('.tab-content').forEach(tabContent => {
        const list = tabContent.querySelector('.items-list');
        if (!list) return;

        const items = Array.from(list.querySelectorAll('.item'));
        if (items.length === 0) return;

        if (filterState.grouping === 'source') {
          items.sort((a, b) => {
            const sa = (a.dataset.source || '').toLowerCase();
            const sb = (b.dataset.source || '').toLowerCase();
            return sa.localeCompare(sb);
          });
          list.querySelectorAll('.source-group-header').forEach(h => h.remove());

          let currentSource = null;
          const fragment = document.createDocumentFragment();
          items.forEach(item => {
            const src = item.dataset.source || '(출처 없음)';
            if (src !== currentSource) {
              const header = document.createElement('div');
              header.className = 'source-group-header';
              header.textContent = '📰 ' + src;
              fragment.appendChild(header);
              currentSource = src;
            }
            fragment.appendChild(item);
          });
          list.innerHTML = '';
          list.appendChild(fragment);
        } else {
          list.querySelectorAll('.source-group-header').forEach(h => h.remove());
          items.sort((a, b) => {
            const ia = parseInt(a.dataset.originalIndex || '0', 10);
            const ib = parseInt(b.dataset.originalIndex || '0', 10);
            return ia - ib;
          });
          items.forEach(item => list.appendChild(item));
        }
      });

      // 미니맵도 재구성
      buildMinimap();
    }

    // 원본 인덱스 저장 (정렬 복원용)
    document.querySelectorAll('.items-list').forEach(list => {
      list.querySelectorAll('.item').forEach((item, i) => {
        item.dataset.originalIndex = String(i);
      });
    });

    // ============================================
    // 미니맵
    // ============================================
    let minimapObserver = null;
    let minimapVisibleItems = [];

    function buildMinimap() {
      const minimap = document.getElementById('minimap');
      const list = document.getElementById('minimap-list');
      if (!minimap || !list) return;

      const activeTab = document.querySelector('.tab-content.active');
      if (!activeTab) {
        minimap.style.display = 'none';
        return;
      }

      // display:none이 아닌 아이템만
      const allItems = activeTab.querySelectorAll('.item');
      const items = Array.from(allItems).filter(el => el.style.display !== 'none');

      // 5개 미만이면 숨김
      if (items.length < 5) {
        minimap.style.display = 'none';
        return;
      }

      // 1120px 이상에서만 표시
      if (window.innerWidth < 1120) {
        minimap.style.display = 'none';
        return;
      }

      minimap.style.display = 'block';
      list.innerHTML = '';
      minimapVisibleItems = items;

      items.forEach((item, idx) => {
        const titleEl = item.querySelector('.item-title');
        if (!titleEl) return;
        const title = titleEl.textContent.substring(0, 28);
        const a = document.createElement('a');
        a.className = 'minimap-item';
        a.textContent = (idx + 1) + '. ' + title;
        a.href = '#';
        a.dataset.minimapIdx = String(idx);
        const labelColor = getComputedStyle(item).getPropertyValue('--label-color').trim() || 'var(--primary)';
        if (labelColor) a.style.setProperty('--label-color', labelColor);
        a.addEventListener('click', (e) => {
          e.preventDefault();
          const offset = 120; // sticky header 보정
          const top = item.getBoundingClientRect().top + window.scrollY - offset;
          window.scrollTo({ top, behavior: 'smooth' });
          document.querySelectorAll('.minimap-item').forEach(m => m.classList.remove('active'));
          a.classList.add('active');
        });
        list.appendChild(a);
      });

      // 관찰자 재설정
      if (minimapObserver) minimapObserver.disconnect();
      minimapObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const item = entry.target;
            const idx = minimapVisibleItems.indexOf(item);
            if (idx >= 0) {
              document.querySelectorAll('.minimap-item').forEach((m, i) => {
                m.classList.toggle('active', i === idx);
              });
              // 활성 아이템을 미니맵 뷰포트 내로 스크롤
              const activeEl = list.querySelector('.minimap-item.active');
              if (activeEl) {
                activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              }
            }
          }
        });
      }, { rootMargin: '-30% 0px -60% 0px', threshold: 0 });

      items.forEach(item => minimapObserver.observe(item));
    }

    // 윈도우 리사이즈 시 미니맵 재구성
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(buildMinimap, 200);
    });

    // ============================================
    // Scroll to top
    // ============================================
    const scrollTopBtn = document.getElementById('scroll-top-btn');
    if (scrollTopBtn) {
      window.addEventListener('scroll', () => {
        scrollTopBtn.classList.toggle('visible', window.scrollY > 400);
      });
      scrollTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    // ============================================
    // 모달 (검색/통계)
    // ============================================
    function openModal(id) {
      const modal = document.getElementById(id);
      if (!modal) return;
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      // 검색 모달이면 input 자동 포커스
      if (id === 'search-modal') {
        setTimeout(() => {
          const input = document.getElementById('search-input');
          if (input) input.focus();
        }, 100);
      }
      // body 스크롤 잠금
      document.body.style.overflow = 'hidden';
    }

    function closeModal(id) {
      const modal = document.getElementById(id);
      if (!modal) return;
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    function closeAllModals() {
      document.querySelectorAll('.modal-backdrop.open').forEach(m => {
        m.classList.remove('open');
        m.setAttribute('aria-hidden', 'true');
      });
      document.body.style.overflow = '';
    }

    // 트리거 버튼
    const searchBtn = document.getElementById('search-btn');
    const filterBtn = document.getElementById('filter-btn');
    const statsBtn = document.getElementById('stats-btn');
    if (searchBtn) searchBtn.addEventListener('click', () => openModal('search-modal'));
    if (filterBtn) filterBtn.addEventListener('click', () => openModal('filter-modal'));
    if (statsBtn) statsBtn.addEventListener('click', () => openModal('stats-modal'));

    // 닫기 버튼
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });

    // 백드롭 클릭 → 닫기
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          backdrop.classList.remove('open');
          backdrop.setAttribute('aria-hidden', 'true');
          document.body.style.overflow = '';
        }
      });
    });

    // ESC → 모달 닫기 또는 검색 초기화
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const openModalEl = document.querySelector('.modal-backdrop.open');
        if (openModalEl) {
          e.preventDefault();
          closeModal(openModalEl.id);
        }
      }
      // Cmd/Ctrl + K → 검색 모달 열기
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openModal('search-modal');
      }
    });

    // ============================================
    // 초기화
    // ============================================
    // 저장된 탭 복원
    const savedTab = sessionStorage.getItem('activeTab');
    if (savedTab) {
      const btn = document.querySelector('.tab-btn[data-tab="' + savedTab + '"]');
      if (btn) btn.click();
    }

    // 초기 미니맵 구성 (짧은 지연으로 렌더 완료 대기)
    setTimeout(buildMinimap, 100);
  `;
}

// ============================================
// 외부 API: 파일 입력으로 생성
// ============================================

function generateCombinedFromMergedFiles(mergedDir, outputPath, date) {
  const allLabelsData = [];
  const files = fs.readdirSync(mergedDir).filter(f => f.startsWith('merged_') && f.endsWith('.json'));

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(mergedDir, file), 'utf8'));
      allLabelsData.push(data);
    } catch (e) {
      console.warn(`${file} 파싱 실패: ${e.message}`);
    }
  }

  // 제외 메일
  const allExcluded = [];
  for (const data of allLabelsData) {
    if (data.excluded?.length > 0) {
      allExcluded.push(...data.excluded.map(e => ({ ...e, label: data.label })));
    }
  }
  const excludedFiles = fs.readdirSync(mergedDir).filter(f => f.startsWith('excluded_') && f.endsWith('.json'));
  for (const file of excludedFiles) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(mergedDir, file), 'utf8'));
      if (data.excluded) allExcluded.push(...data.excluded.map(e => ({ ...e, label: data.label })));
    } catch (e) { /* skip */ }
  }

  const filteredLabelsData = allLabelsData.filter(d => d.items?.length > 0);
  filteredLabelsData.sort((a, b) => a.label.localeCompare(b.label, 'ko'));

  // 크로스 인사이트
  let crossInsight = null;
  const crossPath = path.join(mergedDir, '_cross_insight.json');
  if (fs.existsSync(crossPath)) {
    try { crossInsight = JSON.parse(fs.readFileSync(crossPath, 'utf8')); } catch (e) { /* skip */ }
  }

  // 실행 통계
  let runStats = null;
  const statsPath = path.join(mergedDir, '_run_stats.json');
  if (fs.existsSync(statsPath)) {
    try { runStats = JSON.parse(fs.readFileSync(statsPath, 'utf8')); } catch (e) { /* skip */ }
  }

  const html = generateCombinedHtmlReport(filteredLabelsData, date, crossInsight, allExcluded, runStats);
  fs.writeFileSync(outputPath, html, 'utf8');
  console.log(`✓ 리포트 생성: ${outputPath}`);
  return outputPath;
}

module.exports = {
  generateCombinedHtmlReport,
  generateCombinedFromMergedFiles,
  LABEL_COLORS,
  getLabelColor,
  escapeHtml
};
