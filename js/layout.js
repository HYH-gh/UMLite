﻿﻿﻿﻿﻿/* ==========================================================================
 *  布局层
 * ========================================================================== */

function prepareNodes(model) {
  const { type, nodes } = model;
  for (const n of nodes) {
    if (type === 'usecase') {
      if (n.kind === 'actor') {
        n.shape = 'actor'; n.w = 46; n.h = 76;
      } else {
        n.shape = 'ellipse';
        n.w = Math.max(textWidth(n.label, 13) + 56, 108);
        n.h = 50;
      }
      continue;
    }

    if (type === 'activity') {
      if (n.kind === 'start' || n.kind === 'stop') { n.shape = 'circle'; n.w = 26; n.h = 26; }
      else if (n.kind === 'decision') {
        n.shape = 'diamond';
        n.w = Math.max(80, textWidth(n.label, 12) * 1.55);
        n.h = Math.max(52, n.w * 0.62);
      } else {
        n.shape = 'roundrect';
        n.w = Math.max(textWidth(n.label, 13) + 40, 96);
        n.h = 46;
      }
      continue;
    }

    if (type === 'state') {
      if (n.kind === 'pseudo' || n.label === '[*]') {
        n.shape = 'circle'; n.w = 24; n.h = 24; n.label = '[*]';
      } else {
        n.shape = 'roundrect';
        n.w = Math.max(textWidth(n.label, 13) + 44, 92);
        n.h = 46;
      }
      continue;
    }

    if (type === 'er') {
      const mems = n.members || [];
      let w = textWidth(n.label, 14, '600') + 36;
      for (const m of mems) w = Math.max(w, textWidth(m, 12.5) + 28);
      n.shape = 'rect';
      n.w = Math.max(w, 140);
      n.h = 34 + Math.max(mems.length, 1) * 20 + 8;
      continue;
    }

    if (n.kind === 'notice') {
      n.shape = 'notice';
      const mems = n.members || [];
      let w = textWidth(n.label, 13, '600') + 40;
      for (const m of mems) w = Math.max(w, textWidth(m, 12.5) + 30);
      n.w = Math.max(w, 120);
      n.h = mems.length ? 20 + mems.length * 18 + 8 : 40;
      continue;
    }

    const mems = n.members || [];
    // 将类成员分为属性和方法
    const isMeth = m => /\(.*\)/.test(m);
    n._attrCount = mems.filter(m => !isMeth(m)).length;
    n._methodCount = mems.filter(m => isMeth(m)).length;
    n._hasSep = n._attrCount > 0 && n._methodCount > 0;

    let w = textWidth(n.label, 14, '600') + 40;
    for (const m of mems) w = Math.max(w, textWidth(m, 12.5) + 30);
    n.shape = 'rect';
    n.w = Math.max(w, 124);
    const extraH = n._hasSep ? 16 : 0; // 分隔线额外高度
    n.h = mems.length ? 34 + mems.length * 18 + extraH + 8 : 44;
    // 部署图 node 的 3D 立体效果：碰撞区域扩大 8px 以匹配视觉大小
    if (n.kind === 'node') { n.w += 8; n.h += 8; }
  }
}

/* -------- 力导向布局 -------- */

