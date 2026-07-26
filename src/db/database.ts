import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DB_PATH = path.resolve(process.cwd(), 'data', 'mcrp.db');

let db: SqlJsDatabase | null = null;
let SQL: SqlJsStatic | null = null;

function ensureDataDir() {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

let isReloading = false;
export async function reloadDb(): Promise<SqlJsDatabase> {
  if (isReloading) return db as SqlJsDatabase;
  isReloading = true;
  try {
    if (!SQL) SQL = await initSqlJs();
    ensureDataDir();
    
    if (db) {
      try { db.close(); } catch { /* ignore */ }
    }
    
    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }
    
    initializeDb(db);
  } finally {
    isReloading = false;
  }
  return db;
}

export async function getDb(): Promise<SqlJsDatabase> {
  if (db) return db;
  
  ensureDataDir();
  const SQL = await initSqlJs();
  
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  
  initializeDb(db);
  saveDb();
  return db;
}

export function saveDb() {
  if (!db) return;
  ensureDataDir();
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function initializeDb(db: SqlJsDatabase) {
  db.run(`
    -- Discovered accounts (raw leads)
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      platform_id TEXT NOT NULL,
      username TEXT,
      display_name TEXT,
      profile_url TEXT NOT NULL,
      follower_count INTEGER DEFAULT 0,
      video_count INTEGER DEFAULT 0,
      description TEXT,
      
      discovered_at TEXT NOT NULL DEFAULT (datetime('now')),
      discovery_method TEXT,
      discovery_query TEXT,
      
      validation_status TEXT DEFAULT 'pending',
      validation_score REAL DEFAULT 0,
      validation_notes TEXT,
      validated_at TEXT,
      
      submission_status TEXT DEFAULT 'not_submitted',
      submitted_at TEXT,
      
      facebook_page_id TEXT,
      
      UNIQUE(platform, platform_id)
    );
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS video_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      video_id TEXT NOT NULL,
      video_url TEXT NOT NULL,
      title TEXT,
      description TEXT,
      view_count INTEGER DEFAULT 0,
      like_count INTEGER DEFAULT 0,
      comment_count INTEGER DEFAULT 0,
      published_at TEXT,
      duration_seconds INTEGER,
      
      is_valid_clip INTEGER DEFAULT -1,
      detected_title TEXT,
      tmdb_id INTEGER,
      content_type TEXT,
      language TEXT DEFAULT 'unknown',
      confidence REAL DEFAULT 0,
      classification_notes TEXT,
      
      sampled_at TEXT NOT NULL DEFAULT (datetime('now')),
      
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS validation_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      rule_name TEXT NOT NULL,
      passed INTEGER NOT NULL,
      details TEXT,
      checked_at TEXT NOT NULL DEFAULT (datetime('now')),
      
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      UNIQUE(account_id, rule_name)
    );
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS known_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      platform_id TEXT NOT NULL,
      username TEXT,
      checked_at TEXT NOT NULL DEFAULT (datetime('now')),
      
      UNIQUE(platform, platform_id)
    );
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS search_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      query_type TEXT NOT NULL,
      query_text TEXT NOT NULL,
      results_count INTEGER DEFAULT 0,
      searched_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  
  // Create indexes (wrapped in try since they might already exist)
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_accounts_platform ON accounts(platform)',
    'CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(validation_status)',
    'CREATE INDEX IF NOT EXISTS idx_accounts_submission ON accounts(submission_status)',
    'CREATE INDEX IF NOT EXISTS idx_video_samples_account ON video_samples(account_id)',
    'CREATE INDEX IF NOT EXISTS idx_known_submissions_lookup ON known_submissions(platform, platform_id)',
    'CREATE INDEX IF NOT EXISTS idx_search_log_query ON search_log(platform, query_text)',
  ];
  for (const idx of indexes) {
    try { db.run(idx); } catch { /* index might already exist */ }
  }
}

// ============ Account Operations ============

export interface AccountData {
  platform: string;
  platform_id: string;
  username?: string;
  display_name?: string;
  profile_url: string;
  follower_count?: number;
  video_count?: number;
  description?: string;
  discovery_method?: string;
  discovery_query?: string;
  facebook_page_id?: string;
}

export function insertAccount(data: AccountData): number | null {
  if (!db) return null;
  try {
    db.run(
      `INSERT OR IGNORE INTO accounts 
       (platform, platform_id, username, display_name, profile_url, follower_count, video_count, description, discovery_method, discovery_query, facebook_page_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.platform, data.platform_id, data.username || null, data.display_name || null,
        data.profile_url, data.follower_count || 0, data.video_count || 0,
        data.description || null, data.discovery_method || null, data.discovery_query || null,
        data.facebook_page_id || null
      ]
    );
    const result = db.exec('SELECT last_insert_rowid() as id');
    const id = result[0]?.values[0]?.[0] as number;
    saveDb();
    return id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function accountExists(platform: string, platformId: string): boolean {
  if (!db) return false;
  const result = db.exec('SELECT 1 FROM accounts WHERE platform = ? AND platform_id = ?', [platform, platformId]);
  return result.length > 0 && result[0].values.length > 0;
}

export function getAccountsByStatus(status: string, limit: number = 50): any[] {
  if (!db) return [];
  const stmt = db.prepare('SELECT * FROM accounts WHERE validation_status = ? ORDER BY discovered_at DESC LIMIT ?');
  stmt.bind([status, limit]);
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

export function getAllAccounts(limit: number = 500): any[] {
  if (!db) return [];
  const stmt = db.prepare('SELECT * FROM accounts ORDER BY discovered_at DESC LIMIT ?');
  stmt.bind([limit]);
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

export function getApprovedAccounts(limit: number = 200): any[] {
  if (!db) return [];
  const stmt = db.prepare(`
    SELECT * FROM accounts 
    WHERE validation_status = 'passed' AND submission_status = 'not_submitted' 
    ORDER BY validation_score DESC LIMIT ?
  `);
  stmt.bind([limit]);
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

export function updateAccountValidation(accountId: number, status: string, score: number, notes: string) {
  if (!db) return;
  db.run(
    `UPDATE accounts SET validation_status = ?, validation_score = ?, validation_notes = ?, validated_at = datetime('now') WHERE id = ?`,
    [status, score, notes, accountId]
  );
  saveDb();
}

export function markAsSubmitted(accountId: number) {
  if (!db) return;
  db.run(`UPDATE accounts SET submission_status = 'submitted', submitted_at = datetime('now') WHERE id = ?`, [accountId]);
  saveDb();
}

// ============ Video Sample Operations ============

export interface VideoSampleData {
  account_id: number;
  video_id: string;
  video_url: string;
  title?: string;
  description?: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  published_at?: string;
  duration_seconds?: number;
}

export function insertVideoSample(data: VideoSampleData): number | null {
  if (!db) return null;
  try {
    db.run(
      `INSERT OR IGNORE INTO video_samples 
       (account_id, video_id, video_url, title, description, view_count, like_count, comment_count, published_at, duration_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.account_id, data.video_id, data.video_url, data.title || null,
        data.description || null, data.view_count || 0, data.like_count || 0,
        data.comment_count || 0, data.published_at || null, data.duration_seconds || null
      ]
    );
    saveDb();
    const result = db.exec('SELECT last_insert_rowid() as id');
    return (result[0]?.values[0]?.[0] as number) || null;
  } catch {
    return null;
  }
}

export function getVideoSamples(accountId: number): any[] {
  if (!db) return [];
  const stmt = db.prepare('SELECT * FROM video_samples WHERE account_id = ? ORDER BY published_at DESC');
  stmt.bind([accountId]);
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

export function updateVideoClassification(videoId: number, classification: {
  is_valid_clip: number;
  detected_title?: string;
  tmdb_id?: number;
  content_type: string;
  language: string;
  confidence: number;
  classification_notes?: string;
}) {
  if (!db) return;
  db.run(
    `UPDATE video_samples SET 
      is_valid_clip = ?, detected_title = ?, tmdb_id = ?, content_type = ?, 
      language = ?, confidence = ?, classification_notes = ?
    WHERE id = ?`,
    [
      classification.is_valid_clip, classification.detected_title || null,
      classification.tmdb_id || null, classification.content_type,
      classification.language, classification.confidence,
      classification.classification_notes || null, videoId
    ]
  );
  saveDb();
}

// ============ Validation Results ============

export function insertValidationResult(accountId: number, ruleName: string, passed: number, details: string) {
  if (!db) return;
  // Delete existing then insert (since sql.js doesn't support INSERT OR REPLACE well)
  db.run('DELETE FROM validation_results WHERE account_id = ? AND rule_name = ?', [accountId, ruleName]);
  db.run(
    'INSERT INTO validation_results (account_id, rule_name, passed, details) VALUES (?, ?, ?, ?)',
    [accountId, ruleName, passed, details]
  );
  saveDb();
}

export function getValidationResults(accountId: number): any[] {
  if (!db) return [];
  const stmt = db.prepare('SELECT * FROM validation_results WHERE account_id = ?');
  stmt.bind([accountId]);
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// ============ Duplicate / Known Submissions ============

export function isKnownSubmission(platform: string, platformId: string): boolean {
  if (!db) return false;
  const result = db.exec('SELECT 1 FROM known_submissions WHERE platform = ? AND platform_id = ?', [platform, platformId]);
  return result.length > 0 && result[0].values.length > 0;
}

export function addKnownSubmission(platform: string, platformId: string, username?: string) {
  if (!db) return;
  db.run('INSERT OR IGNORE INTO known_submissions (platform, platform_id, username) VALUES (?, ?, ?)', [platform, platformId, username || null]);
  saveDb();
}

// ============ Search Log ============

export function logSearch(platform: string, queryType: string, queryText: string, resultsCount: number) {
  if (!db) return;
  db.run('INSERT INTO search_log (platform, query_type, query_text, results_count) VALUES (?, ?, ?, ?)', [platform, queryType, queryText, resultsCount]);
  saveDb();
}

export function hasSearchedRecently(platform: string, queryText: string, hoursAgo: number = 24): boolean {
  if (!db) return false;
  const result = db.exec(
    `SELECT 1 FROM search_log WHERE platform = ? AND query_text = ? AND searched_at > datetime('now', '-${hoursAgo} hours')`,
    [platform, queryText]
  );
  return result.length > 0 && result[0].values.length > 0;
}

// ============ Stats ============

export function getStats() {
  if (!db) return { total_accounts: 0, pending: 0, passed: 0, failed: 0, review: 0, submitted: 0, ready: 0, duplicates: 0, clean: 0 };
  
  const get = (sql: string): number => {
    const result = db!.exec(sql);
    return (result[0]?.values[0]?.[0] as number) || 0;
  };
  
  return {
    total_accounts: get('SELECT COUNT(*) FROM accounts'),
    pending: get("SELECT COUNT(*) FROM accounts WHERE validation_status = 'pending'"),
    passed: get("SELECT COUNT(*) FROM accounts WHERE validation_status = 'passed'"),
    failed: get("SELECT COUNT(*) FROM accounts WHERE validation_status = 'failed'"),
    review: get("SELECT COUNT(*) FROM accounts WHERE validation_status = 'review'"),
    submitted: get("SELECT COUNT(*) FROM accounts WHERE submission_status = 'submitted'"),
    ready: get("SELECT COUNT(*) FROM accounts WHERE validation_status = 'passed' AND submission_status = 'not_submitted'"),
    duplicates: get("SELECT COUNT(*) FROM accounts WHERE submission_status = 'duplicate'"),
    clean: get("SELECT COUNT(*) FROM accounts WHERE submission_status = 'clean'"),
  };
}

// ============ Clean / Duplicate Queries ============

export function getCleanAccounts(limit: number = 200): any[] {
  if (!db) return [];
  const stmt = db.prepare(`
    SELECT * FROM accounts 
    WHERE validation_status = 'passed' AND submission_status = 'clean' 
    ORDER BY validation_score DESC LIMIT ?
  `);
  stmt.bind([limit]);
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

export function getDuplicateAccounts(limit: number = 200): any[] {
  if (!db) return [];
  const stmt = db.prepare(`
    SELECT * FROM accounts 
    WHERE submission_status = 'duplicate' 
    ORDER BY discovered_at DESC LIMIT ?
  `);
  stmt.bind([limit]);
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

export function closeDb() {
  if (db) {
    saveDb();
    db.close();
    db = null;
  }
}
