import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toNodeHandler } from "better-auth/node";
import { auth, googleOAuthEnabled } from "./auth.js";
import { ensureAiPromptsTable, registerAiPromptRoutes } from "./ai-prompts.js";
import { ensureByoAiTables, registerByoAiRoutes } from "./byoai.js";
import { dbPool } from "./db.js";
import { ensureEmailAccountsTable, registerEmailAccountRoutes } from "./email-accounts.js";
import { ensureEmailIndexTable } from "./email-index.js";
import { registerInboxRoutes } from "./inbox.js";
import { ensureIntegrationTables, registerIntegrationRoutes } from "./integrations.js";
import { ensureLabelsTable, registerLabelRoutes } from "./labels.js";
import { ensureMcpTables, registerMcpRoutes } from "./mcp-server.js";
import { ensurePollingSettings, registerPollingRoutes, startPollingWorker } from "./polling.js";
import { ensureSettingsTable, registerSettingsRoutes } from "./settings.js";
import { ensureSystemLogsTable, startSystemLogRetentionWorker } from "./system-logs.js";
import { resolveHomeAssistantIngressUser } from "./session.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const indexHtmlPath = path.join(distDir, "index.html");

const app = express();
const port = resolveServerPort(process.env.PORT);
const configuredAppBasePath = resolveConfiguredAppBasePath();
const authHandler = toNodeHandler(auth);

function resolveServerPort(value) {
  const portNumber = value === undefined || value === "" ? 3000 : Number(value);
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return portNumber;
}

function resolveConfiguredAppBasePath() {
  for (const value of [process.env.APP_URL, process.env.BETTER_AUTH_URL]) {
    if (!value) {
      continue;
    }

    try {
      const pathname = new URL(value).pathname.replace(/\/$/, "");
      if (pathname && pathname !== "/") {
        return pathname;
      }
    } catch {
      // Ignore invalid environment values so local development can still start.
    }
  }

  return "";
}

if (configuredAppBasePath) {
  app.all(`${configuredAppBasePath}/api/auth/*splat`, authHandler);
}

app.all(/\/api\/hassio_ingress\/[^/]+\/api\/auth\/.*/, (req, res) => {
  const strippedUrl = stripHomeAssistantIngressPath(req.url);
  req.url = configuredAppBasePath ? `${configuredAppBasePath}${strippedUrl}` : strippedUrl;
  authHandler(req, res);
});

app.use((req, _res, next) => {
  req.url = stripHomeAssistantIngressPath(req.url);

  if (configuredAppBasePath && (req.url === configuredAppBasePath || req.url.startsWith(`${configuredAppBasePath}/`))) {
    const strippedUrl = req.url.slice(configuredAppBasePath.length) || "/";
    req.url = strippedUrl.startsWith("/") ? strippedUrl : `/${strippedUrl}`;
  }

  next();
});

app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});

function stripHomeAssistantIngressPath(url) {
  const match = url.match(/^\/api\/hassio_ingress\/[^/]+(?=\/)/);
  if (!match) {
    return url;
  }

  const strippedUrl = url.slice(match[0].length) || "/";
  return strippedUrl.startsWith("/") ? strippedUrl : `/${strippedUrl}`;
}

app.get("/api/auth-settings", (_req, res) => {
  res.json({
    googleOAuthEnabled,
    emailAndPasswordEnabled: true,
  });
});

app.get("/api/home-assistant-session", async (req, res) => {
  try {
    const user = await resolveHomeAssistantIngressUser(req);
    if (!user) {
      res.status(401).json({ error: "Home Assistant ingress authentication is unavailable" });
      return;
    }
    res.json({ user });
  } catch (error) {
    console.error("Home Assistant user provisioning failed:", error);
    res.status(500).json({ error: "Could not create the Home Assistant user" });
  }
});

app.all("/api/auth/*splat", authHandler);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "ai-email-labeling-app",
  });
});

app.get("/api/db/health", async (_req, res) => {
  if (!dbPool) {
    res.status(503).json({
      ok: false,
      error: "DATABASE_URL is not configured",
    });
    return;
  }

  try {
    const result = await dbPool.query("select 1 as ok");

    res.json({
      ok: result.rows[0]?.ok === 1,
      database: "postgres",
    });
  } catch (error) {
    console.error("Database health check failed:", error);
    res.status(503).json({
      ok: false,
      error: "Database connection failed",
    });
  }
});

registerLabelRoutes(app);
registerSettingsRoutes(app);
registerEmailAccountRoutes(app);
registerInboxRoutes(app);
registerIntegrationRoutes(app);
registerAiPromptRoutes(app);
registerByoAiRoutes(app);
registerMcpRoutes(app);
registerPollingRoutes(app);

app.use(express.static(distDir, { index: false }));

app.get(/.*\/(manifest\.webmanifest|registerSW\.js|sw\.js|workbox-[^/]+\.js|pwa-(?:192|512|maskable)\.png)$/, (req, res, next) => {
  const assetName = req.params[0];
  if (!assetName) {
    next();
    return;
  }

  res.sendFile(path.join(distDir, assetName), (error) => {
    if (error) {
      next();
    }
  });
});

app.get(/.*\/assets\/(.*)/, (req, res, next) => {
  const assetName = req.params[0];
  if (!assetName) {
    next();
    return;
  }

  res.sendFile(path.join(distDir, "assets", assetName), (error) => {
    if (error) {
      next();
    }
  });
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "API route not found" });
    return;
  }

  next();
});

app.get(/.*/, async (req, res, next) => {
  try {
    res.type("html").send(await renderIndexHtml(req));
  } catch (error) {
    next(error);
  }
});

async function renderIndexHtml(req) {
  const html = await fs.readFile(indexHtmlPath, "utf8");
  const basePath = getIngressBasePath(req);
  if (!basePath) {
    return html;
  }

  const baseScript = `<script>window.__EMAILABLE_BASE_PATH__=${JSON.stringify(basePath)};</script>`;
  return html.replace("</head>", `${baseScript}</head>`);
}

function getIngressBasePath(req) {
  const ingressPath = String(req.get("x-ingress-path") || "").trim();
  if (!ingressPath.includes("/api/hassio_ingress/")) {
    return configuredAppBasePath;
  }

  return ingressPath.replace(/\/$/, "");
}

async function startServer() {
  try {
    await ensureEmailAccountsTable();
    await ensureEmailIndexTable();
    await ensureLabelsTable();
    await ensureSettingsTable();
    await ensureIntegrationTables();
    await ensureSystemLogsTable();
    await ensureAiPromptsTable();
    await ensureByoAiTables();
    await ensureMcpTables();
    await ensurePollingSettings();
  } catch (error) {
    console.error("Failed to initialize database tables:", error);
  }

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    startPollingWorker();
    startSystemLogRetentionWorker();
  });
}

void startServer();
