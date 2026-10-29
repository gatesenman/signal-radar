const { app, BrowserWindow, ipcMain, dialog, Notification, shell, Menu, nativeImage } = require('electron');
const path = require('path'), fs = require('fs');
const initSqlJs = require('sql.js');
const { SOURCES, UNAVAILABLE } = require('./collectors'); require('./extra');
const E = require('./engine'), EMB = require('./embed'), M = require('./macro'), CH = require('./chain'), DIMS = require('./dims'), SN = require('./snapshots'), zlib = require('zlib');
const { INDUSTRIES, SECTORS, GB } = require('./industries');

let lastDims = null, db, dbFile, win, timer, busy = false, saveT, lastCluster = {};
const DEFAULTS = { disabledSources: ['ccnews', 'cc_cdx', 'amazon_reviews', 'wayback'], keywords: 'ai agent, humanoid robot, energy storage, glp-1, elder care', skills: '', autoRefresh: true, llmProvider: 'none', openaiBase: 'https://api.openai.com/v1', openaiKey: '', openaiModel: 'gpt-4o-mini', ollamaUrl: 'http://localhost:11434', ollamaModel: 'qwen2.5', githubToken: '', xBearer: '', phToken: '', crunchbaseKey: '', patentsviewKey: '', samKey: '', fredKey: '', censusKey: '', estatKey: '', coreKey: '', s2Key: '', opencorporatesKey: '', companiesHouseKey: '', openalexKey: '', userName: '', clusterSim: 0.6,
  ccNewsFiles: 1, ccNewsMBPerFile: 40, ccDiskMB: 200, cdxTlds: 'ai,io', cdxPaths: '/pricing,/careers', cdxDomains: '', ghaHours: 2, ghaMBPerHour: 150, amazonCats: 'Health_and_Household,Home_and_Kitchen,Electronics,Pet_Supplies,Baby_Products', amazonMBPerCat: 8, sectorQueriesPerRun: 74, weights: {} };

function save(now) { clearTimeout(saveT); const f = () => fs.writeFileSync(dbFile, Buffer.from(db.export())); if (now) f(); else saveT = setTimeout(f, 800); }
const all = (sql, p = []) => { const st = db.prepare(sql); st.bind(p); const r = []; while (st.step()) r.push(st.getAsObject()); st.free(); return r; };
const run = (sql, p = []) => db.run(sql, p);
async function initDb() {
  const SQL = await initSqlJs({ locateFile: f => path.join(path.dirname(require.resolve('sql.js')), f).replace('app.asar', 'app.asar.unpacked') });
  dbFile = process.env.SR_DB || path.join(app.getPath('userData'), 'signal-radar-v2.sqlite');
  db = fs.existsSync(dbFile) ? new SQL.Database(fs.readFileSync(dbFile)) : new SQL.Database();
  db.run(`CREATE TABLE IF NOT EXISTS signals(id TEXT PRIMARY KEY, source TEXT, kind TEXT, region TEXT, title TEXT, url TEXT, text TEXT, ts INTEGER, engagement REAL, fetched INTEGER, weight REAL, ind TEXT, ind_by TEXT, meta TEXT, emb BLOB);
  CREATE INDEX IF NOT EXISTS i_sig_ts ON signals(ts); CREATE INDEX IF NOT EXISTS i_sig_ind ON signals(ind);
  CREATE TABLE IF NOT EXISTS opps(id TEXT PRIMARY KEY, json TEXT, total INTEGER, updated INTEGER);
  CREATE TABLE IF NOT EXISTS workspace(opp_id TEXT PRIMARY KEY, json TEXT);
  CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT);
  CREATE TABLE IF NOT EXISTS runs(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, source TEXT, ok INTEGER, count INTEGER, ms INTEGER, err TEXT);
  CREATE TABLE IF NOT EXISTS alerts(id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, value TEXT, enabled INTEGER DEFAULT 1);
  CREATE TABLE IF NOT EXISTS snapshots(day TEXT PRIMARY KEY, ts INTEGER, backfill INTEGER, stats TEXT, data BLOB);
  CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, alert_id INTEGER, ref TEXT, title TEXT, body TEXT, read INTEGER DEFAULT 0, UNIQUE(alert_id, ref));
  CREATE TABLE IF NOT EXISTS logs(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, msg TEXT);`);
  if (!all('SELECT 1 FROM alerts').length) { run("INSERT INTO alerts(type,value) VALUES('score','70')"); run("INSERT INTO alerts(type,value) VALUES('funding','50')"); }
  save(true);
}
const getK = (k, d) => { const r = all('SELECT v FROM settings WHERE k=?', [k])[0]; return r ? JSON.parse(r.v) : d; };
const setK = (k, v) => run('INSERT OR REPLACE INTO settings VALUES(?,?)', [k, JSON.stringify(v)]);
function getCfg() { const c = { ...DEFAULTS }; for (const r of all("SELECT * FROM settings WHERE k NOT IN ('macro','srcState')")) c[r.k] = JSON.parse(r.v); return c; }
const kwList = c => String(c.keywords || '').split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
const hash = s => require('crypto').createHash('md5').update(s).digest('hex').slice(0, 14);
const send = (ch, d) => win && !win.isDestroyed() && win.webContents.send(ch, d);
const log = m => { run('INSERT INTO logs(ts,msg) VALUES(?,?)', [Date.now(), m]); send('log', m); };
const srcWeight = (id, cfg) => cfg.weights?.[id] ?? SOURCES[id].weight;
const enabled = (id, cfg) => { const s = SOURCES[id]; if (s.unavailable) return false; if (s.key && !cfg[s.key]) return false; return !cfg.disabledSources.includes(id); };

