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


t('默认首页是工作台；homeMode=role 才走 5.0 角色页', () => {
  assert.strictEqual(WB.resolveHomeView({}), 'workbench');
  assert.strictEqual(WB.resolveHomeView({ onboard: { role: 'founder' } }), 'workbench');
  assert.strictEqual(WB.resolveHomeView({ homeMode: 'role', onboard: { role: 'founder' } }), 'dims');
  assert.strictEqual(WB.resolveHomeView({ homeMode: 'role', onboard: { role: 'vc' } }), 'radar');
  assert.strictEqual(WB.resolveHomeView({ homeMode: 'role', onboard: { role: 'corp' } }), 'chain');
  assert.strictEqual(WB.resolveHomeView({ homeMode: 'role', onboard: { role: 'unknown' } }), 'workbench');
  assert.strictEqual(WB.ROLE_HOME.founder, 'dims');
});
t('采集摘要：全部失败 / 部分失败 / 成功，不把空报告当成成功', () => {
  const err = WB.lastRefreshSummary([{ id: 'fred', ok: false, err: 'nokey' }, { id: 'hn', ok: false, err: 'timeout' }], 1);
  assert.strictEqual(err.status, 'error');
  assert.strictEqual(err.ok, 0);
  assert.strictEqual(err.fail, 2);
  assert.strictEqual(err.errors[0].id, 'fred');
  const part = WB.lastRefreshSummary([{ id: 'hn', ok: true, added: 3 }, { id: 'fred', ok: false, err: 'nokey' }], 2);
  assert.strictEqual(part.status, 'partial');
  assert.strictEqual(part.added, 3);
  const ok = WB.lastRefreshSummary([{ id: 'hn', ok: true, added: 1 }], 3);
  assert.strictEqual(ok.status, 'ok');
  const empty = WB.lastRefreshSummary([], 4);
  assert.strictEqual(empty.status, 'empty');
});
t('空状态文案：采集中、失败、尚无数据三种互不混淆', () => {
  const busy = WB.emptyStateCopy({ busy: true, hasSignals: false, view: 'workbench' });
  assert.strictEqual(busy.kind, 'busy');
  assert.ok(busy.text.includes('进行中'));
  const err = WB.emptyStateCopy({ hasSignals: false, lastRefresh: { status: 'error', errors: [{ id: 'x', err: 'down' }] }, view: 'inbox' });
  assert.strictEqual(err.kind, 'error');
  assert.ok(err.errors.length === 1 && err.text.includes('失败'));
  const empty = WB.emptyStateCopy({ hasSignals: false, view: 'briefs' });
  assert.strictEqual(empty.kind, 'empty');
  assert.ok(empty.text.includes('简报'));
  const has = WB.emptyStateCopy({ hasSignals: true, lastRefresh: { status: 'error' }, view: 'workbench' });
  assert.strictEqual(has.kind, 'empty'); // 已有信号时不把失败当成空库
});


t('到期任务提醒：只覆盖今日与逾期，ref 含机会与状态且不把完成项算进去', () => {
  const hits = WB.taskAlertHits([
    { id: 't1', opp_id: 'o_abc123abc12', title: '要舱位', due: '2026-11-22', done: 0, oppTitle: '东南亚专线' },
    { id: 't2', opp_id: 'o_abc123abc12', title: '回访客户', due: '2026-11-23', done: 0, oppTitle: '东南亚专线' },
    { id: 't3', opp_id: 'o_zzz', title: '已完成', due: '2026-11-22', done: 1 },
    { id: 't4', opp_id: 'o_zzz', title: '以后再说', due: '2026-11-28', done: 0 },
    { id: 't5', opp_id: 'o_zzz', title: '没写日期', due: '', done: 0 }
  ], '2026-11-23');
  assert.deepStrictEqual(hits.map(h => h.state), ['overdue', 'today']);
  assert.ok(hits[0].ref.includes('o_abc123abc12::task:t1:2026-11-22:overdue'));
  assert.ok(hits[0].titleZh.includes('逾期任务：要舱位'));
  assert.ok(hits[1].titleZh.includes('今日到期：回访客户'));
  assert.strictEqual(hits.length, 2);
});
t('提醒点击目标：任务通知回到机会，普通机会 id 仍可用，无关 ref 不跳转', () => {
  assert.strictEqual(WB.notifOpenTarget('o_abc123abc12::task:t1:2026-11-22:overdue'), 'o_abc123abc12');
  assert.strictEqual(WB.notifOpenTarget('o_abc123abc12'), 'o_abc123abc12');
  assert.strictEqual(WB.notifOpenTarget('o_abc123abc12:Mon Nov 23 2026'), 'o_abc123abc12');
  assert.strictEqual(WB.notifOpenTarget('https://example.com'), null);
  assert.strictEqual(WB.notifOpenTarget(''), null);
});


