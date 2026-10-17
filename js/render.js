﻿﻿﻿﻿/* ==========================================================================
 *  渲染层
 * ========================================================================== */

const SVG_CSS = `
.node-box{fill:#ffffff;stroke:#94a3b8;stroke-width:1.5;}
.node-box-soft{fill:#ffffff;stroke:#a5b4fc;stroke-width:1.5;}
.node-header{fill:#e0e7ff;stroke:#94a3b8;stroke-width:1.5;}
.node-header-soft{fill:#ede9fe;stroke:#a78bfa;stroke-width:1.5;}
.node-title{font-family:${FONT};font-size:14px;font-weight:600;fill:#1e293b;}
.node-title-sm{font-family:${FONT};font-size:12.5px;font-weight:600;fill:#1e293b;}
.node-member{font-family:${FONT};font-size:12.5px;fill:#475569;}
.node-actor-label{font-family:${FONT};font-size:13px;font-weight:600;fill:#1e293b;}
.usecase-ellipse{fill:#f5f3ff;stroke:#8b5cf6;stroke-width:1.5;}
.actor-line{stroke:#334155;stroke-width:1.8;fill:none;}
.actor-head{fill:#ffffff;stroke:#334155;stroke-width:1.8;}
.act-round{fill:#ecfeff;stroke:#0891b2;stroke-width:1.6;rx:22;}
.act-diamond{fill:#fef3c7;stroke:#d97706;stroke-width:1.6;}
.act-start{fill:#0f172a;stroke:#0f172a;stroke-width:1.6;}
.swimlane-h{fill:rgba(224,242,254,0.4);stroke:none;}
.swimlane-v{fill:rgba(236,253,245,0.45);stroke:none;}
.swimlane-bar-h{fill:rgba(14,165,233,0.55);}
.swimlane-bar-v{fill:rgba(16,185,129,0.55);}
.swimlane-sep-h{stroke:#0ea5e9;stroke-width:2;}
.swimlane-sep-v{stroke:#10b981;stroke-width:2;}
.swimlane-title{font-family:${FONT};font-size:15px;font-weight:700;fill:#0369a1;letter-spacing:1px;}
.act-stop{fill:#ffffff;stroke:#0f172a;stroke-width:2.4;}
.act-text{font-family:${FONT};font-size:13px;fill:#0f172a;}
.act-text-sm{font-family:${FONT};font-size:11.5px;fill:#78350f;}
.state-round{fill:#f0fdf4;stroke:#16a34a;stroke-width:1.6;}
.state-pseudo{fill:#0f172a;stroke:#0f172a;}
.edge-line{stroke:#64748b;stroke-width:1.5;fill:none;stroke-linecap:round;}
.edge-dashed{stroke-dasharray:7 5;}
.edge-label{font-family:${FONT};font-size:12px;fill:#475569;}
.edge-label-bg{fill:#ffffff;opacity:.92;}
.arrow-fill{fill:#64748b;}
.arrow-line{stroke:#64748b;stroke-width:1.5;fill:none;stroke-linecap:round;}
.diamond-fill{fill:#64748b;stroke:#64748b;stroke-width:1;}
.diamond-open{fill:#ffffff;stroke:#64748b;stroke-width:1.6;}
.title-text{font-family:${FONT};font-size:19px;font-weight:700;fill:#1e293b;}
.mult-text{font-family:${FONT};font-size:11.5px;fill:#334155;}
.seq-box{fill:#eef2ff;stroke:#6366f1;stroke-width:1.6;}
.seq-life{stroke:#c7d2fe;stroke-width:1.5;stroke-dasharray:5 5;}
.seq-msg{stroke:#334155;stroke-width:1.6;fill:none;}
.seq-msg-dashed{stroke-dasharray:7 5;}
.seq-msg-text{font-family:${FONT};font-size:12.5px;fill:#1e293b;}
.seq-actor-text{font-family:${FONT};font-size:13px;font-weight:600;fill:#312e81;}
.hit{fill:transparent;pointer-events:all;}
`;

function clipPoint(n, tx, ty) {
  const cx = n.x, cy = n.y;
  const dx = tx - cx, dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  if (n.shape === 'ellipse' || n.shape === 'circle') {
    const rx = n.w / 2, ry = n.h / 2;
    const t = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
    return { x: cx + dx * t, y: cy + dy * t };
  }
  if (n.shape === 'diamond') {
    const hw = n.w / 2, hh = n.h / 2;
    const t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
    return { x: cx + dx * t, y: cy + dy * t };
  }
  const hw = n.w / 2, hh = n.h / 2;
  const sx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(sx, sy);
  return { x: cx + dx * t, y: cy + dy * t };
}

