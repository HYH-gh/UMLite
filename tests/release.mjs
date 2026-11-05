/* ==========================================================================
 *  发布一致性检查：版本号相关的四处必须对齐
 *
 *    ① docs/CHANGELOG.md        更新文档（人写）
 *    ② js/changelog.js          页面数据（由 ① 生成）
 *    ③ README.md                顶部版本徽标
 *    ④ UMLite.html              版本号胶囊按钮的初始文案
 *
 *  规则：版本号 1.XX，XX = git 提交次数。任一不同步就在这里失败，
 *  省得发出去的页面写着旧版本、公告却停在上一版。
 * ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChangelog, renderJs } from '../tools/sync-changelog.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

export function runReleaseChecks() {
  const results = [];
  const run = (name, fn) => {
    try { fn(); results.push({ name, ok: true, fails: [] }); }
    catch (e) { results.push({ name, ok: false, fails: [String((e && e.message) || e)] }); }
  };

  const entries = parseChangelog(read('docs/CHANGELOG.md'));
  const jsSrc = read('js/changelog.js');

  run('版本号格式：1.XX，且更新日志按版本从新到旧', () => {
    if (!entries.length) throw new Error('docs/CHANGELOG.md 里没有版本小节');
    for (const e of entries) {
      if (!/^\d+\.\d+$/.test(e.version)) throw new Error('版本号格式不对：' + e.version);
      if (!e.items.length) throw new Error('v' + e.version + ' 没有任何更新条目');
    }
    // 1.XX 的 XX 是整数序号，不能按小数比大小（1.10 > 1.9）
    const cmp = (a, b) => {
      const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
      return (pa[0] - pb[0]) || (pa[1] - pb[1]);
    };
    for (let i = 1; i < entries.length; i++) {
      if (cmp(entries[i].version, entries[i - 1].version) >= 0) {
        throw new Error(`更新日志顺序乱了：${entries[i - 1].version} 之后是 ${entries[i].version}`);
      }
    }
  });

  run('页面数据与更新文档同步（js/changelog.js 由文档生成）', () => {
    const want = renderJs(entries).replace(/\r\n/g, '\n').trim();
    if (jsSrc.replace(/\r\n/g, '\n').trim() !== want) {
      throw new Error('js/changelog.js 与 docs/CHANGELOG.md 不同步，请执行 node tools/sync-changelog.mjs');
    }
  });

  run('README / 页面标签与当前版本号一致', () => {
    const cur = entries[0].version;
    const readme = read('README.md');
    if (readme.indexOf('v' + cur) < 0 && readme.indexOf(cur) < 0) {
      throw new Error('README 里没有当前版本号 v' + cur);
    }
    const html = read('UMLite.html');
    const m = html.match(/id="ver-chip"[^>]*>([^<]*)</);
    if (!m) throw new Error('UMLite.html 里找不到 #ver-chip 的初始文案');
    if (m[1].trim() !== 'v' + cur) throw new Error(`版本号胶囊写的是 ${m[1].trim()}，应为 v${cur}`);
  });

  run('更新文档记录了当前版本（避免提交后忘写日志）', () => {
    const cur = entries[0].version;
    const jsCur = jsSrc.match(/const APP_VERSION = UPDATES\.length \? UPDATES\[0\]\.version : '1\.0';/);
    if (!jsCur) throw new Error('js/changelog.js 里缺少 APP_VERSION 定义');
    if (jsSrc.indexOf(`version: '${cur}'`) < 0) throw new Error('页面数据里没有当前版本 ' + cur);
  });

  return results;
}

/* 允许单独执行：node tests/release.mjs */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const results = runReleaseChecks();
  let failed = 0;
  for (const r of results) {
    if (r.ok) console.log('  \u001b[32m✓\u001b[0m ' + r.name);
    else { failed++; console.log('  \u001b[31m✗\u001b[0m ' + r.name); r.fails.forEach(f => console.log('      ' + f)); }
  }
  console.log('');
  console.log(failed ? `\u001b[31m${failed} 项失败\u001b[0m / 共 ${results.length} 项` : `\u001b[32m全部通过\u001b[0m：${results.length} 项`);
  process.exitCode = failed ? 1 : 0;
}
