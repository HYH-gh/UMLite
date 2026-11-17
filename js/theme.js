/* ==========================================================================
 *  主题层（theme）：把「长什么样」从绘制代码里拆出来
 *
 *  设计约定：
 *    · render.js 只负责几何与结构（坐标、路径、文字内容），一个色值都不写；
 *    · 颜色 / 字体 / 线宽 / 圆角 / 阴影 / 渐变全部来自这里的 token 表；
 *    · 新增一套配色 = 在 THEMES 里加一份 token 表，绘制代码零改动。
 *
 *  两套配色（只影响显示，不影响代码、坐标与布局）：
 *    color —— 原有彩色风格（淡紫 / 淡青 / 淡黄，灰色连线）
 *    plain —— 简约风格，参考 Enterprise Architect：象牙渐变填充、黑色细描边、
 *             轻微投影、浅蓝画布、顺序图浅青头部
 *
 *  生效方式：画布内联样式由 buildSvgCss() 按当前 token 生成，
 *  渐变 / 阴影定义由 themeDefsEl() 生成并挂在 <svg> 下（导出时一起带走）。
 * ========================================================================== */

const THEME_KEY = 'umlite.theme';
const THEME_SHADOW_ID = 'ul-shadow';

/* ==========================================================================
 *  ① 色彩（原有风格）：保持与 1.24 完全一致的外观
 * ========================================================================== */
