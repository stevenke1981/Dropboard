/**
 * Dropboard — 前端應用程式
 * 拖曳上傳、分類瀏覽、搜尋、編輯、刪除
 */

// ─── 狀態 ────────────────────────────────────────────
const state = {
  currentCategory: 'all',
  searchQuery: '',
  dateFrom: '',
  dateTo: '',
  sortBy: 'uploaded_at',
  sortOrder: 'DESC',
  page: 1,
  totalPages: 1,
};

// ─── DOM 參考 ────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dropzone = $('#dropzone');
const dropzoneInner = $('#dropzoneInner');
const fileInput = $('#fileInput');
const uploadProgress = $('#uploadProgress');
const uploadProgressBar = $('#uploadProgressBar');
const uploadProgressText = $('#uploadProgressText');
const grid = $('#grid');
const resultInfo = $('#resultInfo');
const resultCount = $('#resultCount');
const filterTabs = $('#filterTabs');
const searchInput = $('#searchInput');
const dateFrom = $('#dateFrom');
const dateTo = $('#dateTo');
const sortBy = $('#sortBy');
const sortOrder = $('#sortOrder');
const btnSearch = $('#btnSearch');
const btnFilter = $('#btnFilter');
const btnRefresh = $('#btnRefresh');
const pagination = $('#pagination');
const prevPage = $('#prevPage');
const nextPage = $('#nextPage');
const pageInfo = $('#pageInfo');
const modal = $('#modal');
const statsModal = $('#statsModal');
const modalTitle = $('#modalTitle');
const modalBody = $('#modalBody');
const btnCloseModal = $('#btnCloseModal');
const btnCloseStats = $('#btnCloseStats');
const btnStats = $('#btnStats');
const statsBody = $('#statsBody');
const toastContainer = $('#toastContainer');

// ─── Toast 通知 ──────────────────────────────────────
function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `${icons[type] || ''} ${message}`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── API 呼叫（含 timeout） ──────────────────────────
async function api(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      throw new Error(err.error || 'API 錯誤');
    }
    return resp.json();
  } finally {
    clearTimeout(timeout);
  }
}

// ─── 簡易除錯 ────────────────────────────────────────
function debug(...args) {
  if (window.location.search.includes('debug')) {
    console.log('[Dropboard]', ...args);
  }
}

// ─── 格式化 ──────────────────────────────────────────
function formatSize(bytes) {
  if (bytes === 0 || bytes == null || isNaN(bytes)) return '0 B';
  if (bytes < 0) bytes = 0;
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = dateStr.slice(0, 10);
  return d;
}

