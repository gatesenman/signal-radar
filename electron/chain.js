// 产业链 / 行业统计 / 论文 数据源
const { SOURCES: S, UNAVAILABLE, get, sleep, UA } = require('./collectors');
const add = (id, meta, fetch) => { S[id] = { id, ...meta, fetch }; };
const now = () => Math.floor(Date.now() / 1000), tsOf = d => { const t = Math.floor(new Date(d).getTime() / 1000); return isNaN(t) ? now() : t; };
const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- 产业链定义：GICS 子行业 → 上/中/下游节点（HS6 或 USGS 矿种） ----------
const CHAINS = {
  '453010': { name: '半导体', nodes: [['上游', '高纯硅/多晶硅', ['280461']], ['上游', '镓/锗等稀有金属', [], 'Gallium'], ['上游', '半导体制造设备', ['848620']], ['中游', '集成电路（处理器/控制器）', ['854231']], ['中游', '存储芯片', ['854232']], ['下游', '智能手机', ['851713']], ['下游', '便携计算机', ['847130']]] },
  '551050': { name: '光伏与储能', nodes: [['上游', '多晶硅', ['280461']], ['上游', '锂', [], 'Lithium'], ['上游', '钴', [], 'Cobalt'], ['中游', '光伏电池/组件', ['854142', '854143']], ['中游', '锂离子电池', ['850760']], ['下游', '逆变器/静态变流器', ['850440']]] },
  '251020': { name: '新能源汽车', nodes: [['上游', '锂', [], 'Lithium'], ['上游', '石墨', [], 'Graphite'], ['上游', '稀土（永磁）', [], 'Rare earths'], ['中游', '锂离子电池', ['850760']], ['中游', '电机', ['850152']], ['下游', '纯电动乘用车', ['870380']]] },
  '201060': { name: '机器人与工业自动化', nodes: [['上游', '稀土（永磁）', [], 'Rare earths'], ['上游', '轴承', ['848210']], ['中游', '伺服电机', ['850152']], ['中游', '工业机器人', ['847950']], ['下游', '数控机床', ['845710']]] },
  '352020': { name: '制药', nodes: [['上游', '抗生素原料药', ['294110', '294190']], ['上游', '激素/多肽原料', ['293739']], ['中游', '成药（零售包装）', ['300490']], ['下游', '疫苗', ['300241']]] },
  '351010': { name: '医疗器械', nodes: [['上游', '医用塑料/硅胶部件', ['392690']], ['中游', '诊断成像设备', ['901890']], ['下游', '体外诊断试剂', ['382200']]] },
  '302020': { name: '食品与农业', nodes: [['上游', '大豆', ['120190']], ['上游', '钾肥', ['310420']], ['中游', '豆粕', ['230400']], ['下游', '冷冻牛肉', ['020230']]] },
  '252030': { name: '纺织服装', nodes: [['上游', '棉花', ['520100']], ['上游', '涤纶长丝', ['540233']], ['中游', '针织面料', ['600622']], ['下游', '棉制 T 恤', ['610910']]] },
  '452020': { name: '消费电子硬件', nodes: [['上游', '液晶/OLED 模组', ['852412']], ['上游', '锂离子电池', ['850760']], ['中游', '印刷电路板', ['853400']], ['下游', '便携计算机', ['847130']], ['下游', '智能手机', ['851713']]] },
  '151040': { name: '金属与关键矿产', nodes: [['上游', '铜矿砂', ['260300']], ['上游', '镍', [], 'Nickel'], ['上游', '稀土', [], 'Rare earths'], ['中游', '精炼铜', ['740311']], ['下游', '铜线', ['740811']]] },
  '201040': { name: '电气设备', nodes: [['上游', '取向硅钢', ['722511']], ['上游', '铜线', ['740811']], ['中游', '变压器', ['850423']], ['下游', '电线电缆', ['854449']]] },
  '201010': { name: '航空航天与国防', nodes: [['上游', '钛', [], 'Titanium mineral concentrates'], ['中游', '涡轮喷气发动机', ['841112']], ['下游', '无人机/飞机', ['880240']]] },
};
const SECTION = ch => { ch = +ch; const r = [[5, 1], [14, 2], [15, 3], [24, 4], [27, 5], [38, 6], [40, 7], [43, 8], [46, 9], [49, 10], [63, 11], [67, 12], [70, 13], [71, 14], [83, 15], [85, 16], [89, 17], [92, 18], [93, 19], [96, 20], [97, 21]]; for (const [m, s] of r) if (ch <= m) return s; return 21; };
const oecId = hs6 => String(SECTION(hs6.slice(0, 2))) + hs6;
const hhi = shares => Math.round(shares.reduce((a, s) => a + (s * 100) ** 2, 0));

