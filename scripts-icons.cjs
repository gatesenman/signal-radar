// 生成内联 SVG 图标表：扫描源码中出现的 Remix Icon 名称，避免依赖图标字体（Wine/部分 Windows 环境下字体加载失败会显示方框）
const fs = require('fs'), path = require('path');
const root = 'node_modules/remixicon/icons', map = {};
for (const cat of fs.readdirSync(root)) for (const f of fs.readdirSync(path.join(root, cat))) map[f.replace('.svg', '')] = path.join(root, cat, f);
const src = ['src', 'electron'].flatMap(d => fs.readdirSync(d).filter(f => /\.(jsx?|cjs)$/.test(f)).map(f => fs.readFileSync(path.join(d, f), 'utf8'))).join('\n');
const used = new Set(); for (const tok of src.match(/[a-z0-9]+(?:-[a-z0-9]+)+/g) || []) { const t = tok.replace(/^ri-/, ''); if (map[t]) used.add(t); }
const out = {}; for (const n of [...used].sort()) out[n] = fs.readFileSync(map[n], 'utf8').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
fs.writeFileSync('src/icons.js', '// 自动生成：node scripts-icons.cjs\nexport default ' + JSON.stringify(out) + ';\n');
console.log('icons', used.size, 'missing check:', ['radar-line', 'stack-line'].map(x => !!out[x]));