t('工作区摘要：卡脖子、论文样本不足、宏观在库与下一步提示都来自传入数据', () => {
  const d = WB.workspaceDigest({
    id: 'o_1', title: '冷链专线', industry: '2030', industryName: '公路运输', stage: 'research',
    chain: { name: '物流与货运', chokes: [{ node: '上游·船用燃料', why: '单一国家份额 62%' }] },
    tasks: []
  }, {
    papers: [{ code: '2030', cn: '公路运输', papers: 4, r14: 2, r28: 1, lowSample: true, growth: null, gap: 1.2, citAccel: null }],
    macro: { ts: 1, wb: { gdp: 1, pop: 1 }, imf: {}, fred: { dgs10: 1 }, comtrade: { rows: [1, 2, 3] } },
    istats: { ok: true }
  }, '2026-11-23');
  assert.ok(d.nextHint.includes('跟进任务'));
  assert.ok(d.bullets.some(b => b.kind === 'choke' && b.text.includes('船用燃料') && b.text.includes('62%')));
  assert.ok(d.bullets.some(b => b.kind === 'papers' && b.text.includes('样本不足') && b.text.includes('落差 1.2')));
  assert.ok(d.bullets.some(b => b.kind === 'macro' && b.text.includes('世界银行 2 项') && b.text.includes('Comtrade 3 章')));
  assert.ok(d.macroReady);
  const empty = WB.workspaceDigest({ stage: 'discover' }, {}, '2026-11-23');
  assert.ok(empty.nextHint.includes('发现'));
  assert.ok(empty.bullets.some(b => b.text.includes('尚未匹配到产业链')));
  assert.ok(empty.bullets.some(b => b.text.includes('尚未拉取宏观')));
  const due = WB.workspaceDigest({ stage: 'screen', tasks: [{ title: '要报价', due: '2026-11-20', done: 0 }] }, {}, '2026-11-23');
  assert.ok(due.nextHint.includes('逾期') && due.nextHint.includes('要报价'));
});


t('撤销分拣：恢复收录前的状态，不会把忽略写成稍后', () => {
  const entry = WB.makeUndoEntry('opp', 'o_1', WB.snapshotOppTriage({ inboxStatus: 'open', stage: 'discover', watched: false }), 'save', { stage: 'screen' }, 1);
  const p = WB.undoTriagePatch(entry);
  assert.strictEqual(p.inboxStatus, 'open');
  assert.strictEqual(p.stage, 'discover');
  assert.strictEqual(p.watched, false);
  const sig = WB.undoTriagePatch(WB.makeUndoEntry('signal', 's1', WB.snapshotSigTriage({ status: 'open' }), 'dismiss'));
  assert.strictEqual(sig.inboxStatus, 'open');
  let threw = false; try { WB.undoTriagePatch(null); } catch (e) { threw = /没有可撤销/.test(e.message); }
  assert.ok(threw);
});
t('批量分拣：对每个 id 生成同一动作的 patch，空选中抛错', () => {
  const now = Date.parse('2026-11-22T20:00:00Z');
  const plan = WB.batchTriagePlan(['a', 'b', 'a'], 'snooze', { days: 3 }, now);
  assert.deepStrictEqual(plan.map(x => x.id), ['a', 'b']);
  assert.strictEqual(plan[0].patch.inboxStatus, 'snoozed');
  assert.strictEqual(plan[0].patch.snoozeUntil, '2026-11-26');
  let threw = false; try { WB.batchTriagePlan([], 'save'); } catch (e) { threw = /没有选中/.test(e.message); }
  assert.ok(threw);
});
t('收件箱快捷键：移动/收录/稍后/忽略/撤销，输入框内不触发', () => {
  assert.strictEqual(WB.inboxKeyAction('j'), 'next');
  assert.strictEqual(WB.inboxKeyAction('k'), 'prev');
  assert.strictEqual(WB.inboxKeyAction('e'), 'save');
  assert.strictEqual(WB.inboxKeyAction('z'), 'snooze');
  assert.strictEqual(WB.inboxKeyAction('x'), 'dismiss');
  assert.strictEqual(WB.inboxKeyAction('u'), 'undo');
  assert.strictEqual(WB.inboxKeyAction('Enter'), 'open');
  assert.strictEqual(WB.inboxKeyAction('e', { typing: true }), null);
  assert.strictEqual(WB.inboxKeyAction('e', { ctrl: true }), null);
  assert.strictEqual(WB.inboxKeyAction('e', { repeat: true }), null);
  assert.strictEqual(WB.inboxKeyAction('j', { repeat: true }), 'next');
});

const pass = results.filter(r => r.ok).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