let protos = null;
async function industryProtos() { if (protos) return protos; const v = await EMB.embed(INDUSTRIES.map(i => `${i.en}; ${i.kwEn.join(', ')}; ${i.cn}; ${i.kwCn.join('，')}`), app.getPath('userData')); protos = INDUSTRIES.map((i, k) => ({ code: i.code, v: v[k] })); return protos; }
async function embedPending() {
  const rows = all('SELECT id,title,text,ind,meta FROM signals WHERE emb IS NULL LIMIT 20000'); if (!rows.length) return 0;
  send('progress', { id: '_embed', state: 'running', count: rows.length }); const t0 = Date.now();
  const P = await industryProtos();
  for (let i = 0; i < rows.length; i += 256) { const b = rows.slice(i, i + 256); const vs = await EMB.embed(b.map(r => r.title + '. ' + (r.text || '').slice(0, 120)), app.getPath('userData'));
    b.forEach((r, j) => { const meta = JSON.parse(r.meta || '{}'); const [ind, by] = E.tagIndustry({ title: r.title, text: r.text, industry: meta.industry, vec: vs[j] }, P);
      run('UPDATE signals SET emb=?, ind=?, ind_by=? WHERE id=?', [new Uint8Array(vs[j].buffer), ind, by, r.id]); });
    send('progress', { id: '_embed', state: 'running', count: rows.length - i - b.length }); }
  log(`语义嵌入 ${rows.length} 条信号，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s，并完成行业打标`); send('progress', { id: '_embed', state: 'ok' }); return rows.length;
}
async function refresh(opt = {}) {
  if (!opt.only && process.env.SR_ONLY) opt = { ...opt, only: process.env.SR_ONLY.split(',') };
  if (busy) return { busy: true }; busy = true;
  const cfg = getCfg(), kw = kwList(cfg), report = [], state = getK('srcState', {}), nowS = Math.floor(Date.now() / 1000);
  const ctx = { state, dataDir: app.getPath('userData'), log, industries: INDUSTRIES };
  let ids = Object.keys(SOURCES).filter(id => enabled(id, cfg));
  if (opt.only) ids = ids.filter(id => opt.only.includes(id));
  const H = getK('srcHealth', {});
  // v4.4 熔断三态：closed → open（连续失败≥3）→ 冷却到期后 half（只放行 1 次试探）→ 成功 closed / 失败重新 open 且冷却翻倍
  if (opt.due) ids = ids.filter(id => { const h = H[id]; if (!h || !h.nextAt || h.nextAt <= nowS) { if (h?.open) { h.state = 'half'; h.probes = (h.probes || 0) + 1; } return true; } return false; });
  if (opt.due) ids = ids.filter(id => { const l = H[id]; return !(l && l.state === 'half' && l.probing); });
  for (const id of ids) if (H[id]?.state === 'half') H[id].probing = true;
  if (opt.due) ids = ids.filter(id => { const l = all('SELECT ts FROM runs WHERE source=? AND ok=1 ORDER BY id DESC LIMIT 1', [id])[0]; return H[id]?.state === 'half' || !l || nowS - l.ts > SOURCES[id].freq * 60; });
  const queue = [...ids]; const worker = async () => { while (queue.length) { const id = queue.shift(); const t0 = Date.now(); send('progress', { id, state: 'running' });
    try { if (FAULT.has(id)) throw new Error('注入故障（测试）');
      const list = (await SOURCES[id].fetch(kw, cfg, ctx)).filter(s => s.title && s.url); let n = 0; const now = Math.floor(Date.now() / 1000), w = srcWeight(id, cfg);
      for (const s of list) { const sid = id + ':' + hash(String(s.url) + s.title); const ex = all('SELECT 1 FROM signals WHERE id=?', [sid]).length; if (!ex) n++;
        const meta = JSON.stringify({ industry: s.industry || SOURCES[id].industry, velocity: s.velocity, pain: s.pain, tender: s.tender, company: s.company, historical: s.historical, cdx: s.cdx, series: s.series, sec: s.sec });
        if (ex) run('UPDATE signals SET engagement=?, fetched=?, meta=?, title=? WHERE id=?', [Math.max(0, +s.engagement || 0), now, meta, s.title.slice(0, 400), sid]);
        else run('INSERT INTO signals(id,source,kind,region,title,url,text,ts,engagement,fetched,weight,meta) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', [sid, id, s.kind || SOURCES[id].kind, s.region || SOURCES[id].region || 'global', s.title.slice(0, 400), String(s.url), (s.text || '').slice(0, 800), Math.min(+s.ts || now, now), Math.max(0, +s.engagement || 0), now, w, meta]); }
      run('INSERT INTO runs(ts,source,ok,count,ms,err) VALUES(?,?,?,?,?,?)', [now, id, 1, list.length, Date.now() - t0, `新增 ${n}`]); H[id] = { fails: 0, nextAt: 0, lastOk: now, open: false, state: 'closed', recovered: H[id]?.state === 'half' ? now : H[id]?.recovered, probes: H[id]?.probes || 0 }; report.push({ id, ok: true, count: list.length, added: n }); send('progress', { id, state: 'ok', count: list.length });
    } catch (e) { run('INSERT INTO runs(ts,source,ok,count,ms,err) VALUES(?,?,?,?,?,?)', [Math.floor(Date.now() / 1000), id, 0, 0, Date.now() - t0, String(e.message || e).slice(0, 200)]); { const h = H[id] || { fails: 0 }; h.fails = (h.fails || 0) + 1; const base = Math.min(6 * 3600, (SOURCES[id].freq || 60) * 60 * 2 ** (h.fails - 1)); h.nextAt = Math.floor(Date.now() / 1000) + Math.round(Math.random() * base); if (h.state === 'half') { h.nextAt = Math.floor(Date.now() / 1000) + Math.min(12 * 3600, 2 * base); } h.probing = false; h.open = h.fails >= 3; h.state = h.open ? 'open' : 'closed'; h.lastErr = String(e.message || e).slice(0, 120); H[id] = h; } report.push({ id, ok: false, err: String(e.message || e) }); send('progress', { id, state: 'err', err: String(e.message) }); } } };
  await Promise.all(Array.from({ length: 8 }, worker));
  setK('srcState', state); setK('srcHealth', H); save(true);
  try { await embedPending(); } catch (e) { log('嵌入失败：' + e.message); }
  if (!getK('macro') || Date.now() - getK('macro').ts > 86400e3) await refreshMacro();
  if (!getK('chain') || Date.now() - getK('chain').ts > 7 * 86400e3) await refreshChain();
  if (!getK('istats') || Date.now() - getK('istats').ts > 7 * 86400e3) await refreshStats();
  try { await recluster(); checkAlerts(); } catch (e) { log('重新聚类失败：' + (e.message || e)); } finally { busy = false; } save(true); send('refreshed', report); return report;
}
async function refreshChain() { try { const c = await CH.fetchChain(getCfg(), log); setK('chain', c); return c; } catch (e) { log('产业链失败：' + e.message); } }
async function refreshStats() { try { const s = await CH.fetchStats(getCfg(), log); setK('istats', s); return s; } catch (e) { log('行业统计失败：' + e.message); } }
function chainFor(code, chain) { if (!chain || !code) return null; return chain.chains[code] ? { code, ...chain.chains[code] } : (Object.entries(chain.chains).find(([k]) => k.slice(0, 4) === code.slice(0, 4)) || []).length ? (([k, v]) => ({ code: k, ...v }))(Object.entries(chain.chains).find(([k]) => k.slice(0, 4) === code.slice(0, 4))) : null; }
async function refreshMacro() { try { const m = await M.fetchMacro(getCfg()); setK('macro', m); log(`宏观数据更新：世界银行 ${Object.keys(m.wb).length} 项，IMF ${Object.keys(m.imf).length}，FRED ${Object.keys(m.fred).length}，Comtrade ${m.comtrade ? m.comtrade.rows.length + ' 章' : '失败'}`); return m; } catch (e) { log('宏观数据失败：' + e.message); } }
async function recluster() {
  const cfg = getCfg(), t0 = Date.now();
  const rows = all('SELECT id,source,kind,region,title,url,text,ts,engagement,weight,ind,meta,emb FROM signals WHERE ts > ? AND emb IS NOT NULL', [Math.floor(Date.now() / 1000) - 30 * 86400]);
  const sigs = rows.map(r => { const m = JSON.parse(r.meta || '{}'); const b = r.emb; return { ...r, ...m, industry: undefined, vec: new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4), emb: undefined, meta: undefined }; });
  const res = E.cluster(sigs, cfg); lastCluster = { clusters: res.clusters, pool: res.pool, ms: Date.now() - t0 };
  run('DELETE FROM opps'); { const seen = new Map(); for (const o of res.opps) { const k = seen.get(o.id) || 0; seen.set(o.id, k + 1); if (k) o.id += '~' + k; } } for (const o of res.opps) run('INSERT OR REPLACE INTO opps VALUES(?,?,?,?)', [o.id, JSON.stringify(o), o.total, o.updated]);
  try { const all30 = all('SELECT id,source,kind,region,title,url,text,ts,engagement,weight,ind,meta FROM signals WHERE ts > ? OR source = ?', [Math.floor(Date.now() / 1000) - 60 * 86400, 'amazon_reviews']).map(r => ({ ...r, ...JSON.parse(r.meta || '{}'), meta: undefined }));
    const dr = DIMS.run({ signals: all30, opps: res.opps, chain: getK('chain'), macro: getK('macro') }); setK('dims', { ...dr, at: Date.now() }); lastDims = dr; log(`机会维度：${dr.cards.length} 张卡片，${Object.values(dr.counts).filter(Boolean).length}/${dr.dims.length} 个维度有命中`); } catch (e) { log('维度引擎失败：' + e.message, 'error'); }
  try { takeSnapshot({ opps: res.opps.map(o => ({ ...o, total: Math.min(100, o.total + 8 * Math.max(0, (lastDims?.oppDims?.[o.id]?.length || 1) - 1)) })), dims: lastDims }); } catch (e) { log('快照失败：' + e.message); }
  log(`语义聚类：${res.pool} 条信号 → ${res.clusters} 个簇 → ${res.opps.length} 个机会（相似度阈值 ${cfg.clusterSim}，${lastCluster.ms}ms）`);
}
function ws(id) { const r = all('SELECT json FROM workspace WHERE opp_id=?', [id])[0]; return r ? JSON.parse(r.json) : {}; }
function setWs(id, patch) { const w = { ...ws(id), ...patch, updatedAt: Date.now() }; for (const k in patch) if (patch[k] === undefined) delete w[k]; run('INSERT OR REPLACE INTO workspace VALUES(?,?)', [id, JSON.stringify(w)]); save(); return w; }
function merged(o, macro) { const w = ws(o.id); const l = w.llm || {}; const ch = chainLink(o, macro?.chainData);
  const asymmetry = [...(o.asymmetry || []), ...(ch?.chokes || []).slice(0, 2).map(c => ({ key: 'choke', type: '产业链卡脖子', gap: 80, desc: `${ch.name} ${c.node}：${c.why}`, evidence: [{ title: c.node + ' 出口国份额（OEC/USGS）', url: c.url, source: 'chain' }] }))];
  const dims = l.dims || o.dims; const delta = l.dims ? Object.keys(dims).reduce((a, k) => a + dims[k] - o.dims[k], 0) / 6 : 0;
  const ue = { ...o.unitEcon, ...(w.unitEcon || {}) };
  return { ...o, ...l, dims, unitEcon: ue, statement: l.statement || o.statement, checklist: w.checklist || l.checklist || o.checklist, stage: w.stage || 'discover', notes: w.notes || '', watched: !!w.watched, ruleTotal: o.total, total: Math.round(o.total + delta), comments: w.comments || [], tam: E.tam({ ...o, unitEcon: ue }, macro, w.assump || {}), assump: w.assump || {}, chain: ch, asymmetry }; }
function chainLink(o, chain) { const c = chainFor(o.industry, chain); if (!c) return null; const chokes = c.nodes.filter(n => n.choke);
  return { code: c.code, name: c.name, nodes: c.nodes, chokes: chokes.map(n => ({ node: n.stage + '·' + n.name, why: n.chokeWhy, growth: n.growth, url: n.url })) }; }
