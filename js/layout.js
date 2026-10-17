﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿/* ==========================================================================
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

/* 基于连通分量的初始布点：各连通分量平铺成团，分量内按度数分层环绕，
   使有边的节点彼此靠近，减少长距连线的交织。 */
function initForcePositions(nodes, edges, W, H) {
  const n = nodes.length;
  const idx = new Map();
  nodes.forEach((nd, i) => idx.set(nd.id, i));
  const adj = nodes.map(() => []);
  for (const e of edges) {
    const a = idx.get(e.from), b = idx.get(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    adj[a].push(b); adj[b].push(a);
  }
  const visited = new Array(n).fill(false);
  const comps = [];
  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;
    const comp = [];
    const stk = [i]; visited[i] = true;
    while (stk.length) {
      const v = stk.pop(); comp.push(v);
      for (const u of adj[v]) if (!visited[u]) { visited[u] = true; stk.push(u); }
    }
    comps.push(comp);
  }
  comps.sort((a, b) => b.length - a.length);
  const cols = Math.ceil(Math.sqrt(Math.max(comps.length, 1)));
  const rows = Math.ceil(comps.length / cols);
  const margin = 90;
  const availW = Math.max(W - margin * 2, 10), availH = Math.max(H - margin * 2, 10);
  comps.forEach((comp, ci) => {
    const cx = margin + (ci % cols + 0.5) * (availW / cols);
    const cy = margin + (Math.floor(ci / cols) + 0.5) * (availH / rows);
    const m = comp.length;
    if (m === 1) { nodes[comp[0]].x = cx; nodes[comp[0]].y = cy; return; }
    // 分量内：按度数分层环绕（高度数的靠内，边短的聚拢）
    const inner = Math.max(1, Math.min(Math.ceil(Math.sqrt(m)), m));
    const innerCount = Math.min(inner, m);
    const outerCount = m - innerCount;
    comp.map(v => ({ v, d: adj[v].length }))
      .sort((a, b) => b.d - a.d)
      .forEach((o, k) => {
        const isInner = k < innerCount;
        const kk = isInner ? k : k - innerCount;
        const cnt = isInner ? innerCount : outerCount;
        const ang = (kk / (cnt || 1)) * Math.PI * 2 + (isInner ? 0 : Math.PI / (innerCount || 1));
        const r = isInner ? Math.sqrt(m) * 16 : Math.sqrt(m) * 42;
        nodes[o.v].x = cx + Math.cos(ang) * r;
        nodes[o.v].y = cy + Math.sin(ang) * r;
      });
  });
}

function layoutForce(model) {
  const nodes = model.nodes;
  const n = nodes.length;
  if (!n) return;
  const W = Math.max(760, Math.sqrt(n) * 260);
  const H = Math.max(520, Math.sqrt(n) * 200);

  initForcePositions(nodes, model.edges, W, H);

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

  // 类图：多轮「正交化对齐 + 消除重叠」交替，使尽量多的线横平竖直
  if (model.type === 'class' || model.type === 'deployment') {
    for (let k = 0; k < 4; k++) {
      orthogonalize(nodes, links, 80);
      resolveOverlaps(nodes, 48, 42);
    }
  } else {
    resolveOverlaps(nodes);
  }
}

/* 正交化：对每一条边，按其当前朝向把两端往「水平中线」或「垂直中线」微拉，
   使连线逐渐趋近横平竖直。配合 resolveOverlaps 交替执行可保持不重叠。 */
