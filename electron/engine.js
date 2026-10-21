// 分析引擎 v2：语义聚类 → 时间序列（速度/加速度/一次性热点/季节性）→ 可解释六维评分（依据+置信度）
// → 量化不对称指标 → 竞争格局 → TAM/SAM/SOM（双法，带假设）→ Why Now → 单位经济 → 护城河 → 风险矩阵 → 机会陈述
const { INDUSTRIES, tagByKeywords } = require('./industries');
const IND = Object.fromEntries(INDUSTRIES.map(i => [i.code, i]));
const STOP = new Set(('人民 政府 关于 新闻 新华 财经 网站 门户 举行 召开 闻网 新浪 浪财 东方 方财 财富 搜狐 观点 时内 内新 最近 次浏 局关 网讯 记者 报道 andreessen horowitz finsmes say says said a an the and or of to in for on with by from at as is are was were be been it its this that these those you your we our i my me how what why when where who which can will just new now via using use used vs not no yes do does did get got has have had more most best top first one two out up into over than about after before all any show hn ask tell launch launched week day today year years 2024 2025 2026 2027 make made build built app apps tool tools free open source github com www http https introducing release update based like want need way people thing things time help my their them they there here some other also only says said report could would should may might much many very really still even back go going lot let us im dont data system paper model models approach method methods learning towards study analysis framework market size share cagr growth news new ceo inc ltd llc co corp company companies startup startups raises funding million billion series seed announces announced plans launches deal stock shares price prices quarter q3 q4 per off part amid via report reports global world first top google microsoft apple amazon meta openai nvidia app store 免费榜 付费榜 差评 公司 发布 宣布 我们 一个 这个 什么 如何 可以 没有 已经 进行 相关 方面 以及 正在 开始 推出 中国 美国 市场 行业 企业 2026 年 月 日').split(' '));
const clamp = (x, a = 0, b = 100) => Math.max(a, Math.min(b, Math.round(x)));
const KIND_CN = { community: '社区', code: '代码/开发', product: '产品', research: '研究/专利', news: '新闻', jobs: '招聘', funding: '融资/资本', social: '社交', demand: '需求', supply: '供给', policy: '政策/招采', macro: '宏观' };
const SNAP = new Set(['appstore', 'npm', 'pypi', 'gharchive', 'sec_fts', 'wikipv', 'cc_cdx', 'wayback', 'gtrends']);
const SEASONAL = /black friday|cyber monday|christmas|holiday season|halloween|thanksgiving|back to school|tax season|tax day|valentine|super bowl|world cup|olympics|双十一|双11|春节|年货|中秋|国庆|618|开学季|高考|春运|圣诞/i;
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const norm = v => { let s = 0; for (const x of v) s += x * x; s = Math.sqrt(s) || 1; return v.map(x => x / s); };

