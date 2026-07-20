import { AuditReportView } from "@/components/audit/AuditReportView";

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <AuditReportView auditId={id} />;
}