async function oecNode(hs6) { // OEC/BACI：全球出口国份额与增速
  const d = await get(`https://api-v2.oec.world/tesseract/data.jsonrecords?cube=trade_i_baci_a_22&drilldowns=Exporter+Country,Year&measures=Trade+Value&HS6=${oecId(hs6)}&Year=2023,2024`, { timeout: 40000 });
  const by = {}; for (const r of d.data) { (by[r['Exporter Country']] ||= {})[r.Year] = r['Trade Value']; }
  const t24 = Object.values(by).reduce((a, x) => a + (x[2024] || 0), 0), t23 = Object.values(by).reduce((a, x) => a + (x[2023] || 0), 0);
  const top = Object.entries(by).map(([c, x]) => ({ country: c, share: (x[2024] || 0) / (t24 || 1), growth: x[2023] ? +((x[2024] / x[2023] - 1) * 100).toFixed(1) : null })).sort((a, b) => b.share - a.share);
  return { total: t24, growth: t23 ? +((t24 / t23 - 1) * 100).toFixed(1) : null, top: top.slice(0, 5), hhi: hhi(top.map(x => x.share)), year: 2024, src: 'OEC / BACI HS6', url: `https://oec.world/en/profile/hs/${hs6}` };
}
let MCS = null;
async function usgsNode(mineral) { // USGS MCS 2025 世界产量
  if (!MCS) { const csv = await get('https://www.sciencebase.gov/catalog/file/get/6798fd34d34ea8c18376e8ee?f=__disk__92%2Ff6%2F90%2F92f690853b1b1dc6a8000c1da24a7bbfd9f670d0', { text: true, timeout: 40000 });
    MCS = csv.split(/\r?\n/).slice(1).map(l => { const c = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map(x => x.replace(/,$/, '').replace(/^"|"$/g, '')); return { com: c[1], country: c[2], type: c[3], p23: +c[5] || 0, p24: +c[6] || 0 }; }); }
  const rows = MCS.filter(r => r.com.toLowerCase().startsWith(mineral.toLowerCase()) && /production/i.test(r.type) && !/world total|other countries/i.test(r.country) && r.country !== 'United States' || (r.com.toLowerCase().startsWith(mineral.toLowerCase()) && r.country === 'United States' && /production/i.test(r.type)));
  const type = rows[0]?.type; const rs = rows.filter(r => r.type === type);
  const t24 = rs.reduce((a, r) => a + r.p24, 0), t23 = rs.reduce((a, r) => a + r.p23, 0);
  const top = rs.map(r => ({ country: r.country, share: r.p24 / (t24 || 1), growth: r.p23 ? +((r.p24 / r.p23 - 1) * 100).toFixed(1) : null })).sort((a, b) => b.share - a.share);
  return { total: null, unit: type, growth: t23 ? +((t24 / t23 - 1) * 100).toFixed(1) : null, top: top.slice(0, 5), hhi: hhi(top.map(x => x.share)), year: 2024, src: 'USGS MCS 2025（产量，2024 为估计）', url: 'https://www.sciencebase.gov/catalog/item/6798fd34d34ea8c18376e8ee' };
}
async function comtradeCn(hs6) { // UN Comtrade（免 key 预览）：中国出口 HS6 两年对比
  const q = y => get(`https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=156&period=${y}&cmdCode=${hs6}&flowCode=X&partnerCode=0`, { timeout: 30000 }).then(d => d.data?.[0]?.primaryValue || 0);
  const [a, b] = [await q(2024), await q(2023)]; return { cnExport: a, cnGrowth: b ? +((a / b - 1) * 100).toFixed(1) : null };
}
async function fetchChain(cfg = {}, log = () => {}) {
  const out = { ts: Date.now(), chains: {}, errors: [], sources: {} }; const cache = {};
  for (const [code, ch] of Object.entries(CHAINS)) { const nodes = [];
    for (const [stage, name, hs, mineral] of ch.nodes) { const key = mineral || hs.join('+'); let n = cache[key];
      if (!n) { try { if (mineral) n = await usgsNode(mineral); else { const parts = []; for (const h of hs) { parts.push(await oecNode(h)); await sleep(300); } n = parts[0]; if (parts.length > 1) { n.total = parts.reduce((a, p) => a + p.total, 0); n.note = '合并 ' + hs.join(','); }
            try { Object.assign(n, await comtradeCn(hs[0])); out.sources.comtrade6 = 'ok'; } catch (e) { out.sources.comtrade6 = e.message; } }
          out.sources[mineral ? 'usgs' : 'oec'] = 'ok'; cache[key] = n; } catch (e) { out.errors.push(`${ch.name}/${name}: ${e.message}`); out.sources[mineral ? 'usgs' : 'oec'] ||= e.message; n = { error: e.message }; } }
      const t = n.top?.[0]; const choke = t && (t.share >= 0.5 || n.hhi >= 2500);
      nodes.push({ stage, name, hs, mineral, ...n, choke, chokeWhy: choke ? `${t.country} 占 ${(t.share * 100).toFixed(0)}%，HHI ${n.hhi}${n.hhi >= 2500 ? '（高度集中）' : ''}` : null }); }
    out.chains[code] = { name: ch.name, nodes }; log(`产业链 ${ch.name}：${nodes.filter(x => !x.error).length}/${nodes.length} 节点`); }
  // WITS：中美出口总额（交叉核对）
  try { const x = await get('https://wits.worldbank.org/API/V1/SDMX/V21/datasource/tradestats-trade/reporter/chn/year/2022/partner/wld/product/all/indicator/XPRT-TRD-VL', { text: true }); out.wits = (x.match(/OBS_VALUE="([\d.]+)"/) || [])[1]; out.sources.wits = out.wits ? 'ok' : '无数据'; } catch (e) { out.sources.wits = e.message; }
  // OECD TiVA（SDMX）
  try { await get('https://sdmx.oecd.org/public/rest/data/OECD.STI.PIE,DSD_TIVA_MAINLV@DF_MAINLV,/all?lastNObservations=1&format=csv', { text: true, timeout: 40000 }); out.sources.oecd_tiva = 'ok'; } catch (e) { out.sources.oecd_tiva = e.message; }
  return out;
}

