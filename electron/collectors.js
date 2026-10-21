// 数据源注册表：cat=类别 kind=信号类型 weight=可信度权重(0-1) freq=建议采集间隔(分钟) key=需要的设置项
const { XMLParser } = require('fast-xml-parser');
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
const UA = 'SignalRadar/1.0 (desktop research app; admin@signalradar.app)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, opt = {}, tries = 3) {
  for (let i = 0; i < tries; i++) { try { return await get1(url, opt); } catch (e) { if (!/429|503|502|504|fetch failed|timeout|aborted/i.test(e.message) || i === tries - 1) throw e; await sleep(3000 * 2 ** i); } }
}
async function get1(url, opt) {
  const r = await fetch(url, { method: opt.method || 'GET', body: opt.body, headers: { 'User-Agent': UA, Accept: '*/*', ...(opt.headers || {}) }, signal: AbortSignal.timeout(opt.timeout || 25000), redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return opt.text ? r.text() : r.json();
}
const txt = v => v == null ? '' : typeof v === 'object' ? (v['#text'] ?? v.__cdata ?? Object.values(v).find(x => typeof x === 'string') ?? '') : v;
const strip = s => String(txt(s)).replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
const days = n => Math.floor(Date.now() / 1000) - n * 86400;
const arr = x => (Array.isArray(x) ? x : x ? [x] : []);
const tsOf = d => { const t = Math.floor(new Date(d || Date.now()).getTime() / 1000); return isNaN(t) ? Math.floor(Date.now() / 1000) : t; };
function rssItems(t) {
  const d = xml.parse(t);
  const items = d?.rss?.channel?.item || d?.feed?.entry || d?.['rdf:RDF']?.item || [];
  return arr(items).map(i => ({
    title: strip(i.title), url: i.link?.href || arr(i.link)[0]?.href || (typeof i.link === 'string' ? i.link : '') || i.guid?.['#text'] || i.id,
    text: strip(i.description || i.summary?.['#text'] || i.summary || i.content?.['#text'] || i.content || i['content:encoded']),
    ts: tsOf(i.pubDate || i.published || i.updated || i['dc:date'])
  })).filter(i => i.title);
}
const rssFn = (kind, url, extra = {}) => async () => rssItems(await get(url, { text: true })).map(i => ({ ...i, kind, engagement: 1, ...extra }));
const gnews = (q, lang = 'en') => `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:7d')}&` + (lang === 'zh' ? 'hl=zh-CN&gl=CN&ceid=CN:zh-Hans' : 'hl=en-US&gl=US&ceid=US:en');
const multi = async (urls, kind, extra = {}) => { const out = []; let ok = 0, last;
  for (const u of urls) { try { out.push(...(await rssFn(kind, u, extra)())); ok++; } catch (e) { last = e; } await sleep(400); }
  if (!ok && last) throw last; return out; };

const S = {};
const add = (id, meta, fetch) => { S[id] = { id, ...meta, fetch }; };

// ===== 通用 / 社区 =====
add('hn', { name: 'Hacker News (Algolia)', cat: '技术', kind: 'community', weight: .8, freq: 60 }, async kw => {
  const out = [], q = [`https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=60`, `https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=points>20,created_at_i>${days(7)}&hitsPerPage=100`, `https://hn.algolia.com/api/v1/search_by_date?tags=show_hn&numericFilters=created_at_i>${days(7)}&hitsPerPage=60`];
  for (const k of kw.slice(0, 6)) q.push(`https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(k)}&tags=story&numericFilters=created_at_i>${days(14)}&hitsPerPage=40`);
  for (const u of q) { const d = await get(u); for (const h of d.hits) out.push({ kind: 'community', title: h.title, url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, text: strip(h.story_text), ts: h.created_at_i, engagement: (h.points || 0) + (h.num_comments || 0) }); }
  return out; });
add('lobsters', { name: 'Lobsters', cat: '技术', kind: 'community', weight: .6, freq: 120 }, async () => { const out = [];
  for (const u of ['https://lobste.rs/hottest.json', 'https://lobste.rs/newest.json']) for (const s of await get(u)) out.push({ kind: 'community', title: s.title, url: s.url || s.short_id_url, text: (s.tags || []).join(' '), ts: tsOf(s.created_at), engagement: s.score + s.comment_count });
  return out; });
add('stackexchange', { name: 'Stack Overflow 热门问题', cat: '需求', kind: 'demand', weight: .5, freq: 360 }, async () => (await get('https://api.stackexchange.com/2.3/questions?order=desc&sort=hot&site=stackoverflow&pagesize=80')).items.map(q => ({ kind: 'demand', title: strip(q.title), url: q.link, text: q.tags.join(' '), ts: q.creation_date, engagement: Math.max(0, q.score) + q.answer_count + Math.floor(q.view_count / 100) })));
add('reddit', { name: 'Reddit 创业社区 Top（RSS）', cat: '需求', kind: 'community', weight: .5, freq: 180 }, async () => { const out = [];
  for (const sub of ['startups', 'SaaS', 'Entrepreneur', 'SideProject', 'smallbusiness']) { try { out.push(...(await rssFn('community', `https://www.reddit.com/r/${sub}/top/.rss?t=week`)()).map(i => ({ ...i, text: `r/${sub} ` + i.text }))); } catch (e) { if (!out.length && sub === 'smallbusiness') throw e; } await sleep(1500); }
  return out; });
add('reddit_pain', { name: 'Reddit 痛点帖（求替代/吐槽搜索）', cat: '需求', kind: 'demand', weight: .55, freq: 360 }, async () => { const out = [];
  for (const q of ['"alternative to"', '"is there a tool"', 'frustrated OR "hate using"', '"looking for software"']) { try { out.push(...(await rssFn('demand', `https://www.reddit.com/search.rss?q=${encodeURIComponent(q)}&sort=new&t=week`, { pain: 1 })())); } catch (e) { if (!out.length && q.startsWith('"looking')) throw e; } await sleep(2000); }
  return out; });

// ===== 融资与资本 =====
add('sec_formd', { name: 'SEC EDGAR Form D（私募融资备案）', cat: '资本', kind: 'funding', weight: .95, freq: 720 }, async () => { const out = [], end = new Date().toISOString().slice(0, 10), st = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  for (const from of [0, 100]) { const d = await get(`https://efts.sec.gov/LATEST/search-index?forms=D&startdt=${st}&enddt=${end}&from=${from}`);
    for (const h of d.hits.hits) { const s = h._source, name = (s.display_names[0] || '').replace(/\s*\(CIK.*$/, ''); if (/fund|lp\b|l\.p\.|capital partners|trust|\bdst\b|reit|partners,? l|offering|portfolio|investors? (i|ii|iii|iv|v)\b|holdings? lp|spv|series [a-z0-9]+ of/i.test(name)) continue;
      out.push({ kind: 'funding', title: `Form D 备案：${name}（${s.biz_locations?.[0] || s.biz_states?.[0] || ''}）`, url: `https://www.sec.gov/Archives/edgar/data/${parseInt(s.ciks[0])}/${s.adsh.replace(/-/g, '')}/`, text: `SEC Form D 私募发行 ${name} ${s.items?.join(' ') || ''}`, ts: tsOf(s.file_date), engagement: 1, company: name }); }
    await sleep(300); }
  return out; });
add('sec_s1', { name: 'SEC EDGAR S-1（IPO 招股书）', cat: '资本', kind: 'funding', weight: .95, freq: 720 }, async () => rssItems(await get('https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=S-1&count=60&output=atom', { text: true })).map(i => ({ ...i, kind: 'funding', title: 'S-1 招股书：' + i.title.replace(/^S-1(\/A)?\s*-\s*/, ''), engagement: 3 })));
add('techcrunch', { name: 'TechCrunch', cat: '资本', kind: 'news', weight: .75, freq: 60 }, rssFn('news', 'https://techcrunch.com/feed/'));
add('googlenews_funding', { name: 'Google News 融资新闻', cat: '资本', kind: 'news', weight: .65, freq: 120 }, async kw => multi(['startup raises Series', 'seed funding startup', 'venture capital round', ...kw.slice(0, 3)].map(q => gnews(q)), 'news'));
add('yc_blog', { name: 'Y Combinator Blog', cat: '资本', kind: 'news', weight: .7, freq: 720 }, rssFn('news', 'https://www.ycombinator.com/blog/rss'));
add('vc_blogs', { name: '投资机构观点（a16z / Sequoia / Bessemer，经 Google News）', cat: '资本', kind: 'news', weight: .6, freq: 720 }, async () => multi(['site:a16z.com', 'site:sequoiacap.com', 'site:bvp.com'].map(q => gnews(q.replace(' when:7d', ''))), 'news'));
add('yc_companies', { name: 'YC 公司目录（yc-oss 镜像）', cat: '资本', kind: 'product', weight: .8, freq: 1440 }, async () => { const d = await get('https://yc-oss.github.io/api/companies/all.json', { timeout: 60000 });
  const recent = d.filter(c => c.launched_at).sort((a, b) => b.launched_at - a.launched_at).slice(0, 300);
  return recent.map(c => ({ kind: 'product', title: `YC ${c.batch}: ${c.name} — ${c.one_liner || ''}`, url: c.url || `https://www.ycombinator.com/companies/${c.slug}`, text: [c.industry, c.subindustry, ...(c.tags || []), (c.long_description || '').slice(0, 300)].join(' '), ts: c.launched_at, engagement: (c.team_size || 1), company: c.name })); });

// ===== 技术 =====
add('github', { name: 'GitHub 新晋仓库 + star 增速', cat: '技术', kind: 'code', weight: .75, freq: 180 }, async (kw, cfg) => {
  const h = cfg.githubToken ? { Authorization: `Bearer ${cfg.githubToken}` } : {};
  const since = new Date(Date.now() - 21 * 864e5).toISOString().slice(0, 10), out = [];
  for (const q of [`created:>${since} stars:>30`, ...kw.slice(0, 4).map(k => `${k} created:>${since}`)]) { const d = await get(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=50`, { headers: h });
    for (const r of d.items || []) { const age = Math.max(1, (Date.now() - new Date(r.created_at)) / 864e5), vel = Math.round(r.stargazers_count / age);
      out.push({ kind: 'code', title: `${r.full_name}: ${r.description || ''}`.slice(0, 300), url: r.html_url, text: (r.topics || []).join(' ') + ' ' + (r.language || '') + ` star增速 ${vel}/天`, ts: tsOf(r.created_at), engagement: r.stargazers_count, velocity: vel }); } }
  return out; });
add('arxiv', { name: 'arXiv（cs.AI/LG/CL/RO, q-bio, econ）', cat: '技术', kind: 'research', weight: .7, freq: 720 }, async () => rssItems(await get('https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL+OR+cat:cs.RO+OR+cat:q-bio.QM+OR+cat:econ.GN&sortBy=submittedDate&sortOrder=descending&max_results=150', { text: true, timeout: 60000 })).map(i => ({ ...i, kind: 'research', engagement: 1 })));
add('hf_papers', { name: 'Hugging Face Daily Papers（Papers with Code 已并入）', cat: '技术', kind: 'research', weight: .7, freq: 720 }, async () => (await get('https://huggingface.co/api/daily_papers?limit=100')).map(p => ({ kind: 'research', title: p.paper.title, url: `https://huggingface.co/papers/${p.paper.id}`, text: strip(p.paper.summary).slice(0, 400), ts: tsOf(p.publishedAt || p.paper.publishedAt), engagement: p.paper.upvotes || 0 })));
add('hf_models', { name: 'Hugging Face 热门模型', cat: '技术', kind: 'code', weight: .7, freq: 360 }, async () => (await get('https://huggingface.co/api/models?sort=trendingScore&limit=100')).map(m => ({ kind: 'code', title: `HF 模型 ${m.id}（${m.pipeline_tag || 'model'}）`, url: `https://huggingface.co/${m.id}`, text: (m.tags || []).slice(0, 15).join(' '), ts: tsOf(m.createdAt), engagement: (m.likes || 0) + (m.trendingScore || 0) * 10 })));
add('hf_spaces', { name: 'Hugging Face 热门 Spaces（应用）', cat: '技术', kind: 'product', weight: .6, freq: 360 }, async () => (await get('https://huggingface.co/api/spaces?sort=trendingScore&limit=80&full=true')).map(m => ({ kind: 'product', title: `HF Space ${m.id}${m.cardData?.title ? '：' + m.cardData.title : ''}${m.cardData?.short_description ? ' — ' + m.cardData.short_description : ''}`, url: `https://huggingface.co/spaces/${m.id}`, text: (m.tags || []).slice(0, 10).join(' '), ts: tsOf(m.createdAt), engagement: (m.likes || 0) + (m.trendingScore || 0) * 10 })));
add('npm', { name: 'npm 下载量增速（近 7 天 vs 前 7 天）', cat: '技术', kind: 'code', weight: .7, freq: 1440 }, async kw => { const out = [];
  for (const term of ['keywords:ai', 'keywords:llm', 'keywords:agent', 'keywords:mcp', ...kw.slice(0, 3)]) { const d = await get(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(term)}&size=25&popularity=1.0`);
    const pk = d.objects.map(o => o.package).filter(p => !p.name.startsWith('@'));
    if (!pk.length) continue;
    const r = await get(`https://api.npmjs.org/downloads/range/last-month/${pk.map(p => p.name).join(',')}`);
    for (const p of pk) { const dl = r[p.name]?.downloads || []; const a = dl.slice(-7).reduce((s, x) => s + x.downloads, 0), b = dl.slice(-14, -7).reduce((s, x) => s + x.downloads, 0);
      if (a < 500) continue; const g = b ? Math.round((a / b - 1) * 100) : 0;
      out.push({ kind: 'code', title: `npm ${p.name}：周下载 ${a.toLocaleString()}（环比 ${g >= 0 ? '+' : ''}${g}%）— ${p.description || ''}`.slice(0, 300), url: `https://www.npmjs.com/package/${p.name}`, text: (p.keywords || []).join(' '), ts: Math.floor(Date.now() / 1000), engagement: a, velocity: g }); }
    await sleep(500); }
  return out; });
add('pypi', { name: 'PyPI 下载量增速（pypistats）', cat: '技术', kind: 'code', weight: .65, freq: 1440 }, async (kw, cfg) => { const out = [];
  const pk = (cfg.pypiPackages || 'langchain,llama-index,openai,anthropic,transformers,vllm,crewai,dspy-ai,mcp,pydantic-ai,polars,duckdb,ultralytics,mlx,litellm').split(/[,\s]+/).filter(Boolean);
  for (const p of pk) { try { const d = (await get(`https://pypistats.org/api/packages/${p}/recent`)).data; const g = Math.round((d.last_week * 4.3 / Math.max(1, d.last_month) - 1) * 100);
    out.push({ kind: 'code', title: `PyPI ${p}：周下载 ${d.last_week.toLocaleString()}（相对月均 ${g >= 0 ? '+' : ''}${g}%）`, url: `https://pypi.org/project/${p}/`, text: p, ts: Math.floor(Date.now() / 1000), engagement: d.last_week, velocity: g }); } catch (e) { if (/429/.test(e.message)) break; } await sleep(1200); }
  if (!out.length) throw new Error('pypistats 无返回'); return out; });
add('producthunt', { name: 'Product Hunt（RSS）', cat: '供给', kind: 'product', weight: .6, freq: 180 }, rssFn('product', 'https://www.producthunt.com/feed'));

// ===== 需求 =====
add('gtrends', { name: 'Google Trends 每日热搜（US/GB/IN/JP/DE/BR）', cat: '需求', kind: 'demand', weight: .7, freq: 360 }, async () => { const out = [];
  for (const g of ['US', 'GB', 'IN', 'JP', 'DE', 'BR']) { try { const t = await get(`https://trends.google.com/trending/rss?geo=${g}`, { text: true }); const d = xml.parse(t);
    for (const i of arr(d?.rss?.channel?.item)) { const traffic = parseInt(String(i['ht:approx_traffic'] || '0').replace(/[^\d]/g, '')) || 0; const news = arr(i['ht:news_item'])[0];
      out.push({ kind: 'demand', title: `[${g}] 搜索热词：${i.title}${news ? ' — ' + strip(news['ht:news_item_title']) : ''}`, url: news?.['ht:news_item_url'] || `https://trends.google.com/trending?geo=${g}`, text: `Google Trends ${g} 搜索量约 ${traffic}+`, ts: tsOf(i.pubDate), engagement: traffic, region: g === 'US' ? 'us' : 'global' }); } } catch (e) {} await sleep(500); }
  if (!out.length) throw new Error('Google Trends RSS 无返回'); return out; });
add('appstore', { name: 'App Store 榜单（US/CN 免费+畅销）', cat: '需求', kind: 'product', weight: .7, freq: 720 }, async () => { const out = [];
  for (const [c, t] of [['us', 'top-free'], ['us', 'top-paid'], ['cn', 'top-free'], ['cn', 'top-paid']]) { const d = await get(`https://rss.applemarketingtools.com/api/v2/${c}/apps/${t}/50/apps.json`);
    d.feed.results.forEach((a, i) => out.push({ kind: 'product', title: `App Store ${c.toUpperCase()} ${t === 'top-free' ? '免费榜' : '付费榜'} #${i + 1}：${a.name}（${a.artistName}）`, url: a.url, text: (a.genres || []).map(g => g.name || g).join(' '), ts: Math.floor(Date.now() / 1000), engagement: 51 - i, region: c === 'cn' ? 'cn' : 'us', appId: a.id, company: a.artistName })); }
  return out; });
add('appstore_reviews', { name: 'App Store 差评（榜单前 15 应用的 1–2 星评论）', cat: '需求', kind: 'demand', weight: .6, freq: 1440 }, async () => { const out = [];
  const top = (await get('https://rss.applemarketingtools.com/api/v2/us/apps/top-free/15/apps.json')).feed.results;
  for (const a of top) { try { const d = await get(`https://itunes.apple.com/us/rss/customerreviews/id=${a.id}/sortBy=mostRecent/json`);
    for (const e of arr(d.feed?.entry)) { const r = +e['im:rating']?.label; if (!r || r > 2) continue;
      out.push({ kind: 'demand', title: `${a.name} 差评（${r}★）：${strip(e.title?.label)}`, url: a.url, text: strip(e.content?.label).slice(0, 400), ts: tsOf(e.updated?.label), engagement: 1, pain: 1, company: a.artistName }); } } catch (e) {} await sleep(400); }
  return out; });

// ===== 供给与人才 =====
add('remoteok', { name: 'RemoteOK 招聘', cat: '人才', kind: 'jobs', weight: .55, freq: 360 }, async () => (await get('https://remoteok.com/api')).filter(j => j.position).map(j => ({ kind: 'jobs', title: `${j.position} @ ${j.company}`, url: j.url, text: (j.tags || []).join(' '), ts: Number(j.epoch) || tsOf(j.date), engagement: 1, company: j.company })));
add('arbeitnow', { name: 'Arbeitnow 招聘（欧洲）', cat: '人才', kind: 'jobs', weight: .5, freq: 360 }, async () => (await get('https://www.arbeitnow.com/api/job-board-api')).data.map(j => ({ kind: 'jobs', title: `${j.title} @ ${j.company_name}`, url: j.url, text: (j.tags || []).join(' ') + ' ' + strip(j.description).slice(0, 200), ts: j.created_at, engagement: 1, company: j.company_name })));
add('himalayas', { name: 'Himalayas 远程招聘', cat: '人才', kind: 'jobs', weight: .5, freq: 360 }, async () => (await get('https://himalayas.app/jobs/api?limit=100')).jobs.map(j => ({ kind: 'jobs', title: `${j.title} @ ${j.companyName}`, url: j.applicationLink || j.guid, text: [...(j.categories || []), ...(j.parentCategories || [])].join(' ') + ' ' + strip(j.excerpt), ts: j.pubDate > 1e11 ? Math.floor(j.pubDate / 1000) : j.pubDate, engagement: 1, company: j.companyName })));

// ===== 宏观与政策 =====
add('gdelt', { name: 'GDELT 全球新闻（限流严）', cat: '宏观', kind: 'news', weight: .55, freq: 720 }, async kw => { const q = kw.length ? '(' + kw.slice(0, 4).map(k => `"${k}"`).join(' OR ') + ')' : 'startup funding';
  const d = await get(`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q + ' sourcelang:english')}&mode=artlist&format=json&maxrecords=100&timespan=7d`);
  return (d.articles || []).map(a => ({ kind: 'news', title: a.title, url: a.url, text: a.domain + ' ' + (a.sourcecountry || ''), ts: tsOf(a.seendate.replace(/(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z/, '$1-$2-$3T$4:$5:$6Z')), engagement: 1 })); });
add('fedreg', { name: 'US Federal Register（联邦公报：法规/通知）', cat: '政策', kind: 'policy', weight: .9, freq: 720 }, async () => (await get('https://www.federalregister.gov/api/v1/documents.json?per_page=100&order=newest&fields[]=title&fields[]=html_url&fields[]=publication_date&fields[]=type&fields[]=agencies&fields[]=abstract')).results.map(r => ({ kind: 'policy', title: `[${r.type}] ${r.title}`, url: r.html_url, text: (r.agencies || []).map(a => a.name).join(' ') + ' ' + strip(r.abstract).slice(0, 300), ts: tsOf(r.publication_date), engagement: r.type === 'Rule' ? 3 : 1, region: 'us' })));
add('cn_policy', { name: '中国政策（gov.cn / 部委，经 Google News）', cat: '政策', kind: 'policy', weight: .75, freq: 720 }, async () => multi(['site:gov.cn 政策', 'site:gov.cn 通知 印发', '国务院 印发 方案', '工信部 发布', '发改委 印发'].map(q => gnews(q, 'zh')), 'policy', { region: 'cn' }));
add('cn_tender', { name: '中国招标采购公告（经 Google News）', cat: '政策', kind: 'policy', weight: .55, freq: 1440 }, async () => multi(['招标公告 采购项目', '中标结果 公告 智能', '政府采购 公开招标'].map(q => gnews(q, 'zh')), 'policy', { region: 'cn', tender: 1 }));
add('fda', { name: 'FDA（510k 器械 / 药品召回）', cat: '行业', kind: 'policy', weight: .95, freq: 1440, industry: '351010' }, async () => { const out = [];
  for (const r of (await get('https://api.fda.gov/device/510k.json?limit=100&sort=decision_date:desc')).results) out.push({ kind: 'policy', title: `FDA 510(k) 获批：${r.device_name}（${r.applicant}）`, url: `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=${r.k_number}`, text: `medical device ${r.advisory_committee_description || ''} ${r.product_code}`, ts: tsOf(r.decision_date.replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3')), engagement: 2, company: r.applicant, industry: '351010' });
  for (const r of (await get('https://api.fda.gov/drug/enforcement.json?limit=60&sort=report_date:desc')).results) out.push({ kind: 'policy', title: `FDA 药品召回（${r.classification}）：${strip(r.product_description).slice(0, 120)}`, url: 'https://www.fda.gov/drugs/drug-safety-and-availability/drug-recalls', text: `drug recall pharmaceutical ${r.reason_for_recall?.slice(0, 200)} ${r.recalling_firm}`, ts: tsOf(r.report_date.replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3')), engagement: 1, industry: '352020' });
  return out; });
add('clinicaltrials', { name: 'ClinicalTrials.gov（最新更新试验）', cat: '行业', kind: 'research', weight: .9, freq: 1440, industry: '352010' }, async () => (await get('https://clinicaltrials.gov/api/v2/studies?pageSize=100&sort=LastUpdatePostDate:desc&fields=NCTId,BriefTitle,Condition,LastUpdatePostDate,LeadSponsorName,Phase,OverallStatus')).studies.map(s => { const p = s.protocolSection; return { kind: 'research', title: `临床试验 ${p.identificationModule.nctId}：${p.identificationModule.briefTitle}`, url: `https://clinicaltrials.gov/study/${p.identificationModule.nctId}`, text: `clinical trial ${(p.conditionsModule?.conditions || []).join(' ')} ${(p.designModule?.phases || []).join(' ')} ${p.sponsorCollaboratorsModule?.leadSponsor?.name || ''}`, ts: tsOf(p.statusModule?.lastUpdatePostDateStruct?.date), engagement: 1, industry: '352010' }; }));

// ===== 行业媒体（Industry Dive 等）=====
const DIVE = { agriculturedive: '302020', bankingdive: '401010', biopharmadive: '352020', cfodive: '202020', constructiondive: '201030', esgdive: '202010', fooddive: '302020', grocerydive: '301010', healthcaredive: '351020', highereddive: '253020', hrdive: '202020', k12dive: '253020', manufacturingdive: '201060', marketingdive: '502010', paymentsdive: '402010', restaurantdive: '253010', retaildive: '255040', smartcitiesdive: '551010', supplychaindive: '203010', utilitydive: '551010', wastedive: '202010' };
add('industrydive', { name: `Industry Dive 行业媒体（${Object.keys(DIVE).length} 个垂直频道）`, cat: '行业', kind: 'news', weight: .75, freq: 360 }, async () => { const out = []; let ok = 0;
  await Promise.all(Object.entries(DIVE).map(async ([d, ind]) => { try { out.push(...(await rssFn('news', `https://www.${d}.com/feeds/news/`, { industry: ind })()).map(x => ({ ...x, text: d + ' ' + x.text }))); ok++; } catch (e) {} }));
  if (!ok) throw new Error('全部频道失败'); return out; });
const TRADE = [['freightwaves', 'https://www.freightwaves.com/feed', '203040'], ['oilprice', 'https://oilprice.com/rss/main', '101020'], ['electrek', 'https://electrek.co/feed/', '251020'], ['aviationweek', 'https://www.aviationweek.com/rss.xml', '201010'], ['chemistryworld', 'https://www.chemistryworld.com/rss', '151010'], ['insurancejournal', 'https://www.insurancejournal.com/feed/', '403010'], ['fiercewireless', 'https://www.fiercewireless.com/rss/xml', '501020'], ['mobileworldlive', 'https://www.mobileworldlive.com/feed/', '501020'], ['ft', 'https://www.ft.com/rss/home', null]];
add('trade_media', { name: '行业垂直媒体（FreightWaves/OilPrice/Electrek/AviationWeek/Chemistry World/Insurance Journal/Fierce Wireless/MWL/FT）', cat: '行业', kind: 'news', weight: .7, freq: 360 }, async () => { const out = []; let ok = 0;
  await Promise.all(TRADE.map(async ([n, u, ind]) => { try { out.push(...(await rssFn('news', u, ind ? { industry: ind } : {})()).map(x => ({ ...x, text: n + ' ' + x.text }))); ok++; } catch (e) {} }));
  if (!ok) throw new Error('全部失败'); return out; });
// 按 GICS 板块的 Google News 查询（中英文）——保证每个板块都有新闻覆盖
add('gnews_sectors', { name: 'Google News 按行业查询（74 个 GICS 行业 × 中/英）', cat: '行业', kind: 'news', weight: .6, freq: 720 }, async (kw, cfg, ctx) => { const out = []; let ok = 0;
  const list = ctx.industries; const batch = +cfg.sectorQueriesPerRun || 74;
  const start = (ctx.state.gnewsCursor || 0) % list.length; const pick = [...list.slice(start), ...list.slice(0, start)].slice(0, batch); ctx.state.gnewsCursor = start + batch;
  for (const ind of pick) { for (const [q, lang] of [[ind.kwEn.slice(0, 3).map(k => `"${k}"`).join(' OR ') + ' (startup OR market OR launch)', 'en'], [ind.kwCn.slice(0, 3).join(' OR '), 'zh']]) {
    try { const items = await rssFn('news', gnews(q, lang), { industry: ind.code, region: lang === 'zh' ? 'cn' : 'us' })(); out.push(...items.slice(0, 15)); ok++; } catch (e) {} await sleep(250); } }
  if (!ok) throw new Error('全部查询失败'); return out; });

// ===== 中文源 =====
add('sspai', { name: '少数派', cat: '中文', kind: 'news', weight: .55, freq: 360, region: 'cn' }, rssFn('news', 'https://sspai.com/feed', { region: 'cn' }));
add('ithome', { name: 'IT之家', cat: '中文', kind: 'news', weight: .5, freq: 120, region: 'cn' }, rssFn('news', 'https://www.ithome.com/rss/', { region: 'cn' }));
add('tmtpost', { name: '钛媒体', cat: '中文', kind: 'news', weight: .6, freq: 180, region: 'cn' }, rssFn('news', 'https://www.tmtpost.com/rss.xml', { region: 'cn' }));
add('v2ex', { name: 'V2EX 热门', cat: '中文', kind: 'community', weight: .45, freq: 180, region: 'cn' }, async () => { const out = [];
  for (const u of ['https://www.v2ex.com/api/topics/hot.json', 'https://www.v2ex.com/api/topics/latest.json']) for (const t of await get(u)) out.push({ kind: 'community', region: 'cn', title: t.title, url: t.url, text: strip(t.content).slice(0, 300) + ' ' + (t.node?.title || ''), ts: t.created, engagement: t.replies });
  return out; });
add('tousu_sina', { name: '黑猫投诉（新浪，消费者投诉公开列表）', cat: '中文', kind: 'demand', weight: .6, freq: 360, region: 'cn' }, async (kw, cfg) => { const out = [], pages = Math.max(1, Math.min(20, +cfg.tousuPages || 8));
  for (let p = 1; p <= pages; p++) { const d = await get(`https://tousu.sina.com.cn/api/index/feed?type=1&page_size=10&page=${p}`); for (const x of d?.result?.data?.lists || []) { const m = x.main; if (!m?.title) continue;
    out.push({ kind: 'demand', region: 'cn', title: `黑猫投诉｜${m.cotitle || '未知商家'}：${m.title}`, url: 'https:' + String(m.url || '').split('?')[0], text: `${strip(m.summary || '').slice(0, 400)} 诉求：${m.appeal || ''} 问题：${m.issue || ''}`, ts: +m.timestamp || Math.floor(Date.now() / 1000), engagement: (+m.upvote_amount || 0) + (+m.comment_amount || 0), company: m.cotitle, issue: m.issue, pain: true }); }
    await sleep(400); }
  return out; });
add('cn_media', { name: '36氪 / 虎嗅 / IT桔子（官方 RSS 不可直连，经 Google News 站内检索）', cat: '中文', kind: 'news', weight: .6, freq: 360, region: 'cn' }, async () => multi(['site:36kr.com', 'site:huxiu.com', 'site:itjuzi.com', '36氪 融资', '完成 亿元 融资 A轮'].map(q => gnews(q, 'zh')), 'news', { region: 'cn' }));

// ===== Common Crawl（单独模块）=====
const CC = require('./commoncrawl');
add('ccnews', { name: 'Common Crawl CC-NEWS（WARC 流式解析）', cat: '宏观', kind: 'news', weight: .6, freq: 1440 }, (kw, cfg, ctx) => CC.ccnews(cfg, ctx));
add('cc_cdx', { name: 'Common Crawl CDX 索引（域名/页面增长）', cat: '供给', kind: 'supply', weight: .7, freq: 10080 }, (kw, cfg, ctx) => CC.cdx(cfg, ctx));

// ===== 需要 Key =====
add('x', { name: 'X / Twitter 近期搜索', cat: '需求', kind: 'social', weight: .5, freq: 180, key: 'xBearer' }, async (kw, cfg) => { const out = [];
  for (const k of (kw.length ? kw : ['startup']).slice(0, 3)) { const d = await get(`https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(k + ' -is:retweet lang:en')}&max_results=50&tweet.fields=created_at,public_metrics`, { headers: { Authorization: `Bearer ${cfg.xBearer}` } });
    for (const t of d.data || []) out.push({ kind: 'social', title: t.text.slice(0, 200), url: `https://x.com/i/status/${t.id}`, text: '', ts: tsOf(t.created_at), engagement: Object.values(t.public_metrics || {}).reduce((a, b) => a + b, 0) }); }
  return out; });
add('producthuntapi', { name: 'Product Hunt GraphQL', cat: '供给', kind: 'product', weight: .7, freq: 360, key: 'phToken' }, async (kw, cfg) => { const d = await get('https://api.producthunt.com/v2/api/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.phToken}` }, body: JSON.stringify({ query: '{posts(first:50,order:VOTES,postedAfter:"' + new Date(Date.now() - 7 * 864e5).toISOString() + '"){edges{node{name tagline url votesCount createdAt topics{edges{node{name}}}}}}}' }) });
  return (d.data?.posts?.edges || []).map(({ node: n }) => ({ kind: 'product', title: `${n.name} — ${n.tagline}`, url: n.url, text: n.topics.edges.map(e => e.node.name).join(' '), ts: tsOf(n.createdAt), engagement: n.votesCount, company: n.name })); });
add('crunchbase', { name: 'Crunchbase 融资轮次', cat: '资本', kind: 'funding', weight: .9, freq: 720, key: 'crunchbaseKey' }, async (kw, cfg) => { const d = await get('https://api.crunchbase.com/api/v4/searches/funding_rounds', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-cb-user-key': cfg.crunchbaseKey }, body: JSON.stringify({ field_ids: ['identifier', 'announced_on', 'money_raised', 'funded_organization_identifier', 'investment_type'], order: [{ field_id: 'announced_on', sort: 'desc' }], limit: 100, query: [{ type: 'predicate', field_id: 'announced_on', operator_id: 'gte', values: [new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10)] }] }) });
  return (d.entities || []).map(e => { const p = e.properties; return { kind: 'funding', title: `${p.funded_organization_identifier?.value} raises ${p.money_raised?.value_usd ? '$' + Math.round(p.money_raised.value_usd / 1e6) + 'M' : ''} ${p.investment_type || ''}`, url: `https://www.crunchbase.com/funding_round/${p.identifier?.permalink}`, text: '', ts: tsOf(p.announced_on), engagement: 1, company: p.funded_organization_identifier?.value }; }); });
add('patentsview', { name: 'USPTO PatentsView 专利', cat: '供给', kind: 'research', weight: .85, freq: 1440, key: 'patentsviewKey' }, async (kw, cfg) => { const since = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
  const d = await get(`https://search.patentsview.org/api/v1/patent/?q=${encodeURIComponent(JSON.stringify({ _gte: { patent_date: since } }))}&f=${encodeURIComponent('["patent_id","patent_title","patent_date","assignees.assignee_organization","cpc_current.cpc_group_id"]')}&o=${encodeURIComponent('{"size":200}')}`, { headers: { 'X-Api-Key': cfg.patentsviewKey } });
  return (d.patents || []).map(p => ({ kind: 'research', title: `专利 ${p.patent_id}：${p.patent_title}`, url: `https://patents.google.com/patent/US${p.patent_id}`, text: `patent ${(p.assignees || []).map(a => a.assignee_organization).join(' ')}`, ts: tsOf(p.patent_date), engagement: 2, company: p.assignees?.[0]?.assignee_organization })); });
add('samgov', { name: 'SAM.gov 美国政府招标', cat: '政策', kind: 'policy', weight: .85, freq: 1440, key: 'samKey' }, async (kw, cfg) => { const f = d => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
  const d = await get(`https://api.sam.gov/opportunities/v2/search?api_key=${cfg.samKey}&limit=200&postedFrom=${f(new Date(Date.now() - 7 * 864e5))}&postedTo=${f(new Date())}`);
  return (d.opportunitiesData || []).map(o => ({ kind: 'policy', title: `美国政府招标：${o.title}`, url: o.uiLink, text: `${o.department || ''} NAICS ${o.naicsCode || ''} ${o.type || ''}`, ts: tsOf(o.postedDate), engagement: 2, tender: 1, region: 'us' })); });

// 不可用 / 未接入（实测结果，供数据源页展示）
const UNAVAILABLE = [
  ['36kr_rss', '36氪官方 RSS', '返回反爬 HTML 页面（已改为经 Google News 站内检索）'], ['huxiu_rss', '虎嗅官方 RSS', '连接超时（已改为经 Google News）'], ['itjuzi', 'IT桔子 API', 'HTTP 412，需要商业授权（经 Google News 检索公开报道）'],
  ['weibo', '微博热搜', 'HTTP 403，需要登录态，未接入'], ['google_play', 'Google Play 榜单', '没有官方公开 API，未接入'], ['g2', 'G2 差评', '页面由 JS 渲染且有反爬，没有公开 API，未接入'],
  ['pwc', 'Papers with Code API', '已重定向到 Hugging Face Papers（已用 hf_papers 替代）'], ['gtrends_cn', 'Google Trends 中国', 'HTTP 400，不支持 CN 地区'], ['pytrends', 'pytrends（Google Trends 关键词时序）', '非官方接口，易被 429 封禁，且需要 Python 运行时，未内置'],
  ['a16z_rss', 'a16z 官方 RSS', 'HTTP 404（已改为经 Google News）'], ['fiercepharma', 'Fierce Pharma RSS', 'HTTP 403'], ['mining', 'Mining.com RSS', 'HTTP 403'], ['autonews', 'Automotive News RSS', 'HTTP 403'], ['gov_cn_direct', 'gov.cn 政策列表页直连', '列表由 JS 渲染（已改为经 Google News 检索 site:gov.cn）'], ['ccgp', '中国政府采购网', '页面结构复杂且有反爬（已改为经 Google News 检索招标公告）']
];
module.exports = { SOURCES: S, UNAVAILABLE, get, sleep, UA };
