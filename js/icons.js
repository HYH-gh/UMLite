/* ==========================================================================
 *  图标 sprite：line 风格 24×24、stroke-width 2、颜色随 currentColor 变化
 *
 *  原来这段 <symbol> 定义内联在 index.html 顶部，为了让 HTML 结构保持简洁，
 *  搬到这里作为静态资源，脚本加载时注入到 <body> 最前面（第一个子节点）。
 *  注入时机在解析器读到脚本的那一刻，排在后面所有 <use href="#ic-*"> 之前，
 *  所以引用方式完全不用改。
 *
 *  为什么不放成外部 assets/icons.svg + <use href="文件#id">：
 *  浏览器不允许跨文件引用 <symbol>，双击 index.html（file://）时图标会全部失效。
 * ========================================================================== */

const ICON_SPRITE = `
  <symbol id="ic-file" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 11H4m15.5 5a.5.5 0 0 0 .5-.5V8a1 1 0 0 0-1-1h-3.75a1 1 0 0 1-.829-.44l-1.436-2.12a1 1 0 0 0-.828-.44H8a1 1 0 0 0-1 1M4 9v10a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-3.75a1 1 0 0 1-.829-.44L9.985 8.44A1 1 0 0 0 9.157 8H5a1 1 0 0 0-1 1Z"/></symbol>
  <symbol id="ic-open" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 19V6a1 1 0 0 1 1-1h4.032a1 1 0 0 1 .768.36l1.9 2.28a1 1 0 0 0 .768.36H16a1 1 0 0 1 1 1v1M3 19l3-8h15l-3 8H3Z"/></symbol>
  <symbol id="ic-export" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 15v2a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-2M12 4v12m0-12 4 4m-4-4L8 8"/></symbol>
  <symbol id="ic-history" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3M3.22302 14C4.13247 18.008 7.71683 21 12 21c4.9706 0 9-4.0294 9-9 0-4.97056-4.0294-9-9-9-3.72916 0-6.92858 2.26806-8.29409 5.5M7 9H3V5"/></symbol>
  <symbol id="ic-help" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.529 9.988a2.502 2.502 0 1 1 5 .191A2.441 2.441 0 0 1 12 12.582V14m-.01 3.008H12M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></symbol>
  <symbol id="ic-source" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 3v4a1 1 0 0 1-1 1H5m5 4-2 2 2 2m4-4 2 2-2 2m5-12v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7.914a1 1 0 0 1 .293-.707l3.914-3.914A1 1 0 0 1 9.914 3H18a1 1 0 0 1 1 1Z"/></symbol>
  <symbol id="ic-refresh" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.651 7.65a7.131 7.131 0 0 0-12.68 3.15M18.001 4v4h-4m-7.652 8.35a7.13 7.13 0 0 0 12.68-3.15M6 20v-4h4"/></symbol>

  <!-- ---- 文件区：目录 / 各类图的线条图标（与上面同一风格：24×24、stroke=2、currentColor） ---- -->
  <symbol id="ic-folder" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 19V6a1 1 0 0 1 1-1h4.6a1 1 0 0 1 .8.4L11 7h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/></symbol>
  <symbol id="ic-folder-open" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.2 19.2V6.2a1 1 0 0 1 1-1h4.4l2 2.4h8.2a1 1 0 0 1 1 1v2.2M3.2 19.2l2.9-8.6a1 1 0 0 1 .95-.68H21a.9.9 0 0 1 .85 1.2l-2.6 7.8a1 1 0 0 1-.95.68H4.2a1 1 0 0 1-1-.6Z"/></symbol>
  <symbol id="ic-caret" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.5 6.5 15 12l-5.5 5.5"/></symbol>
  <symbol id="ic-newfile" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6.5 3.5h7l4 4v13h-11zM13.5 3.5v4h4M12 11v6M9 14h6"/></symbol>
  <symbol id="ic-uml-class" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 4h14v16H5zM5 9.4h14M5 14.2h14"/></symbol>
  <symbol id="ic-uml-object" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 4h14v16H5zM8.5 8.4h7M5 11h14"/></symbol>
  <symbol id="ic-uml-usecase" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3.6c4.9 0 8.9 3.8 8.9 8.4s-4 8.4-8.9 8.4S3.1 16.6 3.1 12 7.1 3.6 12 3.6Z"/><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M11 7.9a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 0 0-2.2 0ZM12.1 9v3.4M9.9 10.5h4.4M12.1 12.4l-1.6 2.7M12.1 12.4l1.6 2.7"/></symbol>
  <symbol id="ic-uml-activity" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3.4 20.6 12 12 20.6 3.4 12z"/></symbol>
  <symbol id="ic-uml-sequence" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6.4 8.2V19M17.6 8.2V19M3.4 4.6h6V8.2h-6zM14.6 4.6h6V8.2h-6zM6.4 12.4h11M14.8 10.4l2.6 2-2.6 2"/></symbol>
  <symbol id="ic-uml-state" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 6.4h10A3.6 3.6 0 0 1 20.6 10v4a3.6 3.6 0 0 1-3.6 3.6H7A3.6 3.6 0 0 1 3.4 14v-4A3.6 3.6 0 0 1 7 6.4Z"/><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.2 12h.01"/></symbol>
  <symbol id="ic-uml-er" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4.4h16v15.2H4zM4 9h16M9.6 9v10.6"/></symbol>
  <symbol id="ic-uml-component" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 4.6h11.4v14.8H8zM4 8.6h4v2.6H4zM4 13.4h4V16H4z"/></symbol>
  <symbol id="ic-uml-deployment" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.2 9.4h9.6v9.4H5.2zM5.2 9.4 9.2 5.4h9.6l-4 4M14.8 9.4l4-4v9.4l-4 4"/></symbol>
  <symbol id="ic-uml-package" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.6 19.4V5h6.8l2.2 2.6h7.8v11.8zM3.6 9h16.8"/></symbol>
`;

/* 把 sprite 插到 body 最前面；重复调用无副作用（测试环境里的极简 DOM 也安全） */
let iconSpriteMounted = false;
function mountIconSprite() {
  if (iconSpriteMounted) return;
  if (typeof document === 'undefined' || !document.createElementNS) return;
  const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  host.setAttribute('id', 'ic-sprite');
  host.setAttribute('aria-hidden', 'true');
  host.setAttribute('style', 'display:none');
  host.innerHTML = ICON_SPRITE;
  const parent = document.body || document.documentElement;
  if (!parent) return;
  iconSpriteMounted = true;
  if (parent.firstChild && typeof parent.insertBefore === 'function') parent.insertBefore(host, parent.firstChild);
  else if (typeof parent.appendChild === 'function') parent.appendChild(host);
}

mountIconSprite();
