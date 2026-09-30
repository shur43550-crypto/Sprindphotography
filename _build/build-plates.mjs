// 生成摄影作品集（版面式排版）
//   · 每版 2~4 张，版与版之间大留白，内容按地点同类
//   · 版内大小交错（每张宽度不同 + 左右错位）
//   · 两层注释：整版一条中英说明 + **每张图一条简短介绍**
import fs from 'node:fs';
import path from 'node:path';

const SITE = 'C:/Users/Sprind/Documents/deepseek-harness/default-workspace/portfolio-new';
const src = JSON.parse(fs.readFileSync(path.join(SITE, '_sources.json'), 'utf8'));
const platesRaw = JSON.parse(fs.readFileSync(path.join(SITE, '_plates.json'), 'utf8'));

/* ── 每张图的简短介绍 ──
   由 annotate-captions.mjs 用视觉模型逐张看过生成，按原图文件名索引。
   想改某张的说法：改 _build/captions.json 里对应条目，再重跑本脚本。 */
let captions = {};
try {
  let t = fs.readFileSync(path.join(SITE, '_build', 'captions.json'), 'utf8');
  if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);   // PowerShell 写出的 JSON 常带 BOM
  captions = JSON.parse(t);
} catch { console.warn('⚠ 未找到 captions.json，每张图的介绍会留空'); }

const shotText = (srcFile) => {
  const c = captions[srcFile];
  return c ? { zh: c.zh || '', en: c.en || '' } : { zh: '', en: '' };
};

/* ── 整版说明（中英双语）──
   按「地区」匹配（地点已按要求合并，例如喀纳斯/赛里木湖都归入新疆）。
   写成简短、具体的一句，避免空泛抒情。
   想改文案：直接改这里的字符串，然后重跑本脚本即可。 */
const PLATE_TEXT = {
  '新疆': ['高原湖泊、雪山与草场，红路穿过金色的河谷', 'Alpine lakes, snow peaks and pasture, a red road cutting through a golden valley.'],
  '川西': ['川西高原的草甸与雪山，牦牛散落在坡上', 'Highland meadows and snow peaks of western Sichuan, yaks scattered across the slopes.'],
  '云南': ['云南的高原湖泊与云，光线在午后格外通透', 'Plateau lakes and clouds in Yunnan, the light especially clear in the afternoon.'],
  '九寨沟': ['九寨沟的水：钙华、冰凌与层层递进的蓝绿', 'The water of Jiuzhaigou: travertine terraces, icicles, and blue-green deepening layer by layer.'],
  '稻城亚丁': ['稻城亚丁的雪峰、寺院与经幡，云雾在半山缠绕', 'Snow peaks, monasteries and prayer flags at Daocheng Yading, clouds caught halfway up the ridges.'],
  '四姑娘山': ['四姑娘山的针叶林与裸岩，山脊切开云层', 'Conifer forest and bare rock at Mount Siguniang, ridgelines cutting into the clouds.'],
  '七彩丹霞': ['张掖七彩丹霞与沙漠，岩层在雨后颜色最饱和', 'Zhangye Danxia and the desert beyond, strata at their most saturated after rain.'],
  '大连': ['大连的海岸与街道，黄昏把楼群染成暖色', 'The coast and streets of Dalian, dusk warming the facades.'],
  '连云港': ['云台山的雾凇与海边的礁石，冬日的连云港', 'Rime on Mount Huaguo and rocky shores by the sea, Lianyungang in winter.'],
  '苏州': ['苏州的白墙与花木，春日的影子落在墙上', 'White walls and flowering branches in Suzhou, spring shadows falling across the plaster.'],
  '青岛': ['青岛的红瓦与海岸线，海雾从远处慢慢推上来', 'Qingdao’s red roofs and coastline, sea fog rolling in from the distance.'],
  '哈尔滨': ['圣索菲亚教堂的穹顶，金饰在昏暗里仍然发亮', 'The dome of Saint Sophia in Harbin, gilding still catching light in the dim interior.'],
  '青海': ['青海湖的青与蓝，公路沿着湖岸一直延伸', 'The greens and blues of Qinghai Lake, the road running along the shore.'],
  '武汉': ['武汉的城市天际线，在黄昏里退成剪影', 'The Wuhan skyline receding into silhouette at dusk.'],
  '杭州': ['西湖的荷叶与枫枝，初夏光线穿过树影', 'Lotus leaves and maple branches in Hangzhou, early-summer light through the trees.'],
};