// v4.1 个性化：Rocchio 式隐式反馈画像（观察/阶段推进为正，放弃为负），在行业与主题词上累积权重
const STW = { screen: 1, research: 2, validate: 3, go: 4, drop: -2 };
function personalize(list) { const byId = Object.fromEntries(list.map(o => [o.id, o])), P = {}; let nFb = 0;
  for (const r of all('SELECT * FROM workspace')) { const w = JSON.parse(r.json), o = byId[r.opp_id] || w.snapshot; if (!o) continue; const wt = (w.watched ? 1 : 0) + (STW[w.stage] || 0); if (!wt) continue; nFb++;
    const f = [...(o.industry ? ['ind:' + o.industry] : []), ...(o.terms || []).slice(0, 5).map(t => 't:' + String(t).toLowerCase())]; for (const k of f) P[k] = (P[k] || 0) + wt / (k.startsWith('ind:') ? 1 : 2); }
  const on = nFb >= 3; for (const o of list) { if (!on) { o.personal = { on: false, n: nFb, score: o.total }; continue; }
    const c = [...(o.industry ? [['ind:' + o.industry, P['ind:' + o.industry] || 0]] : []), ...(o.terms || []).slice(0, 5).map(t => ['t:' + String(t).toLowerCase(), P['t:' + String(t).toLowerCase()] || 0])].filter(x => x[1]);
    const raw = c.reduce((a, x) => a + x[1], 0), adj = Math.round(8 * Math.tanh(raw / 6)); // 上限 ±8，避免信息茧房
    o.personal = { on: true, n: nFb, adj, score: Math.max(0, Math.min(100, o.total + adj)), why: c.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3).map(([k, v]) => (k.startsWith('ind:') ? '行业 ' + k.slice(4) : '主题词 ' + k.slice(2)) + (v > 0 ? ' +' : ' ') + v.toFixed(1)) }; } 
  // v4.7 探索位：每 5 个位置中的第 4 个，留给「不在你正反馈行业里」的最高分机会（ε-greedy / 多样性重排），防止信息茧房
  if (!on) return; const liked = new Set(Object.entries(P).filter(([k, v]) => k.startsWith('ind:') && v > 0).map(([k]) => k.slice(4)));
  const pool = list.filter(o => !o.quality?.noise && !o.stale).sort((a, b) => b.personal.score - a.personal.score), out = [], used = new Set();
  const exp = pool.filter(o => !liked.has(o.industry) && !o.personal.adj); // 只探索「没有任何反馈」的行业，不推你放弃过的
  const cnt = {}, cap = 4; // 多样性：每 10 个位置同一行业最多 4 个（候选不够时放宽）
  for (let p = 0; out.length < pool.length; p++) { let o;
    if (p % 5 === 3) o = exp.find(x => !used.has(x.id)); if (o) o.personal.explore = true; else o = pool.find(x => !used.has(x.id) && (cnt[(x.industry || '?') + '|' + Math.floor(p / 10)] || 0) < cap) || pool.find(x => !used.has(x.id)); if (!o) break; used.add(o.id); out.push(o); const ck = (o.industry || '?') + '|' + Math.floor(p / 10); cnt[ck] = (cnt[ck] || 0) + 1; }
  out.forEach((o, i) => o.personal.rank = i + 1); list.filter(o => !used.has(o.id)).forEach(o => o.personal.rank = 9999); }

function getOpps() { const DM = getK('dims')?.oppDims || {}; const macro = { ...(getK('macro') || {}), stats: getK('istats'), chainData: getK('chain') }; const ids = new Set(); const list = all('SELECT json FROM opps ORDER BY total DESC').map(r => { const o = JSON.parse(r.json); ids.add(o.id); const m = merged(o, macro); const dh = DM[o.id] || []; m.dimHits = dh; if (dh.length > 1) { m.dimBoost = 8 * (dh.length - 1); m.total = Math.min(100, m.total + m.dimBoost); } return m; }).sort((a, b) => b.total - a.total);
  for (const r of all('SELECT * FROM workspace')) { const w = JSON.parse(r.json); if (!ids.has(r.opp_id) && w.snapshot && ((w.stage && w.stage !== 'discover') || w.watched)) list.push({ ...merged(w.snapshot, macro), stale: true }); }
  personalize(list); return list; }
// v4.8 主进程文案（系统通知、提醒标题）跟随界面语言；渲染进程切换语言时通过 lang:set 告知
let LANG = 'zh'; const NT = (zh, en) => LANG === 'en' ? en : zh;
function checkAlerts() {
  const opps = getOpps(), sigs = all('SELECT * FROM signals WHERE fetched > ?', [Math.floor(Date.now() / 1000) - 3600]);
  for (const a of all('SELECT * FROM alerts WHERE enabled=1')) { const hits = [];
    if (a.type === 'score') opps.filter(o => o.total >= +a.value).forEach(o => hits.push([o.id, NT(`高分机会：${o.title}（${o.total}）`, `High-score opportunity: ${o.title} (${o.total})`), o.statement.pain.slice(0, 120)]));
    if (a.type === 'keyword') sigs.filter(s => (s.title + s.text).toLowerCase().includes(a.value.toLowerCase())).forEach(s => hits.push([s.id, NT(`关键词「${a.value}」新信号`, `New signal for keyword "${a.value}"`), s.title]));
    if (a.type === 'funding') sigs.map(E.extractFunding).filter(f => f && f.amountM >= +a.value).forEach(f => hits.push([f.url, NT(`融资 ≥ $${a.value}M：${f.company}`, `Funding ≥ $${a.value}M: ${f.company}`), f.title]));
    if (a.type === 'industry') opps.filter(o => o.industry && o.industry.startsWith(a.value)).forEach(o => hits.push([o.id, NT(`行业 ${a.value} 新机会：${o.title}`, `New in industry ${a.value}: ${o.title}`), o.industryName]));
    if (a.type === 'watch') opps.filter(o => o.watched && o.metrics.last3 > 0).forEach(o => hits.push([o.id + ':' + new Date().toDateString(), NT(`观察中的机会有新动态：${o.title}`, `Watched opportunity updated: ${o.title}`), NT(`近 3 天 ${o.metrics.last3} 条新信号`, `${o.metrics.last3} new signals in 3 days`)]));
    for (const [ref, title, body] of hits) { run('INSERT OR IGNORE INTO notifications(ts,alert_id,ref,title,body) VALUES(?,?,?,?,?)', [Date.now(), a.id, ref, title, body]);
      if (db.getRowsModified() && Notification.isSupported() && !process.env.SR_SHOT) new Notification({ title: NT('商机雷达 · ', 'Signal Radar · ') + title, body }).show(); } }
}
// v4.2 每日简报：快照后自动生成跨来源一页简报（带 [n] 引用），存为 md 并弹系统通知；不外发
// v4.9「为什么值得看」：不再套用规则模板（如「资本涌入：…」），改为从该机会自身的数据里挑 2–3 个最有区分度的事实，
// 按「变化 → 佐证 → 反方/不确定性」组织成一句话（data-to-text 内容选择 + 句子规划），并附上最强证据的引用
const LIFE_CN = { exploding: '爆发', regular: '稳定增长', peaked: '已见顶', declining: '下滑', flat: '平稳' };
function whyLine(o, cite) { const m = o.metrics || {}, f = o.fundings || [], L = o.ts?.life, k = o.kinds || {}, facts = [];
  if (m.growthRatio >= 1.5 && m.last3 >= 5) facts.push([m.growthRatio, `近 7 天日均信号量是前 7 天的 ${(+m.growthRatio).toFixed(1)} 倍（近 3 天 ${m.last3} 条）`]);
  if (f.length) { const sum = f.reduce((a, x) => a + (x.amountM || 0), 0); facts.push([2 + f.length, `${f.length} 笔融资${sum ? '，合计约 $' + Math.round(sum) + 'M' : ''}（最大一笔：${(f.slice().sort((a, b) => (b.amountM || 0) - (a.amountM || 0))[0].company || '').slice(0, 16)}）`]); }
  if ((k.demand || 0) + (k.community || 0) >= 3) facts.push([1.5 + ((k.demand || 0) + (k.community || 0)) / 10, `${(k.demand || 0) + (k.community || 0)} 条需求/社区信号说明有人在找解决办法`]);
  if ((o.sources || []).length >= 4) facts.push([1 + o.sources.length / 5, `${o.sources.length} 个独立来源交叉出现`]);
  if (o.mosaic?.talentLinked?.linked >= 3) facts.push([1.2, `关联招聘 ${o.mosaic.talentLinked.linked} 条`]);
  const top = facts.sort((a, b) => b[0] - a[0]).slice(0, 2).map(x => x[1]);
  const ev = (o.evidence || []).slice().sort((a, b) => (b.engagement || 0) - (a.engagement || 0))[0];
  const caveat = o.mosaic?.newsAdj < 1 ? '但以新闻报道为主，缺少产品或需求侧佐证' : L?.provisional ? `生命周期判为「${LIFE_CN[L.stage] || L.stage}」，历史不足 14 天，属初判` : L?.stage === 'peaked' || L?.stage === 'declining' ? `但热度已${LIFE_CN[L.stage]}` : '';
  const head = top.length ? top.join('，') : `共 ${m.signals || 0} 条信号`;
  return `${head}${caveat ? '；' + caveat : ''}。${ev ? '代表证据：「' + String(ev.title).slice(0, 36) + '」' + cite(ev) : ''}`; }
