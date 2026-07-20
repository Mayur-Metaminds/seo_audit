import { NextResponse } from "next/server";
import { getReport } from "@/lib/audit/store";
import { generateMarkdownReport } from "@/lib/audit/reportExport";
import { generatePdfReport } from "@/lib/audit/reportPdf";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await getReport(id);

  if (!report) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  if (report.status !== "completed") {
    return NextResponse.json({ error: "Audit not yet completed" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "pdf";
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
}
