# DynStav — AI 智能体说明

## 项目概述

DynStav 是一款 Electron + React + TypeScript 桌面应用，用于读取同花顺自定义动态板块，统计并可视化各板块的趋势指标，内置 AI 分析面板。

## 快速命令

```bash
pnpm install          # 安装依赖
pnpm dev              # 开发模式（HMR 热更新）
pnpm build            # 仅构建（类型检查 + 编译）
pnpm dist             # 打包 Windows 安装程序（输出到 release/）
pnpm run start        # 构建后启动应用
```

- 构建脚本使用 **PowerShell 7**（`pwsh`），确保开发环境已安装 pwsh。
- Node.js 使用 **nvm** 管理，推荐 Node.js 22+。

## 技术栈

| 领域      | 技术                                              |
| --------- | ------------------------------------------------- |
| 框架      | Electron 33、React 18、TypeScript 5               |
| 构建      | electron-vite、electron-builder                   |
| 可视化    | ECharts 5、echarts-for-react                      |
| AI 对话   | Vercel AI SDK 7（streamText / generateText）      |
| AI 供应商 | @ai-sdk/openai、@ai-sdk/anthropic、@ai-sdk/google |
| 数据存储  | sql.js（SQLite WASM）                             |
| 日志      | electron-log                                      |
| 编码处理  | iconv-lite（解析 GB18030 编码的同花顺配置）       |

## 项目结构

```
src/
├── main/                 # Electron 主进程
│   ├── ai/               # AI 对话服务（流式聊天、Vercel AI SDK）
│   │   ├── sdk-providers.ts  #   AiProviderConfig → SDK LanguageModel 桥接
│   │   ├── presets.ts    #   预设供应商列表（13 家主流 AI 服务商）
│   │   ├── service.ts    #   流式聊天主逻辑（streamText / generateText）
│   │   └── types.ts      #   上下文构建工具（buildContextPrompt / injectContext）
│   ├── analyzer/         # 板块指标计算
│   ├── config-parser/    # 同花顺 stockblock.ini 解析（GB18030 → UTF-8）
│   ├── data-fetcher/     # 腾讯行情接口获取 A 股实时行情
│   ├── db/               # SQLite 持久化层（仓库模式）
│   │   ├── index.ts      #   initDatabase() / getRepository()
│   │   ├── interface.ts  #   DataRepository 接口
│   │   └── sqlite.ts     #   SqliteRepository 实现
│   ├── ipc/              # 主/渲染进程通信（safeHandle 统一异常处理）
│   ├── config.ts         # 应用配置读写（JSON 文件）
│   ├── paths.ts          # 数据/日志/缓存路径
│   ├── ths-search.ts     # 同花顺目录自动搜索（注册表 + 常见路径）
│   ├── ths-config-archive.ts  # stockblock.ini 变更检测与归档
│   ├── trading-calendar.ts    # A 股交易日历（节假日数据）
│   └── logger.ts         # 日志与全局异常捕获
├── preload/              # contextBridge 安全桥接（暴露 electronAPI）
│   └── index.ts
└── renderer/             # React 渲染进程
    └── src/
        ├── main.tsx      # React 入口
        ├── App.tsx       # 根组件（状态管理 + 布局编排）
        ├── utils.ts      # 工具函数
        ├── types/
        │   └── index.ts  # 共享类型 + IPC_CHANNELS 常量
        ├── styles/
        │   ├── variables.css  # 全局主题变量
        │   ├── dark.css       # 暗色主题
        │   └── light.css      # 亮色主题
        └── components/
            ├── Layout/        # VSCode 风格布局容器（可拖拽侧栏）
            ├── MenuBar/       # 顶部菜单栏
            ├── Sidebar/       # 左侧板块列表（可搜索、可拖拽排序）
            ├── Chart/         # ECharts 多指标趋势图
            ├── RightPanel/    # 右侧 AI 对话面板
            │   ├── index.tsx         # 容器组件
            │   ├── AiChat.tsx        # 对话交互组件
            │   ├── AiConfigDialog.tsx # 供应商/模型配置弹窗
            │   ├── ChatHistoryList.tsx # 历史对话列表
            │   └── context.ts        # 对话上下文管理
            ├── StatusBar/     # 底部状态栏
            ├── TitleBar/      # 自定义标题栏（无边框窗口）
            ├── Welcome/       # 首次引导页
            ├── GuideContent/  # 帮助指南
            ├── RestoreDialog/ # 数据恢复弹窗
            └── ConfirmDialog/ # 确认弹窗
```

## 关键约定

### 编码与注释

- **所有注释、用户可见文本、commit 信息必须使用简体中文。**
- 代码语法关键词（`if`、`for`、`import`、`interface` 等）保持英文不变。

### IPC 通信

- 主进程通过 `src/main/ipc/index.ts` 的 `safeHandle(channel, handler)` 注册处理器，**不要直接使用 `ipcMain.handle`**。
- 渲染进程通过 `window.electronAPI.*`（preload 通过 `contextBridge.exposeInMainWorld` 暴露）调用。
- IPC 通道名称定义在 `src/renderer/src/types/index.ts` 的 `IPC_CHANNELS` 常量中。

