// v2.1 标准交互组件：命令面板、首次引导、提醒抽屉、错误边界、中英文、主题、观察列表、标准数据表
import { React, useEffect, useState, useMemo, api, I, Empty, PH, STAGES } from './ui.jsx';
import * as WBmod from '../electron/workbench.js';
const WB = WBmod.default || WBmod;
const EN = { 工作台: 'Workbench', 收件箱: 'Inbox', 工作循环: 'Loop', 工作简报: 'Briefs', 工作区: 'Workspace', 待分拣: 'To triage', 已收录: 'Saved', 已忽略: 'Dismissed', 稍后: 'Snooze', 今日待办: 'Due today', 管道中: 'In pipeline', 管道一览: 'Pipeline snapshot', 跟进任务: 'Follow-ups', 可打印预览: 'Print preview', '导出 CSV': 'Export CSV', '导出 HTML': 'Export HTML', 总览: 'Overview', 信号流: 'Signals', 机会雷达: 'Radar', 机会维度: 'Dimensions', 机会详情: 'Detail', 不对称信息: 'Asymmetry', 资本与融资: 'Capital', 行业覆盖度: 'Coverage', 产业链: 'Supply chain', 论文与统计: 'Papers & stats', 宏观与贸易: 'Macro & trade', 机会看板: 'Pipeline', 验证工作流: 'Validation', 机会对比: 'Compare', 观察列表: 'Watchlist', 提醒: 'Alerts', 数据源: 'Sources', '报告与 IC 备忘录': 'Reports & IC memo', 共享协作: 'Share', 运行日志: 'Logs', 设置: 'Settings',
  发现: 'Discover', 筛选: 'Screen', 研究: 'Research', 验证: 'Validate', 决策: 'Decide', 跟踪: 'Track', 工具: 'Tools', 立即采集: 'Collect now', 重新聚类: 'Re-cluster', 报告: 'Report', 就绪: 'Ready', 采集中: 'Collecting', 搜索: 'Search', 初筛: 'Screen', 深研: 'Deep dive', 立项: 'Go', 放弃: 'Drop' };
let LANG = localStorage.getItem('lang') || 'zh';
export const t = s => (LANG === 'en' && EN[s]) || s;
import { EXACT, PHRASES, TERMS } from './i18n-en.js';
// v4.8 数据内容：行业/板块名（来自 GICS 表的官方英文名）在运行时并入词典
api.call('industries').then(L => { for (const i of L || []) { if (i.cn && i.en) EXACT[i.cn] = i.en; if (i.sectorCn && i.sectorEn) EXACT[i.sectorCn] = i.sectorEn; } EXACT['跨行业'] = 'Cross-industry'; }).catch(() => {});
// 英文版正文：遍历文本节点，整句命中词典则替换，否则做短语替换；MutationObserver 跟随渲染（原文存进 __zh，切回中文时还原）
const HAN = /[\u4e00-\u9fa5]/; let obs = null;
const trNode = n => { const raw = n.__zh ?? n.nodeValue; if (!HAN.test(raw)) return; const s = raw.trim(); let out = EXACT[s] ? raw.replace(s, EXACT[s]) : raw; if (out === raw && s.includes(' · ')) { const tk = s.split(' · ').map(t => EXACT[t] || TERMS[t] || t); const j = tk.join(' · '); if (j !== s) out = raw.replace(s, j); } if (out === raw) for (const [a, b] of PHRASES) if (out.includes(a)) out = out.split(a).join(b); if (out !== raw) { n.__zh = raw; if (n.nodeValue !== out) n.nodeValue = out; } };
const walk = root => { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) trNode(n); root.querySelectorAll?.('[placeholder],[title]').forEach(el => { for (const a of ['placeholder', 'title']) { const v = el.getAttribute(a); if (v && HAN.test(v) && EXACT[v.trim()]) el.setAttribute(a, EXACT[v.trim()]); } }); };
const restore = () => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.__zh != null) { n.nodeValue = n.__zh; delete n.__zh; } };
export function applyLang(l) { try { window.__dimEn = l === 'en' ? Object.fromEntries([['demand_gap','Demand gap'],['tech_transfer','Tech transfer'],['geo_arbitrage','Geo arbitrage'],['policy','Policy'],['chokepoint','Chokepoint'],['capital','Capital'],['talent','Talent'],['cost_curve','Cost inflection'],['trend_accel','Trend accel'],['competitor_weak','Competitor weak'],['platform','Platform'],['tender','Tenders'],['trade','Trade'],['model_transfer','Model transfer'],['substitute','Substitute']]) : null; } catch {}  document.documentElement.lang = l === 'en' ? 'en' : 'zh'; if (l === 'en') { walk(document.body); if (!obs) { obs = new MutationObserver(ms => { obs.disconnect(); for (const m of ms) { if (m.type === 'characterData') { delete m.target.__zh; trNode(m.target); } m.addedNodes.forEach(x => x.nodeType === 3 ? trNode(x) : x.nodeType === 1 && walk(x)); } obs.observe(document.body, { childList: true, subtree: true, characterData: true }); }); obs.observe(document.body, { childList: true, subtree: true, characterData: true }); } } else { obs?.disconnect(); obs = null; restore(); } }
export const setLang = l => { LANG = l; localStorage.setItem('lang', l); api.call('lang:set', l).catch(() => {}); setTimeout(() => applyLang(l), 0); };
if (LANG === 'en') setTimeout(() => applyLang('en'), 500);
api.call('lang:set', LANG).catch(() => {});
export const getLang = () => LANG;
export const applyTheme = th => { document.documentElement.dataset.theme = th; localStorage.setItem('theme', th); };
applyTheme(localStorage.getItem('theme') || 'dark');

