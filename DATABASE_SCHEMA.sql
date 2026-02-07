-- NBSC Kaduna (SQLite)
-- Required tables: members, thrift_loan_repayment

CREATE TABLE IF NOT EXISTS members (
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
