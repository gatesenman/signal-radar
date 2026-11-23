# SignalRadar 6.1 — 工作台连续迭代

在 6.0 端到端工作台之上做 12 轮面向跟进闭环的迭代。版本在第 12 轮升为 **6.1.0**。不推送到 GitHub（由后续发布步骤处理）。

## r1 默认进入工作台，空状态如实反映采集

默认首页改为工作台。设置里可选择「按首次引导的角色」以保留 5.0 首页（创业者→机会维度、VC→机会雷达、企业战略→产业链）。首次采集的空状态区分：正在采集、全部失败、部分失败、尚无数据；失败会列出真实的数据源错误，不会用占位数据冒充已采集。

主要文件：`electron/workbench.js`、`electron/main.js`、`src/App.jsx`、`src/workbench.jsx`、`src/views2.jsx`、`src/ui.jsx`、`src/shell21.jsx`。

## r2 到期 / 逾期任务走现有提醒通道

跟进任务在到期日或逾期时写入本机 `notifications`，并走系统通知（与每日简报、高分规则同一条路径）。`ref` 含机会 id、任务 id、到期日和状态，配合表上的 UNIQUE(alert_id, ref)，每个任务在同一到期日同一状态只通知一次，不会天天重复刷。提醒中心点击可回到该机会工作区。内置规则「到期 / 逾期任务」可在提醒页删除以关闭。应用启动后会检查一次；采集/聚类后也会检查。

主要文件：`electron/workbench.js`、`electron/main.js`、`src/shell21.jsx`、`src/views2.jsx`。

## r3 机会工作区研判摘要

工作区右侧改为「研判摘要」：用库里已有的产业链卡脖子、该行业论文增速/转化落差、宏观数据是否在库，以及到期任务，给出足够判断下一步的短句。不复制研究页图表。没有数据时如实写「尚未匹配 / 样本不足 / 尚未拉取」，不编造数字。点击摘要可跳到对应研究页。

主要文件：`electron/workbench.js`、`electron/main.js`（`opp:digest`）、`src/detail.jsx`。

## r4 收件箱：键盘分拣、撤销、筛选与批量

收件箱仍按待分拣 / 新信号 / 稍后 / 已收录 / 已忽略筛选（状态写入本机库）。新增：J/K 移动当前条，E 收录，Z 稍后，X 忽略，U 或工具栏「撤销」恢复上一次分拣（含批量），Enter 打开工作区。可勾选多条后批量收录/稍后/忽略，全部走同一套 IPC，不会只改界面。输入框内快捷键不触发。

主要文件：`electron/workbench.js`、`electron/main.js`、`src/workbench.jsx`。

## r5 管道纪律：停留天数、下一步到期与停滞提示

切换阶段时写入 `stageChangedAt`。管道列表/看板/导出据此计算停留天数；初筛 7 天、深研/验证 14 天、立项 21 天无推进则提示「停滞」。管道中的机会如果没有带到期日的跟进任务，会提示「缺下一步」。逾期任务行和卡片高亮。没有阶段变更时间的旧记录不会被假装成停滞。阶段键仍是 discover/screen/research/validate/go/drop。看板列按 `stage || 'discover'` 归类，噪声簇不进看板。

主要文件：`electron/workbench.js`、`electron/main.js`、`src/views2.jsx`。
