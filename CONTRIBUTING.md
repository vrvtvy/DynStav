# 贡献指南

首先，**非常感谢**你愿意为 DynStav 贡献力量！🎉

无论是提 Issue、修 Bug、加功能、完善文档，还是翻译，都同样欢迎。

## 行为准则

参与本项目即代表你同意遵守 [Code of Conduct](./CODE_OF_CONDUCT.md)。请保持友善、尊重。

## 🐛 报告 Bug

1. 先在 [Issues](https://github.com/vrvtvy/dynstav/issues) 搜索是否已有人报告过。
2. 没有的话，点击 **New issue** 选择 **Bug report** 模板。
3. 请尽量提供：
   - DynStav 版本（在「关于 / 状态栏」查看，或看 `package.json`）
   - Windows 版本
   - 复现步骤
   - 截图 / 日志（日志位于 `%LOCALAPPDATA%\DynStav\logs`）

## 💡 提功能建议

欢迎在 Issues 中提 **Feature request**，描述：
- 你遇到的问题 / 场景
- 你期望的效果

## 🔧 提交代码（Pull Request）

### 开发环境准备

- Node.js 22+（推荐用 [nvm](https://github.com/nvm-sh/nvm) 管理）
- [pnpm](https://pnpm.io/)（包管理器）
- Windows 系统（本应用仅支持 Windows）

```bash
git clone https://github.com/vrvtvy/dynstav.git
cd dynstav
pnpm install
pnpm dev          # 启动开发环境
```

### 工作流

1. **不要直接在 `main` 分支上开发**。从最新的 `main` 拉分支：
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feat/你的功能名   # 或 fix/修复名
   ```
2. 编写代码，**保持中文注释风格**（与现有代码一致）。
3. 提交前本地验证：
   ```bash
   pnpm build       # 确保类型检查 + 构建通过
   ```
4. Commit message 用简洁明了的中文或英文，例如：
   - `修复：切换板块时图表纵坐标未更新`
   - `feat: 支持导出数据为 CSV`
5. Push 到你 fork 的仓库，向 `main` 提交 **Pull Request**。
6. 在 PR 描述中说明**改了什么、为什么改**，最好关联相关 Issue（`Closes #12`）。

### PR Review

- 维护者会进行 review，可能提出修改建议，请耐心配合。
- 所有 CI 检查通过后才会合并。

## 📂 项目结构

```
src/
├── main/              # Electron 主进程
│   ├── ai/            # AI 对话服务（流式聊天、模型适配）
│   ├── analyzer/      # 数据分析计算
│   ├── config-parser/ # 同花顺配置文件解析
│   ├── data-fetcher/  # 行情数据获取
│   ├── db/            # 数据持久化（SQLite）
│   ├── ipc/           # 主/渲染进程通信
│   └── ...
├── preload/           # 预加载脚本（安全桥接）
└── renderer/          # 渲染进程（React 前端）
    └── src/components/
```

## 📜 许可证

提交的代码将遵循项目的 [MIT License](./LICENSE)。
