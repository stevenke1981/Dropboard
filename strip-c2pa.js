/**
 * C2PA 元資料剝離工具
 *
 * 移除 JPEG 中的 C2PA APP11 marker 和 PNG 中的 c2pa chunk
 * 保留其他 EXIF/元資料不變
 */

const fs = require('fs');
const path = require('path');

// ─── JPEG C2PA 標記 ─────────────────────────────────
// C2PA 在 JPEG 中儲存在 APP11 marker (0xFF 0xEB)
// 資料開頭為 "C2PA\0" 簽名
const JPEG_APP11 = 0xEB;        // APP11 marker
const JPEG_MARKER = 0xFF;
const C2PA_SIG = Buffer.from('C2PA', 'ascii');

/**
 * 從 JPEG buffer 中移除 C2PA APP11 marker 區段
 */
function stripJpegC2pa(buf) {
  const result = [];
  let offset = 0;

  // JPEG 開頭必須是 SOI (0xFF 0xD8)
  if (buf.length < 2 || buf[0] !== 0xFF || buf[1] !== 0xD8) {
    return null; // 不是有效的 JPEG
  }

  result.push(buf.slice(0, 2)); // SOI
  offset = 2;

  while (offset < buf.length) {
    // 找下一個 marker
    if (buf[offset] !== JPEG_MARKER) {
      // 不是有效的 JPEG 結構，直接複製剩餘資料
      result.push(buf.slice(offset));
      break;
    }

    const marker = buf[offset + 1];
    
    // SOS (Start of Scan) — 之後是壓縮資料，不再有 marker
    if (marker === 0xDA) {
      result.push(buf.slice(offset));
      break;
    }

    // EOI (End of Image)
    if (marker === 0xD9) {
      result.push(buf.slice(offset));
      break;
    }

    // 其他 marker: 讀取長度（大部分 marker 有長度欄位）
    if (marker === 0x01 || marker === 0xD0 || marker === 0xD1 || 
        marker === 0xD2 || marker === 0xD3 || marker === 0xD4 ||
        marker === 0xD5 || marker === 0xD6 || marker === 0xD7 ||
        marker === 0xD8) {
      // 無長度欄位的 marker
      result.push(buf.slice(offset, offset + 2));
      offset += 2;
      continue;
    }

    if (offset + 4 > buf.length) {
      result.push(buf.slice(offset));
      break;
    }

    const segLen = buf.readUInt16BE(offset + 2);
    const segEnd = offset + 2 + segLen;

    if (segEnd > buf.length) {
      result.push(buf.slice(offset));
      break;
    }

    // 檢查是否為 APP11 且包含 C2PA 簽名
    if (marker === JPEG_APP11) {
      // APP11: FF EB [2-byte length] [data...]
      // 檢查資料是否以 C2PA 簽名開頭
      const dataStart = offset + 4; // marker(2) + length(2)
      const dataLen = segLen - 2;   // length includes itself
      
      if (dataLen >= 4 && buf.slice(dataStart, dataStart + 4).equals(C2PA_SIG)) {
        // 這是 C2PA 區段，跳過不複製
        offset = segEnd;
        continue;
      }
    }

    // 非 C2PA 區段，保留
    result.push(buf.slice(offset, segEnd));
    offset = segEnd;
  }

  return Buffer.concat(result);
}

// ─── PNG C2PA chunk ──────────────────────────────────
// C2PA 在 PNG 中儲存在 "c2pa" tEXt chunk 中
const C2PA_CHUNK_TYPE = Buffer.from('c2pa', 'ascii');
const PNG_IHDR = Buffer.from('IHDR', 'ascii');
const PNG_IEND = Buffer.from('IEND', 'ascii');

/**
 * 從 PNG buffer 中移除 "c2pa" chunk
 */
function stripPngC2pa(buf) {
  // PNG 簽名: 89 50 4E 47 0D 0A 1A 0A
  if (buf.length < 8) return null;
  const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buf.slice(0, 8).equals(pngSig)) return null;

  const result = [buf.slice(0, 8)]; // PNG signature
  let offset = 8;

  while (offset + 12 <= buf.length) {
    const chunkLen = buf.readUInt32BE(offset);
    const chunkType = buf.slice(offset + 4, offset + 8);
    const chunkEnd = offset + 12 + chunkLen; // length(4) + type(4) + data + crc(4)

    if (chunkEnd > buf.length) {
      // 損壞的 PNG，複製剩餘
      result.push(buf.slice(offset));
      break;
    }

    // 跳到 IEND 就全部保留（已無後續 chunk）
    if (chunkType.equals(PNG_IEND)) {
      result.push(buf.slice(offset));
      break;
    }

    // 跳過 "c2pa" chunk
    if (chunkType.equals(C2PA_CHUNK_TYPE)) {
      offset = chunkEnd;
      continue;
    }

    result.push(buf.slice(offset, chunkEnd));
    offset = chunkEnd;
  }

  return Buffer.concat(result);
}

// ─── WebP C2PA ──────────────────────────────────────
// C2PA in WebP is stored in the EXIF chunk.
// Removing the entire EXIF chunk is the safest approach.
// WebP 中的 C2PA 儲存在 EXIF chunk 中，較難精準定位。
// 這裡留空 — 使用者如有 WebP C2PA 需求可再擴充
// 目前 JPEG/PNG 涵蓋 99% 的 C2PA 使用場景

// ─── 主函數 ──────────────────────────────────────────
/**
 * 移除圖檔中的 C2PA 元資料
 * @param {string} inputPath - 原始檔案路徑
 * @param {string} outputPath - 輸出檔案路徑
 * @returns {boolean} 是否成功
 */
function stripC2pa(inputPath, outputPath) {
  const ext = path.extname(inputPath).toLowerCase();
  
  let buf;
  try {
    buf = fs.readFileSync(inputPath);
  } catch (e) {
    return false;
  }

  let cleaned = null;

  if (ext === '.jpg' || ext === '.jpeg') {
    cleaned = stripJpegC2pa(buf);
  } else if (ext === '.png') {
    cleaned = stripPngC2pa(buf);
  } else {
    // 不支援的格式，直接複製（不做任何處理）
    cleaned = buf;
  }

  if (!cleaned) {
    return false;
  }

  try {
    fs.writeFileSync(outputPath, cleaned);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { stripC2pa, stripJpegC2pa, stripPngC2pa };
