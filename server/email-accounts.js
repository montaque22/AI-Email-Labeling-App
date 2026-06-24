import crypto from "node:crypto";
import { dbPool } from "./db.js";
import { testImapConnection, withImapClient } from "./imap-provider.js";
import { requireSession } from "./session.js";

export const EMAIL_ACCOUNT_PROVIDERS = {
  gmail: {
    label: "Gmail",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.modify"],
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    extraAuthParams: { access_type: "offline", prompt: "consent" },
  },
  yahoo: {
    label: "Yahoo",
    authUrl: "https://api.login.yahoo.com/oauth2/request_auth",
    tokenUrl: "https://api.login.yahoo.com/oauth2/get_token",
    userInfoUrl: "https://api.login.yahoo.com/openid/v1/userinfo",
    scopes: ["openid", "email", "profile", "mail-r", "mail-w"],
    clientId: process.env.YAHOO_CLIENT_ID,
    clientSecret: process.env.YAHOO_CLIENT_SECRET,
    useBasicAuthForToken: true,
  },
  microsoft: {
    label: "Microsoft",
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: [
      "openid",
      "profile",
      "email",
      "offline_access",
      "https://outlook.office.com/IMAP.AccessAsUser.All",
      "https://outlook.office.com/SMTP.Send",
    ],
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    extraAuthParams: { prompt: "select_account" },
    profileFromIdToken: true,
    accountMetadata: {
      imapHost: "outlook.office365.com",
      imapPort: 993,
      imapSecure: true,
      defaultMailbox: "INBOX",
      sentMailbox: "Sent",
      draftsMailbox: "Drafts",
      trashMailbox: "Deleted",
      smtpHost: "smtp-mail.outlook.com",
      smtpPort: 587,
      smtpSecure: false,
    },
  },
  imap: {
    label: "IMAP",
    manual: true,
  },
};

const TOKEN_SECRET = process.env.EMAIL_ACCOUNT_TOKEN_SECRET || process.env.BETTER_AUTH_SECRET || "local-email-token-secret";
const TEMPLATE_CALLBACK_PATH = "/api/email-accounts/callback";
const GMAIL_MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

export async function ensureEmailAccountsTable() {
  if (!dbPool) {
    return;
  }

  await dbPool.query(`
    create table if not exists email_accounts (
      id uuid primary key,
      user_id text not null references "user"(id) on delete cascade,
      provider text not null,
      provider_account_id text not null,
      email text not null,
      display_name text,
      source text not null default 'connected',
      access_token text,
      refresh_token text,
      scopes text[] not null default '{}',
      token_expires_at timestamptz,
      metadata jsonb not null default '{}',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (user_id, provider, provider_account_id)
    )
  `);
  await dbPool.query("alter table email_accounts add column if not exists source text not null default 'connected'");
  await dbPool.query("create index if not exists email_accounts_user_id_idx on email_accounts(user_id)");
}

