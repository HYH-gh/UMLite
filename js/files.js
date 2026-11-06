/* ==========================================================================
 *  文件管理：页面上的虚拟目录树
 *
 *  - 只影响界面：每个「图」就是一段 DSL 文本，目录只是分组；
 *    导出时是层层嵌套的 JSON 对象，与之前的单图逻辑没有区别。
 *  - 图的显示名取代码里的图标题（@diagram <type> "标题"），
 *    没有标题就按类型显示，完全没代码则显示「新建图」。
 *  - 目录可新建 / 重命名 / 拖动换层级；图可拖动，名字不能手改（跟着代码走）。
 *  - 整棵树存在 localStorage，刷新不丢。
 * ========================================================================== */

const FS_KEY = 'umlite.fs.v1';
const FS_PANE_DEFAULT_H = 216;
const FS_PANE_MIN_H = 78;
const FS_PANE_MAX_H = 640;

let fsRoot = null;        // 根目录节点（不显示，仅作容器）
let fsCurrent = null;     // 当前打开的图（文件节点 id）
let fsSelId = null;       // 当前高亮的那一行（文件或目录）
let fsSeq = 1;            // id 自增
let fsDragId = null;      // 拖动中的节点
let fsDropTarget = null;  // { id, mode }
let fsEditing = null;     // 正在改名的那行输入框

/* ---------------- 基础工具 ---------------- */

function fsUid() { return 'n' + (fsSeq++); }

function fsFolder(name, children) {
  return { id: fsUid(), kind: 'folder', name: name || '新建目录', open: true, children: children || [] };
}
function fsFile(src) { return { id: fsUid(), kind: 'file', src: src || '' }; }

function fsWalk(node, fn, parent) {
  if (!node) return;
  fn(node, parent);
  if (node.children) for (const c of node.children.slice()) fsWalk(c, fn, node);
}

function fsFind(id, node, parent) {
  node = node || fsRoot;
  if (!node || !id) return null;
  if (node.id === id) return { node, parent };
  for (const c of node.children || []) {
    const hit = fsFind(id, c, node);
    if (hit) return hit;
  }
  return null;
}
function fsNode(id) { const h = fsFind(id); return h ? h.node : null; }
function fsParent(id) { const h = fsFind(id); return h ? h.parent : null; }

/* 节点所在的目录（目录返回自身，文件返回父目录） */
function fsContainerOf(id) {
  const n = fsNode(id);
  if (!n) return fsRoot;
  return n.kind === 'folder' ? n : (fsParent(id) || fsRoot);
}

/* 当前操作目标目录：选中目录就用它，选中图就用它所在目录 */
function fsTargetFolder() {
  return fsContainerOf(fsSelId || fsCurrent || (fsRoot && fsRoot.id));
}

function fsPathOf(id) {
  const parts = [];
  let cur = fsNode(id);
  while (cur && cur !== fsRoot) {
    parts.unshift(cur.kind === 'folder' ? cur.name : fsDisplayName(cur));
    cur = fsParent(cur.id);
  }
  return '/' + parts.join('/');
}

/* ---------------- 名称与类型 ---------------- */

const FS_TYPES = ['class', 'usecase', 'activity', 'sequence', 'er', 'state', 'component', 'deployment', 'object', 'package'];

/* 从代码里读出图类型与标题：只认 @diagram 那一行，不会把注释里的词当类型 */
function fsMeta(src) {
  const text = String(src || '');
  const line = (text.match(/^[ \t]*@diagram[^\n]*/m) || [''])[0];
  const tm = line.match(/@diagram\s+([A-Za-z]+)/);
  const type = (tm && FS_TYPES.indexOf(tm[1].toLowerCase()) >= 0) ? tm[1].toLowerCase() : '';
  const q = line.match(/"([^"]*)"/);
  return { type, title: q ? q[1].trim() : '' };
}

function fsDisplayName(node) {
  if (!node) return '';
  if (node.kind === 'folder') return node.name;
  if (!String(node.src || '').trim()) return '新建图';
  const meta = fsMeta(node.src);
  if (meta.title) return meta.title;
  return meta.type ? '未命名 ' + meta.type : '未命名图';
}