function addArrowHead(g, tip, angle, kind) {
  const size = 11;
  if (kind === 'triangle') {
    const p1 = { x: tip.x - size * Math.cos(angle - 0.36), y: tip.y - size * Math.sin(angle - 0.36) };
    const p2 = { x: tip.x - size * Math.cos(angle + 0.36), y: tip.y - size * Math.sin(angle + 0.36) };
    g.appendChild(el('polygon', {
      points: `${tip.x},${tip.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`,
      class: 'arrow-fill'
    }));
  } else if (kind === 'open') {
    const p1 = { x: tip.x - size * Math.cos(angle - 0.42), y: tip.y - size * Math.sin(angle - 0.42) };
    const p2 = { x: tip.x - size * Math.cos(angle + 0.42), y: tip.y - size * Math.sin(angle + 0.42) };
    g.appendChild(el('polyline', {
      points: `${p1.x},${p1.y} ${tip.x},${tip.y} ${p2.x},${p2.y}`,
      class: 'arrow-line'
    }));
  }
}

function addDiamond(g, tip, angle, filled) {
  const len = 14, wid = 6;
  const p1 = { x: tip.x + len * Math.cos(angle), y: tip.y + len * Math.sin(angle) };
  const mx = (tip.x + p1.x) / 2, my = (tip.y + p1.y) / 2;
  const n1 = { x: mx - wid * Math.sin(angle), y: my + wid * Math.cos(angle) };
  const n2 = { x: mx + wid * Math.sin(angle), y: my - wid * Math.cos(angle) };
  g.appendChild(el('polygon', {
    points: `${tip.x},${tip.y} ${n1.x},${n1.y} ${p1.x},${p1.y} ${n2.x},${n2.y}`,
    class: filled ? 'diamond-fill' : 'diamond-open'
  }));
}

function drawEdgeLabel(g, x, y, text) {
  if (!text) return;
  const w = textWidth(text, 12) + 10;
  g.appendChild(el('rect', { x: x - w / 2, y: y - 10, width: w, height: 16, rx: 4, class: 'edge-label-bg' }));
  g.appendChild(el('text', { x, y: y + 1, 'text-anchor': 'middle', class: 'edge-label' }, text));
}

function drawEdge(g, e, nodeMap, edges) {
  // 连线中点引用：notice ..> A--B 指向已有连线的中点
  if (e.connectToMidpoint) {
    const refA = nodeMap.get(e.connectToMidpoint.from);
    const refB = nodeMap.get(e.connectToMidpoint.to);
    if (!refA || !refB) return;
    // 默认保持原逻辑：指向两元素中心连线的中点；
    // 仅当被指向的线添加了折点（变成折线）时，才改指向其标签位置，避免落入空白
    let mp;
    // 端点方向可能相反（如 A--B 与 B-->A 都表示同一条线），须双向匹配
    const te = edges ? edges.find(x =>
      (x.from === e.connectToMidpoint.from && x.to === e.connectToMidpoint.to) ||
      (x.from === e.connectToMidpoint.to && x.to === e.connectToMidpoint.from)
    ) : null;
    const tb = te && te.bends && te.bends.length ? te.bends.filter(pt => isFinite(pt.x) && isFinite(pt.y)) : null;
    if (tb && tb.length) {
      const p1t = clipPoint(refA, tb[0].x, tb[0].y);
      mp = { x: (p1t.x + tb[0].x) / 2, y: (p1t.y + tb[0].y) / 2 - 8 };
    } else {
      mp = { x: (refA.x + refB.x) / 2, y: (refA.y + refB.y) / 2 };
    }
    let src, dst;
    if (e.from) {
      src = nodeMap.get(e.from);
      dst = mp;
    } else {
      src = nodeMap.get(e.to);
      dst = mp;
    }
    if (!src) return;
    const p = clipPoint(src, dst.x, dst.y);
    const ang = Math.atan2(dst.y - p.y, dst.x - p.x);
    g.appendChild(el('line', {
      x1: p.x, y1: p.y, x2: dst.x, y2: dst.y,
      class: 'edge-line' + (e.dash ? ' edge-dashed' : '')
    }));
    if (e.head && e.head !== 'none') addArrowHead(g, dst, ang, e.head);
    // 标签应位于便签自身连线的中点，而非目标线的中点
    if (e.label) {
      const lx = (p.x + dst.x) / 2, ly = (p.y + dst.y) / 2;
      drawEdgeLabel(g, lx, ly - 8, e.label);
    }
    return;
  }

  const a = nodeMap.get(e.from);
  const b = nodeMap.get(e.to);
  if (!a || !b) return;

  if (a === b) {
    const r = 26;
    const sx = a.x + a.w / 2;
    const sy = a.y - 6;
    const path = `M ${sx} ${sy} C ${sx + 58} ${sy - 42}, ${sx + 58} ${sy + 42}, ${sx} ${sy + 18}`;
    g.appendChild(el('path', { d: path, class: 'edge-line' + (e.dash ? ' edge-dashed' : '') }));
    if (e.label) drawEdgeLabel(g, sx + 62, sy + 6, e.label);
    return;
  }

  const bends = (e.bends && e.bends.length) ? e.bends.filter(pt => isFinite(pt.x) && isFinite(pt.y)) : null;
  let p1, p2;
  if (bends) {
    p1 = clipPoint(a, bends[0].x, bends[0].y);
    p2 = clipPoint(b, bends[bends.length - 1].x, bends[bends.length - 1].y);
  } else {
    p1 = clipPoint(a, b.x, b.y);
    p2 = clipPoint(b, a.x, a.y);
  }
  const pts = bends ? [p1].concat(bends, [p2]) : [p1, p2];

  if (bends) {
    const pointsStr = pts.map(pt => `${pt.x},${pt.y}`).join(' ');
    g.appendChild(el('polyline', { points: pointsStr, class: 'edge-line' + (e.dash ? ' edge-dashed' : '') }));
  } else {
    g.appendChild(el('line', {
      x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
      class: 'edge-line' + (e.dash ? ' edge-dashed' : '')
    }));
  }

  const endSegA = pts[pts.length - 2], endSegB = pts[pts.length - 1];
  const angEnd = Math.atan2(endSegB.y - endSegA.y, endSegB.x - endSegA.x);
  const startSegA = pts[0], startSegB = pts[1];
  const angStart = Math.atan2(startSegB.y - startSegA.y, startSegB.x - startSegA.x);

  if (e.head && e.head !== 'none') addArrowHead(g, p2, angEnd, e.head);
  if (e.tailDiamond) addDiamond(g, p1, angStart, e.tailDiamond === 'filled');

  if (e.fromMult) {
    const x = startSegA.x + (startSegB.x - startSegA.x) * 0.18, y = startSegA.y + (startSegB.y - startSegA.y) * 0.18;
    g.appendChild(el('text', { x: x + 6, y: y - 6, class: 'mult-text' }, e.fromMult));
  }
  if (e.toMult) {
    const x = endSegA.x + (endSegB.x - endSegA.x) * 0.82, y = endSegA.y + (endSegB.y - endSegA.y) * 0.82;
    g.appendChild(el('text', { x: x - 6, y: y - 6, class: 'mult-text', 'text-anchor': 'end' }, e.toMult));
  }

  if (e.label) {
    if (bends) {
      drawEdgeLabel(g, (p1.x + pts[1].x) / 2, (p1.y + pts[1].y) / 2 - 8, e.label);
    } else {
      drawEdgeLabel(g, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2 - 8, e.label);
    }
  }
}

