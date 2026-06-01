/**
 * render_report.js — 토스 스타일 뉴스레터 리포트 렌더러 (가독성 우선 신규 설계)
 * 기준 문서: docs/REPORT_UI.md
 *
 * renderReport(allLabelsData, dateStr) -> HTML 문자열
 * renderReportFromMergedDir(mergedDir, outPath, dateStr) -> 파일 작성
 *
 * allLabelsData: [{ label, items:[{title,summary,keywords[],link,source,message_id}], stats }]
 */
const fs = require('fs');
const path = require('path');
const { clusterItemsByKeyword } = require('./orchestrator')._test;

const LABEL_COLORS = {
  'IT': '#3b82f6', '경제': '#10b981', '투자': '#8b5cf6', '시사': '#ef4444',
  '인문학': '#ec4899', '해외': '#f97316', '라이프': '#06b6d4', '창업': '#f59e0b',
  '기타': '#64748b', '마케팅': '#84cc16', '스포츠': '#14b8a6', '소셜포럼': '#a855f7',
  'NYT': '#1a1a1a', '미국': '#2563eb', '중국': '#dc2626',
};
function getLabelColor(label) {
  if (LABEL_COLORS[label]) return LABEL_COLORS[label];
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 65% 50%)`;
}
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function safeUrl(u) {
  if (!u || typeof u !== 'string') return '';
  const t = u.trim();
  return /^https?:\/\//i.test(t) ? t : '';
}
function safeId(s) { return String(s).replace(/[^a-zA-Z0-9가-힣_-]/g, '_'); }
function gmailUrlOf(mid) {
  return (mid && /^[a-zA-Z0-9_-]+$/.test(mid)) ? `https://mail.google.com/mail/u/0/#all/${mid}` : '';
}
function isListType(items) {
  if (!items || items.length < 30) return false;
  if (items.length >= 60) return true; // 고볼륨(예: NYT 브리핑 집합)은 가독성 위해 목록형
  const avg = items.reduce((s, i) => s + (i.summary ? i.summary.length : 0), 0) / items.length;
  return avg < 100;
}
function firstSentence(s, max = 64) {
  if (!s) return '';
  const t = s.replace(/\s+/g, ' ').trim();
  const cut = t.split(/(?<=[.!?。])\s/)[0] || t;
  return cut.length > max ? cut.slice(0, max) + '…' : cut;
}

// --- 버튼 ---
function buttonsHtml(item, mini) {
  const link = safeUrl(item.link);
  const gmail = gmailUrlOf(item.message_id);
  const cls = mini ? 'mini' : '';
  let h = '';
  if (link) h += `<a class="btn btn-primary ${cls}" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">원문 보기</a>`;
  if (gmail) h += `<a class="btn btn-ghost ${cls}" href="${escapeHtml(gmail)}" target="_blank" rel="noopener noreferrer">Gmail에서 보기</a>`;
  return h;
}

// --- 키워드 칩 ---
function chipsHtml(keywords) {
  const ks = (keywords || []).filter(Boolean).slice(0, 6);
  if (!ks.length) return '';
  return `<div class="chips">${ks.map(k => `<span class="chip">#${escapeHtml(k)}</span>`).join('')}</div>`;
}

function searchData(item) {
  return escapeHtml([(item.title || ''), (item.summary || ''), (item.keywords || []).join(' '), (item.source || '')].join(' ').toLowerCase());
}

// --- 일반 카드 ---
function renderCard(item) {
  const title = escapeHtml(item.title || '(제목 없음)');
  const link = safeUrl(item.link);
  const titleHtml = link
    ? `<a class="card-title" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${title}</a>`
    : `<span class="card-title">${title}</span>`;
  const summary = escapeHtml(item.summary || '');
  const isLong = (item.summary || '').length >= 400;
  const source = escapeHtml(item.source || '');
  return `<article class="card" data-search="${searchData(item)}">
    ${titleHtml}
    <p class="card-summary${isLong ? ' clamp' : ''}">${summary}</p>
    ${isLong ? '<button class="more-btn" type="button">더 보기</button>' : ''}
    ${chipsHtml(item.keywords)}
    <div class="card-foot">
      <span class="card-source">${source}</span>
      <span class="card-btns">${buttonsHtml(item, false)}</span>
    </div>
  </article>`;
}

