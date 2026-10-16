/* ==========================================================================
 *  视图状态 & 绘制
 * ========================================================================== */

let currentModel = null;
const view = { zoom: 1, panX: 0, panY: 0 };
let svgEl = null;
let viewportEl = null;
let _vbW = 800, _vbH = 600;
let dragState = null;
let panState = null;
let resizeState = null;
let bendDragState = null;
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

function fitView() {
  if (!currentModel) return;
  const W = Math.max(preview.clientWidth, 200);
  const H = Math.max(preview.clientHeight, 200);
  const cw = currentModel.contentW || 400;
  const ch = currentModel.contentH || 300;
  const pad = 30;
  const z = Math.min((W - pad * 2) / cw, (H - pad * 2) / ch);
  view.zoom = clamp(z, 0.08, 1.6);
  view.panX = (W - cw * view.zoom) / 2;
  view.panY = (H - ch * view.zoom) / 2;
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
  svgEl.appendChild(styleEl(SVG_CSS));

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
    elm.style.cursor = 'grab';
    elm.addEventListener('pointerdown', onNodePointerDown);
  });

  viewportEl.querySelectorAll('[data-boundary-handle]').forEach(elm => {
    elm.addEventListener('pointerdown', onBoundaryHandlePointerDown);
  });

  viewportEl.querySelectorAll('[data-bend-edge]').forEach(elm => {
    elm.addEventListener('pointerdown', onBendPointerDown);
    elm.addEventListener('dblclick', onBendDblClick);
  });
  svgEl.addEventListener('dblclick', onCanvasDblClick);

  updateZoomInfo();
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

function clientToBase(clientX, clientY) {
  if (!svgEl) return { x: 0, y: 0 };
  const rect = svgEl.getBoundingClientRect();
  const sx = rect.width ? _vbW / rect.width : 1;
  const sy = rect.height ? _vbH / rect.height : 1;
  const vx = (clientX - rect.left) * sx;
  const vy = (clientY - rect.top) * sy;
  return {
    x: (vx - view.panX) / view.zoom,
    y: (vy - view.panY) / view.zoom
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
    bx0: b.x, by0: b.y, bw0: b.w, bh0: b.h,
    startX: p.x, startY: p.y
  };
  document.body.style.cursor = evt.currentTarget.getAttribute('cursor') || 'nwse-resize';
}

function onPointerMoveResize(evt) {
  const p = clientToBase(evt.clientX, evt.clientY);
  const s = resizeState;
  const b = currentModel.boundary;
  const dx = p.x - s.startX;
  const dy = p.y - s.startY;

  let x = s.bx0, y = s.by0, w = s.bw0, h = s.bh0;
  if (s.corner.includes('e')) w = Math.max(BOUNDARY_MIN, s.bw0 + dx);
  if (s.corner.includes('s')) h = Math.max(BOUNDARY_MIN, s.bh0 + dy);
  if (s.corner.includes('w')) {
    w = Math.max(BOUNDARY_MIN, s.bw0 - dx);
    x = s.bx0 + (s.bw0 - w);
  }
  if (s.corner.includes('n')) {
    h = Math.max(BOUNDARY_MIN, s.bh0 - dy);
    y = s.by0 + (s.bh0 - h);
  }

  b.x = x; b.y = y; b.w = w; b.h = h;
  schedulePaint();
  evt.preventDefault();
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

function onBendDblClick(evt) {
  if (!currentModel) return;
  evt.stopPropagation();
  evt.preventDefault();
  const ei = +evt.currentTarget.getAttribute('data-bend-edge');
  const bi = +evt.currentTarget.getAttribute('data-bend-idx');
  const e = currentModel.edges[ei];
  if (e && e.bends) {
    e.bends.splice(bi, 1);
    if (!e.bends.length) e.bends = null;
    schedulePaint();
    setStatus('已删除折点', 'ok');
  }
}

function onCanvasDblClick(evt) {
  if (!currentModel) return;
  // 双击节点元素时不创建折点
  if (evt.target && evt.target.closest && evt.target.closest('[data-node-id], [data-bend-edge]')) return;
  const p = clientToBase(evt.clientX, evt.clientY);
  const eps = 8 / Math.max(view.zoom, 0.0001);
  const hit = closestOnEdge(currentModel, p, eps);
  if (!hit) return;

  const e = currentModel.edges[hit.ei];
  if (!e.bends) e.bends = [];
  // 落在第 seg 段，即在折点序列的 seg 位置插入
  e.bends.splice(hit.seg, 0, { x: hit.q.x, y: hit.q.y });
  schedulePaint();
  setStatus('已添加折点', 'ok');
}

document.addEventListener('pointermove', (evt) => {
  if (resizeState) {
    onPointerMoveResize(evt);
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
    dragState.moved = true;
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
  if (bendDragState) { bendDragState = null; document.body.style.cursor = ''; }
});
document.addEventListener('pointercancel', () => {
  dragState = null; panState = null; resizeState = null; bendDragState = null; document.body.style.cursor = '';
});

preview.addEventListener('wheel', (evt) => {
  if (!svgEl || !viewportEl) return;
  evt.preventDefault();

  const rect = svgEl.getBoundingClientRect();
  const sx = rect.width ? _vbW / rect.width : 1;
  const sy = rect.height ? _vbH / rect.height : 1;
  const mx = (evt.clientX - rect.left) * sx;
  const my = (evt.clientY - rect.top) * sy;

  const factor = Math.exp(-evt.deltaY * 0.0016);
  const newZoom = clamp(view.zoom * factor, 0.06, 8);
  const k = newZoom / view.zoom;

  view.panX = mx - (mx - view.panX) * k;
  view.panY = my - (my - view.panY) * k;
  view.zoom = newZoom;

  viewportEl.setAttribute('transform',
    `translate(${view.panX},${view.panY}) scale(${view.zoom})`);
  updateZoomInfo();
}, { passive: false });

/* ==========================================================================
 *  主流程
 * ========================================================================== */

function render() {
  const src = document.getElementById('editor').value;
  try {
    const model = parseDSL(src);
    prepareNodes(model);

    if (model.type === 'sequence') {
      const dims = layoutSequence(model);
      model.contentW = dims.width;
      model.contentH = dims.height;
    } else {
      if (model.type === 'activity') {
        layoutActivity(model);
        resolveOverlaps(model.nodes, 44, 36);
      } else if (model.type === 'usecase' && model.boundary) {
        // 用例图含系统边界：仅对框内元素做力导向布局
        const insideNodes = model.nodes.filter(n => n.insideBoundary);
        if (insideNodes.length) {
          const subModel = { ...model, nodes: insideNodes };
          layoutForce(subModel);
        }
        // 框外元素在 normalizeToOrigin 中统一放置
      } else {
        layoutForce(model);
      }
      normalizeToOrigin(model);
    }

    currentModel = model;
    fitView();
    paint();

    const count = model.type === 'sequence'
      ? model.actors.length + model.messages.length
      : model.nodes.length;
    setStatus(`✓ 渲染成功 · 类型：${model.type} · 元素数：${count} · 滚轮缩放 / 拖拽元素 / 空白处拖拽平移`, 'ok');
  } catch (err) {
    setStatus('✗ ' + err.message, 'err');
  }
}

let rafId = null;
function renderDebounced() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => { rafId = null; render(); });
}