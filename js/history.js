/*============================================================================
 *  历史记录
 *  - 以「图标题」为记录名，存于 localStorage（最多 20 条）
 *  - 同名记录直接覆盖；超过上限时挤出最旧一条
 *  - 记录内容 = 完整 DSL（含 @layout 位置块），可完整还原当前画布
 *  - 「载入示例」中的示例代码自动排除，不写入历史
 * =========================================================================*/

const HISTORY_KEY = 'umlite.history';
const HISTORY_LIMIT = 20;

const historyPanel = document.getElementById('history-panel');
const historyList = document.getElementById('history-list');
const historyCount = document.getElementById('history-count');

/* ---------------- 存取 ---------------- */

function getHistory() {
  try {
    const arr = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function setHistory(arr) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(-HISTORY_LIMIT))); }
  catch (e) { /* 存储被禁用时静默失败 */ }
}

/* ---------------- 组装当前记录 ---------------- */

// 记录名：优先图标题；无标题时用类型兜底（同名会互相覆盖）
function historyTitle() {
  if (!currentModel) return null;
  return currentModel.title
    || (currentModel.type ? currentModel.type + '（无标题）' : '未命名图');
}

// 是否为「载入示例」中的原始示例代码（示例本身不进历史，避免污染用户记录）
function isSampleCode(src) {
  src = (src || '').trim();
  const lib = (typeof SAMPLES === 'object' && SAMPLES) || {};
  for (const k in lib) {
    if (lib[k] && ('' + lib[k]).trim() === src) return true;
  }
  return false;
}

// 生成当前图的完整历史记录；若为示例则返回 null（不记录）
function collectCurrentHistory() {
  if (!currentModel) return null;
  const src = document.getElementById('editor').value;
  if (isSampleCode(src)) return null;
  return {
    name: historyTitle(),
    code: withPositionBlock(src, currentModel) || src,
    ts: Date.now()
  };
}

/* ---------------- 记录刷新 ---------------- */

let _histTimer = null;
// paint 后调用：拖动 / 修改代码等变化在停止 600ms 后写入一次，避免高频写存储
function scheduleHistory() {
  if (_histTimer) clearTimeout(_histTimer);
  _histTimer = setTimeout(() => { _histTimer = null; flushHistory(); }, 600);
}

function flushHistory() {
  const rec = collectCurrentHistory();
  if (!rec || !rec.name) return;
  const arr = getHistory();
  const i = arr.findIndex(r => r.name === rec.name);
  if (i >= 0) {
    if (arr[i].code === rec.code) return; // 内容未变化，跳过写入
    arr.splice(i, 1);
  }
  arr.push(rec);
  setHistory(arr);
  refreshHistoryPanel();
}

/* ---------------- 面板渲染与交互 ---------------- */

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function refreshHistoryPanel() {
  if (!historyList) return;
  const arr = getHistory();
  if (historyCount) historyCount.textContent = arr.length + ' / ' + HISTORY_LIMIT;
  historyList.innerHTML = '';
  const cur = currentModel ? historyTitle() : null;
  // 新的在前
  for (let i = arr.length - 1; i >= 0; i--) {
    const rec = arr[i];
    const row = document.createElement('div');
    row.className = 'his-item' + (rec.name === cur ? ' cur' : '');
    const name = document.createElement('button');
    name.className = 'his-name';
    name.textContent = rec.name;
    name.setAttribute('data-act', 'load');
    name.setAttribute('data-idx', i);
    name.title = '载入这条历史';
    const time = document.createElement('span');
    time.className = 'his-time';
    time.textContent = fmtTime(rec.ts);
    const del = document.createElement('button');
    del.className = 'his-del';
    del.textContent = '✕';
    del.setAttribute('data-act', 'del');
    del.setAttribute('data-idx', i);
    del.title = '删除这条历史';
    row.appendChild(name);
    row.appendChild(time);
    row.appendChild(del);
    historyList.appendChild(row);
  }
  if (!arr.length) {
    historyList.innerHTML = '<div class="his-empty">暂无历史记录</div>';
  }
}

function openHistoryPanel() {
  if (historyPanel) {
    refreshHistoryPanel();
    historyPanel.classList.remove('hidden');
  }
}
function closeHistoryPanel() {
  if (historyPanel) historyPanel.classList.add('hidden');
}

// 载入某条历史：把其代码放入编辑器并渲染
function loadHistory(idx) {
  const rec = getHistory()[idx];
  if (!rec) return;
  editor.value = rec.code;
  closeHistoryPanel();
  render();
  setStatus('已载入历史：' + rec.name, 'ok');
}

function removeHistory(idx) {
  const arr = getHistory();
  if (idx < 0 || idx >= arr.length) return;
  const name = arr[idx].name;
  arr.splice(idx, 1);
  setHistory(arr);
  refreshHistoryPanel();
  setStatus('已删除历史：' + name, 'ok');
}

function clearHistory() {
  setHistory([]);
  refreshHistoryPanel();
  setStatus('已清空全部历史记录', 'ok');
}

/* ---------------- 事件绑定 ---------------- */

bind('btn-history', () => {
  const closed = !historyPanel || historyPanel.classList.contains('hidden');
  if (closed) openHistoryPanel(); else closeHistoryPanel();
});
bind('his-clear', clearHistory);

if (historyList) {
  historyList.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-idx]');
    if (!b) return;
    const idx = +b.getAttribute('data-idx');
    if (b.getAttribute('data-act') === 'load') loadHistory(idx);
    else if (b.getAttribute('data-act') === 'del') removeHistory(idx);
  });
}

// 点击历史面板外部区域关闭
document.addEventListener('click', (e) => {
  if (!historyPanel || !btnHistoryVisible()) return;
  if (!historyPanel.contains(e.target) && !(e.target && e.target.id === 'btn-history')) {
    closeHistoryPanel();
  }
});
function btnHistoryVisible() {
  return historyPanel && !historyPanel.classList.contains('hidden');
}