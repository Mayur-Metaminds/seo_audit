import type { AuditReport } from "@/types/audit.types";

const KEY_PREFIX = "seo-audit:";

export function saveReportToSession(report: AuditReport): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(`${KEY_PREFIX}${report.id}`, JSON.stringify(report));
}

export function loadReportFromSession(id: string): AuditReport | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(`${KEY_PREFIX}${id}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuditReport;
  } catch {
    return null;
  }
}