// --- 목록형 아이템 (전체 요약 표시, 카드보다 컴팩트한 리스트 스타일) ---
function renderRow(item) {
  const title = escapeHtml(item.title || '(제목 없음)');
  const link = safeUrl(item.link);
  const titleHtml = link
    ? `<a class="row-title" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${title}</a>`
    : `<span class="row-title">${title}</span>`;
  const summary = escapeHtml(item.summary || '');
  const source = escapeHtml(item.source || '');
  return `<li class="row" data-search="${searchData(item)}">
    <div class="row-head">${titleHtml}</div>
    ${summary ? `<p class="row-summary">${summary}</p>` : ''}
    ${chipsHtml(item.keywords)}
    <div class="row-foot">
      <span class="row-source">${source}</span>
      <span class="row-btns">${buttonsHtml(item, true)}</span>
    </div>
  </li>`;
}

// --- 라벨 섹션 ---
function renderLabelSection(data, idx) {
  const label = data.label;
  const items = data.items || [];
  const color = getLabelColor(label);
  const safe = safeId(label);
  const dupRemoved = data.stats && data.stats.duplicates_removed ? data.stats.duplicates_removed : 0;
  const statLine = `<div class="sec-stat"><span>📰 ${items.length}개</span>${dupRemoved ? `<span class="dim">· 중복 ${dupRemoved} 제거</span>` : ''}</div>`;

  // 메일(message_id)별 그룹 → "KDI류"(한 메일이 짧은 항목 다수)만 목록형으로.
  // 긴 기사형 뉴스레터는 항목 수가 많아도 카드로 유지.
  const groups = {};
  for (const it of items) { const m = it.message_id || '_'; (groups[m] = groups[m] || []).push(it); }
  const listMsgIds = new Set();
  for (const m of Object.keys(groups)) {
    const g = groups[m];
    const avg = g.reduce((s, i) => s + (i.summary || '').length, 0) / g.length;
    if (g.length >= 25 && avg < 90) listMsgIds.add(m);
  }
  const cardItems = items.filter(it => !listMsgIds.has(it.message_id || '_'));
  const listItems = items.filter(it => listMsgIds.has(it.message_id || '_'));

  const cardsHtml = cardItems.length ? `<div class="cards">${cardItems.map(renderCard).join('')}</div>` : '';
  const listHtml = listItems.length
    ? `<details class="list-toggle">
        <summary><span class="toggle-label">📋 간추린 소식 ${listItems.length}건</span><span class="toggle-chev">▾</span></summary>
        <ul class="rows">${listItems.map(renderRow).join('')}</ul>
      </details>` : '';

  return `<section class="label-sec${idx === 0 ? ' active' : ''}" id="sec-${safe}" data-label="${safe}" style="--label-color:${color}">
    ${statLine}
    ${cardsHtml}
    ${listHtml}
  </section>`;
}

