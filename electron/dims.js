// 机会维度发现引擎：每个维度独立检测，输出带指标/阈值/证据的机会卡片；与语义簇关联后做多维加权
const { INDUSTRIES } = require('./industries');
const IND = Object.fromEntries(INDUSTRIES.map(i => [i.code, i]));
const clamp = (x, a = 0, b = 100) => Math.max(a, Math.min(b, Math.round(x)));
const L2 = (a, b) => Math.log2((a + 1) / (b + 1));
const ev = (sigs, n = 5) => sigs.slice().sort((a, b) => (b.engagement || 0) - (a.engagement || 0)).slice(0, n).map(s => ({ title: s.title, url: s.url, source: s.source, ts: s.ts }));
const text = s => (s.title + ' ' + (s.text || '')).toLowerCase();
const CO_IND = [[/美团|饿了么|大众点评|肯德基|麦当劳|瑞幸|星巴克|餐/, '253010'], [/携程|飞猪|去哪儿|同程|酒店|航空/, '253010'], [/京东金融|支付宝|花呗|借呗|分期|小贷|消费金融|信用卡|银行|贷/, '402020'], [/保险/, '403010'], [/京东|淘宝|天猫|拼多多|唯品会|抖音商城|得物|闲鱼|阿里|苏宁|快手/, '255030'], [/滴滴|哈啰|货拉拉|高德|曹操/, '203040'], [/顺丰|中通|圆通|申通|韵达|极兔|邮政|快递|菜鸟/, '203010'], [/移动|联通|电信/, '501010'], [/腾讯|网易|米哈游|游戏|爱奇艺|优酷|芒果|B站|哔哩/, '502030'], [/汽车|蔚来|小鹏|理想|比亚迪|特斯拉|吉利/, '251020'], [/教育|学而思|作业帮|猿辅导|课/, '253020']];
const DEMAND = new Set(['tousu_sina', 'reddit_pain', 'appstore_reviews', 'amazon_reviews', 'stackexchange', 'reddit_archive', 'v2ex', 'kr_flash']);
const SUPPLY = new Set(['producthunt', 'yc_companies', 'hf_spaces', 'appstore', 'gleif', 'opencorporates', 'companieshouse']);
const RESEARCH = s => s.kind === 'research', CODE = s => s.kind === 'code', PRODUCT = s => SUPPLY.has(s.source) || s.kind === 'product';
const TENDER = new Set(['ted', 'ccgp', 'cn_tender', 'samgov']), POLICY = new Set(['fedreg', 'cn_policy', 'fda']);
const CN = s => s.region === 'cn' || /[\u4e00-\u9fa5]{4,}/.test(s.title);
const RE = {
  cost: /(price (cut|drop)|\bcheaper\b|cost[s]? (fall|drop|decline|down)|per kwh|\$\/kwh|cost per|half the cost|10x cheaper|降价|成本下降|降本|价格战|跌破|创新低|平价)/i,
  weak: /(shut(s|ting)? down|discontinu|sunset|price (hike|increase)|raises prices|outage|layoffs?|acquired by|acquires|data breach|lawsuit|停服|下线|涨价|裁员|收购|暴雷|宕机|被罚|下架)/i,
  platform: /(launch(es|ed)? (an? )?(api|sdk|plugin|marketplace|app store)|\bmcp\b|model context protocol|open(s|ed)? (its )?api|developer platform|plugin marketplace|extension marketplace|gpt store|开放平台|插件市场|开放 ?api|小程序|应用商店上线)/i,
  policy: /(regulation|rule|act\b|mandate|ban|subsid|tariff|compliance|guidance|approval|法规|条例|办法|意见|通知|补贴|禁止|标准|监管|准入|试点)/i,
  alt: /(alternative to|alternatives? for|replace(ment)? for|switch(ing)? from|moving away from|替代品|平替|有没有.*替代)/i,
};
const MODELS = [['订阅制/SaaS', /(subscription|saas|per seat|monthly plan|订阅|会员制)/i], ['Agent 平台/编排', /(agent (platform|framework|orchestr)|multi-?agent|agentic|agents?\.md|mcp\b)/i], ['垂直行业 AI', /(vertical ai|industry[- ]specific (ai|llm)|专属大模型|行业大模型)/i], ['按量计费', /(usage-based|pay[- ]as[- ]you[- ]go|per (call|token|api call)|按量|按次计费)/i], ['双边市场/撮合', /(marketplace|two-sided|connects .* with|platform connecting|撮合|交易平台|双边)/i], ['AI 代理服务（Agent-as-a-service）', /(ai[- ]native (services|agency)|ai agents? (that|for) .*(handle|do|automate)|agentic (services|workflow)|AI 代理|智能体服务)/i], ['嵌入式金融', /(embedded (finance|payments|lending)|bnpl|buy now pay later|嵌入式金融|先买后付)/i], ['硬件+订阅', /(hardware.{0,20}subscription|device.{0,20}subscription|硬件.{0,6}订阅)/i], ['开源+商业版', /(open[- ]source.{0,30}(cloud|enterprise|hosted)|open core|开源.{0,6}商业)/i],
  // v4.6 参照 St. Gallen Business Model Navigator 补充 6 个模式（#17 加盟、#18 Freemium、#35 按使用付费已有、#39 剃须刀-刀片、按效果付费、租赁/即服务、DTC）
  ['Freemium', /(freemium|free tier|free plan|免费版|基础版免费)/i], ['剃须刀-刀片（耗材复购）', /(razor.{0,10}blade|consumables?|refill|cartridge|耗材|复购)/i], ['按效果付费', /(pay[- ]per[- ](result|outcome|performance|success)|outcome-based|success fee|按效果付费|效果付费|按结果收费)/i],
  ['租赁/即服务（XaaS）', /(robots?[- ]as[- ]a[- ]service|raas\b|equipment[- ]as[- ]a[- ]service|leasing|rent(al)? model|租赁|以租代售|即服务)/i], ['直营 DTC', /(direct[- ]to[- ]consumer|\bdtc\b|d2c|直营|品牌自营)/i], ['加盟/授权', /(franchis|licens(e|ing) model|加盟|特许经营)/i]];
const REGION_RE = { us: /\bu\.?s\.?\b|united states|america|silicon valley|美国/i, cn: /china|chinese|中国|国内/i, eu: /europe|\beu\b|germany|france|uk\b|欧洲|德国/i, in: /\bindia|印度/i, sea: /singapore|indonesia|vietnam|东南亚/i, jp: /japan|日本/i, latam: /brazil|mexico|latin america|拉美/i };

