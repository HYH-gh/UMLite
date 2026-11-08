/*============================================================================
 *  @layout 位置代码：读（parse）与写（serialize）的唯一实现
 *
 *  一份语法只在这里定义一次：
 *    - 解析层 parser.js 调 parseLayoutBlock() 把它读进 model.layout
 *    - 界面层 ui.js / history.js 调 serializeLayoutBlock() / withPositionBlock() 写回源码
 *  任何格式调整只需改本文件，读写两侧不会漂移。
 *
 *  行格式（w/h 可省略；坐标均为整数像素）：
 *    boundary @ (x, y) w h                 用例图系统边界 / 活动图活动边（左上角坐标）
 *    lane <泳道名> @ (x, y) w h             活动图泳道（左上角坐标）
 *    <节点名> @ (x, y) w h                  类/用例/状态等具名节点（中心坐标）
 *    <元素id> @ lane <泳道名> (x, y) w h     泳道内元素（相对泳道左上角）
 *    edge <from>-><to> bend <序号> @ (x, y)  连线折点（绝对坐标）
 *    edge <from>-><to> start|end (dx, dy)    连线端点锚点（相对节点中心）
 *    participant <ref> @ (x, y) w h         时序图参与者
 *    message <序号> @ (_, y)                时序图消息（_ 表示不约束水平位置）
 *    activation <序号> @ (_, y) h           时序图激活条（顶部 y + 高度 h）
 *    fragment <序号> @ (x, y) w h           时序图组合片段
 *    lifeBottom <y>                         时序图全部生命线统一底部高度
 * =========================================================================*/

const LAYOUT_KEY = '@layout';

/* ---------------- 读：@layout 行 → [{kind, ...}] ---------------- */

