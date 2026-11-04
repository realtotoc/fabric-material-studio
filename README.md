# 织间 · AI 家具换材质预览

上传家具照片与目标布料/色卡，智能识别可替换部件，勾选或涂选区域，生成换材质效果。支持沙发、椅子、软床床头等。

原生 Node.js，**无第三方运行依赖、无需前端构建**（仅 Workers 部署使用 Wrangler 开发依赖）。API Key 仅存后端环境变量，前端无需填写密钥。

## 功能

- 家具图与布料图上传，保留照片原始比例，内置 AI 生成的测试素材。
- Qwen3 VL Plus 智能识别部件及建议选区，支持画笔修正、擦除与撤销。
- Qwen Image 3.0 / 3.0 Pro 多图参考换材质，明确替换原布颜色，支持深色家具换为目标面料色。
- 异步任务提交一次，每 15 秒查询状态，支持继续读取现有任务。
- 原图左右对比、PNG 导出和当前页面会话内的方案保存。
- 无需调用 AI 的本地材质叠加预览。

## 本地运行

需要 Node.js 22.13+，推荐 Node 24。

```bash
cp .env.example .dev.vars
# 在 .dev.vars 填入 AIHUBMIX_API_KEY
npm start
```

打开 http://127.0.0.1:4173 。点击「载入沙发与布料测试图」→「智能识别部件」→核对部件→「生成 AI 效果」。

本地每次请求重新读取 `.dev.vars` 的 AIHUBMIX_API_KEY，保存后无需重启。该文件被 Git 忽略。

## 部署到 Cloudflare Workers

仓库已包含 `worker/index.mjs` 和 `wrangler.jsonc`。静态页面通过 `ASSETS` 绑定提供，AI API 在 Worker 内运行，异步任务由浏览器每 15 秒查询，无需在 Worker 内长时间等待生图。`run_worker_first: true` 确保网页、静态资源和 API 都先经过访问密码校验。

### Cloudflare 控制台连接 GitHub

1. Workers & Pages → Create application → 导入 GitHub 仓库。
2. 选择本仓库与 `main` 分支，构建命令 `npm run build`，部署命令 `npx wrangler deploy`。
3. 首次部署后，进入 Worker → Settings → Variables and Secrets，添加两个 **Secret**：
   - `AIHUBMIX_API_KEY`：你的 AiHubMix Key。
   - `STUDIO_PASSWORD`：网页访问密码。用户名默认 `admin`。
4. 保存并部署，然后打开分配的 `workers.dev` 地址。未配置密码前会返回 503，不会开放 AI 调用。

### 使用 Wrangler CLI

```bash
npm ci
npx wrangler login
npm run check:worker
npm run deploy:worker
npx wrangler secret put AIHUBMIX_API_KEY
npx wrangler secret put STUDIO_PASSWORD
```

密钥只填写到 Wrangler 的交互提示中，不写入 `wrangler.jsonc`。`secret put` 会发布更新。后续代码更新运行 `npm run deploy:worker`。

本地 Worker 预览：在 `.dev.vars` 配置密钥及 `STUDIO_PASSWORD`，运行 `npm run dev:worker`，打开 http://127.0.0.1:8787 。原本的 `npm start` 本地 Node 模式仍可用。

## 部署到 Render

1. 在 Render 创建 **Blueprint**，选择此仓库，读取 `render.yaml`；也可以创建 Docker Web Service。
2. 设置 `AIHUBMIX_API_KEY` 为你的 AiHubMix Key。
3. 设置 `STUDIO_PASSWORD` 为网页访问密码，默认用户名 `admin`。
4. 创建服务，部署完成后打开分配的网址，输入用户名和密码。

Docker 镜像使用 Node 24，监听 `0.0.0.0` 和平台提供的 `PORT`，健康检查路径 `/healthz`。部署前确认所选服务方案和平台显示的费用。访问密码用于限制线上测试网页的 AI 调用。

**GitHub Pages 无法运行 AI 后端，请使用 Node 或 Docker Web Service。**

## 其他 Node / Docker 平台

构建命令 `npm run build`，启动命令 `npm start`。设置 `NODE_ENV=production`、`AIHUBMIX_API_KEY` 和 `STUDIO_PASSWORD`，端口使用平台提供的 `PORT`。

```bash
docker build -t fabric-material-studio .
docker run --rm -p 10000:10000 --env-file /path/to/private-runtime.env fabric-material-studio
```

`private-runtime.env` 包含 `AIHUBMIX_API_KEY` 与 `STUDIO_PASSWORD`，不要提交到仓库。

## 环境变量

| 变量               | 用途                                     |
| ------------------ | ---------------------------------------- |
| `AIHUBMIX_API_KEY` | 服务端 AI 调用密钥                       |
| `STUDIO_PASSWORD`  | 测试网页访问密码，production 模式必填    |
| `STUDIO_USER`      | 访问用户名，默认 `admin`                 |
| `NODE_ENV`         | 部署时设置 `production`                  |
| `PORT`             | 监听端口，默认 `4173`                    |
| `HOST`             | 本地默认 `127.0.0.1`，线上默认 `0.0.0.0` |

## AiHubMix 配置与费用

账户需开启**异步/图片任务功能**，否则生图返回 `async_not_enabled`。该 Key 需有识图及生图模型权限，账户需要可用余额。

2026-11-04 核实的标价：

| 用途     | 模型                 | 标价                                    |
| -------- | -------------------- | --------------------------------------- |
| 识图     | `qwen3-vl-plus`      | ≤32K 输入 $0.137/M、输出 $1.37/M tokens |
| 日常换布 | `qwen-image-3.0`     | 输出 $0.02535/张 + 输入 $0.00286/图     |
| 精细换布 | `qwen-image-3.0-pro` | 1K 输出 $0.03572/张 + 输入 $0.00286/图  |

家具、布料、选区参考共三图输入时，日常档约 $0.03393/次，精细档约 $0.04430/次，另计识图及额外文本 token 费用，以实际账单为准。

[图片接口文档](https://docs.aihubmix.com/cn/api/aihubmix-image-generation) · [Qwen Image 3.0](https://aihubmix.com/model/qwen-image-3.0) · [Qwen3 VL Plus](https://aihubmix.com/model/qwen3-vl-plus)

若创建请求超时或中断，先去 AiHubMix 控制台检查已有任务，避免重复付费。刷新页面会丢失图片、方案与当前任务引用，后台密钥不会丢失。

## 验证

```bash
npm run build
npm test
```

已使用真实 AiHubMix 账户验证：识图、异步换布任务、轮询、结果下载、页面展示和左右对比。自动化检查覆盖后台密钥、来源校验、模型白名单、坐标格式兼容、任务结束状态、结果地址限制和不自动重复生成。

## 效果边界

识图选区是近似建议，会漏检、错位或虚构部件，请生成前人工核对。选区图提供语义参考，不能保证未选像素严格不变。AI 可能改变家具细节；实物颜色、花纹比例和质感请以样布为准。

测试素材由 AI 生成，[提示词](public/samples/generation-prompts.md)随仓库提供。

### 深色家具与竖图

家具上传后按原始宽高比缩放，输出沿用相同比例。AI 使用家具原图、目标布料图、黑白选区图三张参考；目标布料平均 sRGB 色辅助约束换色，原布底色不再作为必须保留的光照。生成成功只表示接口返回图片，仍需核对材质、结构和选区。已使用黑色软包床换棕色粗织布的真实图片验证。状态查询遇到临时网络故障可自动重读，生成请求不会自动重新提交。
