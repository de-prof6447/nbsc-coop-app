// backend/src/routes/statement.js
import { Router } from "express";
import PDFDocument from "pdfkit";
import { getDb, all, get } from "../db/sqlite.js";
import { requireAuth } from "../middleware/auth.js";

export const statementRouter = Router();

/**
 * Convert remark to sentence case (no ALL CAPS).
 * Keeps numbers/symbols, just normalizes letters.
 */
function toSentenceCase(input) {
  if (!input) return "";
  const s = String(input).trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function money(n) {
  const x = Number(n || 0);
  return x.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Draw table header
 */
function drawHeader(doc, x, y, col) {
  doc.font("Helvetica-Bold").fontSize(9);
  doc.text("Date", x + col.date.x, y, { width: col.date.w });
  doc.text("Description", x + col.desc.x, y, { width: col.desc.w });
  doc.text("Amount (₦)", x + col.amt.x, y, { width: col.amt.w, align: "right" });
  doc.text("Remark", x + col.rem.x, y, { width: col.rem.w });

  doc
    .moveTo(x, y + 14)
    .lineTo(x + col.totalW, y + 14)
    .strokeColor("#cbd5e1")
    .stroke();

  doc.font("Helvetica").fontSize(9);
  return y + 18;
}

/**
 * Ensures a new page when needed, and redraws header on new page.
 */
function ensureSpace(doc, y, needed, pageBottom, x, tableTopY, col) {
  if (y + needed <= pageBottom) return y;

  doc.addPage();
  const top = doc.page.margins.top;

  // re-draw table header on new page
  let newY = top;
  newY = drawHeader(doc, x, newY, col);
  return newY;
}

statementRouter.get("/pdf", requireAuth, async (req, res, next) => {
  const db = getDb();

  try {
    // Allow SUPER ADMIN to print for any sap_no (optional)
    const sapNo = (req.user?.role === "SUPER ADMIN" && req.query.sap_no)
      ? String(req.query.sap_no)
      : req.user.sap_no;

    // 1) Member details
    const member = await get(
      db,
      `SELECT sap_no, full_name, phone_no FROM members WHERE sap_no = ?`,
      [sapNo]
    );

    // 2) Records sorted by description (then date)
    const rows = await all(
      db,
      `
      SELECT
        date,
        description,
        amount,
        remark
      FROM records
      WHERE sap_no = ?
      ORDER BY
        description COLLATE NOCASE ASC,
        date ASC
      `,
      [sapNo]
    );

    // Stream PDF (fast + low memory)
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="NBSC-Statement-${sapNo}.pdf"`
    );

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 36, left: 36, right: 36, bottom: 36 },
      bufferPages: false
    });

    doc.pipe(res);

    // ====== Title block ======
    doc.font("Helvetica-Bold").fontSize(12).text("NIGERIAN BREWERIES STAFF COOPERATIVE – KADUNA", {
      align: "center"
    });

    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(11).text("Member Statement", { align: "center" });
    doc.moveDown(0.8);

    doc.font("Helvetica").fontSize(9);
    doc.text(`Name: ${member?.full_name || "N/A"}`);
    doc.text(`SAP No: ${member?.sap_no || sapNo}`);
    doc.text(`Phone: ${member?.phone_no || "N/A"}`);
    doc.moveDown(0.6);

    // ====== Table layout ======
    const x = doc.page.margins.left;
    let y = doc.y;

    const pageBottom = doc.page.height - doc.page.margins.bottom;

    // Column widths (remark is wide; prevents overlap)
    const col = {
      date: { x: 0, w: 70 },
      desc: { x: 75, w: 190 },
      amt:  { x: 270, w: 90 },
      rem:  { x: 365, w: (doc.page.width - doc.page.margins.left - doc.page.margins.right) - 365 },
    };
    col.totalW = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // Table header
    y = drawHeader(doc, x, y, col);

    // ====== Group by description + subtotal ======
    let currentDesc = null;
    let groupTotal = 0;
    let grandTotal = 0;

    const rowPadY = 6;

    const flushSubtotal = () => {
      if (!currentDesc) return;

      // subtotal line
      const lineH = 14;
      y = ensureSpace(doc, y, lineH + 6, pageBottom, x, 0, col);

      doc.font("Helvetica-Bold").fontSize(9);
      doc.text("Subtotal", x + col.desc.x, y, { width: col.desc.w });
      doc.text(money(groupTotal), x + col.amt.x, y, { width: col.amt.w, align: "right" });

      y += lineH;

      // divider
      doc
        .moveTo(x, y)
        .lineTo(x + col.totalW, y)
        .strokeColor("#e2e8f0")
        .stroke();

      y += 6;

      groupTotal = 0;
      doc.font("Helvetica").fontSize(9);
    };

    for (const r of rows) {
      const desc = (r.description || "").trim();

      // On new group: print group heading + flush previous subtotal
      if (currentDesc !== desc) {
        flushSubtotal();
        currentDesc = desc;

        const groupH = 16;
        y = ensureSpace(doc, y, groupH + 4, pageBottom, x, 0, col);

        doc.font("Helvetica-Bold").fontSize(9);
        doc.text(currentDesc || "No description", x, y, { width: col.totalW });
        y += groupH;

        doc.font("Helvetica").fontSize(9);
      }

      const date = r.date || "";
      const amt = Number(r.amount || 0);
      const remark = toSentenceCase(r.remark || "");

      // Measure heights to avoid overlap (remark wraps)
      const hDate = doc.heightOfString(date, { width: col.date.w });
      const hDesc = doc.heightOfString(desc, { width: col.desc.w });
      const hAmt  = doc.heightOfString(money(amt), { width: col.amt.w });
      const hRem  = doc.heightOfString(remark, { width: col.rem.w });

      const rowH = Math.max(14, hDate, hDesc, hAmt, hRem) + rowPadY;

      y = ensureSpace(doc, y, rowH, pageBottom, x, 0, col);

      // Draw row cells
      doc.text(date, x + col.date.x, y, { width: col.date.w });
      doc.text(desc, x + col.desc.x, y, { width: col.desc.w });
      doc.text(money(amt), x + col.amt.x, y, { width: col.amt.w, align: "right" });
      doc.text(remark, x + col.rem.x, y, { width: col.rem.w });

      // Row divider
      doc
        .moveTo(x, y + rowH - 2)
        .lineTo(x + col.totalW, y + rowH - 2)
        .strokeColor("#f1f5f9")
        .stroke();

      y += rowH;

      groupTotal += amt;
      grandTotal += amt;
    }

    // Final subtotal + grand total
    flushSubtotal();

    const grandH = 18;
    y = ensureSpace(doc, y, grandH + 10, pageBottom, x, 0, col);
    doc.font("Helvetica-Bold").fontSize(10);
    doc.text("Grand Total", x + col.desc.x, y, { width: col.desc.w });
    doc.text(money(grandTotal), x + col.amt.x, y, { width: col.amt.w, align: "right" });
    y += grandH;

    // Footer note
    doc.moveDown(0.8);
    doc.font("Helvetica").fontSize(8).fillColor("#64748b");
    doc.text("Generated by NBSC Kaduna Portal", { align: "center" });

    doc.end();
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});
