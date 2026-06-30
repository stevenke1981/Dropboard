/**
 * 自動分類模組
 * 根據檔案名稱與 MIME type 判斷分類
 */
const path = require('path');

const SCREENSHOT_PATTERNS = [
  'screenshot', '截圖', 'screen shot', 'screen_capture',
  'capture', 'snip', 'snapshot', 'スクリーンショット',
  'printscr', 'printscren', 'prtsc',
];

const IMAGE_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.bmp', '.svg', '.tiff', '.tif', '.avif', '.ico',
]);
const IMAGE_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'image/bmp', 'image/svg+xml', 'image/tiff',
  'image/avif', 'image/vnd.microsoft.icon',
]);

const DOCUMENT_EXTS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.ppt', '.pptx', '.txt', '.md', '.csv',
  '.html', '.htm', '.rtf', '.odt', '.ods',
]);
const DOCUMENT_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/markdown', 'text/csv', 'text/html',
  'application/rtf',
]);

const VIDEO_EXTS = new Set([
  '.mp4', '.webm', '.avi', '.mov', '.mkv', '.flv', '.wmv',
]);
const VIDEO_MIMES = new Set([
  'video/mp4', 'video/webm', 'video/avi', 'video/quicktime',
  'video/x-matroska', 'video/x-flv', 'video/x-ms-wmv',
]);

const AUDIO_EXTS = new Set([
  '.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a',
]);
const AUDIO_MIMES = new Set([
  'audio/mpeg', 'audio/wav', 'audio/flac', 'audio/aac',
  'audio/ogg', 'audio/x-ms-wma', 'audio/mp4',
]);

const ARCHIVE_EXTS = new Set([
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz',
]);
const ARCHIVE_MIMES = new Set([
  'application/zip', 'application/x-rar-compressed',
  'application/x-7z-compressed', 'application/gzip',
  'application/x-tar', 'application/x-bzip2',
  'application/x-xz',
]);

/**
 * 判斷是否為螢幕截圖（根據檔名關鍵字）
 */
function isScreenshot(originalName) {
  const name = originalName.toLowerCase().replace(/[_-]/g, ' ');
  return SCREENSHOT_PATTERNS.some(p => name.includes(p));
}

/**
 * 根據原始檔名與 MIME type 回傳分類目錄名稱
 * @param {string} originalName - 原始檔案名稱
 * @param {string} mimeType - MIME type
 * @returns {string} - 分類名稱: images|screenshots|documents|videos|audio|archives|other
 */
function categorize(originalName, mimeType) {
  const ext = path.extname(originalName).toLowerCase();

  // ── 螢幕截圖（優先判斷）──
  if (isScreenshot(originalName)) {
    return 'screenshots';
  }

  // ── 圖片 ──
  if (IMAGE_EXTS.has(ext) || IMAGE_MIMES.has(mimeType)) {
    return 'images';
  }

  // ── 影片 ──
  if (VIDEO_EXTS.has(ext) || VIDEO_MIMES.has(mimeType)) {
    return 'videos';
  }

  // ── 音訊 ──
  if (AUDIO_EXTS.has(ext) || AUDIO_MIMES.has(mimeType)) {
    return 'audio';
  }

  // ── 文件 ──
  if (DOCUMENT_EXTS.has(ext) || DOCUMENT_MIMES.has(mimeType)) {
    return 'documents';
  }

  // ── 壓縮檔 ──
  if (ARCHIVE_EXTS.has(ext) || ARCHIVE_MIMES.has(mimeType)) {
    return 'archives';
  }

  return 'other';
}

/**
 * 取得所有分類名稱（用於前端 dropdown）
 */
function getCategories() {
  return ['images', 'screenshots', 'documents', 'videos', 'audio', 'archives', 'other'];
}

/**
 * 取得分類的中文顯示名稱
 */
function getCategoryLabel(cat) {
  const labels = {
    images: '📷 圖片',
    screenshots: '🖥️ 螢幕截圖',
    documents: '📄 文件',
    videos: '🎬 影片',
    audio: '🎵 音訊',
    archives: '📦 壓縮檔',
    other: '📁 其他',
    all: '📋 全部',
  };
  return labels[cat] || cat;
}

module.exports = { categorize, getCategories, getCategoryLabel };
