// 每日发现快照：当天的机会、维度命中、评分、排名、增减变化、热力矩阵、关键指标、证据链接
const TOP = 200;
const jac = (a, b) => { const A = new Set(a), n = b.filter(x => A.has(x)).length; return n / (A.size + b.length - n || 1); };
// 把当天的簇映射到前一天的机会 id（主题词哈希不稳定时按成员重合度 ≥0.3 继承），保证跨日可比
function align(opps, prevFull) {
  if (!prevFull?.length) return opps;
  const ids = new Set(prevFull.map(p => p.id));
  return opps.map(o => { if (ids.has(o.id)) return o; let best = null, bj = 0.3; for (const p of prevFull) { const j = jac(p.members || [], o.members || []); if (j >= bj) { bj = j; best = p; } } return best ? { ...o, id: best.id, aliasOf: o.id } : o; });
}
function build({ day, opps, dims, kpis, prev, backfill = false }) {
  const live = opps.filter(o => !o.quality?.noise).sort((a, b) => b.total - a.total).slice(0, TOP);
  const DM = dims?.oppDims || {};
  const list = live.map((o, i) => ({ id: o.id, alias: o.aliasOf || null, title: o.title, industry: o.industry, industryName: o.industryName, sector: o.sector, total: o.total, conf: o.conf, rank: i + 1, dims: DM[o.aliasOf || o.id] || DM[o.id] || [], n: o.metrics?.signals, evidence: (o.evidence || []).slice(0, 5).map(e => ({ t: e.title, u: e.url, s: e.source })), members: (o.members || []).slice(0, 60) }));
  const pm = new Map((prev?.opps || []).map(o => [o.id, o]));
  const cur = new Set(list.map(o => o.id));
  const diff = { new: [], gone: [], up: [], down: [], stay: [] };
  for (const o of list) { const p = pm.get(o.id); if (!p) diff.new.push(o.id); else { const d = o.total - p.total, dr = p.rank - o.rank; o.delta = d; o.rankDelta = dr; (d >= 3 || dr >= 5 ? diff.up : d <= -3 || dr <= -5 ? diff.down : diff.stay).push(o.id); } }
  for (const p of prev?.opps || []) if (!cur.has(p.id)) diff.gone.push({ id: p.id, title: p.title, total: p.total, rank: p.rank });
  return { day, ts: Date.now(), backfill, opps: list, diff, matrix: dims?.matrix || {}, dimCounts: dims?.counts || {}, kpis,
    stats: { opps: list.length, new: diff.new.length, gone: diff.gone.length, up: diff.up.length, down: diff.down.length, top: list[0]?.total || 0, newHigh: list.filter(o => diff.new.includes(o.id) && o.total >= 75).length, intensity: Math.round(list.filter(o => diff.new.includes(o.id)).reduce((a, o) => a + o.total, 0)) } };
}
// 聚合某时段（年/月/周/日）的快照：Top 机会（时段内最高分）、维度分布、新增数，以及与上一期的环比
function aggregate(snaps) {
  const best = new Map(), dimC = {}; let nNew = 0, sig = 0;
  for (const s of snaps) { nNew += s.stats.new; sig = Math.max(sig, s.kpis?.signals || 0);
    for (const o of s.opps) { const b = best.get(o.id); if (!b || o.total > b.total) best.set(o.id, { ...o, day: s.day, days: (b?.days || 0) + 1, first: b?.first || s.day }); else b.days++; }
    for (const [d, n] of Object.entries(s.dimCounts || {})) dimC[d] = (dimC[d] || 0) + n / snaps.length; }
  const top = [...best.values()].sort((a, b) => b.total - a.total).slice(0, 30);
  return { days: snaps.length, newOpps: nNew, distinct: best.size, top, dims: Object.fromEntries(Object.entries(dimC).map(([k, v]) => [k, +v.toFixed(1)])), avgTop10: top.length ? +(top.slice(0, 10).reduce((a, o) => a + o.total, 0) / Math.min(10, top.length)).toFixed(1) : 0, signals: sig };
}
function periodKey(day, g) { const d = new Date(day + 'T00:00:00'); if (g === 'year') return day.slice(0, 4); if (g === 'month') return day.slice(0, 7); if (g === 'day') return day;
  const t = new Date(d); t.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return 'W' + t.toLocaleDateString('sv-SE'); }
function prevPeriod(key, g) { if (g === 'year') return String(+key - 1); if (g === 'month') { const [y, m] = key.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; }
  const d = new Date((g === 'week' ? key.slice(1) : key) + 'T00:00:00'); d.setDate(d.getDate() - (g === 'week' ? 7 : 1)); const s = d.toLocaleDateString('sv-SE'); return g === 'week' ? 'W' + s : s; }
function report(key, g, agg, prevAgg, snaps) {
  const N = { year: '年报', month: '月报', week: '周报', day: '日报' }[g], pct = (a, b) => b ? ((a / b - 1) * 100).toFixed(0) + '%' : '—';
  const last = snaps[snaps.length - 1];
  const L = [`# 商机雷达 ${N}：${key}`, '', `> 快照 ${agg.days} 天${snaps.some(s => s.backfill) ? '（含回填快照：按信号发布时间重算，标记为「回填」）' : ''} · 生成于 ${new Date().toLocaleString('zh-CN')}`, '',
    '## 关键指标', '', '| 指标 | 本期 | 上期 | 环比 |', '|---|---|---|---|',
    `| 新增机会 | ${agg.newOpps} | ${prevAgg?.newOpps ?? '—'} | ${prevAgg ? pct(agg.newOpps, prevAgg.newOpps) : '—'} |`, `| 出现过的机会 | ${agg.distinct} | ${prevAgg?.distinct ?? '—'} | ${prevAgg ? pct(agg.distinct, prevAgg.distinct) : '—'} |`, `| Top10 平均分 | ${agg.avgTop10} | ${prevAgg?.avgTop10 ?? '—'} | ${prevAgg ? pct(agg.avgTop10, prevAgg.avgTop10) : '—'} |`, `| 信号库规模 | ${agg.signals} | ${prevAgg?.signals ?? '—'} | ${prevAgg ? pct(agg.signals, prevAgg.signals) : '—'} |`, '',
    '## Top 机会', '', '| # | 机会 | 行业 | 最高分 | 在榜天数 | 首次出现 | 维度 |', '|---|---|---|---|---|---|---|', ...agg.top.slice(0, 15).map((o, i) => `| ${i + 1} | ${o.title} | ${o.industryName || ''} | ${o.total} | ${o.days} | ${o.first} | ${(o.dims || []).join(', ')} |`), '',
    '## 维度分布（日均命中数）', '', ...Object.entries(agg.dims).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}：${v}`), ''];
  if (last) { L.push(`## 期末变化（${last.day}）`, '', `新增 ${last.stats.new} · 上升 ${last.stats.up} · 下降 ${last.stats.down} · 跌出榜单 ${last.stats.gone}`, '');
    for (const o of last.opps.filter(o => last.diff.new.includes(o.id)).slice(0, 10)) L.push(`- 新：**${o.title}**（${o.total}）${o.evidence[0] ? ` — [${o.evidence[0].t.slice(0, 60)}](${o.evidence[0].u})` : ''}`); }
  return L.join('\n');
}
module.exports = { build, align, aggregate, periodKey, prevPeriod, report };
