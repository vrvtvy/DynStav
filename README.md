<div align="center">

# DynStav

**动态板块趋势分析可视化** · Dynamic Sector Trend Analysis Visualization

读取同花顺自定义动态板块，统计并可视化各板块的趋势指标。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/platform-Windows-blue.svg)](#系统要求)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

</div>

---

## 📖 简介

DynStav 是一款 **Windows 桌面应用**（基于 Electron + React + TypeScript），用于：

1. 读取**同花顺**客户端的自定义动态板块配置文件（`stockblock.ini`）。
2. 获取板块中各股票的行情。
3. 计算每个板块的：**股票数量、平均涨跌幅、平均股价、平均成交额、总成交额、平均换手率**。
4. 将历史数据持久化到本地 SQLite，并通过 ECharts 可视化展示，帮助你判断市场环境与板块趋势。

> 适合每天看盘时快速感知"自己关注的板块整体强弱"。

---

## ✨ 功能特性

- 🔍 **自动识别同花顺目录**：扫描注册表 + 常见安装路径，也支持手动选择。
- 📊 **多指标可视化**：柱状图（总成交额）+ 平滑曲线（其余指标），点击数据项切换高亮与纵坐标。
- 🤖 **AI 板块分析**：右侧 AI 对话面板，基于当前板块的真实行情数据进行智能分析，支持 OpenAI / Azure / Anthropic / 自定义模型接口。每个供应商可配置多个模型，独立设置参数，输入区一键切换。
- 🗓️ **交易日筛选**：仅可选 A 股交易日，默认展示最近 7 个交易日。
- 🎨 **明暗双主题**：默认暗色，选用**无障碍配色**。
- 🔤 **字体大小调节**：三档字体大小（小 / 中 / 大），一键切换，重启保持。
- 🖥️ **VSCode 风格布局**：菜单栏 / 主侧栏 / 图表区 / 辅侧栏 / 状态栏，侧栏可拖拽调节、可收起。
- 💾 **本地持久化**：SQLite 存储，退出前自动备份；数据完全留在你本机。
- 🚀 **首次引导**：三步上手流程，新手也能快速配置。

---

## 📸 截图

<!-- TODO: 在这里放一张主界面截图，例如：-->
<!-- ![主界面](docs/screenshot-main.png) -->

> 📌 开源后建议补上 1-2 张截图，能让项目第一印象好很多。

---

## 系统要求

- **操作系统**：仅支持 **Windows 10 / 11**（依赖同花顺 Windows 客户端的配置文件）。
- 已安装**同花顺**客户端，并配置了自定义动态板块。

---

## 🚀 快速开始（普通用户）

### 方式一：下载安装包（推荐）

前往 [Releases 页面](https://github.com/vrvtvy/dynstav/releases) 下载最新的 `.exe` 安装包，双击安装即可。

### 方式二：从源码运行

```bash
git clone https://github.com/vrvtvy/dynstav.git
cd dynstav
pnpm install
pnpm dev
```

### 首次使用

1. 启动后会进入欢迎页，应用会自动搜索同花顺用户目录。
2. 选择你的同花顺用户目录（包含 `stockblock.ini` 的 `mx_*` 目录）。
3. 点击同步数据，等待行情拉取完成即可进入主界面。

---

## 🛠️ 开发

### 环境要求

- [Node.js](https://nodejs.org/) 22+（推荐用 [nvm](https://github.com/nvm-sh/nvm) 管理）
- [pnpm](https://pnpm.io/)
- Windows 系统

### 常用命令

```bash
pnpm install      # 安装依赖
pnpm dev          # 开发模式（构建 + 启动）
pnpm build        # 仅构建（类型检查 + 编译）
pnpm dist         # 打包 Windows 安装程序（输出到 release/）
```

### 项目结构

```
src/
├── main/                 # Electron 主进程
│   ├── ai/               # AI 对话服务（流式聊天、模型适配）
│   ├── analyzer/         # 数据分析计算
│   ├── config-parser/    # 同花顺配置文件解析 (GB18030)
│   ├── data-fetcher/     # 行情数据获取 (腾讯行情接口)
│   ├── db/               # 数据持久化 (SQLite / sql.js)
│   ├── ipc/              # 主/渲染进程通信
│   ├── ths-search.ts     # 同花顺目录搜索
│   └── trading-calendar  # 交易日历
├── preload/              # 预加载脚本（安全桥接）
└── renderer/             # 渲染进程 (React + ECharts)
    └── src/components/   # UI 组件
```

更多细节请阅读 [贡献指南](./CONTRIBUTING.md)。

---

## 🧱 技术栈

| 领域     | 技术                                |
| -------- | ----------------------------------- |
| 框架     | Electron 33、React 18、TypeScript 5 |
| 构建     | electron-vite、electron-builder     |
| 可视化   | ECharts 5、echarts-for-react        |
| AI 对话  | OpenAI / Azure / Anthropic / 自定义兼容接口 |
| 数据存储 | sql.js（SQLite 的 WASM 版本）       |
| 日志     | electron-log                        |
| 编码处理 | iconv-lite（解析 GB18030 配置）     |

---

## 📂 数据存放位置

| 内容         | 路径                      |
| ------------ | ------------------------- |
| 配置文件     | `%USERPROFILE%\.dynstav\` |
| 数据库与日志 | `%LOCALAPPDATA%\DynStav\` |

> 卸载时安装程序会询问是否一并删除这些数据。

---

## ⚠️ 免责声明（重要）

### 关于「同花顺」

- 本项目**与同花顺官方及核新软件（杭州）没有任何关联**，未获得其授权或背书，属非官方第三方工具。
- 「同花顺」为其各自所有者的**注册商标**，本项目仅出于指代目的使用该名称。
- 本项目**只读取**（绝不修改）用户本机上同花顺客户端的配置文件 `stockblock.ini`，用于识别用户自己定义的板块。所有数据所有权归用户本人。
- 使用本软件产生的一切后果由使用者自行承担。

### 关于行情数据

- 本项目通过**公开的行情接口**获取 A 股实时行情，数据**仅供学习与研究用途**，不保证其准确性、完整性和及时性。
- 行情接口可能随时变更或失效，本项目不对其可用性作任何承诺。
- **本项目不构成任何投资建议**，使用者据此操作的风险自负。

---

## 🤝 贡献

欢迎提 Issue、Pull Request！请先阅读 [贡献指南](./CONTRIBUTING.md)。

## 📄 许可证

[MIT License](./LICENSE) © 2026 vrvtvy