const THEME_COLOR = {
  id: 'color',
  label: '色彩',
  hint: '彩色描边与填充（原有风格）',

  /* —— 画布与字体 —— */
  canvasFill: '',                       // '' = 不画背景（露出页面网格）
  fontFamily: FONT,

  /* —— 类 / 对象 / 枚举 / E-R 实体 —— */
  boxFill: '#ffffff', boxStroke: '#94a3b8', boxSW: 1.5,
  softBoxFill: '#ffffff', softBoxStroke: '#a5b4fc',
  boxHeadFill: '#e0e7ff', boxHeadStroke: '#94a3b8',
  softBoxHeadFill: '#ede9fe', softBoxHeadStroke: '#a78bfa',
  boxLineSW: 1, boxAttrSepSW: 2,
  titleFill: '#1e293b', titleSize: 14, titleWeight: 600,
  titleSmFill: '#1e293b', titleSmSize: 12.5, titleSmWeight: 600,
  stereoFill: '#1e293b', stereoSize: 11,
  memberFill: '#475569', memberSize: 12.5,
  erMemberFill: '#1e293b',

  /* —— 参与者（火柴小人） —— */
  actorStroke: '#334155', actorSW: 1.8, actorHeadFill: '#ffffff',
  actorLabelFill: '#1e293b', actorLabelSize: 13, actorLabelWeight: 600,

  /* —— 用例 —— */
  usecaseFill: '#f5f3ff', usecaseStroke: '#8b5cf6', usecaseSW: 1.5,

  /* —— 业务模型斜杠（与主体同色的实线斜杠） —— */
  bizSlash: '#475569', bizSlashSW: 2.2,
  bizActorSlash: '#334155', bizActorSlashSW: 2,
  bizUsecaseSlash: '#8b5cf6', bizUsecaseSlashSW: 1.5,
  bizSeqSlash: '#475569', bizSeqSlashSW: 1.8,

  /* —— 活动图 —— */
  actRoundFill: '#ecfeff', actRoundStroke: '#0891b2', actSW: 1.6, actRoundRx: 22,
  actDiamondFill: '#fef3c7', actDiamondStroke: '#d97706',
  actStartFill: '#0f172a', actStopFill: '#ffffff', actStopStroke: '#0f172a', actStopSW: 2.4,
  actTextFill: '#0f172a', actTextSize: 13,
  actTextSmFill: '#78350f', actTextSmSize: 11.5,

  /* —— 状态图 —— */
  stateFill: '#f0fdf4', stateStroke: '#16a34a', stateSW: 1.6, statePseudoFill: '#0f172a',

  /* —— 泳道 —— */
  swimlaneHFill: 'rgba(224,242,254,0.4)', swimlaneVFill: 'rgba(236,253,245,0.45)',
  swimlaneBarHFill: 'rgba(14,165,233,0.55)', swimlaneBarVFill: 'rgba(16,185,129,0.55)',
  swimlaneSepHStroke: '#0ea5e9', swimlaneSepVStroke: '#10b981', swimlaneSepSW: 2,
  swimlaneTitleFill: '#0369a1', swimlaneTitleSize: 15, swimlaneTitleWeight: 700,
  swimlaneTitleSpacing: '1px',

  /* —— 活动边框（activityEdge）与系统边界 —— */
  actEdgeFill: 'rgba(248,250,255,0.55)', actEdgeStroke: '#4f46e5',
  actEdgeLabelFill: '#4338ca', actEdgeLabelBg: '#f8faff',
  boundaryFill: '#f4f6ff', boundaryStroke: '#6366f1',
  boundaryLabelFill: '#4338ca', boundaryLabelBg: '#f4f6ff',
  frameSW: 1.5, frameRx: 10,

  /* —— 连线 / 端点记号 —— */
  edgeStroke: '#64748b', edgeSW: 1.5, edgeDash: '7 5',
  edgeLabelFill: '#475569', edgeLabelSize: 12, edgeLabelBgFill: '#ffffff',
  edgeLabelBgOpacity: 0.92,
  arrowFill: '#64748b',
  diamondFill: '#64748b', diamondOpenFill: '#ffffff', diamondStroke: '#64748b', diamondOpenSW: 1.6,
  diamondFillSW: 1,
  erSW: 1.6,
  multFill: '#334155', multSize: 11.5,

  /* —— 图标题 —— */
  docTitleFill: '#1e293b', docTitleSize: 19, docTitleWeight: 700,

  /* —— 顺序图 —— */
  seqBoxFill: '#eef2ff', seqBoxStroke: '#6366f1', seqBoxSW: 1.6,
  seqBoxActorFill: '#fff7ed', seqBoxActorStroke: '#f97316',
  seqLifeStroke: '#c7d2fe', seqLifeSW: 1.5, seqLifeDash: '5 5',
  seqMsgStroke: '#334155', seqMsgSW: 1.6, seqMsgDash: '7 5', seqMsgSyncWeight: 600,
  seqStereoSpacing: '0.5px',
  seqMsgTextFill: '#1e293b', seqMsgTextSize: 12.5,
  seqActorTextFill: '#312e81', seqActorTextSize: 13, seqActorTextWeight: 600,
  seqGlyphStroke: '#475569', seqGlyphSW: 1.6, seqGlyphFill: 'none',
  seqStereoFill: '#64748b', seqStereoSize: 10,
  seqCreateFill: '#0f766e', seqCreateSize: 11,
  seqActFill: '#e0e7ff', seqActActorFill: '#e0e7ff', seqActStroke: '#6366f1', seqActSW: 1.5,
  seqActRx: 0,                        // 激活条 / 激活焦点的圆角半径（0 = 直角）
  seqFragFill: '#f8fafc', seqFragOpacity: 0.55, seqFragStroke: '#64748b',
  seqFragSW: 1.3, seqFragDash: '6 4',
  seqFragTagFill: '#e2e8f0', seqFragTagStroke: '#475569',
  seqFragTagTextFill: '#334155', seqFragTagTextSize: 11.5, seqFragTagTextWeight: 700,
  seqFragSepStroke: '#94a3b8', seqFragSepSW: 1.2,
  seqFragSepTextFill: '#475569', seqFragSepTextSize: 10.5,

  /* —— 包 —— */
  pkgFill: '#fffbeb', pkgStroke: '#f59e0b', pkgSW: 1.5,
  pkgTabFill: '#fde68a', pkgTabStroke: '#f59e0b',
  pkgSeam: '#fde68a', pkgGapLine: '#fffbeb', pkgEdgeFill: '#f59e0b',
  pkgTitleFill: '#92400e', pkgMemberFill: '#78350f',

  /* —— 部署节点（立体盒子） —— */
  n3dTopFill: '#d1fae5', n3dSideFill: '#a7f3d0', n3dFaceFill: '#ecfdf5',
  n3dStroke: '#10b981', n3dSW: 1, n3dFaceSW: 1.5,
  n3dTitleFill: '#065f46', n3dMemberFill: '#064e3b',

  /* —— 构件（artifact） —— */
  artFaceFill: '#fff7ed', artFoldFill: '#fed7aa', artStroke: '#f97316',
  artSW: 1.5, artSepSW: 0.8,
  artTitleFill: '#9a3412', artMemberFill: '#7c2d12',

  /* —— 数据库 —— */
  dbBodyFill: '#f0fdfa', dbCapFill: '#ccfbf1', dbStroke: '#14b8a6', dbSW: 1.5,
  dbTitleFill: '#134e4a',

  /* —— 便签 —— */
  noteFaceFill: '#fefce8', noteStroke: '#eab308', noteFoldShadow: '#fef08a',
  noteTitleFill: '#713f12', noteMemberFill: '#713f12',

  /* —— 组件 —— */
  cmpBodyFill: '#f5f3ff', cmpHeadFill: '#ede9fe', cmpHeadStroke: '#8b5cf6',
  cmpStroke: '#8b5cf6', cmpSW: 1.5, cmpIconFill: '#a78bfa',
  cmpTitleFill: '#5b21b6', cmpMemberFill: '#4c1d95',

  /* —— 特效 —— */
  gradients: [],
  shadow: null
};