export function registerEmailAccountRoutes(app) {
  app.get("/api/email-accounts", requireSession, async (req, res) => {
    try {
      const accounts = await listEmailAccounts(req.user);
      res.json({ total: accounts.length, accounts });
    } catch (error) {
      handleDbError(res, error);
    }
  });

  app.get("/api/email-accounts/providers", requireSession, (_req, res) => {
    res.json({
      providers: Object.entries(EMAIL_ACCOUNT_PROVIDERS)
        .filter(([, provider]) => provider.manual || isProviderConfigured(provider))
        .map(([id, provider]) => ({
          id,
          label: provider.label,
          configured: true,
          manual: Boolean(provider.manual),
        })),
    });
  });

  app.post("/api/email-accounts/token-status", requireSession, async (req, res) => {
    try {
      const accounts = await checkEmailAccountStatuses(req.user.id);
      res.json({ accounts });
    } catch (error) {
      handleDbError(res, error);
    }
  });

  app.get("/api/email-accounts/connect/:provider", requireSession, (req, res) => {
    const providerId = req.params.provider;
    const provider = EMAIL_ACCOUNT_PROVIDERS[providerId];

    if (!provider || provider.manual) {
      res.status(404).json({ error: "Email provider not found" });
      return;
    }

    if (!provider.clientId || !provider.clientSecret) {
      res.status(400).json({ error: `${provider.label} is not configured` });
      return;
    }

    const redirectUri = getRedirectUri(req, providerId);
    const state = createState(req.user.id, providerId, getOAuthReturnUrl(req));
    const authUrl = new URL(provider.authUrl);

    authUrl.searchParams.set("client_id", provider.clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", provider.scopes.join(" "));
    authUrl.searchParams.set("state", state);

    for (const [key, value] of Object.entries(provider.extraAuthParams ?? {})) {
      authUrl.searchParams.set(key, value);
    }

    res.redirect(authUrl.toString());
  });

  app.get("/api/email-accounts/callback/:provider", async (req, res) => {
    const providerId = req.params.provider;
    const provider = EMAIL_ACCOUNT_PROVIDERS[providerId];
    const state = verifyState(req.query.state);

    if (!provider || !provider.clientId || !provider.clientSecret || !state) {
      redirectEmailAccountResult(res, state, "failed");
      return;
    }

    if (typeof req.query.code !== "string") {
      redirectEmailAccountResult(res, state, "failed");
      return;
    }

    try {
      const redirectUri = getRedirectUri(req, providerId);
      const tokenSet = await exchangeCodeForTokens(provider, req.query.code, redirectUri);
      const profile = await fetchProviderProfile(provider, tokenSet);

      const account = await upsertEmailAccount(state.userId, providerId, profile, tokenSet);
      const { syncAllLabelsToEmailAccount } = await import("./label-sync.js");
      await syncAllLabelsToEmailAccount(state.userId, account.id);
      redirectEmailAccountResult(res, state, "connected");
    } catch (error) {
      console.error("Email account OAuth callback failed:", error);
      redirectEmailAccountResult(res, state, "failed");
    }
  });

  app.post("/api/email-accounts/imap", requireSession, async (req, res) => {
    const input = parseImapAccountInput(req.body);

    if (!input.ok) {
      res.status(400).json({ error: input.error });
      return;
    }

    try {
      await testImapConnection(input.account);
      const account = await upsertImapEmailAccount(req.user.id, input.account);
      const { syncAllLabelsToEmailAccount } = await import("./label-sync.js");
      await syncAllLabelsToEmailAccount(req.user.id, account.id);
      res.status(201).json({ account });
    } catch (error) {
      console.error("IMAP account connection failed:", error);
      res.status(400).json({ error: error.message || "Could not connect IMAP account" });
    }
  });

  app.delete("/api/email-accounts/:id", requireSession, async (req, res) => {
    try {
      const result = await dbPool.query("delete from email_accounts where user_id = $1 and id = $2 and source <> 'sso'", [
        req.user.id,
        req.params.id,
      ]);
      res.json({ deleted: result.rowCount });
    } catch (error) {
      handleDbError(res, error);
    }
  });
}

async function listEmailAccounts(user) {
  const ssoAccount = await ensureSsoEmailAccount(user.id);

  if (ssoAccount?.isNew) {
    const { syncAllLabelsToEmailAccount } = await import("./label-sync.js");
    await syncAllLabelsToEmailAccount(user.id, ssoAccount.id);
  }

  const connected = await dbPool.query(
    `
      select id, provider, email, display_name as "displayName", scopes, source, metadata, created_at as "createdAt", updated_at as "updatedAt"
      from email_accounts
      where user_id = $1
      order by case when source = 'sso' then 0 else 1 end, created_at desc
    `,
    [user.id],
  );
  const accounts = connected.rows.map((account) => ({
    ...account,
    canRemove: account.source !== "sso",
  }));

  return accounts;
}

async function checkEmailAccountStatuses(userId) {
  const result = await dbPool.query(
    `
      select id, provider, email, source, scopes, access_token, refresh_token, token_expires_at as "tokenExpiresAt", metadata
      from email_accounts
      where user_id = $1
      order by case when source = 'sso' then 0 else 1 end, created_at desc
    `,
    [userId],
  );

  const statuses = [];

  for (const account of result.rows) {
    try {
      if (account.provider === "imap") {
        await withImapClient(account, async () => true);
      } else if (isOAuthImapProvider(account.provider)) {
        const accessToken = await getValidEmailAccountAccessToken(account);
        await withImapClient(account, async () => true, accessToken);
      } else {
        assertEmailAccountHasRequiredScopes(account);
        await getValidEmailAccountAccessToken(account);
      }

      statuses.push({ id: account.id, status: "connected", statusMessage: "Connected" });
    } catch (error) {
      statuses.push({
        id: account.id,
        status: "needs_refresh",
        statusMessage: getEmailAccountStatusMessage(error, account),
      });
    }
  }

  return statuses;
}

function getEmailAccountStatusMessage(error, account = {}) {
  const message = error.message || "";

  if (message === "missing_gmail_modify_scope") {
    return "Reconnect and approve Gmail access";
  }

  if (account.source === "sso") {
    return "Reconnect Gmail access";
  }

  if (message.toLowerCase().includes("token refresh failed")) {
    return "Reconnect account";
  }

  if (message.toLowerCase().includes("missing an access token")) {
    return "Reconnect account";
  }

  return message || "Needs attention";
}

function assertEmailAccountHasRequiredScopes(account) {
  if (account.provider !== "gmail") {
    return;
  }

  const scopes = Array.isArray(account.scopes) ? account.scopes : [];
  if (!scopes.includes(GMAIL_MODIFY_SCOPE)) {
    const error = new Error("missing_gmail_modify_scope");
    error.status = 403;
    throw error;
  }
}

function parseImapAccountInput(body) {
  const account = {
    email: typeof body?.email === "string" ? body.email.trim().toLowerCase() : "",
    displayName: typeof body?.displayName === "string" ? body.displayName.trim() : "",
    imapHost: typeof body?.imapHost === "string" ? body.imapHost.trim() : "",
    imapPort: Number(body?.imapPort ?? 993),
    imapSecure: body?.imapSecure !== false,
    imapUsername: typeof body?.imapUsername === "string" ? body.imapUsername.trim() : "",
    appPassword: typeof body?.appPassword === "string" ? body.appPassword : "",
    defaultMailbox: typeof body?.defaultMailbox === "string" && body.defaultMailbox.trim() ? body.defaultMailbox.trim() : "INBOX",
    sentMailbox: typeof body?.sentMailbox === "string" && body.sentMailbox.trim() ? body.sentMailbox.trim() : "Sent",
    draftsMailbox: typeof body?.draftsMailbox === "string" && body.draftsMailbox.trim() ? body.draftsMailbox.trim() : "Drafts",
  };

  if (!account.email || !account.email.includes("@")) {
    return { ok: false, error: "Email address is required" };
  }

  if (!account.imapHost) {
    return { ok: false, error: "IMAP host is required" };
  }

  if (!Number.isInteger(account.imapPort) || account.imapPort < 1 || account.imapPort > 65535) {
    return { ok: false, error: "IMAP port must be between 1 and 65535" };
  }

  if (!account.appPassword) {
    return { ok: false, error: "App password is required" };
  }

  return { ok: true, account };
}

export async function ensureSsoEmailAccount(userId) {
  if (typeof userId === "string" && userId.startsWith("home-assistant:")) {
    return;
  }

  const authAccountResult = await dbPool.query(
    `
      select a."accountId",
             a."accessToken",
             a."refreshToken",
             a."accessTokenExpiresAt",
             a.scope,
             u.email,
             u.name
      from account a
      join "user" u on u.id = a."userId"
      where a."userId" = $1
        and a."providerId" = 'google'
      limit 1
    `,
    [userId],
  );
  const account = authAccountResult.rows[0];

  if (!account) {
    return;
  }

  const accessToken = account.accessToken ? encryptToken(account.accessToken) : null;
  const refreshToken = account.refreshToken ? encryptToken(account.refreshToken) : null;
  const scopes = parseScopes(account.scope);

  const existing = await dbPool.query(
    `
      select id
      from email_accounts
      where user_id = $1 and provider = 'gmail' and provider_account_id = $2
      limit 1
    `,
    [userId, account.accountId],
  );

  const upserted = await dbPool.query(
    `
      insert into email_accounts (
        id, user_id, provider, provider_account_id, email, display_name, source,
        access_token, refresh_token, scopes, token_expires_at, metadata
      )
      values ($1, $2, 'gmail', $3, $4, $5, 'sso', $6, $7, $8, $9, $10)
      on conflict (user_id, provider, provider_account_id) do update
      set email = excluded.email,
          display_name = excluded.display_name,
          source = 'sso',
          access_token = coalesce(email_accounts.access_token, excluded.access_token),
          refresh_token = coalesce(email_accounts.refresh_token, excluded.refresh_token),
          scopes = case
            when email_accounts.refresh_token is not null then email_accounts.scopes
            else excluded.scopes
          end,
          token_expires_at = coalesce(email_accounts.token_expires_at, excluded.token_expires_at),
          metadata = excluded.metadata,
          updated_at = now()
      returning id
    `,
    [
      crypto.randomUUID(),
      userId,
      account.accountId,
      account.email,
      account.name,
      accessToken,
      refreshToken,
      scopes,
      account.accessTokenExpiresAt,
      JSON.stringify({ source: "better-auth-google-sso" }),
    ],
  );

  return { id: upserted.rows[0].id, isNew: existing.rowCount === 0 };
}

async function exchangeCodeForTokens(provider, code, redirectUri) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (provider.useBasicAuthForToken) {
    headers.Authorization = `Basic ${Buffer.from(`${provider.clientId}:${provider.clientSecret}`).toString("base64")}`;
  } else {
    body.set("client_id", provider.clientId);
    body.set("client_secret", provider.clientSecret);
  }

  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed with ${response.status}`);
  }

  return response.json();
}

async function fetchProviderProfile(provider, tokenSet) {
  if (provider.profileFromIdToken) {
    const claims = decodeJwtPayload(tokenSet.id_token);
    if (claims.aud !== provider.clientId || !claims.exp || Number(claims.exp) * 1000 <= Date.now()) {
      throw new Error("Microsoft returned an invalid identity token");
    }
    const email = String(claims.email || claims.preferred_username || "").trim().toLowerCase();
    const id = String(claims.oid || claims.sub || email).trim();
    if (!email || !id) {
      throw new Error("Microsoft did not return an email address for this account");
    }

    return {
      id,
      email,
      displayName: String(claims.name || email),
      raw: claims,
    };
  }

  const accessToken = tokenSet.access_token;
  const response = await fetch(provider.userInfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Profile request failed with ${response.status}`);
  }

  const profile = await response.json();

  return {
    id: String(profile.sub || profile.id || profile.email),
    email: profile.email,
    displayName: profile.name || profile.email,
    raw: profile,
  };
}