function dailyBrief(day = dayOf()) { const opps = getOpps().filter(o => !o.quality?.noise && !o.stale), refs = [], cite = e => { if (!e?.url) return ''; let i = refs.findIndex(r => r.url === e.url); if (i < 0) { refs.push({ title: e.title, url: e.url }); i = refs.length - 1; } return `[${i + 1}]`; };
  const key = o => o.personal?.on ? o.personal.score : o.total, top = [...opps].sort((a, b) => key(b) - key(a)).slice(0, 5);
  const fresh = opps.filter(o => (o.metrics?.last3 || 0) > 0 && o.ts?.life?.stage === 'exploding').slice(0, 5), watch = opps.filter(o => o.watched && (o.metrics?.last3 || 0) > 0);
  const H = getK('srcHealth', {}), open = Object.entries(H).filter(([, h]) => h.open).map(([id, h]) => `${SOURCES[id]?.name || id}（连续失败 ${h.fails} 次：${h.lastErr || ''}）`);
  const cards = (getK('dims')?.cards || []).slice().sort((a, b) => (b.final || b.score) - (a.final || a.score)).slice(0, 3);
  const L = [`# 商机雷达 · 每日简报 ${day}`, '', `> 自动生成于 ${new Date().toLocaleString('zh-CN', { hour12: false })}（本机时区）。${top[0]?.personal?.on ? '排序已按你的反馈个性化（个人分）。' : '尚未启用个性化（反馈不足 3 次），按综合评分排序。'}`, '', '## 今日最值得看'];
  top.forEach((o, i) => L.push(`${i + 1}. **${o.title}**（${o.industryName || ''}）评分 ${o.total}${o.personal?.on ? ' · 个人分 ' + o.personal.score : ''}${o.mosaic ? ' · 体检分 ' + o.mosaic.score : ''} ${(o.evidence || []).slice(0, 2).map(cite).join('')}`, `   - ${whyLine(o, cite)}`));
  L.push('', '## 正在爆发'); if (!fresh.length) L.push('- 今日无（生命周期判为爆发且近 3 天有新信号的主题为 0）'); fresh.forEach(o => L.push(`- ${o.title}：近 3 天 ${o.metrics.last3} 条 ${cite((o.evidence || [])[0])}`));
  L.push('', '## 你在观察的'); if (!watch.length) L.push('- 无新动态'); watch.forEach(o => L.push(`- ${o.title}：近 3 天 ${o.metrics.last3} 条新信号 ${cite((o.evidence || [])[0])}`));
  if (cards.length) { L.push('', '## 多维度卡片 Top 3'); cards.forEach(c => L.push(`- 【${c.dimName}】${c.title} ${cite((c.evidence || [])[0])}`)); }
  L.push('', '## 采集健康'); L.push(open.length ? open.map(x => '- 熔断：' + x).join('\n') : '- 所有启用的数据源均未熔断');
  L.push('', '## 引用'); refs.forEach((r, i) => L.push(`[${i + 1}] ${r.title || r.url} — ${r.url}`));
  const md = L.join('\n'), dir = path.join(app.getPath('userData'), 'briefs'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, day + '.md'), md);
  setK('lastBrief', { day, md }); if (Notification.isSupported() && !process.env.SR_SHOT) new Notification({ title: NT('商机雷达 · 每日简报', 'Signal Radar · Daily brief'), body: top[0] ? NT('今日首位：', 'Top today: ') + top[0].title.slice(0, 40) : NT('今日简报已生成', 'Today’s brief is ready') }).show();
  send('brief', { day }); return { day, md, file: path.join(dir, day + '.md') }; }
const FAULT = new Set((process.env.SR_FAULT || '').split(',').filter(Boolean));
let snapTimer; function dailySnap() { if (!all('SELECT 1 FROM snapshots WHERE day=?', [dayOf()]).length && !busy) return recluster().then(() => { save(true); if (getCfg().dailyBrief !== false) dailyBrief(); }).catch(e => log('每日快照失败：' + e.message)); }
function schedule() { clearInterval(snapTimer); snapTimer = setInterval(dailySnap, 3600e3); clearInterval(timer); if (getCfg().autoRefresh) timer = setInterval(() => setTimeout(() => refresh({ due: true }), Math.random() * 120e3), 15 * 60000); }
function health(id) { const s = SOURCES[id], cfg = getCfg(); const rs = all('SELECT * FROM runs WHERE source=? ORDER BY id DESC LIMIT 10', [id]);
  if (s.unavailable) return { status: 'unavailable', label: '不可用', why: s.unavailable };
  if (s.key && !cfg[s.key]) return { status: 'nokey', label: '需配置 Key' };
  if (cfg.disabledSources.includes(id)) return { status: 'off', label: '已停用', runs: rs.length };
  if (!rs.length) return { status: 'never', label: '未采集' };
  const ok = rs.filter(r => r.ok).length / rs.length, last = rs[0];
  return { status: last.ok && ok >= .8 ? 'healthy' : last.ok || ok >= .5 ? 'degraded' : 'down', label: last.ok && ok >= .8 ? '健康' : last.ok || ok >= .5 ? '不稳定' : '故障', okRate: +ok.toFixed(2), avgMs: Math.round(rs.reduce((a, r) => a + r.ms, 0) / rs.length), last, lastOk: all('SELECT ts,count FROM runs WHERE source=? AND ok=1 ORDER BY id DESC LIMIT 1', [id])[0] };
}
const REGIONS = [['cn', '中国', /china|chinese|beijing|shanghai|shenzhen|中国|北京|上海|深圳|广东|浙江|江苏|国务院|人民币|亿元/i], ['us', '美国', /\bU\.?S\.?\b|united states|america|silicon valley|new york|california|美国|硅谷/i], ['eu', '欧洲', /\beu\b|europe|germany|france|uk\b|britain|london|berlin|paris|italy|spain|netherlands|sweden|欧盟|欧洲|德国|法国|英国/i], ['jp', '日本', /japan|tokyo|日本|东京/i], ['kr', '韩国', /korea|seoul|samsung|韩国|首尔/i], ['in', '印度', /\bindia|indian|bangalore|mumbai|印度/i], ['sea', '东南亚', /singapore|indonesia|vietnam|thailand|malaysia|philippines|东南亚|新加坡|印尼|越南|泰国|马来西亚/i], ['latam', '拉美', /brazil|mexico|argentina|chile|colombia|latin america|巴西|墨西哥|拉美|阿根廷/i], ['me', '中东', /saudi|uae|dubai|israel|qatar|middle east|沙特|阿联酋|迪拜|以色列|中东/i], ['af', '非洲', /africa|nigeria|kenya|egypt|south africa|非洲|尼日利亚|肯尼亚|埃及/i]];
function regionOf(s) { const t = s.title + ' ' + (s.text || '').slice(0, 300); const hit = REGIONS.filter(([, , re]) => re.test(t)).map(r => r[0]); if (!hit.length && s.region === 'cn') hit.push('cn'); return hit; }
function regionCoverage(since) { const sigs = all('SELECT title,text,region,source,ind FROM signals WHERE ts>?', [since]); const m = Object.fromEntries(REGIONS.map(([k, n]) => [k, { key: k, name: n, signals: 0, sources: new Set(), inds: new Set() }]));
  for (const s of sigs) for (const r of regionOf(s)) { m[r].signals++; m[r].sources.add(s.source); if (s.ind) m[r].inds.add(s.ind); }
  return Object.values(m).map(r => { const s = r.sources.size; return { ...r, sources: s, inds: r.inds.size, status: r.signals >= 200 && s >= 8 ? 'good' : r.signals >= 50 && s >= 3 ? 'ok' : 'gap' }; }); }

// ===== 每日快照 =====
const dayOf = (ms = Date.now()) => new Date(ms).toLocaleDateString('sv-SE');
const snapRow = day => { const r = all('SELECT * FROM snapshots WHERE day=?', [day])[0]; return r ? JSON.parse(zlib.gunzipSync(Buffer.from(r.data)).toString()) : null; };
const prevSnap = day => { const r = all('SELECT day FROM snapshots WHERE day<? ORDER BY day DESC LIMIT 1', [day])[0]; return r ? snapRow(r.day) : null; };
function kpisAt(endTs) { const since = endTs - 30 * 86400; const r = all('SELECT COUNT(*) n, COUNT(DISTINCT source) s, COUNT(DISTINCT ind) i FROM signals WHERE ts<=? AND ts>?', [endTs, since])[0]; return { signals: r.n, sources: r.s, industries: r.i }; }
function takeSnapshot({ day = dayOf(), opps, dims, backfill = false, endTs = Math.floor(Date.now() / 1000) }) {
  const prev = prevSnap(day), aligned = SN.align(opps, prev?.opps);
  const s = SN.build({ day, opps: aligned, dims, kpis: kpisAt(endTs), prev, backfill });
  run('INSERT OR REPLACE INTO snapshots VALUES(?,?,?,?,?)', [day, s.ts, backfill ? 1 : 0, JSON.stringify(s.stats), zlib.gzipSync(JSON.stringify(s))]);
  if (!backfill && s.stats.newHigh) { const hi = s.opps.filter(o => s.diff.new.includes(o.id) && o.total >= 75);
    for (const o of hi) run('INSERT OR IGNORE INTO notifications(ts,alert_id,ref,title,body) VALUES(?,?,?,?,?)', [Date.now(), -1, o.id + '@' + day, `每日快照：新高分机会 ${o.title}`, `${day} 首次进入榜单，评分 ${o.total}（≥75），行业 ${o.industryName || ''}`]);
    if (Notification.isSupported() && !process.env.SR_SHOT) new Notification({ title: NT('商机雷达 · 每日快照', 'Signal Radar · Daily snapshot'), body: NT(`${day} 新增 ${hi.length} 个高分机会`, `${day}: ${hi.length} new high-score opportunities`) }).show(); }
  log(`快照 ${day}${backfill ? '（回填）' : ''}：${s.stats.opps} 个机会，新增 ${s.stats.new}，跌出 ${s.stats.gone}`); return s.stats; }
