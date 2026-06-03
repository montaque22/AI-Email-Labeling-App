import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const indexHtmlPath = path.join(distDir, "index.html");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "ai-email-labeling-app",
  });
});

app.use(express.static(distDir));

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

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