function truncate(str, len = 30) {
  return str.length > len ? str.slice(0, len) + '…' : str;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getFileIcon(category) {
  const icons = {
    images: '🖼️',
    screenshots: '🖥️',
    documents: '📄',
    videos: '🎬',
    audio: '🎵',
    archives: '📦',
    other: '📁',
  };
  return icons[category] || '📄';
}

// ─── 載入項目 ────────────────────────────────────────
async function loadItems() {
  try {
    const params = new URLSearchParams({
      page: state.page,
      limit: 48,
      sortBy: state.sortBy,
      sortOrder: state.sortOrder,
    });
    if (state.currentCategory !== 'all') params.set('category', state.currentCategory);
    if (state.searchQuery) params.set('search', state.searchQuery);
    if (state.dateFrom) params.set('dateFrom', state.dateFrom);
    if (state.dateTo) params.set('dateTo', state.dateTo);

    const data = await api(`/api/items?${params}`);
    renderGrid(data);
    return data;
  } catch (err) {
    grid.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>載入失敗：${err.message}</p></div>`;
    resultCount.textContent = '載入失敗';
  }
}

// ─── 渲染網格 ────────────────────────────────────────
function renderGrid(data) {
  const { items, total, page, totalPages } = data;
  state.totalPages = totalPages;
  state.page = page;

  resultCount.textContent = `共 ${total} 個項目`;

  if (total === 0) {
    grid.innerHTML = `<div class="empty-state">
      <div class="icon">📭</div>
      <p>還沒有任何項目</p>
      <p style="font-size:0.9rem;color:var(--text2);margin-top:8px">將檔案拖曳到上方的區域開始</p>
    </div>`;
    pagination.hidden = true;
    return;
  }

  grid.innerHTML = items.map(item => {
    const isImage = item.mime_type.startsWith('image/');
    const safeName = escapeHtml(item.original_name);
    const preview = isImage
      ? `<img class="card-preview" src="${item.url}" alt="${safeName}" loading="lazy" />`
      : `<div class="card-preview doc">${getFileIcon(item.category)}</div>`;

    return `<div class="card" data-id="${item.id}">
      ${preview}
      <div class="card-category-badge">${getFileIcon(item.category)} ${escapeHtml(item.category)}</div>
      <div class="card-info">
        <div class="card-name" title="${safeName}">${safeName}</div>
        <div class="card-meta">
          <span>${formatDate(item.file_date || item.uploaded_at)}</span>
          <span>${formatSize(item.file_size)}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  // 點擊卡片開啟詳情
  $$('.card').forEach(el => {
    el.addEventListener('click', () => openDetail(Number(el.dataset.id)));
  });

  // 分頁
  if (totalPages > 1) {
    pagination.hidden = false;
    pageInfo.textContent = `第 ${page} / ${totalPages} 頁`;
    prevPage.disabled = page <= 1;
    nextPage.disabled = page >= totalPages;
  } else {
    pagination.hidden = true;
  }
}

// ─── 判斷內容類型 ─────────────────────────────────
function isViewableText(item) {
  if (item.mime_type && item.mime_type.startsWith('text/')) return true;
  return /\.(txt|md|markdown|csv|tsv|json|xml|yaml|yml|toml|js|jsx|ts|tsx|mjs|cjs|css|scss|less|html?|sh|bash|zsh|bat|cmd|ps1|py|rb|php|java|c|cpp|h|log|ini|cfg|conf|env|sql|svg|tex|rst)$/i.test(item.original_name);
}
function isPdf(item) {
  return item.mime_type === 'application/pdf';
}
function isVideo(item) {
  return item.mime_type.startsWith('video/') || /\.(mp4|webm|avi|mov|mkv|flv|wmv)$/i.test(item.original_name);
}
function isAudio(item) {
  return item.mime_type.startsWith('audio/') || /\.(mp3|wav|flac|aac|ogg|m4a)$/i.test(item.original_name);
}

// ─── 開啟詳情 Modal ──────────────────────────────────
async function openDetail(id) {
  try {
    const item = await api(`/api/items/${id}`);
    const isImage = item.mime_type.startsWith('image/');
    const isText = isViewableText(item);
    const isPdfFile = isPdf(item);
    const isVideoFile = isVideo(item);
    const isAudioFile = isAudio(item);
    const canViewContent = isImage || isText || isPdfFile || isVideoFile || isAudioFile;

    let previewHtml;
    if (isImage) {
      previewHtml = `<img class="detail-preview" src="${item.url}" alt="${item.original_name}" />`;
    } else if (isVideoFile) {
      previewHtml = `
        <div class="detail-preview video-preview">
          <video controls preload="metadata" style="width:100%;max-height:350px;border-radius:8px;background:#000">
            <source src="${item.url}" type="${escapeHtml(item.mime_type)}">
          </video>
        </div>`;
    } else {
      previewHtml = `<div class="detail-preview doc-preview">${getFileIcon(item.category)}</div>`;
    }

    const safeName = escapeHtml(item.original_name);
    const safeMime = escapeHtml(item.mime_type);
    const safeDesc = escapeHtml(item.description || '');
    const safeTags = escapeHtml(item.tags || '');
    const viewPageUrl = `/view.html?id=${id}`;

    // 內容檢視區（先隱藏，文字/PDF 用）
    let contentViewer = '';
    if (isText) {
      contentViewer = `
        <div class="content-viewer" id="contentViewer" hidden>
          <div class="content-viewer-header">
            <span>📄 文件內容</span>
            <button class="btn btn-sm" onclick="document.getElementById('contentViewer').hidden=true">✕</button>
          </div>
          <pre class="content-viewer-body" id="contentBody"><div class="loading">載入中...</div></pre>
        </div>
      `;
    } else if (isPdfFile) {
      contentViewer = `
        <div class="content-viewer" id="contentViewer" hidden>
          <div class="content-viewer-header">
            <span>📄 PDF 文件</span>
            <button class="btn btn-sm" onclick="document.getElementById('contentViewer').hidden=true">✕</button>
          </div>
          <iframe class="content-viewer-pdf" src="${escapeHtml(item.url)}#view=FitH"></iframe>
        </div>
      `;
    }

    modalBody.innerHTML = `
      ${previewHtml}
      <dl class="detail-info">
        <dt>檔案名稱</dt><dd>${safeName}</dd>
        <dt>類型</dt><dd>${safeMime}</dd>
        <dt>分類</dt><dd id="detailCategory">${getFileIcon(item.category)} ${escapeHtml(item.category)}</dd>
        <dt>大小</dt><dd>${formatSize(item.file_size)}</dd>
        <dt>上傳時間</dt><dd>${escapeHtml(item.uploaded_at)}</dd>
        <dt>檔案日期</dt><dd>${escapeHtml(item.file_date || '-')}</dd>
        ${item.width && item.height ? `<dt>解析度</dt><dd>${item.width} × ${item.height}</dd>` : ''}
      </dl>

      <div class="detail-actions">
        <a class="btn" href="${item.url}" target="_blank">${isImage ? '🔍 檢視原始' : '⬇ 下載'}</a>
        <a class="btn" href="${viewPageUrl}" target="_blank">🔗 在新分頁開啟</a>
        ${canViewContent && (isText || isPdfFile) ? '<button class="btn" id="btnViewContent">📄 檢視內容</button>' : ''}
        ${isImage ? '<button class="btn" id="btnRemoveC2pa">🛡️ 移除 C2PA</button>' : ''}
        <button class="btn btn-danger" id="btnDeleteItem">🗑 刪除</button>
      </div>

      ${contentViewer}

      <div class="detail-edit">
        <h3 style="margin-bottom:12px;font-size:1rem;color:var(--text2)">編輯資訊</h3>
        <label for="editDescription">描述</label>
        <textarea id="editDescription">${safeDesc}</textarea>
        <label for="editTags">標籤（逗號分隔）</label>
        <input type="text" id="editTags" value="${safeTags}" placeholder="例如: 工作, 旅行, 2025" />
        <label for="editCategory">分類</label>
        <select id="editCategory">
          <option value="images" ${item.category === 'images' ? 'selected' : ''}>📷 圖片</option>
          <option value="screenshots" ${item.category === 'screenshots' ? 'selected' : ''}>🖥️ 螢幕截圖</option>
          <option value="documents" ${item.category === 'documents' ? 'selected' : ''}>📄 文件</option>
          <option value="videos" ${item.category === 'videos' ? 'selected' : ''}>🎬 影片</option>
          <option value="audio" ${item.category === 'audio' ? 'selected' : ''}>🎵 音訊</option>
          <option value="archives" ${item.category === 'archives' ? 'selected' : ''}>📦 壓縮檔</option>
          <option value="other" ${item.category === 'other' ? 'selected' : ''}>📁 其他</option>
        </select>
        <button class="btn btn-save" id="btnSaveEdit">💾 儲存變更</button>
      </div>
    `;

    modalTitle.textContent = item.original_name;
    modal.hidden = false;

    // 事件綁定
    document.getElementById('btnDeleteItem').addEventListener('click', () => deleteItem(id));
    document.getElementById('btnSaveEdit').addEventListener('click', () => saveEdit(id));
    
    // 移除 C2PA 按鈕
    const c2paBtn = document.getElementById('btnRemoveC2pa');
    if (c2paBtn) {
      c2paBtn.addEventListener('click', () => removeC2pa(id));
    }

    // 檢視內容按鈕（僅文字/PDF 需要按了才載入）
    const viewBtn = document.getElementById('btnViewContent');
    if (viewBtn) {
      viewBtn.addEventListener('click', async () => {
        const viewer = document.getElementById('contentViewer');
        if (!viewer) return;
        viewer.hidden = false;

        if (isText) {
          const body = document.getElementById('contentBody');
          if (!body) return;
          body.innerHTML = '<div class="loading">載入中...</div>';
          try {
            const resp = await fetch(`/api/items/${id}/content`);
            if (!resp.ok) {
              const err = await resp.json().catch(() => ({ error: resp.statusText }));
              throw new Error(err.error || '載入失敗');
            }
            const text = await resp.text();
            body.textContent = text;
          } catch (err) {
            body.innerHTML = `<span style="color:var(--red)">❌ ${escapeHtml(err.message)}</span>`;
          }
        }
        // PDF 直接用 iframe 顯示（src 已設好）
      });
    }

  } catch (err) {
    showToast(`載入失敗：${err.message}`, 'error');
  }
}

// ─── 移除 C2PA ───────────────────────────────────────
async function removeC2pa(id) {
  const btn = document.getElementById('btnRemoveC2pa');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 處理中...'; }

  try {
    const result = await api(`/api/items/${id}/remove-c2pa`, { method: 'POST' });
    const newItem = result.item;
    showToast(`✅ C2PA 已移除 → ${newItem.original_name}`, 'success', 5000);
    modal.hidden = true;
    loadItems();
  } catch (err) {
    showToast(`❌ C2PA 移除失敗：${err.message}`, 'error', 5000);
    if (btn) { btn.disabled = false; btn.textContent = '🛡️ 移除 C2PA'; }
  }
}

// ─── 刪除項目 ────────────────────────────────────────
async function deleteItem(id) {
  if (!confirm('確定要刪除這個項目嗎？此操作無法復原。')) return;
  try {
    await api(`/api/items/${id}`, { method: 'DELETE' });
    showToast('已刪除', 'success');
    modal.hidden = true;
    loadItems();
  } catch (err) {
    showToast(`刪除失敗：${err.message}`, 'error');
  }
}

// ─── 儲存編輯 ────────────────────────────────────────
async function saveEdit(id) {
  const description = document.getElementById('editDescription').value.trim();
  const tags = document.getElementById('editTags').value.trim();
  const category = document.getElementById('editCategory').value;

  try {
    await api(`/api/items/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, tags, category }),
    });
    showToast('已更新', 'success');
    modal.hidden = true;
    loadItems();
  } catch (err) {
    showToast(`更新失敗：${err.message}`, 'error');
  }
}

// ─── 上傳檔案 ────────────────────────────────────────
async function uploadFiles(files) {
  if (!files || files.length === 0) return;

  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }

  uploadProgress.hidden = false;
  uploadProgressBar.style.width = '0%';
  uploadProgressText.textContent = `正在準備上傳 ${files.length} 個檔案...`;

  try {
    // 使用 XMLHttpRequest 以獲得進度
    const result = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload');

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          uploadProgressBar.style.width = pct + '%';
          uploadProgressText.textContent = `上傳中 ${pct}% (${formatSize(e.loaded)} / ${formatSize(e.total)})`;
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          try {
            reject(new Error(JSON.parse(xhr.responseText).error));
          } catch {
            reject(new Error(`上傳失敗 (${xhr.status})`));
          }
        }
      });

      xhr.addEventListener('error', () => reject(new Error('網路錯誤')));
      xhr.send(formData);
    });

    // 上傳成功
    uploadProgressBar.style.width = '100%';
    uploadProgressText.textContent = `✅ 完成！已上傳 ${result.files.length} 個檔案`;

    const names = result.files.map(f => f.original_name).join(', ');
    showToast(`已上傳 ${result.files.length} 個檔案`, 'success');

    setTimeout(() => {
      uploadProgress.hidden = true;
    }, 1500);

    // 重新載入列表
    loadItems();

  } catch (err) {
    uploadProgressText.textContent = `❌ ${err.message}`;
    showToast(err.message, 'error');
    setTimeout(() => { uploadProgress.hidden = true; }, 3000);
  }
}

// ─── 統計 ────────────────────────────────────────────
async function showStats() {
  try {
    statsModal.hidden = false;
    statsBody.innerHTML = '<div class="loading">載入中...</div>';

    debug('正在載入統計...');
    const stats = await api('/api/stats');
    debug('統計資料已收到', stats);

    const cats = (stats.byCategory || []).map(c =>
      `<tr><td>${getFileIcon(c.category)} ${escapeHtml(c.category)}</td><td>${c.count}</td></tr>`
    ).join('') || '<tr><td colspan="2" style="color:var(--text2)">暫無資料</td></tr>';

    const months = (stats.byMonth || []).map(m =>
      `<tr><td>${escapeHtml(m.month)}</td><td>${m.count}</td></tr>`
    ).join('') || '<tr><td colspan="2" style="color:var(--text2)">暫無資料</td></tr>';

    statsBody.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="num">${stats.total ?? 0}</div>
          <div class="label">總項目數</div>
        </div>
        <div class="stat-card">
          <div class="num">${formatSize(stats.totalBytes ?? 0)}</div>
          <div class="label">總容量</div>
        </div>
      </div>
      <h3 style="margin-top:24px;font-size:1rem;color:var(--text2)">各分類數量</h3>
      <table class="stats-table">
        <thead><tr><th>分類</th><th>數量</th></tr></thead>
        <tbody>${cats}</tbody>
      </table>
      <h3 style="margin-top:16px;font-size:1rem;color:var(--text2)">每月上傳量</h3>
      <table class="stats-table">
        <thead><tr><th>月份</th><th>數量</th></tr></thead>
        <tbody>${months}</tbody>
      </table>
    `;
  } catch (err) {
    debug('統計載入失敗', err);
    if (!statsBody) return;
    statsBody.innerHTML = `
      <p style="color:var(--red);margin-bottom:12px">❌ 載入統計失敗：${escapeHtml(err.message)}</p>
      <button class="btn" onclick="showStats()">🔄 重試</button>
      <button class="btn" onclick="document.getElementById('statsModal').hidden=true" style="margin-left:8px">✕ 關閉</button>
    `;
    // 如果 statsModal 不存在，預設10秒後強制關閉（防止無限卡住）
    setTimeout(() => {
      const el = document.getElementById('statsModal');
      if (el) el.hidden = true;
    }, 30000);
  }
}

// ─── 事件綁定 ────────────────────────────────────────

// 分類標籤
filterTabs.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  $$('.tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  state.currentCategory = tab.dataset.category;
  state.page = 1;
  loadItems();
});

// 搜尋
btnSearch.addEventListener('click', () => {
  state.searchQuery = searchInput.value.trim();
  state.page = 1;
  loadItems();
});
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnSearch.click();
});

