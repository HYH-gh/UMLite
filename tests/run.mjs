/* ==========================================================================
 *  无依赖测试运行器：node tests/run.mjs
 *
 *  在 vm 上下文里按页面顺序加载浏览器脚本（util → layoutcode → parser → layout →
 *  pipeline），补上 minimal DOM 桩（util.js 用 canvas 量文字），再执行 tests/cases.js。
 *  退出码：全部通过 0，有失败 1 —— 可直接挂到 CI / pre-commit。
 * ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { runPageSmoke } from './page.mjs';
import { runReleaseChecks } from './release.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

/* 与 UMLite.html 保持一致：这些都是纯逻辑脚本，不碰真实 DOM */
const SCRIPTS = [
  'js/util.js',
  'js/layoutcode.js',
  'js/parser.js',
  'js/layout.js',
  'js/pipeline.js',
  'js/render.js',
  'tests/harness.js',
  'tests/cases.js'
];

function createContext() {
  // util.js 用 canvas 的 measureText 估算文字宽度：给一个稳定的近似实现（1 字符 7px）
  const ctx2d = {
    font: '',
    measureText: (s) => ({ width: String(s).length * 7 })
  };
  // 极简 SVG 元素桩：render.js 只用 el()/styleEl() 建树、setAttribute、appendChild
  function makeEl(tag) {
    return {
      tagName: tag,
      attrs: {},
      children: [],
      style: {},
      textContent: '',
      setAttribute(k, v) { this.attrs[k] = v; },
      getAttribute(k) { return this.attrs[k]; },
      appendChild(c) { this.children.push(c); return c; },
      querySelectorAll() { return []; },
      addEventListener() {}
    };
  }
  const documentStub = {
    createElement: () => ({ getContext: () => ctx2d, style: {} }),
    createElementNS: (ns, tag) => makeEl(tag),
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text), children: [] })
  };
  const sandbox = { console, document: documentStub };
  return vm.createContext(sandbox);
}

const ctx = createContext();
for (const rel of SCRIPTS) {
  const file = path.join(ROOT, rel);
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: rel });
}

const cases = ctx.TEST_CASES;
if (!Array.isArray(cases) || !cases.length) {
  console.error('没有找到用例：tests/cases.js 应定义 TEST_CASES');
  process.exit(1);
}

const t0 = Date.now();
const results = ctx.UMLiteTests.runCases(cases);
const ms = Date.now() - t0;

let failed = 0;
function report(rows) {
  for (const r of rows) {
    if (r.ok) {
      console.log(`  \u001b[32m✓\u001b[0m ${r.name}`);
    } else {
      failed++;
      console.log(`  \u001b[31m✗\u001b[0m ${r.name}`);
      for (const f of r.fails) console.log(`      ${f.replace(/\n/g, '\n      ')}`);
    }
  }
}

console.log('\nDSL 断言 + 布局/渲染不变量');
report(results);

console.log('\n页面级冒烟（假 DOM 里跑完整页面）');
const page = runPageSmoke();
report(page);

console.log('\n发布一致性（版本号 / 更新文档 / 页面数据）');
const release = runReleaseChecks();
report(release);

const total = results.length + page.length + release.length;
console.log('');
if (failed) {
  console.log(`\u001b[31m${failed} 项失败\u001b[0m / 共 ${total} 项（${ms}ms）`);
  process.exitCode = 1;
} else {
  console.log(`\u001b[32m全部通过\u001b[0m：${total} 项（${ms}ms）`);
}