/** 取一版的说明：按地区名匹配；找不到就用地区名拼一句兜底。 */
function plateText(pl) {
  const keys = [pl.regionName, ...pl.places, `${pl.regionName}|${pl.places[0]}`];
  for (const k of keys) if (PLATE_TEXT[k]) return { zh: PLATE_TEXT[k][0], en: PLATE_TEXT[k][1] };
  const p = pl.places.join('、');
  return { zh: `${p}的光线与地貌`, en: `Light and terrain around ${pl.places.join(', ')}.` };
}

/* ── 版内宽度：大小交错 ──
   每张宽度不同（满宽 100 / 大 86 / 中 72 / 小 58），并按位置左右错位，
   这样同一版里就形成参考图那种"一大一小、参差落位"的效果。 */
const WIDE_CYCLE = [100, 72, 86, 62, 92];
const TALL_CYCLE = [64, 78, 58, 70];

/** 依据版内第 i 张的朝向与序号给出宽度与横向缩进。 */
function layoutItem(p, i, total) {
  let w;
  if (p.orient === 'portrait') w = TALL_CYCLE[i % TALL_CYCLE.length];
  else if (p.orient === 'square') w = 74;
  else w = WIDE_CYCLE[i % WIDE_CYCLE.length];
  // 一版里第一张给足气势
  if (i === 0 && p.orient === 'landscape') w = 100;
  // 只有 1~2 张的版面：整幅大图
  if (total <= 2) w = 100;
  // 缩进：小幅图交替靠右，制造不对称
  const shift = w >= 95 ? 0 : (i % 2 === 0 ? 0 : (i % 3 === 0 ? 10 : 5));
  return { w, shift };
}

const plates = platesRaw.map((pl, idx) => {
  const t = plateText(pl);
  return {
    ...pl,
    no: idx + 1,
    zh: t.zh,
    en: t.en,
    items: pl.items.map((p, i) => ({ ...p, ...layoutItem(p, i, pl.items.length) })),
  };
});

console.log('版面:', plates.length, '| 每版张数:', plates.map((p) => p.items.length).join(','));
console.log('张数合计:', plates.reduce((a, p) => a + p.items.length, 0));
const noText = plates.filter((p) => !p.zh || !p.en);
console.log('缺说明的版面:', noText.length);

const DATA = JSON.stringify(plates.map((p) => ({
  no: p.no, place: p.place, regionName: p.regionName, regionEn: p.regionEn,
  regionId: p.regionId, places: p.places, part: p.part, zh: p.zh, en: p.en,
  items: p.items.map((it) => {
    const st = shotText(it.file);          // 每张图的简短介绍（来自 captions.json）
    return {
      out: it.out, orient: it.orient, ratio: it.ratio,
      pw: it.w, ph: it.h,        // 原始像素尺寸（用于 img 的 width/height 防跳动）
      width: it.w,               // 版面内宽度百分比 —— 注意 layoutItem 返回的字段名叫 w，
      shift: it.shift,           // 之前误读成 it.width 导致宽度丢失、--w 变成 undefined
      szh: st.zh, sen: st.en,
    };
  }),
})));

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sprind — 摄影作品</title>
<meta name="description" content="Sprind 的旅行摄影作品集，按地点分版编排：新疆、川西、甘肃、辽宁、江苏、山东、黑龙江、青海、湖北、浙江。">
<style>
/* ============================================================
   版面式排版
   · 一版 3~5 张，版与版之间留出大片空白
   · 版内大小交错（每张宽度不同 + 左右错位）
   · 说明是「整版级别」的一条中英双语文字，不逐张注释
   ============================================================ */
