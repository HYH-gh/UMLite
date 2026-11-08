/* ---------------- UI 绑定 ---------------- */

const editor = document.getElementById('editor');
editor.addEventListener('input', renderDebounced);

/* ---------------- 字号滑块：统一调整画布所有字体大小 ---------------- */
(function () {
  const fsEl = document.getElementById('font-scale');
  const fsVal = document.getElementById('font-scale-val');
  if (!fsEl) return;
  const apply = (v) => {
    if (typeof setUiFontScale === 'function') setUiFontScale(v);
    if (fsVal) fsVal.textContent = Math.round(v * 100) + '%';
  };
  fsEl.addEventListener('input', () => apply(+fsEl.value / 100));
  apply(+fsEl.value / 100);
})();

/* 安全绑定：元素不存在时跳过，避免单个 null 中断后续所有按钮绑定 */
function bind(id, cb, ev = 'click') {
  const el = document.getElementById(id);
  if (el) el.addEventListener(ev, cb);
}

/* ---------------- 导入 .uml（文件选择 / 拖拽） ---------------- */

const fileInput = document.getElementById('file-uml');
bind('btn-open', () => fileInput && fileInput.click());
if (fileInput) fileInput.addEventListener('change', () => {
  const f = fileInput.files && fileInput.files[0];
  if (f) loadUml(f);
  fileInput.value = '';
});

function loadUml(file) {
  const r = new FileReader();
  r.onload = () => {
    if (typeof r.result !== 'string') return;
    // 单图导入：进当前选中的目录（没有选中就是根目录），逻辑与以前一样，只是一次多建一个文件
    if (typeof fsImportSingle === 'function') {
      fsImportSingle(r.result, file.name);
      return;
    }
    editor.value = r.result;
    render();
    setStatus(`已导入 ${file.name} 并渲染`, 'ok');
  };
  r.onerror = () => setStatus('文件读取失败', 'err');
  r.readAsText(file, 'utf-8');
}

/* 拖拽 .uml 到代码区：松开鼠标自动解析 */
const leftPane = document.getElementById('left');
['dragenter', 'dragover'].forEach(t =>
  leftPane.addEventListener(t, (e) => { e.preventDefault(); leftPane.classList.add('drag-over'); }));
['dragleave', 'drop'].forEach(t =>
  leftPane.addEventListener(t, (e) => { e.preventDefault(); leftPane.classList.remove('drag-over'); }));
leftPane.addEventListener('drop', (e) => {
  const files = e.dataTransfer && e.dataTransfer.files;
  if (files && files.length) {
    const f = files[0];
    if (/\.uml$|\.txt$/i.test(f.name)) loadUml(f);
    else setStatus('请拖入 .uml 文件', 'err');
  }
});

/* ---------------- 反写代码：把当前画布位置写回源码末尾 ---------------- */

bind('btn-writeback', () => {
  if (!currentModel) { setStatus('请先渲染一个图', 'err'); return; }
  const out = withPositionBlock(editor.value, currentModel);
  if (out === editor.value) { setStatus('位置块与当前画布一致，无需改写', 'ok'); return; }
  editor.value = out;
  render();
  setStatus('✓ 已把当前画布位置反写入代码末尾', 'ok');
});

bind('btn-svg', downloadSVG);
bind('btn-png', () => downloadPNG(2));

bind('btn-src', () => {
  const out = withPositionBlock(editor.value, currentModel);
  saveBlob(new Blob([out], { type: 'text/plain;charset=utf-8' }), 'diagram.uml');
  setStatus('已导出 diagram.uml（含当前位置信息）', 'ok');
});

bind('btn-copy', async () => {
  try {
    await navigator.clipboard.writeText(editor.value);
    setStatus('已复制到剪贴板', 'ok');
  } catch (e) {
    setStatus('复制失败，请手动选择文本', 'err');
  }
});

bind('btn-doc', async () => {
  try {
    const res = await fetch('docs/UMLite-Spec.md');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const md = await res.text();
    saveBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), 'UMLite-Spec.md');
    setStatus('已导出语言规范文档 UMLite-Spec.md', 'ok');
  } catch (e) {
    setStatus('文档加载失败：请通过本地服务器访问', 'err');
  }
});

