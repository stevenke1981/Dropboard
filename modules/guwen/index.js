/**
 * 古籍模組 — Chinese Classics Module
 *
 * 提供古籍瀏覽、目錄列表、簡繁體轉換、閱讀器功能。
 * 掛載方式: app.use('/guwen', require('./modules/guwen'));
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const opencc = require('opencc-js');

const router = express.Router();

// ─── 設定 ────────────────────────────────────────────────
const GUWEN_DIR = path.resolve(__dirname, '..', '..', '古籍');
const PUBLIC_DIR = path.join(__dirname, 'public');

// 簡繁體轉換器快取
const converters = {};

function getConverter(from, to) {
  const key = `${from}→${to}`;
  if (!converters[key]) {
    converters[key] = opencc.Converter({ from, to });
  }
  return converters[key];
}

/**
 * 轉換文字：將字串在簡繁之間互轉
 * @param {string} text   - 輸入文字
 * @param {string} toLang - 'tw' (繁體), 'cn' (簡體), 或 'none'
 * @returns {string}
 */
function convertText(text, toLang) {
  if (!text || toLang === 'none') return text;
  if (toLang === 'tw') {
    return getConverter('cn', 'tw')(text);
  }
  if (toLang === 'cn') {
    return getConverter('tw', 'cn')(text);
  }
  return text;
}

// ─── Express 4.x 中文路徑修正 ───────────────────────────
// Express 4.x 不解碼百分號編碼，因此 /古籍 掛載點無法匹配
// 前端 middleware 已經處理了 /古籍/ → /guwen/ 的跳轉
// 此模組只處理 /guwen/ 路徑

// ─── 靜態檔案服務（模組自有優先，再 fallback 到古籍資料）─
router.use(express.static(PUBLIC_DIR));
router.use(express.static(GUWEN_DIR));

