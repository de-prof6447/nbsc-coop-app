import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";

export default function ChangePassword() {
  const nav = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setMsg(""); setErr("");
    setBusy(true);
    try {
      await api.changePassword(current, next);
      // Refresh session state then return to dashboard
      try { await api.me(); } catch {}
      setMsg("Password updated.");
      setCurrent(""); setNext("");
      nav("/", { replace: true });
      window.location.reload();
    } catch (e) {
      setErr(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4">
      <div className="font-semibold text-slate-800 mb-2">Change Password</div>
      <form onSubmit={submit} className="space-y-3 max-w-md">
        <div>
          <div className="label mb-1">Current password</div>
          <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div>
          <div className="label mb-1">New password</div>
          <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="Min 8 characters" />
        </div>

        {err ? <div className="text-sm text-red-600">{err}</div> : null}
        {msg ? <div className="text-sm text-green-700">{msg}</div> : null}

        <button className="btn-primary" disabled={busy}>{busy ? "Saving..." : "Update password"}</button>
      </form>
    </div>
  );
}
