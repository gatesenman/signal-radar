# 商机雷达进化记录 v2.3 → v2.8

每一轮的流程：四角色深度分析 → 各角色发散 → 交叉分析（影响 × 成本排序）→ 实现排在前面的若干项 → 重跑 E2E → 抽检机会合理率 → commit。
指标口径：
- 合理率：15 个维度各取前 5 张卡片，人工判断，合理计 1、部分合理计 0.5。只统计有命中的卡片，零命中的维度单独列出。
- E2E：`e2e/run.cjs` 的通过数 / 用例数。
- 启动耗时：Playwright 启动到侧边栏可见；两个数分别是首次启动和重启。
- 采集耗时：E2E 用例 02，HN + arXiv 两个源，含嵌入和聚类。
- 包体积：Windows NSIS 安装包。只在打包的轮次测量，其他轮记为"—"。

## 基线 v2.2
| 合理率 | E2E | 启动（首次/重启） | 采集（2 源） | 包体积 |
|---|---|---|---|---|
| 约 73%（37/51） | 23/23 | 1.43s / 2.01s | 32.2s | 175.0 MB |

---

## v2.3：行业误标与噪声簇
**深度分析**
- 产品经理：Top 20 机会里有 7 个是「融资 · 亿元 · 完成」「大赛 · 国医 · 大会」这类媒体模板簇，用户第一眼就失去信任；政策维度唯一的一张卡片被标成「银行」。
- 设计师：「未分类」和「跨行业」没有区分，用户误以为是数据缺失。
- 工程师：簇的行业只按成员标签加权投票，少数几条带标签的信号就能决定整簇。关键词表有歧义：生命科学的 `sequencing` 会命中机器人论文里的 "action sequencing"。
- 真实使用者：
  - VC 分析师按行业筛「软件」，漏掉了 LLM agent 簇（被误标为生命科学）。
  - 企业战略想找监管变化，政策维度只有 1 张卡，而且行业是错的。
  - 创业者在雷达首页看到的都是新闻模板词。

**发散想法**：多信号行业融合；行业置信度字段；子行业级政策引擎；更大的通用词表；让用户纠正行业并学习（成本高，延后）。

**交叉分析**（影响 × 成本）

| 项 | 共识角色 | 影响 | 成本 | 决策 |
|---|---|---|---|---|
| 行业 = 成员标签 50% + 标题关键词投票 50%，再加占比和绝对支持度门槛；不够就标「跨行业」 | 产品、工程、用户 | 高 | 低 | ✅ |
| 修正歧义关键词（sequencing、research tools），回刷库内标签 | 工程、用户 | 中 | 低 | ✅ |
| 扩充模板词表，压掉噪声簇 | 产品、设计 | 高 | 低 | ✅ |
| 政策维度增加子行业级引擎，并排除 PRA 信息收集公告和会议通知 | 产品、用户 | 高 | 中 | ✅ |
| 商业模式迁移提高门槛：每个已验证行业 ≥2 条、目标行业需求来自 ≥2 个非历史来源、市场活跃 | 产品 | 中 | 低 | ✅ |
| 资本空白要核对全库融资，避免把 agent 判成"空白" | 产品、工程 | 中 | 低 | ✅ |
| 用户纠正行业 | 用户 | 中 | 高 | 延后 |

**结果**
- 通过质量闸门的簇从 66 个降到 52 个（模板簇被压掉）；16 个簇标为「跨行业 / 未分类」，不再硬标。
- VLA / LLM 簇不再标成生命科学。
- 政策：子行业级 2 张（保险监管提案合理，食品偏杂）→ 1.5/2。
- 资本空白里的 agent 误报消失 → 资本 2/2 合理（Tenstorrent 等芯片融资密集；Kalshi 体育预测市场讨论多、无融资）。
- 商业模式迁移在新门槛下为 0。如实记录：现有数据不足以支撑这个维度，不再输出"模板化"卡片。
- 地域套利：Tenstorrent 海外密集、国内 0 → 合理；机器人融资中热海外冷 → 合理；"模型 image-text"被 **v2.3 的模板词规则过滤掉** → 2/2。
- 指标：合理率约 **82%**（32/39，命中更少但更准）；E2E 23/23；启动 1.43s / 2.01s；采集 32.2s；包体积 —。

## v2.4：中文需求源
**深度分析**
- 产品经理：需求缺口、竞品弱点几乎全靠 Amazon（历史数据）和美区 App Store，中文需求是盲区。
- 设计师：竞品弱点卡片缺"主要问题"字段，扫一眼看不出痛点。
- 工程师：知乎 401、小红书和微博不可用。实测可用的有：**黑猫投诉 API 200**、B 站热门 200、贴吧话题 200、V2EX（已接入）。
- 真实使用者：创业者想找"国内消费者最不满的服务"，现有数据没有答案。

**发散想法**：黑猫投诉（商家 + 问题 + 诉求，天然适合竞品弱点）；B 站热门（偏娱乐，信号弱）；贴吧话题；把投诉按问题类型聚合成需求缺口。

**交叉分析**：黑猫投诉的影响最高（同时服务需求缺口和竞品弱点）、成本低 → 实现。B 站和贴吧噪声高，延后。

**结果**
- 新数据源 `tousu_sina`：公开投诉列表，每页 10 条，默认 8 页，频率 6 小时。
- 新增"中文竞品弱点"引擎：同一商家 ≥3 条投诉，输出主要问题类型。
- 实测新增 6 张卡片：
  - 美团（12 条：众包乱扣钱、虚假送达扣款）
  - 京东（9 条：拒绝价保、虚假宣传）
  - 闲鱼
  - 阿里
  - 京东金融
  - 拼多多
- 竞品弱点维度从 15 张增加到 21 张，前 5 中 2 张来自中文源。抽检 5/5 合理（投诉内容具体，可作为切入点）。
- 局限：投诉列表只有最新约 80 条，样本偏向大平台，行业多为「未分类」。
- 指标：合理率约 **83%**；E2E 在 v2.5 复测（见下）；采集耗时不变（新源只在全量采集时运行）。
- 提交说明：v2.3 与 v2.4 因会话中断合并为一个 commit `d2d2cae`。

## v2.5：E2E 卡死修复 + 投诉行业误标 + 中文共性痛点
**深度分析**
- 工程师：复测 v2.4 E2E 时，用例 02「采集」超时。定位到 `recluster` 写 `opps` 时出现 `UNIQUE constraint failed: opps.id`（同名簇生成相同 id）。异常从 `refresh` 抛出后，`busy` 一直是 true，界面永远等不到"采集完成"。这是 **真实 bug**。
  - 另一个现象：E2E 中途 Electron 进程被外部结束。本机还有其他 Electron 项目在跑，并会执行 pkill。E2E 现在支持 `E2E_EL` 使用独立命名的 Electron 副本，避免被误杀。
- 产品经理：
  - 黑猫投诉卡片大多是「未分类」（v2.4 遗留的行业缺标）。
  - 需求缺口前两名是 Amazon 历史评论驱动的「家庭用品」「家庭耐用消费品」，太粗，也不新。
- 设计师：中文投诉只做到单一商家，看不出"行业共性"。
- 真实使用者：
  - 创业者想知道"多个平台都被骂的同一种问题"，这才是可以切入的服务机会。
  - VC 分析师需要知道痛点是否跨商家。

**发散想法**：簇 id 去重；refresh 用 try/finally；商家→行业规则表；按投诉问题类型跨商家聚合；单一历史源封顶分数；投诉翻页扩样（会被限流，延后）。

**交叉分析**

