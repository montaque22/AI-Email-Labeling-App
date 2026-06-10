import { betterAuth } from "better-auth";
import { dbPool } from "./db.js";

const defaultLocalUrl = "http://127.0.0.1:3000";
const baseURL = process.env.BETTER_AUTH_URL || process.env.APP_URL || defaultLocalUrl;
const isProduction = process.env.NODE_ENV === "production";
const authSecret = process.env.BETTER_AUTH_SECRET || (isProduction ? undefined : "local-dev-better-auth-secret");
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const staticTrustedOrigins = [
  baseURL,
  process.env.APP_URL,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
].filter(Boolean);

if (!dbPool) {
  console.warn("Better Auth is starting without DATABASE_URL. Auth routes will fail until the database is configured.");
}

if (isProduction && !process.env.BETTER_AUTH_SECRET) {
  console.warn("BETTER_AUTH_SECRET is not configured. Set it in production before accepting real users.");
}

export const googleOAuthEnabled = Boolean(googleClientId && googleClientSecret);

export const auth = betterAuth({
  database: dbPool,
  secret: authSecret,
  baseURL,
  trustedOrigins: getTrustedOrigins,
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: googleOAuthEnabled
    ? {
        google: {
          clientId: googleClientId,
          clientSecret: googleClientSecret,
          scope: ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.modify"],
          accessType: "offline",
          prompt: "consent",
        },
      }
    : {},
});

async function getTrustedOrigins(request) {
  return [...staticTrustedOrigins, ...getHomeAssistantIngressOrigins(request)];
}

function getHomeAssistantIngressOrigins(request) {
  if (!request) {
    return [];
  }

  const origins = new Set();
  const ingressPath = request.headers.get("x-ingress-path");
  const originHeader = request.headers.get("origin");
  const requestUrl = safeParseUrl(request.url);

  if (requestUrl?.pathname.includes("/api/hassio_ingress/")) {
    origins.add(requestUrl.origin);
  }

  const refererUrl = safeParseUrl(request.headers.get("referer"));
  if (refererUrl?.pathname.includes("/api/hassio_ingress/")) {
    origins.add(refererUrl.origin);
  }

  if (ingressPath?.includes("/api/hassio_ingress/")) {
    const originUrl = safeParseUrl(originHeader);
    if (originUrl) {
      origins.add(originUrl.origin);
    }

    const forwardedProto = request.headers.get("x-forwarded-proto") || originUrl?.protocol?.replace(":", "");
    const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
    if (forwardedProto && forwardedHost) {
      origins.add(`${forwardedProto}://${forwardedHost}`);
    }
  }

  return [...origins];
}

function safeParseUrl(value) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value);
  } catch {
    return null;
  }
}