function renderReport(allLabelsData, dateStr) {
  const data = (allLabelsData || []).filter(d => (d.items || []).length > 0)
    .sort((a, b) => a.label.localeCompare(b.label, 'ko'));
  const total = data.reduce((s, d) => s + d.items.length, 0);

  const nav = data.map((d, i) => {
    const color = getLabelColor(d.label);
    const safe = safeId(d.label);
    return `<button class="pill${i === 0 ? ' active' : ''}" data-target="sec-${safe}">
      <span class="pill-dot" style="background:${color}"></span>${escapeHtml(d.label)}<span class="pill-cnt">${d.items.length}</span>
    </button>`;
  }).join('');

  const sections = data.map(renderLabelSection).join('\n');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>오늘의 뉴스레터 · ${escapeHtml(dateStr)}</title>
<link rel="preconnect" href="https://cdn.jsdelivr.net">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css">
<style>${STYLES}</style>
</head>
<body>
<header class="hdr">
  <div class="hdr-row">
    <div class="hdr-titles"><h1>오늘의 뉴스레터</h1><span class="hdr-date">${escapeHtml(dateStr)}</span></div>
    <span class="hdr-badge">${total}개</span>
  </div>
  <div class="search-wrap">
    <svg class="search-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
    <input id="q" type="search" placeholder="제목·키워드로 찾기" aria-label="검색" autocomplete="off">
    <span id="qcount" class="search-count"></span>
  </div>
  <div class="nav-wrap">
    <button class="nav-arrow nav-prev" id="navPrev" type="button" aria-label="이전 라벨">‹</button>
    <nav class="pills" id="pills">${nav}</nav>
    <button class="nav-arrow nav-next" id="navNext" type="button" aria-label="다음 라벨">›</button>
  </div>
</header>
<main class="container" id="main">${sections || '<p class="empty">표시할 뉴스가 없습니다.</p>'}</main>
<footer class="ftr">YKS Newsletter · ${escapeHtml(dateStr)}</footer>
<script>${SCRIPT}</script>
</body>
</html>`;
}

const STYLES = `
:root{
  --bg:#F9FAFB;--card:#FFFFFF;--border:#ECEEF0;--line:#F2F4F6;
  --t1:#191F28;--t2:#4E5968;--t3:#8B95A1;
  --blue:#3182F6;--blue-bg:#E8F3FF;--shadow:0 1px 3px rgba(0,0,0,.04),0 1px 2px rgba(0,0,0,.05);
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--t1);
  font-family:"Pretendard Variable",Pretendard,system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;
  font-size:15.5px;line-height:1.65;letter-spacing:-.01em;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.container{max-width:720px;margin:0 auto;padding:16px 16px 64px}
/* 헤더 */
.hdr{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.86);backdrop-filter:saturate(180%) blur(12px);
  border-bottom:1px solid var(--border);padding:14px 16px 0}
.hdr-row{max-width:720px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px}
.hdr-titles{display:flex;align-items:baseline;gap:10px;min-width:0}
.hdr h1{font-size:20px;font-weight:700;margin:0;letter-spacing:-.02em}
.hdr-date{font-size:13px;color:var(--t3);flex:none}
.hdr-badge{flex:none;background:var(--blue-bg);color:var(--blue);font-weight:700;font-size:13px;padding:5px 11px;border-radius:999px}
.search-wrap{max-width:720px;margin:12px auto 0;display:flex;align-items:center;gap:8px;background:var(--line);border-radius:12px;padding:10px 13px}
.search-ico{color:var(--t3);flex:none}
#q{flex:1;border:0;background:transparent;font:inherit;font-size:15px;color:var(--t1);outline:none}
#q::placeholder{color:var(--t3)}
.search-count{font-size:13px;color:var(--t3);flex:none}
/* pill 내비 */
.nav-wrap{max-width:720px;margin:0 auto;display:flex;align-items:center;gap:6px}
.nav-arrow{flex:none;width:30px;height:30px;border-radius:50%;border:1px solid var(--border);background:#fff;color:var(--t2);font-size:17px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow);transition:background .15s}
.nav-arrow:hover{background:var(--line)}
.nav-arrow.hidden{display:none}
.pills{flex:1;min-width:0;display:flex;gap:8px;overflow-x:auto;padding:12px 0;scrollbar-width:none;scroll-behavior:smooth}
.pills::-webkit-scrollbar{display:none}
.pill{flex:none;display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);background:#fff;
  color:var(--t2);font:inherit;font-size:14px;font-weight:600;padding:7px 13px;border-radius:999px;cursor:pointer;transition:all .15s}
