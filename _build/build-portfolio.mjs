// 生成摄影作品集：瀑布流(masonry) + 确定性打乱交错 + 纵向错位 + 简约动效。
// 与上一版的区别：放弃等高行（太规整），改为不规则的有机排布。
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'C:/Users/Sprind/Documents/deepseek-harness/default-workspace/portfolio-new';
const data = JSON.parse(fs.readFileSync(path.join(OUT, '_data.json'), 'utf8'));
const photos = data.rows;

function sourceOf(name) {
  const n = name.toLowerCase();
  if (/^dji/.test(n)) return 'DJI';
  if (/^dsc/.test(n)) return 'Nikon';
  if (/^img20|^img_|^image_/.test(n)) return '手机';
  if (/^000/.test(n)) return '翻拍';
  return '';
}

// ── 确定性伪随机（固定种子）──
// 为什么不用 Math.random：刷新一次顺序就变，用户会以为图片丢了/串了。
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 打乱时保证横竖**贯穿全篇**交错：
//   最初用"轮流抽"，结果 5 张少数派（3 竖 2 方）在开头就抽光了，后面几十张全是横图，
//   交错感只存在于首屏。改成"按随机间隔把少数派播撒进横图序列"——
//   每张少数派之间隔 6~12 张横图，这样竖/方图会均匀分布在整个页面里。
function interleaveShuffle(items, rand) {
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const landscape = shuffle(items.filter((p) => p.orient === 'landscape'));
  const minority = shuffle(items.filter((p) => p.orient !== 'landscape'));

  const out = [];
  let li = 0;
  for (const m of minority) {
    // 每张少数派前插入 gap 张横图（横图不够时就把剩下的都放进去）
    const gap = 6 + Math.floor(rand() * 7);          // 6~12
    for (let k = 0; k < gap && li < landscape.length; k++) out.push(landscape[li++]);
    out.push(m);
  }
  while (li < landscape.length) out.push(landscape[li++]);

  // 再做一次"反聚集"微调：若某张少数派紧邻另一张少数派，就与后面一张横图换位
  for (let i = 1; i < out.length; i++) {
    if (out[i].orient === 'landscape') continue;
    if (out[i - 1].orient === 'landscape') continue;
    // 找后面第一张横图来交换
    for (let j = i + 1; j < out.length; j++) {
      if (out[j].orient === 'landscape') { [out[i], out[j]] = [out[j], out[i]]; break; }
    }
  }
  return out;
}

// ── 精选：手动挑出的 8 张，用于大幅单张展示区 ──
// 选片依据（逐张看过原图后定的）：题材/色调/构图尽量不重复，且横竖搭配。
// 每项的 title 是我按画面内容起的短标题 —— 想改成你自己的说法，直接改字符串即可。
const FEATURED_PICKS = [
  { stem: 'dji_fly_20260731_210900_151_1785503369729_photo_', title: '河谷的金色时刻', place: '无人机' },
  { stem: 'dji_fly_20260729_214218_51_1785332687981_photo_o', title: '穿过草原的公路', place: '无人机' },
  { stem: 'DSC_7515', title: '水的两种蓝', place: '九寨沟' },
  { stem: 'DSC_5198', title: '雾凇与晴空', place: '' },
  { stem: 'DSC_9549', title: '山谷里的村落', place: '扎尕那' },
  { stem: 'IMG20260726214118', title: '烟囱与满月', place: '' },
  { stem: '000050', title: '机翼之上', place: '' },
  { stem: 'DSC_0218', title: '城市与远山', place: '' },
];

const rand = mulberry32(20260731);
const ordered = interleaveShuffle(photos, rand);

// 先把精选挑出来（保留 picks 里的顺序），其余照旧交错排列
const featured = [];
const rest = [];
for (const p of ordered) {
  const stem = p.src.replace(/\s*\(\d+\)\s*$/, '').trim();   // 去掉 " (1)" 这种副本后缀
  const hit = FEATURED_PICKS.findIndex((f) => f.stem === stem);
  if (hit >= 0 && !featured.some((f) => f.pick === hit)) {
    featured.push({ ...p, pick: hit, title: FEATURED_PICKS[hit].title, place: FEATURED_PICKS[hit].place });
  } else {
    rest.push(p);
  }
}
featured.sort((a, b) => a.pick - b.pick);   // 按 picks 顺序展示

