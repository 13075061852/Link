# Link

小Link 现在通过 Cloudflare Workers + D1 存储链接数据。

## 本地运行

```bash
npm install
npm run dev
```

链接数据默认连接到已部署的 Cloudflare 后端：

```text
https://link-api.1308715689.workers.dev/api/data
```

如需切换后端地址，可在页面加载前设置 `window.LINK_API_URL`。

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
