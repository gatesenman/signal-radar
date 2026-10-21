import { React, useEffect, useState, api, I, $M, L, PH, Chart, grid, axl, Empty } from './ui.jsx';
const pct = x => (x * 100).toFixed(0) + '%';
export function Chain({ open }) {
  const [d, setD] = useState(null), [sel, setSel] = useState(null), [busy, setBusy] = useState(false);
  const load = () => api.call('chain:get').then(r => { setD(r); if (!sel && r.chain) setSel(Object.keys(r.chain.chains)[0]); });
  useEffect(() => { load(); }, []);
  const refresh = async () => { setBusy(true); await api.call('chain:refresh'); await load(); setBusy(false); };
  if (!d) return <PH icon="git-branch-line" title="产业链" />;
  if (!d.chain) return <><PH icon="git-branch-line" title="产业链"><button onClick={refresh} disabled={busy}><I n="refresh-line" />{busy ? '拉取中…' : '拉取产业链数据'}</button></PH><Empty text="尚未拉取产业链数据（OEC/BACI HS6 + USGS MCS 2025 + UN Comtrade）" /></>;
  const C = d.chain.chains, c = C[sel] || Object.values(C)[0], opps = d.opps.filter(o => o.chain === sel);
  const allChokes = Object.entries(C).flatMap(([k, ch]) => ch.nodes.filter(n => n.choke).map(n => ({ k, ch: ch.name, ...n })));
  return <><PH icon="git-branch-line" title="产业链" sub={`${Object.keys(C).length} 条产业链 · ${Object.values(C).reduce((a, x) => a + x.nodes.length, 0)} 个节点 · 卡脖子/高集中节点 ${allChokes.length} · 更新 ${new Date(d.chain.ts).toLocaleString('zh-CN')}`}><button onClick={refresh} disabled={busy}><I n={busy ? 'loader-4-line' : 'refresh-line'} />刷新</button></PH>
    <div className="filters">{Object.entries(C).map(([k, x]) => <button key={k} className={k === sel ? '' : 's'} onClick={() => setSel(k)}>{x.name}{x.nodes.some(n => n.choke) && <I n="alert-line" c="var(--warn)" />}</button>)}</div>
    <div className="grid g3">{['上游', '中游', '下游'].map(st => <div key={st} className="card"><h3><span><I n={{ 上游: 'arrow-up-circle-line', 中游: 'settings-5-line', 下游: 'shopping-bag-3-line' }[st]} /> {st}</span></h3>
      {c.nodes.filter(n => n.stage === st).map((n, i) => <div key={i} className="kpi" style={{ marginBottom: 8, borderColor: n.choke ? 'var(--warn)' : undefined }}>
        <span className="l"><b>{n.name}</b> {n.hs?.length ? <span className="mut">HS {n.hs.join(',')}</span> : <span className="mut">USGS {n.mineral}</span>} {n.choke && <span className="tag o">卡脖子/高集中</span>}</span>
        {n.error ? <span className="dn">数据失败：{n.error}</span> : <>
          {n.top?.slice(0, 4).map(t => <div key={t.country} className="row" style={{ fontSize: 12 }}><span style={{ width: 110 }}>{t.country}</span><div className="sp"><div className="bar"><i style={{ width: pct(t.share) }} /></div></div><span style={{ width: 42 }}>{pct(t.share)}</span><span style={{ width: 54 }} className={t.growth >= 0 ? 'up' : 'dn'}>{t.growth != null ? (t.growth > 0 ? '+' : '') + t.growth + '%' : ''}</span></div>)}
          <span className="mut" style={{ fontSize: 11 }}>{n.total ? '全球出口 ' + $M(n.total) + ' · ' : ''}同比 {n.growth ?? '—'}% · HHI {n.hhi}{n.cnGrowth != null ? ' · 中国出口同比 ' + n.cnGrowth + '%（Comtrade）' : ''} · <L u={n.url}>{n.src}</L></span>{n.choke && <span style={{ fontSize: 11, color: 'var(--warn)' }}>{n.chokeWhy}</span>}</>}
      </div>)}</div>)}</div>
    <div className="grid g2" style={{ marginTop: 12 }}><div className="card"><h3><span><I n="lightbulb-line" /> 关联机会（{opps.length}）</span></h3>{opps.length ? <table><tbody>{opps.map(o => <tr key={o.id} onClick={() => open(o.id)}><td><span className="score">{o.total}</span></td><td>{o.title}{o.noise && <span className="tag o">噪声</span>}</td></tr>)}</tbody></table> : <div className="mut">当前没有落在该产业链 GICS 子行业的机会簇</div>}</div>
      <div className="card"><h3><span><I n="alert-line" /> 全部卡脖子/高集中节点（份额 ≥50% 或 HHI ≥2500）</span></h3><table><tbody>{allChokes.map((n, i) => <tr key={i} onClick={() => setSel(n.k)}><td>{n.ch}</td><td>{n.stage}·{n.name}</td><td className="mut">{n.chokeWhy}</td></tr>)}</tbody></table></div></div></>;
}
export function Research() {
  const [rows, setRows] = useState([]), [st, setSt] = useState(null);
  useEffect(() => { api.call('papers').then(setRows); api.call('stats:get').then(setSt); }, []);
  const top = rows.filter(r => r.papers >= 3);
  return <><PH icon="book-open-line" title="论文与行业统计" sub="论文增速（近 14 天 vs 前 14 天）· 引用速度差（近 14 天论文 vs 前 14 天论文的「引用数/发表天数」均值差，仅 OpenAlex/S2/Crossref/PubMed；两窗口各 ≥5 篇才计算）· 增速同样要求两窗口各 ≥5 篇· 论文→产品转化落差 log2((论文+1)/(产品+1))" />
    <div className="grid g21"><div className="card"><h3><span><I n="flask-line" /> 按行业的论文指标（≥3 篇）</span></h3><table><thead><tr><th>行业</th><th>论文</th><th>增速</th><th>引用速度差/天</th><th>产品信号</th><th>转化落差</th></tr></thead><tbody>{top.map(r => <tr key={r.code}><td>{r.cn}<div className="mut" style={{ fontSize: 10 }}>{r.sector}</div></td><td>{r.papers}</td><td className={r.growth > 0 ? 'up' : 'dn'}>{r.growth != null ? r.growth + '%' : <span className="mut" title={`样本不足：近14天 ${r.r14} 篇 / 前14天 ${r.r28} 篇（各需 ≥5）`}>样本不足</span>}</td><td className={r.citAccel > 0 ? 'up' : r.citAccel < 0 ? 'dn' : ''}>{r.citAccel ?? <span className="mut">—</span>}</td><td>{r.products}</td><td><b style={{ color: r.gap >= 1 ? 'var(--pur)' : undefined }}>{r.gap}</b></td></tr>)}</tbody></table>
      <p className="mut" style={{ fontSize: 11 }}>落差 ≥1 表示研究明显多于产品化，可能存在技术→产品的空档；样本少时仅供参考。</p></div>
      <div className="card"><h3><span><I n="bar-chart-grouped-line" /> 行业统计（用于自上而下 TAM）</span></h3>{!st ? <Empty text="尚未拉取" /> : <>
        <div className="mut" style={{ fontSize: 11, marginBottom: 6 }}>来源状态：{Object.entries(st.sources).map(([k, v]) => k + ' ' + (v === 'ok' ? '✓' : v)).join(' · ')}</div>
        <table><thead><tr><th>ISIC/NACE</th><th>美国总产出 (STAN)</th><th>EU27 营业额 (Eurostat)</th></tr></thead><tbody>{[...new Set([...Object.keys(st.stan).map(k => k.split(':')[1]), ...Object.keys(st.eurostat)])].sort().map(k => <tr key={k}><td>{k}</td><td>{st.stan['USA:' + k] ? $M(st.stan['USA:' + k].v) + ' (' + st.stan['USA:' + k].year + ')' : '—'}</td><td>{st.eurostat[k] ? '€' + (st.eurostat[k].v / 1e9).toFixed(1) + 'B (' + st.eurostat[k].year + ')' : '—'}</td></tr>)}</tbody></table>
        <h3 style={{ marginTop: 10 }}><span>BLS 美国分行业就业</span></h3><table><tbody>{Object.values(st.bls).map(b => <tr key={b.name}><td>{b.name}</td><td>{b.v} 千人</td><td className={b.yoy >= 0 ? 'up' : 'dn'}>{b.yoy}%</td><td className="mut">{b.period}</td></tr>)}</tbody></table>
        <h3 style={{ marginTop: 10 }}><span>ILOSTAT 就业（千人，最新年）</span></h3><table><tbody>{Object.entries(st.ilo).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v._year}</td><td>{Math.round(v.ECO_SECTOR_TOTAL || 0).toLocaleString()}</td><td className="mut">工业 {Math.round(v.ECO_SECTOR_IND || 0).toLocaleString()} · 服务 {Math.round(v.ECO_SECTOR_SER || 0).toLocaleString()}</td></tr>)}</tbody></table>
        {st.iea && <div className="mut" style={{ fontSize: 11, marginTop: 6 }}>IEA 美国一次能源供应 {st.iea.year}：{st.iea.rows.slice(0, 6).map(r => r.product + ' ' + Math.round(r.v / 1000).toLocaleString() + 'k ' + r.unit).join(' · ')}</div>}</>}</div></div></>;
}