const items = rest.map((p, i) => {
  const stagger = Math.floor(rand() * 3) * 7;
  return {
    full: `photos/${p.out}`,     // 2400 档：灯箱 / 精选大图
    grid: `grid/${p.out}`,       // 1600 档：网格显示（够 2x 屏）
    backdrop: `thumb/${p.out}`,  // 800 档：仅用于模糊衬底
    w: p.w, h: p.h, ratio: p.ratio, orient: p.orient,
    name: p.src, source: sourceOf(p.src), stagger, idx: i,
  };
});

const featItems = featured.map((p, i) => ({
  full: `photos/${p.out}`,
  grid: `grid/${p.out}`,
  backdrop: `thumb/${p.out}`,
  w: p.w, h: p.h, ratio: p.ratio, orient: p.orient,
  name: p.src, source: sourceOf(p.src), idx: i,
  no: String(i + 1).padStart(2, '0'),
  title: p.title || '',
  place: p.place || '',
}));

console.log('精选区:', featItems.length, '张 →', featItems.map((f) => f.no + ' ' + f.title).join(' / '));
if (featItems.length !== FEATURED_PICKS.length) {
  const got = new Set(featured.map((f) => f.pick));
  const miss = FEATURED_PICKS.filter((_, i) => !got.has(i)).map((f) => f.stem);
  console.log('⚠️ 未匹配到的精选条目:', JSON.stringify(miss));
}

// 交错效果自检：前 20 张里竖/方图应分散出现，而不是成堆
const first20 = items.slice(0, 20).map((p) => p.orient[0]).join('');
console.log('其余照片前 20 张朝向序列（l=横 p=竖 s=方）:', first20);

const DATA_JS = JSON.stringify(items);
const FEAT_JS = JSON.stringify(featItems);

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sprind — 摄影作品</title>
<meta name="description" content="Sprind 的摄影作品集：城市、海边与旅途中的片段。">
<style>
/* ============================================================
   设计取向
   · 排布：瀑布流 masonry —— 横竖交错、随机错位，刻意保留不规则感
     （不是等高行那种规整网格；竖图自然占窄列、横图占宽列）
   · 配色三档：纸白 / 墨黑 / 一层灰 —— 颜色交给照片，界面不抢戏
   · 动效四件事：首图缓慢推移 / 滚动逐块揭示 / 悬停轻微提亮 / 灯箱淡入
   ============================================================ */
