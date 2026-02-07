import sqlite3 from "sqlite3";
import fs from "fs";
import path from "path";

const dbFile = process.env.DB_FILE || "./data/nbsc.sqlite";
const dir = path.dirname(dbFile);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

sqlite3.verbose();

export function getDb() {
  const db = new sqlite3.Database(dbFile);
  // safer defaults for concurrency and integrity
  db.serialize(() => {
    db.run("PRAGMA foreign_keys = ON;");
    db.run("PRAGMA journal_mode = WAL;");

    // Ensure members table exists (some projects may ship only with a prebuilt DB)
    db.run(`CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sap_no TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      phone_no TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('ADMIN', 'MEMBER')),
      force_password_change INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );`);

    // Lightweight column auto-migration for existing DB files
    db.all("PRAGMA table_info(members);", (err, cols) => {
      if (err) return;
      const hasForce = Array.isArray(cols) && cols.some((c) => c?.name === "force_password_change");
      if (!hasForce) {
        db.run("ALTER TABLE members ADD COLUMN force_password_change INTEGER NOT NULL DEFAULT 0;");
      }
    });

    // Ensure required tables exist (lightweight auto-migration)
    db.run(`CREATE TABLE IF NOT EXISTS records_import (
      record_id INTEGER PRIMARY KEY AUTOINCREMENT,
      sap_no TEXT NOT NULL,
      names TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      remark TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (sap_no) REFERENCES members(sap_no) ON DELETE CASCADE
    );`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_records_import_sap_date ON records_import (sap_no, date);`);
    db.run("PRAGMA synchronous = NORMAL;");
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
