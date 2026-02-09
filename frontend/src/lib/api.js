// frontend/src/lib/api.js

const API = import.meta.env.VITE_API_BASE || "https://nbsc-backend.onrender.com/api";

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",   // 🔴 THIS IS THE MAIN FIX
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (res.status === 401) {
    throw new Error("Not authenticated");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Request failed");
  }

  const type = res.headers.get("content-type") || "";
  if (type.includes("application/json")) return res.json();
  return res;
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: "POST", body: JSON.stringify(body) }),
  put: (p, body) => request(p, { method: "PUT", body: JSON.stringify(body) }),
  del: (p) => request(p, { method: "DELETE" }),

  // PDF download (important!)
  download: async (p, filename) => {
    const res = await request(p, { method: "GET" });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
};
