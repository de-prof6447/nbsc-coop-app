import { Router } from "express";
import bcrypt from "bcryptjs";
import { getDb, all, get, run } from "../db/sqlite.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { memberCreateSchema, memberUpdateSchema } from "../validation/schemas.js";

export const memberRouter = Router();

// Hard-protected Super Admin account
const SUPER_ADMIN_SAP = "ADMIN001";

// Member (self) profile
memberRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    try {
      const user = await get(db, "SELECT sap_no, full_name, phone_no, role, created_at FROM members WHERE sap_no = ?", [req.user.sap_no]);
      res.json({ member: user });
    } finally { db.close(); }
  } catch (e) { next(e); }
});

// Admin list/search
memberRouter.get("/", requireAuth, requireRole("ADMIN"), async (req, res, next) => {
  try {
    const q = (req.query.q || "").toString().trim();
    const db = getDb();
    try {
      const rows = q
        ? await all(db, "SELECT sap_no, full_name, phone_no, role, created_at FROM members WHERE sap_no LIKE ? OR full_name LIKE ? ORDER BY full_name ASC LIMIT 200", [`%${q}%`, `%${q}%`])
        : await all(db, "SELECT sap_no, full_name, phone_no, role, created_at FROM members ORDER BY full_name ASC LIMIT 200", []);
      res.json({ members: rows });
    } finally { db.close(); }
  } catch (e) { next(e); }
});

// Admin create member
memberRouter.post("/", requireAuth, requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { value, error } = memberCreateSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(", ") });

    const db = getDb();
    try {
      const exists = await get(db, "SELECT sap_no FROM members WHERE sap_no = ?", [value.sap_no]);
      if (exists) return res.status(409).json({ error: "SAP number already exists" });

      const password_hash = await bcrypt.hash(value.password, 12);
      await run(db, "INSERT INTO members (sap_no, full_name, phone_no, role, password_hash, force_password_change) VALUES (?,?,?,?,?,1)",
        [value.sap_no, value.full_name, value.phone_no || "", value.role, password_hash]
      );
      res.status(201).json({ ok: true });
    } finally { db.close(); }
  } catch (e) { next(e); }
});

// Admin update member
memberRouter.put("/:sap_no", requireAuth, requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { value, error } = memberUpdateSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(", ") });

    const sap_no = req.params.sap_no;
    const db = getDb();
    try {
      const exists = await get(db, "SELECT sap_no FROM members WHERE sap_no = ?", [sap_no]);
      if (!exists) return res.status(404).json({ error: "Member not found" });

      // Do not allow downgrading Super Admin
      if (sap_no === SUPER_ADMIN_SAP && value.role !== "ADMIN") {
        return res.status(403).json({ error: "Super Admin role cannot be changed" });
      }

      await run(db, "UPDATE members SET full_name=?, phone_no=?, role=?, updated_at=datetime('now') WHERE sap_no=?",
        [value.full_name, value.phone_no || "", value.role, sap_no]
      );
      // keep names in records consistent
      await run(db, "UPDATE thrift_loan_repayment SET names=? WHERE sap_no=?", [value.full_name, sap_no]);
      res.json({ ok: true });
    } finally { db.close(); }
  } catch (e) { next(e); }
});

// Admin reset password
memberRouter.post("/:sap_no/reset-password", requireAuth, requireRole("ADMIN"), async (req, res, next) => {
  try {
    const sap_no = req.params.sap_no;
    const newPassword = (req.body?.new_password || "").toString();
    if (newPassword.length < 8) return res.status(400).json({ error: "new_password must be at least 8 characters" });

    const db = getDb();
    try {
      const exists = await get(db, "SELECT sap_no FROM members WHERE sap_no = ?", [sap_no]);
      if (!exists) return res.status(404).json({ error: "Member not found" });

      const password_hash = await bcrypt.hash(newPassword, 12);
      await run(db, "UPDATE members SET password_hash=?, force_password_change=1, updated_at=datetime('now') WHERE sap_no=?", [password_hash, sap_no]);
      res.json({ ok: true });
    } finally { db.close(); }
  } catch (e) { next(e); }
});

// Admin delete one
memberRouter.delete("/:sap_no", requireAuth, requireRole("ADMIN"), async (req, res, next) => {
  try {
    const sap_no = req.params.sap_no;

    if (sap_no === SUPER_ADMIN_SAP) {
      return res.status(403).json({ error: "Super Admin cannot be deleted" });
    }

    const db = getDb();
    try {
      await run(db, "DELETE FROM members WHERE sap_no=?", [sap_no]);
      res.json({ ok: true });
    } finally { db.close(); }
  } catch (e) { next(e); }
});

// Admin bulk delete (select many)
memberRouter.post("/bulk-delete", requireAuth, requireRole("ADMIN"), async (req, res, next) => {
  try {
    const sapNosRaw = Array.isArray(req.body?.sap_nos) ? req.body.sap_nos : [];
    if (!sapNosRaw.length) return res.status(400).json({ error: "sap_nos array is required" });

    const skipped = sapNosRaw.filter(s => String(s) === SUPER_ADMIN_SAP);
    const sapNos = sapNosRaw.filter(s => String(s) !== SUPER_ADMIN_SAP);
    if (!sapNos.length) {
      return res.status(403).json({ error: "Super Admin cannot be deleted", skipped });
    }

    const db = getDb();
    try {
      const placeholders = sapNos.map(() => "?").join(",");
      await run(db, `DELETE FROM members WHERE sap_no IN (${placeholders})`, sapNos);
      res.json({ ok: true, skipped });
    } finally { db.close(); }
  } catch (e) { next(e); }
});
