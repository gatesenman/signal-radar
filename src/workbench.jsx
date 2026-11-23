import { React, useEffect, useState, useMemo, useRef, api, I, STAGES, fmt, PH, Empty, Conf } from './ui.jsx';

import * as WBmod from '../electron/workbench.js';
const WB = WBmod.default || WBmod;

const todaySH = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
const emptyOf = (view, stats, busy) => WB.emptyStateCopy({ busy, lastRefresh: stats?.lastRefresh, hasSignals: !!stats?.total, view });

function pendingOf(opps, today) {
  today = today || todaySH();
  return opps.filter(o => {
    const st = o.inboxStatus || 'open';
    if (st === 'dismissed' || st === 'saved') return false;
    if (st === 'snoozed' && o.snoozeUntil && o.snoozeUntil > today) return false;
    if (o.inboxStatus === 'snoozed') return true;
    return (o.stage || 'discover') === 'discover' && !o.stale && !o.quality?.noise;
  }).sort((a, b) => (b.personal?.score ?? b.total) - (a.personal?.score ?? a.total));
}

export function Workbench({ opps, stats, open, refresh, busy, say, setView, oppCtx }) {
  const [tasks, setTasks] = useState([]);
  const [brief, setBrief] = useState(null);
  const [prefs, setPrefs] = useState(null);
  useEffect(() => { api.call('tasks:list').then(setTasks).catch(() => setTasks([])); api.call('brief:daily').then(setBrief).catch(() => {}); api.call('wb:prefs').then(setPrefs).catch(() => setPrefs(WB.defaultWbPrefs())); }, [opps]);
  const today = todaySH();
  const savePrefs = async patch => { const n = await api.call('wb:prefs:set', patch); setPrefs(n); };
  const scopeOn = !!(prefs && (prefs.focusWatched || (prefs.watchIndustries || []).length || prefs.minScore));
  const pool = useMemo(() => scopeOn ? WB.applyWbFocus(opps, prefs) : opps, [opps, prefs, scopeOn]);
  const pending = useMemo(() => pendingOf(pool, today), [pool, today]);
  const due = tasks.filter(t => !t.done && t.due && t.due <= today).sort((a, b) => (a.due < b.due ? -1 : 1));
  const byStage = Object.fromEntries(STAGES.map(([k]) => [k, pool.filter(o => (o.stage || 'discover') === k && !o.quality?.noise).length]));
  const pipeN = STAGES.filter(([k]) => k !== 'discover' && k !== 'drop').reduce((a, [k]) => a + (byStage[k] || 0), 0);
  const empty = emptyOf('workbench', stats, busy);
  if (!stats?.total) return <><PH icon="apps-2-line" title="工作台" sub="发现 → 分拣 → 调研 → 跟进 → 简报，在一个循环里做完" /><Empty refresh={refresh} busy={busy} text={empty.text} kind={empty.kind} errors={empty.errors} /></>;
  const doneTask = async (t, e) => { e.stopPropagation(); await api.call('tasks:update', { id: t.id, done: 1 }); setTasks(await api.call('tasks:list')); say?.('已完成：' + t.title); };
  return <><PH icon="apps-2-line" title="工作台" sub={`信号 ${stats.total.toLocaleString()} · 机会 ${opps.length} · 待分拣 ${pending.length} · 到期任务 ${due.length}`}>
    <button onClick={() => refresh()} disabled={busy}><I n={busy ? 'loader-4-line' : 'refresh-line'} />{busy ? '采集中…' : '立即采集'}</button>
    <button className="s" onClick={() => setView('inbox')}><I n="clipboard-line" />去收件箱{pending.length ? ' ' + pending.length : ''}</button>
    <label className="mut" style={{ fontSize: 12 }}><input type="checkbox" checked={!!prefs?.focusWatched} onChange={e => savePrefs({ focusWatched: e.target.checked })} aria-label="只看观察中的机会" /> 只看观察中的</label>
    <label className="mut" style={{ fontSize: 12 }}>最低分 <input type="number" min="0" max="100" value={prefs?.minScore || 0} onChange={e => savePrefs({ minScore: +e.target.value || 0 })} style={{ width: 56 }} aria-label="工作台最低分" /></label>
  </PH>
    {!!scopeOn && <div className="mut" style={{ margin: '0 0 8px', fontSize: 12 }}>工作台已按关注筛选{WB.focusLabel(prefs) ? '：' + WB.focusLabel(prefs) : ''}（{pool.length}/{opps.length}）。简报生成时也会使用同一范围。</div>}
    <div className="wb-inds">{[...new Set(opps.map(o => o.industry).filter(Boolean))].slice(0, 16).map(code => { const name = opps.find(o => o.industry === code)?.industryName || code; const on = (prefs?.watchIndustries || []).includes(code); return <button key={code} className={'s' + (on ? ' on' : '')} onClick={() => { const cur = prefs?.watchIndustries || []; savePrefs({ watchIndustries: on ? cur.filter(x => x !== code) : [...cur, code] }); }}>{name}</button>; })}</div>
    <div className="grid g4">
      <div className="kpi" style={{ cursor: 'pointer' }} onClick={() => setView('signals')}><span className="l">今日新信号</span><b>{stats.day}</b><span className="mut">库内 {stats.total.toLocaleString()}</span></div>
      <div className="kpi" style={{ cursor: 'pointer' }} onClick={() => setView('inbox')}><span className="l">待分拣</span><b>{pending.length}</b><span className="mut">收件箱中的新发现</span></div>
      <div className="kpi" style={{ cursor: 'pointer' }} onClick={() => setView('board')}><span className="l">管道中</span><b>{pipeN}</b><span className="mut">{STAGES.slice(1, 5).map(([k, n]) => n + ' ' + (byStage[k] || 0)).join(' · ')}</span></div>
      <div className="kpi"><span className="l">到期 / 逾期任务</span><b className={due.length ? 'dn' : ''}>{due.length}</b><span className="mut">未完成 {tasks.filter(t => !t.done).length}</span></div>
    </div>
    <div className="grid g2" style={{ marginTop: 12 }}>
      <div className="card"><h3><span><I n="list-check-2" /> 今日待办</span><button className="s" onClick={() => setView('board')}>管道</button></h3>
        {!due.length ? <div className="mut">今天没有到期或逾期的任务。在机会工作区添加跟进事项，并写上日期。</div> :
          due.slice(0, 10).map(t => <div key={t.id} className="wb-row" onClick={() => t.opp_id && open(t.opp_id, 'work')}>
            <input type="checkbox" onChange={e => doneTask(t, e)} onClick={e => e.stopPropagation()} />
            <div className="sp"><b>{t.title}</b><div className={'mut' + (t.due < today ? ' task-due overdue' : ' task-due today')}>{t.due < today ? '逾期 ' : '今日 '}{t.due}{t.oppTitle ? ' · ' + t.oppTitle : ''}</div></div>
          </div>)}</div>
      <div className="card"><h3><span><I n="clipboard-line" /> 待分拣机会</span><button className="s" onClick={() => setView('inbox')}>全部</button></h3>
        {!pending.length ? <div className="mut">收件箱是空的。新聚类出来、仍处于「发现」阶段的机会会出现在这里，供你收录、稍后处理或忽略。</div> :
          pending.slice(0, 8).map(o => <div key={o.id} className="wb-row" onClick={() => open(o.id, 'work')} onContextMenu={e => oppCtx?.(e, o)}>
            <span className="score">{o.total}</span><div className="sp"><b>{o.title}</b><div className="mut">{o.industryName}</div></div>
          </div>)}</div>
    </div>
    <div className="card" style={{ marginTop: 12 }}><h3><span><I n="kanban-view" /> 管道一览</span><button className="s" onClick={() => setView('board')}>打开看板</button></h3>
      <div className="pipe">{STAGES.map(([k, n]) => <span key={k} className={(byStage[k] || 0) ? 'on' : ''} onClick={() => setView('board')}>{n} {byStage[k] || 0}</span>)}</div></div>
    {brief?.md && <div className="card brief" style={{ marginTop: 12 }}><h3><span><I n="newspaper-line" /> 每日简报 {brief.day}</span><button className="s" onClick={() => setView('briefs')}>工作简报</button></h3>
      <BriefMd md={brief.md.split('\n').slice(0, 24).join('\n')} open={open} /></div>}
  </>;
}


