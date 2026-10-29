# codex-quota v0.3.2

一个 320 × 104 的半透明额度小窗口，支持 Windows 和 macOS。

- 显示 5H / 7D 剩余额度、重置时间、进度条与理想进度刻度。
- 双击小窗口隐藏，单击托盘／菜单栏图标或再次打开程序恢复。
- 按住窗口拖动。
- 托盘菜单只有显示／隐藏、刷新额度、置顶／取消置顶、退出。
- 默认每 3 分钟刷新，隐藏时降低刷新频率。
- 保留蓝绿双进度条图标。

已删除设置页、展开窗口、主题切换、灯效、悬停展开及对应界面和 IPC。
本机需要已安装并登录 Codex 桌面版或 CLI。

## 使用
Windows：先退出旧版，再打开 win/codex-quota.exe。
Mac：按芯片选择 arm64 或 x64 ZIP，在 Mac 上完整解压，首次运行 First Launch.command。
Mac 包尚未实机运行验证，也未做 Apple 公证。

## 开发
安装依赖后运行 npm test。对应平台使用 npm run build:win 或 npm run build:mac。
scripts/smoke-electron.js 验证小窗口、四项菜单、隐藏恢复、刷新和置顶。
scripts/cross-package-mac.py 保留官方 Darwin 运行时权限与链接，生成含首次启动脚本的 Mac 包。

基于原 codex-quota-widget 及 xicunwus2025-sys/codex-led-widget 改造。
