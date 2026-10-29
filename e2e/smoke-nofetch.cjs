
const { _electron: electron } = require('playwright');
const path = require('path');
(async () => {
  const app = await electron.launch({ args: ['/workspace/opportunity-app/app', '--no-sandbox', '--user-data-dir=' + '/tmp/sr-smoke-ud-qrk0upe_'], env: { ...process.env, SR_E2E: '1', SR_DB: '/tmp/sr-smoke.sqlite', SR_NOFETCH: '1', SR_ONLY: 'hn' }, timeout: 60000 });
  const page = await app.firstWindow();
  await page.waitForSelector('nav a', { timeout: 120000 });
  await page.waitForTimeout(1500);
  const logs = await page.evaluate(() => window.api.call('logs'));
  const busy = await page.evaluate(() => window.api.call('busy:get'));
  const stats = await page.evaluate(() => window.api.call('stats'));
  const hit = (logs || []).some(r => /首次启动，开始自动采集/.test(r.msg));
  console.log(JSON.stringify({ hit, busy, total: stats?.total }));
  if (hit) { console.error('FAIL: non-empty DB triggered first collect'); process.exit(1); }
  if (!stats?.total) { console.error('FAIL: expected signals in copied DB'); process.exit(1); }
  console.log('SMOKE OK');
  await app.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });
