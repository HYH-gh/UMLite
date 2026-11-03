/* ==========================================================================
 *  管线层：DSL 文本 → 可渲染模型（解析 → 节点尺寸 → 布局 → @layout 应用）
 *
 *  view.js 的 render() 与 test-elements.html 都走 buildModel()，
 *  不再各自复刻一份布局分支（以前 test-elements 里手工抄了一份，容易漂移）。
 * ========================================================================== */

/* ---------------- 结构签名：判断“是否需要重排” ----------------
 * 剔除所有由布局产生的几何字段，只保留语义（节点/连线/泳道/参与者/消息…）。
 * 签名相同 ⇒ 两份模型语义完全等价 ⇒ 上次布局结果可原样复用。 */

const GEOMETRY_KEYS = new Set([
  // 位置与尺寸（布局输出）
  'x', 'y', 'w', 'h',
  'contentW', 'contentH', 'titleX', 'titleY', 'layoutMinX', 'layoutMinY',
  // 时序图布局输出
  'lifeBottom', 'headTop', 'lifeTop', 'startY', 'endY', 'sepY',
  // 交互产生的几何数据
  'bends', 'aAnchor', 'bAnchor',
  // 由 kind/type 推出来的派生字段
  'shape', 'fixedRel', '_attrCount', '_methodCount', '_hasSep',
  // @layout 块单独比较（见 buildModel 的 layoutSig）
  'layout'
]);

function stripGeometry(v) {
  if (Array.isArray(v)) return v.map(stripGeometry);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) {
      if (GEOMETRY_KEYS.has(k)) continue;
      const val = v[k];
      if (val === undefined || typeof val === 'function') continue;
      o[k] = stripGeometry(val);
    }
    return o;
  }
  return v;
}

function structuralSignature(model) {
  return JSON.stringify(stripGeometry(model));
}

/* ---------------- 按图类型分发布局 ----------------
 * 类图/对象图/包图/组件图/部署图/ER：力导向（类图、部署图再加正交化）
 * 活动图/状态图：分层 + Barycenter 层内排序
 * 用例图含系统边界：只对框内元素力导向，框外由 normalizeToOrigin 摆放
 * 时序图：横向等距排参与者 + 纵向行号布局
 */
function layoutModel(model) {
  if (model.type === 'sequence') {
    const dims = layoutSequence(model);
    model.contentW = dims.width;
    model.contentH = dims.height;
    return;
  }
  if (model.type === 'activity' || model.type === 'state') {
    layoutActivity(model);
    resolveOverlaps(model.nodes, model.type === 'activity' ? 44 : 42,
      model.type === 'activity' ? 36 : 32);
  } else if (model.type === 'usecase' && model.boundary) {
    const insideNodes = model.nodes.filter(n => n.insideBoundary);
    if (insideNodes.length) {
      const subModel = Object.assign({}, model, { nodes: insideNodes });
      layoutForce(subModel);
      // 二次更强的消除重叠，保证框内元素互不遮挡
      resolveOverlaps(subModel.nodes, 64, 52);
    }
  } else {
    layoutForce(model);
  }
  normalizeToOrigin(model);
  if (model.type === 'activity') layoutActivityContainers(model);
}

/* ---------------- 主入口 ---------------- */

/* 解析 + 布局，返回 { model, sig, layoutSig, reused }。
   传入 opts.previous（上次的返回值）时：若结构签名与 @layout 块都没变，直接复用上次的
   model 对象并跳过重排——这样打字、加空行、改注释都不会让图重排/跳动，画布上拖出来的
   坐标也不会被冲掉。opts.force = true 可强制重排（「刷新渲染」按钮）。 */
function buildModel(src, opts) {
  opts = opts || {};
  const fresh = parseDSL(src);
  const sig = structuralSignature(fresh);
  const layoutSig = JSON.stringify(fresh.layout || []);
  const prev = opts.previous;
  if (!opts.force && prev && prev.sig === sig && prev.layoutSig === layoutSig) {
    return { model: prev.model, sig, layoutSig, reused: true };
  }
  prepareNodes(fresh);
  layoutModel(fresh);
  applyLayout(fresh);
  return { model: fresh, sig, layoutSig, reused: false };
}
