/* ==========================================================================
 *  DSL 断言用例（node 与浏览器共用）
 *
 *  每个用例：{ name, dsl, check(model, t) }
 *    check 里对解析/布局结果做断言，t 提供 ok / eq / ne / near / deepEq / throws
 *    期望构建失败时用 { name, dsl, throws: /错误信息片段/ }
 *  通用不变量（几何有限 / 布局可复现 / @layout 往返）由 harness.js 自动执行，
 *  需要放行时给用例加 skipInvariants: true。
 *
 *  新增功能时在这里加一条用例，比手工点 test-elements.html 可靠得多。
 * ========================================================================== */

/* 20 个类、19 条链的类图，用于布局压力断言 */
const BIG_CLASS_DSL = (function () {
  let s = '@diagram class "链路"\n';
  for (let i = 0; i < 20; i++) s += `class C${i}\n`;
  for (let i = 1; i < 20; i++) s += `C${i - 1} --> C${i}\n`;
  return s;
})();

var TEST_CASES = [

  /* ---------------- 文档结构 ---------------- */
  {
    name: '文档：图类型别名 + 标题',
    dsl: '@diagram 类图 "电商系统"\nclass A',
    check(m, t) {
      t.eq(m.type, 'class', 'type');
      t.eq(m.title, '电商系统', 'title');
      t.eq(m.nodes.length, 1, '节点数');
    }
  },
  {
    name: '文档：缺少 @diagram 应报错',
    dsl: 'class A',
    throws: /缺少图类型声明/
  },
  {
    name: '文档：未知图类型应报错',
    dsl: '@diagram foobar',
    throws: /未知的图类型/
  },
  {
    name: '文档：# 与 // 注释、空行被忽略',
    dsl: '@diagram class\n# 注释\n\n// 也是注释\nclass A\n',
    check(m, t) {
      t.eq(m.nodes.length, 1, '节点数');
    }
  },

  /* ---------------- 类图元素 ---------------- */
  {
    name: '类：成员原样保留',
    dsl: '@diagram class\nclass A {\n  - name: String\n  + run(): void\n}',
    check(m, t) {
      t.deepEq(m.nodes[0].members, ['- name: String', '+ run(): void'], 'members');
    }
  },
  {
    name: '类：interface / abstract / enum 的 kind',
    dsl: '@diagram class\ninterface Payable {\n  + pay(): void\n}\nabstract class Base\nenum Status {\n  READY\n  DONE\n}',
    check(m, t) {
      const by = (id) => m.nodes.find(n => n.id === id);
      t.eq(by('Payable').kind, 'interface', 'Payable.kind');
      t.eq(by('Base').kind, 'abstract', 'Base.kind');
      t.eq(by('Status').kind, 'enum', 'Status.kind');
      t.eq(by('Status').members.length, 2, 'Status 枚举值数');
    }
  },
  {
    name: '类：package / component / database / notice 都能成为节点',
    dsl: '@diagram class\npackage 业务层\ncomponent 网关\ndatabase MySQL\nnotice 用户操作',
    check(m, t) {
      const kinds = m.nodes.map(n => n.kind).sort();
      t.deepEq(kinds, ['component', 'database', 'notice', 'package'], 'kinds');
    }
  },

  /* ---------------- 关系运算符 ---------------- */
  {
    name: '关系：继承 / 实现的线型与箭头',
    dsl: '@diagram class\nA --|> B\nA ..|> C',
    check(m, t) {
      t.eq(m.edges[0].kind, 'generalization', 'edges[0].kind');
      t.eq(m.edges[0].head, 'triangle', 'edges[0].head');
      t.eq(m.edges[0].dash, false, 'edges[0].dash');
      t.eq(m.edges[1].kind, 'realization', 'edges[1].kind');
      t.eq(m.edges[1].dash, true, 'edges[1].dash');
    }
  },
  {
    name: '关系：反向运算符被规整为正向',
    dsl: '@diagram class\nB <|-- A\nC <-- D',
    check(m, t) {
      t.eq(m.edges[0].from, 'A', '继承：from');
      t.eq(m.edges[0].to, 'B', '继承：to');
      t.eq(m.edges[1].from, 'D', '有向关联：from');
      t.eq(m.edges[1].to, 'C', '有向关联：to');
    }
  },
  {
    name: '关系：多重度与标签',
    dsl: '@diagram class\nA "1" --> "0..*" B : 关联标签',
    check(m, t) {
      t.eq(m.edges[0].fromMult, '1', 'fromMult');
      t.eq(m.edges[0].toMult, '0..*', 'toMult');
      t.eq(m.edges[0].label, '关联标签', 'label');
    }
  },
  {
    name: '关系：组合 / 聚合 的尾部菱形',
    dsl: '@diagram class\nA *-- B\nA o-- C',
    check(m, t) {
      t.eq(m.edges[0].tailDiamond, 'filled', '组合');
      t.eq(m.edges[1].tailDiamond, 'open', '聚合');
    }
  },

  /* ---------------- 用例图 ---------------- */
  {
    name: '用例图：系统边界与框内标记',
    dsl: '@diagram usecase\nboundary "图书系统" :solid\nactor 读者\nusecase 借书 :boundary\nusecase 还书 :boundary',
    check(m, t) {
      t.eq(m.boundary.label, '图书系统', '边界标题');
      t.eq(m.boundary.lineStyle, 'solid', '边界线型');
      const by = (id) => m.nodes.find(n => n.id === id);
      t.eq(by('借书').insideBoundary, true, '借书 在框内');
      t.eq(by('读者').insideBoundary, false, '读者 在框外');
      t.eq(by('读者').kind, 'actor', '读者 kind');
      t.ok(m.boundary.w > 0 && m.boundary.h > 0, '边界框应有正尺寸');
    }
  },
  {
    name: '用例图：business 前缀',
    dsl: '@diagram usecase\nbusiness actor 贵宾顾客\nbusiness usecase 会员下单',
    check(m, t) {
      const kinds = m.nodes.map(n => n.kind).sort();
      t.deepEq(kinds, ['businessactor', 'businessusecase'], 'kinds');
    }
  },

  /* ---------------- 活动图 ---------------- */
  {
    name: '活动图：if/else 产生判断节点与分支边',
    dsl: '@diagram activity\nstart\n:备货;\nif (库存充足?)\n  :发货;\nelse\n  :缺货;\nendif\nstop',
    check(m, t) {
      t.eq(m.nodes.length, 6, '节点数');
      t.eq(m.edges.length, 6, '边数');
      const dec = m.nodes.find(n => n.kind === 'decision');
      t.eq(dec.label, '库存充足?', '判断条件');
      const labels = m.edges.map(e => e.label).filter(Boolean).sort();
      t.deepEq(labels, ['否', '是'], '分支标签');
    }
  },
  {
    name: '活动图：泳道与元素归属',
    dsl: '@diagram activity\nswimlane "用户" :h\nswimlane "系统" :v\nstart in "用户"\n:处理; in "系统"',
    check(m, t) {
      t.eq(m.swimlanes.length, 2, '泳道数');
      t.deepEq(m.swimlanes.map(s => s.dir), ['h', 'v'], '泳道方向');
      t.deepEq(m.nodes.map(n => n.lane), ['用户', '系统'], '节点归属');
      t.ok(m.swimlanes.every(s => s.w > 0 && s.h > 0), '泳道应有正尺寸');
    }
  },
  {
    name: '活动图：活动边容器',
    dsl: '@diagram activity\nboundary "订单处理"\nstart\n:处理;\nstop',
    check(m, t) {
      t.eq(m.activityEdge.label, '订单处理', '活动边标题');
      t.ok(m.activityEdge.w > 0 && m.activityEdge.h > 0, '活动边应有正尺寸');
    }
  },
  {
    name: '活动图：分层布局自上而下',
    dsl: '@diagram activity\nstart\n:一;\n:二;\nstop',
    check(m, t) {
      const ys = m.nodes.map(n => n.y);
      for (let i = 1; i < ys.length; i++) t.ok(ys[i] > ys[i - 1], '第 ' + i + ' 个节点应更靠下');
    }
  },

  /* ---------------- 状态图 ---------------- */
  {
    name: '状态图：[*] 伪状态',
    dsl: '@diagram state\n[*] --> A\nA --> [*]',
    check(m, t) {
      t.eq(m.nodes.filter(n => n.kind === 'pseudo').length, 2, '伪状态数');
      t.ok(m.nodes.some(n => n.id === 'A'), '应有状态 A');
      t.eq(m.edges.length, 2, '迁移数');
    }
  },

  /* ---------------- E-R 图 ---------------- */
  {
    name: 'E-R：多重性标记',
    dsl: '@diagram er\nUser ||--o{ Post\nPost ||--|{ Comment',
    check(m, t) {
      // 方向必须与源码字面一致：'A ||--o{ B' 是 A(一) → B(多)
      t.eq(m.edges[0].from, 'User', 'from');
      t.eq(m.edges[0].to, 'Post', 'to');
      t.eq(m.edges[0].fromMult, '||', 'fromMult');
      t.eq(m.edges[0].toMult, 'o{', 'toMult');
      t.eq(m.edges[1].toMult, '|{', 'toMult 2');
      t.ok(m.nodes.find(n => n.id === 'User').h > 30, 'ER 实体应有成员区高度');
    }
  },
  {
    name: 'E-R：标记在左侧的写法同样就地方向',
    dsl: '@diagram er\nUser o{--|| Post\nOrder --o{ Line',
    check(m, t) {
      t.eq(m.edges[0].from, 'User', 'from');
      t.eq(m.edges[0].to, 'Post', 'to');
      t.eq(m.edges[0].fromMult, 'o{', 'User 侧为多');
      t.eq(m.edges[0].toMult, '||', 'Post 侧为一');
      t.eq(m.edges[1].from, 'Order', 'from 2');
      t.eq(m.edges[1].toMult, 'o{', 'Line 侧为多');
      t.eq(m.edges[1].fromMult, '', 'Order 侧无标记');
    }
  },

  /* ---------------- 时序图 ---------------- */
  {
    name: '时序图：参与者类型与声明顺序',
    dsl: '@diagram sequence\nactor 用户\ncontrol 认证服务\nentity 数据库\nobject 网关',
    check(m, t) {
      t.deepEq(m.participants.map(p => p.ref), ['用户', '认证服务', '数据库', '网关'], '顺序');
      t.deepEq(m.participants.map(p => p.kind), ['actor', 'control', 'entity', 'object'], 'kinds');
    }
  },
  {
    name: '时序图：消息算子',
    dsl: '@diagram sequence\nobject A\nobject B\nA ->> B : 调用\nA --> B : 返回\nA ->o B : 异步\nA ->* B : 创建',
    check(m, t) {
      t.deepEq(m.messages.map(x => x.op), ['sync', 'return', 'async', 'create'], 'op');
      t.eq(m.messages[1].dash, true, '返回消息应为虚线');
      t.eq(m.messages[0].label, '调用', '消息文本');
    }
  },
  {
    name: '时序图：activate / deactivate 生成激活条',
    dsl: '@diagram sequence\nobject A\nobject B\nA -> B : 调用\nactivate B\nA -> B : 处理\ndeactivate B',
    check(m, t) {
      t.eq(m.activations.length, 1, '激活条数');
      const a = m.activations[0];
      t.eq(a.part, 'B', '激活对象');
      t.ok(a.endRow > a.startRow, 'deactivate 应闭合激活条（endRow > startRow）');
      t.ok(a.endY > a.startY, '激活条应有正高度');
    }
  },
  {
    name: '时序图：无 activate 时自动生成激活条',
    dsl: '@diagram sequence\nobject A\nobject B\nA -> B : 无显式激活也自动生成',
    check(m, t) {
      t.eq(m.messages.length, 1, '消息不受影响');
      t.eq(m.activations.length, 2, 'A、B 各一条自动激活条');
      t.ok(m.activations.every(a => a.auto), '标记为自动');
      // A 只在第 0 行发消息；B 在第 0 行收消息 —— 段覆盖第 0 行
      t.ok(m.activations.every(a => a.startRow < 0.01 && a.endRow > 0.4), '激活条覆盖消息行');
    }
  },
  {
    name: '时序图：自动激活条按间隔分段',
    dsl: '@diagram sequence\nobject A\nobject B\nA -> B : 1\nB -> A : 2\nC -> D : 中间别人的消息\nB -> A : 3',
    check(m, t) {
      const bSegs = m.activations.filter(a => a.part === 'B');
      t.eq(bSegs.length, 2, 'B 的消息被中间隔开，应分成两段');
      t.ok(bSegs.every(a => a.auto), '均为自动条');
    }
  },
  {
    name: '时序图：deactivate 多余时忽略，不凭空造条',
    dsl: '@diagram sequence\nobject A\nobject B\ndeactivate B\nA -> B : hi',
    check(m, t) {
      t.eq(m.activations.length, 0, '无 activate 的 deactivate 不应产生激活条');
    }
  },
  {
    name: '时序图：嵌套 activate 画在同一条生命线上',
    dsl: '@diagram sequence\nobject A\nobject B\nactivate B\nA -> B : 1\nactivate B\nA -> B : 2\ndeactivate B\ndeactivate B',
    check(m, t) {
      t.eq(m.activations.length, 2, '两段激活条');
      t.deepEq(m.activations.map(a => a.part), ['B', 'B'], '都在 B 上');
      t.eq(m.activations[0].startRow < m.activations[1].startRow, true, '按声明顺序排列');
      t.ok(m.activations[0].endRow > 0 && m.activations[1].endRow > 0, '都闭合');
    }
  },
  {
    name: '时序图：未闭合的 activate 自动延伸到末尾',
    dsl: '@diagram sequence\nobject A\nobject B\nactivate B\nA -> B : hi',
    check(m, t) {
      t.eq(m.activations.length, 1, '一条');
      t.ok(m.activations[0].endRow >= m.activations[0].startRow, 'endRow 被补到最后');
    }
  },
  {
    name: '时序图：alt/else/end 组合片段',
    dsl: '@diagram sequence\nobject A\nobject B\nalt 校验通过\n  A -> B : 通过\nelse 校验失败\n  A -> B : 拒绝\nend',
    check(m, t) {
      t.eq(m.fragments.length, 1, '片段数');
      const f = m.fragments[0];
      t.eq(f.op, 'alt', '片段类型');
      t.eq(f.label, '校验通过', '片段标题');
      t.eq(f.seps.length, 1, 'else 分隔数');
      t.eq(f.seps[0].label, '校验失败', 'else 标签');
      t.ok(f.h > 0, '片段应有正高度');
    }
  },
  {
    name: '时序图：business 前缀参与者',
    dsl: '@diagram sequence\nbusiness worker 仓管员\nbusiness boundary 门店界面',
    check(m, t) {
      t.deepEq(m.participants.map(p => p.kind), ['busworker', 'busboundary'], 'kinds');
    }
  },

  /* ---------------- @layout 位置代码 ---------------- */
  {
    name: '@layout：节点坐标 / 尺寸 / 折点 / 锚点读入',
    dsl: '@diagram class\nA --> B\n@layout\nA @ (100, 100) 120 60\nB @ (300, 100)\nboundary @ (10, 20) 300 200\nedge A->B bend 0 @ (200, 40)\nedge A->B bend 1 @ (200, 160)\nedge A->B start (5, 6)',
    check(m, t) {
      const kinds = m.layout.map(x => x.kind);
      t.deepEq(kinds, ['node', 'node', 'boundary', 'edgeBend', 'edgeBend', 'edgeAnchor'], 'layout kinds');
      const A = m.nodes.find(n => n.id === 'A');
      t.eq(A.x, 100, 'A.x');
      t.eq(A.y, 100, 'A.y');
      t.eq(A.w, 120, 'A.w');
      t.eq(A.h, 60, 'A.h');
      const e = m.edges[0];
      t.deepEq(e.bends, [{ x: 200, y: 40 }, { x: 200, y: 160 }], 'bends 顺序');
      t.deepEq(e.aAnchor, { dx: 5, dy: 6 }, 'aAnchor');
    }
  },
  {
    name: '@layout：泳道、泳道内元素与活动边',
    dsl: '@diagram activity\nboundary "流程"\nswimlane "用户" :h\n:提交; in "用户"\n@layout\nboundary @ (0, 0) 400 200\nlane 用户 @ (0, 0) 400 100',
    check(m, t) {
      t.eq(m.layout.length, 2, 'layout 条目数');
      t.eq(m.layout[0].kind, 'boundary', '第一条为 boundary');
      t.eq(m.layout[1].kind, 'lane', '第二条为 lane');
      t.eq(m.layout[1].name, '用户', '泳道名');
      t.eq(m.activityEdge.w, 400, '活动边宽按 @layout 覆盖');
      const lane = m.swimlanes.find(s => s.label === '用户');
      t.eq(lane.h, 100, '泳道高按 @layout 覆盖');
    }
  },
  {
    name: '@layout：时序图参与者 / 消息 / 生命线底部',
    dsl: '@diagram sequence\nobject A\nobject B\nA -> B : 调用\n@layout\nparticipant A @ (200, 120) 160 96\nmessage 0 @ (_, 260)\nlifeBottom 600',
    check(m, t) {
      t.eq(m.participants.find(p => p.ref === 'A').x, 200, '参与者 A.x');
      t.eq(m.messages[0].y, 260, '消息 y');
      t.eq(m.lifeBottom, 600, 'lifeBottom');
    }
  },
  {
    name: '@layout：无法识别的行被宽容忽略',
    dsl: '@diagram class\nA\n@layout\nA @ (10, 20)\n这不是合法行\n@ (,,)',
    check(m, t) {
      t.eq(m.layout.length, 1, '只保留可识别的一条');
      t.eq(m.layout[0].kind, 'node', 'kind');
    }
  },
  {
    name: '@layout：折点引用容忍反向写法（兼容旧文件）',
    dsl: '@diagram er\nA ||--o{ B\n@layout\nA @ (60, 90) 56 40\nB @ (280, 90) 56 40\nedge B->A bend 0 @ (170, 40)',
    check(m, t) {
      // 源码方向是 A → B，位置块里写成 B->A 也应能命中这条边
      t.eq(m.edges[0].from, 'A', 'from');
      t.deepEq(m.edges[0].bends, [{ x: 170, y: 40 }], '折点仍生效');
    }
  },

  /* ---------------- 布局质量 ---------------- */
  {
    name: '布局：20 个类互不重叠',
    dsl: BIG_CLASS_DSL,
    check(m, t) {
      t.eq(m.nodes.length, 20, '节点数');
      const ns = m.nodes;
      let bad = 0;
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const a = ns[i], b = ns[j];
          const ox = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
          const oy = Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2);
          if (ox > 2 && oy > 2) {
            if (++bad <= 3) t.ok(false, `${a.id} 与 ${b.id} 重叠 ${ox.toFixed(1)}×${oy.toFixed(1)}`);
          }
        }
      }
      t.eq(bad, 0, '重叠对数合计');
    }
  },
  {
    name: '布局：所有节点坐标为正且在图内',
    dsl: '@diagram usecase\nactor 用户\nusecase 登录\nusecase 下单\n用户 --> 登录',
    check(m, t) {
      for (const n of m.nodes) {
        t.ok(n.x - n.w / 2 >= -0.5 && n.y - n.h / 2 >= -0.5, n.id + ' 应在画布正区');
        t.ok(n.x + n.w / 2 <= m.contentW + 0.5, n.id + ' 不应超出右边界');
      }
    }
  }
];