function tokens(s) { s = String(s || '').toLowerCase(); const out = [];
  for (const w of s.match(/[a-z][a-z0-9+#.-]{2,30}/g) || []) { const t = w.replace(/[.-]+$/, ''); if (t.length > 2 && !STOP.has(t)) out.push(t); }
  for (const seg of s.match(/[\u4e00-\u9fa5]{2,}/g) || []) for (let i = 0; i < seg.length - 1; i++) { const b = seg.slice(i, i + 2); if (!STOP.has(b)) out.push(b); }
  return out; }

function extractFunding(sig) {
  const t = sig.title;
  const m = t.match(/^(.{2,80}?)\s+(raises|raised|secures|lands|closes|bags|nabs|gets)\s+(\$|€|£|US\$)?\s?([\d.,]+)\s?(million|billion|m|b|bn)?\b(.*)$/i) || t.match(/^(.{2,40}?)(?:完成|获得|宣布完成)(.{0,12}?)([\d.]+)\s*(亿|千万|万)?\s*(美元|元|人民币)(.*)$/);
  if (!m) return null;
  let amt, cur = '$', round;
  if (/完成|获得/.test(t) && m[5] && /元|美元|人民币/.test(m[5])) { amt = parseFloat(m[3]) * ({ 亿: 100, 千万: 10, 万: 0.01 }[m[4]] || 1e-6); if (m[5] !== '美元') { amt = amt / 7.1; cur = '$≈'; } round = (t.match(/(天使|种子|Pre-?A|A\+?|B\+?|C\+?|D|E|战略)轮/) || [])[0] || ''; }
  else { amt = parseFloat(m[4].replace(/,/g, '')); const u = (m[5] || '').toLowerCase(); if (u.startsWith('b')) amt *= 1000; else if (!u && amt > 1e5) amt /= 1e6; cur = m[3] || '$'; round = (t.match(/\b(pre-seed|seed|series [a-h]\+?|growth|angel)\b/i) || [])[1] || ''; }
  if (!amt || amt > 50000) return null;
  return { company: m[1].replace(/^.*?:\s*/, '').replace(/^.*\bstartups?\s+/i, '').replace(/[,\s]+$/, '').replace(/^,\s*/, '').trim().slice(0, 50), amountM: Math.round(amt * 10) / 10, currency: cur, round, title: t, url: sig.url, ts: sig.ts, source: sig.source };
}

// 行业打标：来源提示 > 关键词 > 语义（与行业原型向量相似度）
function tagIndustry(sig, protos) { if (sig.industry && IND[sig.industry]) return [sig.industry, 'source'];
  const [k, s] = tagByKeywords(sig.title + ' ' + (sig.text || '').slice(0, 300)); if (k && s >= 1.5) return [k, 'keyword'];
  if (sig.vec && protos) { let best = null, bs = 0; for (const p of protos) { const c = dot(sig.vec, p.v); if (c > bs) { bs = c; best = p.code; } } if (bs > 0.42) return [best, 'semantic']; }
  return k ? [k, 'keyword'] : [null, null]; }

function cluster(signals, cfg = {}, ctx = {}) {
  const now = +cfg.now || Date.now() / 1000, thr = +cfg.clusterSim || 0.6;
  const pool = signals.filter(s => s.vec && s.kind !== 'macro' && s.ts > now - 30 * 86400).sort((a, b) => (b.engagement || 0) * (b.weight || .5) - (a.engagement || 0) * (a.weight || .5)).slice(0, +cfg.maxSignals || 8000);
  const C = [];
  for (const s of pool) { let bi = -1, bs = thr; for (let i = 0; i < C.length; i++) { const c = dot(s.vec, C[i].cen); if (c > bs) { bs = c; bi = i; } }
    if (bi < 0) C.push({ cen: Float32Array.from(s.vec), sum: Float32Array.from(s.vec), m: [s] });
    else { const c = C[bi]; c.m.push(s); for (let j = 0; j < s.vec.length; j++) c.sum[j] += s.vec[j]; c.cen = Float32Array.from(norm(c.sum)); } }
  // 全局基线
  const G = baseline(pool);
  const df = {}; for (const s of pool) for (const t of new Set(tokens(s.title))) df[t] = (df[t] || 0) + 1;
  const keep = C.filter(c => { const src = new Set(c.m.map(s => s.source)); return (c.m.length >= 4 && src.size >= 2) || c.m.length >= 10; });
  const opps = keep.map(c => buildOpp(c, G, df, pool.length, now, cfg, ctx)).filter(Boolean);
  for (const o of opps) qualityGate(o);
  opps.sort((a, b) => b.total - a.total);
  return { opps: opps.slice(0, +cfg.maxThemes || 120), baseline: G, clusters: C.length, pool: pool.length };
}
// 质量闸门：识别「背景噪声簇」（公告/招聘/榜单模板、单一来源、标签空泛），降权而非删除，并给出原因
const GENERIC = new Set('提及 印发 通知 方案 施方 民政 关于 意见 实施 办法 公告 发布 会议 部署 工作 召开 会见 华人 民共 路气 象预 时至 融资 亿元 完成 轮融 亿美 万元 大会 大赛 全球 学术 北京 上海 市人 智能 工业 扩容 能源 国科 电力 虎嗅 设计 渠道 深度 板块 公募 金融 targets 出海 国医 医院 生健 卫生 人民 政府 关于 新闻 新华 财经 网站 门户 公告 通知 举行 召开 方案 闻网 新浪 浪财 东方 方财 财富 搜狐 观点 时内 内新 最近 费榜 免费 付费 基热 次浏 热门 招聘 公开 民政 府采 采购 政策 季度 三季 深圳 创新 业大 局关 园招 services say andreessen horowitz jobs senior engineer gmbh manager notice agency collection activities finsmes labs events pro abgeschlossen hat financing germany spain czechia york mobile capital discover always doesn cialiste pilotage comptabilit artist 对月 月均 环比 周下 备案 form 差评'.split(' '));
function qualityGate(o) { const n = o.metrics.signals || 1, k = o.kinds || {}, why = [];
  const pol = (k.policy || 0) / n, job = (k.jobs || 0) / n, snap = (o.evidence || []).filter(e => SNAP.has(e.source)).length / Math.max(1, (o.evidence || []).length);
  if (pol > 0.6) why.push(`政策/招标公告占 ${Math.round(pol * 100)}%，更像行业背景而非创业机会`);
  if (job > 0.6) why.push(`招聘帖占 ${Math.round(job * 100)}%，反映用人需求而非产品机会`);
  if (snap > 0.6) why.push(`榜单/下载量快照占 ${Math.round(snap * 100)}%，缺少时间序列`);
  if (o.sources.length <= 1) why.push('仅 1 个来源，未交叉验证');
  const lab = String(o.title).split(' · '); if (lab.filter(w => GENERIC.has(w.toLowerCase())).length >= Math.min(2, lab.length)) why.push('主题标签空泛（多为模板/媒体词）');
  o.quality = { noise: why.length > 0, reasons: why };
  if (why.length) { o.total = Math.round(50 + (o.total - 50) * Math.max(0.3, 1 - 0.3 * why.length)); o.summary = '【背景/噪声簇，已降权】' + why.join('；') + '\n' + o.summary; } }
function baseline(sigs) { const g = { n: sigs.length, kind: {}, region: { cn: 0, us: 0, global: 0 }, daily: {} };
  for (const s of sigs) { g.kind[s.kind] = (g.kind[s.kind] || 0) + 1; g.region[s.region || 'global'] = (g.region[s.region || 'global'] || 0) + 1; if (!SNAP.has(s.source)) { const d = Math.floor(s.ts / 86400); g.daily[d] = (g.daily[d] || 0) + 1; } }
  return g; }
const share = (n, d) => (n + 0.5) / (d + 1);

function series(sigs, G, now) { // 归一化日序列（cluster 当日占全局当日信号比例 ×1000），排除快照型来源
  const today = Math.floor(now / 86400), cnt = {};
  for (const s of sigs) if (!SNAP.has(s.source)) { const d = Math.floor(s.ts / 86400); cnt[d] = (cnt[d] || 0) + 1; }
  const days = [], raw = [], rate = [];
  for (let d = today - 27; d <= today; d++) { days.push(new Date(d * 864e5).toISOString().slice(5, 10)); raw.push(cnt[d] || 0); rate.push(G.daily[d] ? (cnt[d] || 0) / G.daily[d] * 1000 : 0); }
  const avg = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const w1 = avg(rate.slice(-7)), w2 = avg(rate.slice(-14, -7)), w3 = avg(rate.slice(-21, -14));
  const velocity = w1 - w2, accel = (w1 - w2) - (w2 - w3);
  const tot = raw.reduce((a, b) => a + b, 0), peak = Math.max(...raw), active = raw.filter(x => x > 0).length;
  const oneoff = tot >= 3 && (peak / tot > 0.6 && active <= 3);
  return { days, raw, rate: rate.map(x => +x.toFixed(2)), w1: +w1.toFixed(2), w2: +w2.toFixed(2), w3: +w3.toFixed(2), velocity: +velocity.toFixed(2), accel: +accel.toFixed(2), oneoff, active, tot };
}

function buildOpp(c, G, df, N, now, cfg, ctx) {
  const sigs = c.m; sigs.sort((a, b) => b.ts - a.ts);
  const by = k => sigs.filter(s => s.kind === k);
  const n = k => by(k).length;
  const sources = [...new Set(sigs.map(s => s.source))];
  const wsum = sigs.reduce((a, s) => a + (s.weight || .5), 0), avgW = wsum / sigs.length;
  // 主题标签：c-TF-IDF
  const tf = {}; for (const s of sigs) for (const t of new Set(tokens(s.title))) tf[t] = (tf[t] || 0) + 1;
  const terms = Object.entries(tf).filter(([t, f]) => f >= 2).map(([t, f]) => [t, f / sigs.length * Math.log(1 + N / (df[t] || 1))]).sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]);
  let rep = sigs[0], rb = -1; for (const s of sigs) { const d = dot(s.vec, c.cen); if (d > rb) { rb = d; rep = s; } }
  const theme = terms.slice(0, 3).join(' · ') || rep.title.slice(0, 40);
  // 行业
  const iv = {}; for (const s of sigs) if (s.ind) iv[s.ind] = (iv[s.ind] || 0) + (s.weight || .5);
  // v2.3：行业判定 = 成员标签加权（50%）+ 簇内标题关键词投票（50%）；主行业占比不足或政策主导时标为跨行业，避免误标
  const kv = {}; for (const s of sigs.slice(0, 120)) { const [c] = tagByKeywords(s.title); if (c) kv[c] = (kv[c] || 0) + 1; }
  const sw = Object.values(iv).reduce((a, b) => a + b, 0) || 1, sk = Object.values(kv).reduce((a, b) => a + b, 0) || 1;
  const comb = {}; for (const [k, v] of Object.entries(iv)) comb[k] = (comb[k] || 0) + .5 * v / sw; for (const [k, v] of Object.entries(kv)) comb[k] = (comb[k] || 0) + .5 * v / sk;
  const indTop = Object.entries(comb).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v * sw).toFixed(2)]);
  const topShare = indTop.length ? comb[indTop[0][0]] : 0, polShare = sigs.filter(s => s.kind === 'policy').length / sigs.length;
  const support = indTop.length ? sigs.filter(s => s.ind === indTop[0][0]).length + (kv[indTop[0][0]] || 0) : 0;
  const industry = !indTop.length || topShare < .3 || support < Math.max(3, .2 * sigs.length) || (polShare > .4 && topShare < .5) ? null : indTop[0][0];
  const ts = series(sigs, G, now);
  const text = sigs.map(s => (s.title + ' ' + (s.text || '')).toLowerCase()).join(' ');
  const seasonal = SEASONAL.test(text) ? (text.match(SEASONAL) || [])[0] : null;
  const fundings = sigs.map(extractFunding).filter(Boolean);
  const formD = by('funding').filter(s => s.source === 'sec_formd');
  const money = (text.match(/\b(pricing|paid|revenue|subscription|saas|customers|mrr|arr|enterprise|b2b|monetiz\w*|contract|procurement|tender)\b|收费|付费|营收|订单|采购|中标/g) || []).length;
  const pains = sigs.filter(s => s.pain || /alternative|frustrat|struggl|hate|broken|expensive|looking for|is there a|求推荐|有没有|吐槽|痛点|难用/i.test(s.title));
  const ev = (arr, k = 3) => arr.slice(0, k).map(s => ({ title: s.title, url: s.url, source: s.source }));
  const K = { tech: [...by('code'), ...by('research')], product: [...by('product'), ...by('supply')], demand: [...by('demand'), ...by('community'), ...by('social')], funding: by('funding'), jobs: by('jobs'), news: by('news'), policy: by('policy') };
  const supplyN = K.product.length + fundings.length + formD.length, demandN = K.demand.length + pains.length;
  const eng = sigs.reduce((a, s) => a + Math.log(1 + Math.max(0, s.engagement || 0)), 0);
  const conf = (m) => +(Math.min(1, Math.log2(1 + m) / 4) * (0.5 + avgW / 2) * Math.min(1, sources.length / 3)).toFixed(2);
  const D = {};
  D.market = { score: clamp(15 + Math.log2(1 + eng) * 7 + Math.log2(1 + sigs.length) * 4 + Math.min(15, sources.length * 2)), conf: conf(sigs.length),
    basis: [`信号热度对数和 ${eng.toFixed(1)}（${sigs.length} 条，${sources.length} 个来源）`, `覆盖信号类型 ${Object.keys(K).filter(k => K[k].length).length}/7`, industry ? `主行业：${IND[industry].cn}（GICS ${industry}）` : '未识别到主行业'], evidence: ev([...sigs].sort((a, b) => (b.engagement || 0) - (a.engagement || 0))) };
  let g = 45 + Math.tanh(ts.velocity / 2) * 25 + Math.tanh(ts.accel / 2) * 12 + Math.min(10, Math.log2(1 + ts.w1) * 3);
  const gb = [`归一化日速率：近 7 天 ${ts.w1}‰，前 7 天 ${ts.w2}‰，再前 7 天 ${ts.w3}‰`, `速度 ${ts.velocity >= 0 ? '+' : ''}${ts.velocity}‰/周，加速度 ${ts.accel >= 0 ? '+' : ''}${ts.accel}‰/周²`];
  const vels = sigs.filter(s => s.velocity != null && SNAP.has(s.source)); if (vels.length) { const mv = vels.reduce((a, s) => a + s.velocity, 0) / vels.length; g += Math.tanh(mv / 100) * 8; gb.push(`快照型增速指标（star/下载/浏览）均值 ${mv.toFixed(0)}%（${vels.length} 条）`); }
  if (ts.oneoff) { g -= 18; gb.push('⚠ 一次性热点：60% 以上信号集中在 ≤3 天内，已降权 −18'); }
  if (seasonal) { g -= 10; gb.push(`⚠ 季节性词「${seasonal}」：疑似季节性噪声，已降权 −10（不足一年数据，无法做同比分解）`); }
  D.growth = { score: clamp(g), conf: conf(ts.tot), basis: gb, evidence: ev(sigs) };
  const comp = 88 - Math.log2(1 + supplyN) * 12 + Math.min(15, Math.log2(1 + demandN) * 4);
  D.competition = { score: clamp(comp), conf: conf(supplyN + demandN), basis: [`供给侧信号 ${supplyN}（产品/新域名/新注册 ${K.product.length}，融资报道 ${fundings.length}，Form D ${formD.length}）`, `需求侧信号 ${demandN}（需求/社区 ${K.demand.length}，痛点表述 ${pains.length}）`, '分数越高 = 竞争越少（反向指标）'], evidence: ev(K.product.length ? K.product : sigs) };
  const pat = sigs.filter(s => /patent|专利/i.test(s.title)).length, reg = K.policy.length;
  D.moat = { score: clamp(20 + Math.log2(1 + K.tech.length) * 10 + pat * 6 + Math.min(15, reg * 3) - (sigs.filter(s => s.source === 'github' || s.source === 'gharchive').length > 5 ? 8 : 0)), conf: conf(K.tech.length + reg),
    basis: [`技术信号 ${K.tech.length}（论文/代码/模型），专利 ${pat}`, `政策/监管信号 ${reg}（合规门槛可形成壁垒）`, sigs.filter(s => s.source === 'github' || s.source === 'gharchive').length > 5 ? '开源项目活跃，技术易被复制 −8' : '开源替代较少'], evidence: ev(K.tech.length ? K.tech : K.policy) };
  const tenders = sigs.filter(s => s.tender).length, paidApps = sigs.filter(s => /付费榜/.test(s.title)).length;
  D.monetization = { score: clamp(15 + Math.min(25, money * 3) + Math.log2(1 + fundings.length + formD.length) * 9 + Math.log2(1 + K.jobs.length) * 6 + tenders * 4 + paidApps * 5), conf: conf(money + fundings.length + K.jobs.length + tenders),
    basis: [`商业化关键词 ${money} 处`, `融资事件 ${fundings.length}（披露 $${fundings.reduce((a, f) => a + f.amountM, 0).toFixed(0)}M），Form D ${formD.length}`, `招聘 ${K.jobs.length}，政府/企业招标 ${tenders}，付费榜应用 ${paidApps}`], evidence: ev([...K.funding, ...K.jobs, ...sigs.filter(s => s.tender)]) };
  const skills = String(cfg.skills || '').toLowerCase().split(/[,，\s]+/).filter(Boolean); const hit = skills.filter(k => text.includes(k));
  D.fit = { score: skills.length ? clamp(30 + hit.length * 18) : 50, conf: skills.length ? .8 : .2, basis: skills.length ? [`命中技能/资源：${hit.join('、') || '无'}（共 ${skills.length} 项）`] : ['未在设置中填写技能，默认 50'], evidence: [] };
  const W = { market: .2, growth: .25, competition: .15, moat: .12, monetization: .2, fit: .08 };
  const raw = Object.entries(W).reduce((a, [k, w]) => a + D[k].score * w, 0);
  const oc = +(Object.entries(W).reduce((a, [k, w]) => a + D[k].conf * w, 0)).toFixed(2);
  const total = clamp(50 + (raw - 50) * (0.55 + oc * 0.45));
  // 量化不对称（相对全局基线，log2 比值；正值 = 该机会在分子一侧相对更"热"）
  const cnN = sigs.filter(s => s.region === 'cn').length, usN = sigs.filter(s => s.region === 'us' || (s.region !== 'cn' && /^(hn|github|producthunt|techcrunch|reddit|sec_|fedreg|yc_)/.test(s.source))).length;
  const L2 = (a, b) => +Math.log2(a / b).toFixed(2);
  const A = {
    cnUs: { name: '中美热度差', value: L2(share(usN, sigs.length), share(G.region.us || 1, G.n)) - L2(share(cnN, sigs.length), share(G.region.cn || 1, G.n)), unit: 'log2', desc: `美国/英文侧 ${usN} 条 vs 中文侧 ${cnN} 条（相对全库基线）；>0 美热中冷，<0 中热美冷`, evidence: [...ev(sigs.filter(s => s.region === 'us'), 2), ...ev(sigs.filter(s => s.region === 'cn'), 2)] },
    techProduct: { name: '技术-产品落差', value: L2((K.tech.length + 1) / (K.product.length + 1), ((G.kind.code || 0) + (G.kind.research || 0) + 1) / ((G.kind.product || 0) + (G.kind.supply || 0) + 1)), unit: 'log2', desc: `技术 ${K.tech.length} vs 产品 ${K.product.length}；>0 技术领先于产品化`, evidence: ev(K.tech) },
    demandSupply: { name: '需求/供给比', value: +(((demandN + 1) / (supplyN + 1)) / (((G.kind.demand || 0) + (G.kind.community || 0) + 1) / ((G.kind.product || 0) + (G.kind.supply || 0) + (G.kind.funding || 0) + 1))).toFixed(2), unit: '×基线', desc: `需求 ${demandN} / 供给 ${supplyN}，相对全库基线的倍数；>1 供不应求`, evidence: ev(pains.length ? pains : K.demand) },
    capitalAttention: { name: '资本/认知比', value: L2((K.funding.length + 1) / (K.demand.length + 1), ((G.kind.funding || 0) + 1) / ((G.kind.community || 0) + (G.kind.demand || 0) + 1)), unit: 'log2', desc: `资本信号 ${K.funding.length} vs 社区讨论 ${K.demand.length}；>0 资本先行`, evidence: ev(K.funding) },
    talent: { name: '人才流向', value: L2((K.jobs.length + 1) / (K.news.length + 1), ((G.kind.jobs || 0) + 1) / ((G.kind.news || 0) + 1)), unit: 'log2', desc: `招聘 ${K.jobs.length} vs 新闻 ${K.news.length}；>0 企业在悄悄布局`, evidence: ev(K.jobs) } };
  const asymmetry = Object.entries(A).filter(([k, a]) => (a.unit === 'log2' ? Math.abs(a.value) >= 1 : a.value >= 2 || a.value <= .5) && sigs.length >= 5).map(([k, a]) => ({ key: k, type: a.name, gap: clamp(a.unit === 'log2' ? Math.abs(a.value) * 25 : Math.abs(Math.log2(a.value)) * 30), desc: `${a.name} ${a.value}${a.unit === 'log2' ? '' : '×'}：${a.desc}`, evidence: a.evidence }));
  // 竞争格局
  const comps = {}; const addC = (name, type, s, amt) => { if (!name || name.length < 2 || name.length > 60) return; const k = name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, ''); if (!k) return; const c = comps[k] || (comps[k] = { name, types: new Set(), mentions: 0, fundingM: 0, evidence: [] }); c.types.add(type); c.mentions++; if (amt) c.fundingM += amt; if (c.evidence.length < 3) c.evidence.push({ title: s.title, url: s.url, source: s.source }); };
  for (const f of fundings) addC(f.company, '融资', f, f.amountM);
  for (const s of sigs) { if (s.company && s.kind !== 'jobs') addC(s.company, { product: '产品', supply: '新实体', funding: 'SEC 备案', demand: '用户反馈对象', research: '专利/研究' }[s.kind] || '提及', s);
    if (s.source === 'producthunt') addC(s.title.split(/\s[—–-]\s/)[0], '产品', s); if (s.source === 'yc_companies') addC((s.title.match(/: (.+?) —/) || [])[1], 'YC 公司', s); if (s.source === 'hf_spaces' || s.source === 'github') addC(s.title.split(/[：:]/)[0].replace(/^HF Space /, ''), '开源/应用', s); }
  const competitors = Object.values(comps).map(c => ({ ...c, types: [...c.types] })).sort((a, b) => b.fundingM - a.fundingM || b.mentions - a.mentions).slice(0, 15);
  // Why Now
  const drv = (name, list, why) => ({ name, n: list.length, strength: clamp(Math.log2(1 + list.length) * 25), why, evidence: ev(list) });
  const cheaper = sigs.filter(s => /cheaper|cost (drop|down)|price cut|open[- ]source|降价|成本下降|开源/i.test(s.title));
  const whyNow = [drv('技术成熟', K.tech, '新论文/模型/代码让以前做不到的事变得可行'), drv('需求上升', [...K.demand, ...pains], '搜索/社区/差评中出现增长的需求或抱怨'), drv('资本涌入', [...K.funding, ...fundings.map(f => ({ title: f.title, url: f.url, source: f.source }))], '融资、Form D、S-1 显示资本正在下注'), drv('政策/采购变化', K.policy, '法规、政府公报、招标带来新的强制需求或采购预算'), drv('成本下降', cheaper, '开源或降价降低了进入门槛'), drv('人才聚集', K.jobs, '企业在招聘相关岗位')].filter(d => d.n).sort((a, b) => b.strength - a.strength);
  // 商业模式类型 & 单位经济假设（行业经验默认值，非实测，用户可改）
  const model = sigs.some(s => s.source === 'appstore' || s.source === 'appstore_reviews') ? 'consumer' : /hardware|device|robot|机器人|硬件|设备|battery|电池/.test(text) ? 'hardware' : /marketplace|平台|撮合|two-sided/.test(text) ? 'marketplace' : tenders > 1 ? 'gov' : 'b2b_saas';
  const UE = { b2b_saas: { label: 'B2B SaaS', arpu: 300, gm: .78, cac: 2500, churn: .02 }, consumer: { label: '消费者订阅 App', arpu: 8, gm: .8, cac: 25, churn: .07 }, marketplace: { label: '交易平台（抽佣）', arpu: 40, gm: .65, cac: 120, churn: .05 }, hardware: { label: '硬件 + 服务', arpu: 120, gm: .35, cac: 600, churn: .015 }, gov: { label: 'To G/大客户项目制', arpu: 8000, gm: .45, cac: 40000, churn: .01 } }[model];
  // TAM（自上而下所需宏观数据在 main 中注入）
  const moat = [['网络效应', /marketplace|community|network|社区|平台|用户生成/.test(text) ? 60 : 25, '是否有多边/社区结构'], ['数据壁垒', clamp(20 + K.tech.length * 3 + (/(dataset|data moat|proprietary data|数据)/.test(text) ? 20 : 0)), '是否积累专有数据'], ['转换成本', /workflow|integration|erp|crm|ehr|集成|工作流|系统/.test(text) ? 60 : 30, '是否嵌入客户工作流'], ['规模效应', /hardware|manufactur|supply chain|制造|供应链/.test(text) ? 55 : 30, '是否有规模/供应链优势'], ['合规/牌照', clamp(15 + reg * 8), '监管门槛（FDA、金融牌照、招采资质等）'], ['技术/IP', clamp(15 + pat * 10 + K.tech.length * 2), '专利与研究积累']].map(([name, score, desc]) => ({ name, score: clamp(score), desc }));
  const R = (name, p, i, why, evd) => ({ name, p: Math.max(1, Math.min(5, Math.round(p))), i: Math.max(1, Math.min(5, Math.round(i))), why, evidence: evd || [] });
  const risks = [R('需求真实性', ts.oneoff || seasonal ? 4 : 5 - oc * 4, 4, ts.oneoff ? '一次性热点' : seasonal ? '季节性' : `整体置信度 ${oc}`), R('竞争加剧', 1 + Math.log2(1 + supplyN), 3, `供给信号 ${supplyN}`, ev(K.product)), R('监管/合规', 1 + Math.min(4, reg / 2 + (/recall|ban|lawsuit|召回|禁止|处罚|诉讼/.test(text) ? 1.5 : 0)), 4, `政策信号 ${reg}`, ev(K.policy)), R('技术可行性', K.tech.length > K.product.length * 2 ? 4 : 2, 3, '研究多、产品少说明技术尚未成熟'), R('融资环境', fundings.length + formD.length ? 2 : 3.5, 3, `相关融资 ${fundings.length + formD.length} 起`), R('执行/人才', 1 + Math.min(4, K.jobs.length / 4), 2, `招聘竞争 ${K.jobs.length}`)];
  const top = whyNow[0];
  const who = model === 'consumer' ? '移动端个人用户' : model === 'gov' ? '政府与公共机构采购方' : industry ? `${IND[industry].cn}领域的企业与从业者` : '相关领域的中小企业';
  const statement = { who, pain: pains[0] ? `用户抱怨/求替代：「${pains[0].title.slice(0, 80)}」等 ${pains.length} 条` : `「${theme}」相关需求在 ${sources.length} 个来源同时出现，但现有方案分散`, whyNow: top ? `${top.name}：${top.why}（${top.n} 条证据）` : '证据不足', how: model === 'b2b_saas' ? '以垂直 SaaS 切入，先做单一高频场景，按席位/用量订阅' : model === 'consumer' ? '做轻量 App，免费增值，以差评中的痛点作为差异化卖点' : model === 'hardware' ? '硬件 + 订阅服务，先做 B2B 小批量试点' : model === 'gov' ? '项目制交付，同时沉淀标准化产品' : '撮合平台，先做供给侧，再按交易抽佣', evidence: ev(pains.length ? pains : sigs) };
  const id = 'o_' + require('crypto').createHash('md5').update(terms.slice(0, 4).sort().join('|') || rep.title).digest('hex').slice(0, 12);
  const o = { id, members: sigs.map(s => s.id), theme, title: theme, rep: { title: rep.title, url: rep.url }, terms, industry, industryName: industry ? IND[industry].cn : (indTop.length ? '跨行业' : '未分类'), industryConf: +topShare.toFixed(2), sector: industry ? IND[industry].sectorCn : '—', industries: indTop.slice(0, 3).map(([k, v]) => ({ code: k, name: IND[k].cn, w: +v.toFixed(1) })),
    total, conf: oc, dims: Object.fromEntries(Object.entries(D).map(([k, v]) => [k, v.score])), dimDetail: D, ts, seasonal, metrics: { crossSource: clamp(sources.length * 12 + Object.keys(K).filter(k => K[k].length).length * 6), novelty: clamp(100 - (now - Math.min(...sigs.map(s => s.ts))) / 86400 * 3), signals: sigs.length, pain: pains.length, money, supplyN, demandN, last3: sigs.filter(s => s.ts > now - 3 * 86400).length, prev: sigs.filter(s => s.ts <= now - 3 * 86400 && s.ts > now - 10 * 86400).length, growthRatio: +(ts.w2 ? ts.w1 / ts.w2 : ts.w1 ? 2 : 1).toFixed(2) },
    sources, kinds: Object.fromEntries([...new Set(sigs.map(s => s.kind))].map(k => [k, n(k)])), evidence: sigs.slice(0, 60).map(s => ({ id: s.id, title: s.title, url: s.url, source: s.source, kind: s.kind, ts: s.ts, engagement: s.engagement, region: s.region })),
    fundings, asymmetry, asymMetrics: A, competitors, whyNow, model, unitEcon: UE, moat, risks, statement, updated: now };
  Object.assign(o, ruleAnalysis(o));
  return o;
}

