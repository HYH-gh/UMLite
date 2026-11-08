/* ==========================================================================
 *  页面级冒烟测试：在假 DOM 里按 index.html 的顺序加载全部脚本
 *
 *  目的不是替代浏览器，而是把「页面能启动、能渲染、增量逻辑生效」变成一条命令：
 *    node tests/page.mjs   （或由 tests/run.mjs 一并执行）
 *
 *  覆盖：
 *    ① 首屏渲染：main.js 自动载入示例 → currentModel 就绪、SVG 树里有节点
 *    ② 增量渲染：只改注释 → 结构签名不变 → 复用模型、跳过重排（画布不跳）
 *    ③ 结构变化：改类名 → 重新布局、状态栏回到「渲染成功」
 *    ④ 全部内置示例都能渲染且不抛错
 * ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

/* 与 index.html 完全一致的加载顺序 */
const PAGE_SCRIPTS = [
  'js/util.js',
  'js/layoutcode.js',
  'js/parser.js',
  'js/layout.js',
  'js/pipeline.js',
  'js/render.js',
  'js/view.js',
  'js/undo.js',
  'js/export.js',
  'js/ui.js',
  'js/samples.js',
  'js/files.js',
  'js/history.js',
  'js/changelog.js',
  'js/notice.js',
  'js/main.js'
];

/* ---------------- 极简 DOM ---------------- */

function makeFakeDom() {
  const ids = new Map();
  const ctx2d = { font: '', measureText: (s) => ({ width: String(s).length * 7 }) };

  const classList = (node) => ({
    add: (c) => { node._cls.add(c); },
    remove: (c) => { node._cls.delete(c); },
    contains: (c) => node._cls.has(c),
    // 与真实 classList.toggle 一致：支持第二个 force 参数（产品代码用到了 toggle(cls, force)）
    toggle: (c, force) => {
      const want = force === undefined ? !node._cls.has(c) : !!force;
      if (want) node._cls.add(c); else node._cls.delete(c);
      return want;
    }
  });

  function FakeNode(tag) {
    return {
      tagName: tag,
      attrs: {},
      children: [],
      style: {},
      value: '',
      title: '',
      disabled: false,
      dataset: {},
      _cls: new Set(),
      _ls: [],
      _text: '',
      get classList() { return classList(this); },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
      appendChild(c) { this.children.push(c); return c; },
      removeChild(c) { this.children = this.children.filter(x => x !== c); return c; },
      addEventListener(type, fn) { this._ls.push([type, fn]); },
      removeEventListener() {},
      // 测试用：触发本节点上注册的监听器
      fire(type, evt) {
        const e = Object.assign({ type, button: 0, preventDefault() {}, stopPropagation() {} }, evt || {});
        for (const [t, fn] of this._ls) if (t === type) fn(e);
      },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 900, height: 620 }; },
      get clientWidth() { return 900; },
      get clientHeight() { return 620; },
      set innerHTML(v) { if (!v) this.children = []; this._text = v; },
      get innerHTML() { return this._text; },
      set textContent(v) { this._text = String(v); },
      get textContent() { return this._text; }
    };
  }

  const docListeners = [];

  const document = {
    body: FakeNode('body'),
    documentElement: FakeNode('html'),
    getElementById(id) {
      if (!ids.has(id)) {
        const n = FakeNode(id === 'editor' ? 'textarea' : id === 'samples' ? 'select' : 'div');
        n.id = id;
        ids.set(id, n);
      }
      return ids.get(id);
    },
    createElement(tag) {
      if (tag === 'canvas') return { getContext: () => ctx2d, style: {} };
      return FakeNode(tag);
    },
    createElementNS(ns, tag) { return FakeNode(tag); },
    createTextNode(text) { return { nodeType: 3, textContent: String(text), children: [] }; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener(type, fn) { docListeners.push([type, fn]); },
    removeEventListener() {},
    fire(type, evt) {
      const e = Object.assign({ type, button: 0, preventDefault() {}, stopPropagation() {} }, evt || {});
      for (const [t, fn] of docListeners) if (t === type) fn(e);
    },
    execCommand() { return true; }
  };

  const store = new Map();
  const sandbox = {
    console,
    document,
    navigator: { clipboard: { writeText: async () => {} } },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); }
    },
    // 定时器打桩：不让去抖/历史写入在测试过程中异步触发
    setTimeout: () => 1,
    clearTimeout: () => {},
    requestAnimationFrame: (cb) => { cb(); return 1; },
    cancelAnimationFrame: () => {},
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
    Blob: function Blob() {},
    Image: function Image() {},
    getComputedStyle: () => ({ getPropertyValue: () => '44%' }),
    XMLSerializer: function XMLSerializer() { this.serializeToString = () => ''; },
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  return { ctx: vm.createContext(sandbox), dom: { document, ids }, sandbox };
}

/* ---------------- 断言 ---------------- */

function makeChecks() {
  const results = [];
  const t = {
    ok(cond, msg) { if (!cond) throw new Error(msg || '断言失败'); }
  };
  return { results, t };
}

