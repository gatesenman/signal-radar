# 商机雷达 Signal Radar（完整版 v1.0）

AI 创业机会发现桌面应用：采集全球公开实时信号 → 存入本地 SQLite → 跨源主题聚类 → VC 六维评分 → 不对称信息、商业模式画布、反方观点、验证工作流 → 看板、提醒、报告、共享。
**没有配置 LLM 时全部功能由规则引擎完成**；在「设置」中填写 OpenAI 兼容 Key 或 Ollama 地址后，「AI 深度分析」生效。

## 技术栈与选型说明
Electron 33 + React 18 + ECharts 5 + sql.js（SQLite/WASM）+ Vite。
没选 Tauri 2 的原因：构建机缺少 WebKitGTK 开发库和 pkg-config（要 sudo apt 装系统包），并且要编译数百个 crate；另外 Tauri 在 Linux/Windows/mac 上用的是三套不同的系统 WebView，ECharts 渲染和截图验证都不好统一。Electron 的离线缓存在本机就有，可以直接打出 AppImage，并在 xvfb 下用真实数据截图验证。sql.js 不需要编译原生模块，同一份代码在三个平台都能跑。

## 功能模块
| 模块 | 说明 |
|---|---|
| 多源信号采集 | 12 个免费、不需要 key 的源，外加 3 个需 key 的源（见下）；并发采集，遇到 429 会退避重试，每次运行记录日志 |
| 信号流 | 全部原始信号，支持搜索和按来源筛选，可点开原文 |
| 机会雷达 | 用 n-gram 做跨源聚类得到主题，气泡图（竞争 × 增长）+ 带筛选的列表 |
| 机会详情 | 六维雷达图、判断摘要、信号构成、商业模式画布（9 格）、红队反方观点、验证清单、相关融资、证据链（每条带原文链接）、备注与评论 |
| VC 六维评分 | 市场规模 / 增长动能（近 3 天对比前 7 天）/ 竞争（反向）/ 可防御性 / 变现清晰度 / 创始人匹配（来自设置里的技能），再加跨源共振和新颖度；LLM 可在规则分基础上 ±15 修正 |
| 不对称信息 | 地域差（中文源 vs 英文源）、技术→应用、需求→供给（痛点词）、人才流向（招聘）、资本→认知（融资多、讨论少） |
| 融资动态 | 从新闻标题里抽取公司、金额、轮次，配图表；配置 Crunchbase Key 后可获取结构化轮次 |
| 看板 | 发现 / 研究 / 验证 / 立项 / 放弃，可拖拽；推进过的机会会持久保留 |
| 验证工作流 | 每个实验有状态、结果和记录，可增删；系统按结果给出建议：立项、继续验证或放弃 |
| 机会对比 | 双雷达叠加 + 指标对比表 |
| 提醒 | 规则：评分阈值、关键词、融资金额、观察中的机会；采集后检查，命中发系统通知；可设定时自动采集 |
| 导出报告 | 支持 Markdown / HTML / PDF，内容含评分、画布、反方观点、验证清单和证据链接 |
| 共享协作 | 导出 JSON 共享包（不含 Key）；对方导入后合并：备注追加，评论去重 |
| 设置 | LLM（OpenAI 兼容 / Ollama，带测试连接）、关键词、技能、采集间隔、各源的 Key |

## 数据源（2026-10-21 在构建机上实测）
免费、不需要 key：Hacker News Algolia ✓、GitHub Search ✓（没有 token 时每分钟 10 次）、Lobsters ✓、Product Hunt RSS ✓、Reddit RSS ✓（r/startups、SaaS、Entrepreneur、SideProject、smallbusiness）、TechCrunch RSS ✓、Google News RSS ✓、Stack Overflow ✓、V2EX ✓、RemoteOK 招聘 ✓、GDELT ⚠（限流严，时好时坏）、arXiv ⚠（短时间请求太多会 429）。
需要 key（在设置里填）：X API v2 Recent Search、Product Hunt GraphQL、Crunchbase v4。这三个已经写了接入代码，但没有 key，未实测。

## 运行与构建
```bash
npm install            # 需要 Node 18+
npm start              # 构建前端并启动
npm run pack:linux     # → release/SignalRadar-1.0.0.AppImage、tar.gz
npm run pack:win       # 在 Windows 上运行 → release/*.exe（NSIS 安装包）
npm run pack:mac       # 在 macOS 上运行 → release/*.dmg（未签名，首次打开要右键→打开，或执行 xattr -cr）
```
Windows 和 mac 建议在各自系统上构建（electron-builder 不能跨平台打 dmg；Windows 安装包在 Linux 上打需要 wine）。
数据库位置：Linux `~/.config/signal-radar/`，Windows `%APPDATA%\signal-radar\`，mac `~/Library/Application Support/signal-radar/`。

截图模式：`SR_SHOT=./shots SR_VIEWS=dashboard,detail,radar npm start`（会先做一次真实采集，再逐页截图）。

## 已知限制
- 聚类基于关键词 n-gram，主题名偏技术词（比如 "php security"），不等于完整的商业机会表述。配置 LLM 后可以生成更好的机会名称和判断。
- 评分是用公开信号的数量和分布推算的代理指标，不代表真实的市场规模。
- 融资信息靠标题正则抽取，可能漏抓或误抓。
- 协作靠文件导入导出，没有实时同步。
