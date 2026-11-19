// 追加专业数据源
const zlib = require('zlib'), readline = require('readline'), { Readable } = require('stream');
const { SOURCES: S, get, sleep, UA } = require('./collectors');
const tsOf = d => { const t = Math.floor(new Date(d || Date.now()).getTime() / 1000); return isNaN(t) ? Math.floor(Date.now() / 1000) : t; };
const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const add = (id, meta, fetch) => { S[id] = { id, ...meta, fetch }; };
const now = () => Math.floor(Date.now() / 1000);

// GH Archive：流式解析最近 N 个小时文件，统计 WatchEvent（star）→ star 增速
add('gharchive', { name: 'GH Archive（逐小时事件流 → star 增速）', cat: '技术', kind: 'code', weight: .85, freq: 360 }, async (kw, cfg, ctx) => {
  const hours = Math.max(1, Math.min(6, +cfg.ghaHours || 2)), maxMB = +cfg.ghaMBPerHour || 150;
  const counts = {}, firstH = {}, nH = []; let tried = 0;
  for (let back = 2; nH.length < hours && tried < hours + 4; back++, tried++) {
    const d = new Date(Date.now() - back * 3600e3); const f = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}-${d.getUTCHours()}`;
    const r = await fetch(`https://data.gharchive.org/${f}.json.gz`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(300000) }); if (!r.ok) continue;
    let bytes = 0; const src = Readable.fromWeb(r.body); src.on('data', c => { bytes += c.length; if (bytes > maxMB * 1048576) src.destroy(); });
    const rl = readline.createInterface({ input: src.pipe(zlib.createGunzip()).on('error', () => {}) });
    try { for await (const line of rl) { if (!line.includes('"WatchEvent"')) continue; const m = line.match(/"repo":\{"id":\d+,"name":"([^"]+)"/); if (m) { counts[m[1]] = (counts[m[1]] || 0) + 1; if (!nH.length) firstH[m[1]] = (firstH[m[1]] || 0) + 1; } } } catch (e) {}
    nH.push(f); ctx.log(`GH Archive ${f}.json.gz 已解析 ${(bytes / 1048576).toFixed(1)}MB`); }
  if (!nH.length) throw new Error('GH Archive 最近小时文件不可用');
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 120);
  return top.map(([repo, c]) => { const latest = firstH[repo] || 0, avg = c / nH.length; const acc = nH.length > 1 ? Math.round((latest / Math.max(.5, (c - latest) / (nH.length - 1)) - 1) * 100) : 0;
    return { kind: 'code', title: `${repo}：${nH.length} 小时内新增 ${c} star（${avg.toFixed(1)}/小时，最近 1 小时加速 ${acc >= 0 ? '+' : ''}${acc}%）`, url: `https://github.com/${repo}`, text: repo.replace(/[\/_-]/g, ' ') + ' github stars gharchive', ts: now(), engagement: c * 24, velocity: Math.round(avg * 24) }; });
});
// OpenAlex：最近论文（按被引/主题）
add('openalex', { name: 'OpenAlex 学术论文（全学科）', cat: '技术', kind: 'research', weight: .75, freq: 1440 }, async (kw, cfg) => { const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), key = cfg.openalexKey ? `&api_key=${cfg.openalexKey}` : '', out = [];
  for (const q of ['', ...kw.slice(0, 3)]) { const d = await get(`https://api.openalex.org/works?filter=from_publication_date:${since},type:article${q ? '&search=' + encodeURIComponent(q) : ''}&sort=cited_by_count:desc&per_page=50&select=id,display_name,publication_date,cited_by_count,primary_topic,doi${key}&mailto=admin@signalradar.app`);
    for (const w of d.results) out.push({ kind: 'research', title: w.display_name, url: w.doi || w.id, text: `${w.primary_topic?.display_name || ''} ${w.primary_topic?.field?.display_name || ''} ${w.primary_topic?.domain?.display_name || ''}`, ts: tsOf(w.publication_date), engagement: w.cited_by_count }); await sleep(300); }
  return out; });