function fsIconId(node) {
  if (!node) return 'ic-newfile';
  if (node.kind === 'folder') return node.open ? 'ic-folder-open' : 'ic-folder';
  if (!String(node.src || '').trim()) return 'ic-newfile';
  const t = fsMeta(node.src).type;
  return t ? 'ic-uml-' + t : 'ic-newfile';
}

/* ---------------- 持久化 ---------------- */

function fsSerialize(node) {
  const out = { id: node.id, kind: node.kind };
  if (node.kind === 'folder') {
    out.name = node.name;
    out.open = !!node.open;
    out.children = (node.children || []).map(fsSerialize);
  } else {
    out.src = node.src || '';
  }
  return out;
}

function fsDeserialize(raw) {
  const n = { id: (raw && raw.id) || fsUid() };
  n.kind = (raw && raw.kind === 'folder') || (raw && Array.isArray(raw.children)) ? 'folder' : 'file';
  if (n.kind === 'folder') {
    n.name = (raw && raw.name) || '新建目录';
    n.open = !raw || raw.open !== false;
    n.children = ((raw && raw.children) || []).map(fsDeserialize);
  } else {
    n.src = (raw && typeof raw.src === 'string') ? raw.src : '';
  }
  // id 可能来自外部文件（如导入的 JSON），撞号时重新分配
  if (fsFind(n.id)) n.id = fsUid();
  return n;
}

function fsSave() {
  try {
    localStorage.setItem(FS_KEY, JSON.stringify({
      seq: fsSeq,
      current: fsCurrent,
      sel: fsSelId,
      pane: fsPaneState(),
      root: fsRoot ? fsSerialize(fsRoot) : null
    }));
  } catch (e) { /* 隐私模式 / 超配额：不影响使用，只是不记忆 */ }
}

/* 读回上次的树；返回 null 表示没有存档 */
function fsLoad() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(FS_KEY) || 'null'); } catch (e) { raw = null; }
  if (!raw || !raw.root) return null;
  fsSeq = raw.seq || 1;
  fsRoot = fsDeserialize(raw.root);
  fsRoot.id = 'root';
  if (raw.seq && fsSeq <= raw.seq) fsSeq = raw.seq + 1;
  fsCurrent = (raw.current && fsNode(raw.current)) ? raw.current : ((fsFirstFile() || {}).id || null);
  fsSelId = (raw.sel && fsNode(raw.sel)) ? raw.sel : fsCurrent;
  return raw;
}

function fsFirstFile(node) {
  node = node || fsRoot;
  for (const c of node.children || []) {
    if (c.kind === 'file') return c;
    const deep = fsFirstFile(c);
    if (deep) return deep;
  }
  return null;
}

/* 首次使用：给一棵能立刻上手的示例树（示例目录 + 当前默认图） */
function fsSeed() {
  fsSeq = 1;
  fsRoot = { id: 'root', kind: 'folder', name: '根目录', open: true, children: [] };
  const keys = (typeof SAMPLES === 'object' && SAMPLES) ? Object.keys(SAMPLES) : [];
  const defKey = keys.indexOf('类图 · 电商系统') >= 0 ? '类图 · 电商系统' : keys[0];
  const demo = fsFolder('示例');
  for (const k of keys) if (k !== defKey) demo.children.push(fsFile(SAMPLES[k]));
  const first = fsFile(defKey ? SAMPLES[defKey] : '');
  fsRoot.children.push(first);
  if (demo.children.length) fsRoot.children.push(demo);
  fsCurrent = first.id;
  fsSelId = first.id;
}

/* ---------------- 增删改 ---------------- */

function fsAddNode(kind, parentId) {
  const parent = fsContainerOf(parentId || fsSelId || fsCurrent || fsRoot.id) || fsRoot;
  const node = kind === 'folder' ? fsFolder('新建目录') : fsFile('');
  parent.children.push(node);
  parent.open = true;
  fsSelId = node.id;
  if (node.kind === 'file') { fsSelect(node.id); return node; }
  fsSave();
  fsRenderTree();
  fsInlineRename(node.id);
  return node;
}