function layoutForce(model) {
  const nodes = model.nodes;
  const n = nodes.length;
  if (!n) return;
  const W = Math.max(760, Math.sqrt(n) * 260);
  const H = Math.max(520, Math.sqrt(n) * 200);

  nodes.forEach((nd, i) => {
    const ang = (i / n) * Math.PI * 2;
    const r = Math.min(W, H) * 0.30;
    nd.x = W / 2 + Math.cos(ang) * r * (0.65 + Math.random() * 0.35);
    nd.y = H / 2 + Math.sin(ang) * r * (0.65 + Math.random() * 0.35);
  });

  const idOf = new Map(nodes.map((nd, i) => [nd.id, i]));
  const links = model.edges
    .map(e => ({ a: idOf.get(e.from), b: idOf.get(e.to) }))
    .filter(l => l.a !== undefined && l.b !== undefined && l.a !== l.b);

  const k = Math.sqrt((W * H) / Math.max(n, 1)) * 0.95;
  let temp = W / 7;
  const ITER = 320;

  for (let it = 0; it < ITER; it++) {
    for (const nd of nodes) { nd._fx = 0; nd._fy = 0; }

    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
        const d = Math.sqrt(d2);

        const minX = (a.w + b.w) / 2 + 30;
        const minY = (a.h + b.h) / 2 + 26;
        const ox = minX - Math.abs(dx);
        const oy = minY - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          if (ox < oy) {
            const s = (Math.sign(dx) || 1) * ox * 0.45;
            a._fx += s; b._fx -= s;
          } else {
            const s = (Math.sign(dy) || 1) * oy * 0.45;
            a._fy += s; b._fy -= s;
          }
        }

        const f = (k * k) / d * 0.30;
        const ux = dx / d, uy = dy / d;
        a._fx += ux * f; a._fy += uy * f;
        b._fx -= ux * f; b._fy -= uy * f;
      }
    }

    for (const l of links) {
      const a = nodes[l.a], b = nodes[l.b];
      let dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const target = k * 1.15;
      const f = (d - target) * 0.045;
      const ux = dx / d, uy = dy / d;
      a._fx += ux * f; a._fy += uy * f;
      b._fx -= ux * f; b._fy -= uy * f;
    }

    for (const nd of nodes) {
      const disp = Math.hypot(nd._fx, nd._fy) || 0.0001;
      const lim = Math.min(disp, temp);
      nd.x += (nd._fx / disp) * lim;
      nd.y += (nd._fy / disp) * lim;
      nd.x = clamp(nd.x, nd.w / 2 + 30, W - nd.w / 2 - 30);
      nd.y = clamp(nd.y, nd.h / 2 + 30, H - nd.h / 2 - 30);
    }
    temp *= 0.992;
  }

  resolveOverlaps(nodes);
}

function resolveOverlaps(nodes, gapX = 30, gapY = 26) {
  for (let pass = 0; pass < 120; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const ox = (a.w + b.w) / 2 + gapX - Math.abs(dx);
        const oy = (a.h + b.h) / 2 + gapY - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          moved = true;
          if (ox < oy) {
            const s = (Math.sign(dx) || 1) * ox / 2;
            a.x -= s; b.x += s;
          } else {
            const s = (Math.sign(dy) || 1) * oy / 2;
            a.y -= s; b.y += s;
          }
        }
      }
    }
    if (!moved) break;
  }
}

/* -------- 活动图分层布局 -------- */

function layoutActivity(model) {
  const { nodes, edges } = model;
  const adj = new Map(nodes.map(n => [n.id, []]));
  const indeg = new Map(nodes.map(n => [n.id, 0]));
  for (const e of edges) {
    if (adj.has(e.from) && indeg.has(e.to)) {
      adj.get(e.from).push(e.to);
      indeg.set(e.to, indeg.get(e.to) + 1);
    }
  }

  const depth = new Map();
  const roots = nodes.filter(n => indeg.get(n.id) === 0).map(n => n.id);
  const q = [...roots];
  roots.forEach(r => depth.set(r, 0));
  while (q.length) {
    const cur = q.shift();
    const d = depth.get(cur);
    for (const nx of adj.get(cur) || []) {
      if (!depth.has(nx)) { depth.set(nx, d + 1); q.push(nx); }
    }
  }

  let maxD = 0;
  for (const v of depth.values()) maxD = Math.max(maxD, v);
  for (const n of nodes) if (!depth.has(n.id)) depth.set(n.id, ++maxD);

  const layers = [];
  for (const n of nodes) {
    const d = depth.get(n.id);
    if (!layers[d]) layers[d] = [];
    layers[d].push(n);
  }

  const VGAP = 54, HGAP = 46;
  let y = 40;
  for (let d = 0; d < layers.length; d++) {
    const layer = layers[d] || [];
    if (!layer.length) continue;
    let maxH = 0;
    for (const n of layer) maxH = Math.max(maxH, n.h);
    const cy = y + maxH / 2;
    const totalW = layer.reduce((s, n) => s + n.w, 0) + Math.max(0, layer.length - 1) * HGAP;
    let cx = -totalW / 2;
    for (const n of layer) {
      n.x = cx + n.w / 2;
      n.y = cy;
      cx += n.w + HGAP;
    }
    y += maxH + VGAP;
  }
}