// Wikimedia Pageviews：英文/中文维基每日热门条目 + 关注词趋势
add('wikipv', { name: 'Wikipedia Pageviews（en/zh 热门 + 关注词 30 日趋势）', cat: '需求', kind: 'demand', weight: .7, freq: 1440 }, async kw => { const out = [], d = new Date(Date.now() - 2 * 864e5), ymd = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
  for (const [proj, reg] of [['en.wikipedia', 'us'], ['zh.wikipedia', 'cn']]) { const r = await get(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${proj}/all-access/${ymd}`);
    for (const a of r.items[0].articles.slice(0, 60)) { if (/^(Main_Page|Special:|Wikipedia:|首页|Help:|File:|Portal:|-)/.test(a.article)) continue;
      out.push({ kind: 'demand', title: `维基热门（${proj.slice(0, 2)}）#${a.rank}：${a.article.replace(/_/g, ' ')}（${a.views.toLocaleString()} 次浏览）`, url: `https://${proj}.org/wiki/${encodeURIComponent(a.article)}`, text: a.article.replace(/_/g, ' '), ts: tsOf(d), engagement: a.views, region: reg }); } }
  const end = new Date(Date.now() - 864e5).toISOString().slice(0, 10).replace(/-/g, ''), st = new Date(Date.now() - 31 * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
  for (const k of kw.slice(0, 6)) { const art = k.trim().replace(/\s+/g, '_').replace(/^./, c => c.toUpperCase()); try { const r = await get(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(art)}/daily/${st}/${end}`);
    const v = r.items.map(i => i.views), a = v.slice(-7).reduce((x, y) => x + y, 0), b = v.slice(-14, -7).reduce((x, y) => x + y, 0), g = b ? Math.round((a / b - 1) * 100) : 0;
    out.push({ kind: 'demand', title: `维基「${art.replace(/_/g, ' ')}」近 7 日浏览 ${a.toLocaleString()}（环比 ${g >= 0 ? '+' : ''}${g}%）`, url: `https://pageviews.wmcloud.org/?pages=${art}&project=en.wikipedia.org`, text: k, ts: now(), engagement: a, velocity: g, series: v }); } catch (e) {} }
  return out; });
// SEC EDGAR 全文检索（关注词出现在 10-K/8-K/S-1 中）
add('sec_fts', { name: 'SEC EDGAR 全文检索（关注词 × 10-K/8-K/S-1）', cat: '资本', kind: 'funding', weight: .9, freq: 1440 }, async kw => { const out = [], st = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), end = new Date().toISOString().slice(0, 10);
  for (const k of kw.slice(0, 5)) { const d = await get(`https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent('"' + k + '"')}&forms=10-K,10-Q,8-K,S-1&dateRange=custom&startdt=${st}&enddt=${end}`);
    const tot = d.hits.total.value; out.push({ kind: 'funding', title: `SEC 文件中提及「${k}」：近 30 天 ${tot} 份（10-K/10-Q/8-K/S-1）`, url: `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(k)}%22&forms=10-K,10-Q,8-K,S-1`, text: k + ' sec filings mentions', ts: now(), engagement: tot, sec: { k, tot } });
    for (const h of d.hits.hits.slice(0, 8)) { const s = h._source; out.push({ kind: 'funding', title: `${s.form}：${(s.display_names[0] || '').replace(/\s*\(CIK.*$/, '')} 提及「${k}」`, url: `https://www.sec.gov/Archives/edgar/data/${parseInt(s.ciks[0])}/${s.adsh.replace(/-/g, '')}/`, text: k, ts: tsOf(s.file_date), engagement: 2, company: (s.display_names[0] || '').replace(/\s*\(CIK.*$/, '') }); }
    await sleep(300); }
  return out; });
// GLEIF：新注册的法人实体（LEI）
add('gleif', { name: 'GLEIF 新注册法人（LEI）', cat: '资本', kind: 'supply', weight: .8, freq: 1440 }, async () => (await get('https://api.gleif.org/api/v1/lei-records?page%5Bsize%5D=200&sort=-registration.initialRegistrationDate')).data.map(r => { const e = r.attributes.entity; return { kind: 'supply', title: `新注册法人：${e.legalName.name}（${e.legalAddress.country}${e.category ? '，' + e.category : ''}）`, url: `https://search.gleif.org/#/record/${r.id}`, text: `LEI ${e.legalForm?.id || ''} ${e.legalAddress.city || ''} ${e.legalName.name}`, ts: tsOf(r.attributes.registration.initialRegistrationDate), engagement: 1, region: e.legalAddress.country === 'CN' ? 'cn' : e.legalAddress.country === 'US' ? 'us' : 'global', company: e.legalName.name }; }));
add('opencorporates', { name: 'OpenCorporates 公司注册', cat: '资本', kind: 'supply', weight: .8, freq: 1440, key: 'opencorporatesKey' }, async (kw, cfg) => { const out = [], since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  for (const k of (kw.length ? kw : ['ai']).slice(0, 4)) { const d = await get(`https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(k)}&incorporation_date=${since}:&per_page=50&api_token=${cfg.opencorporatesKey}`);
    for (const { company: c } of d.results.companies) out.push({ kind: 'supply', title: `新注册公司：${c.name}（${c.jurisdiction_code}，${c.incorporation_date}）`, url: c.opencorporates_url, text: k + ' ' + (c.company_type || ''), ts: tsOf(c.incorporation_date), engagement: 1, company: c.name }); }
  return out; });
add('companieshouse', { name: 'UK Companies House 新公司', cat: '资本', kind: 'supply', weight: .85, freq: 1440, key: 'companiesHouseKey' }, async (kw, cfg) => { const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10), au = 'Basic ' + Buffer.from(cfg.companiesHouseKey + ':').toString('base64');
  const d = await get(`https://api.company-information.service.gov.uk/advanced-search/companies?incorporated_from=${since}&size=500&company_status=active`, { headers: { Authorization: au } });
  return (d.items || []).map(c => ({ kind: 'supply', title: `UK 新公司：${c.company_name}（SIC ${(c.sic_codes || []).join(',')}）`, url: `https://find-and-update.company-information.service.gov.uk/company/${c.company_number}`, text: `uk company sic ${(c.sic_codes || []).join(' ')} ${c.company_name}`, ts: tsOf(c.date_of_creation), engagement: 1, company: c.company_name })); });
// Wayback CDX：关注域名的 /pricing /careers 快照变化
add('wayback', { name: 'Wayback Machine CDX（竞品定价/招聘页变化）', cat: '供给', kind: 'supply', weight: .65, freq: 10080 }, async (kw, cfg) => { const out = [];
  const doms = String(cfg.cdxDomains || 'openai.com,anthropic.com,notion.so,figma.com').split(/[,\s]+/).filter(Boolean).slice(0, 8);
  for (const d of doms) for (const p of ['/pricing', '/careers']) { try { const r = await get(`https://web.archive.org/cdx/search/cdx?url=${d}${p}&output=json&from=${new Date().getFullYear() - 1}&collapse=digest&fl=timestamp,digest`, { timeout: 60000 }, 2);
    const rows = r.slice(1); if (!rows.length) continue; const last90 = rows.filter(x => x[0] >= new Date(Date.now() - 90 * 864e5).toISOString().replace(/\D/g, '').slice(0, 8)).length;
    out.push({ kind: 'supply', title: `${d}${p} 近 12 个月内容变更 ${rows.length} 次（近 90 天 ${last90} 次）`, url: `https://web.archive.org/web/*/${d}${p}`, text: `wayback ${d} ${p} changes`, ts: now(), engagement: rows.length, company: d }); } catch (e) {} await sleep(1500); }
  if (!out.length) throw new Error('Wayback CDX 超时或无数据'); return out; });
// Amazon Reviews 2023（McAuley Lab，Hugging Face）：按需 Range 下载类目文件开头子集，提取 1–2 星差评
add('amazon_reviews', { name: 'Amazon Reviews 2023 公开数据集（按类目取子集，历史数据）', cat: '需求', kind: 'demand', weight: .5, freq: 10080 }, async (kw, cfg) => { const out = [], mb = +cfg.amazonMBPerCat || 8;
  const cats = String(cfg.amazonCats || 'Health_and_Household,Home_and_Kitchen,Electronics,Pet_Supplies,Baby_Products').split(/[,\s]+/).filter(Boolean);
  for (const c of cats.slice(0, 6)) { const r = await fetch(`https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023/resolve/main/raw/review_categories/${c}.jsonl`, { headers: { 'User-Agent': UA, Range: `bytes=0-${mb * 1048576}` }, signal: AbortSignal.timeout(120000) });
    if (!r.ok && r.status !== 206) continue; const lines = (await r.text()).split('\n'); lines.pop();
    for (const l of lines) { try { const j = JSON.parse(l); if (j.rating > 2 || (j.helpful_vote || 0) < 2) continue;
      out.push({ kind: 'demand', title: `Amazon ${c.replace(/_/g, ' ')} 差评（${j.rating}★，${j.helpful_vote} 有用）：${strip(j.title).slice(0, 120)}`, url: `https://www.amazon.com/dp/${j.parent_asin || j.asin}`, text: strip(j.text).slice(0, 400), ts: Math.floor(j.timestamp / 1000), engagement: j.helpful_vote, pain: 1, historical: 1 }); } catch (e) {} } }
  return out.sort((a, b) => b.engagement - a.engagement).slice(0, 400); });
// Reddit 历史归档（Arctic Shift 镜像）
add('reddit_archive', { name: 'Reddit 历史归档（Arctic Shift 镜像，痛点检索）', cat: '需求', kind: 'demand', weight: .55, freq: 720 }, async kw => { const out = [];
  for (const [sub, q] of [['SaaS', 'alternative'], ['smallbusiness', 'software'], ['Entrepreneur', 'problem'], ['startups', 'tool'], ['sysadmin', 'frustrated'], ['ecommerce', 'struggling'], ['marketing', 'tool'], ...kw.slice(0, 3).map(k => [null, k])]) {
    try { const d = await get(`https://arctic-shift.photon-reddit.com/api/posts/search?${sub ? 'subreddit=' + sub + '&' : ''}${q ? 'title=' + encodeURIComponent(q) + '&' : ''}after=${new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)}&limit=50&sort=desc`);
      for (const p of d.data || []) out.push({ kind: 'demand', title: `r/${p.subreddit}: ${p.title}`, url: `https://www.reddit.com${p.permalink}`, text: strip(p.selftext).slice(0, 400), ts: p.created_utc, engagement: (p.score || 0) + (p.num_comments || 0), pain: /alternative|frustrat|struggl|hate|problem|looking for|is there/i.test(p.title) ? 1 : 0 }); } catch (e) {} await sleep(800); }
  if (!out.length) throw new Error('Arctic Shift 无返回'); return out; });
// EU TED 招标
add('ted', { name: 'EU TED 欧盟公共采购公告', cat: '政策', kind: 'policy', weight: .85, freq: 1440 }, async () => { const d8 = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
  const d = await get('https://api.ted.europa.eu/v3/notices/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: `publication-date>=${d8}`, fields: ['notice-title', 'publication-date', 'buyer-name', 'buyer-country', 'classification-cpv', 'total-value'], limit: 200 }) });
  const pick = o => o ? (o.eng || o.ENG || Object.values(o)[0]) : ''; const one = x => Array.isArray(x) ? x[0] : x;
  return d.notices.map(n => ({ kind: 'policy', title: `EU 招标：${one(pick(n['notice-title']))}`.slice(0, 300), url: `https://ted.europa.eu/en/notice/-/detail/${n['publication-number']}`, text: `tender procurement CPV ${(n['classification-cpv'] || []).slice(0, 3).join(' ')} ${one(pick(n['buyer-name'])) || ''} ${(n['buyer-country'] || []).join(' ')}`, ts: tsOf(String(n['publication-date']).slice(0, 10)), engagement: 2, tender: 1, region: 'global' })); });
// 中国政府采购网：中央/地方公告列表页
add('ccgp', { name: '中国政府采购网（中央/地方采购公告列表）', cat: '政策', kind: 'policy', weight: .85, freq: 720, region: 'cn' }, async () => { const out = [];
  for (const sec of ['zygg', 'dfgg']) { const html = await get(`https://www.ccgp.gov.cn/cggg/${sec}/`, { text: true });
    for (const m of html.matchAll(/<a href="\.\/([^"]+?(\d{8})_\d+\.htm)"[^>]*title="([^"]+)"/g)) out.push({ kind: 'policy', title: `政府采购：${m[3]}`, url: `https://www.ccgp.gov.cn/cggg/${sec}/${m[1]}`, text: '政府采购 招标 ' + m[3], ts: tsOf(m[2].replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3')), engagement: 2, tender: 1, region: 'cn' }); await sleep(800); }
  if (!out.length) throw new Error('列表页解析为空'); return out; });
add('google_patents', { name: 'Google Patents', cat: '供给', kind: 'research', weight: .8, freq: 1440, unavailable: '无公开 API，xhr 接口返回 503 反爬页；专利请用 PatentsView（需 Key）' }, async () => { throw new Error('不可用：Google Patents 无公开 API（503）'); });
module.exports = {};
