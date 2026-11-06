/* ==========================================================================
 *  视图状态 & 绘制
 * ========================================================================== */

let currentModel = null;
// 上一次成功构建的结果（含结构签名），供 buildModel 判断能否复用布局
let _lastBuild = null;
const view = { zoom: 1, panX: 0, panY: 0 };
let svgEl = null;
let viewportEl = null;
let _vbW = 800, _vbH = 600;
let dragState = null;
let panState = null;
let resizeState = null;
let lifeDragState = null;
let actEdgeDrag = null;
let swimDragState = null;
let bendDragState = null;
let anchorDragState = null;
let seqDrag = null;
let paintQueued = false;

const preview = document.getElementById('preview');
const statusBar = document.getElementById('status');
const zoomInfo = document.getElementById('zoominfo');

function setStatus(msg, cls = '') {
  statusBar.textContent = msg;
  statusBar.className = cls;
}
function updateZoomInfo() {
  zoomInfo.textContent = Math.round(view.zoom * 100) + '%';
}
function syncViewportTransform() {
  if (viewportEl) {
    viewportEl.setAttribute('transform',
      `translate(${view.panX},${view.panY}) scale(${view.zoom})`);
  }
}

/* 以某个屏幕点为锚点缩放：该点下方的图形保持不动。
   滚轮和双指缩放共用这一份数学，保证两种输入手感一致。 */
function zoomAtClient(clientX, clientY, factor) {
  if (!svgEl) return;
  const v = clientToViewport(clientX, clientY);
  const newZoom = clamp(view.zoom * factor, 0.06, 8);
  const k = newZoom / view.zoom;
  view.panX = v.x - (v.x - view.panX) * k;
  view.panY = v.y - (v.y - view.panY) * k;
  view.zoom = newZoom;
  syncViewportTransform();
  updateZoomInfo();
}

function fitView() {
  if (!currentModel) return;
  // 窄屏切到代码页时预览是隐藏的（clientWidth 为 0），此时不重算，等切回来再算
  if (!preview.clientWidth || !preview.clientHeight) return;
  const W = Math.max(preview.clientWidth, 200);
  const H = Math.max(preview.clientHeight, 200);
  const minX = currentModel.layoutMinX || 0;
  const minY = currentModel.layoutMinY || 0;
  const cw = (currentModel.contentW || 400) - minX;
  const ch = (currentModel.contentH || 300) - minY;
  const pad = 30;
  const z = Math.min((W - pad * 2) / Math.max(cw, 1), (H - pad * 2) / Math.max(ch, 1));
  view.zoom = clamp(z, 0.08, 1.6);
  view.panX = (W - cw * view.zoom) / 2 - minX * view.zoom;
  view.panY = (H - ch * view.zoom) / 2 - minY * view.zoom;
  updateZoomInfo();
}

