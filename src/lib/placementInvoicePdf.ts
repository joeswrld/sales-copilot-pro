/**
 * placementInvoicePdf.ts
 *
 * Generates a formal, single-invoice PDF for a placement — client-side via
 * jsPDF (already a project dependency, see src/lib/adminExport.ts for the
 * existing multi-table admin-export use of the same library). This is a
 * separate generator from adminExport's exportPdf because that one is a
 * landscape multi-section table dump; an invoice needs a proper portrait
 * document layout (letterhead, bill-to block, single line item, totals).
 *
 * Currency: every field is rendered using *that invoice's own* `currency`
 * column (set at invoice-creation time from the placement's
 * placement_fee_currency, per PlacementsPage's existing convention — see
 * CreateInvoiceDrawer's defaultCurrency comment). Nothing here hardcodes a
 * currency; there is no global/team default applied.
 *
 * Two entry points:
 *   - downloadPlacementInvoicePdf(...) — generates and triggers a browser
 *     download (used by the "Download PDF" button on PlacementsPage).
 *   - buildPlacementInvoicePdfBase64(...) — generates and returns the same
 *     PDF as a base64 string with no filename/no download side effect
 *     (used to attach the identical document to the invoice email via the
 *     send-placement-invoice-email edge function).
 *
 * Both call the same internal renderInvoicePdf so the downloaded copy and
 * the emailed copy are always byte-identical for a given invoice.
 */

import jsPDF from "jspdf";

export interface PlacementInvoicePdfData {
  invoiceNumber: string | null;
  amount: number;
  currency: string;
  issuedDate: string | null;
  dueDate: string | null;
  status: string;
  notes: string | null;
  candidateName: string;
  jobTitle: string;
  clientName: string | null;
  teamName: string;
  recruiterName: string;
  recruiterEmail?: string | null;
}

function fmtMoney(amount: number, currency: string) {
  return `${currency || ""} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function renderInvoicePdf(data: PlacementInvoicePdfData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 48;
  let y = 56;

  // Letterhead
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(data.teamName || "Invoice", marginX, y);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110);
  y += 16;
  doc.text("Placement fee invoice", marginX, y);
  doc.setTextColor(0);

  // Invoice meta, right-aligned
  const metaX = pageWidth - marginX;
  let metaY = 56;
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("INVOICE", metaX, metaY, { align: "right" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  metaY += 18;
  doc.text(data.invoiceNumber ? `No. ${data.invoiceNumber}` : "No. —", metaX, metaY, { align: "right" });
  metaY += 14;
  doc.text(`Issued: ${fmtDate(data.issuedDate)}`, metaX, metaY, { align: "right" });
  metaY += 14;
  doc.text(`Due: ${fmtDate(data.dueDate)}`, metaX, metaY, { align: "right" });
  metaY += 14;
  doc.text(`Status: ${(data.status || "—").toUpperCase()}`, metaX, metaY, { align: "right" });

  y = Math.max(y, metaY) + 28;
  doc.setDrawColor(220);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 24;

  // Bill-to block
  doc.setFontSize(9);
  doc.setTextColor(130);
  doc.text("BILL TO", marginX, y);
  doc.setTextColor(0);
  y += 14;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(data.clientName || "Hiring Team", marginX, y);
  doc.setFont("helvetica", "normal");
  y += 26;

  // Line item table header
  doc.setFontSize(9);
  doc.setTextColor(130);
  doc.text("DESCRIPTION", marginX, y);
  doc.text("AMOUNT", pageWidth - marginX, y, { align: "right" });
  doc.setTextColor(0);
  y += 8;
  doc.setDrawColor(220);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 20;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`Placement fee — ${data.candidateName}`, marginX, y);
  doc.setFont("helvetica", "normal");
  doc.text(fmtMoney(data.amount, data.currency), pageWidth - marginX, y, { align: "right" });
  y += 16;
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`Role: ${data.jobTitle}`, marginX, y);
  doc.setTextColor(0);
  y += 28;

  doc.setDrawColor(220);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 22;

  // Total
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Total due", pageWidth - marginX - 110, y);
  doc.text(fmtMoney(data.amount, data.currency), pageWidth - marginX, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  y += 36;

  // Notes
  if (data.notes) {
    doc.setFontSize(9);
    doc.setTextColor(130);
    doc.text("NOTES", marginX, y);
    doc.setTextColor(0);
    y += 14;
    doc.setFontSize(10);
    const wrapped = doc.splitTextToSize(data.notes, pageWidth - marginX * 2);
    doc.text(wrapped, marginX, y);
    y += wrapped.length * 13 + 14;
  }

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 64;
  doc.setDrawColor(220);
  doc.line(marginX, footerY, pageWidth - marginX, footerY);
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`Issued by ${data.recruiterName}${data.teamName ? ", " + data.teamName : ""}`, marginX, footerY + 16);
  if (data.recruiterEmail) doc.text(data.recruiterEmail, marginX, footerY + 30);

  return doc;
}

/** Generates the invoice PDF and triggers a browser download. */
export function downloadPlacementInvoicePdf(data: PlacementInvoicePdfData) {
  const doc = renderInvoicePdf(data);
  const filename = `invoice-${data.invoiceNumber || "draft"}-${data.candidateName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;
  doc.save(filename);
}

/**
 * Generates the same invoice PDF and returns it as a base64 string (no
 * data: prefix) plus a suggested filename, for attaching to an outbound
 * email via an edge function. Never triggers a download itself.
 */
export function buildPlacementInvoicePdfBase64(data: PlacementInvoicePdfData): { base64: string; filename: string } {
  const doc = renderInvoicePdf(data);
  const filename = `invoice-${data.invoiceNumber || "draft"}-${data.candidateName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;
  // jsPDF's datauristring includes the "data:application/pdf;filename=...;base64," prefix — strip to raw base64.
  const dataUri = doc.output("datauristring");
  const base64 = dataUri.substring(dataUri.indexOf(",") + 1);
  return { base64, filename };
}