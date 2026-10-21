const { app, BrowserWindow, ipcMain, dialog, Notification, shell, Menu, nativeImage } = require('electron');
const path = require('path'), fs = require('fs');
const initSqlJs = require('sql.js');
const { SOURCES, UNAVAILABLE } = require('./collectors'); require('./extra');
const E = require('./engine'), EMB = require('./embed'), M = require('./macro');
const { INDUSTRIES, SECTORS, GB } = require('./industries');

let db, dbFile, win, timer, busy = false, saveT, lastCluster = {};
const DEFAULTS = { disabledSources: ['ccnews', 'cc_cdx', 'amazon_reviews', 'wayback'], keywords: 'ai agent, humanoid robot, energy storage, glp-1, elder care', skills: '', autoRefresh: false, llmProvider: 'none', openaiBase: 'https://api.openai.com/v1', openaiKey: '', openaiModel: 'gpt-4o-mini', ollamaUrl: 'http://localhost:11434', ollamaModel: 'qwen2.5', githubToken: '', xBearer: '', phToken: '', crunchbaseKey: '', patentsviewKey: '', samKey: '', fredKey: '', opencorporatesKey: '', companiesHouseKey: '', openalexKey: '', userName: '', clusterSim: 0.6,
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
  if (busy) return { busy: true }; busy = true;
  const cfg = getCfg(), kw = kwList(cfg), report = [], state = getK('srcState', {}), nowS = Math.floor(Date.now() / 1000);
  const ctx = { state, dataDir: app.getPath('userData'), log, industries: INDUSTRIES };
  let ids = Object.keys(SOURCES).filter(id => enabled(id, cfg));
  if (opt.only) ids = ids.filter(id => opt.only.includes(id));
  if (opt.due) ids = ids.filter(id => { const l = all('SELECT ts FROM runs WHERE source=? AND ok=1 ORDER BY id DESC LIMIT 1', [id])[0]; return !l || nowS - l.ts > SOURCES[id].freq * 60; });
  const queue = [...ids]; const worker = async () => { while (queue.length) { const id = queue.shift(); const t0 = Date.now(); send('progress', { id, state: 'running' });
    try { const list = (await SOURCES[id].fetch(kw, cfg, ctx)).filter(s => s.title && s.url); let n = 0; const now = Math.floor(Date.now() / 1000), w = srcWeight(id, cfg);
      for (const s of list) { const sid = id + ':' + hash(String(s.url) + s.title); const ex = all('SELECT 1 FROM signals WHERE id=?', [sid]).length; if (!ex) n++;
        const meta = JSON.stringify({ industry: s.industry || SOURCES[id].industry, velocity: s.velocity, pain: s.pain, tender: s.tender, company: s.company, historical: s.historical, cdx: s.cdx, series: s.series, sec: s.sec });
        if (ex) run('UPDATE signals SET engagement=?, fetched=?, meta=?, title=? WHERE id=?', [Math.max(0, +s.engagement || 0), now, meta, s.title.slice(0, 400), sid]);
        else run('INSERT INTO signals(id,source,kind,region,title,url,text,ts,engagement,fetched,weight,meta) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', [sid, id, s.kind || SOURCES[id].kind, s.region || SOURCES[id].region || 'global', s.title.slice(0, 400), String(s.url), (s.text || '').slice(0, 800), Math.min(+s.ts || now, now), Math.max(0, +s.engagement || 0), now, w, meta]); }
      run('INSERT INTO runs(ts,source,ok,count,ms,err) VALUES(?,?,?,?,?,?)', [now, id, 1, list.length, Date.now() - t0, `新增 ${n}`]); report.push({ id, ok: true, count: list.length, added: n }); send('progress', { id, state: 'ok', count: list.length });
    } catch (e) { run('INSERT INTO runs(ts,source,ok,count,ms,err) VALUES(?,?,?,?,?,?)', [Math.floor(Date.now() / 1000), id, 0, 0, Date.now() - t0, String(e.message || e).slice(0, 200)]); report.push({ id, ok: false, err: String(e.message || e) }); send('progress', { id, state: 'err', err: String(e.message) }); } } };
  await Promise.all(Array.from({ length: 8 }, worker));
  setK('srcState', state); save(true);
  try { await embedPending(); } catch (e) { log('嵌入失败：' + e.message); }
  if (!getK('macro') || Date.now() - getK('macro').ts > 86400e3) await refreshMacro();
  await recluster(); checkAlerts(); save(true); busy = false; send('refreshed', report); return report;
}
async function refreshMacro() { try { const m = await M.fetchMacro(getCfg()); setK('macro', m); log(`宏观数据更新：世界银行 ${Object.keys(m.wb).length} 项，IMF ${Object.keys(m.imf).length}，FRED ${Object.keys(m.fred).length}，Comtrade ${m.comtrade ? m.comtrade.rows.length + ' 章' : '失败'}`); return m; } catch (e) { log('宏观数据失败：' + e.message); } }
async function recluster() {
  const cfg = getCfg(), t0 = Date.now();
  const rows = all('SELECT id,source,kind,region,title,url,text,ts,engagement,weight,ind,meta,emb FROM signals WHERE ts > ? AND emb IS NOT NULL', [Math.floor(Date.now() / 1000) - 30 * 86400]);
  const sigs = rows.map(r => { const m = JSON.parse(r.meta || '{}'); const b = r.emb; return { ...r, ...m, industry: undefined, vec: new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4), emb: undefined, meta: undefined }; });
  const res = E.cluster(sigs, cfg); lastCluster = { clusters: res.clusters, pool: res.pool, ms: Date.now() - t0 };
  run('DELETE FROM opps'); for (const o of res.opps) run('INSERT INTO opps VALUES(?,?,?,?)', [o.id, JSON.stringify(o), o.total, o.updated]);
  log(`语义聚类：${res.pool} 条信号 → ${res.clusters} 个簇 → ${res.opps.length} 个机会（相似度阈值 ${cfg.clusterSim}，${lastCluster.ms}ms）`);
}
function ws(id) { const r = all('SELECT json FROM workspace WHERE opp_id=?', [id])[0]; return r ? JSON.parse(r.json) : {}; }
function setWs(id, patch) { const w = { ...ws(id), ...patch, updatedAt: Date.now() }; for (const k in patch) if (patch[k] === undefined) delete w[k]; run('INSERT OR REPLACE INTO workspace VALUES(?,?)', [id, JSON.stringify(w)]); save(); return w; }
function merged(o, macro) { const w = ws(o.id); const l = w.llm || {};
  const dims = l.dims || o.dims; const delta = l.dims ? Object.keys(dims).reduce((a, k) => a + dims[k] - o.dims[k], 0) / 6 : 0;
  const ue = { ...o.unitEcon, ...(w.unitEcon || {}) };
  return { ...o, ...l, dims, unitEcon: ue, statement: l.statement || o.statement, checklist: w.checklist || l.checklist || o.checklist, stage: w.stage || 'discover', notes: w.notes || '', watched: !!w.watched, ruleTotal: o.total, total: Math.round(o.total + delta), comments: w.comments || [], tam: E.tam({ ...o, unitEcon: ue }, macro, w.assump || {}), assump: w.assump || {} }; }
