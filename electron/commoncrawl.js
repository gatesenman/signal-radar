// Common Crawl：CC-NEWS（WARC 流式解析，不落原始文件）+ CDX 索引（域名/页面增长）
const zlib = require('zlib'), fs = require('fs'), path = require('path');
const { Readable } = require('stream');
const UA = 'SignalRadar/1.0 (desktop research app; admin@signalradar.app)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function ccFetch(url, opt = {}, tries = 5) { // 503/504 指数退避
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { headers: { 'User-Agent': UA, ...(opt.headers || {}) }, signal: AbortSignal.timeout(opt.timeout || 60000) });
      if (r.status === 404) return r; if (r.status >= 500 || r.status === 429) throw new Error('HTTP ' + r.status); if (!r.ok) { const e = new Error('HTTP ' + r.status); e.fatal = 1; throw e; } return r;
    } catch (e) { if (e.fatal || i === tries - 1) throw e; await sleep(2000 * 2 ** i); } }
}
const strip = s => String(s || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
function parseHtml(html, uri, wdate) {
  const m = (re) => (html.match(re) || [])[1];
  const title = m(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || m(/<title[^>]*>([^<]{5,300})<\/title>/i);
  if (!title) return null;
  const date = m(/<meta[^>]+(?:property|name)=["'](?:article:published_time|og:published_time|pubdate|publishdate|date|dc.date)["'][^>]+content=["']([^"']+)/i) || m(/<time[^>]+datetime=["']([^"']+)/i) || wdate;
  const body = (html.match(/<article[\s\S]*?<\/article>/i) || [html.replace(/[\s\S]*?<body/i, '<body')])[0];
  const text = strip(body).slice(0, 1200);
  const lang = m(/<html[^>]+lang=["']([a-zA-Z-]+)/i) || '';
  const ts = Math.floor(new Date(date).getTime() / 1000);
  return { title: strip(title).slice(0, 300), url: uri, text, ts: isNaN(ts) ? Math.floor(new Date(wdate) / 1000) : ts, lang };
}
// 流式读取 WARC.gz，按字节上限截断，逐条 response 记录解析
async function streamWarc(url, maxBytes, onRec) {
  const r = await ccFetch(url, { timeout: 180000 });
  const gun = zlib.createGunzip(); let read = 0, buf = Buffer.alloc(0), n = 0, done = false;
  const src = Readable.fromWeb(r.body);
  return new Promise((resolve, reject) => {
    src.on('data', c => { read += c.length; if (read > maxBytes && !done) { done = true; src.destroy(); gun.end(); } });
    src.on('error', e => { if (!done) reject(e); }); src.pipe(gun);
    gun.on('data', c => { buf = Buffer.concat([buf, c]);
      for (;;) { const he = buf.indexOf('\r\n\r\n'); if (he < 0) break; const head = buf.slice(0, he).toString('latin1');
        const len = +(head.match(/Content-Length:\s*(\d+)/i) || [])[1]; if (isNaN(len)) { buf = buf.slice(he + 4); continue; }
        if (buf.length < he + 4 + len) break; const block = buf.slice(he + 4, he + 4 + len); buf = buf.slice(he + 4 + len);
        if (/WARC-Type:\s*response/i.test(head)) { const uri = (head.match(/WARC-Target-URI:\s*(\S+)/i) || [])[1], wd = (head.match(/WARC-Date:\s*(\S+)/i) || [])[1];
          const hb = block.indexOf('\r\n\r\n'); const httpHead = block.slice(0, hb).toString('latin1');
          if (/content-type:\s*text\/html/i.test(httpHead)) { const rec = parseHtml(block.slice(hb + 4).toString('utf8'), uri, wd); if (rec) { n++; onRec(rec); } } } } });
    gun.on('end', () => resolve({ read, n })); gun.on('error', e => (done ? resolve({ read, n }) : reject(e)));
  });
}
function pruneCache(dir, capMB) { if (!fs.existsSync(dir)) return 0; const fl = fs.readdirSync(dir).map(f => ({ f, s: fs.statSync(path.join(dir, f)) })).sort((a, b) => a.s.mtimeMs - b.s.mtimeMs);
  let tot = fl.reduce((a, x) => a + x.s.size, 0); while (tot > capMB * 1048576 && fl.length) { const x = fl.shift(); fs.unlinkSync(path.join(dir, x.f)); tot -= x.s.size; } return tot; }

async function ccnews(cfg, ctx) {
  const files = Math.max(1, +cfg.ccNewsFiles || 1), mb = Math.max(5, +cfg.ccNewsMBPerFile || 40), cap = Math.max(10, +cfg.ccDiskMB || 200);
  const d = new Date(); const ym = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const pr = await ccFetch(`https://data.commoncrawl.org/crawl-data/CC-NEWS/${ym}/warc.paths.gz`);
  const paths = zlib.gunzipSync(Buffer.from(await pr.arrayBuffer())).toString().trim().split('\n');
  const done = new Set(ctx.state.ccDone || []); const todo = paths.reverse().filter(p => !done.has(p)).slice(0, files);
  const dir = path.join(ctx.dataDir, 'ccnews-cache'); fs.mkdirSync(dir, { recursive: true });
  const out = [];
  for (const p of todo) { const recs = [];
    const st = await streamWarc('https://data.commoncrawl.org/' + p, mb * 1048576, r => recs.push(r));
    fs.writeFileSync(path.join(dir, path.basename(p) + '.jsonl'), recs.map(r => JSON.stringify(r)).join('\n'));
    done.add(p); ctx.log(`CC-NEWS ${path.basename(p)}：流式读取 ${(st.read / 1048576).toFixed(1)}MB，解析 ${st.n} 篇 HTML 文章`);
    for (const r of recs) out.push({ kind: 'news', title: r.title, url: r.url, text: r.text.slice(0, 600), ts: r.ts, engagement: 1, region: /^zh/i.test(r.lang) || /\.cn\//.test(r.url) ? 'cn' : (/^en/i.test(r.lang) ? 'us' : 'global') }); }
  ctx.state.ccDone = [...done].slice(-200); const used = pruneCache(dir, cap); ctx.state.ccDiskUsed = used;
  return out;
}

// CDX：最新一期 vs 上一期
async function cdxBlocks(coll, q) { const r = await ccFetch(`https://index.commoncrawl.org/${coll}-index?${q}&showNumPages=true&output=json`, { timeout: 90000 }); if (r.status === 404) return { pages: 0, blocks: 0 }; return r.json(); }
async function cdxPage(coll, q, page) { const r = await ccFetch(`https://index.commoncrawl.org/${coll}-index?${q}&output=json&fl=url&page=${page}`, { timeout: 120000 }); if (r.status === 404) return []; return (await r.text()).trim().split('\n').map(l => { try { return JSON.parse(l).url; } catch { return null; } }).filter(Boolean); }
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } };
async function cdx(cfg, ctx) {
  const colls = await (await ccFetch('https://index.commoncrawl.org/collinfo.json')).json();
  const [A, B] = colls; const out = [], now = Math.floor(Date.now() / 1000);
  const tlds = String(cfg.cdxTlds || 'ai,io').split(/[,\s]+/).filter(Boolean), suffixes = String(cfg.cdxPaths || '/pricing,/careers').split(/[,\s]+/).filter(Boolean);
  const doms = String(cfg.cdxDomains || '').split(/[,\s]+/).filter(Boolean);
  for (const t of tlds) {
    const a = await cdxBlocks(A.id, `url=${t}&matchType=domain`), b = await cdxBlocks(B.id, `url=${t}&matchType=domain`);
    const g = b.blocks ? (a.blocks / b.blocks - 1) * 100 : 0;
    // 抽样：两期在相同相对位置各取 1 页，比较域名集合与后缀页面
    const ua = [], ub = [];
    for (const f of String(cfg.cdxSample || '0.23,0.61').split(',').map(Number)) { ua.push(...await cdxPage(A.id, `url=${t}&matchType=domain`, Math.floor(a.pages * f))); await sleep(1500); ub.push(...await cdxPage(B.id, `url=${t}&matchType=domain`, Math.floor(b.pages * f))); await sleep(1500); }
    const da = new Set(ua.map(host).filter(Boolean)), db = new Set(ub.map(host).filter(Boolean));
    const rev = h => h.split('.').reverse().join(','); const sb = [...db].map(rev).sort(); const lo = sb[0], hi = sb[sb.length - 1];
    const fresh = [...da].filter(h => !db.has(h) && rev(h) >= lo && rev(h) <= hi);
    const suf = s => [ua.filter(u => u.includes(s)).length, ub.filter(u => u.includes(s)).length];
    out.push({ kind: 'supply', title: `.${t} 域名索引量：${A.name} ${a.blocks} 块 vs ${B.name} ${b.blocks} 块（${g >= 0 ? '+' : ''}${g.toFixed(1)}%）`, url: `https://index.commoncrawl.org/${A.id}-index?url=${t}&matchType=domain&showNumPages=true`, text: `Common Crawl CDX .${t} 抽样页：新增域名 ${fresh.length}/${da.size}（与上期同区间比较）；${suffixes.map(s => `${s} 页面 ${suf(s)[0]} vs ${suf(s)[1]}`).join('；')}`, ts: now, engagement: a.blocks, velocity: Math.round(g), cdx: { tld: t, a: a.blocks, b: b.blocks, newDomains: fresh.slice(0, 50), sample: da.size } });
    for (const h of fresh.slice(0, 40)) out.push({ kind: 'supply', title: `新出现的 .${t} 域名：${h}`, url: `https://${h}/`, text: `Common Crawl ${A.id} 新收录域名（上期同区间未出现） ${h.replace(/[.-]/g, ' ')}`, ts: now, engagement: 1, company: h });
    for (const s of suffixes) for (const u of ua.filter(x => x.includes(s)).slice(0, 15)) out.push({ kind: 'supply', title: `${s} 页面：${u}`, url: u, text: `Common Crawl ${s} 页面 ${host(u)}`, ts: now, engagement: 1, company: host(u) });
    await sleep(2000);
  }
  for (const d of doms) { const a = await cdxBlocks(A.id, `url=${d}&matchType=domain`), b = await cdxBlocks(B.id, `url=${d}&matchType=domain`);
    out.push({ kind: 'supply', title: `${d} 页面量：${a.pages} 页 vs ${b.pages} 页（CDX）`, url: `https://index.commoncrawl.org/${A.id}-index?url=${d}&matchType=domain&showNumPages=true`, text: `Common Crawl 域名页面增长 ${d}`, ts: now, engagement: a.pages, company: d }); await sleep(1500); }
  return out;
}
module.exports = { ccnews, cdx, streamWarc };