| 项 | 影响 | 成本 | 决策 |
|---|---|---|---|
| 簇 id 去重 + INSERT OR REPLACE + busy 在 finally 中释放 | 高（采集卡死） | 低 | ✅ |
| 商家→行业规则表（11 组），未命中仍保持未分类，不硬标 | 中 | 低 | ✅ |
| 投诉问题类型跨商家聚合：≥4 条、≥2 个商家 → 需求缺口；商家 ≥4 个时标为跨行业 | 高 | 低 | ✅ |
| 仅来自 Amazon 历史评论的行业痛点，封顶 68 分 | 中 | 低 | ✅ |

**结果**
- 采集卡死已修复：聚类失败会写入运行日志，busy 一定会被释放。
- 投诉行业：美团→酒店、餐馆与休闲；京东→综合零售；京东金融→消费金融。
- 需求缺口 Top 5：Amazon 历史源卡片降到 68 分以下，前 5 中有 4 张是中文共性痛点：
  - 客服不处理/处理不当（15 条 / 6 个商家）
  - 联系不到客服（8 / 5）
  - 霸王条款（9 / 4）
  - 不予退款（7 / 7：去哪儿、猫眼、中润置家…）
  - 抽检：4/5 合理，1 张为科技硬件（reddit + amazon，部分合理）。
- 指标：合理率约 **85%**（需求缺口 2.5→4.5/5）；E2E **23/23**；启动 1.55s / 1.45s；采集 32.1s；包体积 —。

## v2.6：英文正文
**深度分析**
- 设计师：英文模式只翻译了导航，正文、表头、按钮、维度名、图表坐标仍是中文。
- 产品经理：海外合伙人或 LP 是潜在的二次读者，英文版的报告和截图是传播入口。
- 工程师：逐个文件把字面量改成 `t()` 涉及约 390 处，成本高，也容易漏。
- 真实使用者：海外 VC 分析师切到 English 后，维度页和时间轴都看不懂。

**发散想法**：逐页改 t()；DOM 级词典（文本节点整句命中 + 短语替换，MutationObserver 跟随渲染，原文保存在节点上以便切回）；图表文字走同一词典；数据内容（信号标题、证据）保持原文。

**交叉分析**：DOM 词典的影响中、成本低 → ✅；逐页改 t() 成本高 → 否。机器翻译数据内容可能失真，不做，保持原文。

**结果**
- 新增 `src/i18n-en.js`：整句约 230 条 + 短语 30 条。从 JSX 中抽取中文字面量出现频次后人工翻译，覆盖维度名、按钮、表头、KPI、时间轴、状态栏。
- 图表：ECharts option 中命中词典的字符串（维度名等）在英文模式下替换。
- 截图：`shots/v26-en-dims.png`、`v26-en-radar.png`、`v26-en-timeline-week.png`。
- 局限：行业名（GICS 中文名）和动态拼接的长句仍是中文；热力矩阵的行业轴也仍是中文。
- 指标：合理率不变，约 85%；E2E 23/23（与 v2.5 同一次构建，构建已包含本轮代码）；启动、采集同 v2.5。

## v2.7：浅色图表
**深度分析**
- 设计师：浅色主题下，雷达图底色还是写死的深色（#0e1524 / #111a2c），详情页还有 8 处图表 / 文字颜色写死（白色标签在浅底上看不见，TAM 漏斗标签也是白色）。
- 产品经理：浅色截图是对外报告的主要素材，这类瑕疵直接影响专业感。
- 工程师：v2.2 已有 token 解析器，只需把剩下的硬编码颜色换成 token，成本极低。
- 真实使用者：企业战略用户把对比页截进 PPT 时，雷达底色发黑。

**发散想法**：剩余硬编码颜色全部换成 token；图表标签用 `--tx-strong`；对比页雷达改用 `--c3` 与 `--ok`；VC 六维 / 详情页卡片标题补英文词典；浅色下热力矩阵的低值格对比度（v2.2 已调过）。

**交叉分析**：全部低成本 → ✅。

**结果**
- `ui.jsx`、`detail.jsx` 中硬编码颜色清零（grep `'#xxxxxx'` 结果为 0）：
  - 雷达底色改为 `--panel2` / `--panel`。
  - 标签改为 `--tx-strong`。
  - 系列色改为 `--c1`、`--c3`、`--ok`、`--bad`、`--heat0`。
- 词典补了 17 条（VC 六维、时间序列、Why Now 等）；图表文字的英文替换也在本轮提交（`ui.jsx`）。
- 截图：`shots/v27-light-detail-overview.png`、`v27-light-compare.png`、`v27-light-detail-moat.png`。
- 指标：合理率约 85%；E2E 在 v2.8 统一复测。

## v2.8：质量收尾（地域套利 / 行业误标 / 噪声）+ Windows 包
**深度分析**
- 产品经理：地域套利出现了"模型 image-text-to-text"（英文 1 条 vs 中文 5 条）这种小样本卡；对比页默认选中「方案·印发·施方」「民政·北京·通知」这类公文模板簇。
- 工程师：HF 模型 / Spaces 信号有 39 条被打成「电气设备」，原因是关键词 `transformer` 和 AI 的 Transformer 撞名；另有 9 条被打成半导体。
- 设计师：模板簇占据对比和雷达的首屏。
- 真实使用者：企业战略用户看到「印发·通知」后不再相信评分。

**交叉分析**（全部低成本）：
- ✅ 地域套利要求多数侧 ≥10 条。
- ✅ hf_models / hf_spaces 来源级行业归为「软件」，并回刷库内 175 条信号。
- ✅ 电气设备关键词 `transformer` → `power transformer`。
- ✅ 公文模板词（印发/通知/方案/民政/关于/意见/实施/办法/公告/会议…）和「提及」并入通用词表。

**结果**
- 地域套利：只保留 2 张，均合理（Tenstorrent 海外 28 : 国内 0；机器人融资国内 28 : 海外 1）→ 2/2。
- 需求缺口：中文共性痛点 4 张标为跨行业（商家 ≥4 个），不再硬标成「酒店餐馆」。
- 指标：
  - 合理率约 **86%**。
  - E2E **23/23**（`E2E_ONLY=hn`）。arXiv API 在本次运行时 30s 无响应，所以没有用 hn+arxiv。
  - 启动 3.41s / 1.40s：首次启动受机器负载影响，load 约 17，内存 13/15GB。
  - 采集 163s：同样受负载影响，v2.5 低负载时为 32s。
  - 包体积 **175.0 MB**（SignalRadar-Setup-2.8.0-x64.exe，175,040,152 B）。
- 分片：`release/small-final/`，part00–part08（8×20MB + 7.27MB）、join.bat、SHA256SUMS.txt。SHA256 为 fb09404f…50dd9，本机合并校验一致。
- E2E 环境说明：本机其他项目会结束 Electron 进程，内存也接近满载。E2E 使用独立命名的 Electron 副本（`E2E_EL`）和 `qa/srcheck.cjs`（run.cjs 的副本）运行，用例完全一致。

## 指标趋势（v2.2 → v2.8）
| 版本 | 合理率 | E2E | 启动（首次/重启） | 采集 | 包体积 |
|---|---|---|---|---|---|
| v2.2 | ~73% | 23/23 | 1.43/2.01s | 32.2s | 175.0MB |
| v2.3 | ~82% | 23/23 | 1.43/2.01s | 32.2s | — |
| v2.4 | ~83% | 在 v2.5 复测 | — | — | — |
| v2.5 | ~85% | 23/23 | 1.55/1.45s | 32.1s | — |
| v2.6 | ~85% | 23/23（同一构建） | — | — | — |
| v2.7 | ~85% | 在 v2.8 复测 | — | — | — |
| v2.8 | ~86% | 23/23 | 3.41/1.40s（高负载） | 163s（高负载） | 175.0MB |

---
# 自进化 v2.9 → v3.1（竞品学习 → 开源分析 → 反思 → 实现）

