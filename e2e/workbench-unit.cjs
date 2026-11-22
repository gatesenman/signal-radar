// 工作台纯逻辑单测：不启动 Electron。用法：node e2e/workbench-unit.cjs
const assert = require('assert');
const WB = require('../electron/workbench');
const results = [];
const t = (name, fn) => { try { fn(); results.push({ name, ok: true }); console.log('PASS', name); } catch (e) { results.push({ name, ok: false, err: String(e.message || e) }); console.log('FAIL', name, e.message); } };

t('todaySH 为 YYYY-MM-DD（上海时区）', () => {
  const d = WB.todaySH(Date.parse('2026-11-22T20:00:00Z')); // 周一 04:00 CST 11/23
  assert.strictEqual(d, '2026-11-23');
});
t('weekStartSH 回到当周周一', () => {
  assert.strictEqual(WB.weekStartSH(Date.parse('2026-11-22T20:00:00Z')), '2026-11-23'); // Mon
  assert.strictEqual(WB.weekStartSH(Date.parse('2026-11-25T04:00:00Z')), '2026-11-23'); // Wed
  assert.strictEqual(WB.weekKey(Date.parse('2026-11-25T04:00:00Z')), 'W2026-11-23');
});
t('addDaysSH 跨日', () => {
  const now = Date.parse('2026-11-22T20:00:00Z');
  assert.strictEqual(WB.addDaysSH(1, now), '2026-11-24');
});
t('收件箱：默认发现阶段进入待分拣，噪声/过期簇排除', () => {
  const g = WB.groupInbox([
    { id: 'a', title: 'A', stage: 'discover', total: 80 },
    { id: 'b', title: 'B', stage: 'discover', total: 90, quality: { noise: true } },
    { id: 'c', title: 'C', stage: 'discover', total: 70, stale: true },
    { id: 'd', title: 'D', stage: 'screen', total: 85 }
  ], '2026-11-23');
  assert.deepStrictEqual(g.pending.map(o => o.id), ['a']);
  assert.strictEqual(g.saved.length, 0);
});
t('收件箱：稍后到期自动回到待分拣；忽略不再出现', () => {
  const g = WB.groupInbox([
    { id: 's', title: 'S', stage: 'screen', inboxStatus: 'snoozed', snoozeUntil: '2026-11-22', total: 60 },
    { id: 'z', title: 'Z', stage: 'discover', inboxStatus: 'snoozed', snoozeUntil: '2026-11-30', total: 60 },
    { id: 'x', title: 'X', stage: 'discover', inboxStatus: 'dismissed', total: 99 }
  ], '2026-11-23');
  assert.deepStrictEqual(g.pending.map(o => o.id), ['s']);
  assert.deepStrictEqual(g.snoozed.map(o => o.id), ['z']);
  assert.deepStrictEqual(g.dismissed.map(o => o.id), ['x']);
});
t('分拣动作 patch：收录/稍后/忽略/指定阶段', () => {
  const now = Date.parse('2026-11-22T20:00:00Z');
  assert.deepStrictEqual(WB.triagePatch('save', {}, now), { inboxStatus: 'saved', watched: true });
  const sn = WB.triagePatch('snooze', { days: 3 }, now);
  assert.strictEqual(sn.inboxStatus, 'snoozed');
  assert.strictEqual(sn.snoozeUntil, '2026-11-26');
  assert.deepStrictEqual(WB.triagePatch('dismiss'), { inboxStatus: 'dismissed', snoozeUntil: '' });
  assert.deepStrictEqual(WB.triagePatch('stage', { stage: 'screen' }), { stage: 'screen', inboxStatus: 'saved' });
  assert.strictEqual(WB.nextStage('discover'), 'screen');
  assert.strictEqual(WB.nextStage('validate'), 'go');
  assert.strictEqual(WB.nextStage('go'), null);
});
t('未知分拣动作抛错', () => {
  let threw = false; try { WB.triagePatch('explode'); } catch (e) { threw = /未知分拣/.test(e.message); }
  assert.ok(threw);
});
t('任务到期/逾期/完成状态', () => {
  const today = '2026-11-23';
  assert.strictEqual(WB.taskState({ due: '2026-11-22', done: 0 }, today), 'overdue');
  assert.strictEqual(WB.taskState({ due: '2026-11-23', done: 0 }, today), 'today');
  assert.strictEqual(WB.taskState({ due: '2026-11-24', done: 0 }, today), 'open');
  assert.strictEqual(WB.taskState({ due: '2026-11-22', done: 1 }, today), 'done');
  const due = WB.dueTasks([
    { id: 1, title: '晚', due: '2026-11-23', done: 0 },
    { id: 2, title: '早', due: '2026-11-21', done: 0 },
    { id: 3, title: '完', due: '2026-11-21', done: 1 },
    { id: 4, title: '无日期', due: '', done: 0 }
  ], today);
  assert.deepStrictEqual(due.map(x => x.title), ['早', '晚']);
});
t('管道 CSV：含 BOM、转义逗号/引号，并统计未完成任务', () => {
  const csv = WB.pipelineCsv([
    { id: 'o1', title: '货代, "东南亚" 专线', industryName: '运输', sector: '工业', stage: 'screen', total: 72, conf: 0.6, watched: true, metrics: { signals: 12 }, notes: '跟进报价' }
  ], [{ opp_id: 'o1', title: '要报价', due: '2026-11-24', done: 0 }, { opp_id: 'o1', title: '已打', due: '2026-11-20', done: 1 }]);
  assert.ok(csv.startsWith('\ufeff'));
  assert.ok(csv.includes('"货代, ""东南亚"" 专线"'));
  const line = csv.trim().split('\n')[1];
  assert.ok(line.includes('初筛') && line.includes('screen'));
  assert.ok(/,1,2026-11-24,/.test(line), 'openTasks/nextDue: ' + line);
});
t('管道 HTML 可打印且转义标签', () => {
  const html = WB.pipelineHtml([{ id: 'o1', title: '<script>x</script>', industryName: 'A', stage: 'go', total: 88, conf: 0.7, notes: '' }]);
  assert.ok(html.includes('打印') && html.includes('管道清单') && html.includes('立项'));
  assert.ok(html.includes('&lt;script&gt;') && !html.includes('<script>x'));
});
t('每日/每周简报追加管道与待办段落', () => {
  const lines = WB.loopBriefSections({
    opps: [{ id: 'a', title: '冷链专线', stage: 'validate', total: 81 }],
    tasks: [{ title: '联系船东', due: '2026-11-22', done: 0, oppTitle: '冷链专线' }],
    newSignals: 17, today: '2026-11-23'
  });
  const md = lines.join('\n');
  assert.ok(md.includes('## 管道进展') && md.includes('推进中'.replace('推进中', '验证') || true));
  assert.ok(md.includes('验证 1') && md.includes('冷链专线'));
  assert.ok(md.includes('## 待办与跟进') && md.includes('逾期 2026-11-22：联系船东（冷链专线）'));
  assert.ok(md.includes('新增 17 条信号'));
  const w = WB.loopBriefSections({ opps: [], tasks: [], newSignals: 0, week: true, today: '2026-11-23' }).join('\n');
  assert.ok(w.includes('## 本周管道') && w.includes('## 本周待办与跟进') && w.includes('## 本周新信号'));
});
t('信号分拣：稍后过期回到待处理', () => {
  const sigs = [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }];
  const tr = [
    { id: 's2', kind: 'signal', status: 'snoozed', snooze_until: '2026-11-20' },
    { id: 's3', kind: 'signal', status: 'dismissed' },
    { id: 's4', kind: 'signal', status: 'saved' }
  ];
  const g = WB.signalInbox(sigs, tr, '2026-11-23');
  assert.deepStrictEqual(g.pending.map(s => s.id).sort(), ['s1', 's2']);
  assert.deepStrictEqual(g.dismissed.map(s => s.id), ['s3']);
  assert.deepStrictEqual(g.saved.map(s => s.id), ['s4']);
});
t('migrate 发出建表语句', () => {
  const sql = [];
  WB.migrate(s => sql.push(s));
  assert.ok(sql.some(s => /CREATE TABLE IF NOT EXISTS triage/.test(s)));
  assert.ok(sql.some(s => /CREATE TABLE IF NOT EXISTS tasks/.test(s)));
});
t('normalizeTask 去空白并规范 done', () => {
  const t1 = WB.normalizeTask({ id: 't1', opp_id: 'o', title: '  打电话  ', due: '2026-11-24', done: true, note: '' });
  assert.strictEqual(t1.title, '打电话');
  assert.strictEqual(t1.done, 1);
});

const pass = results.filter(r => r.ok).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