function paint() {
  if (!currentModel) return;
  const W = Math.max(preview.clientWidth, 200);
  const H = Math.max(preview.clientHeight, 200);
  _vbW = W; _vbH = H;

  svgEl = el('svg', {
    xmlns: SVG_NS,
    viewBox: `0 0 ${W} ${H}`,
    width: W,
    height: H
  });
  svgEl.appendChild(styleEl(svgStyle()));

  const content = currentModel.type === 'sequence'
    ? buildSequenceContent(currentModel)
    : buildGraphContent(currentModel);

  viewportEl = el('g', {
    transform: `translate(${view.panX},${view.panY}) scale(${view.zoom})`
  });
  viewportEl.appendChild(content);
  svgEl.appendChild(viewportEl);

  preview.innerHTML = '';
  preview.appendChild(svgEl);

  // 事件绑定
  svgEl.addEventListener('pointerdown', onCanvasPointerDown);

  viewportEl.querySelectorAll('[data-node-id]').forEach(elm => {
    if (elm.getAttribute('data-seqkind')) return; // 顺序图元素走专属拖拽
    elm.style.cursor = 'grab';
    elm.addEventListener('pointerdown', onNodePointerDown);
  });

  // 顺序图元素拖拽（参与者/激活条/消息/组合片段）
  viewportEl.querySelectorAll('[data-seqkind]').forEach(elm => {
    const kind = elm.getAttribute('data-seqkind');
    elm.style.cursor = kind === 'msg' || kind === 'act' ? 'ns-resize' : 'move';
    elm.addEventListener('pointerdown', onSeqPointerDown);
  });

  viewportEl.querySelectorAll('[data-boundary-handle]').forEach(elm => {
    elm.addEventListener('pointerdown', onBoundaryHandlePointerDown);
  });

  viewportEl.querySelectorAll('[data-ctype]').forEach(elm => {
    elm.addEventListener('pointerdown', onContainerHandlePointerDown);
  });

  viewportEl.querySelectorAll('[data-seq-life-handle]').forEach(elm => {
    elm.addEventListener('pointerdown', onLifeHandlePointerDown);
  });

  viewportEl.querySelectorAll('[data-act-edge]').forEach(elm => {
    elm.addEventListener('pointerdown', onActEdgePointerDown);
  });

  viewportEl.querySelectorAll('[data-swimlane-body]').forEach(elm => {
    elm.style.cursor = 'move';
    elm.addEventListener('pointerdown', onSwimlanePointerDown);
  });

  viewportEl.querySelectorAll('[data-bend-edge]').forEach(elm => {
    elm.addEventListener('pointerdown', onBendPointerDown);
    elm.addEventListener('dblclick', onBendDblClick);
  });
  viewportEl.querySelectorAll('[data-anchor-edge]').forEach(elm => {
    elm.addEventListener('pointerdown', onAnchorPointerDown);
  });
  svgEl.addEventListener('dblclick', onCanvasDblClick);

  updateZoomInfo();

  // 图发生变化（修改代码 / 拖动 / 调整）后，防抖刷新历史记录（示例代码会被内部跳过）
  if (typeof scheduleHistory === 'function') scheduleHistory();
}

function schedulePaint() {
  if (paintQueued) return;
  paintQueued = true;
  requestAnimationFrame(() => {
    paintQueued = false;
    paint();
  });
}

/* ---------------- 坐标换算 ---------------- */

/* 屏幕坐标 → SVG 视口坐标（viewBox 单位） */
function clientToViewport(clientX, clientY) {
  if (!svgEl) return { x: 0, y: 0 };
  const rect = svgEl.getBoundingClientRect();
  const sx = rect.width ? _vbW / rect.width : 1;
  const sy = rect.height ? _vbH / rect.height : 1;
  return {
    x: (clientX - rect.left) * sx,
    y: (clientY - rect.top) * sy
  };
}

function clientToBase(clientX, clientY) {
  if (!svgEl) return { x: 0, y: 0 };
  const v = clientToViewport(clientX, clientY);
  return {
    x: (v.x - view.panX) / view.zoom,
    y: (v.y - view.panY) / view.zoom
  };
}

/* ---------------- 交互 ---------------- */

function onNodePointerDown(evt) {
  if (evt.button !== 0) return;
  const id = evt.currentTarget.getAttribute('data-node-id');
  if (!currentModel || !currentModel.nodes) return;
  const node = currentModel.nodes.find(n => n.id === id);
  if (!node) return;

  evt.stopPropagation();
  evt.preventDefault();

  const p = clientToBase(evt.clientX, evt.clientY);
  dragState = {
    node,
    offsetX: node.x - p.x,
    offsetY: node.y - p.y,
    moved: false
  };
  document.body.style.cursor = 'grabbing';
}

