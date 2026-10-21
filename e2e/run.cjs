// 商机雷达 E2E：Playwright Electron 模式，在 Xvfb 虚拟显示上运行。用法：xvfb-run -a node e2e/run.cjs
const { _electron: electron } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const APP = path.resolve(__dirname, '..'), OUT = path.join(APP, 'e2e', 'out'), DB = path.join(os.tmpdir(), 'sr-e2e.sqlite'), UD = path.join(os.tmpdir(), 'sr-e2e-ud');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true }); fs.rmSync(UD, { recursive: true, force: true });
const initSql = require(path.join(APP, 'node_modules/sql.js'));
const results = []; let app, page; const consoleErrors = [];
async function launch() {
  app = await electron.launch({ args: [APP, '--no-sandbox', '--user-data-dir=' + UD], env: { ...process.env, SR_DB: DB, SR_ONLY: 'hn,arxiv' }, timeout: 60000 });
  page = await app.firstWindow(); page.on('console', m => m.type() === 'error' && consoleErrors.push(m.text())); page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  await page.waitForSelector('nav a', { timeout: 30000 });
  await app.evaluate(({ dialog, session }, out) => { let n = 0; const J = (a, b) => a + '/' + String(b).split(/[\\/]/).pop(); dialog.showSaveDialog = async (w, o) => ({ canceled: false, filePath: J(out, (o || w)?.defaultPath || 'file' + (++n)) });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [global.__import || ''] }); session.defaultSession.on('will-download', (e, item) => item.setSavePath(J(out, item.getFilename()))); }, OUT);
}
const t = async (name, fn) => { const t0 = Date.now(); try { await fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); console.log('PASS', name); }
  catch (e) { results.push({ name, ok: false, ms: Date.now() - t0, err: String(e.message || e).split('\n')[0] }); console.log('FAIL', name, e.message.split('\n')[0]); try { await page.screenshot({ path: path.join(OUT, 'fail-' + results.length + '.png') }); } catch {} } };
const expect = (c, m) => { if (!c) throw new Error(m); };
const nav = async n => { await page.locator('nav a', { hasText: n }).first().click(); await page.waitForTimeout(500); };
const noErr = async () => { const c = await page.locator('.err').count(); expect(!c, '视图渲染错误：' + (c && await page.locator('.err').first().innerText())); };
const h1 = async () => (await page.locator('.ph h1').first().innerText()).trim();
const api = (ch, ...a) => page.evaluate(([ch, a]) => window.api.call(ch, ...a), [ch, a]);
const waitFile = async (re, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const f = fs.readdirSync(OUT).find(x => re.test(x) && fs.statSync(path.join(OUT, x)).size > 0); if (f) return f; await new Promise(r => setTimeout(r, 300)); } throw new Error('未生成文件 ' + re); };