## v2.9：趋势生命周期（深挖侧重点：趋势检测与"趋势 vs 一时热潮"）
**1. 行业竞品学习**
- **Exploding Topics**：把话题分为 Regular（强但不突出的增长）、Exploding（高于平均的增长）、Peaked（历史最高点已过）三类，并按 3/6/12/24/60…个月多个时间窗分别给出分类，外加 12 个月预测。机器学习初筛后再由分析师人工复核"是否商业相关、是否一时热潮"。
  来源：https://explodingtopics.com/blog/how-to-spot-trends 、https://api.explodingtopics.com/docs.md 、https://explodingtopics.com/methodology
- **Treendly**：pace 分为 Growth / Decline / Flat，type 分为 Sustained / Rapid / Seasonal；"Peaking" = 短期内增长 >25%；对每个趋势按 Pace、Volatility、Seasonal、Early Detection、Forecast、Volume 六维评分；用线性回归斜率判断方向。
  来源：https://treendly.com/models 、https://treendly.com/tech 、https://treendly.com/tools/trend-checker
- **Glimpse**：把 Google Trends 的 0–100 指数换算成绝对搜索量；核心原则是"持续增长，而不是一次病毒式尖峰"，以及"12 个月后还在增长才算趋势，两周消失只是噪声"。
  来源：https://meetglimpse.com/software-guides/trend-forecasting/ 、https://meetglimpse.com/google-trends/search-volume/
- **Gartner Hype Cycle**：五个阶段（技术萌芽 → 期望膨胀顶峰 → 幻灭低谷 → 复苏爬升 → 生产力平台）。学术评估指出它偏定性、可重复性有限（ScienceDirect 综述）。我们只借用"阶段"这个表达，不假装做定量预测。
  来源：https://www.gartner.com/en/research/methodologies/gartner-hype-cycle 、https://www.sciencedirect.com/science/article/pii/S0040162516300270

**2. 开源产品分析**
- **STL robust 残差 z**：扣除季节项后，残差的 |z|>2.5 记为异常信号，|z|>3 记为确定异常；要求序列长度 ≥2×周期+1。
  来源：https://github.com/antonbarr-data/dqt/blob/main/docs/algorithms/stl_residual_zscore.md
- **Kats CUSUM**（MIT）：寻找单一变点，前后两段均值差最大的位置即为变点，再做似然比检验。
  来源：https://github.com/facebookresearch/Kats/blob/main/kats/detectors/cusum_detection.py
- **Prophet**（BSD）：适合做反事实基线，不擅长突变。
- 许可证：以上项目我们 **只借鉴思路**，在 JS 里自写简化实现，没有引入或复制它们的代码，也没有引入 Python 依赖。

**3. 反思（差距 / 错误假设）**

| 差距 / 错误假设 | 影响 | 成本 | 决策 |
|---|---|---|---|
| 只有"速度 / 加速度 / 一次性热点"，没有生命周期阶段（爆发 / 稳定增长 / 见顶 / 下滑） | 高 | 低 | ✅ |
| **错误假设**：28 天窗口都有数据。实际有效采集只有约 8 天，更早的日子全库信号极少；直接计算会把"刚开始采集"误判成"爆发"（第一版 49 个簇里 33 个被判为爆发） | 高 | 低 | ✅ 只用全库有足量采集的日子 |
| **错误假设**：今天的数据是完整的。今天还没过完，计数偏低，会把趋势误判为下滑 | 中 | 低 | ✅ 剔除今天 |
| 样本少于 2 周时做周内季节扣除会把序列抹平（每个星期几只有 1 个点） | 中 | 低 | ✅ ≥14 天才做 |
| 没有区分"急升"与"持续"（Treendly 的 pace type） | 中 | 低 | ✅ |
| 多窗口分类（3/6/12 月）、12 个月预测 | 中 | 高（历史不足，不能伪造） | 否 |

**4. 实现**
- `engine.js` 新增 `lifecycle()`：
  - 周内季节扣除（≥14 天才做）。
  - robust z（中位数 / MAD，设下限）。
  - CUSUM 单变点。
  - 线性斜率（相对变化）和波动率（CV）。
  - 输出 stage（exploding / regular / peaked / declining / flat）、pace（rapid / sustained），以及疑似热潮标记 fad（急升且波动 >1.5）。
- 有效窗口：只用全库当日信号 ≥ 近 7 天中位数 25% 的日子，并剔除今天：
  - 有效天数 ≥14 → 正式分类，计入增长动能（爆发 +6，见顶 / 下滑 −8，疑似热潮 −8）。
  - 7–13 天 → **初判**：显示但 **不计分**。
  - 不足 7 天或少于 6 条 → 显示「样本期不足」或「样本稀疏」。
- UI：雷达表新增「生命周期」列；详情页时间序列卡片显示徽标，悬停可看 z、斜率、波动、变点。英文词典同步补充。
- 当前数据：有效采集 7 天，所以全部为初判，不影响分数。50 个非噪声簇中：爆发 7、下滑 8、见顶 4、样本期不足 30、疑似热潮 1。
- 抽检有分类的前 10 个：合理 7（agent、kalshi、电池储能、tesla 见顶等），部分合理 2（Tenstorrent 融资新闻集中后回落），不合理 1（humanoid 的原始条数在上升，但占全库比例下降，被判为"下滑"）。这是"按占比归一化"口径带来的现象，已记录。
- 指标：合理率约 86%（维度卡片不受影响；新增生命周期抽检 8/10，按"部分合理计 0.5"）；E2E **23/23**；启动 1.77s / 1.36s；采集 40.1s（HN）；包体积 —。

## v3.0：主题命名与表示（深挖侧重点：话题表示、同义归并、受众 / 来源亲和）
**1. 行业竞品学习**
- **AlphaSense**：Smart Synonyms 会把关键词扩展到商业语境下的同义表达；情感按句子打分（−100…100，带置信度）；所有 AI 摘要都附原文出处。启示：主题词要做同义 / 词形归并，结论要能追溯到证据。
  来源：https://help.alpha-sense.com/hc/en-us/articles/41638748605587-Smart-Synonyms 、https://help.alpha-sense.com/hc/en-us/articles/41711605431059-How-We-Calculate-Sentiment
- **SparkToro**：Affinity 是相对、对数刻度的 1–100 分，衡量某个受众比平均水平"更多使用"某个来源的程度，不是占比。启示：来源的重要性应该用"相对全库的过度指数"来衡量，而不是只看绝对条数（与我们已有的"相对全库倍数"口径一致）。
  来源：https://sparktoro.com/resources/videos/what-is-an-affinity-score 、https://sparktoro.com/blog/sparktoro-v2-is-finally-here-it-can-do-incredible-things-for-seo-content-marketing-pr-and-ad-targeting/
- **Exploding Topics / Glimpse** 的话题都是完整短语（如 "denim purse"），不是断开的词片段。用户看到的是"可以拿去搜索的名字"。

**2. 开源产品分析**
- **BERTopic c-TF-IDF**（MIT）：
  - 把每个簇视为一篇文档，tf 做 L1 归一化，idf 为 log(1 + 平均词数 / 词频)。
  - `reduce_frequent_words` 对 tf 开平方，压低到处出现的高频词。
  - 可以叠加 MMR 等多样性指标，避免同义词重复入选。
  来源：https://maartengr.github.io/BERTopic/getting_started/ctfidf/ctfidf.html
- **Top2Vec**（BSD-3）：主题词取与主题向量余弦最近的词，代表文档取最接近质心的文档。我们本来就用"最接近质心的信号"作为代表标题。
  来源：https://github.com/ddangelov/Top2Vec 、https://github.com/ddangelov/Top2Vec/blob/master/LICENSE
- 许可证：只借鉴公式和思路，在 JS 中自写实现，没有复制代码。

**3. 反思**

