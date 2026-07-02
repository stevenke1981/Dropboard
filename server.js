/**
 * Dropboard — LAN 檔案拖曳管理系統
 *
 * 用法: node server.js
 * 然後在瀏覽器開啟 http://<LAN_IP>:3920
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { categorize } = require('./categorize');
const db = require('./db');

// ─── 設定 ────────────────────────────────────────────
const PORT = process.env.PORT || 3920;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

const app = express();

// ─── 確保上傳目錄存在 ────────────────────────────────
const CATEGORY_DIRS = ['images', 'screenshots', 'documents', 'videos', 'audio', 'archives', 'other'];
for (const dir of CATEGORY_DIRS) {
  fs.mkdirSync(path.join(UPLOADS_DIR, dir), { recursive: true });
}

// ─── Multer 設定 ─────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    file.originalname = normalizeFilename(file.originalname);
    const cat = categorize(file.originalname, file.mimetype);
    const dir = path.join(UPLOADS_DIR, cat);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = crypto.randomUUID() + ext;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
});

// ─── Middleware ───────────────────────────────────────
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/ocr', express.static(path.join(__dirname, 'ocr')));

// Express 4.x 不解碼百分號編碼，因此 /古籍 掛載點無法匹配瀏覽器請求
// 改為將 /古籍/* 重導向到 /guwen/*
app.use((req, res, next) => {
  const ENCODED_PREFIX = '/%E5%8F%A4%E7%B1%8D';
  if (req.url.startsWith(ENCODED_PREFIX)) {
    return res.redirect(301, '/guwen' + req.url.slice(ENCODED_PREFIX.length));
  }
  if (req.url.startsWith('/古籍')) {
    return res.redirect(301, '/guwen' + req.url.slice('/古籍'.length));
  }
  next();
});

// 古籍模組：目錄列表、簡繁體轉換、閱讀器
const guwen = require('./modules/guwen');
app.use('/guwen', guwen);

app.use(express.static(path.join(__dirname, 'public')));

// ─── 圖片尺寸讀取（輕量，無外部依賴） ────────────────
function getImageDimensions(filePath, mimeType) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(32);
    fs.readSync(fd, buf, 0, 32, 0);

    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
      // JPEG: 從 SOF marker 讀取
      let offset = 2;
      while (offset < buf.length - 1) {
        if (buf[offset] === 0xFF && buf[offset + 1] === 0xC0) {
          const height = buf.readUInt16BE(offset + 5);
          const width = buf.readUInt16BE(offset + 7);
          fs.closeSync(fd);
          return { width, height };
        }
        offset++;
      }
    } else if (mimeType === 'image/png') {
      // PNG: 寬高在 IHDR chunk
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      fs.closeSync(fd);
      return { width, height };
    } else if (mimeType === 'image/gif') {
      const width = buf.readUInt16LE(6);
      const height = buf.readUInt16LE(8);
      fs.closeSync(fd);
      return { width, height };
    } else if (mimeType === 'image/webp') {
      // WebP: VP8/VP8L/VP8X
      if (buf.toString('ascii', 0, 4) === 'RIFF') {
        const webpType = buf.toString('ascii', 8, 12);
        if (webpType === 'VP8 ' && buf[12] === 0xB0) {
          const width = buf.readUInt16LE(26) & 0x3FFF;
          const height = buf.readUInt16LE(28) & 0x3FFF;
          fs.closeSync(fd);
          return { width: (width & 0xFFFF), height: (height & 0xFFFF) };
        }
        if (webpType === 'VP8L') {
          const bits = buf.readUInt32LE(21);
          const width = (bits & 0x3FFF) + 1;
          const height = ((bits >> 14) & 0x3FFF) + 1;
          fs.closeSync(fd);
          return { width, height };
        }
        if (webpType === 'VP8X') {
          const width = buf.readUInt24LE(24) + 1;
          const height = buf.readUInt24LE(27) + 1;
          fs.closeSync(fd);
          return { width, height };
        }
      }
    } else if (mimeType === 'image/bmp') {
      const width = buf.readUInt32LE(18);
      const height = buf.readUInt32LE(22);
      fs.closeSync(fd);
      return { width, height };
    }

    fs.closeSync(fd);
  } catch (e) {
    // 靜默失敗，不影響上傳流程
  }
  return null;
}

// ─── 檔名編碼修正 ────────────────────────────────────
function normalizeFilename(originalName) {
  try {
    // 1. NFC 正規化（修正 macOS 分解式 Unicode，如「檔案」→「檔」「案」）
    let name = originalName.normalize('NFC');

    // 2. Latin-1 → UTF-8 修正（部分瀏覽器編碼問題）
    //    嘗試將檔名以 Latin-1 解讀再轉為 UTF-8
    if ([...name].some(c => c.charCodeAt(0) > 127)) {
      const asLatin1 = Buffer.from(name, 'latin1').toString('utf-8');
      // 如果轉換後不含替換字元 (U+FFFD) 且與原本不同，採用轉換結果
      if (!asLatin1.includes('\uFFFD') && asLatin1 !== name) {
        // 確認真的有中文字元被正確解碼
        const hasMoreChinese = ([...asLatin1].filter(c => c > '\u4e00' && c < '\u9fff').length >
                                [...name].filter(c => c > '\u4e00' && c < '\u9fff').length);
        if (hasMoreChinese) {
          name = asLatin1;
        }
      }
    }

    return name;
  } catch {
    return originalName;
  }
}

// ─── 支援直接檢視內容的副檔名 ──────────────────────
const VIEWABLE_TEXT_EXTS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.tsv',
  '.json', '.xml', '.yaml', '.yml', '.toml',
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.css', '.scss', '.less', '.html', '.htm',
  '.sh', '.bash', '.zsh', '.bat', '.cmd', '.ps1',
  '.py', '.rb', '.php', '.java', '.c', '.cpp', '.h',
  '.log', '.ini', '.cfg', '.conf', '.env', '.sql',
  '.svg', '.tex', '.rst',
]);

function isViewableText(originalName, mimeType) {
  if (mimeType && mimeType.startsWith('text/')) return true;
  const ext = path.extname(originalName).toLowerCase();
  return VIEWABLE_TEXT_EXTS.has(ext);
}

// ─── API 路由 ────────────────────────────────────────

/**
 * POST /api/upload - 上傳檔案（支援單檔或多檔）
 */