const SVG_TEXT = /NaN|Infinity|undefined/;

/* 统计 SVG 树里的节点数 / data-node-id 数 / 非法属性 */
function scanSvg(root) {
  let els = 0, tagged = 0;
  const bad = [];
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    els++;
    if (n.attrs) {
      if (n.attrs['data-node-id'] !== undefined || n.attrs['data-seqkind'] !== undefined) tagged++;
      for (const k of Object.keys(n.attrs)) {
        if (SVG_TEXT.test(n.attrs[k])) bad.push(k + '=' + n.attrs[k]);
      }
    }
    for (const c of n.children || []) walk(c);
  })(root);
  return { els, tagged, bad };
}

/* 按 class 分词计数：countClass(root, 'er-bar') → 该类的元素个数 */
function countClass(root, token) {
  let n = 0;
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    const cls = node.attrs && node.attrs.class;
    if (cls && String(cls).split(/\s+/).indexOf(token) >= 0) n++;
    for (const c of node.children || []) walk(c);
  })(root);
  return n;
}

export function runPageSmoke() {
  const results = [];
  const run = (name, fn) => {
    try { fn(); results.push({ name, ok: true, fails: [] }); }
    catch (e) { results.push({ name, ok: false, fails: [String((e && e.message) || e)] }); }
  };

  const { ctx, dom, sandbox } = makeFakeDom();
  try {
    for (const rel of PAGE_SCRIPTS) {
      vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
    }
  } catch (e) {
    results.push({ name: '页面脚本加载', ok: false, fails: ['加载失败：' + e.message] });
    return results;
  }
  results.push({ name: '页面脚本加载', ok: true, fails: [] });

  const status = () => dom.document.getElementById('status').textContent;
  const editor = () => dom.document.getElementById('editor');
  // 顶层 let/const 不会挂到全局对象上（浏览器和 vm 都是这样），只能回上下文里取
  const g = (expr) => vm.runInContext('(' + expr + ')', ctx);
  const model = () => g('currentModel');
  const samples = () => g('SAMPLES');
  const call = (fn, ...args) => g(fn)(...args);

  const firstSvg = () => {
    const preview = dom.document.getElementById('preview');
    return preview.children[0] || null;
  };

  run('启动即渲染：模型与 SVG 树就绪', () => {
    const m = model();
    if (!m) throw new Error('currentModel 为空');
    if (m.type !== 'class') throw new Error('首屏应载入类图示例，实际 ' + m.type);
    const svg = firstSvg();
    if (!svg) throw new Error('preview 中没有 svg');
    const s = scanSvg(svg);
    if (s.els < 20) throw new Error('SVG 元素过少：' + s.els);
    if (s.tagged < 5) throw new Error('未找到 data-node-id 命中框：' + s.tagged);
    if (s.bad.length) throw new Error('SVG 属性含非法值：' + s.bad.slice(0, 3).join(', '));
    if (!/渲染成功/.test(status())) throw new Error('状态栏不是渲染成功：' + status());
  });

  run('增量渲染：只加注释不重排、不换模型', () => {
    const before = model();
    const posBefore = before.nodes.map(n => [n.id, n.x, n.y]);
    editor().value = editor().value + '\n// 只加一行注释\n';
    call('render');
    if (model() !== before) throw new Error('结构未变却重建了模型');
    const posAfter = model().nodes.map(n => [n.id, n.x, n.y]);
    if (JSON.stringify(posBefore) !== JSON.stringify(posAfter)) throw new Error('节点位置被重置');
    if (!/跳过重排/.test(status())) throw new Error('状态栏未提示跳过重排：' + status());
  });

  run('结构变化：改类名会重新布局', () => {
    const before = model();
    const id = before.nodes[0].id;
    const re = new RegExp('class\\s+' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    if (!re.test(editor().value)) throw new Error('示例里没找到 class ' + id);
    editor().value = editor().value.replace(re, 'class ' + id + 'Renamed');
    call('render');
    if (model() === before) throw new Error('结构变了却复用了旧模型');
    if (!model().nodes.some(n => n.id === id + 'Renamed')) throw new Error('新类名未进入模型');
    if (!/渲染成功/.test(status())) throw new Error('状态栏未提示渲染成功：' + status());
  });

  run('拖动结果在打字后保留（不再被重排冲掉）', () => {
    const m = model();
    const n = m.nodes[0];
    const x0 = n.x, y0 = n.y;
    n.x += 40; n.y += 25;          // 模拟一次拖拽
    call('paint');                  // 拖拽只会重绘
    editor().value = editor().value + '\n# 又一个注释\n';
    call('render');
    if (n.x !== x0 + 40 || n.y !== y0 + 25) throw new Error('拖动坐标被重排冲掉了');
  });

  run('10 个内置示例全部可渲染', () => {
    const lib = samples();
    const names = Object.keys(lib);
    if (names.length < 10) throw new Error('示例数量异常：' + names.length);
    for (const name of names) {
      editor().value = lib[name];
      call('render', { force: true });
      if (!model()) throw new Error(name + '：未生成模型');
      if (!/渲染成功/.test(status())) throw new Error(name + '：' + status());
      const svg = firstSvg();
      if (!svg) throw new Error(name + '：没有 svg');
      const s = scanSvg(svg);
      if (s.els < 5) throw new Error(name + '：SVG 元素过少（' + s.els + '）');
      if (s.bad.length) throw new Error(name + '：SVG 属性含非法值 ' + s.bad.slice(0, 3).join(', '));
    }
  });

  run('ER 关系：基数画成鸦爪符号，不再重复标文字', () => {
    editor().value = '@diagram er\nentity A\nentity B\nentity C\nA ||--|| B : 一对一\nB ||--o{ C : 一对多';
    call('render', { force: true });
    const svg = firstSvg();
    if (!svg) throw new Error('没有 svg');
    // 一对一：两端各两条竖线 → 4 条 er-bar，无爪线、无圆圈
    // 一对多可选：A 端 2 条竖线 + B 端 1 圆圈 + 1 爪线
    const bars = countClass(svg, 'er-bar');
    const feet = countClass(svg, 'er-foot');
    const dots = countClass(svg, 'er-circle');
    if (bars !== 6) throw new Error('er-bar 应为 6 条，实际 ' + bars);   // 4 + 2
    if (feet !== 1) throw new Error('er-foot 应为 1 条，实际 ' + feet);
    if (dots !== 1) throw new Error('er-circle 应为 1 个，实际 ' + dots);
    if (countClass(svg, 'mult-text') !== 0) throw new Error('已画符号却还留着文字基数');
  });

  run('ER 关系：自引用也标注基数', () => {
    editor().value = '@diagram er\nentity 员工\n员工 ||--o{ 员工 : 管理';
    call('render', { force: true });
    const svg = firstSvg();
    if (countClass(svg, 'er-bar') !== 2) throw new Error('自引用应有 2 条竖线');
    if (countClass(svg, 'er-foot') !== 1) throw new Error('自引用应有 1 条爪线');
    if (countClass(svg, 'er-circle') !== 1) throw new Error('自引用应有 1 个圆圈');
  });

  run('类图多重度仍用文字（不被 ER 鸦爪接管）', () => {
    editor().value = '@diagram class\nclass A\nclass B\nA "1" --> "*" B';
    call('render', { force: true });
    const svg = firstSvg();
    if (countClass(svg, 'mult-text') !== 2) throw new Error('类图多重度文字应保留 2 处');
    if (countClass(svg, 'er-bar') + countClass(svg, 'er-foot')) throw new Error('类图不该出现鸦爪符号');
  });

  run('反写代码：位置块可写入源码', () => {
    const lib = samples();
    editor().value = lib[Object.keys(lib)[0]];
    call('render', { force: true });
    const block = call('serializeLayoutBlock', model());
    if (!block || block.split('\n')[0] !== '@layout') throw new Error('未生成 @layout 块');
    const out = call('withPositionBlock', editor().value, model());
    if (out.indexOf('@layout') < 0) throw new Error('withPositionBlock 未写入位置块');
    editor().value = out;
    call('render');   // 必须能重新解析自己写出的位置块
    if (!/渲染成功|跳过重排/.test(status())) throw new Error('写回后渲染失败：' + status());
  });

  run('撤销/重做：一次拖拽 = 一步（走真实 pointerdown/pointerup 链路）', () => {
    call('resetUndo');
    const preview = dom.document.getElementById('preview');
    const x0 = model().nodes[0].x;
    preview.fire('pointerdown', { button: 0 });   // 捕获阶段拍快照
    model().nodes[0].x += 37;                     // 拖动
    call('paint');
    dom.document.fire('pointerup');
    if (g('undoStack.length') !== 1) throw new Error('一次拖拽应入栈 1 步，实际 ' + g('undoStack.length'));

    call('undo');
    if (model().nodes[0].x !== x0) throw new Error('撤销未还原坐标');
    if (g('redoStack.length') !== 1) throw new Error('撤销后应可重做');

    call('redo');
    if (model().nodes[0].x !== x0 + 37) throw new Error('重做未恢复坐标');
    if (g('undoStack.length') !== 1) throw new Error('重做后撤销栈应恢复');
  });

  run('撤销/重做：平移、点选这类空手势不占步数', () => {
    call('resetUndo');
    const preview = dom.document.getElementById('preview');
    preview.fire('pointerdown', { button: 0 });
    dom.document.fire('pointerup');                // 模型没有任何变化
    if (g('undoStack.length') !== 0) throw new Error('空手势不应入栈');
  });

  run('撤销/重做：重新布局后清空栈', () => {
    editor().value = '@diagram class\nclass A\nclass B\nA --> B';
    call('render', { force: true });
    call('resetUndo');
    const before = call('undoSnapshot');
    model().nodes[0].x += 12;
    call('commitUndo', before);
    if (g('undoStack.length') !== 1) throw new Error('入栈失败');
    editor().value = editor().value + '\nclass C';
    call('render');                                 // 结构变化 → 全量重排
    if (g('undoStack.length') !== 0) throw new Error('重新布局后撤销栈应为空');
    if (g('redoStack.length') !== 0) throw new Error('重做栈也应为空');
  });

  run('撤销/重做：按钮禁用状态跟随栈', () => {
    call('resetUndo');
    const btn = dom.document.getElementById('btn-undo');
    if (!btn.disabled) throw new Error('空栈时撤销按钮应禁用');
    const before = call('undoSnapshot');
    model().nodes[0].x += 5;
    call('commitUndo', before);
    if (btn.disabled) throw new Error('有可撤销步骤时按钮应可用');
    call('undo');
    if (!btn.disabled) throw new Error('撤销后按钮应重新禁用');
  });

  /* ---------------- 响应式 / 触屏手势 ---------------- */

  const baseToClient = (b) => {
    const v = g('view');
    return { x: b.x * v.zoom + v.panX, y: b.y * v.zoom + v.panY };
  };

  run('缩放：锚点下方的图形保持不动（滚轮与双指共用同一份数学）', () => {
    call('fitView');
    const z0 = g('view').zoom;
    const before = call('clientToBase', 400, 300);
    call('zoomAtClient', 400, 300, 1.7);
    const after = call('clientToBase', 400, 300);
    if (Math.abs(before.x - after.x) > 0.5 || Math.abs(before.y - after.y) > 0.5) {
      throw new Error(`锚点漂移 dx=${(after.x - before.x).toFixed(2)} dy=${(after.y - before.y).toFixed(2)}`);
    }
    call('zoomAtClient', 400, 300, 1 / 1.7);
    if (Math.abs(g('view').zoom - z0) > 1e-6) throw new Error('缩放不可逆');
  });

  run('双指捏合：放大且跟随两指中点', () => {
    call('fitView');
    const z0 = g('view').zoom;
    const preview = dom.document.getElementById('preview');
    // 两指张开（左指不动，右指右移 100px，中点从 450 移到 500）
    preview.fire('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: 380, clientY: 300 });
    preview.fire('pointerdown', { pointerType: 'touch', pointerId: 2, clientX: 520, clientY: 300 });
    const world0 = call('clientToBase', 450, 300);
    dom.document.fire('pointermove', { pointerType: 'touch', pointerId: 2, clientX: 620, clientY: 300 });

    const z1 = g('view').zoom;
    if (!(z1 > z0 * 1.5)) throw new Error(`双指张开应放大，zoom ${z0.toFixed(3)} → ${z1.toFixed(3)}`);
    // 起始中点下的世界坐标，现在应落在两指新的中点下方
    const world1 = call('clientToBase', 500, 300);
    if (Math.abs(world1.x - world0.x) > 0.5 || Math.abs(world1.y - world0.y) > 0.5) {
      throw new Error('捏合时没有跟随两指中点');
    }
    dom.document.fire('pointerup', { pointerType: 'touch', pointerId: 1, clientX: 380, clientY: 300 });
    dom.document.fire('pointerup', { pointerType: 'touch', pointerId: 2, clientX: 620, clientY: 300 });
    if (g('touchPointers.size') !== 0) throw new Error('抬手后指针表未清空');
    if (g('pinchState') !== null) throw new Error('抬手后缩放状态未清空');
    call('fitView');
  });

  run('双指落下时放弃单指拖拽', () => {
    vm.runInContext('dragState = { node: currentModel.nodes[0], offsetX: 0, offsetY: 0, moved: false };', ctx);
    const preview = dom.document.getElementById('preview');
    preview.fire('pointerdown', { pointerType: 'touch', pointerId: 7, clientX: 300, clientY: 300 });
    preview.fire('pointerdown', { pointerType: 'touch', pointerId: 8, clientX: 360, clientY: 300 });
    if (g('dragState') !== null) throw new Error('第二根手指落下后仍在拖拽元素');
    dom.document.fire('pointerup', { pointerType: 'touch', pointerId: 7, clientX: 300, clientY: 300 });
    dom.document.fire('pointerup', { pointerType: 'touch', pointerId: 8, clientX: 360, clientY: 300 });
    vm.runInContext('lastTap = null;', ctx);
    call('fitView');
  });

  run('触屏双击：连线附近插入折点', () => {
    editor().value = '@diagram class\nclass A\nclass B\nA --> B';
    call('render', { force: true });
    call('resetUndo');
    vm.runInContext('lastTap = null;', ctx);
    if (g('currentModel').edges[0].bends) throw new Error('前提：这条边本来没有折点');

    // 沿着边扫一遍，找到一个真实落在连线上的点
    const eps = 8 / Math.max(g('view').zoom, 0.0001);
    let client = null;
    for (let y = 20; y < 600 && !client; y += 4) {
      for (let x = 20; x < 880; x += 4) {
        if (call('closestOnEdge', g('currentModel'), { x, y }, eps)) { client = baseToClient({ x, y }); break; }
      }
    }
    if (!client) throw new Error('没找到连线上的点');

    dom.document.fire('pointerup', { pointerType: 'touch', pointerId: 11, clientX: client.x, clientY: client.y });
    dom.document.fire('pointerup', { pointerType: 'touch', pointerId: 11, clientX: client.x, clientY: client.y });
    const bends = g('currentModel').edges[0].bends;
    if (!bends || bends.length !== 1) throw new Error('双击没有插入折点：' + JSON.stringify(bends));
    if (g('undoStack.length') !== 1) throw new Error('插入折点应可以撤销');
    call('undo');
    if (g('currentModel').edges[0].bends) throw new Error('撤销后折点应消失');
  });

  run('折线开关：默认关，开启按当前位置生成 bend', () => {
    // 斜放的三个 class：连线明显是斜线
    editor().value = '@diagram class\nclass A\nclass B\nclass C\nA --> B\nB --> C\nA --> C';
    call('render', { force: true });
    // 默认关：没有自动折点
    if (g('currentModel').edges.some(e => e.bends && e.bends.length)) {
      throw new Error('折线默认关闭，不应有自动折点');
    }
    // 开启：斜线被补折点
    call('setOrthoEnabled', true);
    call('render', { force: true });
    if (!g('currentModel').edges.some(e => e.bends && e.bends.length)) {
      throw new Error('折线开启后应给斜线补折点');
    }
    // 有 @layout 位置代码时折点按定位后的坐标生成：把三个元素排成横排，A-->C 应为直线（无折点）
    editor().value = '@diagram class\nclass A\nclass B\nclass C\nA --> B\nB --> C\nA --> C\n@layout\nA @ (40, 300) 120 80\nB @ (300, 300) 120 80\nC @ (560, 300) 120 80';
    call('setOrthoEnabled', true);
    call('render', { force: true });
    const ac = g('currentModel').edges.find(e => e.from === 'A' && e.to === 'C');
    if (ac.bends && ac.bends.length) throw new Error('同一水平线上的连线不应有折点：' + JSON.stringify(ac.bends));
    // 关闭：折点清空，恢复直线
    call('setOrthoEnabled', false);
    call('render', { force: true });
    if (g('currentModel').edges.some(e => e.bends && e.bends.length)) {
      throw new Error('折线关闭后不应残留自动折点');
    }
    // 按钮文字随点击切换（假 DOM 不解析 HTML 初始文本，只验证往返切换）
    const btn = dom.document.getElementById('btn-ortho');
    if (!btn) throw new Error('缺少 btn-ortho 按钮');
    btn.fire('click', {});
    if (!/折线：开/.test(btn.textContent)) throw new Error('点击后按钮文字应变为「开」：' + btn.textContent);
    btn.fire('click', {});
    if (!/折线：关/.test(btn.textContent)) throw new Error('再次点击应恢复「关」：' + btn.textContent);
  });

  run('图标题可拖动：改 titleX/titleY 并写进 @layout 的 title 行', () => {
    editor().value = '@diagram class "标题可拖"\nclass A\nclass B\nA --> B';
    call('render', { force: true });
    const m0 = model();
    const x0 = m0.titleX, y0 = m0.titleY;
    // 假 DOM 的 querySelectorAll 不返回元素，这里直接调用标题的 pointerdown 处理器
    let stopped = false;
    call('onNodePointerDown', {
      button: 0, clientX: 0, clientY: 0,
      currentTarget: { getAttribute: (k) => (k === 'data-node-id' ? '__title' : null) },
      preventDefault() {}, stopPropagation() { stopped = true; }
    });
    if (!stopped) throw new Error('标题拖动应阻止事件冒泡（否则会变成画布平移）');
    dom.document.fire('pointermove', { clientX: 60, clientY: 40 });
    if (model().titleX === x0 && model().titleY === y0) throw new Error('拖动后标题坐标未变化');
    dom.document.fire('pointerup');

    // 反写代码：位置块里应带上 title 行，且能被重新解析回来
    const block = call('serializeLayoutBlock', model());
    if (!/^title @ \(/m.test(block)) throw new Error('位置块缺少 title 行：\n' + block);
    const movedX = model().titleX, movedY = model().titleY;
    call('render');   // 源码未变：复用上次模型，拖好的位置不会被冲掉
    if (model().titleX !== movedX || model().titleY !== movedY) {
      throw new Error('未改源码时，拖动后的标题位置应保持');
    }
    call('render', { force: true });   // 强制重排：回到默认居中的位置
    if (model().titleX === movedX && model().titleY === movedY) {
      throw new Error('强制重排后标题应回到默认位置');
    }
  });

  run('图标题位置：@layout 的 title 行生效', () => {
    editor().value = '@diagram class "定位标题"\nclass A\nclass B\nA --> B\n@layout\ntitle @ (420, 90)';
    call('render', { force: true });
    if (model().titleX !== 420 || model().titleY !== 90) {
      throw new Error('title 行未生效：' + model().titleX + ',' + model().titleY);
    }
  });

  run('窄屏标签切换：代码 / 预览 互斥显示', () => {
    call('setMobilePane', 'preview');
    if (dom.document.body.dataset.pane !== 'preview') throw new Error('未切到预览');
    call('setMobilePane', 'code');
    if (dom.document.body.dataset.pane !== 'code') throw new Error('未切回代码');
  });

  /* ---------------- 版本号 / 更新公告 ---------------- */

  const mask = () => dom.document.getElementById('notice-mask');
  const chip = () => dom.document.getElementById('ver-chip');
  const SEEN = 'umlite.seenVersion';

  run('更新公告：首次打开自动弹出并记住版本', () => {
    // 页面脚本加载时已经跑过一次 maybeAnnounce()
    if (!mask().classList.contains('is-open')) throw new Error('首次打开应自动弹出公告');
    if (sandbox.localStorage.getItem(SEEN) !== g('APP_VERSION')) {
      throw new Error('已读版本未写入 localStorage：' + sandbox.localStorage.getItem(SEEN));
    }
    const html = dom.document.getElementById('notice-body').innerHTML;
    if (html.indexOf('v' + g('APP_VERSION')) < 0) throw new Error('弹窗里没有当前版本号');
    if (html.indexOf('历史版本') < 0) throw new Error('弹窗里没有历史版本区');
  });

  run('更新公告：同版本再次访问不自动弹', () => {
    call('closeNotice');
    if (mask().classList.contains('is-open')) throw new Error('关闭后仍是打开状态');
    if (call('maybeAnnounce') !== false) throw new Error('同版本不应再次弹出');
    if (mask().classList.contains('is-open')) throw new Error('同版本却弹出了公告');
  });

  run('更新公告：版本变化后重新弹出一次', () => {
    sandbox.localStorage.setItem(SEEN, '1.0');   // 假装上次看的是很老的版本
    if (call('maybeAnnounce') !== true) throw new Error('新版本应自动弹出');
    if (!mask().classList.contains('is-open')) throw new Error('新版本没有弹出公告');
    if (sandbox.localStorage.getItem(SEEN) !== g('APP_VERSION')) throw new Error('新版本未记为已读');
    call('closeNotice');
    // 点版本号可以随时再打开
    chip().fire('click');
    if (!mask().classList.contains('is-open')) throw new Error('点版本号没有打开公告');
    call('closeNotice');
  });

  /* ---------------- 文件管理 ---------------- */

  const tree = () => dom.document.getElementById('file-tree');
  const rows = () => (tree().children || []).map(rowInfo);
  const rowOf = (id) => rows().find(r => r.id === id) || null;

  run('文件树：首屏把当前图列出来，名字与图标都来自代码', () => {
    const list = rows();
    if (!list.length) throw new Error('文件树是空的');
    const cur = g('fsCurrent');
    const row = rowOf(cur);
    if (!row) throw new Error('当前图不在树里');
    if (row.name !== '电商系统类图') throw new Error('名字没有取自 @diagram 标题：' + row.name);
    if (row.icon !== '#ic-uml-class') throw new Error('类图图标不对：' + row.icon);
    if (row.kind !== 'class') throw new Error('右侧类型标签不对：' + row.kind);
    const folder = list.find(r => r.name === '新建目录');
    if (!folder) throw new Error('首次使用应带一个「新建目录」');
    if (!/^\/新建目录\//.test(call('fsPathOf', cur))) {
      throw new Error('默认的类图应该在那目录里：' + call('fsPathOf', cur));
    }
  });

  run('文件树：10 种图各自有图标，标题逐条解析', () => {
    const want = {
      class: 'ic-uml-class', usecase: 'ic-uml-usecase', activity: 'ic-uml-activity',
      sequence: 'ic-uml-sequence', er: 'ic-uml-er', state: 'ic-uml-state',
      component: 'ic-uml-component', deployment: 'ic-uml-deployment',
      object: 'ic-uml-object', package: 'ic-uml-package'
    };
    const samples = g('SAMPLES');
    const noTitle = [];
    for (const key of Object.keys(samples)) {
      const meta = call('fsMeta', samples[key]);
      if (!meta.type) throw new Error(`示例「${key}」没解析出图类型`);
      if (!meta.title) noTitle.push(key);
      const icon = call('fsIconId', { kind: 'file', src: samples[key] });
      if (icon !== want[meta.type]) throw new Error(`${key} 的图标应为 ${want[meta.type]}，实际 ${icon}`);
    }
    if (noTitle.length) throw new Error('这些示例的标题没解析出来：' + noTitle.join('、'));
  });

  run('文件树：新建图 / 新建目录落在当前目录下', () => {
    const folderNode = call('fsAddNode', 'folder', null);
    if (!folderNode || folderNode.kind !== 'folder') throw new Error('没有建成目录');
    if (g('fsSelId') !== folderNode.id) throw new Error('新建后应选中它');
    const fileNode = call('fsAddNode', 'file', folderNode.id);
    if (call('fsParent', fileNode.id).id !== folderNode.id) throw new Error('新图没有进选中目录');
    if (call('fsDisplayName', fileNode) !== '新建图') throw new Error('空代码的图应叫「新建图」');
    if (call('fsIconId', fileNode) !== 'ic-newfile') throw new Error('空代码的图应用空白文件图标');
    if (rowOf(fileNode.id).name !== '新建图') throw new Error('树里没有显示「新建图」');
  });

  run('文件树：目录可重命名，改名后树同步', () => {
    const folder = call('fsAddNode', 'folder', null);
    call('fsRenameFolder', folder.id, '设计稿');
    if (folder.name !== '设计稿') throw new Error('重命名没生效');
    if (rowOf(folder.id).name !== '设计稿') throw new Error('树里名字没更新');
    call('fsRenameFolder', folder.id, '   ');
    if (folder.name !== '设计稿') throw new Error('空名字应保持原名');
  });

  run('文件树：拖动改变层级，目录不能塞进自己的子孙', () => {
    const outer = call('fsAddNode', 'folder', null);
    const inner = call('fsAddNode', 'folder', outer.id);
    const file = call('fsAddNode', 'file', null);
    if (!call('fsMoveNode', file.id, inner.id, 'into')) throw new Error('文件没能拖进目录');
    if (call('fsParent', file.id).id !== inner.id) throw new Error('拖动后父目录不对');
    if (call('fsMoveNode', outer.id, inner.id, 'into')) throw new Error('目录被拖进了自己的子目录');
    if (call('fsMoveNode', outer.id, file.id, 'before')) throw new Error('目标不是目录时应作为同级插入 —— 该调用应成功');
  });

  run('文件树：图的代码改动会改掉树里的名字', () => {
    const f = call('fsAddNode', 'file', null);
    editor().value = '@diagram sequence "下单时序"\nactor 用户\n用户 -> 系统 : 下单';
    call('render', { force: true });
    if (f.src.indexOf('下单时序') < 0) throw new Error('编辑器内容没有写回文件');
    if (call('fsDisplayName', f) !== '下单时序') throw new Error('名字没跟着代码走');
    if (call('fsIconId', f) !== 'ic-uml-sequence') throw new Error('换类型后图标没跟着变');
  });

  run('文件树：切换文件会先保存上一张图的内容', () => {
    const a = call('fsAddNode', 'file', null);
    editor().value = '@diagram class "第一张"\nclass A';
    call('render', { force: true });
    const b = call('fsAddNode', 'file', null);
    editor().value = '@diagram class "第二张"\nclass B';
    call('render', { force: true });
    call('fsSelect', a.id);
    if (!/第一张/.test(editor().value)) throw new Error('切回来内容丢了');
    if (!/第一张/.test(a.src)) throw new Error('切走时没有把内容存回第一个文件');
  });

  run('项目导出 / 导入：JSON 往返后结构一致', () => {
    const before = call('fsCountFiles', g('fsRoot'));
    const data = call('fsExportProject');
    if (data.type !== 'umlite-project' || !data.root.children.length) throw new Error('导出的项目结构不对');
    const json = JSON.stringify(data);
    call('fsImportProject', json, 'overwrite');
    if (call('fsCountFiles', g('fsRoot')) !== before) throw new Error('覆盖导入后文件数不一致');
    // 再插入一份：文件翻倍，且多出一个同名子目录
    const res = call('fsImportProject', json, 'insert');
    if (res.count !== before) throw new Error('插入的图数量不对');
    if (call('fsCountFiles', g('fsRoot')) !== before * 2) throw new Error('插入后总数应为两倍');
    if (!/导入|根目录|\(2\)/.test(res.name)) throw new Error('插入的目录名没做去重：' + res.name);
  });

  run('单图导入：落到当前选中的目录', () => {
    const folder = call('fsAddNode', 'folder', null);
    call('fsRenameFolder', folder.id, '导入目标');
    call('fsSelect', folder.id);   // 目录不能当作图打开，选中状态应保持不变
    vm.runInContext('fsSelId = ' + JSON.stringify(folder.id) + ';', ctx);
    const node = call('fsImportSingle', '@diagram er "导入的 E-R 图"\nentity A', 'demo.uml');
    if (call('fsParent', node.id).id !== folder.id) throw new Error('单图没有落到选中目录');
    if (call('fsDisplayName', node) !== '导入的 E-R 图') throw new Error('导入的图名字不对');
  });

  run('文件区：可以隐藏，恢复后与原来一致', () => {
    const pane = dom.document.getElementById('files-pane');
    call('fsSetPaneVisible', false);
    if (!pane.classList.contains('hidden')) throw new Error('隐藏没生效');
    if (dom.document.getElementById('btn-files').classList.contains('on')) throw new Error('按钮状态没同步');
    call('fsSetPaneVisible', true);
    if (pane.classList.contains('hidden')) throw new Error('显示没生效');
  });

  run('文件树：全部内容都存进了 localStorage', () => {
    const raw = JSON.parse(sandbox.localStorage.getItem('umlite.fs.v1') || 'null');
    if (!raw || !raw.root) throw new Error('没有存档');
    if (typeof raw.current !== 'string') throw new Error('没有记住当前图');
    const count = call('fsCountFiles', g('fsRoot'));
    const countInSaved = (function walk(n) {
      return n.kind === 'folder' ? (n.children || []).reduce((s, c) => s + walk(c), 0) : 1;
    })(raw.root);
    if (countInSaved !== count) throw new Error(`存档里的图数量 ${countInSaved} ≠ 内存里的 ${count}`);
  });

  run('文件树：删除当前图后自动切到另一张', () => {
    const victim = call('fsAddNode', 'file', null);
    editor().value = '@diagram class "待删除"\nclass X';
    call('render', { force: true });
    const total = call('fsCountFiles', g('fsRoot'));
    if (!call('fsDeleteNode', victim.id)) throw new Error('删除返回失败');
    if (call('fsCountFiles', g('fsRoot')) !== total - 1) throw new Error('删除后图的数量没减少');
    if (g('fsCurrent') === victim.id) throw new Error('当前图还指着已删掉的节点');
    if (!call('fsNode', g('fsCurrent'))) throw new Error('没有切到另一个可用的图');
    if (rowOf(victim.id)) throw new Error('树里还留着已删除的行');
  });

  run('载入示例：新开一张图，不覆盖正在编辑的那张', () => {
    const before = g('fsCurrent');
    const beforeSrc = call('fsNode', before).src;
    const sel = dom.document.getElementById('samples');
    sel.value = '用例图 · 图书馆';
    sel.fire('change');
    if (g('fsCurrent') === before) throw new Error('示例应该开成新文件');
    if (call('fsNode', before).src !== beforeSrc) throw new Error('正在编辑的图被示例覆盖了');
    if (!/图书馆/.test(editor().value)) throw new Error('示例内容没进编辑器');
  });

  run('删除：弹的是页面自带的确认框，不是浏览器原生 alert', () => {
    const victim = call('fsAddNode', 'file', null);
    const total = call('fsCountFiles', g('fsRoot'));
    const mask = dom.document.getElementById('ask-mask');
    mask.classList.remove('is-open');
    call('fsDeleteWithConfirm', victim.id);
    if (!mask.classList.contains('is-open')) throw new Error('没有弹出确认框');
    const title = dom.document.getElementById('ask-title').textContent;
    if (title !== '删除图') throw new Error('标题不对：' + title);
    const msg = dom.document.getElementById('ask-msg').textContent;
    if (msg.indexOf('新建图') < 0) throw new Error('提示里没有图名：' + msg);
    const extra = dom.document.getElementById('ask-extra').textContent;
    if (extra.indexOf('无法恢复') < 0) throw new Error('没有说明后果：' + extra);
    const btns = dom.document.getElementById('ask-actions').children;
    if (btns.length !== 1) throw new Error('确认按钮数量不对：' + btns.length);
    if (!/danger/.test(btns[0].attrs['class'] || '')) throw new Error('删除按钮没有危险色样式');
    if (call('fsCountFiles', g('fsRoot')) !== total) throw new Error('还没确认就把图删了');
    // 收尾：等同于点了「取消」
    vm.runInContext('typeof askClose === "function" && askClose(null);', ctx);
    mask.classList.remove('is-open');
  });

  return results;
}

/* 从渲染出的 DOM 行里读出：id / class / 名字 / 图标 / 类型标签 */
function rowInfo(row) {
  const kids = row.children || [];
  const byClass = (name) => kids.find(k => k.attrs && String(k.attrs['class'] || '').split(/\s+/).indexOf(name) >= 0);
  const nameEl = byClass('tree-name');
  const iconEl = byClass('tree-ic');
  const kindEl = byClass('tree-kind');
  return {
    id: row.attrs && row.attrs['data-id'],
    cls: (row.attrs && row.attrs['class']) || '',
    name: nameEl ? nameEl.textContent : '',
    icon: iconEl && iconEl.children[0] ? iconEl.children[0].attrs.href : '',
    kind: kindEl ? kindEl.textContent : ''
  };
}
/* 允许单独执行：node tests/page.mjs */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const results = runPageSmoke();
  let failed = 0;
  for (const r of results) {
    if (r.ok) console.log('  \u001b[32m✓\u001b[0m ' + r.name);
    else { failed++; console.log('  \u001b[31m✗\u001b[0m ' + r.name); r.fails.forEach(f => console.log('      ' + f)); }
  }
  console.log('');
  console.log(failed ? `\u001b[31m${failed} 项失败\u001b[0m / 共 ${results.length} 项` : `\u001b[32m全部通过\u001b[0m：${results.length} 项`);
  process.exitCode = failed ? 1 : 0;
}