:root{
  --paper:#f7f6f3; --ink:#141414; --ink-2:#8a8a86; --ink-3:#b8b8b4;
  --line:rgba(20,20,20,.12);
  --ease:cubic-bezier(.22,.61,.36,1);
  --ease-out:cubic-bezier(.16,1,.3,1);
  --pad:clamp(20px,7vw,150px);
  /* 版面之间的留白：整个页面的呼吸感主要靠它 */
  --plate-gap:clamp(80px,20vh,240px);
}
@media (prefers-color-scheme:dark){
  :root{ --paper:#0d0d0e; --ink:#f0efec; --ink-2:#8e8e8a; --ink-3:#57575a; --line:rgba(240,239,236,.16); }
}
*,*::before,*::after{ box-sizing:border-box; }
html{ -webkit-text-size-adjust:100%; scroll-behavior:smooth; }
@media (prefers-reduced-motion:reduce){
  html{ scroll-behavior:auto; }
  *,*::before,*::after{ animation-duration:.01ms !important; animation-iteration-count:1 !important; transition-duration:.01ms !important; }
}
body{
  margin:0; background:var(--paper); color:var(--ink);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif;
  font-weight:350; line-height:1.75; -webkit-font-smoothing:antialiased;
}
img{ display:block; max-width:100%; }
button{ font:inherit; color:inherit; background:none; border:0; cursor:pointer; }
a{ color:inherit; text-decoration:none; }
.en{ font-family:"Inter","Helvetica Neue",Helvetica,Arial,sans-serif; }

/* ── 顶栏 ── */
.topbar{
  position:fixed; inset:0 0 auto 0; z-index:60;
  display:flex; align-items:center; justify-content:space-between; gap:16px;
  padding:18px var(--pad);
  background:color-mix(in srgb,var(--paper) 84%,transparent);
  -webkit-backdrop-filter:saturate(180%) blur(14px); backdrop-filter:saturate(180%) blur(14px);
  border-bottom:1px solid transparent;
  transition:border-color .5s var(--ease), padding .5s var(--ease);
}
.topbar.is-scrolled{ border-bottom-color:var(--line); padding:12px var(--pad); }
.brand{ font-size:13px; letter-spacing:.32em; text-transform:uppercase; font-weight:450; }
.brand small{ display:block; font-size:10px; letter-spacing:.2em; color:var(--ink-2); margin-top:2px; }
.nav{ display:flex; gap:2px; overflow-x:auto; scrollbar-width:none; max-width:62vw; }
.nav::-webkit-scrollbar{ display:none; }
.nav button{
  white-space:nowrap; padding:6px 11px; font-size:12.5px; letter-spacing:.06em;
  color:var(--ink-2); border-radius:2px;
  transition:color .35s var(--ease), background .35s var(--ease);
}
.nav button:hover{ color:var(--ink); }
.nav button.is-on{ color:var(--ink); background:color-mix(in srgb,var(--ink) 8%,transparent); }
@media (max-width:560px){ .nav{ display:none; } }

/* ── 封面 ── */
.hero{ padding:clamp(130px,24vh,260px) var(--pad) clamp(90px,22vh,220px); }
.hero .kicker{ font-size:11px; letter-spacing:.42em; text-transform:uppercase; color:var(--ink-2); }
.hero h1{ margin:.34em 0 0; font-weight:200; letter-spacing:.012em; line-height:1.04; font-size:clamp(38px,9vw,132px); }
.hero .sub{ margin:1.2em 0 0; max-width:38ch; color:var(--ink-2); font-size:clamp(13px,1.5vw,16px); }
.hero .meta{
  margin-top:clamp(40px,8vh,90px); padding-top:18px; border-top:1px solid var(--line);
  display:flex; gap:clamp(16px,4vw,64px); flex-wrap:wrap;
  font-size:12px; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-2);
}
.hero .meta b{ display:block; font-size:clamp(17px,2.2vw,26px); font-weight:300; letter-spacing:.02em; color:var(--ink); margin-top:6px; text-transform:none; }

/* ── 版面 ── */
.plate{ padding:var(--plate-gap) var(--pad) 0; }
.plate:last-of-type{ padding-bottom:var(--plate-gap); }
.plate-head{ max-width:1180px; }
.plate-no{ font-size:11px; letter-spacing:.3em; color:var(--ink-3); font-variant-numeric:tabular-nums; }
.plate-title{
  margin:.5em 0 0; font-weight:250; letter-spacing:.02em;
  font-size:clamp(22px,4.2vw,52px); line-height:1.15;
}
.plate-title .en{
  display:block; margin-top:.7em; font-size:.3em; letter-spacing:.26em;
  text-transform:uppercase; color:var(--ink-2); font-weight:400;
}
.plate-desc{
  margin:clamp(18px,3.4vh,34px) 0 0; max-width:46ch;
  font-size:clamp(13px,1.45vw,15.5px); color:var(--ink); line-height:1.8;
}
.plate-desc .en{ display:block; margin-top:.5em; color:var(--ink-2); font-size:.86em; line-height:1.7; }
.plate-meta{ margin-top:clamp(12px,2vh,20px); font-size:11.5px; letter-spacing:.16em; text-transform:uppercase; color:var(--ink-3); }

