/* ==========================================================================
 *  测试执行器（node 与浏览器共用）
 *
 *  - makeT()        断言收集器：ok / eq / ne / near / deepEq / throws
 *  - runCases()     执行用例，并对每个成功构建的模型跑三条通用不变量：
 *                    ① 几何必须是有限数（NaN / Infinity 会毁掉整张 SVG）
 *                    ② 同一份 DSL 构建两次结果必须逐字段一致（布局可复现）
 *                    ③ @layout 往返：坐标写回源码再解析，位置不得漂移
 *
 *  依赖上下文中已加载的全局：buildModel / serializeLayoutBlock / withPositionBlock
 * ========================================================================== */
(function (root) {
  'use strict';

  function fmt(v) {
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }

  function makeT() {
    const fails = [];
    const t = {
      fails,
      ok(cond, msg) {
        if (!cond) fails.push(msg || 'ok 断言失败');
      },
      eq(a, b, msg) {
        if (a !== b) fails.push((msg || '值不相等') + `：期望 ${fmt(b)}，实际 ${fmt(a)}`);
      },
      ne(a, b, msg) {
        if (a === b) fails.push((msg || '值不应相等') + `：不应为 ${fmt(b)}`);
      },
      near(a, b, tol, msg) {
        if (!(Math.abs(a - b) <= tol)) fails.push((msg || '数值偏差过大') + `：期望 ${b}±${tol}，实际 ${a}`);
      },
      deepEq(a, b, msg) {
        const sa = fmt(a), sb = fmt(b);
        if (sa !== sb) fails.push((msg || '结构不相等') + `\n    期望 ${sb}\n    实际 ${sa}`);
      },
      throws(fn, re, msg) {
        try { fn(); }
        catch (e) {
          if (re && !re.test(e.message)) fails.push((msg || '异常信息不匹配') + '：' + e.message);
          return;
        }
        fails.push(msg || '期望抛出异常，但没有');
      }
    };
    return t;
  }

  /* 位置快照：@layout 往返比对用 */
  function posSnapshot(model) {
    const m = new Map();
    for (const n of model.nodes || []) m.set('node:' + n.id, [n.x, n.y]);
    for (const p of model.participants || []) m.set('part:' + p.ref, [p.x, p.y]);
    for (const s of model.swimlanes || []) m.set('lane:' + s.label, [s.x, s.y]);
    if (model.boundary) m.set('boundary', [model.boundary.x, model.boundary.y]);
    if (model.activityEdge) m.set('activityEdge', [model.activityEdge.x, model.activityEdge.y]);
    (model.messages || []).forEach((x, i) => m.set('msg:' + i, [0, x.y]));
    (model.activations || []).forEach((x, i) => m.set('act:' + i, [0, x.startY]));
    (model.fragments || []).forEach((x, i) => m.set('frag:' + i, [x.x, x.y]));
    return m;
  }

  function checkInvariants(dsl, model, t) {    // ① 几何数值必须有限
    const nonFinite = [];
    (function walk(v, path) {
      if (Array.isArray(v)) { v.forEach((x, i) => walk(x, path + '[' + i + ']')); return; }
      if (v && typeof v === 'object') {
        for (const k of Object.keys(v)) {
          const val = v[k];
          if (typeof val === 'number') {
            if (!isFinite(val)) nonFinite.push(path + '.' + k + '=' + val);
          } else if (val && typeof val === 'object') {
            walk(val, path + '.' + k);
          }
        }
      }
    })(model, 'model');
    t.ok(nonFinite.length === 0, '出现非有限数值：' + nonFinite.slice(0, 5).join(', '));

    // ② 布局可复现：同一份源码构建两次必须完全一致
    const again = buildModel(dsl).model;
    t.deepEq(again, model, '两次构建结果不一致（布局不确定）');

    // ③ @layout 往返：写回源码再解析，位置不得漂移
    const block = serializeLayoutBlock(model);
    if (block) {
      const round = buildModel(withPositionBlock(dsl, model)).model;
      const before = posSnapshot(model), after = posSnapshot(round);
      for (const [key, xy] of before) {
        const p = after.get(key);
        if (!p) { t.ok(false, '往返后丢失元素 ' + key); continue; }
        t.near(p[0], xy[0], 1.5, '往返后 ' + key + ' 的 x 漂移');
        t.near(p[1], xy[1], 1.5, '往返后 ' + key + ' 的 y 漂移');
      }
    }
  }

  /* ④ 渲染层冒烟：走真实 buildGraphContent / buildSequenceContent，
     检查产出非空且没有把 NaN / Infinity / undefined 拼进属性（SVG 会整张报废） */
  function checkRender(model, t) {
    if (typeof buildGraphContent !== 'function' || typeof buildSequenceContent !== 'function') return;
    const content = model.type === 'sequence' ? buildSequenceContent(model) : buildGraphContent(model);
    let els = 0;
    const bad = [];
    (function walk(node) {
      if (!node || typeof node !== 'object') return;
      els++;
      const attrs = node.attrs || {};
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (typeof v === 'string' && /NaN|Infinity|undefined|null/.test(v)) bad.push(k + '=' + v);
        else if (typeof v === 'number' && !isFinite(v)) bad.push(k + '=' + v);
      }
      for (const c of node.children || []) walk(c);
    })(content);
    t.ok(els > 1, '渲染层没有产出任何 SVG 元素');
    t.ok(bad.length === 0, '渲染层产生非法属性：' + bad.slice(0, 5).join(', '));
  }

  function runCases(cases) {
    const results = [];
    for (const c of cases) {
      const t = makeT();
      try {
        if (c.throws) {
          t.throws(() => buildModel(c.dsl), c.throws, '应抛出 ' + c.throws);
        } else {
          const built = buildModel(c.dsl);
          if (c.check) c.check(built.model, t, built);
          if (c.skipInvariants !== true) {
            checkInvariants(c.dsl, built.model, t);
            checkRender(built.model, t);
          }
        }
      } catch (e) {
        t.ok(false, '构建/断言过程抛出异常：' + ((e && e.message) || e));
      }
      results.push({ name: c.name, ok: t.fails.length === 0, fails: t.fails });
    }
    return results;
  }

  root.UMLiteTests = { runCases, makeT, posSnapshot };
})(typeof globalThis !== 'undefined' ? globalThis : this);
