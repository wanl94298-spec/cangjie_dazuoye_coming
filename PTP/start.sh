#!/bin/bash
# P2P Image Editor 启动脚本

echo "=== P2P Image Editor ==="
echo ""

# 检查 ComfyUI 是否运行
echo "检查 ComfyUI 状态..."
if curl -s http://127.0.0.1:8188/system_stats > /dev/null 2>&1; then
    echo "✓ ComfyUI 正在运行"
else
    echo "✗ ComfyUI 未运行"
    echo ""
    echo "请先启动 ComfyUI（例如）:"
    echo "  cd /home/Matrix/yz/ComfyUI && ./comfyui-daemon.sh start"
    echo ""
    exit 1
fi

echo ""
echo "启动服务器..."
echo ""

# 启动服务器
node server.js