/* ---------------- 整个项目导入 / 导出 ---------------- */

/* 通用选择弹窗：resolve 被点按钮的 id，取消（按钮 / 点遮罩 / Esc）则 null */
let askClose = null;

function askChoice(opts) {
  return new Promise((resolve) => {
    const mask = document.getElementById('ask-mask');
    const titleEl = document.getElementById('ask-title');
    const msgEl = document.getElementById('ask-msg');
    const extraEl = document.getElementById('ask-extra');
    const actions = document.getElementById('ask-actions');
    const cancel = document.getElementById('ask-cancel');
    if (!mask || !actions) { resolve(opts.buttons[0] ? opts.buttons[0].id : null); return; }
    if (titleEl) titleEl.textContent = opts.title || '请选择';
    if (msgEl) msgEl.textContent = opts.message || '';
    if (extraEl) {
      extraEl.textContent = opts.extra || '';
      extraEl.style.display = opts.extra ? '' : 'none';
    }
    actions.innerHTML = '';
    let closed = false;
    const close = (val) => {
      if (closed) return;
      closed = true;
      askClose = null;
      mask.classList.remove('is-open');
      mask.setAttribute('aria-hidden', 'true');
      resolve(val);
    };
    askClose = close;
    for (const b of opts.buttons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('class', 'ask-btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''));
      btn.textContent = b.label;
      btn.addEventListener('click', () => close(b.id));
      actions.appendChild(btn);
    }
    if (cancel) cancel.onclick = () => close(null);
    mask.classList.add('is-open');
    mask.setAttribute('aria-hidden', 'false');
    const first = actions.children[0];
    if (first && first.focus) first.focus();
  });
}

/* 点遮罩关闭 / Esc 关闭：只挂一次 */
(function bindAskDismiss() {
  const mask = document.getElementById('ask-mask');
  if (mask) mask.addEventListener('click', (e) => { if (e.target === mask && askClose) askClose(null); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && askClose) { e.preventDefault(); askClose(null); }
  });
})();

const projInput = document.getElementById('file-project');
bind('btn-proj-open', () => projInput && projInput.click());
if (projInput) projInput.addEventListener('change', () => {
  const f = projInput.files && projInput.files[0];
  if (f) loadProject(f);
  projInput.value = '';
});

function loadProject(file) {
  const r = new FileReader();
  r.onload = async () => {
    let data, preview;
    try {
      data = JSON.parse(String(r.result));
    } catch (e) {
      setStatus('项目文件不是有效的 JSON', 'err');
      return;
    }
    try {
      preview = fsParseProject(data);
    } catch (e) {
      setStatus('导入失败：' + e.message, 'err');
      return;
    }
    const count = fsCountFiles(preview);
    const mode = await askChoice({
      title: '导入项目',
      message: `「${preview.name}」共 ${count} 张图，要怎么并入当前内容？`,
      extra: '覆盖：清空现在的目录，只留导入的这一套\n插入：保留现有内容，把导入的当成一个子目录',
      buttons: [
        { id: 'insert', label: '作为子目录插入', primary: true },
        { id: 'overwrite', label: '覆盖当前内容' }
      ]
    });
    if (!mode) { setStatus('已取消导入', 'ok'); return; }
    const res = fsImportProject(data, mode);
    setStatus(mode === 'overwrite'
      ? `已用导入的项目覆盖当前内容（${res.count} 张图）`
      : `已插入子目录「${res.name}」（${res.count} 张图）`, 'ok');
  };
  r.onerror = () => setStatus('文件读取失败', 'err');
  r.readAsText(file, 'utf-8');
}

bind('btn-proj-save', () => {
  if (typeof fsExportProject !== 'function') return;
  if (typeof fsSyncCurrent === 'function') fsSyncCurrent();
  const data = fsExportProject();
  saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }), 'umlite-project.json');
  setStatus(`已导出整个项目（${fsCountFiles(fsRoot)} 张图）`, 'ok');
});

