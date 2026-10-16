/* ---------------- UI 绑定 ---------------- */

const editor = document.getElementById('editor');
editor.addEventListener('input', renderDebounced);

document.getElementById('btn-svg').addEventListener('click', downloadSVG);
document.getElementById('btn-png').addEventListener('click', () => downloadPNG(2));

document.getElementById('btn-src').addEventListener('click', () => {
  saveBlob(new Blob([editor.value], { type: 'text/plain;charset=utf-8' }), 'diagram.uml');
  setStatus('已导出 diagram.uml', 'ok');
});

document.getElementById('btn-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(editor.value);
    setStatus('已复制到剪贴板', 'ok');
  } catch (e) {
    setStatus('复制失败，请手动选择文本', 'err');
  }
});

document.getElementById('btn-doc').addEventListener('click', async () => {
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

document.getElementById('btn-reset').addEventListener('click', () => {
  if (!currentModel) return;
  fitView();
  paint();
  setStatus('视图已复位', 'ok');
});

document.getElementById('btn-refresh').addEventListener('click', () => {
  render();
  if (currentModel) setStatus('✓ 已重新渲染', 'ok');
});

/* ---------------- 分隔条拖拽（面板宽度可调） ---------------- */

const divider = document.getElementById('divider');
const mainEl = document.querySelector('main');
let dividerDragState = null;

divider.addEventListener('pointerdown', (evt) => {
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