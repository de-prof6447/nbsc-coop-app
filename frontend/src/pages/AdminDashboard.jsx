import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";

function money(n) {
  return `₦${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}


function templateDefaults(templateType) {
  if (templateType === "THRIFT_CONTRIBUTION") {
    return { description: "4589 Thrift MembrshpFee-K", sign: "POS" };
  }
  if (templateType === "LOAN_DISBURSED") {
    return { description: "4588 Thrift loan-KADUNA", sign: "NEG" };
  }
  if (templateType === "LOAN_REPAYMENT") {
    return { description: "4588 Thrift loan-KADUNA", sign: "POS" };
  }
  return { description: "", sign: "POS" };
}
function Card({ title, children }) {
  return (
    <div className="card p-4">
      <div className="font-semibold text-slate-800 mb-2">{title}</div>
      {children}
    </div>
  );
}

export default function AdminDashboard() {
  const SUPER_ADMIN_SAP = "ADMIN001";
  const [q, setQ] = useState("");
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState({});
  const [activeSap, setActiveSap] = useState("");
  const [dash, setDash] = useState(null);
  const [err, setErr] = useState("");

  // Counters
  const [stats, setStats] = useState({ members: 0, records: 0 });
  const [statsLoading, setStatsLoading] = useState(false);

  // Create member form
  const [newMember, setNewMember] = useState({ sap_no: "", full_name: "", phone_no: "", role: "MEMBER", password: "" });
  const [record, setRecord] = useState({ sap_no: "", date: "", templateType: "THRIFT_CONTRIBUTION", description: "4589 Thrift MembrshpFee-K", amount: "", remark: "" });

  // Bulk upload
  const [membersFile, setMembersFile] = useState(null);
  const [recordsFile, setRecordsFile] = useState(null);
  const [uploadMembersPct, setUploadMembersPct] = useState(0);
  const [uploadRecordsPct, setUploadRecordsPct] = useState(0);
  const [uploadingMembers, setUploadingMembers] = useState(false);
  const [uploadingRecords, setUploadingRecords] = useState(false);

  // Records table
  const [recordsQ, setRecordsQ] = useState("");
  const [recordsDate, setRecordsDate] = useState("");
  const [recordsRows, setRecordsRows] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordSel, setRecordSel] = useState({});

  async function loadMembers() {
    const res = await api.listMembers(q);
    setMembers(res.members || []);
  }

  async function loadStats() {
    setStatsLoading(true);
    try {
      const res = await api.adminStats();
      setStats({ members: res.members || 0, records: res.records || 0 });
    } finally {
      setStatsLoading(false);
    }
  }

  async function loadRecords() {
    setRecordsLoading(true);
    try {
      const res = await api.adminListRecords({ q: recordsQ, date: recordsDate, limit: 200 });
      setRecordsRows(res.records || []);
      setRecordSel({});
    } finally {
      setRecordsLoading(false);
    }
  }

  useEffect(() => {
    loadMembers().catch(e => setErr(e.message));
    loadStats().catch(e => setErr(e.message));
    loadRecords().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDashboard(sap) {
    setErr("");
    try {
      const res = await api.dashboard(sap);
      setDash(res);
      setActiveSap(sap);
      setRecord(r => ({ ...r, sap_no: sap }));
    } catch (e) {
      setErr(e.message || "Failed to load dashboard");
    }
  }

  const selectedSapNos = useMemo(() => Object.entries(selected).filter(([k, v]) => v).map(([k]) => k), [selected]);

  async function createMember(e) {
    e.preventDefault();
    setErr("");
    try {
      await api.createMember({
        sap_no: newMember.sap_no.trim(),
        full_name: newMember.full_name.trim(),
        phone_no: newMember.phone_no.trim(),
        role: newMember.role,
        password: newMember.password
      });
      setNewMember({ sap_no: "", full_name: "", phone_no: "", role: "MEMBER", password: "" });
      await loadMembers();
      await loadStats();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function addRecord(e) {
    e.preventDefault();
    setErr("");
    try {
      const t = templateDefaults(record.templateType);
      const amtRaw = Number(record.amount);
      const amount = t.sign === "NEG" ? -Math.abs(amtRaw) : Math.abs(amtRaw);
      const payload = {
        sap_no: record.sap_no.trim(),
        date: record.date,
        description: record.description || t.description,
        amount,
        remark: record.remark
      };
      await api.createRecord(payload);
      setRecord(r => ({ ...r, amount: "", remark: "" }));
      await loadDashboard(activeSap);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function bulkDelete() {
    if (!selectedSapNos.length) return;
    setErr("");
    try {
      await api.bulkDelete(selectedSapNos);
      setSelected({});
      setDash(null);
      setActiveSap("");
      await loadMembers();
      await loadStats();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function clearDatabase() {
    setErr("");
    try {
      if (!window.confirm("This will delete ALL records (thrift/loan/repayment). Continue?") ) return;
      await api.clearDatabase();
      await loadStats();
      await loadRecords();
      if (activeSap) await loadDashboard(activeSap);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function uploadMembers() {
    if (!membersFile) return;
    setErr("");
    setUploadingMembers(true);
    setUploadMembersPct(0);
    try {
      await api.importMembers(membersFile, setUploadMembersPct);
      setMembersFile(null);
      await loadMembers();
      await loadStats();
    } catch (e) {
      setErr(e.message || "Failed to upload members");
    } finally {
      setUploadingMembers(false);
      setUploadMembersPct(0);
    }
  }

  async function uploadRecords() {
    if (!recordsFile) return;
    setErr("");
    setUploadingRecords(true);
    setUploadRecordsPct(0);
    try {
      await api.importRecords(recordsFile, setUploadRecordsPct);
      setRecordsFile(null);
      await loadStats();
      await loadRecords();
      if (activeSap) await loadDashboard(activeSap);
    } catch (e) {
      setErr(e.message || "Failed to upload records");
    } finally {
      setUploadingRecords(false);
      setUploadRecordsPct(0);
    }
  }

  const selectedRecordIds = useMemo(
    () => Object.entries(recordSel).filter(([, v]) => v).map(([k]) => Number(k)).filter(n => Number.isFinite(n)),
    [recordSel]
  );

  const selectableMembers = members.filter(m => m.sap_no !== SUPER_ADMIN_SAP);
  const allMembersChecked = selectableMembers.length > 0 && selectableMembers.every(m => !!selected[m.sap_no]);
  const allRecordsChecked = recordsRows.length > 0 && recordsRows.every(r => !!recordSel[r.record_id]);

  function toggleAllMembers(checked) {
    setSelected(prev => {
      const next = { ...prev };
      for (const m of members) {
        if (m.sap_no === SUPER_ADMIN_SAP) continue;
        next[m.sap_no] = checked;
      }
      return next;
    });
  }

  function toggleAllRecords(checked) {
    setRecordSel(prev => {
      const next = { ...prev };
      for (const r of recordsRows) next[r.record_id] = checked;
      return next;
    });
  }

  async function resetMemberPassword(sap_no) {
    const newPw = window.prompt(`Enter new password for ${sap_no}`);
    if (!newPw) return;
    setErr("");
    try {
      await api.resetMemberPassword(sap_no, newPw);
      window.alert("Password reset successfully.");
    } catch (e) {
      setErr(e.message || "Failed to reset password");
    }
  }

  async function deleteSelectedRecords() {
    if (!selectedRecordIds.length) return;
    if (!window.confirm(`Delete ${selectedRecordIds.length} selected record(s)?`)) return;
    setErr("");
    try {
      await api.adminBulkDeleteRecords(selectedRecordIds);
      await loadStats();
      await loadRecords();
      if (activeSap) await loadDashboard(activeSap);
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="grid gap-3">
      {err ? <div className="text-red-600">{err}</div> : null}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="text-xs text-slate-500">Total members</div>
          <div className="text-2xl font-bold">{statsLoading ? "…" : stats.members.toLocaleString()}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">Total records</div>
          <div className="text-2xl font-bold">{statsLoading ? "…" : stats.records.toLocaleString()}</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Card title="Members">
          <div className="flex gap-2 mb-3">
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or SAP No..." />
            <button className="btn-primary" onClick={() => loadMembers().catch(e => setErr(e.message))}>Load members</button>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-600">
                <tr className="border-b">
                  <th className="py-2 text-left">
                    <input
                      type="checkbox"
                      checked={allMembersChecked}
                      onChange={(e) => toggleAllMembers(e.target.checked)}
                      title="Select all"
                    />
                  </th>
                  <th className="py-2 text-left">SAP No</th>
                  <th className="py-2 text-left">Name</th>
                  <th className="py-2 text-left">Role</th>
                  <th className="py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.sap_no} className="border-b last:border-b-0">
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={!!selected[m.sap_no]}
                        disabled={m.sap_no === SUPER_ADMIN_SAP}
                        onChange={(e) => setSelected(s => ({ ...s, [m.sap_no]: e.target.checked }))}
                        title={m.sap_no === SUPER_ADMIN_SAP ? "Super Admin cannot be selected" : "Select"}
                      />
                    </td>
                    <td className="py-2">{m.sap_no}</td>
                    <td className="py-2">{m.full_name}</td>
                    <td className="py-2">
                      {m.sap_no === SUPER_ADMIN_SAP ? "SUPER ADMIN" : m.role}
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button className="btn-ghost text-sm" onClick={() => loadDashboard(m.sap_no)}>View</button>
                        <button className="btn-ghost text-sm" type="button" onClick={() => resetMemberPassword(m.sap_no)}>Reset PW</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2 mt-3">
            <button className="btn-primary text-sm" onClick={bulkDelete} disabled={!selectedSapNos.length}>Delete selected</button>
            <button className="btn-ghost text-sm" onClick={clearDatabase}>Clear records DB</button>
          </div>
        </Card>

        <Card title="Create Member">
          <form onSubmit={createMember} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-2">
              <div>
                <div className="label mb-1">SAP No</div>
                <input className="input" value={newMember.sap_no} onChange={(e) => setNewMember(s => ({ ...s, sap_no: e.target.value }))} />
              </div>
              <div>
                <div className="label mb-1">Role</div>
                <select className="input" value={newMember.role} onChange={(e) => setNewMember(s => ({ ...s, role: e.target.value }))}>
                  <option value="MEMBER">MEMBER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
                <div className="text-xs text-slate-500 mt-1">Description (template)</div>
                <input
                  className="input mt-1"
                  value={record.description}
                  onChange={(e) => setRecord(s => ({ ...s, description: e.target.value }))}
                  placeholder="e.g. 4588 Thrift loan-KADUNA"
                />
              </div>
            </div>

            <div>
              <div className="label mb-1">Full name</div>
              <input className="input" value={newMember.full_name} onChange={(e) => setNewMember(s => ({ ...s, full_name: e.target.value }))} />
            </div>

            <div>
              <div className="label mb-1">Phone</div>
              <input className="input" value={newMember.phone_no} onChange={(e) => setNewMember(s => ({ ...s, phone_no: e.target.value }))} />
            </div>

            <div>
              <div className="label mb-1">Initial password</div>
              <input className="input" type="password" value={newMember.password} onChange={(e) => setNewMember(s => ({ ...s, password: e.target.value }))} placeholder="Min 8 characters" />
            </div>

            <button className="btn-primary">Create member</button>
          </form>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Card title="Selected Member Dashboard">
          {!dash ? (
            <div className="text-slate-500 text-sm">Select a member to view dashboard.</div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm text-slate-600">
                <div><span className="text-slate-500">Name:</span> {dash.member.full_name}</div>
                <div><span className="text-slate-500">SAP No:</span> {dash.member.sap_no}</div>
              </div>

              <div className="grid sm:grid-cols-2 gap-2">
                <div className="card p-3">
                  <div className="text-xs text-slate-500">Total thrift</div>
                  <div className="font-bold">{money(dash.summary.thriftTotal)}</div>
                </div>
                <div className="card p-3">
                  <div className="text-xs text-slate-500">Loan balance</div>
                  <div className="font-bold">{money(dash.summary.loanBalance)}</div>
                </div>
              </div>

              <a
                className="btn-primary inline-block text-sm"
                // Use same-origin API path so it works on any deployed host.
                href={`/api/statements/pdf?sap_no=${encodeURIComponent(dash.member.sap_no)}`}
                target="_blank"
                rel="noreferrer"
              >
                Download statement (PDF)
              </a>
            </div>
          )}
        </Card>

        <Card title="Bulk Upload (CSV / Excel .xlsx)">
          <div className="text-sm text-slate-600 mb-3">
            Download templates:&nbsp;
            <a className="underline" href="/templates/members_template.csv">Members CSV</a>
            <span> · </span>
            <a className="underline" href="/templates/members_template.xlsx">Members XLSX</a>
            <span> · </span>
            <a className="underline" href="/templates/records_template.csv">Records CSV</a>
            <span> · </span>
            <a className="underline" href="/templates/records_template.xlsx">Records XLSX</a>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <div className="label mb-1">Members</div>
              <input
                className="input"
                type="file"
                accept=".csv,.xlsx"
                onChange={(e) => setMembersFile(e.target.files?.[0] || null)}
              />
              <button
                type="button"
                className="btn-primary mt-2"
                onClick={uploadMembers}
                disabled={!membersFile || uploadingMembers}
              >
                {uploadingMembers ? `Uploading… ${uploadMembersPct}%` : "Upload Members"}
              </button>
              {uploadingMembers ? (
                <div className="mt-2 h-2 w-full bg-slate-100 rounded">
                  <div className="h-2 bg-blue-600 rounded" style={{ width: `${uploadMembersPct}%` }} />
                </div>
              ) : null}
            </div>

            <div>
              <div className="label mb-1">Thrift / Loan / Repayment</div>
              <input
                className="input"
                type="file"
                accept=".csv,.xlsx"
                onChange={(e) => setRecordsFile(e.target.files?.[0] || null)}
              />
              <button
                type="button"
                className="btn-primary mt-2"
                onClick={uploadRecords}
                disabled={!recordsFile || uploadingRecords}
              >
                {uploadingRecords ? `Uploading… ${uploadRecordsPct}%` : "Upload Records"}
              </button>
              {uploadingRecords ? (
                <div className="mt-2 h-2 w-full bg-slate-100 rounded">
                  <div className="h-2 bg-blue-600 rounded" style={{ width: `${uploadRecordsPct}%` }} />
                </div>
              ) : null}
            </div>
          </div>

          <div className="text-xs text-slate-500 mt-3">
            Notes: For new members, password is required. Record type can be THRIFT, LOAN, or REPAYMENT (LOAN/REPAYMENT auto-mapped).
          </div>
        </Card>

        <Card title="Add Thrift / Loan / Repayment (Admin)">
          <form onSubmit={addRecord} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-2">
              <div>
                <div className="label mb-1">SAP No</div>
                <input className="input" value={record.sap_no} onChange={(e) => setRecord(s => ({ ...s, sap_no: e.target.value }))} placeholder="Select a member or type" />
              </div>
              <div>
                <div className="label mb-1">Date</div>
                <input className="input" type="date" value={record.date} onChange={(e) => setRecord(s => ({ ...s, date: e.target.value }))} />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-2">
              <div>
                <div className="label mb-1">Template Type</div>
                <select
                  className="input"
                  value={record.templateType}
                  onChange={(e) => {
                    const v = e.target.value;
                    const d = templateDefaults(v);
                    setRecord(s => ({ ...s, templateType: v, description: d.description }));
                  }}
                >
                  <option value="THRIFT_CONTRIBUTION">Thrift contribution (4589)</option>
                  <option value="LOAN_DISBURSED">Loan disbursed (4588, negative)</option>
                  <option value="LOAN_REPAYMENT">Loan repayment (4588, positive)</option>
                </select>
              </div>
              <div>
                <div className="label mb-1">Amount</div>
                <input className="input" type="number" value={record.amount} onChange={(e) => setRecord(s => ({ ...s, amount: e.target.value }))} placeholder="e.g. 10000" />
              </div>
            </div>

            <div>
              <div className="label mb-1">Remark</div>
              <input className="input" value={record.remark} onChange={(e) => setRecord(s => ({ ...s, remark: e.target.value }))} placeholder="optional" />
            </div>

            <button className="btn-primary">Save record</button>
          </form>
        </Card>
      </div>

      <Card title="Records">
        <div className="grid sm:grid-cols-3 gap-2 mb-3">
          <input className="input" value={recordsQ} onChange={(e) => setRecordsQ(e.target.value)} placeholder="Search by SAP No." />
          <input className="input" type="date" value={recordsDate} onChange={(e) => setRecordsDate(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-primary" type="button" onClick={() => loadRecords().catch(e => setErr(e.message))} disabled={recordsLoading}>
              {recordsLoading ? "Loading…" : "Search"}
            </button>
            <button className="btn-ghost" type="button" onClick={deleteSelectedRecords} disabled={!selectedRecordIds.length}>
              Delete selected
            </button>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-600">
              <tr className="border-b">
                <th className="py-2 text-left">
                  <input
                    type="checkbox"
                    checked={allRecordsChecked}
                    onChange={(e) => toggleAllRecords(e.target.checked)}
                    title="Select all"
                  />
                </th>
                <th className="py-2 text-left">SAP No</th>
                <th className="py-2 text-left">Date</th>
                <th className="py-2 text-left">Description</th>
                <th className="py-2 text-left">Amount</th>
                <th className="py-2 text-left">Remark</th>
              </tr>
            </thead>
            <tbody>
              {recordsRows.map(r => (
                <tr key={r.record_id} className="border-b last:border-b-0">
                  <td className="py-2">
                    <input
                      type="checkbox"
                      checked={!!recordSel[r.record_id]}
                      onChange={(e) => setRecordSel(s => ({ ...s, [r.record_id]: e.target.checked }))}
                    />
                  </td>
                  <td className="py-2">{r.sap_no}</td>
                  <td className="py-2">{r.date}</td>
                  <td className="py-2">{r.description}</td>
                  <td className="py-2">{money(r.amount)}</td>
                  <td className="py-2">{r.remark || ""}</td>
                </tr>
              ))}
              {!recordsRows.length && !recordsLoading ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={6}>No records found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