const DIMS = [
  ['demand_gap', '需求缺口', 'emotion-unhappy-line'], ['tech_transfer', '技术转化', 'flask-line'], ['geo_arbitrage', '地域套利/复制', 'earth-line'], ['policy', '政策与监管变化', 'government-line'],
  ['chokepoint', '产业链卡脖子/国产替代', 'git-branch-line'], ['capital', '资本流向', 'money-dollar-circle-line'], ['talent', '人才与招聘流向', 'user-search-line'], ['cost_curve', '价格/成本拐点', 'line-chart-line'],
  ['trend_accel', '趋势加速', 'rocket-2-line'], ['competitor_weak', '竞品弱点', 'sword-line'], ['platform', '平台生态', 'apps-2-line'], ['tender', '招标采购', 'auction-line'],
  ['trade', '贸易与进出口差异', 'ship-2-line'], ['model_transfer', '商业模式迁移', 'exchange-line'], ['substitute', '替代需求（迁移意图）', 'arrow-left-right-line'],
];
const DIMNAME = Object.fromEntries(DIMS.map(d => [d[0], d[1]]));

const AMZ = { 'Health and Household': '303010', 'Home and Kitchen': '252010', 'Electronics': '452020', 'Beauty and Personal Care': '303020', 'Baby Products': '303010', 'Pet Supplies': '303010', 'Toys and Games': '252020', 'Sports and Outdoors': '252020', 'Tools and Home Improvement': '201060', 'Automotive': '251010', 'Cell Phones and Accessories': '452020', 'Grocery and Gourmet Food': '302020', 'Office Products': '252010', 'Appliances': '252010' };
const GENERIC_T = new Set('large model models data based using via new'.split(' '));
function run({ signals: sigIn, opps, chain, macro, now = Date.now() / 1000 }) {
  const dimsMeta = {};
  const signals = sigIn.map(s => { if (s.source === "amazon_reviews") { const k = (s.title.match(/Amazon (.+?) 差评/) || [])[1]; if (AMZ[k]) return { ...s, ind: AMZ[k] }; } return s; });
  const FUNDRE = /raises|raised|series [a-e]\b|seed round|pre-seed|融资|轮融|获投|form d/i, fundSigs = signals.filter(s => s.kind === 'funding' || FUNDRE.test(s.title));
  const globalFund = o => { const ts = String(o.title).split(' · ').filter(w => w.length >= 3 && !GENERIC_T.has(w.toLowerCase())).slice(0, 2); return ts.length && fundSigs.filter(s => ts.some(w => s.title.toLowerCase().includes(w.toLowerCase()))).length >= 3; };
  const byId = new Map(signals.map(s => [s.id, s])), cards = [];
  const G = { n: signals.length, research: signals.filter(RESEARCH).length, product: signals.filter(PRODUCT).length, demand: signals.filter(s => DEMAND.has(s.source)).length, jobs: signals.filter(s => s.kind === 'jobs').length, policy: signals.filter(s => POLICY.has(s.source)).length, cn: signals.filter(CN).length };
  // v4.0 本地化检查（参照 geographic arbitrage「Don't just copy, adapt」：合规/文化/价格/需求验证）
  const LOC = (o) => { const ev = o.evidence || [], t = ev.map(x => (x.title || '') + ' ' + (x.text || '')).join(' ');
    return [{ k: '合规', q: '目标市场是否需要牌照/数据出境/内容审核？', hit: /(regulat|licen|compliance|监管|牌照|备案|合规|数据安全)/i.test(t) ? '证据中出现监管相关词，需重点核查' : '证据中未见监管信号（不代表无监管）' },
      { k: '文化/渠道', q: '获客渠道与使用习惯是否可迁移（支付、社交分发、线下）？', hit: '需人工判断' },
      { k: '价格', q: '目标市场客单价能否覆盖成本？是否需要改成高频低价？', hit: /(\$|usd|price|pricing|元|价格|收费)/i.test(t) ? '证据中有价格信息，可对比' : '证据中无价格信息' },
      { k: '需求验证', q: '目标市场是否已有人在用笨办法解决？', hit: o.metrics?.目标需求 || o.metrics?.目标行业需求信号 ? `目标侧需求信号 ${o.metrics.目标需求 || o.metrics.目标行业需求信号} 条` : '需访谈验证' }]; };
  const card = (dim, o) => cards.push({ dim, dimName: DIMNAME[dim], id: dim + ':' + (o.key || o.oppId), ...o, ...(dim === 'geo_arbitrage' || dim === 'model_transfer' ? { localize: LOC(o) } : {}), score: clamp(o.score) });
  for (const o of opps) { if (o.quality?.noise) continue; const m = (o.members || []).map(id => byId.get(id)).filter(Boolean); if (m.length < 5) continue;
    const base = { oppId: o.id, title: o.title, industry: o.industry, key: o.id };
    // 1 需求缺口
    const dem = m.filter(s => DEMAND.has(s.source)), sup = m.filter(PRODUCT);
    const demSrc = new Set(dem.map(s => s.source)), apps = new Set(dem.filter(s => s.source === 'appstore_reviews').map(s => s.title.split(' 差评')[0]));
    if (dem.length >= 4 && dem.length / (sup.length + 1) >= 2 && (demSrc.size >= 2 || (!demSrc.has('appstore_reviews') && dem.length >= 6)) && !(apps.size === 1 && dem.filter(s => s.source === 'appstore_reviews').length / dem.length > .6)) card('demand_gap', { ...base, score: 40 + 12 * L2(dem.length, sup.length) + Math.min(20, dem.length), metrics: { 需求信号: dem.length, 供给信号: sup.length, '需求/供给': +(dem.length / (sup.length + 1)).toFixed(1) }, rule: '需求信号≥4 且 需求/(供给+1)≥2', why: `${dem.length} 条吐槽/差评/求助，对应仅 ${sup.length} 个产品信号`, evidence: ev(dem) });
    // 2 技术转化
    const res = m.filter(s => RESEARCH(s) || CODE(s)), prod = m.filter(PRODUCT), gap = L2(res.length, prod.length) - L2(G.research + signals.filter(CODE).length, G.product);
    if (res.length >= 8 && gap >= 1) card('tech_transfer', { ...base, score: 40 + 15 * gap + Math.min(15, res.length / 3), metrics: { '论文+开源': res.length, 产品: prod.length, '相对落差 log2': +gap.toFixed(2) }, rule: '论文+开源≥8 且 相对全库基线的研究/产品落差≥1（2 倍）', why: `研究/开源 ${res.length} 条、产品仅 ${prod.length} 个，落差是全库平均的 ${(2 ** gap).toFixed(1)} 倍`, evidence: ev(res) });
    // 3 地域套利
    const mk = m.filter(s => ['news', 'funding', 'product', 'community', 'demand'].includes(s.kind)), cnMention = mk.filter(s => !CN(s) && /china|chinese|deepseek|alibaba|tencent|baidu|bytedance|huawei|xiaomi|byd|catl|qwen|kimi|moonshot/i.test(text(s))).length;
    const cn = mk.filter(CN).length + cnMention, en = mk.length - cn, validated = m.filter(s => s.kind === 'funding' || SUPPLY.has(s.source) || /raises|series [a-d]|seed/i.test(s.title)).length;
    const geo = L2(en, cn) - L2(G.n - G.cn, G.cn);
    if (mk.length >= 5 && validated >= 2 && Math.abs(geo) >= 1.5 && Math.min(en, cn) <= 3 && Math.max(en, cn) >= 8 && !(o.industry === '551050' || o.industry === '201040') ) card('geo_arbitrage', { ...base, score: 40 + 8 * Math.abs(geo) + Math.min(20, validated * 2), metrics: { 英文侧: en, 中文侧: cn, '验证信号(融资/产品)': validated, '偏离基线 log2': +geo.toFixed(2) }, rule: 'v4.0：已验证信号≥2 且 中英热度偏离全库基线≥2.8 倍 且 弱势一侧≤3 条、强势一侧≥8 条', why: geo > 0 ? `海外已有 ${validated} 个融资/产品验证，中文侧仅 ${cn} 条 → 可做中国版` : `中文侧已验证、海外仅 ${en} 条 → 可出海`, direction: geo > 0 ? '海外→中国' : '中国→海外', evidence: ev(m.filter(s => s.kind === 'funding' || SUPPLY.has(s.source)).concat(m)) });
    // 4 政策
    const pol = m.filter(s => POLICY.has(s.source) || (s.kind === 'policy' && !TENDER.has(s.source))), polR = m.filter(s => RE.policy.test(s.title));
    if (pol.length >= 3 && pol.length / m.length >= 1.5 * G.policy / G.n && pol.length / m.length <= .6 && polR.length >= 2) card('policy', { ...base, score: 45 + Math.min(30, pol.length * 2) + (pol.length < m.length ? 10 : 0), metrics: { 政策信号: pol.length, 占比: +(pol.length / m.length).toFixed(2), 全库占比: +(G.policy / G.n).toFixed(3) }, rule: '政策/监管信号≥3，占比≥全库 2 倍且≤60%（需同时有市场侧信号）', why: `${pol.length} 条法规/监管动态，同时有 ${m.length - pol.length} 条市场侧信号`, evidence: ev(pol) });
    // 6 资本
    const fund = m.filter(s => s.source !== 'sec_fts' && (s.source === 'sec_formd' || /raises|raised|series [a-e]|seed round|完成.{0,12}融资|获.{0,10}融资|[A-E]\+?轮|天使轮/i.test(s.title)));
    const generic = /融资|完成|亿元|投资|funding|raises/i.test(o.title);
    if (fund.length >= 4 && !generic) card('capital', { ...base, key: o.id + ':hot', score: 40 + Math.min(40, fund.length * 4), metrics: { 融资信号: fund.length, 簇规模: m.length }, rule: '簇内融资事件/Form D ≥4（30 天）', why: `近 30 天 ${fund.length} 起融资/备案，资本密集`, sub: '融资密集', evidence: ev(fund) });
    else if (fund.length === 0 && !globalFund(o) && dem.length + m.filter(s => s.kind === 'community').length >= 10 && m.length >= 15) card('capital', { ...base, key: o.id + ':gap', score: 45 + Math.min(30, m.length / 2), metrics: { 融资信号: 0, '需求+讨论': dem.length + m.filter(s => s.kind === 'community').length }, rule: '融资信号=0 且 需求+社区讨论≥10', why: '讨论与需求旺盛但 30 天内无融资事件 → 资本空白', sub: '资本空白', evidence: ev(m) });
    // 7 人才
    const jobs = m.filter(s => s.kind === 'jobs'), jr = jobs.length / m.length / (G.jobs / G.n || 1);
    if (jobs.length >= 6 && jr >= 2 && jobs.length / m.length <= .7) card('talent', { ...base, score: 40 + Math.min(30, jobs.length * 2) + Math.min(15, jr * 3), metrics: { 招聘: jobs.length, '相对全库倍数': +jr.toFixed(1), 雇主数: new Set(jobs.map(j => (j.meta || {}).company || j.title.split('@')[1])).size }, rule: '招聘≥6，占比≥全库 2 倍且≤70%（排除纯招聘簇）', why: `${jobs.length} 个岗位集中出现，是全库平均密度的 ${jr.toFixed(1)} 倍`, evidence: ev(jobs) });
    // 8 成本拐点
    // 9 趋势加速
    const t = o.ts || {}; if (!t.oneoff && !o.seasonal && t.w3 > 0 && t.w2 > 0 && new Set(m.filter(s => s.ts < now - 14 * 86400).map(s => s.source)).size >= 2 && t.w1 > t.w2 && t.w2 >= t.w3 && t.accel > 0 && m.length >= 10 && t.w1 >= 1.5 * (t.w3 || .01)) card('trend_accel', { ...base, score: 45 + Math.min(30, t.accel / 2) + Math.min(15, m.length / 5), metrics: { '近7天‰': t.w1, '前7天‰': t.w2, '再前7天‰': t.w3, 加速度: t.accel }, rule: '归一化热度连续两周上升、近 7 天≥3 周前 1.5 倍、非一次性/季节性、≥10 条', why: `热度 ${t.w3}‰ → ${t.w2}‰ → ${t.w1}‰ 连续加速`, evidence: ev(m.filter(s => s.ts > now - 7 * 86400)) });
    // 11 平台生态
    const plat = m.filter(s => ['news', 'community', 'product'].includes(s.kind) && RE.platform.test(s.title));
    if (plat.length >= 2) card('platform', { ...base, score: 45 + Math.min(40, plat.length * 8), metrics: { 平台开放信号: plat.length }, rule: '簇内≥2 条新 API/SDK/插件市场/MCP 发布', why: '新平台/接口开放，可在其生态上构建插件、工具或服务', evidence: ev(plat) });
  }
  // 5 卡脖子 / 国产替代（产业链节点）
  for (const [code, ch] of Object.entries(chain?.chains || {})) for (const n of ch.nodes) { if (!n.top?.length) continue; const t = n.top[0], cnS = n.top.find(x => /^China$/.test(x.country))?.share || 0;
    if (t.share >= .5 || n.hhi >= 2500) { const sub = /China/.test(t.country) ? '供应集中于中国（海外寻求多元化/近岸替代）' : `中国依赖 ${t.country}（国产替代空间）`;
      card('chokepoint', { key: code + ':' + n.name, title: `${ch.name} · ${n.stage} · ${n.name}`, industry: code, score: 40 + (t.share * 40) + Math.min(20, n.hhi / 500), metrics: { 第一大国: t.country, 份额: +(t.share * 100).toFixed(0) + '%', HHI: n.hhi, 中国份额: +(cnS * 100).toFixed(0) + '%', 同比: n.growth }, rule: '单一国家份额≥50% 或 HHI≥2500', why: sub, sub: /China/.test(t.country) ? '供应链多元化' : '国产替代', evidence: [{ title: `${n.name} 出口/产量国别份额（${n.src}）`, url: n.url, source: n.src }] }); } }
  // 10 竞品弱点：大应用差评聚集 + 新闻中的关停/涨价/收购
  const rev = {}; for (const s of signals) if (s.source === 'appstore_reviews' && !/#\w+#|#\w+|tiktok pro|follow me|seguidores|^(\S+\s?){0,2}$/i.test(s.title.split('：').slice(1).join('：')) && ((s.text || '').length >= 40 || s.title.length >= 40)) { const app = s.title.split(' 差评')[0]; (rev[app] ||= []).push(s); }
  const top = new Set(signals.filter(s => s.source === 'appstore').map(s => (s.title.match(/：(.+?)（/) || [])[1]).filter(Boolean).map(x => x.split(':')[0].trim()));
  for (const [app, rs] of Object.entries(rev)) if (rs.length >= 5) { const big = [...top].some(x => app.startsWith(x.slice(0, 12))); card('competitor_weak', { key: 'app:' + app, title: `${app} 用户差评聚集`, industry: rs[0].ind, score: 40 + Math.min(30, rs.length * 2) + (big ? 15 : 0), metrics: { '1–2★ 差评': rs.length, 榜单应用: big ? '是' : '否' }, rule: '同一应用 1–2★ 差评≥5（榜单应用加分）', why: `用户集中抱怨：${rs.slice(0, 3).map(r => r.title.split('：').slice(1).join('：').slice(0, 30)).join(' / ')}`, sub: '大厂差评', evidence: ev(rs) }); }
  const weakNews = signals.filter(s => ['news', 'community'].includes(s.kind) && RE.weak.test(s.title) && !/^(EU 招标|政府采购)/.test(s.title));
  const ent = {}; for (const s of weakNews) { const e = (s.title.match(/^([A-Z][\w.&-]+(?: [A-Z][\w.&-]+)?)/) || s.title.match(/^([\u4e00-\u9fa5A-Za-z0-9]{2,10}?)(?:宣布|将|被|拟|已|正式)/) || [])[1]; if (e && e.length > 2 && !/^(The|How|Why|What|This|New|AI|US)$/i.test(e)) (ent[e] ||= []).push(s); }
  for (const [e, ss] of Object.entries(ent)) if (ss.length >= 2 || new Set(ss.map(s => s.source)).size >= 1 && /shut|discontinu|停服|下线|涨价|price hike/i.test(ss[0].title)) card('competitor_weak', { key: 'news:' + e, title: `${e}：${(ss[0].title.match(RE.weak) || [''])[0]}`, industry: ss[0].ind, score: 45 + Math.min(30, ss.length * 10), metrics: { 相关报道: ss.length }, rule: '同一公司出现关停/涨价/收购/裁员等事件', why: '大厂/竞品变动留下用户与市场空白', sub: '关停/涨价/并购', evidence: ev(ss) });

  const STW = new Set('this that they have with were what when your them there would like from does dont will than only about after again work works working bought time months month days great good review stars product amazon just very first even into been more much also could should because which these those then their other some really well over make made used using back still never ever item items'.split(' '));
  const topTerms = ss => { const c = {}; for (const s of ss) for (const w of ((s.title.split('：')[1] || s.title) + ' ' + (s.text || '').slice(0, 300)).toLowerCase().match(/[a-z]{4,}/g) || []) if (!STW.has(w)) c[w] = (c[w] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]); };
  // 1b 需求缺口（子行业级）：非评论类需求（吐槽/求助/求推荐）多而产品少
  const di = {}; for (const s of signals) if (s.ind) { const x = di[s.ind] ||= { d: [], p: 0 }; if (['reddit_pain', 'reddit_archive', 'stackexchange', 'amazon_reviews', 'tousu_sina'].includes(s.source)) x.d.push(s); if (PRODUCT(s)) x.p++; }
  for (const [ind, x] of Object.entries(di)) if (x.d.length >= 5 && x.d.length / (x.p + 1) >= 1.5 && new Set(x.d.map(s => s.source)).size >= 1) card('demand_gap', { key: 'ind:' + ind, title: `${IND[ind]?.cn || ind}：用户痛点多、产品少`, industry: ind, score: (s0 => new Set(x.d.map(s => s.source)).size === 1 && x.d[0].source === 'amazon_reviews' ? Math.min(68, s0) : s0)(40 + 10 * L2(x.d.length, x.p) + Math.min(20, x.d.length)), metrics: { 痛点信号: x.d.length, 产品信号: x.p, '痛点/产品': +(x.d.length / (x.p + 1)).toFixed(1), 来源: [...new Set(x.d.map(s => s.source))].join('/') }, rule: '子行业内吐槽/求助/差评（不含 App 评论）≥5 且 痛点/(产品+1)≥1.5；仅来自 Amazon 历史评论时封顶 68 分（单一历史源，时效弱）', why: '高频抱怨词：' + topTerms(x.d).join('、'), evidence: ev(x.d.sort((a, b) => (b.engagement || 0) - (a.engagement || 0))) });
  // 9b 趋势加速（实体级）：开发者生态下载量 / 维基浏览量的环比加速
  for (const s of signals) if (['pypi', 'npm', 'wikipv'].includes(s.source)) { const g = +(s.title.match(/(?:环比|相对月均) ?([+-]\d+)%/) || [])[1], vol = +((s.title.match(/(?:周下载|浏览) ([\d,]+)/) || [])[1] || '0').replace(/,/g, '');
    const min = s.source === 'wikipv' ? 500 : 100000; if (g >= 15 && g <= 500 && vol >= min) { const name = (s.title.match(/(?:npm|PyPI) ([\w@/.-]+)：/) || s.title.match(/「(.+?)」/) || [])[1] || s.title.slice(0, 30);
      card('trend_accel', { key: 'ent:' + s.source + ':' + name, title: `${name} 关注度加速（${s.source === 'wikipv' ? '维基浏览' : '周下载'} ${g > 0 ? '+' : ''}${g}%）`, industry: s.ind || '451030', score: 40 + Math.min(30, g) + Math.min(20, Math.log10(vol) * 3), metrics: { 环比: g + '%', 量级: vol.toLocaleString(), 来源: s.source }, rule: '下载量/浏览量环比≥15%（≤500% 视为异常剔除），且周下载≥10 万或维基周浏览≥500', why: s.title.split('— ')[1]?.slice(0, 80) || '关注度在放量基础上继续加速', evidence: ev([s]) }); } }
  // 10b 竞品弱点（中文）：黑猫投诉同一商家≥3 条 → 集中投诉问题即切入点
  // v2.5 商家→行业映射：投诉信号常无行业标签，按商家名规则归类（规则表见 CO_IND，未命中保持未分类，不硬标）
  for (const s of signals) if (s.source === 'tousu_sina' && s.company && !s.ind) { const m = CO_IND.find(([re]) => re.test(s.company)); if (m) s.ind = m[1]; }
  const tc = {}; for (const s of signals) if (s.source === 'tousu_sina' && s.company) (tc[s.company] ||= []).push(s);
  // v2.6 中文需求缺口：同类问题跨 ≥2 个商家、≥4 条投诉 → 行业共性痛点（而非单一商家问题）
  const ti = {}; for (const s of signals) if (s.source === 'tousu_sina') { const i = s.issue || ((s.text || '').match(/问题：(\S+)/) || [])[1]; if (i) for (const k of String(i).split(/[,，、]/).map(x => x.trim()).filter(Boolean)) (ti[k] ||= []).push(s); }
  for (const [iss, ss] of Object.entries(ti)) { const cos = new Set(ss.map(s => s.company).filter(Boolean)); if (ss.length >= 4 && cos.size >= 2) { const ic = {}; ss.forEach(s => s.ind && (ic[s.ind] = (ic[s.ind] || 0) + 1)); const ind = Object.entries(ic).sort((a, b) => b[1] - a[1])[0]; card('demand_gap', { key: 'tousu-issue:' + iss, title: `中文消费者共性痛点：${iss}`, industry: ind && cos.size <= 3 && ind[1] / ss.length >= .6 ? ind[0] : null, score: 40 + Math.min(30, ss.length * 3) + Math.min(15, cos.size * 3), metrics: { 投诉数: ss.length, 涉及商家: cos.size, 商家: [...cos].slice(0, 5).join('、') }, rule: '黑猫投诉同一问题类型 ≥4 条且跨 ≥2 个商家', why: ss.slice(0, 2).map(s => s.title.split('：').slice(1).join('：').slice(0, 36)).join('；'), sub: '中文投诉问题聚合', evidence: ev(ss) }); } }
  for (const [co, ss] of Object.entries(tc)) if (ss.length >= 3) { const iss = {}; ss.forEach(s => { const i = s.issue || ((s.text || '').match(/问题：(\S+)/) || [])[1]; i && (iss[i] = (iss[i] || 0) + 1); }); const top = Object.entries(iss).sort((a, b) => b[1] - a[1]).slice(0, 3);
    card('competitor_weak', { key: 'tousu:' + co, title: `${co}：消费者投诉集中`, industry: ss.find(s => s.ind)?.ind || null, score: 45 + Math.min(30, ss.length * 4) + Math.min(10, Math.log10(1 + ss.reduce((a, s) => a + (s.engagement || 0), 0)) * 3), metrics: { 投诉数: ss.length, 主要问题: top.map(x => x[0] + '×' + x[1]).join('、') || '—', 互动: ss.reduce((a, s) => a + (s.engagement || 0), 0) }, rule: '黑猫投诉同一商家≥3 条（近期公开投诉列表）', why: ss.slice(0, 2).map(s => s.title.split('：').slice(1).join('：').slice(0, 40)).join('；'), sub: '中文消费者投诉', evidence: ev(ss) }); }
  // 11b 平台生态（按平台实体聚合）
  const PLAT = [['MCP（Model Context Protocol）', /\bmcp\b|model context protocol/i], ['Agent Skills / AGENTS.md', /skill\.md|agents\.md|agent skills/i], ['GPT Store / ChatGPT Apps', /gpt store|chatgpt apps?|apps in chatgpt/i], ['微信小程序/开放平台', /小程序|开放平台/], ['浏览器/编辑器扩展', /(vs ?code|chrome|figma) (extension|plugin)/i], ['Shopify 应用生态', /shopify app/i]];
  for (const [pn, re] of PLAT) { const ss = signals.filter(s => re.test(s.title + ' ' + (s.text || '').slice(0, 200))); const src = new Set(ss.map(s => s.source)).size;
    if (ss.length >= 3 && src >= 2) card('platform', { key: 'plat:' + pn, title: `${pn} 生态扩张`, industry: '451030', score: 40 + Math.min(30, ss.length * 2) + Math.min(20, src * 4), metrics: { 相关信号: ss.length, 来源数: src, 'npm/GitHub 项目': ss.filter(s => s.kind === 'code').length, 新产品: ss.filter(s => s.kind === 'product').length }, rule: '同一平台/协议在≥2 个来源、≥3 条信号中出现（新 API、SDK、插件、服务器）', why: '平台接口开放带来工具、托管、安全、市场等配套机会', evidence: ev(ss) }); }
  // 4b 政策（子行业级）：同一子行业近 30 天出现≥4 条含法规关键词的政策/监管信号（≥2 个来源），且该行业有市场侧信号≥5
  const pi = {}; for (const s of signals) if (s.ind && s.ind !== '201070' && (POLICY.has(s.source) || (s.kind === 'policy' && !TENDER.has(s.source))) && RE.policy.test(s.title) && !/information collection|sunshine act|meeting|hearing|comment request|收集|会议/i.test(s.title) && !/^\[notice\]/i.test(s.title)) (pi[s.ind] ||= []).push(s);
  const mk = {}; for (const s of signals) if (s.ind && ['news', 'funding', 'product', 'community'].includes(s.kind)) mk[s.ind] = (mk[s.ind] || 0) + 1;
  for (const [ind, ss] of Object.entries(pi)) { const src = new Set(ss.map(s => s.source)).size; if (ss.length >= 4 && src >= 2 && (mk[ind] || 0) >= 5) card('policy', { key: 'pind:' + ind, title: `${IND[ind]?.cn || ind}：监管/政策密集变化`, industry: ind, score: 45 + Math.min(30, ss.length * 3) + Math.min(10, src * 3), metrics: { 法规信号: ss.length, 来源数: src, 市场信号: mk[ind] || 0 }, rule: '同一子行业≥4 条含法规关键词（条例/办法/标准/补贴/mandate/rule…）的政策信号，≥2 个来源，且市场信号≥5', why: ss.slice(0, 2).map(s => s.title.slice(0, 40)).join('；'), sub: '合规与新准入需求', evidence: ev(ss) }); }
  // 8 成本拐点（按子行业聚合）
  const cb = {}; for (const s of signals) if (s.ind && ['news', 'research', 'community'].includes(s.kind) && RE.cost.test(s.title)) (cb[s.ind] ||= []).push(s);
  for (const [ind, ss] of Object.entries(cb)) if (ss.length >= 3 || (ss.length >= 2 && new Set(ss.map(s => s.source)).size >= 2)) card('cost_curve', { key: 'cost:' + ind, title: `${IND[ind]?.cn || ind}：价格/成本下降信号`, industry: ind, score: 45 + Math.min(40, ss.length * 6), metrics: { 降本信号: ss.length, 来源数: new Set(ss.map(s => s.source)).size }, rule: '同一子行业≥3 条（或≥2 条且≥2 个来源）出现降价/成本下降表述', why: ss.slice(0, 2).map(s => s.title.slice(0, 50)).join('；'), evidence: ev(ss) });
  // 12 招标采购：按行业聚合
  const tb = {}; for (const s of signals) if (TENDER.has(s.source) && s.ind && s.ind !== '201070' && !/熟妇|在线看|成人|av|色情|彩票/i.test(s.title) && /招标|采购|中标|集采|tender|EPC|EU 招标|政府采购/i.test(s.title)) (tb[s.ind] ||= []).push(s);
  for (const [ind, ss] of Object.entries(tb)) if (ss.length >= 5) { const recent = ss.filter(s => s.ts > now - 14 * 86400).length; card('tender', { key: 'tender:' + ind, title: `${IND[ind]?.cn || ind} 招标采购集中`, industry: ind, score: 40 + Math.min(35, ss.length) + Math.min(15, recent), metrics: { 招标: ss.length, '近14天': recent, 区域: [...new Set(ss.map(s => s.source === 'ted' ? '欧盟' : s.source === 'samgov' ? '美国' : '中国'))].join('/') }, rule: '同一子行业 30 天内招标/中标≥5 条', why: `政府/国企采购需求集中：${ss.slice(0, 2).map(s => s.title.slice(0, 40)).join('；')}`, evidence: ev(ss) }); }
  // 13 贸易差异：产业链节点中国出口增速 vs 全球增速；Comtrade HS2 中国出口高增长
  const seenHs = new Set(); for (const [code, ch] of Object.entries(chain?.chains || {})) for (const n of ch.nodes) if (!seenHs.has(n.cnExport + ":" + n.cnGrowth) && seenHs.add(n.cnExport + ":" + n.cnGrowth) && n.cnGrowth != null && n.growth != null && Math.abs(n.cnGrowth - n.growth) >= 20 && n.total > 1e9 && (n.cnExport || 0) >= Math.max(3e8, 0.03 * n.total)) card('trade', { key: 'node:' + n.name, title: `${n.name}：中国出口 ${n.cnGrowth > 0 ? '+' : ''}${n.cnGrowth}% vs 全球 ${n.growth}%`, industry: code, score: 40 + Math.min(40, Math.abs(n.cnGrowth - n.growth) / 3), metrics: { 中国出口: '$' + ((n.cnExport || 0) / 1e9).toFixed(2) + 'B', 中国出口同比: n.cnGrowth + '%', 全球同比: n.growth + '%', 全球规模: '$' + (n.total / 1e9).toFixed(1) + 'B' }, rule: '中国出口增速与全球增速相差≥20 个百分点且全球规模≥$1B', why: n.cnGrowth > n.growth ? '中国份额快速上升：出海/替代窗口' : '中国份额下滑：产能转移或贸易壁垒', evidence: [{ title: `${n.name} HS ${n.hs?.join(',')}（Comtrade + OEC）`, url: n.url, source: 'comtrade' }] });
  for (const r of macro?.comtrade?.rows || []) if (r.g >= 30 && r.v >= 5e9 && !/^9[89]$/.test(String(r.hs))) card('trade', { key: 'hs2:' + r.hs, title: `中国 HS${r.hs} 出口同比 +${r.g}%`, industry: null, score: 40 + Math.min(40, r.g / 2), metrics: { 出口额: '$' + (r.v / 1e9).toFixed(1) + 'B', 同比: r.g + '%' }, rule: 'HS 两位章中国出口同比≥30% 且规模≥$5B', why: '出口高增长品类：上下游配套与出海服务机会', evidence: [{ title: macro.comtrade.name, url: 'https://comtradeplus.un.org/', source: 'comtrade' }] });
  // v4.0 行业级地域套利：同一行业里，一侧已有≥5 条融资/产品验证、另一侧≤1 条（按全库中英比例校正）
  { const V = {}; let tE = 0, tC = 0; for (const s of signals) if (s.ind && (s.kind === 'funding' || s.kind === 'product' || /raises|series [a-d]|融资/i.test(s.title))) { const v = (V[s.ind] ||= { en: [], cn: [] }); (CN(s) ? (tC++, v.cn) : (tE++, v.en)).push(s); }
    // v4.5 来源配比校正：先看弱势一侧的来源到底有没有覆盖这个行业（全部信号类型），覆盖不足 = 来源缺口，不是市场空白
    const ALL = {}; for (const s of signals) if (s.ind) { const a = (ALL[s.ind] ||= { en: 0, cn: 0, enS: new Set(), cnS: new Set() }); if (CN(s)) { a.cn++; a.cnS.add(s.source); } else { a.en++; a.enS.add(s.source); } }
    // 「能产出验证信号的来源」（融资/产品类源）在弱势一侧是否也在报道这个行业——否则弱势侧 0 条只是没人报
    // 按语言分别统计验证类来源：在该语言一侧产出过 ≥5 条验证信号的来源（不跨语言借用）
    const VSc = { en: {}, cn: {} }; for (const vv of Object.values(V)) { for (const x of vv.en) VSc.en[x.source] = (VSc.en[x.source] || 0) + 1; for (const x of vv.cn) VSc.cn[x.source] = (VSc.cn[x.source] || 0) + 1; }
    const VS = { en: new Set(Object.keys(VSc.en).filter(k => VSc.en[k] >= 5)), cn: new Set(Object.keys(VSc.cn).filter(k => VSc.cn[k] >= 5)) };
    const VI = {}; for (const s of signals) if (s.ind) { const side = CN(s) ? 'cn' : 'en'; if (VS[side].has(s.source)) { const a = (VI[s.ind] ||= { en: 0, cn: 0 }); a[side]++; } }
    const srcGap = []; dimsMeta.srcGap = srcGap;
    const r = (tC + 1) / (tE + 1); let k = 0;
    for (const [ind, v] of Object.entries(V).sort((a, b) => (b[1].en.length + b[1].cn.length) - (a[1].en.length + a[1].cn.length))) { if (k >= 6 || ind === '551050' || ind === '201040') continue;
      const expCn = v.en.length * r, expEn = v.cn.length / r;
      const A = ALL[ind] || { en: 0, cn: 0, enS: new Set(), cnS: new Set() }, shE = v.en.length / Math.max(1, A.en), shC = v.cn.length / Math.max(1, A.cn);
      const vi = VI[ind] || { en: 0, cn: 0 };
      if (v.en.length >= 5 && v.cn.length <= 1 && (A.cn < 15 || A.cnS.size < 2 || vi.cn < 8)) { srcGap.push({ ind, weak: '中文', all: A.cn, sources: A.cnS.size, valSrcSignals: vi.cn }); continue; }
      if (v.cn.length >= 5 && v.en.length <= 1 && (A.en < 15 || A.enS.size < 2 || vi.en < 8)) { srcGap.push({ ind, weak: '英文', all: A.en, sources: A.enS.size, valSrcSignals: vi.en }); continue; }
      if (v.en.length >= 5 && v.cn.length <= 1 && expCn >= 2 && shE >= 3 * shC) { k++; card('geo_arbitrage', { key: 'ind:' + ind + ':cn', title: `${IND[ind]?.cn || ind}：海外已验证，中文侧几乎空白`, industry: ind, score: 45 + Math.min(25, v.en.length * 2) + Math.round(Math.min(10, expCn)), metrics: { 英文侧验证: v.en.length, 中文侧验证: v.cn.length, 按基线应有中文: +expCn.toFixed(1), 中文侧该行业信号: A.cn, 中文侧来源数: A.cnS.size }, rule: 'v4.5 行业级：英文验证≥5、中文≤1；中文侧该行业信号≥15、来源≥2、融资/产品类来源在该行业≥8 条（排除来源缺口）；英文验证占比≥中文 3 倍', why: `海外 ${v.en.length} 条融资/产品验证，中文侧 ${v.cn.length} 条（按基线应约 ${expCn.toFixed(1)}）`, direction: '海外→中国', sub: '行业级', evidence: ev(v.en) }); }
      else if (v.cn.length >= 5 && v.en.length <= 1 && expEn >= 2 && shC >= 3 * shE) { k++; card('geo_arbitrage', { key: 'ind:' + ind + ':en', title: `${IND[ind]?.cn || ind}：中文侧已验证，海外几乎空白`, industry: ind, score: 45 + Math.min(25, v.cn.length * 2) + Math.round(Math.min(10, expEn)), metrics: { 中文侧验证: v.cn.length, 英文侧验证: v.en.length, 按基线应有英文: +expEn.toFixed(1), 英文侧该行业信号: A.en, 英文侧来源数: A.enS.size }, rule: 'v4.5 行业级：中文验证≥5、英文≤1；英文侧该行业信号≥15、来源≥2、融资/产品类来源在该行业≥8 条（排除来源缺口）；中文验证占比≥英文 3 倍', why: `中文侧 ${v.cn.length} 条验证、海外 ${v.en.length} 条 → 可出海`, direction: '中国→海外', sub: '行业级', evidence: ev(v.cn) }); } } }
  // 14 商业模式迁移：模式在≥3 个行业已被融资/产品验证，但在需求旺盛的行业中几乎没有
  const mi = {}; for (const s of signals) if (s.ind && (s.kind === 'funding' || s.kind === 'product' || /raises|融资/i.test(s.title))) for (const [mn, re] of MODELS) if (re.test(text(s))) ((mi[mn] ||= {})[s.ind] ||= []).push(s);
  const demInd = {}, demSrc = {}, mkt = {}; for (const s of signals) if (s.ind) { if ((DEMAND.has(s.source) || s.kind === 'community') && s.source !== 'amazon_reviews') { demInd[s.ind] = (demInd[s.ind] || 0) + 1; (demSrc[s.ind] ||= new Set()).add(s.source); } if (s.kind === 'funding' || s.kind === 'product') mkt[s.ind] = (mkt[s.ind] || 0) + 1; }
  // v4.6：融资标题很少点名商业模式（诊断：15 个模式里只有 4 个在 ≥2 个行业有融资/产品验证），改为两级证据——
  // 已验证 = 融资/产品命中 ≥3 条；或任意类型命中 ≥10 条且覆盖 ≥2 个行业（「被广泛讨论」，卡片上标注为弱验证）
  const ma = {}; for (const s of signals) if (s.ind) for (const [mn, re] of MODELS) if (re.test(text(s))) ((ma[mn] ||= {})[s.ind] ||= []).push(s);
  for (const mn of Object.keys(ma)) mi[mn] ||= {};
  for (const [mn, byInd] of Object.entries(mi)) { const vN = Object.values(byInd).reduce((a, x) => a + x.length, 0), aI = Object.entries(ma[mn] || {}), aN = aI.reduce((a, [, x]) => a + x.length, 0);
    const strong = vN >= 3 && Object.keys(byInd).length >= 1, weak = !strong && aN >= 10 && aI.length >= 2; if (!strong && !weak) continue;
    const proven = strong ? Object.entries(byInd) : aI; const vLevel = strong ? '融资/产品验证' : '弱验证（仅讨论热度）'; byInd.__any = ma[mn] || {}; // v3.5：2 个已验证行业即可（原 3 在当前库上几乎永远为 0）
    if (process.env.SR_MTDBG === 'x') console.error('MT', mn, strong, weak, vN, aN, Object.entries(demInd).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([ind, d]) => [ind, d, demSrc[ind]?.size, mkt[ind] || 0, byInd[ind]?.length || 0, (byInd.__any[ind] || []).length].join('/')).slice(0, 8).join(' '));
    let nT = 0; for (const [ind, d] of Object.entries(demInd).sort((a, b) => b[1] - a[1]).slice(0, 25)) if (d >= 3 && demSrc[ind]?.size >= 1 && (mkt[ind] || 0) >= 2 && !(byInd[ind]?.length) && !((byInd.__any[ind] || []).length >= 3) && !(/^(451030|502030|451020)$/.test(ind) && /双边|订阅|按量/.test(mn)) && nT++ < 3) card('model_transfer', { key: mn + ':' + ind, title: `把「${mn}」迁移到${IND[ind]?.cn || ind}`, industry: ind, score: (strong ? 40 : 30) + Math.min(strong ? 25 : 8, proven.length * 4) + Math.min(20, d / 5), metrics: { 已验证行业数: proven.length, 验证等级: vLevel, 模式融资产品信号: vN, 模式全部信号: aN, 目标行业需求信号: d, 目标行业该模式信号: (byInd.__any[ind] || []).length }, rule: '模式在≥3 个行业各有≥2 条融资/产品验证；目标行业近期需求+讨论≥5 条（≥2 个来源，不含历史评论）、已有≥3 条融资/产品（市场活跃），但该模式 0 条', why: `已在 ${proven.slice(0, 3).map(([i]) => IND[i]?.cn).join('、')} 跑通`, evidence: ev(proven.flatMap(([, a]) => a), 4) }); }
  // v3.5 簇级迁移：标题/主题词明确命中模式；源行业对该模式已有≥2 条融资或产品信号（mi 表）；目标行业有需求、几乎无同模式
  for (const o of opps) { if (!o.industry || o.quality?.noise) continue; const lab = (o.title + ' ' + (o.terms || []).join(' '));
    const evT = (o.evidence || []).map(e => e.title || '');
    for (const [mn, re] of MODELS) { if (!re.test(lab) && evT.filter(t => re.test(t)).length < 2) continue; /* v4.6：标题/主题词命中，或 ≥2 条证据标题命中 */ const srcHits = mi[mn]?.[o.industry]?.length || 0; if (srcHits < 2 && ((o.fundings || []).length + (o.kinds?.product || 0)) < 3) continue;
      const fundN = Math.max(srcHits, (o.fundings || []).length); let nT = 0;
      for (const [ind, d] of Object.entries(demInd).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
        if (ind === o.industry || d < 3 || (mkt[ind] || 0) < 1 || (mi[mn]?.[ind]?.length)) continue;
        // 避免把软件模式硬迁到完全无关的制造业，除非目标行业需求 ≥8
        const soft = /SaaS|订阅|Agent|按量|双边|开放核心|垂直/.test(mn), hard = /^(15|20|25|30)/.test(String(IND[ind]?.sector || ''));
        if (soft && hard && d < 8) continue;
        card('model_transfer', { key: 'opp:' + mn + ':' + ind + ':' + o.id, title: `把「${mn}」从${IND[o.industry]?.cn || o.industry}迁到${IND[ind]?.cn || ind}`, industry: ind, score: 42 + Math.min(20, d) + Math.min(15, fundN * 2), metrics: { 源行业模式信号: srcHits, 源簇融资: (o.fundings || []).length, 目标需求: d, 模式: mn, 源簇: o.title.slice(0, 40) }, rule: '簇标题命中模式 + 源行业有验证信号 + 目标行业有≥3 条非 Amazon 需求且几乎无同模式', why: o.title.slice(0, 60), sub: '簇级迁移', evidence: (o.evidence || []).slice(0, 4), oppId: o.id }); if (++nT >= 1) break; } } }
  // 15 替代需求：「X alternative」意图
  const alt = {}; for (const s of signals) if (RE.alt.test(s.title)) { const x = (s.title.match(/alternatives? (?:to|for) ([\w .&+-]{2,30}?)(?:[?,.!:]|$| for | that | with )/i) || s.title.match(/(?:replace|switch(?:ing)? from|moving away from) ([\w .&+-]{2,25}?)(?:[?,.!:]| to |$)/i) || s.title.match(/([\u4e00-\u9fa5A-Za-z0-9]{2,12})的?(?:替代品|平替)/) || [])[1]; if (x && !/^(r\/|this|it|that|the app|an app)$/i.test(x.trim())) (alt[x.trim().toLowerCase()] ||= []).push(s); }
  for (const [x, ss] of Object.entries(alt)) if ((ss.length >= 2 || ss.some(s => (s.engagement || 0) >= 20 || s.kind === 'product' || s.kind === 'funding')) && x.split(' ').length <= 4) card('substitute', { key: 'alt:' + x, title: `用户在找「${x}」的替代品`, industry: ss[0].ind, score: 40 + Math.min(40, ss.length * 15 + Math.log10(1 + ss.reduce((a, s) => a + (s.engagement || 0), 0)) * 5), metrics: { 求替代帖: ss.length, 互动: Math.round(ss.reduce((a, s) => a + (s.engagement || 0), 0)) }, rule: '标题含「alternative to / switch from / 替代品 / 平替」并能识别出被替代对象', why: '明确的迁移意图 = 现成的获客入口', evidence: ev(ss) });

  // 多维加权：同一语义簇命中多个维度
  const byOpp = {}; for (const c of cards) if (c.oppId) (byOpp[c.oppId] ||= new Set()).add(c.dim);
  for (const c of cards) { const k = c.oppId ? byOpp[c.oppId].size : 1; c.dimsHit = c.oppId ? [...byOpp[c.oppId]] : [c.dim]; c.multi = k; c.final = clamp(c.score + 8 * (k - 1)); c.sector = IND[c.industry]?.sector || '—'; c.sectorCn = IND[c.industry]?.sectorCn || '未分类'; c.sectorEn = IND[c.industry]?.sectorEn || 'Unclassified'; c.industryName = IND[c.industry]?.cn || '未分类'; c.industryNameEn = IND[c.industry]?.en || 'Unclassified'; }
  cards.sort((a, b) => b.final - a.final);
  { const seen = new Set(), keep = cards.filter(c => { const k = c.dim + '|' + c.title; if (seen.has(k)) return false; seen.add(k); return true; }); cards.length = 0; cards.push(...keep); } // v4.6 同维度同标题去重（保留高分）
  const matrix = {}; for (const c of cards) { const k = c.dim + '|' + c.sector; matrix[k] = (matrix[k] || 0) + 1; }
  return { ts: Date.now(), srcGap: dimsMeta.srcGap || [], dims: DIMS, cards, matrix, oppDims: Object.fromEntries(Object.entries(byOpp).map(([k, v]) => [k, [...v]])), counts: Object.fromEntries(DIMS.map(([d]) => [d, cards.filter(c => c.dim === d).length])) };
}
module.exports = { run, DIMS, DIMNAME };