:root{
  --paper:#faf9f7; --ink:#131313; --ink-2:#6a6a6a;
  --line:rgba(19,19,19,.10);
  --ease:cubic-bezier(.22,.61,.36,1);
  --ease-out:cubic-bezier(.16,1,.3,1);
  --pad:clamp(16px,4.2vw,72px);
  --gap:clamp(8px,1.1vw,16px);
  --maxw:1680px;
}
@media (prefers-color-scheme:dark){
  :root{ --paper:#0e0e0f; --ink:#f2f1ef; --ink-2:#9c9c9c; --line:rgba(242,241,239,.14); }
}
*,*::before,*::after{ box-sizing:border-box; }
html{ -webkit-text-size-adjust:100%; scroll-behavior:smooth; }
@media (prefers-reduced-motion:reduce){
  html{ scroll-behavior:auto; }
  *,*::before,*::after{ animation-duration:.01ms !important; animation-iteration-count:1 !important; transition-duration:.01ms !important; }
}
body{
  margin:0; background:var(--paper); color:var(--ink);
  font-family:"Inter","Helvetica Neue",-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  font-weight:400; line-height:1.65; -webkit-font-smoothing:antialiased;
}
img{ display:block; max-width:100%; }
button{ font:inherit; color:inherit; background:none; border:0; cursor:pointer; }
a{ color:inherit; text-decoration:none; }

/* ── 背景氛围层：两团极淡的模糊光斑，制造"背景是虚的"的空间感 ── */
.bg-blur{
  position:fixed; inset:-18vmax; z-index:-1; pointer-events:none;
  filter:blur(96px) saturate(122%); opacity:.5;
  background:
    radial-gradient(46vmax 46vmax at 14% 16%, #9fc4e8 0%, transparent 62%),
    radial-gradient(42vmax 42vmax at 86% 72%, #f0d3b4 0%, transparent 64%),
    radial-gradient(38vmax 38vmax at 62% 32%, #cfd8e6 0%, transparent 66%);
  animation:bgdrift 34s ease-in-out infinite alternate;
}
@keyframes bgdrift{
  from{ transform:translate3d(0,0,0) scale(1); }
  to{ transform:translate3d(-2.2%,1.6%,0) scale(1.06); }
}
@media (prefers-color-scheme:dark){
  .bg-blur{ opacity:.34;
    background:
      radial-gradient(46vmax 46vmax at 14% 16%, #23405e 0%, transparent 62%),
      radial-gradient(42vmax 42vmax at 86% 72%, #4a3524 0%, transparent 64%),
      radial-gradient(38vmax 38vmax at 62% 32%, #2b3444 0%, transparent 66%);
  }
}

/* ── 精选区：单张大幅展示 + 背景模糊衬底 ── */
.featured-list{ margin-top:clamp(10px,2vw,26px); }
.feat{
  position:relative; display:grid; place-items:center;
  min-height:min(88svh,960px); padding:clamp(26px,7vh,90px) 0;
  isolation:isolate;
}
@media (max-width:700px){ .feat{ min-height:auto; padding:clamp(18px,4vh,42px) 0; } }

/* 背景模糊衬底：同一张图放大 + 大半径模糊 + 压暗，随揭示一起展开，
   像"从虚到实"浮出来，同时补出黑边环境色。 */
.feat-backdrop{
  position:absolute; inset:0; z-index:0; overflow:hidden;
  clip-path:inset(13% 9% 13% 9% round 4px);
  opacity:0;
  transition:clip-path 1.25s var(--ease-out), opacity 1s var(--ease-out);
}
.feat-backdrop img{
  width:100%; height:100%; object-fit:cover;
  filter:blur(56px) brightness(.62) saturate(140%);
  transform:scale(1.22);
}
.feat.is-in .feat-backdrop{ clip-path:inset(0 0 0 0 round 0); opacity:.9; }

.feat-figure{
  position:relative; z-index:1; margin:0; padding:0;
  width:100%; max-width:min(1200px,84vw);
  display:flex; flex-direction:column; align-items:center; gap:clamp(12px,2vh,22px);
  opacity:0; transform:translateY(52px) scale(1.045); filter:blur(12px);
  transition:opacity 1.15s var(--ease-out), transform 1.35s var(--ease-out), filter 1.15s var(--ease-out);
}
.feat.is-in .feat-figure{ opacity:1; transform:none; filter:blur(0); }

.feat-btn{
  position:relative; display:block; width:100%; padding:0; margin:0;
  border-radius:3px; overflow:hidden; cursor:zoom-in;
  box-shadow:0 40px 100px -30px rgba(0,0,0,.55), 0 4px 18px rgba(0,0,0,.16);
  transition:box-shadow .7s var(--ease-out), transform .7s var(--ease-out);
}
.feat-btn img{ width:100%; height:auto; transition:transform 1.6s var(--ease-out); }
.feat-btn:hover{ transform:translateY(-5px); box-shadow:0 56px 130px -30px rgba(0,0,0,.6), 0 6px 22px rgba(0,0,0,.2); }
.feat-btn:hover img{ transform:scale(1.022); }
.feat-btn:focus-visible{ outline:2px solid var(--ink); outline-offset:4px; }

.feat-meta{
  display:flex; align-items:baseline; gap:clamp(10px,1.6vw,20px);
  width:100%; justify-content:center; flex-wrap:wrap;
  opacity:0; transform:translateY(14px);
  transition:opacity .9s var(--ease-out) .22s, transform .9s var(--ease-out) .22s;
}
.feat.is-in .feat-meta{ opacity:1; transform:none; }
.feat-no{ font-size:11px; letter-spacing:.34em; color:var(--ink-2); font-variant-numeric:tabular-nums; }
.feat-title{ font-size:clamp(14px,1.6vw,18px); font-weight:300; letter-spacing:.02em; }
.feat-src{ font-size:11px; letter-spacing:.2em; text-transform:uppercase; color:var(--ink-2); }
.feat-src::before{ content:"·"; margin-right:.6em; opacity:.5; }

/* ── 顶栏 ── */
.topbar{
  position:fixed; inset:0 0 auto 0; z-index:60;
  display:flex; align-items:center; justify-content:space-between;
  padding:22px var(--pad); color:#fff;
  transition:background .6s var(--ease), color .6s var(--ease), padding .6s var(--ease), border-color .6s var(--ease);
  border-bottom:1px solid transparent;
}
.topbar.is-stuck{
  background:color-mix(in srgb,var(--paper) 84%,transparent);
  -webkit-backdrop-filter:saturate(180%) blur(16px); backdrop-filter:saturate(180%) blur(16px);
  color:var(--ink); padding:13px var(--pad); border-bottom-color:var(--line);
}
.brand{ font-size:15px; letter-spacing:.24em; text-transform:uppercase; font-weight:500; }
.nav{ display:flex; gap:clamp(14px,2.2vw,32px); font-size:13px; letter-spacing:.12em; }
.nav a{ opacity:.7; transition:opacity .35s var(--ease); }
.nav a:hover{ opacity:1; }
@media (max-width:640px){ .nav{ display:none; } }

/* ── 首图：缓慢推移（肯·伯恩斯） ── */
.hero{ position:relative; height:100svh; min-height:540px; overflow:hidden; background:#0a0a0b; }
.hero img{
  width:100%; height:100%; object-fit:cover;
  opacity:0; transform:scale(1.12);
  animation:heroIn 2.6s var(--ease-out) .15s forwards, kenburns 26s ease-out 2.7s forwards;
}
@keyframes heroIn{ to{ opacity:1; transform:scale(1.02); } }
@keyframes kenburns{ from{ transform:scale(1.02); } to{ transform:scale(1.10); } }
.hero::after{
  content:""; position:absolute; inset:0;
  background:linear-gradient(180deg,rgba(0,0,0,.40) 0%,rgba(0,0,0,0) 32%,rgba(0,0,0,.08) 58%,rgba(0,0,0,.66) 100%);
}
.hero-inner{ position:absolute; z-index:2; left:var(--pad); right:var(--pad); bottom:clamp(30px,8vh,92px); color:#fff; }
.kicker{ font-size:12px; letter-spacing:.36em; text-transform:uppercase; opacity:0; animation:rise .9s var(--ease-out) .5s forwards; }
.hero-title{
  margin:.45em 0 0; font-weight:300; letter-spacing:.01em; line-height:1.06;
  font-size:clamp(32px,6.6vw,74px);
  opacity:0; transform:translateY(26px); animation:rise 1.1s var(--ease-out) .62s forwards;
}
.hero-sub{
  margin:.85em 0 0; max-width:44ch; font-weight:300; color:rgba(255,255,255,.84);
  font-size:clamp(13px,1.5vw,15px);
  opacity:0; transform:translateY(18px); animation:rise 1.1s var(--ease-out) .82s forwards;
}
@keyframes rise{ to{ opacity:1; transform:none; } }
.scroll-hint{
  position:absolute; z-index:2; left:50%; bottom:16px; translate:-50% 0;
  width:1px; height:46px; background:linear-gradient(rgba(255,255,255,0),rgba(255,255,255,.85));
  animation:hint 2.4s ease-in-out infinite;
}
@keyframes hint{ 0%,100%{ opacity:.2; } 50%{ opacity:.9; } }

/* ── 章节头 ── */
.section{ max-width:var(--maxw); margin:0 auto; padding:clamp(52px,10vh,124px) var(--pad) 0; }
.sec-head{ display:flex; align-items:baseline; justify-content:space-between; gap:18px; flex-wrap:wrap; }
.sec-title{ margin:0; font-weight:300; font-size:clamp(20px,2.5vw,30px); letter-spacing:.02em; }
.sec-meta{ font-size:12px; letter-spacing:.18em; text-transform:uppercase; color:var(--ink-2); }
.rule{ height:1px; background:var(--line); margin:24px 0 0; }
.filters{ display:flex; gap:8px; flex-wrap:wrap; margin-top:20px; }
.chip{
  padding:6px 14px; border:1px solid var(--line); border-radius:999px;
  font-size:12px; letter-spacing:.08em; color:var(--ink-2);
  transition:color .35s var(--ease), border-color .35s var(--ease), background .35s var(--ease);
}
.chip:hover{ color:var(--ink); border-color:color-mix(in srgb,var(--ink) 34%,transparent); }
.chip.is-on{ color:var(--paper); background:var(--ink); border-color:var(--ink); }

/* ── 瀑布流：CSS 多列，天然形成交错的不规则排布 ── */
.grid{
  margin-top:clamp(18px,2.6vw,34px);
  column-gap:var(--gap);
  column-fill:balance;
}
@media (min-width:1500px){ .grid{ column-count:4; } }
@media (min-width:1024px) and (max-width:1499px){ .grid{ column-count:3; } }
@media (min-width:640px) and (max-width:1023px){ .grid{ column-count:2; } }
@media (max-width:639px){ .grid{ column-count:1; } }

.card{
  display:block; width:100%; padding:0; margin:0 0 var(--gap);
  break-inside:avoid; -webkit-column-break-inside:avoid; page-break-inside:avoid;
  position:relative; overflow:hidden; border-radius:2px;
  background:color-mix(in srgb,var(--ink) 6%,transparent);
  /* 纵向错位用 --st 变量控制：打破整齐的行基线，制造随机感 */
  --st:0px; --hov:0px;
  transform:translateY(calc(var(--st) + var(--hov)));
  opacity:0; filter:blur(7px);
  transition:opacity .9s var(--ease-out), filter .9s var(--ease-out),
             translate .5s var(--ease-out), box-shadow .6s var(--ease-out);
  transition-delay:var(--d,0ms);
}
.card.is-in{ opacity:1; filter:blur(0); }
.card:hover{ --hov:-4px; box-shadow:0 18px 46px rgba(0,0,0,.18); }
.card:focus-visible{ outline:2px solid var(--ink); outline-offset:3px; }
.card img{
  width:100%; height:auto;
  transition:transform 1.4s var(--ease-out), opacity .8s var(--ease);
}
.card img.is-loading{ opacity:0; }
.card:hover img{ transform:scale(1.035); }

/* 竖构图稍作强调：细阴影 + 悬停时更明显，免得夹在横图里显得单薄 */
.card[data-orient="portrait"]{ box-shadow:0 2px 10px rgba(0,0,0,.05); }
.card[data-orient="portrait"]:hover{ box-shadow:0 22px 52px rgba(0,0,0,.22); }

.cap{
  position:absolute; inset:auto 0 0 0; z-index:2;
  padding:26px 12px 10px; color:#fff; text-align:left;
  background:linear-gradient(transparent,rgba(0,0,0,.58));
  font-size:12px; letter-spacing:.1em;
  opacity:0; transform:translateY(8px);
  transition:opacity .5s var(--ease), transform .5s var(--ease);
}
.card:hover .cap,.card:focus-visible .cap{ opacity:1; transform:none; }
@media (hover:none){ .cap{ opacity:1; transform:none; } }
.empty{ padding:40px 0; color:var(--ink-2); font-size:14px; }

/* ── 关于 ── */
.about{ display:grid; grid-template-columns:1fr; gap:clamp(18px,3.5vw,52px); margin-top:clamp(18px,3vw,38px); }
@media (min-width:880px){ .about{ grid-template-columns:1.15fr .85fr; align-items:start; } }
.about p{ margin:0 0 1em; font-weight:300; font-size:clamp(14px,1.5vw,16px); color:var(--ink-2); max-width:62ch; }
.about p:first-of-type{ color:var(--ink); font-size:clamp(16px,1.9vw,20px); line-height:1.55; }
.facts{ list-style:none; margin:0; padding:0; border-top:1px solid var(--line); }
.facts li{ display:flex; justify-content:space-between; gap:14px; padding:12px 0; border-bottom:1px solid var(--line); font-size:13px; }
.facts .k{ color:var(--ink-2); letter-spacing:.06em; }

.foot{ max-width:var(--maxw); margin:0 auto; padding:clamp(52px,8vh,104px) var(--pad) 40px; }
.foot-in{
  display:flex; justify-content:space-between; gap:18px; flex-wrap:wrap; align-items:baseline;
  border-top:1px solid var(--line); padding-top:24px;
  font-size:12px; letter-spacing:.16em; text-transform:uppercase; color:var(--ink-2);
}

/* ── 灯箱 ── */
.lb{
  position:fixed; inset:0; z-index:100; display:grid; grid-template-rows:auto 1fr auto;
  background:color-mix(in srgb,#000 93%,transparent);
  -webkit-backdrop-filter:blur(10px); backdrop-filter:blur(10px);
  opacity:0; visibility:hidden; transition:opacity .45s var(--ease), visibility .45s;
}
.lb.is-open{ opacity:1; visibility:visible; }
.lb-top{ display:flex; justify-content:space-between; align-items:center; padding:16px var(--pad); color:rgba(255,255,255,.85); font-size:12px; letter-spacing:.16em; }
.lb-stage{ position:relative; display:grid; place-items:center; padding:0 var(--pad); min-height:0; }
.lb-stage img{
  max-width:100%; max-height:100%; object-fit:contain;
  opacity:0; transform:scale(.97);
  transition:opacity .5s var(--ease-out), transform .5s var(--ease-out);
  box-shadow:0 34px 90px rgba(0,0,0,.6);
}
.lb-stage img.is-shown{ opacity:1; transform:scale(1); }
.lb-btn{
  display:grid; place-items:center; width:46px; height:46px; border-radius:999px;
  color:#fff; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.2);
  font-size:19px; line-height:1; transition:background .3s var(--ease), transform .3s var(--ease);
}
.lb-btn:hover{ background:rgba(255,255,255,.22); }
.lb-btn:active{ transform:scale(.94); }
.lb-arrow{ position:absolute; top:50%; translate:0 -50%; z-index:3; }
.lb-prev{ left:calc(var(--pad) + 4px); } .lb-next{ right:calc(var(--pad) + 4px); }
.lb-close{ padding:7px 14px; border-radius:999px; }
.lb-foot{ padding:14px var(--pad) 22px; color:rgba(255,255,255,.62); font-size:12px; letter-spacing:.1em; display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; }
:focus-visible{ outline:2px solid currentColor; outline-offset:3px; }
@media (max-width:620px){ .lb-arrow{ display:none; } }
</style>
</head>
<body>

<div class="bg-blur" aria-hidden="true"></div>

<header class="topbar" id="topbar">
  <a class="brand" href="#top">Sprind</a>
  <nav class="nav"><a href="#featured">精选</a><a href="#work">作品</a><a href="#about">关于</a></nav>
</header>

<main id="top">
  <section class="hero" id="hero">
    <img id="heroImg" alt="" decoding="async" fetchpriority="high">
    <div class="hero-inner">
      <p class="kicker">Photography</p>
      <h1 class="hero-title">光经过的地方</h1>
      <p class="hero-sub">城市的天际线、海边的黄昏、旅途里随手按下的那些。相机只是借口。</p>
    </div>
    <div class="scroll-hint" aria-hidden="true"></div>
  </section>

  <section class="section featured" id="featured">
    <div class="sec-head">
      <h2 class="sec-title">精选</h2>
      <div class="sec-meta">Selected · <span id="featCount">—</span></div>
    </div>
    <div class="rule"></div>
    <div class="featured-list" id="featuredList"></div>
  </section>

  <section class="section" id="work">
    <div class="sec-head">
      <h2 class="sec-title">作品</h2>
      <div class="sec-meta"><span id="count">—</span> 张 · <span id="range">—</span></div>
    </div>
    <div class="rule"></div>
    <div class="filters" id="filters" role="group" aria-label="按构图筛选">
      <button class="chip is-on" data-filter="all">全部</button>
      <button class="chip" data-filter="landscape">横构图</button>
      <button class="chip" data-filter="portrait">竖构图</button>
      <button class="chip" data-filter="square">方构图</button>
    </div>
    <div class="grid" id="grid"></div>
    <noscript><p class="empty">这个页面需要 JavaScript 来排列作品。</p></noscript>
  </section>

  <section class="section" id="about">
    <div class="sec-head"><h2 class="sec-title">关于</h2><div class="sec-meta">About</div></div>
    <div class="rule"></div>
    <div class="about">
      <div>
        <p>我用一台相机记录那些不打算被记住的瞬间——傍晚被云压住的天、楼顶看下去的城市、朋友走在前面的背影。</p>
        <p>不追求宏大叙事，也不太做重度后期。按下快门那一刻看到的，就是我想留下的。</p>
        <p>如果某张照片让你多停了一下，那它就完成了它的工作。</p>
      </div>
      <ul class="facts">
        <li><span class="k">器材</span><span class="v" id="factGear">—</span></li>
        <li><span class="k">作品数量</span><span class="v" id="factCount">—</span></li>
        <li><span class="k">构图</span><span class="v" id="factOrient">—</span></li>
        <li><span class="k">地点</span><span class="v">中国</span></li>
      </ul>
    </div>
  </section>

  <footer class="foot" id="contact">
    <div class="foot-in"><span>© <span id="year"></span> Sprind</span><span>保留所有权利</span></div>
  </footer>
</main>

<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="作品大图">
  <div class="lb-top">
    <span id="lbIdx">—</span>
    <button class="lb-btn lb-close" id="lbClose" aria-label="关闭（Esc）">关闭</button>
  </div>
  <div class="lb-stage" id="lbStage">
    <button class="lb-btn lb-arrow lb-prev" id="lbPrev" aria-label="上一张（←）">‹</button>
    <img id="lbImg" alt="">
    <button class="lb-btn lb-arrow lb-next" id="lbNext" aria-label="下一张（→）">›</button>
  </div>
  <div class="lb-foot"><span id="lbMeta">—</span><span>← → 切换 · Esc 关闭</span></div>
</div>

<script>
/* ============================================================
   作品数据（自动生成）
   顺序已在构建时做过「确定性打乱 + 横竖交错」，并给每张分配了
   纵向错位量 stagger（0/7/14px）——刷新页面不会变。
   想加标题/地点：给对应条目加 title:'…' / place:'…'。
   ============================================================ */
const PHOTOS = ${DATA_JS};

/* 精选区数据（顺序即展示顺序，与下方网格互不重复） */
const FEATURED = ${FEAT_JS};

const $ = (s, r = document) => r.querySelector(s);
const grid = $('#grid'), filtersBox = $('#filters');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 首图：选分辨率最高的横构图 */
(function initHero() {
  const cands = PHOTOS.filter((p) => p.orient === 'landscape');
  const pick = (cands.length ? cands : PHOTOS).reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a), PHOTOS[0]);
  const img = $('#heroImg');
  img.src = pick.full; img.alt = pick.title || '首图';
})();

let currentFilter = 'all';

function caption(p) {
  const bits = [];
  if (p.title) bits.push(p.title);
  if (p.place) bits.push(p.place);
  if (!bits.length && p.source) bits.push(p.source);
  return bits.join(' · ');
}

function render() {
  const list = currentFilter === 'all' ? PHOTOS : PHOTOS.filter((p) => p.orient === currentFilter);
  grid.innerHTML = '';
  if (!list.length) { grid.innerHTML = '<p class="empty">这个构图下还没有照片。</p>'; return; }

  list.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'card';
    btn.dataset.orient = p.orient;
    btn.style.setProperty('--st', (p.stagger || 0) + 'px');
    // 揭示错开：同一屏内相邻几块相差 ~60ms，避免整块一起跳
    btn.style.setProperty('--d', ((i % 5) * 60) + 'ms');
    btn.setAttribute('aria-label', '查看：' + (p.title || p.name));

    const im = document.createElement('img');
    // 网格用 1600 档（grid/）：大屏格子约 400~500 CSS px，2x 屏需要 ~1000 物理像素；
    // 之前用 800 档在这个尺寸下会发虚，现在有充足余量。
    im.src = p.grid;
    im.width = p.w; im.height = p.h;  // 内嵌真实像素，避免加载时跳动
    im.loading = 'lazy'; im.decoding = 'async';
    im.alt = p.title || '摄影作品';
    im.className = 'is-loading';
    im.addEventListener('load', () => im.classList.remove('is-loading'), { once: true });

    const cap = document.createElement('span');
    cap.className = 'cap';
    cap.textContent = caption(p);

    btn.append(im, cap);
    btn.addEventListener('click', () => openLb(p));
    grid.appendChild(btn);
  });
  observeCards();
}

/* 滚动揭示：淡入 + 去模糊（错位量已由 --st 承担，这里不再平移，避免叠加过多位移） */
let io = null;
function observeCards() {
  if (io) io.disconnect();
  if (REDUCED) { document.querySelectorAll('.card').forEach((c) => c.classList.add('is-in')); return; }
  io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }
  }, { rootMargin: '0px 0px -5% 0px', threshold: 0.03 });
  document.querySelectorAll('.card').forEach((c) => io.observe(c));
}

filtersBox.addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  currentFilter = btn.dataset.filter;
  filtersBox.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-on', c === btn));
  render();
});

/* ── 精选区渲染 ──
   每张 = 模糊衬底 + 大图 + 序号说明；三者由同一个 .is-in 驱动，
   配合 CSS 里不同的 transition-delay，形成"先展开衬底、再落定大图、最后浮现说明"的层次。 */
const featList = document.getElementById('featuredList');
const featIo = REDUCED ? null : new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) { e.target.classList.add('is-in'); featIo.unobserve(e.target); }
  }
}, { rootMargin: '0px 0px -12% 0px', threshold: 0.14 });

