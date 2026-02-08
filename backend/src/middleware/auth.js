import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getDb, get, run } from "../db/sqlite.js";
import { loginSchema, changePasswordSchema } from "../validation/schemas.js";
import { requireAuth } from "../middleware/auth.js";

const COOKIE_NAME = process.env.COOKIE_NAME || "nbsc_token";

function cookieOptions() {
  const isProd = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: isProd ? true : String(process.env.COOKIE_SECURE) === "true",
    sameSite: isProd ? "none" : "lax", // IMPORTANT for mobile reliability
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export const authRouter = Router();

authRouter.post("/login", async (req, res, next) => {
  try {
    const { value, error } = loginSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(", ") });

    const db = getDb();
    try {
      const user = await get(db,
        "SELECT sap_no, full_name, phone_no, password_hash, role, force_password_change FROM members WHERE sap_no = ?",
        [value.sap_no]
      );
      if (!user) return res.status(401).json({ error: "Invalid credentials" });

      const ok = await bcrypt.compare(value.password, user.password_hash);
      if (!ok) return res.status(401).json({ error: "Invalid credentials" });

      const token = jwt.sign(
        { sap_no: user.sap_no, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.cookie(COOKIE_NAME, token, cookieOptions());

      res.json({
        sap_no: user.sap_no,
        full_name: user.full_name,
        role: user.role,
        force_password_change: !!user.force_password_change
      });
    } finally {
      db.close();
    }
  } catch (e) {
    next(e);
  }
});

authRouter.post("/logout", (req, res) => {
  // must match sameSite/secure/path used when setting cookie
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: 0 });
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const db = getDb();
    try {
      const user = await get(db,
        "SELECT sap_no, full_name, phone_no, role, force_password_change FROM members WHERE sap_no = ?",
        [req.user.sap_no]
      );
      res.json({ user: user ? { ...user, force_password_change: !!user.force_password_change } : null });
    } finally {
      db.close();
    }
  } catch (e) {
    next(e);
  }
});

authRouter.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const { value, error } = changePasswordSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(", ") });

    const db = getDb();
    try {
      const user = await get(db, "SELECT password_hash FROM members WHERE sap_no = ?", [req.user.sap_no]);
      if (!user) return res.status(404).json({ error: "User not found" });

      const ok = await bcrypt.compare(value.current_password, user.password_hash);
      if (!ok) return res.status(400).json({ error: "Current password is incorrect" });

      const password_hash = await bcrypt.hash(value.new_password, 12);
      await run(db,
        "UPDATE members SET password_hash=?, force_password_change=0, updated_at=datetime('now') WHERE sap_no=?",
        [password_hash, req.user.sap_no]
      );

      res.json({ ok: true });
    } finally {
      db.close();
    }
  } catch (e) {
    next(e);
  }
});