/* 非法/无法识别的行被宽容忽略（不影响图主体）。 */
function parseLayoutBlock(lines, type) {
  const out = [];
  for (const { text: raw } of lines) {
    // 时序图：生命线统一底部高度 <y>
    const lb = raw.match(/^lifeBottom\s+([-+0-9.]+)\s*$/i);
    if (lb) {
      const v = parseFloat(lb[1]);
      if (!isNaN(v) && v > 0) out.push({ kind: 'seqLifeBottom', v });
      continue;
    }
    // 时序图：参与者 <名> @ (x, y) [w h]
    const pm2 = raw.match(/^participant\s+(.+?)\s+@\s*\(([-+0-9.]+)\s*,\s*([-+0-9.]+)\s*\)\s*(?:([-0-9.]+)\s+([-0-9.]+))?\s*$/i);
    if (pm2) {
      out.push({ kind: 'seqPart', name: pm2[1].trim(), x: +pm2[2], y: +pm2[3],
                 w: pm2[4] != null ? +pm2[4] : undefined, h: pm2[5] != null ? +pm2[5] : undefined });
      continue;
    }
    // 时序图：消息 <序号> @ (x, y)　x 可用 _ 表示“不约束水平位置”
    const ms = raw.match(/^message\s+(\d+)\s+@\s*\(([-_+0-9.]+)\s*,\s*([-+0-9.]+)\s*\)\s*$/i);
    if (ms) {
      out.push({ kind: 'seqMsg', idx: +ms[1], x: ms[2] === '_' ? undefined : +ms[2], y: +ms[3] });
      continue;
    }
    // 时序图：激活条 <序号> @ (x, y) [h]　y 为激活条顶部，h 为高度（仅一个可选数字）
    const at = raw.match(/^activation\s+(\d+)\s+@\s*\(([-_+0-9.]+)\s*,\s*([-+0-9.]+)\s*\)\s*(?:([-0-9.]+))?\s*$/i);
    if (at) {
      out.push({ kind: 'seqAct', idx: +at[1], y: +at[3],
                 h: at[4] != null ? +at[4] : undefined });
      continue;
    }
    // 时序图：组合片段 <序号> @ (x, y) [w h]
    const fg = raw.match(/^fragment\s+(\d+)\s+@\s*\(([-+0-9.]+)\s*,\s*([-+0-9.]+)\s*\)\s*(?:([-0-9.]+)\s+([-0-9.]+))?\s*$/i);
    if (fg) {
      out.push({ kind: 'seqFrag', idx: +fg[1], x: +fg[2], y: +fg[3],
                 w: fg[4] != null ? +fg[4] : undefined, h: fg[5] != null ? +fg[5] : undefined });
      continue;
    }
    // 泳道内二级定位：<元素id> @ lane <泳道名> (x, y) [w h]　坐标相对该泳道（泳道即内部元素的画布）
    const lm = raw.match(/^([A-Za-z_][\w.]*)\s+@\s+lane\s+(.+?)\s*\(\s*([-+0-9.]+)\s*,\s*([-+0-9.]+)\s*\)\s*(?:([-0-9.]+)\s+([-0-9.]+))?\s*$/i);
    if (lm) {
      const lx = parseFloat(lm[3]), ly = parseFloat(lm[4]);
      if (isNaN(lx) || isNaN(ly)) continue;
      out.push({ kind: 'laneNode', id: lm[1], lane: lm[2].trim(), x: lx, y: ly,
                 w: lm[5] != null ? parseFloat(lm[5]) : undefined,
                 h: lm[6] != null ? parseFloat(lm[6]) : undefined });
      continue;
    }
    // 图标题位置：title @ (x, y)　标题基线中心（画布坐标）
    const tl = raw.match(/^title\s+@\s*\(\s*([-+0-9.]+)\s*,\s*([-+0-9.]+)\s*\)\s*$/i);
    if (tl) {
      const tx = parseFloat(tl[1]), ty = parseFloat(tl[2]);
      if (!isNaN(tx) && !isNaN(ty)) out.push({ kind: 'title', x: tx, y: ty });
      continue;
    }
    // 连线折点：edge <起点>-><终点> bend <序号> @ (x, y)　坐标即折点绝对位置，序号为沿线(bends)顺序
    const be = raw.match(/^edge\s+(.+?)\s*->\s*(.+?)\s+bend\s+(\d+)\s+@\s*\(\s*([-+0-9.]+)\s*,\s*([-+0-9.]+)\s*\)\s*$/i);
    if (be) {
      const x = parseFloat(be[4]), y = parseFloat(be[5]);
      if (!isNaN(x) && !isNaN(y)) out.push({ kind: 'edgeBend', from: be[1].trim(), to: be[2].trim(), idx: +be[3], x, y });
      continue;
    }
    // 连线端点锚点：edge <起点>-><终点> (start|end) (dx, dy)　dx/dy 为相对起点/终点节点中心的边缘偏移
    const an = raw.match(/^edge\s+(.+?)\s*->\s*(.+?)\s+(start|end)\s*\(\s*([-+0-9.]+)\s*,\s*([-+0-9.]+)\s*\)\s*$/i);
    if (an) {
      const dx = parseFloat(an[4]), dy = parseFloat(an[5]);
      if (!isNaN(dx) && !isNaN(dy)) out.push({ kind: 'edgeAnchor', from: an[1].trim(), to: an[2].trim(), which: an[3].toLowerCase(), dx, dy });
      continue;
    }
    const m = raw.match(/^(.+?)\s+@\s*\(\s*([-+0-9.]+)\s*,\s*([-+0-9.]+)\s*\)\s*(?:([-0-9.]+)\s+([-0-9.]+))?\s*$/i);
    if (!m) continue;
    const ref = m[1].trim();
    const x = parseFloat(m[2]), y = parseFloat(m[3]);
    if (isNaN(x) || isNaN(y)) continue;
    const w = m[4] != null ? parseFloat(m[4]) : undefined;
    const h = m[5] != null ? parseFloat(m[5]) : undefined;
    if (/^lane\s+/i.test(ref)) {
      out.push({ kind: 'lane', name: ref.slice(4).trim(), x, y, w, h });
    } else if (/^boundary$/i.test(ref)) {
      out.push({ kind: 'boundary', x, y, w, h });
    } else {
      const kwm = ref.match(/^\s*(?:class|interface|abstract\s*class|entity|object|component|package|usecase|actor|participant|state)\s+(.+?)\s*$/i);
      out.push({ kind: 'node', name: kwm ? kwm[1].trim() : ref, x, y, w, h });
    }
  }
  return out;
}

/* ---------------- 写：model → @layout 文本块 ---------------- */

const _r = (v) => Math.round(v);

/* 把当前画布坐标序列化为 @layout 位置块。
   - 活动图：泳道 + 活动边 + 泳道内元素（内部无稳定标识的节点不导出）
   - 时序图：参与者 / 消息 / 激活条 / 组合片段 / 生命线底部
   - 其余图：全部具名节点 + 系统边界框 */
