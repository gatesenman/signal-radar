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
    return {
      id: o.id, title: o.title, industry: o.industryName || '', sector: o.sector || '',
      stage: o.stage || 'discover', stageName: STAGE_CN[o.stage || 'discover'] || o.stage,
      total: o.total, conf: o.conf, watched: o.watched ? 1 : 0,
      signals: o.metrics?.signals ?? '', notes: o.notes || '',
      openTasks: open.length, nextDue, stale: o.stale ? 1 : 0
    };
  });
}
function pipelineCsv(opps, tasks = []) {
  const cols = [
    ['id', 'ID'], ['title', '机会'], ['industry', '行业'], ['sector', '板块'],
    ['stageName', '阶段'], ['stage', '阶段键'], ['total', '综合分'], ['conf', '置信度'],
    ['watched', '观察'], ['signals', '信号数'], ['openTasks', '未完成任务'],
    ['nextDue', '最近到期'], ['notes', '备注'], ['stale', '已过期簇']
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
  const tr = rows.map(r => `<tr><td>${escHtml(r.title)}</td><td>${escHtml(r.industry)}</td><td>${escHtml(r.stageName)}</td><td>${r.total}</td><td>${r.conf ?? ''}</td><td>${r.openTasks}</td><td>${escHtml(r.nextDue)}</td><td>${escHtml(String(r.notes).slice(0, 160))}</td></tr>`).join('');
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>商机雷达 · 管道清单</title>
<style>body{font:14px/1.5 "Noto Sans CJK SC","PingFang SC",sans-serif;color:#111;margin:24px}h1{font-size:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f4f6f9}td:nth-child(4),td:nth-child(5),td:nth-child(6){text-align:right}@media print{button{display:none}}</style>
</head><body><button onclick="print()">打印</button>
<h1>商机雷达 · 管道清单</h1>
<p>${escHtml(meta.day || todaySH())}（北京时间） · ${rows.length} 条 · ${escHtml(pipe)}</p>
<table><thead><tr><th>机会</th><th>行业</th><th>阶段</th><th>综合分</th><th>置信度</th><th>未完成任务</th><th>最近到期</th><th>备注</th></tr></thead>
<tbody>${tr || '<tr><td colspan="8">暂无机会。请先采集信号并聚类。</td></tr>'}</tbody></table>
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
  if (active.length) active.slice(0, 8).forEach(o => lines.push(`- ${o.title}（${STAGE_CN[o.stage] || o.stage}，${o.total} 分）`));
  else lines.push('- 管道中尚无已分拣机会（可在收件箱收录）');
  const due = dueTasks(tasks, today);
  lines.push('', week ? '## 本周待办与跟进' : '## 待办与跟进');
  if (!tasks.length) lines.push('- 还没有跟进任务。可在机会工作区添加，并设置到期日。');
  else if (!due.length) lines.push('- 今日无到期或逾期任务（未完成 ' + tasks.filter(t => !t.done).length + ' 项）');
  else due.slice(0, 12).forEach(t => lines.push(`- ${t.due < today ? '逾期' : '今日到期'} ${t.due}：${t.title}${t.oppTitle ? '（' + t.oppTitle + '）' : ''}`));
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

module.exports = {
  STAGE_CN, STAGE_NEXT, ACTIVE_STAGES, todaySH, addDaysSH, weekStartSH, weekKey, nextStage, migrate,
  inboxStatusOf, isPending, groupInbox, triagePatch, newTaskId, normalizeTask, taskState, dueTasks,
  csvEscape, escHtml, pipelineRows, pipelineCsv, pipelineHtml, loopBriefSections, signalInbox,
  ROLE_HOME, resolveHomeView, lastRefreshSummary, emptyStateCopy
};