// 篩選
btnFilter.addEventListener('click', () => {
  state.dateFrom = dateFrom.value;
  state.dateTo = dateTo.value;
  state.sortBy = sortBy.value;
  state.sortOrder = sortOrder.value;
  state.page = 1;
  loadItems();
});

// 重新整理
btnRefresh.addEventListener('click', () => loadItems());

// 分頁
prevPage.addEventListener('click', () => {
  if (state.page > 1) { state.page--; loadItems(); }
});
nextPage.addEventListener('click', () => {
  if (state.page < state.totalPages) { state.page++; loadItems(); }
});

// 拖曳上傳
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dragover');
});
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  uploadFiles(e.dataTransfer.files);
});

// 點擊選擇檔案
dropzoneInner.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  uploadFiles(fileInput.files);
  fileInput.value = '';
});

// Modal 關閉
btnCloseModal.addEventListener('click', () => { modal.hidden = true; });
modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });

btnCloseStats.addEventListener('click', () => { statsModal.hidden = true; });
statsModal.addEventListener('click', (e) => { if (e.target === statsModal) statsModal.hidden = true; });

// 統計
btnStats.addEventListener('click', showStats);

// ─── 鍵盤快速鍵 ──────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    modal.hidden = true;
    statsModal.hidden = true;
  }
});

// ─── 初始化 ──────────────────────────────────────────
loadItems();