bind('btn-reset', () => {
  if (!currentModel) return;
  fitView();
  paint();
  setStatus('视图已复位', 'ok');
});

bind('btn-refresh', () => render({ force: true }));

/* 折线开关：连线是否自动补直角折点（横平竖直）。默认关；
 * 开启时按最终渲染位置（含 @layout 定位）生成折点，关闭恢复直线/斜线。 */
bind('btn-ortho', () => {
  const next = setOrthoEnabled(!isOrthoEnabled());
  const btn = document.getElementById('btn-ortho');
  if (btn) btn.textContent = next ? '⛓ 折线：开' : '⛓ 折线：关';
  render({ force: true });
  setStatus(next ? '折线渲染：开（按当前位置生成直角折点）' : '折线渲染：关（保持直线/斜线）', 'ok');
});

/* ---------------- 分隔条拖拽（面板宽度可调） ---------------- */

const divider = document.getElementById('divider');
const mainEl = document.querySelector('main');
let dividerDragState = null;

if (divider) divider.addEventListener('pointerdown', (evt) => {
  if (evt.button !== 0) return;
  evt.preventDefault();
  dividerDragState = { startX: evt.clientX, startLeft: parseFloat(getComputedStyle(mainEl).getPropertyValue('--left-width')) || 44 };
  divider.classList.add('active');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('pointermove', (evt) => {
  if (!dividerDragState) return;
  const mainRect = mainEl.getBoundingClientRect();
  const pct = ((evt.clientX - mainRect.left) / mainRect.width) * 100;
  const newLeft = Math.max(20, Math.min(80, pct)); // 限制在 20%~80% 之间
  mainEl.style.setProperty('--left-width', newLeft + '%');
});

document.addEventListener('pointerup', () => {
  if (!dividerDragState) return;
  dividerDragState = null;
  divider.classList.remove('active');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  // 拖拽后触发一次渲染以适配新尺寸
  if (currentModel) { fitView(); paint(); }
});
document.addEventListener('pointercancel', () => {
  if (!dividerDragState) return;
  dividerDragState = null;
  divider.classList.remove('active');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

window.addEventListener('resize', () => {
  clearTimeout(window.__rt);
  window.__rt = setTimeout(() => {
    if (!currentModel) return;
    fitView();
    paint();
  }, 160);
});

/* ---------------- 窄屏：代码 / 预览 标签切换 ---------------- */

const paneTabs = document.getElementById('pane-tabs');

function setMobilePane(which) {
  if (document.body.dataset) document.body.dataset.pane = which;
  else document.body.setAttribute('data-pane', which);
  if (paneTabs) {
    paneTabs.querySelectorAll('button[data-pane]').forEach((b) => {
      b.setAttribute('aria-selected', b.getAttribute('data-pane') === which ? 'true' : 'false');
    });
  }
  // 预览刚从隐藏切回来：此刻画布尺寸才有效，需要重新适配一次
  if (which === 'preview' && currentModel) {
    fitView();
    paint();
  }
}

if (paneTabs) {
  paneTabs.addEventListener('click', (evt) => {
    const btn = evt.target && evt.target.closest ? evt.target.closest('button[data-pane]') : null;
    if (btn) setMobilePane(btn.getAttribute('data-pane'));
  });
  setMobilePane('code');
}

/* ---------------- 二级下拉菜单 ---------------- */
function closeAllMenus() {
  document.querySelectorAll('.menu-drop.open').forEach(d => d.classList.remove('open'));
}
document.querySelectorAll('.menu').forEach((m) => {
  const btn = m.querySelector('.menu-btn');
  const drop = m.querySelector('.menu-drop');
  if (!btn || !drop) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllMenus();
    drop.classList.toggle('open');
  });
});
document.querySelectorAll('.menu-item').forEach((it) => {
  it.addEventListener('click', (e) => {
    e.stopPropagation();
    const target = it.getAttribute('data-click');
    if (target) { const el = document.getElementById(target); if (el) el.click(); }
    closeAllMenus();
  });
});
// 点击菜单外部区域时收起所有下拉
document.addEventListener('click', closeAllMenus);