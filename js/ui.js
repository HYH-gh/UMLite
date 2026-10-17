﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿/* ---------------- UI 绑定 ---------------- */

const editor = document.getElementById('editor');
editor.addEventListener('input', renderDebounced);

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

/* 把当前画布坐标序列化为 @layout 位置块。
   - 活动图：仅导出泳道与活动边（内部节点无稳定标识，不导出）
   - 时序图：不支持（返回空）
   - 其余图：导出全部具名节点 + 系统边界框 */
function positionBlockFor(model) {
  if (!model || !currentModel) return '';
  if (model.type === 'activity') {
    const lines = ['@layout'];
    (model.swimlanes || []).forEach(s =>
      lines.push(`lane ${s.label} @ (${Math.round(s.x)}, ${Math.round(s.y)}) ${Math.round(s.w)} ${Math.round(s.h)}`));
    if (model.activityEdge) {
      const b = model.activityEdge;
      lines.push(`boundary @ (${Math.round(b.x)}, ${Math.round(b.y)}) ${Math.round(b.w)} ${Math.round(b.h)}`);
    }
    // 泳道内元素：二级定位，坐标相对其泳道（泳道即内部元素的画布）
    for (const n of model.nodes || []) {
      if (n.kind === 'pseudo' || !n.lane) continue;
      const s = (model.swimlanes || []).find(x => x.label === n.lane);
      if (!s) continue;
      lines.push(`${n.id} @ lane ${s.label} (${Math.round(n.x - s.x)}, ${Math.round(n.y - s.y)}) ${Math.round(n.w)} ${Math.round(n.h)}`);
    }
    return lines.length > 1 ? lines.join('\n') : '';
  }
  if (model.type === 'sequence') return '';
  const lines = ['@layout'];
  for (const n of model.nodes || []) {
    if (n.kind === 'pseudo') continue;
    lines.push(`${n.label} @ (${Math.round(n.x)}, ${Math.round(n.y)}) ${Math.round(n.w)} ${Math.round(n.h)}`);
  }
  if (model.boundary) {
    const b = model.boundary;
    lines.push(`boundary @ (${Math.round(b.x)}, ${Math.round(b.y)}) ${Math.round(b.w)} ${Math.round(b.h)}`);
  }
  return lines.length > 1 ? lines.join('\n') : '';
}

/* 在源码末尾追加/替换位置块（不修改用户原有主体代码） */
function withPositionBlock(src, model) {
  const block = positionBlockFor(model);
  if (!block) return src;
  const idx = src.search(/^@layout\b/m);
  const base = (idx >= 0 ? src.slice(0, idx) : src).replace(/\s+$/, '');
  return base + '\n\n' + block + '\n';
}

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

bind('btn-reset', () => {
  if (!currentModel) return;
  fitView();
  paint();
  setStatus('视图已复位', 'ok');
});

bind('btn-refresh', () => render());

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