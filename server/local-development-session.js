import { dbPool } from "./db.js";

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1"]);

export function isLocalDevelopmentSessionEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.LOCAL_DEV_AUTH === "true";
}

export async function resolveLocalDevelopmentUser(req) {
  if (!isLocalDevelopmentSessionEnabled() || !isLoopbackRequest(req) || !dbPool) {
    return null;
  }

  const configuredEmail = String(process.env.LOCAL_DEV_USER_EMAIL || "").trim().toLowerCase();
  const values = configuredEmail ? [configuredEmail] : [];
  const emailFilter = configuredEmail ? `where lower(u.email) = $1` : "";
  const result = await dbPool.query(
    `
      select u.id, u.name, u.email, u.image, count(indexed.id)::integer as "indexedEmailCount"
      from "user" u
      left join email_index indexed on indexed.user_id = u.id
      ${emailFilter}
      group by u.id, u.name, u.email, u.image
      order by count(indexed.id) desc, u."updatedAt" desc
      limit 1
    `,
    values,
  );

  const user = result.rows[0];
  return user ? { ...user, localDevelopment: true } : null;
}

export function isLoopbackRequest(req) {
  const hostname = getRequestHostname(req);
  const remoteAddress = normalizeRemoteAddress(req.socket?.remoteAddress || req.ip || "");
  return (hostname === "localhost" || LOOPBACK_ADDRESSES.has(hostname)) && LOOPBACK_ADDRESSES.has(remoteAddress);
}

function getRequestHostname(req) {
  const host = String(req.get?.("host") || "").trim();
  if (!host) {
    return "";
  }

  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return "";
  }
}

function normalizeRemoteAddress(value) {
  const mappedIpv4 = String(value).match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  return mappedIpv4?.[1] || String(value);
}