function getOpps() { const macro = getK('macro'); const ids = new Set(); const list = all('SELECT json FROM opps ORDER BY total DESC').map(r => { const o = JSON.parse(r.json); ids.add(o.id); return merged(o, macro); });
  for (const r of all('SELECT * FROM workspace')) { const w = JSON.parse(r.json); if (!ids.has(r.opp_id) && w.snapshot && ((w.stage && w.stage !== 'discover') || w.watched)) list.push({ ...merged(w.snapshot, macro), stale: true }); }
  return list; }
function checkAlerts() {
  const opps = getOpps(), sigs = all('SELECT * FROM signals WHERE fetched > ?', [Math.floor(Date.now() / 1000) - 3600]);
  for (const a of all('SELECT * FROM alerts WHERE enabled=1')) { const hits = [];
    if (a.type === 'score') opps.filter(o => o.total >= +a.value).forEach(o => hits.push([o.id, `高分机会：${o.title}（${o.total}）`, o.statement.pain.slice(0, 120)]));
    if (a.type === 'keyword') sigs.filter(s => (s.title + s.text).toLowerCase().includes(a.value.toLowerCase())).forEach(s => hits.push([s.id, `关键词「${a.value}」新信号`, s.title]));
    if (a.type === 'funding') sigs.map(E.extractFunding).filter(f => f && f.amountM >= +a.value).forEach(f => hits.push([f.url, `融资 ≥ $${a.value}M：${f.company}`, f.title]));
    if (a.type === 'industry') opps.filter(o => o.industry && o.industry.startsWith(a.value)).forEach(o => hits.push([o.id, `行业 ${a.value} 新机会：${o.title}`, o.industryName]));
    if (a.type === 'watch') opps.filter(o => o.watched && o.metrics.last3 > 0).forEach(o => hits.push([o.id + ':' + new Date().toDateString(), `观察中的机会有新动态：${o.title}`, `近 3 天 ${o.metrics.last3} 条新信号`]));
    for (const [ref, title, body] of hits) { run('INSERT OR IGNORE INTO notifications(ts,alert_id,ref,title,body) VALUES(?,?,?,?,?)', [Date.now(), a.id, ref, title, body]);
      if (db.getRowsModified() && Notification.isSupported() && !process.env.SR_SHOT) new Notification({ title: '商机雷达 · ' + title, body }).show(); } }
}
function schedule() { clearInterval(timer); if (getCfg().autoRefresh) timer = setInterval(() => refresh({ due: true }), 15 * 60000); }
function health(id) { const s = SOURCES[id], cfg = getCfg(); const rs = all('SELECT * FROM runs WHERE source=? ORDER BY id DESC LIMIT 10', [id]);
  if (s.unavailable) return { status: 'unavailable', label: '不可用', why: s.unavailable };
  if (s.key && !cfg[s.key]) return { status: 'nokey', label: '需配置 Key' };
  if (cfg.disabledSources.includes(id)) return { status: 'off', label: '已停用', runs: rs.length };
  if (!rs.length) return { status: 'never', label: '未采集' };
  const ok = rs.filter(r => r.ok).length / rs.length, last = rs[0];
  return { status: last.ok && ok >= .8 ? 'healthy' : last.ok || ok >= .5 ? 'degraded' : 'down', label: last.ok && ok >= .8 ? '健康' : last.ok || ok >= .5 ? '不稳定' : '故障', okRate: +ok.toFixed(2), avgMs: Math.round(rs.reduce((a, r) => a + r.ms, 0) / rs.length), last, lastOk: all('SELECT ts,count FROM runs WHERE source=? AND ok=1 ORDER BY id DESC LIMIT 1', [id])[0] };
}
function coverage() { const since = Math.floor(Date.now() / 1000) - 30 * 86400;
  const rows = all('SELECT ind, COUNT(*) n, COUNT(DISTINCT source) s FROM signals WHERE ts>? AND ind IS NOT NULL GROUP BY ind', [since]); const m = Object.fromEntries(rows.map(r => [r.ind, r]));
  const by = all('SELECT ind_by, COUNT(*) n FROM signals WHERE ts>? GROUP BY ind_by', [since]);
  const srcBy = all('SELECT ind, source, COUNT(*) n FROM signals WHERE ts>? AND ind IS NOT NULL GROUP BY ind, source', [since]);
  const opps = getOpps(); const oc = {}; for (const o of opps) if (o.industry) oc[o.industry] = (oc[o.industry] || 0) + 1;
  const list = INDUSTRIES.map(i => { const r = m[i.code] || { n: 0, s: 0 }; const status = r.n >= 10 && r.s >= 3 ? 'good' : r.n >= 5 && r.s >= 2 ? 'ok' : 'gap'; return { ...i, signals: r.n, sources: r.s, opps: oc[i.code] || 0, status, topSources: srcBy.filter(x => x.ind === i.code).sort((a, b) => b.n - a.n).slice(0, 4).map(x => x.source + ' ' + x.n) }; });
  const total = all('SELECT COUNT(*) n FROM signals WHERE ts>?', [since])[0].n;
  return { list, sectors: SECTORS, gb: GB, covered: list.filter(x => x.status !== 'gap').length, good: list.filter(x => x.status === 'good').length, total: list.length, tagged: rows.reduce((a, r) => a + r.n, 0), signals: total, tagBy: by }; }