// ---------- 行业统计：映射到 GICS，用于自上而下 TAM ----------
// GICS → [ISIC/NACE 代码, 说明]
const GICS_ISIC = { '453010': 'C26', '452020': 'C26', '452030': 'C26', '452010': 'C26', '201040': 'C27', '201060': 'C28', '251020': 'C29', '251010': 'C29', '201010': 'C30', '352020': 'C21', '352010': 'C21', '151010': 'C20', '151040': 'C24', '302020': 'C10', '302010': 'C11', '302030': 'C12', '252030': 'C14', '151050': 'C17', '151020': 'C23', '101020': 'B', '551010': 'D', '551050': 'D', '551040': 'E', '201030': 'F', '255040': 'G47', '255030': 'G47', '203040': 'H49', '203030': 'H50', '203020': 'H51', '203010': 'H52', '253010': 'I', '502010': 'J58T60', '502020': 'J58T60', '501010': 'J61', '501020': 'J61', '451030': 'J62_63', '451020': 'J62_63', '502030': 'J62_63', '401010': 'K', '402010': 'K', '403010': 'K', '602010': 'L', '202020': 'M', '202010': 'N', '351020': 'Q', '351030': 'J62_63', '351010': 'C32' };
const NACE = { C26: 'C26', C27: 'C27', C28: 'C28', C29: 'C29', C30: 'C30', C21: 'C21', C20: 'C20', C24: 'C24', C10: 'C10', C11: 'C11', C12: 'C12', C14: 'C14', C17: 'C17', C23: 'C23', C32: 'C32', B: 'B', D: 'D', E: 'E', F: 'F', G47: 'G47', H49: 'H49', H50: 'H50', H51: 'H51', H52: 'H52', I: 'I', J61: 'J61', J62_63: 'J62', M: 'M', N: 'N', L: 'L68' };
async function fetchStats(cfg = {}, log = () => {}) {
  const out = { ts: Date.now(), stan: {}, eurostat: {}, bls: {}, ilo: {}, iea: null, errors: [], sources: {} };
  const isics = [...new Set(Object.values(GICS_ISIC))];
  // OECD STAN：总产出 P1（现价，本币百万）— 美、德、日、韩
  for (const area of ['USA', 'DEU', 'JPN', 'KOR']) { try {
    const csv = await get(`https://sdmx.oecd.org/public/rest/data/OECD.STI.PIE,DSD_STAN@DF_STAN,/A.${area}.${isics.join('+')}.P1.V.XDC?startPeriod=2017&format=csv`, { text: true, timeout: 60000 });
    for (const l of csv.split('\n').slice(1)) { const c = l.split(','); if (c.length < 9) continue; const [, , ar, act, , , , y, v, , mult] = c; const k = ar + ':' + act; if (!out.stan[k] || +y > out.stan[k].year) out.stan[k] = { year: +y, v: +v * 10 ** (+mult || 0), cur: area === 'USA' ? 'USD' : '本币' }; }
    out.sources.oecd_stan = 'ok'; } catch (e) { out.errors.push('STAN ' + area + ': ' + e.message); out.sources.oecd_stan ||= e.message; } await sleep(800); }
  // Eurostat SBS：EU27 营业额
  for (const nace of [...new Set(Object.values(NACE))]) { try {
    const d = await get(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/sbs_ovw_act?geo=EU27_2020&nace_r2=${nace}&lastTimePeriod=1`, { timeout: 30000 });
    const lab = d.dimension.indic_sbs.category; const k = Object.keys(lab.label).find(x => /turnover/i.test(lab.label[x]) && /million euro/i.test(lab.label[x])) || Object.keys(lab.label).find(x => /production value/i.test(lab.label[x]) && /million/i.test(lab.label[x]));
    const v = k != null ? d.value[lab.index[k]] : null; if (v != null) out.eurostat[nace] = { v: v * 1e6, cur: 'EUR', ind: lab.label[k], year: Object.keys(d.dimension.time.category.index)[0] }; out.sources.eurostat = 'ok'; } catch (e) { out.sources.eurostat ||= e.message; } }
  // BLS CES：美国分行业就业（千人）
  const ces = { CES5051200001: ['J62_63', '软件出版'], CES3133440001: ['C26', '半导体与电子元件'], CES6562000001: ['Q', '医疗保健'], CES4348400001: ['H49', '卡车运输'], CES3133600001: ['C29', '运输设备制造'] };
  try { const d = await get('https://api.bls.gov/publicAPI/v2/timeseries/data/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seriesid: Object.keys(ces) }), timeout: 30000 });
    for (const s of d.Results?.series || []) { const a = s.data; const last = a[0], yago = a.find(x => +x.year === +last.year - 1 && x.period === last.period); out.bls[ces[s.seriesID][0]] = { name: ces[s.seriesID][1], v: +last.value, period: last.year + last.period, yoy: yago ? +((last.value / yago.value - 1) * 100).toFixed(2) : null }; } out.sources.bls = 'ok'; } catch (e) { out.sources.bls = e.message; }
  // ILOSTAT：各地区按行业就业（千人）
  for (const area of ['CHN', 'USA', 'IND', 'IDN', 'BRA', 'NGA', 'SAU', 'JPN', 'KOR', 'DEU']) { try {
    const d = await get(`https://rplumber.ilo.org/data/indicator/?id=EMP_TEMP_SEX_ECO_NB_A&ref_area=${area}&sex=SEX_T&format=.json`, { timeout: 30000 });
    const last = Math.max(...d.map(r => +r.time)); out.ilo[area] = Object.fromEntries(d.filter(r => +r.time === last).map(r => [r.classif1, +r.obs_value])); out.ilo[area]._year = last; out.sources.ilostat = 'ok'; } catch (e) { out.sources.ilostat ||= e.message; } }
  // IEA 公开指标：美国一次能源供应
  try { const d = await get('https://api.iea.org/stats/indicator/TESbySource?countries=USA', { timeout: 30000 }); const y = Math.max(...d.map(r => +r.year)); out.iea = { year: y, rows: d.filter(r => +r.year === y).map(r => ({ product: r.productLabel || r.product, v: r.value, unit: r.units })) }; out.sources.iea = 'ok'; } catch (e) { out.sources.iea = e.message; }
  log(`行业统计：STAN ${Object.keys(out.stan).length}、Eurostat ${Object.keys(out.eurostat).length}、BLS ${Object.keys(out.bls).length}、ILO ${Object.keys(out.ilo).length} 国`);
  return out;
}
// 为 TAM 提供行业产出（美国 STAN + EU27 Eurostat；USD 折算 EUR×1.08，汇率为假设）
function industryOutput(code, stats) { const isic = GICS_ISIC[code]; if (!isic || !stats) return null;
  const us = stats.stan['USA:' + isic], eu = stats.eurostat[NACE[isic]]; const parts = [];
  if (us) parts.push({ k: `美国 ${isic} 总产出（${us.year}）`, v: us.v, src: 'OECD STAN P1 现价', url: 'https://data-explorer.oecd.org/', real: true });
  if (eu) parts.push({ k: `EU27 ${NACE[isic]} 营业额（${eu.year}）×1.08`, v: eu.v * 1.08, src: 'Eurostat SBS（EUR→USD 汇率 1.08 为假设）', url: 'https://ec.europa.eu/eurostat/databrowser/view/sbs_ovw_act/default/table', real: true });
  return parts.length ? { isic, parts, total: parts.reduce((a, p) => a + p.v, 0) } : null; }

// ---------- 论文源（信号） ----------
const PQ = ['large language model agent', 'humanoid robot', 'solid-state battery', 'perovskite solar', 'GLP-1', 'CRISPR therapy', 'quantum computing', 'autonomous driving', 'digital twin manufacturing', 'carbon capture', 'synthetic biology', 'federated learning healthcare'];
const pick = (cfg, n) => { const kws = String(cfg.keywords || '').split(',').map(s => s.trim()).filter(Boolean); return [...new Set([...kws, ...PQ])].slice(0, n); };
add('semanticscholar', { name: 'Semantic Scholar（论文 + 引用数）', cat: '技术', kind: 'research', weight: .8, freq: 720 }, async (kw, cfg) => { const out = [];
  for (const q of pick(cfg, 6)) { try { const d = await get(`https://api.semanticscholar.org/graph/v1/paper/search/bulk?query=${encodeURIComponent(q)}&fields=title,year,citationCount,publicationDate,url,externalIds&year=2025-&sort=citationCount:desc`, { headers: cfg.s2Key ? { 'x-api-key': cfg.s2Key } : {}, timeout: 30000 }, 4);
    for (const p of (d.data || []).slice(0, 25)) out.push({ title: p.title, url: p.url || `https://www.semanticscholar.org/paper/${p.paperId}`, ts: tsOf(p.publicationDate || p.year + '-06-01'), engagement: p.citationCount || 0, text: `${q} · 引用 ${p.citationCount}`, meta: { citations: p.citationCount, query: q } }); } catch (e) { if (!out.length && q === pick(cfg, 6).at(-1)) throw e; } await sleep(1500); }
  return out; });
add('pubmed', { name: 'PubMed E-utilities（近 30 天医学文献）', cat: '技术', kind: 'research', weight: .85, freq: 720, industry: '352010' }, async (kw, cfg) => { const out = [];
  for (const q of ['GLP-1', 'CRISPR', 'CAR-T', 'digital health', 'Alzheimer therapy', 'mRNA vaccine', 'AI diagnosis', 'obesity drug']) { const s = await get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(q)}&retmode=json&datetype=pdat&reldate=30&retmax=12&sort=relevance`);
    const ids = s.esearchresult.idlist; if (!ids.length) continue; const m = await get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`);
    for (const id of ids) { const r = m.result[id]; if (r) out.push({ title: r.title, url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`, ts: tsOf(r.sortpubdate || r.pubdate), engagement: +s.esearchresult.count, text: `${q} · ${r.fulljournalname} · 近30天该主题 ${s.esearchresult.count} 篇`, meta: { query: q, count30: +s.esearchresult.count } }); } await sleep(400); }
  return out; });
add('crossref', { name: 'Crossref（全学科 DOI 新发表）', cat: '技术', kind: 'research', weight: .65, freq: 720 }, async (kw, cfg) => { const out = [], since = new Date(Date.now() - 21 * 864e5).toISOString().slice(0, 10);
  for (const q of pick(cfg, 8)) { const d = await get(`https://api.crossref.org/works?query=${encodeURIComponent(q)}&rows=15&filter=from-pub-date:${since},type:journal-article&sort=relevance&mailto=admin@signalradar.app`, { timeout: 30000 });
    for (const w of d.message.items) out.push({ title: (w.title || [])[0] || '', url: w.URL, ts: tsOf((w.created || {})['date-time']), engagement: w['is-referenced-by-count'] || 0, text: `${q} · ${(w['container-title'] || [])[0] || ''} · 该主题近 3 周 ${d.message['total-results']} 篇`, meta: { query: q, total: d.message['total-results'] } }); }
  return out.filter(x => x.title); });
for (const srv of ['biorxiv', 'medrxiv']) add(srv, { name: srv === 'biorxiv' ? 'bioRxiv 预印本' : 'medRxiv 预印本', cat: '技术', kind: 'research', weight: .7, freq: 720, industry: srv === 'biorxiv' ? '352010' : '351020' }, async () => {
  const to = new Date().toISOString().slice(0, 10), from = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10); const out = [];
  for (let c = 0; c < 200; c += 100) { const d = await get(`https://api.biorxiv.org/details/${srv}/${from}/${to}/${c}`, { timeout: 40000 });
    for (const p of d.collection || []) out.push({ title: p.title, url: `https://doi.org/${p.doi}`, ts: tsOf(p.date), engagement: 0, text: `${p.category} · ${String(p.abstract || '').slice(0, 300)}`, meta: { category: p.category } }); if ((d.collection || []).length < 100) break; }
  return out; });
add('core', { name: 'CORE（开放获取全文）', cat: '技术', kind: 'research', weight: .6, freq: 1440, key: 'coreKey' }, async (kw, cfg) => { const out = [];
  for (const q of pick(cfg, 5)) { const d = await get(`https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(q)}&limit=15&sort=recency`, { headers: { Authorization: 'Bearer ' + cfg.coreKey } });
    for (const w of d.results || []) out.push({ title: w.title, url: w.downloadUrl || `https://core.ac.uk/works/${w.id}`, ts: tsOf(w.publishedDate), engagement: w.citationCount || 0, text: q }); }
  return out; });
// 需 key 的统计源
add('census_trade', { name: '美国 Census 国际贸易 API（HS 月度进口）', cat: '宏观', kind: 'macro', weight: .9, freq: 1440, key: 'censusKey' }, async (kw, cfg) => {
  const d = await get(`https://api.census.gov/data/timeseries/intltrade/imports/hs?get=GEN_VAL_MO,I_COMMODITY,I_COMMODITY_SDESC&time=${new Date(Date.now() - 100 * 864e5).toISOString().slice(0, 7)}&COMM_LVL=HS2&key=${cfg.censusKey}`);
  return d.slice(1).map(r => ({ title: `美国进口 HS${r[1]} ${r[2]}：$${(+r[0] / 1e9).toFixed(2)}B`, url: 'https://www.census.gov/foreign-trade/', engagement: +r[0] / 1e6, kind: 'macro', ts: now() })); });
add('census_cbp', { name: '美国 Census CBP/ASM（行业企业数/营收）', cat: '宏观', kind: 'macro', weight: .9, freq: 10080, key: 'censusKey' }, async (kw, cfg) => {
  const d = await get(`https://api.census.gov/data/2022/cbp?get=ESTAB,EMP,PAYANN,NAICS2017_LABEL,NAICS2017&for=us:*&key=${cfg.censusKey}`);
  return d.slice(1).filter(r => String(r[4]).length === 4).slice(0, 200).map(r => ({ title: `CBP ${r[4]} ${r[3]}：${(+r[0]).toLocaleString()} 家企业，就业 ${(+r[1]).toLocaleString()}`, url: 'https://www.census.gov/programs-surveys/cbp.html', engagement: +r[0], kind: 'macro', ts: now() })); });
add('estat', { name: '日本 e-Stat（政府统计）', cat: '宏观', kind: 'macro', weight: .85, freq: 10080, key: 'estatKey', region: 'jp' }, async (kw, cfg) => {
  const d = await get(`https://api.e-stat.go.jp/rest/3.0/app/json/getStatsList?appId=${cfg.estatKey}&searchWord=${encodeURIComponent('工業統計')}&limit=50`);
  if (d.GET_STATS_LIST.RESULT.STATUS !== 0) throw new Error(d.GET_STATS_LIST.RESULT.ERROR_MSG);
  return [].concat(d.GET_STATS_LIST.DATALIST_INF.TABLE_INF || []).map(t => ({ title: `e-Stat：${t.TITLE?.$ || t.TITLE}`, url: `https://www.e-stat.go.jp/dbview?sid=${t['@id']}`, ts: now(), kind: 'macro' })); });

UNAVAILABLE.push(
  ['oecd_icio', 'OECD ICIO 投入产出表', 'ICIO 只提供整表 ZIP 下载（单年 >100MB，无 API 子集），不适合桌面端实时拉取；TiVA SDMX 用于替代'],
  ['faostat', 'FAOSTAT API', '2025 起 API 需要授权头（HTTP 401）；批量 ZIP（作物 25MB）可下载但未接入'],
  ['cn_customs', '中国海关统计 stats.customs.gov.cn', '连接超时（境外访问受限/需验证码）'],
  ['nbs', '国家统计局 data.stats.gov.cn', 'HTTP 403（反爬/境外 IP 限制）'],
  ['unido', 'UNIDO Statistics', 'Cloudflare 验证页（HTTP 403）'],
  ['ssrn', 'SSRN', 'Cloudflare 验证页（HTTP 403）'],
  ['cnki', '中国知网 CNKI', '连接被拒绝/需机构登录'],
  ['wanfang', '万方数据', '搜索页为纯前端渲染且接口需签名，无公开 API'],
);
module.exports = { CHAINS, fetchChain, fetchStats, industryOutput, GICS_ISIC };
