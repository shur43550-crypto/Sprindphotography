// 版面规划：按「地点」切分版面。
//
// 用户要求（最终版）：
//   · 每版 2~4 张；**版面之间张数可以不同**（2/3/4 都行）
//   · 重点是「**每个版面内部**图片分布均匀」，而不是所有版面数量一致
//   · 同一地点的照片尽量不跨版；地点超过 4 张时在其内部均分
//
// 算法：对每个地区
//   a. 地点 > MAX(4) 张 → 在该地点内部**均分**成若干块
//      （新疆 18 → 3,3,3,3,3,3；大连 11 → 3,3,3,2；川西/九寨沟 8 → 4,4）
//   b. 其余小地点按顺序合并到 TARGET(3)~MAX(4) 张
//
// 历史教训（曾在这里连错三版，保留记录）：
//   · 把「单元数」当照片数切 → 3 个单元就切成 1 组，18 张挤进一版
//   · 用硬性下限过滤候选 → 首块只有 2 张时 DP 无解，退化成"全部塞一组"
//   · 记忆化递归缓存了路径相关的选择 → 只覆盖 39/78 张
//   结论：这类约束用「先均分大块、再顺序合并小块」的直白算法最稳，
//   复杂 DP 收益不明显却极易出错。
import fs from 'node:fs';
import path from 'node:path';

const SITE = 'C:/Users/Sprind/Documents/deepseek-harness/default-workspace/portfolio-new';
const src = JSON.parse(fs.readFileSync(path.join(SITE, '_sources.json'), 'utf8'));

const pad3 = (n) => String(n).padStart(3, '0');
const photos = src.rows.map((r, i) => ({
  out: `${pad3(i + 1)}_${r.file.replace(/\.[^.]+$/, '')}.jpg`,
  // ⚠️ file 必须带着：build-plates.mjs 要用它去 captions.json 里查每张图的介绍。
  //    之前漏了这个字段，导致"逐张介绍"全部查不到、静默留空。
  file: r.file,
  place: r.place, regionId: r.regionId, regionName: r.regionName, regionEn: r.regionEn,
  orient: r.orient, ratio: r.ratio, w: r.w, h: r.h,
}));

/* ── 每版张数规则（按用户要求）──
   一版 2~4 张。注意用户强调的重点是「**每个版面内部**图片分布均匀」，
   而不是「所有版面的张数一致」——所以版面之间张数可以不同（2/3/4 都行），
   但要避免一版只有 1 张、或者某版挤到 5~6 张这种明显失衡的情况。 */
const MIN = 2, TARGET = 3, MAX = 4;

/** 把 n 张尽量均分成 k 份（如 18 → 3,3,3,3,3,3）。 */
function evenParts(n, k) {
  const base = Math.floor(n / k), rem = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < rem ? 1 : 0));
}

/** 一个地点应分几版：以每版 TARGET 张为目标，但每版不超过 MAX。 */
function partCount(n) {
  if (n <= MAX) return 1;
  return Math.ceil(n / MAX);
}

/**
 * 生成版面。规则：
 *   1. 地点照片数 > MAX(4) → 先**均分**成若干块
 *      （新疆 18 → 3,3,3,3,3,3；大连 11 → 3,3,3,2；川西 8 → 4,4；九寨沟 8 → 4,4）
 *      —— 保证同一地点内部各版张数一致，这就是用户要的"版内分布均匀"
 *   2. 其余小地点按顺序合并：累计到 TARGET(3) 张就收版；
 *      若下一个地点整块放进去会超过 MAX(4)，则本版提前收版
 *
 * 写错过的坑（保留记录，避免再犯）：
 *   · 把「单元数」当照片数切 → 3 个单元就切成 1 组，18 张挤进一版
 *   · 用硬性下限过滤候选 → 首块只有 2 张时无解，退化成"全部塞一组"
 *   · 在循环里原地截断 units[i].items，同时主循环又 slice(0, from)
 *     → 同一批照片被重复计入（表现为"重复 22 张、只覆盖 48/78"）
 */
function chooseCut(units) {
  const groups = [];          // 每项是该版覆盖的 [{unit, from, take}]

  // 1. 大地点：均分成 == MAX 张以内的块，每块独占一版
  const small = [];
  for (let u = 0; u < units.length; u++) {
    const n = units[u].items.length;
    if (n > MAX) {
      const parts = evenParts(n, partCount(n));
      let off = 0;
      for (const p of parts) {
        groups.push([{ unit: u, from: off, take: p }]);
        off += p;
      }
    } else {
      small.push(u);
    }
  }

  // 2. 小地点：顺序合并到 TARGET~MAX 张
  let k = 0;
  while (k < small.length) {
    const group = [];
    let size = 0;
    while (k < small.length) {
      const take = units[small[k]].items.length;
      if (size + take <= MAX) {
        group.push({ unit: small[k], from: 0, take });
        size += take;
        k++;
        if (size >= TARGET) break;      // 够了就收版
      } else {
        break;                          // 放不下 → 本版收尾
      }
    }
    if (group.length) groups.push(group);
    else break;                         // 保险，避免死循环
  }
  return groups;
}