/* ==========================================================================
 *  ② 简约（参考 Enterprise Architect）
 *
 *  特征：象牙→浅褐渐变填充、黑色 1px 描边、右下轻微投影、浅蓝渐变画布、
 *        标题加粗黑字、连线纯黑细线、顺序图参与者浅青渐变头部。
 * ========================================================================== */
const THEME_PLAIN = {
  id: 'plain',
  label: '简约',
  hint: '黑白细线 + 象牙渐变填充 + 宋体（参考 EA）',

  /* —— 画布与字体 —— */
  canvasFill: '',                        // '' = 不画图内底纹，直接露出页面画布底色
  /* 宋体；拉丁字母先走 Times New Roman（宋体自带的西文就是它的样子，
     而纯 SimSun 的西文比版面预留宽度宽约 20%，会顶出边框） */
  fontFamily: '"Times New Roman", "SimSun", "宋体", "Songti SC", "STSong", serif',

  /* —— 类 / 对象 / 枚举 / E-R 实体 —— */
  boxFill: 'url(#ul-node)', boxStroke: '#000000', boxSW: 1,
  softBoxFill: 'url(#ul-node)', softBoxStroke: '#000000',
  boxHeadFill: 'none', boxHeadStroke: 'none',       // 整框一条渐变，不再叠标题色带
  softBoxHeadFill: 'none', softBoxHeadStroke: 'none',
  boxLineSW: 1, boxAttrSepSW: 1,
  titleFill: '#000000', titleSize: 13.5, titleWeight: 700,
  titleSmFill: '#000000', titleSmSize: 12.5, titleSmWeight: 700,
  stereoFill: '#000000', stereoSize: 10.5,
  memberFill: '#000000', memberSize: 12,
  erMemberFill: '#000000',

  /* —— 参与者（火柴小人） —— */
  actorStroke: '#000000', actorSW: 1.2, actorHeadFill: 'url(#ul-node)',
  actorLabelFill: '#000000', actorLabelSize: 13, actorLabelWeight: 400,

  /* —— 用例 —— */
  usecaseFill: 'url(#ul-uc)', usecaseStroke: '#000000', usecaseSW: 1,

  /* —— 业务模型斜杠 —— */
  bizSlash: '#333333', bizSlashSW: 1.2,
  bizActorSlash: '#000000', bizActorSlashSW: 1.2,
  bizUsecaseSlash: '#333333', bizUsecaseSlashSW: 1,
  bizSeqSlash: '#333333', bizSeqSlashSW: 1,

  /* —— 活动图 —— */
  actRoundFill: 'url(#ul-act)', 
  actRoundStroke: '#000000', actSW: 1, actRoundRx: 16,
  actDiamondFill: '#eaf2b8', actDiamondStroke: '#000000',
  actStartFill: '#000000', actStopFill: '#ffffff', actStopStroke: '#000000', actStopSW: 2,
  actTextFill: '#000000', actTextSize: 12.5,
  actTextSmFill: '#000000', actTextSmSize: 11.5,

  /* —— 状态图 —— */
  stateFill: 'url(#ul-act)', stateStroke: '#000000', stateSW: 1, statePseudoFill: '#000000',

  /* —— 泳道 —— */
  swimlaneHFill: 'rgba(0,0,0,0)', swimlaneVFill: 'rgba(0,0,0,0)',
  // swimlaneBarHFill: '#e7e9ee', swimlaneBarVFill: '#e7e9ee',
  swimlaneBarHFill: 'rgba(0,0,0,0)', swimlaneBarVFill: 'rgba(0,0,0,0)',
  swimlaneSepHStroke: '#000000', swimlaneSepVStroke: '#000000', swimlaneSepSW: 1,
  swimlaneTitleFill: '#000000', swimlaneTitleSize: 12.5, swimlaneTitleWeight: 700,
  swimlaneTitleSpacing: '0',

  /* —— 活动边框（activityEdge）与系统边界 —— */
  actEdgeFill: 'rgba(255,255,255,0.55)', actEdgeStroke: '#000000',
  actEdgeLabelFill: '#000000', actEdgeLabelBg: '#ffffff',
  boundaryFill: 'rgba(255,255,255,0.6)', boundaryStroke: '#000000',
  boundaryLabelFill: '#000000', boundaryLabelBg: '#ffffff',
  frameSW: 1, frameRx: 2,

  /* —— 连线 / 端点记号 —— */
  edgeStroke: '#000000', edgeSW: 1, edgeDash: '5 4',
  edgeLabelFill: '#000000', edgeLabelSize: 12, edgeLabelBgFill: '#ffffff',
  edgeLabelBgOpacity: 0.9,
  arrowFill: '#000000',
  diamondFill: '#000000', diamondOpenFill: '#ffffff', diamondStroke: '#000000', diamondOpenSW: 1,
  diamondFillSW: 1,
  erSW: 1.2,
  multFill: '#000000', multSize: 11.5,

  /* —— 图标题 —— */
  docTitleFill: '#000000', docTitleSize: 18, docTitleWeight: 700,

  /* —— 顺序图 —— */
  seqBoxFill: 'url(#ul-seq)', seqBoxStroke: '#000000', seqBoxSW: 1,
  seqBoxActorFill: 'url(#ul-seq)', seqBoxActorStroke: '#000000',
  seqLifeStroke: '#000000', seqLifeSW: 1, seqLifeDash: '4 4',
  seqMsgStroke: '#000000', seqMsgSW: 1, seqMsgDash: '5 4', seqMsgSyncWeight: 600,
  seqStereoSpacing: '0.2px',
  seqMsgTextFill: '#000000', seqMsgTextSize: 12,
  seqActorTextFill: '#000000', seqActorTextSize: 12.5, seqActorTextWeight: 700,
  seqGlyphStroke: '#000000', seqGlyphSW: 1.2, seqGlyphFill: 'url(#ul-seq)',
  seqStereoFill: '#333333', seqStereoSize: 10,
  seqCreateFill: '#333333', seqCreateSize: 11,
  seqActFill: 'url(#ul-seq)', seqActActorFill: 'url(#ul-seqact)', seqActStroke: '#000000', seqActSW: 1,
  seqActRx: 3,                        // 激活条 / 激活焦点圆角（EA 风格的轻微圆角）
  seqFragFill: 'url(#ul-node)', seqFragOpacity: 0.5, seqFragStroke: '#000000',
  seqFragSW: 1, seqFragDash: '5 4',
  seqFragTagFill: 'url(#ul-node)', seqFragTagStroke: '#000000',
  seqFragTagTextFill: '#000000', seqFragTagTextSize: 11.5, seqFragTagTextWeight: 700,
  seqFragSepStroke: '#000000', seqFragSepSW: 1,
  seqFragSepTextFill: '#333333', seqFragSepTextSize: 10.5,

  /* —— 包 —— */
  pkgFill: 'url(#ul-node)', pkgStroke: '#000000', pkgSW: 1,
  pkgTabFill: '#fdf2e2', pkgTabStroke: '#000000',
  pkgSeam: 'none', pkgGapLine: 'none', pkgEdgeFill: 'none',
  pkgTitleFill: '#000000', pkgMemberFill: '#000000',

  /* —— 部署节点（立体盒子） —— */
  n3dTopFill: '#f7e8d3', n3dSideFill: '#eedcc0', n3dFaceFill: 'url(#ul-node)',
  n3dStroke: '#000000', n3dSW: 1, n3dFaceSW: 1,
  n3dTitleFill: '#000000', n3dMemberFill: '#000000',

  /* —— 构件（artifact） —— */
  artFaceFill: 'url(#ul-node)', artFoldFill: '#f1ddc2', artStroke: '#000000',
  artSW: 1, artSepSW: 0.8,
  artTitleFill: '#000000', artMemberFill: '#000000',

  /* —— 数据库 —— */
  dbBodyFill: 'url(#ul-node)', dbCapFill: '#f8ead4', dbStroke: '#000000', dbSW: 1,
  dbTitleFill: '#000000',

  /* —— 便签 —— */
  noteFaceFill: '#fdf9e2', noteStroke: '#000000', noteFoldShadow: '#e9dfae',
  noteTitleFill: '#000000', noteMemberFill: '#000000',

  /* —— 组件 —— */
  cmpBodyFill: 'url(#ul-node)', cmpHeadFill: 'none', cmpHeadStroke: 'none',
  cmpStroke: '#000000', cmpSW: 1, cmpIconFill: '#9a8a6a',
  cmpTitleFill: '#000000', cmpMemberFill: '#000000',

  /* —— 特效 —— */
  gradients: [
    { id: 'ul-node', x1: 0, y1: 0, x2: 0, y2: 1,
      stops: [[0, '#ffffff'], [0.42, '#fdf4e7'], [1, '#f6e2c8']] },
    { id: 'ul-uc', x1: 0, y1: 0, x2: 0, y2: 1,
      stops: [[0, '#fefaf2'], [0.5, '#f9e9cf'], [1, '#f2dab4']] },
    { id: 'ul-act', x1: 0, y1: 0, x2: 0, y2: 1,
      stops: [[0, '#fffdf0'], [0.5, '#fdf3c4'], [1, '#f7e394']] },
    { id: 'ul-seq', x1: 0, y1: 0, x2: 0, y2: 1,
      stops: [[0, '#f2fbfd'], [1, '#b9e0ea']] },
    { id: 'ul-seqact', x1: 0, y1: 0, x2: 0, y2: 1,
      stops: [[0, '#fdfaf0'], [1, '#e8dcc0']] }
  ],
  shadow: { dx: 2, dy: 2, blur: 1.6, color: '#000000', opacity: 0.32 }
};