// ─── 自動目錄列表（express.static 對目錄回傳 404 的 fallback）──
function serveDirectoryListing(req, res, next) {
  if (req.method !== 'GET') return next();

  const fsPath = path.join(GUWEN_DIR, req.path);
  // req.path 是掛載點後的相對路徑（e.g. /classics/...），
  // req.originalUrl 才是完整請求路徑（e.g. /guwen/classics/...）
  const mountPrefix = req.originalUrl.slice(0, -req.path.length) || '';

  try {
    if (fs.existsSync(fsPath) && fs.statSync(fsPath).isDirectory()) {
      const items = fs.readdirSync(fsPath).filter(x => !x.startsWith('.'));
      // 子目錄優先，再依檔名排序
      items.sort((a, b) => {
        const aIsDir = fs.statSync(path.join(fsPath, a)).isDirectory();
        const bIsDir = fs.statSync(path.join(fsPath, b)).isDirectory();
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.localeCompare(b, 'zh');
      });

      const dirUrl = req.originalUrl.replace(/\/$/, '');

      // 如果目錄內只有一個 text.txt → 導向閱讀器
      if (items.length === 1 && items[0] === 'text.txt') {
        const relPath = req.path.replace(/\/$/, '') + '/text.txt';
        return res.redirect(mountPrefix + '/read?path=' + encodeURIComponent(req.path.replace(/\/$/, '') + '/text.txt'));
      }

      // ─── 產生麵包屑 ──────────────────────────────
      const parts = req.path.replace(/\/$/, '').split('/').filter(Boolean);
      let breadcrumb = '<a href="' + mountPrefix + '/" style="color:#4a9eff;">🏠 古籍</a>';
      let accum = mountPrefix;
      for (const p of parts) {
        accum += '/' + encodeURIComponent(p);
        const isLast = p === parts[parts.length - 1];
        breadcrumb += ' / ' + (isLast
          ? '<span style="color:#aaa;">' + p + '</span>'
          : '<a href="' + accum + '/" style="color:#4a9eff;">' + p + '</a>');
      }

      // ─── 統計資訊 ──────────────────────────────
      let totalSize = 0;
      let fileCount = 0;
      for (const item of items) {
        const itemPath = path.join(fsPath, item);
        if (!fs.statSync(itemPath).isDirectory()) {
          totalSize += fs.statSync(itemPath).size;
          fileCount++;
        }
      }
      const dirCount = items.filter(i =>
        fs.statSync(path.join(fsPath, i)).isDirectory()
      ).length;

      const pageTitle = parts[parts.length - 1] || '古籍';

      // ─── HTML 模板 ──────────────────────────────
      let html = `<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(pageTitle)} — 古籍</title>
<style>
  * { box-sizing:border-box; }
  body { background:#121212; color:#e0e0e0; font-family:system-ui,sans-serif; margin:0; padding:20px 24px; }
  .breadcrumb { margin-bottom:12px; font-size:0.9rem; word-break:break-all; }
  h1 { font-size:1.2rem; margin:0 0 4px 0; font-weight:600; }
  .meta { color:#888; font-size:0.8rem; margin-bottom:12px; }
  .file-list { list-style:none; padding:0; margin:0; }
  .file-list li { padding:5px 8px; border-radius:4px; display:flex; align-items:center; gap:6px; }
  .file-list li:hover { background:#1e1e1e; }
  .file-list a { color:#4a9eff; text-decoration:none; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .file-list a:hover { color:#7bb8ff; }
  .file-list .extra { color:#666; font-size:0.78rem; white-space:nowrap; }
  .file-list .read-link { color:#6a6; font-size:0.78rem; }
  .nav-back { display:inline-block; margin-top:16px; color:#4a9eff; font-size:0.85rem; }
</style></head>
<body>
  <div class="breadcrumb">` + breadcrumb + `</div>
  <h1>` + escapeHtml(pageTitle) + `</h1>
  <div class="meta">` + dirCount + ` 個目錄, ` + fileCount + ` 個檔案` +
    (fileCount > 0 ? ` · ` + formatSize(totalSize) : '') + `</div>
  <ul class="file-list">`;

      for (const item of items) {
        const itemPath = path.join(fsPath, item);
        const isDir = fs.statSync(itemPath).isDirectory();
        const icon = isDir ? '📁' : '📄';
        const encoded = encodeURIComponent(item);
        const entryUrl = dirUrl + '/' + encoded + (isDir ? '/' : '');

        let extra = '';
        if (isDir) {
          const sub = fs.readdirSync(itemPath).filter(x => !x.startsWith('.'));
          extra = '<span class="extra">' + sub.length + ' 項</span>';
          if (sub.includes('text.txt') || fs.existsSync(path.join(itemPath, 'text.txt'))) {
            const readerUrl = mountPrefix + '/read?path=' + encodeURIComponent(req.path.replace(/\/$/, '') + '/' + encoded + '/text.txt');
            extra += ' <a href="' + readerUrl + '" class="read-link">[閱讀]</a>';
          }
        } else {
          const st = fs.statSync(itemPath);
          extra = '<span class="extra">' + formatSize(st.size) + '</span>';
          // 如果是文字檔，也提供閱讀器連結
          if (item.endsWith('.txt') || item.endsWith('.md')) {
            const readerUrl = mountPrefix + '/read?path=' + encodeURIComponent(req.path.replace(/\/$/, '') + '/' + encoded);
            extra += ' <a href="' + readerUrl + '" class="read-link">[閱讀]</a>';
          }
        }

        html += '<li><span>' + icon + '</span><a href="' + entryUrl + '">' + escapeHtml(item) + '</a>' + extra + '</li>';
      }

      const parentParts = parts.slice(0, -1);
      const parentUrl = parentParts.length > 0
        ? mountPrefix + '/' + parentParts.join('/') + '/'
        : mountPrefix + '/';
      html += `</ul>
  <a href="` + parentUrl + `" class="nav-back">← 返回上層</a>
</body></html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    }
  } catch (e) {
    // 非目錄或錯誤 → 繼續到下個中間件
  }
  next();
}

// 工具函式
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

router.use(serveDirectoryListing);

// ─── API: 取得文章內容（支援簡繁體轉換）─────────────
// GET /guwen/api/text?path=/classics/original/lun-yu/xue-er-pian/text.txt&lang=tw
router.get('/api/text', (req, res) => {
  const filePath = req.query.path;
  const toLang = req.query.lang || 'tw'; // 預設繁體

  if (!filePath) {
    return res.status(400).json({ error: '缺少 path 參數' });
  }

  // 安全檢查：防止路徑穿越
  const safePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
  const absPath = path.join(GUWEN_DIR, safePath);

  // 確保在 GUWEN_DIR 底下
  if (!absPath.startsWith(GUWEN_DIR)) {
    return res.status(403).json({ error: '路徑不允許' });
  }

  try {
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
      return res.status(404).json({ error: '檔案不存在' });
    }

    let content = fs.readFileSync(absPath, 'utf-8');

    // 簡繁體轉換
    if (toLang === 'tw') {
      content = convertText(content, 'tw');
    } else if (toLang === 'cn') {
      content = convertText(content, 'cn');
    }

    // 取檔案路徑各層作為 metadata
    const relParts = safePath.split(/[/\\]/).filter(Boolean);
    const fileName = relParts[relParts.length - 1] || '';
    const chapterDir = relParts.length > 1 ? relParts[relParts.length - 2] : '';
    const bookDir = relParts.length > 2 ? relParts[relParts.length - 3] : '';

    res.json({
      path: safePath,
      lang: toLang,
      book: bookDir,
      chapter: chapterDir,
      file: fileName,
      size: fs.statSync(absPath).size,
      content,
    });
  } catch (e) {
    res.status(500).json({ error: '讀取失敗: ' + e.message });
  }
});

// ─── 閱讀器頁面 ────────────────────────────────────────
// GET /guwen/read?path=/classics/original/lun-yu/xue-er-pian/text.txt
router.get('/read', (req, res) => {
  const readerPath = path.join(PUBLIC_DIR, 'reader.html');
  if (fs.existsSync(readerPath)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(readerPath);
  } else {
    res.status(404).send('閱讀器頁面不存在');
  }
});

module.exports = router;
