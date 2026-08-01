export interface AuditProgressEvent {
  phase:
    | "initializing"
    | "crawling"
    | "security"
    | "rendering"
    | "pagespeed"
    | "auditing"
    | "grammar"
    | "finalizing"
    | "complete"
    | "failed";
  current: number;
  total: number;
  remaining: number;
  discovered: number;
  percent: number;
  url?: string;
  message: string;
}

export type ProgressCallback = (event: AuditProgressEvent) => void;
