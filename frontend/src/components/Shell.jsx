<div className="max-w-5xl mx-auto px-3 py-3 flex items-center gap-3">
  <img src="/logo.png" alt="NBSC Logo" className="h-10 w-10 rounded-xl border border-slate-200" />

  <div className="leading-tight min-w-0">
    <div className="font-bold text-blue-800 text-sm sm:text-base truncate">
      NIGERIAN BREWERIES STAFF COOPERATIVE – KADUNA
    </div>

    <div className="text-slate-500 text-xs flex items-center gap-2 flex-wrap">
      <span>Secure Member Portal</span>
      <span className="text-slate-300">•</span>
      <a
        href="https://nbstaffcooperative.com/"
        target="_blank"
        rel="noreferrer"
        className="text-blue-700 hover:underline"
      >
        Official Website
      </a>
    </div>
  </div>

  <div className="ml-auto flex items-center gap-2">
    <Link to="/change-password" className="btn-ghost text-sm">Change Password</Link>
    <button onClick={onLogout} className="btn-primary text-sm">Logout</button>
  </div>
</div>