### AI 供应商集成（Vercel AI SDK）

- 底层统一使用 Vercel AI SDK 的 `streamText()`（流式）和 `generateText()`（测试连接）。
- 供应商桥接在 `src/main/ai/sdk-providers.ts` 中实现：
  - `createProvider(config) → LanguageModel`：根据 `template` 类型创建对应的 SDK provider：
    - `completion` / `responses` / `custom` → `createOpenAI({ baseURL, apiKey, headers })`
    - `anthropic` → `createAnthropic({ baseURL, apiKey })`
  - SDK 原生处理 SSE 解析、delta 合并、重试（`maxRetries: 2`）和超时（`timeout`）。
- 预设定义在 `src/main/ai/presets.ts` 的 `PRESET_PROVIDERS` 数组中追加。
- 新增供应商：一般在 `presets.ts` 追加预设即可。若有特殊请求体/响应格式，在 `sdk-providers.ts` 中新增 `template` 分支。
- `src/main/ai/adapters.ts` 已废弃（旧的自定义适配器模式由 SDK 替代）。

### 数据层

- **仓库模式**：`DataRepository` 接口定义在 `src/main/db/interface.ts`，`SqliteRepository` 实现于 `src/main/db/sqlite.ts`。
- 通过 `getRepository()` 获取单例仓库实例。
- 数据库初始化在 `src/main/db/index.ts` 中通过 `initDatabase()` 完成。

### 样式

- 使用 **CSS Modules**（文件命名 `*.module.css`）。
- 全局主题变量在 `src/renderer/src/styles/variables.css` 中定义。
- 明暗主题分别定义在 `dark.css` / `light.css`，通过 `<html data-theme="dark|light">` 切换。
- 无障碍配色：选用高对比度、色盲友好的颜色方案。

### 构建配置

- `electron.vite.config.ts`：主进程/预加载使用 `externalizeDepsPlugin()`，渲染进程使用 `@` 别名 → `src/renderer/src`。
- TypeScript 分两个配置：
  - `tsconfig.node.json`：主进程 + 预加载（Node 环境）
  - `tsconfig.web.json`：渲染进程（浏览器环境）
  - 根 `tsconfig.json` 仅作引用，不含实际编译选项。

### 运行环境

- **Windows 专属**：仅支持 Windows 10/11，依赖同花顺 Windows 客户端的 `stockblock.ini`。
- **PowerShell 7**：所有 npm 脚本通过 `pwsh -NoProfile -File run.ps1 <command>` 执行。
- **nvm**：使用 nvm 管理 Node.js 版本，要求 22+。

## 已有文档（链接引用，勿重复嵌入）

- [README.md](./README.md) — 项目简介、功能特性、快速开始、技术栈
- [CONTRIBUTING.md](./CONTRIBUTING.md) — 贡献指南、开发环境搭建、PR 工作流
- [CHANGELOG.md](./CHANGELOG.md) — 版本变更历史
- [SECURITY.md](./SECURITY.md) — 安全策略与漏洞报告
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) — 贡献者行为准则
- [devdoc/右侧辅助栏AI对话分析功能需求.md](./devdoc/右侧辅助栏AI对话分析功能需求.md) — AI 对话功能详细需求文档

## 常见陷阱

1. **同花顺配置文件编码**：`stockblock.ini` 以 GB18030 编码存储，必须使用 `iconv-lite` 解码为 UTF-8，不可直接用 `fs.readFile` 读取文本内容。
2. **交易日历**：渲染进程 `src/renderer/src/utils.ts` 中的 `getTradingDateRange` 已标记 `@deprecated`（仅跳过周末，不跳过节假日），应使用主进程 `src/main/trading-calendar.ts` 的完整交易日历接口。
3. **日志初始化顺序**：`setupLogger()` → `log.initialize()` → `installGlobalErrorHandlers()` 必须在主进程入口 `src/main/index.ts` 的最顶部执行，确保后续所有操作的异常都能被捕获记录。
4. **窗口状态保存**：只在窗口**非最大化**状态保存 `windowBounds`；最大化时只保存 `maximized: true`，还原时恢复上次的 bounds。
5. **AI 流式取消**：取消流式请求需调用 `cancelChat()`（内部通过 `AbortController` 实现），不能仅靠断开连接。SDK 的 `streamText()` 返回后会自动清理，但主动取消仍需调用 `cancelChat()` 触发 `AbortController.abort()`。
6. **ESM 依赖外部化**：`@ai-sdk/*` 和 `ai` 包是纯 ESM 模块，必须从 `externalizeDepsPlugin({ exclude: [...] })` 中排除，否则打包后 `require()` 会抛出 `ERR_REQUIRE_ESM`。修改后需同步更新 `electron.vite.config.ts` 的 main 和 preload 两个配置段。
