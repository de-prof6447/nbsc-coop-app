import React from "react";
import { Outlet, Link, useLocation } from "react-router-dom";

export default function Shell({ user, onLogout }) {
  const loc = useLocation();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-3 py-3 flex items-center gap-3">
          <img
            src="/logo.png"
            alt="NBSC Logo"
            className="h-10 w-10 rounded-xl border border-slate-200"
          />

          {/* Brand + Official site link */}
          <div className="leading-tight">
            <div className="font-bold text-blue-800 text-sm sm:text-base">
              NIGERIAN BREWERIES STAFF COOPERATIVE – KADUNA
            </div>

            <div className="flex items-center gap-2 text-slate-500 text-xs">
              <span>Secure Member Portal</span>
              <span className="text-slate-300">•</span>
              <a
                href="https://nbstaffcooperative.com/"
                target="_blank"
                rel="noreferrer"
                className="text-blue-700 hover:underline font-medium"
              >
                Official Website
              </a>
            </div>
          </div>

          {/* Right-side actions */}
          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/change-password"
              className={`btn-ghost text-sm ${
                loc.pathname.includes("change-password") ? "ring-2 ring-blue-600" : ""
              }`}
            >
              Change Password
            </Link>
            <button onClick={onLogout} className="btn-primary text-sm">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 py-4">
        {user ? (
          <div className="text-xs text-slate-500 mb-3">
            Logged in as{" "}
            <span className="font-semibold text-slate-700">{user.full_name}</span>{" "}
            ({user.role}) — SAP {user.sap_no}
          </div>
        ) : (
          <div className="text-xs text-slate-500 mb-3">Loading session…</div>
        )}

        <Outlet />
      </main>

      <footer className="py-6 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} NBSC Kaduna
      </footer>
    </div>
  );
}
