#!/usr/bin/env bash
# PtP 前端服务后台启动 / 停止 / 状态（默认端口 38024；默认 conda 环境 yz）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PIDFILE="${PTP_PIDFILE:-$ROOT/.ptp.pid}"
LOGFILE="${PTP_LOG:-$ROOT/ptp-daemon.log}"
PORT="${PTP_PORT:-38024}"
LISTEN_URL="${PTP_LISTEN_URL:-http://127.0.0.1:${PORT}}"
# PTP_CONDA_ENV：未设置时默认 yz；显式设为空则不用 conda（使用 PATH 中的 node）
CONDA_ENV_EFFECTIVE="${PTP_CONDA_ENV-yz}"

is_running() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

cmd_start() {
  if [[ -f "$PIDFILE" ]]; then
    local old
    old="$(cat "$PIDFILE" 2>/dev/null || true)"
    if is_running "$old"; then
      echo "PtP 服务已在运行 (PID $old)，访问 ${LISTEN_URL}"
      exit 0
    fi
    rm -f "$PIDFILE"
  fi

  touch "$LOGFILE"
  if [[ -n "${PTP_NODE:-}" ]]; then
    nohup "$PTP_NODE" "$ROOT/server.js" >>"$LOGFILE" 2>&1 &
  elif [[ -n "$CONDA_ENV_EFFECTIVE" ]]; then
    if ! command -v conda >/dev/null 2>&1; then
      echo "错误: 默认使用 conda 环境「${CONDA_ENV_EFFECTIVE}」，但未在 PATH 中找到 conda。" >&2
      echo "请先初始化 conda，或设置 PTP_NODE 为 node 可执行文件，或 PTP_CONDA_ENV= 使用 PATH 中的 node。" >&2
      exit 1
    fi
    nohup conda run --no-capture-output -n "$CONDA_ENV_EFFECTIVE" node "$ROOT/server.js" >>"$LOGFILE" 2>&1 &
  else
    nohup node "$ROOT/server.js" >>"$LOGFILE" 2>&1 &
  fi
  echo $! >"$PIDFILE"
  echo "已后台启动 PtP 服务，PID $(cat "$PIDFILE")"
  if [[ -n "${PTP_NODE:-}" ]]; then
    echo "Node: $PTP_NODE"
  elif [[ -n "$CONDA_ENV_EFFECTIVE" ]]; then
    echo "Conda 环境: $CONDA_ENV_EFFECTIVE (conda run)"
  else
    echo "Node: PATH 中的 node"
  fi
  echo "日志: $LOGFILE"
  echo "地址: ${LISTEN_URL}"
}

cmd_stop() {
  if [[ ! -f "$PIDFILE" ]]; then
    echo "未找到 PID 文件 ($PIDFILE)，可能未通过本脚本启动。"
    exit 1
  fi
  local pid
  pid="$(cat "$PIDFILE" 2>/dev/null || true)"
  if ! is_running "$pid"; then
    echo "PID $pid 未在运行，清理 PID 文件。"
    rm -f "$PIDFILE"
    exit 0
  fi

  echo "正在停止 PtP 服务 (PID $pid)..."
  kill -TERM "$pid" 2>/dev/null || true
  local i=0
  while is_running "$pid" && [[ $i -lt 30 ]]; do
    sleep 1
    i=$((i + 1))
  done
  if is_running "$pid"; then
    echo "优雅退出超时，发送 SIGKILL。"
    kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f "$PIDFILE"
  echo "已停止。"
}

cmd_status() {
  if [[ ! -f "$PIDFILE" ]]; then
    echo "状态: 未运行（无 PID 文件）"
    exit 1
  fi
  local pid
  pid="$(cat "$PIDFILE" 2>/dev/null || true)"
  if is_running "$pid"; then
    echo "状态: 运行中 (PID $pid)"
    echo "地址: ${LISTEN_URL}"
    echo "日志: $LOGFILE"
    if command -v curl >/dev/null 2>&1; then
      if out="$(curl -s -m 2 "${LISTEN_URL}/api/health" 2>/dev/null)" && [[ -n "$out" ]]; then
        echo "健康检查: $out"
      fi
    fi
    exit 0
  fi
  echo "状态: 未运行（PID 文件陈旧，PID $pid 不存在）"
  exit 1
}

cmd_restart() {
  if [[ -f "$PIDFILE" ]]; then
    local pid
    pid="$(cat "$PIDFILE" 2>/dev/null || true)"
    if is_running "$pid"; then
      cmd_stop
    else
      rm -f "$PIDFILE"
    fi
  fi
  cmd_start
}

usage() {
  echo "用法: $0 {start|stop|status|restart}"
  echo ""
  echo "环境变量（可选）:"
  echo "  PTP_PORT         仅用于提示里的 URL，须与 server.js 中 PORT 一致（默认 38024）"
  echo "  PTP_LISTEN_URL   状态/启动提示中的完整地址，默认 http://127.0.0.1:\$PTP_PORT"
  echo "  PTP_CONDA_ENV    未设置时默认 yz（conda run -n）；设为空字符串则不用 conda"
  echo "  PTP_NODE         若设置则优先使用该可执行文件启动 server.js，忽略 conda"
  echo "  PTP_LOG          日志路径，默认 \$ROOT/ptp-daemon.log"
  echo "  PTP_PIDFILE      PID 路径，默认 \$ROOT/.ptp.pid"
}

case "${1:-}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  status)  cmd_status ;;
  restart) cmd_restart ;;
  *)       usage; exit 1 ;;
esac
