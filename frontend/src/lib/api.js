// IMPORTANT:
// - When the frontend is served by the backend (same origin), use a RELATIVE base so it works on any host/domain.
// - You can still override via VITE_API_BASE for dev (e.g. http://localhost:4000/api)
const API_BASE = import.meta.env.VITE_API_BASE || "/api";

async function request(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {})
    },
    credentials: "include"
  });
  const contentType = res.headers.get("content-type") || "";
  if (!res.ok) {
    let msg = "Request failed";
    try {
      const data = contentType.includes("application/json") ? await res.json() : { error: await res.text() };
      msg = data.error || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (contentType.includes("application/json")) return res.json();
  return res;
}

// Multipart upload with progress (uses XHR because fetch has no upload progress)
function uploadWithProgress(path, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}${path}`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (!onProgress || !e.lengthComputable) return;
      const pct = Math.round((e.loaded / e.total) * 100);
      onProgress(pct);
    };

    xhr.onload = () => {
      try {
        const contentType = xhr.getResponseHeader("content-type") || "";
        const isJson = contentType.includes("application/json");
        const data = isJson ? JSON.parse(xhr.responseText || "{}") : xhr.responseText;
        if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
        return reject(new Error((data && data.error) || "Upload failed"));
      } catch {
        return reject(new Error("Upload failed"));
      }
    };

    xhr.onerror = () => reject(new Error("Failed to fetch"));

    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
}

export const api = {
  login: (sap_no, password) => request("/auth/login", { method: "POST", body: JSON.stringify({ sap_no, password }) }),
  logout: () => request("/auth/logout", { method: "POST", body: JSON.stringify({}) }),
  me: () => request("/auth/me"),
  changePassword: (current_password, new_password) => request("/auth/change-password", { method: "POST", body: JSON.stringify({ current_password, new_password }) }),

  dashboard: (sap_no) => {
    const q = sap_no ? `?sap_no=${encodeURIComponent(sap_no)}` : "";
    return request(`/records/dashboard${q}`);
  },

  // Admin
  listMembers: (q) => request(`/members${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  createMember: (payload) => request("/members", { method: "POST", body: JSON.stringify(payload) }),
  updateMember: (sap_no, payload) => request(`/members/${encodeURIComponent(sap_no)}`, { method: "PUT", body: JSON.stringify(payload) }),
  resetMemberPassword: (sap_no, new_password) => request(`/members/${encodeURIComponent(sap_no)}/reset-password`, { method: "POST", body: JSON.stringify({ new_password }) }),
  deleteMember: (sap_no) => request(`/members/${encodeURIComponent(sap_no)}`, { method: "DELETE" }),
  bulkDelete: (sap_nos) => request("/members/bulk-delete", { method: "POST", body: JSON.stringify({ sap_nos }) }),

  createRecord: (payload) => request("/records", { method: "POST", body: JSON.stringify(payload) }),
  deleteRecord: (record_id) => request(`/records/${record_id}`, { method: "DELETE" }),

  adminStats: () => request("/admin/stats"),
  adminListRecords: ({ q = "", date = "", limit = 100 } = {}) => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (date) qs.set("date", date);
    if (limit) qs.set("limit", String(limit));
    const s = qs.toString();
    return request(`/admin/records${s ? `?${s}` : ""}`);
  },
  adminBulkDeleteRecords: (record_ids) => request("/admin/records/bulk-delete", { method: "POST", body: JSON.stringify({ record_ids }) }),

  importMembers: (file, onProgress) => uploadWithProgress("/admin/import/members", file, onProgress),
  importRecords: (file, onProgress) => uploadWithProgress("/admin/import/records", file, onProgress),

  clearDatabase: () => request("/admin/danger/clear-database", { method: "POST", body: JSON.stringify({ confirm: "CLEAR" }) }),
  deleteMembers: () => request("/admin/danger/delete-members", { method: "POST", body: JSON.stringify({ confirm: "DELETE_ALL_MEMBERS" }) })
};