const THEMES = { color: THEME_COLOR, plain: THEME_PLAIN };
const THEME_ORDER = ['color', 'plain'];

/* ---------------- 当前主题 ---------------- */

/* 主题来源优先级：?theme=plain（调试 / 分享）> localStorage > 色彩 */
function initialThemeId() {
  try {
    if (typeof location !== 'undefined' && location && location.search) {
      const q = new URLSearchParams(location.search).get('theme');
      if (q && THEMES[q]) return q;
    }
  } catch (e) { /* file:// 或非常规环境下忽略 */ }
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v && THEMES[v]) return v;
  } catch (e) { /* 隐私模式写不进去，忽略 */ }
  return 'color';
}

/* T = 当前主题的 token 表；绘制代码统一从这里取值 */
let T = THEMES[initialThemeId()];

function currentThemeId() { return T.id; }
function currentTheme() { return T; }
function themeShadowURL() { return T.shadow ? `url(#${THEME_SHADOW_ID})` : ''; }

/* 切换配色：只换 token 表 + 记忆选择，不碰模型（位置、代码完全不受影响） */
function setTheme(id) {
  if (!THEMES[id]) return T.id;
  T = THEMES[id];
  try { localStorage.setItem(THEME_KEY, id); } catch (e) { /* 忽略 */ }
  if (typeof document !== 'undefined' && document && document.body) {
    document.body.setAttribute('data-theme', id);
  }
  return T.id;
}

