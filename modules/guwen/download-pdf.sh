#!/bin/bash
# 古籍掃描 PDF 下載 (bash/curl 版)
# 從 ctext.org → Internet Archive → EU mirror 下載四庫全書掃描 PDF
#
# 用法:
#   ./download-pdf.sh                    # 下載清單中所有經典
#   ./download-pdf.sh 658                # 只下載指定 res-id
#   ./download-pdf.sh 658 ./自訂目錄      # 指定輸出目錄

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="${2:-"$SCRIPT_DIR/../../古籍-pdf"}"
OUT_DIR="$(realpath -m "$OUT_DIR")"
mkdir -p "$OUT_DIR"

# ===== 經典清單 =====
# res-id|書名|卷數
BOOKS=(
  "658|詩經集傳|4"
  "6670|莊子|5"
  "667|周易窺餘|6"
  "5097|論語注疏|5"
  "595|書經集傳|3"
  "6655|管子|8"
  "598|夢溪筆談|5"
  "3119|群書治要|24"
  "2725|本草求真|10"
  "5659|傷寒論注釋|3"
  "5782|九章算術|3"
)

# ===== 函數 =====

# 從 CText 頁面提取所有 IA 下載 ID
get_ia_ids() {
  local res_id="$1"
  local html
  html=$(curl -sS -A 'Mozilla/5.0' "https://ctext.org/library.pl?if=gb&res=${res_id}")
  # 匹配 archive.org/download/ID.
  echo "$html" | grep -oP 'https?://www\.archive\.org/download/\K[^/\s"<>]+' | sort -u
}

# 下載單個 PDF (先取 302 → EU mirror → curl -L 下載)
download_pdf() {
  local id="$1"
  local dest_path="$2"
  local vol_label="$3"

  # 已存在且 > 100KB 就跳過
  if [[ -f "$dest_path" ]]; then
    local size
    size=$(stat --printf="%s" "$dest_path" 2>/dev/null || echo 0)
    if (( size > 102400 )); then
      local mb
      mb=$(awk "BEGIN {printf \"%.1f\", $size/1048576}")
      echo -e "  ${vol_label}: ⏭️  ${mb} MB (已存在)"
      return 0
    fi
  fi

  # 測試用：直接使用 EU mirror（避免 rate limit）
  # 但是要先知道 EU mirror URL... 我們先抓 redirect
  local redirect_url
  redirect_url=$(curl -sI -A 'Mozilla/5.0' "https://archive.org/download/${id}/${id}.pdf" \
    | grep -i '^location:' | sed 's/^[Ll]ocation: //' | tr -d '\r\n')

  if [[ -z "$redirect_url" ]]; then
    # 沒有 redirect，嘗試直接下載
    redirect_url="https://archive.org/download/${id}/${id}.pdf"
  fi

  echo -n "  ${vol_label}: "
  curl -L -sS -A 'Mozilla/5.0' \
    --retry 3 --retry-delay 10 \
    --max-time 300 \
    -o "$dest_path" \
    "$redirect_url" 2>&1

  # 檢查結果
  if [[ -f "$dest_path" ]]; then
    local size mb
    size=$(stat --printf="%s" "$dest_path")
    mb=$(awk "BEGIN {printf \"%.1f\", $size/1048576}")
    if (( size > 102400 )); then
      echo "  ✅ ${mb} MB"
      return 0
    else
      rm -f "$dest_path"
      echo "  ❌ 檔案太小 (${mb} MB)"
      return 1
    fi
  else
    echo "  ❌ 下載失敗"
    return 1
  fi
}

# ===== 主流程 =====

main() {
  echo "══════════════════════════════════════════════"
  echo "  古籍掃描 PDF 下載 (curl 版)"
  echo "  來源: ctext.org → Internet Archive"
  echo "  輸出: ${OUT_DIR}"
  echo "══════════════════════════════════════════════"
  echo ""

  # 決定要下載哪些
  local res_id="${1:-}"
  local -a selected_books=()
  if [[ -n "$res_id" ]]; then
    # 只找單一 res-id
    local found=0
    for entry in "${BOOKS[@]}"; do
      local eid="${entry%%|*}"
      if [[ "$eid" == "$res_id" ]]; then
        selected_books+=("$entry")
        found=1
        break
      fi
    done
    if (( found == 0 )); then
      selected_books=("${res_id}|res-${res_id}|?")
    fi
  else
    selected_books=("${BOOKS[@]}")
  fi

  local total_volumes=0
  local total_bytes=0

  for entry in "${selected_books[@]}"; do
    local res_id="${entry%%|*}"
    local rest="${entry#*|}"
    local book_name="${rest%%|*}"
    local vol_desc="${rest##*|}"
    local safe_name
    safe_name=$(echo "$book_name" | sed 's|[/\\:]|_|g')

    echo "📖 ${book_name} (res=${res_id}) — ${vol_desc}冊"
    echo "   查詢 CText 頁面..."

    # 抓取 IA ID 列表
    local ids=()
    while IFS= read -r id; do
      ids+=("$id")
    done < <(get_ia_ids "$res_id" 2>/dev/null)

    if (( ${#ids[@]} == 0 )); then
      echo "   ⚠️  未找到下載連結，跳過"
      echo ""
      continue
    fi

    echo "   找到 ${#ids[@]} 卷"

    # 建立書目目錄
    local book_dir="${OUT_DIR}/${safe_name}_${res_id}"
    mkdir -p "$book_dir"

    for i in "${!ids[@]}"; do
      local vol_label
      vol_label=$(printf "%02d" $((i + 1)))
      local id="${ids[$i]}"
      local dest_path="${book_dir}/${vol_label}_${id}.pdf"

      if download_pdf "$id" "$dest_path" "$vol_label"; then
        local size
        size=$(stat --printf="%s" "$dest_path")
        total_bytes=$(( total_bytes + size ))
        total_volumes=$(( total_volumes + 1 ))
      fi

      # 每卷間隔 3 秒
      if (( i < ${#ids[@]} - 1 )); then
        sleep 3
      fi
    done

    # 書目小計
    local book_bytes=0
    for f in "$book_dir"/*.pdf; do
      if [[ -f "$f" ]]; then
        book_bytes=$(( book_bytes + $(stat --printf="%s" "$f") ))
      fi
    done
    local book_mb
    book_mb=$(awk "BEGIN {printf \"%d\", $book_bytes/1048576}")
    echo "   📊 ${book_name}: ${book_mb} MB"
    echo ""
  done

  # 摘要
  local total_gb
  total_gb=$(awk "BEGIN {printf \"%.2f\", $total_bytes/1073741824}")
  echo "══════════════════════════════════════════════"
  echo "✅ 下載完成"
  echo "📚 共 ${total_volumes} 冊"
  echo "💾 ${total_gb} GB"
  echo "══════════════════════════════════════════════"
  echo ""
  echo "💡 單本下載: ./download-pdf.sh <res-id> [目錄]"
}

main "$@"