function fsRenameFolder(id, name) {
  const n = fsNode(id);
  if (!n || n.kind !== 'folder' || n === fsRoot) return false;
  const clean = String(name || '').trim();
  if (clean) n.name = clean;
  fsSave();
  fsRenderTree();
  return true;
}

function fsDeleteNode(id) {
  const n = fsNode(id);
  const parent = n ? fsParent(id) : null;
  if (!n || n === fsRoot || !parent) return false;
  parent.children.splice(parent.children.indexOf(n), 1);
  const lostCurrent = fsCurrent && (fsCurrent === id || fsFind(fsCurrent, n));
  if (lostCurrent) {
    const next = fsFirstFile();
    fsCurrent = null;
    if (next) fsSelect(next.id);
    else { editor.value = ''; fsRenderTree(); render({ force: true }); }
  }
  if (fsSelId === id || !fsNode(fsSelId)) fsSelId = fsCurrent;
  fsSave();
  fsRenderTree();
  return true;
}

/* 移动：mode = 'into'（放进目标目录）| 'before'（插到目标前面，成为同级） */
function fsMoveNode(id, targetId, mode) {
  if (!id || id === targetId) return false;
  const src = fsNode(id);
  const target = fsNode(targetId);
  if (!src || !target || src === fsRoot) return false;
  if (src.kind === 'folder' && fsFind(target.id, src)) return false;   // 不能拖进自己的子孙

  let destParent, insertAt;
  if (mode === 'into' && target.kind === 'folder') {
    destParent = target;
    insertAt = target.children.length;
  } else {
    destParent = fsParent(target.id) || fsRoot;
    insertAt = destParent.children.indexOf(target);
    if (insertAt < 0) insertAt = destParent.children.length;
  }
  if (!destParent || destParent.kind !== 'folder') return false;

  const oldParent = fsParent(id);
  if (oldParent) {
    const oldIdx = oldParent.children.indexOf(src);
    oldParent.children.splice(oldIdx, 1);
    if (oldParent === destParent && oldIdx < insertAt) insertAt--;
  }
  destParent.children.splice(Math.max(0, insertAt), 0, src);
  destParent.open = true;
  fsSave();
  fsRenderTree();
  return true;
}

/* ---------------- 选中 / 切换 ---------------- */

/* 编辑器内容写回当前图 */
function fsSyncCurrent() {
  const n = fsNode(fsCurrent);
  if (!n || n.kind !== 'file') return;
  if (n.src === editor.value) return;
  n.src = editor.value;
  fsSave();
}

/* 打字时用：写回内容并只刷新那一行（整棵树重建会闪） */
function fsTouchCurrent() {
  const n = fsNode(fsCurrent);
  if (!n || n.kind !== 'file') return;
  if (n.src === editor.value) return;
  n.src = editor.value;
  fsSave();
  fsUpdateTreeRow(fsCurrent);
}

function fsSelect(id) {
  const n = fsNode(id);
  if (!n || n.kind !== 'file') return false;
  if (fsCurrent && fsCurrent !== id) fsSyncCurrent();
  fsCurrent = id;
  fsSelId = id;
  editor.value = n.src || '';
  fsSave();
  fsRenderTree();
  render({ force: true });
  if (typeof resetUndo === 'function') resetUndo();
  return true;
}

/* ---------------- 渲染 ---------------- */