FEATURED.forEach((p) => {
  const art = document.createElement('article');
  art.className = 'feat';

  const back = document.createElement('div');
  back.className = 'feat-backdrop';
  back.setAttribute('aria-hidden', 'true');
  const bimg = document.createElement('img');
  bimg.src = p.backdrop; bimg.alt = ''; bimg.loading = 'lazy'; bimg.decoding = 'async';
  back.appendChild(bimg);

  const fig = document.createElement('figure');
  fig.className = 'feat-figure';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'feat-btn';
  btn.setAttribute('aria-label', '查看精选：' + (p.title || p.name));
  const im = document.createElement('img');
  im.src = p.full; im.width = p.w; im.height = p.h;
  im.loading = 'lazy'; im.decoding = 'async';
  im.alt = p.title || '精选作品';
  btn.appendChild(im);

  const meta = document.createElement('figcaption');
  meta.className = 'feat-meta';
  const no = document.createElement('span'); no.className = 'feat-no'; no.textContent = p.no;
  const ti = document.createElement('span'); ti.className = 'feat-title'; ti.textContent = p.title || p.name;
  meta.append(no, ti);
  // 有地点就显示地点，否则回落到器材来源；两个都没有就不加这一栏
  const tail = p.place || p.source;
  if (tail) { const sr = document.createElement('span'); sr.className = 'feat-src'; sr.textContent = tail; meta.appendChild(sr); }

  btn.addEventListener('click', () => openLb(p));
  fig.append(btn, meta);
  art.append(back, fig);
  featList.appendChild(art);

  if (featIo) featIo.observe(art); else art.classList.add('is-in');
});
document.getElementById('featCount').textContent = FEATURED.length;

