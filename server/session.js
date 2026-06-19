import { auth } from "./auth.js";
import { dbPool } from "./db.js";

const HOME_ASSISTANT_INGRESS_PROXY = "172.30.32.2";

export async function resolveRequestUser(req) {
  const homeAssistantUser = await resolveHomeAssistantIngressUser(req);
  if (homeAssistantUser) {
    return homeAssistantUser;
  }

  const session = await auth.api.getSession({ headers: toWebHeaders(req.headers) });
  return session?.user ?? null;
}

export async function requireSession(req, res, next) {
  try {
    const user = await resolveRequestUser(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Session resolution failed:", error);
    res.status(500).json({ error: "Could not authenticate this request" });
  }
}

export async function resolveHomeAssistantIngressUser(req) {
  if (!isTrustedHomeAssistantIngressRequest(req) || !dbPool) {
    return null;
  }

  const homeAssistantUserId = String(req.get("x-remote-user-id") || "").trim();
  if (!homeAssistantUserId) {
    return null;
  }

  const displayName = String(
    req.get("x-remote-user-display-name") || req.get("x-remote-user-name") || "Home Assistant User",
  ).trim().slice(0, 160) || "Home Assistant User";
  const userId = `home-assistant:${homeAssistantUserId}`;
  const safeEmailId = homeAssistantUserId.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 120);
  const email = `ha-${safeEmailId}@homeassistant.local`;
  const result = await dbPool.query(
    `
      insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
      values ($1, $2, $3, true, now(), now())
      on conflict (id) do update
      set name = excluded.name,
          "updatedAt" = now()
      returning id, name, email, image
    `,
    [userId, displayName, email],
  );

  return { ...result.rows[0], homeAssistant: true };
}

function isTrustedHomeAssistantIngressRequest(req) {
  if (!process.env.SUPERVISOR_TOKEN) {
    return false;
  }

  const ingressPath = String(req.get("x-ingress-path") || "");
  const remoteUserId = String(req.get("x-remote-user-id") || "");
  const remoteAddress = normalizeRemoteAddress(req.socket?.remoteAddress || req.ip || "");
  return Boolean(
    ingressPath.includes("/api/hassio_ingress/") &&
    remoteUserId &&
    remoteAddress === HOME_ASSISTANT_INGRESS_PROXY,
  );
}

function normalizeRemoteAddress(value) {
  const mappedIpv4 = String(value).match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  return mappedIpv4?.[1] || String(value);
}

function toWebHeaders(headers) {
  const webHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        webHeaders.append(key, item);
      }
    } else if (value !== undefined) {
      webHeaders.set(key, value);
    }
  }
  return webHeaders;
}
