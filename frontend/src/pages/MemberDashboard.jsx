import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";

function money(n) {
  return `₦${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Section({ title, children }) {
  return (
    <div className="card p-4">
      <div className="font-semibold text-slate-800 mb-3">{title}</div>
      {children}
    </div>
  );
}

function Table({ rows }) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="text-slate-600">
          <tr className="border-b">
            <th className="text-left py-2 pr-2">Date</th>
            <th className="text-left py-2 pr-2">Description</th>
            <th className="text-left py-2 pr-2">Type</th>
            <th className="text-right py-2 pl-2">Amount</th>
            <th className="text-left py-2 pl-3">Remark</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.record_id ?? `${r.date}-${r.description}-${r.amount}`} className="border-b last:border-b-0">
              <td className="py-2 pr-2 whitespace-nowrap">{r.date}</td>
              <td className="py-2 pr-2">{r.description}</td>
              <td className="py-2 pr-2">{r.type}</td>
              <td className="py-2 pl-2 text-right whitespace-nowrap">{money(r.amount)}</td>
              <td className="py-2 pl-3 text-slate-600">{r.remark || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MemberDashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.dashboard();
        setData(res);
      } catch (e) {
        setErr(e.message || "Failed to load");
      }
    })();
  }, []);

  const thriftRows = useMemo(() => (data?.thriftHistory || []).slice(0, 50), [data]);
  const repaymentRows = useMemo(() => (data?.repaymentHistory || []).slice(0, 50), [data]);

  const downloadPdf = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const base = (import.meta.env.VITE_API_BASE || "http://localhost:4000/api").replace(/\/api$/, "");
      const res = await fetch(base + "/api/statements/pdf", {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/pdf",
        },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to generate PDF (${res.status})`);
      }

      const blob = await res.blob();
      // If the server accidentally returned HTML/JSON, show a useful error.
      if (blob.type && !blob.type.includes("pdf")) {
        const text = await blob.text().catch(() => "");
        throw new Error(text || "PDF endpoint did not return a PDF.");
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `statement_${data.member.sap_no}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.message || "Failed to generate PDF");
    } finally {
      setDownloading(false);
    }
  };

  if (err) return <div className="text-red-600">{err}</div>;
  if (!data) return <div>Loading dashboard...</div>;

  return (
    <div className="grid gap-3">
      <div className="card p-4">
        <div className="font-semibold text-slate-800 mb-1">Profile</div>
        <div className="text-sm text-slate-600">
          <div><span className="text-slate-500">Name:</span> {data.member.full_name}</div>
          <div><span className="text-slate-500">SAP No:</span> {data.member.sap_no}</div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="text-xs text-slate-500">Total thrift contributed</div>
          <div className="text-lg font-bold text-slate-900">{money(data.summary.thriftTotal)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">Total loan(s) collected</div>
          <div className="text-lg font-bold text-slate-900">{money(data.summary.loanDisbursed)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">Total repaid</div>
          <div className="text-lg font-bold text-slate-900">{money(data.summary.loanRepaid)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">Loan balance</div>
          <div className="text-lg font-bold text-slate-900">{money(data.summary.loanBalance)}</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Section title="Thrift contribution history (latest 50)">
          <Table rows={thriftRows} />
        </Section>
        <Section title="Loan repayment history (latest 50)">
          <Table rows={repaymentRows} />
        </Section>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold text-slate-800">Download statement</div>
          <button
            type="button"
            className="btn-primary text-sm"
            onClick={downloadPdf}
            disabled={downloading}
            title={downloading ? "Generating..." : "Download PDF"}
          >
            {downloading ? "Generating..." : "PDF"}
          </button>
        </div>
        <div className="text-xs text-slate-500 mt-2">
          This PDF is generated on the server and includes only your data.
        </div>
      </div>
    </div>
  );
}
