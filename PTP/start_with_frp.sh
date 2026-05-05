#!/bin/bash
# 启动 P2P 服务和 frpc

echo "=== P2P Image Editor + FRP 启动脚本 ==="
echo ""

# 检查 ComfyUI
echo "[1/3] 检查 ComfyUI..."
if curl -s http://127.0.0.1:8188/system_stats > /dev/null 2>&1; then
    echo "✓ ComfyUI 正在运行"
else
    echo "✗ ComfyUI 未运行"
    echo ""
    echo "请先启动 ComfyUI:"
    echo "  cd /home/Matrix/yz/ComfyUI && ./comfyui-daemon.sh start"
    echo ""
    exit 1
fi

# 先起本机 PtP，再起 frpc（穿透到 127.0.0.1:38024）
echo ""
echo "[2/3] 启动 PtP 服务..."
PTP_DIR="/home/Matrix/yz/PtP-frontend-server"
cd "$PTP_DIR"

if [[ -f "$PTP_DIR/.ptp.pid" ]] && kill -0 "$(cat "$PTP_DIR/.ptp.pid" 2>/dev/null)" 2>/dev/null; then
    echo "✓ PtP 已在运行（$PTP_DIR/.ptp.pid）"
elif pgrep -f "$PTP_DIR/server.js" > /dev/null 2>&1; then
    echo "✓ 已有 node 在跑 $PTP_DIR/server.js"
else
    if [[ -x "$PTP_DIR/ptp-daemon.sh" ]]; then
        "$PTP_DIR/ptp-daemon.sh" start
    else
        echo "✗ 未找到 $PTP_DIR/ptp-daemon.sh，请手动: cd $PTP_DIR && npm start"
        exit 1
    fi
fi

sleep 2
if ! pgrep -f "$PTP_DIR/server.js" > /dev/null 2>&1 && ! { [[ -f "$PTP_DIR/.ptp.pid" ]] && kill -0 "$(cat "$PTP_DIR/.ptp.pid" 2>/dev/null)" 2>/dev/null; }; then
    echo "✗ PtP 未就绪，见 $PTP_DIR/ptp-daemon.log"
    exit 1
fi
echo "✓ PtP 就绪（日志: $PTP_DIR/ptp-daemon.log）"

echo ""
echo "[3/3] 启动 frpc..."
FRP_DIR="/home/Matrix/yz/frp_0.68.1_linux_amd64"

if pgrep -f "frpc -c" > /dev/null; then
    echo "✓ frpc 已在运行"
else
    cd "$FRP_DIR"
    nohup ./frpc -c frpc.toml >>frpc-daemon.log 2>&1 &
    sleep 2
    if pgrep -f "frpc -c" > /dev/null; then
        echo "✓ frpc 启动成功（日志: $FRP_DIR/frpc-daemon.log）"
    else
        echo "✗ frpc 启动失败，见 $FRP_DIR/frpc-daemon.log"
        exit 1
    fi
fi

echo ""
echo "=== 全部服务已后台运行 ==="