/* 灯箱要能在精选与网格之间连续翻页，所以用"精选 + 全部"的合并列表 */
const ALL = FEATURED.concat(PHOTOS);

/* 统计 */
$('#count').textContent = PHOTOS.length;
const o = PHOTOS.reduce((a, p) => { a[p.orient] = (a[p.orient] || 0) + 1; return a; }, {});
const gear = [...new Set(PHOTOS.map((p) => p.source).filter(Boolean))];
$('#range').textContent = '2024–2026';
$('#factCount').textContent = PHOTOS.length + ' 张';
$('#factOrient').textContent = '横 ' + (o.landscape || 0) + ' · 竖 ' + (o.portrait || 0) + ' · 方 ' + (o.square || 0);
$('#factGear').textContent = gear.join(' / ') || '—';
$('#year').textContent = new Date().getFullYear();

/* 顶栏 */
const bar = $('#topbar');
const onScroll = () => bar.classList.toggle('is-stuck', window.scrollY > window.innerHeight * 0.7);
onScroll();
addEventListener('scroll', onScroll, { passive: true });

/* 灯箱 */
const lb = $('#lb'), lbImg = $('#lbImg');
let list = ALL, cur = -1;

function openLb(p) {
  // 精选区的图不在网格筛选集合里，但点开后要能继续左右翻 —— 命中精选就用全量列表
  const inFeatured = FEATURED.indexOf(p) >= 0;
  list = (inFeatured || currentFilter === 'all') ? ALL : PHOTOS.filter((x) => x.orient === currentFilter);
  cur = list.indexOf(p);
  showLb();
  lb.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  $('#lbClose').focus();
}
function showLb() {
  const p = list[cur];
  if (!p) return;
  lbImg.classList.remove('is-shown');
  const next = new Image();
  next.src = p.full;
  next.onload = () => {
    lbImg.src = p.full;
    lbImg.alt = p.title || p.name;
    requestAnimationFrame(() => lbImg.classList.add('is-shown'));
  };
  $('#lbIdx').textContent = (cur + 1) + ' / ' + list.length;
  $('#lbMeta').textContent = [p.title, p.place, p.source].filter(Boolean).join(' · ') || p.name;
  for (const d of [1, -1]) { const n = list[cur + d]; if (n) { const i = new Image(); i.src = n.full; } }
}
function closeLb() {
  lb.classList.remove('is-open');
  document.body.style.overflow = '';
  const card = document.querySelectorAll('.card')[cur];
  if (card) card.focus();
}
$('#lbClose').addEventListener('click', closeLb);
$('#lbPrev').addEventListener('click', () => { cur = (cur - 1 + list.length) % list.length; showLb(); });
$('#lbNext').addEventListener('click', () => { cur = (cur + 1) % list.length; showLb(); });
lb.addEventListener('click', (e) => { if (e.target === lb || e.target.id === 'lbStage') closeLb(); });
addEventListener('keydown', (e) => {
  if (!lb.classList.contains('is-open')) return;
  if (e.key === 'Escape') closeLb();
  else if (e.key === 'ArrowLeft') { cur = (cur - 1 + list.length) % list.length; showLb(); }
  else if (e.key === 'ArrowRight') { cur = (cur + 1) % list.length; showLb(); }
});

render();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(OUT, 'index.html'), html, 'utf8');
console.log('已生成:', path.join(OUT, 'index.html'), '|', Math.round(html.length / 1024), 'KB');
console.log('条目数:', items.length);
console.log('错位量分布:', JSON.stringify(items.reduce((a, p) => { a[p.stagger + 'px'] = (a[p.stagger + 'px'] || 0) + 1; return a; }, {})));
