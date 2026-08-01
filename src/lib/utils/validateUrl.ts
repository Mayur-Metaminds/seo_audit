import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { normalizeUrl } from "./url";

function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip === "127.0.0.1" || ip === "0.0.0.0") return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("169.254.")) return true;
  if (ip.startsWith("172.")) {
    const second = Number.parseInt(ip.split(".")[1] || "0", 10);
    if (second >= 16 && second <= 31) return true;
  }
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
  return false;
}

export function isLocalhostAllowed(): boolean {
  const raw = (
    process.env.ALLOW_LOCALHOST ||
    process.env.ALLOW_LOCALHOST_AUDIT ||
    process.env.AUDIT_ALLOW_LOCALHOST ||
    ""
  ).trim().toLowerCase();
  return raw === "true" || raw === "1";
}

export async function validateAuditUrl(input: string): Promise<{ url: string; error?: string }> {
  try {
    const url = normalizeUrl(input);
    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { url, error: "Only HTTP and HTTPS URLs are allowed" };
    }

    const allowLocalhost = isLocalhostAllowed();
    const hostname = parsed.hostname.toLowerCase();

    if (!allowLocalhost) {
      if (
        hostname === "localhost" ||
        hostname.endsWith(".local") ||
        hostname.endsWith(".internal") ||
        hostname === "0.0.0.0"
      ) {
        return { url, error: "Local and internal URLs are not allowed" };
      }

      if (isIP(hostname)) {
        if (isPrivateIp(hostname)) {
          return { url, error: "Private IP addresses are not allowed" };
        }
        return { url };
      }

      try {
        const records = await lookup(hostname, { all: true });
        for (const record of records) {
          if (isPrivateIp(record.address)) {
            return { url, error: "URL resolves to a private network address" };
          }
        }
      } catch {
        // Ignore DNS lookup error during validation; fetch step will handle network connectivity
      }
    }

    return { url };
  } catch {
    return { url: input, error: "Invalid URL format" };
  }
}