/* 顺序图元素拖拽：part 可平移；msg/act 仅纵向；frag 可平移 */
function onSeqPointerDown(evt) {
  if (evt.button !== 0) return;
  const kind = evt.currentTarget.getAttribute('data-seqkind');
  const idx = +evt.currentTarget.getAttribute('data-seqidx');
  if (!currentModel) return;

  const p = clientToBase(evt.clientX, evt.clientY);
  let obj = null;
  if (kind === 'part') obj = currentModel.participants && currentModel.participants[idx];
  else if (kind === 'act') obj = currentModel.activations && currentModel.activations[idx];
  else if (kind === 'msg') obj = currentModel.messages && currentModel.messages[idx];
  else if (kind === 'frag') obj = currentModel.fragments && currentModel.fragments[idx];
  if (!obj) return;

  evt.stopPropagation();
  evt.preventDefault();
  const startX = p.x, startY = p.y;
  const baseX = obj.x, baseY = kind === 'act' ? obj.startY : obj.y;
  const baseEnd = kind === 'act' ? obj.endY : 0;

  let fn = null;
  if (kind === 'act') {
    fn = (dx, dy) => { obj.startY = baseY + dy; obj.endY = baseEnd + dy; };
  } else if (kind === 'msg') {
    fn = (dx, dy) => { obj.y = baseY + dy; };
  } else if (kind === 'part') {
    fn = (dx, dy) => { obj.x = baseX + dx; obj.y = baseY + dy; };
  } else if (kind === 'frag') {
    fn = (dx, dy) => { obj.x = baseX + dx; obj.y = baseY + dy; };
  }

  seqDrag = { fn, startX, startY };
  document.body.style.cursor = 'grabbing';
}

function onCanvasPointerDown(evt) {
  if (evt.button !== 0 && evt.button !== 1) return;
  evt.preventDefault();
  panState = {
    cx0: evt.clientX,
    cy0: evt.clientY,
    panX0: view.panX,
    panY0: view.panY
  };
  document.body.style.cursor = 'grabbing';
}

/* ---------------- 用例图边界框大小调整 ---------------- */

const BOUNDARY_MIN = 60;

function onBoundaryHandlePointerDown(evt) {
  if (evt.button !== 0) return;
  const corner = evt.currentTarget.getAttribute('data-boundary-handle');
  if (!currentModel || !currentModel.boundary) return;

  evt.stopPropagation();
  evt.preventDefault();

  const p = clientToBase(evt.clientX, evt.clientY);
  const b = currentModel.boundary;
  resizeState = {
    corner,
    obj: b,
    bx0: b.x, by0: b.y, bw0: b.w, bh0: b.h,
    startX: p.x, startY: p.y
  };
  document.body.style.cursor = evt.currentTarget.getAttribute('cursor') || 'nwse-resize';
}

function onPointerMoveResize(evt) {
  const p = clientToBase(evt.clientX, evt.clientY);
  const s = resizeState;
  const b = resizeState.obj;
  const mn = s.min || BOUNDARY_MIN;
  const dx = p.x - s.startX;
  const dy = p.y - s.startY;

  let x = s.bx0, y = s.by0, w = s.bw0, h = s.bh0;
  if (s.corner.includes('e')) w = Math.max(mn, s.bw0 + dx);
  if (s.corner.includes('s')) h = Math.max(mn, s.bh0 + dy);
  if (s.corner.includes('w')) {
    w = Math.max(mn, s.bw0 - dx);
    x = s.bx0 + (s.bw0 - w);
  }
  if (s.corner.includes('n')) {
    h = Math.max(mn, s.bh0 - dy);
    y = s.by0 + (s.bh0 - h);
  }

  b.x = x; b.y = y; b.w = w; b.h = h;
  schedulePaint();
  evt.preventDefault();
}

// 生命线统一高度调节：纵向拖拽底部手柄改变全部生命线高度
function onLifeHandlePointerDown(evt) {
  if (evt.button !== 0 || !currentModel) return;
  evt.stopPropagation();
  evt.preventDefault();
  const p = clientToBase(evt.clientX, evt.clientY);
  const cur = currentModel.lifeBottom != null
    ? currentModel.lifeBottom
    : ((currentModel.contentH || 400) - 24);
  lifeDragState = { baseBottom: cur, startY: p.y, min: 100 };
  document.body.style.cursor = 'ns-resize';
}