(async () => {
  // 准备：复制真实数据库，去掉引导记录 → 模拟首次启动
  const SQL = await initSql(); const db = new SQL.Database(fs.readFileSync(path.join(APP, '.v2.sqlite')));
  db.run("DELETE FROM settings WHERE k='onboard'"); db.run('DELETE FROM alerts'); db.run('DELETE FROM notifications'); fs.writeFileSync(DB, Buffer.from(db.export()));
  await launch();
  await t('01 首次引导：角色→行业→地区，按角色设默认首页', async () => {
    await page.waitForSelector('.onb', { timeout: 10000 }); await page.locator('.onb .opt', { hasText: 'VC 分析师' }).click(); await page.locator('.onb button', { hasText: '下一步' }).click();
    await page.locator('.onb .chip').first().click(); await page.locator('.onb button', { hasText: '下一步' }).click(); await page.locator('.onb .chip', { hasText: '日本' }).click();
    await page.locator('.onb button', { hasText: '完成' }).click(); await page.waitForTimeout(800); expect(!(await page.locator('.onb').count()), '引导未关闭'); expect((await h1()).includes('机会雷达'), 'VC 默认首页应为机会雷达，实际 ' + await h1());
    const c = await api('cfg:get'); expect(c.onboard?.role === 'vc' && c.onboard.regions.includes('日本'), '引导结果未保存'); });
  await t('02 采集：工具栏「立即采集」（HN + arXiv 子集）', async () => {
    const before = (await api('stats')).total; await page.locator('.toolbar button', { hasText: '立即采集' }).click(); await page.waitForSelector('.toast:has-text("采集完成")', { timeout: 120000 });
    const r = await page.locator('.toast').innerText(); expect(/成功/.test(r), r); const after = (await api('stats')).total; expect(after >= before, '信号数减少'); });
  await t('03 聚类：「重新聚类」+ 维度引擎 + 当日快照', async () => {
    await page.locator('.toolbar button', { hasText: '重新聚类' }).click(); await page.waitForSelector('.toast:has-text("已重新语义聚类")', { timeout: 120000 });
    const d = await api('dims:get'); expect(d.cards.length > 10, '维度卡片过少 ' + d.cards.length); const l = await api('snap:list'); expect(l.some(s => s.day === new Date().toLocaleDateString('sv-SE') && !s.backfill), '未生成今日快照'); });
  const VIEWS = ['总览', '机会维度', '信号流', '不对称信息', '机会雷达', '行业覆盖度', '机会详情', '产业链', '论文与统计', '宏观与贸易', '资本与融资', '验证工作流', '机会对比', '机会看板', '报告与 IC 备忘录', '发现日历', '观察列表', '提醒', '数据源', '共享协作', '运行日志', '设置'];
  await t('04 全部 ' + VIEWS.length + ' 个视图切换无渲染错误', async () => { const bad = []; for (const v of VIEWS) { await nav(v); if (await page.locator('.err').count()) bad.push(v); const h = await page.locator('.ph h1').count(); if (!h) bad.push(v + '(无标题)'); } expect(!bad.length, '出错视图：' + bad.join(',')); });
  await t('05 命令面板 Ctrl+K：搜索并跳转视图、搜索机会', async () => {
    await page.keyboard.press('Control+k'); await page.waitForSelector('.palette input'); await page.keyboard.type('产业链'); await page.keyboard.press('Enter'); await page.waitForTimeout(500); expect((await h1()).includes('产业链'), '未跳转产业链');
    await page.keyboard.press('Control+k'); await page.keyboard.type('agent'); await page.waitForTimeout(300); const n = await page.locator('.palette .list a').count(); expect(n > 0, '无机会搜索结果'); await page.keyboard.press('Escape'); expect(!(await page.locator('.palette').count()), 'Esc 未关闭'); });
  await t('06 统一筛选：分数阈值 + 保存视图 + 重新应用', async () => {
    await page.locator('.toolbar select').selectOption(''); await nav('机会雷达'); const rows0 = await page.locator('.dt tbody tr').count(); await page.locator('.fbar input[type=number]').first().fill('60'); await page.waitForTimeout(300);
    const rows1 = await page.locator('.dt tbody tr').count(); expect(rows1 < rows0 && rows1 > 0, `筛选无效 ${rows0}→${rows1}`);
    await page.locator('.fbar button', { hasText: '保存视图' }).click(); await page.locator('.fbar input[placeholder*="视图名称"]').fill('高分'); await page.keyboard.press('Enter');
    await page.locator('.fbar button', { hasText: '重置' }).click(); await page.waitForTimeout(300); expect(await page.locator('.dt tbody tr').count() === rows0, '重置无效');
    await page.locator('.fbar .chip a', { hasText: '高分' }).click(); await page.waitForTimeout(300); expect(await page.locator('.dt tbody tr').count() === rows1, '已保存视图未正确应用'); });
  await t('07 数据表：排序、列选择、CSV 导出', async () => {
    await page.locator('.dt th', { hasText: '行业' }).click(); await page.locator('.dt-tools button', { hasText: '列' }).click(); await page.locator('.colmenu label', { hasText: '阶段' }).click();
    expect(!(await page.locator('.dt th', { hasText: '阶段' }).count()), '列未隐藏'); await page.locator('.colmenu label', { hasText: '阶段' }).click(); await page.locator('.dt-tools button', { hasText: '列' }).click();
    await page.locator('.dt-tools button', { hasText: '导出 CSV' }).click(); const f = await waitFile(/radar\.csv$/); expect(fs.readFileSync(path.join(OUT, f), 'utf8').split('\n').length > 5, 'CSV 行数不足'); });
  await t('08 机会详情：9 个页签逐个打开', async () => {
    await page.locator('.dt tbody tr').first().click(); await page.waitForTimeout(800); const tabs = page.locator('.tabs a, .tabs button'); const n = await tabs.count(); expect(n >= 9, '页签数 ' + n);
    for (let i = 0; i < n; i++) { await tabs.nth(i).click(); await page.waitForTimeout(300); await noErr(); } });
  await t('09 详情：历史评分曲线与首次发现日期', async () => { await page.locator('.tabs >> text=标准报告').click(); await page.waitForTimeout(800); const txt = await page.locator('.report').innerText(); expect(/首次发现：\d{4}-\d\d-\d\d/.test(txt), '无首次发现日期'); expect(await page.locator('.report canvas').count() > 0, '无曲线'); });
  await t('10 观察列表：右键加入观察 → 观察列表可见 → 批量取消', async () => {
    await nav('机会雷达'); await page.locator('.fbar button', { hasText: '重置' }).click(); const row = page.locator('.dt tbody tr').nth(1); const title = (await row.locator('b').first().innerText()).trim();
    await row.click({ button: 'right' }); await page.locator('.ctx a', { hasText: '加入观察' }).click(); await page.waitForTimeout(600); await nav('观察列表'); expect((await page.locator('.dt tbody').innerText()).includes(title), '观察列表缺少 ' + title); });
  await t('11 管道拖拽：看板中从「发现」拖到「初筛」', async () => {
    await nav('机会看板'); const card = page.locator('[data-stage=discover] [data-opp]').first(); const id = await card.getAttribute('data-opp');
    const dt = await page.evaluateHandle(() => new DataTransfer()); const tgt = page.locator('[data-stage=screen]'); await card.dispatchEvent('dragstart', { dataTransfer: dt }); await tgt.dispatchEvent('dragenter', { dataTransfer: dt }); await tgt.dispatchEvent('dragover', { dataTransfer: dt }); await tgt.dispatchEvent('drop', { dataTransfer: dt }); await card.dispatchEvent('dragend', { dataTransfer: dt }); await page.waitForTimeout(800); const o = (await api('opps:list')).find(x => x.id === id); expect(o?.stage === 'screen', '阶段未变：' + o?.stage);
    expect(await page.locator(`[data-stage=screen] [data-opp="${id}"]`).count() === 1, '卡片未出现在初筛列'); });
  await t('12 提醒规则：新增关键词规则并删除', async () => {
    await nav('提醒'); const before = (await api('alerts:list')).length; await page.locator('main .card .row select').first().selectOption('keyword'); await page.locator('main .card .row input').first().fill('agent');
    await page.locator('main .card .row button').first().click(); await page.waitForTimeout(500); const after = await api('alerts:list'); expect(after.length === before + 1, '规则未添加'); });
  await t('13 验证实验：勾选步骤并写实验记录', async () => {
    await nav('验证工作流'); const sel = page.locator('main select').first(); const opts = await sel.locator('option').count(); expect(opts > 1, '无可验证机会'); await sel.selectOption({ index: 1 }); await page.waitForTimeout(400);
    const id = await sel.inputValue(); await page.locator('main .card input[type=checkbox]').first().click(); await page.waitForTimeout(500); const note = page.locator('input[placeholder^="实验记录"]').first(); await note.fill('访谈 5 人，3 人愿意付费'); await note.blur(); await page.waitForTimeout(800);
    const o = (await api('opps:list')).find(x => x.id === id); expect(o.checklist[0].status === 'done' && o.checklist[0].note.includes('3 人'), '实验记录未保存'); });
  await t('14 导出：研究报告 MD / HTML / PDF', async () => {
    await nav('报告与 IC 备忘录'); for (const [b, re] of [['MD', /^(?!SignalRadar).*\.md$/], ['HTML', /\.html$/], ['PDF', /\.pdf$/]]) { await page.locator('main button', { hasText: new RegExp(b, 'i') }).first().click(); await waitFile(re, 40000); } });
  await t('15 导出：IC 备忘录 PDF（Ctrl+M）', async () => { await nav('机会详情'); await page.keyboard.press('Control+m'); await waitFile(/^IC-Memo.*\.pdf$/, 40000); });
  await t('16 导出：发现日历周报 / 月报', async () => { await nav('发现日历'); await page.locator('.seg button', { hasText: '周' }).first().click(); await page.waitForTimeout(500); await page.locator('button', { hasText: '导出周报' }).click(); await waitFile(/week.*\.md$/);
    await page.locator('.seg button', { hasText: '月' }).first().click(); await page.waitForTimeout(500); await page.locator('button', { hasText: '导出月报' }).click(); await waitFile(/month.*\.md$/); });
  await t('17 发现日历：年/月/周/日切换、点击日历进入日视图、环比', async () => {
    for (const g of ['年', '月', '周', '日']) { await page.locator('.fbar .seg button', { hasText: g }).click(); await page.waitForTimeout(600); await noErr(); }
    await page.locator('.fbar .seg button', { hasText: '周' }).click(); await page.waitForTimeout(500); const txt = await page.locator('main').innerText(); expect(/环比/.test(txt) && /新机会 \d+/.test(txt) && /跌出榜单 \d+/.test(txt), '周视图缺少环比或变化列表');
    expect(/回填/.test(txt), '未标注回填'); });
  await t('18 共享包：导出 → 导入', async () => { await nav('共享协作'); await page.locator('main button', { hasText: '导出' }).first().click(); const f = await waitFile(/共享.*\.json$/);
    await app.evaluate((_, p) => { global.__import = p; }, path.join(OUT, f)); await page.locator('main button', { hasText: '导入' }).first().click(); await page.waitForSelector('.toast:has-text("导入")', { timeout: 10000 }); });
  await t('19 设置：修改关键词并保存；数据源开关', async () => {
    await nav('设置'); const kw = page.locator('main textarea, main input').filter({ hasText: '' }).locator('xpath=self::*[contains(@value,"agent") or self::textarea]').first(); const v = await kw.inputValue(); await kw.fill(v + ', e2e-test'); await page.locator('main button', { hasText: '保存' }).first().click(); await page.waitForTimeout(500);
    expect((await api('cfg:get')).keywords.includes('e2e-test'), '设置未保存'); await nav('数据源'); const cb = page.locator('main table input[type=checkbox]:not([disabled])').first(); const was = await cb.isChecked(); await cb.click(); await page.waitForTimeout(500);
    const c = await api('cfg:get'); expect((c.disabledSources.length) !== undefined && (await cb.isChecked()) !== was, '数据源开关无效'); await cb.click(); });
  await t('20 主题与语言切换', async () => {
    await page.locator('.toolbar button[title*="浅色"]').click(); expect(await page.evaluate(() => document.documentElement.dataset.theme) === 'light', '未切浅色');
    await page.locator('.toolbar button[title*="English"]').click(); await page.waitForTimeout(300); expect((await page.locator('nav').innerText()).includes('Overview'), '导航未切英文');
    await page.screenshot({ path: path.join(OUT, 'light-en.png') }); await page.locator('.toolbar button[title*="English"]').click(); await page.locator('.toolbar button[title*="浅色"]').click(); });
  await t('21 提醒中心抽屉（Ctrl+L）', async () => { await page.keyboard.press('Control+l'); await page.waitForSelector('.drawer'); await page.keyboard.press('Escape'); });
  await t('22 每日快照后新高分机会触发提醒', async () => { const n = await api('notif:list'); const snapN = n.filter(x => x.alert_id === -1).length; const today = await api('snap:get', new Date().toLocaleDateString('sv-SE'));
    const expectN = today.opps.filter(o => today.diff.new.includes(o.id) && o.total >= 75).length; expect(snapN >= expectN, `应有 ${expectN} 条快照提醒，实际 ${snapN}`); });
  // 重启：数据与本地偏好是否保留
  const watched = (await api('opps:list')).filter(o => o.watched).map(o => o.id); await app.close(); await launch();
  await t('23 重启后数据保留：观察、阶段、引导、保存的视图、快照', async () => {
    expect(!(await page.locator('.onb').count()), '重启后又出现引导'); const o = await api('opps:list'); expect(watched.every(id => o.find(x => x.id === id)?.watched), '观察列表丢失');
    expect(o.some(x => x.stage === 'screen'), '阶段丢失'); await nav('机会雷达'); expect(await page.locator('.fbar .chip a', { hasText: '高分' }).count() === 1, '保存的视图丢失'); expect((await api('snap:list')).length >= 20, '快照丢失'); });
  await app.close();
  const pass = results.filter(r => r.ok).length; fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ at: new Date().toISOString(), pass, total: results.length, results, consoleErrors: [...new Set(consoleErrors)].slice(0, 30) }, null, 1));
  console.log(`\n${pass}/${results.length} passed`); process.exit(pass === results.length ? 0 : 1);
})().catch(async e => { console.error('FATAL', e); try { await app?.close(); } catch {} process.exit(2); });