// v2.1 机会维度：15 个独立发现引擎 + 维度×行业热力矩阵
export function Dims({ open }) {
  const [d, setD] = useState(null), [dim, setDim] = useState('all'), [sec, setSec] = useState(null), [multi, setMulti] = useState(false), [err, setErr] = useState(null);
  useEffect(() => { api.call('dims:get').then(setD).catch(e => setErr(e.message)); }, []);
  if (err) return <><PH icon="stack-line" title="机会维度" /><div className="err"><I n="error-warning-line" /> 加载失败：{err}</div></>;
  if (!d) return <><PH icon="stack-line" title="机会维度" /><div className="skel" style={{ height: 300 }} /></>;
  if (!d.cards?.length) return <><PH icon="stack-line" title="机会维度" /><Empty text="还没有维度结果：完成一次「刷新数据」或「重新聚类」后，15 个维度引擎会自动运行。" /></>;
  const secs = [...new Map(d.cards.map(c => [c.sector, c.sectorCn])).entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const dl = d.dims, mx = Math.max(1, ...Object.values(d.matrix));
  const data = []; dl.forEach(([id], y) => secs.forEach(([s], x) => { const v = d.matrix[id + '|' + s] || 0; data.push([x, y, v || '-']); }));
  const opt = { tooltip: { formatter: p => `${dl[p.value[1]][1]} × ${secs[p.value[0]][1]}：${p.value[2] === '-' ? 0 : p.value[2]} 个机会` }, grid: { left: 150, right: 20, top: 10, bottom: 70 },
    xAxis: { type: 'category', data: secs.map(s => s[1]), axisLabel: { rotate: 40, color: 'var(--mut)', fontSize: 11 }, splitArea: { show: true } }, yAxis: { type: 'category', data: dl.map(x => x[1]), inverse: true, axisLabel: { color: 'var(--mut)', fontSize: 11 } },
    visualMap: { min: 0, max: mx, show: false, inRange: { color: ['var(--heat0)', 'var(--heat1)', 'var(--heat2)', 'var(--heat3)'] } }, series: [{ type: 'heatmap', data, label: { show: true, color: 'var(--tx)', fontSize: 10 } }] };
  const onCell = p => { setDim(dl[p.value[1]][0]); setSec(secs[p.value[0]][0]); };
  const list = d.cards.filter(c => (dim === 'all' || c.dim === dim) && (!sec || c.sector === sec) && (!multi || c.multi > 1));
  const DN = Object.fromEntries(dl.map(x => [x[0], x]));
  return <><PH icon="stack-line" title="机会维度" sub={`15 个独立发现引擎 · ${d.cards.length} 张机会卡片 · ${Object.values(d.counts).filter(Boolean).length}/15 个维度有命中 · 多维命中 ${d.cards.filter(c => c.multi > 1).length} · 运行于 ${new Date(d.ts || d.at).toLocaleString('zh-CN')}`} />
    <div className="filters"><button className={dim === 'all' ? '' : 's'} onClick={() => setDim('all')}>全部 {d.cards.length}</button>
      {dl.map(([id, n, ic]) => <button key={id} className={dim === id ? '' : 's'} onClick={() => setDim(id)} title={n}><I n={ic} /> {n} <span className="mut">{d.counts[id] || 0}</span></button>)}
      <label className="chip"><input type="checkbox" checked={multi} onChange={e => setMulti(e.target.checked)} /> 仅多维命中</label>
      {sec && <button className="s" onClick={() => setSec(null)}><I n="close-line" /> 行业：{secs.find(s => s[0] === sec)?.[1]}</button>}</div>
    <div className="card"><h3><span><I n="grid-line" /> 维度 × 行业热力矩阵（点击格子筛选）</span></h3><Chart option={opt} h={460} onClick={onCell} /></div>
    <div className="card" style={{ marginTop: 12 }}><h3><span><I n="list-check-2" /> 机会卡片（{list.length}）</span><span className="mut" style={{ fontSize: 11 }}>最终分 = 维度分 + 8×(命中维度数−1)</span></h3>
      {!list.length ? <Empty text="该筛选下没有机会。" /> : list.slice(0, 120).map(c => <div key={c.id} className="kpi" style={{ marginBottom: 8 }}>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}><b style={{ fontSize: 18, width: 42 }}>{c.final}</b><div className="sp"><b>{c.title}</b>
          <div className="mut" style={{ fontSize: 11 }}><I n={DN[c.dim]?.[2]} /> {c.dimName} · {c.industryName}{c.sub ? ' · ' + c.sub : ''}</div></div>
          {c.dimsHit?.length > 1 && <span className="tag o" title="同一语义簇命中多个维度">多维 ×{c.multi}：{c.dimsHit.map(x => DN[x]?.[1]).join(' / ')}</span>}
          {c.oppId && <button className="s" onClick={() => open(c.oppId)}><I n="arrow-right-up-line" /> 机会详情</button>}</div>
        <div style={{ fontSize: 12, margin: '6px 0' }}>{c.why}</div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6, fontSize: 11 }}>{Object.entries(c.metrics || {}).map(([k, v]) => <span key={k} className="tag"><span className="prov m" title="实测">●</span> {k}：{String(v)}</span>)}</div>
        <div className="mut" style={{ fontSize: 11, marginTop: 4 }}><I n="ruler-line" /> 判定规则：{c.rule}</div>
        <div style={{ fontSize: 11, marginTop: 4 }}>{c.evidence?.slice(0, 3).map((e, i) => <div key={i}><L u={e.url}>{e.title?.slice(0, 90)}</L> <span className="mut">{e.source}</span></div>)}</div>
      </div>)}</div></>;
}
