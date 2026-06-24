# Link

小Link 现在通过 Cloudflare Workers + D1 存储链接数据。

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
