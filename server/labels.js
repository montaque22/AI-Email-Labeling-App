import { randomUUID } from "node:crypto";
import { resolveRequestUser } from "./session.js";
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
import { emitWebhookEvent } from "./webhooks.js";

export const SYSTEM_LABEL_KEY = "processed";
export const UNEMAILABLE_SYSTEM_LABEL_KEY = "unemailable";
export const UNEMAILABLE_SYSTEM_LABEL_NAME = "Unemailable";
const UNEMAILABLE_SYSTEM_LABEL_DESCRIPTION = "Secret system label for emails Emailable could not safely process.";

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
  await dbPool.query("alter table labels add column if not exists system_key text");
  await dbPool.query("delete from labels where system_key = $1", [SYSTEM_LABEL_KEY]);
  await dbPool.query("create index if not exists labels_user_id_idx on labels(user_id)");
  await dbPool.query(
    "create unique index if not exists labels_user_id_system_key_idx on labels(user_id, system_key) where system_key is not null",
  );
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
      await emitWebhookEvent(req.user.id, "label.created", { label });
      res.status(201).json({ label });
    } catch (error) {
      handleDbError(res, error);
    }
  });

  app.post("/api/labels/import", requireSession, async (req, res) => {
    const input = parseLabelImportInput(req.body);

    if (!input.ok) {
      res.status(400).json({ error: input.error });
      return;
    }

    try {
      const labels = await createLabels(req.user.id, input.labels);

      for (const label of labels) {
        await syncLabelToConnectedAccounts(req.user.id, label, "create");
        await emitWebhookEvent(req.user.id, "label.created", { label });
      }

      res.status(201).json({ imported: labels.length, labels });
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
      const existingLabel = await getLabel(req.user.id, req.params.id);
      const label = await updateLabel(req.user.id, req.params.id, input.name, input.description);

      if (!label) {
        res.status(404).json({ error: "Label not found" });
        return;
      }

      await syncLabelToConnectedAccounts(req.user.id, label, "update");

      if (existingLabel?.name && existingLabel.name !== label.name) {
        await renameLabelInEmailRules(req.user.id, existingLabel.name, label.name);
      }

      await emitWebhookEvent(req.user.id, "label.modified", {
        label,
        changes: buildChangedFields(existingLabel, label, ["name", "description"]),
        previous: existingLabel,
      });
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
        const label = await getLabel(req.user.id, id);
        const result = await tryDeleteLabelEverywhere(req.user.id, id);
        if (result.deleted && label?.name) {
          await removeLabelFromEmailRules(req.user.id, label.name);
          await emitWebhookEvent(req.user.id, "label.deleted", { label });
        }
        results.push(result);
      }

      res.json({
        deleted: results.filter((result) => result.deleted).length,
        failed: results.filter((result) => result.failed).length,
        protected: results.filter((result) => result.protected).length,
      });
    } catch (error) {
      handleDbError(res, error);
    }
  });

  app.post("/api/labels/:id/retry", requireSession, async (req, res) => {
    try {
      const label = await getLabel(req.user.id, req.params.id);
      const result = await retryLabelSync(req.user.id, req.params.id);

      if (!result) {
        res.status(404).json({ error: "Label not found" });
        return;
      }

      if (result.deleted && label?.name) {
        await removeLabelFromEmailRules(req.user.id, label.name);
        await emitWebhookEvent(req.user.id, "label.deleted", { label });
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
  const user = await resolveRequestUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  req.user = user;
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

  if (name.length > 25) {
    return { ok: false, error: "Label name must be 25 characters or less" };
  }

  if (!/^[A-Za-z0-9 _-]+$/.test(name)) {
    return { ok: false, error: "Label name can only use letters, numbers, spaces, hyphens, and underscores" };
  }

  if (description.length > 200) {
    return { ok: false, error: "Label description must be 200 characters or less" };
  }

  return { ok: true, name, description };
}

function parseLabelImportInput(body) {
  const labels = Array.isArray(body?.labels) ? body.labels : null;

  if (!labels) {
    return { ok: false, error: "labels must be an array" };
  }

  if (labels.length === 0) {
    return { ok: false, error: "CSV must include at least one label row" };
  }

  if (labels.length > 20) {
    return { ok: false, error: "CSV can include at most 20 label rows" };
  }

  const parsedLabels = [];

  for (const [index, label] of labels.entries()) {
    const input = parseLabelInput({
      name: label?.name,
      description: label?.description,
    });

    if (!input.ok) {
      return { ok: false, error: `Row ${index + 2}: ${input.error}` };
    }

    parsedLabels.push({ name: input.name, description: input.description });
  }

  return { ok: true, labels: parsedLabels };
}

async function listLabels(userId) {
  const result = await dbPool.query(
    `
      select id, name, description, system_key as "systemKey", created_at as "createdAt", updated_at as "updatedAt"
      from labels
      where user_id = $1
        and system_key is null
      order by lower(name), created_at desc
    `,
    [userId],
  );

  return result.rows;
}

export async function ensureUnemailableSystemLabel(userId) {
  const result = await dbPool.query(
    `
      insert into labels (id, user_id, name, description, system_key)
      values ($1, $2, $3, $4, $5)
      on conflict (user_id, system_key) where system_key is not null do update
      set name = excluded.name,
          description = excluded.description,
          updated_at = now()
      returning id, name, description, system_key as "systemKey", created_at as "createdAt", updated_at as "updatedAt"
    `,
    [randomUUID(), userId, UNEMAILABLE_SYSTEM_LABEL_NAME, UNEMAILABLE_SYSTEM_LABEL_DESCRIPTION, UNEMAILABLE_SYSTEM_LABEL_KEY],
  );
  const label = result.rows[0];
  await syncLabelToConnectedAccounts(userId, label, "update");
  return label;
}

async function createLabel(userId, name, description) {
  const result = await dbPool.query(
    `
      insert into labels (id, user_id, name, description)
      values ($1, $2, $3, $4)
      returning id, name, description, system_key as "systemKey", created_at as "createdAt", updated_at as "updatedAt"
    `,
    [randomUUID(), userId, name, description],
  );

  return result.rows[0];
}

async function createLabels(userId, labels) {
  const client = await dbPool.connect();

  try {
    await client.query("begin");
    const createdLabels = [];

    for (const label of labels) {
      const result = await client.query(
        `
          insert into labels (id, user_id, name, description)
          values ($1, $2, $3, $4)
          returning id, name, description, system_key as "systemKey", created_at as "createdAt", updated_at as "updatedAt"
        `,
        [randomUUID(), userId, label.name, label.description],
      );

      createdLabels.push(result.rows[0]);
    }

    await client.query("commit");
    return createdLabels;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function updateLabel(userId, id, name, description) {
  const existing = await getLabel(userId, id);
  if (!existing) {
    return null;
  }

  const result = await dbPool.query(
    `
      update labels
      set name = $3, description = $4, updated_at = now()
      where user_id = $1 and id = $2
      returning id, name, description, system_key as "systemKey", created_at as "createdAt", updated_at as "updatedAt"
    `,
    [userId, id, name, description],
  );

  return result.rows[0] ?? null;
}

async function getLabel(userId, id) {
  const result = await dbPool.query(
    `
      select id, name, description, system_key as "systemKey", created_at as "createdAt", updated_at as "updatedAt"
      from labels
      where user_id = $1 and id = $2
      limit 1
    `,
    [userId, id],
  );

  return result.rows[0] ?? null;
}

function buildChangedFields(previous, current, fields) {
  const changes = {};

  for (const field of fields) {
    if (previous?.[field] !== current?.[field]) {
      changes[field] = {
        from: previous?.[field] ?? null,
        to: current?.[field] ?? null,
      };
    }
  }

  return changes;
}

async function renameLabelInEmailRules(userId, oldName, newName) {
  await dbPool.query(
    `
      update email_rules
      set labels_applied = array(
            select case
              when lower(label_name) = lower($2) then $3
              else label_name
            end
            from unnest(labels_applied) as label_name
          ),
          metadata = case
            when metadata ? 'labelReasons' then jsonb_set(
              metadata,
              '{labelReasons}',
              coalesce((
                select jsonb_object_agg(
                  case when lower(key) = lower($2) then $3 else key end,
                  value
                )
                from jsonb_each_text(metadata->'labelReasons')
              ), '{}'::jsonb),
              true
            )
            else metadata
          end,
          updated_at = now()
      where user_id = $1
        and exists (
          select 1
          from unnest(labels_applied) as label_name
          where lower(label_name) = lower($2)
        )
    `,
    [userId, oldName, newName],
  );
}

async function removeLabelFromEmailRules(userId, labelName) {
  await dbPool.query(
    `
      update email_rules
      set labels_applied = array(
            select label_name
            from unnest(labels_applied) as label_name
            where lower(label_name) <> lower($2)
          ),
          metadata = case
            when metadata ? 'labelReasons' then jsonb_set(
              metadata,
              '{labelReasons}',
              coalesce((
                select jsonb_object_agg(key, value)
                from jsonb_each_text(metadata->'labelReasons')
                where lower(key) <> lower($2)
              ), '{}'::jsonb),
              true
            )
            else metadata
          end,
          updated_at = now()
      where user_id = $1
        and exists (
          select 1
          from unnest(labels_applied) as label_name
          where lower(label_name) = lower($2)
        )
    `,
    [userId, labelName],
  );
}

function handleDbError(res, error) {
  console.error("Labels API failed:", error);
  res.status(500).json({ error: "Labels request failed" });
}
