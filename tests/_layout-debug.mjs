/* 快速布局调试：加载 parser/pipeline，渲染 uml-test 图，打印统计 */
import fs from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ console });
// 假 DOM：只给 util.js 需要的 canvas measureText
const ctx2d = { font: '', measureText: (s) => ({ width: String(s).length * 7 }) };
vm.runInContext('const document = { createElement: () => ({ getContext: () => ctx2d }) }; const window = {};', ctx);
ctx.ctx2d = ctx2d;
for (const f of ['util.js', 'layoutcode.js', 'parser.js', 'layout.js', 'pipeline.js']) {
  vm.runInContext(fs.readFileSync('js/' + f, 'utf8'), ctx, { filename: f });
}
const name = process.argv[2] || '05-购物业务流程-活动图.uml';
const src = fs.readFileSync('uml-test/' + name, 'utf8');
const out = vm.runInContext(`buildModel(${JSON.stringify(src)}, { force: true })`, ctx);
const m = out.model;
console.log('type:', m.type, 'nodes:', m.nodes.length, 'contentW:', m.contentW, 'contentH:', m.contentH);
let nan = 0;
for (const nd of m.nodes) {
  if (!isFinite(nd.x) || !isFinite(nd.y)) { nan++; console.log('NaN:', nd.id, nd.kind, nd.lane || ''); }
}
console.log('NaN count:', nan);
if (m.swimlanes) for (const s of m.swimlanes) console.log('lane', JSON.stringify(s.label), s.dir, 'x=', s.x, 'y=', s.y, 'w=', s.w, 'h=', s.h);
if (m.activityEdge) console.log('activityEdge', m.activityEdge.x, m.activityEdge.y, m.activityEdge.w, m.activityEdge.h);
// 重叠检查
let overlaps = 0;
for (let i = 0; i < m.nodes.length; i++) for (let j = i + 1; j < m.nodes.length; j++) {
  const a = m.nodes[i], b = m.nodes[j];
  if (!isFinite(a.x) || !isFinite(b.x)) continue;
  const ox = (a.w + b.w) / 2 - Math.abs(a.x - b.x);
  const oy = (a.h + b.h) / 2 - Math.abs(a.y - b.y);
  if (ox > 2 && oy > 2) { overlaps++; if (overlaps <= 6) console.log('overlap:', a.id, '<->', b.id, `ox=${ox.toFixed(0)} oy=${oy.toFixed(0)}`); }
}
console.log('overlaps:', overlaps);
// 斜线统计
let diag = 0, straight = 0;
for (const e of m.edges || []) {
  const a = m.nodes.find(n => n.id === e.from), b = m.nodes.find(n => n.id === e.to);
  if (!a || !b || !isFinite(a.x) || !isFinite(b.x)) continue;
  const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
  if (dx < 4 || dy < 4) straight++; else diag++;
}
console.log('edges straight:', straight, 'diagonal:', diag);
