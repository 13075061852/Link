# Link

小Link 支持香港服务器独立部署（Node.js + 本地持久化），并保留原 Cloudflare Workers + D1 部署方式。

## 香港服务器部署

- 地址：`https://www.gbjson.cn/link/`（`/link` 自动跳转）。按用户要求无需登录，浏览和编辑均公开；现有管理后台的登录保护不变。
- 运行：`server.cjs`，无需安装生产依赖；systemd 服务 `link.service`，仅监听 `127.0.0.1:8791`，由 Nginx 代理。
- 代码：`/opt/link/current`；数据：`/var/lib/link/data.json`（独立于代码发布目录）。不要用代码更新覆盖数据目录。
- 每次保存前自动备份，保留最近 100 份：`/var/lib/link/backups/`。初次迁移备份和原 Nginx 配置保留在 `/var/backups/link/`。
- 数据采用临时文件、fsync 和原子替换；ETag 防止多个页面互相覆盖。遇到更新冲突，先导出当前页面修改，再刷新后导入合并。
- 部署模板：`deploy/link.service`、`deploy/link.nginx.conf`。Nginx 模板仅插入已有域名的 HTTPS server 块，不依赖管理后台会话。
- 首次启动前必须提供有效的 `data.json`；文件缺失或损坏时拒绝启动，不自动创建空收藏。
- 2026-10-26 已从 D1 迁入 12 个分类、96 条链接。迁移后两端独立保存，**不做双向同步**；原 D1 数据未修改。

本地测试服务器：先把有效导出数据保存为临时目录中的 `data.json`，设置 `LINK_DATA_DIR` 后运行 `npm start`。如需在浏览器编辑，还需将本地源地址加入 `LINK_ORIGINS`（逗号分隔）。不要把不受认证保护的后端直接暴露到公网。

## 界面与交互

界面采用 iOS 灵感的极简资料库风格：冷白 / 石墨黑表面、系统蓝、系统无衬线字体。单一设计令牌驱动明暗主题，不依赖 Tailwind、图标或字体 CDN：

- 桌面使用固定分类侧栏，分类独立滚动，底部常驻管理入口；选中分类以浅蓝高亮。通透应用栏将品牌、搜索、视图切换、添加、同步状态和数据工具合并为一排；取消独立的收藏标题与数量区域，内容直接从分类分组开始。窄屏将应用栏分为两行，保留全部操作入口。
- 900px 及以下分类改为左侧抽屉，由左上角侧栏按钮打开；选择分类、点击遮罩或按 Escape 关闭，支持焦点圈定、焦点恢复与背景隔离。
- 收藏卡片采用约 72px 高的横向结构：左侧图标、名称与域名，右侧更多操作入口。手机使用单列卡片，列表采用内嵌分组结构，弹窗采用底部面板。
- 复制、编辑与删除收进卡片操作菜单，支持键盘展开、Escape / 点击外部关闭，底部空间不足时向上展开；桌面拖拽手柄只在悬停或键盘聚焦时显示，手机保持禁用排序。
- 明暗主题跟随首次访问时的系统设置，切换时使用圆形揭示动画；**减少动态效果**时取消位移与揭示动画。
- 桌面端可用鼠标拖动卡片或分类；900px 以下的手机 / 平板布局不提供拖拽排序（手柄隐藏），避免与触摸滚动冲突。
- 拖拽支持逐帧预览、FLIP 让位、落位动画、跨分组移动（含空分类）、边缘自动滚动；Escape 或指针中断取消，放到区域外不保存。
- 聚焦排序手柄后，使用 `Alt + 方向键` 调整组内顺序。搜索时禁用链接排序，清空搜索即可恢复。
- `/` 或 `Ctrl / Cmd + K` 聚焦搜索；空结果时按钮变为“清空搜索”。
- 云端同步状态可见；连续变更合并写入。保存失败时保留当前页面的数据，点击状态重试（失败时请勿关闭页面）。
- 图标为本地内联 Lucide 几何（`public/icons.js`，ISC / Feather MIT），避免外部请求与图标闪烁。

### 前端结构

| 文件 | 职责 |
| --- | --- |
| `public/index.html` | 语义结构与对话框骨架 |
| `public/styles.css` | 设计令牌、组件、响应式、明暗与减少动态效果 |
| `public/app.js` | 启动、事件编排、搜索、拖拽、主题揭示 |
| `public/ui.js` | 卡片、分组、空状态、链接弹窗与提示 |
| `public/categories.js` | 分类导航、排序、分类管理与图标选择 |
| `public/sidebar.js` | 响应式侧栏、手机抽屉与焦点管理 |
| `public/transfer.js` | 导入、导出与文件拖放 |
| `public/data-dialog.js` | 通用数据对话框与删除确认 |
| `public/dialogs.js` | 对话框开关、焦点圈定与背景隔离 |
| `public/icons.js` | 本地图标几何与声明式图标渲染 |
| `public/store.js` | 数据模型、搜索、导入导出与保存队列 |

## 验证

```bash
npm test
npm run check
npx playwright install chromium
npm run test:e2e
```

浏览器测试使用本地静态服务和模拟 API，**不会读写正式数据**。如使用已安装的 Edge，可设置 `PLAYWRIGHT_CHANNEL=msedge` 后运行测试。覆盖桌面排序、移动端禁用排序与原生滚动、侧栏导航与手机抽屉、空分类移动、取消、自动滚动、列表与搜索、保存重试、主题揭示及减少动态效果。移动端通过浏览器触屏模拟验证，真实 iOS 手感仍建议上机验收。

## 本地运行

```bash
npm install
npm run dev
```

前端默认使用页面所在目录的 `api/data`（服务器部署时为 `/link/api/data`），不再写死 Cloudflare 地址。

使用 `npm run dev` 时仍运行原 Worker，其 D1 绑定为远端模式，会访问正式 D1 数据。原 Cloudflare 后端地址：

```text
https://link-api.1308715689.workers.dev/api/data
```

如需临时切换后端地址，可在页面加载前设置 `window.LINK_API_URL`。

本地 Worker 的 D1 绑定也配置为远端模式，因此需要已登录 Cloudflare：

```bash
npx wrangler login
```

## 数据库初始化

首次部署或新建 D1 数据库后执行：

```bash
npm run db:migrate
```

数据库结构由 `migrations/` 管理；不要依赖本地 D1 副本保存正式数据。

## 原 Cloudflare 部署

```bash
set CLOUDFLARE_API_TOKEN=你的 Cloudflare API Token
npm run deploy
```

当前 D1 数据库:

- binding: `DB`
- name: `link_store`
- id: `65d61eda-4db4-413d-b832-2636c6849568`

当前已部署后端 Worker:

- name: `link-api`
- URL: `https://link-api.1308715689.workers.dev/api/data`