function fsBuildRow(node, depth) {
  const row = document.createElement('div');
  row.setAttribute('class', 'tree-row'
    + (node.id === fsSelId ? ' sel' : '')
    + (node.kind === 'folder' && node.open ? ' open' : ''));
  row.setAttribute('data-id', node.id);
  row.setAttribute('data-kind', node.kind);
  row.setAttribute('role', 'treeitem');
  row.setAttribute('draggable', 'true');
  row.style.paddingLeft = (6 + depth * 13) + 'px';
  row.title = node.kind === 'folder' ? node.name : fsPathOf(node.id);

  const caret = document.createElement('span');
  caret.setAttribute('class', 'tree-caret' + (node.kind === 'folder' ? '' : ' leaf'));
  caret.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><use href="#ic-caret"></use></svg>';
  row.appendChild(caret);

  const icon = document.createElementNS(SVG_NS, 'svg');
  icon.setAttribute('class', 'tree-ic');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', '#' + fsIconId(node));
  icon.appendChild(use);
  row.appendChild(icon);

  const name = document.createElement('span');
  name.setAttribute('class', 'tree-name');
  name.textContent = fsDisplayName(node);
  row.appendChild(name);

  const meta = node.kind === 'file' ? fsMeta(node.src) : null;
  if (meta && meta.type) {
    const kind = document.createElement('span');
    kind.setAttribute('class', 'tree-kind');
    kind.textContent = meta.type;
    row.appendChild(kind);
  }
  return row;
}

function fsRenderTree() {
  const box = document.getElementById('file-tree');
  if (!box) return;
  // 重绘会摘掉改名输入框：先打标记，免得它的 blur 把旧名字写回去
  if (fsEditing) { fsEditing.__cancelled = true; fsEditing = null; }
  box.innerHTML = '';
  if (!fsRoot || !fsRoot.children.length) {
    const empty = document.createElement('div');
    empty.setAttribute('class', 'tree-empty');
    empty.textContent = '还没有文件，点上方「图」新建一张';
    box.appendChild(empty);
    fsSyncPanes();
    return;
  }
  const walk = (node, depth) => {
    for (const child of node.children) {
      box.appendChild(fsBuildRow(child, depth));
      if (child.kind === 'folder' && child.open) walk(child, depth + 1);
    }
  };
  walk(fsRoot, 0);
  fsSyncPanes();
}

/* 只刷新一行（打字改名时用） */
function fsUpdateTreeRow(id) {
  const box = document.getElementById('file-tree');
  if (!box) { fsRenderTree(); return; }
  const rows = Array.prototype.slice.call(box.children);
  const row = rows.find(r => r.getAttribute && r.getAttribute('data-id') === id);
  if (!row || !row.querySelector) { fsRenderTree(); return; }
  const n = fsNode(id);
  if (!n) return;
  const nameEl = row.querySelector('.tree-name');
  if (nameEl) nameEl.textContent = fsDisplayName(n);
  const use = row.querySelector('.tree-ic use');
  if (use) use.setAttribute('href', '#' + fsIconId(n));
  let kindEl = row.querySelector('.tree-kind');
  const meta = fsMeta(n.src);
  if (meta.type) {
    if (!kindEl) { kindEl = document.createElement('span'); kindEl.setAttribute('class', 'tree-kind'); row.appendChild(kindEl); }
    kindEl.textContent = meta.type;
  } else if (kindEl && kindEl.remove) kindEl.remove();
}

/* 面包屑 + 文件区状态按钮 */
function fsSyncPanes() {
  const pathEl = document.getElementById('files-path');
  if (pathEl) {
    const n = fsNode(fsSelId);
    pathEl.textContent = n ? fsPathOf(n.kind === 'folder' ? n.id : n.id) : '/';
  }
  const btn = document.getElementById('btn-files');
  const pane = document.getElementById('files-pane');
  if (btn && pane) {
    const shown = !pane.classList.contains('hidden');
    btn.classList.toggle('on', shown);
  }
}

/* ---------------- 文件区尺寸 / 显隐 ---------------- */

function fsPaneState() {
  const pane = document.getElementById('files-pane');
  return {
    hidden: !!(pane && pane.classList.contains('hidden')),
    height: pane ? (parseInt(pane.style.height, 10) || 0) : 0
  };
}

function fsApplyPaneState(state) {
  const pane = document.getElementById('files-pane');
  if (!pane || !state) return;
  if (state.height) {
    pane.style.height = Math.max(FS_PANE_MIN_H, Math.min(FS_PANE_MAX_H, state.height)) + 'px';
  }
  pane.classList.toggle('hidden', !!state.hidden);
  fsSyncPanes();
}

function fsSetPaneVisible(v) {
  const pane = document.getElementById('files-pane');
  if (!pane) return;
  pane.classList.toggle('hidden', !v);
  fsSave();
  fsSyncPanes();
}

