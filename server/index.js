import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toNodeHandler } from "better-auth/node";
import { auth, googleOAuthEnabled } from "./auth.js";
import { ensureAiPromptsTable, registerAiPromptRoutes } from "./ai-prompts.js";
import { ensureByoAiTables, registerByoAiRoutes } from "./byoai.js";
import { dbPool } from "./db.js";
import { ensureEmailAccountsTable, registerEmailAccountRoutes } from "./email-accounts.js";
import { registerInboxRoutes } from "./inbox.js";
import { ensureIntegrationTables, registerIntegrationRoutes } from "./integrations.js";
import { ensureLabelsTable, registerLabelRoutes } from "./labels.js";
import { ensureMcpTables, registerMcpRoutes } from "./mcp-server.js";
import { ensureSettingsTable, registerSettingsRoutes } from "./settings.js";
import { ensureSystemLogsTable } from "./system-logs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const indexHtmlPath = path.join(distDir, "index.html");

const app = express();
const port = process.env.PORT || 3000;

app.get("/api/auth-settings", (_req, res) => {
  res.json({
    googleOAuthEnabled,
    emailAndPasswordEnabled: true,
  });
});

app.all("/api/auth/*splat", toNodeHandler(auth));
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

app.use(express.static(distDir));

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

app.get(/.*/, (_req, res) => {
  res.sendFile(indexHtmlPath);
});

async function startServer() {
  try {
    await ensureEmailAccountsTable();
    await ensureLabelsTable();
    await ensureSettingsTable();
    await ensureIntegrationTables();
    await ensureSystemLogsTable();
    await ensureAiPromptsTable();
    await ensureByoAiTables();
    await ensureMcpTables();
  } catch (error) {
    console.error("Failed to initialize database tables:", error);
  }

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

void startServer();
