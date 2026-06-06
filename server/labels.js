import { randomUUID } from "node:crypto";
import { auth } from "./auth.js";
import { dbPool } from "./db.js";
import {
  attachSyncsToLabels,
  ensureLabelSyncTable,
  refreshAllLabelSyncStatus,
  retryLabelSync,
  syncAllLabelsToConnectedAccounts,
  syncLabelToConnectedAccounts,
  tryDeleteLabelEverywhere,
} from "./label-sync.js";

export async function ensureLabelsTable() {
  if (!dbPool) {
    return;
  }

  await dbPool.query(`
    create table if not exists labels (
      id uuid primary key,
      user_id text not null references "user"(id) on delete cascade,
      name text not null,
      description text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await dbPool.query("create index if not exists labels_user_id_idx on labels(user_id)");
  await ensureLabelSyncTable();
}

export function registerLabelRoutes(app) {
  app.get("/api/labels", requireSession, async (req, res) => {
    try {
      const labels = await listLabels(req.user.id);
      const labelsWithSyncs = await attachSyncsToLabels(labels);
      res.json({ total: labelsWithSyncs.length, labels: labelsWithSyncs });
    } catch (error) {
      handleDbError(res, error);
    }
  });

  app.post("/api/labels", requireSession, async (req, res) => {
    const input = parseLabelInput(req.body);

    if (!input.ok) {
      res.status(400).json({ error: input.error });
      return;
    }

    try {
      const label = await createLabel(req.user.id, input.name, input.description);
      await syncLabelToConnectedAccounts(req.user.id, label, "create");
      res.status(201).json({ label });
    } catch (error) {
      handleDbError(res, error);
    }
  });

  app.put("/api/labels/:id", requireSession, async (req, res) => {
    const input = parseLabelInput(req.body);

    if (!input.ok) {
      res.status(400).json({ error: input.error });
      return;
    }

    try {
      const label = await updateLabel(req.user.id, req.params.id, input.name, input.description);

      if (!label) {
        res.status(404).json({ error: "Label not found" });
        return;
      }

      await syncLabelToConnectedAccounts(req.user.id, label, "update");
      res.json({ label });
    } catch (error) {
      handleDbError(res, error);
    }
  });

  app.delete("/api/labels", requireSession, async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id) => typeof id === "string") : [];

    if (ids.length === 0) {
      res.status(400).json({ error: "Select at least one label to delete" });
      return;
    }

    try {
      const results = [];

      for (const id of ids) {
        results.push(await tryDeleteLabelEverywhere(req.user.id, id));
      }

      res.json({
        deleted: results.filter((result) => result.deleted).length,
        failed: results.filter((result) => result.failed).length,
      });
    } catch (error) {
      handleDbError(res, error);
    }
  });

  app.post("/api/labels/:id/retry", requireSession, async (req, res) => {
    try {
      const result = await retryLabelSync(req.user.id, req.params.id);

      if (!result) {
        res.status(404).json({ error: "Label not found" });
        return;
      }

      res.json(result);
    } catch (error) {
      handleDbError(res, error);
    }
  });

  app.post("/api/labels/sync-all", requireSession, async (req, res) => {
    try {
      await syncAllLabelsToConnectedAccounts(req.user.id);
      const labels = await listLabels(req.user.id);
      const labelsWithSyncs = await attachSyncsToLabels(labels);
      res.json({ total: labelsWithSyncs.length, labels: labelsWithSyncs });
    } catch (error) {
      handleDbError(res, error);
    }
  });

  app.post("/api/labels/refresh-sync", requireSession, async (req, res) => {
    try {
      await refreshAllLabelSyncStatus(req.user.id);
      const labels = await listLabels(req.user.id);
      const labelsWithSyncs = await attachSyncsToLabels(labels);
      res.json({ total: labelsWithSyncs.length, labels: labelsWithSyncs });
    } catch (error) {
      handleDbError(res, error);
    }
  });
}

async function requireSession(req, res, next) {
  const session = await auth.api.getSession({
    headers: toWebHeaders(req.headers),
  });

  if (!session?.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  req.user = session.user;
  next();
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

function parseLabelInput(body) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";

  if (!name) {
    return { ok: false, error: "Label name is required" };
  }

  if (name.length > 15) {
    return { ok: false, error: "Label name must be 15 characters or less" };
  }

  if (!/^[A-Za-z0-9 _-]+$/.test(name)) {
    return { ok: false, error: "Label name can only use letters, numbers, spaces, hyphens, and underscores" };
  }

  if (description.length > 150) {
    return { ok: false, error: "Label description must be 150 characters or less" };
  }

  return { ok: true, name, description };
}

async function listLabels(userId) {
  const result = await dbPool.query(
    `
      select id, name, description, created_at as "createdAt", updated_at as "updatedAt"
      from labels
      where user_id = $1
      order by lower(name), created_at desc
    `,
    [userId],
  );

  return result.rows;
}

async function createLabel(userId, name, description) {
  const result = await dbPool.query(
    `
      insert into labels (id, user_id, name, description)
      values ($1, $2, $3, $4)
      returning id, name, description, created_at as "createdAt", updated_at as "updatedAt"
    `,
    [randomUUID(), userId, name, description],
  );

  return result.rows[0];
}

async function updateLabel(userId, id, name, description) {
  const result = await dbPool.query(
    `
      update labels
      set name = $3, description = $4, updated_at = now()
      where user_id = $1 and id = $2
      returning id, name, description, created_at as "createdAt", updated_at as "updatedAt"
    `,
    [userId, id, name, description],
  );

  return result.rows[0] ?? null;
}

function handleDbError(res, error) {
  console.error("Labels API failed:", error);
  res.status(500).json({ error: "Labels request failed" });
}
