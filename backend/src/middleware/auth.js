import jwt from "jsonwebtoken";
import { getDb, get } from "../db/sqlite.js";

const COOKIE_NAME = process.env.COOKIE_NAME || "nbsc_token";

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: "Not authenticated" });
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Attach current user info from DB (role in token is trusted only for basic routing)
    const db = getDb();
    try {
      const row = await get(db, "SELECT sap_no, role, force_password_change FROM members WHERE sap_no = ?", [payload.sap_no]);
      if (!row) return res.status(401).json({ error: "Invalid session" });
      req.user = { sap_no: row.sap_no, role: row.role, force_password_change: !!row.force_password_change };

      // Enforce mandatory password change (first login / after admin reset)
      const fullPath = `${req.baseUrl}${req.path}`; // e.g. /api/auth/me
      const allow = new Set([
        "/api/auth/me",
        "/api/auth/change-password",
        "/api/auth/logout",
      ]);
      if (req.user.force_password_change && !allow.has(fullPath)) {
        return res.status(403).json({ error: "Password change required", code: "MUST_CHANGE_PASSWORD" });
      }
    } finally {
      db.close();
    }

    return next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid session" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
    return next();
  };
}

/**
 * Server-side ownership enforcement:
 * - Member can only access their own sap_no.
 * - Admin can access any.
 */
export function enforceOwnerOrAdmin(getSapFromReq) {
  return (req, res, next) => {
    const requestedSap = getSapFromReq(req);
    if (req.user.role === "ADMIN") return next();
    if (requestedSap && requestedSap !== req.user.sap_no) {
      return res.status(403).json({ error: "Access denied" });
    }
    return next();
  };
}
