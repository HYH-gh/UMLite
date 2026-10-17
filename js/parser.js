﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿/* ---------------- 解析层 ---------------- */

const DIAGRAM_ALIASES = {
  class: 'class', classdiagram: 'class', '类图': 'class',
  usecase: 'usecase', '用例图': 'usecase',
  activity: 'activity', '活动图': 'activity',
  er: 'er', erdiagram: 'er', '实体关系图': 'er', 'er图': 'er',
  sequence: 'sequence', '时序图': 'sequence', '序列图': 'sequence',
  state: 'state', '状态图': 'state', statechart: 'state',
  component: 'component', '组件图': 'component',
  deployment: 'deployment', '部署图': 'deployment',
  object: 'object', '对象图': 'object',
  package: 'package', '包图': 'package'
};

const ARROWS = ['||--o{', '||--||', '||--|{', '}o--||', '}o--|{', '}o--o{', '--o{', '--||', '--|{', '||--', '}o--',
                'o{--||', 'o{--|{', 'o{--o{', '|{--||', '|{--|{', '|{--o{', '||--}o', '|{--}o', 'o{--}o',
                'o{--', '|{--', '--}o',
                '--|>', '<|--', '..|>', '<|..', '-->', '<--', '..>', '<..',
                '--*', '*--', '--o', 'o--', '->', '<-', '--', '..'];

const ARROW_SPEC = {
  '-->':  { kind: 'association',    dash: false, head: 'open' },
  '--|>': { kind: 'generalization', dash: false, head: 'triangle' },
  '..|>': { kind: 'realization',    dash: true,  head: 'triangle' },
  '..>':  { kind: 'dependency',     dash: true,  head: 'open' },
  '*--':  { kind: 'composition',    dash: false, head: 'none', tailDiamond: 'filled' },
  'o--':  { kind: 'aggregation',    dash: false, head: 'none', tailDiamond: 'open' },
  '--':   { kind: 'association',    dash: false, head: 'none' },
  '..':   { kind: 'dependency',     dash: true,  head: 'none' },
  '->':   { kind: 'association',    dash: false, head: 'open' }
};
// E-R 图关系箭头（继承 association 线型）
for (const a of ['||--o{','||--||','||--|{','}o--||','}o--|{','}o--o{','--o{','--||','--|{','||--','}o--',
                'o{--||','o{--|{','o{--o{','|{--||','|{--|{','|{--o{','||--}o','|{--}o','o{--}o',
                'o{--','|{--','--}o']) {
  ARROW_SPEC[a] = { kind: 'association', dash: false, head: 'none' };
}
const ARROW_NORMALIZE = {
  '<--': '-->', '<|--': '--|>', '<|..': '..|>', '<..': '..>', '<-': '->',
  '--*': '*--', '--o': 'o--'
};
// E-R 箭头反向映射
const _erRev = { '||--o{':'o{--||','||--||':'||--||','||--|{':'|{--||','}o--||':'||--}o','}o--|{':'|{--}o','}o--o{':'o{--}o','--o{':'o{--','--||':'||--','--|{':'|{--','||--':'--||','}o--':'--}o' };
for (const [k,v] of Object.entries(_erRev)) ARROW_NORMALIZE[k] = v;
// 将反向 E-R 箭头也加入 ARROW_SPEC
for (const a of Object.values(_erRev)) {
  if (!ARROW_SPEC[a]) ARROW_SPEC[a] = { kind: 'association', dash: false, head: 'none' };
}

function findArrow(s) {
  let best = null;
  for (const a of ARROWS) {
    let idx = s.indexOf(a);
    while (idx !== -1) {
      if (!best || idx < best.idx || (idx === best.idx && a.length > best.arrow.length)) {
        best = { idx, arrow: a };
      }
      idx = s.indexOf(a, idx + 1);
    }
  }
  return best;
}

function readToken(s) {
  s = String(s).trim();
  if (!s) return ['', ''];
  if (s[0] === '"') {
    const end = s.indexOf('"', 1);
    if (end < 0) return [s.slice(1), ''];
    return [s.slice(1, end), s.slice(end + 1).trim()];
  }
  const m = s.match(/^([^\s{}(),:]+)/);
  if (!m) return ['', s];
  return [m[1], s.slice(m[1].length).trim()];
}

