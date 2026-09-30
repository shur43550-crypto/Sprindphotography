// 重新缩放为两档尺寸：长边 1600（展示）+ 800（缩略图），并生成带宽高比的数据清单。
// 为什么要两档：展示图保证清晰度，缩略图让小图库秒开；宽高比内嵌进 HTML 避免加载时跳动（CLS）。
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2] || 'C:/Users/Sprind/Desktop/网页';
const OUT = process.argv[3] || 'C:/Users/Sprind/Documents/deepseek-harness/default-workspace/portfolio-new';
const SCRIPT = 'C:/Users/Sprind/Documents/deepseek-harness/default-workspace/resize-photos.ps1';
const PS = 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
// 三档尺寸，各自匹配它的实际显示场景：
//   thumb 800  → 只给精选区的模糊衬底用（要的就是虚，不需要清晰，越小越省）
//   grid  1600 → 网格里的实际显示图（大屏格子约 400~500 CSS px，2x 屏需要 ~1000 物理像素，
//                给到 1600 有充足余量，不会再发虚）
//   photos2400 → 灯箱与精选大图（精选最大显示到 1200 CSS px，2x 屏需要 2400 物理像素）
const THUMB = path.join(OUT, 'thumb');
const GRID = path.join(OUT, 'grid');
const FULL = path.join(OUT, 'photos');

for (const d of [THUMB, GRID, FULL]) fs.mkdirSync(d, { recursive: true });
// 清掉上一版遗留（旧布局里 photos/ 是 1600，现在语义变了，必须重来）
for (const d of [THUMB, GRID, FULL]) {
  for (const f of fs.readdirSync(d)) {
    if (f.endsWith('.jpg') || f === '_sizes.json') fs.rmSync(path.join(d, f), { force: true });
  }
}

import { execFileSync } from 'node:child_process';
function resize(maxEdge, quality, dst) {
  console.log(`\n--- 缩放 长边${maxEdge} 质量${quality} → ${dst} ---`);
  const out = execFileSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT,
    '-Src', SRC, '-Dst', dst, '-MaxEdge', String(maxEdge), '-Quality', String(quality)],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const tail = out.trim().split(/\r?\n/).slice(-3).join('\n');
  console.log(tail);
}

resize(2400, 92, FULL);    // 精选 / 灯箱大图
resize(1600, 90, GRID);    // 网格显示
resize(800, 80, THUMB);    // 模糊衬底（虚化用）

// ⚠️ PowerShell 的 Set-Content -Encoding UTF8 会写 UTF-8 BOM，JSON.parse 会直接抛错。
// 这个项目里已经踩过多次 BOM 坑，统一用一个读取函数剥掉它。
function readJsonNoBom(file) {
  let text = fs.readFileSync(file, 'utf8');
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  return JSON.parse(text);
}

// 读尺寸清单，生成数据
const sizes = readJsonNoBom(path.join(FULL, '_sizes.json'));
const rows = sizes.map((s) => ({
  out: s.out,
  w: s.w,
  h: s.h,
  ratio: +(s.w / s.h).toFixed(4),
  orient: s.orient,
  kb: s.kb,
  src: s.out.replace(/^\d{3}_/, '').replace(/\.jpg$/i, ''),
}));

const byOrient = rows.reduce((a, r) => { a[r.orient] = (a[r.orient] || 0) + 1; return a; }, {});
const sizeOf = (d) => fs.readdirSync(d).filter((f) => f.endsWith('.jpg'))
  .reduce((a, f) => a + fs.statSync(path.join(d, f)).size, 0);

console.log('\n===== 数据汇总 =====');
console.log('张数:', rows.length, '| 朝向:', JSON.stringify(byOrient));
console.log('dims 取自 photos/（2400 档，比例与原始一致）');
console.log('photos2400 总大小:', (sizeOf(FULL) / 1048576).toFixed(1), 'MB');
console.log('grid1600   总大小:', (sizeOf(GRID) / 1048576).toFixed(1), 'MB');
console.log('thumb800   总大小:', (sizeOf(THUMB) / 1048576).toFixed(1), 'MB');

fs.writeFileSync(path.join(OUT, '_data.json'), JSON.stringify({ rows }, null, 2), 'utf8');
console.log('\n数据已写入:', path.join(OUT, '_data.json'));