async function backfillSnapshots(days = 30) { const out = []; const today = new Date(); today.setHours(23, 59, 59, 0);
  const minTs = all('SELECT MIN(ts) m FROM signals WHERE emb IS NOT NULL AND ts > ?', [Math.floor(Date.now() / 1000) - 400 * 86400])[0].m || 0;
  for (let k = days; k >= 1; k--) { const end = new Date(today); end.setDate(today.getDate() - k); const endTs = Math.floor(end.getTime() / 1000), day = dayOf(end.getTime());
    if (endTs < minTs) continue; if (all('SELECT 1 FROM snapshots WHERE day=? AND backfill=0', [day]).length) continue;
    const rows = all('SELECT id,source,kind,region,title,url,text,ts,engagement,weight,ind,meta,emb FROM signals WHERE ts > ? AND ts <= ? AND emb IS NOT NULL', [endTs - 30 * 86400, endTs]);
    if (rows.length < 50) continue;
    const sigs = rows.map(r => { const m = JSON.parse(r.meta || '{}'); const b = r.emb; return { ...r, ...m, industry: undefined, vec: new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4), emb: undefined, meta: undefined }; });
    const res = E.cluster(sigs, { ...getCfg(), now: endTs }); let dr = null;
    try { dr = DIMS.run({ signals: sigs.map(s => ({ ...s, vec: undefined })), opps: res.opps, chain: getK('chain'), macro: getK('macro'), now: endTs }); } catch {}
    out.push({ day, ...takeSnapshot({ day, opps: res.opps.map(o => ({ ...o, total: Math.min(100, o.total + 8 * Math.max(0, (dr?.oppDims?.[o.id]?.length || 1) - 1)) })), dims: dr, backfill: true, endTs }) });
    send('progress', { id: 'backfill', state: 'running', msg: day }); await new Promise(r => setImmediate(r)); }
  if (out.length && all('SELECT 1 FROM snapshots WHERE day=?', [dayOf()]).length) await recluster(); // 今日快照基于回填后的前一日重新比较
  save(true); return out; }
function snapPeriod(g, key) { const days = all('SELECT day FROM snapshots ORDER BY day').map(r => r.day).filter(d => SN.periodKey(d, g) === key);
  const snaps = days.map(snapRow); const pk = SN.prevPeriod(key, g); const pdays = all('SELECT day FROM snapshots ORDER BY day').map(r => r.day).filter(d => SN.periodKey(d, g) === pk);
  return { key, g, prevKey: pk, agg: snaps.length ? SN.aggregate(snaps) : null, prev: pdays.length ? SN.aggregate(pdays.map(snapRow)) : null, snaps: snaps.map(s => ({ day: s.day, backfill: s.backfill, stats: s.stats })), last: snaps[snaps.length - 1] || null, lists: snaps.length ? periodLists(snaps) : null }; }
function periodLists(snaps) { const base = prevSnap(snaps[0].day), end = snaps[snaps.length - 1], bm = new Map((base?.opps || []).map(o => [o.id, o])), em = new Set(end.opps.map(o => o.id));
  const pick = o => ({ id: o.id, alias: o.alias, title: o.title, total: o.total, rank: o.rank, industryName: o.industryName, dims: o.dims, ev: o.evidence?.[0] });
  return { base: base?.day || null, end: end.day,
    new: end.opps.filter(o => !bm.has(o.id)).slice(0, 30).map(pick),
    up: end.opps.filter(o => bm.has(o.id)).map(o => ({ ...pick(o), delta: o.total - bm.get(o.id).total, rankDelta: bm.get(o.id).rank - o.rank })).sort((a, b) => b.delta - a.delta || b.rankDelta - a.rankDelta).slice(0, 20),
    gone: (base?.opps || []).filter(o => !em.has(o.id)).slice(0, 30).map(pick),
    stay: end.opps.filter(o => snaps.every(s => s.opps.some(x => x.id === o.id)) && bm.has(o.id)).slice(0, 30).map(pick) }; }
function paperStats() { const now = Math.floor(Date.now() / 1000), d14 = now - 14 * 86400, d28 = now - 28 * 86400, MIN = 5;
  const rows = all("SELECT ind, kind, ts, engagement, source FROM signals WHERE ts>? AND ind IS NOT NULL", [now - 60 * 86400]); const m = {};
  const CIT = new Set(['openalex', 'semanticscholar', 'crossref', 'pubmed']); // 只有这些源的 engagement 是引用数
  for (const r of rows) { const x = m[r.ind] ||= { r14: 0, r28: 0, v14: [], v28: [], prod: 0, papers: 0 }; if (r.kind === 'research') { x.papers++; const age = Math.max(1, (now - r.ts) / 86400), v = CIT.has(r.source) ? (r.engagement || 0) / age : null;
      if (r.ts > d14) { x.r14++; v != null && x.v14.push(v); } else if (r.ts > d28) { x.r28++; v != null && x.v28.push(v); } } if (r.kind === 'product' || r.kind === 'supply') x.prod++; }
  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  return INDUSTRIES.map(i => { const x = m[i.code] || { r14: 0, r28: 0, v14: [], v28: [], prod: 0, papers: 0 };
    return { code: i.code, cn: i.cn, sector: i.sectorCn, papers: x.papers, r14: x.r14, r28: x.r28, lowSample: x.r14 < MIN || x.r28 < MIN,
      growth: x.r14 >= MIN && x.r28 >= MIN ? +((x.r14 / x.r28 - 1) * 100).toFixed(0) : null,
      citAccel: x.v14.length >= MIN && x.v28.length >= MIN ? +(avg(x.v14) - avg(x.v28)).toFixed(3) : null, products: x.prod, gap: +Math.log2((x.papers + 1) / (x.prod + 1)).toFixed(2) }; }).sort((a, b) => b.gap - a.gap); }
function coverage() { const since = Math.floor(Date.now() / 1000) - 30 * 86400;
  const rows = all('SELECT ind, COUNT(*) n, COUNT(DISTINCT source) s FROM signals WHERE ts>? AND ind IS NOT NULL GROUP BY ind', [since]); const m = Object.fromEntries(rows.map(r => [r.ind, r]));
  const by = all('SELECT ind_by, COUNT(*) n FROM signals WHERE ts>? GROUP BY ind_by', [since]);
  const srcBy = all('SELECT ind, source, COUNT(*) n FROM signals WHERE ts>? AND ind IS NOT NULL GROUP BY ind, source', [since]);
  const opps = getOpps(); const oc = {}; for (const o of opps) if (o.industry) oc[o.industry] = (oc[o.industry] || 0) + 1;
  const list = INDUSTRIES.map(i => { const r = m[i.code] || { n: 0, s: 0 }; const status = r.n >= 10 && r.s >= 3 ? 'good' : r.n >= 5 && r.s >= 2 ? 'ok' : 'gap'; return { ...i, signals: r.n, sources: r.s, opps: oc[i.code] || 0, status, topSources: srcBy.filter(x => x.ind === i.code).sort((a, b) => b.n - a.n).slice(0, 4).map(x => x.source + ' ' + x.n) }; });
  const total = all('SELECT COUNT(*) n FROM signals WHERE ts>?', [since])[0].n;
  return { regions: regionCoverage(since), list, sectors: SECTORS, gb: GB, covered: list.filter(x => x.status !== 'gap').length, good: list.filter(x => x.status === 'good').length, total: list.length, tagged: rows.reduce((a, r) => a + r.n, 0), signals: total, tagBy: by }; }