function serializeLayoutBlock(model) {
  if (!model) return '';
  if (model.type === 'activity') {
    const lines = [LAYOUT_KEY];
    (model.swimlanes || []).forEach(s =>
      lines.push(`lane ${s.label} @ (${_r(s.x)}, ${_r(s.y)}) ${_r(s.w)} ${_r(s.h)}`));
    if (model.activityEdge) {
      const b = model.activityEdge;
      lines.push(`boundary @ (${_r(b.x)}, ${_r(b.y)}) ${_r(b.w)} ${_r(b.h)}`);
    }
    // 泳道内元素：二级定位，坐标相对其泳道（泳道即内部元素的画布）
    for (const n of model.nodes || []) {
      if (n.kind === 'pseudo' || !n.lane) continue;
      const s = (model.swimlanes || []).find(x => x.label === n.lane);
      if (!s) continue;
      lines.push(`${n.id} @ lane ${s.label} (${_r(n.x - s.x)}, ${_r(n.y - s.y)}) ${_r(n.w)} ${_r(n.h)}`);
    }
    pushEdgeLines(lines, model.edges);
    return lines.length > 1 ? lines.join('\n') : '';
  }

  // 时序图：导出参与者 / 消息 / 激活 / 组合片段的位置
  if (model.type === 'sequence') {
    const lines = [LAYOUT_KEY];
    if (model.lifeBottom != null) lines.push(`lifeBottom ${_r(model.lifeBottom)}`);
    for (const p of model.participants || []) {
      lines.push(`participant ${p.ref} @ (${_r(p.x)}, ${_r(p.y)}) ${_r(p.w)} ${_r(p.h)}`);
    }
    (model.messages || []).forEach((m, i) =>
      lines.push(`message ${i} @ (_, ${_r(m.y)})`));
    (model.activations || []).forEach((a, i) =>
      lines.push(`activation ${i} @ (_, ${_r(a.startY)}) ${_r(a.endY - a.startY)}`));
    (model.fragments || []).forEach((f, i) =>
      lines.push(`fragment ${i} @ (${_r(f.x)}, ${_r(f.y)}) ${_r(f.w)} ${_r(f.h)}`));
    return lines.length > 1 ? lines.join('\n') : '';
  }

  const lines = [LAYOUT_KEY];
  // 图标题（拖动过才有独立位置；拖到默认位置时也照常导出，保证往返一致）
  if (model.title && model.titleX != null && model.titleY != null) {
    lines.push(`title @ (${_r(model.titleX)}, ${_r(model.titleY)})`);
  }
  for (const n of model.nodes || []) {
    if (n.kind === 'pseudo') continue;
    lines.push(`${n.label} @ (${_r(n.x)}, ${_r(n.y)}) ${_r(n.w)} ${_r(n.h)}`);
  }
  pushEdgeLines(lines, model.edges);
  if (model.boundary) {
    const b = model.boundary;
    lines.push(`boundary @ (${_r(b.x)}, ${_r(b.y)}) ${_r(b.w)} ${_r(b.h)}`);
  }
  return lines.length > 1 ? lines.join('\n') : '';
}

/* 折点与端点锚点：from/to 为稳定引用（具名节点名 / 活动图节点 id） */
function pushEdgeLines(lines, edges) {
  for (const e of edges || []) {
    if (e.from == null || e.to == null) continue;
    (e.bends || []).forEach((b, k) => {
      if (!isFinite(b.x) || !isFinite(b.y)) return;
      lines.push(`edge ${e.from}->${e.to} bend ${k} @ (${_r(b.x)}, ${_r(b.y)})`);
    });
    if (e.aAnchor && isFinite(e.aAnchor.dx) && isFinite(e.aAnchor.dy))
      lines.push(`edge ${e.from}->${e.to} start (${_r(e.aAnchor.dx)}, ${_r(e.aAnchor.dy)})`);
    if (e.bAnchor && isFinite(e.bAnchor.dx) && isFinite(e.bAnchor.dy))
      lines.push(`edge ${e.from}->${e.to} end (${_r(e.bAnchor.dx)}, ${_r(e.bAnchor.dy)})`);
  }
}

/* 在源码末尾追加/替换位置块（不修改用户原有主体代码） */
function withPositionBlock(src, model) {
  const block = serializeLayoutBlock(model);
  if (!block) return src;
  const idx = src.search(new RegExp('^' + LAYOUT_KEY + '\\b', 'm'));
  const base = (idx >= 0 ? src.slice(0, idx) : src).replace(/\s+$/, '');
  return base + '\n\n' + block + '\n';
}