| 差距 / 错误 | 影响 | 成本 | 决策 |
|---|---|---|---|
| 标签里出现同一个词的不同词形，如「agent · agents · agentic」「robot · robots」 | 高（首屏可读性） | 低 | ✅ 词形归并 + MMR 去冗余 |
| 中文按二元切词，导致「器人 · 机器」「际航」「床试」「源推」这类断片；前 30 个标签中约 8 个不可读 | 高 | 中 | ✅ 中文短语延展 |
| 高频词抢占标签 | 中 | 低 | ✅ √tf（reduce_frequent_words） |
| **自己的错误**：第一版做了中文二元两两拼接，结果 3 字片段绕过了模板词表，「的通知 · 北京市 · 于印发」升到 75 分并排到第 1；同时出现「何防误」「略石油」这类断片 | 高 | 低 | ✅ 撤回两两拼接，改为在成员标题中做左右延展（同一相邻字占 ≥80% 才延展，最长 8 字）；质量闸门对 ≥3 字的标签拆成二元再查模板词，并检查前 6 个主题词中模板词是否过半 |
| 来源亲和（SparkToro 式）单独展示 | 低 | 中 | 延后 |

**4. 实现**
- `engine.js` 新增 `topicTerms()`：
  - 英文词形归并：去复数后再去 -ic / -ing / -er 等后缀。
  - √tf × idf 打分。
  - MMR 式去冗余：与已选词共现 ≥80% 且互为子串或同词干的词不重复入选。
  - 中文短语延展。
  - 最后再做一次子串去重。
- `qualityGate`：中文子片段也查模板词；对「X完 / 成X」这类「完成」断片判为空泛标签。
- 效果（同一份库重新聚类，前 30 个非噪声簇）：
  - 不可读或断片标签约 8 个 → 约 2 个（「如何防误食 · 分日化品包装高度」不完整；「agents · personal · important」偏弱）。
  - 新的完整短语如「临床试验」「开源推理框架」「出口管制」「战略石油储备 · 原油库存」「机器人 · 破产 · 订单」。
  - 非噪声簇 50 → 51。维度命中数基本不变（资本 2 → 3）。
- 指标：合理率约 86%（维度卡片不变；标签可读性在前 30 个中从约 73% 升到约 93%）；E2E **23/23**；启动 1.64s / 1.38s；采集 32.0s（HN）；包体积 —。

## v3.1：机会体检分 + 中文源扩展通道（深挖侧重点：投资数据平台的公司 / 赛道评分与中文一级市场数据库）
**1. 行业竞品学习**
- **CB Insights Mosaic**：0–1000 分，由 Momentum（招聘、数字参与度、新闻与社交情绪、客户与合作、流量）、Market（行业融资、交易、情绪、招聘、退出）、Money（融资历史、烧钱代理指标、投资人质量）、Management（团队经历）四要素组成；当前权重为 Momentum 50%、Money 40%、Market 5%、Management 5%。
  来源：https://www.cbinsights.com/mosaic-health/ 、https://www.cbinsights.com/mosaic-whitepaper/
- **Crunchbase**：Growth Score（0–100）综合融资、人数、运营、市场份额等，近期权重更高，并且 **按公司自身历史做归一化**；Heat Score 衡量关注度与媒体覆盖；Growth / Heat Trend 是分数在一段时间内的变化。
  来源：https://support.crunchbase.com/hc/en-us/articles/53295907409555-Technical-Overview-Crunchbase-Growth-Score 、https://support.crunchbase.com/hc/en-us/articles/39902159873043-What-is-a-Heat-Score
- **Harmonic.ai / Specter**：以部门人数变化、招聘、网站 / App 流量、人才流动为核心信号，支持 90/180/360 天增长筛选，以及隐身创业者信号（从高信号雇主离职、"building something new"、新域名注册）。
  来源：https://support.harmonic.ai/en/articles/6582373-advanced-search-filters 、https://harmonic.ai/blog/how-to-find-track-stealth-startup-founders 、https://www.tryspecter.com/signals/talent
- **Dealroom Signal**：0–100 分，综合资料完整度、创始团队质量、员工增长、下一轮融资时点。**PitchBook VC Exit Predictor**：对至少两轮融资的公司用机器学习预测 IPO / 并购 / 不退出的概率，并给出 Opportunity Score 百分位。**Tracxn**：偏赛道图谱，未见公开的综合评分。
  来源：https://knowledge.dealroom.co/knowledge/dealroom-signal-1 、https://pitchbook.com/help/understanding-vc-exit-predictor 、https://brouky.tech/compare/vc-data-platforms
- **IT桔子 / 企名片 / 鲸准**：一级市场投融资数据库，核心是公司、融资事件、机构、赛道标签、行业图谱和榜单；未见公开的"创业公司综合评分"。
  来源：https://static.itjuzi.com/itjuzi-user-document-2.5.pdf 、https://pro.qimingpian.cn/ 、https://www.jingdata.com/dataService/

**2. 开源产品分析**
- **RSSHub**（AGPL-3.0）：提供 36氪 `/36kr/newsflashes`、`/36kr/hot-list`、虎嗅等中文路由，支持 `?format=json` 输出 JSON Feed。实测公共实例 rsshub.app 对阅读器返回 **403**（提示仅供测试、建议自建）。
  - 合规做法：本应用 **只作为 HTTP 客户端** 访问用户自建的实例，不打包、不修改 RSSHub 代码，因此不触发 AGPL 的分发义务。
  来源：https://github.com/DIYgod/RSSHub 、https://docs.rsshub.app/zh/routes/
- **Huginn**（MIT）、**changedetection.io**（Apache-2.0）：事件代理 / 网页变更监控。思路可借鉴（"源 → 事件 → 规则 → 通知"，我们的提醒规则已经是这个结构），本轮不引入。
- **n8n / Miniflux / OpenBB / Superset / Metabase / GDELT**：本轮未深挖。如实记录：时间有限，留作下一轮。

**3. 反思**

| 差距 / 错误假设 | 影响 | 成本 | 决策 |
|---|---|---|---|
| 只有"VC 六维"这一个主观加权分，没有像 Mosaic 那样按"动能 / 市场 / 资金 / 人才"拆开、并在同类中取百分位的体检分 | 高 | 低 | ✅ |
| 中文资讯源受限（知乎 401、公共 RSSHub 403） | 中 | 低 | ✅ 增加自建 RSSHub 接入通道（默认关闭，需填写地址） |
| **错误假设**：每个机会簇里都有招聘信号。实测招聘信号大多单独成簇，簇内 jobs 基本为 0，人才要素区分度很低 | 中 | 中 | 记录；下一轮改为按行业 / 关键词关联招聘 |
| 隐身创业者 / 人才流动信号（Harmonic / Specter） | 高 | 高（需要 LinkedIn 类数据，无合规公开源） | 否，如实标注 |
| 分数的"自身历史归一化"与 Heat Trend（Crunchbase） | 中 | 中 | 部分已有（快照历史曲线），本轮不再扩展 |

**4. 实现**
- `engine.js` 新增 `mosaic()`，输出机会体检分（0–1000）：
  - 动能 40%：增长分 + 正式的生命周期。
  - 市场 25%：同行业其它簇的融资事件数。
  - 资金 25%：本簇融资数 + log 金额。
  - 人才 10%：招聘信号。
  - 各要素先在所有簇中取百分位再加权；权重是本应用的假设，**不是** CB Insights 的权重，界面上已注明。
  - 体检分只作为参考，**不改变综合分**。
