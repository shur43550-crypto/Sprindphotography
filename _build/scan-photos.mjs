// 读取照片文件夹里每张图的尺寸与朝向，并整理成可供网页使用的数据。
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2];
const EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif']);

/** 只解析文件头拿宽高，不整张解码（172MB 也能秒出）。 */
function dims(buf) {
  // PNG: IHDR
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  // BMP: BITMAPINFOHEADER
  if (buf.length > 26 && buf[0] === 0x42 && buf[1] === 0x4D) {
    return { w: buf.readInt32LE(18), h: Math.abs(buf.readInt32LE(22)) };
  }
  // JPEG: 扫 SOF 段
  if (buf.length > 4 && buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const mk = buf[i + 1];
      // SOF0..SOF15，排除 DHT(C4)/JPG(C8)/DAC(CC)
      if (mk >= 0xC0 && mk <= 0xCF && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      if (mk === 0xD8 || (mk >= 0xD0 && mk <= 0xD9)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      if (len < 2) break;
      i += 2 + len;
    }
  }
  // WEBP
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const fc = buf.toString('ascii', 12, 16);
    if (fc === 'VP8X') return { w: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)), h: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)) };
    if (fc === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (fc === 'VP8L') { const n = buf.readUInt32LE(21); return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 }; }
  }
  return { w: 0, h: 0 };
}

const files = fs.readdirSync(SRC).filter((f) => EXT.has(path.extname(f).toLowerCase())).sort();
const rows = [];
for (const f of files) {
  const full = path.join(SRC, f);
  const size = fs.statSync(full).size;
  // 只读前 256KB 就够拿头部信息（JPEG 的 SOF 一般在最前）
  const fd = fs.openSync(full, 'r');
  const buf = Buffer.alloc(Math.min(size, 262144));
  fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  const d = dims(buf);
  const orient = d.w === 0 ? 'unknown' : (d.w > d.h * 1.02 ? 'landscape' : (d.h > d.w * 1.02 ? 'portrait' : 'square'));
  rows.push({ file: f, w: d.w, h: d.h, ratio: d.h ? +(d.w / d.h).toFixed(3) : 0, orient, mb: +(size / 1048576).toFixed(2) });
}

const byOrient = rows.reduce((a, r) => { a[r.orient] = (a[r.orient] || 0) + 1; return a; }, {});
console.log('目录:', SRC);
console.log('图片总数:', rows.length, '| 总计', rows.reduce((a, r) => a + r.mb, 0).toFixed(1), 'MB');
console.log('\n== 朝向分布 ==');
for (const [k, v] of Object.entries(byOrient)) console.log(`  ${k.padEnd(10)} ${v} 张`);

console.log('\n== 明细 ==');
for (const r of rows) {
  console.log(`  ${r.file.padEnd(46)} ${String(r.w).padStart(5)}x${String(r.h).padEnd(5)} 比${String(r.ratio).padEnd(6)} ${r.orient.padEnd(10)} ${r.mb}MB`);
}

const out = 'C:/Users/Sprind/Documents/deepseek-harness/default-workspace/portfolio-new/_sources.json';
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ src: SRC, rows }, null, 2), 'utf8');
console.log('\n已写出清单:', out);
