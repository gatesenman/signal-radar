# 商机雷达 Signal Radar 6.0

AI 创业机会发现桌面应用：从 80+ 个全球公开数据源采集信号，在本机做语义聚类和可解释评分，输出机会陈述、TAM/SAM/SOM、竞争格局、Why Now、产业链卡脖子分析和投委会备忘录。所有结论都附来源链接，假设会明确标注。

## 运行说明
本仓库提供源码，不包含安装包。6.0 是端到端工作台：侧栏「工作循环」按 工作台 → 收件箱 → 机会工作区 → 管道 → 工作简报 走完发现、分拣、调研、跟进和导出。详见 `NOTES-6.0.md`。

自行构建的安装包未做代码签名，Windows SmartScreen 可能提示“Windows 已保护你的电脑”，可点击 **更多信息 → 仍要运行**。数据保存在 Windows 的 `%APPDATA%\signal-radar`（SQLite 数据库、CC-NEWS 缓存）。系统要求：Windows 10/11 x64，内存 4GB 以上，磁盘 1GB 以上。语义嵌入模型需放在 `models/`（离线可用，约 130MB），首次采集需要联网。

## 界面
- 桌面软件风格：自绘标题栏（最小化/最大化/关闭）、菜单栏（文件/视图/分析/工具/帮助）、工具栏（采集、聚类、行业筛选、报告、IC 备忘录）、可折叠侧边栏、状态栏、右键菜单。
- 图标使用 Remix Icon（Apache-2.0，离线打包）；应用图标见 `build/icon.png` 和 `build/icon.ico`。
- 快捷键：Ctrl+R 采集 · Ctrl+K 搜索 · Ctrl+B 侧边栏 · Ctrl+1…9 切换视图 · Ctrl+E 报告 · Ctrl+M IC 备忘录 · Ctrl+, 设置 · F1 快捷键 · Esc 关闭菜单。

## 视图
工作台、收件箱、机会工作区、机会看板、工作简报；以及原有的总览、信号流、机会雷达（质量闸门隐藏噪声簇）、机会详情（概览/评分依据/市场规模/竞争格局/单位经济/护城河与风险/画布与验证/证据链）、不对称信息、资本与融资、行业覆盖度（GICS 74 子行业 + 10 个国家/地区）、产业链、论文与统计、宏观与贸易、看板、验证工作流、对比、提醒、数据源、报告与 IC 备忘录、共享、日志、设置。

## 分析方法
- **语义聚类**：本地 ONNX 运行 `paraphrase-multilingual-MiniLM-L12-v2`（中英跨语言），做 leader 聚类（余弦阈值 0.6），用 c-TF-IDF 生成标签。
- **可解释评分**：六维评分（市场、增长、竞争、护城河、变现、创始人匹配），每一维给出依据、置信度和证据。时间序列按"主题信号 / 当日全库信号"（‰）归一化，计算速度和加速度，并识别一次性热点和季节性。综合分 = 50 + (加权分 − 50) × (0.55 + 0.45 × 置信度)。
- **质量闸门**：以政策公告、招聘或榜单为主，或只有单一来源、标签空泛的簇会被降权，并标注原因。
- **TAM**：
  - 自上而下优先用 OECD STAN（美国行业总产出）+ Eurostat SBS（EU27 营业额），通过 GICS→ISIC/NACE 映射得到行业规模。没有映射的行业回退到世界银行 GDP × 产业占比。
  - 细分比例和汇率是假设。自下而上（客户数 × ARPU）全部是假设，可以修改。
- **产业链**：12 条产业链，按上/中/下游节点组织：
  - HS6 节点用 OEC/BACI 计算出口国份额、HHI 和同比，并用 UN Comtrade 交叉核对中国出口。
  - 矿产节点用 USGS MCS 2025 的世界产量数据。
  - 单一国家份额 ≥50% 或 HHI ≥2500 的节点记为卡脖子/高集中，作为不对称信号挂到同行业的机会上。
- **论文指标**：按行业统计论文增速（近 14 天 vs 前 14 天）、引用加速度、论文→产品转化落差 log2((论文+1)/(产品+1))。
- **不对称信息**：中美热度差、技术-产品落差、需求/供给比、资本/认知比、人才流向（与全库基线比较的 log2 值），以及产业链卡脖子。
- **Common Crawl**：CC-NEWS 用内置的 Node 流式 WARC 解析器（不依赖 Python warcio），可以设置每日文件数、单文件读取上限和磁盘缓存上限。CDX 按 TLD 统计块数、与上一期索引对比，抽样新域名和 /pricing、/careers 页面，遇 503 指数退避。
- 未配置 LLM 时使用规则和模板。配置 OpenAI 兼容接口或 Ollama 后，可以做"AI 深度分析"。

## 数据源（2026-10-21 实测）
数据源页实时显示每个源的状态、可信度权重、频率和成功率。以下源因为反爬、需要登录或没有 API 而不可用，已在界面中如实标注：36氪 RSS、虎嗅、IT桔子、微博热搜、Google Play、G2、Papers with Code、Trends CN、a16z 原站、gov.cn、中国政府采购网搜索页、Google Patents、OECD ICIO、FAOSTAT API、中国海关统计、国家统计局、UNIDO、SSRN、CNKI、万方。

需要 Key 的源（在设置中填写）：FRED API、OpenCorporates、Companies House、PatentsView、SAM.gov、X、Product Hunt API、Crunchbase、美国 Census（国际贸易、CBP/ASM）、日本 e-Stat、CORE、Semantic Scholar（可选）。

## 开发与构建
```
npm install          # 注意：onnxruntime-node 自带 win32/linux/darwin 预编译二进制
npx vite build
npx electron .       # 开发运行
npx electron-builder --win --x64     # Windows：NSIS 安装包 + zip（Linux 上构建需要 wine，用于 NSIS/rcedit）
npx electron-builder --linux AppImage
```
- 打 Windows 包前需要准备 Windows 版 sharp：`npm pack @img/sharp-win32-x64@0.35.5`，解压到 `node_modules/@img/sharp-win32-x64`。
- 嵌入模型放在 `models/`（通过 extraResources 打包）。Windows 包已剔除 CUDA、linux/darwin、arm64 二进制。
- sql.js 是 WASM，没有原生模块；不使用 better-sqlite3。

## 贡献
欢迎通过 Issue 和 Pull Request 参与，详见 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。参与时请遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

## 许可证
本仓库尚未附带 LICENSE 文件，许可证未指定。