- UI：雷达表新增「体检分」列（悬停显示四要素百分位）；详情页「VC 六维评分」标题旁显示体检分徽标，悬停可看构成。
- `collectors.js` 新增 `rsshub` 源：需填写 `rsshubBase`（自建地址），路由默认 36氪快讯 / 虎嗅 / 少数派 / 人人都是产品经理，可改 `rsshubRoutes`。用本地 JSON Feed 夹具验证解析通过。没有自建实例，所以 **没有接入真实数据**。
- 抽检体检分前 10：合理 4（机器人订单与破产、Tenstorrent 芯片融资、电池储能、Kalshi），部分合理 4（e-bike、公募科技股、Tesla Roadster、SpaceX 并购），不合理 2（「利率 · 将退出 · 贷款」「房贷 · 怎么 · 银行」是资讯或问答，因为银行业融资多，市场要素被抬高）→ 6/10。与综合分的 Spearman 相关系数 0.49，说明它提供了不同视角，而不是重复。
- E2E：首次 22/23。用例 07 断言"CSV 行数 >5"，但在用例 06 保存的"分数 ≥60"视图下，本次只有 3 行可见。这是 **测试依赖数据的缺陷**，不是功能缺陷（CSV 内容正确，并已包含新增的体检分 / 生命周期列）。断言改为"CSV 行数 ≥ 表格可见行数"后为 **23/23**。
- 指标：合理率约 86%（维度卡片不变；体检分抽检 6/10，作为新增参考分单列）；E2E **23/23**；启动 1.38s / 1.47s；采集 36.7s（HN）；包体积见下。

## 指标趋势（v2.8 → v3.1）
| 版本 | 合理率（维度卡片） | 新增专项抽检 | E2E | 启动（首次/重启） | 采集（HN） | 包体积 |
|---|---|---|---|---|---|---|
| v2.8 | ~86% | — | 23/23 | 3.41/1.40s（高负载） | 163s（高负载） | 175.04MB |
| v2.9 | ~86% | 生命周期 8/10 | 23/23 | 1.77/1.36s | 40.1s | — |
| v3.0 | ~86% | 标签可读性 ~73%→~93%（前 30） | 23/23 | 1.64/1.38s | 32.0s | — |
| v3.1 | ~86% | 体检分 6/10 | 23/23（修测试后） | 1.38/1.47s | 36.7s | 175.04MB |

Windows 包：`release/SignalRadar-Setup-3.1.0-x64.exe`（175,044,272 B）。分片在 `release/small-3.1/`：part00–part08（8×20MB + 7.27MB）、join.bat、SHA256SUMS.txt。SHA256 为 b2a407bb…9ec3e9，本机合并校验一致。本轮 **未做 Wine 冒烟测试**（v2.2 已验证过图标与启动，本轮未改打包配置）。

---
# 自进化 v3.2 → v3.7

## v3.2：证据链与可解释性（深挖：出处追溯）
**1. 行业竞品学习**
- **AlphaSense**：生成式回答里用 `[[N • Source]]` 内联引文，URL 带 `docid` / `page` / `stmt` / `hl`，一点就跳到原文页和精确语句；Smart Summaries / Generative Grid 每条结论都挂出处，找不到证据时明确说"没有"而不是瞎编。
  来源：https://developer.alpha-sense.com/agent-api/response-parsing 、https://help.alpha-sense.com/hc/en-us/articles/41669307479443-Get-Instant-Insights-and-Save-Time-with-Smart-Summaries 、https://help.alpha-sense.com/hc/en-us/articles/41680141048979-Leveraging-Generative-Grid

**2. 开源产品分析**
- **LlamaIndex CitationQueryEngine**（MIT）：把检索到的节点切成可引用的 chunk，编号为 `Source N`，提示词要求回答时用 `[N]` 引用；`citation_chunk_size` 控制粒度。
  来源：https://developers.llamaindex.ai/python/examples/workflow/citation_query_engine/ 、https://github.com/run-llama/llama_index/blob/main/llama-index-core/llama_index/core/query_engine/citation_query_engine.py
- **Haystack AnswerBuilder**：用 `reference_pattern` 从回答里抽出 `[n]`，再映射回文档；chunk 过多时用 MetaFieldGroupingRanker 按文件/页归并。
  来源：https://github.com/deepset-ai/haystack/discussions/8286
- 许可证：只借编号引文和"主张 ↔ 出处"的交互，在 JS 里自写，不引入 Python 依赖。

**3. 反思**

| 差距 | 影响 | 成本 | 决策 |
|---|---|---|---|
| 机会陈述 / Why Now / 不对称只有文字，点不开对应证据 | 高 | 低 | ✅ |
| 证据链是平铺列表，没有摘要片段，也没有和主张的对应关系 | 高 | 低 | ✅ |
| 评分依据的 basis 行没有挂编号 | 中 | 低 | 部分（Ev 组件已显示 refs） |
| 深度到 PDF 页码 / 句子级（AlphaSense stmt） | 中 | 高（我们的信号大多是网页标题，没有页结构） | 否，用 snippet 代替 |

**4. 实现**
- `engine.js`：全局编号引文池；`cite()` / `claim()`；机会对象增加 `claims[]`（who / pain / whyNow / how / driver / asym）和带 `n`、`snippet` 的 `evidence[]`；`statement.refs` 挂各字段的编号。
- UI：`Cite` 组件渲染可点击的 `[n]`，滚动并高亮对应证据行；证据页签顶部增加「主张 ↔ 证据」面板；概览和标准报告的机会陈述旁显示引文。
- 截图：`shots/v32-detail-evidence.png`（主张旁有蓝色编号，证据表有 [n] 和摘要）。
- 指标：合理率不变约 86%；E2E **23/23**；启动 1.32s / 2.02s；采集 29.9s（HN）。

## v3.3：多时间窗与短期外推（不伪造历史）
**1. 行业竞品学习**
- Exploding Topics / Treendly：多时间窗（3/6/12 月）分类；我们历史不足 14 天，**不做**伪 3/6/12 月窗，只在现有有效采集日上外推。
- Glimpse：持续增长 vs 一时热潮（v2.9 已做）。

**2. 开源 / 方法**
- **Holt 线性趋势**（FPP 第 8 章）：水平 + 趋势的指数平滑，h 步预测 = ℓ + h·b。
  来源：https://otexts.com/fpp3/exponential-smoothing.html
- **区间偏窄**：Chatfield / Makridakis 指出 plug-in 预测区间通常偏窄；应用上用经验误差或放大系数。
  来源：https://marketing.wharton.upenn.edu/wp-content/uploads/2020/07/PoF-Extrapolationg-for-Time-Series.pdf
- **Prophet**：不确定区间假设"未来变点频率与历史相同"，本身也承认覆盖率不可靠。
  来源：https://github.com/facebook/prophet/blob/main/docs/_docs/uncertainty_intervals.md
- 我们采用：Holt + 残差 MAD × 1.5 × √h 作为约 80% 区间，并明文标注方法与局限。

**3. 反思**

| 项 | 影响 | 成本 | 决策 |
|---|---|---|---|
| 有生命周期但没有"往后看几天"的外推 | 中 | 低 | ✅ |
| 伪造 3/6/12 月窗 | — | — | ❌ 违反"不伪造历史" |
| 区间不标注会误导成"精确预测" | 高 | 低 | ✅ 强制标注方法/放大/样本不足 |

**4. 实现**
- `forecast7()`：仅用有效采集日；样本 <5 天直接拒绝；<14 天标 provisional。
- 详情时间序列图：历史实线 + 外推虚线 + 上下限点线；文案标明 Holt、约 80% 经验放大区间。
- 指标：E2E **23/23**；启动 1.41s / 2.04s；采集 30.3s（HN）。合理率不变。外推在样本不足时标「仅供参考」，不计入评分。

