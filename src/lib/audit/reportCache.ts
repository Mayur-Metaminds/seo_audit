import type { AuditReport } from "@/types/audit.types";

const DB_NAME = "seo-check";
const STORE_NAME = "reports";
const DB_VERSION = 1;

/** In-memory cache — primary path for same-tab navigation (no size quota). */
const memoryCache = new Map<string, AuditReport>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

async function idbPut(report: AuditReport): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("IndexedDB write failed"));
    };
    tx.objectStore(STORE_NAME).put(report);
  });
}

async function idbGet(id: string): Promise<AuditReport | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => {
      db.close();
      resolve((request.result as AuditReport) || null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error ?? new Error("IndexedDB read failed"));
    };
  });
}

/** Always keeps report in memory; IndexedDB is best-effort for refresh. */
export async function saveReport(report: AuditReport): Promise<void> {
  memoryCache.set(report.id, report);

  if (typeof window === "undefined" || typeof indexedDB === "undefined") return;

  try {
    await idbPut(report);
  } catch {
    // Quota or private mode — memory cache is enough for this session
  }
}

export async function loadReport(id: string): Promise<AuditReport | null> {
  const fromMemory = memoryCache.get(id);
  if (fromMemory) return fromMemory;

  if (typeof window === "undefined" || typeof indexedDB === "undefined") return null;

  try {
    const fromDb = await idbGet(id);
    if (fromDb) {
      memoryCache.set(id, fromDb);
      return fromDb;
    }
  } catch {
    // ignore
  }

  return null;
}

export function getReportFromMemory(id: string): AuditReport | null {
  return memoryCache.get(id) ?? null;
}
