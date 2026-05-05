# 多GPU并行四宫格模式使用指南

## 功能说明

新增了四宫格并行生成模式，可以同时使用4个GPU并行生成4张图片，然后自动合成2x2的四宫格。

**优势**：
- ⚡ 生成时间与单张相同（并行处理）
- 🎨 一次获得4种变化
- 💰 消耗4倍积分（生成4张图）

## 启动步骤

### 1. 启动多个ComfyUI实例

```bash
cd ~/yz/AI-movie/ai-comic-drama

# 停止现有ComfyUI
pkill -f 'python main.py'

# 启动4个GPU实例
./start_comfyui_multi.sh
```

这会启动4个ComfyUI实例：
- GPU 4 → http://127.0.0.1:8188
- GPU 5 → http://127.0.0.1:8189
- GPU 6 → http://127.0.0.1:8190
- GPU 7 → http://127.0.0.1:8191

### 2. 确认所有实例已启动

```bash
# 检查端口
lsof -i :8188,8189,8190,8191 | grep LISTEN

# 或者查看日志
tail -f ~/comfyui-ai-comic/logs/comfyui_gpu4.log
tail -f ~/comfyui-ai-comic/logs/comfyui_gpu5.log
tail -f ~/comfyui-ai-comic/logs/comfyui_gpu6.log
tail -f ~/comfyui-ai-comic/logs/comfyui_gpu7.log
```

### 3. P2P服务已自动支持

P2P服务器已经更新，会自动检测并使用多个ComfyUI实例。

## 使用方法

### Web界面

1. 访问 https://ptp.matrixlabs.cn
2. 切换到"生成图片"标签
3. 勾选"四宫格模式 (4 GPU并行)"
4. 输入提示词并点击生成

### API调用

```bash
# 四宫格模式
curl -X POST https://ptp.matrixlabs.cn/api/generate-grid \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A beautiful landscape",
    "width": 1024,
    "height": 1024,
    "steps": 4,
    "cfg": 1.0,
    "accessCode": "ptp2025"
  }'

# 返回结果
{
  "success": true,
  "image": "/outputs/grid_xxx.png",        # 四宫格图片 (2048x2048)
  "thumbnail": "/outputs/thumb_grid_xxx.jpg",
  "individual_images": [                    # 4张单独的图片
    "/outputs/xxx1.png",
    "/outputs/xxx2.png",
    "/outputs/xxx3.png",
    "/outputs/xxx4.png"
  ],
  "width": 2048,
  "height": 2048,
  "creditsUsed": 4,
  "creditsRemaining": 999995
}
```

### 单张模式（原有功能）

```bash
# 不勾选四宫格，或使用原API
curl -X POST https://ptp.matrixlabs.cn/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A beautiful landscape",
    "width": 1024,
    "height": 1024,
    "steps": 4,
    "cfg": 1.0,
    "accessCode": "ptp2025"
  }'
```

## 积分消耗

- **单张模式**: 1 积分/张
- **四宫格模式**: 4 积分（生成4张图片）
- **Beta用户**: 免费（无限积分）

## 停止服务

```bash
# 停止所有ComfyUI实例
pkill -f 'python main.py'

# 停止P2P服务
lsof -i :38024 | grep LISTEN | awk '{print $2}' | xargs kill
```

## 故障排查

### 问题1: 四宫格生成失败

**检查**：确保4个ComfyUI实例都在运行
```bash
curl http://127.0.0.1:8188/system_stats
curl http://127.0.0.1:8189/system_stats
curl http://127.0.0.1:8190/system_stats
curl http://127.0.0.1:8191/system_stats
```

### 问题2: 生成速度没有提升

**原因**：可能某些GPU实例没有启动成功

**解决**：查看日志，重启失败的实例
```bash
tail -f ~/comfyui-ai-comic/logs/comfyui_gpu*.log
```

### 问题3: 内存不足

**原因**：4个实例同时运行需要约40GB显存

**解决**：减少并行实例数量，或使用更大显存的GPU

## 性能对比

| 模式 | GPU数量 | 生成时间 | 输出 |
|------|---------|----------|------|
| 单张 | 1 | ~15秒 | 1张 1024x1024 |
| 四宫格 | 4 | ~15秒 | 4张合成 2048x2048 |

**结论**：四宫格模式在相同时间内获得4倍的输出！