.pill:hover{background:var(--line)}
.pill.active{background:var(--t1);color:#fff;border-color:var(--t1)}
.pill-dot{width:7px;height:7px;border-radius:50%}
.pill.active .pill-dot{outline:1.5px solid rgba(255,255,255,.5)}
.pill-cnt{font-size:12px;font-weight:700;opacity:.6}
/* 섹션 */
.label-sec{display:none}
.label-sec.active{display:block;animation:fade .2s ease}
@keyframes fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.sec-stat{display:flex;gap:6px;align-items:center;font-size:13px;color:var(--t2);font-weight:600;margin:4px 2px 14px}
.sec-stat .dim{color:var(--t3);font-weight:500}
/* 카드 */
.cards{display:flex;flex-direction:column;gap:10px}
.card{background:var(--card);border:1px solid var(--border);border-radius:18px;padding:18px 18px 14px;box-shadow:var(--shadow)}
.card-title{display:block;font-size:17px;font-weight:600;line-height:1.45;color:var(--t1);letter-spacing:-.015em}
a.card-title:hover{color:var(--blue)}
.card-summary{margin:8px 0 0;font-size:15.5px;line-height:1.65;color:#333D4B;white-space:pre-line}
.card-summary.clamp{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.card-summary.show{-webkit-line-clamp:unset;overflow:visible}
.more-btn{margin-top:6px;background:none;border:0;color:var(--blue);font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;padding:2px 0}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.chip{background:var(--line);color:var(--t2);font-size:12.5px;font-weight:500;padding:4px 9px;border-radius:8px}
.card-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:14px;padding-top:12px;border-top:1px solid var(--line)}
.card-source{font-size:13px;color:var(--t3);font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card-btns{display:flex;gap:7px;flex:none}
/* 버튼 */
.btn{display:inline-flex;align-items:center;justify-content:center;font:inherit;font-size:13.5px;font-weight:600;
  padding:8px 14px;border-radius:10px;cursor:pointer;border:1px solid transparent;white-space:nowrap;transition:all .15s}
.btn-primary{background:var(--blue);color:#fff}
.btn-primary:hover{background:#1B64DA}
.btn-ghost{background:var(--line);color:var(--t2)}
.btn-ghost:hover{background:#E5E8EB}
.btn.mini{font-size:12.5px;padding:5px 10px;border-radius:8px}
/* 목록형 */
.insight{background:linear-gradient(180deg,#F8FBFF,#fff);border:1px solid var(--blue-bg);border-radius:18px;padding:16px 18px;margin-bottom:12px}
.insight-title{font-size:14px;font-weight:700;color:var(--blue);margin-bottom:10px}
.insight-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:7px}
.insight-list li{display:flex;gap:7px;align-items:baseline;font-size:15px}
.insight-rep{font-weight:600;color:var(--t1)}
.insight-cnt{font-size:13px;color:var(--t3);flex:none}
.list-toggle{background:var(--card);border:1px solid var(--border);border-radius:18px;box-shadow:var(--shadow);overflow:hidden;margin-top:12px}
.list-toggle>summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;
  padding:15px 18px;font-weight:700;font-size:15px;color:var(--t1)}
.list-toggle>summary::-webkit-details-marker{display:none}
.toggle-chev{color:var(--t3);transition:transform .2s}
.list-toggle[open]>summary{border-bottom:1px solid var(--line)}
.list-toggle[open] .toggle-chev{transform:rotate(180deg)}
.rows{list-style:none;margin:0;padding:0}
.row{padding:16px 18px;border-bottom:1px solid var(--line)}
.row:last-child{border-bottom:0}
.row-title{font-weight:600;font-size:16px;line-height:1.45;color:var(--t1);letter-spacing:-.01em}
a.row-title:hover{color:var(--blue)}
.row-summary{margin:7px 0 0;font-size:15px;line-height:1.62;color:#333D4B;white-space:pre-line}
.row .chips{margin-top:10px}
.row-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:11px}
.row-source{font-size:12.5px;color:var(--t3);font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row-btns{flex:none;display:flex;gap:6px}
.empty,.no-match{text-align:center;color:var(--t3);padding:48px 0;font-size:15px}
.ftr{text-align:center;color:var(--t3);font-size:12px;padding:24px 0 40px}
.hidden{display:none!important}
@media (max-width:480px){
  .container{padding:12px 12px 56px}
  .card{padding:16px 15px 12px;border-radius:16px}
  .card-foot{flex-direction:column;align-items:stretch;gap:10px}
  .card-btns{justify-content:flex-end}
  .row{padding:15px 15px}
  .row-foot{flex-direction:column;align-items:stretch;gap:8px}
  .row-btns{justify-content:flex-end}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

const SCRIPT = `
(function(){
  var pills=[].slice.call(document.querySelectorAll('.pill'));
  var secs=[].slice.call(document.querySelectorAll('.label-sec'));
  var q=document.getElementById('q'), qcount=document.getElementById('qcount');
  function show(id){
    secs.forEach(function(s){s.classList.toggle('active',s.id===id);});
    pills.forEach(function(p){p.classList.toggle('active',p.dataset.target===id);});
    window.scrollTo({top:0,behavior:'auto'});
  }
  pills.forEach(function(p){p.addEventListener('click',function(){ if(q.value){q.value='';doSearch();} show(p.dataset.target); });});
  // 라벨 내비 좌우 스크롤 버튼
  var pillsEl=document.getElementById('pills'),prev=document.getElementById('navPrev'),next=document.getElementById('navNext');
  function updateArrows(){ if(!pillsEl||!prev||!next)return; var sl=pillsEl.scrollLeft,max=pillsEl.scrollWidth-pillsEl.clientWidth; prev.classList.toggle('hidden',sl<=2); next.classList.toggle('hidden',max<=2||sl>=max-2); }
  if(prev&&next){
    prev.addEventListener('click',function(){pillsEl.scrollBy({left:-220,behavior:'smooth'});});
    next.addEventListener('click',function(){pillsEl.scrollBy({left:220,behavior:'smooth'});});
    pillsEl.addEventListener('scroll',updateArrows); window.addEventListener('resize',updateArrows); updateArrows();
    // 활성 pill이 보이도록 스크롤
    var act=document.querySelector('.pill.active'); if(act&&act.scrollIntoView)try{act.scrollIntoView({inline:'center',block:'nearest'});}catch(e){}
  }
  // 더보기
  document.addEventListener('click',function(e){
    var b=e.target.closest('.more-btn'); if(!b)return;
    var s=b.previousElementSibling; if(s&&s.classList.contains('card-summary')){s.classList.toggle('show');b.textContent=s.classList.contains('show')?'접기':'더 보기';}
  });
  // 검색(전역)
  function doSearch(){
    var term=q.value.trim().toLowerCase();
    if(!term){ qcount.textContent=''; secs.forEach(function(s){s.classList.remove('active');});
      document.querySelectorAll('[data-search]').forEach(function(el){el.classList.remove('hidden');});
      var act=pills.find?pills.find(function(p){return p.classList.contains('active');}):null;
      var id=(document.querySelector('.pill.active')||pills[0]).dataset.target; show(id);
      document.querySelectorAll('.list-toggle').forEach(function(d){d.open=false;});
      return;
    }
    var n=0;
    secs.forEach(function(s){
      var any=false;
      s.querySelectorAll('[data-search]').forEach(function(el){
        var m=el.getAttribute('data-search').indexOf(term)>=0;
        el.classList.toggle('hidden',!m); if(m){any=true;n++;}
      });
      s.classList.toggle('active',any);
      var dt=s.querySelector('.list-toggle'); if(dt&&any)dt.open=true;
    });
    qcount.textContent=n+'건';
  }
  q.addEventListener('input',doSearch);
  document.addEventListener('keydown',function(e){
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();q.focus();}
    if(e.key==='Escape'&&document.activeElement===q){q.value='';doSearch();q.blur();}
  });
})();
`;

function renderReportFromMergedDir(mergedDir, outPath, dateStr) {
  const files = fs.readdirSync(mergedDir).filter(f => f.startsWith('merged_') && f.endsWith('.json'));
  const all = [];
  for (const f of files) {
    try { all.push(JSON.parse(fs.readFileSync(path.join(mergedDir, f), 'utf8'))); }
    catch (e) { console.warn(`  ${f} 파싱 실패: ${e.message}`); }
  }
  const html = renderReport(all, dateStr);
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(`✓ 리포트 생성(render_report): ${outPath}`);
  return outPath;
}

module.exports = { renderReport, renderReportFromMergedDir, isListType, getLabelColor, _test: { firstSentence, safeUrl } };
