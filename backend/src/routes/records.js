import { Router } from "express";
import { getDb, all, get, run } from "../db/sqlite.js";
import { requireAuth, enforceOwnerOrAdmin } from "../middleware/auth.js";
import { tlrCreateSchema } from "../validation/schemas.js";

export const recordsRouter = Router();

// Helper: compute summaries from template-style records
function classify(description, amount) {
  const desc = String(description || "").toLowerCase();
  if (desc.includes("4589") && desc.includes("thrift")) return "THRIFT_CONTRIBUTION";
  if (desc.includes("4588") && desc.includes("loan")) {
    if (Number(amount) < 0) return "LOAN_DISBURSED";
    if (Number(amount) > 0) return "LOAN_REPAYMENT";
    return "LOAN";
  }
  return "OTHER";
}

function computeSummary(rows) {
  const thriftTotal = rows
    .filter(r => classify(r.description, r.amount) === "THRIFT_CONTRIBUTION")
    .reduce((s, r) => s + Number(r.amount || 0), 0);

  const loanDisbursed = rows
    .filter(r => classify(r.description, r.amount) === "LOAN_DISBURSED")
    .reduce((s, r) => s + (-Number(r.amount || 0)), 0); // amount is negative

  const loanRepaid = rows
    .filter(r => classify(r.description, r.amount) === "LOAN_REPAYMENT")
    .reduce((s, r) => s + Number(r.amount || 0), 0);

  const loanBalance = Math.max(0, loanDisbursed - loanRepaid);

  return { thriftTotal, loanDisbursed, loanRepaid, loanBalance };
}


/**
 * Member dashboard data:
 * - Member: ignores requested sap_no; uses token sap_no
 * - Admin: can pass ?sap_no=...
 */
recordsRouter.get("/dashboard", requireAuth, async (req, res, next) => {
  try {
    const sap_no = req.user.role === "ADMIN"
      ? (req.query.sap_no?.toString() || req.user.sap_no)
      : req.user.sap_no;

    const db = getDb();
    try {
      const member = await get(db, "SELECT sap_no, full_name FROM members WHERE sap_no=?", [sap_no]);
      if (!member) return res.status(404).json({ error: "Member not found" });

      const rows = await all(db, "SELECT record_id, sap_no, names, date, description, amount, remark FROM records_import WHERE sap_no=? ORDER BY date DESC, record_id DESC", [sap_no]);
      const rowsWithType = rows.map(r => ({ ...r, type: classify(r.description, r.amount) }));
      const summary = computeSummary(rowsWithType);

      const thriftHistory = rowsWithType.filter(r => classify(r.description, r.amount) === "THRIFT_CONTRIBUTION");
      const loanHistory = rowsWithType.filter(r => classify(r.description, r.amount) === "LOAN_DISBURSED");
      const repaymentHistory = rowsWithType.filter(r => classify(r.description, r.amount) === "LOAN_REPAYMENT");

      res.json({
        member,
        summary,
        thriftHistory,
        loanHistory,
        repaymentHistory
      });
    } finally { db.close(); }
  } catch (e) { next(e); }
});

// List records (admin can pass sap_no; member always own)
recordsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const sap_no = req.user.role === "ADMIN"
      ? (req.query.sap_no?.toString() || "")
      : req.user.sap_no;

    if (req.user.role === "ADMIN" && !sap_no) {
      return res.status(400).json({ error: "sap_no query is required for admin" });
    }

    const db = getDb();
    try {
      const rows = await all(db, "SELECT record_id, sap_no, names, date, description, amount, remark FROM records_import WHERE sap_no=? ORDER BY date DESC, record_id DESC", [sap_no]);
      const rowsWithType = rows.map(r => ({ ...r, type: classify(r.description, r.amount) }));
      res.json({ records: rowsWithType });
    } finally { db.close(); }
  } catch (e) { next(e); }
});

// Admin create record (thrift or loan)
recordsRouter.post("/", requireAuth, enforceOwnerOrAdmin((req) => req.body?.sap_no), async (req, res, next) => {
  // Members are not allowed to create/edit; enforce via role check
  if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Forbidden" });

  try {
    const { value, error } = tlrCreateSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(", ") });

    const db = getDb();
    try {
      const member = await get(db, "SELECT full_name FROM members WHERE sap_no=?", [value.sap_no]);
      if (!member) return res.status(404).json({ error: "Member not found" });

      await run(db, `
        INSERT INTO records_import (sap_no, names, date, description, amount, remark)
        VALUES (?,?,?,?,?,?)
      `, [value.sap_no, member.full_name, value.date, value.description, value.amount, value.remark || ""]);

      res.status(201).json({ ok: true });
    } finally { db.close(); }
  } catch (e) { next(e); }
});

// Admin delete record
recordsRouter.delete("/:record_id", requireAuth, async (req, res, next) => {
  if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Forbidden" });
  try {
    const id = Number(req.params.record_id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid record_id" });

    const db = getDb();
    try {
      await run(db, "DELETE FROM records_import WHERE record_id=?", [id]);
      res.json({ ok: true });
    } finally { db.close(); }
  } catch (e) { next(e); }
});