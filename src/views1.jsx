import { React, useEffect, useState, api, I, D, KIND, CATC, STAGES, fmt, $M, Src, L, Bar, Conf, Life, Ev, PH, Chart, radarOpt, grid, axl, Empty } from './ui.jsx';
import { FilterBar, DataTable, applyF, F0 } from './shell21.jsx';
function DailyBrief() { const [b, setB] = useState(null), [ex, setEx] = useState(false), [ld, setLd] = useState(false);
  useEffect(() => { api.call('brief:daily').then(setB); return api.on('brief', () => api.call('brief:daily').then(setB)); }, []);
  const gen = async () => { setLd(true); try { setB(await api.call('brief:daily', true)); } finally { setLd(false); } };
  const lines = (b?.md || '').split('\n').filter(l => /^\d+\. \*\*/.test(l)).slice(0, 3).map(l => l.replace(/\*\*/g, '').replace(/\[\d+\]/g, ''));
  return <div className="card brief" style={{ marginTop: 12 }}><h3><span><I n="newspaper-line" /> 每日简报 {b ? <span className="mut" style={{ fontWeight: 400 }}>{b.day}</span> : null}</span><span className="row" style={{ gap: 6 }}><button className="ghost" onClick={gen} disabled={ld}><I n={ld ? 'loader-4-line' : 'refresh-line'} />{b ? '重新生成' : '立即生成'}</button>{b && <button className="ghost" onClick={() => setEx(!ex)}><I n="file-text-line" />{ex ? '收起' : '全文'}</button>}<button className="ghost" onClick={() => api.call('brief:daily:open')}><I n="folder-open-line" />文件夹</button></span></h3>
    {!b ? <div className="mut">每日快照后自动生成（可在设置中关闭），也可以点「立即生成」。简报只保存在本机，不会外发。</div> : ex ? <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 420, overflow: 'auto' }}>{b.md}</pre> : <div>{lines.map((l, i) => <div key={i} style={{ fontSize: 12, padding: '2px 0' }}>{l}</div>)}</div>}</div>; }