/* 图片区：多列 + 每张不同宽度 → 大小交错。
   每版只有 2~4 张，用 2 列就够（3 列会让每张偏窄、且刚够一列 1~2 张显得散）。 */
.plate-body{ margin-top:clamp(46px,9vh,120px); column-count:2; column-gap:clamp(20px,3.4vw,64px); }
@media (max-width:720px){ .plate-body{ column-count:1; } }

.shot{
  break-inside:avoid; -webkit-column-break-inside:avoid; page-break-inside:avoid;
  width:var(--w,100%);
  margin:0 0 clamp(34px,7vh,86px);
  margin-left:var(--shift,0);
  opacity:0; transform:translateY(44px); filter:blur(11px);
  transition:opacity 1.1s var(--ease-out), transform 1.25s var(--ease-out), filter 1.1s var(--ease-out);
  transition-delay:var(--delay,0ms);
  will-change:opacity, transform;
}
.shot.is-in{ opacity:1; transform:none; filter:blur(0); }
.shot-btn{
  display:block; width:100%; padding:0; position:relative; overflow:hidden;
  background:color-mix(in srgb,var(--ink) 5%,transparent); border-radius:1px; cursor:zoom-in;
  transition:box-shadow .7s var(--ease-out);
}
/* 视差用：图片在框内缓慢位移 + 轻微放大（保证位移时不露边） */
.shot-inner{ transform:translate3d(0,var(--py,0px),0) scale(1.06); transition:transform .9s var(--ease-out); }
.shot-btn img{ width:100%; height:auto; display:block; }
.shot-btn:hover{ box-shadow:0 34px 80px -26px rgba(0,0,0,.45); }
.shot-btn:hover .shot-inner{ transform:translate3d(0,var(--py,0px),0) scale(1.09); }
.shot-btn:focus-visible{ outline:1.5px solid var(--ink); outline-offset:5px; }

/* 每张图的简短介绍：图片下方、与图片左对齐，序号 + 中文 + 英文 */
.shot-cap{
  margin:clamp(9px,1.5vh,15px) 0 0;
  display:flex; gap:clamp(8px,1vw,14px); align-items:baseline;
}
.shot-no{
  flex:none; font-size:10.5px; letter-spacing:.16em; color:var(--ink-3);
  font-variant-numeric:tabular-nums; padding-top:2px;
}
.shot-cap-body{ min-width:0; }
.shot-cap-zh{ display:block; font-size:clamp(12px,1.25vw,14px); line-height:1.65; color:var(--ink); }
.shot-cap-en{ display:block; margin-top:3px; font-size:clamp(10.5px,1vw,11.5px); line-height:1.55; color:var(--ink-2); }
@media (max-width:720px){ .shot{ width:100% !important; margin-left:0 !important; } }

/* ── 页脚 ── */
.foot{ padding:clamp(60px,12vh,150px) var(--pad) 48px; }
.foot-in{
  border-top:1px solid var(--line); padding-top:26px;
  display:flex; justify-content:space-between; gap:18px; flex-wrap:wrap;
  font-size:11.5px; letter-spacing:.18em; text-transform:uppercase; color:var(--ink-2);
}

