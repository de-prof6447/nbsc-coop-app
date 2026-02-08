// backend/src/routes/statement.js
import { Router } from "express";
import PDFDocument from "pdfkit";
import { getDb, all, get } from "../db/sqlite.js";
import { requireAuth } from "../middleware/auth.js";

export const statementRouter = Router();

// Helpers
function toSentenceCase(input = "") {
  const s = String(input).trim().replace(/\s+/g, " ");
  if (!s) return "";
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function money(n) {
  const num = Number(n || 0);
  return num.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function safeText(v) {
  return (v === null || v === undefined) ? "" : String(v);
}

statementRouter.get("/pdf", requireAuth, async (req, res, next) => {
  let db;
  try {
    const sapNo = req.user.sap_no;

    db = getDb();

    // Pull member header info
    const member = await get(
      db,
      "SELECT full_name, sap_no, phone_no FROM members WHERE sap_no=?",
      [sapNo]
    );

    // Pull records (ORDER BY description so grouping is easy)
    const rows = await all(
      db,
      `SELECT date, description, amount, remark
       FROM records
       WHERE sap_no=?
       ORDER BY description COLLATE NOCASE ASC, date ASC, rowid ASC`,
      [sapNo]
    );

    // Response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="NBSC-Statement-${sapNo}.pdf"`);

    // Create PDF
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 36, left: 36, right: 36, bottom: 36 },
      bufferPages: false
    });

    doc.pipe(res);

    // Layout constants
    const pageWidth = doc.page.width;
    const left = doc.page.margins.left;
    const right = pageWidth - doc.page.margins.right;
    const top = doc.page.margins.top;
    const bottom = doc.page.height - doc.page.margins.bottom;

    const colDateW = 70;
    const colDescW = 170;
    const colAmtW = 90;
    const colRemarkW = (right - left) - (colDateW + colDescW + colAmtW);

    const xDate = left;
    const xDesc = xDate + colDateW;
    const xAmt = xDesc + colDescW;
    const xRemark = xAmt + colAmtW;

    const lineGap = 2;

    function ensureSpace(heightNeeded) {
      // Only add a page when we truly don't fit
      if (doc.y + heightNeeded <= bottom) return;
      doc.addPage();
      drawHeader(false);
      drawTableHeader();
    }

    function drawHeader(showMember = true) {
      doc.fontSize(14).font("Helvetica-Bold").text("NIGERIAN BREWERIES STAFF COOPERATIVE – KADUNA", left, top, {
        width: right - left,
        align: "center"
      });

      doc.moveDown(0.2);
      doc.fontSize(11).font("Helvetica-Bold").text("Member Statement", {
        width: right - left,
        align: "center"
      });

      doc.moveDown(0.8);

      if (showMember) {
        doc.fontSize(9).font("Helvetica");
        doc.text(`Name: ${safeText(member?.full_name)}`, left);
        doc.text(`SAP No: ${safeText(member?.sap_no || sapNo)}`, left);
        doc.text(`Phone: ${safeText(member?.phone_no)}`, left);
        doc.moveDown(0.8);
      }
    }

    function drawTableHeader() {
      const y = doc.y;
      doc.fontSize(9).font("Helvetica-Bold");

      doc.text("Date", xDate, y, { width: colDateW });
      doc.text("Description", xDesc, y, { width: colDescW });
      doc.text("Amount (₦)", xAmt, y, { width: colAmtW, align: "right" });
      doc.text("Remark", xRemark, y, { width: colRemarkW });

      doc.moveDown(0.3);
      doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor("#999").stroke();
      doc.moveDown(0.4);
      doc.font("Helvetica").fillColor("black");
    }

    function drawGroupTitle(title) {
      ensureSpace(18);
      doc.fontSize(10).font("Helvetica-Bold").text(title, left, doc.y, { width: right - left });
      doc.moveDown(0.2);
      doc.font("Helvetica");
    }

    function drawSubtotal(total) {
      ensureSpace(18);
      doc.moveDown(0.2);
      doc.fontSize(9).font("Helvetica-Bold");
      doc.text("Subtotal:", xAmt, doc.y, { width: colAmtW, align: "right" });
      doc.text(money(total), xRemark, doc.y, { width: colRemarkW, align: "left" });
      doc.font("Helvetica");
      doc.moveDown(0.4);
      doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor("#ddd").stroke();
      doc.moveDown(0.5);
    }

    function drawRow(r) {
      const dateTxt = safeText(r.date);
      const descTxt = safeText(r.description);
      const amtTxt = money(r.amount);
      const remarkTxt = toSentenceCase(safeText(r.remark));

      doc.fontSize(8).font("Helvetica");

      // Calculate row height based on remark wrapping
      const remarkH = doc.heightOfString(remarkTxt, {
        width: colRemarkW,
        align: "left"
      });

      const descH = doc.heightOfString(descTxt, { width: colDescW });
      const dateH = doc.heightOfString(dateTxt, { width: colDateW });
      const baseH = Math.max(remarkH, descH, dateH);

      const rowH = baseH + 6; // padding

      ensureSpace(rowH + 6);

      const y = doc.y;

      doc.text(dateTxt, xDate, y, { width: colDateW });
      doc.text(descTxt, xDesc, y, { width: colDescW });
      doc.text(amtTxt, xAmt, y, { width: colAmtW, align: "right" });
      doc.text(remarkTxt, xRemark, y, { width: colRemarkW, align: "left" });

      // advance y by computed height (prevents overlap + prevents random blank pages)
      doc.y = y + rowH;

      // light row line
      doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor("#eee").stroke();
      doc.moveDown(0.2);
    }

    // Start document
    drawHeader(true);
    drawTableHeader();

    // Group by description + subtotal
    let currentDesc = null;
    let subtotal = 0;

    for (const r of rows) {
      const desc = safeText(r.description);

      if (currentDesc === null) {
        currentDesc = desc;
        drawGroupTitle(currentDesc);
      } else if (desc.toLowerCase() !== currentDesc.toLowerCase()) {
        // close previous group
        drawSubtotal(subtotal);
        subtotal = 0;
        currentDesc = desc;
        drawGroupTitle(currentDesc);
      }

      subtotal += Number(r.amount || 0);
      drawRow(r);
    }

    if (currentDesc !== null) {
      drawSubtotal(subtotal);
    }

    // Footer
    ensureSpace(30);
    doc.moveDown(0.8);
    doc.fontSize(8).fillColor("#666").text(`© ${new Date().getFullYear()} NBSC Kaduna`, left, doc.y, {
      width: right - left,
      align: "center"
    });

    doc.end();
  } catch (e) {
    next(e);
  } finally {
    try { db?.close?.(); } catch {}
  }
});
