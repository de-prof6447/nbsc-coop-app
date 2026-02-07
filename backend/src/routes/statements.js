import { Router } from "express";
import PDFDocument from "pdfkit";
import { getDb, all, get } from "../db/sqlite.js";
import { requireAuth } from "../middleware/auth.js";

export const statementsRouter = Router();

function classify(description, amount) {
  const desc = String(description || "").toLowerCase();
  if (desc.includes("4589") && desc.includes("thrift")) return "THRIFT_CONTRIBUTION";
  if (desc.includes("4588") && desc.includes("loan")) {
    if (Number(amount) < 0) return "LOAN_DISBURSED";
    if (Number(amount) > 0) return "LOAN_REPAYMENT";
    return "LOAN";
  }
  return "OTHER";
}

function computeSummary(rows) {
  const thriftTotal = rows
    .filter(r => classify(r.description, r.amount) === "THRIFT_CONTRIBUTION")
    .reduce((s, r) => s + Number(r.amount || 0), 0);

  const loanDisbursed = rows
    .filter(r => classify(r.description, r.amount) === "LOAN_DISBURSED")
    .reduce((s, r) => s + (-Number(r.amount || 0)), 0); // amount is negative

  const loanRepaid = rows
    .filter(r => classify(r.description, r.amount) === "LOAN_REPAYMENT")
    .reduce((s, r) => s + Number(r.amount || 0), 0);

  const loanBalance = Math.max(0, loanDisbursed - loanRepaid);

  return { thriftTotal, loanDisbursed, loanRepaid, loanBalance };
}


/**
 * GET /api/statements/pdf
 * - Member: generates own statement.
 * - Admin: can pass ?sap_no=...
 */
statementsRouter.get("/pdf", requireAuth, async (req, res, next) => {
  try {
    const sap_no = req.user.role === "ADMIN"
      ? (req.query.sap_no?.toString() || req.user.sap_no)
      : req.user.sap_no;

    const db = getDb();
    try {
      const member = await get(db, "SELECT sap_no, full_name, phone_no FROM members WHERE sap_no=?", [sap_no]);
      if (!member) return res.status(404).json({ error: "Member not found" });

      const rows = await all(db, "SELECT date, description, amount, remark FROM records_import WHERE sap_no=? ORDER BY date ASC, record_id ASC", [sap_no]);
      const summary = computeSummary(rows);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="NBSC_Statement_${sap_no}.pdf"`);

      const doc = new PDFDocument({ margin: 40 });
      doc.pipe(res);

      doc.fontSize(16).text("NIGERIAN BREWERIES STAFF COOPERATIVE – KADUNA", { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(12).text("Member Statement", { align: "center" });
      doc.moveDown();

      doc.fontSize(11).text(`Name: ${member.full_name}`);
      doc.text(`SAP No: ${member.sap_no}`);
      if (member.phone_no) doc.text(`Phone: ${member.phone_no}`);
      doc.moveDown();

      doc.fontSize(11).text(`Total Thrift: ₦${summary.thriftTotal.toFixed(2)}`);
      doc.text(`Total Loan Collected: ₦${summary.loanDisbursed.toFixed(2)}`);
      doc.text(`Total Loan Repaid: ₦${summary.loanRepaid.toFixed(2)}`);
      doc.text(`Loan Balance: ₦${summary.loanBalance.toFixed(2)}`);
      doc.moveDown();

      doc.fontSize(11).text("Transactions", { underline: true });
      doc.moveDown(0.5);

      // Simple table
      const startX = 40;
      let y = doc.y;
      // Match records_import template columns (date, description, amount, remark)
      const colW = [90, 220, 90, 150];
      const headers = ["Date", "Description", "Amount (₦)", "Remark"];
      doc.fontSize(10);

      function row(cells, isHeader=false) {
        let x = startX;
        for (let i = 0; i < cells.length; i++) {
          doc.font(isHeader ? "Helvetica-Bold" : "Helvetica");
          doc.text(String(cells[i] ?? ""), x, y, { width: colW[i], continued: false });
          x += colW[i];
        }
        y += isHeader ? 16 : 14;
        if (y > 750) { doc.addPage(); y = 40; }
      }

      row(headers, true);
      doc.moveTo(40, y-2).lineTo(550, y-2).stroke();
      y += 6;

      for (const r of rows) {
        const amt = Number(r.amount || 0);
        row([r.date, r.description, amt.toFixed(2), r.remark || ""], false);
      }

      doc.end();
    } finally { db.close(); }
  } catch (e) { next(e); }
});
