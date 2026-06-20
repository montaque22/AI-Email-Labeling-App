import { FormEvent, useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentType, type MouseEvent as ReactMouseEvent, type PointerEvent, type ReactNode } from "react";
import {
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  BookOpen,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileCheck2,
  Gauge,
  GripVertical,
  Inbox,
  LogOut,
  List,
  MailCheck,
  Menu,
  MoreVertical,
  Pencil,
  Plus,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  Reply,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { authClient } from "./lib/auth-client";
import { getAbsoluteRuntimeUrl, getRuntimeBasePath, getRuntimeUrl } from "./lib/runtime-base";
import { cn } from "./lib/utils";

type Page =
  | "overview"
  | "inbox"
  | "labels"
  | "rules"
  | "metrics"
  | "documentation"
  | "ai-prompts"
  | "ai-byoai"
  | "ai-prompt-library"
  | "ai-email-label"
  | "ai-draft-reply"
  | "settings"
  | "confidence-threshold"
  | "email-accounts"
  | "endpoints"
  | "webhook"
  | "mcp-server";
type AuthMode = "login" | "signup";

type AuthUser = {
  email: string;
  name: string;
  picture?: string | null;
  homeAssistant?: boolean;
};

type AuthConfig = {
  googleOAuthEnabled: boolean;
  emailAndPasswordEnabled: boolean;
};

type Label = {
  id: string;
  name: string;
  description: string;
  systemKey?: string | null;
  createdAt: string;
  updatedAt: string;
  syncs?: LabelSync[];
};

type LabelSync = {
  emailAccountId: string;
  email: string;
  provider: string;
  providerLabelId?: string | null;
  syncStatus: "pending" | "synced" | "failed";
  pendingAction?: string | null;
  lastError?: string | null;
};

type EmailAccount = {
  id: string;
  provider: string;
  email: string;
  displayName?: string | null;
  source: "sso" | "connected";
  status?: "unchecked" | "checking" | "connected" | "needs_refresh";
  statusMessage?: string;
  canRemove: boolean;
  scopes: string[];
  createdAt?: string | null;
};

type EmailProvider = {
  id: string;
  label: string;
  configured: boolean;
  manual?: boolean;
};

type PollingSettings = {
  enabled: boolean;
  aiActive: boolean;
  intervalMinutes: number;
  lookbackValue: number;
  lookbackUnit: "hours" | "days";
  lastRunAt?: string | null;
};

type IntegrationApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt?: string | null;
  createdAt: string;
};

type EmailRule = {
  id: string;
  emailId: string;
  threadId: string;
  accountEmail?: string | null;
  fromEmail: string;
  fromName: string;
  subject: string;
  snippet: string;
  confidence: number;
  labelsApplied: string[];
  labelReasons?: Record<string, string>;
  labelConfidences?: Record<string, number>;
  isPending: boolean;
  createdAt: string;
  updatedAt: string;
};

type RuleEmailSearchResult = {
  emailId: string;
  threadId: string;
  accountEmail: string;
  provider: string;
  fromEmail: string;
  fromName: string;
  to: string;
  subject: string;
  snippet: string;
};

type RulePendingFilter = "all" | "pending" | "not-pending";
type RuleGroupBy = "none" | "isPending" | "fromEmail";

type TimelinePoint = {
  date: string;
  value: number;
};

type MetricsData = {
  rulesCreated: TimelinePoint[];
  ruleStatus: {
    pending: number;
    nonPending: number;
  };
  emailsLabeled: TimelinePoint[];
  draftsCreated: TimelinePoint[];
};

