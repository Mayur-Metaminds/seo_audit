import { NextResponse } from "next/server";
import { z } from "zod";
import { runAudit } from "@/lib/audit/runAudit";
import { validateAuditUrl } from "@/lib/utils/validateUrl";

export const maxDuration = 300;
export const runtime = "nodejs";

const startAuditSchema = z.object({
  url: z.string().min(1, "URL is required"),
  maxPages: z.number().min(1).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = startAuditSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 });
    }

    const { url, error } = await validateAuditUrl(parsed.data.url);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    const auditId = await runAudit(url, {
      maxPages: parsed.data.maxPages || Infinity,
      includeSubdomains: false,
      followExternalLinks: false,
    });

    return NextResponse.json({ id: auditId, message: "Audit started" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start audit" },
      { status: 500 }
    );
  }
}
