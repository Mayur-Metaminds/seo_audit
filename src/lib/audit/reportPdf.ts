import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { AuditReport } from "@/types/audit.types";
import { FRAMEWORK_CHECKPOINTS } from "@/data/framework";
import { formatBytes, formatMs } from "@/lib/utils/url";

const COLORS = {
  brand: [29, 155, 240] as [number, number, number],
  dark: [15, 20, 25] as [number, number, number],
  text: [51, 51, 51] as [number, number, number],
  muted: [120, 130, 140] as [number, number, number],
  pass: [0, 186, 124] as [number, number, number],
  warn: [255, 173, 31] as [number, number, number],
  fail: [244, 33, 46] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  lightGray: [245, 245, 245] as [number, number, number],
};

function statusColor(status: string): [number, number, number] {
  if (status === "pass") return COLORS.pass;
  if (status === "warn") return COLORS.warn;
  if (status === "fail") return COLORS.fail;
  return COLORS.muted;
}

function statusLabel(status: string): string {
  return { pass: "PASS", warn: "WARN", fail: "FAIL", na: "N/A", manual: "MANUAL" }[status] || status.toUpperCase();
}

export function generatePdfReport(report: AuditReport): Uint8Array {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  function addPage() {
    doc.addPage();
    y = margin;
  }

  function checkSpace(needed: number) {
    if (y + needed > doc.internal.pageSize.getHeight() - margin) addPage();
  }

  function heading(text: string, size: number, color = COLORS.dark) {
    checkSpace(size + 4);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.setFont("helvetica", "bold");
    doc.text(text, margin, y);
    y += size * 0.5 + 2;
  }

  function bodyText(text: string, size = 10, color = COLORS.text) {
    checkSpace(size + 2);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(text, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * (size * 0.4) + 2;
  }

  function divider() {
    checkSpace(4);
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;
  }

  function addFooter(pageNum: number, totalPages: number) {
    const footerY = doc.internal.pageSize.getHeight() - 8;
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.setFont("helvetica", "normal");
    doc.text(`Metaminds SEO Check — ${report.domain}`, margin, footerY);
    doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin, footerY, { align: "right" });
  }

  // ── Cover Section ──
  const percentage = report.maxScore > 0 ? Math.round((report.overallScore / report.maxScore) * 100) : 0;
  const gradeLabel = {
    elite: "Elite (90%+)",
    good: "Good (70-89%)",
    "needs-work": "Needs Work (50-69%)",
    critical: "Critical (<50%)",
  }[report.grade];
  const gradeColor = {
    elite: COLORS.pass,
    good: COLORS.brand,
    "needs-work": COLORS.warn,
    critical: COLORS.fail,
  }[report.grade];

  doc.setFillColor(...COLORS.dark);
  doc.rect(0, 0, pageWidth, 55, "F");

  doc.setFontSize(24);
  doc.setTextColor(...COLORS.white);
  doc.setFont("helvetica", "bold");
  doc.text("SEO Audit Report", margin, 22);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 190, 200);
  doc.text(report.url, margin, 32);
  doc.text(`${new Date(report.completedAt || report.startedAt).toLocaleDateString()} — Metaminds SEO Check`, margin, 40);

  // Score badge
  doc.setFillColor(...gradeColor);
  doc.roundedRect(pageWidth - margin - 42, 12, 42, 28, 3, 3, "F");
  doc.setFontSize(28);
  doc.setTextColor(...COLORS.white);
  doc.setFont("helvetica", "bold");
  doc.text(`${percentage}%`, pageWidth - margin - 21, 28, { align: "center" });
  doc.setFontSize(8);
  doc.text(gradeLabel, pageWidth - margin - 21, 36, { align: "center" });

  y = 65;

  // ── Executive Summary ──
  heading("Executive Summary", 16);
  y += 2;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Metric", "Value"]],
    body: [
      ["Overall Score", `${report.overallScore} / ${report.maxScore} (${percentage}%)`],
      ["Grade", gradeLabel],
      ["Passed", String(report.summary.passed)],
      ["Warnings", String(report.summary.warnings)],
      ["Failed", String(report.summary.failed)],
      ["Manual Review", String(report.summary.manual)],
      ["Pages Audited", String(report.pagesAudited)],
      ["Total Pages Found", String(report.totalPagesFound)],
    ],
    theme: "striped",
    headStyles: { fillColor: COLORS.dark, textColor: COLORS.white, fontSize: 9, fontStyle: "bold" },
    bodyStyles: { fontSize: 9, textColor: COLORS.text },
    alternateRowStyles: { fillColor: COLORS.lightGray },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 } },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ── Priority Issues ──
  if (report.summary.topIssues.length > 0) {
    heading("Priority Issues", 14, COLORS.fail);
    for (const issue of report.summary.topIssues) {
      bodyText(`• ${issue}`, 9);
    }
    y += 4;
  }

  // ── Category Breakdown ──
  heading("Category Breakdown", 14);
  y += 2;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Category", "Score", "Max", "%", "Status"]],
    body: report.categoryScores.map((cat) => [
      cat.label,
      String(cat.score),
      String(cat.maxScore),
      `${cat.percentage}%`,
      cat.percentage >= 80 ? "Good" : cat.percentage >= 60 ? "Needs Work" : "Critical",
    ]),
    theme: "striped",
    headStyles: { fillColor: COLORS.dark, textColor: COLORS.white, fontSize: 9, fontStyle: "bold" },
    bodyStyles: { fontSize: 9, textColor: COLORS.text },
    alternateRowStyles: { fillColor: COLORS.lightGray },
    didParseCell: (data) => {
      if (data.column.index === 4 && data.section === "body") {
        const val = data.cell.text[0];
        if (val === "Good") data.cell.styles.textColor = COLORS.pass;
        else if (val === "Needs Work") data.cell.styles.textColor = COLORS.warn;
        else data.cell.styles.textColor = COLORS.fail;
      }
    },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ── Detailed Findings ──
  for (const cat of report.categoryScores) {
    checkSpace(20);
    heading(cat.label, 13, COLORS.brand);
    y += 2;

    const rows = cat.checks.map((check) => {
      const cp = FRAMEWORK_CHECKPOINTS.find((f) => f.id === check.checkpointId);
      return [
        `#${check.checkpointId}`,
        cp?.name || "Check",
        statusLabel(check.status),
        cp?.priority?.toUpperCase() || "—",
        `${check.score}/${check.maxScore}`,
        check.message,
        check.recommendation || "—",
      ];
    });

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["#", "Check", "Status", "Priority", "Score", "Finding", "Recommendation"]],
      body: rows,
      theme: "striped",
      headStyles: { fillColor: COLORS.dark, textColor: COLORS.white, fontSize: 7, fontStyle: "bold" },
      bodyStyles: { fontSize: 7, textColor: COLORS.text, cellPadding: 1.5 },
      alternateRowStyles: { fillColor: COLORS.lightGray },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 30 },
        2: { cellWidth: 12 },
        3: { cellWidth: 14 },
        4: { cellWidth: 12 },
        5: { cellWidth: 40 },
        6: { cellWidth: contentWidth - 116 },
      },
      didParseCell: (data) => {
        if (data.column.index === 2 && data.section === "body") {
          const val = data.cell.text[0];
          data.cell.styles.textColor = statusColor(val.toLowerCase());
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  // ── Per-Page Results ──
  checkSpace(20);
  heading("Per-Page Results", 14);
  y += 2;

  const pageRows = report.pageResults.map((page) => [
    page.url.replace(/^https?:\/\/[^/]+/, ""),
    String(page.statusCode),
    formatMs(page.responseTimeMs),
    formatBytes(page.pageSizeBytes),
    page.issues.length > 0 ? String(page.issues.length) : "Clean",
    page.issues.slice(0, 3).join("; ") || "No issues",
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["URL", "HTTP", "TTFB", "Size", "Issues", "Top Findings"]],
    body: pageRows,
    theme: "striped",
    headStyles: { fillColor: COLORS.dark, textColor: COLORS.white, fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 7, textColor: COLORS.text, cellPadding: 1.5 },
    alternateRowStyles: { fillColor: COLORS.lightGray },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 12 },
      2: { cellWidth: 14 },
      3: { cellWidth: 14 },
      4: { cellWidth: 12 },
      5: { cellWidth: contentWidth - 97 },
    },
    didParseCell: (data) => {
      if (data.column.index === 4 && data.section === "body") {
        const val = data.cell.text[0];
        if (val === "Clean") data.cell.styles.textColor = COLORS.pass;
        else data.cell.styles.textColor = COLORS.fail;
      }
    },
  });

  // ── Add page numbers ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(i, totalPages);
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