if (typeof document !== 'undefined' && document && document.body) {
  document.body.setAttribute('data-theme', T.id);
}

/* ---------------- 画布样式 ---------------- */

/* 全部视觉规则集中在这里：左边是选择器，右边只引用 token，不写字面色值 */
function buildSvgCss(t) {
  return `
.node-box{fill:${t.boxFill};stroke:${t.boxStroke};stroke-width:${t.boxSW};}
.node-box-soft{fill:${t.softBoxFill};stroke:${t.softBoxStroke};stroke-width:${t.boxSW};}
.node-header{fill:${t.boxHeadFill};stroke:${t.boxHeadStroke};stroke-width:${t.boxSW};}
.node-header-soft{fill:${t.softBoxHeadFill};stroke:${t.softBoxHeadStroke};stroke-width:${t.boxSW};}
.node-title{font-family:${t.fontFamily};font-size:${t.titleSize}px;font-weight:${t.titleWeight};fill:${t.titleFill};}
.node-title-sm{font-family:${t.fontFamily};font-size:${t.titleSmSize}px;font-weight:${t.titleSmWeight};fill:${t.titleSmFill};}
.node-stereo{font-family:${t.fontFamily};font-size:${t.stereoSize}px;font-weight:${t.titleSmWeight};fill:${t.stereoFill};}
.node-member{font-family:${t.fontFamily};font-size:${t.memberSize}px;fill:${t.memberFill};}
.node-actor-label{font-family:${t.fontFamily};font-size:${t.actorLabelSize}px;font-weight:${t.actorLabelWeight};fill:${t.actorLabelFill};}
.usecase-ellipse{fill:${t.usecaseFill};stroke:${t.usecaseStroke};stroke-width:${t.usecaseSW};}
.actor-line{stroke:${t.actorStroke};stroke-width:${t.actorSW};fill:none;}
.actor-head{fill:${t.actorHeadFill};stroke:${t.actorStroke};stroke-width:${t.actorSW};}
.act-round{fill:${t.actRoundFill};stroke:${t.actRoundStroke};stroke-width:${t.actSW};rx:${t.actRoundRx};}
.act-diamond{fill:${t.actDiamondFill};stroke:${t.actDiamondStroke};stroke-width:${t.actSW};}
.act-start{fill:${t.actStartFill};stroke:${t.actStartFill};stroke-width:${t.actSW};}
.act-stop{fill:${t.actStopFill};stroke:${t.actStopStroke};stroke-width:${t.actStopSW};}
.swimlane-h{fill:${t.swimlaneHFill};stroke:none;}
.swimlane-v{fill:${t.swimlaneVFill};stroke:none;}
.swimlane-bar-h{fill:${t.swimlaneBarHFill};}
.swimlane-bar-v{fill:${t.swimlaneBarVFill};}
.swimlane-sep-h{stroke:${t.swimlaneSepHStroke};stroke-width:${t.swimlaneSepSW};}
.swimlane-sep-v{stroke:${t.swimlaneSepVStroke};stroke-width:${t.swimlaneSepSW};}
.swimlane-title{font-family:${t.fontFamily};font-size:${t.swimlaneTitleSize}px;font-weight:${t.swimlaneTitleWeight};fill:${t.swimlaneTitleFill};letter-spacing:${t.swimlaneTitleSpacing};}
.act-text{font-family:${t.fontFamily};font-size:${t.actTextSize}px;fill:${t.actTextFill};}
.act-text-sm{font-family:${t.fontFamily};font-size:${t.actTextSmSize}px;fill:${t.actTextSmFill};}
.state-round{fill:${t.stateFill};stroke:${t.stateStroke};stroke-width:${t.stateSW};}
.state-pseudo{fill:${t.statePseudoFill};stroke:${t.statePseudoFill};}
.edge-line{stroke:${t.edgeStroke};stroke-width:${t.edgeSW};fill:none;stroke-linecap:round;}
.edge-dashed{stroke-dasharray:${t.edgeDash};}
.edge-label{font-family:${t.fontFamily};font-size:${t.edgeLabelSize}px;fill:${t.edgeLabelFill};}
.edge-label-bg{fill:${t.edgeLabelBgFill};opacity:${t.edgeLabelBgOpacity};}
.arrow-fill{fill:${t.arrowFill};}
.arrow-line{stroke:${t.edgeStroke};stroke-width:${t.edgeSW};fill:none;stroke-linecap:round;}
.diamond-fill{fill:${t.diamondFill};stroke:${t.diamondFill};stroke-width:${t.diamondFillSW};}
.diamond-open{fill:${t.diamondOpenFill};stroke:${t.diamondStroke};stroke-width:${t.diamondOpenSW};}
/* E-R 关系端点（鸦爪）：与连线同色，保证各类连线观感统一 */
.er-bar{stroke:${t.edgeStroke};stroke-width:${t.erSW};stroke-linecap:round;}
.er-circle{fill:${t.diamondOpenFill};stroke:${t.edgeStroke};stroke-width:${t.edgeSW};}
.er-foot{stroke:${t.edgeStroke};stroke-width:${t.edgeSW};fill:none;stroke-linecap:round;stroke-linejoin:round;}
.title-text{font-family:${t.fontFamily};font-size:${t.docTitleSize}px;font-weight:${t.docTitleWeight};fill:${t.docTitleFill};}
.mult-text{font-family:${t.fontFamily};font-size:${t.multSize}px;fill:${t.multFill};}
.seq-box{fill:${t.seqBoxFill};stroke:${t.seqBoxStroke};stroke-width:${t.seqBoxSW};}
.seq-box-actor{fill:${t.seqBoxActorFill};stroke:${t.seqBoxActorStroke};}
.seq-life{stroke:${t.seqLifeStroke};stroke-width:${t.seqLifeSW};stroke-dasharray:${t.seqLifeDash};}
.seq-msg{stroke:${t.seqMsgStroke};stroke-width:${t.seqMsgSW};fill:none;}
.seq-msg-dashed{stroke-dasharray:${t.seqMsgDash};}
.seq-msg-text{font-family:${t.fontFamily};font-size:${t.seqMsgTextSize}px;fill:${t.seqMsgTextFill};}
.seq-msg-sync{font-weight:${t.seqMsgSyncWeight};}
.seq-actor-text{font-family:${t.fontFamily};font-size:${t.seqActorTextSize}px;font-weight:${t.seqActorTextWeight};fill:${t.seqActorTextFill};}
.seq-arrow-open{stroke:${t.seqMsgStroke};stroke-width:${t.seqMsgSW};fill:none;stroke-linecap:round;stroke-linejoin:round;}
.seq-glyph{stroke:${t.seqGlyphStroke};stroke-width:${t.seqGlyphSW};fill:${t.seqGlyphFill};stroke-linecap:round;}
.control-arrow{stroke:${t.seqGlyphStroke};stroke-width:${t.seqGlyphSW};fill:none;stroke-linecap:round;}
.boundary-circle{stroke:${t.seqGlyphStroke};stroke-width:${t.seqGlyphSW};fill:${t.actorHeadFill};}
.seq-glyph-ellipse{stroke:${t.seqGlyphStroke};stroke-width:${t.seqGlyphSW};}
.seq-stereo{font-family:${t.fontFamily};font-size:${t.seqStereoSize}px;fill:${t.seqStereoFill};letter-spacing:${t.seqStereoSpacing};}
.seq-create-tag{font-family:${t.fontFamily};font-size:${t.seqCreateSize}px;fill:${t.seqCreateFill};font-style:italic;}
.seq-activation{fill:${t.seqActFill};stroke:${t.seqActStroke};stroke-width:${t.seqActSW};}
.seq-activation-actor{fill:${t.seqActActorFill};}
.seq-frag{fill:${t.seqFragFill};fill-opacity:${t.seqFragOpacity};stroke:${t.seqFragStroke};stroke-width:${t.seqFragSW};stroke-dasharray:${t.seqFragDash};}
.seq-frag-tag{fill:${t.seqFragTagFill};stroke:${t.seqFragTagStroke};stroke-width:1;stroke-dasharray:none;}
.seq-frag-tag-text{font-family:${t.fontFamily};font-size:${t.seqFragTagTextSize}px;font-weight:${t.seqFragTagTextWeight};fill:${t.seqFragTagTextFill};}
.seq-frag-sep{stroke:${t.seqFragSepStroke};stroke-width:${t.seqFragSepSW};stroke-dasharray:none;}
.seq-frag-sep-text{font-family:${t.fontFamily};font-size:${t.seqFragSepTextSize}px;fill:${t.seqFragSepTextFill};font-style:italic;}
.hit{fill:transparent;pointer-events:all;}
`;
}