export class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { e: null }; }
  static getDerivedStateFromError(e) { return { e }; }
  render() { return this.state.e ? <div className="err" style={{ margin: 24 }}><I n="error-warning-line" /> 该视图渲染出错：{String(this.state.e.message || this.state.e)}<div><button onClick={() => this.setState({ e: null })}><I n="refresh-line" /> 重试</button></div></div> : this.props.children; }
}

// Ctrl+K 命令面板：视图跳转 + 机会搜索 + 命令
export function Palette({ views, opps, cmds, go, open, close, sel, onCommand, pending }) {
  const [q, setQ] = useState(''), [i, setI] = useState(0);
  const items = useMemo(() => { const s = q.toLowerCase(), m = x => !s || x.toLowerCase().includes(s);
    const selOpp = (opps || []).find(o => o.id === sel);
    const parsed = (q.trim() ? WB.parseWorkbenchCommand(q, { opps, selOpp, pending: pending || [] }) : []).map(it => ({ ic: it.action === 'task:add' ? 'list-check-2' : it.action === 'inbox:triage' ? 'clipboard-line' : 'apps-2-line', t: it.label, k: it.group, f: () => onCommand ? onCommand(it) : (it.action === 'go' && go(it.payload)), noop: it.action === 'noop' }));
    return [...parsed, ...views.filter(v => m(v[1] + ' ' + t(v[1]) + ' ' + v[0])).map(v => ({ ic: v[2], t: t(v[1]), k: '视图', f: () => go(v[0]) })),
      ...cmds.filter(c => m(c[1])).map(c => ({ ic: c[0], t: c[1], k: '命令', f: c[2] })),
      ...opps.filter(o => s && m(o.title + ' ' + o.industryName + ' ' + (o.theme || ''))).slice(0, 12).map(o => ({ ic: 'lightbulb-line', t: o.title, k: o.industryName + ' · ' + o.total, f: () => open(o.id) }))].slice(0, 30); }, [q, opps, sel, pending]);
  const run = it => { if (it?.noop) return; close(); it?.f(); };
  return <div className="palette" onClick={close}><div className="box" onClick={e => e.stopPropagation()}>
    <input autoFocus placeholder="跳转、搜索机会，或输入「任务 标题 @机会」「收录 关键词」（↑↓ Enter Esc）" value={q} onChange={e => { setQ(e.target.value); setI(0); }}
      onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setI(x => Math.min(items.length - 1, x + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setI(x => Math.max(0, x - 1)); } else if (e.key === 'Enter') run(items[i]); else if (e.key === 'Escape') close(); }} />
    <div className="list">{items.length ? items.map((it, k) => <a key={k} className={k === i ? 'on' : ''} onMouseEnter={() => setI(k)} onClick={() => run(it)}><I n={it.ic} /><span className="sp">{it.t}</span><span className="mut" style={{ fontSize: 11 }}>{it.k}</span></a>) : <Empty text="没有匹配项" />}</div></div></div>;
}

