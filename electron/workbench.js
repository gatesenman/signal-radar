/* SignalRadar 6.0 工作台核心逻辑：无 Electron 依赖，可供单元测试直接 require。 */
'use strict';

const STAGE_CN = { discover: '发现', screen: '初筛', research: '深研', validate: '验证', go: '立项', drop: '放弃' };
const STAGE_NEXT = { discover: 'screen', screen: 'research', research: 'validate', validate: 'go' };
const ACTIVE_STAGES = ['screen', 'research', 'validate', 'go'];

function todaySH(now = Date.now()) {
  return new Date(now).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}
function addDaysSH(days, now = Date.now()) {
  return new Date(now + days * 86400e3).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}
function weekStartSH(now = Date.now()) {
  const dstr = todaySH(now);
  const [y, m, d] = dstr.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d, 4, 0, 0);
  const wd = new Date(utc).getUTCDay();
  const back = wd === 0 ? 6 : wd - 1;
  return addDaysSH(-back, Date.UTC(y, m - 1, d, 4, 0, 0));
}
function weekKey(now = Date.now()) { return 'W' + weekStartSH(now); }
function nextStage(stage) { return STAGE_NEXT[stage] || null; }

function migrate(run) {
  run(`CREATE TABLE IF NOT EXISTS triage(
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL,
    snooze_until TEXT, note TEXT, updated INTEGER)`);
  run(`CREATE TABLE IF NOT EXISTS tasks(
    id TEXT PRIMARY KEY, opp_id TEXT NOT NULL, title TEXT NOT NULL,
    due TEXT, done INTEGER DEFAULT 0, note TEXT, created INTEGER, updated INTEGER)`);
  run('CREATE INDEX IF NOT EXISTS i_tasks_opp ON tasks(opp_id)');
  run('CREATE INDEX IF NOT EXISTS i_tasks_due ON tasks(due)');
}

function inboxStatusOf(o, today) {
  today = today || todaySH();
  const st = o.inboxStatus || 'open';
  if (st === 'dismissed') return 'dismissed';
  if (st === 'snoozed' && o.snoozeUntil && o.snoozeUntil > today) return 'snoozed';
  if (st === 'snoozed') return 'open';
  if (st === 'saved') return 'saved';
  return 'open';
}
function isPending(o, today) {
  today = today || todaySH();
  const s = inboxStatusOf(o, today);
  if (s === 'dismissed' || s === 'snoozed' || s === 'saved') return false;
  if (o.inboxStatus === 'snoozed') return true;
  return (o.stage || 'discover') === 'discover' && !o.stale && !o.quality?.noise;
}
function groupInbox(opps, today) {
  today = today || todaySH();
  const pending = [], snoozed = [], dismissed = [], saved = [];
  for (const o of opps) {
    const s = inboxStatusOf(o, today);
    if (s === 'dismissed') dismissed.push(o);
    else if (s === 'snoozed') snoozed.push(o);
    else if (s === 'saved') saved.push(o);
    else if (isPending(o, today)) pending.push(o);
  }
  const score = o => (o.personal?.score ?? o.total ?? 0);
  pending.sort((a, b) => score(b) - score(a));
  return { pending, snoozed, dismissed, saved };
}
function triagePatch(action, extra = {}, now = Date.now()) {
  if (action === 'save') {
    const p = { inboxStatus: 'saved', watched: extra.watched !== false };
    if (extra.stage) p.stage = extra.stage;
    return p;
  }
  if (action === 'snooze') return { inboxStatus: 'snoozed', snoozeUntil: extra.until || addDaysSH(extra.days || 1, now) };
  if (action === 'dismiss') return { inboxStatus: 'dismissed', snoozeUntil: '' };
  if (action === 'open' || action === 'restore') return { inboxStatus: 'open', snoozeUntil: '' };
  if (action === 'stage') return { stage: extra.stage, inboxStatus: extra.stage && extra.stage !== 'discover' ? 'saved' : 'open' };
  throw new Error('未知分拣动作：' + action);
}

