/* ---------------- 版本号 / 更新公告 ----------------
 *  - 右下角常驻版本号（v1.XX，XX = git 提交次数），点开看更新公告
 *  - 首次打开、或版本号比上次看过的新，自动弹出一次
 *  - 已读版本记在 localStorage，之后不再打扰；点版本号随时可再打开
 *  - 内容来自 js/changelog.js（由 docs/CHANGELOG.md 生成，见 tools/sync-changelog.mjs）
 */

const NOTICE_KEY = 'umlite.seenVersion';

/* js/changelog.js 缺失或被截断时也不至于白屏：退回空列表 + 占位版本号 */
const NOTICE_VERSION = (typeof APP_VERSION === 'string') ? APP_VERSION : '1.0';
const NOTICE_UPDATES = (typeof UPDATES === 'undefined' || !Array.isArray(UPDATES)) ? [] : UPDATES;

function noticeSeenVersion() {
  try { return localStorage.getItem(NOTICE_KEY) || ''; } catch (e) { return ''; }
}
function noticeMarkSeen(v) {
  try { localStorage.setItem(NOTICE_KEY, v); } catch (e) { /* 隐私模式下写不进去，忽略 */ }
}

function noticeEsc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
// 条目里允许用 `代码` 标记，转成 <code>
function noticeItemHtml(text) {
  return noticeEsc(text).replace(/`([^`]+)`/g, '<code>$1</code>');
}
function noticeListHtml(items) {
  if (!items.length) return '';
  return '<ul class="notice-list">' + items.map(t => `<li>${noticeItemHtml(t)}</li>`).join('') + '</ul>';
}

function noticeHtml() {
  if (!NOTICE_UPDATES.length) return '<p class="notice-empty">暂无更新记录。</p>';
  const head = NOTICE_UPDATES[0];
  const older = NOTICE_UPDATES.slice(1).map(u =>
    `<details class="notice-old">` +
    `<summary>v${noticeEsc(u.version)}${u.date ? `<span class="notice-old-date">${noticeEsc(u.date)}</span>` : ''}</summary>` +
    noticeListHtml(u.items) +
    `</details>`
  ).join('');
  return `<div class="notice-hero">` +
      `<span class="notice-ver">v${noticeEsc(head.version)}</span>` +
      (head.date ? `<span class="notice-date">${noticeEsc(head.date)}</span>` : '') +
    `</div>` +
    noticeListHtml(head.items) +
    (older ? `<h3 class="notice-sub">历史版本</h3>${older}` : '');
}

function openNotice() {
  const mask = document.getElementById('notice-mask');
  const bodyEl = document.getElementById('notice-body');
  if (!mask) return;
  if (bodyEl && !bodyEl.dataset.built) {
    bodyEl.innerHTML = noticeHtml();
    bodyEl.dataset.built = '1';
  }
  mask.classList.add('is-open');
  mask.setAttribute('aria-hidden', 'false');
  const ok = document.getElementById('notice-ok');
  if (ok && ok.focus) ok.focus();
}

function closeNotice() {
  const mask = document.getElementById('notice-mask');
  if (!mask) return;
  mask.classList.remove('is-open');
  mask.setAttribute('aria-hidden', 'true');
}

/* 需要弹才弹：已读过的版本静默跳过；真的弹了就把当前版本记为已读 */
function maybeAnnounce() {
  if (noticeSeenVersion() === NOTICE_VERSION) return false;
  openNotice();
  noticeMarkSeen(NOTICE_VERSION);
  return true;
}

/* ---------------- 绑定 ---------------- */
(function initNotice() {
  const chip = document.getElementById('ver-chip');
  if (chip) {
    chip.textContent = 'v' + NOTICE_VERSION;
    chip.setAttribute('title', `UMLite v${NOTICE_VERSION} · 查看更新公告`);
    chip.addEventListener('click', openNotice);
  }
  const mask = document.getElementById('notice-mask');
  if (mask) {
    // 点遮罩空白处关闭（点面板内部不关）
    mask.addEventListener('click', (e) => { if (e.target === mask) closeNotice(); });
    mask.setAttribute('aria-hidden', 'true');
  }
  const closeBtn = document.getElementById('notice-close');
  if (closeBtn) closeBtn.addEventListener('click', closeNotice);
  const okBtn = document.getElementById('notice-ok');
  if (okBtn) okBtn.addEventListener('click', closeNotice);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeNotice();
  });

  maybeAnnounce();
})();
