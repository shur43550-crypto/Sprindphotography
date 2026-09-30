// 用视觉模型为每张照片生成中英双语短注释（与参考海报的「中文＋English」说明对应）。
// 结果存 captions.json（按原图文件名索引），可反复运行、自动续跑、不重复消耗。
//
// 用法:
//   node annotate-captions.mjs [起始序号] [本批张数]
//   不带参数 = 处理全部未完成的
import fs from 'node:fs';
import path from 'node:path';

const SITE = 'C:/Users/Sprind/Documents/deepseek-harness/default-workspace/portfolio-new';
const GRID = path.join(SITE, 'grid');
const SRC = 'C:/Users/Sprind/Desktop/网页';
const CAPTIONS = path.join(SITE, '_build', 'captions.json');

const START = Math.max(0, Number(process.argv[2]) || 0);
const COUNT = Number(process.argv[3]) || Infinity;

const KEY = (() => {
  const yaml = fs.readFileSync(path.join(process.env.USERPROFILE, '.dsh', '.credentials.yaml'), 'utf8');
  const m = yaml.match(/DEEPSEEK_API_KEY:\s*(\S+)/);
  if (!m) throw new Error('未找到 DEEPSEEK_API_KEY');
  return m[1];
})();

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.bmp': 'image/bmp', '.gif': 'image/gif' };
const mimeOf = (ext) => MIME[String(ext).toLowerCase().startsWith('.') ? String(ext).toLowerCase() : `.${String(ext).toLowerCase()}`] || 'image/jpeg';

/* ── 读已完成的注释（支持续跑） ── */
function loadDone() {
  try {
    let t = fs.readFileSync(CAPTIONS, 'utf8');
    if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
    const j = JSON.parse(t);
    return j && typeof j === 'object' ? j : {};
  } catch { return {}; }
}
function saveDone(map) {
  fs.mkdirSync(path.dirname(CAPTIONS), { recursive: true });
  fs.writeFileSync(CAPTIONS, JSON.stringify(map, null, 2), 'utf8');
}

/* ── 找出 grid/ 里对应的图（输出名 = 序号_原名，靠后缀匹配回原图） ── */
const srcFiles = fs.readdirSync(SRC).filter((f) => /\.(jpe?g|png|webp|bmp|gif)$/i.test(f))
  .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));

/** 把「地点 (3).jpg」变成实际的输出名（与 resize-photos.ps1 的规则一致）。
 *  ⚠️ 注意：resize-photos.ps1 的编号是按「System.IO 的排序」生成的，可能与
 *  本脚本的 localeCompare 排序不同。之前用序号拼路径导致找不到文件，
 *  所以这里改为**按文件名后缀匹配** grid/ 里的实际文件，最稳。 */
let gridIndex = null;
function findGridFile(srcName) {
  if (!gridIndex) {
    gridIndex = new Map();
    for (const f of fs.readdirSync(GRID)) {
      // 输出名形如 001_川西 (1).jpg → 取出 "川西 (1)" 作为键
      const base = f.replace(/^\d+_/, '').replace(/\.jpg$/i, '');
      gridIndex.set(base, f);
    }
  }
  const base = path.basename(srcName, path.extname(srcName));
  return gridIndex.get(base) || null;
}

/* ── 解析模型输出 ── */
function parseReply(text) {
  const clean = String(text).replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
  } catch { /* 落到字段抽取 */ }
  const c = clean.match(/"zh"\s*:\s*"([\s\S]*?)"\s*[,}]/);
  const e = clean.match(/"en"\s*:\s*"([\s\S]*?)"\s*[,}]/);
  const p = clean.match(/"place"\s*:\s*"([\s\S]*?)"\s*[,}]/);
  if (!c && !e) return null;
  return { zh: c?.[1] || '', en: e?.[1] || '', place: p?.[1] || '' };
}

async function annotate(imgPath, ext) {
  const buf = fs.readFileSync(imgPath);
  const prompt = [
    '这是一张旅行摄影作品。请为它写一句简短的图注，用于作品集展示。',
    '要求：',
    '1. zh —— 中文图注，12~26 字，具体到画面内容（地形/光线/天气/主体），像摄影集里的说明，不要空泛抒情、不要用"这幅作品展现了"这类套话。',
    '2. en —— 上面的英文翻译，简洁自然，8~18 个单词。',
    '3. place —— 如果画面能看出是哪里（比如雪山、丹霞、海鸥、教堂、湖泊），用中文写 2~6 字的判断；看不出就留空字符串。',
    '只输出一行 JSON，不要解释、不要代码块：',
    '{"zh":"…","en":"…","place":"…"}'
  ].join('\n');

  const res = await fetch('https://api.deepseek.com/anthropic/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-flash',
      max_tokens: 900,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeOf(ext), data: buf.toString('base64') } },
          { type: 'text', text: prompt }
        ]
      }]
    }),
    signal: AbortSignal.timeout(120000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 150)}`);
  const j = await res.json();
  const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  const p = text ? parseReply(text) : null;
  if (!p || (!p.zh && !p.en)) {
    const why = text ? `无法解析: ${text.slice(0, 80)}` : `空响应(stop=${j.stop_reason ?? '?'})`;
    throw new Error(why);
  }
  return {
    zh: String(p.zh || '').trim().slice(0, 60),
    en: String(p.en || '').trim().slice(0, 120),
    place: String(p.place || '').trim().slice(0, 12),
  };
}

/* ── 主流程 ── */
const done = loadDone();
const todo = srcFiles.map((name, i) => ({ name, i })).filter((x) => !done[x.name]);
console.log(`原图 ${srcFiles.length} 张 | 已有注释 ${Object.keys(done).length} | 待处理 ${todo.length}`);
const batch = todo.slice(START, START === 0 && COUNT === Infinity ? undefined : START + COUNT);
console.log(`本次处理 ${batch.length} 张\n`);

let ok = 0, fail = 0;
for (const { name, i } of batch) {
  const gridFile = findGridFile(name);
  if (!gridFile) { console.log(`  ⚠ grid/ 里找不到对应文件: ${name}（先跑图片缩放）`); fail++; continue; }
  const img = path.join(GRID, gridFile);
  try {
    const r = await annotate(img, '.jpg');
    done[name] = r;
    ok++;
    console.log(`  ✅ ${name}`);
    console.log(`      ${r.zh}`);
    console.log(`      ${r.en}${r.place ? '   [' + r.place + ']' : ''}`);
  } catch (e) {
    fail++;
    console.log(`  ❌ ${name} → ${e.message}`);
  }
  if (ok % 10 === 0) saveDone(done);   // 每 10 张落盘一次，中断不丢
}
saveDone(done);
console.log(`\n本批: 成功 ${ok} / 失败 ${fail}`);
console.log(`累计注释: ${Object.keys(done).length} / ${srcFiles.length}`);
console.log('已写入:', CAPTIONS);