app.post('/api/upload', upload.array('files', 50), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: '沒有收到檔案' });
  }

  const results = [];
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  for (const file of req.files) {
    // 修正檔名編碼
    const originalName = normalizeFilename(file.originalname);
    const cat = categorize(originalName, file.mimetype);
    const fileDate = new Date(file.mtime || Date.now()).toISOString().slice(0, 10);
    const relativePath = path.join(cat, file.filename);

    let dimensions = null;
    if (file.mimetype.startsWith('image/')) {
      dimensions = getImageDimensions(file.path, file.mimetype);
    }

    const item = {
      original_name: originalName,
      stored_name: file.filename,
      file_path: relativePath,
      mime_type: file.mimetype,
      file_size: file.size,
      category: cat,
      width: dimensions ? dimensions.width : null,
      height: dimensions ? dimensions.height : null,
      description: '',
      tags: '',
      uploaded_at: now,
      file_date: fileDate,
    };

    const id = db.insertItem(item);
    results.push({ id, ...item });

    // 更新路徑為可存取的 URL
    item.url = `/uploads/${relativePath}`;
  }

  res.json({ success: true, files: results });
});

/**
 * GET /api/items - 查詢檔案列表
 * Query params: category, search, dateFrom, dateTo, sortBy, sortOrder, page, limit
 */
app.get('/api/items', (req, res) => {
  const result = db.queryItems(req.query);
  // 加上 URL
  result.items = result.items.map(item => ({
    ...item,
    url: `/uploads/${item.file_path}`,
  }));
  res.json(result);
});

/**
 * GET /api/items/:id - 取得單一檔案資訊
 */
app.get('/api/items/:id', (req, res) => {
  const item = db.getItem(Number(req.params.id));
  if (!item) {
    return res.status(404).json({ error: '找不到該項目' });
  }
  item.url = `/uploads/${item.file_path}`;
  res.json(item);
});

/**
 * PUT /api/items/:id - 更新 metadata
 * Body: { description?, tags?, category? }
 */
app.put('/api/items/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = db.getItem(id);
  if (!item) {
    return res.status(404).json({ error: '找不到該項目' });
  }

  // 如果更改分類，需要搬移實體檔案
  const { category } = req.body;
  if (category && category !== item.category) {
    const newPath = path.join(UPLOADS_DIR, category, item.stored_name);
    const oldPath = path.join(UPLOADS_DIR, item.file_path);
    try {
      fs.renameSync(oldPath, newPath);
      req.body.file_path = path.join(category, item.stored_name);
    } catch (e) {
      return res.status(500).json({ error: '搬移檔案失敗: ' + e.message });
    }
  }

  db.updateItem(id, req.body);
  const updated = db.getItem(id);
  updated.url = `/uploads/${updated.file_path}`;
  res.json(updated);
});

/**
 * DELETE /api/items/:id - 刪除檔案
 */
app.delete('/api/items/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = db.getItem(id);
  if (!item) {
    return res.status(404).json({ error: '找不到該項目' });
  }

  // 刪除實體檔案
  const filePath = path.join(UPLOADS_DIR, item.file_path);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (e) {
    return res.status(500).json({ error: '刪除檔案失敗: ' + e.message });
  }

  db.deleteItem(id);
  res.json({ success: true, message: '已刪除' });
});

/**
 * GET /api/stats - 統計資料
 */