async function upsertEmailAccount(userId, provider, profile, tokenSet) {
  const encryptedAccessToken = tokenSet.access_token ? encryptToken(tokenSet.access_token) : null;
  const encryptedRefreshToken = tokenSet.refresh_token ? encryptToken(tokenSet.refresh_token) : null;
  const expiresAt = tokenSet.expires_in ? new Date(Date.now() + Number(tokenSet.expires_in) * 1000) : null;
  const scopes =
    typeof tokenSet.scope === "string" ? tokenSet.scope.split(" ") : EMAIL_ACCOUNT_PROVIDERS[provider].scopes;

  const result = await dbPool.query(
    `
      insert into email_accounts (
        id, user_id, provider, provider_account_id, email, display_name,
        access_token, refresh_token, scopes, token_expires_at, metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      on conflict (user_id, provider, provider_account_id) do update
      set email = excluded.email,
          display_name = excluded.display_name,
          access_token = excluded.access_token,
          refresh_token = coalesce(excluded.refresh_token, email_accounts.refresh_token),
          scopes = excluded.scopes,
          token_expires_at = excluded.token_expires_at,
          metadata = excluded.metadata,
          updated_at = now()
      returning id
    `,
    [
      crypto.randomUUID(),
      userId,
      provider,
      profile.id,
      profile.email,
      profile.displayName,
      encryptedAccessToken,
      encryptedRefreshToken,
      scopes,
      expiresAt,
      JSON.stringify({ ...profile.raw, ...(EMAIL_ACCOUNT_PROVIDERS[provider].accountMetadata ?? {}) }),
    ],
  );

  return { id: result.rows[0].id };
}

