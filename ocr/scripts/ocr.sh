#!/bin/bash
# ============================================================================
# Unlimited-OCR + llama.cpp - OCR Execution Script
# ============================================================================
# Usage:
#   ./scripts/ocr.sh <image_path>          OCR a single image
#   ./scripts/ocr.sh --prompt "custom" <img>  Custom prompt
#   ./scripts/ocr.sh --raw <img>           Raw output (no formatting)
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PORT="${PORT:-8080}"
SERVER_URL="http://localhost:$PORT"
PROMPT="<image>document parsing."
MAX_TOKENS=4096
TEMP=0
RAW=false

# ─── Parse args ────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --prompt)
            PROMPT="$2"
            shift 2
            ;;
        --raw)
            RAW=true
            shift
            ;;
        --max-tokens)
            MAX_TOKENS="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [options] <image_path>"
            echo ""
            echo "Options:"
            echo "  --prompt TEXT     Custom prompt (default: '<image>document parsing.')"
            echo "  --raw             Raw JSON output"
            echo "  --max-tokens N    Max tokens (default: 4096)"
            echo "  -h, --help        Show this help"
            exit 0
            ;;
        -*)
            echo "Unknown option: $1"
            exit 1
            ;;
        *)
            IMAGE="$1"
            shift
            ;;
    esac
done

# ─── Validate ──────────────────────────────────────────────────────────────
if [ -z "${IMAGE:-}" ]; then
    echo "❌ Please specify an image path"
    echo "   Usage: $0 [options] <image_path>"
    exit 1
fi

if [ ! -f "$IMAGE" ]; then
    echo "❌ File not found: $IMAGE"
    exit 1
fi

# Check server availability
if ! curl -sf "$SERVER_URL/v1/models" >/dev/null 2>&1; then
    echo "❌ Server not running at $SERVER_URL"
    echo "   Run './scripts/server.sh start' first."
    exit 1
fi

# ─── OCR ────────────────────────────────────────────────────────────────────
echo -e "📄 OCR: $IMAGE" >&2
echo -e "   Prompt: $PROMPT" >&2

# Encode image to base64 (cross-platform)
if command -v base64 >/dev/null 2>&1; then
    IMG_B64=$(base64 -w0 "$IMAGE" 2>/dev/null || base64 -b0 "$IMAGE" 2>/dev/null || base64 "$IMAGE" | tr -d '\n')
else
    IMG_B64=$(python3 -c "import base64; print(base64.b64encode(open('$IMAGE','rb').read()).decode())")
fi

# Detect MIME type
case "$IMAGE" in
    *.png)  MIME="image/png" ;;
    *.jpg|*.jpeg) MIME="image/jpeg" ;;
    *.webp) MIME="image/webp" ;;
    *.gif)  MIME="image/gif" ;;
    *.bmp)  MIME="image/bmp" ;;
    *.tiff|*.tif) MIME="image/tiff" ;;
    *)      MIME="image/png" ;;
esac

# API call
if [ "$RAW" = true ]; then
    curl -s "$SERVER_URL/v1/chat/completions" \
        -H "Content-Type: application/json" \
        -d '{
            "model": "unlimited-ocr",
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": '"$(echo "$PROMPT" | python3 -c 'import sys;print(__import__("json").dumps(sys.stdin.read().strip()))')"'},
                    {"type": "image_url", "image_url": {"url": "data:'"$MIME"';base64,'"$IMG_B64"'"}}
                ]
            }],
            "temperature": '"$TEMP"',
            "max_tokens": '"$MAX_TOKENS"'
        }'
else
    curl -s "$SERVER_URL/v1/chat/completions" \
        -H "Content-Type: application/json" \
        -d '{
            "model": "unlimited-ocr",
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": '"$(echo "$PROMPT" | python3 -c 'import sys;print(__import__("json").dumps(sys.stdin.read().strip()))')"'},
                    {"type": "image_url", "image_url": {"url": "data:'"$MIME"';base64,'"$IMG_B64"'"}}
                ]
            }],
            "temperature": '"$TEMP"',
            "max_tokens": '"$MAX_TOKENS"'
        }' | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'choices' in data:
        print(data['choices'][0]['message']['content'])
    elif 'error' in data:
        print('ERROR:', data['error'].get('message', str(data['error'])))
    else:
        print(json.dumps(data, indent=2))
except Exception as e:
    print('Parse error:', e)
    print(sys.stdin.read())
"
fi
