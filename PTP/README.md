# ImageForge Web (PtP-frontend-server)

基于 **ComfyUI** 的图像编辑 / 生成 Web 端（Vanilla JS + Node/Express BFF）。  
浏览器只请求本服务；本服务在服务端转发到 ComfyUI，并返回结果与 SSE 进度。

## 功能

- **编辑图片（I2I）**：上传图片 + 自然语言指令
- **生成图片（T2I）**：提示词 + 尺寸 / steps / CFG（支持 SSE）
- **三种编辑模板**（服务端真实差异，不是“演示提示词”）
  - `img2img_style`：风格化修图（较低步数/像素，速度快）
  - `image_upscale`：高清增强（lanczos 放大 + 更高 megapixels/steps，更耗时/显存）
  - `background_repaint`：背景重绘（提高 CFG + 中等 steps，建议配合背景类提示词）
- **历史记录**：浏览器本地保存成功任务摘要，可离线回看
- **设置面板**：健康检查 / 版本信息
- **页脚备案与法律页**：服务条款 / 隐私政策 / 公安备案跳转

## 运行环境

- Node.js 18+（推荐 20+）
- ComfyUI（默认 `http://127.0.0.1:8188`）
- `npm install` 安装依赖

## 快速开始（本机）

1) 安装依赖

```bash
cd /home/Matrix/yz/PtP-frontend-server
npm install
```

2) 启动 ComfyUI（示例）

```bash
cd /home/Matrix/yz/ComfyUI && ./comfyui-daemon.sh start
```

3) 启动 Web 服务

```bash
npm start
```

4) 访问

- **本机**：`http://localhost:38024`
- **局域网**：`http://10.143.12.75:38024`（以 `server.js` 启动日志输出的 Network 地址为准）

## 公网访问（FRP）

仓库附带了启动脚本，会按顺序检查 ComfyUI → 启 PtP → 启 frpc。

```bash
bash start_with_frp.sh
```

FRP 配置模板参考：`/home/Matrix/yz/frp_0.68.1_linux_amd64/frpc.toml`、`frps.toml`。  
注意：token 等敏感信息请按实际环境管理。

## 关键配置（环境变量）

默认 ComfyUI 与模型名在 `server.js` 里可通过环境变量覆盖（避免不同机器模型文件名不一致导致 400）。

- **ComfyUI 地址**
  - `COMFYUI_URL`（单实例模式时等价于第一个实例；当前默认 `http://127.0.0.1:8188`）
- **模型名**
  - `COMFYUI_UNET_NAME`
  - `COMFYUI_CLIP_NAME`
  - `COMFYUI_VAE_NAME`

示例：

```bash
export COMFYUI_UNET_NAME="xxx.safetensors"
export COMFYUI_CLIP_NAME="split_files/text_encoders/xxx.safetensors"
export COMFYUI_VAE_NAME="xxx.safetensors"
npm start
```

## 工作流模板与预设

模板与预设在 `workflows/` 下维护：

- `workflows/presets.json`：模板清单（`workflowTemplate`）+ 编辑提示词预设
- `workflows/img2img_style.json` / `image_upscale.json` / `background_repaint.json`：模板说明文件（用于服务端选择/合并 patch）
- `workflows/edit_variants.json`：可选覆盖（为空则使用内置 patch）

前端提交编辑请求时可以指定：

- `workflowTemplate=img2img_style | image_upscale | background_repaint`

## 目录结构

```
PtP-frontend-server/
├── server.js
├── package.json
├── start.sh
├── start_with_frp.sh
├── ptp-daemon.sh
├── public/
│   ├── index.html
│   ├── style.css
│   ├── forge.css
│   ├── script.js
│   ├── terms.html
│   ├── privacy.html
│   └── assets/            # 备案图标等静态资源
├── workflows/
│   ├── presets.json
│   ├── img2img_style.json
│   ├── image_upscale.json
│   ├── background_repaint.json
│   └── edit_variants.json
├── uploads/
└── outputs/
```

## API

### POST /api/edit
Edit an image with a text prompt.

Request:
- `image`: Image file (multipart/form-data)
- `prompt`: Edit instructions (text)
- `negativePrompt` (optional): Exclusion hint (text)
- `workflowTemplate` (optional): `img2img_style | image_upscale | background_repaint`

Response:
```json
{
  "success": true,
  "image": "/outputs/xxx.png",
  "prompt": "..."
}
```

### POST /api/edit-stream (Real-time Streaming)
Edit an image with real-time progress updates via Server-Sent Events (SSE).

Request:
- `image`: Image file (multipart/form-data)
- `prompt`: Edit instructions (text)
- `accessCode`: User access code (text)
- `negativePrompt` (optional)
- `workflowTemplate` (optional)

Response: Server-Sent Events stream

Event format:
```
data: {"status": "initializing", "progress": 5, "message": "Uploading image..."}
data: {"status": "preparing", "progress": 15, "message": "Preparing workflow..."}
data: {"status": "queued", "progress": 20, "message": "Workflow submitted..."}
data: {"status": "processing", "progress": 50, "message": "Generating..."}
data: {"status": "downloading", "progress": 90, "message": "Downloading result..."}
data: {"status": "processing", "progress": 95, "message": "Generating thumbnail..."}
data: {"status": "completed", "progress": 100, "result": {...}}
```

Completed result format:
```json
{
  "status": "completed",
  "progress": 100,
  "result": {
    "success": true,
    "image": "/outputs/xxx.png",
    "thumbnail": "/outputs/thumb_xxx.jpg",
    "prompt": "...",
    "creditsUsed": 2,
    "creditsRemaining": 98
  }
}
```

Error format:
```json
{
  "status": "error",
  "error": "Error message"
}
```

### GET /api/health
Check server and ComfyUI status.

Response:
```json
{
  "status": "ok",
  "comfyui": "connected"
}
```

### GET /api/version
获取服务版本与架构提示（设置页会读取）。响应示例：

```json
{
  "name": "imageforge-web",
  "version": "1.0.0",
  "role": "imageforge-web-bff",
  "comfyuiUrl": "http://127.0.0.1:8188",
  "hint": "..."
}
```

### GET /api/presets
返回 `workflows/presets.json` 原文（模板与编辑预设）。

### GET /api/edit-variants
返回服务端内置 patch、别名与可选文件覆盖，用于排查三种编辑模板的真实参数差异。

### POST /api/generate-stream
文生图 SSE（与前端生成页对齐）。请求体为 JSON，核心字段：

- `accessCode`
- `prompt`
- `width` / `height`
- `steps`
- `cfg`
- `gridMode`（可选）

（非 SSE 的 `POST /api/generate` 与 `POST /api/generate-grid` 也保留，用于兼容或调试。）

## 法律与备案（页脚）

页脚与法律页默认已填入：

- 主办单位：北京刻熵科技有限责任公司
- 联系邮箱：24373054@buaa.edu.cn
- 联系地址：北京市海淀区北四环中路238号柏彦大厦F12
- 公安备案：京公网安备11010802046852号（跳转查询页）

如需增加/替换 ICP 备案号，请修改：

- `public/script.js` 中的 `footer.icp`（中英文）
- 或直接改 `public/index.html` 页脚静态文案