function parseEdgeLine(text) {
  const f = findArrow(text);
  if (!f) return null;
  let arrow = f.arrow;
  let left = text.slice(0, f.idx).trim();
  let right = text.slice(f.idx + arrow.length).trim();
  let lm = '', rm = '', m;

  if ((m = left.match(/"([^"]*)"\s*$/))) { lm = m[1]; left = left.slice(0, m.index).trim(); }
  if ((m = right.match(/^"([^"]*)"\s*(.*)$/))) { rm = m[1]; right = m[2].trim(); }

  let label = '';
  const ci = right.indexOf(':');
  if (ci !== -1) { label = right.slice(ci + 1).trim(); right = right.slice(0, ci).trim(); }

  if (ARROW_NORMALIZE[arrow]) {
    arrow = ARROW_NORMALIZE[arrow];
    [left, right] = [right, left];
    [lm, rm] = [rm, lm];
  }
  left = left.replace(/\s+/g, ' ').trim();
  right = right.replace(/\s+/g, ' ').trim();
  if (!left || !right) return null;

  // E-R 图多重性标记：从箭头模式中提取 || }o o{ |{ 等标记
  const ER_ARROW_MULT = {
    '||--o{':{lm:'||',rm:'o{'},'||--||':{lm:'||',rm:'||'},'||--|{':{lm:'||',rm:'|{'},
    '}o--||':{lm:'}o',rm:'||'},'}o--|{':{lm:'}o',rm:'|{'},'}o--o{':{lm:'}o',rm:'o{'},
    '--o{':{rm:'o{'},'--||':{rm:'||'},'--|{':{rm:'|{'},'||--':{lm:'||'},'}o--':{lm:'}o'},
    // 反方向（已通过 ARROW_NORMALIZE 翻转，这里为兜底保留）
    'o{--||':{lm:'o{',rm:'||'},'o{--|{':{lm:'o{',rm:'|{'},'o{--o{':{lm:'o{',rm:'o{'},
    '|{--||':{lm:'|{',rm:'||'},'|{--|{':{lm:'|{',rm:'|{'},'|{--o{':{lm:'|{',rm:'o{'},
    '||--}o':{lm:'||',rm:'}o'},'|{--}o':{lm:'|{',rm:'}o'},'o{--}o':{lm:'o{',rm:'}o'},
    'o{--':{lm:'o{'},'|{--':{lm:'|{'},'--}o':{rm:'}o'},
  };
  const erMult = ER_ARROW_MULT[arrow];
  if (erMult) {
    if (erMult.lm && !lm) lm = erMult.lm;
    if (erMult.rm && !rm) rm = erMult.rm;
  }

  return { from: left, to: right, arrow, lm, rm, label, spec: ARROW_SPEC[arrow] || ARROW_SPEC['--'] };
}

/* -------- 类图 / ER / 状态 / 组件 / 部署 / 对象 / 包 / 用例 -------- */

const DECL_RE = /^(abstract\s+class|class|interface|enum|struct|annotation|trait|entity|component|node|artifact|object|package|state|actor|usecase|database|table|boundary|notice)\b(.*)$/i;

function parseClassLike(lines, type) {
  const nodes = new Map();
  const edges = [];
  let pseudoCount = 0;
  let boundary = null;

  const resolveRef = (name) => {
    if (name === '[*]') {
      const id = `__pseudo_${++pseudoCount}`;
      if (!nodes.has(id)) nodes.set(id, { id, label: '[*]', kind: 'pseudo', members: [] });
      return id;
    }
    return name;
  };
  const ensure = (name, kind = 'class') => {
    if (!nodes.has(name)) nodes.set(name, { id: name, label: name, kind, members: [] });
    return nodes.get(name);
  };

  let i = 0;
  while (i < lines.length) {
    const { text, no } = lines[i];
    if (text === '}') { i++; continue; }

    // boundary 关键字（用例图系统边界）
    const bm = text.match(/^boundary\s+"([^"]+)"\s*(?::\s*(solid|dashed))?\s*$/i);
    if (bm) {
      boundary = { label: bm[1], lineStyle: bm[2] ? bm[2].toLowerCase() : 'dashed' };
      i++;
      continue;
    }

    const dm = text.match(DECL_RE);
    if (dm) {
      let kw = dm[1].replace(/\s+/g, '').toLowerCase();
      let rest = dm[2].trim();
      let block = false;
      if (rest.endsWith('{')) { block = true; rest = rest.slice(0, -1).trim(); }

      // 检查 :boundary 后缀（用例图系统边界标记）
      const bmSuffix = rest.match(/:\s*boundary\s*$/i);
      const insideBoundary = !!bmSuffix;
      if (bmSuffix) rest = rest.slice(0, bmSuffix.index).trim();

      const [name] = readToken(rest);
      if (!name) throw new Error(`第 ${no} 行：${dm[1]} 缺少名称`);

      const kind = kw === 'abstractclass' ? 'abstract' : kw;
      const node = ensure(name, kind);
      node.kind = kind;
      node.insideBoundary = insideBoundary;

      if (block) {
        i++;
        while (i < lines.length && lines[i].text !== '}') {
          node.members.push(lines[i].text);
          i++;
        }
        if (i >= lines.length) throw new Error(`第 ${no} 行：缺少匹配的 "}"`);
      }
      i++;
      continue;
    }

    const e = parseEdgeLine(text);
    if (e) {
      let fromId = resolveRef(e.from);
      let toId = resolveRef(e.to);
      // E-R 图：清理左右两侧残留的多重性标记（如 User || -- Post 带空格的情况）
      if (type === 'er') {
        const sf = fromId.match(/^(.+?)\s+(\|\||\|\{|}o|}||o\|)$/);
        if (sf) { fromId = sf[1]; if (!e.lm) e.lm = sf[2]; }
        const st = toId.match(/^(\|\||o\{|\|\{|}\||\|o)\s+(.+)$/);
        if (st) { toId = st[2]; if (!e.rm) e.rm = st[1]; }
      }
      // 检测连线中点引用：A--B 或 A..B 格式，指向已有节点间连线的中点
      const midRefRe = /^([\w\u4e00-\u9fff.\[\]$]+)(--|\.\.)([\w\u4e00-\u9fff.\[\]$]+)$/;
      const toMid = toId.match(midRefRe);
      const fromMid = fromId.match(midRefRe);
      if (toMid) {
        edges.push({
          from: fromId, to: null, label: e.label,
          fromMult: e.lm, toMult: e.rm,
          kind: e.spec.kind, dash: e.spec.dash,
          head: e.spec.head,
          connectToMidpoint: { from: toMid[1], to: toMid[3] }
        });
      } else if (fromMid) {
        edges.push({
          from: null, to: toId, label: e.label,
          fromMult: e.lm, toMult: e.rm,
          kind: e.spec.kind, dash: e.spec.dash,
          head: e.spec.head,
          connectToMidpoint: { from: fromMid[1], to: fromMid[3] }
        });
      } else {
        ensure(fromId); ensure(toId);
        edges.push({
          from: fromId, to: toId, label: e.label,
          fromMult: e.lm, toMult: e.rm,
          kind: e.spec.kind, dash: e.spec.dash,
          head: e.spec.head, tailDiamond: e.spec.tailDiamond || null
        });
      }
      i++;
      continue;
    }

    const [nm] = readToken(text);
    if (nm && /^[\w\u4e00-\u9fff.\-*[\]$]+$/.test(nm)) ensure(nm);
    i++;
  }

  return { nodes: [...nodes.values()], edges, boundary };
}

/* ---------------- 活动图 ---------------- */

function parseActivity(lines) {
  const nodes = [];
  const edges = [];
  let activityEdge = null;
  const swimlanes = [];
  let currentLane = null; // 当前泳道（元素归入泳道的游标）
  let counter = 0;
  const nid = (p) => `${p}_${++counter}`;
  let prev = [];
  let pendingLabel = null;
  const stack = [];

  const link = (froms, to, label) => {
    for (const f of froms) {
      if (f === to) continue;
      edges.push({ from: f, to, label: label || '', head: 'triangle' });
    }
  };

  for (const { text: rawText, no } of lines) {
    let m;
    let text = rawText;
    const lbl = pendingLabel; pendingLabel = null;

    // 泳道归属：行尾  in "泳道名"  把该元素归入对应泳道；缺省沿用当前泳道
    let lane = currentLane;
    const inM = text.match(/\s+in\s+"([^"]*)"\s*$/);
    if (inM) {
      lane = inM[1];
      text = text.slice(0, inM.index).replace(/\s+$/, '');
    }
    currentLane = lane;

    // 活动边（实线方框，替代用例图 boundary：关键字 boundary，固定实线）
    const cbm = text.match(/^boundary\s+"([^"]+)"\s*$/i);
    if (cbm) {
      activityEdge = { label: cbm[1] };
      continue;
    }

    // 泳道：默认水平(:h)，可用 :h / :v / :horizontal / :vertical 指定开口方向
    const swm = text.match(/^swimlane\s+"([^"]+)"(?:\s*[:：]?\s*(h|horizontal|v|vertical|null|none))?\s*$/i);
    if (swm) {
      const dir = (swm[2] || 'h')[0].toLowerCase();
      swimlanes.push({ label: swm[1], dir: dir === 'v' ? 'v' : 'h' });
      continue;
    }

    if (text === 'start') {
      const id = nid('start');
      nodes.push({ id, kind: 'start', label: '', lane });
      link(prev, id, lbl); prev = [id];

    } else if (text === 'stop' || text === 'end' || text === 'end.') {
      const id = nid('stop');
      nodes.push({ id, kind: 'stop', label: '', lane });
      link(prev, id, lbl); prev = [id];

    } else if ((m = text.match(/^:(.*?);?\s*$/))) {
      const id = nid('act');
      nodes.push({ id, kind: 'action', label: m[1].trim(), lane });
      link(prev, id, lbl); prev = [id];

    } else if ((m = text.match(/^if\s*[（(]?(.*?)[)）]?\s*$/))) {
      const id = nid('dec');
      nodes.push({ id, kind: 'decision', label: m[1].trim(), lane });
      link(prev, id, lbl);
      stack.push({ type: 'if', dec: id, thenEnds: null });
      prev = [id]; pendingLabel = '是';

    } else if (text === 'else' || /^else\b/.test(text)) {
      const top = stack[stack.length - 1];
      if (!top || top.type !== 'if') throw new Error(`第 ${no} 行：else 没有匹配的 if`);
      top.thenEnds = prev;
      prev = [top.dec]; pendingLabel = '否';

    } else if (text === 'endif') {
      const top = stack.pop();
      if (!top || top.type !== 'if') throw new Error(`第 ${no} 行：endif 没有匹配的 if`);
      const elseEnds = prev;
      prev = top.thenEnds === null
        ? [...new Set([...elseEnds, top.dec])]
        : [...new Set([...top.thenEnds, ...elseEnds])];

    } else if ((m = text.match(/^while\s*[（(]?(.*?)[)）]?\s*$/))) {
      const id = nid('dec');
      nodes.push({ id, kind: 'decision', label: m[1].trim(), isLoop: true, lane });
      link(prev, id, lbl);
      stack.push({ type: 'while', dec: id });
      prev = [id]; pendingLabel = '是';

    } else if (text === 'endwhile') {
      const top = stack.pop();
      if (!top || top.type !== 'while') throw new Error(`第 ${no} 行：endwhile 没有匹配的 while`);
      link(prev, top.dec);
      prev = [top.dec]; pendingLabel = '否';

    } else if ((m = text.match(/^note\s*[:：]?\s*(.*)$/))) {
      const id = nid('note');
      nodes.push({ id, kind: 'note', label: m[1].trim(), lane });
      link(prev, id, lbl); prev = [id];

    } else {
      const id = nid('act');
      nodes.push({ id, kind: 'action', label: text, lane });
      link(prev, id, lbl); prev = [id];
    }
  }

  if (!nodes.length) throw new Error('活动图为空');
  return { nodes, edges, activityEdge, swimlanes };
}

