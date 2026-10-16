
const SVG_NS = 'http://www.w3.org/2000/svg';
const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

/* ---------------- 通用工具 ---------------- */

const _cvs = document.createElement('canvas');
const _ctx = _cvs.getContext('2d');
function textWidth(s, size = 13, weight = 'normal') {
  _ctx.font = `${weight} ${size}px ${FONT}`;
  return _ctx.measureText(String(s)).width;
}
function el(tag, attrs = {}, children = []) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) {
    if (attrs[k] === undefined || attrs[k] === null) continue;
    if (typeof attrs[k] === 'number' && !isFinite(attrs[k])) continue;
    e.setAttribute(k, attrs[k]);
  }
  for (const c of [].concat(children)) {
    if (c === undefined || c === null) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}
function styleEl(css) {
  const s = document.createElementNS(SVG_NS, 'style');
  s.textContent = css;
  return s;
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
