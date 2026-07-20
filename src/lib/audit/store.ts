import type { AuditReport } from "@/types/audit.types";

const store = new Map<string, AuditReport>();

export async function saveReport(report: AuditReport): Promise<void> {
  store.set(report.id, report);
}

export async function getReport(id: string): Promise<AuditReport | undefined> {
  return store.get(id);
}

export async function updateReport(
  id: string,
  updates: Partial<AuditReport>
): Promise<AuditReport | undefined> {
  const existing = store.get(id);
  if (!existing) return undefined;
  const updated = { ...existing, ...updates };
  store.set(id, updated);
  return updated;
}