function newTaskId(now = Date.now()) { return 't_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 8); }
function normalizeTask(t) {
  return { id: t.id, opp_id: t.opp_id, title: String(t.title || '').trim(), due: t.due || '', done: t.done ? 1 : 0, note: t.note || '', created: t.created, updated: t.updated };
}
function taskState(t, today) {
  today = today || todaySH();
  if (t.done) return 'done';
  if (t.due && t.due < today) return 'overdue';
  if (t.due && t.due === today) return 'today';
  return 'open';
}
function dueTasks(tasks, today) {
  today = today || todaySH();
  return tasks.filter(t => !t.done && t.due && t.due <= today).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
}

function csvEscape(s) { const t = String(s ?? ''); return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }
function escHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function pipelineRows(opps, tasks = []) {
  const by = {};
  for (const t of tasks) (by[t.opp_id] = by[t.opp_id] || []).push(t);
  return (opps || []).filter(o => !o.quality?.noise).map(o => {
    const ts = by[o.id] || o.tasks || [];
    const open = ts.filter(t => !t.done);
    const nextDue = open.map(t => t.due).filter(Boolean).sort()[0] || '';
    const h = pipelineHealth({ ...o, tasks: ts });
    return {
      id: o.id, title: o.title, industry: o.industryName || '', sector: o.sector || '',
      stage: o.stage || 'discover', stageName: STAGE_CN[o.stage || 'discover'] || o.stage,
      total: o.total, conf: o.conf, watched: o.watched ? 1 : 0,
      signals: o.metrics?.signals ?? '', notes: o.notes || '',
      openTasks: open.length, nextDue: h.nextDue || nextDue, stale: o.stale ? 1 : 0,
      ageDays: h.ageDays, overdue: h.overdue ? 1 : 0, needsAction: h.needsAction ? 1 : 0, stuck: h.stuck ? 1 : 0, hint: h.hint
    };
  });
}
function pipelineCsv(opps, tasks = []) {
  const cols = [
    ['id', 'ID'], ['title', '机会'], ['industry', '行业'], ['sector', '板块'],
    ['stageName', '阶段'], ['stage', '阶段键'], ['total', '综合分'], ['conf', '置信度'],
    ['watched', '观察'], ['signals', '信号数'], ['openTasks', '未完成任务'],
    ['nextDue', '最近到期'], ['ageDays', '停留天数'], ['overdue', '任务逾期'], ['needsAction', '缺下一步'], ['stuck', '阶段停滞'], ['hint', '提示'], ['notes', '备注'], ['stale', '已过期簇']
  ];
  const rows = pipelineRows(opps, tasks);
  const lines = [cols.map(c => csvEscape(c[1])).join(',')];
  for (const r of rows) lines.push(cols.map(c => csvEscape(r[c[0]])).join(','));
  return '\ufeff' + lines.join('\n');
}
function pipelineHtml(opps, tasks = [], meta = {}) {
  const rows = pipelineRows(opps, tasks);
  const counts = {};
  for (const r of rows) counts[r.stage] = (counts[r.stage] || 0) + 1;
  const pipe = Object.keys(STAGE_CN).map(k => `${STAGE_CN[k]} ${counts[k] || 0}`).join(' · ');
  const tr = rows.map(r => `<tr class="${r.overdue ? 'overdue' : r.stuck ? 'stuck' : r.needsAction ? 'needs' : ''}"><td>${escHtml(r.title)}</td><td>${escHtml(r.industry)}</td><td>${escHtml(r.stageName)}</td><td>${r.total}</td><td>${r.conf ?? ''}</td><td>${r.openTasks}</td><td>${escHtml(r.nextDue)}</td><td>${r.ageDays ?? ''}</td><td>${escHtml(r.hint || '')}</td><td>${escHtml(String(r.notes).slice(0, 160))}</td></tr>`).join('');
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>商机雷达 · 管道清单</title>
<style>body{font:14px/1.5 "Noto Sans CJK SC","PingFang SC",sans-serif;color:#111;margin:24px}h1{font-size:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f4f6f9}td:nth-child(4),td:nth-child(5),td:nth-child(6),td:nth-child(8){text-align:right}tr.overdue{background:#fde8e8}tr.stuck{background:#fff4e5}tr.needs{background:#f4f6f9}@media print{button{display:none}}</style>
</head><body><button onclick="print()">打印</button>
<h1>商机雷达 · 管道清单</h1>
<p>${escHtml(meta.day || todaySH())}（北京时间） · ${rows.length} 条 · ${escHtml(pipe)}</p>
<table><thead><tr><th>机会</th><th>行业</th><th>阶段</th><th>综合分</th><th>置信度</th><th>未完成任务</th><th>最近到期</th><th>停留天数</th><th>提示</th><th>备注</th></tr></thead>
<tbody>${tr || '<tr><td colspan="10">暂无机会。请先采集信号并聚类。</td></tr>'}</tbody></table>
<p style="color:#666;font-size:12px">本清单由本机数据生成，不会外发。</p></body></html>`;
}

function loopBriefSections({ opps = [], tasks = [], newSignals = 0, week = false, today } = {}) {
  today = today || todaySH();
  const g = groupInbox(opps, today);
  const byStage = {};
  for (const o of opps.filter(o => !o.quality?.noise && !o.stale)) byStage[o.stage || 'discover'] = (byStage[o.stage || 'discover'] || 0) + 1;
  const lines = [];
  lines.push('', week ? '## 本周管道' : '## 管道进展');
  lines.push(Object.keys(STAGE_CN).map(k => `${STAGE_CN[k]} ${byStage[k] || 0}`).join(' · '));
  const active = opps.filter(o => ACTIVE_STAGES.includes(o.stage || ''));
  if (active.length) active.slice(0, 8).forEach(o => lines.push(`- ${o.id ? briefOppLink(o) : o.title}（${STAGE_CN[o.stage] || o.stage}，${o.total} 分）`));
  else lines.push('- 管道中尚无已分拣机会（可在收件箱收录）');
  const due = dueTasks(tasks, today);
  lines.push('', week ? '## 本周待办与跟进' : '## 待办与跟进');
  if (!tasks.length) lines.push('- 还没有跟进任务。可在机会工作区添加，并设置到期日。');
  else if (!due.length) lines.push('- 今日无到期或逾期任务（未完成 ' + tasks.filter(t => !t.done).length + ' 项）');
  else due.slice(0, 12).forEach(t => {
    const title = t.opp_id ? '[' + t.title + '](#opp/' + t.opp_id + ')' : t.title;
    lines.push(`- ${t.due < today ? '逾期' : '今日到期'} ${t.due}：${title}${t.oppTitle ? '（' + t.oppTitle + '）' : ''}`);
  });
  const flagged = opps.filter(o => { const h = pipelineHealth(o, today); return h.stuck || h.overdue; });
  lines.push('', week ? '## 本周需处理' : '## 需要处理');
  if (!flagged.length && !due.length) lines.push('- 没有逾期任务或停滞的管道机会');
  else {
    flagged.slice(0, 12).forEach(o => {
      const h = pipelineHealth(o, today);
      const tags = [h.overdue && '任务逾期', h.stuck && '阶段停滞'].filter(Boolean).join(' · ');
      lines.push(`- ${tags} ${briefOppLink(o)}（${STAGE_CN[o.stage] || o.stage}${h.ageDays != null ? '，' + h.ageDays + ' 天' : ''}）${h.hint ? '：' + h.hint : ''}`);
    });
    if (!flagged.length && due.length) lines.push('- 见上方待办：有到期或逾期任务，点标题可打开对应机会');
  }
  const watched = opps.filter(o => o.watched && !o.quality?.noise);
  const inds = {};
  for (const o of watched) { const k = o.industryName || o.industry || '未分类'; inds[k] = (inds[k] || 0) + 1; }
  lines.push('', week ? '## 本周观察行业' : '## 观察中的行业与机会');
  if (!watched.length) lines.push('- 还没有观察中的机会。收录到管道时会默认加入观察。');
  else {
    lines.push('- 观察行业：' + Object.entries(inds).map(([k, n]) => k + ' ' + n).join(' · '));
    watched.slice(0, 10).forEach(o => lines.push(`- ${briefOppLink(o)}（${STAGE_CN[o.stage || 'discover'] || o.stage}，${o.total} 分）`));
  }
  lines.push('', week ? '## 本周新信号' : '## 新信号');
  lines.push(newSignals ? `- 本周期间新增 ${newSignals} 条信号` : '- 本周期间无新增信号记录');
  lines.push(`- 收件箱待分拣 ${g.pending.length} · 稍后 ${g.snoozed.length} · 已收录 ${g.saved.length}`);
  return lines;
}

function signalInbox(rows, triageList, today) {
  today = today || todaySH();
  const tr = Object.fromEntries((triageList || []).filter(x => x.kind === 'signal').map(x => [x.id, x]));
  const pending = [], snoozed = [], dismissed = [], saved = [];
  for (const s of rows) {
    const t = tr[s.id];
    if (!t || t.status === 'open') pending.push(s);
    else if (t.status === 'snoozed' && t.snooze_until && t.snooze_until > today) snoozed.push(s);
    else if (t.status === 'snoozed') pending.push(s);
    else if (t.status === 'dismissed') dismissed.push(s);
    else if (t.status === 'saved') saved.push(s);
    else pending.push(s);
  }
  return { pending, snoozed, dismissed, saved };
}


const ROLE_HOME = { founder: 'dims', vc: 'radar', corp: 'chain' };
function resolveHomeView(cfg = {}) {
  if (cfg.homeMode === 'role') {
    const role = cfg.onboard && cfg.onboard.role;
    return ROLE_HOME[role] || 'workbench';
  }
  return 'workbench';
}

function lastRefreshSummary(report, now = Date.now()) {
  const list = Array.isArray(report) ? report : [];
  const ok = list.filter(r => r && r.ok).length;
  const fail = list.filter(r => r && !r.ok);
  const added = list.reduce((a, r) => a + (r && r.added || 0), 0);
  const status = !list.length ? 'empty' : (ok === 0 ? 'error' : (fail.length ? 'partial' : 'ok'));
  return {
    ts: now, ok, fail: fail.length, added, status,
    errors: fail.slice(0, 8).map(r => ({ id: r.id, err: String(r.err || '失败') }))
  };
}

function emptyStateCopy({ busy, lastRefresh, hasSignals, view = 'workbench' } = {}) {
  const texts = {
    workbench: {
      busy: '首次采集进行中，请稍候…完成后会自动聚类，一两分钟内就会出现商机。',
      empty: '还没有数据。工作台要先有信号才能进入「发现 → 分拣 → 跟进」循环。点击「立即采集」，或等待首次自动采集完成。',
      error: '最近一次采集没有成功写入信号。下面是失败原因（如实记录，不是示例数据）。可点击「立即采集」重试。',
      partial: '最近一次采集部分数据源失败，库里还没有信号。失败原因见下。可重试采集。'
    },
    inbox: {
      busy: '首次采集进行中，请稍候…信号到了会自动出现在待分拣里。',
      empty: '还没有信号。点击「立即采集」，或等待首次自动采集完成后再来分拣。',
      error: '最近一次采集失败，收件箱还是空的。失败原因见下，可重试。',
      partial: '部分数据源采集失败，库里还没有可分拣的信号。失败原因见下。'
    },
    briefs: {
      busy: '首次采集进行中，请稍候…有数据后即可生成简报。',
      empty: '还没有信号，无法生成有内容的简报。请先采集。',
      error: '最近一次采集失败，还没有可写入简报的信号。失败原因见下。',
      partial: '部分数据源采集失败，库里还没有信号，无法生成有内容的简报。'
    }
  };
  const pack = texts[view] || texts.workbench;
  if (busy) return { kind: 'busy', text: pack.busy };
  const st = lastRefresh && lastRefresh.status;
  if (!hasSignals && st === 'error') return { kind: 'error', text: pack.error, errors: lastRefresh.errors || [] };
  if (!hasSignals && st === 'partial') return { kind: 'partial', text: pack.partial, errors: lastRefresh.errors || [] };
  return { kind: 'empty', text: pack.empty, errors: [] };
}


function taskAlertHits(tasks, today) {
  today = today || todaySH();
  const out = [];
  for (const t of tasks || []) {
    const st = taskState(t, today);
    if (st !== 'overdue' && st !== 'today') continue;
    const opp = t.oppTitle || '';
    const ref = (t.opp_id || '') + '::task:' + t.id + ':' + (t.due || '') + ':' + st;
    if (st === 'overdue') {
      out.push({ ref, state: st, opp_id: t.opp_id, titleZh: '逾期任务：' + t.title, titleEn: 'Overdue task: ' + t.title, bodyZh: (opp ? opp + ' · ' : '') + '到期日 ' + t.due, bodyEn: (opp ? opp + ' · ' : '') + 'due ' + t.due });
    } else {
      out.push({ ref, state: st, opp_id: t.opp_id, titleZh: '今日到期：' + t.title, titleEn: 'Due today: ' + t.title, bodyZh: (opp ? opp + ' · ' : '') + '请在工作区跟进', bodyEn: (opp ? opp + ' · ' : '') + 'Follow up in the workspace' });
    }
  }
  out.sort((a, b) => a.state === b.state ? 0 : (a.state === 'overdue' ? -1 : 1));
  return out;
}
function notifOpenTarget(ref) {
  if (!ref) return null;
  const m = /^(o_[A-Za-z0-9]+)::task:/.exec(String(ref));
  if (m) return m[1];
  if (String(ref).startsWith('o_')) return String(ref).split(':')[0];
  return null;
}


function workspaceDigest(o = {}, ctx = {}, today) {
  today = today || todaySH();
  const bullets = [];
  const chokes = (o.chain && o.chain.chokes) || [];
  if (o.chain && o.chain.name) {
    if (chokes.length) chokes.slice(0, 3).forEach(c => bullets.push({ kind: 'choke', text: `${o.chain.name}卡脖子：${c.node}${c.why ? '。' + c.why : ''}`, go: 'chain' }));
    else bullets.push({ kind: 'chain', text: `已匹配产业链「${o.chain.name}」，暂无被标记为卡脖子的节点。`, go: 'chain' });
  } else {
    bullets.push({ kind: 'chain', text: '尚未匹配到产业链卡片，不能从本条记录判断卡脖子环节。', go: 'chain' });
  }
  const code = o.industry || '';
  const papers = (ctx.papers || []).find(p => p && (p.code === code || (code && p.code && (p.code === code || (code.length >= 4 && p.code.startsWith(code.slice(0, 4)))))));
  if (papers) {
    const bits = [];
    if (papers.papers) bits.push('近窗论文 ' + papers.papers + ' 篇');
    if (papers.growth != null) bits.push('近 14 天相对前 14 天增速 ' + papers.growth + '%');
    else if (papers.lowSample) bits.push('论文增速样本不足，不作趋势判断');
    if (papers.gap != null) bits.push('论文→产品转化落差 ' + papers.gap + (papers.gap >= 1 ? '（研究多于产品化，可能有空档）' : ''));
    if (papers.citAccel != null) bits.push('引用速度差 ' + papers.citAccel);
    bullets.push({ kind: 'papers', text: (o.industryName || papers.cn || '本行业') + '：' + (bits.join('；') || '暂无足够论文统计'), go: 'research' });
  } else {
    bullets.push({ kind: 'papers', text: '本行业还没有论文统计（可能尚未采集研究类信号，或未分类）。', go: 'research' });
  }
  const macro = ctx.macro || {};
  const macroBits = [];
  if (macro.wb && Object.keys(macro.wb).length) macroBits.push('世界银行 ' + Object.keys(macro.wb).length + ' 项');
  if (macro.imf && Object.keys(macro.imf).length) macroBits.push('IMF ' + Object.keys(macro.imf).length + ' 项');
  if (macro.fred && Object.keys(macro.fred).length) macroBits.push('FRED ' + Object.keys(macro.fred).length + ' 项');
  if (macro.comtrade && macro.comtrade.rows) macroBits.push('Comtrade ' + macro.comtrade.rows.length + ' 章');
  if (macro.ts) bullets.push({ kind: 'macro', text: macroBits.length ? ('宏观数据已在库：' + macroBits.join('，') + '。详情在「宏观与贸易」，此处不复制图表。') : '宏观数据对象存在但还没有可用系列。', go: 'macro' });
  else bullets.push({ kind: 'macro', text: '尚未拉取宏观数据。可到「宏观与贸易」页刷新（需联网）。', go: 'macro' });
  if (ctx.istats) bullets.push({ kind: 'istats', text: '行业统计已在库，可用于自上而下 TAM。完整表在「论文与统计」。', go: 'research' });
  const tasks = o.tasks || [];
  const due = dueTasks(tasks, today);
  let nextHint;
  if (due.length) nextHint = '优先处理' + (due[0].due < today ? '逾期' : '今日到期') + '任务「' + due[0].title + '」。';
  else if (!(tasks.filter(t => !t.done).length) && ACTIVE_STAGES.includes(o.stage || '')) nextHint = '管道中的机会还没有带到期日的跟进任务，建议写下一件要做的事。';
  else if ((o.stage || 'discover') === 'discover') nextHint = '仍在「发现」阶段。若值得跟进，在收件箱收录到初筛。';
  else nextHint = '暂无到期任务，可继续补充证据或推进阶段门。';
  return { chokes: chokes.slice(0, 4), papers: papers || null, macroReady: !!(macro && macro.ts), nextHint, bullets };
}


function snapshotOppTriage(o = {}) {
  return { inboxStatus: o.inboxStatus || 'open', snoozeUntil: o.snoozeUntil || '', stage: o.stage || 'discover', watched: !!o.watched };
}
function snapshotSigTriage(row = {}) {
  return { status: row.status || row.inboxStatus || 'open', snooze_until: row.snooze_until || row.snoozeUntil || '', note: row.note || '' };
}
function undoTriagePatch(entry) {
  if (!entry || !entry.before) throw new Error('没有可撤销的分拣');
  if (entry.kind === 'signal') {
    return { inboxStatus: entry.before.status || 'open', snoozeUntil: entry.before.snooze_until || '' };
  }
  const b = entry.before;
  return { inboxStatus: b.inboxStatus || 'open', snoozeUntil: b.snoozeUntil || '', stage: b.stage, watched: b.watched };
}
function makeUndoEntry(kind, id, before, action, extra, now = Date.now()) {
  return { kind, id, before: { ...(before || {}) }, action, extra: extra || {}, at: now };
}
function batchTriagePlan(ids, action, extra = {}, now = Date.now()) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!list.length) throw new Error('没有选中的条目');
  const patch = triagePatch(action, extra, now);
  return list.map(id => ({ id, patch }));
}
function inboxKeyAction(key, { meta, ctrl, alt, repeat, typing } = {}) {
  if (meta || ctrl || alt || typing) return null;
  if (repeat && !['j', 'k', 'ArrowDown', 'ArrowUp'].includes(key)) return null;
  const map = { j: 'next', ArrowDown: 'next', k: 'prev', ArrowUp: 'prev', e: 'save', s: 'save', z: 'snooze', x: 'dismiss', u: 'undo', Enter: 'open', Escape: 'clear' };
  return map[key] || null;
}


const STALL_DAYS = { screen: 7, research: 14, validate: 14, go: 21 };
function daysBetween(fromDay, toDay) {
  if (!fromDay || !toDay) return null;
  const a = Date.parse(fromDay + 'T00:00:00+08:00'), b = Date.parse(toDay + 'T00:00:00+08:00');
  if (!isFinite(a) || !isFinite(b)) return null;
  return Math.round((b - a) / 86400e3);
}
function stageChangedDay(o, now = Date.now()) {
  const ts = o && (o.stageChangedAt || o.updatedAt);
  if (!ts) return null;
  const n = +ts;
  if (!isFinite(n) || n <= 0) return null;
  return todaySH(n > 1e12 ? n : n * 1000);
}
function pipelineHealth(o = {}, today, opts = {}) {
  today = today || todaySH();
  const stall = Object.assign({}, STALL_DAYS, opts.stallDays || {});
  const stage = o.stage || 'discover';
  const changed = stageChangedDay(o);
  const ageDays = changed ? daysBetween(changed, today) : null;
  const open = (o.tasks || []).filter(t => !t.done);
  const nextDue = open.map(t => t.due).filter(Boolean).sort()[0] || '';
  const overdue = !!(nextDue && nextDue < today);
  const needsAction = ACTIVE_STAGES.includes(stage) && !open.some(t => t.due);
  const limit = stall[stage];
  const stuck = ACTIVE_STAGES.includes(stage) && ageDays != null && limit != null && ageDays >= limit;
  let hint = '';
  if (overdue) hint = '有逾期任务，应先处理或改期。';
  else if (needsAction) hint = '还没有下一步行动或到期日。';
  else if (stuck) hint = '已在「' + (STAGE_CN[stage] || stage) + '」停留 ' + ageDays + ' 天（参考阈值 ' + limit + ' 天）。';
  return { stage, ageDays, nextDue, overdue, needsAction, stuck, stallAfter: limit || null, hint };
}


function briefOppLink(o, label) { return '[' + (label || o.title || o.id) + '](#opp/' + o.id + ')'; }
function splitBriefLinks(text) {
  const re = /\[([^\]]+)\]\(#(opp|task)\/([^)]+)\)/g, parts = [];
  let last = 0, m, s = String(text ?? '');
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push({ text: s.slice(last, m.index) });
    parts.push({ text: m[1], kind: m[2], id: m[3] });
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push({ text: s.slice(last) });
  return parts.length ? parts : [{ text: s }];
}


const WB_VIEWS = [['workbench', '工作台'], ['inbox', '收件箱'], ['detail', '机会工作区'], ['board', '机会看板'], ['briefs', '工作简报']];
function parseWorkbenchCommand(q, ctx = {}) {
  const raw = String(q || '').trim();
  if (!raw) return [];
  const items = [];
  const opps = ctx.opps || [];
  const findOpps = needle => {
    const s = String(needle || '').toLowerCase();
    if (!s) return ctx.selOpp ? [ctx.selOpp] : [];
    return opps.filter(o => ((o.title || '') + ' ' + (o.industryName || '')).toLowerCase().includes(s)).slice(0, 6);
  };
  const taskM = raw.match(/^(?:\/)?(?:任务|跟进|task)\s*[:：]?\s+(.+)$/i);
  if (taskM) {
    let rest = taskM[1].trim(), needle = '';
    const at = rest.match(/^(.*?)\s+@(.+)$/);
    if (at) { rest = at[1].trim(); needle = at[2].trim(); }
    const targets = needle ? findOpps(needle) : (ctx.selOpp ? [ctx.selOpp] : findOpps(rest).length ? [] : []);
    // if @name used, target those; else current selection; if no sel, require @
    if (!targets.length) {
      items.push({ id: 'task-need-opp', group: '跟进', label: '添加任务需要指定机会：任务 ' + rest + ' @机会关键词', action: 'noop', payload: {} });
    } else {
      for (const o of targets) items.push({ id: 'task-' + o.id, group: '跟进', label: '为「' + o.title + '」添加任务「' + rest + '」', action: 'task:add', payload: { opp_id: o.id, title: rest } });
    }
  }
  const triageMap = [['收录', 'save'], ['保存', 'save'], ['稍后', 'snooze'], ['忽略', 'dismiss'], ['放回', 'restore']];
  for (const [zh, act] of triageMap) {
    const re = new RegExp('^(?:\\/)?' + zh + '(?:\\s+|$)(.*)$');
    const m = raw.match(re);
    if (!m) continue;
    const needle = (m[1] || '').trim();
    const targets = needle ? findOpps(needle) : (ctx.selOpp ? [ctx.selOpp] : (ctx.pending || []).slice(0, 5));
    if (!targets.length) items.push({ id: 'triage-none-' + act, group: '分拣', label: '没有可' + zh + '的机会（先搜索标题，或打开一条机会）', action: 'noop', payload: {} });
    else for (const o of targets) items.push({ id: 'triage-' + act + '-' + o.id, group: '分拣', label: zh + '「' + o.title + '」', action: 'inbox:triage', payload: { id: o.id, kind: 'opp', action: act, extra: act === 'save' ? { stage: 'screen' } : act === 'snooze' ? { days: 1 } : {} } });
    break;
  }
  const viewHit = WB_VIEWS.filter(v => v[1].includes(raw) || v[0].includes(raw.toLowerCase()) || raw === '去' + v[1] || raw === '打开' + v[1]);
  for (const [k, n] of viewHit) items.push({ id: 'go-' + k, group: '视图', label: '打开' + n, action: 'go', payload: k });
  return items;
}

module.exports = {
  STAGE_CN, STAGE_NEXT, ACTIVE_STAGES, todaySH, addDaysSH, weekStartSH, weekKey, nextStage, migrate,
  inboxStatusOf, isPending, groupInbox, triagePatch, newTaskId, normalizeTask, taskState, dueTasks,
  csvEscape, escHtml, pipelineRows, pipelineCsv, pipelineHtml, loopBriefSections, signalInbox,
  ROLE_HOME, resolveHomeView, lastRefreshSummary, emptyStateCopy, taskAlertHits, notifOpenTarget, workspaceDigest, snapshotOppTriage, snapshotSigTriage, undoTriagePatch, makeUndoEntry, batchTriagePlan, inboxKeyAction, STALL_DAYS, daysBetween, stageChangedDay, pipelineHealth, briefOppLink, splitBriefLinks, WB_VIEWS, parseWorkbenchCommand
};