app.get('/api/stats', (req, res) => {
  res.json(db.getStats());
});

/**
 * POST /api/items/:id/remove-c2pa - 移除圖檔中的 C2PA 元資料
 * 產生新檔案：原檔名_no_c2pa.副檔名
 */
app.post('/api/items/:id/remove-c2pa', (req, res) => {
  const id = Number(req.params.id);
  const item = db.getItem(id);
  if (!item) {
    return res.status(404).json({ error: '找不到該項目' });
  }

  const ext = path.extname(item.original_name).toLowerCase();
  const allowedExts = ['.jpg', '.jpeg', '.png'];
  if (!allowedExts.includes(ext)) {
    return res.status(400).json({ error: '僅支援 JPEG 和 PNG 格式移除 C2PA' });
  }

  if (!item.mime_type.startsWith('image/')) {
    return res.status(400).json({ error: '僅支援圖片格式' });
  }

  const { stripC2pa } = require('./strip-c2pa');
  const inputPath = path.join(UPLOADS_DIR, item.file_path);

  if (!fs.existsSync(inputPath)) {
    return res.status(404).json({ error: '實體檔案不存在' });
  }

  // 產生新檔名：原主檔名_no_c2pa.副檔名
  const baseName = path.basename(item.original_name, ext);
  const newFileName = baseName + '_no_c2pa' + ext;
  const newStoredName = crypto.randomUUID() + ext;
  const cat = categorize(newFileName, item.mime_type);
  const outputDir = path.join(UPLOADS_DIR, cat);
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, newStoredName);

  const success = stripC2pa(inputPath, outputPath);
  if (!success) {
    return res.status(500).json({ error: 'C2PA 移除失敗，檔案可能已損壞' });
  }

  // 取得檔案尺寸
  const stats = fs.statSync(outputPath);
  let dimensions = null;
  try {
    dimensions = getImageDimensions(outputPath, item.mime_type);
  } catch (e) { /* 忽略 */ }

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const newItem = {
    original_name: newFileName,
    stored_name: newStoredName,
    file_path: path.join(cat, newStoredName),
    mime_type: item.mime_type,
    file_size: stats.size,
    category: cat,
    width: dimensions ? dimensions.width : null,
    height: dimensions ? dimensions.height : null,
    description: item.description || '',
    tags: item.tags || '',
    uploaded_at: now,
    file_date: item.file_date || now.slice(0, 10),
  };

  const newId = db.insertItem(newItem);
  newItem.id = newId;
  newItem.url = `/uploads/${newItem.file_path}`;

  res.json({ success: true, item: newItem });
});

/**
 * GET /api/categories - 分類列表
 */
app.get('/api/categories', (req, res) => {
  const { getCategories, getCategoryLabel } = require('./categorize');
  const cats = getCategories();
  res.json(cats.map(c => ({ key: c, label: getCategoryLabel(c) })));
});

/**
 * GET /api/items/:id/content - 取得檔案內容（供直接檢視）
 * 回傳: 純文字內容 / PDF 內嵌 / 圖片直接顯示
 */
app.get('/api/items/:id/content', (req, res) => {
  const item = db.getItem(Number(req.params.id));
  if (!item) {
    return res.status(404).json({ error: '找不到該項目' });
  }

  const filePath = path.join(UPLOADS_DIR, item.file_path);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '實體檔案不存在' });
  }

  const ext = path.extname(item.original_name).toLowerCase();

  // 純文字檔案 — 直接回傳內容（前端顯示在 <pre> 中）
  if (isViewableText(item.original_name, item.mime_type)) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.sendFile(filePath);
  }

  // PDF — 可內嵌於 <iframe>
  if (item.mime_type === 'application/pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    return res.sendFile(filePath);
  }

  // 圖片 — 直接顯示
  if (item.mime_type.startsWith('image/')) {
    res.setHeader('Content-Type', item.mime_type);
    return res.sendFile(filePath);
  }

  // 其他格式不支援直接檢視
  res.status(415).json({
    error: '此檔案類型不支援直接檢視內容',
    url: `/uploads/${item.file_path}`,
  });
});

// ─── 啟動 ────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }

  console.log('╔═══════════════════════════════════════════╗');
  console.log('║        Dropboard 已啟動 🚀               ║');
  console.log('╠═══════════════════════════════════════════╣');
  console.log(`║  本機:     http://localhost:${PORT}          ║`);
  for (const addr of addresses) {
    console.log(`║  LAN:      http://${addr}:${PORT}            ║`);
  }
  console.log('╠═══════════════════════════════════════════╣');
  console.log('║  將檔案拖曳到網頁即可上傳與自動分類       ║');
  console.log('╚═══════════════════════════════════════════╝');
});

// ─── 優雅關閉 ────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\n正在關閉服務...');
  db.closeDb();
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('\n正在關閉服務...');
  db.closeDb();
  process.exit(0);
});
