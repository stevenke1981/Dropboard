#!/usr/bin/env python3
"""
易經 OCR Pipeline
==================
使用 Unlimited-OCR API 逐頁解析古籍掃描本 PDF.

Usage:
    python3 scripts/ocr_pipeline.py <pdf_path> [--output-dir DIR] [--start PAGE] [--end PAGE]

Requires:
    pip install PyMuPDF Pillow requests
"""

import os
import sys
import json
import base64
import time
import argparse
import traceback
from pathlib import Path

# Optional imports with nice error
try:
    import fitz  # PyMuPDF
except ImportError:
    print("❌ Please install PyMuPDF: pip install --user --break-system-packages PyMuPDF")
    sys.exit(1)

try:
    from PIL import Image
except ImportError:
    print("❌ Please install Pillow: pip install --user --break-system-packages Pillow")
    sys.exit(1)

try:
    import requests
except ImportError:
    print("❌ Please install requests: pip install --user --break-system-packages requests")
    sys.exit(1)


# ─── Configuration ───────────────────────────────────────────────────────────
SERVER_URL = "http://localhost:8080"
OCR_MODEL = "unlimited-ocr"
OCR_PROMPT = "<image>document parsing."
MAX_TOKENS = 4096
TEMPERATURE = 0
OCR_DELAY = 1.0  # seconds between OCR requests to avoid overwhelming server


def check_server():
    """Check if the OCR server is running."""
    try:
        r = requests.get(f"{SERVER_URL}/v1/models", timeout=5)
        if r.status_code == 200:
            models = r.json()
            print(f"✅ Server OK – models: {[m['id'] for m in models.get('data', models)][:3]}")
            return True
        else:
            print(f"❌ Server returned {r.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print(f"❌ Cannot connect to server at {SERVER_URL}")
        print("   Make sure llama-server is running:")
        print("   cd ~/unlimited-ocr-llamacpp && bash scripts/server.sh start")
        return False


def pdf_page_count(pdf_path):
    """Get the number of pages in a PDF."""
    doc = fitz.open(pdf_path)
    count = doc.page_count
    doc.close()
    return count


def pdf_page_to_png(pdf_path, page_num, output_dir, dpi=300):
    """
    Convert a single PDF page to PNG image.
    Returns the path to the PNG file.
    """
    doc = fitz.open(pdf_path)
    page = doc[page_num]
    
    # Render at specified DPI
    zoom = dpi / 72  # Default PDF resolution is 72 DPI
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat)
    
    # Save as PNG
    output_path = os.path.join(output_dir, f"page_{page_num+1:04d}.png")
    pix.save(output_path)
    
    doc.close()
    return output_path


def ocr_image(image_path):
    """
    Send an image to Unlimited-OCR API and get the text.
    Returns the OCR text result.
    """
    # Read and encode image
    with open(image_path, "rb") as f:
        img_data = f.read()
    
    # Determine MIME type
    img_b64 = base64.b64encode(img_data).decode("utf-8")
    
    # Detect MIME type
    ext = Path(image_path).suffix.lower()
    mime_map = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".bmp": "image/bmp",
        ".tiff": "image/tiff",
        ".tif": "image/tiff",
    }
    mime = mime_map.get(ext, "image/png")
    
    # API call
    payload = {
        "model": OCR_MODEL,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": OCR_PROMPT},
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{img_b64}"}}
            ]
        }],
        "temperature": TEMPERATURE,
        "max_tokens": MAX_TOKENS,
    }
    
    try:
        r = requests.post(
            f"{SERVER_URL}/v1/chat/completions",
            json=payload,
            timeout=300  # 5 min timeout for OCR
        )
        r.raise_for_status()
        data = r.json()
        
        if "choices" in data and len(data["choices"]) > 0:
            return data["choices"][0]["message"]["content"]
        elif "error" in data:
            return f"[ERROR] {data['error'].get('message', str(data['error']))}"
        else:
            return f"[ERROR] Unexpected response: {json.dumps(data, indent=2)[:500]}"
    except requests.exceptions.Timeout:
        return "[ERROR] Request timed out"
    except requests.exceptions.RequestException as e:
        return f"[ERROR] {str(e)}"


