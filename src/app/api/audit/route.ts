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
      return Response.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 });
    }

    const { url, error } = await validateAuditUrl(parsed.data.url);
    if (error) {
      return Response.json({ error }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: unknown) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        };

        try {
          const report = await runAudit(
            url,
            {
              maxPages: parsed.data.maxPages || Infinity,
              includeSubdomains: false,
              followExternalLinks: false,
            },
            (progress) => send({ type: "progress", ...progress })
          );

          if (report.status === "failed") {
            send({ type: "error", error: report.error || "Audit failed" });
          } else {
            send({ type: "complete", report });
          }
        } catch (err) {
          send({
            type: "error",
            error: err instanceof Error ? err.message : "Failed to run audit",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to run audit" },
      { status: 500 }
    );
  }
}
