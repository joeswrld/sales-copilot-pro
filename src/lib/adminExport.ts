import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export function exportCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

export function exportJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  triggerDownload(blob, filename.endsWith(".json") ? filename : `${filename}.json`);
}

export function exportPdf(
  title: string,
  sections: { heading: string; rows: Record<string, unknown>[] }[],
  filename: string,
) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(16);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, 22);

  let cursorY = 30;
  for (const section of sections) {
    if (!section.rows.length) continue;
    const head = [Object.keys(section.rows[0])];
    const body = section.rows.map((r) => head[0].map((k) => String(r[k] ?? "")));
    doc.setFontSize(12);
    doc.text(section.heading, 14, cursorY);
    autoTable(doc, {
      startY: cursorY + 3,
      head,
      body,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 23, 42] },
    });
    // @ts-expect-error autoTable adds finalY
    cursorY = (doc.lastAutoTable?.finalY ?? cursorY + 30) + 10;
    if (cursorY > 180) {
      doc.addPage();
      cursorY = 20;
    }
  }
  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
