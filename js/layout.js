/* ==========================================================================
 *  布局层
 * ========================================================================== */

function prepareNodes(model) {
  const { type, nodes } = model;
  for (const n of nodes) {
    if (type === 'usecase') {
      if (n.kind === 'actor' || n.kind === 'businessactor') {
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

/* -------- 分层布局（Sugiyama 简化版）：类图 / 对象图 / 组件图 / 部署图 --------
 * 目标：1) 元素不重叠；2) 连线少交叉；3) 连线横平竖直。
 * 思路：
 *  - 泛化边（--|>）天然是「父在上、子在下」的树，按它分层最符合 UML 阅读习惯；
 *  - 没有泛化关系的节点（关联/依赖为主的 03 这类图）退化为「所有边均匀分层」；
 *  - 层内用 Barycenter 减少交叉；
 *  - 每层一行、层内依次排开，坐标落在行列网格上 —— 中心连线自然横平竖直；
 *  - 力导向仅作为泛化树之外散点的补充（保持分量聚簇），不再全局乱撒。 */
function layoutLayered(model) {
  const { nodes, edges } = model;
  const n = nodes.length;
  if (!n) return;

  const byId = new Map(nodes.map(nd => [nd.id, nd]));
  const isGen = e => e.kind === 'generalization' || e.kind === 'realization';
  // 泛化边：child --|> parent
  const genEdges = edges.filter(e => byId.has(e.from) && byId.has(e.to) && e.from !== e.to && isGen(e));
  const otherEdges = edges.filter(e => byId.has(e.from) && byId.has(e.to) && e.from !== e.to && !isGen(e));

  /* 1. 分层：优先用泛化树，泛化边太少（< 2）则用全部边做 BFS 分层 */
  const depth = new Map();
  const useGen = genEdges.length >= 2;
  const layerEdges = useGen ? genEdges : otherEdges;
  if (layerEdges.length) {
    // 出边 = 走向更深层。泛化取 child->parent 方向为「向根」，反转成根在上
    const adj = new Map(nodes.map(nd => [nd.id, []]));
    for (const e of layerEdges) {
      const a = useGen ? e.to : e.from;   // 泛化：父(目标)在浅层
      const b = useGen ? e.from : e.to;   // 普通边：源在浅层
      adj.get(a).push(b);
    }
    const indeg = new Map(nodes.map(nd => [nd.id, 0]));
    for (const e of layerEdges) indeg.set(useGen ? e.from : e.to, (indeg.get(useGen ? e.from : e.to) || 0) + 1);
    // 从入度 0（根）开始 BFS；有环/不可达的后面兜底
    const q = [];
    for (const nd of nodes) {
      if ((indeg.get(nd.id) || 0) === 0 && adj.get(nd.id).length) { depth.set(nd.id, 0); q.push(nd.id); }
    }
    // 孤立但有其它边的节点也会由下一轮处理
    while (q.length) {
      const cur = q.shift();
      const d = depth.get(cur) || 0;
      for (const nx of adj.get(cur)) {
        // 只有真的被推深一层才重排/继续，避免「更新了深度却没入队」导致子树丢失
        if (!depth.has(nx) || depth.get(nx) < d + 1) {
          depth.set(nx, d + 1);
          q.push(nx);
        }
      }
    }
  }
  // 没进任何层的节点：暂时 0 层，后面按连通分量补
  const layered = nodes.filter(nd => depth.has(nd.id));
  const loose = nodes.filter(nd => !depth.has(nd.id));

  /* 2. 组层 + 层内排序 */
  let maxD = 0;
  for (const d of depth.values()) maxD = Math.max(maxD, d);
  const layers = [];
  for (let i = 0; i <= maxD; i++) layers.push([]);
  for (const nd of layered) layers[depth.get(nd.id)].push(nd);
  // 层内排序（Barycenter，考虑所有边：层间边+层内边都参与，减少交叉）
  if (layers.length > 1) {
    const posOf = new Map();
    layers.forEach((ly, di) => ly.forEach((nd, i) => posOf.set(nd.id, i)));
    for (let pass = 0; pass < 8; pass++) {
      for (let di = 0; di < layers.length; di++) {
        const ly = layers[di];
        if (ly.length < 2) continue;
        const ev = ly.map((nd, i) => {
          let sum = 0, cnt = 0;
          for (const e of edges) {
            if (e.from === nd.id && posOf.has(e.to)) { sum += posOf.get(e.to); cnt++; }
            if (e.to === nd.id && posOf.has(e.from)) { sum += posOf.get(e.from); cnt++; }
          }
          return { nd, bc: cnt ? sum / cnt : i, old: i };
        });
        ev.sort((x, y) => x.bc - y.bc || x.old - y.old);
        layers[di] = ev.map(x => x.nd);
        layers[di].forEach((nd, i) => posOf.set(nd.id, i));
      }
    }
  }

  /* 3. 摆坐标：
   *  - 泛化树：tidy-tree —— 父节点居中在自己子树上方，兄弟依次排开。
   *    泛化连线（父正下子）几乎竖直；不同子树互不侵入。
   *  - 普通边分层（03 这种）：每层一行、行内依次排开 + 行居中。 */
  const COL_GAP = 46, ROW_GAP = 60;
  const genParent = new Map();   // child -> parent（一个子类只继承一个父类，多继承取第一个）
  if (useGen) for (const e of genEdges) if (!genParent.has(e.from)) genParent.set(e.from, e.to);
  const genChildren = new Map(); // parent -> [children...]
  for (const [c, p] of genParent) {
    if (!genChildren.has(p)) genChildren.set(p, []);
    genChildren.get(p).push(c);
  }

  if (useGen) {
    const MAX_ROW_W = 1050;   // 一行子节点的最大宽度，超了就折行（避免整棵树摊得过宽）
    // 树根：在 layered 里但没有 parent 的
    const roots = layered.filter(nd => !genParent.has(nd.id));
    // 每棵子树的宽度（含间距），自底向上；同一父的子节点列表先按 MAX_ROW_W 折行分块
    const SUB_GAP = 30;
    const chunkedKids = new Map();   // parent id -> [ [kids...], [kids...] ]  每块一行
    for (const [pid, kidsRaw] of genChildren) {
      const kids = kidsRaw.filter(c => byId.has(c));
      if (!kids.length) { chunkedKids.set(pid, []); continue; }
      const chunks = [];
      let cur = [], curW = 0;
      for (const c of kids) {
        const w = byId.get(c).w;
        if (cur.length && curW + SUB_GAP + w > MAX_ROW_W) { chunks.push(cur); cur = []; curW = 0; }
        cur.push(c); curW += (cur.length > 1 ? SUB_GAP : 0) + w;
      }
      if (cur.length) chunks.push(cur);
      chunkedKids.set(pid, chunks);
    }
    const subtreeW = new Map();
    const calcW = (nd) => {
      const chunks = chunkedKids.get(nd.id) || [];
      if (!chunks.length) { subtreeW.set(nd.id, nd.w); return nd.w; }
      // 宽度 = 最宽块
      let w = 0;
      for (const ch of chunks) {
        const cw = ch.reduce((s, c) => s + calcW(byId.get(c)), 0) + (ch.length - 1) * SUB_GAP;
        w = Math.max(w, cw);
      }
      const total = Math.max(nd.w, w);
      subtreeW.set(nd.id, total);
      return total;
    };
    // 子树的块高（块数 × 行高），place 时用
    const blockRows = new Map();
    const calcRows = (nd) => {
      const chunks = chunkedKids.get(nd.id) || [];
      let rows = 1;
      for (const ch of chunks) for (const c of ch) rows = Math.max(rows, 1 + calcRows(byId.get(c)));
      blockRows.set(nd.id, rows);
      return rows;
    };
    for (const r of roots) { calcW(r); calcRows(r); }

    // 行高：按层收集（不再全局唯一 —— 折行后各块用自己的层高）
    const rowH = new Map();
    for (const nd of layered) rowH.set(depth.get(nd.id), Math.max(rowH.get(depth.get(nd.id)) || 0, nd.h));

    // 递归摆位：给出本子树左缘 x 与本层顶 y。返回子树底 y（供折行块下移用）
    const place = (nd, leftX, topY) => {
      const d = depth.get(nd.id);
      const h = rowH.get(d) || nd.h;
      nd.y = topY + h / 2;
      const chunks = chunkedKids.get(nd.id) || [];
      if (!chunks.length) {
        nd.x = leftX + subtreeW.get(nd.id) / 2;
        return topY + h;
      }
      // 折行块：每块一行，块与块之间纵向排（下一块顶 = 本块底 + ROW_GAP）
      let rowTop = topY + h + ROW_GAP;
      let bottom = rowTop;
      let maxRowW = 0;
      for (const ch of chunks) {
        let cx = leftX;
        let chunkBottom = rowTop;
        for (const c of ch) {
          const b = place(byId.get(c), cx, rowTop);
          chunkBottom = Math.max(chunkBottom, b);
          cx += subtreeW.get(c) + SUB_GAP;
        }
        maxRowW = Math.max(maxRowW, cx - SUB_GAP - leftX);
        rowTop = chunkBottom + ROW_GAP;
        bottom = rowTop;
      }
      // 父节点中心 = 最宽块的中点
      const widest = chunks.reduce((best, ch) => {
        const w = ch.reduce((s, c) => s + subtreeW.get(c), 0) + (ch.length - 1) * SUB_GAP;
        return w > best.w ? { ch, w } : best;
      }, { ch: chunks[0], w: -1 }).ch;
      const first = byId.get(widest[0]), last = byId.get(widest[widest.length - 1]);
      nd.x = (first.x + last.x) / 2;
      return bottom;
    };

    // 根并排；每个根占其子树宽度
    let rx = 0;
    for (const r of roots) {
      place(r, rx, 0);
      rx += subtreeW.get(r.id) + SUB_GAP;
    }

    // 散点（没进泛化树的）：沿树底下再开一行区，按普通行排
    if (loose.length) {
      const treeBottom = Math.max(...layered.map(nd => nd.y + nd.h / 2), 0);
      const looseTop = treeBottom + ROW_GAP * 1.4;
      // 散点间有关联的用小型力导向聚簇，其余排成一行
      const linked = loose.filter(nd => otherEdges.some(e => (e.from === nd.id || e.to === nd.id) && (loose.some(l => l.id === e.from) && loose.some(l => l.id === e.to))));
      const solo = loose.filter(nd => !linked.includes(nd));
      if (linked.length) {
        const sub = { nodes: linked, edges: otherEdges.filter(e => linked.some(l => l.id === e.from) && linked.some(l => l.id === e.to)), type: model.type };
        layoutForce(sub);
        // 归一化散点子图坐标后平移到树下方
        let mnX = Infinity, mnY = Infinity;
        for (const nd of linked) { mnX = Math.min(mnX, nd.x - nd.w / 2); mnY = Math.min(mnY, nd.y - nd.h / 2); }
        for (const nd of linked) { nd.x += -mnX; nd.y += looseTop - mnY; }
      }
      if (solo.length) {
        // 排在聚簇区右侧；没有聚簇区就直接从树宽起
        const clusterRight = linked.length ? Math.max(...linked.map(nd => nd.x + nd.w / 2)) : 0;
        let x = Math.max(clusterRight + COL_GAP, 0);
        const baseTop = linked.length
          ? Math.max(...linked.map(nd => nd.y + nd.h / 2)) + ROW_GAP
          : looseTop;
        for (const nd of solo) {
          nd.x = x + nd.w / 2;
          nd.y = baseTop + nd.h / 2;
          x += nd.w + COL_GAP;
        }
      }
    }
  } else {
    // 普通分层：每层一行
    let y = 0;
    for (const ly of layers) {
      if (!ly.length) { y += 60; continue; }
      const h = Math.max(...ly.map(nd => nd.h));
      let x = 0;
      for (const nd of ly) { nd.x = x + nd.w / 2; nd.y = y + h / 2; x += nd.w + COL_GAP; }
      y += h + ROW_GAP;
    }
    const widths = layers.map(ly => ly.reduce((s, nd) => s + nd.w, 0) + Math.max(0, ly.length - 1) * COL_GAP);
    const maxW = Math.max(...widths, 1);
    layers.forEach((ly, di) => {
      const off = (maxW - widths[di]) / 2;
      for (const nd of ly) nd.x += off;
    });
    // 全部都在层里，loose 为空；若真有就排右边
    if (loose.length) {
      const anchorX = maxW + 120;
      let mnX = Infinity;
      for (const nd of loose) mnX = Math.min(mnX, nd.x);
      for (const nd of loose) nd.x += anchorX - mnX;
    }
  }
}

function buildIndexLinks(model) {
  const idOf = new Map(model.nodes.map((nd, i) => [nd.id, i]));
  return model.edges
    .map(e => ({ a: idOf.get(e.from), b: idOf.get(e.to) }))
    .filter(l => l.a !== undefined && l.b !== undefined && l.a !== l.b);
}

/* -------- 连线正交化：给斜线补「竖-横-竖」折点，让连线横平竖直 --------
 * 分层/树形/泳道布局之后调用。只在「斜得明显」的边上加折点：
 * 已横/已竖的连线保持直线；近距离的两点也不加（折线反而绕）。
 * 渲染层 drawEdge 对带 bends 的边画 polyline，箭头贴最后一段方向。 */
function orthogonalEdgeRouting(model, opts) {
  opts = opts || {};
  const byId = new Map(model.nodes.map(nd => [nd.id, nd]));
  const MIN_SEG = (opts && opts.minSeg) || 26;   // 斜距超过这个值才折
  const style = (opts && opts.style) || 'vhv';   // vhv=竖-横-竖；hvh=横-竖-横
  for (const e of model.edges || []) {
    if (e.connectToMidpoint) continue;             // 指向连线中点的便签引用不折
    const a = byId.get(e.from), b = byId.get(e.to);
    if (!a || !b || a === b) continue;
    const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
    if (dx < 6 || dy < 6) continue;                // 已经横平或竖直
    if (dx < MIN_SEG && dy < MIN_SEG) continue;    // 近距离，直线即可
    if (style === 'hvh') {
      const midX = (a.x + b.x) / 2;
      e.bends = [{ x: midX, y: a.y }, { x: midX, y: b.y }];
    } else {
      const midY = (a.y + b.y) / 2;
      e.bends = [{ x: a.x, y: midY }, { x: b.x, y: midY }];
    }
  }
}

/* -------- 用例图框内布局：按「角色→用例」「include/extend」做分层网格 --------
 *  - 被角色直接指向的用例是第一层（离角色最近）；
 *  - include/extend 的目标往里推一层；
 *  - 层内 Barycenter 减少交叉，层间行排布，x 落列网格 —— 连线趋横平竖直。 */
function layoutUsecaseInner(model) {
  const { nodes, edges } = model;
  if (!nodes.length) return;
  const byId = new Map(nodes.map(nd => [nd.id, nd]));
  const rel = edges.filter(e => byId.has(e.from) && byId.has(e.to) && e.from !== e.to);
  if (!rel.length) { layoutForce(model); return; }

  // 入度 0 的用例（只有角色指向它的）为第 0 层；include/extend 沿箭头方向加深
  const depth = new Map();
  const adj = new Map(nodes.map(nd => [nd.id, []]));
  for (const e of rel) adj.get(e.from).push(e.to);
  const q = [];
  for (const nd of nodes) {
    const hasIn = rel.some(e => e.to === nd.id);
    if (!hasIn) { depth.set(nd.id, 0); q.push(nd.id); }
  }
  while (q.length) {
    const cur = q.shift();
    const d = depth.get(cur);
    for (const nx of adj.get(cur)) {
      if (!depth.has(nx)) { depth.set(nx, d + 1); q.push(nx); }
    }
  }
  let maxD = 0;
  for (const d of depth.values()) maxD = Math.max(maxD, d);
  // 兜底：环上/不可达的给最大层
  for (const nd of nodes) if (!depth.has(nd.id)) depth.set(nd.id, maxD = Math.max(maxD, (maxD + 1)));

  const layers = [];
  for (let i = 0; i <= maxD; i++) layers.push([]);
  for (const nd of nodes) layers[depth.get(nd.id)].push(nd);

  // 层内 Barycenter：邻居包括框外 actor（角色连线是交叉的主要来源），按 actor 的纵向位置参与排序
  const outside = (model.__outsideNodes || []);
  const lanePos = new Map();
  outside.forEach((a, i) => lanePos.set(a.id, i));
  const posOf = new Map();
  layers.forEach((ly, di) => ly.forEach((nd, i) => posOf.set(nd.id, i)));
  for (let pass = 0; pass < 8; pass++) {
    for (let di = 0; di < layers.length; di++) {
      const ly = layers[di];
      if (ly.length < 2) continue;
      const ev = ly.map((nd, i) => {
        let sum = 0, cnt = 0;
        for (const e of edges) {
          if (e.from === nd.id) {
            if (posOf.has(e.to)) { sum += posOf.get(e.to); cnt++; }
            else if (lanePos.has(e.to)) { sum += lanePos.get(e.to) * 2; cnt++; }  // actor 在左列，位置权重放大
          }
          if (e.to === nd.id) {
            if (posOf.has(e.from)) { sum += posOf.get(e.from); cnt++; }
            else if (lanePos.has(e.from)) { sum += lanePos.get(e.from) * 2; cnt++; }
          }
        }
        return { nd, bc: cnt ? sum / cnt : i, old: i };
      });
      ev.sort((x, y) => x.bc - y.bc || x.old - y.old);
      layers[di] = ev.map(x => x.nd);
      layers[di].forEach((nd, i) => posOf.set(nd.id, i));
    }
  }

  // 摆放：椭圆较扁，层间距按最高椭圆
  const COL_GAP = 36, ROW_GAP = 34;
  let y = 0;
  for (const ly of layers) {
    if (!ly.length) { y += 40; continue; }
    const rowH = Math.max(...ly.map(nd => nd.h));
    let x = 0;
    for (const nd of ly) { nd.x = x + nd.w / 2; nd.y = y + rowH / 2; x += nd.w + COL_GAP; }
    y += rowH + ROW_GAP;
  }
  const widths = layers.map(ly => ly.reduce((s, nd) => s + nd.w, 0) + Math.max(0, ly.length - 1) * COL_GAP);
  const maxW = Math.max(...widths, 1);
  layers.forEach((ly, di) => {
    const off = (maxW - widths[di]) / 2;
    for (const nd of ly) nd.x += off;
  });
  resolveOverlaps(nodes, 40, 30);
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
        // 两点完全重合时需要一个扰动来打破奇点。这里用「索引 + 黄金角」构造确定性方向，
        // 而不是 Math.random()：同一份 DSL 每次渲染必须得到完全相同的布局（可复现）。
        if (d2 < 0.01) {
          const t = (i * 0.6180339887498949 + j * 0.3819660112501051) % 1;
          dx = Math.cos(t * Math.PI * 2);
          dy = Math.sin(t * Math.PI * 2);
          d2 = 1;
        }
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

  // 泳道高度按内容加权：某条泳道里塞了几行节点，就给它几行的高度。
  // 等分会让节点密的泳道溢出、节点稀的泳道大片留白，流程顺序也被打乱。
  if (swimlanes && swimlanes.length) {
    const LANE_M = 26;               // 泳道内边距
    const hs = swimlanes.filter(s => s.dir === 'h');
    const vs = swimlanes.filter(s => s.dir === 'v');
    // 混合方向（或全部未指定方向）：退回等分 —— 少见用法，保证可用即可
    if (hs.length && vs.length) {
      const PAD2 = 26;
      const regionX = minX - PAD2, regionY = minY - PAD2;
      const regionW = maxX - minX + PAD2 * 2, regionH = maxY - minY + PAD2 * 2;
      const hh = regionH / hs.length;
      hs.forEach((s, i) => { s.x = regionX; s.y = regionY + i * hh; s.w = regionW; s.h = hh; });
      const vw = regionW / vs.length;
      vs.forEach((s, i) => { s.x = regionX + i * vw; s.y = regionY; s.w = vw; s.h = regionH; });
      constrainOwnedToLanes(swimlanes, nodes);
    } else if (hs.length) {
      // 每条泳道需要的行数（按该泳道节点的 y 值聚类，60px 内算同一行）
      const rowsOf = hs.map(lane => {
        const owned = nodes.filter(n => n.lane === lane.label);
        if (!owned.length) return 1;
        const ys = owned.map(n => n.y).sort((a, b) => a - b);
        let rows = 1;
        for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] > 46) rows++;
        return rows;
      });
      const rowH = 92;               // 一行活动（含决策菱形）的标称高度
      const totalH = rowsOf.reduce((s, r) => s + r, 0) * rowH + (hs.length) * LANE_M * 2;
      // 从现有内容区顶部开始重排：整块内容高度取 max(原有, 加权泳道高度)
      const top = minY;
      const regionH = Math.max(maxY - minY, totalH);
      const unit = (regionH - hs.length * LANE_M * 2) / Math.max(rowsOf.reduce((s, r) => s + r, 0), 1);
      // 横条泳道统一宽度：给「带内同层多节点」并排留出空间
      const laneW = Math.max(maxX - minX, 940);
      let cy = top;
      hs.forEach((lane, i) => {
        const h = rowsOf[i] * unit + LANE_M * 2;
        lane.x = minX; lane.y = cy; lane.w = laneW; lane.h = h;
        cy += h;
      });
      constrainOwnedToLanes(swimlanes, nodes);
    } else if (vs.length) {
      // 垂直泳道：宽度按各泳道最宽节点加权
      const colsOf = vs.map(lane => {
        const owned = nodes.filter(n => n.lane === lane.label);
        return owned.length ? Math.max(...owned.map(n => n.w)) : 160;
      });
      const totalW = colsOf.reduce((s, w) => s + w, 0) + vs.length * LANE_M * 2;
      let cx = minX;
      vs.forEach((lane, i) => {
        const w = colsOf[i] + LANE_M * 2;
        lane.x = cx; lane.y = minY; lane.w = w; lane.h = Math.max(maxY - minY, 200);
        cx += w;
      });
      constrainOwnedToLanes(swimlanes, nodes);
    }
  }

  const PAD = 26;
  const ax = minX - PAD, ay = minY - PAD, aw = maxX - minX + PAD * 2, ah = maxY - minY + PAD * 2;
  if (activityEdge) {
    // 活动边框要包住所有泳道
    let bx0 = ax, by0 = ay, bx1 = maxX + PAD, by1 = maxY + PAD;
    for (const s of swimlanes || []) {
      bx0 = Math.min(bx0, s.x - PAD / 2); by0 = Math.min(by0, s.y - PAD / 2);
      bx1 = Math.max(bx1, s.x + s.w + PAD / 2); by1 = Math.max(by1, s.y + s.h + PAD / 2);
    }
    activityEdge.x = bx0; activityEdge.y = by0;
    activityEdge.w = bx1 - bx0; activityEdge.h = by1 - by0;
  }
}

/* 把归入各泳道的节点收拢/约束回各自泳道范围内（本函数不移动泳道本身） */
function constrainOwnedToLanes(swimlanes, nodes) {
  const M = 16;
  for (const lane of swimlanes) {
    const owned = nodes.filter(n => n.lane === lane.label && !n.fixedRel);
    if (!owned.length) continue;
    if (lane.dir === 'h') {
      const topY = lane.y + M;
      const bottomY = lane.y + lane.h - M;
      // 横条泳道：带内按「层（深度）序」自上而下堆叠；带内同一层的多个节点
      // 沿 x 从左到右错开 —— if/else 分支就能并排呈现。
      owned.sort((a, b) => a.y - b.y);
      const rows = [];
      for (const n of owned) {
        const row = rows.find(r => Math.abs(r.y - n.y) <= 40);
        if (row) { row.items.push(n); }
        else rows.push({ y: n.y, items: [n] });
      }
      const laneL = lane.x + M, laneR = lane.x + lane.w - M;
      const room = laneR - laneL;
      const unitH = rows.length ? (bottomY - topY) / rows.length : 0;
      rows.forEach((row, ri) => {
        const cy = rows.length > 1 ? topY + (ri + 0.5) * unitH : (topY + bottomY) / 2;
        const items = row.items;
        if (items.length === 1) {
          items[0].x = Math.min(Math.max(items[0].x, laneL + items[0].w / 2), laneR - items[0].w / 2);
          items[0].y = cy;
          return;
        }
        // 同层多节点：按原 x 顺序在带内从左到右铺开（间距自适应）
        items.sort((a, b) => a.x - b.x);
        const totalW = items.reduce((s, n) => s + n.w, 0);
        const gap = Math.max(34, (room - totalW) / Math.max(1, items.length - 1));
        const used = totalW + gap * (items.length - 1);
        let cx = laneL + Math.max(0, (room - used) / 2);
        for (const n of items) {
          n.x = cx + n.w / 2;
          n.y = cy;
          cx += n.w + gap;
        }
      });
    } else {
      const leftX = lane.x + M;
      const rightX = lane.x + lane.w - M;
      owned.sort((a, b) => a.x - b.x);
      const totalW = owned.reduce((s, n) => s + n.w, 0) + Math.max(0, owned.length - 1) * 30;
      let cx = Math.max(leftX, (leftX + rightX) / 2 - totalW / 2);
      for (const n of owned) {
        n.y = Math.min(Math.max(n.y, lane.y + M + n.h / 2), lane.y + lane.h - M - n.h / 2);
        n.x = cx + n.w / 2;
        cx += n.w + 30;
      }
      if (owned.length && (owned[owned.length - 1].x + owned[owned.length - 1].w / 2) > rightX) {
        const overflow = (owned[owned.length - 1].x + owned[owned.length - 1].w / 2) - rightX;
        for (const n of owned) n.x -= overflow;
      }
    }
  }
  resolveOverlaps(nodes.filter(n => !n.fixedRel), 34, 28);
}

/* 折点/锚点引用匹配：先按书写方向精确匹配，匹配不到再接受反向写法。
   这样手写 `edge B->A` 或早期版本写出的反向引用都不会让位置块静默失效。 */
function findEdgeByRefs(edges, from, to) {
  if (!edges) return null;
  return edges.find(e => e.from === from && e.to === to)
      || edges.find(e => e.from === to && e.to === from)
      || null;
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
  // 应用连线折点：按 <from>-><to> 定位边，按序号重建 bends（沿折线有序、无空洞）
  {
    const bendByEdge = new Map();
    for (const item of L) {
      if (item.kind !== 'edgeBend') continue;
      const e = findEdgeByRefs(model.edges, item.from, item.to);
      if (!e) continue;
      if (!bendByEdge.has(e)) bendByEdge.set(e, []);
      bendByEdge.get(e).push({ idx: item.idx, x: item.x, y: item.y });
    }
    for (const [e, list] of bendByEdge) {
      const sorted = [...list].sort((a, b) => a.idx - b.idx);
      e.bends = sorted.map(t => ({ x: t.x, y: t.y }));
    }
  }
  // 应用连线端点锚点：需边已有折点，锚点相对起点/终点节点中心的边缘偏移
  for (const item of L) {
    if (item.kind !== 'edgeAnchor') continue;
    const e = findEdgeByRefs(model.edges, item.from, item.to);
    if (!e || !e.bends || !e.bends.length) continue;
    const anchor = { dx: item.dx, dy: item.dy };
    if (item.which === 'start') e.aAnchor = anchor; else e.bAnchor = anchor;
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
  // 连线折点纳入包围盒（折点定位到较远位置时画布也要能容纳）
  for (const e of model.edges || []) {
    if (!e.bends) continue;
    for (const b of e.bends) {
      if (!isFinite(b.x) || !isFinite(b.y)) continue;
      minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x);
      minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y);
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
  const BOX_H = 96;
  const HEAD_TOP = TOP + titleH;

  // 参与者 X 坐标（LifeLine 中心）与头部框
  let x = PAD;
  for (const p of model.participants) {
    const iconW = p.kind === 'object' ? 6 : 26;
    p.w = Math.max(textWidth(p.label, 13, '600') + iconW * 1.5 + 42, 140);
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
    const cx = part ? part.x : 0;
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

  // ── 2. 框外角色排列在边界框左侧：纵向位置对齐它连的用例，减少连线交叉 ──
  if (outsideNodes.length) {
    const outerLeft = model.boundary.x - 70;
    // 角色的「引力中心」= 它连的框内用例的平均 y（没有连线就给边界中线）
    const anchors = outsideNodes.map(n => {
      let sum = 0, cnt = 0;
      for (const e of model.edges || []) {
        const other = e.from === n.id ? e.to : (e.to === n.id ? e.from : null);
        if (other) {
          const t = boundNodes.find(b => b.id === other);
          if (t) { sum += t.y; cnt++; }
        }
      }
      return { n, want: cnt ? sum / cnt : (model.boundary.y + model.boundary.h / 2) };
    });
    // 按 want 排序后从上往下摆，保持互不重叠（贪心吸附到自己的目标位置）
    anchors.sort((a, b) => a.want - b.want);
    // 角色总跨度尽量不超过边界高度：间距随角色数压缩，最少 104
    const BH = model.boundary.h - 60;
    const naturalSpan = (outsideNodes.length - 1) * (Math.max(...outsideNodes.map(n => n.h), 96) + 30);
    const pitch = outsideNodes.length > 1
      ? Math.max(104, Math.min(Math.max(...outsideNodes.map(n => n.h), 96) + 30, BH / (outsideNodes.length - 1)))
      : 0;
    const startY = model.boundary.y + 30 + Math.max(0, (BH - naturalSpan) / 2);
    let cursor = startY;
    for (const a of anchors) {
      const y = Math.max(cursor, a.want);
      a.n.x = outerLeft;
      a.n.y = y;
      cursor = y + pitch;
    }
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