/* ---------------- 节点绘制 ---------------- */

function drawNode(g, n, type) {
  const x = n.x - n.w / 2, y = n.y - n.h / 2;

  if (type === 'activity') {
    if (n.kind === 'start') {
      g.appendChild(el('circle', { cx: n.x, cy: n.y, r: 12, class: 'act-start' }));
      return;
    }
    if (n.kind === 'stop') {
      g.appendChild(el('circle', { cx: n.x, cy: n.y, r: 13, class: 'act-stop' }));
      g.appendChild(el('circle', { cx: n.x, cy: n.y, r: 7, class: 'act-start' }));
      return;
    }
    if (n.kind === 'decision') {
      g.appendChild(el('polygon', {
        points: `${n.x},${y} ${x + n.w},${n.y} ${n.x},${y + n.h} ${x},${n.y}`,
        class: 'act-diamond'
      }));
      g.appendChild(el('text', {
        x: n.x, y: n.y + 4, 'text-anchor': 'middle', class: 'act-text-sm'
      }, n.label));
      return;
    }
    g.appendChild(el('rect', { x, y, width: n.w, height: n.h, rx: 22, class: 'act-round' }));
    g.appendChild(el('text', {
      x: n.x, y: n.y + 5, 'text-anchor': 'middle', class: 'act-text'
    }, n.label));
    return;
  }

  if (type === 'usecase') {
    if (n.kind === 'actor') {
      const cx = n.x, top = y + 4, headR = 11;
      g.appendChild(el('circle', { cx, cy: top + headR, r: headR, class: 'actor-head' }));
      const bodyTop = top + headR * 2 + 2;
      const bodyBottom = bodyTop + 30;
      g.appendChild(el('line', { x1: cx, y1: bodyTop, x2: cx, y2: bodyBottom, class: 'actor-line' }));
      g.appendChild(el('line', { x1: cx - 17, y1: bodyTop + 12, x2: cx + 17, y2: bodyTop + 12, class: 'actor-line' }));
      g.appendChild(el('line', { x1: cx, y1: bodyBottom, x2: cx - 15, y2: bodyBottom + 24, class: 'actor-line' }));
      g.appendChild(el('line', { x1: cx, y1: bodyBottom, x2: cx + 15, y2: bodyBottom + 24, class: 'actor-line' }));
      g.appendChild(el('text', {
        x: cx, y: y + n.h + 18, 'text-anchor': 'middle', class: 'node-actor-label'
      }, n.label));
      return;
    }
    g.appendChild(el('ellipse', { cx: n.x, cy: n.y, rx: n.w / 2, ry: n.h / 2, class: 'usecase-ellipse' }));
    g.appendChild(el('text', {
      x: n.x, y: n.y + 5, 'text-anchor': 'middle', class: 'node-title-sm'
    }, n.label));
    return;
  }

  if (type === 'state') {
    if (n.shape === 'circle') {
      g.appendChild(el('circle', { cx: n.x, cy: n.y, r: 11, class: 'state-pseudo' }));
      return;
    }
    g.appendChild(el('rect', { x, y, width: n.w, height: n.h, rx: 22, class: 'state-round' }));
    g.appendChild(el('text', {
      x: n.x, y: n.y + 5, 'text-anchor': 'middle', class: 'node-title-sm'
    }, n.label));
    return;
  }

  /********** 包图 - Folder 标签样式 **********/
  if (n.kind === 'package') {
    const tabW = Math.min(textWidth(n.label, 13, '600') + 28, n.w * 0.55);
    const tabH = 22;
    // 主体矩形（顶部不设圆角，用细线封住缺口）
    g.appendChild(el('rect', {
      x: x, y: y + tabH, width: n.w, height: n.h - tabH, rx: 5,
      fill: '#fffbeb', stroke: '#f59e0b', 'stroke-width': 1.5
    }));
    // 左侧缺口遮盖线
    g.appendChild(el('line', {
      x1: x, y1: y + tabH + 1, x2: x + 4, y2: y + tabH + 1,
      stroke: '#fffbeb', 'stroke-width': 1.5
    }));
    // 标签（左上角凸出的矩形）
    g.appendChild(el('rect', {
      x, y, width: tabW, height: tabH, rx: 4,
      fill: '#fde68a', stroke: '#f59e0b', 'stroke-width': 1.5
    }));
    // 标签与主体之间的连接（用一条线遮盖接缝）
    g.appendChild(el('line', {
      x1: x, y1: y + tabH, x2: x + tabW, y2: y + tabH,
      stroke: '#fde68a', 'stroke-width': 2
    }));
    // 主体右边和底边补齐（盖住圆角过渡）
    g.appendChild(el('rect', {
      x: x + tabW - 5, y: y + tabH, width: n.w - tabW + 5, height: 1.5,
      fill: '#f59e0b'
    }));
    g.appendChild(el('text', {
      x: x + 12, y: y + tabH - 5, 'text-anchor': 'start', class: 'node-title-sm',
      fill: '#92400e'
    }, n.label));

    // 包内成员显示在主体中
    (n.members || []).forEach((m, i) => {
      g.appendChild(el('text', {
        x: x + 14, y: y + tabH + 22 + i * 18, class: 'node-member',
        fill: '#78350f'
      }, m));
    });
    return;
  }

  /********** 部署图 node - 3D 立体盒子 **********/
  if (n.kind === 'node') {
    const dep = 8; // 3D 深度
    const fw = n.w - dep; // 正面宽度（碰撞区域包含 3D 深度）
    const fh = n.h - dep; // 正面高度
    // 顶面（上侧平行四边形）
    g.appendChild(el('polygon', {
      points: `${x + dep},${y + dep} ${x + n.w},${y + dep} ${x + fw},${y} ${x},${y}`,
      fill: '#d1fae5', stroke: '#10b981', 'stroke-width': 1
    }));
    // 右面（右侧平行四边形）
    g.appendChild(el('polygon', {
      points: `${x + fw},${y} ${x + n.w},${y + dep} ${x + n.w},${y + n.h} ${x + fw},${y + fh}`,
      fill: '#a7f3d0', stroke: '#10b981', 'stroke-width': 1
    }));
    // 底部面（底部平行四边形）
    g.appendChild(el('polygon', {
      points: `${x},${y + fh} ${x + fw},${y + fh} ${x + n.w},${y + n.h} ${x + dep},${y + n.h}`,
      fill: '#d1fae5', stroke: '#10b981', 'stroke-width': 1
    }));
    // 正面（主矩形）
    g.appendChild(el('polygon', {
      points: `${x},${y} ${x + fw},${y} ${x + fw},${y + fh} ${x},${y + fh}`,
      fill: '#ecfdf5', stroke: '#10b981', 'stroke-width': 1.5
    }));
    // 标题行
    const headH = 30;
    g.appendChild(el('line', {
      x1: x, y1: y + headH, x2: x + fw, y2: y + headH,
      stroke: '#10b981', 'stroke-width': 1
    }));
    g.appendChild(el('text', {
      x: n.x - dep / 2, y: y + headH - 9, 'text-anchor': 'middle', class: 'node-title-sm',
      fill: '#065f46'
    }, `«node» ${n.label}`));
    (n.members || []).forEach((m, i) => {
      g.appendChild(el('text', {
        x: x + 12, y: y + headH + 18 + i * 18, class: 'node-member',
        fill: '#064e3b'
      }, m));
    });
    return;
  }

  /********** artifact - 文档图标样式 **********/
  if (n.kind === 'artifact') {
    g.appendChild(el('rect', {
      x, y, width: n.w, height: n.h, rx: 4,
      fill: '#fff7ed', stroke: '#f97316', 'stroke-width': 1.5
    }));
    // 右上角折角装饰
    const fold = 16;
    g.appendChild(el('path', {
      d: `M${x + n.w - fold},${y} L${x + n.w},${y + fold}`,
      stroke: '#f97316', 'stroke-width': 1.5, fill: 'none'
    }));
    g.appendChild(el('polygon', {
      points: `${x + n.w - fold},${y} ${x + n.w},${y} ${x + n.w},${y + fold}`,
      fill: '#fed7aa'
    }));
    // 标题
    const headH = 28;
    g.appendChild(el('line', {
      x1: x + 8, y1: y + headH, x2: x + n.w - 8, y2: y + headH,
      stroke: '#f97316', 'stroke-width': 0.8, 'stroke-dasharray': '4 3'
    }));
    g.appendChild(el('text', {
      x: x + 12, y: y + headH - 7, 'text-anchor': 'start', class: 'node-title-sm',
      fill: '#9a3412'
    }, `«artifact» ${n.label}`));
    (n.members || []).forEach((m, i) => {
      g.appendChild(el('text', {
        x: x + 12, y: y + headH + 18 + i * 18, class: 'node-member',
        fill: '#7c2d12'
      }, m));
    });
    return;
  }

  /********** database - 圆柱体 **********/
  if (n.kind === 'database') {
    const r = n.w / 2;
    const cy2 = y + n.h;
    const cy1 = y + 16;
    // 主体（四肢路径：矩形 + 底部椭圆露出）
    g.appendChild(el('path', {
      d: `M ${x},${cy1} L ${x},${cy2 - 10} A ${r} 10 0 0 0 ${x + n.w},${cy2 - 10} L ${x + n.w},${cy1}`,
      fill: '#f0fdfa', stroke: '#14b8a6', 'stroke-width': 1.5
    }));
    // 顶部椭圆
    g.appendChild(el('ellipse', {
      cx: n.x, cy: cy1, rx: r, ry: 10,
      fill: '#ccfbf1', stroke: '#14b8a6', 'stroke-width': 1.5
    }));
    // 底部弧线
    g.appendChild(el('path', {
      d: `M ${x},${cy2 - 10} A ${r} 10 0 0 0 ${x + n.w},${cy2 - 10}`,
      fill: 'none', stroke: '#14b8a6', 'stroke-width': 1.5
    }));
    // 标题
    g.appendChild(el('text', {
      x: n.x, y: cy1 + 3, 'text-anchor': 'middle', class: 'node-title-sm',
      fill: '#134e4a'
    }, n.label));
    return;
  }

  /********** notice - 便签框（折角） **********/
  if (n.kind === 'notice') {
    const F = 16; // 折角大小
    g.appendChild(el('polygon', {
      points: `${x},${y} ${x + n.w - F},${y} ${x + n.w},${y + F} ${x + n.w},${y + n.h} ${x},${y + n.h}`,
      fill: '#fefce8', stroke: '#eab308', 'stroke-width': 1.5
    }));
    // 折角折痕线
    g.appendChild(el('line', {
      x1: x + n.w - F, y1: y, x2: x + n.w, y2: y + F,
      stroke: '#eab308', 'stroke-width': 1.5
    }));
    // 折角阴影三角形
    g.appendChild(el('polygon', {
      points: `${x + n.w - F},${y} ${x + n.w - F + 4},${y + 4} ${x + n.w},${y + F}`,
      fill: '#fef08a', stroke: 'none', opacity: 0.5
    }));
    // 标题与内容
    let contentY = y + 18;
    g.appendChild(el('text', {
      x: x + 12, y: contentY, 'text-anchor': 'start', class: 'node-title-sm',
      fill: '#713f12'
    }, n.label));
    contentY += 4;
    (n.members || []).forEach((m, i) => {
      g.appendChild(el('text', {
        x: x + 12, y: contentY + 18 + i * 18, class: 'node-member',
        fill: '#713f12'
      }, m));
    });
    return;
  }

  /********** component - 带组件图标的标题栏 **********/
  if (n.kind === 'component') {
    const headH = 34;
    g.appendChild(el('rect', {
      x, y, width: n.w, height: n.h, rx: 6,
      fill: '#f5f3ff', stroke: '#8b5cf6', 'stroke-width': 1.5
    }));
    g.appendChild(el('rect', {
      x, y, width: n.w, height: headH,
      fill: '#ede9fe', stroke: '#8b5cf6', 'stroke-width': 1.5
    }));
    g.appendChild(el('rect', {
      x, y: y + headH - 8, width: n.w, height: 8,
      fill: '#ede9fe', stroke: 'none'
    }));
    g.appendChild(el('line', {
      x1: x, y1: y + headH, x2: x + n.w, y2: y + headH,
      stroke: '#8b5cf6', 'stroke-width': 1
    }));
    // 组件小图标（两个小矩形在左侧）
    const iconX = x + 10, iconY = y + 7;
    g.appendChild(el('rect', {
      x: iconX, y: iconY, width: 8, height: 8, rx: 1.5,
      fill: '#a78bfa', stroke: 'none'
    }));
    g.appendChild(el('rect', {
      x: iconX, y: iconY + 10, width: 8, height: 8, rx: 1.5,
      fill: '#a78bfa', stroke: 'none'
    }));
    // 标题
    g.appendChild(el('text', {
      x: iconX + 18, y: y + 22, 'text-anchor': 'start', class: 'node-title',
      fill: '#5b21b6'
    }, n.label));
    // 成员
    (n.members || []).forEach((m, i) => {
      g.appendChild(el('text', {
        x: x + 12, y: y + headH + 20 + i * 18, class: 'node-member',
        fill: '#4c1d95'
      }, m));
    });
    return;
  }

  /********** 默认矩形框（类图等）- 包含属性和方法分栏 **********/
  const headH = 34;
  const kw = n.kind === 'abstract' ? '«abstract» ' : '';

  g.appendChild(el('rect', {
    x, y, width: n.w, height: n.h, rx: 6,
    class: 'node-box'
  }));
  g.appendChild(el('rect', {
    x, y, width: n.w, height: headH,
    class: 'node-header'
  }));
  g.appendChild(el('rect', {
    x, y: y + headH - 7, width: n.w, height: 7,
    class: 'node-header', stroke: 'none'
  }));
  g.appendChild(el('line', {
    x1: x, y1: y + headH , x2: x + n.w, y2: y + headH,
    stroke: '#94a3b8', 'stroke-width': 1
  }));

  g.appendChild(el('text', {
    x: n.x, y: y + 22, 'text-anchor': 'middle', class: 'node-title'
  }, kw + n.label));

  const mems = n.members || [];

  // E-R 图实体：字段含 VARCHAR(200)、DECIMAL(10,2) 等括号内容，不做属性/方法分栏
  if (type === 'er') {
    for (let i = 0; i < mems.length; i++) {
      g.appendChild(el('text', {
        x: x + 12, y: y + headH + 20 + i * 20, class: 'node-member',
        fill: '#1e293b'
      }, mems[i]));
    }
    return;
  }

  const isMeth = m => /\(.*\)/.test(m);
  const sepY = headH + 20; // 第一行基线

  let attrIdx = 0, methIdx = 0;
  for (const m of mems) {
    if (!isMeth(m)) {
      // 属性
      g.appendChild(el('text', {
        x: x + 12, y: y + sepY + attrIdx * 18, class: 'node-member'
      }, m));
      attrIdx++;
    }
  }

  // 属性和方法之间的分隔线
  if (n._hasSep) {
    const sy = y + sepY + n._attrCount * 18 + 4;
    g.appendChild(el('line', {
      x1: x + 8, y1: sy - 8, x2: x + n.w - 8, y2: sy - 8,
      stroke: '#94a3b8', 'stroke-width': 2
    }));
  }

  for (const m of mems) {
    if (isMeth(m)) {
      // 方法
      const mi = methIdx;
      const my = y + sepY + n._attrCount * 18 + (n._hasSep ? 16 : 0) + mi * 18;
      g.appendChild(el('text', {
        x: x + 12, y: my, class: 'node-member'
      }, m));
      methIdx++;
    }
  }
}