// 激活条上下端点长度调节
function onActEdgePointerDown(evt) {
  if (evt.button !== 0 || !currentModel) return;
  const idx = +evt.currentTarget.getAttribute('data-cidx');
  const edge = evt.currentTarget.getAttribute('data-act-edge');
  const a = currentModel.activations && currentModel.activations[idx];
  if (!a) return;
  evt.stopPropagation();
  evt.preventDefault();
  const p = clientToBase(evt.clientX, evt.clientY);
  actEdgeDrag = { idx, edge, startY: p.y, baseStart: a.startY, baseEnd: a.endY };
  document.body.style.cursor = 'ns-resize';
}

/* ---------------- 活动图容器（泳道 / 活动边）交互 ---------------- */

// 四角调整：普通元素边界、活动边、泳道共用一套 resize 逻辑
function onContainerHandlePointerDown(evt) {
  if (evt.button !== 0) return;
  const ctype = evt.currentTarget.getAttribute('data-ctype');
  const cidx = +evt.currentTarget.getAttribute('data-cidx');
  const corner = evt.currentTarget.getAttribute('data-corner');
  let obj;
  if (ctype === 'boundary') obj = currentModel && currentModel.boundary;
  else if (ctype === 'activityEdge') obj = currentModel && currentModel.activityEdge;
  else if (ctype === 'swimlane') obj = currentModel && currentModel.swimlanes && currentModel.swimlanes[cidx];
  else if (ctype === 'seqFrag') obj = currentModel.fragments && currentModel.fragments[cidx];
  if (!obj) return;

  evt.stopPropagation();
  evt.preventDefault();
  const p = clientToBase(evt.clientX, evt.clientY);
  const min = ctype === 'seqFrag' ? 40 : BOUNDARY_MIN;
  resizeState = {
    corner, obj, min,
    bx0: obj.x, by0: obj.y, bw0: obj.w, bh0: obj.h,
    startX: p.x, startY: p.y
  };
  document.body.style.cursor = evt.currentTarget.getAttribute('cursor') || 'nwse-resize';
}

// 泳道整体拖动 + 靠近其他泳道时自动吸附对齐（合并）
const SWIM_SNAP = 9;
function onSwimlanePointerDown(evt) {
  if (evt.button !== 0) return;
  const idx = +evt.currentTarget.getAttribute('data-swimlane-body');
  const s = currentModel && currentModel.swimlanes && currentModel.swimlanes[idx];
  if (!s) return;
  evt.stopPropagation();
  evt.preventDefault();
  const p = clientToBase(evt.clientX, evt.clientY);
  const mem = [];
  if (currentModel && currentModel.nodes) {
    for (const n of currentModel.nodes) {
      if (n.lane === s.label) mem.push({ n, dx: n.x - s.x, dy: n.y - s.y });
    }
  }
  swimDragState = { idx, startX: p.x, startY: p.y, sx0: s.x, sy0: s.y, mem };
  document.body.style.cursor = 'move';
}

// 返回节点归入的泳道对象（按 label 匹配），没有则返回 null
function laneOf(node) {
  if (!node || !node.lane || !currentModel || !currentModel.swimlanes) return null;
  return currentModel.swimlanes.find(o => o.label === node.lane) || null;
}

// 把节点坐标约束在其所属泳道范围内（留边距）
function clampToLane(node, M = 12) {
  const lane = laneOf(node);
  if (!lane) return;
  const loX = Math.min(lane.x + M, lane.x + lane.w - M), hiX = Math.max(lane.x + M, lane.x + lane.w - M);
  const loY = Math.min(lane.y + M, lane.y + lane.h - M), hiY = Math.max(lane.y + M, lane.y + lane.h - M);
  node.x = Math.min(Math.max(node.x, loX), hiX);
  node.y = Math.min(Math.max(node.y, loY), hiY);
}

