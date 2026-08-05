import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { AuditReport } from "@/types/audit.types";
import { FRAMEWORK_CHECKPOINTS, getGrade } from "@/data/framework";
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
  lightGray: [248, 249, 250] as [number, number, number],
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
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  function addPage() {
    doc.addPage();
    y = margin;
  }

  function checkSpace(needed: number) {
    if (y + needed > pageHeight - margin) {
      addPage();
    }
  }

  function heading(text: string, size: number, color = COLORS.dark) {
    checkSpace(size * 0.5 + 6);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.setFont("helvetica", "bold");
    doc.text(text, margin, y + size * 0.35);
    y += size * 0.45 + 3;
  }

  function bodyText(text: string, size = 9, color = COLORS.text) {
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(text, contentWidth);
    checkSpace(lines.length * (size * 0.35) + 2);
    doc.text(lines, margin, y + size * 0.3);
    y += lines.length * (size * 0.35) + 2;
  }

  function addFooter(pageNum: number, totalPages: number) {
    const footerY = pageHeight - 8;
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.setFont("helvetica", "normal");
    doc.text(`Metaminds SEO Audit Report — ${report.domain}`, margin, footerY);
    doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin, footerY, { align: "right" });
  }

  // ── Cover Banner ──
  const percentage =
    typeof report.scorePercentage === "number"
      ? report.scorePercentage
      : report.maxScore > 0
        ? Math.round((report.overallScore / report.maxScore) * 100)
        : 0;
  const gradeKey = getGrade(percentage);
  const gradeLabel = {
    elite: "Elite (90%+)",
    good: "Good (70-89%)",
    "needs-work": "Needs Work (50-69%)",
    critical: "Critical (<50%)",
  }[gradeKey];
  const gradeColor = {
    elite: COLORS.pass,
    good: COLORS.brand,
    "needs-work": COLORS.warn,
    critical: COLORS.fail,
  }[gradeKey];

  doc.setFillColor(...COLORS.dark);
  doc.rect(0, 0, pageWidth, 50, "F");

  doc.setFontSize(22);
  doc.setTextColor(...COLORS.white);
  doc.setFont("helvetica", "bold");
  doc.text("SEO Audit Report", margin, 20);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 190, 200);
  doc.text(report.url, margin, 29);
  doc.text(`${new Date(report.completedAt || report.startedAt).toLocaleDateString()} — Metaminds SEO Check`, margin, 37);

  // Score badge
  doc.setFillColor(...gradeColor);
  doc.roundedRect(pageWidth - margin - 40, 10, 40, 28, 3, 3, "F");
  doc.setFontSize(26);
  doc.setTextColor(...COLORS.white);
  doc.setFont("helvetica", "bold");
  doc.text(`${percentage}%`, pageWidth - margin - 20, 25, { align: "center" });
  doc.setFontSize(8);
  doc.text(gradeLabel, pageWidth - margin - 20, 33, { align: "center" });

  y = 58;

  // ── Executive Summary ──
  heading("Executive Summary", 14);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Metric", "Value"]],
    body: [
      ["Overall Score", `${report.overallScore} / ${report.maxScore} (${percentage}%)`],
      ["Grade", gradeLabel],
      ["Passed Checks", String(report.summary.passed)],
      ["Warning Checks", String(report.summary.warnings)],
      ["Failed Checks", String(report.summary.failed)],
      ["Manual Review Checks", String(report.summary.manual)],
      ["Pages Audited", String(report.pagesAudited)],
      ["Total Pages Discovered", String(report.totalPagesFound)],
    ],
    theme: "striped",
    headStyles: { fillColor: COLORS.dark, textColor: COLORS.white, fontSize: 8, fontStyle: "bold", cellPadding: 1.5 },
    bodyStyles: { fontSize: 8, textColor: COLORS.text, cellPadding: 1.2 },
    alternateRowStyles: { fillColor: COLORS.lightGray },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 } },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;

  // ── Priority Issues ──
  if (report.summary.topIssues.length > 0) {
    checkSpace(25);
    heading("Priority Issues for Developers", 12, COLORS.fail);

    const issueRows = report.summary.topIssues.map((issue) => [issue]);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Issue Description"]],
      body: issueRows,
      theme: "striped",
      headStyles: { fillColor: COLORS.fail, textColor: COLORS.white, fontSize: 8, fontStyle: "bold", cellPadding: 1.2 },
      bodyStyles: { fontSize: 8, textColor: COLORS.dark, cellPadding: 1.5 },
      alternateRowStyles: { fillColor: COLORS.lightGray },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  }

  // ── Remaining URLs ──
  const remaining = report.remainingUrls || [];
  if (remaining.length > 0) {
    checkSpace(25);
    heading(`Remaining Pages (${remaining.length} discovered)`, 12, COLORS.warn);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["#", "Discovered URL"]],
      body: remaining.slice(0, 25).map((u, i) => [String(i + 1), u]),
      theme: "striped",
      headStyles: { fillColor: COLORS.dark, textColor: COLORS.white, fontSize: 8, fontStyle: "bold", cellPadding: 1.2 },
      bodyStyles: { fontSize: 7, textColor: COLORS.text, cellPadding: 1.2 },
      alternateRowStyles: { fillColor: COLORS.lightGray },
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: contentWidth - 10 } },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;
    if (remaining.length > 25) {
      bodyText(`…and ${remaining.length - 25} more discovered URLs.`, 7.5, COLORS.muted);
    }
    y += 2;
  }

  // ── Category Breakdown ──
  checkSpace(35);
  heading("Category Breakdown", 13);

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
    headStyles: { fillColor: COLORS.dark, textColor: COLORS.white, fontSize: 8, fontStyle: "bold", cellPadding: 1.5 },
    bodyStyles: { fontSize: 8, textColor: COLORS.text, cellPadding: 1.5 },
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

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  // ── Detailed Findings ──
  for (const cat of report.categoryScores) {
    checkSpace(35);
    heading(cat.label, 11, COLORS.brand);

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
      headStyles: { fillColor: COLORS.dark, textColor: COLORS.white, fontSize: 7, fontStyle: "bold", cellPadding: 1.2 },
      bodyStyles: { fontSize: 7, textColor: COLORS.text, cellPadding: 1.2 },
      alternateRowStyles: { fillColor: COLORS.lightGray },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 32 },
        2: { cellWidth: 12 },
        3: { cellWidth: 14 },
        4: { cellWidth: 12 },
        5: { cellWidth: 42 },
        6: { cellWidth: contentWidth - 120 },
      },
      didParseCell: (data) => {
        if (data.column.index === 2 && data.section === "body") {
          const val = data.cell.text[0];
          data.cell.styles.textColor = statusColor(val.toLowerCase());
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  // ── Per-Page Results ──
  checkSpace(35);
  heading("Per-Page Results", 13);

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
    head: [["URL Path", "HTTP", "TTFB", "Size", "Issues", "Top Findings"]],
    body: pageRows,
    theme: "striped",
    headStyles: { fillColor: COLORS.dark, textColor: COLORS.white, fontSize: 7.5, fontStyle: "bold", cellPadding: 1.2 },
    bodyStyles: { fontSize: 7, textColor: COLORS.text, cellPadding: 1.2 },
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