// ---------- 报告 ----------
const D = { market: '市场规模', growth: '增长动能', competition: '竞争(反向)', moat: '可防御性', monetization: '变现清晰度', fit: '创始人匹配' };
const C = { segments: '客户细分', problem: '问题', value: '价值主张', solution: '解决方案', channels: '渠道', revenue: '收入', costs: '成本', metrics: '关键指标', advantage: '壁垒' };
const $M = v => v == null ? '—' : v >= 1e12 ? '$' + (v / 1e12).toFixed(2) + 'T' : v >= 1e9 ? '$' + (v / 1e9).toFixed(1) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : '$' + Math.round(v).toLocaleString();
const link = e => `[${String(e.title).replace(/[\[\]|]/g, ' ').slice(0, 90)}](${e.url})`;
function ue(u) { const ltv = u.arpu * u.gm / u.churn; return { ltv, ratio: ltv / u.cac, payback: u.cac / (u.arpu * u.gm) }; }
function oppMd(o) { const u = ue(o.unitEcon);
  return `## ${o.title}  ·  综合评分 ${o.total}（置信度 ${o.conf}）\n\n> 行业：${o.industryName}（${o.sector}）｜ 阶段：${o.stage} ｜ 分析：${o.analysisBy === 'rules' ? '规则引擎' : o.analysisBy}\n\n**机会陈述**：面向 ${o.statement.who}；痛点：${o.statement.pain}；Why now：${o.statement.whyNow}；怎么做：${o.statement.how}\n\n### VC 六维评分与依据\n| 维度 | 分数 | 置信度 | 依据 |\n|---|---|---|---|\n${Object.keys(D).map(k => `| ${D[k]} | ${o.dims[k]} | ${o.dimDetail[k].conf} | ${o.dimDetail[k].basis.join('；').replace(/\|/g, '/')} |`).join('\n')}\n\n时间序列：近 7 天 ${o.ts.w1}‰ / 前 7 天 ${o.ts.w2}‰，速度 ${o.ts.velocity}，加速度 ${o.ts.accel}${o.ts.oneoff ? '，⚠ 一次性热点' : ''}${o.seasonal ? '，⚠ 季节性' : ''}\n\n### 量化不对称指标\n${Object.values(o.asymMetrics).map(a => `- **${a.name}** ${a.value}${a.unit === 'log2' ? '（log2）' : '×'}：${a.desc}${a.evidence[0] ? ' — ' + link(a.evidence[0]) : ''}`).join('\n')}\n\n### Why Now\n${o.whyNow.map(w => `- **${w.name}**（强度 ${w.strength}，${w.n} 条）：${w.why}。${w.evidence.map(link).join('；')}`).join('\n') || '- 证据不足'}\n\n### 市场规模 TAM / SAM / SOM\n- 自上而下：${o.tam.topDown.steps.map(s => `${s.k} ${s.pct ? (s.v * 100).toFixed(1) + '%' : $M(s.v)}（${s.src}）`).join(' × ')} = **TAM ${$M(o.tam.topDown.tam)}**\n- 自下而上：${o.tam.bottomUp.steps.map(s => `${s.k} ${s.v?.toLocaleString()}（${s.src}）`).join(' × ')} = **TAM ${$M(o.tam.bottomUp.tam)}**\n- SAM = TAM × ${(o.tam.assump.sam * 100).toFixed(0)}% = ${$M(o.tam.sam)}；SOM = SAM × ${(o.tam.assump.som * 100).toFixed(0)}% = ${$M(o.tam.som)}\n- 注：${o.tam.note}\n\n### 竞争格局（从信号自动发现）\n| 公司/产品 | 类型 | 提及 | 披露融资 | 证据 |\n|---|---|---|---|---|\n${o.competitors.slice(0, 10).map(c => `| ${c.name.replace(/\|/g, '/')} | ${c.types.join('/')} | ${c.mentions} | ${c.fundingM ? '$' + c.fundingM + 'M' : '—'} | ${c.evidence[0] ? link(c.evidence[0]) : ''} |`).join('\n')}\n\n### 单位经济（${o.unitEcon.label}，行业经验假设，非实测）\nARPU $${o.unitEcon.arpu}/月 · 毛利 ${(o.unitEcon.gm * 100).toFixed(0)}% · CAC $${o.unitEcon.cac} · 月流失 ${(o.unitEcon.churn * 100).toFixed(1)}% → LTV $${Math.round(u.ltv).toLocaleString()} · LTV/CAC ${u.ratio.toFixed(1)} · 回收期 ${u.payback.toFixed(1)} 月\n\n### 护城河评估\n${o.moat.map(m => `- ${m.name} ${m.score}：${m.desc}`).join('\n')}\n\n### 风险矩阵（概率 × 影响，1–5）\n| 风险 | 概率 | 影响 | 依据 |\n|---|---|---|---|\n${o.risks.map(r => `| ${r.name} | ${r.p} | ${r.i} | ${r.why}${r.evidence[0] ? ' ' + link(r.evidence[0]) : ''} |`).join('\n')}\n\n### 商业模式画布\n${Object.entries(o.canvas).map(([k, v]) => `- **${C[k] || k}**：${v}`).join('\n')}\n\n### 反方观点\n${o.redteam.map(r => '- ' + r).join('\n')}\n\n### 验证清单\n${o.checklist.map(c => `- [${c.status === 'done' ? 'x' : ' '}] ${c.step}：${c.detail}（成功标准：${c.metric}）${c.result ? ' 结果：' + c.result : ''}${c.note ? ' — ' + c.note : ''}`).join('\n')}\n\n### 证据链\n${o.evidence.slice(0, 25).map(e => `- [${e.source}] ${link(e)} · ${new Date(e.ts * 1000).toISOString().slice(0, 10)}`).join('\n')}\n${o.notes ? '\n### 备注\n' + o.notes + '\n' : ''}`; }
