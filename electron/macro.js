// 宏观与贸易：World Bank / IMF / FRED / UN Comtrade（结构化指标，单独展示，并作为 TAM 自上而下的输入）
const { get } = require('./collectors');
const WB = { gdp: 'NY.GDP.MKTP.CD', agri: 'NV.AGR.TOTL.ZS', ind: 'NV.IND.TOTL.ZS', manuf: 'NV.IND.MANF.ZS', serv: 'NV.SRV.TOTL.ZS', health: 'SH.XPD.CHEX.GD.ZS', edu: 'SE.XPD.TOTL.GD.ZS', ictx: 'BX.GSR.CCIS.ZS', pop: 'SP.POP.TOTL', internet: 'IT.NET.USER.ZS' };
async function fetchMacro(cfg) {
  const res = { ts: Date.now(), wb: {}, imf: {}, fred: {}, comtrade: null, errors: [] };
  for (const [k, id] of Object.entries(WB)) { try { const d = await get(`https://api.worldbank.org/v2/country/USA;CHN;WLD/indicator/${id}?format=json&mrv=1&per_page=10`, { timeout: 60000 });
    res.wb[k] = { id, name: d[1][0].indicator.value, values: Object.fromEntries(d[1].map(x => [x.countryiso3code, { v: x.value, year: x.date }])), url: `https://data.worldbank.org/indicator/${id}` }; } catch (e) { res.errors.push('WorldBank ' + id + ': ' + e.message); } }
  try { const d = await get('https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH/USA/CHN'); const y = String(new Date().getFullYear());
    res.imf.gdpGrowth = { name: 'IMF WEO 实际 GDP 增速 (%)', values: Object.fromEntries(['USA', 'CHN'].map(c => [c, { v: d.values.NGDP_RPCH[c]?.[y], year: y, next: d.values.NGDP_RPCH[c]?.[String(+y + 1)] }])), url: 'https://www.imf.org/external/datamapper/NGDP_RPCH@WEO' }; } catch (e) { res.errors.push('IMF: ' + e.message); }
  const series = { UNRATE: '美国失业率 (%)', CPIAUCSL: '美国 CPI 指数', FEDFUNDS: '联邦基金利率 (%)', RSAFS: '美国零售销售 ($M)', INDPRO: '美国工业生产指数', UMCSENT: '密歇根消费者信心' };
  for (const [id, name] of Object.entries(series)) { try {
    let obs; if (cfg.fredKey) { const d = await get(`https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${cfg.fredKey}&file_type=json&sort_order=desc&limit=13`); obs = d.observations.map(o => [o.date, +o.value]).reverse(); }
    else { const t = await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { text: true }); obs = t.trim().split('\n').slice(1).map(l => l.split(',')).filter(x => x[1] !== '.').slice(-13).map(([d, v]) => [d, +v]); }
    const last = obs[obs.length - 1], yago = obs[0]; res.fred[id] = { name, last, yoy: yago ? +((last[1] / yago[1] - 1) * 100).toFixed(2) : null, series: obs, via: cfg.fredKey ? 'FRED API' : 'FRED 公开 CSV（未配置 Key）', url: `https://fred.stlouisfed.org/series/${id}` };
  } catch (e) { res.errors.push('FRED ' + id + ': ' + e.message); } }
  try { const y = new Date().getFullYear() - 2; const pull = async (p) => (await get(`https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=156&period=${p}&partnerCode=0&cmdCode=AG2&flowCode=X`)).data;
    const [a, b] = [await pull(y), await pull(y - 1)]; const mb = Object.fromEntries(b.map(x => [x.cmdCode, x.primaryValue]));
    res.comtrade = { name: `中国出口（HS 两位章）${y} vs ${y - 1}`, rows: a.filter(x => x.cmdCode !== 'TOTAL').map(x => ({ hs: x.cmdCode, v: x.primaryValue, prev: mb[x.cmdCode], g: mb[x.cmdCode] ? +((x.primaryValue / mb[x.cmdCode] - 1) * 100).toFixed(1) : null })).sort((p, q) => q.v - p.v).slice(0, 25), url: 'https://comtradeplus.un.org/' };
  } catch (e) { res.errors.push('UN Comtrade: ' + e.message); }
  return res;
}
// GICS 板块 → World Bank 占 GDP 比重指标（用于 TAM 自上而下；无对应指标的板块需用户自填）
const SECTOR_SHARE = { '10': ['ind', 0.25, '工业增加值占比 × 25%（能源在工业中的份额，假设）'], '15': ['ind', 0.15, '工业增加值占比 × 15%（假设）'], '20': ['ind', 0.35, '工业增加值占比 × 35%（假设）'], '25': ['serv', 0.15, '服务业占比 × 15%（假设）'], '30': ['agri', 1.5, '农业占比 × 1.5（含食品加工，假设）'], '35': ['health', 1, '卫生总支出占 GDP（世界银行实测）'], '40': ['serv', 0.12, '服务业占比 × 12%（假设）'], '45': ['serv', 0.08, '服务业占比 × 8%（假设）'], '50': ['serv', 0.05, '服务业占比 × 5%（假设）'], '55': ['ind', 0.06, '工业占比 × 6%（假设）'], '60': ['serv', 0.13, '服务业占比 × 13%（假设）'] };
module.exports = { fetchMacro, SECTOR_SHARE };