/* ---------------- 内容构建 ---------------- */

/* 活动图容器：泳道（最底层色带，可移动）+ 活动边（实线方框） */
function renderActivityContainers(root, model) {
  const HS = 18;
  // 泳道：渲染在底层
  if (model.swimlanes) {
    model.swimlanes.forEach((s, idx) => {
      const box = el('g', { 'data-swimlane-idx': idx });
      const isV = s.dir === 'v';
      // 条带底色（无整体描边，开口端无框，侧边边框单独绘制）
      box.appendChild(el('rect', {
        x: s.x, y: s.y, width: s.w, height: s.h,
        class: isV ? 'swimlane-v' : 'swimlane-h',
        'data-swimlane-body': idx
      }));
      if (isV) {
        // 垂直泳道：顶部标题栏（标题居中横排），左右侧边竖线保留，底部开口（无底边框）
        const barH = Math.min(30, s.h * 0.5);
        box.appendChild(el('rect', {
          x: s.x, y: s.y, width: s.w, height: barH, class: 'swimlane-bar-v'
        }));
        // 标题栏封闭：顶线 + 底部分隔线
        box.appendChild(el('line', {
          x1: s.x, y1: s.y, x2: s.x + s.w, y2: s.y, class: 'swimlane-sep-v'
        }));
        box.appendChild(el('line', {
          x1: s.x, y1: s.y + barH, x2: s.x + s.w, y2: s.y + barH, class: 'swimlane-sep-v'
        }));
        // 左右侧边竖线（保留，贯穿整条泳道）
        box.appendChild(el('line', {
          x1: s.x, y1: s.y, x2: s.x, y2: s.y + s.h, class: 'swimlane-sep-v'
        }));
        box.appendChild(el('line', {
          x1: s.x + s.w, y1: s.y, x2: s.x + s.w, y2: s.y + s.h, class: 'swimlane-sep-v'
        }));
        box.appendChild(el('text', {
          x: s.x + s.w / 2, y: s.y + barH - 8, class: 'swimlane-title', 'text-anchor': 'middle'
        }, s.label));
      } else {
        // 水平泳道：左侧标题栏（标题竖排居中），上下侧边横线保留，向右开口（无右边框）
        const barW = Math.min(46, s.w * 0.35);
        box.appendChild(el('rect', {
          x: s.x, y: s.y, width: barW, height: s.h, class: 'swimlane-bar-h'
        }));
        // 标题栏封闭：左边线 + 右侧分隔线
        box.appendChild(el('line', {
          x1: s.x, y1: s.y, x2: s.x, y2: s.y + s.h, class: 'swimlane-sep-h'
        }));
        box.appendChild(el('line', {
          x1: s.x + barW, y1: s.y, x2: s.x + barW, y2: s.y + s.h, class: 'swimlane-sep-h'
        }));
        // 上下侧边横线（保留，贯穿整条泳道）
        box.appendChild(el('line', {
          x1: s.x, y1: s.y, x2: s.x + s.w, y2: s.y, class: 'swimlane-sep-h'
        }));
        box.appendChild(el('line', {
          x1: s.x, y1: s.y + s.h, x2: s.x + s.w, y2: s.y + s.h, class: 'swimlane-sep-h'
        }));
        // 标题竖排（左栏垂直居中）
        const tc = s.x + barW / 2, tm = s.y + s.h / 2;
        box.appendChild(el('text', {
          x: tc, y: tm, class: 'swimlane-title', 'text-anchor': 'middle',
          transform: `rotate(-90 ${tc} ${tm})`
        }, s.label));
      }
      addContainerHandles(box, 'swimlane', idx, s);
      root.appendChild(box);
    });
  }
  // 活动边：实线圆角边框 + 左上标签
  if (model.activityEdge) {
    const a = model.activityEdge;
    const box = el('g');
    box.appendChild(el('rect', {
      x: a.x, y: a.y, width: a.w, height: a.h, rx: 10,
      fill: 'rgba(248,250,255,0.55)', stroke: '#4f46e5',
      'stroke-width': 1.5, 'stroke-dasharray': 'none'
    }));
    const lblW = textWidth(a.label, 13, '600') + 24;
    box.appendChild(el('rect', {
      x: a.x + 14, y: a.y - 11, width: lblW, height: 22, rx: 4,
      fill: '#f8faff', stroke: 'none'
    }));
    box.appendChild(el('text', {
      x: a.x + 26, y: a.y + 4, class: 'node-title-sm', fill: '#4338ca'
    }, a.label));
    addContainerHandles(box, 'activityEdge', -1, a);
    root.appendChild(box);
  }
}