/* ---------------- 时序图 ---------------- */

// 时序图消息箭头算子（按长度降序，先匹配长算子）
const SEQ_OPS = [
  { op: '->>', kind: 'sync',   dash: false, fill: true  }, // 同步消息：实线实心箭头
  { op: '->*', kind: 'create', dash: false, fill: true  }, // 创建消息：实线实心 + <<create>>
  { op: '->o', kind: 'async',  dash: false, fill: false }, // 异步消息：实线开放箭头
  { op: '-->', kind: 'return', dash: true,  fill: false }, // 返回消息：虚线开放箭头
  { op: '->',  kind: 'simple', dash: false, fill: false }, // 简单消息：实线开放箭头
];
const SEQ_PART_KINDS = ['actor', 'object', 'control', 'entity', 'boundary'];

function parseSequence(lines) {
  const participants = [];
  const pmap = new Map();
  const messages = [];
  const activations = [];
  const fragmentStack = [];
  const fragments = [];
  const pendingAct = new Map();
  const actOffsets = new Map();

  // 参与者：声明用立体类型；消息里引用时自动以 defaultKinds 补全
  const ensurePart = (name, kind) => {
    kind = kind || 'object';
    if (!pmap.has(name)) {
      const p = { id: 'p' + participants.length, ref: name, label: name, kind };
      pmap.set(name, p);
      participants.push(p);
    } else if (kind !== 'object' && pmap.get(name).kind === 'object') {
      pmap.get(name).kind = kind; // 若随后显式声明了立体类型，升级之
    }
    return pmap.get(name);
  };

  let row = 0;
  const nextRow = () => row++;

  for (const { text } of lines) {
    let m;
    // 1. 参与者声明（角色 / 对象 / 控制类 / 实体类 / 边界类）
    if ((m = text.match(/^(actor|object|control|entity|boundary|participant)\s+(.+)$/i))) {
      const kind = m[1].toLowerCase() === 'participant' ? 'object' : m[1].toLowerCase();
      let rest = m[2].trim();
      const am = rest.match(/^(.+?)\s+as\s+(\S+)$/i);
      let ref, label;
      if (am) { label = readToken(am[1])[0]; ref = am[2].trim(); }
      else { const t = readToken(rest); label = t[0]; ref = t[0]; }
      if (!ref) continue;
      const p = ensurePart(ref, kind);
      p.label = label;
      continue;
    }

    // 2. 组合片段开关
    if ((m = text.match(/^(alt|opt|loop|par|break|critical|ref)(?:\s+(.*))?$/i)) && (SEQ_PART_KINDS.indexOf(m[1].toLowerCase()) < 0)) {
      const op = m[1].toLowerCase();
      // ref 为引用片段，不嵌套（直接作为独立元素）
      const fid = 'f' + fragments.length;
      const fr = { id: fid, op, label: (m[2] || '').trim(), startRow: nextRow(), endRow: 0, seps: [] };
      fragments.push(fr);
      fragmentStack.push(fr);
      continue;
    }
    if (/^else(?:\s|$)/i.test(text)) {
      const cur = fragmentStack[fragmentStack.length - 1];
      const r = nextRow();
      if (cur) cur.seps.push({ row: r, label: text.replace(/^else\s*/i, '').trim() });
      continue;
    }
    if (/^end$/i.test(text)) {
      const cur = fragmentStack.pop();
      const r = nextRow();
      if (cur) cur.endRow = r;
      continue;
    }

    // 3. 激活 / 去激活（off 取当前嵌套深度，保证顺序多段激活都落在生命线 x 处）
    if ((m = text.match(/^activate\s+(.+)$/i))) {
      const ref = readToken(m[1].trim())[0];
      if (!ref) continue;
      const p = ensurePart(ref, 'object');
      const depth = actOffsets.get(p.ref) || 0;
      actOffsets.set(p.ref, depth + 1);
      const r = nextRow();
      const act = { id: 'a' + activations.length, part: p.ref, startRow: r, endRow: -1, off: depth };
      activations.push(act);
      pendingAct.set(p.ref, act);
      continue;
    }
    if ((m = text.match(/^deactivate\s+(.+)$/i))) {
      const ref = readToken(m[1].trim())[0];
      const r = nextRow();
      if (ref) {
        const pa = pendingAct.get(ref);
        if (pa) {
          pa.endRow = r; pendingAct.delete(ref);
          const d = actOffsets.get(ref) || 0;
          actOffsets.set(ref, Math.max(0, d - 1));
        }
        else activations.push({ id: 'a' + activations.length, part: ref, startRow: r, endRow: r + 1, off: 0 });
      }
      continue;
    }

    // 4. 消息：<发送方> <算子> <接收方> [: 文本]
    const ci = text.indexOf(':');
    const pre = (ci !== -1 ? text.slice(0, ci) : text).match(/^(.+?)\s*(->>|->\*|->o|-->|->)\s*(.+?)\s*$/);
    if (!pre) continue;
    const fromName = pre[1].trim(), toName = pre[3].trim();
    const opSpec = SEQ_OPS.find(o => o.op === pre[2]) || SEQ_OPS[SEQ_OPS.length - 1];
    const label = ci !== -1 ? text.slice(ci + 1).trim() : '';
    const fp = ensurePart(fromName, 'object');
    const tp = ensurePart(toName, 'object');
    const isSelf = fp === tp;
    const isCreate = opSpec.kind === 'create';
    const r = nextRow();
    messages.push({
      id: 'm' + messages.length, from: fp.ref, to: tp.ref, label,
      op: opSpec.kind, dash: opSpec.dash, fill: opSpec.fill,
      self: isSelf, create: isCreate, row: r
    });
  }

  // 未闭合的激活/片段收到末尾
  const lastRow = Math.max(row - 1, 0);
  for (const [, act] of pendingAct) act.endRow = lastRow;
  for (const fr of fragmentStack) fr.endRow = lastRow;

  return { nodes: [], edges: [], participants, messages, activations, fragments };
}