## v3.4：中文与本地化深度
**1. 竞品 / 源调研**
- V2EX 经典 API `/api/topics/hot.json`、`/api/topics/latest.json` 无需登录（已接入）。新 API v2 需 Token。来源：https://github.com/jackwener/v2ex-digest/blob/main/v2ex-api.md
- 36氪：公开 JSON `https://www.36kr.com/api/newsflash`（需浏览器 UA），官方 RSS 被反爬。来源：实测 200 + items；https://www.36kr.com/rss-center
- RSSHub 公共实例 403，自建通道已在 v3.1 保留。

**2. 开源**
- GICS 中英对照：行业轴应保留 code、按语言显示名称（https://github.com/skysaint/gics-data）。

**3. 反思**：英文模式下热力矩阵行业轴仍是中文；中文资讯源除投诉外偏弱；知乎/微博不可用（已在 UNAVAILABLE 标明）。

**4. 实现**
- 新增 `kr_flash`（36氪快讯公开 JSON，30 条/轮）。
- 维度卡片增加 `sectorEn` / `industryNameEn`；热力矩阵在英文模式下用英文板块名和维度名。

## v3.5：机会质量与商业模式迁移
**1. 竞品**：CB Insights / Tracxn 的"模式 × 赛道"矩阵；我们缺的是"已在 A 验证的模式，B 有需求却几乎没有"。

**2. 开源**：无直接对应；沿用自有规则引擎。

**3. 反思**：v2.3 把门槛提太高（≥3 个已验证行业）导致该维度长期为 0；簇标题未参与模式匹配；误匹配（半导体簇 → Agent 服务）需要源行业对该模式确有信号。

**4. 实现**
- 已验证行业门槛 3→2；目标需求 5→3、来源数可 1、市场活跃 3→2。
- 新增模式：Agent 平台/编排、垂直行业 AI。
- 簇级迁移：标题命中模式 + 源行业有模式信号；软模式不轻易迁到制造硬行业。
- DEMAND 集合加入 v2ex、kr_flash。
- 结果：model_transfer 0→1（Agent 平台从软件迁到互动媒体，目标需求 43）。抽检 1/1 合理。

## v3.6：协作、导出与决策工作流
**1. 竞品**：PitchBook 的 IC Memo / Exit Predictor / Opportunity Score；强调「建议 + 证据 + 阶段」。来源：https://pitchbook.com/help/understanding-vc-exit-predictor

**2. 开源**：无强对应；沿用本地 Markdown → PDF。

**3. 反思**：报告页只有研究报告和 IC，缺一页纸决策摘要；推进阶段没有门槛；IC 未纳入体检分/生命周期/编号引文。

**4. 实现**
- `decisionBrief`：建议、阶段门、主张引文、单位经济、证据前 12。
- `stageGate`：痛点有出处、证据非空、验证清单 ≥2、置信 ≥0.4。
- 报告页默认「决策一页纸」，显示阶段门；详情推进阶段时未过门会确认。
- IC Memo 增加体检分与生命周期行。
- 指标：E2E **23/23**；启动 1.30s / 1.30s；采集 28.7s。

## v3.7：性能、包体积与剩余 P2 收尾
**1. 竞品 / 开源**：electron-builder `compression: maximum`；表格虚拟化成本高，本轮不做。

**2. 反思**：P2 剩 8 项（P2-5 已在 v2.6 解决未勾）；安装包约 175MB 主要是 Electron 运行时，业务代码占比小。

**3. 实现**
- P2-5/6/7/8/9/11/12 关闭或改善（见 UI-AUDIT.md）；P2-10 情境插图保留。
- `build.compression = maximum`。
- 不对称页改 DataTable。
- 指标：E2E **23/23**；启动 1.19s / 1.39s；采集 27.1s。包体积见下。

## 指标趋势（v3.1 → v3.7）
| 版本 | 合理率 | 专项 | E2E | 启动 | 采集 | 包体积 |
|---|---|---|---|---|---|---|
| v3.1 | ~86% | 体检分 6/10 | 23/23 | 1.38/1.47s | 36.7s | 175.04MB |
| v3.2 | ~86% | 引文可用 | 23/23 | 1.32/2.02s | 29.9s | — |
| v3.3 | ~86% | 外推有区间 | 23/23 | 1.41/2.04s | 30.3s | — |
| v3.4 | ~86% | 36氪 30 条/轮 | （随 v3.5） | — | — | — |
| v3.5 | ~86%+ | model_transfer 1/1 | （随 v3.6） | — | — | — |
| v3.6 | ~86% | 阶段门/一页纸 | 23/23 | 1.30/1.30s | 28.7s | — |
| v3.7 | ~86% | P2 11/12 | 23/23 | 1.19/1.39s | 27.1s | 175.05MB |

Windows 包：`release/SignalRadar-Setup-3.7.0-x64.exe`（175,049,369 B）。分片：`release/small-3.7/` part00–part08 + join.bat + SHA256SUMS.txt。SHA256 = 393f5d95…0ab8，本机合并校验一致。

## v3.8 — 采集稳定性（退避 / 熔断 / 健康监控）
**竞品与实践学习**
- AWS Builders' Library《Timeouts, retries and backoff with jitter》：重试要限次、要加抖动，否则同步重试会形成风暴 — https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
- AWS《Exponential Backoff And Jitter》：Full Jitter（sleep = rand·min(cap, base·2^n)）在竞争下总耗时最低 — https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
- AWS 熔断器模式：连续失败后打开，冷却后半开试探 — https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/circuit-breaker.html
- AWS SDK 重试行为（标准模式 full jitter） — https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html
**开源**
- Huginn（MIT）：Agent 级 schedule + keep_events_for — https://deepwiki.com/huginn/huginn/3.1-agent-system
- n8n（Sustainable Use License，非 OSI 开源，只借鉴思路不抄代码）：节点 Retry On Fail（最多 5 次/5000ms）+ Error Workflow — https://docs.n8n.io/build/flow-logic/handle-errors-gracefully
**反思（影响×成本）**
1. 错误假设：「15 分钟到点就全量重试」——失败源被反复敲打，且同一时刻并发。→ 源级 full-jitter 退避（上限 6h）。高/低
2. 连续失败的源没有可见状态 → 3 次连续失败熔断，并在数据源页标「熔断/退避×n」。高/低
3. 定时器整点同步 → 每次触发加 0–120s 随机抖动。中/极低
4. 开机自启（login:set IPC，`app.setLoginItemSettings`）——已接后端，UI 开关留到后续。低/低
**实现**：`srcHealth` 记录 fails/nextAt/open/lastOk/lastErr；`due` 运行跳过退避期内的源；成功即复位（相当于半开试探成功后闭合）；`health:get` IPC 返回 7 天运行数、成功率、熔断态。
**未做/限制**：熔断冷却期就是退避期，没有单独的半开计数；手动「立即采集」不受熔断限制（这是有意为之）。
**E2E**：23/23；启动 1.53s/1.46s；采集 27.9s（v3.7 为 1.19/1.39s、27.1s，在共享机负载波动范围内）。

