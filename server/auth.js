import { betterAuth } from "better-auth";
import { dbPool } from "./db.js";

const defaultLocalUrl = "http://127.0.0.1:3000";
const baseURL = process.env.BETTER_AUTH_URL || process.env.APP_URL || defaultLocalUrl;
const isProduction = process.env.NODE_ENV === "production";
const authSecret = process.env.BETTER_AUTH_SECRET || (isProduction ? undefined : "local-dev-better-auth-secret");
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

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
  trustedOrigins: [
    baseURL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ],
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