/* ---------------- 导入 / 导出 ---------------- */

function fsExportProject() {
  return {
    app: 'UMLite',
    type: 'umlite-project',
    version: (typeof APP_VERSION === 'string' ? APP_VERSION : '1.0'),
    exportedAt: new Date().toISOString(),
    root: { kind: 'folder', name: '根目录', children: (fsRoot.children || []).map(fsSerialize) }
  };
}

/* 解析导入的 JSON：完整项目包 / 直接给一棵树 / 只给 children 数组都认 */
function fsParseProject(raw) {
  const data = (typeof raw === 'string') ? JSON.parse(raw) : raw;
  if (!data || typeof data !== 'object') throw new Error('文件内容不是有效的 JSON 对象');
  const root = data.root || (data.kind === 'folder' ? data : null) || (Array.isArray(data.children) ? data : null);
  if (!root) throw new Error('JSON 里没有找到 root 目录结构');
  const conv = (n) => {
    const isFolder = n.kind === 'folder' || Array.isArray(n.children);
    if (isFolder) {
      return { kind: 'folder', name: n.name || '导入目录', open: true, children: (n.children || []).map(conv) };
    }
    const src = typeof n.src === 'string' ? n.src : (typeof n.code === 'string' ? n.code : '');
    return { kind: 'file', src };
  };
  const out = conv(root);
  out.name = root.name || '导入项目';
  return out;
}

/* mode: 'overwrite' 覆盖当前内容 | 'insert' 作为子目录插到当前选中目录下 */
function fsImportProject(raw, mode) {
  const incoming = fsParseProject(raw);
  if (mode === 'insert') {
    const target = fsTargetFolder();
    const node = fsDeserialize({ kind: 'folder', name: incoming.name, open: true, children: incoming.children });
    let name = node.name, i = 2;
    while (target.children.some(c => c.kind === 'folder' && c.name === name)) name = node.name + ' (' + (i++) + ')';
    node.name = name;
    target.children.push(node);
    target.open = true;
    fsSave();
    fsRenderTree();
    return { mode, name, count: fsCountFiles(node) };
  }
  fsRoot = fsDeserialize({ kind: 'folder', name: '根目录', open: true, children: incoming.children || [] });
  fsRoot.id = 'root';
  fsCurrent = null;
  fsSelId = null;
  const first = fsFirstFile();
  if (first) fsSelect(first.id);
  else { editor.value = ''; fsRenderTree(); render({ force: true }); }
  fsSave();
  return { mode: 'overwrite', count: fsCountFiles(fsRoot) };
}

function fsCountFiles(node) {
  let n = 0;
  fsWalk(node, (x) => { if (x && x.kind === 'file') n++; });
  return n;
}

/* 单张图导入：落到当前选中的目录（选中的是图就用它所在目录） */
function fsImportSingle(text, fileName) {
  const target = fsTargetFolder();
  const node = fsFile(String(text || ''));
  target.children.push(node);
  target.open = true;
  fsSave();
  fsSelect(node.id);
  if (typeof setStatus === 'function' && fileName) {
    setStatus(`已导入 ${fileName} → ${fsPathOf(node.id)}`, 'ok');
  }
  return node;
}

/* ---------------- 拖拽 / 交互 ---------------- */

function fsRowFromEvent(evt) {
  let el = evt.target;
  while (el && el.nodeType !== 9) {
    if (el.classList && el.classList.contains('tree-row')) return el;
    el = el.parentNode;
  }
  return null;
}

function fsClearDropMarks() {
  const box = document.getElementById('file-tree');
  if (box && box.querySelectorAll) {
    for (const r of box.querySelectorAll('.drop-into,.drop-before')) r.classList.remove('drop-into', 'drop-before');
  }
  fsDropTarget = null;
}

function fsRowOf(id) {
  const box = document.getElementById('file-tree');
  if (!box) return null;
  return Array.prototype.slice.call(box.children).find(r => r.getAttribute && r.getAttribute('data-id') === id) || null;
}