## v3.9 — 体检分纠偏：人才项 + 资讯类机会
**竞品学习**
- CB Insights Mosaic 白皮书：Momentum 用招聘数量/质量与趋势；Market 也纳入行业层面的招聘；**缺失分项时动态重分配权重**；百分位归一化防单一指标扭曲 — https://www.cbinsights.com/mosaic-whitepaper/ ，https://www.cbinsights.com/research/team-blog/mosaic-moneyball-for-startups/
- Harmonic：招聘速度是「最早也最可靠」的信号之一，但融资后的招聘潮要对照融资前轨迹看；按部门看招聘比看总量更有信息 — https://harmonic.ai/blog/best-tools-for-tracking-startup-growth-signals
**开源**：本轮无直接可用的开源实现（Mosaic、Harmonic 均为闭源商业产品），只借鉴公开方法论。
**反思（影响×成本）**
1. 错误假设：「招聘信号会和主题一起聚进同一个簇」——实际招聘标题（职位名）几乎不和新闻聚到一起，簇内 jobs≈0，人才项百分位全部相同、等于无效。→ 改为簇内招聘×2 + log2(1+同行业/同主题词的全局招聘数)。高/低
2. 人才数据完全缺失时仍按 10% 计分 → 参照 Mosaic 重分配权重到其余三项。中/低
3. 纯新闻簇（新闻占比高、其它证据类型 <2）与有产品/融资/需求佐证的簇同分 → 新闻占比 >60% 时按比例扣分，最多扣 30%。高/低
4. 开机自启界面开关（设置页 → 基本；打包后生效，以 `--hidden` 最小化启动）。中/低
**抽检（120 个机会）**：人才项取值从 v3.8 前的约 1 种变为 37 种；84 个机会有关联招聘；44 个被资讯纠偏（例：「机器人·破产·订单」×0.72、「融资·完成·亿元」×0.71）。**问题**：44/120 偏多，主要是中文新闻源占比高导致，后续可按来源类别再细分。
**E2E**：23/23；启动 2.06s/1.38s（首次启动受机器负载影响）；采集 28.4s。

## v4.0 — 商业模式迁移 / 地域套利覆盖面
**学习**
- Startup Lanes《Geographic Arbitrage》：黄金法则「Don't just copy, adapt」，落地前做本地化检查：合规、文化、价格、需求验证（Mom Test）— https://www.startuplanes.com/ebook/building-startup-and-raising-funds/spot-problem-worth-solving/geographic-arbitrage/
- HBS 工作论文：中国模式被印度模仿（PhonePe/Groww 等），迁移的是模式而非产品 — https://www.hbs.edu/ris/Publication%20Files/25-017_168eda2e-2f4b-4a2d-b5b4-d6e58e60c7cd.pdf
- California Management Review《When and Why Do Investors Prefer Copycats?》：新兴市场的「未饱和」是复制模式的价值来源 — https://cmr.berkeley.edu/2024/11/when-and-why-do-investors-prefer-copycats/
- Times of India《Imitation is innovation》：Tracxn 统计「美国每有一家获投公司，印度约有 50 家 me-too」；OYO 从「印度 Airbnb」转向标准化酒店 — https://timesofindia.indiatimes.com/tech-news/imitation-is-innovation/articleshow/48907419.cms
**开源**：没有找到成熟的「模式迁移检测」开源项目；本轮为自研规则。
**反思**
1. 错误假设：「地域套利只能在簇级发现」——簇本身就是同语种聚出来的，中英信号很少落在同一簇，于是簇级规则几乎触发不了。→ 新增**行业级**规则：同一行业一侧融资/产品验证≥5、另一侧≤1，且按全库中英比例另一侧本应≥2。高/低
2. 簇级阈值略放宽（已验证≥2、偏离≥2.8 倍）。中/低
3. 卡片只给分数、不给落地检查 → 地域套利/模式迁移卡附「本地化检查」四项（合规/文化渠道/价格/需求验证），能从证据里自动判断的给提示，判断不了的明确写「需人工判断」。中/低
**抽检**：地域套利卡 2 → 8（新增汽车/综合零售「中→海外」，生命科学工具、医疗保健技术、航空货运「海外→中」等）；模式迁移卡仍为 1。
**问题**：「汽车：中文侧已验证」很可能是来源偏差（36kr 快讯以中文为主、英文汽车源少），不一定是真实的市场空白，卡上已写明是按基线比例判断；模式迁移受限于需求源数量，本轮没有改善。
**E2E**：23/23；启动 1.28s/1.36s；采集 64.7s（比上轮慢一倍多，测试期间机器上有其他重负载，未单独复现）。注：本轮 E2E 时 main.js 已含 v4.1 的个性化代码。

## v4.1 — 个性化排序（从观察/阶段反馈学习）
**学习**
- Rocchio 相关反馈：画像 = αQ + β·正例均值 − γ·负例均值，用余弦/加权匹配重排 — https://static.aminer.org/pdf/PDF/000/061/718/extending_the_rocchio_relevance_feedback_algorithm_to_provide_contextual_retrieval.pdf
- 隐式 + 显式反馈结合的内容推荐（把行为映射成 +2…−2 的权重，取高权重词构建画像）— https://doi.org/10.21512/comtech.v8i3.3912
- 长短期兴趣画像 + 隐式反馈（越南新闻推荐）— https://eprints.uet.vnu.edu.vn/eprints/id/eprint/1747/1/2016.01.pdf
- Feedly Leo「学习你在意什么」做优先级排序（闭源，借鉴产品形态）— https://www.readless.app/blog/best-ai-daily-news-briefing-tools-2026
**开源**：没有引入依赖。Rocchio 是公开算法，自己实现了约 10 行。
**反思**
1. 错误假设：「用户会主动给评分」——本应用里真实存在的反馈只有观察、阶段推进和放弃。→ 把它们映射为权重：观察 +1、初筛 +1、深研 +2、验证 +3、立项 +4、放弃 −2。高/低
2. 冷启动：反馈少于 3 次时不启用，列里显示「—」并提示原因。中/低
3. 信息茧房风险：初版调整上限 ±12，抽检时用户只给了 2 个正反馈，Top10 里同行业就从 2 个变成 10 个 → 上限降到 ±8，并对词权做饱和处理（tanh），之后为 7 个。高/低
4. 漏洞：行业为空（null）时被当成同一个「行业」累加，导致所有未打标簇一起被加分 → 已修复。
**实现**：`personalize()` 在 `getOpps()` 末尾计算 `o.personal`（score/adj/why）；雷达表新增「个人分」列，可排序，悬停显示依据（如「行业 451030 +3.0」）。综合评分本身不变。
**抽检**：模拟 2 个同行业观察+深研、1 个放弃；放弃项 −10→（修复后上限 ±8）；Top10 与原排序重合 5 个。
**问题**：同行业仍占 Top10 的 7 个，偏强；还没有做「探索位」（例如固定留 2 个非偏好行业的位置）。
**E2E**：23/23；启动 1.38s/1.28s；采集 28.4s。

## v4.2 — 主动推送：每日简报
**学习**
- Readless 2026 年对 8 款 AI 简报工具的测评：区分「按文章逐条摘要」（Feedly Leo）和「跨来源写成一篇、带 [n] 引用的简报」（Kagi News、Readless Max）；后者才是真正的 briefing — https://www.readless.app/blog/best-ai-daily-news-briefing-tools-2026
- Feedly 个人版没有邮件简报，只有企业版的 Automated Newsletters，个人用户只能借助 Zapier/IFTTT — https://www.readless.app/blog/feedly-email-digest-feature-2026
- RSS 简报工具对比：RSSbrew（AGPL-3.0，自托管 + 日/周简报 feed）、n8n 社区周报模板（带去重）— https://www.readless.app/solutions/rss-feed-ai-digest
**开源/许可证**：RSSbrew 是 AGPL-3.0，和本应用一起分发会触发传染性条款，所以只借鉴「简报 = 一个按日生成的文档」的形态，不引入代码。
**反思**
1. 错误假设：「提醒中心就是推送」——提醒是一条条零散通知，用户要的是早上一页纸。→ 每日快照后自动生成简报（Top5〔启用个性化时按个人分〕、正在爆发、你在观察的、多维卡片 Top3、采集健康），所有条目带 [n] 引用，末尾列出引用来源。高/低
2. 不外发：只存到本机 `userData/briefs/YYYY-MM-DD.md`，并弹一条系统通知；不发邮件（发邮件需要用户另行授权）。高/零
3. 采集健康写进简报：有源熔断时，第二天早上就能看到。中/低
**实现**：`dailyBrief()`；IPC `brief:daily`（读取 / 立即生成）、`brief:daily:list`、`brief:daily:open`；总览页加「每日简报」卡片（前三条 + 全文 + 打开文件夹）；设置页加开关。E2E 新增 24（简报）、25（health:get）。
**抽检**：E2E 环境生成的 2026-10-22 简报共 5 个 Top、5 个爆发、1 个观察项、3 张卡、15 条引用，每条引用都是采集到的真实 URL。
**问题**：「为什么值得看」一句用的是规则模板（如「资本涌入：…」），不是 LLM 写的综述；标题仍是 c-TF-IDF 词串，可读性一般。
**E2E**：26/26；启动 1.31s/1.29s；采集 29.1s。