/* 画布内联样式：所有 font-size 统一乘 uiFontScale，实现字号滑块动态调整 */
function svgStyle() {
  return buildSvgCss(T).replace(/font-size:([\d.]+)px/g, (m, n) => `font-size:${(parseFloat(n) * uiFontScale).toFixed(1)}px`);
}

/* 渐变与投影定义：挂在 <svg> 下，导出 SVG / PNG 时一并带走 */
function themeDefsEl() {
  let any = false;
  const defs = el('defs');
  for (const g of T.gradients || []) {
    const lg = el('linearGradient', { id: g.id, x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2 });
    for (const s of g.stops) {
      lg.appendChild(el('stop', { offset: s[0], 'stop-color': s[1], 'stop-opacity': s[2] }));
    }
    defs.appendChild(lg);
    any = true;
  }
  if (T.shadow) {
    const f = el('filter', {
      id: THEME_SHADOW_ID, x: '-25%', y: '-25%', width: '160%', height: '160%'
    });
    f.appendChild(el('feDropShadow', {
      dx: T.shadow.dx, dy: T.shadow.dy, stdDeviation: T.shadow.blur,
      'flood-color': T.shadow.color, 'flood-opacity': T.shadow.opacity
    }));
    defs.appendChild(f);
    any = true;
  }
  return any ? defs : null;
}
