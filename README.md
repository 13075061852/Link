# Link

小Link 现在通过 Cloudflare Workers + D1 存储链接数据。

## 界面与交互

- 冰川蓝玻璃质感明暗主题，跟随首次访问时的系统主题；卡片 / 列表视图偏好保存在本机。
- 鼠标可拖动卡片或分类；手机通过专用手柄拖动，其他区域保留原生滚动。
- 拖拽支持逐帧预览、FLIP 让位、落位动画、跨分组移动（含空分类）、边缘自动滚动；Escape 或指针中断取消，放到区域外不保存。
- 聚焦排序手柄后，使用 `Alt + 方向键` 调整组内顺序。搜索时禁用链接排序，清空搜索即可恢复。
- `/` 或 `Ctrl / Cmd + K` 聚焦搜索；支持减少动态效果、对话框焦点管理及屏幕阅读器排序播报。
- 云端同步状态可见；连续变更合并写入。保存失败时保留当前页面的数据，点击状态重试（失败时请勿关闭页面）。

## 验证

```bash
npm test
npm run check
npx playwright install chromium
npm run test:e2e
```

浏览器测试使用本地静态服务和模拟 API，**不会读写正式 D1 数据**。如使用已安装的 Edge，可设置 `PLAYWRIGHT_CHANNEL=msedge` 后运行测试。覆盖桌面 / 触屏排序、空分类移动、取消、自动滚动、列表与搜索、保存重试及减少动态效果。移动端目前通过浏览器触屏模拟验证，真实 iOS 手感仍建议上机验收。

## 本地运行

```bash
npm install
npm run dev
```

本地预览和正式上线都访问同一份 Cloudflare 云端 D1 数据。前端默认连接到已部署的 Cloudflare 后端：

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

## 部署

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
