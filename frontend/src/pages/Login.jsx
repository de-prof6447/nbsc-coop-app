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
    setBusy(true);
    try {
      await api.login(sap_no.trim(), password);
      const me = await api.me();
      onLoggedIn(me.user);
      if (me.user?.force_password_change) {
        nav("/change-password", { replace: true });
      } else {
        nav("/");
      }
    } catch (e) {
      setErr(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 grid place-items-center px-3">
      <div className="w-full max-w-md card p-5">
        <div className="flex items-center gap-3 mb-4">
          <img src="/logo.png" alt="NBSC Logo" className="h-12 w-12 rounded-xl border border-slate-200" />
          <div>
            <div className="font-bold text-blue-800">NBSC Kaduna</div>
            <div className="text-slate-500 text-sm">Member Login</div>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <div className="label mb-1">SAP No</div>
            <input className="input" value={sap_no} onChange={(e) => setSap(e.target.value)} placeholder="e.g. 100001" />
          </div>
          <div>
            <div className="label mb-1">Password</div>
            <input className="input" type="password" value={password} onChange={(e) => setPwd(e.target.value)} placeholder="Your password" />
          </div>

          {err ? <div className="text-sm text-red-600">{err}</div> : null}

          <button disabled={busy} className="btn-primary w-full">
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