def main():
    parser = argparse.ArgumentParser(
        description="易經 OCR Pipeline - PDF to text via Unlimited-OCR"
    )
    parser.add_argument("pdf_path", help="Path to the PDF file")
    parser.add_argument(
        "--output-dir", "-o",
        default="./ocr_output",
        help="Output directory (default: ./ocr_output)"
    )
    parser.add_argument(
        "--start", "-s",
        type=int,
        default=1,
        help="Start page (1-indexed, default: 1)"
    )
    parser.add_argument(
        "--end", "-e",
        type=int,
        default=None,
        help="End page (1-indexed, default: last page)"
    )
    parser.add_argument(
        "--dpi",
        type=int,
        default=200,
        help="DPI for page rendering (default: 200, lower=faster/smaller)"
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=OCR_DELAY,
        help=f"Delay between OCR calls in seconds (default: {OCR_DELAY})"
    )
    parser.add_argument(
        "--skip-convert",
        action="store_true",
        help="Skip PDF to PNG conversion (use existing PNGs)"
    )
    
    args = parser.parse_args()
    
    pdf_path = args.pdf_path
    output_dir = args.output_dir
    dpi = args.dpi
    ocr_delay = args.delay
    
    # ─── Validate ────────────────────────────────────────────────────────────
    if not os.path.isfile(pdf_path):
        print(f"❌ PDF not found: {pdf_path}")
        sys.exit(1)
    
    if not check_server():
        sys.exit(1)
    
    # Create output directories
    png_dir = os.path.join(output_dir, "png")
    text_dir = os.path.join(output_dir, "text")
    os.makedirs(png_dir, exist_ok=True)
    os.makedirs(text_dir, exist_ok=True)
    
    # ─── Get page count ──────────────────────────────────────────────────────
    total_pages = pdf_page_count(pdf_path)
    print(f"📄 PDF: {pdf_path}")
    print(f"   Total pages: {total_pages}")
    
    start_page = max(1, args.start)
    end_page = min(total_pages, args.end or total_pages)
    print(f"   Processing pages: {start_page} – {end_page} ({end_page - start_page + 1} pages)")
    print()
    
    # ─── Process each page ───────────────────────────────────────────────────
    results = {}
    
    for page_num in range(start_page - 1, end_page):
        page_idx = page_num + 1  # 1-indexed for display
        
        png_path = os.path.join(png_dir, f"page_{page_idx:04d}.png")
        text_path = os.path.join(text_dir, f"page_{page_idx:04d}.txt")
        
        # Skip if text already exists
        if os.path.isfile(text_path) and os.path.getsize(text_path) > 0:
            print(f"⏭️  Page {page_idx}/{end_page} – text already exists, skipping")
            with open(text_path, "r", encoding="utf-8") as f:
                results[page_idx] = f.read()
            continue
        
        # Step 1: Convert PDF page to PNG
        if not args.skip_convert:
            if not os.path.isfile(png_path):
                print(f"🖼️  Page {page_idx}/{end_page} – converting to PNG (dpi={dpi})...", end=" ", flush=True)
                try:
                    png_path = pdf_page_to_png(pdf_path, page_num, png_dir, dpi=dpi)
                    img_size = os.path.getsize(png_path)
                    print(f"OK ({img_size/1024:.0f} KB)")
                except Exception as e:
                    print(f"❌ FAILED: {e}")
                    traceback.print_exc()
                    continue
            else:
                print(f"🖼️  Page {page_idx}/{end_page} – PNG already exists, skipping conversion")
        else:
            if not os.path.isfile(png_path):
                print(f"❌ PNG not found for page {page_idx}: {png_path}")
                print("   Run without --skip-convert first")
                continue
        
        # Step 2: OCR
        print(f"🔍 Page {page_idx}/{end_page} – OCR in progress...", end=" ", flush=True)
        start_time = time.time()
        try:
            text = ocr_image(png_path)
            elapsed = time.time() - start_time
            text_len = len(text)
            print(f"OK ({text_len} chars in {elapsed:.1f}s)")
            
            # Save text
            with open(text_path, "w", encoding="utf-8") as f:
                f.write(text)
            
            results[page_idx] = text
            
            # Small delay
            if ocr_delay > 0 and page_idx < end_page:
                time.sleep(ocr_delay)
        except Exception as e:
            print(f"❌ FAILED: {e}")
            traceback.print_exc()
            continue
        
        # Progress summary every 10 pages
        if page_idx % 10 == 0 or page_idx == end_page:
            done = len([f for f in os.listdir(text_dir) if f.endswith(".txt")])
            print(f"   📊 Progress: {done}/{end_page - start_page + 1} pages done")
    
    print()
    print("=" * 60)
    print(f"✅ OCR Complete!")
    print(f"   Pages processed: {len(results)}")
    print(f"   Text output: {text_dir}")
    print(f"   PNG output: {png_dir}")
    print()
    
    # Generate summary
    total_chars = sum(len(t) for t in results.values())
    print(f"   Total characters: {total_chars}")
    
    if results:
        summary_path = os.path.join(output_dir, "ocr_summary.txt")
        with open(summary_path, "w", encoding="utf-8") as f:
            f.write(f"易經 OCR 結果摘要\n")
            f.write(f"{'='*60}\n")
            f.write(f"PDF: {pdf_path}\n")
            f.write(f"Pages: {start_page}–{end_page}\n")
            f.write(f"Total chars: {total_chars}\n")
            f.write(f"{'='*60}\n\n")
            
            for page_idx in sorted(results.keys()):
                text = results[page_idx]
                preview = text[:200].replace("\n", " ")
                f.write(f"--- Page {page_idx} ---\n")
                f.write(f"{preview}\n")
                if len(text) > 200:
                    f.write(f"... ({len(text) - 200} more chars)\n")
                f.write("\n")
        
        print(f"   Summary: {summary_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
