import dotenv from "dotenv";
import { getDb, run } from "./sqlite.js";

dotenv.config();

const schema = `CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sap_no TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone_no TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'MEMBER')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS thrift_loan_repayment (
  record_id INTEGER PRIMARY KEY AUTOINCREMENT,
  sap_no TEXT NOT NULL,
  names TEXT NOT NULL,
  date TEXT NOT NULL,
  description TEXT NOT NULL CHECK (description IN ('THRIFT','LOAN_DISBURSEMENT','LOAN_REPAYMENT')),
  amount REAL NOT NULL CHECK (amount >= 0),
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (sap_no) REFERENCES members(sap_no) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tlr_sap_date ON thrift_loan_repayment (sap_no, date);

CREATE TABLE IF NOT EXISTS records_import (
  record_id INTEGER PRIMARY KEY AUTOINCREMENT,
  sap_no TEXT NOT NULL,
  names TEXT NOT NULL,
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (sap_no) REFERENCES members(sap_no) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_records_import_sap_date ON records_import (sap_no, date);
`;

async function main() {
  const db = getDb();
  try {
    for (const stmt of schema.split(";").map(s => s.trim()).filter(Boolean)) {
      await run(db, stmt + ";");
    }
    console.log("Migration complete.");
  } finally {
    db.close();
  }
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