function snapSwimlane(s) {
  const list = currentModel.swimlanes || [];
  for (const o of list) {
    if (o === s) continue;
    if (o.dir === 'h' && s.dir === 'h') {
      const edges = [o.y, o.y + o.h];
      for (const e of edges) {
        if (Math.abs(s.y - e) <= SWIM_SNAP) s.y = e;
        if (Math.abs(s.y + s.h - e) <= SWIM_SNAP) s.y = e - s.h;
      }
    } else if (o.dir === 'v' && s.dir === 'v') {
      const edges = [o.x, o.x + o.w];
      for (const e of edges) {
        if (Math.abs(s.x - e) <= SWIM_SNAP) s.x = e;
        if (Math.abs(s.x + s.w - e) <= SWIM_SNAP) s.x = e - s.w;
      }
    }
  }
  // 吸附到活动边内侧
  const a = currentModel.activityEdge;
  if (a) {
    if (s.dir === 'h') {
      if (Math.abs(s.y - a.y) <= SWIM_SNAP) s.y = a.y;
      if (Math.abs(s.y + s.h - (a.y + a.h)) <= SWIM_SNAP) s.y = a.y + a.h - s.h;
    } else {
      if (Math.abs(s.x - a.x) <= SWIM_SNAP) s.x = a.x;
      if (Math.abs(s.x + s.w - (a.x + a.w)) <= SWIM_SNAP) s.x = a.x + a.w - s.w;
    }
  }
}

/* ---------------- 折点（连线折线） ---------------- */

