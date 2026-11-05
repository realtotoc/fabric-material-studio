# 织间 · AI 家具换材质预览

上传家具照片与目标布料/色卡，智能识别可替换部件，勾选或涂选区域，生成换材质效果。支持沙发、椅子、软床床头等。

原生 Node.js，**无第三方运行依赖、无需前端构建**（仅 Workers 部署使用 Wrangler 开发依赖）。API Key 仅存后端环境变量，前端无需填写密钥。

## 功能

- 家具图与布料图上传，保留照片原始比例，内置 AI 生成的测试素材。
- Qwen3 VL Plus 智能识别部件及建议选区，支持画笔修正、擦除与撤销。
- Nano Banana Pro、Seedream 5.0 Pro 智能图片编辑及 GPT Image 2.5 Flare 蒙版编辑，明确替换原布颜色，支持深色家具换为目标面料色。
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

2026-11-05 核实的标价（以账户实际账单为准）：

| 用途 | 模型 | 标价 |
| --- | --- | --- |
| 识图 | `qwen3-vl-plus` | ≤32K 输入 $0.137/M、输出 $1.37/M tokens |
| 精细换布 | `gemini-3-pro-image` | 输入 $2/M tokens、输出图像 $120/M tokens，文本输出另计 |
| Seedream 换布 | `doubao-seedream-5-0-pro-260628` | ≤2.36MP 输出 $0.0428/张 + 输入 $0.00286/图 |
| 蒙版换布 | `gpt-image-2.5-flare` | medium 图片约 $0.041–0.053/张，另计输入 token |

默认使用 **Nano Banana Pro (`gemini-3-pro-image`)**，2K 分辨率，按最接近原图的受支持比例生成。

- 智能整图编辑：原图和布料两张参考，依据所选部件完整换布，直接展示生成图，避免粗略多边形裁切造成漏色和接缝。保护区域仅作为文字约束，无法保证原图像素不变，仍需核对家具、床板和背景。
- 严格选区合成：增加黑白区域参考，结果仅合成进有效选区，选区外及保护区保留原图像素。边界漏选或生成位移仍会造成残留与拼接，适合手工修正选区后使用。
- Image 2.5 Flare：继续使用原图、布料和透明 PNG 编辑蒙版，并严格按选区合成。输出尺寸按 16 的倍数对齐。

Nano Banana Pro 根据图像和文本 token 计费，页面不承诺固定单张价格。

Seedream 5.0 Pro 使用统一异步图片接口及 **带版本号的模型 ID `doubao-seedream-5-0-pro-260628`**。旧短名称 `doubao-seedream-5.0-pro` 虽然在模型目录中存在，但在统一接口直接调用返回 `model_not_found`；后端将旧客户端的短名称映射到已核对参数定义的版本 ID。旧 `predictions` 协议实测返回 `protocol_not_supported`，不作为自动降级路径。

Seedream 同样支持智能整图/严格选区两种展示方式，输出约 1.5MP，双参考图估价 $0.04852/次，另计识图费用，以实际账单为准。原 Qwen 生图模型 ID 仅保留兼容旧客户端。

结构保留提示词优先锁定拉扣/凹陷数量、逐行排列、非规则间距、每条缝线、拼接分区和床框轮廓，禁止重新打光、规则化拉扣或重做菱形绗缝。便宜识图只提供部件和保护区域，不将其自动推测的拉扣数量或规则网格传给编辑模型；拉扣布局以编辑模型直接观察原图为准。提示词降低结构漂移风险，无法保证逐像素或逐拉扣一致。

[图片接口文档](https://docs.aihubmix.com/cn/api/aihubmix-image-generation) · [Nano Banana Pro](https://aihubmix.com/model/gemini-3-pro-image) · [Seedream 5.0 Pro 版本](https://aihubmix.com/model/doubao-seedream-5-0-pro-260628) · [Image 2.5 Flare](https://aihubmix.com/model/gpt-image-2.5-flare) · [Qwen3 VL Plus](https://aihubmix.com/model/qwen3-vl-plus)

若创建请求超时或中断，先去 AiHubMix 控制台检查已有任务，避免重复付费。刷新页面会丢失图片、方案与当前任务引用，后台密钥不会丢失。

## 验证

```bash
npm run build
npm test
```

已使用真实 AiHubMix 账户验证：识图、异步换布任务、轮询、结果下载、页面展示和左右对比。自动化检查覆盖后台密钥、来源校验、模型白名单、坐标格式兼容、任务结束状态、结果地址限制和不自动重复生成。

## 效果边界

识图选区是近似建议，会漏检、错位或虚构部件，请生成前人工核对。严格模式以选区图提供局部编辑参考，仅合成有效选区并保留其他原图像素；智能整图模式直接展示整张生成图，由模型按部件语义保持非编辑结构。选区边界仍需人工检查，选区内细节仍可能被模型改变。AI 可能改变家具细节；实物颜色、花纹比例和质感请以样布为准。

测试素材由 AI 生成，[提示词](public/samples/generation-prompts.md)随仓库提供。

### 深色家具与竖图

家具上传后按原始宽高比缩放，输出沿用相同比例。AI 使用家具原图、目标布料图和透明编辑蒙版；目标布料平均 sRGB 色辅助约束换色，原布底色不再作为必须保留的光照。生成成功只表示接口返回图片，仍需核对材质、结构和选区。已使用黑色软包床换棕色粗织布的真实图片验证。状态查询遇到临时网络故障可自动重读，生成请求不会自动重新提交。

## 结构保护

识图另外输出可勾选的保护区域，床面承托面按原照片实际观察描述。严格模式的有效编辑选区扣除保护区域，生成后仅将有效选区内的像素合成回原图，因此锁定的床板、金属边框和背景不受生成结果影响。智能模式由模型遵照保护描述，无法保证像素级保持。下载和对比展示使用同一合成结果。保护边界仍需人工核对。

### 结构保留实测（2026-11-05）

同一张蓝色软包床与浅灰布样，用增强后的结构保留提示词分别验证 Nano Banana Pro 和 `doubao-seedream-5-0-pro-260628`，两者均已完成真实异步任务。目测 Nano Banana 本次的长条分区、错位拉扣排列更接近原图；Seedream 本次的拉扣形状变化较明显。样例数量有限，不代表所有家具或每次生成都能保持一致。用户测试照片与生成结果不发布到仓库。
