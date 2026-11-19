# 商机雷达 Signal Radar

**5.0.0** · AI 创业机会发现桌面应用：从 80+ 个全球公开数据源采集信号，在本机做语义聚类和可解释评分，输出机会陈述与投委会备忘录。

## 功能特性

- 从 80+ 公开数据源采集信号，本地语义聚类与可解释评分。
- 输出机会陈述、TAM/SAM/SOM、竞争格局、Why Now、产业链卡脖子分析与 IC 备忘录；结论附来源链接，假设会明确标注。
- 桌面软件风格界面：采集、聚类、行业筛选、报告与备忘录；语义嵌入模型内置，可离线使用。
- 数据保存在 `%APPDATA%\signal-radar`。

## 技术栈

- Electron
- Vite
- JavaScript

## 从源码运行

源码在仓库根目录。本仓库不包含安装包。`package.json` 版本为 5.0.0。

```bash
npm install
npm start            # 先 vite build，再启动 Electron
```
使用说明见 `README.original.md`（其中若出现旧版安装包文件名，以本仓库源码为准）。

## 文档

- [源码 README](README.original.md)

---

## English

# Signal Radar

**5.0.0** · A desktop app for discovering startup opportunities: it collects signals from 80+ public sources, clusters and scores them locally, and writes opportunity briefs and investment-committee memos.

## Features

- Ingests signals from 80+ public sources and performs local semantic clustering with explainable scores.
- Produces opportunity statements, TAM/SAM/SOM, competitive landscape, Why Now, industry bottleneck analysis, and IC memos, with source links and labeled assumptions.
- Desktop-style UI for collect, cluster, industry filters, reports, and memos. The embedding model is bundled for offline use.
- Data is stored in `%APPDATA%\signal-radar` on Windows.

## Tech stack

- Electron
- Vite
- JavaScript

## Getting started

Source is at the repository root. This repository does not include installers. `package.json` reports version 5.0.0.

```bash
npm install
npm start            # vite build, then Electron
```
See `README.original.md` for usage. If that file mentions older installer names, use the source in this repository instead.

## Documentation

- [源码 README](README.original.md)