// ---------- 报告 ----------
const D = { market: '市场规模', growth: '增长动能', competition: '竞争(反向)', moat: '可防御性', monetization: '变现清晰度', fit: '创始人匹配' };
const C = { segments: '客户细分', problem: '问题', value: '价值主张', solution: '解决方案', channels: '渠道', revenue: '收入', costs: '成本', metrics: '关键指标', advantage: '壁垒' };
const $M = v => v == null ? '—' : v >= 1e12 ? '$' + (v / 1e12).toFixed(2) + 'T' : v >= 1e9 ? '$' + (v / 1e9).toFixed(1) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : '$' + Math.round(v).toLocaleString();
const link = e => `[${String(e.title).replace(/[\[\]|]/g, ' ').slice(0, 90)}](${e.url})`;
function ue(u) { const ltv = u.arpu * u.gm / u.churn; return { ltv, ratio: ltv / u.cac, payback: u.cac / (u.arpu * u.gm) }; }
function oppMd(o) { const u = ue(o.unitEcon);
  return `## ${o.title}  ·  综合评分 ${o.total}（置信度 ${o.conf}）\n\n> 行业：${o.industryName}（${o.sector}）｜ 阶段：${o.stage} ｜ 分析：${o.analysisBy === 'rules' ? '规则引擎' : o.analysisBy}\n\n**机会陈述**：面向 ${o.statement.who}；痛点：${o.statement.pain}；Why now：${o.statement.whyNow}；怎么做：${o.statement.how}\n\n### VC 六维评分与依据\n| 维度 | 分数 | 置信度 | 依据 |\n|---|---|---|---|\n${Object.keys(D).map(k => `| ${D[k]} | ${o.dims[k]} | ${o.dimDetail[k].conf} | ${o.dimDetail[k].basis.join('；').replace(/\|/g, '/')} |`).join('\n')}\n\n时间序列：近 7 天 ${o.ts.w1}‰ / 前 7 天 ${o.ts.w2}‰，速度 ${o.ts.velocity}，加速度 ${o.ts.accel}${o.ts.oneoff ? '，⚠ 一次性热点' : ''}${o.seasonal ? '，⚠ 季节性' : ''}\n\n### 量化不对称指标\n${Object.values(o.asymMetrics).map(a => `- **${a.name}** ${a.value}${a.unit === 'log2' ? '（log2）' : '×'}：${a.desc}${a.evidence[0] ? ' — ' + link(a.evidence[0]) : ''}`).join('\n')}\n\n### Why Now\n${o.whyNow.map(w => `- **${w.name}**（强度 ${w.strength}，${w.n} 条）：${w.why}。${w.evidence.map(link).join('；')}`).join('\n') || '- 证据不足'}\n\n### 市场规模 TAM / SAM / SOM\n- 自上而下：${o.tam.topDown.steps.map(s => `${s.k} ${s.pct ? (s.v * 100).toFixed(1) + '%' : $M(s.v)}（${s.src}）`).join(' × ')} = **TAM ${$M(o.tam.topDown.tam)}**\n- 自下而上：${o.tam.bottomUp.steps.map(s => `${s.k} ${s.v?.toLocaleString()}（${s.src}）`).join(' × ')} = **TAM ${$M(o.tam.bottomUp.tam)}**\n- SAM = TAM × ${(o.tam.assump.sam * 100).toFixed(0)}% = ${$M(o.tam.sam)}；SOM = SAM × ${(o.tam.assump.som * 100).toFixed(0)}% = ${$M(o.tam.som)}\n- 注：${o.tam.note}\n\n### 竞争格局（从信号自动发现）\n| 公司/产品 | 类型 | 提及 | 披露融资 | 证据 |\n|---|---|---|---|---|\n${o.competitors.slice(0, 10).map(c => `| ${c.name.replace(/\|/g, '/')} | ${c.types.join('/')} | ${c.mentions} | ${c.fundingM ? '$' + c.fundingM + 'M' : '—'} | ${c.evidence[0] ? link(c.evidence[0]) : ''} |`).join('\n')}\n\n### 单位经济（${o.unitEcon.label}，行业经验假设，非实测）\nARPU $${o.unitEcon.arpu}/月 · 毛利 ${(o.unitEcon.gm * 100).toFixed(0)}% · CAC $${o.unitEcon.cac} · 月流失 ${(o.unitEcon.churn * 100).toFixed(1)}% → LTV $${Math.round(u.ltv).toLocaleString()} · LTV/CAC ${u.ratio.toFixed(1)} · 回收期 ${u.payback.toFixed(1)} 月\n\n### 护城河评估\n${o.moat.map(m => `- ${m.name} ${m.score}：${m.desc}`).join('\n')}\n\n### 风险矩阵（概率 × 影响，1–5）\n| 风险 | 概率 | 影响 | 依据 |\n|---|---|---|---|\n${o.risks.map(r => `| ${r.name} | ${r.p} | ${r.i} | ${r.why}${r.evidence[0] ? ' ' + link(r.evidence[0]) : ''} |`).join('\n')}\n\n### 商业模式画布\n${Object.entries(o.canvas).map(([k, v]) => `- **${C[k] || k}**：${v}`).join('\n')}\n\n### 反方观点\n${o.redteam.map(r => '- ' + r).join('\n')}\n\n### 验证清单\n${o.checklist.map(c => `- [${c.status === 'done' ? 'x' : ' '}] ${c.step}：${c.detail}（成功标准：${c.metric}）${c.result ? ' 结果：' + c.result : ''}${c.note ? ' — ' + c.note : ''}`).join('\n')}\n\n### 证据链\n${o.evidence.slice(0, 25).map(e => `- [${e.source}] ${link(e)} · ${new Date(e.ts * 1000).toISOString().slice(0, 10)}`).join('\n')}\n${o.notes ? '\n### 备注\n' + o.notes + '\n' : ''}`; }
// v3.6 决策工作流（借鉴 PitchBook IC / Exit Predictor 的「建议 + 证据 + 阶段门」结构）
function stageGate(o) {
  const miss = [];
  if (!(o.claims || []).some(c => c.kind === 'pain' && c.refs?.length)) miss.push('痛点主张缺少编号证据');
  if (!(o.evidence || []).length) miss.push('证据链为空');
  if ((o.checklist || []).filter(c => c.status === 'done').length < 2) miss.push('验证清单完成项 <2');
  if ((o.conf || 0) < .4) miss.push('置信度过低（<' + .4 + '）');
  return { ok: !miss.length, miss, next: o.stage === 'discover' ? 'screen' : o.stage === 'screen' ? 'deep' : o.stage === 'deep' ? 'go' : null };
}
function decisionBrief(o) {
  const u = ue(o.unitEcon), risk = o.risks.reduce((a, r) => a + r.p * r.i, 0) / (o.risks.length || 1);
  const rec = o.total >= 70 && o.conf >= .5 && risk < 10 ? '推进（进入尽调）' : o.total >= 60 ? '观察（补充证据后再议）' : '暂不推进';
  const life = o.ts?.life, mos = o.mosaic, gate = stageGate(o);
  const cites = (o.claims || []).slice(0, 6).map(c => `- **${c.kind}**：${c.text}${c.refs?.length ? ' ' + c.refs.map(n => '[' + n + ']').join('') : '（无出处）'}`).join('\n');
  const ev = (o.evidence || []).slice(0, 12).map(e => `${e.n || ''}. [${e.source}] ${e.title}${e.url ? ' — ' + e.url : ''}`).join('\n');
  return `# 决策一页纸（Decision Brief）\n\n**机会**：${o.title}  \n**行业**：${o.industryName}  \n**阶段**：${o.stage}  \n**日期**：${new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}（北京时间）\n\n## 建议\n**${rec}** · 综合 ${o.total}/100 · 置信 ${o.conf}${mos ? ' · 体检分 ' + mos.score : ''}${life ? ' · 生命周期 ' + (life.stage || '') + (life.provisional ? '（初判）' : '') : ''}\n\n## 阶段门\n${gate.ok ? '✅ 可进入下一阶段' + (gate.next ? '（' + gate.next + '）' : '') : '⚠ 未通过：' + gate.miss.join('；')}\n\n## 关键主张（带编号引文）\n${cites || '（无）'}\n\n## 单位经济摘要\n毛利/客户 ${u.ltv?.toFixed?.(0) || u.ltv} · CAC ${u.cac} · 回收期 ${u.payback?.toFixed?.(1) || u.payback} 月\n\n## 证据（前 12）\n${ev}\n\n> 建议由规则引擎生成，需人工判断。体检分权重为本应用假设，非第三方评分。\n`;
}
function icMemo(o) { const u = ue(o.unitEcon); const risk = o.risks.reduce((a, r) => a + r.p * r.i, 0) / o.risks.length;
  const rec = o.total >= 70 && o.conf >= .5 && risk < 10 ? '推进（进入尽调）' : o.total >= 60 ? '观察（补充证据后再议）' : '暂不推进';
  return `# 投资委员会备忘录（IC Memo）\n\n**项目/机会**：${o.title}  \n**行业**：${o.industryName}（GICS ${o.industry || '—'}，${o.sector}）  \n**日期**：${new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}（北京时间）  \n**建议**：**${rec}**  \n**综合评分**：${o.total}/100，置信度 ${o.conf}${o.mosaic ? '  \n**体检分**：' + o.mosaic.score + '/1000（动能 ' + o.mosaic.parts.momentum + ' / 市场 ' + o.mosaic.parts.market + ' / 资金 ' + o.mosaic.parts.money + ' / 人才 ' + o.mosaic.parts.talent + '）' : ''}${o.ts?.life ? '  \n**生命周期**：' + o.ts.life.stage + (o.ts.life.provisional ? '（初判）' : '') : ''}，平均风险分 ${risk.toFixed(1)}/25\n\n> 本备忘录由商机雷达根据公开信号自动生成。所有数字要么附带来源链接，要么明确标注为"假设"，未经一手尽调核实。\n\n## 1. 投资要点\n- 机会：面向 ${o.statement.who}，${o.statement.pain}\n- Why now：${o.statement.whyNow}\n- 切入：${o.statement.how}\n- 不对称：${o.asymmetry.map(a => a.desc).join('；') || '无显著不对称'}\n\n## 2. 市场\n自上而下 TAM ${$M(o.tam.topDown.tam)}；自下而上 TAM ${$M(o.tam.bottomUp.tam)}；SAM ${$M(o.tam.sam)}；SOM ${$M(o.tam.som)}。${o.tam.note}\n\n## 3. 竞争\n${o.competitors.slice(0, 8).map(c => `- ${c.name}（${c.types.join('/')}${c.fundingM ? '，披露融资 $' + c.fundingM + 'M' : ''}）${c.evidence[0] ? ' ' + link(c.evidence[0]) : ''}`).join('\n') || '- 未从信号中发现明确竞品（需人工补充）'}\n\n## 4. 单位经济（假设）\nLTV $${Math.round(u.ltv).toLocaleString()}，LTV/CAC ${u.ratio.toFixed(1)}，CAC 回收期 ${u.payback.toFixed(1)} 个月（${o.unitEcon.label} 行业经验假设）。\n\n## 5. 护城河\n${o.moat.sort((a, b) => b.score - a.score).map(m => `${m.name} ${m.score}`).join(' · ')}\n\n## 6. 主要风险\n${o.risks.sort((a, b) => b.p * b.i - a.p * a.i).map(r => `- ${r.name}（P${r.p}×I${r.i}）：${r.why}`).join('\n')}\n\n## 7. 反方观点\n${o.redteam.map(r => '- ' + r).join('\n')}\n\n## 8. 尽调与验证计划\n${o.checklist.map((c, i) => `${i + 1}. ${c.step}：${c.detail}（标准：${c.metric}）`).join('\n')}\n\n---\n\n# 附录：完整分析\n\n` + oppMd(o); }