function tam(o, macro, assump = {}) {
  const gdp = macro?.wb?.gdp?.values, sec = o.industry ? o.industry.slice(0, 2) : null, { SECTOR_SHARE } = require('./macro');
  const a = { niche: assump.niche ?? 0.01, sam: assump.sam ?? 0.2, som: assump.som ?? 0.03, customers: assump.customers ?? 10000, arpuY: assump.arpuY ?? o.unitEcon.arpu * 12, regions: assump.regions ?? ['USA', 'CHN'] };
  const td = { method: '自上而下', steps: [], tam: null };
  const IO = o.industry && macro?.stats ? require('./chain').industryOutput(o.industry, macro.stats) : null;
  if (IO) { td.steps = [...IO.parts, { k: '行业产出合计（美+欧）', v: IO.total, src: `ISIC/NACE ${IO.isic} ↔ GICS ${o.industry} 映射`, real: true }, { k: '细分赛道占行业比例', v: a.niche, src: '假设（可修改）', pct: true }]; td.tam = IO.total * a.niche; td.basis = 'industry'; }
  else if (gdp && sec && SECTOR_SHARE[sec]) { const [k, f, desc] = SECTOR_SHARE[sec]; const ind = macro.wb[k];
    let base = 0; for (const r of a.regions) if (gdp[r]?.v) base += gdp[r].v * ((ind?.values?.[r]?.v || 0) / 100) * f;
    td.steps = [{ k: 'GDP（' + a.regions.join('+') + '）', v: a.regions.reduce((s, r) => s + (gdp[r]?.v || 0), 0), src: '世界银行 ' + macro.wb.gdp.id + '（' + (gdp.USA?.year || '') + '）', url: macro.wb.gdp.url, real: true },
      { k: '板块规模', v: base, src: desc + (ind ? '，指标 ' + ind.id : ''), url: ind?.url, real: !/假设/.test(desc) }, { k: '细分赛道占板块比例', v: a.niche, src: '假设（可修改）', pct: true }];
    td.tam = base * a.niche; }
  else td.steps.push({ k: '缺少数据', v: null, src: o.industry ? '宏观数据未加载，请在宏观页刷新' : '未识别行业，无法自上而下估算' });
  const bu = { method: '自下而上', steps: [{ k: '目标客户数', v: a.customers, src: '占位假设，请按实际调研修改' }, { k: '年 ARPU（$）', v: a.arpuY, src: `${o.unitEcon.label} 行业经验假设` }], tam: a.customers * a.arpuY };
  const pick = td.tam || bu.tam;
  return { assump: a, topDown: td, bottomUp: bu, sam: pick * a.sam, som: pick * a.sam * a.som, note: (td.basis === 'industry' ? '自上而下使用 OECD STAN（美国总产出）与 Eurostat SBS（EU27 营业额）实测行业规模，仅细分比例与汇率为假设' : '自上而下使用世界银行实测 GDP 与产业占比（该行业暂无 STAN/Eurostat 映射），板块折算系数与细分比例为假设') + '；自下而上全部为假设。两者差异越大，说明假设越需要验证。' };
}

