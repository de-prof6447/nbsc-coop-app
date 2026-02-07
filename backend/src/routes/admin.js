import { Router } from "express";
import multer from "multer";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import bcrypt from "bcryptjs";
import { getDb, run, get, all } from "../db/sqlite.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const adminRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB (bulk records can be big)
});

function normalizeRecordType(t) {
  const raw = String(t || "").trim().toUpperCase();
  if (raw === "LOAN") return "LOAN_DISBURSEMENT";
  if (raw === "REPAYMENT") return "LOAN_REPAYMENT";
  return raw;
}

function parseUploadToRows(file) {
  const name = (file.originalname || "").toLowerCase();
  if (name.endsWith(".xlsx")) {
    const wb = XLSX.read(file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { defval: "" });
  }

  // default to CSV
  const parsed = Papa.parse(file.buffer.toString("utf-8"), { header: true, skipEmptyLines: true });
  if (parsed.errors?.length) {
    const err = new Error(parsed.errors[0].message);
    err.status = 400;
    throw err;
  }
  return parsed.data;
}

// Map "messy" spreadsheet headers to expected fields.
// Accepts common human-friendly headers (e.g., "SAP No", "Full name", "Phone No").
function canonKey(k) {
  return String(k || "")
    .trim()
    .toLowerCase()
    .replace(/\uFEFF/g, "") // remove BOM
    .replace(/[^a-z0-9]+/g, "");
}

function getField(row, ...candidates) {
  if (!row || typeof row !== "object") return "";
  // Direct match first (case sensitive keys from XLSX utils can be exact)
  for (const c of candidates) {
    if (c in row) return row[c];
  }
  // Canonical match
  const map = new Map();
  for (const [k, v] of Object.entries(row)) {
    map.set(canonKey(k), v);
  }
  for (const c of candidates) {
    const v = map.get(canonKey(c));
    if (v !== undefined) return v;
  }
  return "";
}


function parseAmount(v) {
  if (v === null || v === undefined) return NaN;
  const s = String(v).trim();
  if (!s) return NaN;
  // remove commas
  const n = Number(s.replace(/,/g, ""));
  return n;
}

// Accepts: YYYY-MM-DD, DD-MMM, DD-MMM-YYYY, DD/MM/YYYY, etc.
// Returns ISO YYYY-MM-DD (best effort).
function normalizeDateInput(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  // already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // Excel may give Date object-like numbers; XLSX already converts to string sometimes
  // Try Date parse
  const tryDate = new Date(raw);
  if (!isNaN(tryDate.getTime())) {
    const y = tryDate.getFullYear();
    const m = String(tryDate.getMonth() + 1).padStart(2, "0");
    const d = String(tryDate.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // DD-MMM or DD-MMM-YYYY
  const m1 = raw.match(/^\s*(\d{1,2})[-\s]([A-Za-z]{3,})[-\s]?(\d{4})?\s*$/);
  if (m1) {
    const day = Number(m1[1]);
    const monTxt = m1[2].slice(0,3).toLowerCase();
    const monMap = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
    const mon = monMap[monTxt] || 0;
    if (!mon) return "";
    let year = m1[3] ? Number(m1[3]) : new Date().getFullYear();
    // Heuristic: if year not present and month is "ahead" of current month by > 1, assume it belongs to previous year
    const now = new Date();
    if (!m1[3] && mon > (now.getMonth()+1) + 1) year = year - 1;
    return `${year}-${String(mon).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const m2 = raw.match(/^\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s*$/);
  if (m2) {
    const day = Number(m2[1]);
    const mon = Number(m2[2]);
    const year = Number(m2[3]);
    return `${year}-${String(mon).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  }

  return "";
}

function classifyTemplate(description, amount) {
  const desc = String(description || "").toLowerCase();
  if (desc.includes("4589") && desc.includes("thrift")) return "THRIFT_CONTRIBUTION";
  if (desc.includes("4588") && desc.includes("loan")) {
    if (Number(amount) < 0) return "LOAN_DISBURSED";
    if (Number(amount) > 0) return "LOAN_REPAYMENT";
    return "LOAN";
  }
  return "OTHER";
}


/**
 * Upload CSV to insert/update:
 * - Members: columns sap_no, full_name, phone_no, role, password(optional)
 * - Records: columns sap_no, date(YYYY-MM-DD), description, amount, remark(optional)
 *
 * Endpoints:
 * - POST /api/admin/import/members
 * - POST /api/admin/import/records
 */
adminRouter.post("/import/members", requireAuth, requireRole("ADMIN"), upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "file is required" });

    const rows = parseUploadToRows(req.file);

    const db = getDb();
    try {
      let inserted = 0, updated = 0;

      for (const row of rows) {
        const sap_no = String(getField(row, "sap_no", "sapno", "sap", "sap no", "sap number", "staff no", "staff number")).trim();
        const full_name = String(getField(row, "full_name", "fullname", "full name", "name", "names")).trim();
        const phone_no = String(getField(row, "phone_no", "phoneno", "phone", "phone no", "phone number", "mobile", "mobile no")).trim();
        const role = String(getField(row, "role") || "MEMBER").trim().toUpperCase();
        const password = String(
          getField(row, "password", "initial_password", "initial password", "pass") || ""
        ).trim();

        if (!sap_no || !full_name) continue;
        if (!["ADMIN","MEMBER"].includes(role)) continue;

        const exists = await get(db, "SELECT sap_no FROM members WHERE sap_no=?", [sap_no]);
        if (exists) {
          await run(db, "UPDATE members SET full_name=?, phone_no=?, role=?, updated_at=datetime('now') WHERE sap_no=?",
            [full_name, phone_no, role, sap_no]);
          // update password only if provided
          if (password && password.length >= 8) {
            const password_hash = await bcrypt.hash(password, 12);
            await run(db, "UPDATE members SET password_hash=?, force_password_change=1, updated_at=datetime('now') WHERE sap_no=?",
              [password_hash, sap_no]);
          }
          updated++;
        } else {
          if (!password || password.length < 8) continue; // new users require password
          const password_hash = await bcrypt.hash(password, 12);
          await run(db, "INSERT INTO members (sap_no, full_name, phone_no, role, password_hash, force_password_change) VALUES (?,?,?,?,?,1)",
            [sap_no, full_name, phone_no, role, password_hash]);
          inserted++;
        }
      }

      res.json({ ok: true, inserted, updated });
    } finally { db.close(); }
  } catch (e) { next(e); }
});

