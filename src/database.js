import fs from 'node:fs';
import Database from 'better-sqlite3';
import { dataDir, databasePath } from './paths.js';

let db;

export function getDb() {
  if (!db) {
    fs.mkdirSync(dataDir, { recursive: true });
    db = new Database(databasePath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }

  return db;
}

export function initDatabase() {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS api_clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      owner TEXT,
      token_hash TEXT NOT NULL UNIQUE,
      token_preview TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      rate_limit_per_second INTEGER NOT NULL DEFAULT 5,
      cooldown_ms INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      last_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS request_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      client_name TEXT,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      ip TEXT,
      user_agent TEXT,
      message TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (client_id) REFERENCES api_clients(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_api_clients_token_hash ON api_clients(token_hash);
    CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_request_logs_client_id ON request_logs(client_id);
  `);
}