/* 容器四角大小调整命中区（透明不可见，拖拽四角调整大小） */
function addContainerHandles(box, ctype, cidx, obj) {
  const HS = 18;
  const corners = [
    ['nw', obj.x,            obj.y,              'nwse-resize'],
    ['ne', obj.x + obj.w,    obj.y,              'nesw-resize'],
    ['sw', obj.x,            obj.y + obj.h,      'nesw-resize'],
    ['se', obj.x + obj.w,    obj.y + obj.h,      'nwse-resize']
  ];
  for (const [corner, cx, cy, cur] of corners) {
    box.appendChild(el('rect', {
      x: cx - HS / 2, y: cy - HS / 2, width: HS, height: HS, rx: 3,
      fill: 'rgba(0,0,0,0)', 'pointer-events': 'all',
      'data-ctype': ctype, 'data-cidx': cidx, 'data-corner': corner, cursor: cur
    }));
  }
}

function buildGraphContent(model) {
  const root = el('g');
  const nodeMap = new Map(model.nodes.map(n => [n.id, n]));

  // 绘制用例图系统边界框
  if (model.type === 'usecase' && model.boundary) {
    const b = model.boundary;
    const dash = b.lineStyle === 'solid' ? 'none' : '8 4';
    root.appendChild(el('rect', {
      x: b.x, y: b.y, width: b.w, height: b.h, rx: 10,
      fill: '#f4f6ff', stroke: '#6366f1', 'stroke-width': 1.5, 'stroke-dasharray': dash
    }));
    const lblW = textWidth(b.label, 13, '600') + 20;
    root.appendChild(el('rect', {
      x: b.x + 14, y: b.y - 11, width: lblW, height: 22, rx: 4,
      fill: '#f4f6ff', stroke: 'none'
    }));
    root.appendChild(el('text', {
      x: b.x + 24, y: b.y + 4,
      class: 'node-title-sm', fill: '#4338ca'
    }, b.label));

    // 四角大小调整命中区（透明不可见，鼠标移至边界四角处可拖拽调整大小）
    const HS = 18;
    const corners = [
      ['nw', b.x,            b.y,            'nwse-resize'],
      ['ne', b.x + b.w,      b.y,            'nesw-resize'],
      ['sw', b.x,            b.y + b.h,      'nesw-resize'],
      ['se', b.x + b.w,      b.y + b.h,      'nwse-resize']
    ];
    for (const [corner, cx, cy, cur] of corners) {
      root.appendChild(el('rect', {
        x: cx - HS / 2, y: cy - HS / 2, width: HS, height: HS, rx: 3,
        fill: 'rgba(0,0,0,0)', 'pointer-events': 'all',
        'data-boundary-handle': corner, cursor: cur
      }));
    }
  }

  // 活动图容器：泳道（渲染在最底层）+ 活动边
  if (model.type === 'activity' && (model.activityEdge || (model.swimlanes && model.swimlanes.length))) {
    renderActivityContainers(root, model);
  }

  const gEdges = el('g');
  const gNodes = el('g');
  root.appendChild(gEdges);
  root.appendChild(gNodes);

  for (let i = 0; i < model.edges.length; i++) {
    const e = model.edges[i];
    drawEdge(gEdges, e, nodeMap, model.edges);
    // 折点命中区（透明不可见，用于拖动/删除折点）
    if (e.bends && e.bends.length) {
      for (let k = 0; k < e.bends.length; k++) {
        const bk = e.bends[k];
        if (!isFinite(bk.x) || !isFinite(bk.y)) continue;
        gEdges.appendChild(el('rect', {
          x: bk.x - 6, y: bk.y - 6, width: 12, height: 12,
          fill: 'rgba(0,0,0,0)', 'pointer-events': 'all',
          'data-bend-edge': i, 'data-bend-idx': k, cursor: 'move'
        }));
      }
    }
  }

  for (const n of model.nodes) {
    const gn = el('g', { 'data-node-id': n.id });
    // 透明命中区域
    const pad = 6;
    const extraH = (model.type === 'usecase' && n.kind === 'actor') ? 26 : 0;
    gn.appendChild(el('rect', {
      x: n.x - n.w / 2 - pad,
      y: n.y - n.h / 2 - pad,
      width: n.w + pad * 2,
      height: n.h + pad * 2 + extraH,
      class: 'hit'
    }));
    drawNode(gn, n, model.type);
    gNodes.appendChild(gn);
  }

  if (model.title) {
    root.appendChild(el('text', {
      x: model.titleX, y: model.titleY, 'text-anchor': 'middle', class: 'title-text'
    }, model.title));
  }

  return root;
}