async function upsertImapEmailAccount(userId, account) {
  const result = await dbPool.query(
    `
      insert into email_accounts (
        id, user_id, provider, provider_account_id, email, display_name,
        access_token, refresh_token, scopes, token_expires_at, metadata
      )
      values ($1, $2, 'imap', $3, $4, $5, $6, null, $7, null, $8)
      on conflict (user_id, provider, provider_account_id) do update
      set email = excluded.email,
          display_name = excluded.display_name,
          access_token = excluded.access_token,
          scopes = excluded.scopes,
          metadata = excluded.metadata,
          updated_at = now()
      returning id, provider, email, display_name as "displayName", source, metadata, created_at as "createdAt", updated_at as "updatedAt"
    `,
    [
      crypto.randomUUID(),
      userId,
      account.email,
      account.email,
      account.displayName || account.email,
      encryptToken(account.appPassword),
      ["imap"],
      JSON.stringify({
        imapHost: account.imapHost,
        imapPort: account.imapPort,
        imapSecure: account.imapSecure,
        imapUsername: account.imapUsername || account.email,
        defaultMailbox: account.defaultMailbox,
        sentMailbox: account.sentMailbox,
        draftsMailbox: account.draftsMailbox,
      }),
    ],
  );

  return result.rows[0];
}

