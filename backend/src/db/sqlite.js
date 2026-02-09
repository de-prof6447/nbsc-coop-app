// backend/src/db/sqlite.js
import sqlite3 from "sqlite3";
import fs from "fs";
import path from "path";

sqlite3.verbose();

// Use DB_FILE (recommended) or fallback to DB_PATH, else default
const dbFile = process.env.DB_FILE || process.env.DB_PATH || "./data/nbsc.sqlite";

// Always resolve relative path from project root (process cwd)
const resolvedDbFile = path.isAbsolute(dbFile) ? dbFile : path.resolve(process.cwd(), dbFile);

// Ensure directory exists
const dir = path.dirname(resolvedDbFile);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

export function getDb() {
  const db = new sqlite3.Database(resolvedDbFile);

  // Setup once per connection
  db.serialize(() => {
    db.run("PRAGMA foreign_keys = ON;");
    db.run("PRAGMA journal_mode = WAL;");
    db.run("PRAGMA synchronous = NORMAL;");

    // MEMBERS table
    db.run(`
      CREATE TABLE IF NOT EXISTS members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sap_no TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        phone_no TEXT,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        force_password_change INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_members_sap_no ON members (sap_no);`);

    // RECORDS table (this is what your app queries)
    db.run(`
      CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sap_no TEXT NOT NULL,
        date TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        remark TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (sap_no) REFERENCES members(sap_no) ON DELETE CASCADE
      );
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_records_sap_date ON records (sap_no, date);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_records_desc ON records (description);`);

    // Lightweight column migration example (optional safety)
    db.all("PRAGMA table_info(members);", (err, cols) => {
      if (err || !Array.isArray(cols)) return;

      const hasForce = cols.some((c) => c?.name === "force_password_change");
      if (!hasForce) {
        db.run("ALTER TABLE members ADD COLUMN force_password_change INTEGER NOT NULL DEFAULT 0;");
      }
    });
  });

  return db;
}

export function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

export function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

export function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}