const regionOrder = src.regions.map((r) => r.id).concat('other');
const plates = [];

for (const rid of regionOrder) {
  const items = photos.filter((p) => p.regionId === rid);
  if (!items.length) continue;

  const byPlace = new Map();
  for (const p of items) {
    if (!byPlace.has(p.place)) byPlace.set(p.place, []);
    byPlace.get(p.place).push(p);
  }

  // a. 先把地点整理成单元（此处不再预先切分，交给 chooseCut 决定）
  const units = [];
  for (const [place, list] of byPlace) units.push({ place, items: list });

  // b. 顺序打包成各版
  const blocks = chooseCut(units);
  for (const group of blocks) {
    const cur = [], curPlaces = new Set();
    for (const g of group) {
      const u = units[g.unit];
      cur.push(...u.items.slice(g.from, g.from + g.take));
      curPlaces.add(u.place);
    }
    const places = [...curPlaces];
    plates.push({
      place: places.length === 1 ? places[0] : places.join('、'),
      regionId: rid, regionName: items[0].regionName, regionEn: items[0].regionEn,
      places, part: null, items: cur,
    });
  }
}

/* 同地点多版时补 "1/3" 序号 */
const totals = {}, seen = {};
for (const pl of plates) for (const q of pl.places) totals[q] = (totals[q] || 0) + 1;
for (const pl of plates) {
  if (pl.places.length === 1) {
    const q = pl.places[0];
    seen[q] = (seen[q] || 0) + 1;
    if (totals[q] > 1) pl.part = { i: seen[q], n: totals[q] };
  }
}

/* ── 报告 ── */
console.log(`照片 ${photos.length} 张 → ${plates.length} 个版面\n`);
console.log('版  地区      地点                    张数  朝向(横/竖/方)');
console.log('─'.repeat(70));
let sum = 0;
for (const [i, pl] of plates.entries()) {
  const l = pl.items.filter((p) => p.orient === 'landscape').length;
  const po = pl.items.filter((p) => p.orient === 'portrait').length;
  const sq = pl.items.filter((p) => p.orient === 'square').length;
  console.log(
    String(i + 1).padStart(2) + '  ' + pl.regionName.padEnd(7) + '  ' +
    (pl.place + (pl.part ? ` ${pl.part.i}/${pl.part.n}` : '')).padEnd(22) +
    String(pl.items.length).padStart(3) + '   ' + `${l}/${po}/${sq}`
  );
  sum += pl.items.length;
}
console.log('─'.repeat(70));
console.log(`合计 ${sum} 张（应等于 ${photos.length}）`);

const sizes = plates.map((p) => p.items.length);
const mixed = plates.filter((p) => p.places.length > 1);
const avg = sum / plates.length;
const dev = Math.sqrt(sizes.reduce((a, n) => a + (n - avg) ** 2, 0) / sizes.length);

console.log(`每版张数: ${sizes.join(',')}`);
console.log(`范围 ${Math.min(...sizes)}~${Math.max(...sizes)} 张 | 不足 ${MIN} 张: ${sizes.filter((n) => n < MIN).length} | 超过 ${MAX} 张: ${sizes.filter((n) => n > MAX).length}`);
console.log(`张数均匀度: 平均 ${avg.toFixed(2)}，标准差 ${dev.toFixed(3)}`);
console.log(`同一地点跨多版: ${Object.entries(totals).filter(([, n]) => n > 1).map(([q, n]) => `${q}(${n}版)`).join(', ') || '无 ✓'}`);
console.log(`一版含多个地点: ${mixed.length} 版 — ${mixed.map((m) => m.place).join(' / ') || '无'}`);

const dupCheck = new Set();
let dup = 0;
for (const pl of plates) for (const p of pl.items) { if (dupCheck.has(p.out)) dup++; dupCheck.add(p.out); }
console.log(`重复 ${dup} | 覆盖 ${dupCheck.size}/${photos.length}`);

fs.writeFileSync(path.join(SITE, '_plates.json'), JSON.stringify(plates, null, 2), 'utf8');
console.log('\n已写入 _plates.json');