function getRedirectUri(req, providerId) {
  const configuredBaseUrl = process.env.APP_URL || process.env.BETTER_AUTH_URL;
  const origin = configuredBaseUrl || `${req.protocol}://${req.get("host")}`;
  return `${origin}${TEMPLATE_CALLBACK_PATH}/${providerId}`;
}

function createState(userId, provider, returnUrl = "") {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      provider,
      returnUrl,
      nonce: crypto.randomUUID(),
      issuedAt: Date.now(),
    }),
  ).toString("base64url");
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

function getOAuthReturnUrl(req) {
  const referer = req.get("referer");
  const requestOrigin = req.get("origin");
  const configuredBaseUrl = process.env.APP_URL || process.env.BETTER_AUTH_URL;
  const requestBaseUrl = `${req.protocol}://${req.get("host")}`;
  const appOrigin = new URL(configuredBaseUrl || requestBaseUrl).origin;

  try {
    const url = new URL(referer || "");
    const isSameOrigin = url.origin === appOrigin || Boolean(requestOrigin && url.origin === requestOrigin);
    const isAppPage = !url.pathname.includes("/api/");
    if (isSameOrigin && isAppPage) {
      return url.toString();
    }
  } catch {
    // Direct app access falls back to the Email Accounts page.
  }

  return new URL("/settings/email-accounts", appOrigin).toString();
}

