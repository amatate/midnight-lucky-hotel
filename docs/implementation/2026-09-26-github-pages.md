# GitHub Pages 发布准备 · 2026-09-26

发布目标：`amatate/midnight-lucky-hotel` 的 `main`，网页地址为 <https://amatate.github.io/midnight-lucky-hotel/>。本次一起提交此前的构筑多样性、客房扩展、机台素材与固定手机界面。实际部署状态可在仓库的 `Publish game to GitHub Pages` Actions 记录查看。

## 本次发布适配

- `DEPLOY_BASE_PATH` 设置 Vite 资源根路径；未设置时仍为 `/`。Pages 工作流从官方 configure-pages 获取部署子路径。
- PWA 启动地址、作用域和图标跟随子路径；三张 SVG 图集的图片地址改为 `import.meta.env.BASE_URL`。CSS 里的字体与背景由 Vite 重写，生产产物已检查。
- 保持提示式 PWA 更新，不强制接管或刷新正在玩的游戏。首次缓存完成并重新打开后可离线游玩。
- GitHub Actions 使用固定提交的官方 actions，依次运行 `npm ci`、全量单元测试、类型检查 / 生产构建与 Pages 部署。部署不带个人密钥。
- 构建版本为 `playtest-2026.09.26-mobile-pages`。本次未修改规则、随机数或存档结构；这些目录相对本次开始的 diff 校验值未变。

## 发布前验证

- 69 个测试文件、779 项测试通过；同步了 19 项因新版菜单 / 小票抽屉和新增部件前置条件而过时的断言，未跳过或删除断言覆盖。
- `DEPLOY_BASE_PATH=/midnight-lucky-hotel/ npm run build` 通过。主 JS 约 509 kB（gzip 164 kB），仍有 500 kB 分块建议，未为发布引入额外重构。
- 3 项固定机台浏览器回归通过：360×640 / 390×760 / 430×932，转动、干预、结算、三转选升级、送餐扣费、抽屉暂停与桌面居中。
- 1 项 Pages 专用回归通过：manifest 启动地址 / scope、5 张机台 PNG、Service Worker 子路径，缓存后断网重开并完成一转；无页面异常。
- 敏感文件名与常见密钥格式扫描未发现命中；`git diff --check` 通过。

复现：先执行上述子路径构建，再运行 `npx playwright test --config playwright.pages.config.ts`。本地独立预览端口为 4197；也可设置 `PLAYTEST_BASE_URL` 指向已发布的站点进行同样检查。全部使用隔离浏览器上下文，不读取玩家个人 Chrome 数据。

这些是 Chromium 手机视口测试，不是 iPhone / Android 真机验收，也不证明数值完全平衡。

## 使用边界

浏览器存档不跨网址自动同步。从 localhost 或旧试玩站切换到 Pages，先导出单局，在新站的历史与存档中导入。旧试玩站不随 Pages 工作流更新。本次不增加源码许可证、不创建 GitHub Release、不发布社区帖子。
