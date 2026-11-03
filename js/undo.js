/* ==========================================================================
 *  画布撤销 / 重做
 *
 *  记录粒度 = 一次拖拽（或一次双击增删折点）。做法：
 *    pointerdown 先给模型拍一张几何快照 → pointerup 时只有几何真的变了才入栈，
 *    所以「空白处拖拽平移」「点一下不拖」都不会白占撤销步数。
 *  快照是整个模型的 JSON：节点、泳道、系统边界、折点、端点锚点、时序图各对象
 *  一次全覆盖，不必为每种图形单独写撤销逻辑。
 *
 *  范围：只回退画布几何，不动编辑器里的源码。结构变化（改代码触发重排 / 重新导入 /
 *  强制刷新）会清空撤销栈 —— 那时旧快照与新的代码已经对不上了。
 * ========================================================================== */

const UNDO_LIMIT = 60;

const undoStack = [];   // 每项是「操作前」的模型 JSON
const redoStack = [];
let _pendingSnapshot = null;

/* ---------------- 快照与入栈 ---------------- */

function undoSnapshot() {
  return currentModel ? JSON.stringify(currentModel) : null;
}

/* 入栈；与操作前完全一致则丢弃（纯平移画布、点选不改模型都走这里） */
function commitUndo(beforeJson) {
  if (!beforeJson || !currentModel) return;
  if (JSON.stringify(currentModel) === beforeJson) return;
  undoStack.push(beforeJson);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
  updateUndoButtons();
}

/* 结构变化后旧快照失效，清空栈 */
function resetUndo() {
  undoStack.length = 0;
  redoStack.length = 0;
  _pendingSnapshot = null;
  updateUndoButtons();
}

/* ---------------- 撤销 / 重做 ---------------- */

/* 用快照替换当前模型：模型对象整体换新，几何一次还原；
   _lastBuild 指向同一对象，保证后续打字仍命中「结构未变、复用模型」的快路径 */
function applyModelSnapshot(json) {
  const m = JSON.parse(json);
  currentModel = m;
  if (typeof _lastBuild !== 'undefined' && _lastBuild) _lastBuild.model = m;
  paint();
  updateUndoButtons();
}

function undo() {
  if (!undoStack.length) { setStatus('没有可撤销的操作', 'err'); return; }
  redoStack.push(JSON.stringify(currentModel));
  applyModelSnapshot(undoStack.pop());
  setStatus('↶ 已撤销' + (undoStack.length ? `（还可撤销 ${undoStack.length} 步）` : '（已回到最初状态）'), 'ok');
}

function redo() {
  if (!redoStack.length) { setStatus('没有可重做的操作', 'err'); return; }
  undoStack.push(JSON.stringify(currentModel));
  applyModelSnapshot(redoStack.pop());
  setStatus('↷ 已重做' + (redoStack.length ? `（还可重做 ${redoStack.length} 步）` : '（已到最新状态）'), 'ok');
}

/* ---------------- 按钮状态 ---------------- */

function updateUndoButtons() {
  const u = document.getElementById('btn-undo');
  const r = document.getElementById('btn-redo');
  if (u) {
    u.disabled = undoStack.length === 0;
    u.title = undoStack.length ? `撤销（Ctrl+Z）· 可撤销 ${undoStack.length} 步` : '没有可撤销的操作';
  }
  if (r) {
    r.disabled = redoStack.length === 0;
    r.title = redoStack.length ? `重做（Ctrl+Shift+Z）· 可重做 ${redoStack.length} 步` : '没有可重做的操作';
  }
}

/* ---------------- 拖拽手势：自动记录 ---------------- */

// 捕获阶段拍快照：保证在任何拖拽处理函数改动模型之前
preview.addEventListener('pointerdown', () => {
  _pendingSnapshot = undoSnapshot();
}, true);

document.addEventListener('pointerup', () => {
  if (_pendingSnapshot === null) return;
  const before = _pendingSnapshot;
  _pendingSnapshot = null;
  commitUndo(before);
});

document.addEventListener('pointercancel', () => { _pendingSnapshot = null; });

/* ---------------- 按钮与快捷键 ---------------- */

(function bindUndoButtons() {
  const u = document.getElementById('btn-undo');
  const r = document.getElementById('btn-redo');
  if (u) u.addEventListener('click', undo);
  if (r) r.addEventListener('click', redo);
  updateUndoButtons();
})();

document.addEventListener('keydown', (evt) => {
  if (!(evt.ctrlKey || evt.metaKey)) return;
  const t = evt.target;
  const inTextField = t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable);
  // 焦点在代码区时让系统原生的文本撤销生效，避免两套撤销互相打架
  if (inTextField) return;
  const k = (evt.key || '').toLowerCase();
  if (k === 'z') {
    evt.preventDefault();
    if (evt.shiftKey) redo(); else undo();
  } else if (k === 'y') {
    evt.preventDefault();
    redo();
  }
});