function redirectEmailAccountResult(res, state, status) {
  const fallback = "/settings/email-accounts";
  try {
    const target = state?.returnUrl ? new URL(state.returnUrl) : new URL(fallback, process.env.APP_URL || process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000");
    target.searchParams.set("emailAccountStatus", status);
    res.redirect(target.toString());
  } catch {
    res.redirect(`${fallback}?emailAccountStatus=${status}`);
  }
}

function verifyState(state) {
  if (typeof state !== "string") {
    return null;
  }

  const [payload, signature] = state.split(".");
  if (!payload || !signature || sign(payload) !== signature) {
    return null;
  }

  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (Date.now() - parsed.issuedAt > 10 * 60 * 1000) {
    return null;
  }

  return parsed;
}

function sign(value) {
  return crypto.createHmac("sha256", TOKEN_SECRET).update(value).digest("base64url");
}

export function encryptToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptToken(encryptedToken) {
  const [iv, tag, encrypted] = encryptedToken.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export async function getConnectedEmailAccounts(userId) {
  const ssoAccount = await ensureSsoEmailAccount(userId);

  if (ssoAccount?.isNew) {
    const { syncAllLabelsToEmailAccount } = await import("./label-sync.js");
    await syncAllLabelsToEmailAccount(userId, ssoAccount.id);
  }

  const result = await dbPool.query(
    `
      select id, provider, email, scopes, access_token, refresh_token, token_expires_at as "tokenExpiresAt"
             , metadata
      from email_accounts
      where user_id = $1
      order by created_at asc
    `,
    [userId],
  );

  return result.rows;
}

export function isOAuthImapProvider(provider) {
  return provider === "yahoo" || provider === "microsoft";
}

export function isImapBackedProvider(provider) {
  return provider === "imap" || isOAuthImapProvider(provider);
}

export async function getImapAccessToken(account) {
  return isOAuthImapProvider(account.provider) ? getValidEmailAccountAccessToken(account) : "";
}

function isProviderConfigured(provider) {
  if (provider.manual) {
    return true;
  }

  return isConfiguredSecret(provider.clientId) && isConfiguredSecret(provider.clientSecret);
}

function isConfiguredSecret(value) {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return Boolean(normalized) && !normalized.startsWith("your-") && normalized !== "undefined" && normalized !== "null";
}

function parseScopes(scope) {
  if (typeof scope !== "string" || scope.trim().length === 0) {
    return EMAIL_ACCOUNT_PROVIDERS.gmail.scopes;
  }

  return scope.split(" ").filter(Boolean);
}

function decodeJwtPayload(token) {
  if (typeof token !== "string") {
    throw new Error("Microsoft did not return an identity token");
  }

  const [, payload] = token.split(".");
  if (!payload) {
    throw new Error("Microsoft returned an invalid identity token");
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Microsoft returned an invalid identity token");
  }
}

export async function getValidEmailAccountAccessToken(account) {
  if (!account.access_token) {
    throw new Error("Email account is missing an access token");
  }

  const expiresAt = account.tokenExpiresAt ? new Date(account.tokenExpiresAt).getTime() : 0;
  const shouldRefresh = account.refresh_token && (!expiresAt || expiresAt < Date.now() + 60_000);

  if (!shouldRefresh) {
    return decryptToken(account.access_token);
  }

  if (account.provider === "imap") {
    return decryptToken(account.access_token);
  }

  const provider = EMAIL_ACCOUNT_PROVIDERS[account.provider];
  if (!provider) {
    throw new Error(`Unsupported email account provider: ${account.provider}`);
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: decryptToken(account.refresh_token),
  });
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (provider.useBasicAuthForToken) {
    headers.Authorization = `Basic ${Buffer.from(`${provider.clientId}:${provider.clientSecret}`).toString("base64")}`;
  } else {
    body.set("client_id", provider.clientId);
    body.set("client_secret", provider.clientSecret);
  }

  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    throw new Error(`Email account token refresh failed with ${response.status}`);
  }

  const tokenSet = await response.json();
  const encryptedAccessToken = tokenSet.access_token ? encryptToken(tokenSet.access_token) : account.access_token;
  const encryptedRefreshToken = tokenSet.refresh_token ? encryptToken(tokenSet.refresh_token) : account.refresh_token;
  const nextExpiresAt = tokenSet.expires_in ? new Date(Date.now() + Number(tokenSet.expires_in) * 1000) : null;

  await dbPool.query(
    `
      update email_accounts
      set access_token = $2,
          refresh_token = $3,
          token_expires_at = coalesce($4, token_expires_at),
          updated_at = now()
      where id = $1
    `,
    [account.id, encryptedAccessToken, encryptedRefreshToken, nextExpiresAt],
  );

  return tokenSet.access_token || decryptToken(account.access_token);
}

function tokenKey() {
  return crypto.createHash("sha256").update(TOKEN_SECRET).digest();
}

function handleDbError(res, error) {
  console.error("Email accounts API failed:", error);
  res.status(500).json({ error: "Email accounts request failed" });
}