function buildSequenceContent(model) {
  const g = el('g');
  const { actors, messages, title } = model;
  const W = model.contentW;
  const H = model.contentH;

  if (title) {
    g.appendChild(el('text', {
      x: W / 2, y: model.titleY, 'text-anchor': 'middle', class: 'title-text'
    }, title));
  }

  const bottom = H - 28;

  for (const a of actors) {
    g.appendChild(el('line', {
      x1: a.x, y1: a.y + a.h / 2, x2: a.x, y2: bottom, class: 'seq-life'
    }));
  }

  for (const m of messages) {
    const from = actors.find(a => a.id === m.from);
    const to = actors.find(a => a.id === m.to);
    if (!from || !to) continue;

    if (from === to) {
      const x = from.x, y = m.y;
      g.appendChild(el('path', {
        d: `M ${x} ${y} h 34 v 18 h -34`,
        class: 'seq-msg' + (m.dashed ? ' seq-msg-dashed' : '')
      }));
      g.appendChild(el('polygon', {
        points: `${x},${y + 18} ${x + 9},${y + 14} ${x + 9},${y + 22}`,
        class: 'arrow-fill'
      }));
      g.appendChild(el('text', { x: x + 46, y: y + 10, class: 'seq-msg-text' }, m.label));
    } else {
      const dir = to.x > from.x ? 1 : -1;
      g.appendChild(el('line', {
        x1: from.x, y1: m.y, x2: to.x - dir * 10, y2: m.y,
        class: 'seq-msg' + (m.dashed ? ' seq-msg-dashed' : '')
      }));
      g.appendChild(el('polygon', {
        points: `${to.x},${m.y} ${to.x - dir * 11},${m.y - 5} ${to.x - dir * 11},${m.y + 5}`,
        class: 'arrow-fill'
      }));
      g.appendChild(el('text', {
        x: (from.x + to.x) / 2, y: m.y - 8,
        'text-anchor': 'middle', class: 'seq-msg-text'
      }, m.label));
    }
  }

  for (const a of actors) {
    g.appendChild(el('rect', {
      x: a.x - a.w / 2, y: a.y - a.h / 2,
      width: a.w, height: a.h, rx: 8, class: 'seq-box'
    }));
    g.appendChild(el('text', {
      x: a.x, y: a.y + 5, 'text-anchor': 'middle', class: 'seq-actor-text'
    }, a.label));
  }

  return g;
}