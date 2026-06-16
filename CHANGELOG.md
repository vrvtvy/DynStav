# Changelog

本项目所有重要变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added
- 首次开源发布。

## [1.0.0] - 2026-06-16

### Added
- 读取同花顺自定义动态板块配置（`stockblock.ini`，GB18030 编码）。
- 自动搜索 / 手动选择同花顺用户目录。
- 通过腾讯行情接口批量获取 A 股实时行情，失败自动回退本地缓存。
- 计算各板块的股票数量、平均涨跌幅、平均股价、平均成交额、总成交额、平均换手率。
- 基于 SQLite（sql.js）持久化历史数据，退出前自动备份。
- ECharts 可视化：柱状图（总成交额）+ 平滑曲线（其他指标），数据项可点击切换高亮。
- VSCode 风格五区布局：顶部菜单栏、左侧主侧栏、中间图表区、右侧辅侧栏、底部状态栏。
- 明亮 / 暗色双主题，默认暗色，选用无障碍配色。
- 首次启动三步引导流程（欢迎页 → 同步 Loading → 主界面）。
- NSIS 安装程序，卸载时可选清理用户数据目录。

[Unreleased]: https://github.com/vrvtvy/dynstav/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/vrvtvy/dynstav/releases/tag/v1.0.0