/* ---------------- 顶层解析 ---------------- */

function parseDSL(src) {
  const raw = String(src).split(/\r?\n/);
  const lines = [];
  raw.forEach((l, idx) => {
    const t = l.trim();
    if (!t || t.startsWith('//') || t.startsWith('#')) return;
    lines.push({ text: t, no: idx + 1 });
  });
  if (!lines.length) throw new Error('文档为空，请先写入 @diagram ...');

  const hm = lines[0].text.match(/^@diagram\s+([^\s{]+)\s*(?:"([^"]*)")?\s*$/);
  if (!hm) throw new Error(`第 ${lines[0].no} 行：缺少图类型声明，格式应为 @diagram <类型> "标题"`);

  const key = hm[1].toLowerCase();
  const type = DIAGRAM_ALIASES[key] || DIAGRAM_ALIASES[hm[1]];
  if (!type) throw new Error(`第 ${lines[0].no} 行：未知的图类型 "${hm[1]}"`);

  const title = hm[2] || '';
  const body = lines.slice(1);

  // 剥离末尾的 @layout 位置定义块（不影响主体解析）
  const layout = [];
  const elementBody = [];
  let inLayout = false;
  for (const ln of body) {
    if (/^@layout\b/i.test(ln.text)) { inLayout = true; continue; }
    if (inLayout) layout.push(ln); else elementBody.push(ln);
  }

  let model;
  if (type === 'activity') model = parseActivity(elementBody);
  else if (type === 'sequence') model = parseSequence(elementBody);
  else model = parseClassLike(elementBody, type);

  model.type = type;
  model.title = title;
  model.layout = parseLayoutBlock(layout, type);
  return model;
}

/* 解析 @layout 位置定义块 → { kind, name?, x, y, w?, h? }
   格式：<元素引用> @ (x, y) [w h]
   - 普通元素（类/对象/用例等）：@ (cx, cy) 为元素中心点
   - boundary：@ (x, y) 为左上角，作用于系统边界框 / 活动边
   - lane 泳道名：@ (x, y) 为左上角，作用于泳道
   非法/无法识别的行被宽容忽略（不影响图主体）。 */
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