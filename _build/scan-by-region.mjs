// 扫描原图 → 按「地区」分组 → 输出站点数据（尺寸/朝向/地区）。
// 地区从文件名推断（用户已把文件重命名为「地点 (序号).jpg」，如「九寨沟 (3).jpg」）。
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2] || 'C:/Users/Sprind/Desktop/网页';
const OUT = process.argv[3] || 'C:/Users/Sprind/Documents/deepseek-harness/default-workspace/portfolio-new';

/* ── 地区归档表 ──
   键是页面显示的地区名，值是该地区包含的地点关键词（子串匹配）。
   注意：按用户要求——
     · 喀纳斯 / 新疆赛里木湖 都归入「新疆」，且在页面里合并显示为「新疆」
     · 扎尕那 归入「甘肃」（不是川西）
   关键词顺序无所谓，但同一地点不要出现在两个地区里。 */
const REGIONS = [
  { id: 'xinjiang',     name: '新疆',   en: 'Xinjiang',      places: ['喀纳斯', '赛里木湖', '新疆'], aliases: ['喀纳斯', '新疆赛里木湖', '新疆'] },
  { id: 'chuanxi',      name: '川西',   en: 'West Sichuan',  places: ['川西', '九寨沟', '四姑娘山', '稻城亚丁'], aliases: ['川西', '九寨沟', '四姑娘山', '稻城亚丁'] },
  { id: 'gansu',        name: '甘肃',   en: 'Gansu',         places: ['七彩丹霞', '中卫', '扎尕那'], aliases: ['七彩丹霞', '中卫', '扎尕那'] },
  { id: 'liaoning',     name: '辽宁',   en: 'Liaoning',      places: ['大连'], aliases: ['大连'] },
  { id: 'jiangsu',      name: '江苏',   en: 'Jiangsu',       places: ['连云港', '连岛', '花果山'], aliases: ['连云港', '连岛', '花果山'] },
  { id: 'shandong',     name: '山东',   en: 'Shandong',      places: ['青岛'], aliases: ['青岛'] },
  { id: 'heilongjiang', name: '黑龙江', en: 'Heilongjiang',  places: ['哈尔滨'], aliases: ['哈尔滨', '哈尔滨圣索菲亚教堂'] },
  { id: 'qinghai',      name: '青海',   en: 'Qinghai',       places: ['青海'], aliases: ['青海', '青海湖'] },
  { id: 'hubei',        name: '湖北',   en: 'Hubei',         places: ['武汉'], aliases: ['武汉'] },
  { id: 'zhejiang',     name: '浙江',   en: 'Zhejiang',      places: ['杭州'], aliases: ['杭州'] },
];

/* 合并地点：这些地点名在页面里统一显示为同一个地点（用于版面分组与标题）。
   按用户要求：
     · 喀纳斯 / 新疆赛里木湖 / 新疆 → 「新疆」
     · 花果山 / 连岛 / 连云港 → 「连云港」（花果山、连岛都在连云港境内）
     · 哈尔滨圣索菲亚教堂 → 「哈尔滨」
     · 青海湖 → 「青海」 */
const PLACE_MERGE = {
  '喀纳斯': '新疆',
  '新疆赛里木湖': '新疆',
  '花果山': '连云港',
  '连岛': '连云港',
  '哈尔滨圣索菲亚教堂': '哈尔滨',
  '青海湖': '青海',
};

/** 从文件名取出「地点」部分：去掉扩展名与 " (n)" 副本后缀。 */
function placeOf(filename) {
  const stem = path.basename(filename, path.extname(filename));
  const raw = stem.replace(/\s*\(\d+\)\s*$/, '').trim();
  return PLACE_MERGE[raw] || raw;
}

function regionOf(place) {
  for (const r of REGIONS) {
    if (r.places.some((k) => place.includes(k))) return r;
  }
  return { id: 'other', name: '其它', en: 'Others', places: [] };
}

/* ── 从文件头读宽高与朝向（不整张解码） ── */
function dims(buf) {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.length > 26 && buf[0] === 0x42 && buf[1] === 0x4D) return { w: buf.readInt32LE(18), h: Math.abs(buf.readInt32LE(22)) };
  if (buf.length > 4 && buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const mk = buf[i + 1];
      if (mk >= 0xC0 && mk <= 0xCF && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      if (mk === 0xD8 || (mk >= 0xD0 && mk <= 0xD9)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      if (len < 2) break;
      i += 2 + len;
    }
  }
  return { w: 0, h: 0 };
}

const EXTS = /\.(jpe?g|png|webp|bmp|gif)$/i;
const files = fs.readdirSync(SRC, { withFileTypes: true })
  .filter((e) => e.isFile() && EXTS.test(e.name))
  .map((e) => e.name)
  .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));   // 中文按拼音序，让同一地点的挨在一起

const rows = [];
for (const name of files) {
  const full = path.join(SRC, name);
  const size = fs.statSync(full).size;
  const fd = fs.openSync(full, 'r');
  const buf = Buffer.alloc(Math.min(size, 262144));
  fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  const d = dims(buf);
  const place = placeOf(name);
  const region = regionOf(place);
  rows.push({
    file: name,
    place,
    regionId: region.id,
    regionName: region.name,
    regionEn: region.en,
    w: d.w, h: d.h,
    ratio: d.h ? +(d.w / d.h).toFixed(4) : 0,
    orient: d.w === 0 ? 'unknown' : (d.w > d.h * 1.02 ? 'landscape' : (d.h > d.w * 1.02 ? 'portrait' : 'square')),
    mb: +(size / 1048576).toFixed(2),
  });
}

/* ── 汇总 ── */
const byRegion = {};
for (const r of rows) {
  byRegion[r.regionId] ??= { name: r.regionName, en: r.regionEn, places: new Set(), n: 0, w: 0, h: 0 };
  const b = byRegion[r.regionId];
  b.places.add(r.place);
  b.n++;
  if (r.orient === 'landscape') b.w++;
  if (r.orient === 'portrait') b.h++;
}

console.log('目录:', SRC);
console.log('图片:', rows.length, '张 |', rows.reduce((a, r) => a + r.mb, 0).toFixed(1), 'MB\n');
console.log('== 地区分组 ==');
const order = REGIONS.map((r) => r.id).concat('other');
for (const id of order) {
  const b = byRegion[id];
  if (!b) continue;
  console.log(`  ${b.name.padEnd(6)} ${String(b.n).padStart(3)} 张  横${b.w}/竖${b.h}  地点: ${[...b.places].join('、')}`);
}

const out = { src: SRC, regions: REGIONS, rows };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, '_sources.json'), JSON.stringify(out, null, 2), 'utf8');
console.log('\n已写出:', path.join(OUT, '_sources.json'));