function orthogonalize(nodes, links, iters) {
  for (let it = 0; it < iters; it++) {
    let active = false;
    for (const l of links) {
      const A = nodes[l.a], B = nodes[l.b];
      const dx = Math.abs(B.x - A.x), dy = Math.abs(B.y - A.y);
      if (dx < 1 && dy < 1) continue;
      if (dx >= dy) {
        const m = (A.y + B.y) / 2;
        if (Math.abs(m - A.y) > 0.01) { A.y += (m - A.y) * 0.24; B.y += (m - B.y) * 0.24; active = true; }
      } else {
        const m = (A.x + B.x) / 2;
        if (Math.abs(m - A.x) > 0.01) { A.x += (m - A.x) * 0.24; B.x += (m - B.x) * 0.24; active = true; }
      }
    }
    if (!active) break;
  }
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

/* Barycenter 层间排序：按所有有边邻居的居中位置重排本层，减少连线交叉。
   邻居不限于相邻层，跨层长边也参与，进一步降低长线交织。 */
function barycenterSort(layers, edges) {
  if (layers.length < 2) return;
  const posOf = new Map();
  layers.forEach((ly, d) => ly.forEach((n, i) => posOf.set(n.id, i)));
  for (let pass = 0; pass < 10; pass++) {
    for (let d = 1; d < layers.length; d++) {
      const ly = layers[d];
      const ev = ly.map((n, i) => {
        let sum = 0, cnt = 0;
        for (const e of edges) {
          if (e.to === n.id) { const p = posOf.get(e.from); if (p !== undefined) { sum += p; cnt++; } }
          if (e.from === n.id) { const p = posOf.get(e.to); if (p !== undefined) { sum += p; cnt++; } }
        }
        return { n, bc: cnt ? sum / cnt : i, old: i };
      });
      ev.sort((a, b) => a.bc - b.bc || a.old - b.old);
      layers[d] = ev.map(x => x.n);
      layers[d].forEach((n, i) => posOf.set(n.id, i));
    }
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

  // 层内排序：Barycenter 启发式，多轮迭代降低层间连线交叉
  barycenterSort(layers, edges);

  const VGAP = 60, HGAP = 52;
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
    constrainOwnedToLanes(swimlanes, nodes);
  }
}

/* 把归入各泳道的节点收拢/约束回各自泳道范围内（本函数不移动泳道本身） */
function constrainOwnedToLanes(swimlanes, nodes) {
  const M = 14;
  for (const lane of swimlanes) {
    const owned = nodes.filter(n => n.lane === lane.label && !n.fixedRel);
    if (!owned.length) continue;
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

/* 应用 @layout 位置定义：在归一化后把被定位的对象设为绝对坐标。
   放在 normalizeToOrigin 之后执行，故绝对值即为最终渲染坐标，双向 round-trip 稳定。 */
function applyLayout(model) {
  const L = model.layout;
  if (!L || !L.length) return;
  // 时序图的位置定义独立处理（参与者/消息/激活/片段）
  if (model.type === 'sequence') {
    applySeqLayout(model);
    return;
  }
  // 第一遍：一级定位（节点、边界、泳道）用绝对坐标
  for (const item of L) {
    if (item.kind === 'node') {
      const n = model.nodes && model.nodes.find(nd => nd.id === item.name || nd.label === item.name);
      if (n) {
        n.x = item.x; n.y = item.y;
        if (item.w != null) { n.w = item.w; if (item.h != null) n.h = item.h; }
      }
    } else if (item.kind === 'boundary') {
      const b = model.boundary || (model.type === 'activity' ? model.activityEdge : null);
      if (b) {
        b.x = item.x; b.y = item.y;
        if (item.w != null) { b.w = item.w; if (item.h != null) b.h = item.h; }
      }
    } else if (item.kind === 'lane') {
      const s = model.swimlanes && model.swimlanes.find(x => x.label === item.name);
      if (s) {
        s.x = item.x; s.y = item.y;
        if (item.w != null) { s.w = item.w; if (item.h != null) s.h = item.h; }
      }
    }
  }
  // 第二遍：二级定位（泳道内元素），坐标相对其泳道 = 泳道位置 + 相对坐标
  for (const item of L) {
    if (item.kind !== 'laneNode') continue;
    const s = model.swimlanes && model.swimlanes.find(x => x.label === item.lane);
    if (!s) continue;
    const n = model.nodes && model.nodes.find(nd => nd.id === item.id);
    if (!n) continue;
    n.fixedRel = true; // 标记为已二级定位，后续泳道重排会跳过它
    n.lane = item.lane;
    n.x = s.x + item.x; n.y = s.y + item.y;
    if (item.w != null) { n.w = item.w; if (item.h != null) n.h = item.h; }
  }
  // 泳道覆盖后，把归入泳道的节点重新收拢回（新位置/新大小的）泳道内
  if (model.swimlanes && model.swimlanes.length) constrainOwnedToLanes(model.swimlanes, model.nodes);
  // 按覆盖后的坐标计算完整包围盒（含负坐标；例如泳道定位到左侧负区时画布也要能容纳）
  let minX = 0, minY = 0;
  let maxX = model.contentW, maxY = model.contentH;
  if (Array.isArray(model.nodes)) {
    for (const n of model.nodes) {
      minX = Math.min(minX, n.x - n.w / 2); maxX = Math.max(maxX, n.x + n.w / 2);
      minY = Math.min(minY, n.y - n.h / 2); maxY = Math.max(maxY, n.y + n.h / 2);
    }
  }
  for (const b of [model.boundary, model.activityEdge]) {
    if (b && b.w) {
      minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x + b.w);
      minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y + b.h);
    }
  }
  if (model.swimlanes) {
    for (const s of model.swimlanes) {
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x + s.w);
      minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y + s.h);
    }
  }
  const PAD = 40;
  model.contentW = maxX + PAD;
  model.contentH = maxY + PAD;
  // 记录超出 0 轴的左/上偏移，供 fitView 包含负坐标区域
  model.layoutMinX = Math.min(0, minX - PAD);
  model.layoutMinY = Math.min(0, minY - PAD);
}

