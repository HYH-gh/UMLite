/* ==========================================================================
 *  页面级冒烟测试：在假 DOM 里按 UMLite.html 的顺序加载全部脚本
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

/* 与 UMLite.html 完全一致的加载顺序 */
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
  'js/history.js',
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
    toggle: (c) => { node._cls.has(c) ? node._cls.delete(c) : node._cls.add(c); }
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

export function runPageSmoke() {
  const results = [];
  const run = (name, fn) => {
    try { fn(); results.push({ name, ok: true, fails: [] }); }
    catch (e) { results.push({ name, ok: false, fails: [String((e && e.message) || e)] }); }
  };

  const { ctx, dom } = makeFakeDom();
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

  run('窄屏标签切换：代码 / 预览 互斥显示', () => {
    call('setMobilePane', 'preview');
    if (dom.document.body.dataset.pane !== 'preview') throw new Error('未切到预览');
    call('setMobilePane', 'code');
    if (dom.document.body.dataset.pane !== 'code') throw new Error('未切回代码');
  });

  return results;
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
