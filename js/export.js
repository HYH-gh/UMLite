/* ---------------- 导出 ---------------- */

function serializeSVG(svg) {
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  const vb = (svg.getAttribute('viewBox') || '0 0 800 600').split(/\s+/);
  clone.setAttribute('width', vb[2]);
  clone.setAttribute('height', vb[3]);
  // 移除交互用的透明命中框
  clone.querySelectorAll('.hit').forEach(n => n.remove());
  const s = new XMLSerializer().serializeToString(clone);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + s;
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function downloadSVG() {
  const svg = preview.querySelector('svg');
  if (!svg) return setStatus('没有可导出的图形', 'err');
  saveBlob(new Blob([serializeSVG(svg)], { type: 'image/svg+xml;charset=utf-8' }), 'diagram.svg');
  setStatus('已导出 diagram.svg', 'ok');
}

function downloadPNG(scale = 2) {
  const svg = preview.querySelector('svg');
  if (!svg) return setStatus('没有可导出的图形', 'err');

  const vb = (svg.getAttribute('viewBox') || '0 0 800 600').split(/\s+/).map(Number);
  const w = vb[2], h = vb[3];
  const str = serializeSVG(svg);

  const blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();

  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(b => {
      if (b) { saveBlob(b, 'diagram.png'); setStatus('已导出 diagram.png', 'ok'); }
      else setStatus('PNG 导出失败', 'err');
      URL.revokeObjectURL(url);
    }, 'image/png');
  };
  img.onerror = () => {
    setStatus('PNG 导出失败（SVG 转换错误）', 'err');
    URL.revokeObjectURL(url);
  };
  img.src = url;
}