// 首次引导：角色 / 关注行业 / 地区 → 决定默认首页与筛选
export const ROLES = [['founder', '创业者 / 独立开发者', 'user-star-line', 'dims', '从「机会维度」开始找切口；完整循环（分拣、跟进、简报）请用「工作台」'], ['vc', 'VC 分析师', 'briefcase-4-line', 'radar', '从「机会雷达」开始筛选并生成 IC 备忘录；日常跟进请用「工作台」和管道'], ['corp', '企业战略', 'building-4-line', 'chain', '从「产业链」开始看卡脖子与贸易；把线索收进管道后在工作台跟进']];
export const REGIONS = ['中国', '美国', '欧洲', '日本', '韩国', '印度', '东南亚', '拉美', '中东', '非洲'];
export function Onboarding({ sectors, done }) {
  const [step, setStep] = useState(0), [role, setRole] = useState('founder'), [secs, setSecs] = useState([]), [regs, setRegs] = useState(['中国', '美国']);
  const tog = (a, set, v) => set(a.includes(v) ? a.filter(x => x !== v) : [...a, v]);
  return <div className="onb"><div className="card">
    <h3><span><I n="compass-3-line" /> 欢迎使用商机雷达 · 第 {step + 1}/3 步</span></h3>
    {step === 0 && <><p className="mut">你的角色会记住，并推荐工作流。默认首页是「工作台」；若要沿用 5.0 的角色首页，可在设置里改回。</p>{ROLES.map(r => <a key={r[0]} className={'opt' + (role === r[0] ? ' on' : '')} onClick={() => setRole(r[0])}><I n={r[2]} /><div><b>{r[1]}</b><div className="mut" style={{ fontSize: 12 }}>{r[4]}</div></div></a>)}</>}
    {step === 1 && <><p className="mut">关注的行业（GICS 一级，可多选；不选 = 全部）。</p><div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{sectors.map(([k, n]) => <label key={k} className={'chip' + (secs.includes(k) ? ' on' : '')}><input type="checkbox" checked={secs.includes(k)} onChange={() => tog(secs, setSecs, k)} />{n}</label>)}</div></>}
    {step === 2 && <><p className="mut">关注的地区（用于覆盖度和地域套利提示）。</p><div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{REGIONS.map(r => <label key={r} className={'chip' + (regs.includes(r) ? ' on' : '')}><input type="checkbox" checked={regs.includes(r)} onChange={() => tog(regs, setRegs, r)} />{r}</label>)}</div></>}
    <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 16 }}><button className="s" onClick={() => done({ role: 'founder', sectors: [], regions: [] })}>跳过</button>{step > 0 && <button className="s" onClick={() => setStep(step - 1)}>上一步</button>}
      {step < 2 ? <button onClick={() => setStep(step + 1)}>下一步 <I n="arrow-right-line" /></button> : <button onClick={() => done({ role, sectors: secs, regions: regs })}><I n="check-line" /> 完成</button>}</div></div></div>;
}

// 提醒中心（右侧抽屉）
export function AlertDrawer({ close, open }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.call('notif:list').then(setRows).catch(() => setRows([])); }, []);
  return <div className="drawer" onClick={e => e.stopPropagation()}><h3><span><I n="notification-3-line" /> 提醒中心</span><span><button className="s" onClick={async () => { await api.call('notif:read'); setRows(r => r.map(x => ({ ...x, read: 1 }))); }}>全部已读</button> <button className="x" onClick={close}><I n="close-line" /></button></span></h3>
    {!rows ? <div className="skel" style={{ height: 200 }} /> : !rows.length ? <Empty text="暂无提醒。到期或逾期的跟进任务会在这里出现；也可在「提醒」里设置关键词、行业或分数阈值规则。" /> : rows.map(r => <div key={r.id} className={'kpi' + (r.read ? '' : ' unread')} style={{ marginBottom: 6, cursor: WB.notifOpenTarget(r.ref) ? 'pointer' : 'default' }} onClick={() => { const id = WB.notifOpenTarget(r.ref); if (id) open(id, 'work'); }}>
      <b style={{ fontSize: 13 }}>{r.title}</b><div className="mut" style={{ fontSize: 11 }}>{r.body}</div><div className="mut" style={{ fontSize: 10 }}>{new Date(r.ts).toLocaleString('zh-CN')}</div></div>)}</div>;
}

