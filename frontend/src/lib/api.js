const RAW_BASE = import.meta.env.VITE_API_BASE || "/api";

function joinUrl(base, p) {
  const b = String(base || "").replace(/\/+$/, "");
  const path = String(p || "").startsWith("/") ? p : `/${p}`;
  return `${b}${path}`;
}

async function request(path, opts = {}) {
  const url = joinUrl(RAW_BASE, path);

  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(opts.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(opts.headers || {}),
    },
    credentials: "include",
  });

  const contentType = res.headers.get("content-type") || "";

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      if (contentType.includes("application/json")) {
        const data = await res.json();
        msg = data?.error || msg;
      } else {
        msg = await res.text();
      }
    } catch {}
    throw new Error(msg);
  }

  if (contentType.includes("application/json")) return res.json();
  return res;
}

function uploadWithProgress(path, file, onProgress) {
  const url = joinUrl(RAW_BASE, path);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (!onProgress || !e.lengthComputable) return;
      onProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      try {
        const ct = xhr.getResponseHeader("content-type") || "";
        const isJson = ct.includes("application/json");
        const data = isJson ? JSON.parse(xhr.responseText || "{}") : xhr.responseText;

        if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
        return reject(new Error((data && data.error) || `Upload failed (${xhr.status})`));
      } catch {
        return reject(new Error("Upload failed"));
      }
    };

    xhr.onerror = () => reject(new Error("Network error"));

    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
}
export function openPdf(path) {
  const base = import.meta.env.VITE_API_BASE;
  const url = `${base}${path}`;

  // Important: use browser navigation so cookies are sent
  window.open(url, "_blank", "noopener,noreferrer");
}

export const api = {
  login: (sap_no, password) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ sap_no, password }) }),

  logout: () =>
    request("/auth/logout", { method: "POST", body: JSON.stringify({}) }),

  me: () => request("/auth/me"),

  changePassword: (current_password, new_password) =>
    request("/auth/change-password", { method: "POST", body: JSON.stringify({ current_password, new_password }) }),

  dashboard: (sap_no) => {
    const q = sap_no ? `?sap_no=${encodeURIComponent(sap_no)}` : "";
    return request(`/records/dashboard${q}`);
  },

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
  adminBulkDeleteRecords: (record_ids) =>
    request("/admin/records/bulk-delete", { method: "POST", body: JSON.stringify({ record_ids }) }),

  importMembers: (file, onProgress) => uploadWithProgress("/admin/import/members", file, onProgress),
  importRecords: (file, onProgress) => uploadWithProgress("/admin/import/records", file, onProgress),

  clearDatabase: () => request("/admin/danger/clear-database", { method: "POST", body: JSON.stringify({ confirm: "CLEAR" }) }),
  deleteMembers: () => request("/admin/danger/delete-members", { method: "POST", body: JSON.stringify({ confirm: "DELETE_ALL_MEMBERS" }) }),
};
