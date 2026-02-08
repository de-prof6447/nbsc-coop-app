import { Router } from "express";
import PDFDocument from "pdfkit";
import { getDb, all } from "../db/sqlite.js";
import { requireAuth } from "../middleware/auth.js";

export const statementRouter = Router();

/** Sentence case (keeps normal words readable; doesn’t SHOUT) */
function toSentenceCase(s = "") {
  const t = String(s).trim();
  if (!t) return "";
  const lower = t.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function money(n) {
  const x = Number(n || 0);
  return x.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Draws a row with auto-wrapping + auto-height.
 * Prevents remark overlap and prevents “random blank pages”.
 */
function drawRow(doc, row, cols, y, pageBottom) {
  const paddingY = 6;

  // compute wrapped heights
  const heights = cols.map(c => {
    const text = String(row[c.key] ?? "");
    return doc.heightOfString(text, { width: c.w, align: c.align || "left" });
  });

  const rowH = Math.max(...heights) + paddingY * 2;

  // page break only when needed
  if (y + rowH > pageBottom) {
    doc.addPage();
    return null; // caller will re-render on new page
  }

  // cell text
  cols.forEach((c) => {
    const text = String(row[c.key] ?? "");
    doc.text(text, c.x, y + paddingY, { width: c.w, align: c.align || "left" });
  });

  // row separator line
  doc
    .moveTo(cols[0].x, y + rowH)
    .lineTo(cols[0].x + cols.reduce((a, c) => a + c.w, 0), y + rowH)
    .lineWidth(0.5)
    .strokeColor("#d0d7de")
    .stroke();

  return y + rowH;
}

/**
 * GET /api/statement/pdf?sap_no=100001 (admin)
 * GET /api/statement/pdf (member - uses logged in user)
 */
statementRouter.get("/pdf", requireAuth, async (req, res, next) => {
  try {
    const requester = req.user; // set by requireAuth
    const sap_no = (requester.role === "ADMIN" || requester.role === "SUPER ADMIN")
      ? (req.query.sap_no || requester.sap_no)
      : requester.sap_no;

    const db = getDb();
    try {
      const member = await all(db,
        "SELECT sap_no, full_name, phone_no FROM members WHERE sap_no = ?",
        [sap_no]
      );
      const m = member?.[0];
      if (!m) return res.status(404).json({ error: "Member not found" });

      // Fetch records
      const records = await all(
        db,
        `SELECT date, description, amount, remark
         FROM records
         WHERE sap_no = ?
         ORDER BY description ASC, date ASC`,
        [sap_no]
      );

      // Group by description + sum
      const groups = new Map();
      for (const r of records) {
        const desc = String(r.description || "").trim();
        const key = desc || "(No Description)";
        if (!groups.has(key)) groups.set(key, { desc: key, total: 0, rows: [] });
        const g = groups.get(key);
        g.total += Number(r.amount || 0);

        g.rows.push({
          date: r.date || "",
          description: key,
          amount: `₦${money(r.amount)}`,
          remark: toSentenceCase(r.remark || "")
        });
      }

      // Start PDF streaming (FAST)
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="statement_${sap_no}.pdf"`);

      const doc = new PDFDocument({ size: "A4", margin: 40 });
      doc.pipe(res);

      // Header
      doc.fontSize(12).font("Helvetica-Bold")
        .text("NIGERIAN BREWERIES STAFF COOPERATIVE – KADUNA", { align: "center" });
      doc.moveDown(0.2);
      doc.fontSize(11).font("Helvetica-Bold")
        .text("Member Statement", { align: "center" });
      doc.moveDown(0.8);

      doc.fontSize(9).font("Helvetica");
      doc.text(`Name: ${m.full_name || ""}`);
      doc.text(`SAP No: ${m.sap_no || ""}`);
      doc.text(`Phone: ${m.phone_no || ""}`);
      doc.moveDown(0.8);

      const pageBottom = doc.page.height - doc.page.margins.bottom;

      // Table columns (remark is wide + wraps)
      const startX = doc.page.margins.left;
      const cols = [
        { key: "date", x: startX, w: 80, align: "left" },
        { key: "description", x: startX + 80, w: 170, align: "left" },
        { key: "amount", x: startX + 80 + 170, w: 90, align: "right" },
        { key: "remark", x: startX + 80 + 170 + 90, w: 160, align: "left" },
      ];

      // Table header
      function renderTableHeader() {
        doc.fontSize(9).font("Helvetica-Bold");
        doc.text("Date", cols[0].x, doc.y, { width: cols[0].w });
        doc.text("Description", cols[1].x, doc.y, { width: cols[1].w });
        doc.text("Amount (₦)", cols[2].x, doc.y, { width: cols[2].w, align: "right" });
        doc.text("Remark", cols[3].x, doc.y, { width: cols[3].w });

        doc.moveDown(0.6);
        doc
          .moveTo(startX, doc.y)
          .lineTo(startX + cols.reduce((a, c) => a + c.w, 0), doc.y)
          .lineWidth(1)
          .strokeColor("#111827")
          .stroke();
        doc.moveDown(0.3);
        doc.font("Helvetica").fontSize(9);
      }

      renderTableHeader();

      // Render grouped rows: sorted by Description (already)
      for (const [desc, g] of groups.entries()) {
        // Group title + total (requested)
        const groupLine = `${desc} — Total: ₦${money(g.total)}`;
        if (doc.y + 18 > pageBottom) {
          doc.addPage();
          renderTableHeader();
        }
        doc.font("Helvetica-Bold").text(groupLine, { align: "left" });
        doc.font("Helvetica").moveDown(0.2);

        // rows
        let y = doc.y;
        for (const row of g.rows) {
          const nextY = drawRow(doc, row, cols, y, pageBottom);
          if (nextY === null) {
            // new page happened: re-render header and retry same row
            renderTableHeader();
            y = doc.y;
            const retryY = drawRow(doc, row, cols, y, pageBottom);
            y = retryY ?? doc.y;
          } else {
            y = nextY;
          }
        }
        doc.y = y + 8; // gap after group
      }

      doc.end();
    } finally {
      db.close();
    }
  } catch (e) {
    next(e);
  }
});
