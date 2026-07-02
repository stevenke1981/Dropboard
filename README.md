# Dropboard

LAN 可存取的拖曳上傳檔案管理系統 — 自動分類、搜尋。

將檔案拖曳到網頁即可上傳，系統會自動依檔案類型分類，並支援全文搜尋。

## 需求

- **Node.js** v18+
- **npm**

## 安裝

```bash
git clone https://github.com/stevenke1981/Dropboard.git
cd Dropboard
npm install
```

## 啟動伺服器

### 基本啟動

```bash
cd ~/Dropboard
node server.js
```

在瀏覽器開啟 http://localhost:3920 即可使用。

按下 `Ctrl+C` 停止伺服器。

### 背景執行（關閉 terminal 也不中斷）

```bash
cd ~/Dropboard
nohup node server.js > server.log 2>&1 &
```

### 開發模式（自動重啟）

```bash
cd ~/Dropboard
node --watch server.js
```

### 查看伺服器狀態

```bash
# 確認 port 3920 有在監聽
ss -tlnp | grep 3920

# 查看執行日誌
cat ~/Dropboard/server.log
```

### 停止伺服器

```bash
# 方式一：直接 kill 程序
pkill -f "node server.js"

# 方式二：先查 PID 再停止
ps aux | grep "node server"
kill <PID>
```

## 存取網址

| 位置 | 網址 |
|------|------|
| 本機 | http://localhost:3920 |
| LAN 其他裝置 | http://<LAN_IP>:3920 |

> LAN IP 預設為 `192.168.80.212`，實際 IP 可能因網路環境不同，請以啟動時顯示的 IP 為準。

## 開機自動啟動（可選）

若希望伺服器在每次開機時自動執行，可使用 **crontab**：

```bash
crontab -e
```

在檔案結尾加入以下行：

```
@reboot cd /home/steven/Dropboard && /home/steven/.local/node/bin/node server.js > /home/steven/Dropboard/server.log 2>&1
```

> 請將 `/home/steven` 替換為你的實際使用者目錄，`/home/steven/.local/node/bin/node` 替換為你的 `node` 實際路徑（可用 `which node` 查詢）。

### systemd 服務（進階）

若系統支援 systemd，也可建立服務檔案：

```bash
sudo tee /etc/systemd/system/dropboard.service > /dev/null << 'EOF'
[Unit]
Description=Dropboard LAN File Manager
After=network.target

[Service]
Type=simple
User=steven
WorkingDirectory=/home/steven/Dropboard
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable dropboard
sudo systemctl start dropboard
```

> systemd 方式需要 `sudo` 權限。

## 防火牆注意事項

若 LAN 其他裝置無法連線，請檢查防火牆是否允許 port **3920**：

```bash
# 如果使用 ufw
sudo ufw allow 3920

# 如果使用 firewalld
sudo firewall-cmd --add-port=3920/tcp --permanent
sudo firewall-cmd --reload
```

## 功能特色

- 拖曳上傳檔案
- 自動依檔案類型分類（圖片、文件、影片、音樂、壓縮檔等）
- 檔案名稱與內容搜尋
- C2PA metadata 自動移除（圖片）
- 檔案下載預覽
- SQLite 資料庫儲存檔案索引
- 最大單檔上傳 500MB

## 技術棧

- **後端**: Node.js + Express
- **資料庫**: better-sqlite3
- **檔案上傳**: multer
- **前端**: 原生 JavaScript + CSS