## v4.3 — 英文翻译补全 + 融资页/宏观页 DataTable
**学习**
- Primer DataTable 指南（GitHub 设计系统）：数字右对齐、表头与列对齐、筛选放在表格上方 — https://primer.style/product/components/data-table/guidelines
- Elastic EUI 表格布局指南 — https://eui.elastic.co/docs/components/tables/layout-guidelines/
- Visa 设计系统表格用法：金额、百分比用等宽数字，分组视图用页签 — https://design.visa.com/components/table/usage/
- Maersk 设计系统：行数超过一屏时表头吸顶 — https://designsystem.maersk.com/components/table/
**开源/许可证**：i18next（MIT）是成熟方案，但需要把全部文案改成 `t('key')`，改动量太大；本轮继续用现有的 DOM 词典方案，只把词典补全，并加了一个扫描脚本来度量覆盖率。
**反思**
1. 错误假设：「英文版只要翻导航和常用词」——扫描发现 501 条固定中文文案里只有 217 条（43%）有译文。→ 逐条补译到 499/501（99.6%）。剩下 2 条是语言切换按钮上的「中」，属于有意保留。高/中
2. 融资页三列信息流没法排序、筛选、导出 → 合并成一张 DataTable，用页签区分「全部 / 融资新闻 / Form D / S-1」，支持按金额、时间排序和导出 CSV。宏观页 World Bank、FRED 改为 DataTable，并新增「中/美」比值列。中/低
3. E2E 新增 26：英文模式下融资页表头不能有中文残留。
**未做/问题**
- 数据本身不翻译：行业名、机会标题、规则卡片里的说明句、主进程原生菜单和系统通知仍是中文（截图中 Top 机会的「行业」列可见）。
- 数字列还没有右对齐。
**E2E**：26/26；启动 1.49s/1.50s；采集 31.7s。截图：shots/v43-*.png（9 张）。

## v3.7 → v4.3 指标趋势
| 版本 | E2E | 启动 ms | 采集 s | 关键指标 |
|---|---|---|---|---|
| 3.7 | 23/23 | 1190/1390 | 27.1 | 模式迁移卡 1、人才项无区分度 |
| 3.8 | 23/23 | 1526/1455 | 27.9 | 源级退避/熔断上线 |
| 3.9 | 23/23 | 2058/1380 | 28.4 | 人才项取值 1→37 种；资讯纠偏 44/120 |
| 4.0 | 23/23 | 1283/1357 | 64.7* | 地域套利卡 2→8；模式迁移卡 1 |
| 4.1 | 23/23 | 1378/1280 | 28.4 | 个人分（±8 上限） |
| 4.2 | 26/26 | 1311/1286 | 29.1 | 每日简报，15 条引用 |
| 4.3 | 26/26 | 1494/1501 | 31.7 | 英文覆盖 43%→99.6% |
\* 机器负载导致，未复现。

## v4.4 — 熔断半开试探 + 真实失败路径、快照→简报路径补验证
**学习**
- Resilience4j CircuitBreaker：OPEN 冷却到期后进入 HALF_OPEN，只放行 `permittedNumberOfCallsInHalfOpenState` 次试探；成功回 CLOSED，失败回 OPEN；半开窗口总是按次数计 — https://resilience4j.readme.io/docs/circuitbreaker ，https://github.com/resilience4j/resilience4j/issues/1523
**开源**：Resilience4j（Apache-2.0，Java），只借鉴三态模型，不引入依赖。
**反思**
1. v3.8 的「冷却期 = 退避期，到期就当作正常源采集」没有半开状态：恢复后不会记录，试探失败也不会加长冷却。→ 改为三态 closed/open/half：冷却到期后只放行 1 次试探（跳过频率检查）；试探失败重新熔断，冷却翻倍（上限 12h）；试探成功复位，并记录 `recovered` 时间和 `probes` 次数。高/低
2. 之前从没在真实失败下验证过 → 新增故障注入（仅开发/E2E：`debug:fault`、`debug:cool`），E2E 27 走完整条路径：注入故障 → 3 次失败熔断 → 熔断期内 due 采集被跳过 → 冷却到期半开试探仍失败 → 重新熔断 → 撤掉故障 → 半开试探成功 → 恢复。高/低
3. 快照后自动生成简报的路径没验证过 → `dailySnap()` 改为返回 Promise；E2E 28 删除当日快照后调用 dailySnap，检查简报是否自动生成。中/低
**修了一个隐藏问题**：E2E 用的是改名后的 Electron 可执行文件，`app.isPackaged` 为 true，所以调试接口必须用 `SR_E2E=1` 显式开启；打包版不会注册这些接口。
**E2E**：27/28。27、28 通过；18（共享包导入）超时 1 次，上一次运行时 18 是通过的，判断为负载导致的偶发失败，本轮代码没有改动共享包相关代码。启动 1.08s/1.06s，采集 24.2s。

## v4.5 — 来源配比校正 + 资讯纠偏收窄
**学习**
- Share of Voice 方法论：比较前要固定语种、市场和来源集合；按语种、渠道分别报告，不要把异质来源混在一起算 — https://umbrex.com/resources/company-analysis/corporate-communications/share-of-voice-in-media/ ，https://aclipp.com/en/blog/share-of-voice-pr
- 媒体偏差量化：按「来源 × 实体」矩阵做覆盖率的精确率/召回率归一化 — https://doi.org/10.1109/access.2020.2990800
**开源**：没有直接可复用的开源实现，按上述思路自研。
**反思**
1. 错误假设：「弱势一侧验证为 0 = 市场空白」——如果弱势一侧根本没有能产出验证信号的来源在报道这个行业，0 只说明没人报道。→ 分语种统计「验证类来源」（在该语种一侧产出过 ≥5 条融资/产品信号的来源）；弱势侧要同时满足：该行业信号 ≥15、来源 ≥2、验证类来源在该行业 ≥8 条，否则判为「来源缺口」，不出地域套利卡，并在维度页列出。另外要求强势侧的验证占比 ≥ 弱势侧 3 倍。高/低
2. 资讯纠偏命中面太大（44/120）→ 只对新闻占比 >75%、其他证据类型 <2、没有融资、来源 <4 的簇生效，最多扣 25%。中/低
**抽检**
- 资讯纠偏：44 → 23/120（例：「能源·中国科技网·电力」×0.84、「航运·物流」×0.91）。
- 来源配比：当前库上 0 个行业被判为来源缺口，8 张地域套利卡全部保留。逐个核查了「汽车：中文侧已验证、海外空白」：英文侧在该行业有 347 条信号、11 个来源（主要是 trade_media 的 318 条新闻），trade_media 在其他行业也产出过英文验证信号，所以不属于来源缺口。这张卡保留，但它的含义是「英文行业媒体大量报道汽车，却没有融资/产品类信号」，而不是「海外没人做」。
- 合成用例：英文 8 条融资、中文只有 6 条、1 个来源的行业 → 判为来源缺口，未出卡，符合预期。
**问题**：当前真实数据上这项校正没有改变任何结果；它的作用要等来源变多以后才能观察到。
**E2E**：28/28；启动 1.18s/1.04s；采集 23.7s（E2E 运行时 dims.js 里已经有 v4.6 的模式扩展代码）。
