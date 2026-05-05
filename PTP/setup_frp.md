# FRP 内网穿透配置指南

## 架构说明

```
公网服务器 (140.143.183.163)
    ↓ frps (服务端)
    ↓ 端口 7000
    ↓
校园网服务器 (10.143.12.80)
    ↓ frpc (客户端)
    ↓ 本地服务
    ├─ SSH: 22 → 公网 6001
    └─ P2P Editor: 38024 → 公网 38024
```

## 1. 公网服务器配置 (140.143.183.163)

### 安装 frps

```bash
# SSH 登录公网服务器
ssh ubuntu@140.143.183.163

# 下载 frp（如果还没有）
cd ~
wget https://github.com/fatedier/frp/releases/download/v0.66.0/frp_0.66.0_linux_amd64.tar.gz
tar -xzf frp_0.66.0_linux_amd64.tar.gz
cd frp_0.66.0_linux_amd64
```

### 配置 frps.toml

将 `frps_config.toml` 的内容复制到公网服务器的 `frps.toml`：

```bash
cat > frps.toml << 'EOF'
bindPort = 7000

auth.method = "token"
auth.token = "yz00190206"

allowPorts = [
  { start = 6000, end = 6100 },
  { start = 38000, end = 38100 }
]

log.to = "./frps.log"
log.level = "info"
log.maxDays = 3

webServer.addr = "0.0.0.0"
webServer.port = 7500
webServer.user = "admin"
webServer.password = "yz00190206"
EOF
```

### 启动 frps

```bash
# 方式1: 前台运行（测试用）
./frps -c frps.toml

# 方式2: 后台运行（推荐）
nohup ./frps -c frps.toml > frps.log 2>&1 &

# 方式3: systemd 服务（最稳定）
sudo tee /etc/systemd/system/frps.service > /dev/null << 'EOF'
[Unit]
Description=FRP Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/frp_0.66.0_linux_amd64
ExecStart=/home/ubuntu/frp_0.66.0_linux_amd64/frps -c /home/ubuntu/frp_0.66.0_linux_amd64/frps.toml
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable frps
sudo systemctl start frps
sudo systemctl status frps
```

### 开放防火墙端口

```bash
# 如果使用 ufw
sudo ufw allow 7000/tcp
sudo ufw allow 6001/tcp
sudo ufw allow 38024/tcp
sudo ufw allow 7500/tcp

# 如果使用 iptables
sudo iptables -A INPUT -p tcp --dport 7000 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 6001 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 38024 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 7500 -j ACCEPT
```

## 2. 校园网服务器配置 (10.143.12.80)

### 启动 frpc

```bash
cd /home/Matrix/yz/frp/frp_0.66.0_linux_amd64

# 方式1: 前台运行（测试用）
./frpc -c frpc.toml

# 方式2: 后台运行（推荐）
nohup ./frpc -c frpc.toml > frpc.log 2>&1 &

# 查看日志
tail -f frpc.log
```

### 启动 P2P 服务

```bash
cd /home/Matrix/yz/AI-movie/p2p-server
bash start.sh
```

## 3. 访问方式

### 本地访问（校园网内）
```
http://10.143.12.80:38024
```

### 公网访问（校外）
```
http://140.143.183.163:38024
```

### FRP 管理界面
```
http://140.143.183.163:7500
用户名: admin
密码: yz00190206
```

## 4. 验证连接

```bash
# 在校园网服务器上检查端口
netstat -tlnp | grep 38024

# 在公网服务器上检查端口
netstat -tlnp | grep 38024

# 测试连接
curl http://140.143.183.163:38024/api/health
```

## 5. 故障排查

### frpc 无法连接
```bash
# 检查 frpc 日志
tail -f /home/Matrix/yz/frp/frp_0.66.0_linux_amd64/frpc.log

# 检查网络连接
ping 140.143.183.163
telnet 140.143.183.163 7000
```

### 公网无法访问
```bash
# 在公网服务器检查 frps 状态
ps aux | grep frps
netstat -tlnp | grep 7000

# 检查防火墙
sudo ufw status
sudo iptables -L -n
```

### P2P 服务无法访问
```bash
# 检查服务是否运行
ps aux | grep node
netstat -tlnp | grep 38024

# 检查 ComfyUI 是否运行
curl http://127.0.0.1:8188/system_stats
```

## 6. 自动启动脚本

### 校园网服务器 - 启动所有服务

创建 `/home/Matrix/yz/AI-movie/start_all.sh`:

```bash
#!/bin/bash
echo "=== 启动所有服务 ==="

# 1. 启动 frpc
echo "启动 frpc..."
cd /home/Matrix/yz/frp/frp_0.66.0_linux_amd64
nohup ./frpc -c frpc.toml > frpc.log 2>&1 &
sleep 2

# 2. 启动 ComfyUI
echo "启动 ComfyUI..."
cd /home/Matrix/yz/AI-movie/ai-comic-drama
bash start_comfyui.sh &
sleep 5

# 3. 启动 P2P 服务
echo "启动 P2P 服务..."
cd /home/Matrix/yz/AI-movie/p2p-server
nohup node server.js > server.log 2>&1 &

echo ""
echo "所有服务已启动！"
echo "本地访问: http://10.143.12.80:38024"
echo "公网访问: http://140.143.183.163:38024"
```

## 7. 安全建议

1. **修改默认密码**: 将 `yz00190206` 改为更强的密码
2. **使用 HTTPS**: 配置 Nginx 反向代理 + SSL 证书
3. **限制访问**: 使用防火墙规则限制特定IP访问
4. **监控日志**: 定期检查 frp 和服务日志

## 8. 性能优化

```toml
# frpc.toml 添加
transport.poolCount = 5
transport.tcpMux = true
transport.tcpMuxKeepaliveInterval = 60
```

## 9. 域名绑定（可选）

如果你有域名，可以配置：

```bash
# 在公网服务器安装 Nginx
sudo apt install nginx

# 配置反向代理
sudo tee /etc/nginx/sites-available/p2p-editor << 'EOF'
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://127.0.0.1:38024;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/p2p-editor /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```