/* ── 灯箱 ── */
.lb{
  position:fixed; inset:0; z-index:100; display:grid; grid-template-rows:auto 1fr auto;
  background:color-mix(in srgb,#0a0a0a 95%,transparent);
  -webkit-backdrop-filter:blur(14px); backdrop-filter:blur(14px);
  opacity:0; visibility:hidden; transition:opacity .45s var(--ease), visibility .45s;
}
.lb.is-open{ opacity:1; visibility:visible; }
.lb-top{ display:flex; justify-content:space-between; align-items:center; padding:16px var(--pad); color:rgba(255,255,255,.82); font-size:11.5px; letter-spacing:.2em; }
.lb-stage{ position:relative; display:grid; place-items:center; padding:0 var(--pad); min-height:0; }
.lb-stage img{
  max-width:100%; max-height:100%; object-fit:contain;
  opacity:0; transform:scale(.965);
  transition:opacity .55s var(--ease-out), transform .7s var(--ease-out);
  box-shadow:0 40px 110px rgba(0,0,0,.66);
}
.lb-stage img.is-shown{ opacity:1; transform:scale(1); }
.lb-btn{
  display:grid; place-items:center; min-width:44px; height:44px; padding:0 14px; border-radius:999px;
  color:#fff; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.22);
  font-size:14px; transition:background .3s var(--ease), transform .3s var(--ease);
}
.lb-btn:hover{ background:rgba(255,255,255,.2); }
.lb-btn:active{ transform:scale(.94); }
.lb-arrow{ position:absolute; top:50%; translate:0 -50%; z-index:3; font-size:19px; min-width:46px; }
.lb-prev{ left:calc(var(--pad) + 2px); } .lb-next{ right:calc(var(--pad) + 2px); }
.lb-foot{ padding:14px var(--pad) 22px; color:rgba(255,255,255,.6); font-size:11.5px; display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; }
.lb-foot .lb-cap{ color:rgba(255,255,255,.88); max-width:60ch; }
.lb-foot .lb-cap .en{ display:block; color:rgba(255,255,255,.58); margin-top:3px; }
@media (max-width:620px){ .lb-arrow{ display:none; } }

.totop{
  position:fixed; right:clamp(14px,3vw,34px); bottom:clamp(14px,3vw,34px); z-index:55;
  width:44px; height:44px; border-radius:999px; display:grid; place-items:center;
  background:color-mix(in srgb,var(--ink) 88%,transparent); color:var(--paper);
  font-size:15px; opacity:0; visibility:hidden; transform:translateY(10px);
  transition:opacity .4s var(--ease), transform .4s var(--ease), visibility .4s;
}
.totop.is-on{ opacity:1; visibility:visible; transform:none; }
:focus-visible{ outline:2px solid currentColor; outline-offset:3px; }
</style>
</head>
<body>

<header class="topbar" id="topbar">
  <div class="brand">Sprind<small>Photography</small></div>
  <nav class="nav" id="nav" aria-label="地区导航"></nav>
</header>

<main>
  <section class="hero">
    <p class="kicker">Selected Works · 2024–2026</p>
    <h1>光经过的地方</h1>
    <p class="sub">从新疆的高原湖泊到川西的雪山寺院，从大连的海岸到青岛的红瓦。</p>
    <div class="meta" id="heroMeta"></div>
  </section>

  <div id="plates"></div>

  <footer class="foot">
    <div class="foot-in">
      <span>© <span id="year"></span> Sprind</span>
      <span id="footCount">—</span>
    </div>
  </footer>
</main>

<button class="totop" id="totop" aria-label="回到顶部">↑</button>

<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="作品大图">
  <div class="lb-top">
    <span id="lbIdx">—</span>
    <button class="lb-btn" id="lbClose" aria-label="关闭（Esc）">关闭</button>
  </div>
  <div class="lb-stage" id="lbStage">
    <button class="lb-btn lb-arrow lb-prev" id="lbPrev" aria-label="上一张（←）">‹</button>
    <img id="lbImg" alt="">
    <button class="lb-btn lb-arrow lb-next" id="lbNext" aria-label="下一张（→）">›</button>
  </div>
  <div class="lb-foot">
    <span class="lb-cap" id="lbCap"></span>
    <span>← → 切换 · Esc 关闭</span>
  </div>
</div>

<script>
/* ============================================================
   数据：版面列表（含整版双语说明与版内每张的宽度）
   ============================================================ */
const PLATES = ${DATA};

const $ = (s, r = document) => r.querySelector(s);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 扁平列表：灯箱跨版连续翻页 */
const ALL = [];
let total = 0;
for (const pl of PLATES) for (const p of pl.items) { p.plate = pl; ALL.push(p); total++; }

/* ── 封面统计 ── */
const regions = [...new Map(PLATES.map((p) => [p.regionId, p.regionName])).values()];
$('#heroMeta').innerHTML = [
  ['地区', regions.length],
  ['版面', PLATES.length],
  ['作品', total],
].map(([k, v]) => \`<span>\${k}<b>\${v}</b></span>\`).join('');
$('#year').textContent = new Date().getFullYear();
$('#footCount').textContent = total + ' Photographs · ' + PLATES.length + ' Plates';

/* ── 导航：按地区，点击跳到该地区第一个版面 ── */
const nav = $('#nav');
const navRegions = [];
for (const pl of PLATES) {
  if (!navRegions.some((r) => r.id === pl.regionId)) navRegions.push({ id: pl.regionId, name: pl.regionName, firstPlate: pl.no });
}
navRegions.forEach((r) => {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = r.name; b.dataset.plate = r.firstPlate;
  b.addEventListener('click', () => {
    document.getElementById('p' + r.firstPlate).scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
  });
  nav.appendChild(b);
});

/* ── 渲染版面 ── */
const shots = [];
let photoNo = 0;          // 全局照片序号，用于每张介绍左侧的编号
for (const pl of PLATES) {
  const sec = document.createElement('section');
  sec.className = 'plate';
  sec.id = 'p' + pl.no;
  sec.dataset.region = pl.regionId;

  const name = pl.part ? (pl.place + ' · ' + pl.part.i + '/' + pl.part.n) : pl.place;
  const head = document.createElement('div');
  head.className = 'plate-head';
  head.innerHTML =
    '<div class="plate-no">' + String(pl.no).padStart(2, '0') + ' / ' + String(PLATES.length).padStart(2, '0') + '</div>' +
    '<h2 class="plate-title">' + name + '<span class="en">' + (pl.regionEn || '') + (pl.places.length > 1 ? ' · ' + pl.places.join(' / ') : '') + '</span></h2>' +
    '<p class="plate-desc">' + pl.zh + '<span class="en">' + pl.en + '</span></p>' +
    '<div class="plate-meta">' + pl.items.length + ' Photographs · ' + pl.regionName + '</div>';

  const body = document.createElement('div');
  body.className = 'plate-body';

  pl.items.forEach((p, i) => {
    const shot = document.createElement('div');
    shot.className = 'shot';
    shot.style.setProperty('--w', p.width + '%');
    shot.style.setProperty('--shift', (p.shift || 0) + '%');
    shot.style.setProperty('--delay', ((i % 3) * 90) + 'ms');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shot-btn';
    btn.setAttribute('aria-label', '查看：' + (p.szh || pl.place));    const inner = document.createElement('div');
    inner.className = 'shot-inner';
    const im = document.createElement('img');
    im.src = 'grid/' + p.out;
    im.width = p.pw; im.height = p.ph;
    im.loading = 'lazy'; im.decoding = 'async';
    im.alt = p.szh || name;
    inner.appendChild(im);
    btn.appendChild(inner);
    shot.appendChild(btn);

    // 每张图的简短介绍（放在图片下方，与图片左对齐）
    if (p.szh || p.sen) {
      const cap = document.createElement('p');
      cap.className = 'shot-cap';
      const idx = document.createElement('span');
      idx.className = 'shot-no';
      idx.textContent = String(++photoNo).padStart(2, '0');
      const body = document.createElement('span');
      body.className = 'shot-cap-body';
      const zh = document.createElement('span');
      zh.className = 'shot-cap-zh';
      zh.textContent = p.szh || '';
      body.appendChild(zh);
      if (p.sen) {
        const en = document.createElement('span');
        en.className = 'shot-cap-en en';
        en.textContent = p.sen;
        body.appendChild(en);
      }
      cap.append(idx, body);
      shot.appendChild(cap);
    }
    body.appendChild(shot);
    shots.push(shot);

    btn.addEventListener('click', () => openLb(p, shot));
  });

  sec.append(head, body);
  document.getElementById('plates').appendChild(sec);
}

/* ── 揭示动画 ── */
if (REDUCED) {
  shots.forEach((s) => s.classList.add('is-in'));
} else {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.04 });
  shots.forEach((s) => io.observe(s));
}

/* ── 滚动视差 + 导航高亮 + 顶栏/回到顶部 ── */
const bar = $('#topbar'), toTop = $('#totop'), navBtns = [...nav.children];
const plateEls = PLATES.map((pl) => document.getElementById('p' + pl.no));
let ticking = false;

function onFrame() {
  const vh = innerHeight;
  bar.classList.toggle('is-scrolled', scrollY > 40);
  toTop.classList.toggle('is-on', scrollY > vh * 1.2);

  if (!REDUCED) {
    for (const s of shots) {
      const r = s.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) continue;
      const center = r.top + r.height / 2 - vh / 2;
      const py = Math.max(-16, Math.min(16, (-center / vh) * 26));
      const inner = s.querySelector('.shot-inner');
      if (inner) inner.style.setProperty('--py', py.toFixed(2) + 'px');
    }
  }

  // 当前版面 → 高亮它所属的地区
  let activeRegion = navRegions[0]?.id;
  for (let i = 0; i < plateEls.length; i++) {
    const el = plateEls[i];
    if (el && el.getBoundingClientRect().top <= vh * 0.38) activeRegion = PLATES[i].regionId;
  }
  navBtns.forEach((b) => {
    const on = b.dataset.region ? b.dataset.region === activeRegion
      : navRegions.find((r) => r.name === b.textContent)?.id === activeRegion;
    b.classList.toggle('is-on', !!on);
  });
  const onBtn = navBtns.find((b) => b.classList.contains('is-on'));
  if (onBtn && nav.scrollWidth > nav.clientWidth) {
    const want = onBtn.offsetLeft - nav.clientWidth / 2 + onBtn.offsetWidth / 2;
    if (Math.abs(nav.scrollLeft - want) > 40) nav.scrollTo({ left: want, behavior: REDUCED ? 'auto' : 'smooth' });
  }
  ticking = false;
}
function requestFrame() { if (!ticking) { ticking = true; requestAnimationFrame(onFrame); } }
addEventListener('scroll', requestFrame, { passive: true });
addEventListener('resize', requestFrame);
onFrame();
toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' }));

/* ── 灯箱 ── */
const lb = $('#lb'), lbImg = $('#lbImg'), lbCap = $('#lbCap');
let cur = -1, returnFocus = null;

function openLb(p, shotEl) {
  cur = ALL.indexOf(p);
  returnFocus = shotEl || null;
  showLb();
  lb.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  $('#lbClose').focus();
}
function showLb() {
  const p = ALL[cur];
  if (!p) return;
  lbImg.classList.remove('is-shown');
  const next = new Image();
  next.src = 'photos/' + p.out;
  next.onload = () => {
    lbImg.src = 'photos/' + p.out;
    lbImg.alt = p.plate.place;
    requestAnimationFrame(() => lbImg.classList.add('is-shown'));
  };
  $('#lbIdx').textContent = (cur + 1) + ' / ' + ALL.length + '   ·   ' + p.plate.regionName + ' · ' + p.plate.place;
  // 说明用整版级别的那条
  lbCap.innerHTML = p.plate.zh + (p.plate.en ? '<span class="en">' + p.plate.en + '</span>' : '');
  for (const d of [1, -1, 2, -2]) { const n = ALL[cur + d]; if (n) { const i = new Image(); i.src = 'photos/' + n.out; } }
}
function closeLb() {
  lb.classList.remove('is-open');
  document.body.style.overflow = '';
  if (returnFocus) returnFocus.querySelector('.shot-btn')?.focus();
}
$('#lbClose').addEventListener('click', closeLb);
$('#lbPrev').addEventListener('click', () => { cur = (cur - 1 + ALL.length) % ALL.length; showLb(); });
$('#lbNext').addEventListener('click', () => { cur = (cur + 1) % ALL.length; showLb(); });
lb.addEventListener('click', (e) => { if (e.target === lb || e.target.id === 'lbStage') closeLb(); });
addEventListener('keydown', (e) => {
  if (!lb.classList.contains('is-open')) return;
  if (e.key === 'Escape') closeLb();
  else if (e.key === 'ArrowLeft') { cur = (cur - 1 + ALL.length) % ALL.length; showLb(); }
  else if (e.key === 'ArrowRight') { cur = (cur + 1) % ALL.length; showLb(); }
});

/* 触屏滑动：左右切换、下滑关闭 */
let tx = 0, ty = 0;
lb.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
lb.addEventListener('touchend', (e) => {
  const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
  if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)) {
    cur = (cur + (dx < 0 ? 1 : -1) + ALL.length) % ALL.length; showLb();
  } else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) closeLb();
}, { passive: true });
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(SITE, 'index.html'), html, 'utf8');
console.log('\n已生成:', path.join(SITE, 'index.html'), '|', Math.round(html.length / 1024), 'KB');
