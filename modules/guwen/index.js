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

// ─── 首頁（動態產生，支援語言切換）───────────────────
// 載入書名對照表（pinyin → 中文）
const BOOK_NAMES = JSON.parse(fs.readFileSync(path.join(__dirname, 'book_names.json'), 'utf-8'));

router.get('/', (req, res) => {
  const lang = req.query.lang || 'tw'; // tw=繁體, cn=簡體, en=英文
  const GUWEN_PREFIX = '/guwen';

  // UI 文字定義
  const UI = {
    title: { en: 'Chinese Classics Library', cn: '中国古籍文库', tw: '中國古籍文庫' },
    subtitle: { en: '327 Classical Texts · 310K+ Poems · 1.8 GB Total', cn: '327 部典籍 · 31 萬+ 詩詞 · 共 1.8 GB', tw: '327 部典籍 · 31 萬+ 詩詞 · 共 1.8 GB' },
    backBtn: { en: '← Back to Dropboard', cn: '← 返回 Dropboard', tw: '← 返回 Dropboard' },
    keyClassics: { en: '📜 Key Classics — Quick Access', cn: '📜 經典速覽', tw: '📜 經典速覽' },
    classics: { en: '📜 Classics Collection — 327 Works', cn: '📜 典籍大全 — 327 部', tw: '📜 典籍大全 — 327 部' },
    poetry: { en: '🌸 Chinese Poetry', cn: '🌸 中國詩詞', tw: '🌸 中國詩詞' },
    corpus: { en: '🔤 Classical Chinese Corpus', cn: '🔤 文言文語料庫', tw: '🔤 文言文語料庫' },
    browseDir: { en: 'Browse directory →', cn: '瀏覽目錄 →', tw: '瀏覽目錄 →' },
    sourceFrom: { en: 'Source: ', cn: '來源：', tw: '來源：' },
    statTexts: { en: 'Classical Texts', cn: '典籍', tw: '典籍' },
    statPoems: { en: 'Tang & Song Poems', cn: '唐詩宋詞', tw: '唐詩宋詞' },
    statChars: { en: 'Corpus Characters', cn: '語料庫字數', tw: '語料庫字數' },
    statSize: { en: 'Total Size', cn: '總容量', tw: '總容量' },
    navPoetry: { en: '🌸 Poetry', cn: '🌸 詩詞', tw: '🌸 詩詞' },
    navClassics: { en: '📜 Classics', cn: '📜 典籍', tw: '📜 典籍' },
    navCorpus: { en: '🔤 Corpus', cn: '🔤 語料', tw: '🔤 語料' },
  };

  function t(key) { return UI[key][lang] || UI[key].en; }

  // 產生書目 HTML（依語言轉換書名）
  const BOOKS = Object.keys(BOOK_NAMES).sort();
  let bookGridHtml = '';
  for (const name of BOOKS) {
    let cnName = BOOK_NAMES[name];
    const hasChinese = cnName && cnName !== name && /[\u4e00-\u9fff]/.test(cnName);
    if (hasChinese) {
      if (lang === 'tw') cnName = convertText(cnName, 'tw');
      else if (lang === 'cn') cnName = convertText(cnName, 'cn');
    }
    const displayName = hasChinese ? cnName : name;
    const href = GUWEN_PREFIX + '/classics/original/' + encodeURIComponent(name) + '/';
    bookGridHtml += `<a href="${href}" title="${name}">${escapeHtml(displayName)}</a>`;
  }

  // 快速存取
  const QUICK = [
    ['lun-yu', '论语', 'xue-er-pian/text.txt'],
    ['meng-zi', '孟子', 'liang-hui-wang-zhang-ju-shang/text.txt'],
    ['zhong-yong', '中庸', 'text.txt'],
    ['da-xue-zhang-ju-ji-zhu', '大學', 'text.txt'],
    ['shi-jing', '詩經', 'text.txt'],
    ['shang-shu', '尚書', 'shang-shu/text.txt'],
    ['li-ji', '禮記', 'text.txt'],
    ['zuo-zhuan', '左傳', 'text.txt'],
    ['shi-ji', '史記', 'text.txt'],
    ['han-shu', '漢書', 'text.txt'],
    ['san-guo-zhi', '三國志', 'text.txt'],
    ['zi-zhi-tong-jian', '資治通鑑', 'text.txt'],
    ['lao-zi', '老子', 'text.txt'],
    ['zhuang-zi', '莊子', 'text.txt'],
    ['sun-zi-bing-fa', '孫子兵法', 'text.txt'],
    ['mo-zi', '墨子', 'text.txt'],
    ['han-fei-zi', '韓非子', 'text.txt'],
    ['shui-hu-zhuan', '水滸傳', 'text.txt'],
    ['hong-lou-meng', '紅樓夢', 'text.txt'],
    ['san-guo-yan-yi', '三國演義', 'text.txt'],
    ['ben-cao-gang-mu', '本草綱目', 'text.txt'],
  ];
  let quickHtml = '';
  for (const [dir, cnName] of QUICK) {
    const display = lang === 'en' ? cnName + ' / ' + dir : cnName;
    quickHtml += `<a href="${GUWEN_PREFIX}/read?path=/classics/original/${dir}/text.txt" title="${dir}">${escapeHtml(display)}</a>`;
  }

  // 統計
  const totalSize = 1.8;

  const html = `<!DOCTYPE html>
<html lang="${lang === 'tw' ? 'zh-TW' : lang === 'cn' ? 'zh-CN' : 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t('title')} — Dropboard</title>
  <link rel="stylesheet" href="/style.css">
  <style>
    body { background: #121212; color: #e0e0e0; }
    .container { max-width: 960px; margin: 0 auto; padding: 24px; }
    .header-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; gap: 8px; }
    .header-bar h1 { margin: 0; font-size: 1.5rem; }
    .stats-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; }
    .stat-card { background: #1e1e1e; border-radius: 8px; padding: 16px 20px; flex: 1; min-width: 100px; text-align: center; }
    .stat-card .num { font-size: 1.6rem; font-weight: bold; color: #4a9eff; }
    .stat-card .label { font-size: 0.85rem; color: #888; margin-top: 4px; }
    .collection { background: #1e1e1e; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
    .collection h2 { margin: 0 0 8px 0; font-size: 1.15rem; }
    .collection .meta { color: #888; font-size: 0.85rem; margin-bottom: 12px; }
    .book-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 4px; max-height: 400px; overflow-y: auto; }
    .book-grid a { color: #4a9eff; text-decoration: none; font-size: 0.8rem; padding: 4px 6px; border-radius: 3px; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: #2a2a2a; }
    .book-grid a:hover { background: #333; color: #7bb8ff; }
    .nav-back { display: inline-block; margin-bottom: 16px; color: #4a9eff; text-decoration: none; font-size: 0.9rem; }
    .nav-back:hover { text-decoration: underline; }
    .repo-link { color: #888; font-size: 0.8rem; margin-top: 12px; }
    .repo-link a { color: #4a9eff; }
    .btn-group { display: flex; gap: 8px; flex-wrap: wrap; align-items:center; }
    .btn { cursor:pointer; }
    .poetry-list { list-style: none; padding: 0; margin: 0; columns: 2; }
    .poetry-list li { padding: 4px 0; break-inside: avoid; }
    .poetry-list a { color: #4a9eff; text-decoration: none; }
    .poetry-list a:hover { text-decoration: underline; }
    .poetry-list .desc { color: #888; font-size: 0.85rem; }
    .corpus-list { list-style: none; padding: 0; margin: 0; }
    .corpus-list li { padding: 4px 0; }
    .corpus-list a { color: #4a9eff; text-decoration: none; }
    .corpus-list a:hover { text-decoration: underline; }
    .lang-toggle { display:inline-flex; border-radius:4px; overflow:hidden; border:1px solid #4a9eff; font-size:0.8rem; }
    .lang-toggle a { display:inline-block; padding:4px 10px; color:#4a9eff; text-decoration:none; transition:all 0.15s; }
    .lang-toggle a.active { background:#4a9eff; color:#fff; font-weight:600; }
    .lang-toggle a:not(.active):hover { background:#1e2a4a; }
    @media (prefers-color-scheme: light) {
      body { background: #f5f5f5; color: #333; }
      .stat-card { background: #fff; }
      .collection { background: #fff; }
      .book-grid a { background: #eee; }
      .book-grid a:hover { background: #ddd; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-bar">
      <div>
        <a href="/" class="nav-back">${escapeHtml(t('backBtn'))}</a>
        <h1>📚 ${escapeHtml(t('title'))}</h1>
      </div>
      <div class="btn-group">
        <a href="${GUWEN_PREFIX}/poetry/" class="btn btn-sm" style="text-decoration:none">${escapeHtml(t('navPoetry'))}</a>
        <a href="${GUWEN_PREFIX}/classics/original/" class="btn btn-sm" style="text-decoration:none">${escapeHtml(t('navClassics'))}</a>
        <a href="${GUWEN_PREFIX}/corpus/" class="btn btn-sm" style="text-decoration:none">${escapeHtml(t('navCorpus'))}</a>
        <div class="lang-toggle">
          <a href="${GUWEN_PREFIX}/?lang=tw" class="${lang === 'tw' ? 'active' : ''}">繁體</a>
          <a href="${GUWEN_PREFIX}/?lang=cn" class="${lang === 'cn' ? 'active' : ''}">簡體</a>
          <a href="${GUWEN_PREFIX}/?lang=en" class="${lang === 'en' ? 'active' : ''}">EN</a>
        </div>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-row">
      <div class="stat-card"><div class="num">327</div><div class="label">${escapeHtml(t('statTexts'))}</div></div>
      <div class="stat-card"><div class="num">310K+</div><div class="label">${escapeHtml(t('statPoems'))}</div></div>
      <div class="stat-card"><div class="num">17.2M</div><div class="label">${escapeHtml(t('statChars'))}</div></div>
      <div class="stat-card"><div class="num">${totalSize} GB</div><div class="label">${escapeHtml(t('statSize'))}</div></div>
    </div>

    <!-- Quick Access -->
    <div class="collection">
      <h2>${escapeHtml(t('keyClassics'))}</h2>
      <div class="book-grid">${quickHtml}</div>
    </div>

    <!-- Classics: 327 Books -->
    <div class="collection">
      <h2>${escapeHtml(t('classics'))}</h2>
      <div class="meta">${escapeHtml(t('sourceFrom'))}<a href="https://github.com/NiuTrans/Classical-Modern" style="color:#4a9eff;">NiuTrans/Classical-Modern</a></div>
      <div class="book-grid" style="max-height:500px">${bookGridHtml}</div>
      <div class="repo-link"><a href="${GUWEN_PREFIX}/classics/original/">${escapeHtml(t('browseDir'))}</a></div>
    </div>

    <!-- Poetry -->
    <div class="collection">
      <h2>${escapeHtml(t('poetry'))}</h2>
      <div class="meta">${escapeHtml(t('sourceFrom'))}<a href="https://github.com/chinese-poetry/chinese-poetry" style="color:#4a9eff;">chinese-poetry/chinese-poetry</a></div>
      <ul class="poetry-list">
        <li><a href="${GUWEN_PREFIX}/poetry/quan-tang-shi/">📖 Quan Tang Shi</a> <span class="desc">(55,000+)</span></li>
        <li><a href="${GUWEN_PREFIX}/poetry/song-ci/">📖 Song Ci</a> <span class="desc">(21,050)</span></li>
        <li><a href="${GUWEN_PREFIX}/poetry/yuan-qu/">📖 Yuan Qu</a></li>
        <li><a href="${GUWEN_PREFIX}/poetry/shi-jing/">📖 Shi Jing</a></li>
        <li><a href="${GUWEN_PREFIX}/poetry/chu-ci/">📖 Chu Ci</a></li>
      </ul>
    </div>

    <!-- Corpus -->
    <div class="collection">
      <h2>${escapeHtml(t('corpus'))}</h2>
      <div class="meta">${escapeHtml(t('sourceFrom'))}<a href="https://github.com/gujilab/chinese-classical-corpus" style="color:#4a9eff;">gujilab/chinese-classical-corpus</a> · CC0</div>
      <ul class="corpus-list">
        <li><a href="${GUWEN_PREFIX}/corpus/output/">📦 Corpus Data (JSONL)</a></li>
        <li><a href="${GUWEN_PREFIX}/corpus/docs/">📄 Documentation</a></li>
        <li><a href="${GUWEN_PREFIX}/corpus/scripts/">⚙️ Scripts</a></li>
      </ul>
    </div>

    <p style="text-align:center;color:#666;font-size:0.85rem;margin-top:32px">
      <a href="https://github.com/NiuTrans/Classical-Modern" style="color:#4a9eff;">NiuTrans/Classical-Modern</a> ·
      <a href="https://github.com/chinese-poetry/chinese-poetry" style="color:#4a9eff;">chinese-poetry</a> ·
      <a href="https://github.com/gujilab/chinese-classical-corpus" style="color:#4a9eff;">gujilab/chinese-classical-corpus</a>
      <br><a href="/" style="color:#4a9eff;">${escapeHtml(t('backBtn'))}</a>
    </p>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

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
