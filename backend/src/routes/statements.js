// backend/src/routes/statements.js
import { Router } from "express";
import PDFDocument from "pdfkit";
import { getDb, all, get } from "../db/sqlite.js";
import { requireAuth } from "../middleware/auth.js";

export const statementsRouter = Router();

/**
 * Sentence case:
 * - lowercases everything
 * - capitalizes first letter of each sentence
 */
function toSentenceCase(input = "") {
  const s = String(input ?? "").trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  const parts = lower.split(/([.!?]\s+)/);
  let out = "";
  for (const part of parts) {
    if (!part) continue;
    if (/^[.!?]\s+$/.test(part)) out += part;
    else out += part.charAt(0).toUpperCase() + part.slice(1);
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

/** Draw table header row */
function drawTableHeader(doc, x, y, cols, headerH) {
  doc.save();
  doc.font("Helvetica-Bold").fontSize(9);
  doc.rect(x, y, cols.totalW, headerH).stroke();

  let cx = x;
  for (const c of cols.list) {
    doc.rect(cx, y, c.w, headerH).stroke();
    doc.text(c.label, cx + 4, y + 6, { width: c.w - 8, align: c.align || "left" });
    cx += c.w;
  }
  doc.restore();
}

/**
 * Page break helper:
 * - if not enough space for row, add page
 * - IMPORTANT: on a new page we MUST start near the top margin,
 *   not at the old topY from page 1 (this caused your empty pages)
 */
function ensureSpace(doc, y, neededH, cols, headerH) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (y + neededH <= bottom) return y;

  doc.addPage();
  // start table near top margin on new page
  y = doc.page.margins.top;

  drawTableHeader(doc, doc.page.margins.left, y, cols, headerH);
  return y + headerH;
}

statementsRouter.get("/pdf", requireAuth, async (req, res, next) => {
  const db = getDb();
  try {
    const sap_no = req.user.sap_no;

    // Member details
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

    // Group by description + compute totals
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

    // Stream PDF
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="statement_${String(sap_no).replace(/[^a-zA-Z0-9_-]/g, "")}.pdf"`
    );

    const doc = new PDFDocument({
      size: "A4",
      margin: 36,
      info: { Title: `NBSC Statement - ${sap_no}` },
    });

    doc.pipe(res);

    // ===== Page Header (only once on page 1)
    doc.font("Helvetica-Bold").fontSize(13).text(
      "NIGERIAN BREWERIES STAFF COOPERATIVE – KADUNA",
      { align: "center" }
    );
    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(11).text("Member Statement", { align: "center" });
    doc.moveDown(0.8);

    doc.font("Helvetica").fontSize(9);
    doc.text(`Name: ${safeText(member?.full_name)}`);
    doc.text(`SAP No: ${sap_no}`);
    doc.text(`Phone: ${safeText(member?.phone_no)}`);
    doc.moveDown(0.8);

    // ===== Table layout
    const x = doc.page.margins.left;

    const cols = {
      list: [
        { label: "Date", w: 72, align: "left" },
        { label: "Description", w: 190, align: "left" },
        { label: "Amount (₦)", w: 92, align: "right" },
        { label: "Remark", w: 155, align: "left" },
      ],
      get totalW() {
        return this.list.reduce((s, c) => s + c.w, 0);
      },
    };

    const headerH = 22;

    // Table start Y on first page = current y
    let y = doc.y;

    drawTableHeader(doc, x, y, cols, headerH);
    y += headerH;

    // Row height calculator with correct font + width wrapping
    function rowHeightFor(row, isSubtotal) {
      doc.font(isSubtotal ? "Helvetica-Bold" : "Helvetica").fontSize(9);

      const padTop = 6;
      const padBottom = 6;

      const wDate = cols.list[0].w - 8;
      const wDesc = cols.list[1].w - 8;
      const wAmt = cols.list[2].w - 8;
      const wRem = cols.list[3].w - 8;

      const hDate = doc.heightOfString(row.date || "", { width: wDate });
      const hDesc = doc.heightOfString(row.description || "", { width: wDesc });
      const hAmt = doc.heightOfString(row.amountText || naira(row.amount || 0), { width: wAmt });
      const hRem = doc.heightOfString(row.remark || "", { width: wRem });

      const contentH = Math.max(hDate, hDesc, hAmt, hRem);
      return Math.max(18, contentH + padTop + padBottom);
    }

    function drawRow(row, isSubtotal = false) {
      // compute row height *before* page-break check
      const h = rowHeightFor(row, isSubtotal);

      y = ensureSpace(doc, y, h, cols, headerH);

      // subtotal background (light gray)
      if (isSubtotal) {
        doc.save();
        doc.rect(x, y, cols.totalW, h).fill("#F1F5F9");
        doc.restore();
      }

      // borders
      doc.rect(x, y, cols.totalW, h).stroke();

      let cx = x;

      const cell = (text, col, align = "left") => {
        doc.rect(cx, y, col.w, h).stroke();

        doc.font(isSubtotal ? "Helvetica-Bold" : "Helvetica")
          .fontSize(9)
          .fillColor("#0F172A")
          .text(text, cx + 4, y + 6, {
            width: col.w - 8,
            align,
            lineGap: 1,
          });

        cx += col.w;
      };

      cell(row.date || "", cols.list[0], "left");
      cell(row.description || "", cols.list[1], "left");
      cell(row.amountText || naira(row.amount || 0), cols.list[2], "right");
      cell(row.remark || "", cols.list[3], "left");

      y += h;
    }

    // Print groups + subtotal per description
    for (const g of groups) {
      for (const it of g.items) drawRow(it, false);

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

    doc.moveDown(1.2);
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
