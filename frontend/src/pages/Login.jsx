// frontend/src/pages/login.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";

export default function Login({ onLoggedIn }) {
  const [sap_no, setSap] = useState("");
  const [password, setPwd] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setErr("");

    const sap = sap_no.trim();
    if (!sap || !password) {
      setErr("SAP No and Password are required.");
      return;
    }

    setBusy(true);
    try {
      // sets the httpOnly cookie (credentials are included in api.js)
      await api.post("/auth/login", { sap_no: sap, password });

      // fetch current user using cookie
      const me = await api.get("/auth/me");
      const user = me?.user || null;

      if (!user) throw new Error("Not authenticated");

      onLoggedIn?.(user);

      if (user.force_password_change) {
        nav("/change-password", { replace: true });
      } else {
        nav("/", { replace: true });
      }
    } catch (e2) {
      setErr(e2?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 grid place-items-center px-3">
      <div className="w-full max-w-md card p-5">
        <div className="flex items-center gap-3 mb-4">
          <img
            src="/logo.png"
            alt="NBSC Logo"
            className="h-12 w-12 rounded-xl border border-slate-200"
          />
          <div>
            <div className="font-bold text-blue-800">NBSC Kaduna</div>
            <div className="text-slate-500 text-sm">Member Login</div>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <div className="label mb-1">SAP No</div>
            <input
              className="input"
              value={sap_no}
              onChange={(e) => setSap(e.target.value)}
              placeholder="e.g. 100001"
              autoComplete="username"
            />
          </div>

          <div>
            <div className="label mb-1">Password</div>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="Your password"
              autoComplete="current-password"
            />
          </div>

          {err ? <div className="text-sm text-red-600">{err}</div> : null}

          <button disabled={busy} className="btn-primary w-full" type="submit">
            {busy ? "Signing in..." : "Login"}
          </button>

          <div className="text-xs text-slate-500">
            Tip: Use Chrome on Android for best install (Add to Home Screen).
          </div>
        </form>
      </div>
    </div>
  );
}