function projOnSeg(A, B, P) {
  const dx = B.x - A.x, dy = B.y - A.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((P.x - A.x) * dx + (P.y - A.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { x: A.x + dx * t, y: A.y + dy * t };
}

// 找到离鼠标最近的点所在边与线段段索引
function closestOnEdge(model, p, eps) {
  const nodeMap = new Map(model.nodes.map(n => [n.id, n]));
  let best = null, bestD = Infinity;
  model.edges.forEach((e, ei) => {
    const a = nodeMap.get(e.from), b = nodeMap.get(e.to);
    if (!a || !b || a === b) return;
    const bends = (e.bends && e.bends.length) ? e.bends.filter(pt => isFinite(pt.x) && isFinite(pt.y)) : null;
    const p1 = bends ? clipPoint(a, bends[0].x, bends[0].y) : clipPoint(a, b.x, b.y);
    const p2 = bends ? clipPoint(b, bends[bends.length - 1].x, bends[bends.length - 1].y) : clipPoint(b, a.x, a.y);
    const pts = bends ? [p1].concat(bends, [p2]) : [p1, p2];
    for (let j = 0; j < pts.length - 1; j++) {
      const q = projOnSeg(pts[j], pts[j + 1], p);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestD) { bestD = d; best = { ei, seg: j, q }; }
    }
  });
  return (best && bestD < eps) ? best : null;
}

function onBendPointerDown(evt) {
  if (evt.button !== 0) return;
  if (!currentModel) return;
  const ei = +evt.currentTarget.getAttribute('data-bend-edge');
  const bi = +evt.currentTarget.getAttribute('data-bend-idx');
  const e = currentModel.edges[ei];
  const bend = e && e.bends ? e.bends[bi] : null;
  if (!bend) return;

  evt.stopPropagation();
  evt.preventDefault();

  const p = clientToBase(evt.clientX, evt.clientY);
  bendDragState = {
    ei, bi,
    startX: p.x, startY: p.y,
    bx0: bend.x, by0: bend.y
  };
  document.body.style.cursor = 'move';
}

function onAnchorPointerDown(evt) {
  if (evt.button !== 0) return;
  if (!currentModel) return;
  const ei = +evt.currentTarget.getAttribute('data-anchor-edge');
  const which = evt.currentTarget.getAttribute('data-anchor-end'); // 'start' | 'end'
  evt.stopPropagation();
  evt.preventDefault();
  anchorDragState = { ei, which };
  document.body.style.cursor = 'grabbing';
}

function onBendDblClick(evt) {
  if (!currentModel) return;
  evt.stopPropagation();
  evt.preventDefault();
  deleteBendAt(+evt.currentTarget.getAttribute('data-bend-edge'),
    +evt.currentTarget.getAttribute('data-bend-idx'));
}

function onCanvasDblClick(evt) {
  // 触屏已经自己判过双击并处理了，别再重复插入一个折点
  if (Date.now() - _lastTouchDoubleTapAt < 600) return;
  onDoubleTap(evt.clientX, evt.clientY, evt.target);
}

document.addEventListener('pointermove', (evt) => {
  if (actEdgeDrag) {
    const p = clientToBase(evt.clientX, evt.clientY);
    const a = currentModel.activations && currentModel.activations[actEdgeDrag.idx];
    const dy = p.y - actEdgeDrag.startY;
    if (a) {
      if (actEdgeDrag.edge === 'top') {
        a.startY = Math.min(actEdgeDrag.baseStart + dy, a.endY - 8);
      } else {
        a.endY = Math.max(actEdgeDrag.baseEnd + dy, a.startY + 8);
      }
    }
    schedulePaint();
    evt.preventDefault();
    return;
  }
  if (lifeDragState) {
    const p = clientToBase(evt.clientX, evt.clientY);
    currentModel.lifeBottom = Math.max(lifeDragState.min, lifeDragState.baseBottom + (p.y - lifeDragState.startY));
    if (currentModel.contentH != null && currentModel.lifeBottom + 24 > currentModel.contentH) {
      currentModel.contentH = currentModel.lifeBottom + 24;
    }
    schedulePaint();
    evt.preventDefault();
    return;
  }
  if (resizeState) {
    onPointerMoveResize(evt);
    return;
  }
  if (anchorDragState) {
    const p = clientToBase(evt.clientX, evt.clientY);
    const e = currentModel.edges && currentModel.edges[anchorDragState.ei];
    if (e) {
      const srcId = anchorDragState.which === 'start' ? e.from : e.to;
      const nd = currentModel.nodes && currentModel.nodes.find(nn => nn.id === srcId);
      if (nd) {
        const off = anchorOffset(nd, p.x, p.y);
        if (anchorDragState.which === 'start') e.aAnchor = off; else e.bAnchor = off;
      }
    }
    schedulePaint();
    evt.preventDefault();
    return;
  }
  if (bendDragState) {
    const p = clientToBase(evt.clientX, evt.clientY);
    const e = currentModel.edges[bendDragState.ei];
    const bend = e && e.bends ? e.bends[bendDragState.bi] : null;
    if (bend) {
      bend.x = bendDragState.bx0 + (p.x - bendDragState.startX);
      bend.y = bendDragState.by0 + (p.y - bendDragState.startY);
    }
    schedulePaint();
    evt.preventDefault();
    return;
  }
  if (dragState) {
    const p = clientToBase(evt.clientX, evt.clientY);
    dragState.node.x = p.x + dragState.offsetX;
    dragState.node.y = p.y + dragState.offsetY;
    clampToLane(dragState.node); // 归入泳道的节点不可超出泳道范围
    dragState.moved = true;
    schedulePaint();
    evt.preventDefault();
    return;
  }
  if (seqDrag) {
    const p = clientToBase(evt.clientX, evt.clientY);
    seqDrag.fn(p.x - seqDrag.startX, p.y - seqDrag.startY);
    schedulePaint();
    evt.preventDefault();
    return;
  }
  if (swimDragState) {
    const p = clientToBase(evt.clientX, evt.clientY);
    const s = currentModel.swimlanes && currentModel.swimlanes[swimDragState.idx];
    if (s) {
      s.x = swimDragState.sx0 + (p.x - swimDragState.startX);
      s.y = swimDragState.sy0 + (p.y - swimDragState.startY);
      snapSwimlane(s);
      // 归入本泳道的节点跟随泳道同步平移，保持相对静止
      for (const mm of swimDragState.mem) {
        mm.n.x = s.x + mm.dx;
        mm.n.y = s.y + mm.dy;
      }
    }
    schedulePaint();
    evt.preventDefault();
    return;
  }
  if (panState) {
    view.panX = panState.panX0 + (evt.clientX - panState.cx0);
    view.panY = panState.panY0 + (evt.clientY - panState.cy0);
    if (viewportEl) {
      viewportEl.setAttribute('transform',
        `translate(${view.panX},${view.panY}) scale(${view.zoom})`);
    }
    evt.preventDefault();
  }
}, { passive: false });

document.addEventListener('pointerup', () => {
  if (dragState) { dragState = null; document.body.style.cursor = ''; }
  if (panState) { panState = null; document.body.style.cursor = ''; }
  if (resizeState) { resizeState = null; document.body.style.cursor = ''; }
  if (lifeDragState) { lifeDragState = null; document.body.style.cursor = ''; }
  if (actEdgeDrag) { actEdgeDrag = null; document.body.style.cursor = ''; }
  if (bendDragState) { bendDragState = null; document.body.style.cursor = ''; }
  if (anchorDragState) { anchorDragState = null; document.body.style.cursor = ''; }
  if (swimDragState) { swimDragState = null; document.body.style.cursor = ''; }
  if (seqDrag) { seqDrag = null; document.body.style.cursor = ''; }
});
document.addEventListener('pointercancel', () => {
  dragState = null; panState = null; resizeState = null; lifeDragState = null; actEdgeDrag = null; bendDragState = null; anchorDragState = null; swimDragState = null; seqDrag = null; document.body.style.cursor = '';
});

preview.addEventListener('wheel', (evt) => {
  if (!svgEl || !viewportEl) return;
  evt.preventDefault();
  zoomAtClient(evt.clientX, evt.clientY, Math.exp(-evt.deltaY * 0.0016));
}, { passive: false });

/* ==========================================================================
 *  触屏手势
 *  - 单指：拖元素 / 空白处平移（走已有的 Pointer Events 分支）
 *  - 双指：捏合缩放，同时跟着两指中点平移
 *  - 双击：加折点；双击折点：删除折点（触屏没有 dblclick 的可靠时序，自己判）
 * ========================================================================== */

const touchPointers = new Map();   // pointerId -> 最近一次屏幕坐标
let pinchState = null;

function pinchCenter() {
  const pts = Array.from(touchPointers.values());
  return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
}
function pinchDistance() {
  const pts = Array.from(touchPointers.values());
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
}

/* 第二根手指按下时，把单指拖拽状态全部丢弃，避免「拖一半又缩放」 */
function cancelActiveDrags() {
  dragState = panState = resizeState = lifeDragState = actEdgeDrag =
    swimDragState = bendDragState = anchorDragState = seqDrag = null;
  document.body.style.cursor = '';
}

preview.addEventListener('pointerdown', (evt) => {
  if (evt.pointerType !== 'touch' && evt.pointerType !== 'pen') return;
  touchPointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
  if (touchPointers.size === 2 && svgEl) {
    const c = pinchCenter();
    const cv = clientToViewport(c.x, c.y);
    cancelActiveDrags();
    pinchState = {
      dist0: pinchDistance(),
      anchorX: cv.x - view.panX,   // 起始中点对应的世界坐标
      anchorY: cv.y - view.panY,
      zoom0: view.zoom
    };
  }
}, true);

document.addEventListener('pointermove', (evt) => {
  if (!touchPointers.has(evt.pointerId)) return;
  touchPointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
  if (!pinchState || touchPointers.size < 2) return;
  evt.preventDefault();

  const c = clientToViewport(pinchCenter().x, pinchCenter().y);
  const zoom = clamp(pinchState.zoom0 * (pinchDistance() / pinchState.dist0), 0.06, 8);
  const k = zoom / pinchState.zoom0;
  view.zoom = zoom;
  // 世界锚点跟着两指中点走：缩放 + 平移一次算完
  view.panX = c.x - pinchState.anchorX * k;
  view.panY = c.y - pinchState.anchorY * k;
  syncViewportTransform();
  updateZoomInfo();
}, { passive: false });

function endTouchPointer(evt) {
  touchPointers.delete(evt.pointerId);
  if (touchPointers.size < 2) pinchState = null;
}
document.addEventListener('pointerup', endTouchPointer);
document.addEventListener('pointercancel', endTouchPointer);

/* ---------------- 双击（触屏）：加 / 删折点 ---------------- */

let lastTap = null;
let _lastTouchDoubleTapAt = 0;

function deleteBendAt(ei, bi) {
  const e = currentModel && currentModel.edges && currentModel.edges[ei];
  if (!e || !e.bends || !e.bends[bi]) return;
  const before = undoSnapshot();
  e.bends.splice(bi, 1);
  if (!e.bends.length) { e.bends = null; e.aAnchor = undefined; e.bAnchor = undefined; }
  commitUndo(before);
  schedulePaint();
  setStatus('已删除折点', 'ok');
}

/* 双击落点：折点上=删除，节点上=忽略，连线附近=插入折点 */
function onDoubleTap(clientX, clientY, target) {
  if (!currentModel) return;
  const bendEl = target && target.closest && target.closest('[data-bend-edge]');
  if (bendEl) {
    deleteBendAt(+bendEl.getAttribute('data-bend-edge'), +bendEl.getAttribute('data-bend-idx'));
    return;
  }
  if (target && target.closest && target.closest('[data-node-id]')) return;

  const p = clientToBase(clientX, clientY);
  const eps = 8 / Math.max(view.zoom, 0.0001);
  const hit = closestOnEdge(currentModel, p, eps);
  if (!hit) return;

  const e = currentModel.edges[hit.ei];
  const before = undoSnapshot();
  if (!e.bends) e.bends = [];
  e.bends.splice(hit.seg, 0, { x: hit.q.x, y: hit.q.y });
  commitUndo(before);
  schedulePaint();
  setStatus('已添加折点', 'ok');
}

document.addEventListener('pointerup', (evt) => {
  if (evt.pointerType !== 'touch' && evt.pointerType !== 'pen') return;
  if (touchPointers.size) return;          // 双指松开的那一下不算双击
  const now = Date.now();
  const near = lastTap && Math.hypot(evt.clientX - lastTap.x, evt.clientY - lastTap.y) < 30;
  if (near && now - lastTap.t < 320) {
    lastTap = null;
    _lastTouchDoubleTapAt = now;
    onDoubleTap(evt.clientX, evt.clientY, evt.target);
  } else {
    lastTap = { t: now, x: evt.clientX, y: evt.clientY };
  }
});

/* ==========================================================================
 *  主流程
 * ========================================================================== */

function render(opts) {
  const src = document.getElementById('editor').value;
  // 编辑器内容写回当前文件（文件树里那一行的名字/图标跟着代码走）
  if (typeof fsTouchCurrent === 'function') fsTouchCurrent();
  try {
    const built = buildModel(src, {
      previous: _lastBuild,
      force: !!(opts && opts.force)
    });
    currentModel = built.model;
    _lastBuild = built;

    // 结构（节点/连线/文字/@layout 块）完全没变：沿用上次的布局与拖动结果，
    // 既不重排也不重绘，避免打字时图形乱跳、手动拖出来的位置被冲掉。
    if (built.reused) {
      setStatus('✓ 内容未变化，已跳过重排（画布位置保持不变）', 'ok');
      return;
    }

    // 重新布局意味着几何全部重算：之前基于旧坐标的撤销快照不能再用了
    if (typeof resetUndo === 'function') resetUndo();

    fitView();
    paint();

    const model = built.model;
    const count = model.type === 'sequence'
      ? model.participants.length + model.messages.length + model.activations.length + model.fragments.length
      : model.nodes.length;
    setStatus(`✓ 渲染成功 · 类型：${model.type} · 元素数：${count} · 滚轮/双指缩放 · 拖拽元素 / 空白处平移`, 'ok');
  } catch (err) {
    setStatus('✗ ' + err.message, 'err');
  }
}

/* 输入去抖：停止输入 140ms 后才走一次渲染。
   之前只在 rAF 里排队，等于每个按键都跑一遍完整流水线（力导向 320 轮 O(n²)）。 */
let renderTimer = null;
function renderDebounced() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(() => { renderTimer = null; render(); }, 140);
}