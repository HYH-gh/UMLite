/* ==========================================================================
 *  更新日志同步器：docs/CHANGELOG.md  →  js/changelog.js
 *
 *  运行时是零依赖、无构建的（双击 index 就能用），页面没法 fetch 本地 md
 *  （file:// 下会被 CORS 拦掉），所以把文档转成一份可直接 <script> 引入的
 *  JS 数据。手改文档后跑一次这个脚本即可，输出文件已提交。
 *
 *     node tools/sync-changelog.mjs           生成 / 覆盖 js/changelog.js
 *     node tools/sync-changelog.mjs --check   只校验是否同步（不同步则退出码 1）
 * ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MD = path.join(ROOT, 'docs', 'CHANGELOG.md');
const OUT = path.join(ROOT, 'js', 'changelog.js');

/* 极简解析：`## 1.20 · 2026-11-05` 开一节，`- ` 开一条；其余行忽略 */
export function parseChangelog(md) {
  const entries = [];
  let cur = null;
  for (const raw of String(md).split(/\r?\n/)) {
    const line = raw.trim();
    const h = line.match(/^##\s+(\d+\.\d+)(?:\s*[·・]\s*(\d{4}-\d{2}-\d{2}))?\s*$/);
    if (h) {
      cur = { version: h[1], date: h[2] || '', items: [] };
      entries.push(cur);
      continue;
    }
    if (/^##\s/.test(line)) { cur = null; continue; }   // 其它二级标题结束当前节
    const it = line.match(/^[-*]\s+(.+)$/);
    if (it && cur) cur.items.push(it[1].trim());
  }
  return entries;
}

export function renderJs(entries) {
  const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  const body = entries.map(e =>
    `  { version: ${q(e.version)}, date: ${q(e.date)}, items: [\n` +
    e.items.map(i => `    ${q(i)},`).join('\n') +
    (e.items.length ? '\n' : '') +
    '  ] },'
  ).join('\n');
  return `/* 本文件由 tools/sync-changelog.mjs 依据 docs/CHANGELOG.md 自动生成，请勿手改。
   改更新内容请编辑 docs/CHANGELOG.md，然后执行 node tools/sync-changelog.mjs。 */

const UPDATES = [
${body}
];

/* 当前版本号：取更新日志里最上面的一节（1.XX，XX 为 git 提交次数） */
const APP_VERSION = UPDATES.length ? UPDATES[0].version : '1.0';
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const entries = parseChangelog(fs.readFileSync(MD, 'utf8'));
  if (!entries.length) {
    console.error('✗ docs/CHANGELOG.md 里没解析到任何版本小节');
    process.exit(1);
  }
  const out = renderJs(entries);
  const check = process.argv.includes('--check');
  const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (check) {
    if (prev.replace(/\r\n/g, '\n') !== out.replace(/\r\n/g, '\n')) {
      console.error('✗ js/changelog.js 与 docs/CHANGELOG.md 不同步，请执行 node tools/sync-changelog.mjs');
      process.exit(1);
    }
    console.log(`✓ 已同步（${entries.length} 个版本，当前 ${entries[0].version}）`);
    process.exit(0);
  }
  fs.writeFileSync(OUT, out, 'utf8');
  console.log(`✓ 已生成 js/changelog.js：${entries.length} 个版本，当前 ${entries[0].version}`);
}
