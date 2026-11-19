// v5.0：空库首次启动应自动采集；SR_NOFETCH 路径不采集
const { _electron: electron } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const APP = path.resolve(__dirname, '..');
const initSql = require(path.join(APP, 'node_modules/sql.js'));
const results = [];
const t = async (name, fn) => { const t0 = Date.now(); try { await fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); console.log('PASS', name); }
  catch (e) { results.push({ name, ok: false, ms: Date.now() - t0, err: String(e.message || e).split('\n')[0] }); console.log('FAIL', name, e.message.split('\n')[0]); } };
const expect = (c, m) => { if (!c) throw new Error(m); };

(async () => {
  const SQL = await initSql();

  // A) 空库 + SR_ONLY=hn → 应出现「首次启动」日志与 busy/采集中
  const DB1 = path.join(os.tmpdir(), 'sr-fc-empty.sqlite');
  const UD1 = path.join(os.tmpdir(), 'sr-fc-empty-ud');
  fs.rmSync(UD1, { recursive: true, force: true });
  { const db = new SQL.Database();
    db.run(`CREATE TABLE signals(id TEXT PRIMARY KEY, source TEXT, kind TEXT, region TEXT, title TEXT, url TEXT, text TEXT, ts INTEGER, engagement REAL, fetched INTEGER, weight REAL, ind TEXT, ind_by TEXT, meta TEXT, emb BLOB);
    CREATE TABLE opps(id TEXT PRIMARY KEY, json TEXT, total INTEGER, updated INTEGER);
    CREATE TABLE workspace(opp_id TEXT PRIMARY KEY, json TEXT);
    CREATE TABLE settings(k TEXT PRIMARY KEY, v TEXT);
    CREATE TABLE runs(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, source TEXT, ok INTEGER, count INTEGER, ms INTEGER, err TEXT);
    CREATE TABLE alerts(id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, value TEXT, enabled INTEGER DEFAULT 1);
    CREATE TABLE snapshots(day TEXT PRIMARY KEY, ts INTEGER, backfill INTEGER, stats TEXT, data BLOB);
    CREATE TABLE notifications(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, alert_id INTEGER, ref TEXT, title TEXT, body TEXT, read INTEGER DEFAULT 0);
    CREATE TABLE logs(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, msg TEXT);`);
    fs.writeFileSync(DB1, Buffer.from(db.export())); }
  let app = await electron.launch({ args: [APP, '--no-sandbox', '--user-data-dir=' + UD1], env: { ...process.env, SR_E2E: '1', SR_DB: DB1, SR_ONLY: 'hn' }, timeout: 60000 });
  let page = await app.firstWindow(); page.setDefaultTimeout(60000);
  await page.waitForSelector('nav a', { timeout: 120000 });
  await t('A1 空库启动后出现「首次启动，开始自动采集」日志', async () => {
    const t0 = Date.now(); let hit = false;
    while (Date.now() - t0 < 20000) {
      const logs = await page.evaluate(() => window.api.call('logs'));
      if ((logs || []).some(r => /首次启动，开始自动采集/.test(r.msg))) { hit = true; break; }
      await page.waitForTimeout(400);
    }
    expect(hit, '未找到首次启动自动采集日志');
  });
  await t('A2 空库自动采集时 busy 或工具栏显示采集中', async () => {
    const t0 = Date.now(); let ok = false;
    while (Date.now() - t0 < 15000) {
      const busy = await page.evaluate(() => window.api.call('busy:get'));
      const bar = await page.locator('.status').innerText();
      const tb = await page.locator('.toolbar').innerText();
      if (busy || /采集中/.test(bar) || /采集中/.test(tb)) { ok = true; break; }
      await page.waitForTimeout(300);
    }
    expect(ok, '未看到 busy/采集中');
  });
  await t('A3 DEFAULTS.autoRefresh 默认为 true', async () => {
    const c = await page.evaluate(() => window.api.call('cfg:get'));
    expect(c.autoRefresh === true, 'autoRefresh 默认不是 true：' + c.autoRefresh);
  });
  // 不等待整轮采集结束（会跑 hn）；关掉即可
  await app.close();

  // B) 空库 + SR_NOFETCH=1 → 不应自动采集
  const DB2 = path.join(os.tmpdir(), 'sr-fc-nofetch.sqlite');
  const UD2 = path.join(os.tmpdir(), 'sr-fc-nofetch-ud');
  fs.rmSync(UD2, { recursive: true, force: true });
  fs.copyFileSync(DB1, DB2);
  app = await electron.launch({ args: [APP, '--no-sandbox', '--user-data-dir=' + UD2], env: { ...process.env, SR_E2E: '1', SR_DB: DB2, SR_NOFETCH: '1', SR_ONLY: 'hn' }, timeout: 60000 });
  page = await app.firstWindow();
  await page.waitForSelector('nav a', { timeout: 120000 });
  await page.waitForTimeout(2500);
  await t('B1 SR_NOFETCH=1 时空库不触发自动采集', async () => {
    const logs = await page.evaluate(() => window.api.call('logs'));
    expect(!(logs || []).some(r => /首次启动，开始自动采集/.test(r.msg)), 'SR_NOFETCH 下仍触发了自动采集');
    const busy = await page.evaluate(() => window.api.call('busy:get'));
    expect(!busy, 'SR_NOFETCH 下 busy 仍为 true');
  });
  await app.close();

  const pass = results.filter(r => r.ok).length;
  console.log(`\nfirst-collect ${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