/* 目录改名：把名字换成输入框，回车 / 失焦保存，Esc 放弃 */
function fsInlineRename(id) {
  const n = fsNode(id);
  if (!n || n.kind !== 'folder') return;
  const row = fsRowOf(id);
  if (!row || !row.querySelector) { fsRenderTree(); return; }
  const nameEl = row.querySelector('.tree-name');
  if (!nameEl || !nameEl.replaceWith) return;
  const input = document.createElement('input');
  input.setAttribute('class', 'tree-name-input');
  input.value = n.name;
  nameEl.replaceWith(input);
  if (input.focus) input.focus();
  if (input.select) input.select();
  let done = false;
  fsEditing = input;
  const finish = (save) => {
    if (done) return;
    done = true;
    if (fsEditing === input) fsEditing = null;
    // 树被重绘时输入框已被摘掉，这次 blur 不能把旧值写回去
    if (input.__cancelled) return;
    if (save) fsRenameFolder(id, input.value);
    else fsRenderTree();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

function fsOpenTreeMenu(evt, id) {
  const menu = document.getElementById('tree-menu');
  const n = fsNode(id);
  if (!menu || !n) return;
  menu.innerHTML = '';
  const item = (label, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', (e) => {
      if (e.stopPropagation) e.stopPropagation();
      menu.classList.add('hidden');
      fn();
    });
    menu.appendChild(b);
  };
  if (n.kind === 'folder') item('重命名', () => fsInlineRename(id));
  if (id !== fsRoot.id) item('移到根目录', () => fsMoveNode(id, fsRoot.id, 'into'));
  item('删除', () => fsDeleteWithConfirm(id));
  menu.classList.remove('hidden');
  const maxX = (window.innerWidth || 800) - 150;
  const maxY = (window.innerHeight || 600) - 110;
  menu.style.left = Math.min(Math.max(8, evt.clientX || 0), maxX) + 'px';
  menu.style.top = Math.min(Math.max(8, evt.clientY || 0), maxY) + 'px';
}

function fsConfirm(msg) {
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') return window.confirm(msg);
  return true;
}

function fsDeleteWithConfirm(id) {
  const n = fsNode(id);
  if (!n || n === fsRoot) return false;
  const what = n.kind === 'folder'
    ? `删除目录「${n.name}」${fsCountFiles(n) ? `及其中的 ${fsCountFiles(n)} 张图` : ''}？`
    : `删除图「${fsDisplayName(n)}」？`;
  if (!fsConfirm(what)) return false;
  return fsDeleteNode(id);
}

function fsBindTree() {
  const box = document.getElementById('file-tree');
  if (!box) return;

  box.addEventListener('click', (evt) => {
    const row = fsRowFromEvent(evt);
    if (!row) return;
    const id = row.getAttribute('data-id');
    const n = fsNode(id);
    if (!n) return;
    if (n.kind === 'folder') {
      n.open = !n.open;             // 点目录 = 选中 + 展开/收起
      fsSelId = id;
      fsSave();
      fsRenderTree();
      return;
    }
    if (id !== fsCurrent) fsSelect(id);
    else { fsSelId = id; fsSave(); fsRenderTree(); }
  });

  box.addEventListener('dblclick', (evt) => {
    const row = fsRowFromEvent(evt);
    if (!row) return;
    const n = fsNode(row.getAttribute('data-id'));
    if (n && n.kind === 'folder') fsInlineRename(n.id);
  });

  box.addEventListener('contextmenu', (evt) => {
    const row = fsRowFromEvent(evt);
    if (!row) return;
    evt.preventDefault();
    fsSelId = row.getAttribute('data-id');
    fsRenderTree();
    fsOpenTreeMenu(evt, fsSelId);
  });

  box.addEventListener('dragstart', (evt) => {
    const row = fsRowFromEvent(evt);
    if (!row) return;
    fsDragId = row.getAttribute('data-id');
    if (evt.dataTransfer) {
      evt.dataTransfer.effectAllowed = 'move';
      try { evt.dataTransfer.setData('text/plain', fsDragId); } catch (e) { /* 个别浏览器只读 */ }
    }
    row.classList.add('dragging');
  });

  box.addEventListener('dragover', (evt) => {
    if (!fsDragId) return;
    evt.preventDefault();
    if (evt.dataTransfer) evt.dataTransfer.dropEffect = 'move';
    const row = fsRowFromEvent(evt);
    if (!row) { fsClearDropMarks(); return; }          // 空白处 = 移到根目录
    const id = row.getAttribute('data-id');
    const n = fsNode(id);
    if (!n || id === fsDragId) { fsClearDropMarks(); return; }
    const mode = n.kind === 'folder' ? 'into' : 'before';
    if (fsDropTarget && fsDropTarget.id === id && fsDropTarget.mode === mode) return;
    fsClearDropMarks();
    row.classList.add(mode === 'into' ? 'drop-into' : 'drop-before');
    fsDropTarget = { id, mode };
  });

  box.addEventListener('drop', (evt) => {
    evt.preventDefault();
    const target = fsDropTarget;
    const id = fsDragId;
    fsClearDropMarks();
    fsDragId = null;
    if (!id) return;
    if (!target) fsMoveNode(id, fsRoot.id, 'into');
    else fsMoveNode(id, target.id, target.mode);
  });

  box.addEventListener('dragend', () => {
    fsDragId = null;
    fsClearDropMarks();
    const b = document.getElementById('file-tree');
    if (b) for (const r of b.children) if (r.classList) r.classList.remove('dragging');
  });
}