adminRouter.post("/import/records", requireAuth, requireRole("ADMIN"), upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "file is required" });

    const rows = parseUploadToRows(req.file);

    const db = getDb();
    try {
      let inserted = 0, skipped = 0;

      for (const row of rows) {
        const sap_no = String(getField(row, "sap_no", "sapno", "sap", "sap no", "sap number", "staff no", "staff number")).trim();
        const dateRaw = getField(row, "date", "record_date", "record date", "trans date", "transaction date");
        const date = normalizeDateInput(dateRaw);
        const description = String(getField(row, "description", "desc", "narration") || "").trim();
        const amount = parseAmount(getField(row, "amount", "amt", "value"));
        const remark = String(getField(row, "remark", "remarks", "note", "notes") || "").trim();

        // Template requires: sap_no, date, description, amount
        if (!sap_no || !date || !description || !Number.isFinite(amount)) { skipped++; continue; }

        const member = await get(db, "SELECT full_name FROM members WHERE sap_no=?", [sap_no]);
        if (!member) { skipped++; continue; }

        await run(db, "INSERT INTO records_import (sap_no, names, date, description, amount, remark) VALUES (?,?,?,?,?,?)",
          [sap_no, member.full_name, date, description, amount, remark]);
        inserted++;
      }

      res.json({ ok: true, inserted, skipped });
    } finally { db.close(); }
  } catch (e) { next(e); }
});



// Simple stats for admin dashboard counters
adminRouter.get("/stats", requireAuth, requireRole("ADMIN"), async (req, res, next) => {
  try {
    const db = getDb();
    try {
      const memberCount = await get(db, "SELECT COUNT(*) AS c FROM members");
      const recordCount = await get(db, "SELECT COUNT(*) AS c FROM records_import");
      res.json({ ok: true, members: memberCount?.c || 0, records: recordCount?.c || 0 });
    } finally { db.close(); }
  } catch (e) { next(e); }
});

// Admin: list records across members with search
// Query: ?q=SAP_OR_NAME&date=YYYY-MM-DD (optional)
adminRouter.get("/records", requireAuth, requireRole("ADMIN"), async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    const date = String(req.query.date || "").trim(); // expected YYYY-MM-DD from <input type="date">
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));

    const db = getDb();
    try {
      const where = [];
      const params = [];

      if (q) {
        // Template search: SAP No only (supports partial)
        where.push("(r.sap_no LIKE ?)");
        params.push(`%${q}%`);
      }

      if (date) {
        // Stored as YYYY-MM-DD
        where.push("(r.date = ?)");
        params.push(date);
      }

      const sql = `
        SELECT
          r.record_id,
          r.sap_no,
          r.date,
          r.description,
          r.amount,
          r.remark
        FROM records_import r
        ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY r.date DESC, r.record_id DESC
        LIMIT ?
      `;
      const rows = await all(db, sql, [...params, limit]);
      res.json({ ok: true, records: rows });
    } finally {
      db.close();
    }
  } catch (e) {
    next(e);
  }
});

// Admin danger zone: clear ALL imported records
// Body: { confirm: "CLEAR" }
adminRouter.post("/danger/clear-database", requireAuth, requireRole("ADMIN"), async (req, res, next) => {
  try {
    const confirm = String(req.body?.confirm || "").trim();
    if (confirm !== "CLEAR") return res.status(400).json({ error: "Confirmation required" });

    const db = getDb();
    try {
      await run(db, "DELETE FROM records_import");
      // Reset autoincrement sequence (best effort)
      await run(db, "DELETE FROM sqlite_sequence WHERE name='records_import'");
      res.json({ ok: true });
    } finally {
      db.close();
    }
  } catch (e) {
    next(e);
  }
});

