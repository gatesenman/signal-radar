import { React, useEffect, useState, api, I, CATC, STAGES, fmt, Src, L, Bar, PH, Empty, Chart, radarOpt, D } from './ui.jsx';
export function Board({ opps, open, upd, oppCtx, say, refresh, busy, stats }) {
  const [over, setOver] = useState(null), [mode, setMode] = useState('board'), [preview, setPreview] = useState(null);
  const drop = async (e, k) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/opp'); if (id) { await upd(id, { stage: k }); say?.('已移到「' + STAGES.find(s => s[0] === k)[1] + '」'); } };
  const exp = async fmt => { const p = await api.call('pipeline:export', fmt); if (fmt === 'preview') setPreview(p); else p && say?.('已导出：' + p); };
  const live = opps.filter(o => !o.quality?.noise);
  if (!stats?.total && !live.length) return <><PH icon="kanban-view" title="机会看板" sub="阶段保存在本机数据库，关闭应用也不会丢" /><Empty refresh={refresh} busy={busy} text={busy ? '首次采集进行中，请稍候…聚类完成后机会会按「发现」进入管道。' : '还没有机会。请先采集并等待聚类，或从收件箱把信号分拣进来。'} /></>;
  return <><PH icon="kanban-view" title="机会看板" sub="拖拽卡片切换阶段：发现 → 初筛 → 深研 → 验证 → 立项 / 放弃。阶段写入本机数据库。也可导出 CSV 或打开可打印清单。">
    <div className="seg"><button className={mode === 'board' ? 'on' : ''} onClick={() => setMode('board')}>看板</button><button className={mode === 'list' ? 'on' : ''} onClick={() => setMode('list')}>列表</button></div>
    <button className="s" onClick={() => exp('csv')}><I n="file-excel-2-line" />导出 CSV</button>
    <button className="s" onClick={() => exp('html')}><I n="file-text-line" />导出 HTML</button>
    <button className="s" onClick={() => exp('preview')}>可打印预览</button>
  </PH>
    {preview && <div className="modal" onClick={() => setPreview(null)}><div className="card wb-preview" onClick={e => e.stopPropagation()} style={{ width: 'min(960px, 92vw)' }}><div className="row"><b>管道清单预览</b><span className="sp" /><button className="s" onClick={() => { const f = document.getElementById('pipe-print'); f?.contentWindow?.print(); }}>打印</button><button className="x" onClick={() => setPreview(null)}><I n="close-line" /></button></div><iframe id="pipe-print" title="管道清单" srcDoc={preview} /></div></div>}
    {mode === 'list' ? <div className="card"><table className="dt"><thead><tr><th>机会</th><th>行业</th><th>阶段</th><th className="num">综合分</th><th className="num">未完成任务</th><th>最近到期</th><th>备注</th></tr></thead>
      <tbody>{live.map(o => { const openT = (o.tasks || []).filter(t => !t.done); const next = openT.map(t => t.due).filter(Boolean).sort()[0] || '—'; return <tr key={o.id} onClick={() => open(o.id, 'work')} onContextMenu={e => oppCtx(e, o)}><td><b>{o.title}</b></td><td>{o.industryName}</td><td><select value={o.stage || 'discover'} onClick={e => e.stopPropagation()} onChange={e => upd(o.id, { stage: e.target.value })}>{STAGES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></td><td className="num">{o.total}</td><td className="num">{openT.length}</td><td>{next}</td><td className="mut">{(o.notes || '').slice(0, 80)}</td></tr>; })}</tbody></table></div> :
    <div className="kanban">{STAGES.map(([k, n, ic]) => { const list = opps.filter(o => (o.stage === 'research' && k === 'research') || o.stage === k); return <div key={k} data-stage={k} className={'col' + (over === k ? ' over' : '')} onDragOver={e => { e.preventDefault(); setOver(k); }} onDragLeave={() => setOver(null)} onDrop={e => drop(e, k)}><h4><I n={ic.slice(3)} />{n}<span className="cnt">{list.length}</span></h4>
      {!list.length && <div className="mut" style={{ fontSize: 11, padding: 8, textAlign: 'center' }}>拖到这里</div>}
      {list.slice(0, 60).map(o => <div key={o.id} data-opp={o.id} className="card" draggable onDragStart={e => { e.dataTransfer.setData('text/opp', o.id); e.dataTransfer.effectAllowed = 'move'; }} onDoubleClick={() => open(o.id, 'work')} onContextMenu={e => oppCtx(e, o)}><b>{o.title}</b><div className="mut">{o.industryName}</div><div className="row"><span className="score">{o.total}</span>{(o.tasks || []).filter(t => !t.done).length ? <span className="tag n">{(o.tasks || []).filter(t => !t.done).length} 待办</span> : null}<span className="sp" /><I n={o.watched ? 'star-fill' : 'star-line'} c={o.watched ? 'var(--warn)' : 'var(--mut)'} /></div></div>)}</div>; })}</div>}
  </>;
}
export function Validate({ opps, open, upd, say }) {
  const watched = opps.filter(o => o.watched || o.stage === 'validate' || o.stage === 'research');
  const [sel, setSel] = useState(watched[0]?.id), cur = opps.find(o => o.id === sel);
  return <><PH icon="flask-line" title="验证工作流" sub="把观察中的机会推进访谈、着陆页、预售等实验" />
    <div className="filters"><select value={sel || ''} onChange={e => setSel(e.target.value)} style={{ width: 320 }}><option value="">选择机会…</option>{watched.map(o => <option key={o.id} value={o.id}>{o.total} · {o.title}</option>)}</select><button className="s" disabled={!cur} onClick={() => open(cur.id)}><I n="file-search-line" />详情</button></div>
    {!cur ? <Empty text="先把机会加入观察或移到「研究/验证」阶段" /> : <div className="card"><h3><span>{cur.title}</span><span className="mut">{cur.checklist.filter(c => c.status === 'done').length}/{cur.checklist.length}</span></h3>
      {cur.checklist.map((c, i) => <div key={i} className="row" style={{ marginBottom: 8, alignItems: 'flex-start' }}><input type="checkbox" style={{ width: 16, marginTop: 4 }} checked={c.status === 'done'} onChange={e => upd(cur.id, { checklist: cur.checklist.map((x, j) => j === i ? { ...x, status: e.target.checked ? 'done' : 'todo' } : x) })} /><div className="sp"><b>{c.step}</b><div className="mut">{c.detail} · 指标：{c.metric}</div>
        <input placeholder="实验记录…（失焦自动保存）" key={cur.id + i} defaultValue={c.note || ''} onBlur={e => e.target.value !== (c.note || '') && upd(cur.id, { checklist: cur.checklist.map((x, j) => j === i ? { ...x, note: e.target.value } : x) }).then(() => say?.('实验记录已保存'))} style={{ marginTop: 4 }} /></div></div>)}</div>}</>;
}
export function Compare({ opps, open }) {
  const [a, setA] = useState(opps[0]?.id), [b, setB] = useState(opps[1]?.id);
  const oa = opps.find(o => o.id === a), ob = opps.find(o => o.id === b);
  return <><PH icon="contrast-2-line" title="机会对比" />
    <div className="filters"><select value={a || ''} onChange={e => setA(e.target.value)}>{opps.map(o => <option key={o.id} value={o.id}>{o.total} · {o.title}</option>)}</select><select value={b || ''} onChange={e => setB(e.target.value)}>{opps.map(o => <option key={o.id} value={o.id}>{o.total} · {o.title}</option>)}</select></div>
    {oa && ob && <div className="grid g2"><div className="card" onClick={() => open(oa.id)} style={{ cursor: 'pointer' }}><h3>{oa.title} <span className="score">{oa.total}</span></h3><Chart h={260} option={radarOpt(oa, ob)} /></div>
      <div className="card"><table><thead><tr><th>维度</th><th>{oa.title.slice(0, 12)}</th><th>{ob.title.slice(0, 12)}</th></tr></thead><tbody>{Object.entries(D).map(([k, n]) => <tr key={k}><td>{n}</td><td><b>{oa.dims[k]}</b></td><td><b>{ob.dims[k]}</b></td></tr>)}<tr><td>TAM</td><td>{$Msafe(oa)}</td><td>{$Msafe(ob)}</td></tr><tr><td>不对称</td><td>{oa.asymmetry[0]?.type || '—'}</td><td>{ob.asymmetry[0]?.type || '—'}</td></tr></tbody></table></div></div>}</>;
}
function $Msafe(o) { try { const t = o.tam?.topDown?.tam || o.tam?.bottomUp?.tam; return t ? (t >= 1e9 ? '$' + (t / 1e9).toFixed(1) + 'B' : '$' + (t / 1e6).toFixed(0) + 'M') : '—'; } catch { return '—'; } }
export function Alerts({ load, say }) {
  const [rules, setRules] = useState([]), [notifs, setNotifs] = useState([]), [form, setForm] = useState({ type: 'score', value: '70' });
  const reload = () => Promise.all([api.call('alerts:list'), api.call('notif:list')]).then(([r, n]) => { setRules(r); setNotifs(n); });
  useEffect(() => { reload(); }, []);
  return <><PH icon="notification-3-line" title="提醒" sub="评分阈值 · 关键词 · 行业信号突增"><button className="s" onClick={() => api.call('notif:read').then(reload)}><I n="check-double-line" />全部已读</button></PH>
    <div className="grid g21"><div className="card"><h3><span><I n="alarm-line" /> 规则</span></h3><div className="row"><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={{ width: 120 }}><option value="score">评分 ≥</option><option value="keyword">关键词</option><option value="industry">行业新机会</option><option value="funding">融资 ≥ $M</option><option value="watch">观察中有新动态</option></select>
      <input value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} placeholder={{ score: '分数阈值', keyword: '关键词', industry: 'GICS 代码如 4510', funding: '金额 $M' }[form.type]} />
      <button onClick={async () => { await api.call('alerts:add', form); setForm({ type: 'score', value: '70' }); reload(); say('已添加'); }}><I n="add-line" /></button></div>
      <table style={{ marginTop: 8 }}><tbody>{rules.map(r => <tr key={r.id}><td>{r.type}</td><td>{r.value}</td><td><button className="s" onClick={async () => { await api.call('alerts:del', r.id); reload(); }}><I n="delete-bin-line" /></button></td></tr>)}</tbody></table></div>
      <div className="card"><h3><span><I n="notification-badge-line" /> 通知</span></h3><div className="feed">{notifs.map(n => <div key={n.id} style={{ opacity: n.read ? .5 : 1 }}><b>{n.title}</b><div className="mut">{new Date(n.ts).toLocaleString('zh-CN')} · {n.body}</div></div>)}</div></div></div></>;
}
export function Sources({ cfg, setCfg, refresh, busy, prog, say }) {
  const [list, setList] = useState([]);
  const reload = () => api.call('sources:list').then(setList);
  const [hl, setHl] = useState({});
  useEffect(() => { reload(); api.call('health:get').then(r => setHl(Object.fromEntries((r || []).map(x => [x.id, x])))); }, [busy]);
  const toggle = async id => { const dis = new Set(cfg.disabledSources || []); dis.has(id) ? dis.delete(id) : dis.add(id); const n = { ...cfg, disabledSources: [...dis] }; setCfg(await api.call('cfg:set', { disabledSources: n.disabledSources })); reload(); };
  const setW = async (id, w) => { setCfg(await api.call('cfg:set', { weights: { ...(cfg.weights || {}), [id]: +w } })); reload(); };
  const color = s => ({ healthy: 'var(--ok)', degraded: 'var(--warn)', down: 'var(--bad)', never: 'var(--mut)', off: 'var(--mut)', nokey: 'var(--warn)', unavailable: 'var(--bad)' }[s] || 'var(--mut)');
  const fq = m => !m ? '—' : m >= 1440 ? (m / 1440) + ' 天' : m >= 60 ? (m / 60) + ' 小时' : m + ' 分钟';
  const cnt = k => list.filter(s => s.status === k).length;
  return <><PH icon="database-2-line" title="数据源管理" sub={`${list.length} 个 · 健康 ${cnt('healthy')} · 不稳定 ${cnt('degraded')} · 故障 ${cnt('down')} · 需 Key ${cnt('nokey')} · 停用 ${cnt('off')} · 不可用 ${cnt('unavailable')} · 熔断 ${Object.values(hl).filter(x => x.open).length}`}><button onClick={() => refresh()} disabled={busy}><I n="refresh-line" />立即采集</button><button className="s" onClick={() => refresh({ due: true })} disabled={busy}>仅到期</button></PH>
    <div className="card"><table><thead><tr><th></th><th>状态</th><th>来源</th><th>类别</th><th>可信度权重</th><th>频率</th><th>成功率</th><th>上次成功</th><th>累计</th><th>说明</th></tr></thead><tbody>
      {list.map(s => { const un = s.status === 'unavailable', running = prog[s.id]?.state === 'running';
        return <tr key={s.id}><td><input type="checkbox" style={{ width: 14 }} checked={!cfg.disabledSources?.includes(s.id) && !un} disabled={un} onChange={() => toggle(s.id)} /></td>
          <td style={{ whiteSpace: 'nowrap' }}><span className="dot" style={{ background: color(s.status) }} />{running ? '采集中…' : s.label}{hl[s.id]?.open ? <span className="tag" style={{ marginLeft: 4, color: 'var(--bad)' }} title={hl[s.id].lastErr}>熔断</span> : hl[s.id]?.fails ? <span className="mut" style={{ fontSize: 10, marginLeft: 4 }} title={'下次重试 ' + fmt(hl[s.id].nextAt)}>退避×{hl[s.id].fails}</span> : null}</td>
          <td><b>{s.name}</b><div className="mut" style={{ fontSize: 10 }}>{s.id}{s.key ? ' · Key：' + s.key : ''}</div></td>
          <td><span className={'tag ' + (CATC[s.cat] || '')}>{s.cat}</span></td>
          <td>{un ? '—' : <input type="number" step="0.1" min="0.1" max="3" style={{ width: 58 }} defaultValue={s.weight} onBlur={e => +e.target.value !== s.weight && setW(s.id, e.target.value)} />}</td>
          <td className="mut" style={{ whiteSpace: "nowrap" }}>{fq(s.freq)}</td><td>{s.okRate != null ? Math.round(s.okRate * 100) + '%' : '—'}</td><td className="mut" style={{ whiteSpace: "nowrap" }}>{fmt(s.lastOk?.ts)}{s.lastOk ? ' · ' + s.lastOk.count + ' 条' : ''}</td><td>{s.total || 0}</td>
          <td className="mut" style={{ fontSize: 11, maxWidth: 260 }}>{un ? s.why : s.last && !s.last.ok ? s.last.err : s.last?.err || ''}</td></tr>; })}
    </tbody></table></div></>;
}
export function Report({ cur, say }) {
  const [md, setMd] = useState(''), [kind, setKind] = useState('brief'), [gate, setGate] = useState(null);
  useEffect(() => { if (!cur) return; const call = kind === 'report' ? api.call('report:md', [cur.id]) : kind === 'memo' ? api.call('memo:md', cur.id) : api.call('brief:md', cur.id); call.then(setMd); api.call('stage:gate', cur.id).then(setGate); }, [cur, kind]);
  const save = async fmt => { const p = await api.call(kind === 'report' ? 'report:save' : kind === 'memo' ? 'memo:save' : 'brief:save', kind === 'report' ? { ids: [cur.id], fmt } : { id: cur.id, fmt }); p && say('已导出：' + p); };
  return <><PH icon="file-text-line" title="报告与 IC 备忘录" sub={cur ? cur.title : '请先选择机会'}><div className="tabs" style={{ margin: 0 }}><a className={kind === 'brief' ? 'on' : ''} onClick={() => setKind('brief')}>决策一页纸</a><a className={kind === 'report' ? 'on' : ''} onClick={() => setKind('report')}>研究报告</a><a className={kind === 'memo' ? 'on' : ''} onClick={() => setKind('memo')}>IC 备忘录</a></div>
    <button className="s" disabled={!cur} onClick={() => save('md')}><I n="markdown-line" />MD</button><button className="s" disabled={!cur} onClick={() => save('html')}><I n="html5-line" />HTML</button><button disabled={!cur} onClick={() => save('pdf')}><I n="file-pdf-2-line" />PDF</button></PH>
    {cur && gate && <div className={'card ' + (gate.ok ? '' : 'warn')} style={{ marginBottom: 8 }}><b>阶段门</b>：{gate.ok ? '✅ 可进入下一阶段' + (gate.next ? '（' + gate.next + '）' : '') : '⚠ ' + gate.miss.join('；')}</div>}
    {!cur ? <Empty text="在机会雷达中选择一个机会" /> : <div className="card"><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'Noto Sans CJK SC, sans-serif', lineHeight: 1.7, fontSize: 13 }}>{md}</pre></div>}</>;
}
export function Share({ load, say }) {
  return <><PH icon="team-line" title="共享协作" sub="导出/导入机会 JSON 包（含备注与评论）" />
    <div className="grid g2"><div className="card"><h3><I n="upload-2-line" /> 导出共享包</h3><p className="mut">把当前机会库（含备注、评论、阶段）导出为 JSON，发给同事。</p><button onClick={async () => { const p = await api.call('share:export'); p && say('已导出：' + p); }}><I n="download-line" />导出</button></div>
      <div className="card"><h3><I n="download-2-line" /> 导入共享包</h3><p className="mut">合并他人导出的机会；同 id 以较新为准。</p><button onClick={async () => { const r = await api.call('share:import'); r && (await load(), say(`已从 ${r.from} 导入 ${r.count} 个`)); }}><I n="upload-line" />导入</button></div></div></>;
}
export function Logs() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.call('logs').then(setRows); const t = setInterval(() => api.call('logs').then(setRows), 4000); return () => clearInterval(t); }, []);
  return <><PH icon="terminal-box-line" title="运行日志" /><div className="card"><table><thead><tr><th>时间</th><th>消息</th></tr></thead><tbody>{rows.map((r, i) => <tr key={i}><td className="mut" style={{ width: 110 }}>{fmt(r.ts > 1e12 ? r.ts / 1000 : r.ts)}</td><td>{r.msg}</td></tr>)}</tbody></table></div></>;
}
export function Settings({ cfg, setCfg, say }) {
  if (!cfg) return null;
  const set = (k, v) => setCfg({ ...cfg, [k]: v });
  const save = async () => { setCfg(await api.call('cfg:set', cfg)); say('设置已保存'); };
  const test = async () => { try { const r = await api.call('llm:test'); say(r.ok ? 'LLM ' + r.msg : '失败：' + r.msg); } catch (e) { say('失败：' + e.message); } };
  const F = (k, l, type = 'text') => <div><label>{l}</label>{type === 'checkbox' ? <input type="checkbox" checked={!!cfg[k]} onChange={e => set(k, e.target.checked)} /> : <input type={type} value={cfg[k] ?? ''} onChange={e => set(k, type === 'number' ? +e.target.value : e.target.value)} />}</div>;
  return <><PH icon="settings-3-line" title="设置" sub="密钥只存在本机 SQLite，不会上传"><button onClick={save}><I n="save-3-line" />保存</button></PH>
    <div className="grid g2"><div className="card"><h3><I n="user-line" /> 基本</h3><div className="grid g2">{F('userName', '显示名')}{F('autoRefresh', '自动采集（每 15 分钟检查到期源）', 'checkbox')}{F('openAtLogin', '开机自启（登录系统后后台启动，配合自动采集）', 'checkbox')}<div><label>每日简报（快照后自动生成并通知）</label><input type="checkbox" checked={cfg.dailyBrief !== false} onChange={e => set('dailyBrief', e.target.checked)} /></div>
        <div style={{ gridColumn: 'span 2' }}><label>默认首页</label><select value={cfg.homeMode === 'role' ? 'role' : 'workbench'} onChange={e => set('homeMode', e.target.value)}><option value="workbench">工作台（推荐，6.0 工作循环）</option><option value="role">按首次引导的角色（5.0：创业者→机会维度、VC→机会雷达、企业战略→产业链）</option></select><div className="mut" style={{ fontSize: 11, marginTop: 4 }}>新安装默认进入工作台。如需沿用角色首页，选择第二项并保存。</div></div><div style={{ gridColumn: 'span 2' }}><label>关注关键词（逗号分隔）</label><input value={cfg.keywords} onChange={e => set('keywords', e.target.value)} /></div><div style={{ gridColumn: 'span 2' }}><label>团队技能（用于创始人匹配）</label><input value={cfg.skills} onChange={e => set('skills', e.target.value)} /></div>{F('clusterSim', '聚类相似度阈值', 'number')}<div style={{ gridColumn: 'span 2', fontSize: 11, marginTop: 4 }} className="mut">数据保存在本机 userData，安装包不自带信号。<button className="s" style={{ marginLeft: 8 }} onClick={() => api.call('open:data')}><I n="folder-open-line" />打开数据目录</button></div></div></div>
      <div className="card"><h3><I n="brain-line" /> LLM（可选）</h3><div className="grid g2"><div><label>提供商</label><select value={cfg.llmProvider} onChange={e => set('llmProvider', e.target.value)}><option value="none">关闭（规则引擎）</option><option value="openai">OpenAI 兼容</option><option value="ollama">Ollama 本地</option></select></div>
        {F('openaiKey', 'API Key')}{F('openaiBase', 'Base URL')}{F('openaiModel', '模型')}{F('ollamaUrl', 'Ollama URL')}{F('ollamaModel', 'Ollama 模型')}</div><button className="s" style={{ marginTop: 8 }} onClick={test}><I n="flashlight-line" />测试连通</button></div>
      <div className="card"><h3><I n="key-2-line" /> 需密钥的数据源</h3><div className="grid g2">{F('fredKey', 'FRED API Key')}{F('opencorporatesKey', 'OpenCorporates')}{F('companiesHouseKey', 'UK Companies House')}{F('patentsviewKey', 'PatentsView')}{F('githubToken', 'GitHub Token')}{F('openalexKey', 'OpenAlex Key')}{F('samKey', 'SAM.gov')}{F('xBearer', 'X (Twitter) Bearer')}{F('phToken', 'Product Hunt')}{F('crunchbaseKey', 'Crunchbase')}{F('censusKey', '美国 Census API Key')}{F('estatKey', '日本 e-Stat appId')}{F('coreKey', 'CORE API Key')}{F('s2Key', 'Semantic Scholar Key（可选，提速）')}</div>
        <p className="mut" style={{ marginTop: 8, fontSize: 11 }}>未填密钥的源会显示为 nokey，不会报错。FRED 无密钥时回退公开 CSV。</p></div>
      <div className="card"><h3><I n="cloud-line" /> Common Crawl / 大文件子集</h3><div className="grid g2">{F('ccNewsFiles', 'CC-NEWS 每日文件数', 'number')}{F('ccNewsMBPerFile', '每文件读取上限 MB', 'number')}{F('ccDiskMB', 'CC-NEWS 磁盘缓存上限 MB', 'number')}{F('cdxTlds', 'CDX 顶级域（逗号）')}{F('cdxPaths', 'CDX 路径后缀')}{F('cdxDomains', 'CDX 跟踪域名')}{F('ghaHours', 'GH Archive 每次小时数', 'number')}{F('ghaMBPerHour', 'GH Archive 每小时上限 MB', 'number')}{F('amazonCats', 'Amazon Reviews 品类')}{F('amazonMBPerCat', 'Amazon 每品类上限 MB', 'number')}{F('sectorQueriesPerRun', '每轮行业新闻查询数', 'number')}</div>
        <p className="mut" style={{ marginTop: 8, fontSize: 11 }}>CC-NEWS / CDX / Amazon Reviews / Wayback 默认关闭（慢）。在数据源页勾选启用。CC-NEWS 使用内置 Node WARC 流式解析，不依赖 Python warcio。</p></div></div></>;
}