export function Inbox({ opps, open, load, say, refresh, busy, stats, oppCtx }) {
  const [tab, setTab] = useState('pending'), [days, setDays] = useState(1), [sigs, setSigs] = useState({ pending: [], snoozed: [], dismissed: [], saved: [] }), [prefsIn, setPrefsIn] = useState(false);
  const [cur, setCur] = useState(0), [picked, setPicked] = useState(() => new Set()), [canUndo, setCanUndo] = useState(false);
  const today = todaySH();
  const g = useMemo(() => {
    const pending = pendingOf(opps, today);
    const snoozed = opps.filter(o => (o.inboxStatus === 'snoozed') && o.snoozeUntil && o.snoozeUntil > today);
    const dismissed = opps.filter(o => o.inboxStatus === 'dismissed');
    const saved = opps.filter(o => o.inboxStatus === 'saved');
    return { pending, snoozed, dismissed, saved };
  }, [opps, today]);
  const loadSig = () => api.call('inbox:signals').then(setSigs).catch(() => setSigs({ pending: [], snoozed: [], dismissed: [], saved: [] }));
  useEffect(() => { loadSig(); }, [opps]);
  useEffect(() => { api.call('wb:prefs').then(p => { setTab(p.inboxTab || 'pending'); setDays(p.inboxDays || 1); setPrefsIn(true); }).catch(() => setPrefsIn(true)); }, []);
  useEffect(() => { if (prefsIn) api.call('wb:prefs:set', { inboxTab: tab, inboxDays: days }).catch(() => {}); }, [tab, days, prefsIn]);
  const list = tab === 'signals' ? (sigs.pending || []) : tab === 'snoozed' ? g.snoozed : tab === 'saved' ? g.saved : tab === 'dismissed' ? g.dismissed : g.pending;
  useEffect(() => { setCur(0); setPicked(new Set()); }, [tab]);
  const bag = useRef({}); bag.current = { tab, days, cur, list, sigs, g };
  const sayAct = action => action === 'save' ? '已收录到管道' : action === 'snooze' ? '已稍后处理' : action === 'dismiss' ? '已从收件箱忽略（机会仍在雷达中）' : action === 'restore' ? '已放回待分拣' : '已更新';
  const actOpp = async (o, action, extra) => { await api.call('inbox:triage', { id: o.id, kind: 'opp', action, extra }); setCanUndo(true); await load(); say(sayAct(action)); };
  const actSig = async (s, action, extra) => { await api.call('inbox:triage', { id: s.id, kind: 'signal', action, extra }); setCanUndo(true); await loadSig(); say('信号已更新'); };
  const undo = async () => { try { await api.call('inbox:undo'); await load(); await loadSig(); setCanUndo(false); say('已撤销上一次分拣'); } catch (e) { say(e.message || '没有可撤销的分拣'); } };
  const batch = async (action, extra) => {
    const ids = [...picked]; if (!ids.length) return say('请先勾选条目');
    await api.call('inbox:batch', { ids, kind: tab === 'signals' ? 'signal' : 'opp', action, extra });
    setPicked(new Set()); setCanUndo(true);
    if (tab === 'signals') await loadSig(); else await load();
    say('已批量处理 ' + ids.length + ' 条，可按 U 撤销');
  };
  const togPick = (id, e) => { e.stopPropagation(); const s = new Set(picked); s.has(id) ? s.delete(id) : s.add(id); setPicked(s); };
  useEffect(() => {
    const onKey = e => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      const act = WB.inboxKeyAction(e.key, { meta: e.metaKey, ctrl: e.ctrlKey, alt: e.altKey, repeat: e.repeat, typing });
      if (!act) return;
      const b = bag.current, rows = b.list || [];
      e.preventDefault();
      if (act === 'next') setCur(i => Math.min(Math.max(rows.length - 1, 0), i + 1));
      else if (act === 'prev') setCur(i => Math.max(0, i - 1));
      else if (act === 'clear') setPicked(new Set());
      else if (act === 'undo') undo();
      else if (act === 'open') { const o = rows[b.cur]; if (o?.id && b.tab !== 'signals') open(o.id, 'work'); }
      else if (['save', 'snooze', 'dismiss'].includes(act)) {
        const o = rows[b.cur]; if (!o) return;
        const extra = act === 'save' && b.tab !== 'signals' ? { stage: 'screen' } : act === 'snooze' ? { days: b.days } : {};
        if (b.tab === 'signals') actSig(o, act, extra); else actOpp(o, act, extra);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const emptyAll = !stats?.total;
  const TABS = [['pending', '待分拣', g.pending.length], ['signals', '新信号', sigs.pending.length], ['snoozed', '稍后', g.snoozed.length + sigs.snoozed.length], ['saved', '已收录', g.saved.length + sigs.saved.length], ['dismissed', '已忽略', g.dismissed.length + sigs.dismissed.length]];
  const rowActs = (o) => <div className="inbox-act" onClick={e => e.stopPropagation()}>
    <button className="s" onClick={() => actOpp(o, 'save', { stage: 'screen' })}><I n="save-3-line" />收录</button>
    <button className="s" onClick={() => actOpp(o, 'snooze', { days })}><I n="alarm-line" />稍后 {days} 天</button>
    <button className="s" onClick={() => actOpp(o, 'dismiss')}><I n="close-circle-line" />忽略</button>
    <select value={o.stage || 'discover'} onChange={e => actOpp(o, 'stage', { stage: e.target.value })}>{STAGES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
  </div>;
  const mark = (id, i) => <input type="checkbox" checked={picked.has(id)} aria-label="选中此条" onChange={e => togPick(id, e)} onClick={e => e.stopPropagation()} style={{ marginRight: 8 }} />;
  return <><PH icon="clipboard-line" title="收件箱" sub="把新发现分拣进管道：收录、稍后、忽略，或直接指定阶段。忽略不会删除雷达里的机会。">
    <span className="mut" style={{ fontSize: 12 }}>稍后天数</span>
    <select value={days} onChange={e => setDays(+e.target.value)} style={{ width: 72 }}>{[1, 3, 7, 14].map(n => <option key={n} value={n}>{n} 天</option>)}</select>
    <button className="s" onClick={undo} disabled={!canUndo} title="撤销上一次分拣（U）"><I n="arrow-go-back-line" />撤销</button>
    <button onClick={() => refresh()} disabled={busy}><I n={busy ? 'loader-4-line' : 'refresh-line'} />{busy ? '采集中…' : '立即采集'}</button>
  </PH>
    <div className="tabs" role="tablist">{TABS.map(([k, n, c]) => <a key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><I n={k === 'signals' ? 'broadcast-line' : k === 'snoozed' ? 'alarm-line' : k === 'saved' ? 'save-3-line' : k === 'dismissed' ? 'close-circle-line' : 'clipboard-line'} />{n} {c || ''}</a>)}</div>
    <div className="mut inbox-keys">键盘：J/K 移动 · E 收录 · Z 稍后 · X 忽略 · U 撤销 · Enter 打开工作区。可勾选后批量分拣，状态写入本机数据库。</div>
    {!!picked.size && tab !== 'saved' && <div className="inbox-batch"><span className="mut">已选 {picked.size}</span>
      <button className="s" onClick={() => batch(tab === 'dismissed' || tab === 'snoozed' ? 'restore' : 'save', tab === 'signals' ? {} : { stage: 'screen' })}>{tab === 'dismissed' || tab === 'snoozed' ? '放回所选' : '收录所选'}</button>
      {tab === 'pending' || tab === 'signals' ? <><button className="s" onClick={() => batch('snooze', { days })}>稍后所选</button><button className="s" onClick={() => batch('dismiss')}>忽略所选</button></> : null}
      <button className="s" onClick={() => setPicked(new Set())}>取消选择</button></div>}
    {emptyAll ? <Empty refresh={refresh} busy={busy} text={emptyOf('inbox', stats, busy).text} kind={emptyOf('inbox', stats, busy).kind} errors={emptyOf('inbox', stats, busy).errors} /> :
      tab === 'signals' ? (!sigs.pending.length ? <Empty text="没有待分拣的新信号。可到「信号流」查看全部来源。" /> : <div className="card">{sigs.pending.map((s, i) => <div key={s.id} className={'wb-row' + (i === cur ? ' on' : '')} onClick={() => setCur(i)}>
        {mark(s.id, i)}
        <div className="sp"><b>{s.title}</b><div className="mut">{s.source} · {fmt(s.ts)}{s.ind ? ' · ' + s.ind : ''}</div></div>
        <div className="inbox-act"><button className="s" onClick={() => actSig(s, 'save')}><I n="save-3-line" />保存</button>
          <button className="s" onClick={() => actSig(s, 'snooze', { days })}>稍后</button>
          <button className="s" onClick={() => actSig(s, 'dismiss')}>忽略</button>
          {s.url && <button className="s" onClick={() => api.call('open:url', s.url)}>打开源页</button>}</div>
      </div>)}</div>) :
      tab === 'snoozed' ? <InboxList opps={g.snoozed} sigs={sigs.snoozed} open={open} oppCtx={oppCtx} cur={cur} setCur={setCur} picked={picked} togPick={togPick} empty="没有稍后处理的条目。到期会自动回到待分拣。" extra={o => <button className="s" onClick={e => { e.stopPropagation(); actOpp(o, 'restore'); }}>放回</button>} /> :
      tab === 'saved' ? <InboxList opps={g.saved} sigs={sigs.saved} open={open} oppCtx={oppCtx} cur={cur} setCur={setCur} picked={picked} togPick={togPick} empty="还没有收录的机会。在待分拣里点「收录」会移到初筛并加入观察。" /> :
      tab === 'dismissed' ? <InboxList opps={g.dismissed} sigs={sigs.dismissed} open={open} oppCtx={oppCtx} cur={cur} setCur={setCur} picked={picked} togPick={togPick} empty="没有已忽略的条目。" extra={o => <button className="s" onClick={e => { e.stopPropagation(); actOpp(o, 'restore'); }}>放回</button>} /> :
      (!g.pending.length ? <Empty text="待分拣是空的。新的「发现」阶段机会会出现在这里。" /> : <div className="card">{g.pending.map((o, i) => <div key={o.id} className={'wb-row' + (i === cur ? ' on' : '')} onClick={() => { setCur(i); open(o.id, 'work'); }} onContextMenu={e => oppCtx?.(e, o)}>
        {mark(o.id, i)}
        <span className="score">{o.total}</span>
        <div className="sp"><b>{o.title}</b><div className="mut">{o.industryName} · 信号 {o.metrics?.signals || 0} · {o.sources?.length || 0} 个来源</div></div>
        {rowActs(o)}
      </div>)}</div>)}
  </>;
}
function InboxList({ opps, sigs, open, oppCtx, empty, extra, cur, setCur, picked, togPick }) {
  if (!opps.length && !sigs?.length) return <Empty text={empty} />;
  return <div className="card">
    {opps.map((o, i) => <div key={o.id} className={'wb-row' + (i === cur ? ' on' : '')} onClick={() => { setCur?.(i); open(o.id, 'work'); }} onContextMenu={e => oppCtx?.(e, o)}>
      {togPick ? <input type="checkbox" checked={!!picked?.has(o.id)} aria-label="选中此条" onChange={e => togPick(o.id, e)} onClick={e => e.stopPropagation()} style={{ marginRight: 8 }} /> : null}
      <span className="score">{o.total}</span>
      <div className="sp"><b>{o.title}</b><div className="mut">{o.industryName}{o.snoozeUntil ? ' · 稍后至 ' + o.snoozeUntil : ''} · {STAGES.find(s => s[0] === o.stage)?.[1] || o.stage}</div></div>
      {extra?.(o)}
    </div>)}
    {(sigs || []).map(s => <div key={s.id} className="wb-row">{togPick ? <input type="checkbox" checked={!!picked?.has(s.id)} aria-label="选中此条" onChange={e => togPick(s.id, e)} onClick={e => e.stopPropagation()} style={{ marginRight: 8 }} /> : null}<div className="sp"><b>{s.title}</b><div className="mut">{s.source} · {fmt(s.ts)}</div></div></div>)}
  </div>;
}


function BriefMd({ md, open }) {
  const lines = String(md || '').split('\n');
  return <div className="brief-md">{lines.map((line, i) => {
    const parts = WB.splitBriefLinks(line);
    const isH = /^##\s/.test(line);
    return <div key={i} className={isH ? 'brief-h' : 'brief-p'}>{parts.map((p, j) => p.kind && p.id ? <a key={j} className="l" href="#" onClick={e => { e.preventDefault(); if (p.kind === 'opp' && open) open(p.id, 'work'); }}>{p.text}</a> : <span key={j}>{p.text || '\u00a0'}</span>)}</div>;
  })}</div>;
}

export function Briefs({ say, setView, stats, refresh, busy, open }) {
  const [kind, setKind] = useState('daily'), [daily, setDaily] = useState(null), [weekly, setWeekly] = useState(null), [list, setList] = useState([]), [ld, setLd] = useState(false);
  const reload = () => { api.call('brief:daily').then(setDaily).catch(() => {}); api.call('brief:weekly').then(setWeekly).catch(() => {}); api.call('brief:daily:list').then(setList).catch(() => setList([])); };
  useEffect(() => { reload(); return api.on('brief', reload); }, []);
  const gen = async weeklyMode => { setLd(true); try { if (weeklyMode) setWeekly(await api.call('brief:weekly', true)); else setDaily(await api.call('brief:daily', true)); reload(); say('简报已生成（仅本机）'); } catch (e) { say('生成失败：' + (e.message || e)); } finally { setLd(false); } };
  const cur = kind === 'weekly' ? weekly : daily;
  const empty = !stats?.total;
  return <><PH icon="newspaper-line" title="工作简报" sub="把管道进展、到期任务和新信号合成每日 / 每周简报。只保存在本机，不会外发。">
    <div className="tabs" style={{ margin: 0 }}><a className={kind === 'daily' ? 'on' : ''} onClick={() => setKind('daily')}>每日</a><a className={kind === 'weekly' ? 'on' : ''} onClick={() => setKind('weekly')}>每周</a></div>
    <button onClick={() => gen(kind === 'weekly')} disabled={ld || empty}><I n={ld ? 'loader-4-line' : 'refresh-line'} />{cur ? '重新生成' : '立即生成'}</button>
    <button className="s" onClick={() => api.call('brief:daily:open')}><I n="folder-open-line" />文件夹</button>
    <button className="s" onClick={() => setView('report')}>机会报告 / IC</button>
  </PH>
    {empty ? <Empty refresh={refresh} busy={busy} text={emptyOf('briefs', stats, busy).text} kind={emptyOf('briefs', stats, busy).kind} errors={emptyOf('briefs', stats, busy).errors} /> :
      !cur?.md ? <div className="card mut">还没有{kind === 'weekly' ? '每周' : '每日'}简报。点击「立即生成」。每日快照后也会自动生成每日简报（可在设置中关闭）。</div> :
      <div className="card brief"><BriefMd md={cur.md} open={open} /></div>}
    {!!list.length && <div className="card" style={{ marginTop: 12 }}><h3><span><I n="file-text-line" /> 本机已保存</span><span className="mut">{list.length} 份</span></h3>
      <div className="mut">{list.slice(0, 20).join(' · ')}</div></div>}
  </>;
}