function icMemo(o) { const u = ue(o.unitEcon); const risk = o.risks.reduce((a, r) => a + r.p * r.i, 0) / o.risks.length;
  const rec = o.total >= 70 && o.conf >= .5 && risk < 10 ? '推进（进入尽调）' : o.total >= 60 ? '观察（补充证据后再议）' : '暂不推进';
  return `# 投资委员会备忘录（IC Memo）\n\n**项目/机会**：${o.title}  \n**行业**：${o.industryName}（GICS ${o.industry || '—'}，${o.sector}）  \n**日期**：${new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}（北京时间）  \n**建议**：**${rec}**  \n**综合评分**：${o.total}/100，置信度 ${o.conf}，平均风险分 ${risk.toFixed(1)}/25\n\n> 本备忘录由商机雷达根据公开信号自动生成。所有数字要么附带来源链接，要么明确标注为"假设"，未经一手尽调核实。\n\n## 1. 投资要点\n- 机会：面向 ${o.statement.who}，${o.statement.pain}\n- Why now：${o.statement.whyNow}\n- 切入：${o.statement.how}\n- 不对称：${o.asymmetry.map(a => a.desc).join('；') || '无显著不对称'}\n\n## 2. 市场\n自上而下 TAM ${$M(o.tam.topDown.tam)}；自下而上 TAM ${$M(o.tam.bottomUp.tam)}；SAM ${$M(o.tam.sam)}；SOM ${$M(o.tam.som)}。${o.tam.note}\n\n## 3. 竞争\n${o.competitors.slice(0, 8).map(c => `- ${c.name}（${c.types.join('/')}${c.fundingM ? '，披露融资 $' + c.fundingM + 'M' : ''}）${c.evidence[0] ? ' ' + link(c.evidence[0]) : ''}`).join('\n') || '- 未从信号中发现明确竞品（需人工补充）'}\n\n## 4. 单位经济（假设）\nLTV $${Math.round(u.ltv).toLocaleString()}，LTV/CAC ${u.ratio.toFixed(1)}，CAC 回收期 ${u.payback.toFixed(1)} 个月（${o.unitEcon.label} 行业经验假设）。\n\n## 5. 护城河\n${o.moat.sort((a, b) => b.score - a.score).map(m => `${m.name} ${m.score}`).join(' · ')}\n\n## 6. 主要风险\n${o.risks.sort((a, b) => b.p * b.i - a.p * a.i).map(r => `- ${r.name}（P${r.p}×I${r.i}）：${r.why}`).join('\n')}\n\n## 7. 反方观点\n${o.redteam.map(r => '- ' + r).join('\n')}\n\n## 8. 尽调与验证计划\n${o.checklist.map((c, i) => `${i + 1}. ${c.step}：${c.detail}（标准：${c.metric}）`).join('\n')}\n\n---\n\n# 附录：完整分析\n\n` + oppMd(o); }
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
  'cfg:set': (_, c) => { for (const [k, v] of Object.entries(c)) setK(k, v); save(); schedule(); return getCfg(); },
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
  await initDb(); Menu.setApplicationMenu(null);
  const icon = path.join(__dirname, '..', 'build', 'icon.png');
  win = new BrowserWindow({ width: 1440, height: 900, minWidth: 1100, minHeight: 700, frame: false, backgroundColor: '#0b0f17', title: '商机雷达 Signal Radar', icon: fs.existsSync(icon) ? nativeImage.createFromPath(icon) : undefined, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true } });
  win.on('maximize', () => send('win', { max: true })); win.on('unmaximize', () => send('win', { max: false }));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  schedule();
  if (process.env.SR_SHOT) { const dir = process.env.SR_SHOT; fs.mkdirSync(dir, { recursive: true });
    win.webContents.on('console-message', (e, l, m) => l >= 2 && console.log('[renderer]', m));
    if (!process.env.SR_NOFETCH) console.log(JSON.stringify(await refresh(process.env.SR_ONLY ? { only: process.env.SR_ONLY.split(',') } : {})));
    else if (process.env.SR_RECLUSTER) { await embedPending(); await recluster(); save(true); }
    await win.webContents.executeJavaScript('window.__reload && window.__reload()');
    for (const v of (process.env.SR_VIEWS || 'dashboard,detail,sources').split(',')) { const [view, tab] = v.split(':');
      await win.webContents.executeJavaScript(`window.__go('${view}', '${tab || ''}')`); await new Promise(r => setTimeout(r, 3000));
      fs.writeFileSync(path.join(dir, (process.env.SR_PREFIX || '') + v.replace(':', '-') + '.png'), (await win.capturePage()).toPNG()); }
    app.quit(); }
});
app.on('window-all-closed', () => app.quit());