export function Dash({ opps, stats, open, refresh, busy, oppCtx }) {
  const top = opps.filter(o => !o.quality?.noise).slice(0, 8), cats = (stats?.bySource || []).slice(0, 12).map(r => [r.source, r.n]), kinds = (stats?.byCat || []).map(r => [r.kind, r.n]), asym = opps.filter(o => o.asymmetry.length && !o.quality?.noise).slice(0, 6);
  if (!stats?.total) return <><PH icon="dashboard-3-line" title="总览" /><Empty refresh={refresh} busy={busy} /></>;
  return <><PH icon="dashboard-3-line" title="总览" sub={`信号 ${stats.total.toLocaleString()} · 机会 ${opps.length} · 来源 ${stats.bySource.length} · 上次采集 ${fmt(stats.lastRun)}`}><button onClick={() => refresh()} disabled={busy}><I n={busy ? 'loader-4-line' : 'refresh-line'} />{busy ? '采集中…' : '立即采集'}</button></PH>
    <div className="grid g4"><div className="kpi"><span className="l">信号库</span><b>{stats.total.toLocaleString()}</b><span className="mut">24h 采集 {stats.day}</span></div><div className="kpi"><span className="l">机会簇</span><b>{opps.length}</b><span className="mut">观察 {opps.filter(o => o.watched).length}</span></div><div className="kpi"><span className="l">行业覆盖</span><b>{new Set(opps.map(o => o.industry).filter(Boolean)).size}</b><span className="mut">机会涉及子行业 / 74</span></div><div className="kpi"><span className="l">平均评分</span><b>{opps.length ? Math.round(opps.reduce((a, o) => a + o.total, 0) / opps.length) : 0}</b><span className="mut">嵌入 {stats.embed?.ready ? '就绪' : '加载中'}</span></div></div>
    <DailyBrief />
    <div className="grid g21" style={{ marginTop: 12 }}><div className="card"><h3><span><I n="trophy-line" /> Top 机会</span></h3>{!top.length ? <Empty /> : <table><thead><tr><th>评分</th><th>机会</th><th>行业</th><th>信号</th><th>来源</th><th>不对称</th></tr></thead><tbody>{top.map(o => <tr key={o.id} onClick={() => open(o.id)} onContextMenu={e => oppCtx(e, o)}><td><span className="score">{o.total}</span></td><td><b>{o.title}</b><div className="mut" style={{ fontSize: 11 }}>{o.theme}</div></td><td><span className="tag">{o.industryName}</span></td><td>{o.metrics.signals}</td><td>{o.sources.length}</td><td>{o.asymmetry[0] ? <span className="tag p">{o.asymmetry[0].type}</span> : '—'}</td></tr>)}</tbody></table>}</div>
      <div className="card"><h3><span><I n="pie-chart-line" /> 来源 Top12 与类型</span></h3><Chart h={220} option={{ tooltip: { trigger: 'item' }, series: [{ type: 'pie', radius: ['42%', '68%'], label: { color: 'var(--mut)', fontSize: 11 }, data: cats.map(([n, v]) => ({ name: n, value: v })) }] }} /><Chart h={160} option={{ grid, xAxis: { type: 'category', data: kinds.map(k => KIND[k[0]] || k[0]), axisLabel: { rotate: 30, fontSize: 10 } }, yAxis: { type: 'value', splitLine: axl }, series: [{ type: 'bar', data: kinds.map(k => k[1]), itemStyle: { color: 'var(--ac)' } }] }} /></div></div>
    {asym.length > 0 && <div className="card" style={{ marginTop: 12 }}><h3><span><I n="scales-3-line" /> 显著不对称信息</span></h3><div className="grid g3">{asym.map(o => <div key={o.id} className="kpi" style={{ cursor: 'pointer' }} onClick={() => open(o.id)}><span className="l">{o.title}</span><b style={{ fontSize: 13 }}>{o.asymmetry[0].type}</b><span className="mut" style={{ fontSize: 11 }}>{o.asymmetry[0].desc}</span><span className="mut">评分 {o.total} · 置信度 {o.conf}</span></div>)}</div></div>}</>;
}
export function Signals({ open, refresh, busy, ind, inds }) {
  const IN = Object.fromEntries((inds || []).map(i => [i.code, i.cn]));
  const [rows, setRows] = useState([]), [src, setSrc] = useState(''), [kind, setKind] = useState(''), [q, setQ] = useState(''), [page, setPage] = useState(0);
  const load = () => api.call('signals:list', { q, source: src || undefined, ind: ind || undefined, limit: 400 }).then(r => setRows(r.filter(x => !kind || x.kind === kind)));
  useEffect(() => { load(); }, [q, src, kind, page, ind]);
  return <><PH icon="broadcast-line" title="信号流" sub="每条信号都可点击打开原文；附带可信度权重与行业标签"><button className="s" onClick={load}><I n="refresh-line" /></button><button onClick={() => refresh()} disabled={busy}><I n="download-cloud-2-line" />立即采集</button></PH>
    <div className="fbar"><I n="filter-3-line" /><input placeholder="搜索标题…" value={q} onChange={e => { setQ(e.target.value); setPage(0); }} /><select value={kind} onChange={e => { setKind(e.target.value); setPage(0); }}><option value="">全部类型</option>{Object.entries(KIND).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select><select value={src} onChange={e => { setSrc(e.target.value); setPage(0); }}><option value="">全部来源</option>{[...new Set(rows.map(r => r.source))].sort().map(s => <option key={s}>{s}</option>)}</select></div>
    {!rows.length ? <Empty refresh={refresh} busy={busy} /> : <div className="card"><DataTable name="signals" rows={rows} onRow={r => api.call('open:url', r.url)} cols={[{ k: 'ts', n: '时间', w: 90, r: r => <span className="mut">{fmt(r.ts)}</span> }, { k: 'source', n: '来源', w: 120, r: r => <Src s={r.source} /> }, { k: 'kind', n: '类型', w: 70, v: r => KIND[r.kind] || r.kind, r: r => <span className="tag n">{KIND[r.kind] || r.kind}</span> }, { k: 'ind', n: '行业', w: 130, v: r => IN[r.ind] || '', r: r => r.ind ? <span className="tag" title={'打标方式：' + r.ind_by}>{IN[r.ind] || r.ind}</span> : '—' }, { k: 'title', n: '标题', r: r => <b>{r.title}</b> }, { k: 'engagement', n: '热度', w: 70, v: r => Math.round(r.engagement || 0) }, { k: 'url', n: '链接', w: 60, r: () => <I n="external-link-line" /> }]} /></div>}</>;
}
export function Radar({ opps, open, refresh, busy, oppCtx, inds = [], upd }) {
  const [hideNoise, setHN] = useState(true), [f, setF] = useState(() => ({ ...F0, ...JSON.parse(localStorage.getItem('radarF') || '{}') })), [dims, setDims] = useState([]);
  useEffect(() => { api.call('dims:get').then(d => setDims(d?.dims || [])).catch(() => {}); }, []);
  useEffect(() => localStorage.setItem('radarF', JSON.stringify(f)), [f]);
  if (!opps.length) return <><PH icon="radar-line" title="机会雷达" /><Empty refresh={refresh} busy={busy} /></>;
  const sectors = [...new Map(inds.map(i => [i.sector, i.sectorCn])).entries()], DN = Object.fromEntries(dims.map(d => [d[0], d[1]])), SN = Object.fromEntries(STAGES.map(s => [s[0], s[1]]));
  const rows = applyF(opps, f).filter(o => !hideNoise || !o.quality?.noise).map(o => ({ ...o, __ctx: e => oppCtx(e, o) }));
  return <><PH icon="radar-line" title="机会雷达" sub={`${opps.length} 个主题簇 · ${opps.filter(o => !o.quality?.noise).length} 个通过质量闸门 · 多维命中加权 +8/维 · 右键打开菜单`}><label className="row" style={{ fontSize: 12 }}><input type="checkbox" style={{ width: 14 }} checked={hideNoise} onChange={e => setHN(e.target.checked)} />隐藏背景/噪声簇</label></PH>
    <FilterBar f={f} setF={setF} sectors={sectors} dims={dims} />
    <div className="card"><DataTable name="radar" rows={rows} onRow={r => open(r.id)} cols={[
      { k: 'total', n: '评分', w: 60, r: r => <span className="score" title={r.dimBoost ? `含多维加权 +${r.dimBoost}` : ''}>{r.total}</span> }, { k: 'personal', n: '个人分', w: 76, v: r => r.personal?.on ? 10000 - (r.personal.rank || 9999) : r.total, r: r => r.personal?.on ? <span title={`基于你的 ${r.personal.n} 次观察/阶段反馈学习\n调整 ${r.personal.adj >= 0 ? '+' : ''}${r.personal.adj}\n${(r.personal.why || []).join('\n')}`}>{r.personal.score}{r.personal.explore ? <span className="tag o" style={{ fontSize: 9, marginLeft: 3 }} title="探索位：不在你偏好行业中的高分机会，用来避免排序只剩同一行业">探索</span> : null}{r.personal.adj ? <sup className={r.personal.adj > 0 ? 'ok' : 'mut'}>{r.personal.adj > 0 ? '+' : ''}{r.personal.adj}</sup> : null}</span> : <span className="mut" title={`至少需要 3 次观察/阶段反馈才启用（当前 ${r.personal?.n || 0}）`}>—</span> }, { k: 'conf', n: '置信', w: 70, r: r => <Conf v={r.conf} /> }, { k: 'mosaic', n: '体检分', w: 70, v: r => r.mosaic?.score ?? -1, r: r => r.mosaic ? <span title={`动能 ${r.mosaic.parts.momentum} · 市场 ${r.mosaic.parts.market} · 资金 ${r.mosaic.parts.money} · 人才 ${r.mosaic.parts.talent}（百分位）`}>{r.mosaic.score}</span> : '—' }, { k: 'life', n: '生命周期', w: 90, v: r => r.ts?.life?.stage || '', r: r => <Life l={r.ts?.life} /> },
      { k: 'title', n: '机会', r: r => <><b>{r.title}</b>{r.quality?.noise && <span className="tag">背景簇</span>}<div className="row" style={{ gap: 4, flexWrap: 'wrap', marginTop: 2 }}>{(r.dimHits || []).map(d => <span key={d} className="tag o" style={{ fontSize: 10 }}>{DN[d] || d}</span>)}</div></> },
      { k: 'industryName', n: '行业', w: 130 }, { k: 'n', n: '信号', w: 60, v: r => r.metrics?.signals ?? '' }, { k: 'dimHits', n: '维度数', w: 60, v: r => (r.dimHits || []).length },
      { k: 'asym', n: '不对称', w: 60, v: r => r.asymmetry?.length || 0 }, { k: 'stage', n: '阶段', w: 60, v: r => SN[r.stage] || r.stage }]}
      batch={[['star-line', '加入观察', ids => ids.forEach(id => upd(id, { watched: true }))], ['filter-3-line', '移到初筛', ids => ids.forEach(id => upd(id, { stage: 'screen' }))], ['close-circle-line', '放弃', ids => ids.forEach(id => upd(id, { stage: 'drop' }))]]} /></div></>;
}
export function Asym({ opps, open }) {
  const rows = opps.filter(o => o.asymmetry.length).sort((a, b) => Math.abs(b.asymMetrics.cnUs.value) - Math.abs(a.asymMetrics.cnUs.value));
  return <><PH icon="scales-3-line" title="不对称信息" sub="中美热度差 · 技术 vs 产品 · 需求/供给 · 资本/注意力 · 人才密度（相对全库基线的 log2 或比值）" />
    {!rows.length ? <Empty text="当前机会尚未形成显著不对称" /> : <div className="card"><DataTable name="asym" rows={rows} onRow={r => open(r.id)} cols={[
      { k: 'title', n: '机会', r: r => <b>{r.title}</b> },
      { k: 'cnUs', n: '中美', w: 70, v: r => r.asymMetrics.cnUs.value, r: r => r.asymMetrics.cnUs.value.toFixed(2) },
      { k: 'tp', n: '技术/产品', w: 80, v: r => r.asymMetrics.techProduct.value, r: r => r.asymMetrics.techProduct.value.toFixed(2) },
      { k: 'ds', n: '需求/供给', w: 80, v: r => r.asymMetrics.demandSupply.value, r: r => r.asymMetrics.demandSupply.value.toFixed(2) },
      { k: 'ca', n: '资本/注意力', w: 90, v: r => r.asymMetrics.capitalAttention.value, r: r => r.asymMetrics.capitalAttention.value.toFixed(2) },
      { k: 'talent', n: '人才', w: 60, v: r => r.asymMetrics.talent.value, r: r => r.asymMetrics.talent.value.toFixed(2) },
      { k: 'sum', n: '摘要', r: r => <span className="mut">{(r.asymmetry[0]?.desc || '').slice(0, 60)}</span> },
    ]} /></div>}</>;
}
export function Funding({ open }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.call('fundings').then(setData); }, []);
  if (!data) return <PH icon="money-dollar-circle-line" title="资本与融资" />;
  return <><PH icon="money-dollar-circle-line" title="资本与融资" sub={`新闻事件 ${data.events.length} · Form D ${data.formD.length} · S-1 ${data.s1.length}`} />
    <FundingTable data={data} /></>;
}
function FundingTable({ data }) { const [t, setT] = useState('all');
  const rows = [...data.events.map((e, i) => ({ id: 'n' + i, type: '融资新闻', ...e })), ...data.formD.map((e, i) => ({ id: 'd' + i, type: 'SEC Form D', ...e })), ...data.s1.map((e, i) => ({ id: 's' + i, type: 'SEC S-1/F-1', ...e }))].filter(r => t === 'all' || r.type === t);
  return <div className="card"><div className="tabs" style={{ marginBottom: 8 }}>{['all', '融资新闻', 'SEC Form D', 'SEC S-1/F-1'].map(k => <a key={k} className={t === k ? 'on' : ''} onClick={() => setT(k)}>{k === 'all' ? '全部' : k}</a>)}</div>
    <DataTable name="funding" rows={rows} onRow={() => {}} cols={[{ k: 'ts', n: '时间', w: 110, r: r => <span className="mut">{fmt(r.ts)}</span> }, { k: 'type', n: '类型', w: 100, r: r => <span className="tag">{r.type}</span> },
      { k: 'amountM', n: '金额(M)', w: 90, v: r => r.amountM ?? -1, r: r => r.amountM ? <span className="tag g">{r.currency}{r.amountM}M</span> : <span className="mut">—</span> }, { k: 'round', n: '轮次', w: 80, v: r => r.round || '' },
      { k: 'title', n: '标题', r: r => <L u={r.url}>{r.title}</L> }, { k: 'source', n: '来源', w: 100, v: r => r.source || (r.type.startsWith('SEC') ? 'SEC EDGAR' : '') }]} /></div>;
}
export function Coverage({ setView, setInd }) {
  const [cov, setCov] = useState(null);
  useEffect(() => { api.call('coverage').then(setCov); }, []);
  if (!cov) return <PH icon="grid-line" title="行业覆盖度" />;
  const rate = cov.total ? Math.round(100 * cov.good / cov.total) : 0, rate2 = cov.total ? Math.round(100 * cov.covered / cov.total) : 0; cov.ok = cov.covered - cov.good; cov.gap = cov.total - cov.covered; cov.rows = cov.list;
  return <><PH icon="grid-line" title="行业覆盖度" sub={`GICS 74 子行业 · 良好 ${cov.good} · 一般 ${cov.ok} · 缺口 ${cov.gap} · 实际覆盖率（良好） ${rate}%`}><button className="s" onClick={() => api.call('coverage').then(setCov)}><I n="refresh-line" /></button></PH>
    <div className="grid g4" style={{ marginBottom: 12 }}><div className="kpi"><span className="l">良好 (≥10 信号且 ≥3 源)</span><b className="up">{cov.good}</b></div><div className="kpi"><span className="l">一般</span><b>{cov.ok}</b></div><div className="kpi"><span className="l">缺口</span><b className="dn">{cov.gap}</b></div><div className="kpi"><span className="l">实际覆盖率</span><b>{rate}%</b><span className="mut">良好口径；含一般 {rate2}%</span></div></div>
    {cov.regions && <div className="card" style={{ marginBottom: 12 }}><h3><span><I n="earth-line" /> 按国家/地区（近 30 天，标题与正文中的国家/地区实体识别）</span><span className="mut">良好 ≥200 信号且 ≥8 源 · 一般 ≥50 且 ≥3</span></h3><div className="cov">{cov.regions.map(r => <div key={r.key} className={'cell ' + r.status} title={`${r.name}：信号 ${r.signals} · 来源 ${r.sources} · 涉及子行业 ${r.inds}`}><div className="n">{r.name}</div><div className="m">{r.signals} / {r.sources} 源 / {r.inds} 行业</div></div>)}</div></div>}
    <div className="cov">{cov.rows.map(r => <div key={r.code} className={'cell ' + r.status} onClick={() => { setInd(r.code); setView('signals'); }} title={`${r.code} ${r.cn} / ${r.en}\nGB/T 4754：${r.gb} ${r.gbName}\n近30天信号 ${r.signals} · 源 ${r.sources} · 机会 ${r.opps}\n${r.topSources.join('，')}`}><div className="n">{r.cn}</div><div className="m">{r.signals} / {r.sources}</div></div>)}</div>
    <p className="mut" style={{ marginTop: 10, fontSize: 11 }}>近 30 天已打标 {cov.tagged}/{cov.signals} 条信号（{(cov.tagBy || []).map(b => (b.ind_by || '未打标') + ' ' + b.n).join('，')}）。绿色=良好 · 黄色=一般 · 红色=缺口。点击格子可按该行业筛选信号流。覆盖率按「良好」口径计算，数据不足时如实显示，不做虚高。</p></>;
}
export function Macro() {
  const [m, setM] = useState(null), [busy, setBusy] = useState(false);
  const load = () => api.call('macro:get').then(setM);
  useEffect(() => { load(); }, []);
  const refresh = async () => { setBusy(true); await api.call('macro:refresh'); await load(); setBusy(false); };
  if (!m) return <PH icon="global-line" title="宏观与贸易" />;
  const wb = m.wb || {}, fred = m.fred || {}, com = m.comtrade?.rows || [], fv = (x, k) => x == null ? '—' : k === 'gdp' && Math.abs(x) >= 1e9 ? $M(x) : (+x).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return <><PH icon="global-line" title="宏观与贸易" sub={`World Bank · IMF · FRED · UN Comtrade（实测拉取）· 更新 ${m.ts ? new Date(m.ts).toLocaleString('zh-CN') : '—'}${m.errors?.length ? ' · 失败 ' + m.errors.length + ' 项' : ''}`}><button onClick={refresh} disabled={busy}><I n={busy ? 'loader-4-line' : 'refresh-line'} />刷新宏观</button></PH>
    <div className="grid g2"><div className="card"><h3><span><I n="bar-chart-2-line" /> World Bank 指标</span></h3><DataTable name="macro-wb" onRow={() => {}} rows={Object.entries(wb).map(([k, v]) => ({ id: k, k, ...v }))} cols={[{ k: 'name', n: '指标', r: r => <L u={r.url}>{r.name}</L> }, ...['USA', 'CHN', 'WLD'].map(c => ({ k: c, n: { USA: '美国', CHN: '中国', WLD: '世界' }[c], w: 120, v: r => r.values?.[c]?.v ?? null, r: r => <>{fv(r.values?.[c]?.v, r.k)}<span className="mut"> {r.values?.[c]?.year}</span></> })), { k: 'cn_us', n: '中/美', w: 70, v: r => r.values?.CHN?.v && r.values?.USA?.v ? +(r.values.CHN.v / r.values.USA.v).toFixed(2) : null }]} /></div>
      <div className="card"><h3><span><I n="funds-box-line" /> FRED（美国）</span></h3><DataTable name="macro-fred" onRow={() => {}} rows={Object.entries(fred).map(([k, v]) => ({ id: k, k, ...v }))} cols={[{ k: 'k', n: '序列', w: 110, r: r => <L u={r.url}>{r.k}</L> }, { k: 'name', n: '名称', r: r => <span className="mut">{r.name}</span> }, { k: 'last', n: '最新值', w: 110, v: r => r.last?.[1] ?? null, r: r => <><b>{r.last?.[1]}</b> <span className="mut">{r.last?.[0]}</span></> }, { k: 'yoy', n: '同比', w: 70, v: r => r.yoy ?? null, r: r => <span className={r.yoy >= 0 ? 'up' : 'dn'}>{r.yoy != null ? r.yoy + '%' : ''}</span> }, { k: 'via', n: '通道', w: 70 }]} />
        {m.imf && <><h3 style={{ marginTop: 10 }}><span>IMF 实际 GDP 增速 %</span></h3><table><tbody>{Object.entries(m.imf).map(([k, v]) => <tr key={k}><td>{v.name || k}</td><td>{Object.entries(v.values || {}).map(([c, x]) => `${c} ${x.year}: ${x.v ?? '—'}%（次年 ${x.next ?? '—'}%）`).join(' · ')} <L u={v.url}>来源</L></td></tr>)}</tbody></table></>}
        {m.errors?.length > 0 && <div className="mut" style={{ fontSize: 11, marginTop: 6 }}>失败：{m.errors.join('；')}</div>}</div></div>
    {com.length > 0 && <div className="card" style={{ marginTop: 12 }}><h3><span><I n="ship-2-line" /> {m.comtrade.name}（同比 %）</span></h3><Chart h={280} option={{ grid, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: com.map(c => 'HS' + c.hs), axisLabel: { rotate: 45, fontSize: 9 } }, yAxis: { type: 'value', splitLine: axl }, series: [{ name: '同比 %', type: 'bar', data: com.map(c => c.g), itemStyle: { color: p => p.value >= 0 ? 'var(--ok)' : 'var(--bad)' } }] }} /></div>}</>;
}
