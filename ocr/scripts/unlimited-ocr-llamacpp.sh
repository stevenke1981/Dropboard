#!/bin/bash
# Unlimited-OCR via llama.cpp - 快速使用腳本
# 使用方法:
#   ./unlimited-ocr-llamacpp.sh start    啟動伺服器
#   ./unlimited-ocr-llamacpp.sh stop     停止伺服器
#   ./unlimited-ocr-llamacpp.sh status   查看狀態
#   ./unlimited-ocr-llamacpp.sh ocr <圖片路徑>  執行 OCR

LLAMA_DIR="$HOME/llama-cpp"
MODEL="$HOME/models/unlimited-ocr/Unlimited-OCR-Q4_K_M.gguf"
MMPROJ="$HOME/models/unlimited-ocr/mmproj-Unlimited-OCR-F16.gguf"
PORT=8080
LOG="$HOME/llama-server.log"
PIDFILE="/tmp/llama-server.pid"

export LD_LIBRARY_PATH="$LLAMA_DIR:$LD_LIBRARY_PATH"
export PATH="$HOME/.local/bin:$PATH"

start_server() {
    if [ -f "$PIDFILE" ] && kill -0 $(cat "$PIDFILE") 2>/dev/null; then
        echo "⚠️  伺服器已在執行中 (PID $(cat $PIDFILE))"
        return
    fi
    
    echo "🚀 啟動 llama-server..."
    cd "$LLAMA_DIR"
    nohup ./llama-server \
        -m "$MODEL" \
        --mmproj "$MMPROJ" \
        --host 0.0.0.0 \
        --port "$PORT" \
        -c 8192 \
        -t 4 \
        -ngl 0 \
        --no-kv-offload \
        > "$LOG" 2>&1 &
    
    echo $! > "$PIDFILE"
    
    # 等待伺服器就緒
    sleep 5
    for i in $(seq 1 12); do
        if curl -s "http://localhost:$PORT/v1/models" >/dev/null 2>&1; then
            echo "✅ 伺服器已就緒: http://localhost:$PORT"
            echo "📝 PID: $(cat $PIDFILE)"
            return
        fi
        sleep 2
    done
    echo "❌ 伺服器啟動逾時，請檢查 $LOG"
}

stop_server() {
    if [ -f "$PIDFILE" ]; then
        PID=$(cat "$PIDFILE")
        kill "$PID" 2>/dev/null
        rm -f "$PIDFILE"
        echo "⏹️  伺服器已停止 (PID $PID)"
    else
        echo "⚠️  找不到執行中的伺服器"
    fi
}

check_status() {
    if [ -f "$PIDFILE" ] && kill -0 $(cat "$PIDFILE") 2>/dev/null; then
        echo "✅ 伺服器執行中 (PID $(cat $PIDFILE))"
        curl -s "http://localhost:$PORT/v1/models" | python3 -m json.tool 2>/dev/null
    else
        echo "❌ 伺服器未執行"
    fi
}

run_ocr() {
    IMAGE="$1"
    if [ -z "$IMAGE" ]; then
        echo "❌ 請指定圖片路徑"
        echo "   使用方式: $0 ocr <圖片路徑>"
        exit 1
    fi
    if [ ! -f "$IMAGE" ]; then
        echo "❌ 找不到檔案: $IMAGE"
        exit 1
    fi
    
    echo "📄 OCR 處理中: $IMAGE"
    IMG_B64=$(base64 -w0 "$IMAGE")
    
    curl -s "http://localhost:$PORT/v1/chat/completions" \
        -H "Content-Type: application/json" \
        -d '{
            "model": "unlimited-ocr",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "<image>document parsing."},
                        {"type": "image_url", "image_url": {"url": "data:image/png;base64,'"$IMG_B64"'"}}
                    ]
                }
            ],
            "temperature": 0,
            "max_tokens": 4096
        }' | python3 -c "
import sys, json
data = json.load(sys.stdin)
if 'choices' in data:
    print(data['choices'][0]['message']['content'])
elif 'error' in data:
    print('錯誤:', data['error'].get('message', str(data['error'])))
"
}

case "${1:-help}" in
    start)
        start_server
        ;;
    stop)
        stop_server
        ;;
    restart)
        stop_server
        sleep 2
        start_server
        ;;
    status)
        check_status
        ;;
    ocr)
        run_ocr "$2"
        ;;
    help|*)
        echo "Unlimited-OCR + llama.cpp 部署工具"
        echo ""
        echo "用法:"
        echo "  $0 start     啟動 OCR 伺服器"
        echo "  $0 stop      停止伺服器"
        echo "  $0 restart   重新啟動"
        echo "  $0 status    查看狀態"
        echo "  $0 ocr <圖>   對指定圖片執行 OCR"
        echo ""
        echo "範例:"
        echo "  $0 start"
        echo "  $0 ocr ~/document.png"
        echo "  $0 stop"
        ;;
esac