function ruleAnalysis(o) {
  const t = o.theme, d = o.dims, st = o.statement;
  const summary = `【机会陈述】面向${st.who}，${st.pain}。Why now：${st.whyNow}。切入方式：${st.how}。` + `\n该主题在 ${o.sources.length} 个来源共 ${o.metrics.signals} 条信号（${Object.entries(o.kinds).map(([a, b]) => (KIND_CN[a] || a) + b).join('，')}），主行业 ${o.industryName}，综合置信度 ${o.conf}。` + (o.asymmetry.length ? `量化不对称：${o.asymmetry.map(a => a.type).join('、')}。` : '');
  const canvas = { segments: st.who, problem: st.pain, value: d.competition > 60 ? `率先提供聚焦「${t}」的专门方案` : `在已有玩家之外以更低价格/更细分场景切入`, solution: st.how, channels: o.sources.some(s => /hn|github|producthunt|reddit/.test(s)) ? '开发者/创业社区、Product Hunt、内容 SEO' : o.model === 'gov' ? '招投标、渠道集成商' : '行业媒体、展会、合作伙伴', revenue: o.unitEcon.label + `（假设 ARPU $${o.unitEcon.arpu}/月）`, costs: o.model === 'hardware' ? 'BOM、制造、售后' : '研发、云/算力、获客', metrics: o.model === 'consumer' ? 'DAU、留存、付费转化' : 'ARR、净收入留存、CAC 回收期', advantage: o.moat.slice().sort((a, b) => b.score - a.score).slice(0, 2).map(m => m.name).join(' + ') };
  const redteam = [];
  if (d.competition < 45) redteam.push(`供给侧信号 ${o.metrics.supplyN} 条，已有较多产品/融资，红海风险高`);
  if (o.ts.oneoff) redteam.push('时间序列显示为一次性热点，可能只是新闻事件');
  if (o.seasonal) redteam.push(`包含季节性词「${o.seasonal}」，热度可能随季节回落`);
  if (d.monetization < 40) redteam.push('付费/商业化证据弱');
  if (d.moat < 40) redteam.push('技术门槛低，易被复制');
  if (o.sources.length <= 2) redteam.push('只在少数来源出现，存在样本偏差');
  if (o.conf < .4) redteam.push(`整体置信度 ${o.conf} 偏低，结论需要更多证据`);
  redteam.push('所有评分基于公开信号的数量与分布，不代表真实市场规模');
  const checklist = [{ step: '问题访谈', detail: `访谈 10–15 位「${st.who}」，验证「${t}」相关痛点频率与现有替代`, metric: '≥60% 认为是高频痛点' }, { step: '竞品拆解', detail: `拆解竞争格局中的前 5 家（${o.competitors.slice(0, 3).map(c => c.name).join('、') || '待补充'}）的定价、评价与差评`, metric: '找到 1 个未被满足的细分' }, { step: '落地页测试', detail: '一页式落地页 + 等待名单，在信号来源社区投放', metric: '访客→留资 ≥10%' }, { step: '单位经济验证', detail: `用真实报价验证 ARPU（假设 $${o.unitEcon.arpu}/月）与获客成本（假设 $${o.unitEcon.cac}）`, metric: 'LTV/CAC ≥ 3' }, { step: '预售/LOI', detail: '早鸟价或意向书', metric: '≥3 个付费或书面意向' }].map(c => ({ ...c, status: 'todo', note: '' }));
  return { summary, canvas, redteam, checklist, analysisBy: 'rules' };
}