function reportMd(ids) { const opps = getOpps().filter(o => !ids || ids.includes(o.id));
  return `# 商机雷达报告\n\n生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}（北京时间）｜ 信号：${all('SELECT COUNT(*) n FROM signals')[0].n} ｜ 机会：${opps.length}\n\n> 评分由规则引擎基于公开信号计算${opps.some(o => o.analysisBy !== 'rules') ? '，部分经 LLM 修正' : ''}；TAM 与单位经济中的假设已标注。\n\n` + opps.slice(0, ids ? 999 : 15).map(oppMd).join('\n---\n\n'); }
function mdToHtml(md) { const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let h = esc(md).replace(/^### (.*)$/gm, '<h3>$1</h3>').replace(/^## (.*)$/gm, '<h2>$1</h2>').replace(/^# (.*)$/gm, '<h1>$1</h1>').replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>').replace(/^---$/gm, '<hr>').replace(/  $/gm, '<br>');
  h = h.replace(/(^\|.*\|$\n?)+/gm, t => '<table>' + t.trim().split('\n').filter(l => !/^\|-/.test(l)).map((l, i) => '<tr>' + l.split('|').slice(1, -1).map(c => i ? `<td>${c}</td>` : `<th>${c}</th>`).join('') + '</tr>').join('') + '</table>');
  h = h.replace(/(^(- |\d+\. ).*$\n?)+/gm, t => '<ul>' + t.trim().split('\n').map(l => `<li>${l.replace(/^(- |\d+\. )/, '')}</li>`).join('') + '</ul>');
  return `<html><head><meta charset="utf-8"><style>body{font-family:"Noto Sans CJK SC","PingFang SC","Microsoft YaHei",sans-serif;max-width:900px;margin:30px auto;color:#1f2937;font-size:12px;line-height:1.7}h1{color:#1e3a8a}h2{color:#3730a3;border-bottom:2px solid #c7d2fe;padding-bottom:4px}table{border-collapse:collapse;width:100%;margin:6px 0}td,th{border:1px solid #e5e7eb;padding:4px 8px;vertical-align:top}th{background:#eef2ff}blockquote{color:#6b7280;border-left:3px solid #a5b4fc;margin:0;padding-left:10px}a{color:#2563eb}</style></head><body>${h.replace(/\n\n/g, '<p>')}</body></html>`; }
async function saveDoc(md, name, fmt) { const r = await dialog.showSaveDialog(win, { defaultPath: `${name}-${new Date().toISOString().slice(0, 10)}.${fmt}` }); if (r.canceled) return null;
  if (fmt === 'md') fs.writeFileSync(r.filePath, md); else if (fmt === 'html') fs.writeFileSync(r.filePath, mdToHtml(md));
  else { const w = new BrowserWindow({ show: false }); await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(mdToHtml(md))); fs.writeFileSync(r.filePath, await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true })); w.destroy(); }
  return r.filePath; }

// ---------- IPC ----------
const H = {
  'win:min': () => win.minimize(), 'win:max': () => (win.isMaximized() ? win.unmaximize() : win.maximize()), 'win:close': () => win.close(), 'win:state': () => ({ max: win.isMaximized() }), 'app:reload': () => win.reload(), 'app:devtools': () => win.webContents.toggleDevTools(), 'app:quit': () => app.quit(),
  'cfg:get': () => getCfg(),
  'cfg:set': (_, c) => { for (const [k, v] of Object.entries(c)) setK(k, v); if ('openAtLogin' in c && app.isPackaged) try { app.setLoginItemSettings({ openAtLogin: !!c.openAtLogin, args: ['--hidden'] }); } catch (e) { log('开机自启设置失败：' + e.message); } save(); schedule(); return getCfg(); },
  'sources:list': () => { const cfg = getCfg(); return [...Object.entries(SOURCES).map(([id, s]) => ({ id, name: s.name, cat: s.cat, kind: s.kind, key: s.key || null, weight: srcWeight(id, cfg), defWeight: s.weight, freq: s.freq, total: all('SELECT COUNT(*) n FROM signals WHERE source=?', [id])[0].n, ...health(id) })), ...UNAVAILABLE.map(([id, name, why]) => ({ id, name, cat: '—', status: 'unavailable', label: '不可用', why, total: 0 }))]; },
  'refresh': (_, opt) => refresh(opt || {}),
  'recluster': async () => { await recluster(); save(); return true; },
  'signals:list': (_, q = {}) => all(`SELECT id,source,kind,region,title,url,ts,engagement,ind,ind_by,weight FROM signals WHERE 1=1 ${q.source ? 'AND source=?' : ''} ${q.ind ? 'AND ind LIKE ?' : ''} ${q.q ? 'AND (title LIKE ? OR text LIKE ?)' : ''} ORDER BY ts DESC LIMIT ?`, [...(q.source ? [q.source] : []), ...(q.ind ? [q.ind + '%'] : []), ...(q.q ? ['%' + q.q + '%', '%' + q.q + '%'] : []), q.limit || 400]),
  'stats': () => { const now = Math.floor(Date.now() / 1000);
    return { total: all('SELECT COUNT(*) n FROM signals')[0].n, day: all('SELECT COUNT(*) n FROM signals WHERE fetched>?', [now - 86400])[0].n, bySource: all('SELECT source, COUNT(*) n FROM signals GROUP BY source ORDER BY n DESC'), byCat: all('SELECT kind, COUNT(*) n FROM signals GROUP BY kind ORDER BY n DESC'), daily: all("SELECT date(ts,'unixepoch','+8 hours') d, kind, COUNT(*) n FROM signals WHERE ts>? GROUP BY d, kind ORDER BY d", [now - 21 * 86400]), lastRun: all('SELECT MAX(ts) t FROM runs')[0].t, unread: all('SELECT COUNT(*) n FROM notifications WHERE read=0')[0].n, embed: EMB.info(), cluster: lastCluster, dbSize: fs.existsSync(dbFile) ? fs.statSync(dbFile).size : 0 }; },
  'logs': () => all('SELECT * FROM logs ORDER BY id DESC LIMIT 200'),
  'coverage': () => coverage(), 'industries': () => INDUSTRIES,
  'macro:get': () => getK('macro'), 'macro:refresh': async () => { const m = await refreshMacro(); save(); return m; },
  'opps:list': () => getOpps(),
  'snap:list': () => all('SELECT day, ts, backfill, stats FROM snapshots ORDER BY day').map(r => ({ ...r, stats: JSON.parse(r.stats) })),
  'snap:get': (_, day) => snapRow(day),
  'snap:take': async () => { await recluster(); save(true); return snapRow(dayOf()); },
  'snap:backfill': async (_, n) => backfillSnapshots(n || 30),
  'snap:period': (_, g, key) => snapPeriod(g, key),
  'snap:report': async (_, g, key) => { const p = snapPeriod(g, key); if (!p.agg) return null; const md = SN.report(key, g, p.agg, p.prev, p.last ? [p.last, ...p.snaps.slice(0, -1).map(s => ({ ...s, opps: [] }))].reverse() : []);
    const f = process.env.SR_EXPORT_DIR ? path.join(process.env.SR_EXPORT_DIR, `SignalRadar-${g}-${key}.md`) : (await dialog.showSaveDialog(win, { defaultPath: `SignalRadar-${g}-${key}.md` })).filePath; if (!f) return null; fs.writeFileSync(f, md); return f; },
  'opp:history': (_, id) => { const pts = []; for (const r of all('SELECT day FROM snapshots ORDER BY day')) { const s = snapRow(r.day); const o = s.opps.find(x => x.id === id || x.alias === id); if (o) pts.push({ day: r.day, total: o.total, rank: o.rank, backfill: s.backfill }); } return { pts, first: pts[0]?.day || null }; },
  'dims:get': () => getK('dims') || { cards: [], matrix: {}, oppDims: {}, counts: {}, dims: DIMS.DIMS },
  'chain:get': () => ({ chain: getK('chain'), opps: getOpps().filter(o => o.chain).map(o => ({ id: o.id, title: o.title, total: o.total, industry: o.industry, chain: o.chain.code, noise: o.quality?.noise })) }),
  'chain:refresh': async () => { const c = await refreshChain(); save(); return c; },
  'stats:get': () => getK('istats'), 'stats:refresh': async () => { const s = await refreshStats(); save(); return s; },
  'papers': () => paperStats(),
  'opp:update': (_, id, patch) => { if (!ws(id).snapshot) { const j = all('SELECT json FROM opps WHERE id=?', [id])[0]?.json; if (j) patch.snapshot = JSON.parse(j); } return setWs(id, patch); },
  'opp:llm': async (_, id) => { const cfg = getCfg(); if (!E.llmEnabled(cfg)) throw new Error('未配置 LLM：请在设置中填写 OpenAI 兼容 Key 或 Ollama 地址'); const o = JSON.parse(all('SELECT json FROM opps WHERE id=?', [id])[0]?.json || JSON.stringify(ws(id).snapshot)); const llm = await E.llmAnalyze(o, cfg); setWs(id, { llm, snapshot: o, checklist: undefined }); return true; },
  'llm:test': async () => { const cfg = getCfg(); if (!E.llmEnabled(cfg)) return { ok: false, msg: '未配置' }; try { await E.llmCall('返回 JSON {"ok":true}', cfg); return { ok: true, msg: '连接成功' }; } catch (e) { return { ok: false, msg: e.message }; } },
  'fundings': () => { const out = all("SELECT * FROM signals WHERE ts>? AND kind IN ('news','funding','community','product')", [Math.floor(Date.now() / 1000) - 30 * 86400]).map(s => { const f = E.extractFunding(s); if (f) f.ind = s.ind; return f; }).filter(Boolean);
    const formD = all("SELECT title,url,ts,ind,meta FROM signals WHERE source='sec_formd' ORDER BY ts DESC LIMIT 300").map(s => ({ company: JSON.parse(s.meta || '{}').company || s.title, title: s.title, url: s.url, ts: s.ts, ind: s.ind }));
    return { events: out.sort((a, b) => b.ts - a.ts).filter((f, i, a) => a.findIndex(x => x.company.toLowerCase() === f.company.toLowerCase()) === i), formD, s1: all("SELECT title,url,ts FROM signals WHERE source='sec_s1' ORDER BY ts DESC LIMIT 60") }; },
  'alerts:list': () => all('SELECT * FROM alerts'), 'alerts:add': (_, a) => { run('INSERT INTO alerts(type,value) VALUES(?,?)', [a.type, a.value]); save(); return all('SELECT * FROM alerts'); },
  'alerts:del': (_, id) => { run('DELETE FROM alerts WHERE id=?', [id]); save(); return all('SELECT * FROM alerts'); },
  'notif:list': () => all('SELECT * FROM notifications ORDER BY id DESC LIMIT 200'), 'notif:read': () => { run('UPDATE notifications SET read=1'); save(); },
  'report:md': (_, ids) => reportMd(ids), 'memo:md': (_, id) => { const o = getOpps().find(x => x.id === id); return o ? icMemo(o) : ''; },
  'report:save': (_, { ids, fmt }) => saveDoc(reportMd(ids), '商机报告', fmt),
  'brief:md': (_, id) => decisionBrief(getOpps().find(x => x.id === id)),
  'brief:save': (_, { id, fmt }) => { const o = getOpps().find(x => x.id === id); return saveDoc(decisionBrief(o), 'DecisionBrief-' + o.title.replace(/[^\w\u4e00-\u9fa5]+/g, '_').slice(0, 30), fmt); },
  'brief:daily': (_, gen) => gen ? dailyBrief() : (getK('lastBrief') || null),
  'brief:daily:list': () => { const dir = path.join(app.getPath('userData'), 'briefs'); return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort().reverse() : []; },
  'brief:daily:open': () => shell.openPath(path.join(app.getPath('userData'), 'briefs')),
  'lang:set': (_, l) => { LANG = l === 'en' ? 'en' : 'zh'; setK('lang', LANG); return LANG; },
  'stage:gate': (_, id) => stageGate(getOpps().find(x => x.id === id) || {}),
  'memo:save': (_, { id, fmt }) => { const o = getOpps().find(x => x.id === id); return saveDoc(icMemo(o), 'IC-Memo-' + o.title.replace(/[^\w\u4e00-\u9fa5]+/g, '_').slice(0, 30), fmt); },
  'share:export': async () => { const r = await dialog.showSaveDialog(win, { defaultPath: `商机雷达-共享-${new Date().toISOString().slice(0, 10)}.json` }); if (r.canceled) return null;
    const cfg = getCfg(); const data = { app: 'signal-radar', version: 2, from: cfg.userName || 'anonymous', exportedAt: new Date().toISOString(), workspace: all('SELECT * FROM workspace').map(w => ({ id: w.opp_id, ...JSON.parse(w.json) })), opps: all('SELECT json FROM opps').map(r => JSON.parse(r.json)), alerts: all('SELECT type,value FROM alerts') };
    for (const w of data.workspace) if (!w.snapshot) w.snapshot = data.opps.find(o => o.id === w.id);
    fs.writeFileSync(r.filePath, JSON.stringify(data)); return r.filePath; },
  'share:import': async () => { const r = await dialog.showOpenDialog(win, { filters: [{ name: 'JSON', extensions: ['json'] }] }); if (r.canceled) return null;
    const d = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')); if (d.app !== 'signal-radar') throw new Error('不是商机雷达共享文件'); let n = 0;
    for (const w of d.workspace || []) { const { id, ...rest } = w; const cur = ws(id); const comments = [...(cur.comments || []), ...(rest.comments || []).filter(c => !(cur.comments || []).some(x => x.ts === c.ts && x.by === c.by))];
      const notes = cur.notes && rest.notes && cur.notes !== rest.notes ? cur.notes + `\n\n— 来自 ${d.from} —\n` + rest.notes : (cur.notes || rest.notes || '');
      run('INSERT OR REPLACE INTO workspace VALUES(?,?)', [id, JSON.stringify({ ...rest, ...cur, snapshot: cur.snapshot || rest.snapshot, comments, notes, stage: cur.stage || rest.stage, watched: true, importedFrom: d.from })]); n++; }
    save(); return { file: r.filePaths[0], from: d.from, count: n }; },
  'open:url': (_, u) => shell.openExternal(u), 'db:path': () => dbFile, 'open:data': () => shell.openPath(app.getPath('userData'))
};
for (const [k, f] of Object.entries(H)) ipcMain.handle(k, f);