/* 活动图容器：活动边 + 泳道（基于归一化后的节点坐标计算） */
function layoutActivityContainers(model) {
  const { nodes, activityEdge, swimlanes } = model;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.w / 2);
    minY = Math.min(minY, n.y - n.h / 2);
    maxX = Math.max(maxX, n.x + n.w / 2);
    maxY = Math.max(maxY, n.y + n.h / 2);
  }
  if (minX === Infinity) { minX = 0; minY = 0; maxX = 220; maxY = 130; }
  const PAD = 26;
  const ax = minX - PAD, ay = minY - PAD, aw = maxX - minX + PAD * 2, ah = maxY - minY + PAD * 2;

  if (activityEdge) {
    activityEdge.x = ax; activityEdge.y = ay;
    activityEdge.w = aw; activityEdge.h = ah;
  }
  if (swimlanes && swimlanes.length) {
    const regionX = activityEdge ? activityEdge.x : ax;
    const regionY = activityEdge ? activityEdge.y : ay;
    const regionW = activityEdge ? activityEdge.w : aw;
    const regionH = activityEdge ? activityEdge.h : ah;
    // 水平泳道(:h)为横条，自上而下紧贴均分；垂直泳道(:v)为竖条，自左向右均分
    const hs = swimlanes.filter(s => s.dir === 'h');
    if (hs.length) {
      const hh = regionH / hs.length;
      hs.forEach((s, i) => { s.x = regionX; s.y = regionY + i * hh; s.w = regionW; s.h = hh; });
    }
    const vs = swimlanes.filter(s => s.dir === 'v');
    if (vs.length) {
      const vw = regionW / vs.length;
      vs.forEach((s, i) => { s.x = regionX + i * vw; s.y = regionY; s.w = vw; s.h = regionH; });
    }
    // 把归入泳道的节点约束进各自泳道范围内（默认沿泳道中心线排布）
    const M = 14;
    for (const s of swimlanes) {
      const owned = nodes.filter(n => n.lane === s.label);
      if (!owned.length) continue;
      const box = swimlanes.filter(o => o.label === s.label);
      if (box.length !== 1) continue;
      const lane = box[0];
      // 水平泳道：节点居中，纵向均匀错开
      if (lane.dir === 'h') {
        const topY = lane.y + M;
        const bottomY = lane.y + lane.h - M;
        owned.forEach((n, i) => {
          n.x = Math.min(Math.max(n.x, lane.x + M), lane.x + lane.w - M);
          n.y = Math.min(Math.max(n.y, topY + (bottomY - topY) * (i + 1) / (owned.length + 1), lane.y + M), lane.y + lane.h - M);
        });
      } else {
        const leftX = lane.x + M;
        const rightX = lane.x + lane.w - M;
        owned.forEach((n, i) => {
          n.y = Math.min(Math.max(n.y, lane.y + M), lane.y + lane.h - M);
          n.x = Math.min(Math.max(n.x, leftX + (rightX - leftX) * (i + 1) / (owned.length + 1), lane.x + M), lane.x + lane.w - M);
        });
      }
    }
  }
}

/* -------- 时序图布局 -------- */

function layoutSequence(model) {
  const PAD = 44, GAP = 56;
  const TOP = 24;
  const titleH = model.title ? 48 : 0;
  const BOX_H = 44;
  const startY = TOP + titleH;

  let x = PAD;
  for (const a of model.actors) {
    a.w = Math.max(textWidth(a.label, 13, '600') + 40, 96);
    a.h = BOX_H;
    a.x = x + a.w / 2;
    a.y = startY + BOX_H / 2;
    x += a.w + GAP;
  }
  const width = Math.max(x - GAP + PAD, 360);

  let y = startY + BOX_H + 44;
  for (const m of model.messages) {
    m.y = y;
    y += 44;
  }
  const height = y + 36;

  model.titleY = TOP + 26;
  return { width, height };
}

/* -------- 归一化到原点 -------- */