async function llmCall(prompt, cfg) {
  let content;
  if (cfg.llmProvider === 'ollama') { const r = await fetch((cfg.ollamaUrl || 'http://localhost:11434').replace(/\/$/, '') + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: cfg.ollamaModel || 'qwen2.5', stream: false, format: 'json', messages: [{ role: 'user', content: prompt }] }), signal: AbortSignal.timeout(240000) }); if (!r.ok) throw new Error('Ollama HTTP ' + r.status); content = (await r.json()).message.content; }
  else { const r = await fetch((cfg.openaiBase || 'https://api.openai.com/v1').replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.openaiKey}` }, body: JSON.stringify({ model: cfg.openaiModel || 'gpt-4o-mini', temperature: 0.4, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }), signal: AbortSignal.timeout(180000) }); if (!r.ok) throw new Error('LLM HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200)); content = (await r.json()).choices[0].message.content; }
  return JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1));
}
async function llmAnalyze(o, cfg) {
  const prompt = `你是资深产品经理和早期风险投资人。只依据下列真实证据（不要编造任何数字或公司），为该机会写分析，用中文。
主题：${o.theme}；行业：${o.industryName}；六维规则评分：${JSON.stringify(o.dims)}；置信度 ${o.conf}
Why now 驱动：${o.whyNow.map(w => w.name + w.n).join('，')}；不对称：${o.asymmetry.map(a => a.desc).join('；')}
竞品：${o.competitors.slice(0, 8).map(c => c.name + (c.fundingM ? `($${c.fundingM}M)` : '')).join('，')}
证据：\n${o.evidence.slice(0, 30).map((e, i) => `${i + 1}. [${e.source}] ${e.title}`).join('\n')}
输出严格 JSON：{"title":"一句话机会名称","statement":{"who":"","pain":"","whyNow":"","how":""},"summary":"250字内判断","canvas":{"segments":"","problem":"","value":"","solution":"","channels":"","revenue":"","costs":"","metrics":"","advantage":""},"redteam":["..."],"checklist":[{"step":"","detail":"","metric":""}],"dimAdjust":{"market":0,"growth":0,"competition":0,"moat":0,"monetization":0,"fit":0},"adjustReason":"修正理由"} dimAdjust 范围 -15~15。`;
  const j = await llmCall(prompt, cfg);
  const dims = { ...o.dims }; for (const k in j.dimAdjust || {}) if (k in dims) dims[k] = clamp(dims[k] + Math.max(-15, Math.min(15, +j.dimAdjust[k] || 0)));
  return { title: j.title || o.title, statement: { ...o.statement, ...(j.statement || {}) }, summary: j.summary || o.summary, canvas: { ...o.canvas, ...(j.canvas || {}) }, redteam: j.redteam?.length ? j.redteam : o.redteam, checklist: j.checklist?.length ? j.checklist.map(c => ({ ...c, status: 'todo', note: '' })) : o.checklist, dims, adjustReason: j.adjustReason || '', analysisBy: cfg.llmProvider === 'ollama' ? 'ollama:' + (cfg.ollamaModel || 'qwen2.5') : 'llm:' + (cfg.openaiModel || 'gpt-4o-mini') };
}
const llmEnabled = cfg => (cfg.llmProvider === 'ollama' && cfg.ollamaUrl) || (cfg.llmProvider === 'openai' && cfg.openaiKey);
module.exports = { cluster, extractFunding, llmAnalyze, llmCall, llmEnabled, tagIndustry, tam, KIND_CN, SNAP };