app.whenReady().then(async () => {
  await initDb(); Menu.setApplicationMenu(null); LANG = getK('lang', 'zh');
  const icon = path.join(__dirname, '..', 'build', 'icon.png');
  win = new BrowserWindow({ width: 1440, height: 900, minWidth: 1100, minHeight: 700, frame: false, backgroundColor: '#0b0f17', title: '商机雷达 Signal Radar', icon: fs.existsSync(icon) ? nativeImage.createFromPath(icon) : undefined, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true } });
  if (process.argv.includes('--hidden')) win.once('ready-to-show', () => win.minimize()); // 开机自启：最小化启动
  win.on('maximize', () => send('win', { max: true })); win.on('unmaximize', () => send('win', { max: false }));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  schedule();
  // v5.0：安装包不带演示数据；signals 为空时后台自动采集，不阻塞窗口显示
  // 稍延迟，等渲染进程挂上 progress 监听后再发事件
  setTimeout(() => {
    try {
      const n0 = (all('SELECT COUNT(*) n FROM signals')[0] || {}).n || 0;
      if (n0 === 0 && !process.env.SR_NOFETCH && !process.env.SR_SHOT) {
        log('首次启动，开始自动采集…');
        send('progress', { id: '_boot', state: 'running' });
        refresh({}).catch(e => log('首次自动采集失败：' + (e.message || e)));
      }
    } catch (e) { log('首次启动检查失败：' + (e.message || e)); }
  }, 800);
  if (process.env.SR_SHOT) { const dir = process.env.SR_SHOT; fs.mkdirSync(dir, { recursive: true });
    win.webContents.on('console-message', (e, l, m) => l >= 2 && console.log('[renderer]', m));
    if (!process.env.SR_NOFETCH) console.log(JSON.stringify(await refresh(process.env.SR_ONLY ? { only: process.env.SR_ONLY.split(',') } : {})));
    else if (process.env.SR_RECLUSTER) { await embedPending(); await recluster(); save(true); }
    if (process.env.SR_BACKFILL) { const b = await backfillSnapshots(30); console.log('backfill', b.length); }
    await win.webContents.executeJavaScript('window.__reload && window.__reload()');
    for (const v of (process.env.SR_VIEWS || 'dashboard,detail,sources').split(',')) { const [view, tab] = v.split(':');
      await win.webContents.executeJavaScript(`window.__go('${view}', '${tab || ''}')`); await new Promise(r => setTimeout(r, 3000));
      fs.writeFileSync(path.join(dir, (process.env.SR_PREFIX || '') + v.replace(':', '-') + '.png'), (await win.capturePage()).toPNG()); }
    app.quit(); }
});
app.on('window-all-closed', () => app.quit());

if (!app.isPackaged || process.env.SR_E2E === '1') { // 仅开发/测试：注入故障、快进冷却、触发每日快照路径
  ipcMain.handle('debug:fault', (_e, ids) => { FAULT.clear(); (ids || []).forEach(x => FAULT.add(x)); return [...FAULT]; });
  ipcMain.handle('debug:cool', (_e, id) => { const H = getK('srcHealth', {}); if (H[id]) { H[id].nextAt = 0; setK('srcHealth', H); } return H[id]; });
  ipcMain.handle('debug:snap', async () => { run('DELETE FROM snapshots WHERE day=?', [dayOf()]); await dailySnap(); return getK('lastBrief'); }); }
ipcMain.handle('busy:get', () => !!busy);
ipcMain.handle('health:get', () => { const H = getK('srcHealth', {}), since = Math.floor(Date.now() / 1000) - 7 * 86400;
  return Object.keys(SOURCES).map(id => { const r = all('SELECT COUNT(*) n, SUM(ok) k FROM runs WHERE source=? AND ts>?', [id, since])[0] || {}; const h = H[id] || {};
    return { id, runs7d: r.n || 0, okRate: r.n ? (r.k || 0) / r.n : null, fails: h.fails || 0, open: !!h.open, state: h.state || 'closed', probes: h.probes || 0, recovered: h.recovered || 0, nextAt: h.nextAt || 0, lastOk: h.lastOk || 0, lastErr: h.lastErr || '' }; }); });
ipcMain.handle('login:set', (_e, on) => { try { app.setLoginItemSettings({ openAtLogin: !!on }); return true; } catch (e) { return false; } });