/* -------- 时序图布局 -------- */

function layoutSequence(model) {
  const PAD = 44, GAP = 64;
  const TOP = 24;
  const titleH = model.title ? 48 : 0;
  const BOX_H = 64;
  const HEAD_TOP = TOP + titleH;

  // 参与者 X 坐标（LifeLine 中心）与头部框
  let x = PAD;
  for (const p of model.participants) {
    const iconW = p.kind === 'object' ? 6 : 26;
    p.w = Math.max(textWidth(p.label, 13, '600') + iconW + 42, 112);
    p.h = BOX_H;
    p.x = x + p.w / 2;
    p.y = HEAD_TOP + BOX_H / 2;
    p.headTop = HEAD_TOP;
    p.lifeTop = HEAD_TOP + BOX_H;
    x += p.w + GAP;
  }
  model.contentW = Math.max(x - GAP + PAD, 360);

  // 纵向序列行
  const ROW_H = 40;
  const firstRowY = HEAD_TOP + BOX_H + 40;
  const rowY = (r) => firstRowY + r * ROW_H;

  let maxRow = 0;
  for (const m of model.messages) {
    m.y = rowY(m.row);
    if (m.row > maxRow) maxRow = m.row;
  }
  for (const a of model.activations) {
    a.startY = rowY(a.startRow) + ROW_H / 2;
    a.endY = a.endRow >= 0 ? rowY(a.endRow) + ROW_H / 2 : a.startY + ROW_H;
    // 激活条层级偏移由参与者 x 在渲染时换算
    if (a.endRow > maxRow) maxRow = a.endRow;
  }

  const partByRef = new Map(model.participants.map(p => [p.ref, p]));
  // 生命线底端
  const lifeBottom = firstRowY + (maxRow + 1) * ROW_H + 70;

  // 组合片段：Y 范围 + X 包围盒
  for (const f of model.fragments) {
    const y1 = rowY(f.startRow) - 6;
    const y2 = rowY(Math.max(f.endRow, f.startRow + 1)) + ROW_H + 6;
    f.y = y1;
    f.h = Math.max(y2 - y1, 34);
    let minX = Infinity, maxX = -Infinity;
    for (const m of model.messages) {
      if (m.row >= f.startRow && m.row <= f.endRow) {
        const a = partByRef.get(m.from), b = partByRef.get(m.to);
        if (a) { minX = Math.min(minX, a.x - a.w / 2); maxX = Math.max(maxX, a.x + a.w / 2); }
        if (b) { minX = Math.min(minX, b.x - b.w / 2); maxX = Math.max(maxX, b.x + b.w / 2); }
      }
    }
    if (minX === Infinity) { minX = PAD; maxX = model.contentW - PAD; }
    const FPAD = 22;
    f.x = minX - FPAD;
    f.w = (maxX - minX) + FPAD * 2;
    f.sepY = (f.seps || []).map(s => rowY(s.row) + ROW_H / 2);
    if (f.endRow > maxRow) maxRow = f.endRow;
  }

  model.lifeBottom = Math.max(lifeBottom, firstRowY + (maxRow + 1) * ROW_H + 60);
  model.contentH = model.lifeBottom;
  model.titleY = 28;
  return { width: model.contentW, height: model.contentH };
}

