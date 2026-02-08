import { Router } from "express";
import PDFDocument from "pdfkit";
import { getDb, all, get } from "../db/sqlite.js";
import { requireAuth } from "../middleware/auth.js";

export const statementsRouter = Router();

/**
 * Sentence case:
 * - lowercases everything
 * - capitalizes the first letter of each sentence
 */
function toSentenceCase(input = "") {
  const s = String(input).trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  // Split keeping punctuation blocks
  const parts = lower.split(/([.!?]\s+)/);
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    if (/^[.!?]\s+$/.test(part)) {
      out += part;
    } else {
      out += part.charAt(0).toUpperCase() + part.slice(1);
    }
  }
  return out;
}

function naira(n) {
  const v = Number(n || 0);
  return `₦${v.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function safeText(v) {
  return v == null ? "" : String(v);
}

/**
 * Draw a table header row
 */
function drawTableHeader(doc, x, y, cols, rowH) {
  doc.font("Helvetica-Bold").fontSize(9);
  doc.rect(x, y, cols.totalW, rowH).stroke();
  let cx = x;
  for (const c of cols.list) {
    doc.text(c.label, cx + 4, y + 6, { width: c.w - 8, align: c.align || "left" });
    doc.rect(cx, y, c.w, rowH).stroke();
    cx += c.w;
  }
  doc.font("Helvetica").fontSize(9);
}

/**
 * Ensure there's space for the next row; if not, add page and redraw header
 */
function ensureSpace(doc, y, neededH, topY, cols, headerH) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (y + neededH <= bottom) return y;

  doc.addPage();
  y = topY;
  drawTableHeader(doc, doc.page.margins.left, y, cols, headerH);
  return y + headerH;
}

statementsRouter.get("/pdf", requireAuth, async (req, res, next) => {
  const db = getDb();
  try {
    const sap_no = req.user.sap_no;

    // 1) Load member + records (single pass)
    const member = await get(
      db,
      "SELECT sap_no, full_name, phone_no FROM members WHERE sap_no = ?",
      [sap_no]
    );

    // Sort by Description (case-insensitive), then Date
    const rows = await all(
      db,
      `
      SELECT date, description, amount, remark
      FROM records
      WHERE sap_no = ?
      ORDER BY description COLLATE NOCASE ASC, date ASC
      `,
      [sap_no]
    );

    // 2) Group by description + compute totals
    const groups = [];
    const map = new Map();
    for (const r of rows) {
      const key = safeText(r.description).trim();
      if (!map.has(key)) {
        const g = { description: key, total: 0, items: [] };
        map.set(key, g);
        groups.push(g);
      }
      const g = map.get(key);
      const amt = Number(r.amount || 0);
      g.total += amt;
      g.items.push({
        date: safeText(r.date),
        description: safeText(r.description),
        amount: amt,
        remark: toSentenceCase(safeText(r.remark)),
      });
    }

    // 3) Stream PDF (fast)
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="statement_${sap_no}.pdf"`);

    const doc = new PDFDocument({
      size: "A4",
      margin: 36,
      info: { Title: `NBSC Statement - ${sap_no}` },
    });

    doc.pipe(res);

    // ----- Header
    doc.font("Helvetica-Bold").fontSize(13).text("NIGERIAN BREWERIES STAFF COOPERATIVE – KADUNA", {
      align: "center",
    });
    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(11).text("Member Statement", { align: "center" });
    doc.moveDown(0.8);

    doc.font("Helvetica").fontSize(9);
    doc.text(`Name: ${safeText(member?.full_name)}`);
    doc.text(`SAP No: ${sap_no}`);
    doc.text(`Phone: ${safeText(member?.phone_no)}`);
    doc.moveDown(0.6);

    // ----- Table layout
    const x = doc.page.margins.left;
    const topY = doc.y;

    const cols = {
      list: [
        { label: "Date", w: 70, align: "left" },
        { label: "Description", w: 190, align: "left" },
        { label: "Amount (₦)", w: 90, align: "right" },
        { label: "Remark", w: 160, align: "left" },
      ],
      get totalW() {
        return this.list.reduce((s, c) => s + c.w, 0);
      },
    };

    const headerH = 22;
    let y = topY;

    // Draw header once
    drawTableHeader(doc, x, y, cols, headerH);
    y += headerH;

    // Helper to compute row height based on wrapped text
    function rowHeightFor(row) {
      const padding = 10;
      const hDate = doc.heightOfString(row.date, { width: cols.list[0].w - 8 });
      const hDesc = doc.heightOfString(row.description, { width: cols.list[1].w - 8 });
      const hAmt = doc.heightOfString(naira(row.amount), { width: cols.list[2].w - 8 });
      const hRem = doc.heightOfString(row.remark, { width: cols.list[3].w - 8 });
      const max = Math.max(hDate, hDesc, hAmt, hRem);
      return Math.max(18, max + padding);
    }

    function drawRow(row, isSubtotal = false) {
      const h = rowHeightFor(row);
      y = ensureSpace(doc, y, h, topY, cols, headerH);

      // Background for subtotal
      if (isSubtotal) {
        doc.save();
        doc.rect(x, y, cols.totalW, h).fill("#F1F5F9"); // light slate
        doc.restore();
      }

      doc.rect(x, y, cols.totalW, h).stroke();

      let cx = x;

      // Date
      doc.rect(cx, y, cols.list[0].w, h).stroke();
      doc.font(isSubtotal ? "Helvetica-Bold" : "Helvetica")
        .text(row.date, cx + 4, y + 6, { width: cols.list[0].w - 8 });
      cx += cols.list[0].w;

      // Description
      doc.rect(cx, y, cols.list[1].w, h).stroke();
      doc.font(isSubtotal ? "Helvetica-Bold" : "Helvetica")
        .text(row.description, cx + 4, y + 6, { width: cols.list[1].w - 8 });
      cx += cols.list[1].w;

      // Amount
      doc.rect(cx, y, cols.list[2].w, h).stroke();
      doc.font(isSubtotal ? "Helvetica-Bold" : "Helvetica")
        .text(row.amountText || naira(row.amount), cx + 4, y + 6, {
          width: cols.list[2].w - 8,
          align: "right",
        });
      cx += cols.list[2].w;

      // Remark (WRAPPED — stops overlap)
      doc.rect(cx, y, cols.list[3].w, h).stroke();
      doc.font(isSubtotal ? "Helvetica-Bold" : "Helvetica")
        .text(row.remark, cx + 4, y + 6, {
          width: cols.list[3].w - 8,
          align: "left",
        });

      y += h;
    }

    // 4) Print groups + subtotal per description
    for (const g of groups) {
      // Group rows
      for (const it of g.items) drawRow(it);

      // Subtotal row under that description
      drawRow(
        {
          date: "",
          description: `Subtotal: ${g.description}`,
          amount: 0,
          amountText: naira(g.total),
          remark: "",
        },
        true
      );
    }

    doc.moveDown(1.5);
    doc.font("Helvetica").fontSize(8).fillColor("#64748B").text(
      `Generated: ${new Date().toLocaleString("en-NG")}`,
      { align: "right" }
    );

    doc.end();
  } catch (e) {
    next(e);
  } finally {
    db.close();
  }
});