type SystemLog = {
  id: string;
  category: "ai" | "endpoints" | "webhook" | "mcp-server";
  eventName: string;
  status: "success" | "error" | "warning" | "info";
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

type OverviewData = {
  todayLabeled: number;
  syncedLabels: number;
  connectedAccounts: number;
  pendingRules: number;
  nonPendingRules: number;
  recentRules: EmailRule[];
};

type AiPrompt = {
  promptKey: string;
  title: string;
  markdown: string;
  templateTokens: string[];
};

type DraftEmailExample = {
  emailId: string;
  accountEmail: string;
  provider: string;
  to: string;
  subject: string;
  bodyText: string;
  markdown: string;
};

type DraftEmailSearchResult = DraftEmailExample;

type AiProviderDefinition = {
  label: string;
  defaultModel: string;
  models: string[];
  local?: boolean;
};

type AiPlatform = {
  id: string;
  name?: string;
  provider: string;
  providerLabel: string;
  model: string;
  baseUrl: string;
  sortOrder: number;
  status: "connected" | "untested" | "failed";
  lastError?: string;
  hasApiKey?: boolean;
  hasBearerToken?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type AiPlatformDraft = AiPlatform & {
  apiKey: string;
  bearerToken: string;
  isDraft?: boolean;
};

type ByoAiConfig = {
  providers: Record<string, AiProviderDefinition>;
  platforms: AiPlatform[];
  aiEnabled: boolean;
  canEnableAi: boolean;
  mcpClientEnabled?: boolean;
  canEnableMcpClient?: boolean;
  mcpClients?: AiMcpClientConfig[];
  mcpClient: AiMcpClientConfig;
};

type AiMcpTool = {
  name: string;
  description: string;
  inputSchema?: unknown;
};

type AiMcpClientConfig = {
  id?: string;
  name?: string;
  serverUrl: string;
  authType?: "none" | "bearer";
  isSystem?: boolean;
  enabled: boolean;
  status: "connected" | "untested" | "failed";
  lastError?: string;
  tools: AiMcpTool[];
  selectedTools: string[];
  hasBearerToken?: boolean;
};

const SYSTEM_MCP_CLIENT_ID = "system";
const SYSTEM_MCP_TOOLS: AiMcpTool[] = [
  {
    name: "create_draft_reply",
    description: "Create a draft reply in the connected account that owns the message.",
    inputSchema: null,
  },
  {
    name: "add_labels_on_email",
    description: "Classify an email, apply the best label when confident, or create a pending rule for review.",
    inputSchema: null,
  },
  {
    name: "query_email_rules",
    description: "Query email rules using AND/OR groups and supported equivalence operators.",
    inputSchema: null,
  },
  {
    name: "find_email",
    description: "Find connected-account emails by optional email id, subject, from, and to fields.",
    inputSchema: null,
  },
];

function getDefaultSystemMcpClient(): AiMcpClientConfig {
  return {
    id: SYSTEM_MCP_CLIENT_ID,
    name: "System MCP Tools",
    serverUrl: "System managed",
    authType: "none",
    isSystem: true,
    enabled: true,
    status: "connected",
    lastError: "",
    tools: SYSTEM_MCP_TOOLS,
    selectedTools: SYSTEM_MCP_TOOLS.map((tool) => tool.name),
    hasBearerToken: false,
  };
}

function ensureSystemMcpClient(clients: AiMcpClientConfig[]): AiMcpClientConfig[] {
  const existing = clients.find((client) => client.id === SYSTEM_MCP_CLIENT_ID || client.isSystem);
  const external = clients.filter((client) => client.id !== SYSTEM_MCP_CLIENT_ID && !client.isSystem);
  if (!existing) {
    return [getDefaultSystemMcpClient(), ...external];
  }
  return [
    {
      ...getDefaultSystemMcpClient(),
      ...existing,
      id: SYSTEM_MCP_CLIENT_ID,
      isSystem: true,
      name: "System MCP Tools",
      serverUrl: "System managed",
      authType: "none" as const,
      tools: existing.tools?.length ? existing.tools : SYSTEM_MCP_TOOLS,
      selectedTools: existing.selectedTools?.length ? existing.selectedTools : SYSTEM_MCP_TOOLS.map((tool) => tool.name),
    },
    ...external,
  ];
}

type InboxSort = "newest" | "oldest" | "sender" | "subject";
type InboxMode = "inbox" | "drafts" | "sent";

type InboxRuleStatus = {
  emailId: string;
  isPending: boolean;
};

type InboxMessage = {
  id: string;
  draftId?: string;
  threadId: string;
  accountId: string;
  accountEmail: string;
  provider: string;
  mailbox?: string;
  from: string;
  sender: string;
  subject: string;
  snippet: string;
  date: string;
  labels: string[];
  hasAttachments: boolean;
  replyCount?: number;
  rule?: InboxRuleStatus | null;
};

type InboxMessageDetail = {
  id: string;
  threadId: string;
  accountId: string;
  accountEmail: string;
  provider: string;
  mailbox?: string;
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  date: string;
  bodyText: string;
  bodyHtml: string;
  attachments: InboxAttachment[];
  threadMessages?: InboxThreadMessage[];
  replyCount?: number;
  rule?: InboxRuleStatus | null;
};

type InboxThreadMessage = {
  id: string;
  threadId: string;
  accountId: string;
  accountEmail: string;
  provider: string;
  from: string;
  to: string;
  cc?: string;
  subject: string;
  date: string;
  bodyText: string;
  bodyHtml: string;
  attachments: InboxAttachment[];
  isSent?: boolean;
};

type InboxAttachment = {
  filename: string;
  type: string;
  size?: number | null;
  downloadSupported?: boolean;
};

type InboxComposeDraft = {
  accountId: string;
  draftId?: string;
  mailbox?: string;
  threadId?: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  bodyText: string;
  replyContext?: {
    emailId: string;
    threadId: string;
    subject: string;
    from: string;
    snippet: string;
    bodyText: string;
    bodyHtml?: string;
  } | null;
};

type InboxToast = {
  id: number;
  message: string;
  type: "success" | "error";
};

const LABEL_NAME_MAX_LENGTH = 25;
const LABEL_DESCRIPTION_MAX_LENGTH = 200;
const LABEL_NAME_PATTERN = /^[A-Za-z0-9 _-]+$/;
const CONFIDENCE_THRESHOLD_TEMPLATE = "{confidenceThreshold}";

type DocumentationEntry = {
  content: string;
  order: number;
  slug: string;
  title: string;
};

const documentationModules = import.meta.glob("../documentation/*.md", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;
const documentationEntries = Object.entries(documentationModules)
  .map(([path, markdown]) => parseDocumentationEntry(path, markdown))
  .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title));

const navItems = [
  { id: "overview" as const, label: "Overview", icon: Gauge },
  { id: "inbox" as const, label: "Inbox", icon: Inbox },
  { id: "labels" as const, label: "Labels", icon: Tag },
  { id: "rules" as const, label: "Rule Review", icon: FileCheck2 },
  { id: "metrics" as const, label: "Metrics", icon: BarChart3 },
  { id: "ai-prompts" as const, label: "Artificial Intelligence", icon: Sparkles },
  { id: "settings" as const, label: "Settings", icon: Settings },
];

const aiPromptSubItems = [
  { id: "ai-byoai" as const, label: "BYOAI" },
  { id: "ai-prompt-library" as const, label: "Prompts" },
];

const settingsSubItems = [
  { id: "confidence-threshold" as const, label: "Confidence Threshold" },
  { id: "email-accounts" as const, label: "Email Accounts" },
  { id: "endpoints" as const, label: "Endpoints" },
  { id: "webhook" as const, label: "Webhook" },
  { id: "mcp-server" as const, label: "MCP Server" },
];

export function App() {
  const session = authClient.useSession();
  const [homeAssistantUser, setHomeAssistantUser] = useState<AuthUser | null>(null);
  const [isHomeAssistantSessionPending, setIsHomeAssistantSessionPending] = useState(true);
  const [activePage, setActivePage] = useState<Page>(() => pageFromPath(window.location.pathname));
  const [ruleToOpen, setRuleToOpen] = useState<string | null>(null);
  const [ruleInitialFilter, setRuleInitialFilter] = useState<RulePendingFilter | null>(null);
  const user = homeAssistantUser ?? (session.data?.user ? mapAuthUser(session.data.user) : null);

  useEffect(() => {
    async function loadHomeAssistantSession() {
      try {
        const response = await fetch("/api/home-assistant-session", { credentials: "include" });
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        if (data.user) {
          setHomeAssistantUser(mapAuthUser(data.user));
        }
      } catch {
        // Direct deployments continue using Better Auth.
      } finally {
        setIsHomeAssistantSessionPending(false);
      }
    }

    void loadHomeAssistantSession();
  }, []);

  useEffect(() => {
    function handlePopState() {
      setActivePage(pageFromPath(window.location.pathname));
      setRuleToOpen(null);
      setRuleInitialFilter(null);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function navigate(page: Page) {
    setActivePage(page);
    setRuleInitialFilter(null);
    if (page !== "rules") {
      setRuleToOpen(null);
    }
    const path = pathForPage(page);
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
  }

  function openRuleReview(emailId: string) {
    setRuleToOpen(emailId);
    setRuleInitialFilter(null);
    setActivePage("rules");
    if (window.location.pathname !== pathForPage("rules")) {
      window.history.pushState({}, "", pathForPage("rules"));
    }
  }

  function openPendingRuleReview() {
    setRuleToOpen(null);
    setRuleInitialFilter("pending");
    setActivePage("rules");
    if (window.location.pathname !== pathForPage("rules")) {
      window.history.pushState({}, "", pathForPage("rules"));
    }
  }

  if (session.isPending || isHomeAssistantSessionPending) {
    return <LoadingScreen />;
  }

  return user ? (
    <AuthenticatedLayout
      activePage={activePage}
      onNavigate={navigate}
      onOpenRuleReview={openRuleReview}
      onOpenPendingRuleReview={openPendingRuleReview}
      onSignOut={async () => {
        if (homeAssistantUser) {
          return;
        }
        await authClient.signOut();
        await session.refetch();
        navigate("overview");
      }}
      ruleInitialFilter={ruleInitialFilter}
      ruleToOpen={ruleToOpen}
      user={user}
    />
  ) : (
    <HomePage onAuthSuccess={() => session.refetch()} />
  );
}

function HomePage({ onAuthSuccess }: { onAuthSuccess: () => Promise<unknown> }) {
  return (
    <main className="min-h-screen bg-stone-50 text-zinc-950">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-zinc-950 text-white">
            <MailCheck className="h-5 w-5" />
          </div>
          <span className="text-sm font-semibold">AI Email Labeling Assistant</span>
        </div>
        <a className="text-sm font-medium text-zinc-700 hover:text-zinc-950" href="#auth">
          Login
        </a>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl grid-cols-1 items-center gap-10 px-5 py-12 lg:grid-cols-[1fr_420px]">
        <div className="max-w-2xl">
          <Badge className="mb-5 bg-white">Google OAuth + email login</Badge>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">
            Label Gmail faster with rules you can review.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-zinc-600">
            Connect your account, review suggested labeling rules, and keep your inbox organized with an assistant built
            for transparent decisions.
          </p>
          <div className="mt-6 flex items-center gap-2 text-sm text-zinc-500">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Authentication is handled by the app API and stored in Postgres.
          </div>
        </div>

        <AuthPanel onAuthSuccess={onAuthSuccess} />
      </section>
    </main>
  );
}

function AuthPanel({ onAuthSuccess }: { onAuthSuccess: () => Promise<unknown> }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authConfig, setAuthConfig] = useState<AuthConfig>({
    googleOAuthEnabled: false,
    emailAndPasswordEnabled: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAuthConfig() {
      try {
        const response = await fetch("/api/auth-settings");
        if (!response.ok) {
          return;
        }

        setAuthConfig((await response.json()) as AuthConfig);
      } catch {
        setAuthConfig((current) => current);
      }
    }

    void loadAuthConfig();
  }, []);

  async function handleEmailAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result =
        mode === "signup"
          ? await authClient.signUp.email({
              email,
              password,
              name,
            })
          : await authClient.signIn.email({
              email,
              password,
            });

      if (result.error) {
        setError(result.error.message ?? "Authentication failed.");
        return;
      }

      await onAuthSuccess();
    } catch {
      setError("Authentication failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    setError(null);

    if (!authConfig.googleOAuthEnabled) {
      setError("Google OAuth is not configured yet.");
      return;
    }

    setIsSubmitting(true);
    try {
      const callbackURL = getAbsoluteRuntimeUrl("/");
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL,
        errorCallbackURL: callbackURL,
        newUserCallbackURL: callbackURL,
        disableRedirect: true,
      });

      if (result.error) {
        setError(result.error.message ?? "Could not start Google authentication.");
        setIsSubmitting(false);
        return;
      }

      const authorizationUrl = result.data?.url;
      if (!authorizationUrl) {
        setError("Google did not return an authentication URL.");
        setIsSubmitting(false);
        return;
      }

      if (window.top && window.top !== window) {
        window.top.location.href = authorizationUrl;
      } else {
        window.location.href = authorizationUrl;
      }
    } catch {
      setError("Could not start Google authentication.");
      setIsSubmitting(false);
    }
  }

  return (
    <Card id="auth" className="scroll-mt-6">
      <CardHeader>
        <CardTitle>{mode === "login" ? "Log in" : "Create account"}</CardTitle>
        <CardDescription>
          {mode === "login"
            ? "Access your labeling dashboard with Google or email."
            : "Create an account with Google or an email and password."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-md bg-zinc-100 p-1">
          <button
            className={cn(
              "h-9 rounded-md text-sm font-medium text-zinc-600 transition-colors",
              mode === "login" && "bg-white text-zinc-950 shadow-sm",
            )}
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            type="button"
          >
            Login
          </button>
          <button
            className={cn(
              "h-9 rounded-md text-sm font-medium text-zinc-600 transition-colors",
              mode === "signup" && "bg-white text-zinc-950 shadow-sm",
            )}
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
            type="button"
          >
            Sign up
          </button>
        </div>

        <Button className="w-full" disabled={!authConfig.googleOAuthEnabled || isSubmitting} onClick={handleGoogleLogin} type="button">
          {isSubmitting ? <Loader /> : null}
          Login with Google
          <ChevronRight className="h-4 w-4" />
        </Button>
        {!authConfig.googleOAuthEnabled ? (
          <p className="mt-2 text-xs text-zinc-500">Google OAuth needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.</p>
        ) : null}

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-zinc-200" />
          <span className="text-xs font-medium uppercase text-zinc-400">or</span>
          <div className="h-px flex-1 bg-zinc-200" />
        </div>

        <form className="space-y-3" onSubmit={handleEmailAuth}>
          {mode === "signup" ? (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-zinc-700">Name</span>
              <input
                className="h-10 w-full glass-panel rounded-md border px-3 text-sm outline-none transition-colors focus:border-zinc-400"
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </label>
          ) : null}
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">Email</span>
            <input
              autoComplete="email"
              className="h-10 w-full glass-panel rounded-md border px-3 text-sm outline-none transition-colors focus:border-zinc-400"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">Password</span>
            <input
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="h-10 w-full glass-panel rounded-md border px-3 text-sm outline-none transition-colors focus:border-zinc-400"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <Button className="w-full" disabled={isSubmitting || !authConfig.emailAndPasswordEnabled} type="submit">
            {isSubmitting ? "Please wait..." : mode === "login" ? "Login with email" : "Create account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-5 text-zinc-950">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-zinc-950 text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <CardTitle>Loading session</CardTitle>
          <CardDescription>Checking whether you are already signed in.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-zinc-950" />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function AuthenticatedLayout({
  activePage,
  onNavigate,
  onOpenRuleReview,
  onOpenPendingRuleReview,
  onSignOut,
  ruleInitialFilter,
  ruleToOpen,
  user,
}: {
  activePage: Page;
  onNavigate: (page: Page) => void;
  onOpenRuleReview: (emailId: string) => void;
  onOpenPendingRuleReview: () => void;
  onSignOut: () => void;
  ruleInitialFilter: RulePendingFilter | null;
  ruleToOpen: string | null;
  user: AuthUser;
}) {
  const title = useMemo(() => getPageTitle(activePage), [activePage]);
  const [privacyMode, setPrivacyMode] = useState(() => localStorage.getItem("emailable-privacy-mode") === "true");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("emailable-sidebar-collapsed") === "true");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [documentationTocOpen, setDocumentationTocOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("emailable-privacy-mode", String(privacyMode));
  }, [privacyMode]);

  useEffect(() => {
    localStorage.setItem("emailable-sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (activePage !== "documentation") {
      setDocumentationTocOpen(false);
    }
  }, [activePage]);

  function navigateFromMobileMenu(page: Page) {
    onNavigate(page);
    setMobileMenuOpen(false);
  }

  return (
    <div className="min-h-screen bg-transparent text-zinc-950">
      <aside className={cn("fixed inset-y-0 left-0 hidden border-r border-white/60 bg-white/55 shadow-sm backdrop-blur-2xl transition-all md:flex md:flex-col", sidebarCollapsed ? "w-20" : "w-64")}>
        <div className={cn("flex h-16 items-center border-b border-zinc-200 px-4", sidebarCollapsed ? "justify-start" : "justify-between gap-3")}>
          {!sidebarCollapsed ? (
          <div className="flex min-w-0 items-center gap-3">
            <EmailableLogo className="h-9 w-9 shrink-0" />
              <div className="min-w-0">
                <p className="truncate bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-600 bg-clip-text text-xl font-bold text-transparent">
                  Emailable
                </p>
              </div>
          </div>
          ) : null}
          {!sidebarCollapsed ? (
            <Button aria-label="Collapse menu" onClick={() => setSidebarCollapsed(true)} size="icon" type="button" variant="ghost">
              <Menu className="h-4 w-4" />
            </Button>
          ) : (
            <Button aria-label="Expand menu" onClick={() => setSidebarCollapsed(false)} size="icon" type="button" variant="ghost">
              <Menu className="h-4 w-4" />
            </Button>
          )}
        </div>
        <nav className={cn("flex-1 space-y-1 py-4", sidebarCollapsed ? "px-2" : "px-3")}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              activePage === item.id ||
              (item.id === "settings" && isSettingsPage(activePage)) ||
              (item.id === "ai-prompts" && isAiPromptsPage(activePage));

            return (
              <div key={item.id}>
                <button
                  className={cn(
                    "flex h-10 w-full items-center rounded-md text-sm font-medium text-zinc-600 transition-colors hover:bg-white/55 hover:text-zinc-950",
                    sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3 text-left",
                    isActive &&
                      "border border-white/70 bg-white/70 text-zinc-950 shadow-sm backdrop-blur-xl hover:bg-white/80 hover:text-zinc-950",
                  )}
                  onClick={() => onNavigate(item.id)}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed ? item.label : null}
                </button>
                {!sidebarCollapsed && item.id === "settings" && isSettingsPage(activePage) ? (
                  <div className="mt-1 space-y-1 pl-7">
                    {settingsSubItems.map((subItem) => (
                      <button
                        className={cn(
                          "flex min-h-9 w-full items-center rounded-md px-3 text-left text-sm font-medium text-zinc-500 transition-colors hover:bg-white/55 hover:text-zinc-950",
                          activePage === subItem.id &&
                            "border border-white/70 bg-white/65 text-zinc-950 shadow-sm backdrop-blur-xl",
                        )}
                        key={subItem.id}
                        onClick={() => onNavigate(subItem.id)}
                      >
                        {subItem.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                {!sidebarCollapsed && item.id === "ai-prompts" && isAiPromptsPage(activePage) ? (
                  <div className="mt-1 space-y-1 pl-7">
                    {aiPromptSubItems.map((subItem) => (
                      <button
                        className={cn(
                          "flex min-h-9 w-full items-center rounded-md px-3 text-left text-sm font-medium text-zinc-500 transition-colors hover:bg-white/55 hover:text-zinc-950",
                          activePage === subItem.id &&
                            "border border-white/70 bg-white/65 text-zinc-950 shadow-sm backdrop-blur-xl",
                        )}
                        key={subItem.id}
                        onClick={() => onNavigate(subItem.id)}
                      >
                        {subItem.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
        <div className={cn("relative space-y-2 border-t border-zinc-200 p-3", sidebarCollapsed && "px-2")}>
          <button
            className={cn(
              "flex min-h-10 w-full items-center rounded-md text-sm font-medium text-zinc-600 transition-colors hover:bg-white/55 hover:text-zinc-950",
              sidebarCollapsed ? "justify-center px-0" : "gap-2 px-3 text-left",
              activePage === "documentation" && "border border-white/70 bg-white/70 text-zinc-950 shadow-sm backdrop-blur-xl",
            )}
            onClick={() => onNavigate("documentation")}
            title={sidebarCollapsed ? "Documentation" : undefined}
            type="button"
          >
            <BookOpen className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed ? "Documentation" : null}
          </button>
          <label className={cn("flex min-h-10 cursor-pointer items-center rounded-md text-sm font-medium text-zinc-600 hover:bg-zinc-50", sidebarCollapsed ? "justify-center" : "justify-between gap-3 px-3")}>
            {!sidebarCollapsed ? (
              <span className="flex items-center gap-2">
                <ShieldCheck className={cn("h-4 w-4", privacyMode && "text-emerald-600")} />
                Privacy
              </span>
            ) : (
              <ShieldCheck className={cn("h-4 w-4", privacyMode && "text-emerald-600")} />
            )}
            <input
              aria-label="Privacy mode"
              checked={privacyMode}
              className="peer sr-only"
              onChange={(event) => setPrivacyMode(event.target.checked)}
              title={sidebarCollapsed ? "Privacy" : undefined}
              type="checkbox"
            />
            {!sidebarCollapsed ? (
              <span className="relative h-5 w-9 rounded-full bg-zinc-200 transition-colors peer-checked:bg-zinc-950 peer-checked:[&>span]:translate-x-4">
                <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform" />
              </span>
            ) : null}
          </label>
          {!user.homeAssistant ? (
            <Button className={cn("w-full", sidebarCollapsed ? "justify-center px-0" : "justify-start")} variant="ghost" onClick={onSignOut} title={sidebarCollapsed ? "Sign out" : undefined}>
              <LogOut className="h-4 w-4" />
              {!sidebarCollapsed ? "Sign out" : null}
            </Button>
          ) : null}
        </div>
      </aside>

      <div className={cn("min-w-0 transition-all", sidebarCollapsed ? "md:pl-20" : "md:pl-64")}>
        <header className={cn("sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-white/60 bg-white/55 px-4 shadow-sm backdrop-blur-xl sm:px-5", activePage === "inbox" && "max-md:hidden")}>
          <div className="flex min-w-0 items-center gap-3">
            <Button aria-label="Open menu" className="shrink-0 md:hidden" onClick={() => setMobileMenuOpen(true)} size="icon" type="button" variant="ghost">
              <Menu className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase text-zinc-500">Dashboard</p>
              <h2 className="truncate text-xl font-semibold">{title}</h2>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden min-w-0 items-center gap-3 md:flex">
              <UserAvatar className="h-8 w-8" user={user} />
              <div className="min-w-0 text-right">
                <p className="truncate text-sm font-medium">{formatEmailTextForPrivacy(user.name, privacyMode)}</p>
                <p className="truncate text-xs text-zinc-500">{user.homeAssistant ? "Home Assistant account" : formatEmailForPrivacy(user.email, privacyMode)}</p>
              </div>
            </div>
            {activePage === "documentation" ? (
              <Button aria-label="Open documentation table of contents" className="shrink-0 lg:hidden" onClick={() => setDocumentationTocOpen(true)} size="icon" type="button" variant="ghost">
                <List className="h-5 w-5" />
              </Button>
            ) : null}
          </div>
        </header>

        {mobileMenuOpen ? (
          <div className="fixed inset-0 z-[45] md:hidden">
            <button
              aria-label="Close menu"
              className="absolute inset-0 cursor-default bg-black/30 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
              type="button"
            />
            <div className="relative h-full w-[min(82vw,320px)] overflow-y-auto border-r border-white/70 bg-white/90 shadow-2xl backdrop-blur-2xl">
              <div className="flex h-16 items-center justify-between border-b border-zinc-200 px-4">
                <div className="flex min-w-0 items-center gap-3">
                  <EmailableLogo className="h-9 w-9 shrink-0" />
                  <p className="truncate bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-600 bg-clip-text text-xl font-bold text-transparent">
                    Emailable
                  </p>
                </div>
                <Button aria-label="Close menu" onClick={() => setMobileMenuOpen(false)} size="icon" type="button" variant="ghost">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <nav className="space-y-1 px-3 py-4">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    activePage === item.id ||
                    (item.id === "settings" && isSettingsPage(activePage)) ||
                    (item.id === "ai-prompts" && isAiPromptsPage(activePage));

                  return (
                    <div key={item.id}>
                      <button
                        className={cn(
                          "flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-zinc-600 transition-colors hover:bg-white/55 hover:text-zinc-950",
                          isActive &&
                            "border border-white/70 bg-white/70 text-zinc-950 shadow-sm backdrop-blur-xl hover:bg-white/80 hover:text-zinc-950",
                        )}
                        onClick={() => navigateFromMobileMenu(item.id)}
                        type="button"
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </button>
                      {item.id === "settings" && isSettingsPage(activePage) ? (
                        <div className="mt-1 space-y-1 pl-7">
                          {settingsSubItems.map((subItem) => (
                            <button
                              className={cn(
                                "flex min-h-9 w-full items-center rounded-md px-3 text-left text-sm font-medium text-zinc-500 transition-colors hover:bg-white/55 hover:text-zinc-950",
                                activePage === subItem.id &&
                                  "border border-white/70 bg-white/65 text-zinc-950 shadow-sm backdrop-blur-xl",
                              )}
                              key={subItem.id}
                              onClick={() => navigateFromMobileMenu(subItem.id)}
                              type="button"
                            >
                              {subItem.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {item.id === "ai-prompts" && isAiPromptsPage(activePage) ? (
                        <div className="mt-1 space-y-1 pl-7">
                          {aiPromptSubItems.map((subItem) => (
                            <button
                              className={cn(
                                "flex min-h-9 w-full items-center rounded-md px-3 text-left text-sm font-medium text-zinc-500 transition-colors hover:bg-white/55 hover:text-zinc-950",
                                activePage === subItem.id &&
                                  "border border-white/70 bg-white/65 text-zinc-950 shadow-sm backdrop-blur-xl",
                              )}
                              key={subItem.id}
                              onClick={() => navigateFromMobileMenu(subItem.id)}
                              type="button"
                            >
                              {subItem.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </nav>
              <div className="space-y-2 border-t border-zinc-200 p-3">
                <button
                  className={cn(
                    "flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium text-zinc-600 transition-colors hover:bg-white/55 hover:text-zinc-950",
                    activePage === "documentation" && "border border-white/70 bg-white/70 text-zinc-950 shadow-sm backdrop-blur-xl",
                  )}
                  onClick={() => navigateFromMobileMenu("documentation")}
                  type="button"
                >
                  <BookOpen className="h-4 w-4" />
                  Documentation
                </button>
                <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-md px-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
                  <span className="flex items-center gap-2">
                    <ShieldCheck className={cn("h-4 w-4", privacyMode && "text-emerald-600")} />
                    Privacy
                  </span>
                  <input
                    aria-label="Privacy mode"
                    checked={privacyMode}
                    className="peer sr-only"
                    onChange={(event) => setPrivacyMode(event.target.checked)}
                    type="checkbox"
                  />
                  <span className="relative h-5 w-9 rounded-full bg-zinc-200 transition-colors peer-checked:bg-zinc-950 peer-checked:[&>span]:translate-x-4">
                    <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform" />
                  </span>
                </label>
                {!user.homeAssistant ? (
                  <Button className="w-full justify-start" variant="ghost" onClick={onSignOut}>
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <main className="min-h-[calc(100vh-4rem)] min-w-0 overflow-x-hidden p-4 sm:p-5 lg:p-8">
          {activePage === "overview" && (
            <OverviewPage
              onNavigate={onNavigate}
              onOpenPendingRuleReview={onOpenPendingRuleReview}
              onOpenRuleReview={onOpenRuleReview}
              privacyMode={privacyMode}
            />
          )}
          {activePage === "inbox" && <InboxPage onOpenMobileMenu={() => setMobileMenuOpen(true)} privacyMode={privacyMode} />}
          {activePage === "labels" && <LabelsPage privacyMode={privacyMode} />}
          {activePage === "rules" && <RuleReviewPage initialEmailId={ruleToOpen} initialPendingFilter={ruleInitialFilter} privacyMode={privacyMode} />}
          {activePage === "metrics" && <MetricsPage />}
          {activePage === "documentation" && (
            <DocumentationPage
              mobileTocOpen={documentationTocOpen}
              onCloseMobileToc={() => setDocumentationTocOpen(false)}
            />
          )}
          {activePage === "ai-prompts" && <AiPromptsPage onNavigate={onNavigate} />}
          {activePage === "ai-byoai" && <ByoAiPage />}
          {activePage === "ai-prompt-library" && <AiPromptLibraryPage privacyMode={privacyMode} />}
          {activePage === "settings" && <SettingsPage onNavigate={onNavigate} />}
          {activePage === "confidence-threshold" && <ConfidenceThresholdPage />}
          {activePage === "email-accounts" && <EmailAccountsPage privacyMode={privacyMode} />}
          {activePage === "endpoints" && <EndpointsPage />}
          {activePage === "webhook" && <WebhookPage />}
          {activePage === "mcp-server" && <McpServerPage onNavigate={onNavigate} />}
        </main>
      </div>
    </div>
  );
}

function OverviewPage({
  onNavigate,
  onOpenPendingRuleReview,
  onOpenRuleReview,
  privacyMode,
}: {
  onNavigate: (page: Page) => void;
  onOpenPendingRuleReview: () => void;
  onOpenRuleReview: (emailId: string) => void;
  privacyMode: boolean;
}) {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadOverview() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/overview", { credentials: "include" });
        const data = await response.json();

        if (!response.ok) {
          setError(data.error ?? "Could not load overview.");
          return;
        }

        setOverview(data);
      } catch {
        setError("Could not load overview.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadOverview();
  }, []);

  const pendingRules = overview?.pendingRules ?? 0;
  const nonPendingRules = overview?.nonPendingRules ?? 0;
  const totalRules = pendingRules + nonPendingRules;

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          actionLabel="View metrics"
          icon={MailCheck}
          label="Emails processed today"
          loading={isLoading}
          onAction={() => onNavigate("metrics")}
          value={formatNumber(overview?.todayLabeled ?? 0)}
        />
        <MetricCard
          actionLabel="View labels"
          icon={Sparkles}
          label="Number of labels"
          loading={isLoading}
          onAction={() => onNavigate("labels")}
          value={formatNumber(overview?.syncedLabels ?? 0)}
        />
        <MetricCard
          actionLabel="View accounts"
          icon={Inbox}
          label="Connected Accounts"
          loading={isLoading}
          onAction={() => onNavigate("email-accounts")}
          value={formatNumber(overview?.connectedAccounts ?? 0)}
        />
        <MetricCard
          actionLabel={pendingRules > 0 ? `Review ${formatNumber(pendingRules)} pending rules` : undefined}
          icon={CheckCircle2}
          label="Total number of rules"
          loading={isLoading}
          onAction={pendingRules > 0 ? onOpenPendingRuleReview : undefined}
          value={formatNumber(totalRules)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest rules created or modified.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="rounded-md border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
              Loading recent activity...
            </div>
          ) : overview?.recentRules.length ? (
            overview.recentRules.map((rule) => (
              <button
                className="flex w-full cursor-pointer items-start justify-between gap-4 rounded-md border border-zinc-100 p-3 text-left transition-colors hover:bg-zinc-50"
                key={rule.emailId}
                onClick={() => onOpenRuleReview(rule.emailId)}
                type="button"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-950">{rule.subject}</p>
                  <p className="mt-1 truncate text-sm text-zinc-500">{formatEmailForPrivacy(rule.fromEmail, privacyMode)}</p>
                  <p className="mt-1 truncate text-xs text-zinc-500">Account: {formatEmailForPrivacy(rule.accountEmail || "Unknown account", privacyMode)}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-600">
                    {formatRuleLabelReasons(rule)}
                  </p>
                </div>
                <Badge className={rule.isPending ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>
                  {rule.isPending ? "Pending" : "Reviewed"}
                </Badge>
              </button>
            ))
          ) : (
            <div className="rounded-md border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
              No recent rules yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DocumentationPage({
  mobileTocOpen,
  onCloseMobileToc,
}: {
  mobileTocOpen: boolean;
  onCloseMobileToc: () => void;
}) {
  const [activeSlug, setActiveSlug] = useState(() => documentationSlugFromPath(window.location.pathname));
  const activeEntry = documentationEntries.find((entry) => entry.slug === activeSlug) ?? documentationEntries[0];

  useEffect(() => {
    function handlePopState() {
      setActiveSlug(documentationSlugFromPath(window.location.pathname));
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!mobileTocOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileTocOpen]);

  function selectEntry(entry: DocumentationEntry) {
    setActiveSlug(entry.slug);
    const nextPath = entry.slug === documentationEntries[0]?.slug
      ? "/documentation"
      : `/documentation/${entry.slug}`;
    window.history.pushState({}, "", getRuntimeUrl(nextPath));
    onCloseMobileToc();
  }

  if (!activeEntry) {
    return <p className="rounded-md border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">No documentation is available yet.</p>;
  }

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
      <article className="min-w-0 rounded-lg border border-white/70 bg-white/55 p-5 shadow-sm backdrop-blur-xl sm:p-7 lg:p-9">
        <div
          className="max-w-none text-zinc-700 [&_a]:font-medium [&_a]:text-blue-700 [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-blue-900 [&_code]:rounded [&_code]:bg-zinc-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_h1]:mb-5 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:text-zinc-950 [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-zinc-950 [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-zinc-950 [&_li]:mb-1.5 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-4 [&_p]:leading-7 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-zinc-950 [&_pre]:p-4 [&_pre]:text-sm [&_pre]:text-white [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-5 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-zinc-200 [&_td]:p-2 [&_th]:border [&_th]:border-zinc-200 [&_th]:bg-zinc-50 [&_th]:p-2 [&_th]:text-left [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6"
          dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(activeEntry.content) }}
        />
      </article>

      <aside className="hidden min-w-0 lg:order-2 lg:block">
        <div className="sticky top-20 flex max-h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-lg border border-white/70 bg-white/55 p-4 shadow-sm backdrop-blur-xl">
          <p className="mb-3 shrink-0 text-xs font-semibold uppercase text-zinc-500">Table of contents</p>
          <nav className="min-h-0 space-y-1 overflow-y-auto pr-1">
            {documentationEntries.map((entry) => (
              <button
                className={cn(
                  "flex min-h-10 w-full items-center rounded-md px-3 text-left text-sm font-medium text-zinc-600 transition-colors hover:bg-white/70 hover:text-zinc-950",
                  activeEntry.slug === entry.slug && "border border-white/80 bg-white/80 text-zinc-950 shadow-sm",
                )}
                key={entry.slug}
                onClick={() => selectEntry(entry)}
                type="button"
              >
                {entry.title}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {mobileTocOpen ? (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            aria-label="Close documentation table of contents"
            className="absolute inset-0 cursor-default bg-slate-950/25"
            onClick={onCloseMobileToc}
            type="button"
          />
          <aside className="absolute inset-y-0 right-0 flex w-[min(86vw,340px)] flex-col border-l border-white/70 bg-white/90 shadow-2xl backdrop-blur-xl">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 px-4">
              <div className="flex items-center gap-2">
                <List className="h-4 w-4 text-zinc-500" />
                <p className="font-semibold text-zinc-950">Table of contents</p>
              </div>
              <Button aria-label="Close documentation table of contents" onClick={onCloseMobileToc} size="icon" type="button" variant="ghost">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4">
              {documentationEntries.map((entry) => (
                <button
                  className={cn(
                    "flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm font-medium text-zinc-600 transition-colors hover:bg-white/80 hover:text-zinc-950",
                    activeEntry.slug === entry.slug && "border border-white/80 bg-white text-zinc-950 shadow-sm",
                  )}
                  key={entry.slug}
                  onClick={() => selectEntry(entry)}
                  type="button"
                >
                  {entry.title}
                </button>
              ))}
            </nav>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function InboxPage({ onOpenMobileMenu, privacyMode }: { onOpenMobileMenu: () => void; privacyMode: boolean }) {
  const [labels, setLabels] = useState<Label[]>([]);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [inboxMode, setInboxMode] = useState<InboxMode>("inbox");
  const [selectedLabelId, setSelectedLabelId] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [labelCounts, setLabelCounts] = useState<Record<string, number | null>>({});
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [sort, setSort] = useState<InboxSort>("newest");
  const [sentSearch, setSentSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [messageLoadProgress, setMessageLoadProgress] = useState({ completed: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<InboxMessage | null>(null);
  const [messageDetail, setMessageDetail] = useState<InboxMessageDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeInitial, setComposeInitial] = useState<Partial<InboxComposeDraft> | null>(null);
  const [selectedMessageKeys, setSelectedMessageKeys] = useState<string[]>([]);
  const [deletingMessageKeys, setDeletingMessageKeys] = useState<string[]>([]);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isBulkActionRunning, setIsBulkActionRunning] = useState(false);
  const [isLabelActionRunning, setIsLabelActionRunning] = useState(false);
  const [ruleEditorMessage, setRuleEditorMessage] = useState<InboxMessage | null>(null);
  const [isCountsLoading, setIsCountsLoading] = useState(false);
  const [toast, setToast] = useState<InboxToast | null>(null);
  const [isByoAiActive, setIsByoAiActive] = useState(false);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [isMobileLabelPickerOpen, setIsMobileLabelPickerOpen] = useState(false);
  const [isMobileEditMode, setIsMobileEditMode] = useState(false);

  useEffect(() => {
    async function loadBootstrap() {
      setIsLoading(true);
      setError(null);

      try {
        const [labelsResponse, accountsResponse, byoAiResponse] = await Promise.all([
          fetch("/api/labels", { credentials: "include" }),
          fetch("/api/email-accounts", { credentials: "include" }),
          fetch("/api/byoai/config", { credentials: "include" }),
        ]);
        const labelsData = await labelsResponse.json();
        const accountsData = await accountsResponse.json();
        const byoAiData = await byoAiResponse.json().catch(() => ({}));

        if (!labelsResponse.ok) {
          setError(labelsData.error ?? "Could not load labels.");
          return;
        }
        if (!accountsResponse.ok) {
          setError(accountsData.error ?? "Could not load accounts.");
          return;
        }

        const loadedLabels = labelsData.labels ?? [];
        const loadedAccounts = accountsData.accounts ?? [];
        setLabels(loadedLabels);
        setAccounts(loadedAccounts);
        setSelectedAccountIds(loadedAccounts.map((account: EmailAccount) => account.id));
        setSelectedLabelId((current) => current || loadedLabels[0]?.id || "");
        setIsByoAiActive(Boolean(byoAiResponse.ok && byoAiData.aiEnabled));
      } catch {
        setError("Could not load Inbox setup.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadBootstrap();
  }, []);

  useEffect(() => {
    if (selectedAccountIds.length === 0 || (inboxMode === "inbox" && !selectedLabelId)) {
      setMessages([]);
      setNextPageToken(null);
      return;
    }

    void loadMessages({ reset: true });
  }, [inboxMode, selectedLabelId, selectedAccountIds.join(","), sort, sentSearch]);

  useEffect(() => {
    if (!isAccountMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-inbox-account-menu]")) {
        setIsAccountMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isAccountMenuOpen]);

  useEffect(() => {
    if (inboxMode !== "inbox" || selectedAccountIds.length === 0 || labels.length === 0) {
      setLabelCounts({});
      setIsCountsLoading(false);
      return;
    }

    async function loadCounts() {
      setIsCountsLoading(true);
      try {
        const response = await fetch(`/api/inbox/label-counts?accounts=${encodeURIComponent(selectedAccountIds.join(","))}`, {
          credentials: "include",
        });
        const data = await response.json();
        if (response.ok) {
          setLabelCounts(data.counts ?? {});
        }
      } catch {
        setLabelCounts({});
      } finally {
        setIsCountsLoading(false);
      }
    }

    void loadCounts();
  }, [inboxMode, labels.length, selectedAccountIds.join(",")]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    const shouldLockScroll = Boolean(
      selectedMessage ||
        ruleEditorMessage ||
        isComposeOpen ||
        isMobileFilterOpen ||
        isMobileLabelPickerOpen,
    );

    if (!shouldLockScroll) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [selectedMessage, ruleEditorMessage, isComposeOpen, isMobileFilterOpen, isMobileLabelPickerOpen]);

  const filteredMessages = messages;
  const selectedLabel = labels.find((label) => label.id === selectedLabelId) ?? null;

  async function loadMessages({ reset }: { reset: boolean }) {
    if (selectedAccountIds.length === 0 || (inboxMode === "inbox" && !selectedLabelId)) {
      return;
    }

    reset ? setIsLoading(true) : setIsLoadingMore(true);
    if (reset) {
      setMessages([]);
      setMessageLoadProgress({ completed: 0, total: selectedAccountIds.length });
    }
    setError(null);

    try {
      const endpoint = inboxMode === "drafts" ? "/api/inbox/drafts" : inboxMode === "sent" ? "/api/inbox/sent" : "/api/inbox/messages";
      if (reset) {
        const messagesByAccount: InboxMessage[] = [];
        const nextPageState: Record<string, string> = {};
        const failures: string[] = [];

        await Promise.all(selectedAccountIds.map(async (accountId) => {
          const params = buildInboxMessageParams({
            accountIds: [accountId],
            inboxMode,
            labelId: selectedLabelId,
            search: sentSearch,
            sort,
          });

          try {
            const response = await fetch(`${endpoint}?${params.toString()}`, { credentials: "include" });
            const data = await response.json();

            if (!response.ok) {
              failures.push(data.error ?? `Could not load ${getInboxModeDescription(inboxMode)}.`);
              return;
            }

            messagesByAccount.push(...(data.messages ?? []));
            Object.assign(nextPageState, decodeInboxPageToken(data.nextPageToken));
          } catch {
            failures.push(`Could not load ${getInboxModeDescription(inboxMode)}.`);
          } finally {
            setMessageLoadProgress((current) => ({
              ...current,
              completed: Math.min(current.total, current.completed + 1),
            }));
          }
        }));

        setMessages(sortInboxMessagesForClient(messagesByAccount, sort));
        setNextPageToken(encodeInboxPageToken(nextPageState));
        setSelectedMessageKeys([]);
        if (messagesByAccount.length === 0 && failures.length > 0) {
          setError(failures[0]);
        }
        return;
      }

      const params = new URLSearchParams({
        accounts: selectedAccountIds.join(","),
        sort,
      });
      if (inboxMode === "inbox") {
        params.set("labelId", selectedLabelId);
      }
      if (inboxMode === "sent" && sentSearch) {
        params.set("search", sentSearch);
      }
      if (!reset && nextPageToken) {
        params.set("pageToken", nextPageToken);
      }

      const response = await fetch(`${endpoint}?${params.toString()}`, { credentials: "include" });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? `Could not load ${inboxMode === "drafts" ? "drafts" : inboxMode === "sent" ? "sent messages" : "inbox messages"}.`);
        return;
      }

      setMessages((current) => (reset ? data.messages ?? [] : [...current, ...(data.messages ?? [])]));
      setNextPageToken(data.nextPageToken ?? null);
      if (reset) {
        setSelectedMessageKeys([]);
      }
    } catch {
      setError(`Could not load ${inboxMode === "drafts" ? "drafts" : inboxMode === "sent" ? "sent messages" : "inbox messages"}.`);
    } finally {
      reset ? setIsLoading(false) : setIsLoadingMore(false);
      if (reset) {
        setMessageLoadProgress((current) => ({ ...current, completed: current.total }));
      }
    }
  }

  async function openMessage(message: InboxMessage) {
    if (inboxMode !== "drafts") {
      setSelectedMessage(message);
    }
    setMessageDetail(null);
    setDetailError(null);
    setIsDetailLoading(true);

    try {
      const params = new URLSearchParams({
        accountId: message.accountId,
        emailId: message.id,
      });
      if (message.mailbox) {
        params.set("mailbox", message.mailbox);
      }

      const response = await fetch(`/api/inbox/message?${params.toString()}`, { credentials: "include" });
      const data = await response.json();
      if (!response.ok) {
        const messageError = data.error ?? "Could not load email.";
        inboxMode === "drafts" ? setError(messageError) : setDetailError(messageError);
        return;
      }

      if (inboxMode === "drafts") {
        setComposeInitial({
          accountId: message.accountId,
          draftId: message.draftId || message.id,
          mailbox: message.mailbox || "",
          threadId: data.message.threadId || message.threadId,
          to: data.message.to || "",
          cc: data.message.cc || "",
          bcc: data.message.bcc || "",
          subject: data.message.subject || "",
          bodyText: data.message.bodyText || "",
        });
        setIsComposeOpen(true);
      } else {
        setMessageDetail(data.message);
      }
    } catch {
      inboxMode === "drafts" ? setError("Could not load draft.") : setDetailError("Could not load email.");
    } finally {
      setIsDetailLoading(false);
    }
  }

  function toggleAccount(accountId: string) {
    setSelectedAccountIds((current) =>
      current.includes(accountId) ? current.filter((id) => id !== accountId) : [...current, accountId],
    );
  }

  const selectedMessages = messages.filter((message) => selectedMessageKeys.includes(getInboxMessageKey(message)));
  const allVisibleSelected = filteredMessages.length > 0 && filteredMessages.every((message) => selectedMessageKeys.includes(getInboxMessageKey(message)));
  const selectedMessagesLabelValue = getCommonMessageLabelId(selectedMessages, labels);

  function enterMobileEditMode(message?: InboxMessage) {
    setIsMobileEditMode(true);
    if (message) {
      setSelectedMessageKeys((current) => [...new Set([...current, getInboxMessageKey(message)])]);
    }
  }

  function cancelMobileEditMode() {
    setIsMobileEditMode(false);
    setSelectedMessageKeys([]);
  }

  function toggleMessage(message: InboxMessage) {
    const key = getInboxMessageKey(message);
    setSelectedMessageKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  function toggleAllVisibleMessages() {
    const visibleKeys = filteredMessages.map(getInboxMessageKey);
    setSelectedMessageKeys((current) => {
      if (allVisibleSelected) {
        return current.filter((key) => !visibleKeys.includes(key));
      }

      return [...new Set([...current, ...visibleKeys])];
    });
  }

  function showInboxToast(message: string, type: InboxToast["type"] = "success") {
    setToast({ id: Date.now(), message, type });
  }

  function handleInboxModeChange(mode: InboxMode) {
    setInboxMode(mode);
    setIsMobileLabelPickerOpen(false);
    setIsMobileEditMode(false);
    if (mode !== "sent") {
      setSentSearch("");
    }
    setMessages([]);
    setNextPageToken(null);
    setSelectedMessageKeys([]);
    setSelectedMessage(null);
    setMessageDetail(null);
    setRuleEditorMessage(null);
  }

  function showRepliesForMessage(detail: InboxMessageDetail | null, summary: InboxMessage) {
    const recipient = extractEmailForSearch(detail?.from || summary.from);
    const subject = normalizeReplySearchSubject(detail?.subject || summary.subject);
    setSelectedMessage(null);
    setMessageDetail(null);
    setInboxMode("sent");
    setSentSearch([recipient ? `to:${recipient}` : "", subject ? `subject:"${subject.replace(/"/g, '\\"')}"` : ""].filter(Boolean).join(" "));
    setMessages([]);
    setNextPageToken(null);
    setSelectedMessageKeys([]);
  }

  function adjustLabelCountsByName(changesByName: Record<string, number>) {
    const labelIdsByName = new Map(labels.map((label) => [label.name.toLowerCase(), label.id]));
    setLabelCounts((current) => {
      const next = { ...current };

      for (const [labelName, change] of Object.entries(changesByName)) {
        const labelId = labelIdsByName.get(labelName.toLowerCase());
        if (!labelId || typeof next[labelId] !== "number") {
          continue;
        }

        next[labelId] = Math.max(0, Number(next[labelId]) + change);
      }

      return next;
    });
  }

  function decrementCountsForMessages(messagesToCount: InboxMessage[]) {
    const changes: Record<string, number> = {};
    for (const message of messagesToCount) {
      const labelsToCount = message.labels.length > 0 ? message.labels : [labels.find((label) => label.id === selectedLabelId)?.name ?? ""];
      for (const labelName of labelsToCount) {
        if (!labelName) {
          continue;
        }
        changes[labelName] = (changes[labelName] ?? 0) - 1;
      }
    }
    adjustLabelCountsByName(changes);
  }

  function updateCountsForRuleMove(message: InboxMessage, nextLabels: string[]) {
    const currentLabelName = labels.find((label) => label.id === selectedLabelId)?.name;
    const nextLabelName = nextLabels[0];
    const changes: Record<string, number> = {};

    if (currentLabelName && currentLabelName !== nextLabelName) {
      changes[currentLabelName] = (changes[currentLabelName] ?? 0) - 1;
    }
    if (nextLabelName && currentLabelName !== nextLabelName) {
      changes[nextLabelName] = (changes[nextLabelName] ?? 0) + 1;
    }

    adjustLabelCountsByName(changes);
  }

  function updateCountsForDirectLabelChange(messagesToUpdate: InboxMessage[], nextLabelName: string) {
    const changes: Record<string, number> = {};
    for (const message of messagesToUpdate) {
      for (const labelName of message.labels) {
        if (labelName && labelName !== nextLabelName) {
          changes[labelName] = (changes[labelName] ?? 0) - 1;
        }
      }
      if (nextLabelName && !message.labels.some((labelName) => labelName.toLowerCase() === nextLabelName.toLowerCase())) {
        changes[nextLabelName] = (changes[nextLabelName] ?? 0) + 1;
      }
    }
    adjustLabelCountsByName(changes);
  }

  async function setMessagesLabel(messagesToUpdate: InboxMessage[], labelId: string) {
    if (messagesToUpdate.length === 0) {
      return;
    }

    setIsLabelActionRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/inbox/messages/set-label", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labelId, messages: messagesToUpdate.map(messageToBulkPayload) }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not update labels.");
        showInboxToast(data.error ?? "Could not update labels.", "error");
        return;
      }

      const successfulUpdates = Array.isArray(data.results)
        ? messagesToUpdate.filter((message) =>
            data.results.some((result: { accountId: string; emailId: string; mailbox?: string; ok: boolean }) =>
              result.ok &&
              result.accountId === message.accountId &&
              result.emailId === message.id &&
              (result.mailbox ?? "") === (message.mailbox ?? ""),
            ),
          )
        : messagesToUpdate;
      const updatedKeys = new Set(successfulUpdates.map(getInboxMessageKey));
      const nextLabelName = typeof data.label?.name === "string" ? data.label.name : "";
      const currentLabelName = labels.find((label) => label.id === selectedLabelId)?.name ?? "";
      const shouldRemoveFromCurrentInboxView = inboxMode === "inbox" && currentLabelName && currentLabelName !== nextLabelName;

      updateCountsForDirectLabelChange(successfulUpdates, nextLabelName);
      setMessages((current) =>
        shouldRemoveFromCurrentInboxView
          ? current.filter((message) => !updatedKeys.has(getInboxMessageKey(message)))
          : current.map((message) => updatedKeys.has(getInboxMessageKey(message)) ? { ...message, labels: nextLabelName ? [nextLabelName] : [] } : message),
      );
      setSelectedMessage((current) =>
        current && updatedKeys.has(getInboxMessageKey(current))
          ? { ...current, labels: nextLabelName ? [nextLabelName] : [] }
          : current,
      );
      setSelectedMessageKeys((current) => current.filter((key) => !updatedKeys.has(key)));

      if (successfulUpdates.length > 0) {
        showInboxToast(nextLabelName ? `Updated ${successfulUpdates.length} message${successfulUpdates.length === 1 ? "" : "s"} to ${nextLabelName}.` : `Removed labels from ${successfulUpdates.length} message${successfulUpdates.length === 1 ? "" : "s"}.`);
      }
      if (data.failed?.length) {
        setError(`${data.failed.length} message${data.failed.length === 1 ? "" : "s"} could not be updated.`);
        showInboxToast(`${data.failed.length} message${data.failed.length === 1 ? "" : "s"} could not be updated.`, "error");
      }
    } catch {
      setError("Could not update labels.");
      showInboxToast("Could not update labels.", "error");
    } finally {
      setIsLabelActionRunning(false);
    }
  }

  async function deleteSelectedMessages(messagesToDelete = selectedMessages) {
    if (messagesToDelete.length === 0) {
      return;
    }

    const requestedDeleteKeys = messagesToDelete.map(getInboxMessageKey);
    setDeletingMessageKeys(requestedDeleteKeys);
    setIsBulkActionRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/inbox/messages/delete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messagesToDelete.map(messageToBulkPayload) }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not delete messages.");
        return;
      }

      const successfulDeletes = Array.isArray(data.results)
        ? messagesToDelete.filter((message) =>
            data.results.some((result: { accountId: string; emailId: string; mailbox?: string; ok: boolean }) =>
              result.ok &&
              result.accountId === message.accountId &&
              result.emailId === message.id &&
              (result.mailbox ?? "") === (message.mailbox ?? ""),
            ),
          )
        : messagesToDelete;
      const deletedKeys = new Set(successfulDeletes.map(getInboxMessageKey));
      decrementCountsForMessages(successfulDeletes);
      setMessages((current) => current.filter((message) => !deletedKeys.has(getInboxMessageKey(message))));
      setSelectedMessageKeys((current) => current.filter((key) => !deletedKeys.has(key)));
      if (selectedMessage && deletedKeys.has(getInboxMessageKey(selectedMessage))) {
        setSelectedMessage(null);
        setMessageDetail(null);
      }
      if (successfulDeletes.length > 0) {
        showInboxToast(`${successfulDeletes.length} message${successfulDeletes.length === 1 ? "" : "s"} deleted.`);
      }
      if (data.failed?.length) {
        setError(`${data.failed.length} message${data.failed.length === 1 ? "" : "s"} could not be deleted.`);
        showInboxToast(`${data.failed.length} message${data.failed.length === 1 ? "" : "s"} could not be deleted.`, "error");
      }
    } catch {
      setError("Could not delete messages.");
    } finally {
      setDeletingMessageKeys([]);
      setIsBulkActionRunning(false);
    }
  }

  function openReplyComposer(detail: InboxMessageDetail | null, summary: InboxMessage) {
    setComposeInitial({
      accountId: summary.accountId,
      to: detail?.from || summary.from,
      subject: normalizeReplySubject(detail?.subject || summary.subject),
      bodyText: "",
      replyContext: {
        emailId: detail?.id || summary.id,
        threadId: detail?.threadId || summary.threadId,
        subject: detail?.subject || summary.subject,
        from: detail?.from || summary.from,
        snippet: summary.snippet,
        bodyText: detail?.bodyText || summary.snippet,
        bodyHtml: detail?.bodyHtml || "",
      },
    });
    setIsComposeOpen(true);
  }

  return (
    <div className="space-y-6 pt-20 md:pt-0">
      {toast ? <InboxToastMessage toast={toast} /> : null}
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-white/60 bg-white/60 px-4 shadow-sm backdrop-blur-xl md:hidden">
        {isMobileEditMode ? (
          <>
            <button className="shrink-0 cursor-pointer text-sm font-medium text-blue-600" onClick={cancelMobileEditMode} type="button">
              Cancel
            </button>
            <div className="flex min-w-0 flex-1 justify-center">
              {selectedMessages.length > 0 ? (
                <LabelActionSelect
                  disabled={isBulkActionRunning || isLabelActionRunning}
                  isLoading={isLabelActionRunning}
                  labels={labels}
                  onChange={(labelId) => void setMessagesLabel(selectedMessages, labelId)}
                  value={selectedMessagesLabelValue}
                />
              ) : (
                <span className="text-sm font-medium text-zinc-500">Select messages</span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button className="cursor-pointer text-sm font-medium text-blue-600" onClick={toggleAllVisibleMessages} type="button">
                {allVisibleSelected ? "Deselect all" : "Select all"}
              </button>
            </div>
          </>
        ) : (
          <>
            <Button aria-label="Open menu" className="shrink-0 rounded-full border-white/70 bg-white/60 shadow-sm backdrop-blur-xl" onClick={onOpenMobileMenu} size="icon" type="button" variant="ghost">
              <Menu className="h-5 w-5" />
            </Button>
            <button
              className="min-w-0 flex-1 truncate rounded-full border border-white/70 bg-white/60 px-4 py-2 text-center text-sm font-semibold text-zinc-950 shadow-sm backdrop-blur-xl disabled:cursor-default"
              disabled={inboxMode !== "inbox"}
              onClick={() => setIsMobileLabelPickerOpen(true)}
              type="button"
            >
              {inboxMode === "inbox" ? selectedLabel?.name || "Choose label" : inboxMode === "drafts" ? "Drafts" : "Sent"}
            </button>
            <Button aria-label="Open inbox filters" className="shrink-0 rounded-full border-white/70 bg-white/60 shadow-sm backdrop-blur-xl" onClick={() => setIsMobileFilterOpen(true)} size="icon" type="button" variant="outline">
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      {!isMobileEditMode ? <Button
        aria-label="Compose email"
        className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full border-white/70 bg-white/70 shadow-xl shadow-slate-900/15 backdrop-blur-xl md:hidden"
        onClick={() => {
          setComposeInitial(null);
          setIsComposeOpen(true);
        }}
        size="icon"
        type="button"
        variant="outline"
      >
        <Plus className="h-5 w-5" />
      </Button> : null}
      {isMobileEditMode && selectedMessages.length > 0 ? (
        <Button
          aria-label="Delete selected emails"
          className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full border-red-200/80 bg-red-50/80 text-red-600 shadow-xl shadow-red-900/10 backdrop-blur-xl hover:bg-red-100/90 hover:text-red-700 md:hidden"
          disabled={isBulkActionRunning || isLabelActionRunning}
          onClick={() => void deleteSelectedMessages()}
          size="icon"
          type="button"
          variant="outline"
        >
          {isBulkActionRunning ? <Loader /> : <Trash2 className="h-5 w-5" />}
        </Button>
      ) : null}

      <div className={cn("grid min-w-0 gap-4 xl:gap-5", inboxMode === "inbox" ? "xl:grid-cols-[260px_minmax(0,1fr)]" : "xl:grid-cols-1")}>
        {inboxMode === "inbox" ? (
        <div className="hidden xl:block">
          <Card>
            <CardHeader>
              <CardTitle>Labels</CardTitle>
              <CardDescription>Choose a label or folder.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {labels.length === 0 ? (
                <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">No labels yet.</p>
              ) : (
                labels.map((label) => (
                  <button
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-zinc-600 transition-colors hover:bg-white/60 hover:text-zinc-950",
                      selectedLabelId === label.id && "border border-white/70 bg-white/70 text-zinc-950 shadow-sm backdrop-blur-xl",
                    )}
                    key={label.id}
                    onClick={() => setSelectedLabelId(label.id)}
                    type="button"
                  >
                    <span className="truncate">{label.name}</span>
                    <span className="flex min-w-5 justify-end text-xs text-zinc-500">
                      {isCountsLoading ? <Loader /> : labelCounts[label.id] ?? "-"}
                    </span>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>
        ) : null}

        <div className="min-w-0 space-y-4">
          <Card className="hidden min-w-0 max-w-full md:block">
            <CardContent className="flex flex-row flex-wrap items-start justify-between gap-3 p-3 sm:p-4">
              <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
                <InboxModeToggle mode={inboxMode} onChange={handleInboxModeChange} />
                {inboxMode === "inbox" ? (
                <label className="block xl:hidden">
                  <span className="sr-only">Label filter</span>
                  <select
                    className="h-10 w-full min-w-0 rounded-md border border-zinc-200 bg-white/70 px-3 text-sm sm:w-56"
                    onChange={(event) => setSelectedLabelId(event.target.value)}
                    value={selectedLabelId}
                  >
                    {labels.length === 0 ? (
                      <option value="">No labels</option>
                    ) : (
                      labels.map((label) => (
                        <option key={label.id} value={label.id}>
                          {label.name}
                          {typeof labelCounts[label.id] === "number" ? ` (${labelCounts[label.id]})` : ""}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                ) : null}
                <div className="relative z-10" data-inbox-account-menu>
                  <Button className="w-full sm:w-auto" onClick={() => setIsAccountMenuOpen((current) => !current)} type="button" variant="outline">
                    Accounts {selectedAccountIds.length}/{accounts.length}
                  </Button>
                  {isAccountMenuOpen ? (
                    <div className="absolute left-0 top-11 z-20 w-[calc(100vw-2rem)] max-w-80 rounded-md border border-zinc-200 bg-white p-2 shadow-xl">
                      <div className="mb-2 flex gap-2">
                        <Button onClick={() => setSelectedAccountIds(accounts.map((account) => account.id))} size="sm" type="button" variant="outline">
                          All
                        </Button>
                        <Button onClick={() => setSelectedAccountIds([])} size="sm" type="button" variant="outline">
                          None
                        </Button>
                      </div>
                      <div className="max-h-72 space-y-1 overflow-y-auto">
                        {accounts.map((account) => (
                          <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm text-zinc-700 hover:bg-zinc-50" key={account.id}>
                            <input checked={selectedAccountIds.includes(account.id)} onChange={() => toggleAccount(account.id)} type="checkbox" />
                            <span className="min-w-0 flex-1 truncate">{formatEmailForPrivacy(account.email, privacyMode)}</span>
                            <Badge className="capitalize">{providerLabel(account.provider)}</Badge>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="ml-auto flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                {selectedMessages.length > 0 ? (
                  <>
                    <LabelActionSelect
                      disabled={isBulkActionRunning || isLabelActionRunning}
                      isLoading={isLabelActionRunning}
                      labels={labels}
                      onChange={(labelId) => void setMessagesLabel(selectedMessages, labelId)}
                      value={selectedMessagesLabelValue}
                    />
                    <Button disabled={isBulkActionRunning || isLabelActionRunning} onClick={() => void deleteSelectedMessages()} type="button" variant="outline">
                      {isBulkActionRunning ? <Loader /> : <Trash2 className="h-4 w-4" />}
                      Delete
                    </Button>
                  </>
                ) : null}
                <Button
                  onClick={() => {
                    setComposeInitial(null);
                    setIsComposeOpen(true);
                  }}
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                  Compose
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="min-w-0 max-w-full overflow-hidden">
            <div className="block border-b border-white/60 px-3 pb-2 pt-3 md:hidden">
              <InboxModeToggle mode={inboxMode} onChange={handleInboxModeChange} />
            </div>
            <CardHeader className="hidden flex-row flex-wrap items-start justify-between gap-3 space-y-0 md:flex">
              <div className="min-w-0">
                <CardTitle>Email</CardTitle>
                <CardDescription>{filteredMessages.length} loaded {inboxMode === "drafts" ? "drafts" : inboxMode === "sent" ? "sent messages" : "messages"}</CardDescription>
              </div>
              <label className="flex shrink-0 items-center gap-2 text-sm text-zinc-500">
                <span>Sort</span>
                <select
                  className="h-9 rounded-md border border-zinc-200 bg-white/70 px-3 text-sm text-zinc-700"
                  onChange={(event) => setSort(event.target.value as InboxSort)}
                  value={sort}
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="sender">Sender</option>
                  <option value="subject">Subject</option>
                </select>
              </label>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="hidden justify-start md:flex">
                {filteredMessages.length > 0 ? (
                  <button
                    className="w-fit cursor-pointer text-sm font-medium text-blue-600 underline-offset-4 hover:text-blue-700 hover:underline"
                    onClick={toggleAllVisibleMessages}
                    type="button"
                  >
                    {allVisibleSelected ? "Clear selection" : "Select all"}
                  </button>
                ) : (
                  <span />
                )}
              </div>
              {isLoading ? (
                <InboxLoadingProgress completed={messageLoadProgress.completed} total={messageLoadProgress.total} />
              ) : filteredMessages.length === 0 ? (
                <p className="rounded-md border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
                  {inboxMode === "drafts" ? "No drafts found." : inboxMode === "sent" ? "No sent messages found." : "No messages found for this label."}
                </p>
              ) : (
                filteredMessages.map((message) => (
                  <InboxMessageRow
                    isEditMode={isMobileEditMode}
                    isDeleting={deletingMessageKeys.includes(getInboxMessageKey(message))}
                    isSelected={selectedMessageKeys.includes(getInboxMessageKey(message))}
                    key={`${message.accountId}-${message.id}-${message.mailbox ?? ""}`}
                    message={message}
                    onLongPress={() => enterMobileEditMode(message)}
                    onOpen={() => void openMessage(message)}
                    onToggle={() => toggleMessage(message)}
                  />
                ))
              )}
              {nextPageToken ? (
                <Button disabled={isLoadingMore} onClick={() => void loadMessages({ reset: false })} type="button" variant="outline">
                  {isLoadingMore ? "Loading..." : "Load more"}
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      {isMobileFilterOpen ? (
        <InboxMobileFilterDrawer
          accounts={accounts}
          onClose={() => setIsMobileFilterOpen(false)}
          onSelectAllAccounts={() => setSelectedAccountIds(accounts.map((account) => account.id))}
          onSelectNoAccounts={() => setSelectedAccountIds([])}
          onToggleAccount={toggleAccount}
          privacyMode={privacyMode}
          selectedAccountIds={selectedAccountIds}
          setSort={setSort}
          sort={sort}
        />
      ) : null}

      {isMobileLabelPickerOpen ? (
        <InboxMobileLabelPicker
          isCountsLoading={isCountsLoading}
          labelCounts={labelCounts}
          labels={labels}
          onClose={() => setIsMobileLabelPickerOpen(false)}
          onSelect={(labelId) => {
            setSelectedLabelId(labelId);
            setIsMobileLabelPickerOpen(false);
          }}
          selectedLabelId={selectedLabelId}
        />
      ) : null}

      {selectedMessage && !ruleEditorMessage ? (
        <>
          <div className="md:hidden">
            <InboxMessagePushView
              detail={messageDetail}
              error={detailError}
              isDeleting={deletingMessageKeys.includes(getInboxMessageKey(selectedMessage))}
              isLoading={isDetailLoading}
              isLabelActionRunning={isLabelActionRunning}
              labels={labels}
              onClose={() => {
                setSelectedMessage(null);
                setMessageDetail(null);
              }}
              onDelete={(message) => void deleteSelectedMessages([message])}
              onEditRule={(message) => setRuleEditorMessage(message)}
              onSetLabel={(message, labelId) => void setMessagesLabel([message], labelId)}
              onReply={(detail, summary) => openReplyComposer(detail, summary)}
              onShowReplies={(detail, summary) => showRepliesForMessage(detail, summary)}
              privacyMode={privacyMode}
              summary={selectedMessage}
            />
          </div>
          <div className="hidden md:block">
            <InboxMessageModal
              detail={messageDetail}
              error={detailError}
              isDeleting={deletingMessageKeys.includes(getInboxMessageKey(selectedMessage))}
              isLoading={isDetailLoading}
              isLabelActionRunning={isLabelActionRunning}
              labels={labels}
              onClose={() => {
                setSelectedMessage(null);
                setMessageDetail(null);
              }}
              onDelete={(message) => void deleteSelectedMessages([message])}
              onEditRule={(message) => setRuleEditorMessage(message)}
              onSetLabel={(message, labelId) => void setMessagesLabel([message], labelId)}
              onReply={(detail, summary) => openReplyComposer(detail, summary)}
              onShowReplies={(detail, summary) => showRepliesForMessage(detail, summary)}
              privacyMode={privacyMode}
              summary={selectedMessage}
            />
          </div>
        </>
      ) : null}

      {ruleEditorMessage ? (
        <InboxRuleModal
          labels={labels}
          messageDetail={messageDetail}
          onClose={() => setRuleEditorMessage(null)}
          onSaved={(rule) => {
            const nextRule = { emailId: rule.emailId, isPending: rule.isPending };
            const currentLabelName = labels.find((label) => label.id === selectedLabelId)?.name;
            const movedOutOfCurrentLabel = Boolean(currentLabelName && rule.labelsApplied[0] && currentLabelName !== rule.labelsApplied[0]);
            updateCountsForRuleMove(ruleEditorMessage, rule.labelsApplied);
            setMessages((current) =>
              movedOutOfCurrentLabel
                ? current.filter((message) => getInboxMessageKey(message) !== getInboxMessageKey(ruleEditorMessage))
                : current.map((message) =>
                    getInboxMessageKey(message) === getInboxMessageKey(ruleEditorMessage)
                      ? { ...message, labels: rule.labelsApplied, rule: nextRule }
                      : message,
                  ),
            );
            setSelectedMessage((current) =>
              current && getInboxMessageKey(current) === getInboxMessageKey(ruleEditorMessage)
                ? { ...current, labels: rule.labelsApplied, rule: nextRule }
                : current,
            );
            setMessageDetail((current) => (current && current.id === rule.emailId ? { ...current, rule: nextRule } : current));
            setRuleEditorMessage(null);
            showInboxToast("Email label updated.");
          }}
          privacyMode={privacyMode}
          summary={ruleEditorMessage}
        />
      ) : null}

      {isComposeOpen ? (
        <>
          <div className="md:hidden">
            <InboxComposeModal
              accounts={accounts}
              initial={composeInitial}
              isByoAiActive={isByoAiActive}
              onClose={() => {
                setIsComposeOpen(false);
                setComposeInitial(null);
              }}
              onSaved={(kind) => {
                showInboxToast(kind === "draft" ? "Draft saved." : "Email sent.");
                void loadMessages({ reset: true });
              }}
              privacyMode={privacyMode}
              variant="push"
            />
          </div>
          <div className="hidden md:block">
            <InboxComposeModal
              accounts={accounts}
              initial={composeInitial}
              isByoAiActive={isByoAiActive}
              onClose={() => {
                setIsComposeOpen(false);
                setComposeInitial(null);
              }}
              onSaved={(kind) => {
                showInboxToast(kind === "draft" ? "Draft saved." : "Email sent.");
                void loadMessages({ reset: true });
              }}
              privacyMode={privacyMode}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function InboxModeToggle({ mode, onChange }: { mode: InboxMode; onChange: (mode: InboxMode) => void }) {
  const options: Array<{ id: InboxMode; label: string }> = [
    { id: "inbox", label: "Inbox" },
    { id: "drafts", label: "Drafts" },
    { id: "sent", label: "Sent" },
  ];
  const selectedIndex = options.findIndex((option) => option.id === mode);

  return (
    <div className="relative inline-grid h-10 w-full grid-cols-3 rounded-md border border-zinc-200 bg-[#f7f7f7] p-1 shadow-sm backdrop-blur-xl md:w-72">
      <span
        className={cn(
          "absolute bottom-1 left-1 top-1 w-[calc((100%-0.5rem)/3)] rounded-md bg-white shadow-sm transition-transform duration-300 ease-out",
          selectedIndex === 1 && "translate-x-full",
          selectedIndex === 2 && "translate-x-[200%]",
        )}
      />
      {options.map((option) => (
        <button
          className={cn(
            "relative z-10 cursor-pointer rounded-md px-4 text-sm font-medium transition-colors duration-200",
            mode === option.id ? "text-zinc-950" : "text-zinc-500 hover:text-zinc-800",
          )}
          key={option.id}
          onClick={() => onChange(option.id)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function InboxMobileFilterDrawer({
  accounts,
  onClose,
  onSelectAllAccounts,
  onSelectNoAccounts,
  onToggleAccount,
  privacyMode,
  selectedAccountIds,
  setSort,
  sort,
}: {
  accounts: EmailAccount[];
  onClose: () => void;
  onSelectAllAccounts: () => void;
  onSelectNoAccounts: () => void;
  onToggleAccount: (accountId: string) => void;
  privacyMode: boolean;
  selectedAccountIds: string[];
  setSort: (sort: InboxSort) => void;
  sort: InboxSort;
}) {
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button aria-label="Close filters" className="absolute inset-0 cursor-default bg-slate-950/20" onClick={onClose} type="button" />
      <aside className="absolute right-0 top-0 flex h-full w-[min(86vw,360px)] flex-col border-l border-white/70 bg-white/70 p-4 shadow-2xl shadow-slate-900/20 backdrop-blur-xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-zinc-950">Filters</p>
            <p className="text-sm text-zinc-500">Adjust this Inbox view.</p>
          </div>
          <Button aria-label="Close filters" onClick={onClose} size="icon" type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-5 overflow-y-auto">
          <label className="block">
            <span className="mb-2 block text-xs font-medium uppercase text-zinc-500">Sort</span>
            <select
              className="h-10 w-full rounded-md border border-white/70 bg-white/65 px-3 text-sm text-zinc-700 shadow-sm outline-none backdrop-blur-xl"
              onChange={(event) => setSort(event.target.value as InboxSort)}
              value={sort}
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="sender">Sender</option>
              <option value="subject">Subject</option>
            </select>
          </label>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-medium uppercase text-zinc-500">Accounts</span>
              <span className="text-xs text-zinc-500">{selectedAccountIds.length}/{accounts.length}</span>
            </div>
            <div className="mb-2 flex gap-2">
              <Button onClick={onSelectAllAccounts} size="sm" type="button" variant="outline">
                All
              </Button>
              <Button onClick={onSelectNoAccounts} size="sm" type="button" variant="outline">
                None
              </Button>
            </div>
            <div className="space-y-2 rounded-xl border border-white/70 bg-white/45 p-2 shadow-inner">
              {accounts.map((account) => (
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-zinc-700 hover:bg-white/60" key={account.id}>
                  <input checked={selectedAccountIds.includes(account.id)} onChange={() => onToggleAccount(account.id)} type="checkbox" />
                  <span className="min-w-0 flex-1 truncate">{formatEmailForPrivacy(account.email, privacyMode)}</span>
                  <Badge className="capitalize">{providerLabel(account.provider)}</Badge>
                </label>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function InboxMobileLabelPicker({
  isCountsLoading,
  labelCounts,
  labels,
  onClose,
  onSelect,
  selectedLabelId,
}: {
  isCountsLoading: boolean;
  labelCounts: Record<string, number | null>;
  labels: Label[];
  onClose: () => void;
  onSelect: (labelId: string) => void;
  selectedLabelId: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 p-4 md:hidden">
      <button aria-label="Close label picker" className="absolute inset-0 cursor-default" onClick={onClose} type="button" />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/70 bg-white/60 p-4 shadow-2xl shadow-slate-900/20 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-zinc-950">Choose label</p>
            <p className="text-sm text-zinc-500">Select a category to view.</p>
          </div>
          <Button aria-label="Close label picker" onClick={onClose} size="icon" type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {labels.map((label) => (
            <button
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-md border border-white/60 bg-white/45 px-3 py-2 text-left text-sm text-zinc-700 shadow-sm backdrop-blur-xl",
                selectedLabelId === label.id && "border-blue-100 bg-blue-50/80 text-blue-800",
              )}
              key={label.id}
              onClick={() => onSelect(label.id)}
              type="button"
            >
              <span className="truncate font-medium">{label.name}</span>
              <span className="text-xs text-zinc-500">{isCountsLoading ? <Loader /> : labelCounts[label.id] ?? "-"}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function InboxMessageRow({
  isEditMode,
  isDeleting,
  isSelected,
  message,
  onLongPress,
  onOpen,
  onToggle,
}: {
  isEditMode: boolean;
  isDeleting: boolean;
  isSelected: boolean;
  message: InboxMessage;
  onLongPress: () => void;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const replyCount = typeof message.replyCount === "number" ? message.replyCount : 0;
  const longPressTimeoutRef = useRef<number | null>(null);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const longPressFiredRef = useRef(false);
  const [pressState, setPressState] = useState<"idle" | "pressing" | "popped">("idle");

  function clearLongPressTimer() {
    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }

  function releasePress() {
    clearLongPressTimer();
    setPressState("idle");
  }

  function handleMobilePointerDown(event: PointerEvent<HTMLDivElement>) {
    touchStartXRef.current = event.clientX;
    touchStartYRef.current = event.clientY;
    longPressFiredRef.current = false;

    if (!isEditMode) {
      clearLongPressTimer();
      setPressState("pressing");
      longPressTimeoutRef.current = window.setTimeout(() => {
        longPressFiredRef.current = true;
        setPressState("popped");
        onLongPress();
        clearLongPressTimer();
        window.setTimeout(() => setPressState("idle"), 180);
      }, 520);
    }
  }

  function handleMobilePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (isEditMode) {
      return;
    }

    const deltaX = event.clientX - touchStartXRef.current;
    const deltaY = event.clientY - touchStartYRef.current;
    if (Math.abs(deltaX) > 12 || Math.abs(deltaY) > 16) {
      releasePress();
    }
  }

  function handleMobileRowClick() {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }

    if (isEditMode) {
      onToggle();
      return;
    }

    onOpen();
  }

  return (
    <div
      aria-busy={isDeleting}
      className={cn(
        "relative select-none border-b border-zinc-200 bg-white/45 transition last:border-b-0 hover:bg-white/80",
        isDeleting ? "pointer-events-none opacity-60" : null,
      )}
    >
      {isDeleting ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/45 backdrop-blur-[1px]">
          <Loader />
        </div>
      ) : null}
      <div className="hidden w-full grid-cols-[auto_auto_minmax(110px,180px)_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 md:grid">
        <GlassCheckbox checked={isSelected} onChange={onToggle} />
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-xs font-semibold text-zinc-600">
          {getSenderInitial(message.sender || message.from)}
        </span>
        <button className="min-w-0 cursor-pointer truncate text-left text-sm font-medium text-zinc-800" onClick={onOpen} type="button">
          {message.sender || message.from || "Unknown sender"}
        </button>
        <button className="flex min-w-0 cursor-pointer items-center gap-2 text-left" onClick={onOpen} type="button">
          {message.labels[0] ? <Badge className="shrink-0 bg-blue-50 text-blue-700">{message.labels[0]}</Badge> : null}
          <span className="min-w-0 truncate text-sm font-medium text-zinc-950">{message.subject || "(no subject)"}</span>
          <span className="min-w-0 truncate text-xs text-zinc-400">{message.snippet || "No preview available."}</span>
        </button>
        <div className="flex shrink-0 items-center justify-end gap-2 text-xs text-zinc-500">
          {replyCount > 0 ? (
            <Tooltip text={`${replyCount} ${replyCount === 1 ? "reply" : "replies"}`}>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-950 px-1.5 text-[11px] font-semibold text-white">
                {replyCount}
              </span>
            </Tooltip>
          ) : null}
          {message.hasAttachments ? (
            <span aria-label="Has attachment" title="Has attachment">
              <Download className="h-3.5 w-3.5" />
            </span>
          ) : null}
          <div className="w-24 text-right">
            <p className="truncate">{formatInboxListDate(message.date)}</p>
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden md:hidden">
        <div
          className={cn(
            "relative flex w-full touch-pan-y items-start gap-3 bg-white/45 px-4 py-3 text-left transition duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] will-change-transform",
            isEditMode ? "cursor-pointer" : "cursor-pointer",
            pressState === "pressing" ? "scale-[0.975] bg-white/65 shadow-inner" : null,
            pressState === "popped" ? "scale-[1.025] bg-white/80 shadow-lg" : null,
          )}
          onClick={handleMobileRowClick}
          onPointerCancel={releasePress}
          onPointerDown={handleMobilePointerDown}
          onPointerLeave={releasePress}
          onPointerMove={handleMobilePointerMove}
          onPointerUp={releasePress}
          role="button"
          tabIndex={0}
        >
          {isEditMode ? (
            <GlassCheckbox
              checked={isSelected}
              onChange={onToggle}
              onClick={(event) => event.stopPropagation()}
              className="self-center"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 truncate text-base font-bold text-zinc-950">{message.sender || message.from || "Unknown sender"}</p>
              {message.hasAttachments ? <Download className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" /> : null}
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <p className="min-w-0 truncate text-base text-zinc-950">{message.subject || "(no subject)"}</p>
              {replyCount > 0 ? (
                <span className="inline-flex h-6 min-w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white/70 px-2 text-sm font-semibold text-zinc-700 shadow-sm backdrop-blur-xl">
                  {replyCount}
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-3">
              <p className="min-w-0 flex-1 truncate text-base text-zinc-500">{message.snippet || "No preview available."}</p>
              <p className="shrink-0 text-sm font-semibold text-zinc-500">{formatInboxListDate(message.date)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GlassCheckbox({
  checked,
  className,
  disabled = false,
  onChange,
  onClick,
}: {
  checked: boolean;
  className?: string;
  disabled?: boolean;
  onChange: () => void;
  onClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      aria-checked={checked}
      className={cn(
        "group relative flex h-[26px] w-[26px] shrink-0 cursor-pointer items-center justify-center rounded-full border border-zinc-300/80 bg-gradient-to-br from-zinc-50/95 via-zinc-100/75 to-zinc-200/55 shadow-sm shadow-slate-900/15 backdrop-blur-xl transition duration-200 hover:border-zinc-400/70 hover:from-white hover:to-zinc-200/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70",
        checked ? "border-blue-300/80 bg-none bg-blue-500/85 text-white shadow-blue-500/20" : "text-transparent",
        disabled && "cursor-not-allowed opacity-45",
        className,
      )}
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event);
        onChange();
      }}
      role="checkbox"
      type="button"
    >
      <span
        className={cn(
          "absolute inset-0 rounded-full bg-gradient-to-br from-white/75 to-white/10 opacity-90 transition",
          checked ? "opacity-30" : "group-hover:opacity-100",
        )}
      />
      <Check className={cn("relative h-4 w-4 transition duration-200", checked ? "scale-100 opacity-100" : "scale-50 opacity-0")} />
    </button>
  );
}

function RuleLabelSelectionRows({
  confidenceThreshold,
  labels,
  onToggle,
  selectedLabels,
  suggestedLabel,
}: {
  confidenceThreshold: string;
  labels: Label[];
  onToggle: (labelName: string) => void;
  selectedLabels: string[];
  suggestedLabel?: string;
}) {
  return (
    <div className="space-y-2">
      {labels.map((label) => {
        const isSelected = selectedLabels.includes(label.name);

        return (
          <div
            className={cn(
              "flex w-full items-center gap-3 rounded-md border border-white/70 bg-white/45 px-3 py-3 text-left shadow-sm backdrop-blur-xl transition",
              "cursor-pointer hover:border-zinc-300 hover:bg-white/70",
              isSelected && "border-emerald-300/80 bg-emerald-50/65 shadow-[0_0_18px_rgba(16,185,129,0.18)] ring-1 ring-emerald-200/80",
            )}
            key={label.id}
            onClick={() => onToggle(label.name)}
          >
            <GlassCheckbox
              checked={isSelected}
              onChange={() => onToggle(label.name)}
              onClick={(event) => event.stopPropagation()}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-zinc-950">{label.name}</p>
                {suggestedLabel === label.name ? (
                  <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Suggested</span>
                ) : null}
              </div>
              <p className="mt-1 text-sm leading-5 text-zinc-500">
                {renderLabelDescription(label.description, confidenceThreshold)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InboxMessagePushView({
  detail,
  error,
  isDeleting,
  isLoading,
  isLabelActionRunning,
  labels,
  onClose,
  onDelete,
  onEditRule,
  onSetLabel,
  onReply,
  onShowReplies,
  privacyMode,
  summary,
}: {
  detail: InboxMessageDetail | null;
  error: string | null;
  isDeleting: boolean;
  isLoading: boolean;
  isLabelActionRunning: boolean;
  labels: Label[];
  onClose: () => void;
  onDelete: (message: InboxMessage) => void;
  onEditRule: (message: InboxMessage) => void;
  onSetLabel: (message: InboxMessage, labelId: string) => void;
  onReply: (detail: InboxMessageDetail | null, summary: InboxMessage) => void;
  onShowReplies: (detail: InboxMessageDetail | null, summary: InboxMessage) => void;
  privacyMode: boolean;
  summary: InboxMessage;
}) {
  const rule = detail?.rule ?? summary.rule ?? null;
  const replyCount = detail?.replyCount ?? summary.replyCount ?? 0;

  return (
    <section className="fixed inset-0 z-50 flex flex-col bg-[#f7f7f7] text-zinc-950 md:hidden">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-zinc-200 bg-white/70 px-2 backdrop-blur-xl">
        <Button aria-label="Back to inbox" onClick={onClose} size="icon" type="button" variant="ghost">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1" />
        <div className="flex shrink-0 items-center gap-1">
          <Button aria-label="Reply" onClick={() => onReply(detail, summary)} size="icon" type="button" variant="ghost">
            <Reply className="h-4 w-4" />
          </Button>
          <Button aria-label="Delete email" className="text-red-600 hover:text-red-700" disabled={isDeleting} onClick={() => onDelete(summary)} size="icon" type="button" variant="ghost">
            {isDeleting ? <Loader /> : <Trash2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4">
        <div className="mx-auto max-w-2xl space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <InboxRuleBadge onClick={() => onEditRule(summary)} rule={rule} />
                {replyCount > 0 ? (
                  <button
                    className="inline-flex cursor-pointer items-center rounded-full border border-white/70 bg-white/65 px-2.5 py-1 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur-xl hover:bg-white/80"
                    onClick={() => onShowReplies(detail, summary)}
                    type="button"
                  >
                    {replyCount} {replyCount === 1 ? "reply" : "replies"}
                  </button>
                ) : null}
              </div>
              <p className="shrink-0 text-xs text-zinc-500">{formatInboxListDate(detail?.date || summary.date)}</p>
            </div>
            <h1 className="text-lg font-semibold leading-tight text-zinc-950">{detail?.subject || summary.subject || "(no subject)"}</h1>
          </div>

          {isLoading ? <p className="rounded-xl border border-white/70 bg-white/60 p-4 text-sm text-zinc-500">Loading email...</p> : null}
          {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          {detail ? <InboxThreadConversation detail={detail} privacyMode={privacyMode} /> : null}
        </div>
      </div>
    </section>
  );
}

function InboxToastMessage({ toast }: { toast: InboxToast }) {
  return (
    <div className="fixed right-5 top-20 z-50">
      <div
        className={cn(
          "rounded-md border px-4 py-3 text-sm shadow-lg backdrop-blur-xl",
          toast.type === "success"
            ? "border-emerald-200 bg-emerald-50/95 text-emerald-800"
            : "border-red-200 bg-red-50/95 text-red-700",
        )}
      >
        {toast.message}
      </div>
    </div>
  );
}

function InboxLoadingProgress({ completed, total }: { completed: number; total: number }) {
  const safeTotal = Math.max(1, total);
  const progress = Math.max(0, Math.min(100, Math.round((completed / safeTotal) * 100)));

  return (
    <div aria-label="Loading messages" className="rounded-md border border-dashed border-zinc-300 p-8" role="status">
      <div className="mx-auto h-2 max-w-sm overflow-hidden rounded-full bg-zinc-200/80">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function LabelActionSelect({
  disabled,
  isLoading,
  labels,
  onChange,
  value,
}: {
  disabled: boolean;
  isLoading: boolean;
  labels: Label[];
  onChange: (labelId: string) => void;
  value: string;
}) {
  return (
    <div className="relative">
      <select
        className="h-10 min-w-40 rounded-md border border-zinc-200 bg-white/80 px-3 pr-9 text-sm text-zinc-700 outline-none transition-colors focus:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onChange={(event) => {
          if (event.target.value === "__mixed__") {
            return;
          }
          onChange(event.target.value === "__none__" ? "" : event.target.value);
        }}
        value={value || "__mixed__"}
      >
        <option disabled value="__mixed__">Choose label...</option>
        <option value="__none__">No label</option>
        {labels.map((label) => (
          <option key={label.id} value={label.id}>{label.name}</option>
        ))}
      </select>
      {isLoading ? (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">
          <Loader />
        </span>
      ) : null}
    </div>
  );
}

function InboxMessageModal({
  detail,
  error,
  isDeleting,
  isLoading,
  isLabelActionRunning,
  labels,
  onClose,
  onDelete,
  onEditRule,
  onSetLabel,
  onReply,
  onShowReplies,
  privacyMode,
  summary,
}: {
  detail: InboxMessageDetail | null;
  error: string | null;
  isDeleting: boolean;
  isLoading: boolean;
  isLabelActionRunning: boolean;
  labels: Label[];
  onClose: () => void;
  onDelete: (message: InboxMessage) => void;
  onEditRule: (message: InboxMessage) => void;
  onSetLabel: (message: InboxMessage, labelId: string) => void;
  onReply: (detail: InboxMessageDetail | null, summary: InboxMessage) => void;
  onShowReplies: (detail: InboxMessageDetail | null, summary: InboxMessage) => void;
  privacyMode: boolean;
  summary: InboxMessage;
}) {
  const rule = detail?.rule ?? summary.rule ?? null;
  const currentLabelId = getCommonMessageLabelId([summary], labels);
  const replyCount = detail?.replyCount ?? summary.replyCount ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-white/70 bg-white/55 p-4 shadow-2xl shadow-slate-900/20 [backdrop-filter:blur(5px)] [-webkit-backdrop-filter:blur(5px)]">
        <div className="max-h-[calc(92vh-2rem)] overflow-hidden rounded-xl bg-white/40 shadow-inner ring-1 ring-white/60">
          <div className="flex items-start justify-between gap-4 border-b border-white/60 px-5 pb-4 pt-5">
            <div className="min-w-0">
              <h3 className="mt-1 truncate text-lg font-semibold text-zinc-950">{detail?.subject || summary.subject || "(no subject)"}</h3>
              <div className="mt-2">
                <InboxRuleBadge onClick={() => onEditRule(summary)} rule={rule} />
                {replyCount > 0 ? (
                  <button
                    className="ml-3 cursor-pointer text-sm font-medium text-blue-600 underline-offset-4 hover:text-blue-700 hover:underline"
                    onClick={() => onShowReplies(detail, summary)}
                    type="button"
                  >
                    {replyCount} {replyCount === 1 ? "reply" : "replies"}
                  </button>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <LabelActionSelect
                disabled={isLabelActionRunning}
                isLoading={isLabelActionRunning}
                labels={labels}
                onChange={(labelId) => onSetLabel(summary, labelId)}
                value={currentLabelId}
              />
              <Tooltip side="bottom" text="Delete email">
                <Button aria-label="Delete email" className="text-red-600 hover:text-red-700" disabled={isDeleting} onClick={() => onDelete(summary)} size="icon" type="button" variant="outline">
                  {isDeleting ? <Loader /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </Tooltip>
              <Tooltip side="bottom" text="Reply">
                <Button aria-label="Reply" onClick={() => onReply(detail, summary)} size="icon" type="button" variant="outline">
                  <Reply className="h-4 w-4" />
                </Button>
              </Tooltip>
              <Button aria-label="Close email" onClick={onClose} size="icon" type="button" variant="ghost">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="max-h-[calc(92vh-112px)] overflow-y-auto px-5 pb-10 pt-5">
          {isLoading ? <p className="text-sm text-zinc-500">Loading email...</p> : null}
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {detail ? (
            <InboxThreadConversation detail={detail} privacyMode={privacyMode} />
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function InboxThreadConversation({ detail, privacyMode }: { detail: InboxMessageDetail; privacyMode: boolean }) {
  const messages: InboxThreadMessage[] = detail.threadMessages?.length
    ? detail.threadMessages
    : [{
        id: detail.id,
        threadId: detail.threadId,
        accountId: detail.accountId,
        accountEmail: detail.accountEmail,
        provider: detail.provider,
        from: detail.from,
        to: detail.to,
        cc: detail.cc,
        subject: detail.subject,
        date: detail.date,
        bodyText: detail.bodyText,
        bodyHtml: detail.bodyHtml,
        attachments: detail.attachments,
      }];

  return (
    <div className="space-y-4">
      {messages.map((message, messageIndex) => (
        <article className="overflow-hidden rounded-xl border border-white/80 bg-white/75 shadow-sm backdrop-blur-xl" key={message.id}>
          <div className="grid gap-1.5 bg-white/70 px-4 py-3 text-xs text-zinc-600 sm:text-sm">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
              <p className="min-w-0 break-words">
                <span className="font-medium text-zinc-950">From:</span> {formatEmailTextForPrivacy(message.from, privacyMode)}
              </p>
              <p className="shrink-0 text-zinc-500">{formatDateTime(message.date)}</p>
            </div>
            <p className="break-words"><span className="font-medium text-zinc-950">To:</span> {formatEmailTextForPrivacy(message.to, privacyMode)}</p>
            {message.cc ? <p className="break-words"><span className="font-medium text-zinc-950">CC:</span> {formatEmailTextForPrivacy(message.cc, privacyMode)}</p> : null}
          </div>
          <div className="border-t border-zinc-200/80 bg-white/80 p-4">
            {message.bodyHtml ? (
              <AutoSizeEmailFrame html={message.bodyHtml} title={`Thread message ${messageIndex + 1}`} />
            ) : (
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-zinc-700">{message.bodyText || "No body content."}</pre>
            )}
          </div>
          {message.attachments.length > 0 ? (
            <div className="space-y-2 border-t border-zinc-200/80 bg-white/65 px-4 py-3">
              {message.attachments.map((attachment, attachmentIndex) => (
                <div className="flex items-center justify-between gap-3 rounded-md border border-zinc-200/80 bg-white/70 px-3 py-2 text-sm" key={`${message.id}-${attachment.filename}-${attachmentIndex}`}>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-950">{attachment.filename}</p>
                    <p className="text-xs text-zinc-500">{attachment.type} {attachment.size ? ` / ${formatFileSize(attachment.size)}` : ""}</p>
                  </div>
                  <Download className="h-4 w-4 shrink-0 text-zinc-500" />
                </div>
              ))}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function AutoSizeEmailFrame({ html, title }: { html: string; title: string }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(700);

  function resizeFrame() {
    const frame = frameRef.current;
    const documentElement = frame?.contentDocument?.documentElement;
    const body = frame?.contentDocument?.body;
    const nextHeight = Math.max(documentElement?.scrollHeight ?? 0, body?.scrollHeight ?? 0, 320);
    if (nextHeight) {
      setHeight(nextHeight);
    }
  }

  return (
    <iframe
      className="w-full rounded-xl bg-white"
      onLoad={resizeFrame}
      ref={frameRef}
      sandbox="allow-same-origin"
      scrolling="no"
      srcDoc={html}
      style={{ height }}
      title={title}
    />
  );
}

function InboxRuleBadge({ compact = false, onClick, rule }: { compact?: boolean; onClick?: () => void; rule?: InboxRuleStatus | null }) {
  const status = !rule
    ? {
        className: "border-zinc-200 bg-zinc-100 text-zinc-600",
        label: "No rule",
        text: "No associated rule",
      }
    : rule.isPending
      ? {
          className: "border-amber-200 bg-amber-50 text-amber-700",
          label: "Pending",
          text: "Rule created. Needs review",
        }
      : {
          className: "border-emerald-200 bg-emerald-50 text-emerald-700",
          label: "Reviewed",
          text: "Sorted via rule",
        };

  const className = cn(
    "inline-flex items-center rounded-full border font-medium",
    status.className,
    compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
    onClick && "cursor-pointer shadow-sm ring-1 ring-white/70 transition hover:-translate-y-px hover:bg-white/80 hover:shadow-md",
  );

  return (
    <Tooltip align="start" side="bottom" text={onClick ? `${status.text}. Click to ${rule ? "edit" : "create"} rule.` : status.text}>
      {onClick ? (
        <button aria-label={status.text} className={className} onClick={onClick} type="button">
          {status.label}
        </button>
      ) : (
        <span aria-label={status.text} className={className}>
          {status.label}
        </span>
      )}
    </Tooltip>
  );
}

function InboxRuleModal({
  labels,
  messageDetail,
  onClose,
  onSaved,
  privacyMode,
  summary,
}: {
  labels: Label[];
  messageDetail: InboxMessageDetail | null;
  onClose: () => void;
  onSaved: (rule: EmailRule) => void;
  privacyMode: boolean;
  summary: InboxMessage;
}) {
  const [existingRule, setExistingRule] = useState<EmailRule | null>(null);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [labelReason, setLabelReason] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isExistingRule = Boolean(existingRule);
  const selectedLabel = selectedLabels.length === 1 ? selectedLabels[0] : "";
  const originalSelectedLabel = existingRule?.labelsApplied.length === 1 ? existingRule.labelsApplied[0] : "";
  const originalReason = originalSelectedLabel ? existingRule?.labelReasons?.[originalSelectedLabel] ?? "" : "";
  const hasChanges = selectedLabel !== originalSelectedLabel || labelReason.trim() !== originalReason.trim();
  const labelSelectionError = selectedLabels.length > 1 ? "Choose one label before reviewing this rule." : "";
  const canReview = Boolean(selectedLabel && !labelSelectionError && (!isExistingRule || existingRule?.isPending || hasChanges));
  const reviewedButtonClass = labelReason.trim()
    ? "bg-emerald-600 text-white hover:bg-emerald-700"
    : "bg-amber-500 text-white hover:bg-amber-600";

  useEffect(() => {
    async function loadRule() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/email-rules/${encodeURIComponent(summary.id)}`, { credentials: "include" });
        const data = await response.json();

        if (response.status === 404) {
          setExistingRule(null);
          setSelectedLabels([]);
          setLabelReason("");
          return;
        }

        if (!response.ok) {
          setError(data.error ?? "Could not load email rule.");
          return;
        }

        const rule = data.rule as EmailRule;
        const savedLabels = Array.isArray(rule.labelsApplied) ? rule.labelsApplied : [];
        const firstLabel = getSuggestedRuleLabel(rule);
        setExistingRule(rule);
        setSelectedLabels(firstLabel ? [firstLabel] : []);
        setLabelReason(firstLabel ? rule.labelReasons?.[firstLabel] ?? "" : "");
      } catch {
        setError("Could not load email rule.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadRule();
  }, [summary.id]);

  function toggleSelectedLabel(labelName: string) {
    setSelectedLabels([labelName]);
    setLabelReason(existingRule?.labelReasons?.[labelName] ?? "");
  }

  async function saveRule() {
    if (!canReview) {
      return;
    }

    setIsSaving(true);
    setError(null);

    const from = messageDetail?.from || summary.from || summary.sender || "";
    const fromEmail = extractEmailAddressFromText(from) || from || "unknown@example.com";
    const fromName = extractDisplayNameFromText(from) || summary.sender || fromEmail;
    const payload = {
      emailId: summary.id,
      threadId: summary.threadId || summary.id,
      fromEmail,
      fromName,
      subject: messageDetail?.subject || summary.subject || "(no subject)",
      snippet: summary.snippet || messageDetail?.bodyText?.slice(0, 200) || "",
      labelsApplied: [selectedLabel],
      labelReasons: pickLabelReasons([selectedLabel], { [selectedLabel]: labelReason }),
    };

    try {
      const response = await fetch(
        isExistingRule ? `/api/email-rules/${encodeURIComponent(summary.id)}/review` : "/api/email-rules/review",
        {
          method: isExistingRule ? "PUT" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not save rule.");
        return;
      }

      onSaved(data.rule);
    } catch {
      setError("Could not save rule.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-white/70 bg-white/55 p-4 shadow-2xl shadow-slate-900/20 [backdrop-filter:blur(5px)] [-webkit-backdrop-filter:blur(5px)]">
        <div className="max-h-[calc(92vh-2rem)] overflow-hidden rounded-xl bg-white/40 shadow-inner ring-1 ring-white/60">
          <div className="flex items-start justify-between gap-4 border-b border-white/60 px-5 pb-4 pt-5">
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold text-zinc-950">
                {isLoading ? "Rule" : isExistingRule ? "Edit Rule" : "Create Rule"}
              </h3>
              <p className="mt-1 truncate text-sm text-zinc-500">{messageDetail?.subject || summary.subject || "(no subject)"}</p>
            </div>
            <Button aria-label="Close rule editor" onClick={onClose} size="icon" type="button" variant="ghost">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="max-h-[calc(92vh-112px)] overflow-y-auto overflow-x-hidden p-5">
          {isLoading ? <p className="text-sm text-zinc-500">Loading rule...</p> : null}
          {error ? <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {!isLoading ? (
            <div className="space-y-5">
              <div className="rounded-md border border-zinc-200 bg-white/45 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-950">{extractDisplayNameFromText(messageDetail?.from || summary.from) || summary.sender || "Unknown sender"}</p>
                    <p className="truncate text-sm text-zinc-500">{formatEmailTextForPrivacy(messageDetail?.from || summary.from || "", privacyMode)}</p>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600">{summary.snippet || "No preview available."}</p>
                  </div>
                </div>
              </div>

              <div className="min-w-0">
                <p className="mb-2 text-xs font-medium uppercase text-zinc-500">Available labels</p>
                {labelSelectionError ? <p className="mb-2 text-xs text-red-600">{labelSelectionError}</p> : null}
                <RuleLabelSelectionRows
                  confidenceThreshold="0.90"
                  labels={labels}
                  onToggle={toggleSelectedLabel}
                  selectedLabels={selectedLabels}
                  suggestedLabel={existingRule?.isPending ? getSuggestedRuleLabel(existingRule) : undefined}
                />
              </div>

              {selectedLabel ? (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase text-zinc-500">When to use {selectedLabel}</span>
                  <textarea
                    className="min-h-28 w-full glass-panel rounded-md border px-3 py-2 text-sm outline-none transition-colors focus:border-zinc-400"
                    maxLength={200}
                    onChange={(event) => setLabelReason(event.target.value)}
                    placeholder="Explain when the AI should choose this label."
                    value={labelReason}
                  />
                  <span className="mt-1 block text-right text-xs text-zinc-500">{labelReason.length}/200</span>
                </label>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button disabled={isSaving} onClick={onClose} type="button" variant="outline">
                  Cancel
                </Button>
                <Tooltip align="end" text={labelReason.trim() ? "Mark this rule reviewed and apply the selected label." : "A reason helps the AI make better future choices, but you can still review this rule."}>
                  <span>
                    <Button className={cn(canReview && reviewedButtonClass)} disabled={isSaving || !canReview} onClick={() => void saveRule()} type="button">
                      <Save className="h-4 w-4" />
                      Reviewed
                    </Button>
                  </span>
                </Tooltip>
              </div>
            </div>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function InboxComposeModal({
  accounts,
  initial,
  isByoAiActive,
  onClose,
  onSaved,
  privacyMode,
  variant = "modal",
}: {
  accounts: EmailAccount[];
  initial: Partial<InboxComposeDraft> | null;
  isByoAiActive: boolean;
  onClose: () => void;
  onSaved?: (kind: "draft" | "sent") => void;
  privacyMode: boolean;
  variant?: "modal" | "push";
}) {
  const [accountId, setAccountId] = useState(initial?.accountId || accounts[0]?.id || "");
  const [to, setTo] = useState(initial?.to ?? "");
  const [cc, setCc] = useState(initial?.cc ?? "");
  const [bcc, setBcc] = useState(initial?.bcc ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [bodyText, setBodyText] = useState(initial?.bodyText ?? "");
  const [attachments, setAttachments] = useState<InboxAttachment[]>([]);
  const [isAiDraftOpen, setIsAiDraftOpen] = useState(false);
  const [isOriginalMessageExpanded, setIsOriginalMessageExpanded] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiMessages, setAiMessages] = useState<Array<{ id: number; role: "user" | "assistant"; text: string }>>([]);
  const [isGeneratingAiSuggestion, setIsGeneratingAiSuggestion] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const replyContext = initial?.replyContext ?? null;
  const isExistingDraft = Boolean(initial?.draftId);
  const isPush = variant === "push";
  const composeFormId = `inbox-compose-form-${variant}`;

  useEffect(() => {
    if (!isByoAiActive) {
      setIsAiDraftOpen(false);
    }
  }, [isByoAiActive]);

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSaved(false);

    try {
      const response = await fetch(
        isExistingDraft ? `/api/inbox/drafts/${encodeURIComponent(initial?.draftId || "")}` : "/api/inbox/send",
        {
        method: isExistingDraft ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          to,
          cc,
          bcc,
          subject,
          bodyText,
          attachments,
          replyToEmailId: replyContext?.emailId || "",
          threadId: replyContext?.threadId || initial?.threadId || "",
          mailbox: initial?.mailbox || "",
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? (isExistingDraft ? "Could not save draft." : "Could not send email."));
        return;
      }
      setSaved(true);
      onSaved?.(isExistingDraft ? "draft" : "sent");
      onClose();
    } catch {
      setError(isExistingDraft ? "Could not save draft." : "Could not send email.");
    } finally {
      setIsSaving(false);
    }
  }

  async function generateAiSuggestion() {
    const prompt = aiInstruction.trim();
    if (!prompt) {
      return;
    }

    setIsGeneratingAiSuggestion(true);
    setAiError(null);
    setAiMessages((current) => [...current, { id: Date.now(), role: "user", text: prompt }]);
    setAiInstruction("");

    try {
      const response = await fetch("/api/byoai/compose-suggestion", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          currentBody: bodyText,
          message: replyContext,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setAiError(data.error ?? "Could not draft with AI.");
        return;
      }

      setAiMessages((current) => [...current, { id: Date.now() + 1, role: "assistant", text: data.bodyText ?? "" }]);
    } catch {
      setAiError("Could not draft with AI.");
    } finally {
      setIsGeneratingAiSuggestion(false);
    }
  }

  return (
    <div className={cn("fixed inset-0 z-50", isPush ? "flex flex-col bg-[#f7f7f7] md:hidden" : "flex items-center justify-center bg-slate-950/20 p-4")}>
      <div className={cn(isPush ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-white/70 bg-white/55 p-4 shadow-2xl shadow-slate-900/20 [backdrop-filter:blur(5px)] [-webkit-backdrop-filter:blur(5px)]")}>
        <div className={cn(isPush ? "min-h-0 flex-1 overflow-y-auto bg-transparent p-4 pb-28" : "max-h-[calc(92vh-2rem)] overflow-y-auto rounded-xl bg-white/40 p-5 shadow-inner ring-1 ring-white/60")}>
          <div className={cn("mb-4 flex items-center justify-between gap-4", isPush && "sticky -top-4 z-10 -mx-4 -mt-4 border-b border-zinc-200 bg-white/75 px-2 py-2 backdrop-blur-xl")}>
            {isPush ? (
              <Button aria-label="Back to email" onClick={onClose} size="icon" type="button" variant="ghost">
                <ChevronLeft className="h-5 w-5" />
              </Button>
            ) : (
              <span className="w-10" />
            )}
            <h3 className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-zinc-950">
              {isAiDraftOpen ? "AI Draft" : isExistingDraft ? "Edit draft" : replyContext ? "Reply" : "New email"}
            </h3>
            {isPush ? (
              <div className="flex items-center gap-1">
                {isByoAiActive ? (
                  <Button aria-label="AI Draft" onClick={() => setIsAiDraftOpen(true)} size="icon" type="button" variant="ghost">
                    <Sparkles className="h-4 w-4" />
                  </Button>
                ) : null}
                <Button aria-label={isExistingDraft ? "Save draft" : "Send email"} disabled={isSaving || !accountId || !to.trim() || !bodyText.trim()} form={composeFormId} size="icon" type="submit" variant="ghost">
                  {isSaving ? <Loader /> : isExistingDraft ? <Save className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            ) : (
              <Button aria-label={isAiDraftOpen ? "Back to email draft" : "Close compose"} onClick={isAiDraftOpen ? () => setIsAiDraftOpen(false) : onClose} size="icon" type="button" variant="ghost">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        {isAiDraftOpen ? (
          <div className={cn("relative flex min-h-[560px] flex-col overflow-hidden", isPush && "min-h-[calc(100vh-7rem)]")}>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 pb-24">
              {aiMessages.map((message) => (
                  <div className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")} key={message.id}>
                    {message.role === "assistant" ? (
                      <button
                        className="max-w-[85%] cursor-pointer whitespace-pre-wrap rounded-xl border border-white/70 bg-white/65 px-4 py-3 text-left text-sm leading-6 text-zinc-800 shadow-sm backdrop-blur-xl transition hover:border-emerald-200 hover:bg-emerald-50/80"
                        onClick={() => {
                          setBodyText(message.text);
                          setIsAiDraftOpen(false);
                        }}
                        title="Apply this draft"
                        type="button"
                      >
                        {message.text}
                        <span className="mt-2 block text-xs font-medium text-emerald-700">Click to apply</span>
                      </button>
                    ) : (
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-xl border border-white/70 bg-white/65 px-4 py-3 text-sm leading-6 text-zinc-800 shadow-sm backdrop-blur-xl">
                        {message.text}
                      </div>
                    )}
                  </div>
                ))}
              {aiError ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{aiError}</p> : null}
            </div>
            <div className="absolute inset-x-0 bottom-0 z-10 bg-white/35 p-3 backdrop-blur-xl">
              <div className="flex items-center gap-2">
                <input
                  className="h-10 min-w-0 flex-1 rounded-md border border-zinc-200 bg-white/45 px-3 text-sm outline-none placeholder:text-zinc-400 shadow-sm backdrop-blur-xl focus:border-zinc-400"
                  maxLength={1000}
                  onChange={(event) => setAiInstruction(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && aiInstruction.trim() && !isGeneratingAiSuggestion) {
                      event.preventDefault();
                      void generateAiSuggestion();
                    }
                  }}
                  placeholder={replyContext ? "Ask AI how to draft this reply..." : "Ask AI how to draft this email..."}
                  type="text"
                  value={aiInstruction}
                />
                <Button className="h-9 w-9 border border-white/70 bg-white/55 text-zinc-700 shadow-sm backdrop-blur-xl hover:bg-white/75" disabled={isGeneratingAiSuggestion || !aiInstruction.trim()} onClick={() => void generateAiSuggestion()} size="icon" type="button" variant="outline">
                  {isGeneratingAiSuggestion ? <Loader /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        ) : (
        <form className="space-y-4" id={composeFormId} onSubmit={submitEmail}>
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {saved ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{isExistingDraft ? "Draft saved." : "Email sent."}</p> : null}
          {replyContext ? (
            <div className="rounded-xl border border-zinc-200 bg-white/60 p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 pb-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase text-zinc-500">Original email</p>
                  <p className="mt-1 truncate text-sm font-semibold text-zinc-950">{replyContext.subject || "(no subject)"}</p>
                </div>
                <div className="flex max-w-full items-center gap-2 sm:max-w-96">
                  <p className="truncate text-xs text-zinc-500">
                    From: {formatEmailForPrivacy(replyContext.from || "Unknown sender", privacyMode)}
                  </p>
                  <Button
                    aria-label={isOriginalMessageExpanded ? "Hide full original email" : "Reveal full original email"}
                    onClick={() => setIsOriginalMessageExpanded((current) => !current)}
                    size="icon"
                    title={isOriginalMessageExpanded ? "Hide full message" : "Reveal full message"}
                    type="button"
                    variant="ghost"
                  >
                    <ChevronRight className={cn("h-4 w-4 transition-transform", isOriginalMessageExpanded && "rotate-90")} />
                  </Button>
                </div>
              </div>
              {isOriginalMessageExpanded ? (
                <div className="max-h-[46vh] min-h-64 overflow-y-auto rounded-lg border border-white/70 bg-white/80 p-3">
                  {replyContext.bodyHtml ? (
                    <iframe className="h-[520px] w-full rounded bg-white" sandbox="" srcDoc={replyContext.bodyHtml} title="Original email body" />
                  ) : (
                    <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-zinc-700">
                      {replyContext.bodyText || replyContext.snippet || "No message preview available."}
                    </pre>
                  )}
                </div>
              ) : (
                <p className="line-clamp-3 text-sm leading-6 text-zinc-600">
                  {replyContext.snippet || replyContext.bodyText || "No message preview available."}
                </p>
              )}
            </div>
          ) : null}
          <div className="space-y-2 rounded-xl bg-white/55 p-3 ring-1 ring-white/60">
            <div className="flex flex-wrap items-center gap-2">
              <label className="block w-full shrink-0 sm:w-36">
                <span className="sr-only">From</span>
                <select className="h-9 w-full rounded-full border border-zinc-200 bg-white/80 px-3 text-xs text-zinc-600" onChange={(event) => setAccountId(event.target.value)} required value={accountId}>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>{formatEmailForPrivacy(account.email, privacyMode)}</option>
                  ))}
                </select>
              </label>
              <input
                className="h-9 min-w-48 flex-1 rounded-full border border-zinc-200 bg-white/80 px-3 text-sm outline-none transition-colors focus:border-zinc-400"
                onChange={(event) => setTo(event.target.value)}
                placeholder="To"
                required
                value={to}
              />
              <input
                className="h-9 w-14 rounded-full border border-zinc-200 bg-white/80 px-3 text-xs outline-none transition-all duration-200 ease-out focus:w-56 focus:border-zinc-400 sm:focus:w-64"
                onChange={(event) => setCc(event.target.value)}
                placeholder="Cc"
                value={cc}
              />
              <input
                className="h-9 w-14 rounded-full border border-zinc-200 bg-white/80 px-3 text-xs outline-none transition-all duration-200 ease-out focus:w-56 focus:border-zinc-400 sm:focus:w-64"
                onChange={(event) => setBcc(event.target.value)}
                placeholder="Bcc"
                value={bcc}
              />
            </div>
          </div>
          <div className="space-y-2 rounded-xl bg-white/55 p-3 ring-1 ring-white/60">
            <input
              className="w-full rounded-lg border border-zinc-200 bg-white/25 px-3 py-3 text-xl font-semibold text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-zinc-400"
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Subject"
              value={subject}
            />
            <label className="block">
              <span className="sr-only">Body</span>
              <textarea className="min-h-56 w-full resize-y rounded-lg border-0 bg-white/20 px-3 py-3 text-sm leading-6 text-zinc-800 outline-none placeholder:text-zinc-400" onChange={(event) => setBodyText(event.target.value)} placeholder="Write your message..." required value={bodyText} />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">Attachments</span>
            <input
              className="block w-full text-sm text-zinc-600"
              multiple
              onChange={(event) =>
                setAttachments(
                  Array.from(event.target.files ?? []).map((file) => ({
                    filename: file.name,
                    type: file.type || "application/octet-stream",
                    size: file.size,
                  })),
                )
              }
              type="file"
            />
            <p className="mt-1 text-xs text-zinc-500">Files are listed for now; binary upload and previews are out of scope for this first pass.</p>
            {attachments.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {attachments.map((attachment) => (
                  <Badge key={`${attachment.filename}-${attachment.size}`}>{attachment.filename}</Badge>
                ))}
              </div>
            ) : null}
          </label>
          <div className={cn("flex justify-end gap-2 border-t border-zinc-200 pt-4", isPush && "hidden")}>
            <Button onClick={onClose} type="button" variant="outline">Cancel</Button>
            {isByoAiActive ? (
              <Button onClick={() => setIsAiDraftOpen(true)} type="button" variant="outline">
                <Sparkles className="h-4 w-4" />
                AI Draft
              </Button>
            ) : null}
            <Button disabled={isSaving || !accountId || !to.trim() || !bodyText.trim()} type="submit">
              {isSaving ? (isExistingDraft ? "Saving..." : "Sending...") : (isExistingDraft ? "Save draft" : "Send email")}
            </Button>
          </div>
        </form>
        )}
        </div>
      </div>
    </div>
  );
}

function LabelsPage({ privacyMode }: { privacyMode: boolean }) {
  const [labels, setLabels] = useState<Label[]>([]);
  const [connectedAccountCount, setConnectedAccountCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [isAddLabelModalOpen, setIsAddLabelModalOpen] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState("0.90");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [deleteConfirmationIds, setDeleteConfirmationIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [labelAction, setLabelAction] = useState<
    "create" | "update" | "delete" | "retry" | "sync" | "refresh" | "upload" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const csvUploadRef = useRef<HTMLInputElement | null>(null);
  const syncedLabelCount = labels.filter((label) => isLabelFullySynced(label, connectedAccountCount)).length;
  const unsyncedLabelCount = labels.length - syncedLabelCount;
  const deletableLabels = labels;
  const selectedDeletableIds = selectedIds.filter((id) => deletableLabels.some((label) => label.id === id));

  useEffect(() => {
    void loadLabels();
    void loadConfidenceThreshold();
  }, []);

  async function loadConfidenceThreshold() {
    try {
      const response = await fetch("/api/settings/confidence-threshold", { credentials: "include" });
      const data = await response.json();

      if (response.ok) {
        setConfidenceThreshold(formatThreshold(data.threshold ?? 0.9));
      }
    } catch {
      setConfidenceThreshold("0.90");
    }
  }

  async function loadLabels() {
    setError(null);
    setIsLoading(true);

    try {
      const [response, accountsResponse] = await Promise.all([
        fetch("/api/labels", { credentials: "include" }),
        fetch("/api/email-accounts", { credentials: "include" }),
      ]);
      const data = await response.json();
      const accountsData = await accountsResponse.json();

      if (!response.ok) {
        setError(data.error ?? "Could not load labels.");
        return;
      }

      setLabels(data.labels ?? []);
      setConnectedAccountCount(accountsResponse.ok ? accountsData.accounts?.length ?? 0 : 0);
      setSelectedIds((current) => current.filter((id) => data.labels?.some((label: Label) => label.id === id)));
    } catch {
      setError("Could not load labels.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAddLabel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateLabelInput(newName, newDescription);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsSaving(true);
    setLabelAction("create");

    try {
      const response = await fetch("/api/labels", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, description: newDescription }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not create label.");
        return;
      }

      setNewName("");
      setNewDescription("");
      setUploadError(null);
      setIsAddLabelModalOpen(false);
      await loadLabels();
    } catch {
      setError("Could not create label.");
    } finally {
      setIsSaving(false);
      setLabelAction(null);
    }
  }

  async function handleCsvUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setError(null);
    setUploadError(null);

    let rows: string[][];

    try {
      rows = parseCsvRows(await file.text());
    } catch (parseError) {
      setUploadError(parseError instanceof Error ? parseError.message : "Could not parse the CSV file.");
      return;
    }

    if (rows.length === 0) {
      setUploadError("CSV must include the header: Name, Description.");
      return;
    }

    const [header, ...dataRows] = rows;
    const normalizedHeader = header.map((value) => value.trim());

    if (normalizedHeader.length !== 2 || normalizedHeader[0] !== "Name" || normalizedHeader[1] !== "Description") {
      setUploadError("CSV header must be exactly: Name, Description.");
      return;
    }

    if (dataRows.length === 0) {
      setUploadError("CSV must include at least one label row.");
      return;
    }

    if (dataRows.length > 20) {
      setUploadError(`CSV upload supports at most 20 label rows. This file has ${dataRows.length}.`);
      return;
    }

    const labelsToImport = [];

    for (const [index, row] of dataRows.entries()) {
      if (row.length !== 2) {
        setUploadError(`Row ${index + 2}: Each row must include Name and Description only.`);
        return;
      }

      const name = row[0].trim();
      const description = row[1].trim();
      const validationError = validateLabelInput(name, description);

      if (validationError) {
        setUploadError(`Row ${index + 2}: ${validationError}`);
        return;
      }

      labelsToImport.push({ name, description });
    }

    setIsSaving(true);
    setLabelAction("upload");

    try {
      const response = await fetch("/api/labels/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labels: labelsToImport }),
      });
      const data = await response.json();

      if (!response.ok) {
        setUploadError(data.error ?? "Could not upload labels.");
        return;
      }

      await loadLabels();
      setIsAddLabelModalOpen(false);
    } catch {
      setUploadError("Could not upload labels.");
    } finally {
      setIsSaving(false);
      setLabelAction(null);
    }
  }

  function startEditing(label: Label) {
    setEditingId(label.id);
    setEditName(label.name);
    setEditDescription(label.description);
    setError(null);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditName("");
    setEditDescription("");
  }

  async function saveEditing(labelId: string) {
    const validationError = validateLabelInput(editName, editDescription);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsSaving(true);
    setLabelAction("update");

    try {
      const response = await fetch(`/api/labels/${labelId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, description: editDescription }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not update label.");
        return;
      }

      cancelEditing();
      await loadLabels();
    } catch {
      setError("Could not update label.");
    } finally {
      setIsSaving(false);
      setLabelAction(null);
    }
  }

  async function deleteLabels(ids: string[]) {
    const deletableIds = ids.filter((id) => labels.some((label) => label.id === id));

    if (deletableIds.length === 0) {
      return;
    }

    setError(null);
    setIsSaving(true);
    setLabelAction("delete");

    try {
      const response = await fetch("/api/labels", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: deletableIds }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not delete labels.");
        return;
      }

      if (data.failed > 0) {
        setError(`${data.failed} label sync operation failed. Review the status tag and retry when ready.`);
      }

      setSelectedIds([]);
      await loadLabels();
    } catch {
      setError("Could not delete labels.");
    } finally {
      setIsSaving(false);
      setLabelAction(null);
      setDeleteConfirmationIds([]);
    }
  }

  function requestDeleteLabels(ids: string[]) {
    const deletableIds = ids.filter((id) => labels.some((label) => label.id === id));

    if (deletableIds.length === 0) {
      return;
    }

    setDeleteConfirmationIds(deletableIds);
  }

  function toggleSelected(labelId: string) {
    setSelectedIds((current) =>
      current.includes(labelId) ? current.filter((id) => id !== labelId) : [...current, labelId],
    );
  }

  function toggleAllSelected() {
    setSelectedIds((current) =>
      current.length === deletableLabels.length ? [] : deletableLabels.map((label) => label.id),
    );
  }

  async function retryLabel(labelId: string) {
    setError(null);
    setIsSaving(true);
    setLabelAction("retry");

    try {
      const response = await fetch(`/api/labels/${labelId}/retry`, {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not retry label sync.");
        return;
      }

      await loadLabels();
    } catch {
      setError("Could not retry label sync.");
    } finally {
      setIsSaving(false);
      setLabelAction(null);
    }
  }

  async function syncAllLabels() {
    setError(null);
    setIsSaving(true);
    setLabelAction("sync");

    try {
      const response = await fetch("/api/labels/sync-all", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not sync labels.");
        return;
      }

      await loadLabels();
    } catch {
      setError("Could not sync labels.");
    } finally {
      setIsSaving(false);
      setLabelAction(null);
    }
  }

  async function refreshLabelSyncStatus() {
    setError(null);
    setIsSaving(true);
    setLabelAction("refresh");

    try {
      const response = await fetch("/api/labels/refresh-sync", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not refresh label sync status.");
        return;
      }

      await loadLabels();
    } catch {
      setError("Could not refresh label sync status.");
    } finally {
      setIsSaving(false);
      setLabelAction(null);
    }
  }

  return (
    <div className="space-y-6">
      {uploadError ? (
        <div
          className="fixed right-5 top-5 z-50 w-[min(420px,calc(100vw-2.5rem))] glass-surface rounded-md border border-red-200 p-4 text-sm text-red-700 shadow-lg"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-red-800">CSV upload failed</p>
              <p className="mt-1 leading-5">{uploadError}</p>
            </div>
            <Button aria-label="Dismiss upload error" onClick={() => setUploadError(null)} size="icon" type="button" variant="ghost">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
      {deleteConfirmationIds.length > 0 ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 p-4">
          <div className="w-[min(460px,100%)] rounded-2xl border border-white/70 bg-white/55 p-4 shadow-2xl shadow-slate-900/20 [backdrop-filter:blur(5px)] [-webkit-backdrop-filter:blur(5px)]">
            <div className="rounded-xl bg-white/40 p-5 shadow-inner ring-1 ring-white/60">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-zinc-950">Delete label?</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    This will delete {deleteConfirmationIds.length === 1 ? "this label" : `${deleteConfirmationIds.length} labels`}.
                  </p>
                </div>
                <Button
                  aria-label="Close delete confirmation"
                  disabled={isSaving}
                  onClick={() => setDeleteConfirmationIds([])}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-zinc-700">
                <li>Deleting the label cannot be undone.</li>
                <li>Any email rule that uses this label will be updated to remove it.</li>
                <li>Any emails that use this label will have the label removed.</li>
              </ul>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <Button disabled={isSaving} onClick={() => setDeleteConfirmationIds([])} type="button" variant="outline">
                  Cancel
                </Button>
                <Button disabled={isSaving} onClick={() => void deleteLabels(deleteConfirmationIds)} type="button">
                  {labelAction === "delete" ? <Loader /> : <Trash2 className="h-4 w-4" />}
                  {labelAction === "delete" ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {isAddLabelModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 p-4">
          <div className="w-[min(560px,100%)] rounded-2xl border border-white/70 bg-white/55 p-4 shadow-2xl shadow-slate-900/20 [backdrop-filter:blur(5px)] [-webkit-backdrop-filter:blur(5px)]">
            <div className="rounded-xl bg-white/40 p-5 shadow-inner ring-1 ring-white/60">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-zinc-950">Add Label</h2>
                  <p className="mt-1 text-sm text-zinc-500">Create labels that can be used by rules and reviews.</p>
                </div>
                <Button
                  aria-label="Close add label modal"
                  disabled={isSaving}
                  onClick={() => setIsAddLabelModalOpen(false)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

              <form className="mt-5 space-y-4" onSubmit={handleAddLabel}>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="new-label-name">Name</label>
                  <input
                    className="h-10 w-full glass-panel rounded-md border px-3 text-sm outline-none transition-colors focus:border-zinc-400"
                    id="new-label-name"
                    maxLength={LABEL_NAME_MAX_LENGTH}
                    onChange={(event) => setNewName(event.target.value)}
                    pattern="[A-Za-z0-9 _-]+"
                    required
                    title="Letters, numbers, spaces, hyphens, and underscores only"
                    value={newName}
                  />
                  <div className="mt-1 flex justify-end text-xs text-zinc-500">
                    <span>{newName.length}/{LABEL_NAME_MAX_LENGTH}</span>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="new-label-description">Description</label>
                  <input
                    className="h-10 w-full glass-panel rounded-md border px-3 text-sm outline-none transition-colors focus:border-zinc-400"
                    id="new-label-description"
                    maxLength={LABEL_DESCRIPTION_MAX_LENGTH}
                    onChange={(event) => setNewDescription(event.target.value)}
                    required
                    value={newDescription}
                  />
                  <div className="mt-1 flex justify-end text-xs text-zinc-500">
                    <span>{newDescription.length}/{LABEL_DESCRIPTION_MAX_LENGTH}</span>
                  </div>
                </div>

                <div className="flex flex-wrap justify-between gap-2 border-t border-zinc-200 pt-4">
                  <div>
                    <input
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={(event) => void handleCsvUpload(event)}
                      ref={csvUploadRef}
                      type="file"
                    />
                    <Button disabled={isSaving} onClick={() => csvUploadRef.current?.click()} type="button" variant="outline">
                      {labelAction === "upload" ? <Loader /> : <Upload className="h-4 w-4" />}
                      {labelAction === "upload" ? "Uploading..." : "Upload CSV"}
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button disabled={isSaving} onClick={() => setIsAddLabelModalOpen(false)} type="button" variant="outline">
                      Cancel
                    </Button>
                    <Button disabled={isSaving} type="submit">
                      {labelAction === "create" ? <Loader /> : <Plus className="h-4 w-4" />}
                      {labelAction === "create" ? "Adding..." : "Add Label"}
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="items-center text-center">
            <CardDescription>Synced Labels</CardDescription>
            <CardTitle className="text-3xl">{syncedLabelCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="items-center text-center">
            <CardDescription>Unsynced Labels</CardDescription>
            <CardTitle className="text-3xl">{unsyncedLabelCount}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap justify-center gap-2">
            <Button disabled={isSaving || labels.length === 0} onClick={() => void refreshLabelSyncStatus()} size="sm" type="button" variant="outline">
              {labelAction === "refresh" ? <Loader /> : null}
              {labelAction === "refresh" ? "Checking..." : "Refresh"}
            </Button>
            {unsyncedLabelCount > 0 ? (
              <Button disabled={isSaving} onClick={() => void syncAllLabels()} size="sm" type="button">
                {labelAction === "sync" ? <Loader /> : null}
                {labelAction === "sync" ? "Syncing..." : "Sync all"}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle>Labels</CardTitle>
              <Badge>{labels.length} total</Badge>
            </div>
            <CardDescription>Manage label names and descriptions.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={deletableLabels.length === 0 || isSaving} onClick={toggleAllSelected} type="button" variant="outline">
              {selectedIds.length === deletableLabels.length && deletableLabels.length > 0 ? "Clear selection" : "Select all"}
            </Button>
            <Button
              disabled={selectedDeletableIds.length === 0 || isSaving}
              onClick={() => requestDeleteLabels(selectedDeletableIds)}
              type="button"
              variant="outline"
            >
              {labelAction === "delete" ? <Loader /> : <Trash2 className="h-4 w-4" />}
              {labelAction === "delete" ? "Deleting..." : "Delete selected"}
            </Button>
            <Button
              disabled={isSaving}
              onClick={() => {
                setError(null);
                setUploadError(null);
                setIsAddLabelModalOpen(true);
              }}
              type="button"
            >
              <Plus className="h-4 w-4" />
              Add Label
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error ? <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {isLoading ? (
            <div className="rounded-md border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
              Loading labels...
            </div>
          ) : labels.length === 0 ? (
            <div className="rounded-md border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
              No labels yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-zinc-200">
              <div className="grid min-w-[720px] grid-cols-[44px_1fr_1.5fr_160px] gap-3 border-b border-zinc-200 glass-panel px-4 py-3 text-xs font-medium uppercase text-zinc-500">
                <span />
                <span>Name</span>
                <span>Description</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-zinc-200">
                {labels.map((label) => {
	                  const isEditing = editingId === label.id;
	                  const isSelected = selectedIds.includes(label.id);
	                  const failedSyncs = getFailedSyncs(label);
	                  const hasFailedSyncs = failedSyncs.length > 0;

                  return (
                    <div
                      className="grid min-w-[720px] grid-cols-[44px_1fr_1.5fr_160px] items-start gap-3 px-4 py-3"
                      key={label.id}
                    >
	                      <input
	                        checked={isSelected}
	                        className="h-4 w-4"
	                        onChange={() => toggleSelected(label.id)}
	                        type="checkbox"
	                      />
                      {isEditing ? (
                        <>
                          <div>
                            <input
                              className="h-10 w-full glass-panel rounded-md border px-3 text-sm outline-none transition-colors focus:border-zinc-400"
                              maxLength={LABEL_NAME_MAX_LENGTH}
                              onChange={(event) => setEditName(event.target.value)}
                              pattern="[A-Za-z0-9 _-]+"
                              title="Letters, numbers, spaces, hyphens, and underscores only"
                              value={editName}
                            />
                            <div className="mt-1 flex justify-end text-xs text-zinc-500">
                              <span>
                                {editName.length}/{LABEL_NAME_MAX_LENGTH}
                              </span>
                            </div>
                          </div>
                          <div>
                            <input
                              className="h-10 w-full glass-panel rounded-md border px-3 text-sm outline-none transition-colors focus:border-zinc-400"
                              maxLength={LABEL_DESCRIPTION_MAX_LENGTH}
                              onChange={(event) => setEditDescription(event.target.value)}
                              value={editDescription}
                            />
                            <div className="mt-1 flex justify-end text-xs text-zinc-500">
                              <span>
                                {editDescription.length}/{LABEL_DESCRIPTION_MAX_LENGTH}
                              </span>
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              disabled={isSaving}
                              onClick={() => void saveEditing(label.id)}
                              size="icon"
                              title="Save label"
                              type="button"
                            >
                              {labelAction === "update" ? <Loader /> : <Save className="h-4 w-4" />}
                            </Button>
                            <Button disabled={isSaving} onClick={cancelEditing} size="icon" title="Cancel editing" type="button" variant="outline">
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
	                            <p className="text-sm font-medium text-zinc-950">{label.name}</p>
	                            {label.syncs && label.syncs.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {hasFailedSyncs ? (
                                  <Badge className="border-red-200 bg-red-50 text-red-700">
                                    Sync failed on {failedSyncs.length}
                                  </Badge>
                                ) : (
                                  <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Synced</Badge>
                                )}
                              </div>
                            ) : null}
                          </div>
                          <p className="text-sm text-zinc-600">
                            {renderLabelDescription(label.description, confidenceThreshold)}
                            {hasFailedSyncs ? (
                              <span className="mt-2 block text-xs text-red-600">
                                {failedSyncs.map((sync) => `${providerLabel(sync.provider)} ${formatEmailForPrivacy(sync.email, privacyMode)}: ${sync.lastError}`).join("; ")}
                              </span>
                            ) : null}
                          </p>
                          <div className="flex justify-end gap-2">
                            {hasFailedSyncs ? (
                              <Button
                                disabled={isSaving}
                                onClick={() => void retryLabel(label.id)}
                                size="sm"
                                title="Retry failed account sync"
                                type="button"
                              variant="outline"
                            >
                                {labelAction === "retry" ? "Retrying..." : "Retry"}
                              </Button>
                            ) : null}
                            <Button disabled={isSaving} onClick={() => startEditing(label)} size="icon" title="Edit label" type="button" variant="outline">
                              <Pencil className="h-4 w-4" />
                            </Button>
	                            <Button
	                              disabled={isSaving}
	                              onClick={() => requestDeleteLabels([label.id])}
	                              size="icon"
	                              title="Delete label"
                              type="button"
                              variant="outline"
                            >
                              {labelAction === "delete" ? <Loader /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricsPage() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [activeTab, setActiveTab] = useState<"metrics" | "logs">(() => metricsTabFromPath(window.location.pathname));
  const [logCategory, setLogCategory] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isExportingLogs, setIsExportingLogs] = useState(false);
  const [isPurgingLogs, setIsPurgingLogs] = useState(false);
  const [isLogPurgeConfirmOpen, setIsLogPurgeConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logsNotice, setLogsNotice] = useState<string | null>(null);

  useEffect(() => {
    function handlePopState() {
      setActiveTab(metricsTabFromPath(window.location.pathname));
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    async function loadMetrics() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/metrics", { credentials: "include" });
        const data = await response.json();

        if (!response.ok) {
          setError(data.error ?? "Could not load metrics.");
          return;
        }

        setMetrics(data);
      } catch {
        setError("Could not load metrics.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadMetrics();
  }, []);

  useEffect(() => {
    if (activeTab === "logs") {
      void loadLogs();
    }
  }, [activeTab, logCategory]);

  useEffect(() => {
    if (!isLogPurgeConfirmOpen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isLogPurgeConfirmOpen]);

  async function loadLogs() {
    setIsLoadingLogs(true);
    setLogsError(null);

    try {
      const response = await fetch(`/api/system-logs?category=${encodeURIComponent(logCategory)}&limit=100`, { credentials: "include" });
      const data = await response.json();

      if (!response.ok) {
        setLogsError(data.error ?? "Could not load logs.");
        return;
      }

      setLogs(data.logs ?? []);
    } catch {
      setLogsError("Could not load logs.");
    } finally {
      setIsLoadingLogs(false);
    }
  }

  async function exportLogs() {
    setIsExportingLogs(true);
    setLogsError(null);
    setLogsNotice(null);
    try {
      const response = await fetch(`/api/system-logs/export?category=${encodeURIComponent(logCategory)}`, {
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok) {
        setLogsError(data.error ?? "Could not export logs.");
        return;
      }

      const content = await serializeLogsInWorker({
        category: logCategory,
        exportedAt: new Date().toISOString(),
        logs: data.logs ?? [],
      });
      const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `emailable-logs-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setLogsNotice("Log export is ready.");
    } catch {
      setLogsError("Could not export logs.");
    } finally {
      setIsExportingLogs(false);
    }
  }

  async function purgeLogs() {
    setIsPurgingLogs(true);
    setLogsError(null);
    setLogsNotice(null);
    try {
      const response = await fetch("/api/system-logs", {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok) {
        setLogsError(data.error ?? "Could not delete logs.");
        return;
      }
      setLogs([]);
      setLogsNotice(`${data.deleted ?? 0} log${data.deleted === 1 ? "" : "s"} deleted.`);
      setIsLogPurgeConfirmOpen(false);
    } catch {
      setLogsError("Could not delete logs.");
    } finally {
      setIsPurgingLogs(false);
    }
  }

  function selectTab(tab: "metrics" | "logs") {
    setActiveTab(tab);
    const nextPath = tab === "logs" ? "/metrics/logs" : "/metrics";
    if (stripRuntimeBasePath(window.location.pathname) !== nextPath) {
      window.history.pushState({}, "", getRuntimeUrl(nextPath));
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div>
            <CardTitle>{activeTab === "metrics" ? "Metrics" : "Logs"}</CardTitle>
            <CardDescription>
              {activeTab === "metrics"
                ? "Track rule volume, review status, labeled emails, and draft creation."
                : "Review simplified system activity across email, AI, endpoints, webhooks, and MCP server usage."}
            </CardDescription>
          </div>
          {activeTab === "logs" ? (
            <div className="flex items-center gap-2">
              <select
                className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none transition-colors focus:border-zinc-400"
                onChange={(event) => setLogCategory(event.target.value)}
                value={logCategory}
              >
                <option value="all">All</option>
                <option value="ai">AI</option>
                <option value="email">Email</option>
                <option value="endpoints">Endpoints</option>
                <option value="webhook">Webhook Events</option>
                <option value="mcp-server">MCP Server</option>
              </select>
              <Tooltip text="Export logs">
                <span>
                  <Button aria-label="Export logs" disabled={isExportingLogs} onClick={() => void exportLogs()} size="icon" type="button" variant="outline">
                    {isExportingLogs ? <Loader /> : <Download className="h-4 w-4" />}
                  </Button>
                </span>
              </Tooltip>
              <Tooltip text="Delete all logs">
                <span>
                  <Button aria-label="Delete all logs" disabled={isPurgingLogs} onClick={() => setIsLogPurgeConfirmOpen(true)} size="icon" type="button" variant="outline">
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </span>
              </Tooltip>
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="inline-flex rounded-md border border-zinc-200 bg-white p-1">
            <button
              className={cn("rounded px-3 py-1.5 text-sm font-medium", activeTab === "metrics" ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-50")}
              onClick={() => selectTab("metrics")}
              type="button"
            >
              Metrics
            </button>
            <button
              className={cn("rounded px-3 py-1.5 text-sm font-medium", activeTab === "logs" ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-50")}
              onClick={() => selectTab("logs")}
              type="button"
            >
              Logs
            </button>
          </div>
        </CardContent>
      </Card>

      {activeTab === "metrics" ? (
        <>
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          <div className="grid gap-5 2xl:grid-cols-2">
            <TimelineChartCard data={metrics?.rulesCreated ?? []} isLoading={isLoading} title="Rules Created" />
            <RuleStatusDonut
              isLoading={isLoading}
              pending={metrics?.ruleStatus.pending ?? 0}
              nonPending={metrics?.ruleStatus.nonPending ?? 0}
            />
            <TimelineChartCard data={metrics?.emailsLabeled ?? []} isLoading={isLoading} title="Emails Labeled" />
            <TimelineChartCard data={metrics?.draftsCreated ?? []} isLoading={isLoading} title="Drafts Created" />
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="space-y-3 pt-6">
            {logsNotice ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{logsNotice}</p> : null}
            {logsError ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{logsError}</p> : null}
            {isLoadingLogs ? (
              <p className="rounded-md border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500">Loading logs...</p>
            ) : logs.length === 0 ? (
              <p className="rounded-md border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500">No logs yet.</p>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => (
                  <div className="rounded-md border border-zinc-200 bg-white/70 p-4" key={log.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={logStatusClass(log.status)}>{log.status}</Badge>
                          <Badge className="bg-zinc-100 text-zinc-600">{logCategoryLabel(log.category)}</Badge>
                          <p className="text-sm font-medium text-zinc-950">{log.eventName}</p>
                        </div>
                        <p className="mt-2 text-sm text-zinc-600">{log.message}</p>
                      </div>
                      <span className="text-xs text-zinc-500">{formatDate(log.createdAt)}</span>
                    </div>
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-medium text-zinc-500">Payload</summary>
                      <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-zinc-950 p-3 text-xs text-white">
                        {JSON.stringify(log.payload, null, 2)}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {isLogPurgeConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 p-4">
          <button aria-label="Close delete logs confirmation" className="absolute inset-0 cursor-default" disabled={isPurgingLogs} onClick={() => setIsLogPurgeConfirmOpen(false)} type="button" />
          <div className="relative w-full max-w-md rounded-2xl border border-white/70 bg-white/55 p-4 shadow-2xl shadow-slate-900/20 [backdrop-filter:blur(5px)] [-webkit-backdrop-filter:blur(5px)]">
            <div className="rounded-xl bg-white/40 p-5 shadow-inner ring-1 ring-white/60">
              <h3 className="text-lg font-semibold text-zinc-950">Delete all logs?</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600">This permanently deletes all logs for your Emailable account. This action cannot be undone.</p>
              <div className="mt-5 flex justify-end gap-2">
                <Button disabled={isPurgingLogs} onClick={() => setIsLogPurgeConfirmOpen(false)} type="button" variant="outline">Cancel</Button>
                <Button className="bg-red-600 text-white hover:bg-red-700" disabled={isPurgingLogs} onClick={() => void purgeLogs()} type="button">
                  {isPurgingLogs ? <Loader /> : <Trash2 className="h-4 w-4" />}
                  {isPurgingLogs ? "Deleting..." : "Delete all"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RuleReviewPage({
  initialEmailId,
  initialPendingFilter,
  privacyMode,
}: {
  initialEmailId: string | null;
  initialPendingFilter: RulePendingFilter | null;
  privacyMode: boolean;
}) {
  const [rules, setRules] = useState<EmailRule[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.9);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pendingFilter, setPendingFilter] = useState<RulePendingFilter>(initialPendingFilter ?? "all");
  const [groupBy, setGroupBy] = useState<RuleGroupBy>("none");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedRule, setSelectedRule] = useState<EmailRule | null>(null);
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([]);
  const [draftLabels, setDraftLabels] = useState<string[]>([]);
  const [draftLabelReasons, setDraftLabelReasons] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [ruleAction, setRuleAction] = useState<"review" | "delete" | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [addRuleStep, setAddRuleStep] = useState<"search" | "review" | null>(null);
  const [addRuleSearchQuery, setAddRuleSearchQuery] = useState("");
  const [addRuleAccountEmail, setAddRuleAccountEmail] = useState("");
  const [addRuleResults, setAddRuleResults] = useState<RuleEmailSearchResult[]>([]);
  const [isSearchingEmails, setIsSearchingEmails] = useState(false);
  const [addRuleError, setAddRuleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasLabelChanges = selectedRule ? !sameStringSet(draftLabels, selectedRule.labelsApplied) : false;
  const hasLabelReasonChanges = selectedRule ? !sameLabelReasons(draftLabelReasons, selectedRule.labelReasons ?? {}, draftLabels) : false;
  const hasRuleReviewChanges = hasLabelChanges || hasLabelReasonChanges;
  const selectedReviewReason = draftLabels.length === 1 ? (draftLabelReasons[draftLabels[0]] ?? "").trim() : "";
  const canReviewRule = Boolean(selectedRule && draftLabels.length === 1 && (selectedRule.isPending || hasRuleReviewChanges));
  const reviewedButtonClass = selectedReviewReason
    ? "bg-emerald-600 text-white hover:bg-emerald-700"
    : "bg-amber-500 text-white hover:bg-amber-600";
  const groupedRules = groupRules(rules, groupBy);
  const availableLabels = labels;
  const visibleRuleIds = rules.map((rule) => rule.emailId);
  const allVisibleRulesSelected = visibleRuleIds.length > 0 && visibleRuleIds.every((emailId) => selectedRuleIds.includes(emailId));

  useEffect(() => {
    if (initialPendingFilter) {
      setPendingFilter(initialPendingFilter);
      setPage(1);
    }
  }, [initialPendingFilter]);

  useEffect(() => {
    void loadRuleReviewData();
  }, [page, pageSize, pendingFilter, search]);

  useEffect(() => {
    if (initialEmailId) {
      void loadRuleDetails(initialEmailId);
    }
  }, [initialEmailId]);

  useEffect(() => {
    if (selectedRule && !addRuleStep && !rules.some((rule) => rule.emailId === selectedRule.emailId)) {
      selectRule(null);
    }
  }, [rules, selectedRule, addRuleStep]);

  useEffect(() => {
    if (!selectedRule && addRuleStep !== "search") return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [selectedRule, addRuleStep]);

  async function loadRuleReviewData() {
    setIsLoading(true);
    setError(null);

    try {
      const [rulesResponse, labelsResponse, thresholdResponse, accountsResponse] = await Promise.all([
        fetch(
          `/api/email-rules?page=${page}&pageSize=${pageSize}&status=${pendingFilter}&search=${encodeURIComponent(search)}`,
          { credentials: "include" },
        ),
        fetch("/api/labels", { credentials: "include" }),
        fetch("/api/settings/confidence-threshold", { credentials: "include" }),
        fetch("/api/email-accounts", { credentials: "include" }),
      ]);
      const rulesData = await rulesResponse.json();
      const labelsData = await labelsResponse.json();
      const thresholdData = await thresholdResponse.json();
      const accountsData = await accountsResponse.json();

      if (!rulesResponse.ok) {
        setError(rulesData.error ?? "Could not load email rules.");
        return;
      }

      setRules(rulesData.rules ?? []);
      setTotal(rulesData.total ?? 0);
      setLabels(labelsData.labels ?? []);
      setEmailAccounts(accountsData.accounts ?? []);
      setConfidenceThreshold(Number(thresholdData.threshold ?? 0.9));
      setSelectedRuleIds((current) => current.filter((emailId) => rulesData.rules?.some((rule: EmailRule) => rule.emailId === emailId)));
    } catch {
      setError("Could not load rule review data.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadRuleDetails(emailId: string) {
    setError(null);

    try {
      const response = await fetch(`/api/email-rules/${encodeURIComponent(emailId)}`, { credentials: "include" });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not open rule.");
        return;
      }

      selectRule(data.rule);
    } catch {
      setError("Could not open rule.");
    }
  }

  function selectRule(rule: EmailRule | null) {
    const suggestedLabel = rule ? getSuggestedRuleLabel(rule) : "";
    setSelectedRule(rule);
    setDraftLabels(suggestedLabel ? [suggestedLabel] : []);
    setDraftLabelReasons(rule?.labelReasons ?? {});
    setError(null);
  }

  function toggleDraftLabel(labelName: string) {
    setDraftLabels([labelName]);
    setDraftLabelReasons((reasons) => ({ ...reasons, [labelName]: reasons[labelName] ?? "" }));
  }

  function updateDraftLabelReason(labelName: string, reason: string) {
    setDraftLabelReasons((current) => ({ ...current, [labelName]: reason }));
  }

  function toggleRuleSelection(emailId: string) {
    setSelectedRuleIds((current) =>
      current.includes(emailId) ? current.filter((selectedEmailId) => selectedEmailId !== emailId) : [...current, emailId],
    );
  }

  function toggleAllVisibleRules() {
    setSelectedRuleIds((current) => {
      if (allVisibleRulesSelected) {
        return current.filter((emailId) => !visibleRuleIds.includes(emailId));
      }

      return [...new Set([...current, ...visibleRuleIds])];
    });
  }

  function applyRuleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function clearRuleSearch() {
    setSearchInput("");
    setSearch("");
    setPage(1);
  }

  function openAddRuleModal() {
    setAddRuleStep("search");
    setAddRuleError(null);
    setError(null);
    selectRule(null);
  }

  function closeAddRuleModal() {
    setAddRuleStep(null);
    setAddRuleError(null);
    setIsSearchingEmails(false);
    selectRule(null);
  }

  function goBackToAddRuleSearch() {
    setAddRuleStep("search");
    setError(null);
    selectRule(null);
  }

  async function searchEmailsForRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!addRuleSearchQuery.trim() && !addRuleAccountEmail) {
      setAddRuleError("Enter a subject search or choose an account.");
      return;
    }

    setIsSearchingEmails(true);
    setAddRuleError(null);

    try {
      const response = await fetch("/api/email-rules/email-search", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: addRuleSearchQuery, accountEmail: addRuleAccountEmail }),
      });
      const data = await response.json();

      if (!response.ok) {
        setAddRuleError(data.error ?? "Email search failed.");
        return;
      }

      setAddRuleResults(data.emails ?? []);
      if ((data.emails ?? []).length === 0) {
        setAddRuleError("No emails matched that search.");
      }
    } catch {
      setAddRuleError("Email search failed.");
    } finally {
      setIsSearchingEmails(false);
    }
  }

  function selectEmailForNewRule(email: RuleEmailSearchResult) {
    const now = new Date().toISOString();
    const newRule: EmailRule = {
      id: `new-${email.accountEmail}-${email.emailId}`,
      emailId: email.emailId,
      threadId: email.threadId || email.emailId,
      accountEmail: email.accountEmail,
      fromEmail: email.fromEmail,
      fromName: email.fromName || email.fromEmail,
      subject: email.subject || "(no subject)",
      snippet: email.snippet || "",
      confidence: 0,
      labelsApplied: [],
      labelReasons: {},
      isPending: true,
      createdAt: now,
      updatedAt: now,
    };

    selectRule(newRule);
    setAddRuleStep("review");
  }

  async function saveRuleReview() {
    if (!selectedRule || !canReviewRule) {
      return;
    }

    setIsSaving(true);
    setRuleAction("review");
    setError(null);

    try {
      const isNewRuleReview = addRuleStep === "review" && selectedRule.id.startsWith("new-");
      const response = await fetch(
        isNewRuleReview ? "/api/email-rules/review" : `/api/email-rules/${encodeURIComponent(selectedRule.emailId)}/review`,
        {
        method: isNewRuleReview ? "POST" : "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailId: selectedRule.emailId,
          threadId: selectedRule.threadId,
          fromEmail: selectedRule.fromEmail,
          fromName: selectedRule.fromName,
          subject: selectedRule.subject,
          snippet: selectedRule.snippet,
          labelsApplied: draftLabels,
          labelReasons: pickLabelReasons(draftLabels, draftLabelReasons),
        }),
      },
      );
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not save rule.");
        return;
      }

      setRules((current) => {
        const exists = current.some((rule) => rule.emailId === data.rule.emailId);
        return exists ? current.map((rule) => (rule.emailId === data.rule.emailId ? data.rule : rule)) : [data.rule, ...current];
      });
      if (isNewRuleReview) {
        setTotal((current) => current + 1);
      }
      setAddRuleStep(null);
      selectRule(null);
    } catch {
      setError("Could not save rule.");
    } finally {
      setIsSaving(false);
      setRuleAction(null);
    }
  }

  async function deleteSelectedRule() {
    if (!selectedRule) {
      return;
    }

    setIsSaving(true);
    setRuleAction("delete");
    setError(null);

    try {
      const response = await fetch(`/api/email-rules/${encodeURIComponent(selectedRule.emailId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not delete rule.");
        return;
      }

      setRules((current) => current.filter((rule) => rule.emailId !== selectedRule.emailId));
      setTotal((current) => Math.max(0, current - Number(data.deleted ?? 0)));
      selectRule(null);
    } catch {
      setError("Could not delete rule.");
    } finally {
      setIsSaving(false);
      setRuleAction(null);
    }
  }

  async function deleteSelectedRules() {
    if (selectedRuleIds.length === 0) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/email-rules", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailIds: selectedRuleIds }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not delete selected rules.");
        return;
      }

      const deletedIds = new Set(selectedRuleIds);
      setSelectedRuleIds([]);

      if (selectedRule && deletedIds.has(selectedRule.emailId)) {
        selectRule(null);
      }

      const nextTotal = Math.max(0, total - Number(data.deleted ?? 0));
      const nextTotalPages = Math.max(1, Math.ceil(nextTotal / pageSize));

      if (page > nextTotalPages) {
        setPage(nextTotalPages);
      } else {
        await loadRuleReviewData();
      }
    } catch {
      setError("Could not delete selected rules.");
    } finally {
      setIsSaving(false);
    }
  }

  async function exportRules() {
    setIsExporting(true);
    setError(null);

    try {
      const response = await fetch("/api/email-rules/export", { credentials: "include" });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Could not export email rules.");
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "email-rules.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError("Could not export email rules.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between lg:space-y-0">
          <div className="min-w-0">
            <CardTitle>Rule Review</CardTitle>
            <CardDescription>Review suggested email labeling rules and export the rule table.</CardDescription>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button className="flex-1 sm:flex-none" onClick={openAddRuleModal} type="button">
              <Plus className="h-4 w-4" />
              Add Rule
            </Button>
            <Button className="flex-1 sm:flex-none" disabled={isExporting} onClick={() => void exportRules()} type="button" variant="outline">
              <Download className="h-4 w-4" />
              {isExporting ? "Exporting..." : "Export CSV"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <form className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_160px_170px_220px]" onSubmit={applyRuleSearch}>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-zinc-500">Search</span>
              <div className="flex gap-2">
                <input
                  className="h-10 min-w-0 flex-1 glass-panel rounded-md border px-3 text-sm outline-none transition-colors focus:border-zinc-400"
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search sender, subject, labels..."
                  value={searchInput}
                />
                <Button aria-label="Search rules" size="icon" type="submit" variant="outline">
                  <Search className="h-4 w-4" />
                </Button>
                {search ? (
                  <Button aria-label="Clear search" onClick={clearRuleSearch} size="icon" type="button" variant="outline">
                    <X className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-zinc-500">Rules shown</span>
              <select
                className="h-10 w-full glass-panel rounded-md border px-3 text-sm"
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                value={pageSize}
              >
                {[10, 25, 50].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-zinc-500">Filter</span>
              <select
                className="h-10 w-full glass-panel rounded-md border px-3 text-sm"
                onChange={(event) => {
                  setPendingFilter(event.target.value as RulePendingFilter);
                  setPage(1);
                }}
                value={pendingFilter}
              >
                <option value="all">All rules</option>
                <option value="pending">Pending rules</option>
                <option value="not-pending">Not pending rules</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-zinc-500">Group by</span>
              <select
                className="h-10 w-full glass-panel rounded-md border px-3 text-sm"
                onChange={(event) => setGroupBy(event.target.value as RuleGroupBy)}
                value={groupBy}
              >
                <option value="none">No grouping</option>
                <option value="isPending">Pending status</option>
                <option value="fromEmail">From email</option>
              </select>
            </label>
            <div className="flex items-end justify-between gap-2 lg:col-span-2 2xl:col-span-1">
              <Button className="min-w-0 flex-1 2xl:flex-none" disabled={page <= 1 || isLoading} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button" variant="outline">
                Previous
              </Button>
              <span className="shrink-0 pb-2 text-sm text-zinc-500">
                {page}/{totalPages}
              </span>
              <Button className="min-w-0 flex-1 2xl:flex-none" disabled={page >= totalPages || isLoading} onClick={() => setPage((value) => value + 1)} type="button" variant="outline">
                Next
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5">
        <Card className="min-w-0">
          <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between lg:space-y-0">
            <div className="min-w-0">
              <CardTitle>Email Rules</CardTitle>
              <CardDescription>
                {total} total rules
                {selectedRuleIds.length > 0 ? ` · ${selectedRuleIds.length} selected` : ""}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={rules.length === 0 || isSaving} onClick={toggleAllVisibleRules} type="button" variant="outline">
                {allVisibleRulesSelected ? "Clear selection" : "Select all"}
              </Button>
              <Button
                disabled={selectedRuleIds.length === 0 || isSaving}
                onClick={() => void deleteSelectedRules()}
                type="button"
                variant="outline"
              >
                {isSaving && selectedRuleIds.length > 0 ? <Loader /> : <Trash2 className="h-4 w-4" />}
                Delete selected
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="rounded-md border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
                Loading rules...
              </div>
            ) : rules.length === 0 ? (
              <div className="rounded-md border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
                No rules match this view.
              </div>
            ) : (
              <div className="space-y-4">
                {groupedRules.map((group) => (
                  <div key={group.label}>
                    {groupBy !== "none" ? <p className="mb-2 text-xs font-medium uppercase text-zinc-500">{groupBy === "fromEmail" ? formatEmailForPrivacy(group.label, privacyMode) : group.label}</p> : null}
                    <div className="divide-y divide-zinc-200 overflow-hidden rounded-md border border-zinc-200">
                      {group.rules.map((rule) => {
                        const isRuleSelected = selectedRuleIds.includes(rule.emailId);

                        return (
                        <div
                          className={cn(
                            "grid w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 lg:grid-cols-[32px_minmax(0,1fr)_140px]",
                            selectedRule?.emailId === rule.emailId && "bg-zinc-50",
                            isRuleSelected && "bg-blue-50/50",
                          )}
                          key={rule.emailId}
                        >
                          <input
                            aria-label={`Select rule from ${rule.fromEmail}`}
                            checked={isRuleSelected}
                            className="mt-1 h-4 w-4 cursor-pointer"
                            onChange={() => toggleRuleSelection(rule.emailId)}
                            type="checkbox"
                          />
                          <div className="min-w-0">
                            <button className="block w-full cursor-pointer text-left" onClick={() => selectRule(rule)} type="button">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge className={rule.isPending ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>
                                  {rule.isPending ? "Pending" : "Reviewed"}
                                </Badge>
                                <p className="truncate text-sm font-medium text-zinc-950">{formatEmailForPrivacy(rule.fromEmail, privacyMode)}</p>
                              </div>
                              <p className="mt-1 truncate text-xs text-zinc-500">
                                Account: {formatEmailForPrivacy(rule.accountEmail || "Unknown account", privacyMode)}
                              </p>
                              <p className="mt-1 truncate text-xs text-zinc-500">
                                Created: {formatDate(rule.createdAt)}
                              </p>
                              <p className="mt-2 line-clamp-2 text-sm leading-5 text-zinc-600">
                                {formatRuleLabelReasons(rule)}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-1">
                                {rule.labelsApplied.map((label) => (
                                  <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600" key={label}>
                                    {label}
                                  </span>
                                ))}
                              </div>
                            </button>
                          </div>
                          <div className="flex items-start justify-start lg:justify-end">
                            <span className={cn("rounded px-2 py-1 text-sm font-semibold", confidenceClass(rule.confidence, confidenceThreshold))}>
                              {Math.round(rule.confidence * 100)}% <span className="text-xs font-medium">confident</span>
                            </span>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {addRuleStep === "search" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 p-4">
          <Card className="min-h-[720px] max-h-[92vh] w-full max-w-5xl min-w-0 overflow-hidden rounded-2xl border-white/70 bg-white/55 p-4 shadow-2xl shadow-slate-900/20 [backdrop-filter:blur(5px)] [-webkit-backdrop-filter:blur(5px)]">
            <div className="max-h-[calc(92vh-2rem)] overflow-hidden rounded-xl bg-white/40 shadow-inner ring-1 ring-white/60">
              <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
                <div className="min-w-0">
                  <CardTitle>Add Rule</CardTitle>
                  <CardDescription>Search connected email accounts and choose an email to review.</CardDescription>
                </div>
                <Button aria-label="Close add rule" onClick={closeAddRuleModal} size="icon" type="button" variant="outline">
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>
            <CardContent className="max-h-[calc(92vh-128px)] overflow-y-auto overflow-x-hidden p-5">
              <StepProgress currentStep={1} steps={["Search", "Review"]} />
              <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px_auto]" onSubmit={searchEmailsForRule}>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase text-zinc-500">Subject search</span>
                  <input
                    className="h-10 w-full glass-panel rounded-md border px-3 text-sm outline-none transition-colors focus:border-zinc-400"
                    onChange={(event) => setAddRuleSearchQuery(event.target.value)}
                    placeholder="Search by subject"
                    value={addRuleSearchQuery}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase text-zinc-500">Account</span>
                  <select
                    className="h-10 w-full glass-panel rounded-md border px-3 text-sm"
                    onChange={(event) => setAddRuleAccountEmail(event.target.value)}
                    value={addRuleAccountEmail}
                  >
                    <option value="">All accounts</option>
                    {emailAccounts.map((account) => (
                      <option key={account.id} value={account.email}>
                        {formatEmailForPrivacy(account.email, privacyMode)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end">
                  <Button className="w-full" disabled={isSearchingEmails} type="submit">
                    {isSearchingEmails ? <Loader /> : <Search className="h-4 w-4" />}
                    Search
                  </Button>
                </div>
              </form>

              {addRuleError ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{addRuleError}</p> : null}

              <div className="mt-5 divide-y divide-zinc-200 overflow-hidden rounded-md border border-zinc-200">
                {isSearchingEmails ? (
                  <div className="p-8 text-center text-sm text-zinc-500">Searching emails...</div>
                ) : addRuleResults.length === 0 ? (
                  <div className="p-8 text-center text-sm text-zinc-500">Search results will appear here.</div>
                ) : (
                  addRuleResults.map((email) => (
                    <button
                      className="block w-full cursor-pointer px-4 py-3 text-left transition-colors hover:bg-zinc-50"
                      key={`${email.accountEmail}-${email.emailId}`}
                      onClick={() => selectEmailForNewRule(email)}
                      type="button"
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
                        <span className="min-w-0 max-w-full truncate">To: {formatEmailTextForPrivacy(email.to || "Unknown", privacyMode)}</span>
                        <span className="min-w-0 max-w-full truncate">From: {formatEmailForPrivacy(email.fromEmail || "Unknown", privacyMode)}</span>
                        <span className="min-w-0 max-w-full truncate">Account: {formatEmailForPrivacy(email.accountEmail, privacyMode)}</span>
                      </div>
                      <p className="mt-2 truncate text-sm font-medium text-zinc-950">{email.subject || "(no subject)"}</p>
                      <p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-600">{email.snippet || "No snippet available."}</p>
                    </button>
                  ))
                )}
              </div>
              </CardContent>
            </div>
          </Card>
        </div>
        ) : null}

        {selectedRule ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 p-4">
        <Card className="flex max-h-[92vh] w-full max-w-5xl min-w-0 overflow-hidden rounded-2xl border-white/70 bg-white/55 p-4 shadow-2xl shadow-slate-900/20 [backdrop-filter:blur(5px)] [-webkit-backdrop-filter:blur(5px)]">
          <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl bg-white/40 shadow-inner ring-1 ring-white/60">
            <CardHeader className="shrink-0 gap-3 border-b border-white/60 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{addRuleStep === "review" ? "Create Rule" : "Edit Rule"}</CardTitle>
                  {addRuleStep === "review" ? null : (
                    <Badge className={selectedRule.isPending ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>
                      {selectedRule.isPending ? "Pending" : "Reviewed"}
                    </Badge>
                  )}
                </div>
                <CardDescription>Choose the single best label for this email.</CardDescription>
              </div>
              <Button aria-label="Close rule details" className="shrink-0 bg-transparent shadow-none hover:bg-white/40" onClick={() => (addRuleStep === "review" ? closeAddRuleModal() : selectRule(null))} size="icon" type="button" variant="ghost">
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-5">
              {addRuleStep === "review" ? <StepProgress currentStep={2} steps={["Search", "Review"]} /> : null}
              <div className="space-y-5">
                <div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-950">{selectedRule.fromName}</p>
                      <p className="truncate text-sm text-zinc-500">{formatEmailForPrivacy(selectedRule.fromEmail, privacyMode)}</p>
                      <p className="truncate text-xs text-zinc-500">Account: {formatEmailForPrivacy(selectedRule.accountEmail || "Unknown account", privacyMode)}</p>
                      <p className="truncate text-xs text-zinc-500">Created: {formatDate(selectedRule.createdAt)}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm font-medium text-zinc-950">{selectedRule.subject}</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">{selectedRule.snippet}</p>
                </div>

                <div className="min-w-0">
                  <p className="mb-2 text-xs font-medium uppercase text-zinc-500">Available labels</p>
                  {draftLabels.length > 1 ? (
                    <p className="mb-2 text-xs text-red-600">Choose one label before reviewing this rule.</p>
                  ) : null}
                  <RuleLabelSelectionRows
                    confidenceThreshold={confidenceThreshold.toFixed(2)}
                    labels={availableLabels}
                    onToggle={toggleDraftLabel}
                    selectedLabels={draftLabels}
                    suggestedLabel={selectedRule.isPending ? getSuggestedRuleLabel(selectedRule) : undefined}
                  />
                </div>

                {draftLabels.length === 1 ? (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium uppercase text-zinc-500">When to use {draftLabels[0]}</span>
                    <textarea
                      className="min-h-28 w-full glass-panel rounded-md border px-3 py-2 text-sm outline-none transition-colors focus:border-zinc-400"
                      maxLength={200}
                      onChange={(event) => updateDraftLabelReason(draftLabels[0], event.target.value)}
                      placeholder="Explain when the AI should choose this label."
                      value={draftLabelReasons[draftLabels[0]] ?? ""}
                    />
                    <span className="mt-1 block text-right text-xs text-zinc-500">
                      {(draftLabelReasons[draftLabels[0]] ?? "").length}/200
                    </span>
                  </label>
                ) : null}

              </div>
            </CardContent>
            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-white/60 bg-white/25 p-5">
              {addRuleStep === "review" ? (
                <Button disabled={isSaving} onClick={goBackToAddRuleSearch} type="button" variant="outline">
                  Previous
                </Button>
              ) : null}
              <Button disabled={isSaving} onClick={() => (addRuleStep === "review" ? closeAddRuleModal() : selectRule(null))} type="button" variant="outline">
                Cancel
              </Button>
              {addRuleStep === "review" ? null : (
              <Button disabled={isSaving} onClick={() => void deleteSelectedRule()} type="button" variant="outline">
                {ruleAction === "delete" ? <Loader /> : <Trash2 className="h-4 w-4" />}
                {ruleAction === "delete" ? "Deleting..." : "Delete"}
              </Button>
              )}
              <Tooltip align="end" text={selectedReviewReason ? "Mark this rule reviewed and apply the selected label." : "A reason helps the AI make better future choices, but you can still review this rule."}>
                <span>
                  <Button className={cn(canReviewRule && reviewedButtonClass)} disabled={isSaving || !canReviewRule} onClick={() => void saveRuleReview()} type="button">
                    {ruleAction === "review" ? <Loader /> : <Save className="h-4 w-4" />}
                    {ruleAction === "review" ? "Reviewing..." : "Reviewed"}
                  </Button>
                </span>
              </Tooltip>
            </div>
          </div>
        </Card>
        </div>
        ) : null}
      </div>
    </div>
  );
}

function AiPromptsPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Artificial Intelligence</CardTitle>
          <CardDescription>Configure Emailable's AI providers and prompt templates.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-zinc-200 rounded-md border border-zinc-200">
            <button
              className="flex w-full cursor-pointer items-center justify-between gap-4 px-4 py-4 text-left hover:bg-zinc-50"
              onClick={() => onNavigate("ai-byoai")}
              type="button"
            >
              <div>
                <p className="text-sm font-medium text-zinc-950">BYOAI</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Add AI platforms and enable Emailable-managed labeling and reply drafting.
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-zinc-400" />
            </button>
            <button
              className="flex w-full cursor-pointer items-center justify-between gap-4 px-4 py-4 text-left hover:bg-zinc-50"
              onClick={() => onNavigate("ai-prompt-library")}
              type="button"
            >
              <div>
                <p className="text-sm font-medium text-zinc-950">Prompts</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Build the Email Label and Draft Reply prompts used by AI endpoints.
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-zinc-400" />
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AiPromptLibraryPage({ privacyMode }: { privacyMode: boolean }) {
  const [activePromptTab, setActivePromptTab] = useState<"email-label" | "draft-reply">(() => promptTabFromPath(window.location.pathname));

  useEffect(() => {
    function handlePopState() {
      setActivePromptTab(promptTabFromPath(window.location.pathname));
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function selectPromptTab(tab: "email-label" | "draft-reply") {
    setActivePromptTab(tab);
    const nextPath = tab === "draft-reply" ? "/ai/prompts/draft-reply" : "/ai/prompts/email-label";
    if (stripRuntimeBasePath(window.location.pathname) !== nextPath) {
      window.history.pushState({}, "", getRuntimeUrl(nextPath));
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="inline-flex rounded-lg border border-zinc-200 bg-white/70 p-1">
            <button
              className={cn(
                "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                activePromptTab === "email-label" ? "bg-zinc-950 text-white shadow-sm" : "text-zinc-600 hover:bg-white",
              )}
              onClick={() => selectPromptTab("email-label")}
              type="button"
            >
              Email Label
            </button>
            <button
              className={cn(
                "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                activePromptTab === "draft-reply" ? "bg-zinc-950 text-white shadow-sm" : "text-zinc-600 hover:bg-white",
              )}
              onClick={() => selectPromptTab("draft-reply")}
              type="button"
            >
              Reply Draft
            </button>
          </div>
        </CardContent>
      </Card>
      {activePromptTab === "email-label" ? (
        <AiPromptEditorPage promptKey="email-label" />
      ) : (
        <AiPromptEditorPage promptKey="draft-reply" privacyMode={privacyMode} />
      )}
    </div>
  );
}

function ByoAiPage() {
  const [providers, setProviders] = useState<Record<string, AiProviderDefinition>>({});
  const [platforms, setPlatforms] = useState<AiPlatformDraft[]>([]);
  const [platformModal, setPlatformModal] = useState<AiPlatformDraft | null>(null);
  const [platformMenuId, setPlatformMenuId] = useState<string | null>(null);
  const [platformDeleteTarget, setPlatformDeleteTarget] = useState<AiPlatformDraft | null>(null);
  const [mcpClients, setMcpClients] = useState<AiMcpClientConfig[]>([]);
  const [mcpModal, setMcpModal] = useState<AiMcpClientConfig | null>(null);
  const [mcpModalBearerToken, setMcpModalBearerToken] = useState("");
  const [mcpMenuId, setMcpMenuId] = useState<string | null>(null);
  const [mcpDeleteTarget, setMcpDeleteTarget] = useState<AiMcpClientConfig | null>(null);
  const [mcpClient, setMcpClient] = useState<AiMcpClientConfig>({
    serverUrl: "",
    enabled: false,
    status: "untested",
    lastError: "",
    tools: [],
    selectedTools: [],
    hasBearerToken: false,
  });
  const [mcpForm, setMcpForm] = useState({ serverUrl: "", bearerToken: "" });
  const [aiEnabled, setAiEnabled] = useState(false);
  const [canEnableAi, setCanEnableAi] = useState(false);
  const [mcpClientEnabled, setMcpClientEnabled] = useState(false);
  const [canEnableMcpClient, setCanEnableMcpClient] = useState(false);
  const [showMcpClientActivationConfirm, setShowMcpClientActivationConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isTogglingAi, setIsTogglingAi] = useState(false);
  const [isSavingMcp, setIsSavingMcp] = useState(false);
  const [isTogglingMcp, setIsTogglingMcp] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [pageError, setPageError] = useState<string | null>(null);
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [mcpMessage, setMcpMessage] = useState<string | null>(null);
  const [mcpModalError, setMcpModalError] = useState<string | null>(null);
  const [mcpModalMessage, setMcpModalMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "warning"; message: string } | null>(null);
  const hasConnectedPlatform = platforms.some((platform) => platform.status === "connected");
  const mcpSectionDisabled = !hasConnectedPlatform;
  const canActivateMcpClient = aiEnabled && hasConnectedPlatform && canEnableMcpClient;
  const externalMcpClientCount = mcpClients.filter((client) => !client.isSystem).length;

  useEffect(() => {
    void loadByoAiConfig();
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!platformMenuId && !mcpMenuId) {
      return;
    }

    function closeOpenMenus(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-row-menu-root]")) {
        return;
      }
      setPlatformMenuId(null);
      setMcpMenuId(null);
    }

    document.addEventListener("click", closeOpenMenus);
    return () => document.removeEventListener("click", closeOpenMenus);
  }, [platformMenuId, mcpMenuId]);

  async function loadByoAiConfig() {
    setIsLoading(true);
    setPageError(null);

    try {
      const response = await fetch("/api/byoai/config", { credentials: "include" });
      const data = await response.json();

      if (!response.ok) {
        setPageError(data.error ?? "Could not load AI configuration.");
        return;
      }

      applyByoAiConfig(data);
    } catch {
      setPageError("Could not load AI configuration.");
    } finally {
      setIsLoading(false);
    }
  }

  function applyByoAiConfig(config: ByoAiConfig) {
    setProviders(config.providers ?? {});
    setPlatforms((config.platforms ?? []).map(toEditableAiPlatform));
    setAiEnabled(Boolean(config.aiEnabled));
    setCanEnableAi(Boolean(config.canEnableAi));
    setMcpClientEnabled(Boolean(config.mcpClientEnabled));
    setCanEnableMcpClient(Boolean(config.canEnableMcpClient));
    setMcpClients(ensureSystemMcpClient(config.mcpClients ?? (config.mcpClient?.serverUrl ? [config.mcpClient] : [])));
    setMcpClient(config.mcpClient ?? {
      serverUrl: "",
      enabled: false,
      status: "untested",
      lastError: "",
      tools: [],
      selectedTools: [],
      hasBearerToken: false,
    });
    setMcpForm({
      serverUrl: config.mcpClient?.serverUrl ?? "",
      bearerToken: "",
    });
  }

  function addPlatform() {
    const firstProvider = Object.keys(providers)[0] ?? "openai";
    const definition = providers[firstProvider];
    const draft: AiPlatformDraft = {
      id: `draft-${Date.now()}`,
      provider: firstProvider,
      name: "",
      providerLabel: definition?.label ?? "ChatGPT",
      model: definition?.defaultModel ?? "",
      baseUrl: firstProvider === "ollama" ? "http://localhost:11434" : "",
      sortOrder: platforms.length,
      status: "untested",
      lastError: "",
      apiKey: "",
      bearerToken: "",
      isDraft: true,
    };
    setPlatformModal(draft);
  }

  function updatePlatform(id: string, updates: Partial<AiPlatformDraft>) {
    setErrors((current) => ({ ...current, [id]: "" }));
    setMessages((current) => ({ ...current, [id]: "" }));
    setPlatforms((current) =>
      current.map((platform) => {
        if (platform.id !== id) {
          return platform;
        }

        const provider = updates.provider ?? platform.provider;
        const definition = providers[provider];
        const providerChanged = updates.provider && updates.provider !== platform.provider;

        return {
          ...platform,
          ...updates,
          provider,
          providerLabel: definition?.label ?? platform.providerLabel,
          model: providerChanged ? definition?.defaultModel ?? "" : updates.model ?? platform.model,
          baseUrl: providerChanged && provider === "ollama" ? "http://localhost:11434" : updates.baseUrl ?? platform.baseUrl,
        };
      }),
    );
  }

  function updatePlatformModal(updates: Partial<AiPlatformDraft>) {
    setErrors((current) => (platformModal ? { ...current, [platformModal.id]: "" } : current));
    setMessages((current) => (platformModal ? { ...current, [platformModal.id]: "" } : current));
    setPlatformModal((platform) => {
      if (!platform) {
        return platform;
      }

      const provider = updates.provider ?? platform.provider;
      const definition = providers[provider];
      const providerChanged = updates.provider && updates.provider !== platform.provider;

      return {
        ...platform,
        ...updates,
        provider,
        providerLabel: definition?.label ?? platform.providerLabel,
        model: providerChanged ? definition?.defaultModel ?? "" : updates.model ?? platform.model,
        baseUrl: providerChanged && provider === "ollama" ? "http://localhost:11434" : updates.baseUrl ?? platform.baseUrl,
      };
    });
  }

  async function savePlatform(platform: AiPlatformDraft) {
    setSavingId(platform.id);
    setErrors((current) => ({ ...current, [platform.id]: "" }));
    setMessages((current) => ({ ...current, [platform.id]: "" }));

    try {
      const encryptedSecrets = await encryptByoAiSecrets({
        apiKey: platform.apiKey,
        bearerToken: platform.bearerToken,
      });
      const response = await fetch(platform.isDraft ? "/api/byoai/platforms" : `/api/byoai/platforms/${platform.id}`, {
        method: platform.isDraft ? "POST" : "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: platform.name ?? "",
          provider: platform.provider,
          model: platform.model,
          encryptedApiKey: encryptedSecrets.apiKey,
          baseUrl: platform.baseUrl,
          encryptedBearerToken: encryptedSecrets.bearerToken,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setErrors((current) => ({ ...current, [platform.id]: data.error ?? "AI platform connection failed." }));
        return;
      }

      const savedId = data.platform?.id ?? platform.id;
      await loadByoAiConfig();
      setMessages((current) => ({ ...current, [savedId]: data.message ?? "AI platform saved." }));
      setPlatformModal(null);
    } catch {
      setErrors((current) => ({ ...current, [platform.id]: "Could not test this AI platform." }));
    } finally {
      setSavingId(null);
    }
  }

  async function deletePlatform(platform: AiPlatformDraft) {
    if (platform.isDraft) {
      setPlatformModal(null);
      return;
    }

    setSavingId(platform.id);
    setErrors((current) => ({ ...current, [platform.id]: "" }));

    try {
      const response = await fetch(`/api/byoai/platforms/${platform.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok) {
        setErrors((current) => ({ ...current, [platform.id]: data.error ?? "Could not delete this AI platform." }));
        return;
      }

      setPlatforms((data.platforms ?? []).map(toEditableAiPlatform));
      setAiEnabled(Boolean(data.aiEnabled));
      setCanEnableAi((data.platforms ?? []).some((entry: AiPlatform) => entry.status === "connected"));
    } catch {
      setErrors((current) => ({ ...current, [platform.id]: "Could not delete this AI platform." }));
    } finally {
      setSavingId(null);
    }
  }

  function openEditPlatform(platform: AiPlatformDraft) {
    setPlatformMenuId(null);
    setPlatformModal({ ...platform, apiKey: "", bearerToken: "", isDraft: false });
  }

  async function movePlatform(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= platforms.length) {
      return;
    }

    const reordered = [...platforms];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    setPlatforms(reordered);

    if (reordered.some((platform) => platform.isDraft)) {
      return;
    }

    try {
      const response = await fetch("/api/byoai/platforms/order", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reordered.map((platform) => platform.id) }),
      });
      const data = await response.json();
      if (response.ok) {
        setPlatforms((data.platforms ?? []).map(toEditableAiPlatform));
      }
    } catch {
      setPageError("Could not update AI platform order.");
    }
  }

  async function toggleAiEnabled(enabled: boolean) {
    setIsTogglingAi(true);
    setPageError(null);

    try {
      const response = await fetch("/api/byoai/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiEnabled: enabled }),
      });
      const data = await response.json();

      if (!response.ok) {
        setPageError(data.error ?? "Could not update AI setting.");
        return;
      }

      setAiEnabled(Boolean(data.aiEnabled));
      if (!data.aiEnabled) {
        setMcpClientEnabled(false);
      }
      setToast({
        tone: data.aiEnabled ? "success" : "warning",
        message: data.aiEnabled ? "AI is active." : "AI was turned off.",
      });
    } catch {
      setPageError("Could not update AI setting.");
    } finally {
      setIsTogglingAi(false);
    }
  }

  async function updateMcpClientActivation(enabled: boolean) {
    setIsTogglingMcp(true);
    setPageError(null);

    try {
      const response = await fetch("/api/byoai/mcp-client/activation", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await response.json();

      if (!response.ok) {
        setPageError(data.error ?? "Could not update MCP Client activation.");
        return;
      }

      setMcpClientEnabled(Boolean(data.mcpClientEnabled));
      setToast({
        tone: data.mcpClientEnabled ? "success" : "warning",
        message: data.mcpClientEnabled ? "MCP Client is active. MCP Server keys were revoked." : "MCP Client was deactivated.",
      });
    } catch {
      setPageError("Could not update MCP Client activation.");
    } finally {
      setIsTogglingMcp(false);
      setShowMcpClientActivationConfirm(false);
    }
  }

  async function saveMcpClient() {
    setIsSavingMcp(true);
    setMcpError(null);
    setMcpMessage(null);

    try {
      const encryptedSecrets = await encryptByoAiSecrets({ bearerToken: mcpForm.bearerToken });
      const response = await fetch("/api/byoai/mcp-client", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverUrl: mcpForm.serverUrl,
          encryptedBearerToken: encryptedSecrets.bearerToken,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMcpError(data.error ?? "Could not connect to the MCP server.");
        return;
      }

      setMcpClient(data.mcpClient);
      setMcpForm((current) => ({ ...current, bearerToken: "" }));
      setMcpMessage(data.message ?? "MCP server tools loaded.");
      setToast({ tone: "success", message: "MCP server tools loaded." });
    } catch {
      setMcpError("Could not connect to the MCP server.");
    } finally {
      setIsSavingMcp(false);
    }
  }

  async function updateMcpClientSettings(next: Partial<Pick<AiMcpClientConfig, "enabled" | "selectedTools">>) {
    setIsTogglingMcp(true);
    setMcpError(null);
    setMcpMessage(null);

    try {
      const response = await fetch("/api/byoai/mcp-client/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: next.enabled ?? mcpClient.enabled,
          selectedTools: next.selectedTools ?? mcpClient.selectedTools,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMcpError(data.error ?? "Could not update MCP client settings.");
        return;
      }

      setMcpClient(data.mcpClient);
      setMcpMessage("MCP client settings saved.");
    } catch {
      setMcpError("Could not update MCP client settings.");
    } finally {
      setIsTogglingMcp(false);
    }
  }

  function toggleMcpTool(name: string) {
    const selectedTools = mcpClient.selectedTools.includes(name)
      ? mcpClient.selectedTools.filter((toolName) => toolName !== name)
      : [...mcpClient.selectedTools, name];
    void updateMcpClientSettings({ selectedTools });
  }

  function openAddMcpServer() {
    setMcpModal({
      id: `draft-${Date.now()}`,
      name: "",
      serverUrl: "",
      authType: "none",
      enabled: true,
      status: "untested",
      lastError: "",
      tools: [],
      selectedTools: [],
      hasBearerToken: false,
    });
    setMcpModalBearerToken("");
    setMcpModalError(null);
    setMcpModalMessage(null);
  }

  function openEditMcpServer(client: AiMcpClientConfig) {
    setMcpMenuId(null);
    setMcpModal({ ...client, authType: client.authType ?? "none" });
    setMcpModalBearerToken("");
    setMcpModalError(null);
    setMcpModalMessage(null);
  }

  function updateMcpModal(updates: Partial<AiMcpClientConfig>) {
    setMcpModal((client) => (client ? { ...client, ...updates } : client));
    setMcpModalError(null);
    setMcpModalMessage(null);
  }

  async function testMcpServer() {
    if (!mcpModal) {
      return;
    }

    setIsSavingMcp(true);
    setMcpModalError(null);
    setMcpModalMessage(null);

    try {
      const encryptedSecrets = await encryptByoAiSecrets({ bearerToken: mcpModalBearerToken });
      const response = await fetch("/api/byoai/mcp-clients/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: mcpModal.id?.startsWith("draft-") ? undefined : mcpModal.id,
          name: mcpModal.name ?? "",
          serverUrl: mcpModal.serverUrl,
          authType: mcpModal.authType ?? "none",
          encryptedBearerToken: encryptedSecrets.bearerToken,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMcpModalError(data.error ?? "Could not connect to the MCP server.");
        setMcpModal((client) =>
          client
            ? {
                ...client,
                status: "failed",
                lastError: data.error ?? "Connection failed.",
              }
            : client,
        );
        return;
      }

      setMcpModal((client) =>
        client
          ? {
              ...client,
              status: "connected",
              lastError: "",
              tools: data.tools ?? [],
              selectedTools: client.selectedTools.filter((name) => (data.tools ?? []).some((tool: AiMcpTool) => tool.name === name)),
            }
          : client,
      );
      setMcpModalMessage(data.message ?? "MCP server connection tested successfully.");
    } catch {
      setMcpModalError("Could not connect to the MCP server.");
      setMcpModal((client) =>
        client
          ? {
              ...client,
              status: "failed",
              lastError: "Connection failed.",
            }
          : client,
      );
    } finally {
      setIsSavingMcp(false);
    }
  }

  async function saveMcpServer() {
    if (!mcpModal) {
      return;
    }

    setIsSavingMcp(true);
    setMcpModalError(null);
    setMcpModalMessage(null);

    try {
      const encryptedSecrets = await encryptByoAiSecrets({ bearerToken: mcpModalBearerToken });
      if (mcpModal.isSystem) {
        const response = await fetch("/api/byoai/mcp-clients/system", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedTools: mcpModal.selectedTools }),
        });
        const data = await response.json();

        if (!response.ok) {
          setMcpModalError(data.error ?? "Could not save system MCP tools.");
          return;
        }

        const nextClients = ensureSystemMcpClient(data.mcpClients ?? []);
        setMcpClients(nextClients);
        setMcpClient(data.mcpClient ?? (nextClients.length ? nextClients[0] : mcpClient));
        setMcpModal(null);
        setToast({ tone: "success", message: "System MCP tools saved." });
        return;
      }

      const isDraft = !mcpModal.id || mcpModal.id.startsWith("draft-");
      const response = await fetch(isDraft ? "/api/byoai/mcp-clients" : `/api/byoai/mcp-clients/${mcpModal.id}`, {
        method: isDraft ? "POST" : "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: mcpModal.name ?? "",
          serverUrl: mcpModal.serverUrl,
          authType: mcpModal.authType ?? "none",
          encryptedBearerToken: encryptedSecrets.bearerToken,
          enabled: true,
          selectedTools: mcpModal.selectedTools,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMcpModalError(data.error ?? "Could not save this MCP server.");
        return;
      }

      const nextClients = ensureSystemMcpClient(data.mcpClients ?? []);
      setMcpClients(nextClients);
      setMcpClient(data.mcpClient ?? (nextClients.length ? nextClients[0] : mcpClient));
      setMcpModal(null);
      setMcpModalBearerToken("");
      setToast({ tone: "success", message: "MCP server saved." });
    } catch {
      setMcpModalError("Could not save this MCP server.");
    } finally {
      setIsSavingMcp(false);
    }
  }

  async function deleteMcpServer(client: AiMcpClientConfig) {
    if (client.isSystem) {
      return;
    }

    if (!client.id || client.id.startsWith("draft-")) {
      setMcpDeleteTarget(null);
      setMcpModal(null);
      return;
    }

    setIsSavingMcp(true);
    setMcpModalError(null);

    try {
      const response = await fetch(`/api/byoai/mcp-clients/${client.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok) {
        setMcpModalError(data.error ?? "Could not delete this MCP server.");
        return;
      }

      const nextClients = ensureSystemMcpClient(data.mcpClients ?? []);
      setMcpClients(nextClients);
      setMcpClient(nextClients.length ? nextClients[0] : {
        serverUrl: "",
        enabled: false,
        status: "untested",
        lastError: "",
        tools: [],
        selectedTools: [],
        hasBearerToken: false,
      });
      setMcpDeleteTarget(null);
      setMcpModal(null);
      setToast({ tone: "warning", message: "MCP server deleted." });
    } catch {
      setMcpModalError("Could not delete this MCP server.");
    } finally {
      setIsSavingMcp(false);
    }
  }

  function toggleMcpModalTool(name: string) {
    setMcpModal((client) => {
      if (!client) {
        return client;
      }
      const selectedTools = client.selectedTools.includes(name)
        ? client.selectedTools.filter((toolName) => toolName !== name)
        : [...client.selectedTools, name];
      return { ...client, selectedTools };
    });
  }

  return (
    <div className="space-y-6">
      {toast ? (
        <div
          className={cn(
            "fixed right-5 top-5 z-50 rounded-md border px-4 py-3 text-sm shadow-lg",
            toast.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800",
          )}
        >
          {toast.message}
        </div>
      ) : null}
      <Card className={cn(aiEnabled && "border-emerald-300 shadow-[0_0_28px_rgba(16,185,129,0.28)] ring-1 ring-emerald-200")}>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Bring your own artificial intelligence (BYOAI)</CardTitle>
            <CardDescription>
              Add your own API keys to let Emailable handle the AI logic for choosing labels and drafting replies.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <AiEnableSwitch
              canEnable={canEnableAi}
              disabled={isLoading || isTogglingAi}
              enabled={aiEnabled}
              label="Activate"
              onChange={(value) => void toggleAiEnabled(value)}
            />
            <Button disabled={isLoading || platforms.length >= 3} onClick={addPlatform} type="button">
              <Plus className="h-4 w-4" />
              Add AI Platform
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {pageError ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{pageError}</p> : null}

          <p className="text-sm text-zinc-600">{platforms.length}/3 platforms configured</p>

          {isLoading ? (
            <p className="rounded-md border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500">
              Loading AI platforms...
            </p>
          ) : platforms.length === 0 ? (
            <p className="rounded-md border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500">
              No AI platforms yet.
            </p>
          ) : (
            <div className="overflow-visible rounded-md border border-zinc-200">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="w-16 px-4 py-3">Order</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Platform</th>
                    <th className="px-4 py-3">Model</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="w-12 px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {platforms.map((platform, index) => (
                    <tr key={platform.id}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-zinc-400">
                          <GripVertical className="h-4 w-4" />
                          <Button disabled={index === 0 || Boolean(savingId)} onClick={() => void movePlatform(index, -1)} size="icon" type="button" variant="ghost">
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button disabled={index === platforms.length - 1 || Boolean(savingId)} onClick={() => void movePlatform(index, 1)} size="icon" type="button" variant="ghost">
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-zinc-950">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{platform.name || platform.providerLabel}</span>
                          {index === 0 ? <Badge className="bg-emerald-50 text-emerald-700">Default</Badge> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-600">{platform.providerLabel}</td>
                      <td className="px-4 py-3 text-zinc-600">{platform.model || "Not set"}</td>
                      <td className="px-4 py-3">
                        {platform.status === "connected" ? (
                          <ConnectedActivationBadge
                            active={aiEnabled}
                            inactiveTooltip="This AI platform is connected, but Emailable will not use it until Activate is turned on."
                          />
                        ) : platform.status === "failed" ? (
                          <Badge className="bg-red-50 text-red-700">Failed</Badge>
                        ) : (
                          <Badge className="bg-zinc-100 text-zinc-600">Untested</Badge>
                        )}
                      </td>
                      <td className="relative px-4 py-3 text-right" data-row-menu-root onClick={(event) => event.stopPropagation()}>
                        <button
                          aria-label="AI platform options"
                          className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-md hover:bg-zinc-100"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setPlatformMenuId((current) => (current === platform.id ? null : platform.id));
                          }}
                          type="button"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                        {platformMenuId === platform.id ? (
                          <div className="absolute bottom-11 right-4 z-[70] w-36 rounded-md border border-zinc-200 bg-white p-1 text-sm shadow-lg" onMouseDown={(event) => event.stopPropagation()}>
                            <button className="flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-zinc-50" onClick={() => openEditPlatform(platform)} type="button">
                              <Pencil className="h-4 w-4" />
                              Edit
                            </button>
                            <button className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-red-600 hover:bg-red-50" onClick={() => { setPlatformMenuId(null); setPlatformDeleteTarget(platform); }} type="button">
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={cn(mcpSectionDisabled && "opacity-60")}>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>MCP Client</CardTitle>
            <CardDescription>
              Connect this account to an external MCP server. Selected tools are exposed as references to the AI prompts used by Emailable.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <AiEnableSwitch
              canEnable={canActivateMcpClient}
              disabled={isTogglingMcp}
              enabled={mcpClientEnabled}
              label="Activate"
              onChange={(enabled) => {
                if (enabled) {
                  setShowMcpClientActivationConfirm(true);
                } else {
                  void updateMcpClientActivation(false);
                }
              }}
            />
            <Button disabled={mcpSectionDisabled || externalMcpClientCount >= 5} onClick={openAddMcpServer} type="button">
              <Plus className="h-4 w-4" />
              Add MCP Server
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {mcpSectionDisabled ? (
            <p className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
              Add and save at least one working AI platform before configuring MCP client tools.
            </p>
          ) : null}
          {mcpClients.length === 0 ? (
            <p className="rounded-md border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500">
              No MCP servers yet.
            </p>
          ) : (
            <div className="overflow-visible rounded-md border border-zinc-200">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">URL</th>
                    <th className="px-4 py-3">Selected tools</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="w-12 px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {mcpClients.map((client, index) => (
                    <tr key={client.id ?? client.serverUrl}>
                      <td className="px-4 py-3 font-medium text-zinc-950">{client.name || `MCP Server ${index + 1}`}</td>
                      <td className="max-w-[420px] truncate px-4 py-3 text-zinc-600">{client.serverUrl}</td>
                      <td className="px-4 py-3 text-zinc-600">
                        {client.selectedTools.length}
                        {client.isSystem ? `/${client.tools.length}` : null}
                      </td>
                      <td className="px-4 py-3">
                        {client.status === "connected" ? (
                          <ConnectedActivationBadge
                            active={mcpClientEnabled}
                            inactiveTooltip="This server is connected, but Emailable will not use any tools until MCP Client is activated."
                          />
                        ) : client.status === "failed" ? (
                          <Badge className="bg-red-50 text-red-700">Failed</Badge>
                        ) : (
                          <Badge className="bg-zinc-100 text-zinc-600">Untested</Badge>
                        )}
                      </td>
                      <td className="relative px-4 py-3 text-right" data-row-menu-root onClick={(event) => event.stopPropagation()}>
                        <button
                          aria-label="MCP server options"
                          className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-md hover:bg-zinc-100"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setMcpMenuId((current) => (current === client.id ? null : client.id ?? null));
                          }}
                          type="button"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                        {client.id && mcpMenuId === client.id ? (
                          <div
                            className="absolute bottom-11 right-4 z-[70] w-36 rounded-md border border-zinc-200 bg-white p-1 text-sm shadow-lg"
                            onMouseDown={(event) => event.stopPropagation()}
                          >
                            <button className="flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-zinc-50" onClick={() => openEditMcpServer(client)} type="button">
                              <Pencil className="h-4 w-4" />
                              {client.isSystem ? "Select tools" : "Edit"}
                            </button>
                            {!client.isSystem ? (
                              <button className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-red-600 hover:bg-red-50" onClick={() => { setMcpMenuId(null); setMcpDeleteTarget(client); }} type="button">
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      {platformModal ? (
        <AiPlatformModal
          errors={errors}
          isSaving={savingId === platformModal.id}
          messages={messages}
          onCancel={() => setPlatformModal(null)}
          onChange={updatePlatformModal}
          onDelete={() => setPlatformDeleteTarget(platformModal)}
          onSave={() => void savePlatform(platformModal)}
          platform={platformModal}
          providers={providers}
        />
      ) : null}
      {platformDeleteTarget ? (
        <ConfirmModal
          body="This AI platform will be deleted. If it is the default, the next platform becomes the default."
          confirmLabel="Delete"
          isBusy={savingId === platformDeleteTarget.id}
          onCancel={() => setPlatformDeleteTarget(null)}
          onConfirm={() => void deletePlatform(platformDeleteTarget)}
          title="Delete AI platform?"
        />
      ) : null}
      {mcpModal ? (
        <McpServerModal
          bearerToken={mcpModalBearerToken}
          error={mcpModalError}
          isSaving={isSavingMcp}
          message={mcpModalMessage}
          mcpClient={mcpModal}
          onBearerTokenChange={setMcpModalBearerToken}
          onCancel={() => setMcpModal(null)}
          onChange={updateMcpModal}
          onDelete={() => setMcpDeleteTarget(mcpModal)}
          onSave={() => void saveMcpServer()}
          onTest={() => void testMcpServer()}
          onToggleTool={toggleMcpModalTool}
        />
      ) : null}
      {mcpDeleteTarget ? (
        <ConfirmModal
          body="This MCP server and its selected tools will be removed from AI endpoint context."
          confirmLabel="Delete"
          isBusy={isSavingMcp}
          onCancel={() => setMcpDeleteTarget(null)}
          onConfirm={() => void deleteMcpServer(mcpDeleteTarget)}
          title="Delete MCP server?"
        />
      ) : null}
      {showMcpClientActivationConfirm ? (
        <ConfirmModal
          body="Enabling MCP Client will disable Emailable's MCP Server because Emailable will now fully handle AI requests and logic. This will revoke and remove any existing MCP keys."
          confirmLabel="Activate"
          isBusy={isTogglingMcp}
          onCancel={() => setShowMcpClientActivationConfirm(false)}
          onConfirm={() => void updateMcpClientActivation(true)}
          title="Activate MCP Client?"
        />
      ) : null}
    </div>
  );
}

function AiPlatformModal({
  errors,
  isSaving,
  messages,
  onCancel,
  onChange,
  onDelete,
  onSave,
  platform,
  providers,
}: {
  errors: Record<string, string>;
  isSaving: boolean;
  messages: Record<string, string>;
  onCancel: () => void;
  onChange: (updates: Partial<AiPlatformDraft>) => void;
  onDelete: () => void;
  onSave: () => void;
  platform: AiPlatformDraft;
  providers: Record<string, AiProviderDefinition>;
}) {
  const definition = providers[platform.provider];
  const isOllama = platform.provider === "ollama";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 p-4">
      <div className="w-full max-w-3xl rounded-2xl border border-white/70 bg-white/35 p-3 shadow-2xl backdrop-blur-[5px]">
        <div className="rounded-xl border border-white/80 bg-white/40 p-5 shadow-sm">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950">{platform.isDraft ? "Add AI platform" : "Edit AI platform"}</h2>
              <p className="text-sm text-zinc-500">Save tests the connection before this platform can be used by AI endpoints.</p>
            </div>
            <Button aria-label="Close AI platform modal" disabled={isSaving} onClick={onCancel} size="icon" type="button" variant="ghost">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-4">
            {errors[platform.id] ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errors[platform.id]}</p> : null}
            {messages[platform.id] ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{messages[platform.id]}</p> : null}

            <InputField disabled={isSaving} label="Name (optional)" onChange={(value) => onChange({ name: value })} placeholder={platform.providerLabel} value={platform.name ?? ""} />

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-700">Platform</span>
                <select
                  className="h-10 w-full glass-panel rounded-md border px-3 text-sm outline-none transition-colors focus:border-zinc-400"
                  disabled={isSaving}
                  onChange={(event) => onChange({ provider: event.target.value })}
                  value={platform.provider}
                >
                  {Object.entries(providers).map(([id, provider]) => (
                    <option key={id} value={id}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </label>

              {isOllama ? (
                <InputField disabled={isSaving} label="Model" onChange={(value) => onChange({ model: value })} placeholder="llama3.1" value={platform.model} />
              ) : (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-zinc-700">Model</span>
                  <select
                    className="h-10 w-full glass-panel rounded-md border px-3 text-sm outline-none transition-colors focus:border-zinc-400"
                    disabled={isSaving}
                    onChange={(event) => onChange({ model: event.target.value })}
                    value={platform.model}
                  >
                    {(definition?.models ?? []).map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {isOllama ? (
              <div className="grid gap-4 md:grid-cols-2">
                <InputField disabled={isSaving} label="Ollama URL" onChange={(value) => onChange({ baseUrl: value })} placeholder="http://localhost:11434" value={platform.baseUrl} />
                <InputField
                  disabled={isSaving}
                  label="Optional bearer token"
                  onChange={(value) => onChange({ bearerToken: value })}
                  placeholder={platform.hasBearerToken ? "Saved token. Re-enter to change." : "Bearer token"}
                  type="password"
                  value={platform.bearerToken}
                />
              </div>
            ) : (
              <InputField
                disabled={isSaving}
                label="API Key"
                onChange={(value) => onChange({ apiKey: value })}
                placeholder={platform.hasApiKey ? "Saved key. Re-enter to test or change." : "Paste API key"}
                type="password"
                value={platform.apiKey}
              />
            )}
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button disabled={isSaving} onClick={onCancel} type="button" variant="outline">
              Cancel
            </Button>
            {!platform.isDraft ? (
              <Button disabled={isSaving} onClick={onDelete} type="button" variant="outline">
                <Trash2 className="h-4 w-4 text-red-600" />
                Delete
              </Button>
            ) : null}
            <Button disabled={isSaving} onClick={onSave} type="button">
              {isSaving ? <Loader /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function McpServerModal({
  bearerToken,
  error,
  isSaving,
  message,
  mcpClient,
  onBearerTokenChange,
  onCancel,
  onChange,
  onDelete,
  onSave,
  onTest,
  onToggleTool,
}: {
  bearerToken: string;
  error: string | null;
  isSaving: boolean;
  message: string | null;
  mcpClient: AiMcpClientConfig;
  onBearerTokenChange: (value: string) => void;
  onCancel: () => void;
  onChange: (updates: Partial<AiMcpClientConfig>) => void;
  onDelete: () => void;
  onSave: () => void;
  onTest: () => void;
  onToggleTool: (name: string) => void;
}) {
  const isSaved = Boolean(mcpClient.id && !mcpClient.id.startsWith("draft-"));
  const isSystem = Boolean(mcpClient.isSystem);
  const canSave = isSystem || (mcpClient.serverUrl.trim().length > 0 && mcpClient.status === "connected" && mcpClient.selectedTools.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 p-4">
      <div className="w-full max-w-4xl rounded-2xl border border-white/70 bg-white/35 p-3 shadow-2xl backdrop-blur-[5px]">
        <div className="rounded-xl border border-white/80 bg-white/40 p-5 shadow-sm">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950">{isSystem ? "System MCP Tools" : isSaved ? "Edit MCP server" : "Add MCP server"}</h2>
              <p className="text-sm text-zinc-500">
                {isSystem
                  ? "Choose which built-in Emailable MCP tools AI endpoints can reference. This server is managed by the system."
                  : "Connect to a Streamable HTTP MCP server and choose which tools Emailable can reference."}
              </p>
            </div>
            <Button aria-label="Close MCP server modal" disabled={isSaving} onClick={onCancel} size="icon" type="button" variant="ghost">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-4">
            {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            {message ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}

            {!isSystem ? (
              <>
                <InputField disabled={isSaving} label="Name (optional)" onChange={(value) => onChange({ name: value })} placeholder="Production n8n" value={mcpClient.name ?? ""} />

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_auto] lg:items-end">
                  <InputField disabled={isSaving} label="URL" onChange={(value) => onChange({ serverUrl: value, status: "untested", tools: [], selectedTools: [] })} placeholder="https://example.com/mcp/core" type="url" value={mcpClient.serverUrl} />
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-zinc-700">Auth type</span>
                    <select
                      className="h-10 w-full glass-panel rounded-md border px-3 text-sm outline-none transition-colors focus:border-zinc-400"
                      disabled={isSaving}
                      onChange={(event) => onChange({ authType: event.target.value as "none" | "bearer" })}
                      value={mcpClient.authType ?? "none"}
                    >
                      <option value="none">None</option>
                      <option value="bearer">Bearer Token</option>
                    </select>
                  </label>
                  <Button disabled={isSaving || !mcpClient.serverUrl.trim()} onClick={onTest} type="button" variant="outline">
                    {isSaving ? <Loader /> : <RefreshCw className="h-4 w-4" />}
                    Test connection
                  </Button>
                </div>

                {(mcpClient.authType ?? "none") === "bearer" ? (
                  <InputField
                    disabled={isSaving}
                    label="Bearer token"
                    onChange={onBearerTokenChange}
                    placeholder={mcpClient.hasBearerToken ? "Saved token. Re-enter to change." : "Bearer token"}
                    type="password"
                    value={bearerToken}
                  />
                ) : null}
              </>
            ) : null}

            {mcpClient.status === "connected" ? (
              <div className="space-y-3 rounded-md border border-zinc-200 p-4">
                <div>
                  <p className="text-sm font-medium text-zinc-950">Available tools</p>
                  <p className="text-sm text-zinc-500">Select at least one tool for this MCP server.</p>
                </div>
                {mcpClient.tools.length === 0 ? (
                  <p className="text-sm text-zinc-500">No tools were returned by this MCP server.</p>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    {mcpClient.tools.map((tool) => (
                      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-200 p-3 text-sm hover:bg-zinc-50" key={tool.name}>
                        <input checked={mcpClient.selectedTools.includes(tool.name)} disabled={isSaving} onChange={() => onToggleTool(tool.name)} type="checkbox" />
                        <span>
                          <span className="block font-medium text-zinc-950">{tool.name}</span>
                          <span className="block text-zinc-500">{tool.description || "No description provided."}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button disabled={isSaving} onClick={onCancel} type="button" variant="outline">
              Cancel
            </Button>
            {isSaved && !isSystem ? (
              <Button disabled={isSaving} onClick={onDelete} type="button" variant="outline">
                <Trash2 className="h-4 w-4 text-red-600" />
                Delete
              </Button>
            ) : null}
            <Button disabled={isSaving || !canSave} onClick={onSave} type="button">
              {isSaving ? <Loader /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({
  body,
  confirmLabel,
  isBusy,
  onCancel,
  onConfirm,
  title,
}: {
  body: string;
  confirmLabel: string;
  isBusy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/20 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/70 bg-white/35 p-3 shadow-2xl backdrop-blur-[5px]">
        <div className="rounded-xl border border-white/80 bg-white/40 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">{title}</h2>
          <p className="mt-2 text-sm text-zinc-600">{body}</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button disabled={isBusy} onClick={onCancel} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={isBusy} onClick={onConfirm} type="button">
              {isBusy ? <Loader /> : <Trash2 className="h-4 w-4" />}
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnectedActivationBadge({ active, inactiveTooltip }: { active: boolean; inactiveTooltip: string }) {
  const badge = (
    <Badge className={active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"}>
      Connected
    </Badge>
  );

  if (active) {
    return badge;
  }

  return (
    <Tooltip text={inactiveTooltip}>
      <span className="inline-flex">{badge}</span>
    </Tooltip>
  );
}

function AiPromptEditorPage({ promptKey, privacyMode = false }: { promptKey: string; privacyMode?: boolean }) {
  const [prompt, setPrompt] = useState<AiPrompt | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [savedMarkdown, setSavedMarkdown] = useState("");
  const [previewMarkdown, setPreviewMarkdown] = useState("");
  const [draftEmailExamples, setDraftEmailExamples] = useState<DraftEmailExample[]>([]);
  const [draftSearchRecipient, setDraftSearchRecipient] = useState("");
  const [draftSearchSubject, setDraftSearchSubject] = useState("");
  const [draftSearchResults, setDraftSearchResults] = useState<DraftEmailSearchResult[]>([]);
  const [isSearchingDraftEmails, setIsSearchingDraftEmails] = useState(false);
  const [isEmailExamplesOpen, setIsEmailExamplesOpen] = useState(false);
  const [draftSearchError, setDraftSearchError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hasChanges = markdown !== savedMarkdown;
  const isDraftReplyPrompt = promptKey === "draft-reply";

  useEffect(() => {
    async function loadPrompt() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/ai-prompts/${promptKey}`, { credentials: "include" });
        const data = await response.json();

        if (!response.ok) {
          setError(data.error ?? "Could not load AI prompt.");
          return;
        }

        setPrompt(data);
        setMarkdown(data.markdown ?? "");
        setSavedMarkdown(data.markdown ?? "");
      } catch {
        setError("Could not load AI prompt.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadPrompt();
  }, [promptKey]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsPreviewing(true);

      try {
        const response = await fetch(`/api/ai-prompts/${promptKey}/preview`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markdown }),
          signal: controller.signal,
        });
        const data = await response.json();

        if (!response.ok) {
          setError(data.error ?? "Could not preview AI prompt.");
          return;
        }

        setPreviewMarkdown(data.markdown ?? "");
      } catch (previewError) {
        if (!controller.signal.aborted) {
          setError("Could not preview AI prompt.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsPreviewing(false);
        }
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [isLoading, markdown, promptKey]);

  function insertAtCursor(value: string) {
    const input = textareaRef.current;

    if (!input) {
      setMarkdown((current) => `${current}${value}`);
      return;
    }

    const selectionStart = input.selectionStart ?? markdown.length;
    const selectionEnd = input.selectionEnd ?? selectionStart;
    const nextMarkdown = markdown.slice(0, selectionStart) + value + markdown.slice(selectionEnd);

    setMarkdown(nextMarkdown);

    window.requestAnimationFrame(() => {
      input.focus();
      const nextCursor = selectionStart + value.length;
      input.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function removeDraftEmailExample(emailId: string) {
    setDraftEmailExamples((current) => current.filter((example) => example.emailId !== emailId));
  }

  function clearDraftSearchResults() {
    setDraftSearchResults([]);
    setDraftSearchError(null);
  }

  async function searchDraftSentEmails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draftSearchRecipient.trim() && !draftSearchSubject.trim()) {
      setDraftSearchError("Enter a recipient or subject to search sent mail.");
      return;
    }

    setIsSearchingDraftEmails(true);
    setDraftSearchError(null);

    try {
      const response = await fetch("/api/ai-prompts/draft-reply/sent-email-search", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: draftSearchRecipient,
          subject: draftSearchSubject,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setDraftSearchError(data.error ?? "Sent email search failed.");
        setDraftSearchResults([]);
        return;
      }

      setDraftSearchResults(data.emails ?? []);

      if ((data.emails ?? []).length === 0) {
        setDraftSearchError("No sent emails matched that search.");
      }
    } catch {
      setDraftSearchError("Sent email search failed.");
      setDraftSearchResults([]);
    } finally {
      setIsSearchingDraftEmails(false);
    }
  }

  function addDraftSearchResult(result: DraftEmailSearchResult) {
    if (draftEmailExamples.length >= 10 || draftEmailExamples.some((example) => example.emailId === result.emailId)) {
      return;
    }

    setDraftEmailExamples((current) => [...current, result]);
  }

  function applyMarkdownWrap(prefix: string, suffix = prefix) {
    const input = textareaRef.current;
    const selectionStart = input?.selectionStart ?? markdown.length;
    const selectionEnd = input?.selectionEnd ?? selectionStart;
    const selectedText = markdown.slice(selectionStart, selectionEnd) || "text";
    const nextMarkdown = markdown.slice(0, selectionStart) + prefix + selectedText + suffix + markdown.slice(selectionEnd);

    setMarkdown(nextMarkdown);

    window.requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(selectionStart + prefix.length, selectionStart + prefix.length + selectedText.length);
    });
  }

  async function savePrompt() {
    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/ai-prompts/${promptKey}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not save AI prompt.");
        return;
      }

      setSavedMarkdown(data.prompt.markdown ?? markdown);
      setMessage("AI prompt saved.");
    } catch {
      setError("Could not save AI prompt.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
	      <Card>
	        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <div className="min-w-0">
	            <CardTitle>{prompt?.title ?? "Email Label"} Prompt</CardTitle>
	            <CardDescription>
	              Create the system prompt that defines how the AI should behave when analyzing and labeling emails. Template
	              strings are saved as-is and replaced with current app values when previewed or called through the API.
	            </CardDescription>
            </div>
            <Button className="shrink-0" disabled={isLoading || isSaving || !hasChanges} onClick={() => void savePrompt()} type="button">
              {isSaving ? "Saving..." : "Save Prompt"}
            </Button>
	        </CardHeader>
        <CardContent className="space-y-5">
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {message ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Button disabled={isLoading} onClick={() => applyMarkdownWrap("**")} size="sm" type="button" variant="outline">
              Bold
            </Button>
            <Button disabled={isLoading} onClick={() => applyMarkdownWrap("_")} size="sm" type="button" variant="outline">
              Italic
            </Button>
            <Button disabled={isLoading} onClick={() => insertAtCursor("\n## Heading\n")} size="sm" type="button" variant="outline">
              Heading
            </Button>
            <Button disabled={isLoading} onClick={() => insertAtCursor("\n- List item\n")} size="sm" type="button" variant="outline">
              List
            </Button>
            <Button disabled={isLoading} onClick={() => insertAtCursor("{confidenceThreshold}")} size="sm" type="button" variant="outline">
              {"{confidenceThreshold}"}
            </Button>
            <Button disabled={isLoading} onClick={() => insertAtCursor("{labelTable}")} size="sm" type="button" variant="outline">
              {"{labelTable}"}
            </Button>
          </div>

		          {isDraftReplyPrompt ? (
		            <Card className="border-zinc-200">
		              <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
                    <div className="min-w-0">
		                  <button
		                    className="flex cursor-pointer items-center gap-2 text-left"
		                    onClick={() => setIsEmailExamplesOpen((current) => !current)}
		                    type="button"
		                  >
		                    <ChevronRight className={cn("h-4 w-4 text-zinc-500 transition-transform", isEmailExamplesOpen && "rotate-90")} />
		                    <CardTitle className="text-base">Email examples</CardTitle>
		                  </button>
		                  <CardDescription>
		                    Find sent emails from connected Gmail accounts and insert them as markdown tables with To, Subject, and
		                    BodyText fields.
		                  </CardDescription>
                    </div>
		              </CardHeader>
		              {isEmailExamplesOpen ? <CardContent>
		                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
	                  <div className="space-y-3 rounded-md border border-zinc-200 glass-panel p-3">
	                    <form className="space-y-3" onSubmit={searchDraftSentEmails}>
	                      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
	                        <input
	                          className="h-10 min-w-0 glass-panel rounded-md border px-3 text-sm outline-none transition-colors focus:border-zinc-400"
	                          disabled={isSearchingDraftEmails}
	                          onChange={(event) => setDraftSearchRecipient(event.target.value)}
	                          placeholder="Recipient email"
	                          value={draftSearchRecipient}
	                        />
	                        <input
	                          className="h-10 min-w-0 glass-panel rounded-md border px-3 text-sm outline-none transition-colors focus:border-zinc-400"
	                          disabled={isSearchingDraftEmails}
	                          onChange={(event) => setDraftSearchSubject(event.target.value)}
	                          placeholder="Subject"
	                          value={draftSearchSubject}
	                        />
	                        <Button
	                          className="cursor-pointer"
	                          disabled={isSearchingDraftEmails || (!draftSearchRecipient.trim() && !draftSearchSubject.trim())}
	                          type="submit"
	                          variant="outline"
	                        >
	                          {isSearchingDraftEmails ? <Loader /> : <Search className="h-4 w-4" />}
	                          Find sent email
	                        </Button>
	                      </div>
	                      <div className="flex items-center justify-between gap-3">
	                        {draftSearchError ? <p className="text-sm text-red-700">{draftSearchError}</p> : <span />}
	                        <Button
	                          className="cursor-pointer"
	                          disabled={draftSearchResults.length === 0 && !draftSearchError}
	                          onClick={clearDraftSearchResults}
	                          size="sm"
	                          type="button"
	                          variant="ghost"
	                        >
	                          Clear
	                        </Button>
	                      </div>
	                    </form>

	                    {draftSearchResults.length > 0 ? (
	                      <div className="space-y-2">
	                        {draftSearchResults.map((result) => {
	                          const isAdded = draftEmailExamples.some((example) => example.emailId === result.emailId);
	                          return (
	                            <div
	                              className="flex flex-col gap-2 glass-panel rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
	                              key={`${result.provider}-${result.accountEmail}-${result.emailId}`}
	                            >
	                              <div className="min-w-0">
	                                <p className="truncate font-medium text-zinc-950">{result.subject || "No subject"}</p>
	                                <p className="truncate text-zinc-500">
	                                  To {formatEmailTextForPrivacy(result.to || "Unknown recipient", privacyMode)} from {formatEmailForPrivacy(result.accountEmail, privacyMode)}
	                                </p>
	                              </div>
	                              <Button
	                                className="cursor-pointer sm:shrink-0"
	                                disabled={isAdded || draftEmailExamples.length >= 10}
	                                onClick={() => addDraftSearchResult(result)}
	                                size="sm"
	                                type="button"
	                                variant="outline"
	                              >
	                                {isAdded ? "Added" : "Add example"}
	                              </Button>
	                            </div>
	                          );
	                        })}
	                      </div>
	                    ) : null}
	                  </div>

	                  <div className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
	                    <div>
	                      <p className="text-sm font-medium text-emerald-950">Added examples</p>
	                      <p className="text-xs text-emerald-800">{draftEmailExamples.length}/10 selected</p>
	                    </div>
	                    <div className="space-y-2">
	                      {draftEmailExamples.length === 0 ? (
	                        <p className="glass-panel rounded-md border border-dashed border-emerald-200 px-3 py-6 text-center text-sm text-emerald-800">
	                          No examples added.
	                        </p>
	                      ) : (
	                        draftEmailExamples.map((example) => (
	                          <div
	                            className="flex max-w-full items-center gap-2 glass-panel rounded-md border border-emerald-200 px-3 py-2 text-sm text-emerald-900"
	                            key={example.emailId}
	                            title={example.subject || "No subject"}
	                          >
	                            <span className="min-w-0 flex-1 truncate">{example.subject || "No subject"}</span>
	                            <Button onClick={() => insertAtCursor(`\n\n${example.markdown}\n`)} size="sm" type="button" variant="outline">
	                              Insert
	                            </Button>
	                            <button className="cursor-pointer text-current" onClick={() => removeDraftEmailExample(example.emailId)} type="button">
	                              <X className="h-4 w-4" />
	                            </button>
	                          </div>
	                        ))
	                      )}
	                    </div>
	                  </div>
	                </div>
		              </CardContent> : null}
		            </Card>
		          ) : null}

	          <div className="grid gap-5 xl:grid-cols-2">
	            <div className="space-y-2">
	              <label className="block">
	                <span className="mb-1 block text-sm font-medium text-zinc-700">Markdown prompt</span>
	                <textarea
	                  className="h-[420px] w-full resize-none overflow-auto glass-panel rounded-md border px-3 py-3 font-mono text-sm outline-none transition-colors focus:border-zinc-400"
	                  disabled={isLoading}
                  onChange={(event) => {
                    setMarkdown(event.target.value);
                    setMessage(null);
                  }}
                  ref={textareaRef}
                  value={markdown}
                />
              </label>
              <p className="text-xs text-zinc-500">Images are not supported in AI prompt markdown.</p>
            </div>
            <div className="space-y-2">
	              <div className="flex items-center justify-between gap-3">
	                <p className="text-sm font-medium text-zinc-700">Rendered preview</p>
	                {isPreviewing ? <span className="text-xs text-zinc-500">Updating...</span> : null}
	              </div>
	              <div className="h-[420px] overflow-auto glass-panel rounded-md border p-4">
	                <div
                  className="max-w-none space-y-3 text-sm leading-6 text-zinc-800 [&_code]:rounded [&_code]:bg-zinc-100 [&_code]:px-1 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-semibold"
                  dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(previewMarkdown || markdown) }}
                />
              </div>
            </div>
          </div>

	        </CardContent>
      </Card>
    </div>
  );
}

function SettingsPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>Select a setting to configure.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-zinc-200 rounded-md border border-zinc-200">
            <button
              className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left hover:bg-zinc-50"
              onClick={() => onNavigate("confidence-threshold")}
              type="button"
            >
              <div>
                <p className="text-sm font-medium text-zinc-950">Confidence Threshold</p>
                <p className="mt-1 text-sm text-zinc-500">Control when the AI can auto-label without review.</p>
              </div>
              <ChevronRight className="h-4 w-4 text-zinc-400" />
            </button>
            <button
              className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left hover:bg-zinc-50"
              onClick={() => onNavigate("email-accounts")}
              type="button"
            >
              <div>
                <p className="text-sm font-medium text-zinc-950">Email Accounts</p>
                <p className="mt-1 text-sm text-zinc-500">Connect inboxes for labels, folders, email queries, and metadata.</p>
              </div>
              <ChevronRight className="h-4 w-4 text-zinc-400" />
            </button>
	            <button
	              className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left hover:bg-zinc-50"
	              onClick={() => onNavigate("endpoints")}
              type="button"
            >
              <div>
                <p className="text-sm font-medium text-zinc-950">Endpoints</p>
                <p className="mt-1 text-sm text-zinc-500">Create n8n API keys and view integration payload examples.</p>
              </div>
	              <ChevronRight className="h-4 w-4 text-zinc-400" />
	            </button>
            <button
              className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left hover:bg-zinc-50"
              onClick={() => onNavigate("webhook")}
              type="button"
            >
              <div>
                <p className="text-sm font-medium text-zinc-950">Webhook</p>
                <p className="mt-1 text-sm text-zinc-500">Send app events to an external automation endpoint.</p>
              </div>
              <ChevronRight className="h-4 w-4 text-zinc-400" />
            </button>
            <button
              className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left hover:bg-zinc-50"
              onClick={() => onNavigate("mcp-server")}
              type="button"
            >
	              <div>
	                <p className="text-sm font-medium text-zinc-950">MCP Server</p>
	                <p className="mt-1 text-sm text-zinc-500">Create MCP bearer keys and view Streamable HTTP tool details.</p>
	              </div>
	              <ChevronRight className="h-4 w-4 text-zinc-400" />
	            </button>
	          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function WebhookPage() {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [savedWebhookUrl, setSavedWebhookUrl] = useState("");
  const [bearerToken, setBearerToken] = useState("");
  const [savedBearerToken, setSavedBearerToken] = useState("");
  const [showAuth, setShowAuth] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlValidationError = validateWebhookUrl(webhookUrl);
  const hasChanges = webhookUrl !== savedWebhookUrl || bearerToken !== savedBearerToken;

  useEffect(() => {
    async function loadWebhookSettings() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/settings/webhook", { credentials: "include" });
        const data = await response.json();

        if (!response.ok) {
          setError(data.error ?? "Could not load webhook settings.");
          return;
        }

        setWebhookUrl(data.webhookUrl ?? "");
        setSavedWebhookUrl(data.webhookUrl ?? "");
        setBearerToken(data.bearerToken ?? "");
        setSavedBearerToken(data.bearerToken ?? "");
        setShowAuth(Boolean(data.bearerToken));
      } catch {
        setError("Could not load webhook settings.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadWebhookSettings();
  }, []);

  async function saveWebhookSettings() {
    const currentValidationError = validateWebhookUrl(webhookUrl);
    if (currentValidationError) {
      setError(currentValidationError);
      setMessage(null);
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/settings/webhook", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl, bearerToken: showAuth ? bearerToken : "" }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not save webhook settings.");
        return;
      }

      setWebhookUrl(data.webhookUrl ?? "");
      setSavedWebhookUrl(data.webhookUrl ?? "");
      setBearerToken(data.bearerToken ?? "");
      setSavedBearerToken(data.bearerToken ?? "");
      setShowAuth(Boolean(data.bearerToken));
      setMessage("Webhook settings saved successfully.");
    } catch {
      setError("Could not save webhook settings.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div>
            <CardTitle>Webhook</CardTitle>
            <CardDescription>Send Emailable events to an external workflow or automation endpoint.</CardDescription>
          </div>
          <Button disabled={isLoading || isSaving || !hasChanges || Boolean(urlValidationError)} onClick={() => void saveWebhookSettings()} type="button">
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">Webhook URL</span>
            <input
              className="h-10 w-full glass-panel rounded-md border px-3 text-sm outline-none transition-colors focus:border-zinc-400"
              disabled={isLoading}
              onChange={(event) => {
                setWebhookUrl(event.target.value);
                setMessage(null);
              }}
              placeholder="https://example.com/emailable-webhook"
              type="url"
              value={webhookUrl}
            />
            <span className="mt-1 block text-xs text-zinc-500">Leave this blank to disable webhook delivery.</span>
          </label>

          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              checked={showAuth}
              className="h-4 w-4"
              disabled={isLoading}
              onChange={(event) => {
                setShowAuth(event.target.checked);
                if (!event.target.checked) {
                  setBearerToken("");
                }
                setMessage(null);
              }}
              type="checkbox"
            />
            Send Authorization bearer token
          </label>

          {showAuth ? (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-zinc-700">Bearer token</span>
              <input
                className="h-10 w-full glass-panel rounded-md border px-3 text-sm outline-none transition-colors focus:border-zinc-400"
                disabled={isLoading}
                onChange={(event) => {
                  setBearerToken(event.target.value);
                  setMessage(null);
                }}
                placeholder="Paste token"
                type="password"
                value={bearerToken}
              />
            </label>
          ) : null}

          {urlValidationError ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{urlValidationError}</p> : null}
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {message ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook Events</CardTitle>
          <CardDescription>Every webhook is sent as JSON with the same outer event envelope.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <pre className="overflow-x-auto rounded-md bg-zinc-950 p-3 text-xs text-white">
            {JSON.stringify({ event_name: "string", payload: {}, timestamp: new Date().toISOString() }, null, 2)}
          </pre>
          <EndpointDoc
            method="EVENT"
            path="email.drafted"
            title="Email Drafted"
            notes={["Fired when a draft reply is created through REST API or MCP."]}
            response={{
              event_name: "email.drafted",
              payload: {
                to: ["recipient@example.com"],
                from: "user@example.com",
                subject: "Re: Example subject",
                body: { text: "Reply text", html: "" },
                accountEmail: "user@example.com",
                emailId: "message-id",
                draftId: "draft-id",
                provider: "gmail",
              },
              timestamp: "2026-06-08T12:00:00.000Z",
            }}
          />
          <EndpointDoc
            method="EVENT"
            path="email_rule.created / email_rule.modified / email_rule.deleted"
            title="Email Rule Events"
            notes={["Created and modified events include the saved rule and submitted payload or changes. Deleted events include the deleted rule payload."]}
            response={{
              event_name: "email_rule.modified",
              payload: {
                rule: { emailId: "message-id", labelsApplied: ["Invoice"], isPending: false },
                changes: { labelsApplied: ["Invoice"], labelReasons: { Invoice: "Use this label for vendor invoices." } },
                previous: { emailId: "message-id", labelsApplied: [], isPending: true },
              },
              timestamp: "2026-06-08T12:00:00.000Z",
            }}
          />
          <EndpointDoc
            method="EVENT"
            path="label.created / label.modified / label.deleted"
            title="Label Events"
            notes={["Created and modified events include the label. Modified events include changed fields. Deleted events include the deleted label payload."]}
            response={{
              event_name: "label.created",
              payload: {
                label: { id: "label-id", name: "Invoice", description: "Vendor invoices" },
              },
              timestamp: "2026-06-08T12:00:00.000Z",
            }}
          />
          <EndpointDoc
            method="EVENT"
            path="email.labels_updated"
            title="Email Labels Updated"
            notes={["Fired when labels are added to or removed from an email through REST API or MCP."]}
            response={{
              event_name: "email.labels_updated",
              payload: {
                emailId: "message-id",
                accountEmail: "user@example.com",
                added: ["Invoice"],
                removed: [],
              },
              timestamp: "2026-06-08T12:00:00.000Z",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function EmailAccountsPage({ privacyMode }: { privacyMode: boolean }) {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [providers, setProviders] = useState<EmailProvider[]>([]);
  const [imapForm, setImapForm] = useState({
    email: "",
    displayName: "",
    imapHost: "",
    imapPort: "993",
    imapSecure: true,
    imapUsername: "",
    appPassword: "",
    defaultMailbox: "INBOX",
    sentMailbox: "Sent",
    draftsMailbox: "Drafts",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isCheckingTokens, setIsCheckingTokens] = useState(false);
  const [isConnectingImap, setIsConnectingImap] = useState(false);
  const [showProviderChoices, setShowProviderChoices] = useState(false);
  const [showImapModal, setShowImapModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imapError, setImapError] = useState<string | null>(null);
  const [polling, setPolling] = useState<PollingSettings>({
    enabled: false,
    aiActive: false,
    intervalMinutes: 15,
    lookbackValue: 24,
    lookbackUnit: "hours",
  });
  const [isSavingPolling, setIsSavingPolling] = useState(false);
  const [isPollingNow, setIsPollingNow] = useState(false);
  const [pollCooldown, setPollCooldown] = useState(0);
  const [pollingError, setPollingError] = useState<string | null>(null);
  const [pollingNotice, setPollingNotice] = useState<string | null>(null);

  useEffect(() => {
    void loadEmailAccounts();
  }, []);

  useEffect(() => {
    if (pollCooldown <= 0) {
      return;
    }
    const timer = window.setInterval(() => setPollCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [pollCooldown]);

  useEffect(() => {
    function refreshPollingWhenVisible() {
      if (document.visibilityState === "visible") {
        void loadPollingSettings();
      }
    }
    document.addEventListener("visibilitychange", refreshPollingWhenVisible);
    window.addEventListener("focus", refreshPollingWhenVisible);
    return () => {
      document.removeEventListener("visibilitychange", refreshPollingWhenVisible);
      window.removeEventListener("focus", refreshPollingWhenVisible);
    };
  }, []);

  useEffect(() => {
    if (!isLoading && accounts.length > 0) {
      void checkTokenStatuses();
    }
  }, [isLoading]);

  async function loadEmailAccounts() {
    setIsLoading(true);
    setError(null);

    try {
      const [accountsResponse, providersResponse, pollingResponse] = await Promise.all([
        fetch("/api/email-accounts", { credentials: "include" }),
        fetch("/api/email-accounts/providers", { credentials: "include" }),
        fetch("/api/email-accounts/polling", { credentials: "include" }),
      ]);
      const accountsData = await accountsResponse.json();
      const providersData = await providersResponse.json();
      const pollingData = await pollingResponse.json().catch(() => null);

      if (!accountsResponse.ok) {
        setError(accountsData.error ?? "Could not load email accounts.");
        return;
      }

      setAccounts(accountsData.accounts ?? []);
      setProviders(providersData.providers ?? []);
      if (pollingResponse.ok && pollingData) {
        setPolling(pollingData);
      } else if (pollingData?.error) {
        setPollingError(pollingData.error);
      }
    } catch {
      setError("Could not load email accounts.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadPollingSettings() {
    try {
      const response = await fetch("/api/email-accounts/polling", { credentials: "include" });
      const data = await response.json();
      if (response.ok) {
        setPolling(data);
        setPollingError(null);
      }
    } catch {
      // Keep the last known settings while the page remains open.
    }
  }

  async function savePollingSettings(enabled = polling.enabled) {
    const validationError = validatePollingSettings(polling);
    if (validationError) {
      setPollingError(validationError);
      return;
    }

    setIsSavingPolling(true);
    setPollingError(null);
    setPollingNotice(null);
    try {
      const response = await fetch("/api/email-accounts/polling", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...polling, enabled }),
      });
      const data = await response.json();
      if (!response.ok) {
        setPollingError(data.error ?? "Could not save polling settings.");
        return;
      }
      setPolling(data);
      setPollingNotice(enabled ? "Polling is active." : polling.enabled ? "Polling was deactivated." : "Polling settings saved.");
    } catch {
      setPollingError("Could not save polling settings.");
    } finally {
      setIsSavingPolling(false);
    }
  }

  async function runPollingNow() {
    if (!polling.aiActive || isPollingNow || pollCooldown > 0) {
      return;
    }
    setIsPollingNow(true);
    setPollCooldown(10);
    setPollingError(null);
    setPollingNotice(null);
    try {
      const response = await fetch("/api/email-accounts/polling/run", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok) {
        setPollingError(data.error ?? "Could not run polling.");
        return;
      }
      setPollingNotice(`Polling finished: ${data.processed} processed, ${data.failed} failed.`);
      await loadPollingSettings();
    } catch {
      setPollingError("Could not run polling.");
    } finally {
      setIsPollingNow(false);
    }
  }

  async function checkTokenStatuses() {
    setIsCheckingTokens(true);
    setError(null);
    setAccounts((current) => current.map((account) => ({ ...account, status: "checking", statusMessage: "Checking..." })));

    try {
      const response = await fetch("/api/email-accounts/token-status", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not check email account statuses.");
        return;
      }

      const statuses = new Map<string, Pick<EmailAccount, "id" | "status" | "statusMessage">>(
        (data.accounts ?? []).map((account: Pick<EmailAccount, "id" | "status" | "statusMessage">) => [account.id, account]),
      );
      setAccounts((current) =>
        current.map((account) => {
          const status = statuses.get(account.id);
          return status ? { ...account, status: status.status, statusMessage: status.statusMessage } : account;
        }),
      );
    } catch {
      setError("Could not check email account statuses.");
      setAccounts((current) => current.map((account) => (account.status === "checking" ? { ...account, status: "unchecked", statusMessage: "Not checked" } : account)));
    } finally {
      setIsCheckingTokens(false);
    }
  }

  function connectProvider(providerId: string) {
    if (providerId === "imap") {
      setError(null);
      setImapError(null);
      setShowImapModal(true);
      return;
    }

    const connectUrl = getAbsoluteRuntimeUrl(`/api/email-accounts/connect/${providerId}`);
    if (window.top && window.top !== window) {
      window.top.location.href = connectUrl;
    } else {
      window.location.href = connectUrl;
    }
  }

  function refreshAccount(account: EmailAccount) {
    if (account.provider === "imap") {
      setError("To refresh an IMAP account, remove it and reconnect it with a current app password.");
      return;
    }

    connectProvider(account.provider);
  }

  function closeImapModal() {
    if (isConnectingImap) {
      return;
    }

    setShowImapModal(false);
    setImapError(null);
  }

  async function connectImapAccount() {
    setIsConnectingImap(true);
    setError(null);
    setImapError(null);

    try {
      const response = await fetch("/api/email-accounts/imap", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...imapForm,
          imapPort: Number(imapForm.imapPort),
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setImapError(getImapConnectionErrorMessage(data, response.status));
        return;
      }

      setShowImapModal(false);
      setShowProviderChoices(false);
      setImapForm({
        email: "",
        displayName: "",
        imapHost: "",
        imapPort: "993",
        imapSecure: true,
        imapUsername: "",
        appPassword: "",
        defaultMailbox: "INBOX",
        sentMailbox: "Sent",
        draftsMailbox: "Drafts",
      });
      await loadEmailAccounts();
    } catch {
      setImapError("Could not reach the app server. Check that the local Node server is running, then try again.");
    } finally {
      setIsConnectingImap(false);
    }
  }

  async function removeAccount(accountId: string) {
    setIsDeleting(accountId);
    setError(null);

    try {
      const response = await fetch(`/api/email-accounts/${accountId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not remove email account.");
        return;
      }

      await loadEmailAccounts();
    } catch {
      setError("Could not remove email account.");
    } finally {
      setIsDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between md:space-y-0">
          <div>
            <CardTitle>Email Accounts</CardTitle>
            <CardDescription>
              Connect Gmail, Yahoo, and IMAP inboxes so the app can manage labels or folders, query emails, and read
              account metadata.
            </CardDescription>
          </div>
          <Button onClick={() => setShowProviderChoices((value) => !value)} type="button">
            <Plus className="h-4 w-4" />
            Add Email Account
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          {showProviderChoices ? (
            <div className="grid gap-3 md:grid-cols-3">
              {providers.map((provider) => (
                <button
                  className={cn(
                    "glass-panel rounded-md border p-4 text-left transition-colors hover:bg-zinc-50",
                    !provider.configured && "cursor-not-allowed opacity-60",
                  )}
                  disabled={!provider.configured}
                  key={provider.id}
                  onClick={() => connectProvider(provider.id)}
                  type="button"
                >
                  <p className="text-sm font-medium text-zinc-950">{provider.label}</p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {provider.manual ? "Use IMAP app password" : provider.configured ? "Connect account" : "OAuth credentials not configured"}
                  </p>
                </button>
              ))}
            </div>
          ) : null}

          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          {isLoading ? (
            <div className="rounded-md border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
              Loading email accounts...
            </div>
          ) : accounts.length === 0 ? (
            <div className="rounded-md border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
              No email accounts connected.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-end">
                <Tooltip text="Recheck token status for all connected accounts.">
                  <Button disabled={isCheckingTokens} onClick={() => void checkTokenStatuses()} size="sm" type="button" variant="outline">
                    <RefreshCw className={cn("h-4 w-4", isCheckingTokens && "animate-spin")} />
                    Recheck
                  </Button>
                </Tooltip>
              </div>
              <div className="overflow-hidden rounded-md border border-zinc-200">
                <div className="grid grid-cols-[1fr_120px_150px_104px] gap-3 border-b border-zinc-200 glass-panel px-4 py-3 text-xs font-medium uppercase text-zinc-500">
                  <span>Account</span>
                  <span>Provider</span>
                  <span>Status</span>
                  <span className="text-right">Actions</span>
                </div>
                <div className="divide-y divide-zinc-200">
                  {accounts.map((account) => (
                    <div className="grid grid-cols-[1fr_120px_150px_104px] items-center gap-3 px-4 py-3" key={account.id}>
                      <div>
                        <p className="text-sm font-medium text-zinc-950">{formatEmailForPrivacy(account.email, privacyMode)}</p>
                        <p className="text-sm text-zinc-500">{account.displayName || "No display name"}</p>
                      </div>
                      <Badge className="w-fit capitalize">{providerLabel(account.provider)}</Badge>
                      <EmailAccountStatusBadge account={account} />
                      <div className="flex justify-end gap-1">
                        <Tooltip
                          text={
                            account.provider === "imap"
                              ? "Reconnect this IMAP account with a current app password."
                              : account.source === "sso"
                                ? "Reconnect Gmail access for this signed-in account."
                                : account.status === "needs_refresh"
                                  ? "Reconnect this account to refresh access."
                                  : "Reconnect this account and refresh its token."
                          }
                        >
                          <Button
                            aria-label={`Refresh ${account.email}`}
                            onClick={() => refreshAccount(account)}
                            size="icon"
                            type="button"
                            variant="outline"
                          >
                            <RefreshCw className={cn("h-4 w-4", account.status === "needs_refresh" && "text-amber-600")} />
                          </Button>
                        </Tooltip>
                        {account.canRemove ? (
                          <Tooltip text="Remove account">
                            <Button
                              aria-label={`Remove ${account.email}`}
                              disabled={isDeleting === account.id}
                              onClick={() => void removeAccount(account.id)}
                              size="icon"
                              type="button"
                              variant="outline"
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </Tooltip>
                        ) : (
                          <span className="self-center text-right text-xs text-zinc-500">Required</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div>
            <CardTitle>Polling</CardTitle>
            <CardDescription>
              When active, Emailable periodically checks connected accounts for new mail and sends eligible messages
              through AI labeling. When disabled, send email data through Endpoints or connect to Emailable&apos;s MCP server.
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Button disabled={!polling.aiActive || isPollingNow || pollCooldown > 0} onClick={() => void runPollingNow()} type="button" variant="outline">
              {isPollingNow ? <Loader /> : null}
              {pollCooldown > 0 ? `Poll now (${pollCooldown})` : "Poll now"}
            </Button>
            <AiEnableSwitch
              canEnable={polling.aiActive}
              disabled={isSavingPolling || Boolean(validatePollingSettings(polling))}
              enabled={polling.enabled}
              label="Activate"
              onChange={(enabled) => void savePollingSettings(enabled)}
              unavailableTooltip="Activate AI and connect a working AI platform before enabling polling."
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {pollingNotice ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{pollingNotice}</p> : null}
          {pollingError ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{pollingError}</p> : null}
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-zinc-700">Check for new mail every</span>
              <div className="grid grid-cols-[minmax(0,1fr)_120px]">
                <input
                  className="h-10 rounded-l-md border border-r-0 border-zinc-200 bg-white/70 px-3 text-sm outline-none focus:border-zinc-400"
                  max={720}
                  min={10}
                  onChange={(event) => setPolling((current) => ({ ...current, intervalMinutes: Number(event.target.value) }))}
                  step={1}
                  type="number"
                  value={polling.intervalMinutes}
                />
                <select className="h-10 rounded-r-md border border-zinc-200 bg-zinc-100 px-3 text-sm text-zinc-500" disabled value="minutes">
                  <option value="minutes">minutes</option>
                </select>
              </div>
              <span className="mt-1 block text-xs text-zinc-500">Between 10 and 720 minutes.</span>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-zinc-700">Search for email received within</span>
              <div className="grid grid-cols-[minmax(0,1fr)_120px]">
                <input
                  className="h-10 rounded-l-md border border-r-0 border-zinc-200 bg-white/70 px-3 text-sm outline-none focus:border-zinc-400"
                  max={polling.lookbackUnit === "days" ? 7 : 168}
                  min={1}
                  onChange={(event) => setPolling((current) => ({ ...current, lookbackValue: Number(event.target.value) }))}
                  step={1}
                  type="number"
                  value={polling.lookbackValue}
                />
                <select
                  className="h-10 rounded-r-md border border-zinc-200 bg-white/80 px-3 text-sm outline-none focus:border-zinc-400"
                  onChange={(event) => {
                    const lookbackUnit = event.target.value as PollingSettings["lookbackUnit"];
                    setPolling((current) => ({
                      ...current,
                      lookbackUnit,
                      lookbackValue: Math.min(current.lookbackValue, lookbackUnit === "days" ? 7 : 168),
                    }));
                  }}
                  value={polling.lookbackUnit}
                >
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                </select>
              </div>
              <span className="mt-1 block text-xs text-zinc-500">From 1 hour up to 7 days.</span>
            </label>
          </div>
          <div className="flex justify-end border-t border-zinc-200 pt-4">
            <Button disabled={isSavingPolling || Boolean(validatePollingSettings(polling))} onClick={() => void savePollingSettings()} type="button" variant="outline">
              {isSavingPolling ? <Loader /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {showImapModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-white/70 bg-white/55 p-4 shadow-2xl shadow-slate-900/20 [backdrop-filter:blur(5px)] [-webkit-backdrop-filter:blur(5px)]">
            <div className="max-h-[calc(90vh-2rem)] overflow-hidden rounded-xl bg-white/40 shadow-inner ring-1 ring-white/60">
              <div className="flex items-start justify-between gap-4 border-b border-white/60 px-5 pb-4 pt-5">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-950">Connect IMAP Account</h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    Use an app password from your email provider. Do not use your main account password.
                  </p>
                </div>
                <Button aria-label="Close IMAP setup" disabled={isConnectingImap} onClick={closeImapModal} size="icon" type="button" variant="ghost">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="max-h-[calc(90vh-112px)] space-y-5 overflow-y-auto p-5">
              {imapError ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
                  <p className="font-medium">IMAP connection failed</p>
                  <p className="mt-1">{imapError}</p>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <InputField label="Email address" value={imapForm.email} onChange={(value) => setImapForm((current) => ({ ...current, email: value }))} />
                <InputField label="Display name" value={imapForm.displayName} onChange={(value) => setImapForm((current) => ({ ...current, displayName: value }))} />
                <InputField label="IMAP host" value={imapForm.imapHost} placeholder="imap.mail.yahoo.com" onChange={(value) => setImapForm((current) => ({ ...current, imapHost: value }))} />
                <InputField label="IMAP port" value={imapForm.imapPort} onChange={(value) => setImapForm((current) => ({ ...current, imapPort: value }))} />
                <InputField label="IMAP username" value={imapForm.imapUsername} placeholder="Defaults to email address" onChange={(value) => setImapForm((current) => ({ ...current, imapUsername: value }))} />
                <InputField label="App password" value={imapForm.appPassword} type="password" onChange={(value) => setImapForm((current) => ({ ...current, appPassword: value }))} />
                <InputField label="Default mailbox" value={imapForm.defaultMailbox} onChange={(value) => setImapForm((current) => ({ ...current, defaultMailbox: value }))} />
                <InputField label="Sent mailbox" value={imapForm.sentMailbox} onChange={(value) => setImapForm((current) => ({ ...current, sentMailbox: value }))} />
                <InputField label="Drafts mailbox" value={imapForm.draftsMailbox} onChange={(value) => setImapForm((current) => ({ ...current, draftsMailbox: value }))} />
                <label className="flex items-center gap-2 pt-7 text-sm text-zinc-700">
                  <input
                    checked={imapForm.imapSecure}
                    className="h-4 w-4"
                    onChange={(event) => setImapForm((current) => ({ ...current, imapSecure: event.target.checked }))}
                    type="checkbox"
                  />
                  Use SSL/TLS
                </label>
              </div>

              <div className="rounded-md border border-zinc-200 glass-panel p-4">
                <p className="text-sm font-medium text-zinc-950">Provider setup help</p>
                <div className="mt-2 flex flex-wrap gap-2 text-sm">
                  <a className="text-blue-700 hover:underline" href="https://support.google.com/mail/answer/7126229?hl=en" rel="noreferrer" target="_blank">
                    Gmail IMAP
                  </a>
                  <a className="text-blue-700 hover:underline" href="https://help.yahoo.com/kb/generate-manage-rd-party-passwords-sln15241.html" rel="noreferrer" target="_blank">
                    Yahoo app password
                  </a>
                  <a className="text-blue-700 hover:underline" href="https://support.microsoft.com/en-gb/office/pop-imap-and-smtp-settings-for-outlook-com-d088b986-291d-42b8-9564-9c414e2aa040" rel="noreferrer" target="_blank">
                    Outlook IMAP
                  </a>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button disabled={isConnectingImap} onClick={closeImapModal} type="button" variant="outline">
                  Cancel
                </Button>
                <Button disabled={isConnectingImap} onClick={() => void connectImapAccount()} type="button">
                  {isConnectingImap ? "Connecting..." : "Connect IMAP Account"}
                </Button>
              </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getImapConnectionErrorMessage(data: unknown, status: number) {
  const error = typeof data === "object" && data && "error" in data && typeof data.error === "string" ? data.error : "";
  const details =
    typeof data === "object" && data && "details" in data && typeof data.details === "string" ? data.details : "";
  const message = [error, details].filter(Boolean).join(" ");
  const normalized = message.toLowerCase();

  if (normalized.includes("authentication failed") || normalized.includes("invalid credentials")) {
    return "The IMAP server rejected the username or app password. Use the full email address as the username unless your provider says otherwise, and use an app password instead of your normal email password.";
  }

  if (normalized.includes("host could not be found") || normalized.includes("enotfound")) {
    return "The IMAP host could not be found. Check the server name. For Yahoo, use imap.mail.yahoo.com.";
  }

  if (normalized.includes("connect") || normalized.includes("timeout") || normalized.includes("refused") || normalized.includes("reset")) {
    return "The app could not connect to the IMAP server. Check the host, port, and SSL setting, then try again.";
  }

  if (status === 401) {
    return "Your app session expired. Sign in again, then reconnect the IMAP account.";
  }

  return message || "The IMAP account could not be connected. Check the account settings and try again.";
}

function validatePollingSettings(settings: PollingSettings) {
  if (!Number.isInteger(settings.intervalMinutes) || settings.intervalMinutes < 10 || settings.intervalMinutes > 720) {
    return "Polling interval must be a whole number from 10 to 720 minutes.";
  }
  if (!Number.isInteger(settings.lookbackValue) || settings.lookbackValue < 1) {
    return "Search lookback must be a whole number of at least 1.";
  }
  const lookbackHours = settings.lookbackUnit === "days" ? settings.lookbackValue * 24 : settings.lookbackValue;
  if (lookbackHours > 168) {
    return "Search lookback cannot exceed 7 days or 168 hours.";
  }
  return "";
}

function InputField({
  disabled = false,
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-700">{label}</span>
      <input
        className="h-10 w-full glass-panel rounded-md border px-3 text-sm outline-none transition-colors focus:border-zinc-400"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}

function AiEnableSwitch({
  canEnable,
  disabled = false,
  enabled,
  label = "Enable AI",
  onChange,
  unavailableTooltip = "Add and save a working AI platform before enabling AI.",
}: {
  canEnable: boolean;
  disabled?: boolean;
  enabled: boolean;
  label?: string;
  onChange: (enabled: boolean) => void;
  unavailableTooltip?: string;
}) {
  const switchControl = (
    <label className={cn("inline-flex items-center gap-3 text-sm", !canEnable || disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer")}>
      <span className="font-medium text-zinc-700">{label}</span>
      <input
        checked={enabled}
        className="sr-only"
        disabled={!canEnable || disabled}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span
        className={cn(
          "relative inline-flex h-6 w-11 rounded-full border transition-colors",
          enabled ? "border-emerald-500 bg-emerald-500" : "border-zinc-300 bg-zinc-200",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            enabled ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </span>
    </label>
  );

  if (!canEnable) {
    return (
      <Tooltip text={unavailableTooltip}>
        <span>{switchControl}</span>
      </Tooltip>
    );
  }

  return switchControl;
}

function EndpointsPage() {
  const [apiKeys, setApiKeys] = useState<IntegrationApiKey[]>([]);
  const [aiConfig, setAiConfig] = useState<ByoAiConfig | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [keyName, setKeyName] = useState("n8n");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTogglingAi, setIsTogglingAi] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadApiKeys();
    void loadEndpointAiConfig();
  }, []);

  async function loadApiKeys() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/integration-api-keys", { credentials: "include" });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not load API keys.");
        return;
      }

      setApiKeys(data.keys ?? []);
    } catch {
      setError("Could not load API keys.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadEndpointAiConfig() {
    try {
      const response = await fetch("/api/byoai/config", { credentials: "include" });
      const data = await response.json();

      if (response.ok) {
        setAiConfig(data);
      }
    } catch {
      // The API docs remain visible even if this status check fails.
    }
  }

  async function toggleEndpointAiEnabled(enabled: boolean) {
    setIsTogglingAi(true);
    setError(null);

    try {
      const response = await fetch("/api/byoai/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiEnabled: enabled }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not update AI setting.");
        return;
      }

      setAiConfig((current) => (current ? { ...current, aiEnabled: Boolean(data.aiEnabled) } : current));
    } catch {
      setError("Could not update AI setting.");
    } finally {
      setIsTogglingAi(false);
    }
  }

  async function createApiKey() {
    setIsSaving(true);
    setError(null);
    setNewToken(null);

    try {
      const response = await fetch("/api/integration-api-keys", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: keyName }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not create API key.");
        return;
      }

      setNewToken(data.token);
      setKeyName("n8n");
      await loadApiKeys();
    } catch {
      setError("Could not create API key.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteApiKey(id: string) {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/integration-api-keys/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not revoke API key.");
        return;
      }

      await loadApiKeys();
    } catch {
      setError("Could not revoke API key.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Endpoints</CardTitle>
          <CardDescription>
            Use a bearer API key from n8n. Each key is scoped to the signed-in user's email accounts and labels.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-[minmax(0,260px)_auto]">
            <input
              className="h-10 w-full glass-panel rounded-md border px-3 text-sm outline-none transition-colors focus:border-zinc-400"
              maxLength={60}
              onChange={(event) => setKeyName(event.target.value)}
              placeholder="Key name"
              value={keyName}
            />
            <Button disabled={isSaving} onClick={() => void createApiKey()} type="button">
              <Plus className="h-4 w-4" />
              Create API Key
            </Button>
          </div>

          {newToken ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-medium text-emerald-900">Copy this key now. It will only be shown once.</p>
              <code className="mt-2 block overflow-x-auto glass-panel rounded-md p-3 text-xs text-zinc-900">{newToken}</code>
            </div>
          ) : null}

          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          <div className="overflow-hidden rounded-md border border-zinc-200">
            <div className="grid grid-cols-[1fr_140px_120px] gap-3 border-b border-zinc-200 glass-panel px-4 py-3 text-xs font-medium uppercase text-zinc-500">
              <span>Key</span>
              <span>Last used</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-zinc-200">
              {isLoading ? (
                <div className="px-4 py-4 text-sm text-zinc-500">Loading API keys...</div>
              ) : apiKeys.length === 0 ? (
                <div className="px-4 py-4 text-sm text-zinc-500">No API keys yet.</div>
              ) : (
                apiKeys.map((apiKey) => (
                  <div className="grid grid-cols-[1fr_140px_120px] items-center gap-3 px-4 py-3" key={apiKey.id}>
                    <div>
                      <p className="text-sm font-medium text-zinc-950">{apiKey.name}</p>
                      <p className="text-xs text-zinc-500">{apiKey.keyPrefix}...</p>
                    </div>
                    <span className="text-sm text-zinc-600">{apiKey.lastUsedAt ? formatDate(apiKey.lastUsedAt) : "Never"}</span>
                    <div className="flex justify-end">
                      <Button
                        disabled={isSaving}
                        onClick={() => void deleteApiKey(apiKey.id)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Revoke
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>n8n API Docs</CardTitle>
          <CardDescription>Send the API key as Authorization: Bearer &lt;token&gt;.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <EndpointDoc
            method="GET"
	            path="/api/integrations/core-content"
	            title="Get Core Content"
	            notes={["Returns confidence threshold, labels, and all AI Prompt submenu prompts with supported template strings replaced by current app values."]}
	            response={{
	              confidenceThreshold: 0.9,
	              labels: [
	                { name: "Invoice", description: "Use when confidence is at least 0.9." },
	                { name: "Client Ops", description: "Operational client messages." },
	              ],
	              "email-label": {
	                markdown:
	                  "You are an email labeling assistant.\n\nUse the confidence threshold of 0.90 to decide whether an email can be labeled automatically.\n\nAvailable labels:\n\n| Name | Description |\n| --- | --- |\n| Invoice | Use when confidence is at least 0.9. |",
	              },
	              "draft-reply": {
	                markdown:
	                  "You are an email reply assistant.\n\nThe voice should be warm but not overly casual. Use simple sentences and make the message clear and tactful.",
	              },
	            }}
	          />
          <EndpointDoc
            method="POST"
            path="/api/integrations/email-rules/query"
            title="Query email rules"
            notes={[
              "Supported equivalences: equals, notEquals, contains.",
              "contains works with fromEmail, fromName, and subject. isPending supports equals and notEquals.",
            ]}
            payload={{
              query: {
                operator: "AND",
                conditions: [
                  {
                    operator: "OR",
                    conditions: [
                      { field: "fromEmail", equivalence: "equals", value: "someone@gmail.com" },
                      { field: "fromName", equivalence: "contains", value: "Michael" },
                    ],
                  },
                  { field: "isPending", equivalence: "equals", value: false },
                ],
              },
              limit: 50,
            }}
            response={{
              rules: [
                {
                  emailId: "19e394a85255976b",
                  fromEmail: "someone@gmail.com",
                  subject: "Hello",
                  labelsApplied: ["AI/Low Priority"],
                  isPending: false,
                },
              ],
            }}
          />
          <EndpointDoc
            method="POST"
            path="/api/integrations/email/labels/add"
            title="Classify and label an email"
            notes={[
              "Provide up to 3 label candidates with confidence and reason.",
              "If exactly one label has the highest confidence and it meets the current threshold, that label is applied to the email.",
              "If labels tie, no label meets the threshold, or no labels are provided, Emailable creates a pending rule for review.",
              "Folder-based accounts move the email to the selected label's folder.",
            ]}
            payload={{
              emailId: "188c1f2d7e1a1234",
              threadId: "188c1f2d7e1a1234",
              fromEmail: "vendor@example.com",
              fromName: "Vendor Billing",
              subject: "Invoice for review",
              snippet: "Please review the attached invoice.",
              labelsApplied: [
                { labelName: "Invoice", confidence: 0.94, reason: "The message includes an invoice and payment request." },
                { labelName: "Needs Review", confidence: 0.74, reason: "The user may need to review the attachment." },
              ],
            }}
            response={{
              action: "labels_added",
              threshold: 0.9,
              confidence: 0.94,
              accountEmail: "user@gmail.com",
              emailId: "188c1f2d7e1a1234",
              added: [{ name: "Invoice", providerLabelId: "Label_123" }],
            }}
          />
          <EndpointDoc
            method="POST"
            path="/api/integrations/email/labels/remove"
            title="Remove labels from an email"
            notes={["Exactly one label can be removed per request."]}
            payload={{
              accountEmail: "user@gmail.com",
              emailId: "188c1f2d7e1a1234",
              labels: ["Needs Review"],
            }}
            response={{
              accountEmail: "user@gmail.com",
              emailId: "188c1f2d7e1a1234",
              removed: [{ name: "Needs Review", providerLabelId: "Label_789" }],
            }}
          />
          <EndpointDoc
            method="POST"
            path="/api/integrations/email/drafts/reply"
            title="Create a draft email reply"
            payload={{
              accountEmail: "user@gmail.com",
              emailId: "188c1f2d7e1a1234",
              bodyText: "Thanks for the update. I will review this and follow up shortly.",
              replyAll: false,
            }}
            response={{
              accountEmail: "user@gmail.com",
              emailId: "188c1f2d7e1a1234",
              draftId: "r123456789",
              messageId: "msg_123",
              threadId: "188c1f2d7e1a1234",
            }}
          />
          <div className="border-t border-zinc-200 pt-4">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-zinc-950">Emailable AI endpoints</p>
                <p className="text-sm text-zinc-500">These endpoints use your saved AI platforms and prompt templates.</p>
              </div>
              <AiEnableSwitch
                canEnable={Boolean(aiConfig?.canEnableAi)}
                disabled={isTogglingAi || !aiConfig}
                enabled={Boolean(aiConfig?.aiEnabled)}
                label="Activate"
                onChange={(value) => void toggleEndpointAiEnabled(value)}
              />
            </div>
            <div className="space-y-3">
              <EndpointDoc
                method="POST"
                path="/api/integrations/ai/reply"
                statusBadge={<AiEndpointStatusBadge enabled={Boolean(aiConfig?.aiEnabled)} />}
                title="AI Reply"
                notes={[
                  "Requires Activate to be on.",
                  "accountEmail is optional. When present, Emailable uses it to find the email faster.",
                  "Uses the Draft Reply prompt as the system prompt and creates a provider draft reply from the AI response.",
                ]}
                payload={{
                  emailId: "188c1f2d7e1a1234",
                  accountEmail: "user@example.com",
                }}
                response={{
                  action: "draft_created",
                  accountEmail: "user@example.com",
                  emailId: "188c1f2d7e1a1234",
                  draftId: "draft-provider-id",
                  payload: {
                    to: "sender@example.com",
                    subject: "Re: Example subject",
                    bodyText: "Thanks for the note. I will review this and follow up shortly.",
                  },
                }}
              />
              <EndpointDoc
                method="POST"
                path="/api/integrations/ai/label"
                statusBadge={<AiEndpointStatusBadge enabled={Boolean(aiConfig?.aiEnabled)} />}
                title="AI Label"
                notes={[
                  "Requires Activate to be on.",
                  "Uses the Email Label prompt as the system prompt.",
                  "The AI returns label candidates and Emailable applies the highest-confidence label or creates a pending rule for review.",
                ]}
                payload={{
                  emailId: "188c1f2d7e1a1234",
                  accountEmail: "user@example.com",
                }}
                response={{
                  action: "labels_added",
                  threshold: 0.9,
                  confidence: 0.94,
                  accountEmail: "user@example.com",
                  emailId: "188c1f2d7e1a1234",
                  added: [{ name: "Invoice", providerLabelId: "Label_123" }],
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function McpServerPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [apiKeys, setApiKeys] = useState<IntegrationApiKey[]>([]);
  const [keyName, setKeyName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [isMcpServerDisabled, setIsMcpServerDisabled] = useState(false);
  const [disabledReason, setDisabledReason] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mcpEndpoint = getAbsoluteRuntimeUrl("/mcp");

  useEffect(() => {
    void loadMcpKeys();
  }, []);

  async function loadMcpKeys() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/mcp-api-keys", { credentials: "include" });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not load MCP keys.");
        return;
      }

      setApiKeys(data.keys ?? []);
      setIsMcpServerDisabled(Boolean(data.disabled));
      setDisabledReason(data.disabledReason ?? "");
    } catch {
      setError("Could not load MCP keys.");
    } finally {
      setIsLoading(false);
    }
  }

  async function createMcpKey() {
    setIsSaving(true);
    setError(null);
    setNewToken(null);

    if (isMcpServerDisabled) {
      setError("MCP Server is disabled while MCP Client is active.");
      setIsSaving(false);
      return;
    }

    try {
      const response = await fetch("/api/mcp-api-keys", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: keyName || "MCP client" }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not create MCP key.");
        return;
      }

      setNewToken(data.token);
      setKeyName("");
      await loadMcpKeys();
    } catch {
      setError("Could not create MCP key.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteMcpKey(id: string) {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/mcp-api-keys/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not revoke MCP key.");
        return;
      }

      await loadMcpKeys();
    } catch {
      setError("Could not revoke MCP key.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>MCP Server</CardTitle>
          <CardDescription>Use Streamable HTTP with Authorization: Bearer &lt;token&gt;.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-zinc-200 glass-panel p-4">
            <p className="text-sm font-medium text-zinc-950">Streamable HTTP endpoint</p>
            <code className="mt-2 block overflow-x-auto glass-panel rounded-md p-3 text-xs text-zinc-900">{mcpEndpoint}</code>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,260px)_auto]">
            <input
              className="h-10 w-full glass-panel rounded-md border px-3 text-sm outline-none transition-colors focus:border-zinc-400"
              maxLength={60}
              onChange={(event) => setKeyName(event.target.value)}
              placeholder="Key name"
              value={keyName}
            />
            <Button disabled={isSaving || isMcpServerDisabled} onClick={() => void createMcpKey()} type="button">
              <Plus className="h-4 w-4" />
              Create MCP Key
            </Button>
          </div>

          {newToken ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-medium text-emerald-900">Copy this key now. It will only be shown once.</p>
              <code className="mt-2 block overflow-x-auto glass-panel rounded-md p-3 text-xs text-zinc-900">{newToken}</code>
            </div>
          ) : null}

          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {isMcpServerDisabled ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {disabledReason || "MCP Server is disabled while MCP Client is active."}{" "}
              <button className="font-medium text-amber-950 underline" onClick={() => onNavigate("ai-byoai")} type="button">
                Deactivate MCP Client
              </button>
              {" "}to enable this server again.
            </p>
          ) : null}

          <div className="overflow-hidden rounded-md border border-zinc-200">
            <div className="grid grid-cols-[1fr_140px_120px] gap-3 border-b border-zinc-200 glass-panel px-4 py-3 text-xs font-medium uppercase text-zinc-500">
              <span>Key</span>
              <span>Last used</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-zinc-200">
              {isLoading ? (
                <div className="px-4 py-4 text-sm text-zinc-500">Loading MCP keys...</div>
              ) : apiKeys.length === 0 ? (
                <div className="px-4 py-4 text-sm text-zinc-500">No MCP keys yet.</div>
              ) : (
                apiKeys.map((apiKey) => (
                  <div className="grid grid-cols-[1fr_140px_120px] items-center gap-3 px-4 py-3" key={apiKey.id}>
                    <div>
                      <p className="text-sm font-medium text-zinc-950">{apiKey.name}</p>
                      <p className="text-xs text-zinc-500">{apiKey.keyPrefix}...</p>
                    </div>
                    <span className="text-sm text-zinc-600">{apiKey.lastUsedAt ? formatDate(apiKey.lastUsedAt) : "Never"}</span>
                    <div className="flex justify-end">
                      <Button disabled={isSaving} onClick={() => void deleteMcpKey(apiKey.id)} size="sm" type="button" variant="outline">
                        Revoke
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MCP Tools</CardTitle>
          <CardDescription>Available tools for connected MCP clients.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isMcpServerDisabled ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              MCP Server tools are disabled because MCP Client is active.{" "}
              <button className="font-medium underline" onClick={() => onNavigate("ai-byoai")} type="button">
                Go to BYOAI
              </button>
              {" "}and deactivate MCP Client to use this server.
            </p>
          ) : null}
          <EndpointDoc
            method="TOOL"
            path="create_draft_reply"
            statusBadge={isMcpServerDisabled ? <Badge className="bg-red-50 text-red-700">Disabled</Badge> : undefined}
            title="Create Draft Reply"
            payload={{
              accountEmail: "user@gmail.com",
              emailId: "188c1f2d7e1a1234",
              bodyText: "Thanks for the update. I will review this and follow up shortly.",
              replyAll: false,
            }}
            response={{ draftId: "r123", messageId: "188c1f2d7e1a1234", threadId: "188c1f2d7e1a1234" }}
          />
          <EndpointDoc
            method="TOOL"
            path="add_labels_on_email"
            statusBadge={isMcpServerDisabled ? <Badge className="bg-red-50 text-red-700">Disabled</Badge> : undefined}
            title="Add Labels On Email"
            notes={[
              "Payload matches the REST classify-and-label endpoint.",
              "labelsApplied supports up to 3 label candidate objects.",
              "When exactly one candidate has the highest confidence and it meets the current threshold, that label is applied.",
              "When candidates tie, no candidate meets the threshold, or no candidates are provided, a pending rule is created.",
            ]}
            payload={{
              emailId: "188c1f2d7e1a1234",
              threadId: "188c1f2d7e1a1234",
              fromEmail: "someone@gmail.com",
              fromName: "Michael Montaque",
              subject: "Invoice for review",
              snippet: "Please review the attached invoice.",
              labelsApplied: [
                { labelName: "Invoice", confidence: 0.87, reason: "Use for vendor invoices and payment requests." },
                { labelName: "Needs Review", confidence: 0.87, reason: "Use when the message needs human follow-up." },
              ],
            }}
            response={{ action: "pending_rule_created", threshold: 0.9, confidence: 0.87 }}
          />
          <EndpointDoc
            method="TOOL"
            path="query_email_rules"
            statusBadge={isMcpServerDisabled ? <Badge className="bg-red-50 text-red-700">Disabled</Badge> : undefined}
            title="Query Email Rules"
            notes={["Supported equivalences: equals, notEquals, contains."]}
            payload={{
              query: {
                operator: "AND",
                conditions: [
                  { field: "fromEmail", equivalence: "contains", value: "gmail.com" },
                  { field: "isPending", equivalence: "equals", value: true },
                ],
              },
              limit: 25,
            }}
            response={{ rules: [{ emailId: "188c1f2d7e1a1234", isPending: true }] }}
          />
          <EndpointDoc
            method="TOOL"
            path="find_email"
            statusBadge={isMcpServerDisabled ? <Badge className="bg-red-50 text-red-700">Disabled</Badge> : undefined}
            title="Find Email"
            notes={[
              "All fields are optional. If no fields are supplied, no results are returned.",
              "The to field narrows the search to the connected account with that email address.",
              "emailId, subject, and from are used to find specific matching emails.",
            ]}
            payload={{
              emailId: "188c1f2d7e1a1234",
              subject: "Invoice for review",
              from: "vendor@example.com",
              to: "user@gmail.com",
            }}
            response={{
              emails: [
                {
                  accountEmail: "user@gmail.com",
                  provider: "gmail",
                  emailId: "188c1f2d7e1a1234",
                  threadId: "188c1f2d7e1a1234",
                  fromEmail: "vendor@example.com",
                  subject: "Invoice for review",
                  snippet: "Please review the attached invoice.",
                },
              ],
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function EndpointDoc({
  method,
  path,
  statusBadge,
  title,
  payload,
  response,
  notes,
}: {
  method: string;
  path: string;
  statusBadge?: ReactNode;
  title: string;
  payload?: Record<string, unknown>;
  response: Record<string, unknown> | Array<Record<string, unknown>>;
  notes?: string[];
}) {
  const [copied, setCopied] = useState(false);
  const copyValue = path.startsWith("/") ? getAbsoluteRuntimeUrl(path) : path;

  async function copyEndpoint(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    try {
      await navigator.clipboard.writeText(copyValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <details className="glass-panel rounded-md border">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-sm font-medium text-zinc-950">
        <span>{title}</span>
        {statusBadge ? <span>{statusBadge}</span> : null}
        <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600">
          {method} {path}
        </span>
        <Tooltip text={path.startsWith("/") ? `Copy ${copyValue}` : "Copy tool name"}>
          <button
            aria-label={`Copy ${title} endpoint`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white/70 text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-white hover:text-zinc-950"
            onClick={(event) => void copyEndpoint(event)}
            type="button"
          >
            {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </Tooltip>
      </summary>
      <div className="space-y-3 border-t border-zinc-200 p-4">
        {notes?.length ? (
          <div className="rounded-md glass-panel p-3 text-sm text-zinc-600">
            {notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        ) : null}
        {payload ? (
          <div>
            <p className="mb-2 text-xs font-medium uppercase text-zinc-500">Payload</p>
            <pre className="overflow-x-auto rounded-md bg-zinc-950 p-3 text-xs text-white">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </div>
        ) : null}
        <div>
          <p className="mb-2 text-xs font-medium uppercase text-zinc-500">Response</p>
          <pre className="overflow-x-auto rounded-md bg-zinc-950 p-3 text-xs text-white">
            {JSON.stringify(response, null, 2)}
          </pre>
        </div>
      </div>
    </details>
  );
}

function AiEndpointStatusBadge({ enabled }: { enabled: boolean }) {
  const badge = enabled ? (
    <Badge className="bg-emerald-50 text-emerald-700">Enabled</Badge>
  ) : (
    <Badge className="bg-red-50 text-red-700">Disabled</Badge>
  );

  if (enabled) {
    return badge;
  }

  return <Tooltip text="Enable this by turning on Activate after saving a working AI platform.">{badge}</Tooltip>;
}

function ConfidenceThresholdPage() {
  const [threshold, setThreshold] = useState("0.90");
  const [savedThreshold, setSavedThreshold] = useState("0.90");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const validationError = validateConfidenceThreshold(threshold);
  const hasChanges = threshold !== savedThreshold;

  useEffect(() => {
    async function loadThreshold() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/settings/confidence-threshold", { credentials: "include" });
        const data = await response.json();

        if (!response.ok) {
          setError(data.error ?? "Could not load confidence threshold.");
          return;
        }

        const formattedThreshold = formatThreshold(data.threshold ?? 0.9);
        setThreshold(formattedThreshold);
        setSavedThreshold(formattedThreshold);
      } catch {
        setError("Could not load confidence threshold.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadThreshold();
  }, []);

  async function saveThreshold() {
    const currentValidationError = validateConfidenceThreshold(threshold);

    if (currentValidationError) {
      setError(currentValidationError);
      setMessage(null);
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/settings/confidence-threshold", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold: Number(threshold) }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not save confidence threshold.");
        return;
      }

      const formattedThreshold = formatThreshold(data.threshold);
      setThreshold(formattedThreshold);
      setSavedThreshold(formattedThreshold);
      setMessage("Confidence threshold saved successfully.");
    } catch {
      setError("Could not save confidence threshold.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Confidence Threshold</CardTitle>
          <CardDescription>
            The confidence threshold helps the AI figure out how confident it should be before it can label an email
            without asking for clarification. The threshold determines whether the AI can confidently auto-label the
            email or if the email should instead be reviewed by the user.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="max-w-xs">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-zinc-700">Threshold</span>
              <input
                className="h-10 w-full glass-panel rounded-md border px-3 text-sm outline-none transition-colors focus:border-zinc-400"
                disabled={isLoading}
                max="1"
                min="0.01"
                onChange={(event) => {
                  setThreshold(event.target.value);
                  setMessage(null);
                }}
                step="0.01"
                type="number"
                value={threshold}
              />
            </label>
            <p className="mt-1 text-xs text-zinc-500">Enter a value from 0.01 to 1.</p>
          </div>

          <div className="overflow-hidden rounded-md border border-zinc-200">
            <div className="grid grid-cols-[120px_1fr] border-b border-zinc-200 glass-panel px-4 py-3 text-xs font-medium uppercase text-zinc-500">
              <span>Threshold</span>
              <span>Behavior</span>
            </div>
            {[
              ["0.95", "Very conservative"],
              ["0.90", "Recommended"],
              ["0.80", "More aggressive automation"],
              ["0.70", "High automation but higher risk"],
            ].map(([value, behavior]) => (
              <div className="grid grid-cols-[120px_1fr] border-b border-zinc-100 px-4 py-3 text-sm last:border-b-0" key={value}>
                <span className="font-medium text-zinc-950">{value}</span>
                <span className="text-zinc-600">{behavior}</span>
              </div>
            ))}
          </div>

          {validationError ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{validationError}</p> : null}
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {message ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}

          <Button disabled={isLoading || isSaving || !hasChanges || Boolean(validationError)} onClick={saveThreshold} type="button">
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  actionLabel,
  icon: Icon,
  label,
  loading,
  onAction,
  value,
}: {
  actionLabel?: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  loading?: boolean;
  onAction?: () => void;
  value: string;
}) {
  return (
    <Card className="min-h-36">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription>{label}</CardDescription>
        <Icon className="h-4 w-4 text-zinc-500" />
      </CardHeader>
      <CardContent className="flex min-h-20 flex-col justify-between gap-4">
        <p className="text-2xl font-semibold">{loading ? "..." : value}</p>
        {actionLabel && onAction ? (
          <button
            className="group inline-flex cursor-pointer items-center gap-1 self-end text-sm font-semibold text-blue-700 underline decoration-blue-200 underline-offset-4 transition-colors hover:text-blue-900 hover:decoration-blue-700"
            onClick={onAction}
            type="button"
          >
            <span>{actionLabel}</span>
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StepProgress({ currentStep, steps }: { currentStep: number; steps: string[] }) {
  const progressPercent = steps.length <= 1 ? 100 : ((currentStep - 1) / (steps.length - 1)) * 100;

  return (
    <div className="mx-auto mb-5 w-full max-w-56 sm:w-1/2">
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isComplete = stepNumber < currentStep;
          const isActive = stepNumber === currentStep;

          return (
            <div className={cn("flex items-center gap-1.5", index === steps.length - 1 && "justify-end", index > 0 && index < steps.length - 1 && "justify-center")} key={step}>
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-sm border text-[10px]",
                  isComplete && "border-zinc-900 bg-zinc-900 text-white",
                  isActive && "border-zinc-900 bg-white text-zinc-900",
                  !isComplete && !isActive && "border-zinc-300 bg-white text-zinc-400",
                )}
              >
                {isComplete ? <CheckCircle2 className="h-3 w-3" /> : stepNumber}
              </span>
              <span className={cn("text-[11px] font-semibold uppercase tracking-[0.16em]", isActive ? "text-zinc-950" : isComplete ? "text-zinc-700" : "text-zinc-400")}>
                {step}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 h-px rounded-full bg-zinc-200">
        <div className="h-px rounded-full bg-zinc-900 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
      </div>
    </div>
  );
}

function TimelineChartCard({ data, isLoading, title }: { data: TimelinePoint[]; isLoading: boolean; title: string }) {
  const total = data.reduce((sum, point) => sum + Number(point.value), 0);
  const chartData = data.map((point) => ({
    ...point,
    label: formatShortDate(point.date),
    value: Number(point.value),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Last 14 days</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-zinc-300 text-sm text-zinc-500">
            Loading chart...
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-3xl font-semibold">{formatNumber(total)}</p>
            <div className="h-48 w-full">
              <ResponsiveContainer height="100%" width="100%">
                <LineChart data={chartData} margin={{ bottom: 4, left: -24, right: 10, top: 8 }}>
                  <XAxis
                    axisLine={false}
                    dataKey="label"
                    interval="preserveStartEnd"
                    tick={{ fill: "#71717a", fontSize: 12 }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    tick={{ fill: "#71717a", fontSize: 12 }}
                    tickLine={false}
                    width={36}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      border: "1px solid #e4e4e7",
                      borderRadius: 6,
                      boxShadow: "0 8px 24px rgba(24, 24, 27, 0.08)",
                      fontSize: 12,
                    }}
                    labelFormatter={(_, payload) => formatShortDate(payload?.[0]?.payload?.date)}
                    formatter={(value) => [formatNumber(Number(value)), title]}
                  />
                  <Line
                    activeDot={{ r: 5, stroke: "#18181b", strokeWidth: 2 }}
                    dataKey="value"
                    dot={{ r: 3, stroke: "#18181b", strokeWidth: 2, fill: "#ffffff" }}
                    stroke="#18181b"
                    strokeWidth={2.5}
                    type="monotone"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RuleStatusDonut({ isLoading, pending, nonPending }: { isLoading: boolean; pending: number; nonPending: number }) {
  const total = pending + nonPending;
  const reviewedPercent = total > 0 ? Math.round((nonPending / total) * 100) : 0;
  const chartData = [
    { name: "Non-pending", value: nonPending, color: "#10b981" },
    { name: "Pending", value: pending, color: "#f59e0b" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending vs Non-Pending Rules</CardTitle>
        <CardDescription>Current rule review status</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-zinc-300 text-sm text-zinc-500">
            Loading chart...
          </div>
        ) : (
          <div className="grid items-center gap-6 md:grid-cols-[220px_1fr]">
            <div className="relative h-56 w-56">
              <ResponsiveContainer height="100%" width="100%">
                <PieChart>
                  <Pie
                    data={total > 0 ? chartData : [{ name: "No rules", value: 1, color: "#e4e4e7" }]}
                    dataKey="value"
                    endAngle={-270}
                    innerRadius={70}
                    outerRadius={98}
                    paddingAngle={total > 0 ? 2 : 0}
                    startAngle={90}
                    stroke="none"
                  >
                    {(total > 0 ? chartData : [{ name: "No rules", value: 1, color: "#e4e4e7" }]).map((entry) => (
                      <Cell fill={entry.color} key={entry.name} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{
                      border: "1px solid #e4e4e7",
                      borderRadius: 6,
                      boxShadow: "0 8px 24px rgba(24, 24, 27, 0.08)",
                      fontSize: 12,
                    }}
                    formatter={(value, name) => [formatNumber(Number(value)), name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-3xl font-semibold">{reviewedPercent}%</p>
                <p className="text-xs uppercase text-zinc-500">Reviewed</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2 text-sm">
                <span className="text-emerald-800">Non-pending</span>
                <span className="font-semibold text-emerald-900">{formatNumber(nonPending)}</span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-amber-50 px-3 py-2 text-sm">
                <span className="text-amber-800">Pending</span>
                <span className="font-semibold text-amber-900">{formatNumber(pending)}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Tooltip({
  align = "center",
  children,
  side = "top",
  text,
}: {
  align?: "center" | "start" | "end";
  children: ReactNode;
  side?: "top" | "bottom";
  text: string;
}) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        className={cn(
          "pointer-events-none absolute z-20 w-max max-w-64 whitespace-normal rounded-md border border-white/70 bg-white/65 px-3 py-2 text-left text-xs font-medium leading-5 text-zinc-800 opacity-0 shadow-xl shadow-slate-900/10 ring-1 ring-zinc-200/40 backdrop-blur-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
          align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2",
          side === "bottom" ? "top-full mt-2" : "bottom-full mb-2",
        )}
      >
        {text}
      </span>
    </span>
  );
}

function Loader() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

function EmailableLogo({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient gradientUnits="userSpaceOnUse" id="emailable-logo-gradient" x1="8" x2="56" y1="14" y2="50">
          <stop stopColor="#06b6d4" />
          <stop offset="0.52" stopColor="#2563eb" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <path
        d="M13 19.5h39a3.5 3.5 0 0 1 2.1 6.3L35.4 39.9a5.6 5.6 0 0 1-6.8 0L9.9 25.8A3.5 3.5 0 0 1 12 19.5h1Z"
        stroke="url(#emailable-logo-gradient)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      />
      <path
        d="M9.5 24v22.5A5.5 5.5 0 0 0 15 52h34a5.5 5.5 0 0 0 5.5-5.5V31.5"
        stroke="url(#emailable-logo-gradient)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      />
    </svg>
  );
}

function UserAvatar({ className, user }: { className?: string; user: AuthUser }) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = getUserInitials(user);

  if (user.picture && !imageFailed) {
    return (
      <img
        alt=""
        className={cn("rounded-full border border-zinc-200 bg-zinc-100 object-cover", className)}
        onError={() => setImageFailed(true)}
        referrerPolicy="no-referrer"
        src={user.picture}
      />
    );
  }

  return (
    <span className={cn("flex items-center justify-center rounded-full bg-zinc-950 text-xs font-semibold text-white", className)}>
      {initials}
    </span>
  );
}

function getUserInitials(user: AuthUser) {
  const source = user.name || user.email || "User";
  const words = source
    .replace(/@.*/, "")
    .split(/\s+|[._-]+/)
    .map((word) => word.trim())
    .filter(Boolean);

  return (words[0]?.[0] ?? "U").toUpperCase() + (words[1]?.[0] ?? "").toUpperCase();
}

function formatEmailForPrivacy(value: string, privacyMode: boolean) {
  if (!privacyMode) {
    return value;
  }

  const [localPart, domain] = value.split("@");
  if (!localPart || !domain) {
    return value;
  }

  const first = localPart.slice(0, 2);
  const last = localPart.slice(-2);
  const maskLength = Math.max(4, localPart.length - first.length - last.length);

  return `${first}${"*".repeat(maskLength)}${last}@${domain}`;
}

function formatEmailTextForPrivacy(value: string, privacyMode: boolean) {
  if (!privacyMode) {
    return value;
  }

  return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (email) => formatEmailForPrivacy(email, true));
}

function extractEmailAddressFromText(value = "") {
  const angleMatch = value.match(/<([^>]+)>/);
  const emailMatch = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return (angleMatch?.[1] ?? emailMatch?.[0] ?? "").trim();
}

function extractDisplayNameFromText(value = "") {
  const match = value.match(/^"?([^"<]+)"?\s*</);
  return (match?.[1] ?? "").trim();
}

function extractEmailForSearch(value = "") {
  return extractEmailAddressFromText(value).replace(/"/g, "");
}

function mapAuthUser(user: { email?: string | null; name?: string | null; image?: string | null; homeAssistant?: boolean }): AuthUser {
  return {
    email: user.email ?? "Signed-in user",
    name: user.name || user.email || "Signed-in user",
    picture: user.image,
    homeAssistant: Boolean(user.homeAssistant),
  };
}

function validateLabelInput(name: string, description: string) {
  const trimmedName = name.trim();
  const trimmedDescription = description.trim();

  if (!trimmedName) {
    return "Label name is required.";
  }

  if (trimmedName.length > LABEL_NAME_MAX_LENGTH) {
    return `Label name must be ${LABEL_NAME_MAX_LENGTH} characters or less.`;
  }

  if (!LABEL_NAME_PATTERN.test(trimmedName)) {
    return "Label name can only use letters, numbers, spaces, hyphens, and underscores.";
  }

  if (trimmedDescription.length > LABEL_DESCRIPTION_MAX_LENGTH) {
    return `Label description must be ${LABEL_DESCRIPTION_MAX_LENGTH} characters or less.`;
  }

  return null;
}

function parseCsvRows(text: string) {
  const normalizedText = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let isQuoted = false;

  for (let index = 0; index < normalizedText.length; index += 1) {
    const char = normalizedText[index];
    const nextChar = normalizedText[index + 1];

    if (char === '"') {
      if (isQuoted && nextChar === '"') {
        field += '"';
        index += 1;
      } else {
        isQuoted = !isQuoted;
      }
      continue;
    }

    if (char === "," && !isQuoted) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !isQuoted) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (isQuoted) {
    throw new Error("CSV has an unterminated quoted value.");
  }

  row.push(field);
  rows.push(row);

  return rows.filter((csvRow, index) => index === 0 || csvRow.some((value) => value.trim() !== ""));
}

function renderLabelDescription(description: string, confidenceThreshold: string) {
  if (!description) {
    return "No description";
  }

  return description.split(CONFIDENCE_THRESHOLD_TEMPLATE).join(confidenceThreshold);
}

function getFailedSyncs(label: Label) {
  return (label.syncs ?? []).filter((sync) => sync.syncStatus === "failed");
}

function isLabelFullySynced(label: Label, connectedAccountCount: number) {
  if (connectedAccountCount === 0) {
    return false;
  }

  const syncedAccountIds = new Set(
    (label.syncs ?? [])
      .filter((sync) => sync.syncStatus === "synced" && sync.providerLabelId)
      .map((sync) => sync.emailAccountId),
  );

  return syncedAccountIds.size >= connectedAccountCount;
}

function sameStringSet(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}

function pickLabelReasons(labels: string[], reasons: Record<string, string>) {
  return labels.reduce<Record<string, string>>((selectedReasons, label) => {
    selectedReasons[label] = reasons[label]?.trim() ?? "";
    return selectedReasons;
  }, {});
}

function getSuggestedRuleLabel(rule: EmailRule) {
  const suggestions = Array.isArray(rule.labelsApplied) ? rule.labelsApplied.filter(Boolean) : [];
  if (suggestions.length === 0) return "";

  const confidences = rule.labelConfidences ?? {};
  return suggestions.reduce((bestLabel, label) => {
    const bestConfidence = Number(confidences[bestLabel]);
    const candidateConfidence = Number(confidences[label]);
    if (!Number.isFinite(candidateConfidence)) return bestLabel;
    if (!Number.isFinite(bestConfidence) || candidateConfidence > bestConfidence) return label;
    return bestLabel;
  }, suggestions[0]);
}

function formatRuleLabelReasons(rule: EmailRule) {
  const labelReasons = rule.labelReasons ?? {};
  const reasonParts = rule.labelsApplied
    .map((label) => labelReasons[label]?.trim())
    .filter(Boolean);

  return reasonParts.length > 0 ? reasonParts.join(" ") : "No label reasoning provided.";
}

function sameLabelReasons(left: Record<string, string>, right: Record<string, string>, labels: string[]) {
  return labels.every((label) => (left[label] ?? "").trim() === (right[label] ?? "").trim());
}

function groupRules(rules: EmailRule[], groupBy: RuleGroupBy) {
  if (groupBy === "none") {
    return [{ label: "All rules", rules }];
  }

  const groups = new Map<string, EmailRule[]>();

  for (const rule of rules) {
    const label =
      groupBy === "isPending"
        ? rule.isPending
          ? "Pending"
          : "Reviewed"
        : rule.fromEmail || "Unknown sender";
    const group = groups.get(label) ?? [];
    group.push(rule);
    groups.set(label, group);
  }

  return [...groups.entries()].map(([label, groupedRules]) => ({ label, rules: groupedRules }));
}

function confidenceClass(confidence: number, threshold: number) {
  if (confidence >= threshold) {
    return "bg-emerald-100 text-emerald-800";
  }

  if (confidence >= threshold - 0.05) {
    return "bg-lime-100 text-lime-800";
  }

  if (confidence >= threshold - 0.15) {
    return "bg-amber-100 text-amber-800";
  }

  return "bg-red-100 text-red-800";
}

function validateConfidenceThreshold(value: string) {
  if (!value) {
    return "Confidence threshold is required.";
  }

  const threshold = Number(value);

  if (!Number.isFinite(threshold)) {
    return "Confidence threshold must be a number.";
  }

  if (threshold < 0.01 || threshold > 1) {
    return "Confidence threshold must be between 0.01 and 1.";
  }

  return null;
}

function validateWebhookUrl(value: string) {
  const url = value.trim();

  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return "Webhook URL must use http or https.";
    }
  } catch {
    return "Webhook URL must be a valid URL.";
  }

  return null;
}

function formatThreshold(value: number | string) {
  return Number(value).toFixed(2);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatShortDate(value?: string) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function renderMarkdownHtml(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listType: "ol" | "ul" = "ul";
  let orderedListStart = 1;

  function flushParagraph() {
    if (paragraph.length > 0) {
      html.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  }

  function flushList() {
    if (listItems.length > 0) {
      const startAttribute = listType === "ol" && orderedListStart !== 1 ? ` start="${orderedListStart}"` : "";
      html.push(`<${listType}${startAttribute}>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</${listType}>`);
      listItems = [];
      orderedListStart = 1;
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    if (trimmed.startsWith("```")) {
      flushParagraph();
      flushList();
      const language = trimmed.slice(3).trim().replace(/[^a-zA-Z0-9_-]/g, "");
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      html.push(`<pre><code${language ? ` class="language-${language}"` : ""}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    if (isMarkdownTableAt(lines, index)) {
      flushParagraph();
      flushList();
      const table = readMarkdownTable(lines, index);
      html.push(renderMarkdownTable(table.rows));
      index = table.nextIndex - 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const listItem = trimmed.match(/^[-*]\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      if (listItems.length > 0 && listType !== "ul") {
        flushList();
      }
      listType = "ul";
      listItems.push(listItem[1]);
      continue;
    }

    const orderedListItem = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
    if (orderedListItem) {
      flushParagraph();
      if (listItems.length > 0 && listType !== "ol") {
        flushList();
      }
      listType = "ol";
      if (listItems.length === 0) {
        orderedListStart = Number(orderedListItem[1]) || 1;
      }
      listItems.push(orderedListItem[2]);
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      flushParagraph();
      flushList();
      html.push("<hr>");
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();

  return html.join("");
}

function renderInlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/\[([^\]]+)]\(([^)\s]+)\)/g, (_match, label, href) => renderMarkdownLink(label, href));
}

function renderMarkdownLink(label: string, href: string) {
  const safeHref = /^(https?:\/\/|\/|\.\/|\.\.\/|#)/i.test(href) || /^[a-z0-9][a-z0-9/_-]*$/i.test(href) ? href : "#";
  const external = /^https?:\/\//i.test(safeHref);
  return `<a href="${safeHref}"${external ? ' target="_blank" rel="noreferrer"' : ""}>${label}</a>`;
}

function isMarkdownTableAt(lines: string[], index: number) {
  const header = lines[index]?.trim();
  const separator = lines[index + 1]?.trim();
  return Boolean(header?.startsWith("|") && header.endsWith("|") && /^(\|\s*:?-+:?\s*)+\|$/.test(separator ?? ""));
}

function readMarkdownTable(lines: string[], startIndex: number) {
  const rows = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line.startsWith("|") || !line.endsWith("|")) {
      break;
    }

    if (index !== startIndex + 1) {
      rows.push(line.slice(1, -1).split("|").map((cell) => cell.trim()));
    }

    index += 1;
  }

  return { rows, nextIndex: index };
}

function renderMarkdownTable(rows: string[][]) {
  if (rows.length === 0) {
    return "";
  }

  const [header, ...body] = rows;
  return `
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:0.875rem">
        <thead>
          <tr>${header.map((cell) => `<th style="border:1px solid #e4e4e7;padding:8px;text-align:left;background:#f4f4f5">${renderInlineMarkdown(cell)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${body
            .map(
              (row) =>
                `<tr>${row.map((cell) => `<td style="border:1px solid #e4e4e7;padding:8px;vertical-align:top">${renderInlineMarkdown(cell)}</td>`).join("")}</tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isAiPromptsPage(page: Page) {
  return page === "ai-prompts" || page === "ai-byoai" || page === "ai-prompt-library";
}

function isSettingsPage(page: Page) {
  return page === "settings" || page === "confidence-threshold" || page === "email-accounts" || page === "endpoints" || page === "webhook" || page === "mcp-server";
}

const pagePaths: Record<Page, string> = {
  overview: "/",
  inbox: "/inbox",
  labels: "/labels",
  rules: "/rule-review",
  metrics: "/metrics",
  documentation: "/documentation",
  "ai-prompts": "/ai-prompts",
  "ai-byoai": "/ai/byoai",
  "ai-prompt-library": "/ai/prompts",
  "ai-email-label": "/ai/prompts/email-label",
  "ai-draft-reply": "/ai/prompts/draft-reply",
  settings: "/settings",
  "confidence-threshold": "/settings/confidence-threshold",
  "email-accounts": "/settings/email-accounts",
  endpoints: "/settings/endpoints",
  webhook: "/settings/webhook",
  "mcp-server": "/settings/mcp-server",
};

function pathForPage(page: Page) {
  return pagePaths[page] ?? "/";
}

function pageFromPath(pathname: string): Page {
  const normalizedPath = stripRuntimeBasePath(pathname);

  if (normalizedPath === "/metrics/logs") {
    return "metrics";
  }

  if (normalizedPath.startsWith("/documentation")) {
    return "documentation";
  }

  if (normalizedPath.startsWith("/ai/prompts")) {
    return "ai-prompt-library";
  }

  const match = (Object.entries(pagePaths) as Array<[Page, string]>).find(([, path]) => path === normalizedPath);
  return match?.[0] ?? "overview";
}

function stripRuntimeBasePath(pathname: string) {
  const basePath = getRuntimeBasePath();
  const withoutBase = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) : pathname;
  return withoutBase.replace(/\/+$/, "") || "/";
}

function metricsTabFromPath(pathname: string): "metrics" | "logs" {
  return stripRuntimeBasePath(pathname) === "/metrics/logs" ? "logs" : "metrics";
}

function promptTabFromPath(pathname: string): "email-label" | "draft-reply" {
  return stripRuntimeBasePath(pathname) === "/ai/prompts/draft-reply" ? "draft-reply" : "email-label";
}

function documentationSlugFromPath(pathname: string) {
  const normalizedPath = stripRuntimeBasePath(pathname);
  const slug = normalizedPath.replace(/^\/documentation\/?/, "").split("/")[0];
  return slug || documentationEntries[0]?.slug || "home";
}

function parseDocumentationEntry(path: string, markdown: string): DocumentationEntry {
  const filename = path.split("/").pop()?.replace(/\.md$/i, "") || "documentation";
  const frontmatterMatch = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  const metadata = Object.fromEntries(
    (frontmatterMatch?.[1] ?? "")
      .split("\n")
      .map((line) => line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.+)$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => [match[1], match[2].trim().replace(/^['"]|['"]$/g, "")]),
  );
  const filenameWithoutOrder = filename.replace(/^\d+[-_]?/, "");
  const title = metadata.title || filenameWithoutOrder.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const parsedOrder = Number(metadata.order ?? filename.match(/^\d+/)?.[0] ?? 999);
  return {
    content: frontmatterMatch ? markdown.slice(frontmatterMatch[0].length) : markdown,
    order: Number.isFinite(parsedOrder) ? parsedOrder : 999,
    slug: metadata.slug || filenameWithoutOrder.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    title,
  };
}

function getPageTitle(page: Page) {
  if (page === "documentation") {
    return "Documentation";
  }
  if (page === "ai-prompts") {
    return "Artificial Intelligence";
  }

  if (page === "ai-byoai") {
    return "BYOAI";
  }

  if (page === "ai-prompt-library") {
    return "Prompts";
  }

  if (page === "ai-email-label") {
    return "Email Label Prompt";
  }

  if (page === "ai-draft-reply") {
    return "Draft Reply Prompt";
  }

  if (page === "confidence-threshold") {
    return "Confidence Threshold";
  }

  if (page === "email-accounts") {
    return "Email Accounts";
  }

  if (page === "endpoints") {
    return "Endpoints";
  }

  if (page === "webhook") {
    return "Webhook";
  }

  if (page === "mcp-server") {
    return "MCP Server";
  }

  return navItems.find((item) => item.id === page)?.label ?? "Overview";
}

function formatDateTime(value: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatInboxListDate(value: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  if (date >= startOfToday && date < startOfTomorrow) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return "";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function getInboxMessageKey(message: InboxMessage) {
  return `${message.accountId}:${message.mailbox ?? ""}:${message.id}`;
}

function buildInboxMessageParams({
  accountIds,
  inboxMode,
  labelId,
  pageToken,
  search,
  sort,
}: {
  accountIds: string[];
  inboxMode: InboxMode;
  labelId: string;
  pageToken?: string | null;
  search: string;
  sort: InboxSort;
}) {
  const params = new URLSearchParams({
    accounts: accountIds.join(","),
    sort,
  });
  if (inboxMode === "inbox") {
    params.set("labelId", labelId);
  }
  if (inboxMode === "sent" && search) {
    params.set("search", search);
  }
  if (pageToken) {
    params.set("pageToken", pageToken);
  }
  return params;
}

function sortInboxMessagesForClient(messages: InboxMessage[], sort: InboxSort) {
  return [...messages].sort((first, second) => {
    if (sort === "oldest") {
      return new Date(first.date).getTime() - new Date(second.date).getTime();
    }
    if (sort === "sender") {
      return (first.sender || first.from).localeCompare(second.sender || second.from);
    }
    if (sort === "subject") {
      return first.subject.localeCompare(second.subject);
    }
    return new Date(second.date).getTime() - new Date(first.date).getTime();
  });
}

function decodeInboxPageToken(token?: string | null): Record<string, string> {
  if (!token) {
    return {};
  }

  try {
    const normalized = token.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const parsed = JSON.parse(window.atob(padded));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function encodeInboxPageToken(state: Record<string, string>) {
  const compactState = Object.fromEntries(Object.entries(state).filter(([, value]) => Boolean(value)));
  if (Object.keys(compactState).length === 0) {
    return null;
  }

  return window.btoa(JSON.stringify(compactState)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function getInboxModeDescription(mode: InboxMode) {
  if (mode === "drafts") {
    return "drafts";
  }
  if (mode === "sent") {
    return "sent messages";
  }
  return "inbox messages";
}

function getCommonMessageLabelId(messages: InboxMessage[], labels: Label[]) {
  if (messages.length === 0) {
    return "";
  }

  const labelsByName = new Map(labels.map((label) => [label.name.toLowerCase(), label.id]));
  const labelIds = messages.map((message) => {
    const firstLabel = message.labels[0];
    return firstLabel ? labelsByName.get(firstLabel.toLowerCase()) ?? "" : "__none__";
  });
  const [firstLabelId] = labelIds;

  return labelIds.every((labelId) => labelId === firstLabelId) ? firstLabelId : "";
}

function messageToBulkPayload(message: InboxMessage) {
  return {
    accountId: message.accountId,
    emailId: message.id,
    mailbox: message.mailbox ?? "",
  };
}

function normalizeReplySubject(subject: string) {
  return /^re:/i.test(subject) ? subject : `Re: ${subject || "(no subject)"}`;
}

function normalizeReplySearchSubject(subject: string) {
  return String(subject || "").replace(/^(re|fw|fwd):\s*/i, "").trim();
}

function providerLabel(provider: string) {
  if (provider === "gmail" || provider === "google") {
    return "Gmail";
  }

  if (provider === "yahoo") {
    return "Yahoo";
  }

  if (provider === "imap") {
    return "IMAP";
  }

  return provider;
}

function EmailAccountStatusBadge({ account }: { account: EmailAccount }) {
  if (account.status === "checking") {
    return (
      <Badge className="w-fit bg-zinc-100 text-zinc-600">
        <RefreshCw className="h-3 w-3 animate-spin" />
        Checking
      </Badge>
    );
  }

  if (account.status === "needs_refresh") {
    return (
      <Tooltip text={account.statusMessage || "Reconnect this account."}>
        <span>
          <Badge className="w-fit bg-amber-50 text-amber-700">Needs refresh</Badge>
        </span>
      </Tooltip>
    );
  }

  if (account.status === "connected") {
    return <Badge className="w-fit bg-emerald-50 text-emerald-700">Connected</Badge>;
  }

  return <Badge className="w-fit bg-zinc-100 text-zinc-600">Unchecked</Badge>;
}

function serializeLogsInWorker(payload: { category: string; exportedAt: string; logs: SystemLog[] }) {
  return new Promise<string>((resolve, reject) => {
    const workerSource = `
      self.onmessage = (event) => {
        try {
          self.postMessage(JSON.stringify(event.data, null, 2));
        } catch (error) {
          self.postMessage({ __error: error instanceof Error ? error.message : "Could not serialize logs." });
        }
      };
    `;
    const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
    const worker = new Worker(workerUrl);
    const cleanup = () => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    };
    worker.onmessage = (event) => {
      const result = event.data;
      cleanup();
      if (result && typeof result === "object" && result.__error) {
        reject(new Error(result.__error));
        return;
      }
      resolve(String(result));
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error("Could not serialize logs."));
    };
    worker.postMessage(payload);
  });
}

function logCategoryLabel(category: string) {
  if (category === "ai") {
    return "AI";
  }
  if (category === "email") {
    return "Email";
  }
  if (category === "endpoints") {
    return "Endpoints";
  }
  if (category === "webhook") {
    return "Webhook Events";
  }
  if (category === "mcp-server") {
    return "MCP Server";
  }
  return category;
}

function logStatusClass(status: string) {
  if (status === "success") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "error") {
    return "bg-red-50 text-red-700";
  }
  if (status === "warning") {
    return "bg-amber-50 text-amber-700";
  }
  return "bg-zinc-100 text-zinc-600";
}

function getSenderInitial(value: string) {
  const cleaned = String(value || "").replace(/<.*?>/g, "").trim();
  return (cleaned[0] || "?").toUpperCase();
}

function toEditableAiPlatform(platform: AiPlatform): AiPlatformDraft {
  return {
    ...platform,
    apiKey: "",
    bearerToken: "",
    isDraft: false,
  };
}

async function encryptByoAiSecrets(secrets: Record<string, string>) {
  const encrypted: Record<string, string> = {};
  const entries = Object.entries(secrets).filter(([, value]) => value.trim());
  if (entries.length === 0) {
    return encrypted;
  }

  const response = await fetch("/api/byoai/client-encryption-key", { credentials: "include" });
  const data = await response.json();
  if (!response.ok || typeof data.publicKey !== "string") {
    throw new Error(data.error ?? "Could not load encryption key.");
  }

  const key = await window.crypto.subtle.importKey(
    "spki",
    pemToArrayBuffer(data.publicKey),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );

  for (const [name, value] of entries) {
    const encryptedBytes = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, new TextEncoder().encode(value));
    encrypted[name] = arrayBufferToBase64(encryptedBytes);
  }

  return encrypted;
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, "");
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}
