// v2.2 发现日历 / 时间轴：年、月、周、日四种粒度，快照对比与周期报告
import { React, useEffect, useState, api, I, PH, Chart, Empty, L } from './ui.jsx';
const G = [['year', '年'], ['month', '月'], ['week', '周'], ['day', '日']];
const dayOf = d => d.toLocaleDateString('sv-SE');
export const periodKey = (day, g) => { if (g === 'year') return day.slice(0, 4); if (g === 'month') return day.slice(0, 7); if (g === 'day') return day; const d = new Date(day + 'T00:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return 'W' + dayOf(d); };
const shift = (key, g, n) => { if (g === 'year') return String(+key + n); if (g === 'month') { const [y, m] = key.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return dayOf(d).slice(0, 7); } const d = new Date((g === 'week' ? key.slice(1) : key) + 'T00:00:00'); d.setDate(d.getDate() + n * (g === 'week' ? 7 : 1)); return g === 'week' ? 'W' + dayOf(d) : dayOf(d); };
const pct = (a, b) => b ? ((a / b - 1) * 100).toFixed(0) + '%' : '—';
export function Timeline({ open, say }) {
  const [dn, setDn] = useState({}); useEffect(() => { api.call('dims:get').then(d => setDn(Object.fromEntries((d?.dims || []).map(x => [x[0], x[1]])))).catch(() => {}); }, []);
  const [list, setList] = useState(null), [g, setG] = useState(() => localStorage.getItem('tlG') || 'month'), [key, setKey] = useState(null), [p, setP] = useState(null), [busy, setBusy] = useState(''), [tab, setTab] = useState('new');
  const loadList = () => api.call('snap:list').then(l => { setList(l); if (!key && l.length) setKey(periodKey(l[l.length - 1].day, g)); });
  useEffect(() => { loadList(); }, []);
  useEffect(() => { localStorage.setItem('tlG', g); }, [g]);
  useEffect(() => { if (key) api.call('snap:period', g, key).then(setP); }, [g, key, list]);
  const setGran = ng => { setG(ng); const d = p?.last?.day || list?.[list.length - 1]?.day; d && setKey(periodKey(d, ng)); };
  const act = async (k, f) => { setBusy(k); try { await f(); await loadList(); } finally { setBusy(''); } };
  if (!list) return <><PH icon="calendar-2-line" title="发现日历" /><div className="skel" style={{ height: 320 }} /></>;
  const tools = <><button className="s" disabled={!!busy} onClick={() => act('take', async () => { await api.call('snap:take'); say?.('已生成今日快照'); })}><I n="camera-line" />{busy === 'take' ? '生成中…' : '立即快照'}</button>
    <button className="s" disabled={!!busy} onClick={() => act('bf', async () => { const r = await api.call('snap:backfill', 30); say?.(`已回填 ${r.length} 天快照（按信号发布时间重算，标记为「回填」）`); })}><I n="history-line" />{busy === 'bf' ? '回填中…' : '回填 30 天'}</button></>;
  if (!list.length) return <><PH icon="calendar-2-line" title="发现日历" sub="每日自动保存发现快照，可按年 / 月 / 周 / 日回看">{tools}</PH><Empty text="还没有快照。点「立即快照」保存今天的发现结果，或点「回填 30 天」按信号发布时间重建过去 30 天（超过 30 天的历史不会伪造）。" /></>;
  const days = Object.fromEntries(list.map(s => [s.day, s]));
  const years = [...new Set(list.map(s => s.day.slice(0, 4)))];
  const range = g === 'year' ? key : g === 'month' ? [key + '-01', dayOf(new Date(+key.slice(0, 4), +key.slice(5, 7), 0))] : null;
  const maxN = Math.max(1, ...list.map(s => s.stats.new));
  const cal = range && { tooltip: { formatter: x => { const s = days[x.value[0]]; return s ? `${s.day}${s.backfill ? '（回填）' : ''}<br/>新增机会 ${s.stats.new} · 强度 ${s.stats.intensity}<br/>在榜 ${s.stats.opps} · 跌出 ${s.stats.gone} · 最高分 ${s.stats.top}` : x.value[0] + '：无快照'; } },
    visualMap: { min: 0, max: maxN, calculable: false, orient: 'horizontal', right: 20, top: 0, itemHeight: 80, inRange: { color: ['var(--heat0)', 'var(--heat1)', 'var(--heat2)', 'var(--heat3)'] }, textStyle: { color: 'var(--mut)' } },
    calendar: { range, top: 40, left: 40, right: 20, cellSize: g === 'year' ? ['auto', 16] : ['auto', 42], dayLabel: { firstDay: 1, nameMap: 'ZH', color: 'var(--mut)' }, monthLabel: { nameMap: 'ZH', color: 'var(--mut)' }, yearLabel: { show: g === 'year', color: 'var(--mut)' }, itemStyle: { borderColor: 'rgba(127,127,127,.25)', color: 'transparent' }, splitLine: { lineStyle: { color: 'rgba(127,127,127,.35)' } } },
    series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: list.map(s => [s.day, s.stats.new]), label: { show: g === 'month', formatter: x => x.value[0].slice(8) + (days[x.value[0]]?.backfill ? '·回填' : '') + '\n' + x.value[1], fontSize: 10, color: 'var(--tx)' } }] };
  const a = p?.agg, pv = p?.prev, Ls = p?.lists;
  const kp = [['新增机会', a?.newOpps, pv?.newOpps], ['出现过的机会', a?.distinct, pv?.distinct], ['Top10 平均分', a?.avgTop10, pv?.avgTop10], ['快照天数', a?.days, pv?.days]];
  const dimOpt = a && { tooltip: {}, grid: { left: 130, right: 20, top: 6, bottom: 20 }, xAxis: { type: 'value', axisLabel: { color: 'var(--mut)' } }, yAxis: { type: 'category', data: Object.keys(a.dims).map(k => dn[k] || k), axisLabel: { color: 'var(--mut)', fontSize: 11 } },
    series: [{ name: '本期', type: 'bar', data: Object.values(a.dims), itemStyle: { color: 'var(--ac)' } }, ...(pv ? [{ name: '上期', type: 'bar', data: Object.keys(a.dims).map(k => pv.dims[k] || 0), itemStyle: { color: 'var(--mut2)' } }] : [])] };
  const LT = [['new', '新机会', 'sparkling-line'], ['up', '上升最快', 'arrow-up-line'], ['gone', '跌出榜单', 'arrow-down-line'], ['stay', '持续在榜', 'pushpin-line']];
  const label = g === 'week' ? key?.slice(1) + ' 当周' : key;
  return <><PH icon="calendar-2-line" title="发现日历" sub={`${list.length} 天快照（其中回填 ${list.filter(s => s.backfill).length} 天）· ${list[0].day} → ${list[list.length - 1].day} · 回填快照按信号发布时间重算；更早的历史不伪造`}>{tools}</PH>
    <div className="fbar"><span className="seg">{G.map(([k, n]) => <button key={k} className={g === k ? '' : 's'} onClick={() => setGran(k)}>{n}</button>)}</span>
      <button className="s" onClick={() => setKey(shift(key, g, -1))}><I n="arrow-left-s-line" /></button><b style={{ minWidth: 130, textAlign: 'center' }}>{label}</b><button className="s" onClick={() => setKey(shift(key, g, 1))}><I n="arrow-right-s-line" /></button>
      {g !== 'year' && <select value={key?.slice(g === 'week' ? 1 : 0, g === 'week' ? 5 : 4)} onChange={e => setKey(g === 'month' ? e.target.value + key.slice(4) : e.target.value)} style={{ display: 'none' }}>{years.map(y => <option key={y}>{y}</option>)}</select>}
      <span className="sp" /><button disabled={!a} onClick={async () => { const f = await api.call('snap:report', g, key); f && say?.('已导出' + { year: '年报', month: '月报', week: '周报', day: '日报' }[g] + '：' + f); }}><I n="file-text-line" /> 导出{{ year: '年报', month: '月报', week: '周报', day: '日报' }[g]}</button></div>
    {cal && <div className="card"><h3><span><I n="calendar-line" /> {g === 'year' ? '年度' : '月度'}发现日历（颜色 = 当天新增机会数；点击某天进入日视图）</span></h3><Chart option={cal} h={g === 'year' ? 200 : 330} onClick={x => { setG('day'); setKey(x.value[0]); }} /></div>}
    {!a ? <Empty text={`${label} 没有快照。用左右箭头切换时段。`} /> : <>
      <div className="grid g4" style={{ marginTop: 12 }}>{kp.map(([n, v, w]) => <div key={n} className="kpi"><span className="l">{n}</span><b>{v ?? '—'}</b><span className="mut" style={{ fontSize: 11 }}>上期 {w ?? '—'} · 环比 <span className={v >= (w || 0) ? 'up' : 'dn'}>{w != null ? pct(v, w) : '—'}</span></span></div>)}</div>
      <div className="grid g21" style={{ marginTop: 12 }}>
        <div className="card"><h3><span><I n="trophy-line" /> {label} Top 机会（时段内最高分）</span></h3><table><thead><tr><th>#</th><th>机会</th><th>行业</th><th>最高分</th><th>在榜天数</th><th>首次出现</th></tr></thead><tbody>{a.top.slice(0, 15).map((o, i) => <tr key={o.id} onClick={() => open(o.alias || o.id)}><td>{i + 1}</td><td><b>{o.title}</b></td><td>{o.industryName}</td><td><span className="score">{o.total}</span></td><td>{o.days}</td><td>{o.first}</td></tr>)}</tbody></table></div>
        <div className="card"><h3><span><I n="stack-line" /> 维度分布（日均命中，对比上期）</span></h3><Chart option={dimOpt} h={380} /></div></div>
      {Ls && <div className="card" style={{ marginTop: 12 }}><h3><span><I n="exchange-line" /> 当期变化（{Ls.base || '首个快照'} → {Ls.end}）</span><span className="seg">{LT.map(([k, n, ic]) => <button key={k} className={tab === k ? '' : 's'} onClick={() => setTab(k)}><I n={ic} /> {n} {Ls[k].length}</button>)}</span></h3>
        {!Ls[tab].length ? <Empty text="该类别本期为空" /> : <table><tbody>{Ls[tab].map(o => <tr key={o.id} onClick={() => open(o.alias || o.id)}><td><span className="score">{o.total}</span></td><td><b>{o.title}</b><div className="mut" style={{ fontSize: 11 }}>{o.industryName}</div></td><td>{o.delta != null && <span className={o.delta >= 0 ? 'up' : 'dn'}>{o.delta >= 0 ? '+' : ''}{o.delta} 分 · 排名 {o.rankDelta >= 0 ? '↑' : '↓'}{Math.abs(o.rankDelta)}</span>}</td><td style={{ fontSize: 11 }}>{o.ev && <L u={o.ev.u}>{o.ev.t?.slice(0, 50)}</L>}</td></tr>)}</tbody></table>}</div>}</>}</>;
}
export function OppHistory({ id }) {
  const [h, setH] = useState(null);
  useEffect(() => { api.call('opp:history', id).then(setH); }, [id]);
  if (!h) return null;
  if (!h.pts.length) return <div className="card"><h3><span><I n="line-chart-line" /> 历史评分</span></h3><p className="mut">该机会尚未出现在任何每日快照中。</p></div>;
  const opt = { tooltip: { trigger: 'axis' }, grid: { left: 36, right: 36, top: 16, bottom: 24 }, xAxis: { type: 'category', data: h.pts.map(p => p.day.slice(5)), axisLabel: { color: 'var(--mut)' } }, yAxis: [{ type: 'value', min: 0, max: 100, axisLabel: { color: 'var(--mut)' } }, { type: 'value', inverse: true, axisLabel: { color: 'var(--mut)' }, name: '排名' }],
    series: [{ name: '评分', type: 'line', data: h.pts.map(p => p.total), smooth: true, itemStyle: { color: 'var(--ac)' }, areaStyle: { opacity: .12 } }, { name: '排名', type: 'line', yAxisIndex: 1, data: h.pts.map(p => p.rank), itemStyle: { color: 'var(--warn)' }, lineStyle: { type: 'dashed' } }] };
  return <div className="card"><h3><span><I n="line-chart-line" /> 历史评分曲线</span><span className="mut" style={{ fontSize: 11 }}>首次发现：<b>{h.first}</b>{h.pts[0].backfill ? '（回填快照）' : ''} · 共 {h.pts.length} 天在榜</span></h3><Chart option={opt} h={200} /></div>;
}