// 标准数据表：排序、列选择、多选批量操作、CSV 导出
export function DataTable({ rows, cols, onRow, batch = [], id = 'id', name = 'table' }) {
  const [sort, setSort] = useState(null), [hide, setHide] = useState(() => JSON.parse(localStorage.getItem('cols:' + name) || '[]')), [sel, setSel] = useState(new Set()), [cm, setCm] = useState(false);
  const vis = cols.filter(c => !hide.includes(c.k));
  // v4.8 数字列右对齐：显式 num 或「取值中 ≥80% 为数字」的列自动右对齐（Primer / Visa 表格规范）
  const isNum = useMemo(() => Object.fromEntries(cols.map(c => { if (c.num != null) return [c.k, c.num]; const xs = rows.slice(0, 50).map(r => c.v ? c.v(r) : r[c.k]).filter(x => x != null && x !== '' && x !== -1); return [c.k, xs.length > 0 && xs.filter(x => typeof x === 'number' && isFinite(x)).length / xs.length >= .8]; })), [rows, cols]);
  const data = useMemo(() => { if (!sort) return rows; const c = cols.find(x => x.k === sort.k), v = r => c.v ? c.v(r) : r[c.k]; return [...rows].sort((a, b) => { const x = v(a), y = v(b); return (x > y ? 1 : x < y ? -1 : 0) * (sort.d ? -1 : 1); }); }, [rows, sort]);
  const csv = () => { const esc = s => `"${String(s ?? '').replace(/"/g, '""')}"`; const txt = '\ufeff' + [vis.map(c => esc(c.n)).join(','), ...data.filter(r => !sel.size || sel.has(r[id])).map(r => vis.map(c => esc(c.v ? c.v(r) : r[c.k])).join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv' })); a.download = name + '.csv'; a.click(); };
  const togH = k => { const h = hide.includes(k) ? hide.filter(x => x !== k) : [...hide, k]; setHide(h); localStorage.setItem('cols:' + name, JSON.stringify(h)); };
  return <div className="dt"><div className="dt-tools"><span className="mut">{rows.length} 行{sel.size ? ` · 已选 ${sel.size}` : ''}</span><span className="sp" />
    {sel.size > 0 && <span className="batch">{batch.map(([ic, n, f]) => <button key={n} className="s" onClick={() => { f([...sel]); setSel(new Set()); }}><I n={ic} /> {n}</button>)}</span>}
    <span style={{ position: 'relative' }}><button className="s" onClick={() => setCm(!cm)}><I n="layout-column-line" /> 列</button>{cm && <div className="colmenu">{cols.map(c => <label key={c.k}><input type="checkbox" checked={!hide.includes(c.k)} onChange={() => togH(c.k)} /> {c.n}</label>)}</div>}</span>
    <button className="s" onClick={csv}><I n="file-excel-2-line" /> 导出 CSV</button></div>
    {!rows.length ? <Empty text="没有数据" /> : <table><thead><tr><th style={{ width: 24 }}><input type="checkbox" checked={sel.size === rows.length} onChange={e => setSel(e.target.checked ? new Set(rows.map(r => r[id])) : new Set())} /></th>{vis.map(c => <th key={c.k} onClick={() => setSort(s => ({ k: c.k, d: s?.k === c.k ? !s.d : true }))} className={isNum[c.k] ? 'num' : ''} style={{ cursor: 'pointer', width: c.w }}>{c.n} {sort?.k === c.k && <I n={sort.d ? 'arrow-down-s-line' : 'arrow-up-s-line'} />}</th>)}</tr></thead>
      <tbody>{data.slice(0, 500).map(r => <tr key={r[id]} onClick={() => onRow?.(r)} onContextMenu={e => r.__ctx?.(e)}><td onClick={e => e.stopPropagation()}><input type="checkbox" checked={sel.has(r[id])} onChange={() => { const s = new Set(sel); s.has(r[id]) ? s.delete(r[id]) : s.add(r[id]); setSel(s); }} /></td>{vis.map(c => <td key={c.k} className={isNum[c.k] ? 'num' : ''}>{c.r ? c.r(r) : c.v ? c.v(r) : r[c.k]}</td>)}</tr>)}</tbody></table>}</div>;
}

// 统一筛选条：行业 / 地区 / 时间 / 分数 / 置信度 / 来源，可保存为视图
export const F0 = { sector: '', region: '', days: 30, minScore: 0, minConf: 0, source: '', dim: '' };
export function applyF(opps, f) { const now = Date.now() / 1000; return opps.filter(o => (!f.sector || (o.industry || '').startsWith(f.sector)) && (!f.region || (o.regions || []).includes?.(f.region) || JSON.stringify(o.regionMix || '').includes(f.region)) && (!f.days || !o.updated || o.updated > now - f.days * 86400 || o.updated > 1e12) && (o.total || 0) >= f.minScore && (o.conf || 0) >= f.minConf && (!f.source || (o.sources || []).some?.(s => (s.id || s) === f.source)) && (!f.dim || (o.dimHits || []).includes(f.dim))); }
export function FilterBar({ f, setF, sectors, dims = [] }) {
  const [views, setViews] = useState(() => JSON.parse(localStorage.getItem('views') || '[]')), [nm, setNm] = useState(null);
  const save = n => { setNm(null); if (!n) return; const v = [...views.filter(x => x.n !== n), { n, f }]; setViews(v); localStorage.setItem('views', JSON.stringify(v)); };
  const S = (k, v) => setF({ ...f, [k]: v });
  return <div className="fbar"><I n="filter-3-line" />
    <select value={f.sector} onChange={e => S('sector', e.target.value)}><option value="">全部行业</option>{sectors.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
    <select value={f.region} onChange={e => S('region', e.target.value)}><option value="">全部地区</option>{REGIONS.map(r => <option key={r}>{r}</option>)}</select>
    <select value={f.days} onChange={e => S('days', +e.target.value)}>{[[7, '近 7 天'], [14, '近 14 天'], [30, '近 30 天'], [0, '全部时间']].map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
    <label className="chip">分数 ≥ <input type="number" min="0" max="100" step="5" value={f.minScore} onChange={e => S('minScore', +e.target.value)} style={{ width: 48 }} /></label>
    <label className="chip">置信度 ≥ <input type="number" min="0" max="1" step=".1" value={f.minConf} onChange={e => S('minConf', +e.target.value)} style={{ width: 48 }} /></label>
    {dims.length > 0 && <select value={f.dim} onChange={e => S('dim', e.target.value)}><option value="">全部维度</option>{dims.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>}
    <button className="s" onClick={() => setF(F0)}><I n="eraser-line" /> 重置</button>{nm == null ? <button className="s" onClick={() => setNm('')}><I n="bookmark-line" /> 保存视图</button> : <span className="chip"><input autoFocus placeholder="视图名称，回车保存" value={nm} onChange={e => setNm(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(nm.trim()); if (e.key === 'Escape') setNm(null); }} style={{ width: 140 }} /></span>}
    {views.map(v => <span key={v.n} className="chip"><a onClick={() => setF({ ...F0, ...v.f })}>{v.n}</a> <I n="close-line" onClick={() => { const x = views.filter(y => y.n !== v.n); setViews(x); localStorage.setItem('views', JSON.stringify(x)); }} /></span>)}</div>;
}

// 观察列表
export function Watchlist({ allOpps, open, upd, oppCtx }) {
  const rows = allOpps.filter(o => o.watched).map(o => ({ ...o, __ctx: e => oppCtx(e, o) }));
  const SN = Object.fromEntries(STAGES.map(s => [s[0], s[1]]));
  return <><PH icon="star-line" title="观察列表" sub={`${rows.length} 个观察中的机会 · 分数变化与新证据会进入提醒中心`} />
    {!rows.length ? <Empty text="还没有观察的机会。在机会上右键 →「加入观察」，或在详情页点星标。" /> :
      <DataTable name="watchlist" rows={rows} onRow={r => open(r.id)} cols={[{ k: 'title', n: '机会', r: r => <b>{r.title}</b> }, { k: 'industryName', n: '行业' }, { k: 'total', n: '综合分', w: 70 }, { k: 'conf', n: '置信度', w: 70 }, { k: 'stage', n: '阶段', v: r => SN[r.stage] || r.stage, w: 70 }, { k: 'dimHits', n: '命中维度', v: r => (r.dimHits || []).length, w: 80 }, { k: 'stale', n: '状态', v: r => r.stale ? '已不在当前簇（快照）' : '活跃', w: 120 }]}
        batch={[['star-off-line', '取消观察', ids => ids.forEach(id => upd(id, { watched: false }))], ...STAGES.map(([k, n, ic]) => [ic.slice(3), '移到' + n, ids => ids.forEach(id => upd(id, { stage: k }))])]} />}</>;
}