/* 应用时序图的位置定义（参与者/消息/激活/片段） */
function applySeqLayout(model) {
  const L = model.layout;
  if (!L || !L.length) return;
  for (const item of L) {
    if (item.kind === 'seqPart') {
      const p = model.participants.find(pp => pp.ref === item.name || pp.label === item.name);
      if (p) {
        p.x = item.x;
        if (item.y != null) { p.y = item.y; p.headTop = item.y - item.h / 2; p.lifeTop = item.y + item.h / 2; }
        if (item.w != null) { p.w = item.w; if (item.h != null) p.h = item.h; }
      }
    } else if (item.kind === 'seqMsg') {
      const m = model.messages[item.idx];
      if (m && item.y != null) m.y = item.y;
    } else if (item.kind === 'seqAct') {
      const a = model.activations[item.idx];
      if (a && item.y != null) {
        const d = item.y - a.startY;
        a.startY = item.y; a.endY += d;
        if (item.h != null) a.endY = a.startY + item.h;
      }
    } else if (item.kind === 'seqFrag') {
      const f = model.fragments[item.idx];
      if (f) {
        if (item.x != null) f.x = item.x;
        if (item.y != null) f.y = item.y;
        if (item.w != null) f.w = item.w;
        if (item.h != null) f.h = item.h;
      }
    } else if (item.kind === 'seqLifeBottom') {
      if (item.v != null && item.v > 0) {
        model.lifeBottom = item.v;
        model.contentH = Math.max(model.contentH || 0, item.v + 40);
      }
    }
  }
  // 重算画布边界（含拖动后的越界），并记录负区偏移供 fitView
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of model.participants) {
    minX = Math.min(minX, p.x - p.w / 2); maxX = Math.max(maxX, p.x + p.w / 2);
    minY = Math.min(minY, p.lifeTop); maxY = Math.max(maxY, model.lifeBottom || p.lifeTop + 40);
  }
  for (const m of model.messages) { minY = Math.min(minY, m.y - 14); maxY = Math.max(maxY, m.y + 16); }
  const pmapNow = new Map(model.participants.map(p => [p.ref, p]));
  for (const a of model.activations) {
    const part = pmapNow.get(a.part);
    const cx = part ? part.x + (a.off || 0) * 7 : 0;
    minX = Math.min(minX, cx - 12); maxX = Math.max(maxX, cx + 12);
    maxY = Math.max(maxY, a.endY);
  }
  for (const f of model.fragments) { minX = Math.min(minX, f.x); maxX = Math.max(maxX, f.x + f.w); minY = Math.min(minY, f.y); maxY = Math.max(maxY, f.y + f.h); }
  const PAD = 40;
  model.contentW = (maxX === -Infinity ? 360 : maxX - minX) + PAD;
  model.contentH = Math.max(model.contentH, (maxY === -Infinity ? 300 : maxY)) + PAD;
  model.layoutMinX = Math.min(0, minX - PAD);
  model.layoutMinY = Math.min(0, minY - PAD);
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

  const BPAD = 64;           // 边界框内部留白（放大，给元素更多呼吸空间）
  const PAD = 40 + BPAD;     // 内容区边距
  const TOP_PAD = (title ? 78 : 46) + 44;

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