import { NextResponse } from "next/server";
import type { AuditReport } from "@/types/audit.types";
import { generateMarkdownReport } from "@/lib/audit/reportExport";
import { generatePdfReport } from "@/lib/audit/reportPdf";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "pdf";
    const report = (await request.json()) as AuditReport;

    if (!report?.id || !report?.domain || report.status !== "completed") {
      return NextResponse.json({ error: "Invalid or incomplete report" }, { status: 400 });
    }

    const dateStr = new Date().toISOString().slice(0, 10);

    if (format === "json") {
      return NextResponse.json(report);
    }

    if (format === "markdown" || format === "md") {
      const markdown = generateMarkdownReport(report);
      return new NextResponse(markdown, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="seo-audit-${report.domain}-${dateStr}.md"`,
        },
      });
    }

    const pdf = generatePdfReport(report);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="seo-audit-${report.domain}-${dateStr}.pdf"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 }
    );
  }
}