function normalizeToOrigin(model) {
  const { nodes, type } = model;
  if (!nodes.length) {
    model.contentW = 420;
    model.contentH = 300;
    model.titleX = 210;
    model.titleY = 40;
    if (model.boundary) {
      model.boundary.x = 16; model.boundary.y = 16;
      model.boundary.w = 388; model.boundary.h = 248;
    }
    return;
  }

  // 用例图含系统边界：框内 / 框外分离布局
  if (type === 'usecase' && model.boundary) {
    return normalizeUsecaseBoundary(model);
  }

  // 默认布局（所有节点统一偏移）
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const nx = n.x - n.w / 2, ny = n.y - n.h / 2;
    let mx = n.x + n.w / 2, my = n.y + n.h / 2;
    if (type === 'usecase' && n.kind === 'actor') my += 26;
    minX = Math.min(minX, nx); minY = Math.min(minY, ny);
    maxX = Math.max(maxX, mx); maxY = Math.max(maxY, my);
  }
  const PAD = 36;
  const TOP_PAD = model.title ? 70 : 36;
  const dx = PAD - minX, dy = TOP_PAD - minY;
  for (const n of nodes) { n.x += dx; n.y += dy; }

  model.contentW = (maxX - minX) + PAD * 2;
  model.contentH = (maxY - minY) + TOP_PAD + PAD;
  model.titleX = model.contentW / 2;
  model.titleY = 42;
  return;
}

/* -------- 用例图系统边界专用布局 -------- */

function normalizeUsecaseBoundary(model) {
  const { nodes, title } = model;
  const boundNodes = nodes.filter(n => n.insideBoundary);
  const outsideNodes = nodes.filter(n => !n.insideBoundary);

  const BPAD = 48;           // 边界框内部留白
  const PAD = 36 + BPAD;     // 内容区边距
  const TOP_PAD = (title ? 70 : 36) + 44;

  // ── 1. 计算框内元素的包围盒并偏移 ──
  if (boundNodes.length) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of boundNodes) {
      const nx = n.x - n.w / 2, ny = n.y - n.h / 2;
      let mx = n.x + n.w / 2, my = n.y + n.h / 2;
      if (n.kind === 'actor') my += 26;
      minX = Math.min(minX, nx); minY = Math.min(minY, ny);
      maxX = Math.max(maxX, mx); maxY = Math.max(maxY, my);
    }
    const dx = PAD - minX, dy = TOP_PAD - minY;
    for (const n of boundNodes) { n.x += dx; n.y += dy; }

    model.contentW = (maxX - minX) + PAD * 2;
    model.contentH = (maxY - minY) + TOP_PAD + PAD;

    model.boundary.x = PAD - BPAD;
    model.boundary.y = TOP_PAD - 44;
    model.boundary.w = model.contentW - (PAD - BPAD) * 2;
    model.boundary.h = model.contentH - (TOP_PAD - 36) - (PAD - BPAD);
  } else {
    model.contentW = 420;
    model.contentH = 300;
    model.boundary.x = 16;  model.boundary.y = 16;
    model.boundary.w = 388; model.boundary.h = 248;
  }

  // ── 2. 框外元素排列在边界框左侧 ──
  const outerLeft = model.boundary.x - 70;  // 边界左侧 70px
  let cy = TOP_PAD + 20;
  for (const n of outsideNodes) {
    n.x = outerLeft;
    n.y = cy;
    cy += Math.max(n.h, title ? 100 : 80) + 24;
  }

  // ── 3. 计算全部元素的整体包围盒，确保无负坐标 ──
  let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
  for (const n of nodes) {
    const nx = n.x - n.w / 2, ny = n.y - n.h / 2;
    const mx = n.x + n.w / 2, my = n.y + n.h / 2 + (n.kind === 'actor' ? 26 : 0);
    gMinX = Math.min(gMinX, nx); gMinY = Math.min(gMinY, ny);
    gMaxX = Math.max(gMaxX, mx); gMaxY = Math.max(gMaxY, my);
  }

  // 如果框外元素超出左边界，整体右移
  if (gMinX < PAD) {
    const shiftX = PAD - gMinX;
    for (const n of nodes) n.x += shiftX;
    model.boundary.x += shiftX;
    gMaxX += shiftX; gMinX = PAD;
  }
  // 同理处理上边界
  if (gMinY < TOP_PAD - 44) {
    const shiftY = (TOP_PAD - 44) - gMinY;
    for (const n of nodes) n.y += shiftY;
    model.boundary.y += shiftY;
    gMaxY += shiftY; gMinY = TOP_PAD - 44;
  }

  model.contentW = Math.max(gMaxX + PAD, model.contentW);
  model.contentH = Math.max(gMaxY + PAD, model.contentH);
  model.titleX = model.contentW / 2;
  model.titleY = 42;
}