function fsBindToolbar() {
  document.querySelectorAll('[data-fs]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const act = btn.getAttribute('data-fs');
      if (act === 'new-file') fsAddNode('file', fsSelId || fsCurrent);
      else if (act === 'new-folder') fsAddNode('folder', fsSelId || fsCurrent);
      else if (act === 'rename') {
        const n = fsNode(fsSelId);
        if (n && n.kind === 'folder') fsInlineRename(n.id);
        else if (n) { const p = fsParent(n.id); if (p && p !== fsRoot) fsInlineRename(p.id); }
        else if (typeof setStatus === 'function') setStatus('先选中一个目录再重命名', 'err');
      } else if (act === 'delete') {
        const n = fsNode(fsSelId);
        if (n && n === fsRoot) { if (typeof setStatus === 'function') setStatus('根目录不能删除', 'err'); return; }
        fsDeleteWithConfirm(fsSelId);
      }
    });
  });

  const toggle = document.getElementById('btn-files');
  if (toggle) toggle.addEventListener('click', () => {
    const pane = document.getElementById('files-pane');
    if (pane) fsSetPaneVisible(pane.classList.contains('hidden'));
  });

  document.addEventListener('click', () => {
    const menu = document.getElementById('tree-menu');
    if (menu) menu.classList.add('hidden');
  });
}

/* 文件区高度拖拽 */
function fsBindDivider() {
  const divider = document.getElementById('files-divider');
  const pane = document.getElementById('files-pane');
  if (!divider || !pane) return;
  let drag = null;
  divider.addEventListener('pointerdown', (evt) => {
    if (evt.button !== 0) return;
    evt.preventDefault();
    drag = { startY: evt.clientY, startH: pane.offsetHeight || parseInt(pane.style.height, 10) || FS_PANE_DEFAULT_H };
    divider.classList.add('active');
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  });
  document.addEventListener('pointermove', (evt) => {
    if (!drag) return;
    const h = Math.max(FS_PANE_MIN_H, Math.min(FS_PANE_MAX_H, drag.startH + (evt.clientY - drag.startY)));
    pane.style.height = h + 'px';
  });
  document.addEventListener('pointerup', () => {
    if (!drag) return;
    drag = null;
    divider.classList.remove('active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    fsSave();
  });
}

/* ---------------- 启动 ---------------- */

function fsInit() {
  const saved = fsLoad();
  if (!saved) { fsSeed(); fsSave(); }
  const n = fsNode(fsCurrent);
  editor.value = (n && n.src) || '';
  if (saved && saved.pane) fsApplyPaneState(saved.pane);
  fsRenderTree();
  fsBindTree();
  fsBindToolbar();
  fsBindDivider();
  fsSyncPanes();
}
