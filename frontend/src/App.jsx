import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { api } from "./lib/api.js";
import Login from "./pages/Login.jsx";
import MemberDashboard from "./pages/MemberDashboard.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import ChangePassword from "./pages/ChangePassword.jsx";
import Shell from "./components/Shell.jsx";

function PrivateRoute({ user, children }) {
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    (async () => {
      try {
        const res = await api.me();
        setUser(res.user);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Mandatory password change flow
  useEffect(() => {
    if (!loading && user?.force_password_change) {
      if (!loc.pathname.includes("/change-password")) {
        nav("/change-password", { replace: true });
      }
    }
  }, [loading, user, loc.pathname, nav]);

  async function handleLogout() {
    await api.logout();
    setUser(null);
    nav("/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-slate-700">
        Loading...
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login onLoggedIn={setUser} />} />
      <Route path="/" element={
        <PrivateRoute user={user}>
          <Shell user={user} onLogout={handleLogout} />
        </PrivateRoute>
      }>
        <Route index element={user?.role === "ADMIN" ? <AdminDashboard user={user} /> : <MemberDashboard user={user} />} />
        <Route path="change-password" element={<ChangePassword />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
