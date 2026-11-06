/* 生成 uml-test 布局验证台：把 5 张 .uml 的源码内嵌进一个多 iframe 页面。
 * 用法：node tests/_gen-harness.mjs   （输出 tests/_uml-test-run.html）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'uml-test');
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.uml')).sort();

const list = files.map(name => ({
  n: name,
  s: fs.readFileSync(path.join(DIR, name), 'utf8')
}));

const iframes = files.map(name =>
  `<iframe class="d" width="1500" height="1150" src="../UMLite.html" data-f="${name}"></iframe>`
).join('\n');

const json = JSON.stringify(list);   // JSON.stringify 会把 </script> 等危险序列转义为 \u003C —— 不，它不会。
// 手动转义 </script 与 <!--，防止提前终止脚本块
const safeJson = json.replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--');

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>uml-test 布局验证台</title>
<style>body{margin:0;background:#eef1f7;padding:8px;font:12px system-ui;} iframe{border:1px solid #94a3b8;border-radius:10px;background:#fff;display:block;margin-bottom:10px}</style>
</head><body>
${iframes}
<script>
window.__LIST__ = ${safeJson};
(function () {
  function ready(fr, cb) {
    var doc = fr.contentDocument;
    if (doc && doc.readyState === 'complete' && doc.getElementById('preview')) cb(fr);
    else fr.addEventListener('load', function () { setTimeout(function(){ cb(fr); }, 300); });
  }
  var srcMap = {};
  window.__LIST__.forEach(function (it) { srcMap[it.n] = it.s; });
  var frs = Array.prototype.slice.call(document.querySelectorAll('iframe.d'));
  var only = new URLSearchParams(location.search).get('only');
  var wanted = only ? frs.filter(function (f) { return f.dataset.f === only; }) : frs;
  frs.forEach(function (fr) {
    if (only && fr.dataset.f !== only) { fr.remove(); return; }
    ready(fr, function (f) {
      try {
        var w = f.contentWindow;
        var fname = f.dataset.f;
        w.eval("closeNotice(); localStorage.setItem('umlite.seenVersion', APP_VERSION); setMobilePane('preview');");
        w.eval("fsImportSingle(" + JSON.stringify(srcMap[fname]) + ", " + JSON.stringify(fname) + ");");
        w.eval("fitView(); paint();");
      } catch (e) { document.title = 'FAIL ' + e.message; }
      if (++n === wanted.length) document.title = 'ALL-DONE';
    });
  });
})();
</script>
</body></html>
`;

const out = path.join(ROOT, 'tests', '_uml-test-run.html');
fs.writeFileSync(out, html, 'utf8');
console.log('生成完成：', out, fs.statSync(out).size, 'bytes,', files.length, '张图');
