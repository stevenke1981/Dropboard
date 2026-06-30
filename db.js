/**
 * SQLite 資料庫模組
 * 使用 better-sqlite3 儲存檔案 metadata
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'metadata.db');

let db = null;

/**
 * 取得資料庫實例（singleton）
 */
function getDb() {
  if (!db) {
    // 確保 data 目錄存在
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

/**
 * 初始化資料庫 schema
 */
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      width INTEGER,
      height INTEGER,
      description TEXT DEFAULT '',
      tags TEXT DEFAULT '',
      uploaded_at TEXT NOT NULL,
      file_date TEXT
    )
  `);

  // 常用查詢索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
    CREATE INDEX IF NOT EXISTS idx_items_uploaded_at ON items(uploaded_at);
    CREATE INDEX IF NOT EXISTS idx_items_file_date ON items(file_date);
  `);
}

/**
 * 新增一筆檔案記錄
 */
function insertItem(item) {
  getDb();
  const stmt = db.prepare(`
    INSERT INTO items (original_name, stored_name, file_path, mime_type,
      file_size, category, width, height, description, tags, uploaded_at, file_date)
    VALUES (@original_name, @stored_name, @file_path, @mime_type,
      @file_size, @category, @width, @height, @description, @tags, @uploaded_at, @file_date)
  `);
  const result = stmt.run(item);
  return result.lastInsertRowid;
}

/**
 * 查詢檔案列表（支援篩選、排序、分頁）
 */
function queryItems(filters = {}) {
  getDb();
  const {
    category,
    search,
    dateFrom,
    dateTo,
    sortBy = 'uploaded_at',
    sortOrder = 'DESC',
    page = 1,
    limit = 50,
  } = filters;

  const conditions = [];
  const params = {};

  if (category && category !== 'all') {
    conditions.push('category = @category');
    params.category = category;
  }

  if (search) {
    conditions.push('(original_name LIKE @search OR description LIKE @search2 OR tags LIKE @search3)');
    params.search = `%${search}%`;
    params.search2 = `%${search}%`;
    params.search3 = `%${search}%`;
  }

  if (dateFrom) {
    conditions.push('file_date >= @dateFrom');
    params.dateFrom = dateFrom;
  }

  if (dateTo) {
    conditions.push('file_date <= @dateTo');
    params.dateTo = dateTo;
  }

  const whereClause = conditions.length > 0
    ? 'WHERE ' + conditions.join(' AND ')
    : '';

  // 允許的排序欄位（防止 SQL injection）
  const allowedSortFields = ['uploaded_at', 'file_date', 'original_name', 'file_size', 'category'];
  const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'uploaded_at';
  const safeSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';

  const offset = (page - 1) * limit;

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM items ${whereClause}`);
  const { total } = countStmt.get(params);

  const dataStmt = db.prepare(`
    SELECT * FROM items ${whereClause}
    ORDER BY ${safeSortBy} ${safeSortOrder}
    LIMIT @limit OFFSET @offset
  `);
  const items = dataStmt.all({ ...params, limit, offset });

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * 根據 ID 取得單一項目
 */
function getItem(id) {
  getDb();
  const stmt = db.prepare('SELECT * FROM items WHERE id = ?');
  return stmt.get(id);
}

/**
 * 更新項目 metadata
 */
function updateItem(id, data) {
  getDb();
  const fields = [];
  const params = { id };

  if (data.description !== undefined) {
    fields.push('description = @description');
    params.description = data.description;
  }
  if (data.tags !== undefined) {
    fields.push('tags = @tags');
    params.tags = data.tags;
  }
  if (data.category !== undefined) {
    fields.push('category = @category');
    params.category = data.category;
  }

  if (fields.length === 0) return 0;

  const stmt = db.prepare(`UPDATE items SET ${fields.join(', ')} WHERE id = @id`);
  const result = stmt.run(params);
  return result.changes;
}

/**
 * 刪除項目
 */
function deleteItem(id) {
  getDb();
  const stmt = db.prepare('DELETE FROM items WHERE id = ?');
  const result = stmt.run(id);
  return result.changes;
}

/**
 * 取得統計資料
 */
function getStats() {
  getDb();
  const total = db.prepare('SELECT COUNT(*) as count FROM items').get();
  const byCategory = db.prepare(`
    SELECT category, COUNT(*) as count FROM items GROUP BY category ORDER BY count DESC
  `).all();
  const byMonth = db.prepare(`
    SELECT substr(uploaded_at, 1, 7) as month, COUNT(*) as count
    FROM items GROUP BY month ORDER BY month DESC LIMIT 12
  `).all();
  const totalSize = db.prepare('SELECT COALESCE(SUM(file_size), 0) as total_bytes FROM items').get();

  return {
    total: total.count,
    totalBytes: totalSize.total_bytes,
    byCategory,
    byMonth,
  };
}

/**
 * 關閉資料庫
 */
function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, insertItem, queryItems, getItem, updateItem, deleteItem, getStats, closeDb };
