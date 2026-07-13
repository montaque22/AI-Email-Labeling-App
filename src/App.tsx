import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type ComponentType, type MouseEvent as ReactMouseEvent, type PointerEvent, type ReactNode, type TouchEvent as ReactTouchEvent } from "react";
import { registerSW } from "virtual:pwa-register";
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
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  Gauge,
  Gem,
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
import { LiquidGlassCard } from "./components/ui/liquid-glass";
import { AiPromptsManager } from "./components/prompts/AiPromptsManager";
import { AiUsageChartCard } from "./components/metrics/AiUsageChartCard";
import { AlarmEditorView, AlarmSimulationChart } from "./components/metrics/AlarmEditorView";
import { AlarmResizableSplit } from "./components/metrics/AlarmResizableSplit";
import { AlarmListView } from "./components/metrics/AlarmListView";
import { MetricsTabPill } from "./components/metrics/MetricsTabPill";
import type { AiUsageSeries, AlarmGranularity, AlarmSimulationPoint, LogAlarm, LogAlarmDraft, MetricsTab } from "./components/metrics/types";
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

type ProviderLabelOption = {
  name: string;
  description: string;
  exists: boolean;
  accounts: Array<{
    emailAccountId: string;
    email: string;
    provider: string;
    providerLabelId: string;
  }>;
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

type PendingEmailAccountOAuth = {
  provider: string;
  startedAt: number;
};

type EmailAccountOAuthCallback = {
  provider: string;
  code: string;
  state: string;
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
  aiUsage: AiUsageSeries[];
  aiEnabled: boolean;
};

type SystemLog = {
  id: string;
  category: "ai" | "email" | "endpoints" | "webhook" | "mcp-server";
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
    description: "Query Emailable email rules by fromEmail/from, fromName, subject, isPending/pending, AND/OR groups, and supported equivalence operators.",
    inputSchema: null,
  },
  {
    name: "find_email",
    description: "Search Emailable's indexed email database by id, subject, sender, account, label, archive/draft/sent/inbox state, read/unread status, and timestamps. Provider-wide connected-account search is optional.",
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

function getActiveAiToolsFromConfig(config: Partial<ByoAiConfig>): AiMcpTool[] {
  if (!config.aiEnabled || !config.mcpClientEnabled) {
    return [];
  }

  const hasConnectedOpenAi = (config.platforms ?? []).some((platform) => platform.status === "connected" && platform.provider === "openai");
  const toolsByName = new Map<string, AiMcpTool>();
  for (const client of ensureSystemMcpClient(config.mcpClients ?? [])) {
    if (!client.enabled || client.status !== "connected") {
      continue;
    }
    if (client.isSystem && !hasConnectedOpenAi) {
      continue;
    }

    const selectedTools = new Set(client.selectedTools);
    for (const tool of client.tools) {
      if (selectedTools.has(tool.name) && !toolsByName.has(tool.name)) {
        toolsByName.set(tool.name, tool);
      }
    }
  }

  return [...toolsByName.values()];
}

type InboxSort = "newest" | "oldest" | "sender" | "subject";
type InboxMode = "inbox" | "drafts" | "sent" | "archive";

const INBOX_ALL_LABEL_ID = "__all__";
const INBOX_PAGE_DONE = "__done__";
const MOBILE_PULL_REFRESH_THRESHOLD = 76;

function fetchNoStore(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-cache");

  return fetch(input, {
    ...init,
    cache: "no-store",
    credentials: init.credentials ?? "include",
    headers,
  });
}

type InboxRuleStatus = {
  emailId: string;
  isPending: boolean;
};

type InboxCommitment = {
  text: string;
  dueAt: string;
  setAt: string;
  completedAt?: string;
  isCompleted?: boolean;
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
  isRead: boolean;
  labels: string[];
  hasAttachments: boolean;
  commitment?: InboxCommitment | null;
  replyCount?: number;
  rule?: InboxRuleStatus | null;
  aiActionSuggestions?: InboxAiActionSuggestion[];
  aiActionSuggestionsCachedAt?: string | null;
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
  isRead?: boolean;
  bodyText: string;
  bodyHtml: string;
  attachments: InboxAttachment[];
  commitment?: InboxCommitment | null;
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
  mailbox?: string;
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
  attachmentId?: string;
  data?: string;
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

type InboxCelebration = "confetti" | "thumbs-down" | null;
type InboxCommitmentConfirm = {
  kind: "complete" | "renege";
  messages: InboxMessage[];
} | null;

type InboxAiActionPlan = {
  toolClientId: string;
  toolName: string;
  title: string;
  summary: string;
  confirmLabel: string;
  arguments: Record<string, unknown>;
  needsMoreInfo: boolean;
  question: string;
};

type InboxAiActionResult = {
  ok?: boolean;
  result?: unknown;
  toolClientId?: string;
  toolName?: string;
};

type InboxAiActionSuggestion = {
  toolClientId: string;
  toolName: string;
  label: string;
  prompt: string;
  tooltip: string;
};

type InboxAiChatMessage = {
  id: number;
  role: "assistant" | "user";
  text: string;
  draftBody?: string;
  subjectSuggestion?: string;
  options?: Array<{
    label: string;
    sublabel?: string;
    value: string;
    type: "account" | "contact";
  }>;
};

const INBOX_AI_HELPER_SESSION_KEY = "emailable.inbox.aiHelper.history";
const INBOX_AI_HELPER_SESSION_ID_KEY = "emailable.inbox.aiHelper.sessionId";
const INBOX_AI_HELPER_SESSION_CREATED_KEY = "emailable.inbox.aiHelper.createdAt";
const INBOX_AI_HELPER_SESSION_TTL_MS = 60 * 60 * 1000;
const INBOX_AI_HELPER_HISTORY_LIMIT = 60;
const INBOX_AI_HELPER_INTRO_MESSAGE: InboxAiChatMessage = {
  id: 1,
  role: "assistant",
  text: "I can help search visible emails, look through your indexed mail, and draft a new email. Ask about what you see, or say something like “compose an email.”",
};

type EmailLinkAction = {
  href: string;
  label: string;
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

const LAST_PAGE_STORAGE_KEY = "emailable-last-page";
const EMAIL_ACCOUNT_OAUTH_PENDING_KEY = "emailable-email-account-oauth-pending";
const EMAIL_ACCOUNT_OAUTH_WINDOW_MS = 3 * 60 * 1000;

export function App() {
  const session = authClient.useSession();
  const [homeAssistantUser, setHomeAssistantUser] = useState<AuthUser | null>(null);
  const [isHomeAssistantSessionPending, setIsHomeAssistantSessionPending] = useState(true);
  const [activePage, setActivePage] = useState<Page>(() => initialPageFromLocation());
  const [ruleToOpen, setRuleToOpen] = useState<string | null>(null);
  const [ruleInitialFilter, setRuleInitialFilter] = useState<RulePendingFilter | null>(null);
  const user = homeAssistantUser ?? (session.data?.user ? mapAuthUser(session.data.user) : null);
  const pwaUpdate = usePwaUpdatePrompt();

  useEffect(() => {
    void completeEmailAccountOAuthCallbackFromAppShell();
  }, []);

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
    rememberActivePage(activePage);
  }, [activePage]);

  useEffect(() => {
    function handlePopState() {
      const page = pageFromPath(window.location.pathname);
      setActivePage(page);
      rememberActivePage(page);
      setRuleToOpen(null);
      setRuleInitialFilter(null);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function navigate(page: Page) {
    setActivePage(page);
    rememberActivePage(page);
    setRuleInitialFilter(null);
    if (page !== "rules") {
      setRuleToOpen(null);
    }
    const path = getRuntimeUrl(pathForPage(page));
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
  }

  function openRuleReview(emailId: string) {
    setRuleToOpen(emailId);
    setRuleInitialFilter(null);
    setActivePage("rules");
    rememberActivePage("rules");
    const path = getRuntimeUrl(pathForPage("rules"));
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
  }

  function openPendingRuleReview() {
    setRuleToOpen(null);
    setRuleInitialFilter("pending");
    setActivePage("rules");
    rememberActivePage("rules");
    const path = getRuntimeUrl(pathForPage("rules"));
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
  }

  if (session.isPending || isHomeAssistantSessionPending) {
    return <LoadingScreen />;
  }

  return (
    <>
      {user ? (
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
      )}
      <PwaUpdatePrompt {...pwaUpdate} />
    </>
  );
}

function usePwaUpdatePrompt() {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== "undefined" ? !navigator.onLine : false);
  const [isUpdating, setIsUpdating] = useState(false);
  const updateServiceWorkerRef = useRef<ReturnType<typeof registerSW> | null>(null);

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false);
    }

    function handleOffline() {
      setIsOffline(true);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || updateServiceWorkerRef.current) {
      return;
    }

    updateServiceWorkerRef.current = registerSW({
      immediate: true,
      onNeedRefresh() {
        setIsUpdateAvailable(true);
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) {
          return;
        }

        const checkForUpdates = () => {
          if (navigator.onLine) {
            void registration.update();
          }
        };
        const intervalId = window.setInterval(checkForUpdates, 60 * 60 * 1000);

        document.addEventListener("visibilitychange", checkForUpdates);
        window.addEventListener("focus", checkForUpdates);
        checkForUpdates();

        return () => {
          window.clearInterval(intervalId);
          document.removeEventListener("visibilitychange", checkForUpdates);
          window.removeEventListener("focus", checkForUpdates);
        };
      },
      onRegisterError(error) {
        console.error("PWA registration failed:", error);
      },
    });
  }, []);

  async function applyUpdate() {
    if (!updateServiceWorkerRef.current) {
      window.location.reload();
      return;
    }

    setIsUpdating(true);
    await updateServiceWorkerRef.current(true);
  }

  return {
    applyUpdate,
    dismissUpdate: () => setIsUpdateAvailable(false),
    isOffline,
    isUpdateAvailable,
    isUpdating,
  };
}

function PwaUpdatePrompt({
  applyUpdate,
  dismissUpdate,
  isOffline,
  isUpdateAvailable,
  isUpdating,
}: {
  applyUpdate: () => Promise<void>;
  dismissUpdate: () => void;
  isOffline: boolean;
  isUpdateAvailable: boolean;
  isUpdating: boolean;
}) {
  if (!isOffline && !isUpdateAvailable) {
    return null;
  }

  return (
    <div className="fixed inset-x-3 bottom-4 z-[80] mx-auto max-w-md rounded-2xl border border-white/70 bg-white/85 p-3 text-sm text-zinc-700 shadow-2xl shadow-slate-900/20 backdrop-blur-2xl md:bottom-6 md:right-6 md:left-auto md:mx-0">
      {isUpdateAvailable ? (
        <div className="flex items-start gap-3">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-zinc-950">Update available</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">A newer version of Emailable is ready. Refresh to stay in sync.</p>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button disabled={isUpdating} onClick={dismissUpdate} size="sm" type="button" variant="ghost">
                Later
              </Button>
              <Button disabled={isUpdating} onClick={() => void applyUpdate()} size="sm" type="button">
                {isUpdating ? "Updating..." : "Reload"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <WifiOffIcon />
          <div>
            <p className="font-semibold text-zinc-950">You are offline</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">Some inbox and API actions may be out of sync until the connection returns.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function WifiOffIcon() {
  return (
    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-[10px] font-bold text-amber-700">
      !
    </span>
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

        <main className={cn(
          "min-h-[calc(100vh-4rem)] min-w-0 overflow-x-clip p-4 sm:p-5 lg:p-8",
          activePage === "inbox" && "max-md:overflow-x-visible max-md:p-0",
        )}>
          {activePage === "overview" && (
            <OverviewPage
              onNavigate={onNavigate}
              onOpenPendingRuleReview={onOpenPendingRuleReview}
              onOpenRuleReview={onOpenRuleReview}
              privacyMode={privacyMode}
            />
          )}
          {activePage === "inbox" && <InboxPage onNavigate={onNavigate} onOpenMobileMenu={() => setMobileMenuOpen(true)} privacyMode={privacyMode} />}
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
          {activePage === "email-accounts" && <EmailAccountsPage isHomeAssistant={Boolean(user.homeAssistant)} privacyMode={privacyMode} />}
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
          actionLabel="View inbox"
          icon={MailCheck}
          label="Emails processed today"
          loading={isLoading}
          onAction={() => onNavigate("inbox")}
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
        <div className="fixed bottom-8 right-8 top-20 flex w-[260px] flex-col overflow-hidden rounded-lg border border-white/70 bg-white/55 p-4 shadow-sm backdrop-blur-xl">
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

function InboxPage({
  onNavigate,
  onOpenMobileMenu,
  privacyMode,
}: {
  onNavigate: (page: Page) => void;
  onOpenMobileMenu: () => void;
  privacyMode: boolean;
}) {
  const [labels, setLabels] = useState<Label[]>([]);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [accountsNeedingRefresh, setAccountsNeedingRefresh] = useState<EmailAccount[]>([]);
  const [inboxMode, setInboxMode] = useState<InboxMode>("inbox");
  const [selectedLabelId, setSelectedLabelId] = useState(INBOX_ALL_LABEL_ID);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [labelCounts, setLabelCounts] = useState<Record<string, number | null>>({});
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [sort, setSort] = useState<InboxSort>("newest");
  const [sentSearch, setSentSearch] = useState("");
  const [inboxSearch, setInboxSearch] = useState("");
  const [committedInboxSearch, setCommittedInboxSearch] = useState("");
  const [inboxSearchSuggestions, setInboxSearchSuggestions] = useState<InboxMessage[]>([]);
  const [isInboxSearchPending, setIsInboxSearchPending] = useState(false);
  const [isInboxSearchMenuOpen, setIsInboxSearchMenuOpen] = useState(false);
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
  const [isCommitmentActionRunning, setIsCommitmentActionRunning] = useState(false);
  const [ruleEditorMessage, setRuleEditorMessage] = useState<InboxMessage | null>(null);
  const [isCountsLoading, setIsCountsLoading] = useState(false);
  const [toast, setToast] = useState<InboxToast | null>(null);
  const [isByoAiActive, setIsByoAiActive] = useState(false);
  const [activeAiTools, setActiveAiTools] = useState<AiMcpTool[]>([]);
  const [isAiHelperOpen, setIsAiHelperOpen] = useState(false);
  const [aiActionMessage, setAiActionMessage] = useState<InboxMessage | null>(null);
  const [aiActionInstruction, setAiActionInstruction] = useState("");
  const [aiActionPlan, setAiActionPlan] = useState<InboxAiActionPlan | null>(null);
  const [aiActionPreviewText, setAiActionPreviewText] = useState("");
  const [aiActionResult, setAiActionResult] = useState<InboxAiActionResult | null>(null);
  const [aiActionSuggestions, setAiActionSuggestions] = useState<InboxAiActionSuggestion[]>([]);
  const [emailAiActionSuggestions, setEmailAiActionSuggestions] = useState<InboxAiActionSuggestion[]>([]);
  const [emailAiActionError, setEmailAiActionError] = useState<string | null>(null);
  const [selectedAiActionSuggestion, setSelectedAiActionSuggestion] = useState<InboxAiActionSuggestion | null>(null);
  const [aiActionError, setAiActionError] = useState<string | null>(null);
  const [isEmailAiActionsLoading, setIsEmailAiActionsLoading] = useState(false);
  const [isAiActionSuggestionsLoading, setIsAiActionSuggestionsLoading] = useState(false);
  const [isAiActionPlanning, setIsAiActionPlanning] = useState(false);
  const [isAiActionExecuting, setIsAiActionExecuting] = useState(false);
  const [composeRevision, setComposeRevision] = useState(0);
  const [isBulkActionBarRendered, setIsBulkActionBarRendered] = useState(false);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [isMobileLabelPickerOpen, setIsMobileLabelPickerOpen] = useState(false);
  const [isMobileEditMode, setIsMobileEditMode] = useState(false);
  const [isBulkLabelMenuOpen, setIsBulkLabelMenuOpen] = useState(false);
  const [commitmentDraftMessages, setCommitmentDraftMessages] = useState<InboxMessage[]>([]);
  const [commitmentText, setCommitmentText] = useState("");
  const [commitmentDueAt, setCommitmentDueAt] = useState("");
  const [commitmentError, setCommitmentError] = useState<string | null>(null);
  const [commitmentConfirm, setCommitmentConfirm] = useState<InboxCommitmentConfirm>(null);
  const [celebration, setCelebration] = useState<InboxCelebration>(null);
  const [mobilePullDistance, setMobilePullDistance] = useState(0);
  const [isMobilePullRefreshing, setIsMobilePullRefreshing] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMoreInFlightRef = useRef(false);
  const messageRequestIdRef = useRef(0);
  const emailAiActionsRequestIdRef = useRef(0);
  const searchSuggestionRequestIdRef = useRef(0);
  const mobilePullStartYRef = useRef<number | null>(null);
  const mobilePullActiveRef = useRef(false);
  const mobilePullReadyHapticRef = useRef(false);
  const lastAutoRefreshAtRef = useRef(0);
  const commitmentDraftOpen = commitmentDraftMessages.length > 0;

  useEffect(() => {
    async function loadBootstrap() {
      setIsLoading(true);
      setError(null);

      try {
        const [labelsResponse, accountsResponse, byoAiResponse] = await Promise.all([
          fetchNoStore("/api/inbox/labels"),
          fetchNoStore("/api/email-accounts"),
          fetchNoStore("/api/byoai/config"),
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
        setIsByoAiActive(Boolean(byoAiResponse.ok && byoAiData.aiEnabled));
        setActiveAiTools(byoAiResponse.ok ? getActiveAiToolsFromConfig(byoAiData) : []);
        void checkInboxAccountTokenStatuses(loadedAccounts);
      } catch {
        setError("Could not load Inbox setup.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadBootstrap();
  }, []);

  async function checkInboxAccountTokenStatuses(loadedAccounts: EmailAccount[]) {
    if (loadedAccounts.length === 0) {
      setAccountsNeedingRefresh([]);
      return;
    }

    try {
      const response = await fetch("/api/email-accounts/token-status", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok) {
        return;
      }

      const statuses = Array.isArray(data.accounts) ? (data.accounts as EmailAccount[]) : [];
      const statusById = new Map(statuses.map((account) => [account.id, account]));
      setAccountsNeedingRefresh(
        loadedAccounts
          .map((account) => ({ ...account, ...(statusById.get(account.id) ?? {}) }))
          .filter((account) => account.status === "needs_refresh"),
      );
    } catch {
      // Inbox loading should not fail just because the token status check failed.
    }
  }

  useEffect(() => {
    const isSearchActive = committedInboxSearch.trim().length > 0;
    const activeAccountIds = isSearchActive ? accounts.map((account) => account.id) : selectedAccountIds;
    if (activeAccountIds.length === 0 || (!isSearchActive && isLabelFilteredInboxMode(inboxMode) && !selectedLabelId)) {
      setMessages([]);
      setNextPageToken(null);
      return;
    }

    void loadMessages({ reset: true });
  }, [inboxMode, selectedLabelId, selectedAccountIds.join(","), accounts.map((account) => account.id).join(","), sort, sentSearch, committedInboxSearch]);

  useEffect(() => {
    void refreshPwaUnreadBadge();
  }, []);

  useEffect(() => {
    const query = inboxSearch.trim();
    if (!query) {
      searchSuggestionRequestIdRef.current += 1;
      setInboxSearchSuggestions([]);
      setIsInboxSearchPending(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadInboxSearchSuggestions(query);
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [inboxSearch, accounts.map((account) => account.id).join(","), sort]);

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
    if (!isLabelFilteredInboxMode(inboxMode) || selectedAccountIds.length === 0 || labels.length === 0) {
      setLabelCounts({});
      setIsCountsLoading(false);
      return;
    }

    void loadLabelCounts();
  }, [inboxMode, labels.length, selectedAccountIds.join(",")]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (
      !sentinel ||
      !nextPageToken ||
      isLoading ||
      isLoadingMore ||
      selectedMessage ||
      ruleEditorMessage ||
      isComposeOpen
    ) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        void loadMessages({ reset: false });
      }
    }, { rootMargin: "320px 0px" });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [nextPageToken, isLoading, isLoadingMore, selectedMessage, ruleEditorMessage, isComposeOpen]);

  useEffect(() => {
    const shouldLockScroll = Boolean(
      selectedMessage ||
        ruleEditorMessage ||
        isComposeOpen ||
        commitmentDraftOpen ||
        commitmentConfirm ||
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
  }, [selectedMessage, ruleEditorMessage, isComposeOpen, commitmentDraftOpen, commitmentConfirm, isMobileFilterOpen, isMobileLabelPickerOpen]);

  useEffect(() => {
    function refreshWhenVisible() {
      const now = Date.now();
      if (
        document.visibilityState !== "visible" ||
        now - lastAutoRefreshAtRef.current < 30_000 ||
        selectedMessage ||
        ruleEditorMessage ||
        isComposeOpen ||
        isMobileFilterOpen ||
        isMobileLabelPickerOpen ||
        accounts.length === 0 ||
        isLoading ||
        isLoadingMore
      ) {
        return;
      }

      lastAutoRefreshAtRef.current = now;
      void refreshInboxData();
    }

    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("pageshow", refreshWhenVisible);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("pageshow", refreshWhenVisible);
    };
  }, [
    accounts.length,
    selectedMessage,
    ruleEditorMessage,
    isComposeOpen,
    isMobileFilterOpen,
    isMobileLabelPickerOpen,
    isLoading,
    isLoadingMore,
    inboxMode,
    selectedLabelId,
    selectedAccountIds.join(","),
    sort,
    committedInboxSearch,
  ]);

  const filteredMessages = messages;
  const committedMessages = filteredMessages.filter((message) => Boolean(message.commitment));
  const regularMessages = filteredMessages.filter((message) => !message.commitment);
  const selectedLabel = labels.find((label) => label.id === selectedLabelId) ?? null;
  const allLabelCount = getInboxAllLabelCount(labels, labelCounts);
  const isInboxSearchActive = committedInboxSearch.trim().length > 0;

  async function loadInboxSearchSuggestions(query: string) {
    if (accounts.length === 0) {
      setInboxSearchSuggestions([]);
      return;
    }

    const requestId = searchSuggestionRequestIdRef.current + 1;
    searchSuggestionRequestIdRef.current = requestId;
    setIsInboxSearchPending(true);

    try {
      const params = buildInboxMessageParams({
        accountIds: accounts.map((account) => account.id),
        inboxMode,
        labelId: "",
        pageToken: null,
        search: query,
        sort,
      });
      const response = await fetchNoStore(`/api/inbox/search?${params.toString()}`);
      const data = await response.json();
      if (searchSuggestionRequestIdRef.current !== requestId) {
        return;
      }

      setInboxSearchSuggestions(response.ok ? (data.messages ?? []).slice(0, 5) : []);
      setIsInboxSearchMenuOpen(true);
    } catch {
      if (searchSuggestionRequestIdRef.current === requestId) {
        setInboxSearchSuggestions([]);
      }
    } finally {
      if (searchSuggestionRequestIdRef.current === requestId) {
        setIsInboxSearchPending(false);
      }
    }
  }

  function commitInboxSearch(value = inboxSearch) {
    const query = value.trim();
    setCommittedInboxSearch(query);
    setInboxSearch(query);
    setInboxSearchSuggestions([]);
    setIsInboxSearchMenuOpen(false);
  }

  function clearInboxSearch() {
    searchSuggestionRequestIdRef.current += 1;
    setInboxSearch("");
    setCommittedInboxSearch("");
    setInboxSearchSuggestions([]);
    setIsInboxSearchMenuOpen(false);
    setIsInboxSearchPending(false);
  }

  function selectInboxSearchSuggestion(message: InboxMessage) {
    commitInboxSearch(getInboxSearchSuggestionValue(message));
  }

  async function loadLabelCounts() {
    setIsCountsLoading(true);
    try {
      const params = new URLSearchParams({ accounts: selectedAccountIds.join(",") });
      if (inboxMode === "archive") {
        params.set("archived", "true");
      }
      const response = await fetchNoStore(`/api/inbox/label-counts?${params.toString()}`);
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

  async function refreshPwaUnreadBadge() {
    const badgeNavigator = navigator as Navigator & {
      clearAppBadge?: () => Promise<void>;
      setAppBadge?: (contents?: number) => Promise<void>;
    };
    if (!badgeNavigator.setAppBadge && !badgeNavigator.clearAppBadge) {
      return;
    }

    try {
      const response = await fetchNoStore("/api/inbox/unread-count");
      const data = await response.json();
      const count = response.ok ? Number(data.count ?? 0) : 0;
      if (count > 0 && badgeNavigator.setAppBadge) {
        await badgeNavigator.setAppBadge(count);
      } else if (badgeNavigator.clearAppBadge) {
        await badgeNavigator.clearAppBadge();
      }
    } catch {
      // Badge support is best-effort and should never affect inbox use.
    }
  }

  async function refreshInboxData() {
    if (isLoading || isLoadingMore || isMobilePullRefreshing) {
      return;
    }

    setIsMobilePullRefreshing(true);
    navigator.vibrate?.(12);
    try {
      await Promise.all([
        loadMessages({ reset: true }),
        isLabelFilteredInboxMode(inboxMode) && selectedAccountIds.length > 0 && labels.length > 0
          ? loadLabelCounts()
          : Promise.resolve(),
        accounts.length > 0 ? checkInboxAccountTokenStatuses(accounts) : Promise.resolve(),
      ]);
    } finally {
      setIsMobilePullRefreshing(false);
      setMobilePullDistance(0);
      mobilePullActiveRef.current = false;
      mobilePullReadyHapticRef.current = false;
      mobilePullStartYRef.current = null;
    }
  }

  function canStartMobilePullRefresh(target: EventTarget | null) {
    if (window.matchMedia("(min-width: 768px)").matches) {
      return false;
    }
    if (isLoading || isLoadingMore || isMobilePullRefreshing || selectedMessage || ruleEditorMessage || isComposeOpen || isMobileFilterOpen || isMobileLabelPickerOpen || commitmentDraftOpen) {
      return false;
    }
    if ((target as HTMLElement | null)?.closest("button, input, textarea, select, a")) {
      return false;
    }
    return getDocumentScrollTop() <= 8;
  }

  function handleMobilePullStart(event: ReactTouchEvent<HTMLDivElement>) {
    if (!canStartMobilePullRefresh(event.target)) {
      mobilePullStartYRef.current = null;
      mobilePullActiveRef.current = false;
      mobilePullReadyHapticRef.current = false;
      setMobilePullDistance(0);
      return;
    }

    mobilePullStartYRef.current = event.touches[0]?.clientY ?? null;
    mobilePullActiveRef.current = false;
    mobilePullReadyHapticRef.current = false;
  }

  function handleMobilePullMove(event: ReactTouchEvent<HTMLDivElement>) {
    const startY = mobilePullStartYRef.current;
    if (startY === null) {
      return;
    }

    const currentY = event.touches[0]?.clientY ?? startY;
    const distance = currentY - startY;
    if (distance <= 0 || getDocumentScrollTop() > 8) {
      setMobilePullDistance(0);
      mobilePullActiveRef.current = false;
      mobilePullReadyHapticRef.current = false;
      return;
    }

    const dampedDistance = Math.min(112, Math.round(distance * 0.45));
    if (dampedDistance > 8) {
      mobilePullActiveRef.current = true;
      event.preventDefault();
    }
    if (dampedDistance >= MOBILE_PULL_REFRESH_THRESHOLD && !mobilePullReadyHapticRef.current) {
      mobilePullReadyHapticRef.current = true;
      navigator.vibrate?.(10);
    }
    if (dampedDistance < MOBILE_PULL_REFRESH_THRESHOLD) {
      mobilePullReadyHapticRef.current = false;
    }
    setMobilePullDistance(dampedDistance);
  }

  function handleMobilePullEnd() {
    if (mobilePullActiveRef.current && mobilePullDistance >= MOBILE_PULL_REFRESH_THRESHOLD) {
      void refreshInboxData();
      return;
    }

    setMobilePullDistance(0);
    mobilePullActiveRef.current = false;
    mobilePullReadyHapticRef.current = false;
    mobilePullStartYRef.current = null;
  }

  async function loadMessages({ reset }: { reset: boolean }) {
    const activeSearch = committedInboxSearch.trim();
    const isSearchActive = activeSearch.length > 0;
    const activeAccountIds = isSearchActive ? accounts.map((account) => account.id) : selectedAccountIds;
    if (activeAccountIds.length === 0 || (!isSearchActive && isLabelFilteredInboxMode(inboxMode) && !selectedLabelId)) {
      return;
    }

    if (!reset && (loadMoreInFlightRef.current || !nextPageToken)) {
      return;
    }

    const requestId = reset ? messageRequestIdRef.current + 1 : messageRequestIdRef.current;
    if (reset) {
      messageRequestIdRef.current = requestId;
      loadMoreInFlightRef.current = false;
      setIsLoadingMore(false);
    } else {
      loadMoreInFlightRef.current = true;
    }

    reset ? setIsLoading(true) : setIsLoadingMore(true);
    if (reset) {
      setMessages([]);
    }
    setError(null);

    try {
      const endpoint = isSearchActive ? "/api/inbox/search" : inboxMode === "drafts" ? "/api/inbox/drafts" : inboxMode === "sent" ? "/api/inbox/sent" : "/api/inbox/messages";
      const isAllLabels = !isSearchActive && isLabelFilteredInboxMode(inboxMode) && selectedLabelId === INBOX_ALL_LABEL_ID;
      const currentPageState = reset ? {} : decodeInboxPageToken(nextPageToken);
      const targets = reset
        ? activeAccountIds.flatMap((accountId) => {
            if (isSearchActive) {
              return [{
                accountId,
                labelId: "",
                pageStateKey: getInboxPageStateKey(accountId, "search"),
                providerPageToken: "",
              }];
            }
            const labelIds = isAllLabels ? labels.map((label) => label.id) : [selectedLabelId];
            return labelIds.map((labelId) => ({
              accountId,
              labelId,
              pageStateKey: getInboxPageStateKey(accountId, isAllLabels ? labelId : ""),
              providerPageToken: "",
            }));
          })
        : Object.entries(currentPageState)
            .filter(([, providerPageToken]) => providerPageToken && providerPageToken !== INBOX_PAGE_DONE)
            .map(([pageStateKey, providerPageToken]) => {
              const parsedKey = parseInboxPageStateKey(pageStateKey);
              return {
                accountId: parsedKey.accountId,
                labelId: isAllLabels ? parsedKey.labelId : selectedLabelId,
                pageStateKey,
                providerPageToken,
              };
            })
            .filter((target) => target.accountId && (isSearchActive || !isLabelFilteredInboxMode(inboxMode) || target.labelId));

      if (reset) {
        setMessageLoadProgress({ completed: 0, total: targets.length });
      }

      const loadedMessages: InboxMessage[] = [];
      const nextPageState: Record<string, string> = { ...currentPageState };
      const failures: string[] = [];

      await Promise.all(targets.map(async (target) => {
        const params = buildInboxMessageParams({
          accountIds: [target.accountId],
          inboxMode,
          labelId: target.labelId,
          pageToken: target.providerPageToken
            ? encodeInboxPageToken({ [target.accountId]: target.providerPageToken })
            : null,
          search: isSearchActive ? activeSearch : sentSearch,
          sort,
        });

        try {
          const response = await fetchNoStore(`${endpoint}?${params.toString()}`);
          const data = await response.json();

          if (!response.ok) {
            failures.push(data.error ?? `Could not load ${getInboxModeDescription(inboxMode)}.`);
            nextPageState[target.pageStateKey] = INBOX_PAGE_DONE;
            return;
          }

          loadedMessages.push(...(data.messages ?? []));
          const providerState = decodeInboxPageToken(data.nextPageToken);
          nextPageState[target.pageStateKey] = providerState[target.accountId] || INBOX_PAGE_DONE;
        } catch {
          failures.push(`Could not load ${getInboxModeDescription(inboxMode)}.`);
          nextPageState[target.pageStateKey] = INBOX_PAGE_DONE;
        } finally {
          if (reset && messageRequestIdRef.current === requestId) {
            setMessageLoadProgress((current) => ({
              ...current,
              completed: Math.min(current.total, current.completed + 1),
            }));
          }
        }
      }));

      if (messageRequestIdRef.current !== requestId) {
        return;
      }

      setMessages((current) => sortInboxMessagesForClient(
        mergeInboxMessages(reset ? [] : current, loadedMessages),
        sort,
      ));
      setNextPageToken(encodeInboxPageToken(nextPageState));
      if (reset) {
        setSelectedMessageKeys([]);
        setMobilePullDistance(0);
        mobilePullActiveRef.current = false;
        mobilePullReadyHapticRef.current = false;
        mobilePullStartYRef.current = null;
        void refreshPwaUnreadBadge();
      }
      if (loadedMessages.length === 0 && failures.length > 0) {
        setError(failures[0]);
      }
    } catch {
      if (messageRequestIdRef.current === requestId) {
        setError(`Could not load ${getInboxModeDescription(inboxMode)}.`);
        if (!reset) {
          setNextPageToken(null);
        }
      }
    } finally {
      if (!reset) {
        loadMoreInFlightRef.current = false;
      }
      if (messageRequestIdRef.current === requestId) {
        reset ? setIsLoading(false) : setIsLoadingMore(false);
        if (reset) {
          setMessageLoadProgress((current) => ({ ...current, completed: current.total }));
        }
      }
    }
  }

  async function openMessage(message: InboxMessage) {
    if (inboxMode !== "drafts") {
      setSelectedMessage(message);
      setEmailAiActionSuggestions([]);
      setEmailAiActionError(null);
      if (isByoAiActive) {
        if (Array.isArray(message.aiActionSuggestions)) {
          setEmailAiActionSuggestions(message.aiActionSuggestions);
          setIsEmailAiActionsLoading(false);
        } else {
          void loadEmailAiActionSuggestions(message);
        }
      }
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

      const response = await fetchNoStore(`/api/inbox/message?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) {
        const messageError = data.error ?? "Could not load email.";
        inboxMode === "drafts" ? setError(messageError) : setDetailError(messageError);
        return;
      }

      if (inboxMode === "drafts") {
        openComposeDraft({
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
      } else {
        setMessageDetail(data.message);
        if (data.message?.isRead === true) {
          const openedMessageKey = getInboxMessageKey(message);
          setMessages((current) => current.map((currentMessage) =>
            getInboxMessageKey(currentMessage) === openedMessageKey
              ? { ...currentMessage, isRead: true }
              : currentMessage,
          ));
          setSelectedMessage((current) =>
            current && getInboxMessageKey(current) === openedMessageKey ? { ...current, isRead: true } : current,
          );
          void refreshPwaUnreadBadge();
        }
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
  const hasSelectedMessages = selectedMessages.length > 0;
  const selectedHasCommitments = selectedMessages.some((message) => Boolean(message.commitment));
  const selectedHasCompletedCommitments = selectedMessages.some((message) => Boolean(message.commitment?.isCompleted || message.commitment?.completedAt));
  const allVisibleSelected = filteredMessages.length > 0 && filteredMessages.every((message) => selectedMessageKeys.includes(getInboxMessageKey(message)));
  const selectedMessagesLabelValue = getCommonMessageLabelId(selectedMessages, labels);

  useEffect(() => {
    if (hasSelectedMessages) {
      setIsBulkActionBarRendered(true);
      return;
    }

    setIsBulkLabelMenuOpen(false);
    const timeout = window.setTimeout(() => setIsBulkActionBarRendered(false), 190);
    return () => window.clearTimeout(timeout);
  }, [hasSelectedMessages]);

  useEffect(() => {
    if (!isBulkLabelMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-bulk-label-menu]")) {
        return;
      }
      setIsBulkLabelMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isBulkLabelMenuOpen]);

  function enterMobileEditMode(message?: InboxMessage) {
    if (!isMobileEditMode) {
      navigator.vibrate?.(12);
    }
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

  function showCelebration(type: InboxCelebration) {
    setCelebration(type);
    window.setTimeout(() => setCelebration(null), 3000);
  }

  function openCommitmentModal(messagesToCommit: InboxMessage[]) {
    if (messagesToCommit.length === 0) {
      return;
    }

    const existing = messagesToCommit.length === 1 ? messagesToCommit[0].commitment : null;
    const defaultDueAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    setCommitmentDraftMessages(messagesToCommit);
    setCommitmentText(existing?.text ?? "");
    setCommitmentDueAt(formatDateTimeLocalInput(existing?.dueAt ? new Date(existing.dueAt) : defaultDueAt));
    setCommitmentError(null);
  }

  function closeCommitmentModal() {
    if (isCommitmentActionRunning) {
      return;
    }

    setCommitmentDraftMessages([]);
    setCommitmentText("");
    setCommitmentDueAt("");
    setCommitmentError(null);
  }

  function updateMessagesWithCommitment(keys: Set<string>, commitment: InboxCommitment | null) {
    setMessages((current) => sortInboxMessagesForClient(current.map((message) =>
      keys.has(getInboxMessageKey(message)) ? { ...message, commitment } : message,
    ), sort));
    setSelectedMessage((current) => current && keys.has(getInboxMessageKey(current)) ? { ...current, commitment } : current);
    setMessageDetail((current) => current && keys.has(`${current.accountId}:${current.mailbox ?? ""}:${current.id}`) ? { ...current, commitment } : current);
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
      const shouldRemoveFromCurrentInboxView = isLabelFilteredInboxMode(inboxMode) && currentLabelName && currentLabelName !== nextLabelName;

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
      setIsBulkLabelMenuOpen(false);

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

  async function saveCommitment() {
    if (commitmentDraftMessages.length === 0) {
      return;
    }

    const text = commitmentText.trim();
    const dueAt = new Date(commitmentDueAt);
    if (!text) {
      setCommitmentError("Describe what needs to be done before this email can be archived.");
      return;
    }
    if (!commitmentDueAt || Number.isNaN(dueAt.getTime())) {
      setCommitmentError("Choose a valid due date and time.");
      return;
    }

    setIsCommitmentActionRunning(true);
    setCommitmentError(null);
    try {
      const response = await fetch("/api/inbox/messages/commitment", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dueAt: dueAt.toISOString(),
          messages: commitmentDraftMessages.map(messageToBulkPayload),
          text,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setCommitmentError(data.error ?? "Could not save this commitment.");
        return;
      }

      const successfulKeys = new Set(
        commitmentDraftMessages
          .filter((message) => data.results?.some((result: { accountId: string; emailId: string; mailbox?: string; ok: boolean }) =>
            result.ok &&
            result.accountId === message.accountId &&
            result.emailId === message.id &&
            (result.mailbox ?? "") === (message.mailbox ?? ""),
          ))
          .map(getInboxMessageKey),
      );
      const commitment = data.results?.find((result: { ok: boolean; commitment?: InboxCommitment | null }) => result.ok && result.commitment)?.commitment ?? {
        dueAt: dueAt.toISOString(),
        setAt: new Date().toISOString(),
        text,
      };

      updateMessagesWithCommitment(successfulKeys, commitment);
      setSelectedMessageKeys((current) => current.filter((key) => !successfulKeys.has(key)));
      setIsMobileEditMode(false);
      setCommitmentDraftMessages([]);
      if (successfulKeys.size > 0) {
        showInboxToast(`Commitment saved for ${successfulKeys.size} email${successfulKeys.size === 1 ? "" : "s"}.`);
      }
      if (data.failed?.length) {
        showInboxToast(`${data.failed.length} email${data.failed.length === 1 ? "" : "s"} could not be updated.`, "error");
      }
    } catch {
      setCommitmentError("Could not save this commitment.");
    } finally {
      setIsCommitmentActionRunning(false);
    }
  }

  async function completeCommitment(messagesToComplete: InboxMessage[]) {
    const committedMessagesToComplete = messagesToComplete.filter((message) => Boolean(message.commitment));
    if (committedMessagesToComplete.length === 0) {
      return;
    }

    setIsCommitmentActionRunning(true);
    setIsBulkActionRunning(true);
    try {
      const response = await fetch("/api/inbox/messages/commitment/complete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: committedMessagesToComplete.map(messageToBulkPayload) }),
      });
      const data = await response.json();
      if (!response.ok) {
        showInboxToast(data.error ?? "Could not complete this commitment.", "error");
        return;
      }

      const completedKeys = new Set(
        committedMessagesToComplete
          .filter((message) => data.results?.some((result: { accountId: string; emailId: string; mailbox?: string; ok: boolean }) =>
            result.ok &&
            result.accountId === message.accountId &&
            result.emailId === message.id &&
            (result.mailbox ?? "") === (message.mailbox ?? ""),
          ))
          .map(getInboxMessageKey),
      );
      const completedCommitmentsByKey = new Map<string, InboxCommitment>();
      data.results?.forEach((result: { accountId: string; emailId: string; mailbox?: string; ok: boolean; commitment?: InboxCommitment | null }) => {
        if (result.ok && result.commitment) {
          completedCommitmentsByKey.set(`${result.accountId}:${result.mailbox ?? ""}:${result.emailId}`, result.commitment);
        }
      });
      if (inboxMode === "archive") {
        setMessages((current) => current.map((message) => {
          const commitment = completedCommitmentsByKey.get(getInboxMessageKey(message));
          return commitment ? { ...message, commitment } : message;
        }));
        setSelectedMessage((current) => {
          if (!current) {
            return current;
          }
          const commitment = completedCommitmentsByKey.get(getInboxMessageKey(current));
          return commitment ? { ...current, commitment } : current;
        });
        setMessageDetail((current) => {
          if (!current) {
            return current;
          }
          const commitment = completedCommitmentsByKey.get(`${current.accountId}:${current.mailbox ?? ""}:${current.id}`);
          return commitment ? { ...current, commitment } : current;
        });
      } else {
        setMessages((current) => current.filter((message) => !completedKeys.has(getInboxMessageKey(message))));
        if (selectedMessage && completedKeys.has(getInboxMessageKey(selectedMessage))) {
          setSelectedMessage(null);
          setMessageDetail(null);
        }
      }
      setSelectedMessageKeys((current) => current.filter((key) => !completedKeys.has(key)));
      setIsMobileEditMode(false);
      setCommitmentConfirm(null);
      void refreshPwaUnreadBadge();
      showInboxToast("Commitment completed and email archived.");
      showCelebration("confetti");
    } catch {
      showInboxToast("Could not complete this commitment.", "error");
    } finally {
      setIsCommitmentActionRunning(false);
      setIsBulkActionRunning(false);
    }
  }

  async function renegeCommitment(messagesToRenege: InboxMessage[]) {
    const committedMessagesToRenege = messagesToRenege.filter((message) => Boolean(message.commitment));
    if (committedMessagesToRenege.length === 0) {
      return;
    }

    setIsCommitmentActionRunning(true);
    try {
      const response = await fetch("/api/inbox/messages/commitment/renege", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: committedMessagesToRenege.map(messageToBulkPayload) }),
      });
      const data = await response.json();
      if (!response.ok) {
        showInboxToast(data.error ?? "Could not remove this commitment.", "error");
        return;
      }

      const clearedKeys = new Set(
        committedMessagesToRenege
          .filter((message) => data.results?.some((result: { accountId: string; emailId: string; mailbox?: string; ok: boolean }) =>
            result.ok &&
            result.accountId === message.accountId &&
            result.emailId === message.id &&
            (result.mailbox ?? "") === (message.mailbox ?? ""),
          ))
          .map(getInboxMessageKey),
      );
      updateMessagesWithCommitment(clearedKeys, null);
      setSelectedMessageKeys((current) => current.filter((key) => !clearedKeys.has(key)));
      setIsMobileEditMode(false);
      setCommitmentConfirm(null);
      showInboxToast("Commitment removed.");
      showCelebration("thumbs-down");
    } catch {
      showInboxToast("Could not remove this commitment.", "error");
    } finally {
      setIsCommitmentActionRunning(false);
    }
  }

  async function deleteSelectedMessages(messagesToDelete = selectedMessages) {
    if (messagesToDelete.length === 0) {
      return;
    }
    if (messagesToDelete.some((message) => Boolean(message.commitment))) {
      showInboxToast("Complete or renege the commitment before deleting this email.", "error");
      return;
    }

    const requestedDeleteKeys = messagesToDelete.map(getInboxMessageKey);
    setIsBulkLabelMenuOpen(false);
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
      void refreshPwaUnreadBadge();
      if (successfulDeletes.length > 0) {
        showInboxToast(`${successfulDeletes.length} message${successfulDeletes.length === 1 ? "" : "s"} deleted.`);
        setIsMobileEditMode(false);
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

  async function archiveSelectedMessages(messagesToArchive = selectedMessages) {
    if (messagesToArchive.length === 0) {
      return;
    }
    if (messagesToArchive.some((message) => Boolean(message.commitment))) {
      showInboxToast("Complete or renege the commitment before archiving this email.", "error");
      return;
    }

    setIsBulkActionRunning(true);
    setIsBulkLabelMenuOpen(false);
    setError(null);
    try {
      const response = await fetch("/api/inbox/messages/archive", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messagesToArchive.map(messageToBulkPayload) }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not archive messages.");
        showInboxToast(data.error ?? "Could not archive messages.", "error");
        return;
      }

      const successfulArchives = Array.isArray(data.results)
        ? messagesToArchive.filter((message) =>
            data.results.some((result: { accountId: string; emailId: string; mailbox?: string; ok: boolean }) =>
              result.ok &&
              result.accountId === message.accountId &&
              result.emailId === message.id &&
              (result.mailbox ?? "") === (message.mailbox ?? ""),
            ),
          )
        : messagesToArchive;
      const archivedKeys = new Set(successfulArchives.map(getInboxMessageKey));

      decrementCountsForMessages(successfulArchives);
      setMessages((current) => current.filter((message) => !archivedKeys.has(getInboxMessageKey(message))));
      setSelectedMessageKeys((current) => current.filter((key) => !archivedKeys.has(key)));
      if (selectedMessage && archivedKeys.has(getInboxMessageKey(selectedMessage))) {
        setSelectedMessage(null);
        setMessageDetail(null);
      }
      void refreshPwaUnreadBadge();
      if (successfulArchives.length > 0) {
        showInboxToast(`${successfulArchives.length} message${successfulArchives.length === 1 ? "" : "s"} archived.`);
        setIsMobileEditMode(false);
      }
      if (data.failed?.length) {
        setError(`${data.failed.length} message${data.failed.length === 1 ? "" : "s"} could not be archived.`);
        showInboxToast(`${data.failed.length} message${data.failed.length === 1 ? "" : "s"} could not be archived.`, "error");
      }
      if (successfulArchives.length === selectedMessages.length) {
        setIsMobileEditMode(false);
      }
    } catch {
      setError("Could not archive messages.");
      showInboxToast("Could not archive messages.", "error");
    } finally {
      setIsBulkActionRunning(false);
    }
  }

  function openComposeDraft(draft: Partial<InboxComposeDraft> | null) {
    setComposeInitial(draft);
    setComposeRevision((current) => current + 1);
    setIsComposeOpen(true);
  }

  function openReplyComposer(detail: InboxMessageDetail | null, summary: InboxMessage) {
    openComposeDraft({
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
  }

  function openAiAction(message: InboxMessage, instruction = "") {
    setAiActionMessage(message);
    setAiActionInstruction(instruction);
    setAiActionPlan(null);
    setAiActionPreviewText("");
    setAiActionResult(null);
    setAiActionSuggestions(emailAiActionSuggestions);
    setSelectedAiActionSuggestion(null);
    setAiActionError(null);
  }

  function startAiActionFromSuggestion(message: InboxMessage, suggestion: InboxAiActionSuggestion) {
    setAiActionMessage(message);
    setAiActionInstruction(suggestion.prompt);
    setAiActionPlan(null);
    setAiActionPreviewText("");
    setAiActionResult(null);
    setAiActionSuggestions(emailAiActionSuggestions);
    setSelectedAiActionSuggestion(suggestion);
    setAiActionError(null);
    void planAiAction(suggestion.prompt, suggestion, message);
  }

  function closeAiAction() {
    setAiActionMessage(null);
    setAiActionInstruction("");
    setAiActionPlan(null);
    setAiActionPreviewText("");
    setAiActionResult(null);
    setAiActionSuggestions([]);
    setSelectedAiActionSuggestion(null);
    setAiActionError(null);
    setIsAiActionSuggestionsLoading(false);
    setIsAiActionPlanning(false);
    setIsAiActionExecuting(false);
  }

  function resetAiActionPreview() {
    setAiActionPlan(null);
    setAiActionPreviewText("");
    setAiActionResult(null);
    setAiActionError(null);
    setSelectedAiActionSuggestion(null);
    setIsAiActionPlanning(false);
    setIsAiActionExecuting(false);
  }

  async function loadAiActionSuggestions(message: InboxMessage) {
    setIsAiActionSuggestionsLoading(true);
    setAiActionError(null);
    try {
      const response = await fetch("/api/byoai/email-action/suggestions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: message.from || message.sender,
          snippet: message.snippet,
          subject: message.subject,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setAiActionError(data.error ?? "Could not load AI actions.");
        return;
      }
      setAiActionSuggestions(Array.isArray(data.actions) ? data.actions : []);
    } catch {
      setAiActionError("Could not load AI actions.");
    } finally {
      setIsAiActionSuggestionsLoading(false);
    }
  }

  async function loadEmailAiActionSuggestions(message: InboxMessage, options: { refresh?: boolean } = {}) {
    const requestId = emailAiActionsRequestIdRef.current + 1;
    emailAiActionsRequestIdRef.current = requestId;
    setIsEmailAiActionsLoading(true);
    setEmailAiActionError(null);
    try {
      const response = await fetch("/api/byoai/email-action/suggestions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountEmail: message.accountEmail,
          accountId: message.accountId,
          emailId: message.id,
          from: message.from || message.sender,
          mailbox: message.mailbox || "",
          refresh: Boolean(options.refresh),
          snippet: message.snippet,
          subject: message.subject,
        }),
      });
      const data = await response.json();
      if (emailAiActionsRequestIdRef.current !== requestId) {
        return;
      }
      if (!response.ok) {
        setEmailAiActionError(data.error ?? "Could not load AI actions.");
        return;
      }
      const nextActions = Array.isArray(data.actions) ? data.actions : [];
      setEmailAiActionSuggestions(nextActions);
      const messageKey = getInboxMessageKey(message);
      setMessages((current) => current.map((currentMessage) =>
        getInboxMessageKey(currentMessage) === messageKey
          ? { ...currentMessage, aiActionSuggestions: nextActions, aiActionSuggestionsCachedAt: data.cachedAt ?? new Date().toISOString() }
          : currentMessage,
      ));
      setSelectedMessage((current) =>
        current && getInboxMessageKey(current) === messageKey
          ? { ...current, aiActionSuggestions: nextActions, aiActionSuggestionsCachedAt: data.cachedAt ?? new Date().toISOString() }
          : current,
      );
    } catch {
      if (emailAiActionsRequestIdRef.current === requestId) {
        setEmailAiActionError("Could not load AI actions.");
      }
    } finally {
      if (emailAiActionsRequestIdRef.current === requestId) {
        setIsEmailAiActionsLoading(false);
      }
    }
  }

  async function planAiAction(
    instructionOverride?: string,
    suggestion?: InboxAiActionSuggestion | null,
    messageOverride?: InboxMessage | null,
  ) {
    const targetMessage = messageOverride ?? aiActionMessage;
    if (!targetMessage || isAiActionPlanning || isAiActionExecuting) {
      return;
    }
    const instruction = (instructionOverride ?? aiActionInstruction).trim();
    if (!instruction) {
      setAiActionError("Choose an action or tell AI what to do with this email.");
      return;
    }

    setAiActionInstruction(instruction);
    setSelectedAiActionSuggestion(suggestion ?? null);
    setAiActionPlan(null);
    setAiActionPreviewText("");
    setAiActionResult(null);
    setAiActionError(null);
    setIsAiActionPlanning(true);
    try {
      const response = await fetch("/api/byoai/email-action", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountEmail: targetMessage.accountEmail,
          emailId: targetMessage.id,
          instruction,
          preferredToolClientId: suggestion?.toolClientId ?? "",
          preferredToolName: suggestion?.toolName ?? "",
          subject: targetMessage.subject,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setAiActionError(data.error ?? "Could not prepare this AI action.");
        return;
      }
      setAiActionPlan(data);
      setAiActionPreviewText(typeof data.summary === "string" ? data.summary : "");
      if (data.needsMoreInfo && data.question) {
        setAiActionError(data.question);
      }
    } catch {
      setAiActionError("Could not prepare this AI action.");
    } finally {
      setIsAiActionPlanning(false);
    }
  }

  async function confirmAiAction() {
    if (!aiActionPlan || aiActionPlan.needsMoreInfo || isAiActionExecuting) {
      return;
    }

    setAiActionError(null);
    setIsAiActionExecuting(true);
    try {
      const response = await fetch("/api/byoai/email-action/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          arguments: aiActionPlan.arguments,
          accountEmail: aiActionMessage?.accountEmail ?? "",
          editedPreview: aiActionPreviewText.trim() !== aiActionPlan.summary.trim() ? aiActionPreviewText : "",
          emailId: aiActionMessage?.id ?? "",
          subject: aiActionMessage?.subject ?? "",
          toolClientId: aiActionPlan.toolClientId,
          toolName: aiActionPlan.toolName,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setAiActionError(data.error ?? "Could not run this AI action.");
        return;
      }
      setAiActionResult(data);
      showInboxToast(`${aiActionPlan.confirmLabel || "Action"} completed.`);
    } catch {
      setAiActionError("Could not run this AI action.");
    } finally {
      setIsAiActionExecuting(false);
    }
  }

  const areInboxFilterSectionsDisabled = !isLabelFilteredInboxMode(inboxMode);

  const accountPicker = (
    <div className="relative z-10 w-full" data-inbox-account-menu>
      <Button
        className="w-full justify-between"
        disabled={areInboxFilterSectionsDisabled}
        onClick={() => setIsAccountMenuOpen((current) => !current)}
        type="button"
        variant="outline"
      >
        Accounts {selectedAccountIds.length}/{accounts.length}
      </Button>
      {isAccountMenuOpen && !areInboxFilterSectionsDisabled ? (
        <div className="absolute left-0 top-11 z-20 w-full min-w-72 rounded-md border border-zinc-200 bg-white p-2 shadow-xl">
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
  );

  const labelButtons = (
    <>
      <button
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-zinc-600 transition-colors hover:bg-white/60 hover:text-zinc-950",
          selectedLabelId === INBOX_ALL_LABEL_ID && "border border-white/70 bg-white/70 text-zinc-950 shadow-sm backdrop-blur-xl",
          areInboxFilterSectionsDisabled && "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-zinc-600",
        )}
        disabled={areInboxFilterSectionsDisabled}
        onClick={() => setSelectedLabelId(INBOX_ALL_LABEL_ID)}
        title="Show all indexed emails for the selected mailbox."
        type="button"
      >
        <span className="truncate">All</span>
        <span className="flex min-w-5 justify-end text-xs text-zinc-500">
          {isCountsLoading ? <Loader /> : allLabelCount ?? "-"}
        </span>
      </button>
      {labels.length === 0 ? (
        <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">No labels yet.</p>
      ) : labels.map((label) => (
          <button
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-zinc-600 transition-colors hover:bg-white/60 hover:text-zinc-950",
              selectedLabelId === label.id && "border border-white/70 bg-white/70 text-zinc-950 shadow-sm backdrop-blur-xl",
              areInboxFilterSectionsDisabled && "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-zinc-600",
            )}
            disabled={areInboxFilterSectionsDisabled}
            key={label.id}
            onClick={() => setSelectedLabelId(label.id)}
            title={label.description}
            type="button"
          >
            <span className="truncate">{label.name}</span>
            <span className="flex min-w-5 justify-end text-xs text-zinc-500">
              {isCountsLoading ? <Loader /> : labelCounts[label.id] ?? "-"}
            </span>
          </button>
        ))}
    </>
  );

  const labelSelect = (
    <label className="block">
      <select
        className="h-10 w-full min-w-0 rounded-md border border-zinc-200 bg-white/70 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        disabled={areInboxFilterSectionsDisabled}
        onChange={(event) => setSelectedLabelId(event.target.value)}
        value={selectedLabelId}
      >
        <option value={INBOX_ALL_LABEL_ID}>
          All{typeof allLabelCount === "number" ? ` (${allLabelCount})` : ""}
        </option>
        {labels.map((label) => (
          <option key={label.id} value={label.id}>
            {label.name}
            {typeof labelCounts[label.id] === "number" ? ` (${labelCounts[label.id]})` : ""}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div
      className="space-y-6 pt-20 md:pt-0"
      onTouchCancel={handleMobilePullEnd}
      onTouchEnd={handleMobilePullEnd}
      onTouchMove={handleMobilePullMove}
      onTouchStart={handleMobilePullStart}
    >
      {toast ? <InboxToastMessage toast={toast} /> : null}
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-white/60 bg-white/60 px-4 shadow-sm backdrop-blur-xl md:hidden">
        {isMobileEditMode ? (
          <>
            <button className="shrink-0 cursor-pointer text-sm font-medium text-blue-600" onClick={cancelMobileEditMode} type="button">
              Cancel
            </button>
            <div className="flex min-w-0 flex-1 justify-center">
              <span className="truncate text-sm font-medium text-zinc-950">
                {selectedMessages.length > 0 ? `${selectedMessages.length} selected` : "Select messages"}
              </span>
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
              disabled={!isLabelFilteredInboxMode(inboxMode)}
              onClick={() => setIsMobileLabelPickerOpen(true)}
              type="button"
            >
              {isLabelFilteredInboxMode(inboxMode)
                ? selectedLabelId === INBOX_ALL_LABEL_ID ? "All" : selectedLabel?.name || "Choose label"
                : inboxMode === "drafts" ? "Drafts" : "Sent"}
            </button>
            <Button aria-label="Open inbox filters" className="shrink-0 rounded-full border-white/70 bg-white/60 shadow-sm backdrop-blur-xl" onClick={() => setIsMobileFilterOpen(true)} size="icon" type="button" variant="outline">
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      <div
        aria-hidden={!isMobilePullRefreshing && mobilePullDistance === 0}
        className="pointer-events-none fixed inset-x-0 top-16 z-30 overflow-hidden border-b border-white/60 bg-white/80 shadow-sm backdrop-blur-xl md:hidden"
        style={{
          opacity: isMobilePullRefreshing || mobilePullDistance > 0 ? 1 : 0,
          height: `${isMobilePullRefreshing ? 54 : Math.max(0, Math.min(56, mobilePullDistance))}px`,
          transition: mobilePullActiveRef.current ? "none" : "opacity 180ms ease, height 180ms ease",
        }}
      >
        <div className="flex h-full items-center justify-center gap-2 px-4 text-sm font-medium text-zinc-600">
          {isMobilePullRefreshing ? (
            <>
              <Loader />
              <span>Refreshing inbox...</span>
            </>
          ) : mobilePullDistance >= MOBILE_PULL_REFRESH_THRESHOLD ? (
            <>
              <RefreshCw className="h-4 w-4 text-blue-600" />
              <span>Release to refresh</span>
            </>
          ) : (
            <>
              <RefreshCw
                className="h-4 w-4 text-zinc-500"
                style={{ transform: `rotate(${Math.min(180, mobilePullDistance * 2)}deg)` }}
              />
              <span>Pull down to refresh</span>
            </>
          )}
        </div>
      </div>

      {!isMobileEditMode ? <Button
        aria-label="Compose email"
        className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full border-white/70 bg-white/70 shadow-xl shadow-slate-900/15 backdrop-blur-xl hover:bg-white/85"
        onClick={() => {
          openComposeDraft(null);
        }}
        size="icon"
        type="button"
        variant="outline"
      >
        <Plus className="h-5 w-5" />
      </Button> : null}
      {isByoAiActive ? (
        <Button
          aria-label="Open AI helper"
          className="fixed bottom-24 right-5 z-[120] hidden h-14 w-14 rounded-full border-white/70 bg-white/70 text-zinc-900 shadow-xl shadow-slate-900/15 backdrop-blur-xl hover:bg-white/85 md:flex"
          onClick={() => setIsAiHelperOpen(true)}
          size="icon"
          type="button"
          variant="outline"
        >
          <Sparkles className="h-5 w-5" />
        </Button>
      ) : null}
      {isBulkActionBarRendered ? (
        <div className="inbox-floating-actions fixed bottom-5 left-1/2 z-40 flex items-center gap-1 rounded-full border border-white/70 bg-white/70 p-2 shadow-2xl shadow-slate-900/20 backdrop-blur-2xl" data-state={hasSelectedMessages ? "open" : "closed"}>
          {!selectedHasCommitments ? (
            <>
              <Button
                aria-label="Archive selected emails"
                className="h-12 w-12 rounded-full border-transparent bg-white/35 text-zinc-700 hover:bg-white/70"
                disabled={isBulkActionRunning || isLabelActionRunning || isCommitmentActionRunning}
                onClick={() => void archiveSelectedMessages()}
                size="icon"
                type="button"
                variant="ghost"
              >
                {isBulkActionRunning ? <Loader /> : <Archive className="h-5 w-5" />}
              </Button>
              <div className="h-8 w-px bg-zinc-200/80" />
            </>
          ) : null}
          {!selectedHasCompletedCommitments ? (
            <>
              <Button
                aria-label="Set commitment"
                className="h-12 w-12 rounded-full border-transparent bg-white/35 text-zinc-700 hover:bg-white/70"
                disabled={isBulkActionRunning || isLabelActionRunning || isCommitmentActionRunning || selectedMessages.length === 0}
                onClick={() => openCommitmentModal(selectedMessages)}
                size="icon"
                type="button"
                variant="ghost"
              >
                {isCommitmentActionRunning ? <Loader /> : <Gem className="h-5 w-5" />}
              </Button>
              <div className="h-8 w-px bg-zinc-200/80" />
            </>
          ) : null}
          <div className="relative" data-bulk-label-menu>
            <Button
              aria-label="Change selected email labels"
              className="h-12 w-12 rounded-full border-transparent bg-white/35 text-zinc-700 hover:bg-white/70"
              disabled={isBulkActionRunning || isLabelActionRunning || isCommitmentActionRunning || selectedMessages.length === 0}
              onClick={() => setIsBulkLabelMenuOpen((current) => !current)}
              size="icon"
              type="button"
              variant="ghost"
            >
              {isLabelActionRunning ? <Loader /> : <Tag className="h-5 w-5" />}
            </Button>
            {isBulkLabelMenuOpen ? (
              <div className="absolute bottom-16 left-1/2 z-50 w-64 -translate-x-1/2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-2xl shadow-slate-900/20">
                <p className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Move to label</p>
                <div className="-mx-2 max-h-72 overflow-y-auto">
                  <button
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-100/90",
                      !selectedMessagesLabelValue && "bg-blue-50/90 text-blue-800 hover:bg-blue-50/90",
                    )}
                    onClick={() => {
                      setIsBulkLabelMenuOpen(false);
                      void setMessagesLabel(selectedMessages, "");
                    }}
                    type="button"
                  >
                    <span>No label</span>
                    {!selectedMessagesLabelValue ? <Check className="h-4 w-4" /> : null}
                  </button>
                  {labels.map((label) => (
                    <button
                      className={cn(
                        "flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-100/90",
                        selectedMessagesLabelValue === label.id && "bg-blue-50/90 text-blue-800 hover:bg-blue-50/90",
                      )}
                      key={label.id}
                      onClick={() => {
                        setIsBulkLabelMenuOpen(false);
                        void setMessagesLabel(selectedMessages, label.id);
                      }}
                      type="button"
                    >
                      <span className="truncate">{label.name}</span>
                      {selectedMessagesLabelValue === label.id ? <Check className="h-4 w-4" /> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          {!selectedHasCommitments ? (
            <>
              <div className="h-8 w-px bg-zinc-200/80" />
              <Button
                aria-label="Delete selected emails"
                className="h-12 w-12 rounded-full border-transparent bg-white/35 text-red-600 hover:bg-red-50/80 hover:text-red-700"
                disabled={isBulkActionRunning || isLabelActionRunning || isCommitmentActionRunning}
                onClick={() => void deleteSelectedMessages()}
                size="icon"
                type="button"
                variant="ghost"
              >
                {isBulkActionRunning ? <Loader /> : <Trash2 className="h-5 w-5" />}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      {accountsNeedingRefresh.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>
              {accountsNeedingRefresh.length === 1
                ? `${formatEmailForPrivacy(accountsNeedingRefresh[0].email, privacyMode)} needs to be refreshed before Emailable can reliably fetch mail.`
                : `${accountsNeedingRefresh.length} email accounts need to be refreshed before Emailable can reliably fetch mail.`}
            </p>
            <button
              className="w-fit cursor-pointer font-medium text-amber-950 underline underline-offset-4 hover:text-amber-800"
              onClick={() => onNavigate("email-accounts")}
              type="button"
            >
              Go to Email Accounts
            </button>
          </div>
        </div>
      ) : null}

      <div className="md:hidden">
        <InboxSearchBox
          isLoading={isInboxSearchPending}
          isOpen={isInboxSearchMenuOpen}
          onClear={clearInboxSearch}
          onCommit={() => commitInboxSearch()}
          onFocus={() => setIsInboxSearchMenuOpen(inboxSearchSuggestions.length > 0)}
          onOpenChange={setIsInboxSearchMenuOpen}
          onSelectSuggestion={selectInboxSearchSuggestion}
          onValueChange={setInboxSearch}
          suggestions={inboxSearchSuggestions}
          value={inboxSearch}
        />
      </div>

      <div className="hidden gap-4 md:grid xl:hidden xl:gap-5 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Labels</CardTitle>
              <CardDescription>Choose a label or folder.</CardDescription>
            </CardHeader>
            <CardContent>{labelSelect}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Accounts</CardTitle>
              <CardDescription>Include or exclude connected accounts.</CardDescription>
            </CardHeader>
            <CardContent>{accountPicker}</CardContent>
          </Card>
        </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[280px_1px_minmax(0,1fr)] xl:gap-5">
          <>
            <div className="sticky top-16 hidden max-h-[calc(100vh-5rem)] min-h-0 self-start overflow-y-auto pr-1 xl:block">
              <div className="space-y-3">
              <Card>
                <CardHeader>
                  <CardTitle>Accounts</CardTitle>
                  <CardDescription>Include connected accounts.</CardDescription>
                </CardHeader>
                <CardContent>{accountPicker}</CardContent>
              </Card>
              <Card className="flex min-h-0 flex-col overflow-hidden">
                <CardHeader>
                  <CardTitle>Labels</CardTitle>
                  <CardDescription>Choose a label or folder.</CardDescription>
                </CardHeader>
                <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto">{labelButtons}</CardContent>
              </Card>
              </div>
            </div>
            <div className="hidden xl:flex xl:items-start xl:justify-center">
              <div className="mt-3 h-96 w-px rounded-full bg-gradient-to-b from-transparent via-white/80 to-transparent shadow-[0_0_18px_rgba(148,163,184,0.35)]" />
            </div>
          </>

        <div className="min-w-0 space-y-4">
          <div className="sticky top-16 z-50 hidden min-w-0 max-w-full md:block">
            <div className="relative z-50 flex flex-row flex-wrap items-center justify-between gap-3 p-0">
              <div className="min-w-0 flex-1">
                <InboxSearchBox
                  className="w-full"
                  isLoading={isInboxSearchPending}
                  isOpen={isInboxSearchMenuOpen}
                  onClear={clearInboxSearch}
                  onCommit={() => commitInboxSearch()}
                  onFocus={() => setIsInboxSearchMenuOpen(inboxSearchSuggestions.length > 0)}
                  onOpenChange={setIsInboxSearchMenuOpen}
                  onSelectSuggestion={selectInboxSearchSuggestion}
                  onValueChange={setInboxSearch}
                  suggestions={inboxSearchSuggestions}
                  value={inboxSearch}
                />
              </div>
              <div className="ml-auto flex shrink-0 items-center justify-end">
                <InboxModeToggle mode={inboxMode} onChange={handleInboxModeChange} />
              </div>
            </div>
          </div>

          <Card className="relative z-0 min-w-0 max-w-full overflow-hidden bg-white/50 max-md:relative max-md:left-1/2 max-md:min-h-[calc(100svh-11rem)] max-md:w-screen max-md:-translate-x-1/2 max-md:rounded-none max-md:border-x-0 max-md:shadow-none">
            <div className="block border-b border-white/60 px-3 pb-2 pt-3 md:hidden">
              <InboxModeToggle mode={inboxMode} onChange={handleInboxModeChange} />
            </div>
            <CardHeader className="hidden flex-row flex-wrap items-start justify-between gap-3 space-y-0 md:flex">
              <div className="min-w-0">
                <CardTitle>{isInboxSearchActive ? "Search results" : "Email"}</CardTitle>
                <CardDescription>
                  {filteredMessages.length} loaded {isInboxSearchActive ? "matches" : getInboxModeDescription(inboxMode)}
                </CardDescription>
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
            <CardContent className={cn("space-y-0 max-md:min-h-[calc(100svh-14rem)] max-md:px-0 max-md:pb-18 max-md:pt-0", isMobileEditMode && "pb-28 md:pb-6")}>
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
                  {isInboxSearchActive
                    ? "No emails matched that search."
                    : inboxMode === "drafts" ? "No drafts found." : inboxMode === "sent" ? "No sent messages found." : inboxMode === "archive" ? "No archived messages found for this label." : "No messages found for this label."}
                </p>
              ) : (
                <>
                  {committedMessages.length > 0 ? (
                    <div className="px-3 pt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 md:px-0">
                      Commitments
                    </div>
                  ) : null}
                  {committedMessages.map((message) => (
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
                  ))}
                  {committedMessages.length > 0 && regularMessages.length > 0 ? (
                    <div className="px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 md:px-0">
                      Other emails
                    </div>
                  ) : null}
                  {regularMessages.map((message) => (
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
                  ))}
                </>
              )}
              {nextPageToken ? (
                <div aria-live="polite" className="min-h-px" ref={loadMoreSentinelRef}>
                  {isLoadingMore ? <InboxMessageSkeletonRow /> : <span className="sr-only">More messages load as you scroll.</span>}
                </div>
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
          allLabelCount={allLabelCount}
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

      {isAiHelperOpen && isByoAiActive ? (
        <InboxAiHelperPanel
          accounts={accounts}
          contextMessages={filteredMessages.slice(0, 30)}
          inboxMode={inboxMode}
          labels={labels}
          onClose={() => setIsAiHelperOpen(false)}
          onOpenComposeDraft={openComposeDraft}
          privacyMode={privacyMode}
          selectedMessages={selectedMessages}
        />
      ) : null}

      {selectedMessage && !ruleEditorMessage ? (
        <>
          <div className="md:hidden">
            <InboxMessagePushView
              aiAction={{
                availableError: emailAiActionError,
                availableSuggestions: emailAiActionSuggestions,
                error: aiActionError,
                isExecuting: isAiActionExecuting,
                isAvailableLoading: isEmailAiActionsLoading,
                isPlanning: isAiActionPlanning,
                isSuggestionsLoading: isAiActionSuggestionsLoading,
                message: aiActionMessage,
                onBack: resetAiActionPreview,
                onCancel: closeAiAction,
                onConfirm: () => void confirmAiAction(),
                onPlan: (instruction?: string, suggestion?: InboxAiActionSuggestion | null) => void planAiAction(instruction, suggestion),
                onPreviewTextChange: setAiActionPreviewText,
                onRefreshAvailable: () => void loadEmailAiActionSuggestions(selectedMessage, { refresh: true }),
                onStartSuggestion: (suggestion) => startAiActionFromSuggestion(selectedMessage, suggestion),
                plan: aiActionPlan,
                previewText: aiActionPreviewText,
                result: aiActionResult,
                selectedSuggestion: selectedAiActionSuggestion,
                suggestions: aiActionSuggestions,
              }}
              detail={messageDetail}
              error={detailError}
              isDeleting={deletingMessageKeys.includes(getInboxMessageKey(selectedMessage))}
              isArchiving={isBulkActionRunning}
              isLoading={isDetailLoading}
              isLabelActionRunning={isLabelActionRunning}
              labels={labels}
              onClose={() => {
                setSelectedMessage(null);
                setMessageDetail(null);
              }}
              onDelete={(message) => void deleteSelectedMessages([message])}
              onArchive={(message) => void archiveSelectedMessages([message])}
              onCommitment={(message) => openCommitmentModal([message])}
              onCompleteCommitment={(message) => setCommitmentConfirm({ kind: "complete", messages: [message] })}
              onRenegeCommitment={(message) => setCommitmentConfirm({ kind: "renege", messages: [message] })}
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
              isArchiving={isBulkActionRunning}
              isLoading={isDetailLoading}
              isLabelActionRunning={isLabelActionRunning}
              labels={labels}
              aiAction={{
                availableError: emailAiActionError,
                availableSuggestions: emailAiActionSuggestions,
                error: aiActionError,
                isExecuting: isAiActionExecuting,
                isAvailableLoading: isEmailAiActionsLoading,
                isPlanning: isAiActionPlanning,
                isSuggestionsLoading: isAiActionSuggestionsLoading,
                message: aiActionMessage,
                onBack: resetAiActionPreview,
                onCancel: closeAiAction,
                onConfirm: () => void confirmAiAction(),
                onPlan: (instruction?: string, suggestion?: InboxAiActionSuggestion | null) => void planAiAction(instruction, suggestion),
                onPreviewTextChange: setAiActionPreviewText,
                onRefreshAvailable: () => void loadEmailAiActionSuggestions(selectedMessage, { refresh: true }),
                onStartSuggestion: (suggestion) => startAiActionFromSuggestion(selectedMessage, suggestion),
                plan: aiActionPlan,
                previewText: aiActionPreviewText,
                result: aiActionResult,
                selectedSuggestion: selectedAiActionSuggestion,
                suggestions: aiActionSuggestions,
              }}
              onClose={() => {
                setSelectedMessage(null);
                setMessageDetail(null);
                closeAiAction();
              }}
              onDelete={(message) => void deleteSelectedMessages([message])}
              onArchive={(message) => void archiveSelectedMessages([message])}
              onCommitment={(message) => openCommitmentModal([message])}
              onCompleteCommitment={(message) => setCommitmentConfirm({ kind: "complete", messages: [message] })}
              onRenegeCommitment={(message) => setCommitmentConfirm({ kind: "renege", messages: [message] })}
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
              key={`mobile-compose-${composeRevision}`}
              activeTools={activeAiTools}
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
              key={`desktop-compose-${composeRevision}`}
              activeTools={activeAiTools}
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

      {commitmentDraftOpen ? (
        <InboxCommitmentModal
          count={commitmentDraftMessages.length}
          dueAt={commitmentDueAt}
          error={commitmentError}
          isSaving={isCommitmentActionRunning}
          onClose={closeCommitmentModal}
          onDueAtChange={setCommitmentDueAt}
          onSave={() => void saveCommitment()}
          onTextChange={setCommitmentText}
          text={commitmentText}
        />
      ) : null}
      {commitmentConfirm ? (
        <InboxCommitmentConfirmModal
          isBusy={isCommitmentActionRunning}
          kind={commitmentConfirm.kind}
          messageCount={commitmentConfirm.messages.length}
          onCancel={() => setCommitmentConfirm(null)}
          onConfirm={() => commitmentConfirm.kind === "complete"
            ? void completeCommitment(commitmentConfirm.messages)
            : void renegeCommitment(commitmentConfirm.messages)}
        />
      ) : null}
      {celebration ? <InboxCelebrationOverlay type={celebration} /> : null}
    </div>
  );
}

function InboxAiHelperPanel({
  accounts,
  contextMessages,
  inboxMode,
  labels,
  onClose,
  onOpenComposeDraft,
  privacyMode,
  selectedMessages,
}: {
  accounts: EmailAccount[];
  contextMessages: InboxMessage[];
  inboxMode: InboxMode;
  labels: Label[];
  onClose: () => void;
  onOpenComposeDraft: (draft: Partial<InboxComposeDraft> | null) => void;
  privacyMode: boolean;
  selectedMessages: InboxMessage[];
}) {
  const [messages, setMessages] = useState<InboxAiChatMessage[]>(() => {
    try {
      const createdAt = Number(window.sessionStorage.getItem(INBOX_AI_HELPER_SESSION_CREATED_KEY) || "0");
      if (!createdAt || Date.now() - createdAt > INBOX_AI_HELPER_SESSION_TTL_MS) {
        window.sessionStorage.removeItem(INBOX_AI_HELPER_SESSION_KEY);
        window.sessionStorage.removeItem(INBOX_AI_HELPER_SESSION_ID_KEY);
        window.sessionStorage.setItem(INBOX_AI_HELPER_SESSION_CREATED_KEY, String(Date.now()));
      }
      const stored = window.sessionStorage.getItem(INBOX_AI_HELPER_SESSION_KEY);
      const parsed = stored ? JSON.parse(stored) : null;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .filter((message) => message && (message.role === "assistant" || message.role === "user") && typeof message.text === "string")
          .slice(-INBOX_AI_HELPER_HISTORY_LIMIT)
          .map((message, index) => ({
            draftBody: typeof message.draftBody === "string" ? message.draftBody : undefined,
            id: typeof message.id === "number" ? message.id : Date.now() + index,
            role: message.role,
            subjectSuggestion: typeof message.subjectSuggestion === "string" ? message.subjectSuggestion : undefined,
            text: message.text,
          }));
      }
    } catch {
      window.sessionStorage.removeItem(INBOX_AI_HELPER_SESSION_KEY);
    }
    return [INBOX_AI_HELPER_INTRO_MESSAGE];
  });
  const [sessionId] = useState(() => {
    const existing = window.sessionStorage.getItem(INBOX_AI_HELPER_SESSION_ID_KEY);
    if (existing) {
      return existing;
    }
    const next = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.sessionStorage.setItem(INBOX_AI_HELPER_SESSION_ID_KEY, next);
    window.sessionStorage.setItem(INBOX_AI_HELPER_SESSION_CREATED_KEY, String(Date.now()));
    return next;
  });
  const [input, setInput] = useState("");
  const [workflow, setWorkflow] = useState<{
    draft: Partial<InboxComposeDraft>;
    step: "idle" | "recipient" | "account" | "body";
  }>({ draft: {}, step: "idle" });
  const [isThinking, setIsThinking] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const activeContext = selectedMessages.length > 0 ? selectedMessages : contextMessages;
  const selectedContextText = selectedMessages.length > 0
    ? `${selectedMessages.length} selected email${selectedMessages.length === 1 ? "" : "s"}`
    : `${contextMessages.length} visible email${contextMessages.length === 1 ? "" : "s"}`;

  function addMessage(message: Omit<InboxAiChatMessage, "id">) {
    setMessages((current) => [...current, { ...message, id: Date.now() + current.length }]);
  }

  useEffect(() => {
    const persisted = messages.slice(-INBOX_AI_HELPER_HISTORY_LIMIT).map((message) => ({
      draftBody: message.draftBody,
      id: message.id,
      role: message.role,
      subjectSuggestion: message.subjectSuggestion,
      text: message.text,
    }));
    window.sessionStorage.setItem(INBOX_AI_HELPER_SESSION_KEY, JSON.stringify(persisted));
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isThinking]);

  useEffect(() => () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
  }, []);

  function closeWithAnimation() {
    if (isClosing) {
      return;
    }

    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      onClose();
    }, 220);
  }

  function openComposeWithDraft(nextDraft: Partial<InboxComposeDraft> | null) {
    const draft: Partial<InboxComposeDraft> = {
      accountId: nextDraft?.accountId || accounts[0]?.id || "",
      draftId: nextDraft?.draftId,
      mailbox: nextDraft?.mailbox,
      to: nextDraft?.to ?? "",
      cc: nextDraft?.cc ?? "",
      bcc: nextDraft?.bcc ?? "",
      subject: nextDraft?.subject ?? "",
      bodyText: nextDraft?.bodyText ?? "",
      threadId: nextDraft?.threadId,
      replyContext: nextDraft?.replyContext ?? null,
    };
    onOpenComposeDraft(draft);
    setWorkflow((current) => ({ ...current, draft }));
    return draft;
  }

  function createReplyDraftFromMessage(message: InboxMessage): Partial<InboxComposeDraft> {
    const fromAddress = extractEmailAddressFromText(message.from) || extractEmailAddressFromText(message.sender);
    return {
      accountId: message.accountId,
      to: fromAddress,
      subject: normalizeReplySubject(message.subject),
      threadId: message.threadId || message.id,
      replyContext: {
        bodyText: message.snippet || "",
        emailId: message.id,
        from: message.from || message.sender || fromAddress,
        snippet: message.snippet || "",
        subject: message.subject || "",
        threadId: message.threadId || message.id,
      },
    };
  }

  function scoreReplyTarget(message: InboxMessage, prompt: string) {
    const normalizedPrompt = prompt.toLowerCase();
    const senderName = extractDisplayNameFromText(message.from) || message.sender;
    const fromEmail = extractEmailAddressFromText(message.from) || extractEmailAddressFromText(message.sender);
    const searchable = `${senderName} ${fromEmail} ${message.subject} ${message.snippet}`.toLowerCase();
    const promptTokens = normalizedPrompt
      .replace(/[^a-z0-9@._+-]+/gi, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4 && !["reply", "respond", "compose", "email", "message", "write", "draft", "please"].includes(token));

    let score = 0;
    if (fromEmail && normalizedPrompt.includes(fromEmail.toLowerCase())) {
      score += 12;
    }
    if (senderName && normalizedPrompt.includes(senderName.toLowerCase())) {
      score += 10;
    }
    if (message.subject && normalizedPrompt.includes(message.subject.toLowerCase())) {
      score += 8;
    }
    for (const token of promptTokens) {
      if (searchable.includes(token)) {
        score += 2;
      }
    }
    return score;
  }

  function findReplyTarget(prompt: string) {
    if (selectedMessages.length === 1) {
      return selectedMessages[0];
    }
    if (selectedMessages.length > 1) {
      const rankedSelected = selectedMessages
        .map((message) => ({ message, score: scoreReplyTarget(message, prompt) }))
        .sort((a, b) => b.score - a.score);
      return rankedSelected[0]?.score > 0 ? rankedSelected[0].message : null;
    }

    if (contextMessages.length === 1) {
      return contextMessages[0];
    }

    const rankedContext = contextMessages
      .map((message) => ({ message, score: scoreReplyTarget(message, prompt) }))
      .sort((a, b) => b.score - a.score);
    return rankedContext[0]?.score > 0 ? rankedContext[0].message : null;
  }

  function describeReplyTarget(message: InboxMessage) {
    const sender = extractDisplayNameFromText(message.from) || message.sender || extractEmailAddressFromText(message.from) || "that sender";
    return `${sender}${message.subject ? ` about "${message.subject}"` : ""}`;
  }

  function findContactOptions(query: string) {
    const normalizedQuery = query.toLowerCase().trim();
    const contacts = new Map<string, { email: string; name: string }>();
    for (const message of [...selectedMessages, ...contextMessages]) {
      const email = extractEmailAddressFromText(message.from) || extractEmailAddressFromText(message.sender);
      if (!email) {
        continue;
      }
      const name = extractDisplayNameFromText(message.from) || message.sender || email;
      const searchable = `${name} ${email}`.toLowerCase();
      if (!normalizedQuery || searchable.includes(normalizedQuery)) {
        contacts.set(email.toLowerCase(), { email, name });
      }
    }

    return [...contacts.values()].slice(0, 6).map((contact) => ({
      label: contact.name,
      sublabel: formatEmailForPrivacy(contact.email, privacyMode),
      type: "contact" as const,
      value: contact.email,
    }));
  }

  function inferSearchScope(query: string): { cleanedQuery: string; labelId: string; mode: InboxMode | "search"; stateSpecific: boolean } {
    const normalized = query.toLowerCase();
    const label = labels.find((item) => normalized.includes(item.name.toLowerCase()));
    const mode: InboxMode | "search" = /\b(archive|archived)\b/.test(normalized)
      ? "archive"
      : /\b(draft|drafts)\b/.test(normalized)
        ? "drafts"
        : /\b(sent|sent mail|sent emails|replies|reply|replied)\b/.test(normalized)
          ? "sent"
          : label
            ? "inbox"
            : "search";
    const cleanedQuery = query
      .replace(/\b(what|which|show|find|search|look|for|do|i|have|in|my|the|emails?|messages?|mail|archive|archived|drafts?|sent|inbox|label|labels|folder|folders)\b/gi, " ")
      .replace(label?.name ?? "", " ")
      .replace(/\s+/g, " ")
      .trim();

    return {
      cleanedQuery,
      labelId: label?.id || INBOX_ALL_LABEL_ID,
      mode,
      stateSpecific: mode !== "search",
    };
  }

  async function searchIndexedMail(query: string) {
    if (accounts.length === 0 || !query.trim()) {
      return [];
    }

    const scope = inferSearchScope(query);
    const accountIds = accounts.map((account) => account.id);
    const search = scope.cleanedQuery;

    if (scope.mode === "drafts" || scope.mode === "sent") {
      const params = buildInboxMessageParams({
        accountIds,
        inboxMode: scope.mode,
        labelId: "",
        pageToken: null,
        search,
        sort: "newest",
      });
      const response = await fetchNoStore(`/api/inbox/${scope.mode}?${params.toString()}`);
      const data = await response.json();
      return response.ok ? (data.messages ?? []).slice(0, 5) as InboxMessage[] : [];
    }

    if (scope.mode === "archive" || scope.mode === "inbox") {
      const targetLabels = scope.labelId === INBOX_ALL_LABEL_ID ? labels : labels.filter((label) => label.id === scope.labelId);
      const results = await Promise.all(targetLabels.map(async (label) => {
        const params = buildInboxMessageParams({
          accountIds,
          inboxMode: scope.mode === "archive" ? "archive" : "inbox",
          labelId: label.id,
          pageToken: null,
          search,
          sort: "newest",
        });
        const response = await fetchNoStore(`/api/inbox/messages?${params.toString()}`);
        const data = await response.json();
        return response.ok ? (data.messages ?? []) as InboxMessage[] : [];
      }));
      return sortInboxMessagesForClient(mergeInboxMessages([], results.flat()), "newest").slice(0, 5);
    }

    const params = buildInboxMessageParams({
      accountIds,
      inboxMode: "inbox",
      labelId: "",
      pageToken: null,
      search,
      sort: "newest",
    });
    const response = await fetchNoStore(`/api/inbox/search?${params.toString()}`);
    const data = await response.json();
    return response.ok ? (data.messages ?? []).slice(0, 5) as InboxMessage[] : [];
  }

  async function draftEmailBody(prompt: string, draft: Partial<InboxComposeDraft>) {
    const contextSummary = activeContext
      .slice(0, 8)
      .map((message, index) => `${index + 1}. From ${message.from || message.sender}; Subject: ${message.subject}; Snippet: ${message.snippet}; Labels: ${message.labels.join(", ") || "none"}`)
      .join("\n");
    const response = await fetch("/api/byoai/compose-suggestion", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentBody: draft.bodyText || "",
        message: draft.replyContext ?? null,
        prompt: `You are helping from the Inbox AI helper. Active screen context: ${selectedContextText}.\n\nVisible or selected email context:\n${contextSummary || "(none)"}\n\nUser request:\n${prompt}`,
        requiredTools: [],
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Could not draft with AI.");
    }
    return String(data.bodyText ?? "").trim();
  }

  async function askAiHelper(prompt: string, conversationHistory: InboxAiChatMessage[]) {
    const response = await fetch("/api/byoai/helper-chat", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationHistory: conversationHistory.slice(-INBOX_AI_HELPER_HISTORY_LIMIT).map((message) => ({
          role: message.role,
          text: message.text,
        })),
        contextDescription: selectedContextText,
        contextMessages: activeContext.map((message) => ({
          accountEmail: message.accountEmail,
          date: message.date,
          from: message.from,
          labels: message.labels,
          sender: message.sender,
          snippet: message.snippet,
          state: message.mailbox || getInboxModeDescription(inboxMode),
          subject: message.subject,
        })),
        prompt,
        sessionId,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "AI Helper could not answer that.");
    }
    return String(data.message ?? "").trim();
  }

  async function handleUserPrompt(prompt: string, conversationHistory: InboxAiChatMessage[]) {
    const normalizedPrompt = prompt.toLowerCase();

    if (workflow.step === "recipient") {
      const typedEmail = extractEmailAddressFromText(prompt) || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(prompt.trim()) ? prompt.trim() : "");
      if (typedEmail) {
        const nextDraft = openComposeWithDraft({ ...workflow.draft, to: typedEmail });
        const accountOptions = accounts.map((account) => ({
          label: account.email,
          sublabel: providerLabel(account.provider),
          type: "account" as const,
          value: account.id,
        }));
        setWorkflow({ draft: nextDraft, step: "account" });
        addMessage({ options: accountOptions, role: "assistant", text: "Which account should send it?" });
        return;
      }

      const options = findContactOptions(prompt);
      if (options.length > 0) {
        addMessage({ options, role: "assistant", text: "I found these possible recipients. Choose one, or type the full email address." });
      } else {
        addMessage({ role: "assistant", text: "I could not find that person in the visible email context. Type the full email address, or give me another name to search in the visible messages." });
      }
      return;
    }

    if (workflow.step === "account") {
      const numberMatch = prompt.trim().match(/^\d+$/);
      const account = numberMatch
        ? accounts[Number(numberMatch[0]) - 1]
        : accounts.find((item) => `${item.email} ${item.provider}`.toLowerCase().includes(normalizedPrompt));
      if (!account) {
        addMessage({
          options: accounts.map((item) => ({ label: item.email, sublabel: providerLabel(item.provider), type: "account", value: item.id })),
          role: "assistant",
          text: "Choose one of these sending accounts.",
        });
        return;
      }
      const nextDraft = openComposeWithDraft({ ...workflow.draft, accountId: account.id });
      setWorkflow({ draft: nextDraft, step: "body" });
      addMessage({ role: "assistant", text: "What should the email say? Tell me the goal, tone, and any details to include." });
      return;
    }

    if (workflow.step === "body") {
      setIsThinking(true);
      try {
        const bodyText = await draftEmailBody(prompt, workflow.draft);
        const suggestedSubject = workflow.draft.subject || inferSubjectFromPrompt(prompt);
        const nextDraft = { ...workflow.draft, bodyText, subject: suggestedSubject };
        setWorkflow({ draft: nextDraft, step: "body" });
        addMessage({
          draftBody: bodyText,
          role: "assistant",
          subjectSuggestion: suggestedSubject,
          text: `${bodyText}\n\nClick this message to apply it to the compose window.`,
        });
      } catch (error) {
        addMessage({ role: "assistant", text: error instanceof Error ? error.message : "I could not draft that email." });
      } finally {
        setIsThinking(false);
      }
      return;
    }

    const isReplyIntent = /\b(reply|respond|response|answer)\b/.test(normalizedPrompt)
      && !/\b(new email|new message|compose new|start a new)\b/.test(normalizedPrompt);
    if (isReplyIntent) {
      const target = findReplyTarget(prompt);
      if (!target) {
        addMessage({
          role: "assistant",
          text: "Which email should I reply to? Select one email first, or mention the sender or subject from the visible emails.",
        });
        return;
      }

      const nextDraft = openComposeWithDraft(createReplyDraftFromMessage(target));
      setWorkflow({ draft: nextDraft, step: "body" });
      addMessage({
        role: "assistant",
        text: `I opened a reply to ${describeReplyTarget(target)}. Tell me what you want the reply to say, and I will draft it in that thread.`,
      });
      return;
    }

    if (/\b(compose|write|new email|send an email|draft an email)\b/.test(normalizedPrompt)) {
      const nextDraft = openComposeWithDraft(null);
      setWorkflow({ draft: nextDraft, step: "recipient" });
      addMessage({ role: "assistant", text: "I opened a new compose window. Who should this email go to? You can type a name from the current emails or a full email address." });
      return;
    }

    setIsThinking(true);
    try {
      addMessage({ role: "assistant", text: await askAiHelper(prompt, conversationHistory) });
    } catch (error) {
      addMessage({ role: "assistant", text: error instanceof Error ? error.message : "AI Helper could not answer that." });
    } finally {
      setIsThinking(false);
    }
  }

  function handleOption(option: NonNullable<InboxAiChatMessage["options"]>[number]) {
    if (option.type === "contact") {
      const nextDraft = openComposeWithDraft({ ...workflow.draft, to: option.value });
      const accountOptions = accounts.map((account) => ({
        label: account.email,
        sublabel: providerLabel(account.provider),
        type: "account" as const,
        value: account.id,
      }));
      setWorkflow({ draft: nextDraft, step: "account" });
      addMessage({ role: "user", text: option.label });
      addMessage({ options: accountOptions, role: "assistant", text: "Which account should send it?" });
      return;
    }

    const account = accounts.find((item) => item.id === option.value);
    const nextDraft = openComposeWithDraft({ ...workflow.draft, accountId: option.value });
    setWorkflow({ draft: nextDraft, step: "body" });
    addMessage({ role: "user", text: account?.email || option.label });
    addMessage({ role: "assistant", text: "What should the email say? Tell me the goal, tone, and any details to include." });
  }

  function applyDraftMessage(message: InboxAiChatMessage) {
    if (!message.draftBody) {
      return;
    }
    const nextDraft = openComposeWithDraft({
      ...workflow.draft,
      bodyText: message.draftBody,
      subject: message.subjectSuggestion || workflow.draft.subject || "",
    });
    setWorkflow({ draft: nextDraft, step: "body" });
  }

  function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || isThinking) {
      return;
    }
    setInput("");
    const userMessage: InboxAiChatMessage = { id: Date.now() + messages.length, role: "user", text: prompt };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    void handleUserPrompt(prompt, nextMessages);
  }

  return (
    <aside className="inbox-ai-helper fixed bottom-24 right-5 top-20 z-[120] hidden w-[420px] max-w-[calc(100vw-2.5rem)] flex-col rounded-2xl border border-white/70 bg-white/70 shadow-2xl shadow-slate-900/20 backdrop-blur-2xl md:flex" data-state={isClosing ? "closing" : "open"}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/70 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-950">AI Helper</p>
          <p className="truncate text-xs text-zinc-500">{selectedContextText} in context</p>
        </div>
        <Button aria-label="Close AI helper" onClick={closeWithAnimation} size="icon" type="button" variant="ghost">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((message) => (
          <div className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")} key={message.id}>
            <div className={cn(
              "min-w-0 max-w-[88%] rounded-xl border border-white/70 bg-white/65 px-3 py-2 text-sm leading-6 shadow-sm backdrop-blur-xl [overflow-wrap:anywhere]",
              message.role === "user" && "bg-zinc-950/85 text-white",
              message.draftBody && "cursor-pointer hover:border-emerald-200 hover:bg-emerald-50/80",
            )} onClick={() => applyDraftMessage(message)} role={message.draftBody ? "button" : undefined} tabIndex={message.draftBody ? 0 : undefined}>
              <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.text}</p>
              {message.options?.length ? (
                <div className="mt-3 space-y-2">
                  {message.options.map((option) => (
                    <button
                      className="block w-full rounded-lg border border-white/70 bg-white/70 px-3 py-2 text-left text-xs text-zinc-700 shadow-sm transition hover:bg-white"
                      key={`${option.type}-${option.value}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleOption(option);
                      }}
                      type="button"
                    >
                      <span className="block font-medium text-zinc-950">{option.label}</span>
                      {option.sublabel ? <span className="block truncate text-zinc-500">{option.sublabel}</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {isThinking ? (
          <div className="flex justify-start">
            <div className="inline-flex items-center gap-2 rounded-xl border border-white/70 bg-white/65 px-3 py-2 text-sm text-zinc-600 shadow-sm backdrop-blur-xl">
              <Loader />
              Thinking...
            </div>
          </div>
        ) : null}
        <div ref={messagesEndRef} />
      </div>

      <form className="shrink-0 border-t border-white/70 p-3" onSubmit={submitPrompt}>
        <div className="flex items-end gap-2 rounded-xl border border-white/70 bg-white/55 p-2 shadow-sm backdrop-blur-xl">
          <textarea
            className="min-h-10 max-h-28 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-5 outline-none placeholder:text-zinc-400"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Ask about email..."
            rows={1}
            value={input}
          />
          <Button disabled={isThinking || !input.trim()} size="icon" type="submit" variant="ghost">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </aside>
  );
}

function InboxSearchBox({
  className,
  isLoading,
  isOpen,
  onClear,
  onCommit,
  onFocus,
  onOpenChange,
  onSelectSuggestion,
  onValueChange,
  suggestions,
  value,
}: {
  className?: string;
  isLoading: boolean;
  isOpen: boolean;
  onClear: () => void;
  onCommit: () => void;
  onFocus: () => void;
  onOpenChange: (open: boolean) => void;
  onSelectSuggestion: (message: InboxMessage) => void;
  onValueChange: (value: string) => void;
  suggestions: InboxMessage[];
  value: string;
}) {
  return (
    <div className={cn("relative z-20 w-full", className)}>
      <div className="flex h-10 items-center gap-2 rounded-full border border-white/70 bg-white/50 px-4 shadow-sm backdrop-blur-xl transition focus-within:border-zinc-300">
        <Search className="h-4 w-4 shrink-0 text-zinc-400" />
        <input
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-950 outline-none placeholder:text-zinc-400"
          onBlur={() => window.setTimeout(() => onOpenChange(false), 120)}
          onChange={(event) => onValueChange(event.target.value)}
          onFocus={onFocus}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onCommit();
            }
            if (event.key === "Escape") {
              onOpenChange(false);
            }
          }}
          placeholder="Search To, From, Subject"
          type="search"
          value={value}
        />
        {isLoading ? <Loader /> : null}
        {value ? (
          <button
            aria-label="Clear inbox search"
            className="cursor-pointer rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            onClick={onClear}
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {isOpen && value.trim() ? (
        <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border border-white/80 bg-white/90 shadow-2xl shadow-slate-900/15 backdrop-blur-xl">
          {suggestions.length > 0 ? (
            <div className="max-h-80 divide-y divide-zinc-100 overflow-y-auto">
              {suggestions.map((message) => (
                <button
                  className="flex w-full cursor-pointer items-start gap-3 px-3 py-2.5 text-left hover:bg-zinc-50"
                  key={`${message.accountId}-${message.mailbox ?? ""}-${message.id}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelectSuggestion(message)}
                  type="button"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-xs font-semibold text-zinc-600">
                    {getSenderInitial(message.sender || message.from)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-zinc-950">{message.subject || "(no subject)"}</span>
                    <span className="mt-0.5 block truncate text-xs text-zinc-500">{message.sender || message.from || "Unknown sender"}</span>
                  </span>
                  <span className="shrink-0 text-xs text-zinc-400">{formatInboxListDate(message.date)}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="px-3 py-4 text-sm text-zinc-500">
              {isLoading ? "Searching..." : "No matching emails found."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function InboxModeToggle({ mode, onChange }: { mode: InboxMode; onChange: (mode: InboxMode) => void }) {
  const options: Array<{ id: InboxMode; icon: ComponentType<{ className?: string }>; label: string }> = [
    { id: "inbox", icon: Inbox, label: "Inbox" },
    { id: "drafts", icon: Pencil, label: "Drafts" },
    { id: "sent", icon: Send, label: "Sent" },
    { id: "archive", icon: Archive, label: "Archive" },
  ];
  const selectedIndex = options.findIndex((option) => option.id === mode);

  return (
    <LiquidGlassCard
      borderRadius="999px"
      className="relative h-10 w-full rounded-full border border-white/60 bg-white/10 p-1 shadow-sm backdrop-blur-xl md:w-52 xl:w-96"
      contentClassName="grid grid-cols-4"
      glowIntensity="none"
      shadowIntensity="xs"
    >
      <span
        className={cn(
          "absolute bottom-[1%] left-1 top-[1%] w-[calc((100%-0.5rem)/4)] rounded-full bg-white/50 shadow-sm transition-transform duration-300 ease-out",
          selectedIndex === 1 && "translate-x-full",
          selectedIndex === 2 && "translate-x-[200%]",
          selectedIndex === 3 && "translate-x-[300%]",
        )}
      />
      {options.map((option) => {
        const Icon = option.icon;
        return (
        <button
          className={cn(
            "relative z-10 flex cursor-pointer items-center justify-center rounded-full px-3 text-sm font-medium transition-colors duration-200",
            mode === option.id ? "text-zinc-950" : "text-zinc-500 hover:text-zinc-800",
          )}
          key={option.id}
          onClick={() => onChange(option.id)}
          title={option.label}
          type="button"
        >
          <Icon className="hidden h-4 w-4 md:block xl:hidden" />
          <span className="md:hidden xl:inline">{option.label}</span>
        </button>
        );
      })}
    </LiquidGlassCard>
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
  allLabelCount,
  isCountsLoading,
  labelCounts,
  labels,
  onClose,
  onSelect,
  selectedLabelId,
}: {
  allLabelCount: number | null;
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
          <button
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-md border border-white/60 bg-white/45 px-3 py-2 text-left text-sm text-zinc-700 shadow-sm backdrop-blur-xl",
              selectedLabelId === INBOX_ALL_LABEL_ID && "border-blue-100 bg-blue-50/80 text-blue-800",
            )}
            onClick={() => onSelect(INBOX_ALL_LABEL_ID)}
            title="Show all indexed emails for the selected mailbox."
            type="button"
          >
            <span className="truncate font-medium">All</span>
            <span className="text-xs text-zinc-500">{isCountsLoading ? <Loader /> : allLabelCount ?? "-"}</span>
          </button>
          {labels.map((label) => (
            <button
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-md border border-white/60 bg-white/45 px-3 py-2 text-left text-sm text-zinc-700 shadow-sm backdrop-blur-xl",
                selectedLabelId === label.id && "border-blue-100 bg-blue-50/80 text-blue-800",
              )}
              key={label.id}
              onClick={() => onSelect(label.id)}
              title={label.description}
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
  const commitmentTone = getCommitmentTone(message.commitment);
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
        "relative select-none border-b border-zinc-200 bg-white/45 transition last:border-b-0 hover:bg-white/80 md:bg-transparent",
        isDeleting ? "pointer-events-none opacity-60" : null,
      )}
    >
      {isDeleting ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/45 backdrop-blur-[1px]">
          <Loader />
        </div>
      ) : null}
      <div className="hidden w-full grid-cols-[auto_auto_minmax(110px,180px)_minmax(0,1fr)_auto] items-center gap-3 px-3 py-1.5 md:grid">
        <GlassCheckbox checked={isSelected} onChange={onToggle} />
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-xs font-semibold text-zinc-600">
          {getSenderInitial(message.sender || message.from)}
        </span>
        <button className="flex min-w-0 cursor-pointer items-center gap-2 text-left text-sm font-medium text-zinc-800" onClick={onOpen} type="button">
          {!message.isRead ? <span aria-label="Unread" className="h-2 w-2 shrink-0 rounded-full bg-blue-500" title="Unread" /> : null}
          <span className="min-w-0 truncate">{message.sender || message.from || "Unknown sender"}</span>
        </button>
        <button className="flex min-w-0 cursor-pointer items-center gap-2 text-left" onClick={onOpen} type="button">
          {message.commitment ? (
            <Badge className={cn("shrink-0", commitmentTone.labelClassName)}>
              <Gem className="mr-1 h-3 w-3" />
              Commitment
            </Badge>
          ) : null}
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
            "relative grid w-full cursor-pointer touch-pan-y items-center bg-white/45 px-3 py-3 text-left transition duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] will-change-transform",
            pressState === "pressing" ? "scale-[0.975] bg-white/65 shadow-inner" : null,
            pressState === "popped" ? "scale-[1.025] bg-white/80 shadow-lg" : null,
          )}
          style={{
            gridTemplateColumns: isEditMode ? "3.25rem minmax(0, 1fr)" : "0rem minmax(0, 1fr)",
            transitionProperty: "grid-template-columns, transform, background-color, box-shadow",
          }}
          onClick={handleMobileRowClick}
          onPointerCancel={releasePress}
          onPointerDown={handleMobilePointerDown}
          onPointerLeave={releasePress}
          onPointerMove={handleMobilePointerMove}
          onPointerUp={releasePress}
          role="button"
          tabIndex={0}
        >
          <div className={cn(
            "flex h-full min-h-24 items-center justify-center self-stretch overflow-hidden transition-all duration-200",
            isEditMode ? "translate-x-0 opacity-100" : "-translate-x-5 opacity-0",
          )}>
            <GlassCheckbox
              checked={isSelected}
              onChange={onToggle}
              onClick={(event) => event.stopPropagation()}
            />
          </div>
          <div className={cn("min-w-0 overflow-hidden transition-transform duration-200", isEditMode ? "translate-x-0" : "translate-x-1")}>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <p className="flex min-w-0 items-center gap-2 overflow-hidden text-base font-bold text-zinc-950">
                {!message.isRead ? <span aria-label="Unread" className="h-2 w-2 shrink-0 rounded-full bg-blue-500" title="Unread" /> : null}
                <span className="min-w-0 truncate">{message.sender || message.from || "Unknown sender"}</span>
              </p>
              {message.hasAttachments ? <Download className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" /> : null}
            </div>
            <div className="mt-1 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <p className="min-w-0 truncate text-base text-zinc-950">{message.subject || "(no subject)"}</p>
              {replyCount > 0 ? (
                <span className="inline-flex h-6 min-w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white/70 px-2 text-sm font-semibold text-zinc-700 shadow-sm backdrop-blur-xl">
                  {replyCount}
                </span>
              ) : null}
            </div>
            <div className="mt-1 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <p className="min-w-0 flex-1 truncate text-base text-zinc-500">{message.snippet || "No preview available."}</p>
              <p className="shrink-0 text-sm font-semibold text-zinc-500">{formatInboxListDate(message.date)}</p>
            </div>
            {message.commitment || message.labels.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {message.commitment ? (
                  <Badge className={cn("w-fit", commitmentTone.labelClassName)}>
                    <Gem className="mr-1 h-3 w-3" />
                    Commitment
                  </Badge>
                ) : null}
                {message.labels.slice(0, 3).map((label) => (
                  <Badge className="w-fit bg-blue-50 text-blue-700" key={label}>
                    {label}
                  </Badge>
                ))}
              </div>
            ) : null}
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
  aiAction,
  detail,
  error,
  isArchiving,
  isDeleting,
  isLoading,
  isLabelActionRunning,
  labels,
  onArchive,
  onClose,
  onCommitment,
  onCompleteCommitment,
  onDelete,
  onEditRule,
  onRenegeCommitment,
  onSetLabel,
  onReply,
  onShowReplies,
  privacyMode,
  summary,
}: {
  aiAction: {
    availableError: string | null;
    availableSuggestions: InboxAiActionSuggestion[];
    error: string | null;
    isExecuting: boolean;
    isAvailableLoading: boolean;
    isPlanning: boolean;
    isSuggestionsLoading: boolean;
    message: InboxMessage | null;
    onBack: () => void;
    onCancel: () => void;
    onConfirm: () => void;
    onPlan: (instruction?: string, suggestion?: InboxAiActionSuggestion | null) => void;
    onPreviewTextChange: (value: string) => void;
    onRefreshAvailable: () => void;
    onStartSuggestion: (suggestion: InboxAiActionSuggestion) => void;
    plan: InboxAiActionPlan | null;
    previewText: string;
    result: InboxAiActionResult | null;
    selectedSuggestion: InboxAiActionSuggestion | null;
    suggestions: InboxAiActionSuggestion[];
  };
  detail: InboxMessageDetail | null;
  error: string | null;
  isArchiving: boolean;
  isDeleting: boolean;
  isLoading: boolean;
  isLabelActionRunning: boolean;
  labels: Label[];
  onArchive: (message: InboxMessage) => void;
  onClose: () => void;
  onCommitment: (message: InboxMessage) => void;
  onCompleteCommitment: (message: InboxMessage) => void;
  onDelete: (message: InboxMessage) => void;
  onEditRule: (message: InboxMessage) => void;
  onRenegeCommitment: (message: InboxMessage) => void;
  onSetLabel: (message: InboxMessage, labelId: string) => void;
  onReply: (detail: InboxMessageDetail | null, summary: InboxMessage) => void;
  onShowReplies: (detail: InboxMessageDetail | null, summary: InboxMessage) => void;
  privacyMode: boolean;
  summary: InboxMessage;
}) {
  const rule = detail?.rule ?? summary.rule ?? null;
  const commitment = detail?.commitment ?? summary.commitment ?? null;
  const isCommitmentCompleted = Boolean(commitment?.isCompleted || commitment?.completedAt);
  const replyCount = detail?.replyCount ?? summary.replyCount ?? 0;
  const [linkAction, setLinkAction] = useState<EmailLinkAction | null>(null);
  const isAiActionOpen = Boolean(aiAction.message && getInboxMessageKey(aiAction.message) === getInboxMessageKey(summary));

  return (
    <section className="fixed inset-0 z-50 flex flex-col bg-[#f7f7f7] text-zinc-950 md:hidden">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-zinc-200 bg-white/70 px-2 backdrop-blur-xl">
        <Button aria-label="Back to inbox" onClick={onClose} size="icon" type="button" variant="ghost">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1" />
        <div className="flex shrink-0 items-center gap-1">
          {commitment ? null : (
            <>
              <Button aria-label="Delete email" className="text-red-600 hover:text-red-700" disabled={isDeleting} onClick={() => onDelete(summary)} size="icon" type="button" variant="ghost">
                {isDeleting ? <Loader /> : <Trash2 className="h-4 w-4" />}
              </Button>
              <Button aria-label="Archive email" disabled={isArchiving || isDeleting} onClick={() => onArchive(summary)} size="icon" type="button" variant="ghost">
                {isArchiving ? <Loader /> : <Archive className="h-4 w-4" />}
              </Button>
            </>
          )}
          {!isCommitmentCompleted ? (
            <Button aria-label="Set commitment" onClick={() => onCommitment(summary)} size="icon" type="button" variant="ghost">
              <Gem className="h-4 w-4" />
            </Button>
          ) : null}
          <Button aria-label="Reply" onClick={() => onReply(detail, summary)} size="icon" type="button" variant="ghost">
            <Reply className="h-4 w-4" />
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
              <p className="shrink-0 text-xs text-zinc-500">{formatDateTime(detail?.date || summary.date)}</p>
            </div>
            <h1 className="text-lg font-semibold leading-tight text-zinc-950">{detail?.subject || summary.subject || "(no subject)"}</h1>
          </div>

          {isLoading ? <p className="rounded-xl border border-white/70 bg-white/60 p-4 text-sm text-zinc-500">Loading email...</p> : null}
          {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <InboxAiActionCards
            actions={aiAction.availableSuggestions}
            error={aiAction.availableError}
            isLoading={aiAction.isAvailableLoading}
            isPlanning={aiAction.isPlanning}
            onRefresh={aiAction.onRefreshAvailable}
            onSelect={aiAction.onStartSuggestion}
            selectedSuggestion={aiAction.selectedSuggestion}
          />
          {commitment ? (
            <InboxCommitmentPanel
              commitment={commitment}
              isBusy={isArchiving || isDeleting}
              onComplete={() => onCompleteCommitment(summary)}
              onRenege={() => onRenegeCommitment(summary)}
            />
          ) : null}

          {detail ? <InboxThreadConversation detail={detail} onLinkAction={setLinkAction} privacyMode={privacyMode} /> : null}
        </div>
        </div>
      {linkAction ? <EmailLinkActionSheet link={linkAction} onClose={() => setLinkAction(null)} /> : null}
      {isAiActionOpen ? (
        <InboxAiActionBottomSheet
          error={aiAction.error}
          isExecuting={aiAction.isExecuting}
          isPlanning={aiAction.isPlanning}
          isSuggestionsLoading={aiAction.isSuggestionsLoading}
          onBack={aiAction.onBack}
          onCancel={aiAction.onCancel}
          onConfirm={aiAction.onConfirm}
          onPlan={aiAction.onPlan}
          onPreviewTextChange={aiAction.onPreviewTextChange}
          plan={aiAction.plan}
          previewText={aiAction.previewText}
          result={aiAction.result}
          selectedSuggestion={aiAction.selectedSuggestion}
          suggestions={aiAction.suggestions}
        />
      ) : null}
    </section>
  );
}

function InboxAiActionCards({
  actions,
  error,
  isLoading,
  isPlanning,
  onRefresh,
  onSelect,
  selectedSuggestion,
}: {
  actions: InboxAiActionSuggestion[];
  error: string | null;
  isLoading: boolean;
  isPlanning: boolean;
  onRefresh: () => void;
  onSelect: (suggestion: InboxAiActionSuggestion) => void;
  selectedSuggestion: InboxAiActionSuggestion | null;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const shouldRender = isLoading || Boolean(error) || actions.length > 0;
  if (!shouldRender) {
    return null;
  }

  const scrollCards = (direction: "left" | "right") => {
    scrollerRef.current?.scrollBy({
      behavior: "smooth",
      left: direction === "left" ? -320 : 320,
    });
  };
  const isDisabled = isLoading || isPlanning;

  return (
    <section className="mb-4 space-y-3 rounded-xl border border-white/70 bg-white/40 p-3 shadow-sm backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-zinc-600" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-950">Available AI actions</p>
            <p className="text-xs text-zinc-500">Actions are prepared from your active MCP tools.</p>
          </div>
        </div>
        <button
          className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-blue-600 transition hover:bg-white/70 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isDisabled}
          onClick={onRefresh}
          type="button"
        >
          {isLoading ? <Loader /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {isLoading && actions.length === 0 ? (
        <div className="flex h-28 items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-white/35 text-sm text-zinc-500">
          <Loader />
          Finding available actions...
        </div>
      ) : actions.length > 0 ? (
        <div className="flex items-center gap-2">
          <Button aria-label="Previous AI actions" disabled={isDisabled || actions.length < 2} onClick={() => scrollCards("left")} size="icon" type="button" variant="outline">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div
            className="flex min-w-0 flex-1 snap-x gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            ref={scrollerRef}
          >
            {actions.map((action) => {
              const isSelected = selectedSuggestion?.toolClientId === action.toolClientId && selectedSuggestion?.toolName === action.toolName && selectedSuggestion?.label === action.label;
              return (
                <button
                  className="min-h-28 w-[300px] min-w-[300px] snap-start rounded-xl border border-white/70 bg-white/60 p-4 text-left shadow-sm transition hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={isDisabled}
                  key={`${action.toolClientId}-${action.toolName}-${action.label}`}
                  onClick={() => onSelect(action)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-zinc-950">{action.label}</p>
                    {isSelected && isPlanning ? <Loader /> : <Sparkles className="h-4 w-4 shrink-0 text-zinc-500" />}
                  </div>
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-zinc-500">{action.tooltip || action.prompt}</p>
                </button>
              );
            })}
          </div>
          <Button aria-label="Next AI actions" disabled={isDisabled || actions.length < 2} onClick={() => scrollCards("right")} size="icon" type="button" variant="outline">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
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

function InboxMessageSkeletonRow() {
  return (
    <div aria-label="Loading more messages" className="grid animate-pulse grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-b border-zinc-200 bg-white/35 px-3 py-3 md:grid-cols-[auto_auto_minmax(110px,180px)_minmax(0,1fr)_auto]" role="status">
      <div className="h-5 w-5 rounded-full bg-zinc-200/90" />
      <div className="hidden h-7 w-7 rounded-full bg-zinc-200/90 md:block" />
      <div className="hidden h-4 w-28 rounded bg-zinc-200/90 md:block" />
      <div className="min-w-0 space-y-2">
        <div className="h-4 w-3/5 rounded bg-zinc-200/90" />
        <div className="h-3 w-4/5 rounded bg-zinc-100" />
      </div>
      <div className="hidden h-3 w-16 rounded bg-zinc-200/90 md:block" />
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
  aiAction,
  detail,
  error,
  isArchiving,
  isDeleting,
  isLoading,
  isLabelActionRunning,
  labels,
  onArchive,
  onClose,
  onCommitment,
  onCompleteCommitment,
  onDelete,
  onEditRule,
  onRenegeCommitment,
  onSetLabel,
  onReply,
  onShowReplies,
  privacyMode,
  summary,
}: {
  aiAction: {
    availableError: string | null;
    availableSuggestions: InboxAiActionSuggestion[];
    error: string | null;
    isExecuting: boolean;
    isAvailableLoading: boolean;
    isPlanning: boolean;
    isSuggestionsLoading: boolean;
    message: InboxMessage | null;
    onBack: () => void;
    onCancel: () => void;
    onConfirm: () => void;
    onPlan: (instruction?: string, suggestion?: InboxAiActionSuggestion | null) => void;
    onPreviewTextChange: (value: string) => void;
    onRefreshAvailable: () => void;
    onStartSuggestion: (suggestion: InboxAiActionSuggestion) => void;
    plan: InboxAiActionPlan | null;
    previewText: string;
    result: InboxAiActionResult | null;
    selectedSuggestion: InboxAiActionSuggestion | null;
    suggestions: InboxAiActionSuggestion[];
  };
  detail: InboxMessageDetail | null;
  error: string | null;
  isArchiving: boolean;
  isDeleting: boolean;
  isLoading: boolean;
  isLabelActionRunning: boolean;
  labels: Label[];
  onArchive: (message: InboxMessage) => void;
  onClose: () => void;
  onCommitment: (message: InboxMessage) => void;
  onCompleteCommitment: (message: InboxMessage) => void;
  onDelete: (message: InboxMessage) => void;
  onEditRule: (message: InboxMessage) => void;
  onRenegeCommitment: (message: InboxMessage) => void;
  onSetLabel: (message: InboxMessage, labelId: string) => void;
  onReply: (detail: InboxMessageDetail | null, summary: InboxMessage) => void;
  onShowReplies: (detail: InboxMessageDetail | null, summary: InboxMessage) => void;
  privacyMode: boolean;
  summary: InboxMessage;
}) {
  const rule = detail?.rule ?? summary.rule ?? null;
  const commitment = detail?.commitment ?? summary.commitment ?? null;
  const isCommitmentCompleted = Boolean(commitment?.isCompleted || commitment?.completedAt);
  const currentLabelId = getCommonMessageLabelId([summary], labels);
  const replyCount = detail?.replyCount ?? summary.replyCount ?? 0;
  const [linkAction, setLinkAction] = useState<EmailLinkAction | null>(null);
  const isAiActionOpen = Boolean(aiAction.message && getInboxMessageKey(aiAction.message) === getInboxMessageKey(summary));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 p-4">
      <div className={cn(
        "flex max-h-[92vh] w-full items-stretch justify-center gap-3 transition-[max-width] duration-300",
        isAiActionOpen ? "max-w-7xl" : "max-w-4xl",
      )}>
      <LiquidGlassCard
        borderRadius="8px"
        className="max-h-[92vh] min-w-0 flex-1 overflow-hidden rounded-2xl border border-white/70 bg-white/55 p-4 shadow-2xl shadow-slate-900/20 [backdrop-filter:blur(5px)] [-webkit-backdrop-filter:blur(5px)]"
        glowIntensity="none"
        shadowIntensity="xs"
      >
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
              {commitment ? null : (
                <>
                  <Tooltip side="bottom" text="Delete email">
                    <Button aria-label="Delete email" className="text-red-600 hover:text-red-700" disabled={isDeleting} onClick={() => onDelete(summary)} size="icon" type="button" variant="outline">
                      {isDeleting ? <Loader /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </Tooltip>
                  <Tooltip side="bottom" text="Archive email">
                    <Button aria-label="Archive email" disabled={isArchiving || isDeleting} onClick={() => onArchive(summary)} size="icon" type="button" variant="outline">
                      {isArchiving ? <Loader /> : <Archive className="h-4 w-4" />}
                    </Button>
                  </Tooltip>
                </>
              )}
              {!isCommitmentCompleted ? (
                <Tooltip side="bottom" text={commitment ? "Update commitment" : "Set commitment"}>
                  <Button aria-label={commitment ? "Update commitment" : "Set commitment"} onClick={() => onCommitment(summary)} size="icon" type="button" variant="outline">
                    <Gem className="h-4 w-4" />
                  </Button>
                </Tooltip>
              ) : null}
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
          <InboxAiActionCards
            actions={aiAction.availableSuggestions}
            error={aiAction.availableError}
            isLoading={aiAction.isAvailableLoading}
            isPlanning={aiAction.isPlanning}
            onRefresh={aiAction.onRefreshAvailable}
            onSelect={aiAction.onStartSuggestion}
            selectedSuggestion={aiAction.selectedSuggestion}
          />
          {commitment ? (
            <InboxCommitmentPanel
              commitment={commitment}
              isBusy={isArchiving || isDeleting}
              onComplete={() => onCompleteCommitment(summary)}
              onRenege={() => onRenegeCommitment(summary)}
            />
          ) : null}
          {detail ? (
            <InboxThreadConversation detail={detail} onLinkAction={setLinkAction} privacyMode={privacyMode} />
          ) : null}
          </div>
        </div>
      </LiquidGlassCard>
      {isAiActionOpen ? (
        <InboxAiActionDrawer
          error={aiAction.error}
          isExecuting={aiAction.isExecuting}
          isPlanning={aiAction.isPlanning}
          isSuggestionsLoading={aiAction.isSuggestionsLoading}
          message={summary}
          onBack={aiAction.onBack}
          onCancel={aiAction.onCancel}
          onConfirm={aiAction.onConfirm}
          onPlan={aiAction.onPlan}
          onPreviewTextChange={aiAction.onPreviewTextChange}
          plan={aiAction.plan}
          previewText={aiAction.previewText}
          privacyMode={privacyMode}
          result={aiAction.result}
          selectedSuggestion={aiAction.selectedSuggestion}
          suggestions={aiAction.suggestions}
        />
      ) : null}
      </div>
      {linkAction ? <EmailLinkActionSheet link={linkAction} onClose={() => setLinkAction(null)} /> : null}
    </div>
  );
}

function InboxAiActionDrawer({
  error,
  isExecuting,
  isPlanning,
  isSuggestionsLoading,
  message,
  onBack,
  onCancel,
  onConfirm,
  onPlan,
  onPreviewTextChange,
  plan,
  previewText,
  privacyMode,
  result,
  selectedSuggestion,
  suggestions,
}: {
  error: string | null;
  isExecuting: boolean;
  isPlanning: boolean;
  isSuggestionsLoading: boolean;
  message: InboxMessage;
  onBack: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  onPlan: (instruction?: string, suggestion?: InboxAiActionSuggestion | null) => void;
  onPreviewTextChange: (value: string) => void;
  plan: InboxAiActionPlan | null;
  previewText: string;
  privacyMode: boolean;
  result: InboxAiActionResult | null;
  selectedSuggestion: InboxAiActionSuggestion | null;
  suggestions: InboxAiActionSuggestion[];
}) {
  const canConfirm = Boolean(plan && !plan.needsMoreInfo && !result && !isPlanning && !isExecuting);

  return (
    <aside className="inbox-ai-action-drawer hidden w-[380px] shrink-0 overflow-hidden rounded-2xl border border-white/70 bg-white/55 p-4 shadow-2xl shadow-slate-900/20 [backdrop-filter:blur(5px)] [-webkit-backdrop-filter:blur(5px)] md:block">
        <div className="flex h-full max-h-[calc(92vh-2rem)] flex-col rounded-xl bg-white/40 shadow-inner ring-1 ring-white/60">
          <div className="flex items-start justify-between gap-4 border-b border-white/60 px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-zinc-600" />
                <h3 className="text-base font-semibold text-zinc-950">AI Actions</h3>
              </div>
              <p className="mt-1 truncate text-sm text-zinc-500">
                {message.subject || "(no subject)"} · {formatEmailForPrivacy(message.accountEmail, privacyMode)}
              </p>
            </div>
            <Button aria-label="Close AI Actions" disabled={isPlanning || isExecuting} onClick={onCancel} size="icon" type="button" variant="ghost">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <AiActionCarousel
            error={error}
            isExecuting={isExecuting}
            isPlanning={isPlanning}
            onPreviewTextChange={onPreviewTextChange}
            plan={plan}
            previewText={previewText}
            result={result}
            selectedSuggestion={selectedSuggestion}
          />

          <div className="flex justify-end gap-2 border-t border-white/60 px-5 py-4">
            <Button disabled={isPlanning || isExecuting} onClick={onCancel} type="button" variant="outline">
              {result ? "Done" : "Cancel"}
            </Button>
            {!result ? <Button disabled={!canConfirm} onClick={onConfirm} type="button">
              {isExecuting ? <Loader /> : <Check className="h-4 w-4" />}
              {plan?.confirmLabel || "Confirm"}
            </Button> : null}
          </div>
        </div>
    </aside>
  );
}

function InboxCommitmentPanel({
  commitment,
  isBusy,
  onComplete,
  onRenege,
}: {
  commitment: InboxCommitment;
  isBusy: boolean;
  onComplete: () => void;
  onRenege: () => void;
}) {
  const tone = getCommitmentTone(commitment);
  const isCompleted = Boolean(commitment.isCompleted || commitment.completedAt);
  return (
    <section className={cn("mb-4 rounded-xl border p-4 text-sm shadow-sm", tone.panelClassName)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 font-semibold">
            <Gem className="h-4 w-4" />
            <span>Commitment</span>
          </div>
          <div
            className="prose prose-sm max-w-none break-words prose-p:my-1 prose-ul:my-1 prose-ol:my-1"
            dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(commitment.text) }}
          />
          <div className={cn("text-xs font-semibold", tone.metaClassName)}>
            <p>{isCompleted ? "Completed" : `Due ${formatRelativeDuration(commitment.dueAt, { prefix: "in" })}`}</p>
          </div>
        </div>
        {!isCompleted ? (
          <div className="flex shrink-0 gap-2">
            <Button className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100" disabled={isBusy} onClick={onRenege} size="sm" type="button" variant="outline">
              Renege
            </Button>
            <Button className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={isBusy} onClick={onComplete} size="sm" type="button">
              Complete
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function InboxCommitmentModal({
  count,
  dueAt,
  error,
  isSaving,
  onClose,
  onDueAtChange,
  onSave,
  onTextChange,
  text,
}: {
  count: number;
  dueAt: string;
  error: string | null;
  isSaving: boolean;
  onClose: () => void;
  onDueAtChange: (value: string) => void;
  onSave: () => void;
  onTextChange: (value: string) => void;
  text: string;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/20 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/70 bg-white/55 p-4 shadow-2xl shadow-slate-900/20 [backdrop-filter:blur(5px)] [-webkit-backdrop-filter:blur(5px)]">
        <div className="rounded-xl bg-white/40 p-5 shadow-inner ring-1 ring-white/60">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-zinc-950">Set commitment</h3>
              <p className="mt-1 text-sm text-zinc-500">
                Define what must happen before {count === 1 ? "this email can" : `${count} emails can`} be archived.
              </p>
            </div>
            <Button aria-label="Close commitment modal" disabled={isSaving} onClick={onClose} size="icon" type="button" variant="ghost">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          <div className="mt-5 space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-700">What needs to be done?</span>
              <textarea
                className="min-h-28 w-full resize-y rounded-md border border-zinc-200 bg-white/70 px-3 py-2 text-sm outline-none transition-colors focus:border-zinc-400"
                disabled={isSaving}
                maxLength={500}
                onChange={(event) => onTextChange(event.target.value)}
                placeholder="Example: Reply with the signed document and confirm the next appointment."
                value={text}
              />
              <span className="block text-right text-xs text-zinc-500">{text.length}/500</span>
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-700">Commitment due</span>
              <input
                className="h-11 w-full rounded-md border border-zinc-200 bg-white/70 px-3 text-sm outline-none transition-colors focus:border-zinc-400"
                disabled={isSaving}
                min={formatDateTimeLocalInput(new Date())}
                onChange={(event) => onDueAtChange(event.target.value)}
                type="datetime-local"
                value={dueAt}
              />
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button disabled={isSaving} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={isSaving || !text.trim() || !dueAt} onClick={onSave} type="button">
              {isSaving ? <Loader /> : <Gem className="h-4 w-4" />}
              Save commitment
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InboxCommitmentConfirmModal({
  isBusy,
  kind,
  messageCount,
  onCancel,
  onConfirm,
}: {
  isBusy: boolean;
  kind: "complete" | "renege";
  messageCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isRenege = kind === "renege";
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/20 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/70 bg-white/55 p-4 shadow-2xl shadow-slate-900/20 [backdrop-filter:blur(5px)] [-webkit-backdrop-filter:blur(5px)]">
        <div className="rounded-xl bg-white/40 p-5 shadow-inner ring-1 ring-white/60">
          <h3 className="text-lg font-semibold text-zinc-950">
            {isRenege ? "Break this commitment?" : "Complete this commitment?"}
          </h3>
          <p className="mt-2 text-sm text-zinc-600">
            {isRenege
              ? `This will remove the commitment data from ${messageCount === 1 ? "this email" : `${messageCount} emails`} and keep it in the inbox.`
              : `This confirms ${messageCount === 1 ? "this commitment is" : "these commitments are"} complete and archives ${messageCount === 1 ? "the email" : "the emails"}.`}
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button disabled={isBusy} onClick={onCancel} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              className={isRenege ? "bg-red-600 text-white hover:bg-red-700" : "bg-emerald-600 text-white hover:bg-emerald-700"}
              disabled={isBusy}
              onClick={onConfirm}
              type="button"
            >
              {isBusy ? <Loader /> : isRenege ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              {isRenege ? "Renege" : "Complete"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InboxCelebrationOverlay({ type }: { type: InboxCelebration }) {
  if (!type) {
    return null;
  }

  const items = Array.from({ length: type === "confetti" ? 34 : 18 });
  return (
    <div className="pointer-events-none fixed inset-0 z-[90] overflow-hidden">
      {items.map((_, index) => (
        <span
          className={cn(
            "absolute top-[-10%] select-none text-2xl",
            type === "confetti" ? "inbox-confetti-piece" : "inbox-thumbs-down-piece",
          )}
          key={index}
          style={{
            animationDelay: `${(index % 10) * 90}ms`,
            animationDuration: `${1800 + (index % 5) * 220}ms`,
            left: `${(index * 29) % 100}%`,
            opacity: type === "confetti" ? 0.85 : 0.25 + (index % 5) * 0.12,
            "--piece-scale": `${0.75 + (index % 6) * 0.12}`,
          } as CSSProperties}
        >
          {type === "confetti" ? ["•", "✦", "◆", "✓"][index % 4] : "👎"}
        </span>
      ))}
    </div>
  );
}

function InboxAiActionBottomSheet({
  error,
  isExecuting,
  isPlanning,
  isSuggestionsLoading,
  onBack,
  onCancel,
  onConfirm,
  onPlan,
  onPreviewTextChange,
  plan,
  previewText,
  result,
  selectedSuggestion,
  suggestions,
}: {
  error: string | null;
  isExecuting: boolean;
  isPlanning: boolean;
  isSuggestionsLoading: boolean;
  onBack: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  onPlan: (instruction?: string, suggestion?: InboxAiActionSuggestion | null) => void;
  onPreviewTextChange: (value: string) => void;
  plan: InboxAiActionPlan | null;
  previewText: string;
  result: InboxAiActionResult | null;
  selectedSuggestion: InboxAiActionSuggestion | null;
  suggestions: InboxAiActionSuggestion[];
}) {
  const canConfirm = Boolean(plan && !plan.needsMoreInfo && !result && !isPlanning && !isExecuting);

  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-slate-950/20 md:hidden">
      <div className="inbox-ai-action-sheet flex max-h-[82vh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/70 bg-white/70 p-3 shadow-2xl shadow-slate-900/25 [backdrop-filter:blur(5px)] [-webkit-backdrop-filter:blur(5px)]">
        <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-zinc-300/80" />
        <div className="flex items-start justify-between gap-3 border-b border-white/70 px-3 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-zinc-600" />
              <h3 className="text-base font-semibold text-zinc-950">AI Actions</h3>
            </div>
            <p className="mt-1 text-sm text-zinc-500">Choose an action, preview it, then confirm.</p>
          </div>
          <Button aria-label="Close AI Actions" disabled={isPlanning || isExecuting} onClick={onCancel} size="icon" type="button" variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <AiActionCarousel
            error={error}
            isExecuting={isExecuting}
            isPlanning={isPlanning}
            onPreviewTextChange={onPreviewTextChange}
            plan={plan}
            previewText={previewText}
            result={result}
            selectedSuggestion={selectedSuggestion}
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-white/70 px-3 pt-3">
          <Button disabled={isPlanning || isExecuting} onClick={onCancel} type="button" variant="outline">
            {result ? "Done" : "Cancel"}
          </Button>
          {!result ? (
            <Button disabled={!canConfirm} onClick={onConfirm} type="button">
              {isExecuting ? <Loader /> : <Check className="h-4 w-4" />}
              {plan?.confirmLabel || "Confirm"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AiActionCarousel({
  error,
  isExecuting,
  isPlanning,
  onPreviewTextChange,
  plan,
  previewText,
  result,
  selectedSuggestion,
}: {
  error: string | null;
  isExecuting: boolean;
  isPlanning: boolean;
  onPreviewTextChange: (value: string) => void;
  plan: InboxAiActionPlan | null;
  previewText: string;
  result: InboxAiActionResult | null;
  selectedSuggestion: InboxAiActionSuggestion | null;
}) {
  const activeStep = result ? 1 : 0;
  const [isPreviewEditing, setIsPreviewEditing] = useState(false);

  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <div
        className={cn(
          "flex h-full w-[200%] transition-transform duration-300 ease-out",
          activeStep === 1 && "-translate-x-1/2",
        )}
      >
        <div className="h-full w-1/2 min-w-0 space-y-4 overflow-y-auto px-5 py-5">
          <div>
            <p className="text-sm font-medium text-zinc-950">The AI agent will attempt to do the following:</p>
            {selectedSuggestion ? <p className="mt-1 text-sm leading-5 text-zinc-500">{selectedSuggestion.tooltip || selectedSuggestion.prompt}</p> : null}
          </div>

          {isPlanning && !plan ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-white/40 text-sm text-zinc-500">
              <Loader />
              Preparing preview...
            </div>
          ) : null}

          {error ? (
            <p className={cn(
              "rounded-md px-3 py-2 text-sm",
              plan?.needsMoreInfo ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700",
            )}>
              {error}
            </p>
          ) : null}

          {plan && !plan.needsMoreInfo ? (
            <div
              className="rounded-xl border border-white/70 bg-white/60 p-4 shadow-sm backdrop-blur-xl"
              onClick={() => {
                if (!isPlanning && !isExecuting) {
                  setIsPreviewEditing(true);
                }
              }}
              role="button"
              tabIndex={0}
            >
              {isPreviewEditing ? (
                <textarea
                  autoFocus
                  className="min-h-40 w-full resize-y rounded-lg border border-zinc-200 bg-white/70 px-3 py-2 text-sm leading-6 text-zinc-700 outline-none transition-colors focus:border-zinc-400"
                  disabled={isPlanning || isExecuting}
                  onBlur={() => setIsPreviewEditing(false)}
                  onChange={(event) => onPreviewTextChange(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  value={previewText}
                />
              ) : (
                <>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-600">{previewText || plan.summary}</p>
                  <p className="mt-3 text-xs text-zinc-400">Click to edit</p>
                </>
              )}
            </div>
          ) : null}
        </div>

        <div className="h-full w-1/2 min-w-0 space-y-4 overflow-y-auto px-5 py-5">
          <div>
            <p className="text-sm font-semibold text-zinc-950">Result</p>
            <p className="mt-1 text-sm text-zinc-500">
              The MCP tool finished running. Review the returned content below.
            </p>
          </div>

          {result ? (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
              <p className="text-sm font-medium text-emerald-950">Action completed</p>
            </div>
          ) : null}

          {result ? <AiActionResultViewer result={result.result ?? result} /> : null}
        </div>
      </div>
    </div>
  );
}

function AiActionResultViewer({ result }: { result: unknown }) {
  const markdown = extractAiActionResultMarkdown(result);
  if (markdown) {
    return (
      <div
        className="prose prose-sm max-w-none rounded-xl border border-white/70 bg-white/65 p-4 text-zinc-700 shadow-sm backdrop-blur-xl"
        dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(markdown) }}
      />
    );
  }

  return (
    <pre className="max-h-80 overflow-auto rounded-xl bg-zinc-950/90 p-3 text-xs leading-5 text-white">
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}

function extractAiActionResultMarkdown(result: unknown): string {
  if (typeof result === "string") {
    return result.trim();
  }
  if (!result || typeof result !== "object") {
    return "";
  }

  const record = result as Record<string, unknown>;
  const contentMarkdown = extractMcpTextContent(record.content);
  if (contentMarkdown) {
    return contentMarkdown;
  }

  const candidateKeys = ["content", "text", "message", "summary", "body", "bodyText", "markdown", "result"];
  for (const key of candidateKeys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nestedContent = extractMcpTextContent((value as Record<string, unknown>).content);
      if (nestedContent) {
        return nestedContent;
      }
    }
  }

  return "";
}

function extractMcpTextContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return "";
      }
      const record = entry as Record<string, unknown>;
      if (record.type !== "text") {
        return "";
      }
      return typeof record.text === "string" ? record.text.trim() : "";
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function InboxThreadConversation({
  detail,
  onLinkAction,
  privacyMode,
}: {
  detail: InboxMessageDetail;
  onLinkAction: (link: EmailLinkAction) => void;
  privacyMode: boolean;
}) {
  const messages: InboxThreadMessage[] = (detail.threadMessages?.length
    ? detail.threadMessages
    : [{
        id: detail.id,
        threadId: detail.threadId,
        accountId: detail.accountId,
        accountEmail: detail.accountEmail,
        provider: detail.provider,
        mailbox: detail.mailbox,
        from: detail.from,
        to: detail.to,
        cc: detail.cc,
        subject: detail.subject,
        date: detail.date,
        bodyText: detail.bodyText,
        bodyHtml: detail.bodyHtml,
        attachments: detail.attachments,
      }]).slice().sort((left, right) => new Date(right.date || 0).getTime() - new Date(left.date || 0).getTime());

  return (
    <div className="space-y-4">
      {messages.map((message, messageIndex) => (
        <article className="min-w-0 overflow-hidden rounded-xl border border-white/80 bg-white/75 shadow-sm backdrop-blur-xl" key={message.id}>
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
          <div className="min-w-0 overflow-hidden border-t border-zinc-200/80 bg-white/80 p-4">
            {message.bodyHtml ? (
              <SanitizedEmailHtml html={message.bodyHtml} onLinkAction={onLinkAction} />
            ) : (
              <PlainTextEmailBody onLinkAction={onLinkAction} text={message.bodyText || "No body content."} />
            )}
          </div>
          {message.attachments.length > 0 ? (
            <div className="space-y-2 border-t border-zinc-200/80 bg-white/65 px-4 py-3">
              {message.attachments.map((attachment, attachmentIndex) => (
                <button
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-md border border-zinc-200/80 bg-white/70 px-3 py-2 text-left text-sm transition-colors",
                    attachment.downloadSupported ? "cursor-pointer hover:border-zinc-300 hover:bg-zinc-50" : "cursor-not-allowed opacity-70",
                  )}
                  disabled={!attachment.downloadSupported}
                  key={`${message.id}-${attachment.filename}-${attachmentIndex}`}
                  onClick={() => openInboxAttachment(message, attachment)}
                  title={attachment.downloadSupported ? "Download attachment" : "Attachment download is not available for this provider yet."}
                  type="button"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-950">{attachment.filename}</p>
                    <p className="text-xs text-zinc-500">
                      {attachment.type} {attachment.size ? ` / ${formatFileSize(attachment.size)}` : ""}
                      {!attachment.downloadSupported ? " / Download unavailable" : ""}
                    </p>
                  </div>
                  <Download className={cn("h-4 w-4 shrink-0", attachment.downloadSupported ? "text-zinc-600" : "text-zinc-400")} />
                </button>
              ))}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function openInboxAttachment(message: InboxThreadMessage, attachment: InboxAttachment) {
  if (!attachment.downloadSupported || !attachment.attachmentId) {
    return;
  }

  const params = new URLSearchParams({
    accountId: message.accountId,
    attachmentId: attachment.attachmentId,
    emailId: message.id,
    filename: attachment.filename,
    type: attachment.type,
  });
  if (message.mailbox) {
    params.set("mailbox", message.mailbox);
  }
  window.open(getRuntimeUrl(`/api/inbox/attachment?${params.toString()}`), "_blank", "noopener,noreferrer");
}

function PlainTextEmailBody({ text, onLinkAction }: { text: string; onLinkAction: (link: EmailLinkAction) => void }) {
  const parts = splitPlainTextEmailLinks(text);

  return (
    <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-zinc-700">
      {parts.map((part, index) => {
        if (part.type === "text") {
          return <span key={`text-${index}`}>{part.value}</span>;
        }

        return (
          <button
            className="inline cursor-pointer break-all text-left text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900"
            key={`link-${part.href}-${index}`}
            onClick={() => onLinkAction({ href: part.href, label: part.value })}
            type="button"
          >
            {part.value}
          </button>
        );
      })}
    </pre>
  );
}

function splitPlainTextEmailLinks(text: string): Array<{ type: "text"; value: string } | { type: "link"; value: string; href: string }> {
  const linkPattern = /((?:https?:\/\/|mailto:|tel:)[^\s<>"']+|www\.[^\s<>"']+)/gi;
  const parts: Array<{ type: "text"; value: string } | { type: "link"; value: string; href: string }> = [];
  let lastIndex = 0;

  for (const match of text.matchAll(linkPattern)) {
    const rawMatch = match[0];
    const index = match.index ?? 0;
    const { label, trailing } = trimTrailingLinkPunctuation(rawMatch);

    if (index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, index) });
    }

    const href = /^www\./i.test(label) ? `https://${label}` : label;
    if (isUserOpenableEmailLink(href)) {
      parts.push({ type: "link", value: label, href });
    } else {
      parts.push({ type: "text", value: label });
    }

    if (trailing) {
      parts.push({ type: "text", value: trailing });
    }
    lastIndex = index + rawMatch.length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }

  return parts.length ? parts : [{ type: "text", value: text }];
}

function trimTrailingLinkPunctuation(value: string) {
  const match = value.match(/^(.+?)([),.;!?]+)?$/);
  return {
    label: match?.[1] || value,
    trailing: match?.[2] || "",
  };
}

function EmailLinkActionSheet({ link, onClose }: { link: EmailLinkAction; onClose: () => void }) {
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link.href);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = link.href;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    onClose();
  }

  function openLink() {
    window.open(link.href, "_blank", "noopener,noreferrer");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/20 p-3 sm:items-center">
      <button aria-label="Close link menu" className="absolute inset-0 cursor-default" onClick={onClose} type="button" />
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/70 bg-white/90 p-4 shadow-2xl shadow-slate-900/20 backdrop-blur-2xl">
        <div className="mb-4">
          <p className="text-sm font-semibold text-zinc-950">Open link?</p>
          <p className="mt-1 max-h-20 overflow-y-auto break-all text-xs leading-5 text-zinc-500">{link.href}</p>
        </div>
        <div className="grid gap-2">
          <Button className="justify-start" onClick={() => void copyLink()} type="button" variant="outline">
            <Copy className="h-4 w-4" />
            Copy link
          </Button>
          <Button className="justify-start" onClick={openLink} type="button">
            <ExternalLink className="h-4 w-4" />
            Open in web browser
          </Button>
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function isUserOpenableEmailLink(href: string) {
  return /^https?:\/\//i.test(href) || /^mailto:/i.test(href) || /^tel:/i.test(href);
}

function SanitizedEmailHtml({ html, onLinkAction }: { html: string; onLinkAction: (link: EmailLinkAction) => void }) {
  const sanitizedHtml = useMemo(() => sanitizeEmailHtmlForDom(html), [html]);

  function handleClick(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
    if (!anchor) {
      return;
    }

    const href = anchor.href || anchor.getAttribute("href") || "";
    if (!isUserOpenableEmailLink(href)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onLinkAction({
      href,
      label: anchor.textContent?.trim() || href,
    });
  }

  return (
    <div
      className="emailable-email-html min-w-0 max-w-full overflow-hidden rounded-xl bg-white text-sm leading-6 text-zinc-800"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      onClick={handleClick}
    />
  );
}

function sanitizeEmailHtmlForDom(html: string) {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return "";
  }

  const parser = new DOMParser();
  const parsedDocument = parser.parseFromString(String(html || ""), "text/html");
  const blockedSelectors = [
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "applet",
    "base",
    "meta",
    "link",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "option",
  ].join(",");

  parsedDocument.querySelectorAll(blockedSelectors).forEach((node) => node.remove());

  parsedDocument.querySelectorAll<HTMLElement>("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const attributeName = attribute.name.toLowerCase();
      const attributeValue = attribute.value.trim();

      if (attributeName.startsWith("on")) {
        element.removeAttribute(attribute.name);
        continue;
      }

      if (attributeName === "srcdoc" || attributeName === "srcset") {
        element.removeAttribute(attribute.name);
        continue;
      }

      if (["href", "src", "xlink:href", "action", "formaction"].includes(attributeName) && isUnsafeEmailHtmlUrl(attributeValue)) {
        element.removeAttribute(attribute.name);
        continue;
      }

      if (attributeName === "style") {
        element.setAttribute(attribute.name, sanitizeEmailStyleAttribute(attributeValue));
      }
    }

    if (element.tagName.toLowerCase() === "a") {
      const anchor = element as HTMLAnchorElement;
      const href = anchor.getAttribute("href") || "";
      if (!isUserOpenableEmailLink(href)) {
        anchor.removeAttribute("href");
      } else {
        anchor.setAttribute("rel", "noopener noreferrer");
      }
      anchor.removeAttribute("target");
    }
  });

  return parsedDocument.body.innerHTML;
}

function isUnsafeEmailHtmlUrl(value: string) {
  return /^(?:javascript|data:text\/html|vbscript):/i.test(value);
}

function sanitizeEmailStyleAttribute(value: string) {
  return value
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !/expression\s*\(|javascript:|url\s*\(\s*['"]?\s*(?:javascript|data:text\/html|vbscript):/i.test(part))
    .join("; ");
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
  activeTools,
  accounts,
  initial,
  isByoAiActive,
  onClose,
  onSaved,
  privacyMode,
  variant = "modal",
}: {
  activeTools: AiMcpTool[];
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
  const [aiMessages, setAiMessages] = useState<Array<{ id: number; isLoading?: boolean; role: "user" | "assistant"; text: string }>>([]);
  const [isToolPickerOpen, setIsToolPickerOpen] = useState(false);
  const [toolPickerQuery, setToolPickerQuery] = useState("");
  const [isGeneratingAiSuggestion, setIsGeneratingAiSuggestion] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState("");
  const [linkAction, setLinkAction] = useState<EmailLinkAction | null>(null);
  const [aiDraftViewport, setAiDraftViewport] = useState({ height: 0, offsetTop: 0 });
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const aiInstructionTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const replyContext = initial?.replyContext ?? null;
  const isExistingDraft = Boolean(initial?.draftId);
  const isPush = variant === "push";
  const composeFormId = `inbox-compose-form-${variant}`;
  const filteredToolOptions = activeTools
    .filter((tool) => tool.name.toLowerCase().includes(toolPickerQuery.toLowerCase()))
    .slice(0, 8);

  useEffect(() => {
    resizeBodyTextarea();
  }, [bodyText, isAiDraftOpen]);

  useEffect(() => {
    resizeAiInstructionTextarea();
  }, [aiInstruction, isAiDraftOpen]);

  useEffect(() => {
    if (!isByoAiActive) {
      setIsAiDraftOpen(false);
    }
  }, [isByoAiActive]);

  useEffect(() => {
    if (!isAiDraftOpen) {
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
  }, [isAiDraftOpen]);

  useEffect(() => {
    if (!isPush || !isAiDraftOpen) {
      return;
    }

    function syncAiDraftViewport() {
      const viewport = window.visualViewport;
      setAiDraftViewport({
        height: Math.round(viewport?.height ?? window.innerHeight),
        offsetTop: Math.round(viewport?.offsetTop ?? 0),
      });
    }

    syncAiDraftViewport();
    window.visualViewport?.addEventListener("resize", syncAiDraftViewport);
    window.visualViewport?.addEventListener("scroll", syncAiDraftViewport);
    window.addEventListener("resize", syncAiDraftViewport);

    return () => {
      window.visualViewport?.removeEventListener("resize", syncAiDraftViewport);
      window.visualViewport?.removeEventListener("scroll", syncAiDraftViewport);
      window.removeEventListener("resize", syncAiDraftViewport);
    };
  }, [isPush, isAiDraftOpen]);

  function resizeBodyTextarea() {
    const textarea = bodyTextareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function resizeAiInstructionTextarea() {
    const textarea = aiInstructionTextareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 20;
    const verticalPadding = textarea.offsetHeight - textarea.clientHeight;
    const maxHeight = Math.ceil(lineHeight * 3 + verticalPadding);
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }

  function findActiveToolToken(value: string, cursorPosition = value.length) {
    const beforeCursor = value.slice(0, cursorPosition);
    const tokenStart = beforeCursor.lastIndexOf("#");
    if (tokenStart === -1) {
      return null;
    }

    const textBeforeHash = beforeCursor.slice(0, tokenStart);
    const previousCharacter = textBeforeHash.charAt(textBeforeHash.length - 1);
    if (previousCharacter && !/\s/.test(previousCharacter)) {
      return null;
    }

    const tokenText = beforeCursor.slice(tokenStart + 1);
    if (!/^[A-Za-z0-9_-]*$/.test(tokenText)) {
      return null;
    }

    const afterCursor = value.slice(cursorPosition);
    const nextCharacter = afterCursor.charAt(0);
    if (nextCharacter && !/\s/.test(nextCharacter)) {
      return null;
    }

    return {
      end: cursorPosition,
      query: tokenText,
      start: tokenStart,
    };
  }

  function updateToolPickerForCursor(value = aiInstruction) {
    const textarea = aiInstructionTextareaRef.current;
    const cursorPosition = textarea?.selectionStart ?? value.length;
    const token = findActiveToolToken(value, cursorPosition);
    setToolPickerQuery(token?.query ?? "");
    setIsToolPickerOpen(Boolean(token && activeTools.length > 0));
  }

  function updateAiInstruction(value: string, cursorPosition?: number | null) {
    setAiInstruction(value);
    const token = findActiveToolToken(value, cursorPosition ?? value.length);
    setToolPickerQuery(token?.query ?? "");
    setIsToolPickerOpen(Boolean(token && activeTools.length > 0));
  }

  function insertToolDirective(tool: AiMcpTool) {
    setAiInstruction((current) => {
      const textarea = aiInstructionTextareaRef.current;
      const cursorPosition = textarea?.selectionStart ?? current.length;
      const token = findActiveToolToken(current, cursorPosition);
      const directive = `[Use tool: ${tool.name}]`;
      const next = token
        ? `${current.slice(0, token.start)}${directive} ${current.slice(token.end)}`
        : `${current}${current.endsWith(" ") || !current ? "" : " "}${directive} `;
      const nextCursorPosition = token ? token.start + directive.length + 1 : next.length;
      window.requestAnimationFrame(() => {
        aiInstructionTextareaRef.current?.focus();
        aiInstructionTextareaRef.current?.setSelectionRange(nextCursorPosition, nextCursorPosition);
      });
      return next;
    });
    setIsToolPickerOpen(false);
    setToolPickerQuery("");
  }

  function extractRequiredToolNames(prompt: string) {
    return [...prompt.matchAll(/\[Use tool:\s*([A-Za-z0-9_+.:/-]+)]/g)].map((match) => match[1]);
  }

  async function readAttachmentFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    const nextAttachments = await Promise.all(
      files.map(
        (file) =>
          new Promise<InboxAttachment>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = typeof reader.result === "string" ? reader.result : "";
              resolve({
                data: result.includes(",") ? result.split(",").pop() || "" : result,
                filename: file.name,
                type: file.type || "application/octet-stream",
                size: file.size,
              });
            };
            reader.onerror = () => reject(reader.error ?? new Error("Could not read attachment."));
            reader.readAsDataURL(file);
          }),
      ),
    );
    setAttachments(nextAttachments);
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSavedMessage("");

    try {
      const response = await fetch("/api/inbox/send", {
        method: "POST",
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
        setError(data.error ?? "Could not send email.");
        return;
      }
      setSavedMessage("Email sent.");
      onSaved?.("sent");
      onClose();
    } catch {
      setError("Could not send email.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveDraft() {
    setIsSaving(true);
    setError(null);
    setSavedMessage("");

    try {
      const response = await fetch(
        isExistingDraft ? `/api/inbox/drafts/${encodeURIComponent(initial?.draftId || "")}` : "/api/inbox/compose",
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
        },
      );
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not save draft.");
        return;
      }
      setSavedMessage("Draft saved.");
      onSaved?.("draft");
      onClose();
    } catch {
      setError("Could not save draft.");
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
    const userMessageId = Date.now();
    const loadingMessageId = userMessageId + 1;
    setAiMessages((current) => [
      ...current,
      { id: userMessageId, role: "user", text: prompt },
      { id: loadingMessageId, isLoading: true, role: "assistant", text: "Thinking..." },
    ]);
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
          requiredTools: extractRequiredToolNames(prompt),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setAiError(data.error ?? "Could not draft with AI.");
        setAiMessages((current) => current.filter((message) => message.id !== loadingMessageId));
        return;
      }

      setAiMessages((current) =>
        current.map((message) =>
          message.id === loadingMessageId
            ? { id: loadingMessageId, role: "assistant", text: data.bodyText ?? "" }
            : message,
        ),
      );
    } catch {
      setAiError("Could not draft with AI.");
      setAiMessages((current) => current.filter((message) => message.id !== loadingMessageId));
    } finally {
      setIsGeneratingAiSuggestion(false);
    }
  }

  if (isPush && isAiDraftOpen) {
    return (
      <section className="fixed inset-0 z-[100] overflow-hidden overscroll-none bg-[#f7f7f7] text-zinc-950 md:hidden">
        <div
          className="flex w-screen flex-col overflow-hidden bg-[#f7f7f7]"
          style={{
            height: aiDraftViewport.height ? `${aiDraftViewport.height}px` : "100dvh",
            transform: aiDraftViewport.offsetTop ? `translateY(${aiDraftViewport.offsetTop}px)` : undefined,
          }}
        >
          <header className="relative z-20 flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white/95 px-2 backdrop-blur-xl">
            <Button aria-label="Back to email draft" onClick={() => setIsAiDraftOpen(false)} size="icon" type="button" variant="ghost">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h3 className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-zinc-950">AI Draft</h3>
            <span className="w-10" />
          </header>

          <main className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4",
            aiMessages.length > 0 || aiError ? "space-y-3" : "flex items-center justify-center",
          )}>
            {aiMessages.length === 0 && !aiError ? (
              <div className="mx-auto max-w-xs text-center">
                <p className="text-sm font-medium text-zinc-900">Ask AI to help draft this message.</p>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  Describe the tone or key points, then apply the response you like to the email body.
                </p>
              </div>
            ) : null}
            {aiMessages.map((message) => (
              <div className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")} key={message.id}>
                {message.role === "assistant" ? (
                  <button
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap rounded-xl border border-white/70 bg-white/70 px-4 py-3 text-left text-sm leading-6 text-zinc-800 shadow-sm backdrop-blur-xl transition",
                      message.isLoading ? "cursor-default" : "cursor-pointer hover:border-emerald-200 hover:bg-emerald-50/80",
                    )}
                    disabled={message.isLoading}
                    onClick={() => {
                      if (message.isLoading) {
                        return;
                      }
                      setBodyText(message.text);
                      setIsAiDraftOpen(false);
                    }}
                    title="Apply this draft"
                    type="button"
                  >
                    {message.isLoading ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader />
                        {message.text}
                      </span>
                    ) : (
                      <>
                        {message.text}
                        <span className="mt-2 block text-xs font-medium text-emerald-700">Click to apply</span>
                      </>
                    )}
                  </button>
                ) : (
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-xl border border-white/70 bg-white/70 px-4 py-3 text-sm leading-6 text-zinc-800 shadow-sm backdrop-blur-xl">
                    {message.text}
                  </div>
                )}
              </div>
            ))}
            {aiError ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{aiError}</p> : null}
          </main>

          <footer className="relative z-20 shrink-0 bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="relative">
              {isToolPickerOpen && filteredToolOptions.length > 0 ? (
                <div className="absolute bottom-[calc(100%+0.5rem)] left-0 right-0 z-30 overflow-hidden rounded-xl border border-white/70 bg-white/95 shadow-2xl shadow-slate-900/15 backdrop-blur-xl">
                  <div className="max-h-64 overflow-y-auto p-1">
                    {filteredToolOptions.map((tool) => (
                      <button
                        className="flex w-full cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-zinc-100/70"
                        key={tool.name}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => insertToolDirective(tool)}
                        type="button"
                      >
                        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-zinc-950">{tool.name}</span>
                          <span className="line-clamp-2 text-xs leading-5 text-zinc-500">{tool.description || "Available AI tool."}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="flex items-end gap-2">
                <textarea
                  className="min-h-10 min-w-0 flex-1 resize-none rounded-md border border-zinc-200 bg-white/60 px-3 py-2 text-sm leading-5 outline-none placeholder:text-zinc-400 shadow-sm backdrop-blur-xl focus:border-zinc-400"
                  maxLength={1000}
                  onBlur={() => window.setTimeout(() => setIsToolPickerOpen(false), 120)}
                  onChange={(event) => updateAiInstruction(event.target.value, event.target.selectionStart)}
                  onClick={() => updateToolPickerForCursor()}
                  onFocus={() => updateToolPickerForCursor()}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setIsToolPickerOpen(false);
                    }
                    if (event.key === "Enter" && !event.shiftKey && aiInstruction.trim() && !isGeneratingAiSuggestion) {
                      event.preventDefault();
                      void generateAiSuggestion();
                    }
                  }}
                  onKeyUp={() => updateToolPickerForCursor()}
                  onSelect={() => updateToolPickerForCursor()}
                  placeholder={replyContext ? "Ask AI how to draft this reply..." : "Ask AI how to draft this email..."}
                  ref={aiInstructionTextareaRef}
                  rows={1}
                  value={aiInstruction}
                />
                <Button className="h-10 w-10 shrink-0 border border-white/70 bg-white/65 text-zinc-700 shadow-sm backdrop-blur-xl hover:bg-white/85" disabled={isGeneratingAiSuggestion || !aiInstruction.trim()} onClick={() => void generateAiSuggestion()} size="icon" type="button" variant="outline">
                  {isGeneratingAiSuggestion ? <Loader /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </footer>
        </div>
      </section>
    );
  }

  return (
    <>
	    <div className={cn("fixed inset-0 z-50", isPush ? "flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#f7f7f7] md:hidden" : "flex items-center justify-center gap-3 overflow-hidden bg-slate-950/20 p-4")}>
	      <LiquidGlassCard
	        borderRadius="8px"
	        className={cn(
	        isPush
	          ? "flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden"
	          : cn("h-[92vh] w-full overflow-hidden rounded-2xl border border-white/70 bg-white/55 p-4 shadow-2xl shadow-slate-900/20 [backdrop-filter:blur(5px)] [-webkit-backdrop-filter:blur(5px)]", isAiDraftOpen ? "max-w-3xl" : "max-w-5xl"),
	        )}
	        glowIntensity="none"
	        shadowIntensity="xs"
	      >
        <div className={cn(
          isPush
            ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent"
	          : "flex h-full min-h-0 flex-col overflow-hidden rounded-xl bg-white/40 p-5 shadow-inner ring-1 ring-white/60",
	        )}>
	          <div className={cn(
	            "mb-4 flex h-14 shrink-0 items-center justify-between gap-4",
            isPush && (isAiDraftOpen
              ? "z-20 mb-0 h-16 shrink-0 border-b border-zinc-200 bg-white/90 px-2 py-2 backdrop-blur-xl"
              : "z-20 mb-0 h-16 shrink-0 border-b border-zinc-200 bg-white/90 px-2 py-2 backdrop-blur-xl"),
          )}>
            {isPush ? (
              <Button aria-label={isAiDraftOpen ? "Back to email draft" : "Back to Inbox"} onClick={isAiDraftOpen ? () => setIsAiDraftOpen(false) : onClose} size="icon" type="button" variant="ghost">
                <ChevronLeft className="h-5 w-5" />
              </Button>
            ) : (
              <span className="w-10" />
            )}
            <h3 className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-zinc-950">
              {isAiDraftOpen ? "AI Draft" : isExistingDraft ? "Edit draft" : replyContext ? "Reply" : "New email"}
            </h3>
            {isPush && isAiDraftOpen ? (
              <span className="w-10" />
            ) : isPush ? (
              <div className="flex items-center gap-1">
                {isByoAiActive ? (
                  <Button aria-label="AI Draft" onClick={() => setIsAiDraftOpen(true)} size="icon" type="button" variant="ghost">
                    <Sparkles className="h-4 w-4" />
                  </Button>
                ) : null}
                <Button aria-label="Send email" disabled={isSaving || !accountId || !to.trim() || !bodyText.trim()} form={composeFormId} size="icon" type="submit" variant="ghost">
                  {isSaving ? <Loader /> : <Send className="h-4 w-4" />}
                </Button>
	              </div>
            ) : (
              <Button aria-label={isAiDraftOpen ? "Back to email draft" : "Close compose"} onClick={isAiDraftOpen ? () => setIsAiDraftOpen(false) : onClose} size="icon" type="button" variant="ghost">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        {isAiDraftOpen && isPush ? (
          <div className={cn("flex flex-col", isPush ? "min-h-0 flex-1 overflow-hidden" : "min-h-[560px] overflow-visible")}>
            <div className={cn("min-h-0 flex-1 overflow-y-auto p-4", aiMessages.length > 0 || aiError ? "space-y-3" : "flex items-center justify-center")}>
              {aiMessages.length === 0 && !aiError ? (
                <div className="mx-auto max-w-xs text-center">
                  <p className="text-sm font-medium text-zinc-900">Ask AI to help draft this message.</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">
                    Describe the tone or key points, then apply the response you like to the email body.
                  </p>
                </div>
              ) : null}
              {aiMessages.map((message) => (
                  <div className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")} key={message.id}>
                    {message.role === "assistant" ? (
                      <button
                        className={cn(
                          "max-w-[85%] whitespace-pre-wrap rounded-xl border border-white/70 bg-white/65 px-4 py-3 text-left text-sm leading-6 text-zinc-800 shadow-sm backdrop-blur-xl transition",
                          message.isLoading ? "cursor-default" : "cursor-pointer hover:border-emerald-200 hover:bg-emerald-50/80",
                        )}
                        disabled={message.isLoading}
                        onClick={() => {
                          if (message.isLoading) {
                            return;
                          }
                          setBodyText(message.text);
                          setIsAiDraftOpen(false);
                        }}
                        title="Apply this draft"
                        type="button"
                      >
                        {message.isLoading ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader />
                            {message.text}
                          </span>
                        ) : (
                          <>
                            {message.text}
                            <span className="mt-2 block text-xs font-medium text-emerald-700">Click to apply</span>
                          </>
                        )}
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
            <div className="relative shrink-0 bg-white/35 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur-xl">
              {isToolPickerOpen && filteredToolOptions.length > 0 ? (
                <div className="absolute bottom-[calc(100%+0.5rem)] left-3 right-3 z-[110] overflow-hidden rounded-xl border border-white/70 bg-white/95 shadow-2xl shadow-slate-900/15 backdrop-blur-xl">
                  <div className="border-b border-zinc-200/70 px-3 py-2 text-xs font-medium uppercase tracking-normal text-zinc-500">
                    Available tools
                  </div>
                  <div className="max-h-64 overflow-y-auto p-1">
                    {filteredToolOptions.map((tool) => (
                      <button
                        className="flex w-full cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-zinc-100/70"
                        key={tool.name}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => insertToolDirective(tool)}
                        type="button"
                      >
                        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-zinc-950">{tool.name}</span>
                          <span className="line-clamp-2 text-xs leading-5 text-zinc-500">{tool.description || "Available AI tool."}</span>
                        </span>
                      </button>
                    ))}
	                  </div>
	                </div>
              ) : null}
              <div className="flex items-center gap-2">
                <textarea
                  className="min-h-10 min-w-0 flex-1 resize-none rounded-md border border-zinc-200 bg-white/45 px-3 py-2 text-sm leading-5 outline-none placeholder:text-zinc-400 shadow-sm backdrop-blur-xl focus:border-zinc-400"
                  maxLength={1000}
                  onBlur={() => window.setTimeout(() => setIsToolPickerOpen(false), 120)}
                  onChange={(event) => updateAiInstruction(event.target.value, event.target.selectionStart)}
                  onClick={() => updateToolPickerForCursor()}
                  onFocus={() => updateToolPickerForCursor()}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setIsToolPickerOpen(false);
                    }
                    if (event.key === "Enter" && !event.shiftKey && aiInstruction.trim() && !isGeneratingAiSuggestion) {
                      event.preventDefault();
                      void generateAiSuggestion();
                    }
                  }}
                  onKeyUp={() => updateToolPickerForCursor()}
                  onSelect={() => updateToolPickerForCursor()}
                  placeholder={replyContext ? "Ask AI how to draft this reply..." : "Ask AI how to draft this email..."}
                  ref={aiInstructionTextareaRef}
                  rows={1}
                  value={aiInstruction}
                />
                <Button className="h-9 w-9 border border-white/70 bg-white/55 text-zinc-700 shadow-sm backdrop-blur-xl hover:bg-white/75" disabled={isGeneratingAiSuggestion || !aiInstruction.trim()} onClick={() => void generateAiSuggestion()} size="icon" type="button" variant="outline">
                  {isGeneratingAiSuggestion ? <Loader /> : <Send className="h-4 w-4" />}
                </Button>
	              </div>
	            </div>
          </div>
        ) : (
	        <form className="flex min-h-0 flex-1 flex-col overflow-hidden" id={composeFormId} onSubmit={submitEmail}>
	          <div className={cn("min-h-0 flex-1 space-y-4 overflow-y-auto", isPush ? "p-4 pb-28" : "pr-1")}>
	          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
	          {savedMessage ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{savedMessage}</p> : null}
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
                    <SanitizedEmailHtml html={replyContext.bodyHtml} onLinkAction={setLinkAction} />
                  ) : (
                    <PlainTextEmailBody onLinkAction={setLinkAction} text={replyContext.bodyText || replyContext.snippet || "No message preview available."} />
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
              <textarea
                className="min-h-56 w-full resize-none overflow-hidden rounded-lg border-0 bg-white/20 px-3 py-3 text-sm leading-6 text-zinc-800 outline-none placeholder:text-zinc-400"
                onChange={(event) => setBodyText(event.target.value)}
                placeholder="Write your message..."
                ref={bodyTextareaRef}
                required
                rows={1}
                value={bodyText}
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">Attachments</span>
            <input
              className="block w-full text-sm text-zinc-600"
              multiple
              onChange={(event) => void readAttachmentFiles(event.target.files)}
              type="file"
            />
            <p className="mt-1 text-xs text-zinc-500">Attachments are included when sending or saving drafts.</p>
	            {attachments.length > 0 ? (
	              <div className="mt-2 flex flex-wrap gap-2">
                {attachments.map((attachment) => (
                  <Badge key={`${attachment.filename}-${attachment.size}`}>{attachment.filename}</Badge>
                ))}
              </div>
	            ) : null}
	          </label>
	          </div>
	          <div className={cn("flex h-16 shrink-0 items-center justify-end gap-2 border-t border-zinc-200 pt-3", isPush && "hidden")}>
	            <Button onClick={onClose} type="button" variant="outline">Cancel</Button>
            {isByoAiActive ? (
              <Button onClick={() => setIsAiDraftOpen(true)} type="button" variant="outline">
                <Sparkles className="h-4 w-4" />
                AI Draft
              </Button>
            ) : null}
            <Button disabled={isSaving || !accountId || !to.trim() || !bodyText.trim()} onClick={() => void saveDraft()} type="button" variant="outline">
              <Save className="h-4 w-4" />
              {isSaving ? "Saving..." : "Save"}
            </Button>
            <Button disabled={isSaving || !accountId || !to.trim() || !bodyText.trim()} type="submit">
              {isSaving ? "Sending..." : "Send email"}
            </Button>
          </div>
        </form>
        )}
	        </div>
	      </LiquidGlassCard>
	    {isAiDraftOpen && !isPush ? (
	      <LiquidGlassCard
	        borderRadius="8px"
	        className="inbox-ai-action-drawer hidden h-[92vh] w-[380px] shrink-0 flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/55 p-4 shadow-2xl shadow-slate-900/20 [backdrop-filter:blur(5px)] [-webkit-backdrop-filter:blur(5px)] md:flex"
	        glowIntensity="none"
	        shadowIntensity="xs"
	      >
	        <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/70 px-4">
	          <div className="min-w-0">
	            <h3 className="text-base font-semibold text-zinc-950">AI Draft</h3>
	            <p className="truncate text-sm text-zinc-500">{subject || (replyContext ? "Reply draft" : "New email")}</p>
	          </div>
	          <Button aria-label="Close AI Draft" onClick={() => setIsAiDraftOpen(false)} size="icon" type="button" variant="ghost">
	            <X className="h-4 w-4" />
	          </Button>
	        </header>
	        <main className={cn("min-h-0 flex-1 overflow-y-auto p-4", aiMessages.length > 0 || aiError ? "space-y-3" : "flex items-center justify-center")}>
	          {aiMessages.length === 0 && !aiError ? (
	            <div className="mx-auto max-w-xs text-center">
	              <p className="text-sm font-medium text-zinc-900">Ask AI to help draft this message.</p>
	              <p className="mt-2 text-sm leading-6 text-zinc-500">Describe the tone, facts, or tools to use. Apply any response you like to the email body.</p>
	            </div>
	          ) : null}
	          {aiMessages.map((message) => (
	            <div className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")} key={message.id}>
	              {message.role === "assistant" ? (
	                <button
	                  className={cn(
	                    "max-w-[85%] whitespace-pre-wrap break-words rounded-xl border border-white/70 bg-white/70 px-4 py-3 text-left text-sm leading-6 text-zinc-800 shadow-sm backdrop-blur-xl transition",
	                    message.isLoading ? "cursor-default" : "cursor-pointer hover:border-emerald-200 hover:bg-emerald-50/80",
	                  )}
	                  disabled={message.isLoading}
	                  onClick={() => {
	                    if (message.isLoading) return;
	                    setBodyText(message.text);
	                    setIsAiDraftOpen(false);
	                  }}
	                  title="Apply this draft"
	                  type="button"
	                >
	                  {message.isLoading ? (
	                    <span className="inline-flex items-center gap-2">
	                      <Loader />
	                      {message.text}
	                    </span>
	                  ) : (
	                    <>
	                      {message.text}
	                      <span className="mt-2 block text-xs font-medium text-emerald-700">Click to apply</span>
	                    </>
	                  )}
	                </button>
	              ) : (
	                <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-xl border border-white/70 bg-zinc-950/85 px-4 py-3 text-sm leading-6 text-white shadow-sm">
	                  {message.text}
	                </div>
	              )}
	            </div>
	          ))}
	          {aiError ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{aiError}</p> : null}
	        </main>
	        <footer className="relative shrink-0 border-t border-white/70 p-3">
	          {isToolPickerOpen && filteredToolOptions.length > 0 ? (
	            <div className="absolute bottom-[calc(100%+0.5rem)] left-3 right-3 z-[110] overflow-hidden rounded-xl border border-white/70 bg-white/95 shadow-2xl shadow-slate-900/15 backdrop-blur-xl">
	              <div className="border-b border-zinc-200/70 px-3 py-2 text-xs font-medium uppercase tracking-normal text-zinc-500">Available tools</div>
	              <div className="max-h-64 overflow-y-auto p-1">
	                {filteredToolOptions.map((tool) => (
	                  <button
	                    className="flex w-full cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-zinc-100/70"
	                    key={tool.name}
	                    onMouseDown={(event) => event.preventDefault()}
	                    onClick={() => insertToolDirective(tool)}
	                    type="button"
	                  >
	                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
	                    <span className="min-w-0">
	                      <span className="block truncate text-sm font-medium text-zinc-950">{tool.name}</span>
	                      <span className="line-clamp-2 text-xs leading-5 text-zinc-500">{tool.description || "Available AI tool."}</span>
	                    </span>
	                  </button>
	                ))}
	              </div>
	            </div>
	          ) : null}
	          <div className="flex items-end gap-2 rounded-xl border border-white/70 bg-white/55 p-2 shadow-sm backdrop-blur-xl">
	            <textarea
	              className="min-h-10 max-h-28 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-5 outline-none placeholder:text-zinc-400"
	              maxLength={1000}
	              onBlur={() => window.setTimeout(() => setIsToolPickerOpen(false), 120)}
	              onChange={(event) => updateAiInstruction(event.target.value, event.target.selectionStart)}
	              onClick={() => updateToolPickerForCursor()}
	              onFocus={() => updateToolPickerForCursor()}
	              onKeyDown={(event) => {
	                if (event.key === "Escape") setIsToolPickerOpen(false);
	                if (event.key === "Enter" && !event.shiftKey && aiInstruction.trim() && !isGeneratingAiSuggestion) {
	                  event.preventDefault();
	                  void generateAiSuggestion();
	                }
	              }}
	              onKeyUp={() => updateToolPickerForCursor()}
	              onSelect={() => updateToolPickerForCursor()}
	              placeholder={replyContext ? "Ask AI how to draft this reply..." : "Ask AI how to draft this email..."}
	              ref={aiInstructionTextareaRef}
	              rows={1}
	              value={aiInstruction}
	            />
	            <Button className="h-10 w-10 shrink-0 border border-white/70 bg-white/65 text-zinc-700 shadow-sm backdrop-blur-xl hover:bg-white/85" disabled={isGeneratingAiSuggestion || !aiInstruction.trim()} onClick={() => void generateAiSuggestion()} size="icon" type="button" variant="outline">
	              {isGeneratingAiSuggestion ? <Loader /> : <Send className="h-4 w-4" />}
	            </Button>
	          </div>
	        </footer>
	      </LiquidGlassCard>
	    ) : null}
	    </div>
	    {linkAction ? <EmailLinkActionSheet link={linkAction} onClose={() => setLinkAction(null)} /> : null}
	    </>
	  );
}

function LabelsPage({ privacyMode }: { privacyMode: boolean }) {
  const [labels, setLabels] = useState<Label[]>([]);
  const [connectedAccountCount, setConnectedAccountCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [isAddLabelModalOpen, setIsAddLabelModalOpen] = useState(false);
  const [isAddLabelMenuOpen, setIsAddLabelMenuOpen] = useState(false);
  const [isCsvUploadModalOpen, setIsCsvUploadModalOpen] = useState(false);
  const [isProviderImportModalOpen, setIsProviderImportModalOpen] = useState(false);
  const [providerLabelOptions, setProviderLabelOptions] = useState<ProviderLabelOption[]>([]);
  const [selectedProviderLabelNames, setSelectedProviderLabelNames] = useState<string[]>([]);
  const [providerLabelDescriptions, setProviderLabelDescriptions] = useState<Record<string, string>>({});
  const [isLoadingProviderLabels, setIsLoadingProviderLabels] = useState(false);
  const [providerImportError, setProviderImportError] = useState<string | null>(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState("0.90");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [deleteConfirmationIds, setDeleteConfirmationIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [labelAction, setLabelAction] = useState<
    "create" | "update" | "delete" | "retry" | "sync" | "refresh" | "upload" | "provider" | null
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
      setIsCsvUploadModalOpen(false);
    } catch {
      setUploadError("Could not upload labels.");
    } finally {
      setIsSaving(false);
      setLabelAction(null);
    }
  }

  async function openProviderImportModal() {
    setIsAddLabelMenuOpen(false);
    setProviderImportError(null);
    setIsProviderImportModalOpen(true);
    setIsLoadingProviderLabels(true);

    try {
      const response = await fetch("/api/labels/provider-options", { credentials: "include" });
      const data = await response.json();

      if (!response.ok) {
        setProviderImportError(data.error ?? "Could not load labels from providers.");
        setProviderLabelOptions([]);
        return;
      }

      const options = (data.labels ?? []) as ProviderLabelOption[];
      setProviderLabelOptions(options);
      setSelectedProviderLabelNames(options.filter((option) => option.exists).map((option) => option.name));
      setProviderLabelDescriptions(
        options.reduce<Record<string, string>>((descriptions, option) => {
          descriptions[option.name] = option.description ?? "";
          return descriptions;
        }, {}),
      );

      if (data.errors?.length) {
        setProviderImportError(
          `Loaded labels from available accounts, but ${data.errors.length} account${data.errors.length === 1 ? "" : "s"} could not be checked.`,
        );
      }
    } catch {
      setProviderImportError("Could not load labels from providers.");
      setProviderLabelOptions([]);
    } finally {
      setIsLoadingProviderLabels(false);
    }
  }

  function toggleProviderLabel(option: ProviderLabelOption) {
    if (option.exists || isSaving) {
      return;
    }

    setSelectedProviderLabelNames((current) =>
      current.includes(option.name) ? current.filter((name) => name !== option.name) : [...current, option.name],
    );
  }

  async function importProviderLabels() {
    const selectedOptions = providerLabelOptions.filter((option) => selectedProviderLabelNames.includes(option.name) && !option.exists);
    if (selectedOptions.length === 0) {
      setProviderImportError("Select at least one provider label that is not already in Emailable.");
      return;
    }

    for (const option of selectedOptions) {
      const validationError = validateLabelInput(option.name, providerLabelDescriptions[option.name] ?? "");
      if (validationError) {
        setProviderImportError(`${option.name}: ${validationError}`);
        return;
      }
    }

    setProviderImportError(null);
    setIsSaving(true);
    setLabelAction("provider");

    try {
      const response = await fetch("/api/labels/import-provider", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          labels: selectedOptions.map((option) => ({
            name: option.name,
            description: providerLabelDescriptions[option.name] ?? "",
          })),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setProviderImportError(data.error ?? "Could not import labels from providers.");
        return;
      }

      setIsProviderImportModalOpen(false);
      await loadLabels();
    } catch {
      setProviderImportError("Could not import labels from providers.");
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

                <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-200 pt-4">
                  <Button disabled={isSaving} onClick={() => setIsAddLabelModalOpen(false)} type="button" variant="outline">
                    Cancel
                  </Button>
                  <Button disabled={isSaving} type="submit">
                    {labelAction === "create" ? <Loader /> : <Plus className="h-4 w-4" />}
                    {labelAction === "create" ? "Adding..." : "Add Label"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
      {isCsvUploadModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 p-4">
          <div className="w-[min(640px,100%)] rounded-2xl border border-white/70 bg-white/55 p-4 shadow-2xl shadow-slate-900/20 [backdrop-filter:blur(5px)] [-webkit-backdrop-filter:blur(5px)]">
            <div className="rounded-xl bg-white/40 p-5 shadow-inner ring-1 ring-white/60">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-zinc-950">Upload Labels CSV</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Upload up to 20 labels at a time. The CSV header must be exactly <span className="font-medium text-zinc-700">Name, Description</span>.
                  </p>
                </div>
                <Button
                  aria-label="Close CSV upload modal"
                  disabled={isSaving}
                  onClick={() => setIsCsvUploadModalOpen(false)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {uploadError ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{uploadError}</p> : null}

              <div
                className="prose prose-sm mt-5 max-w-none rounded-md border border-zinc-200 bg-white/45 p-4"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdownHtml(`| Name | Description |\n| --- | --- |\n| Action Required | Emails that need a response or decision. |\n| Reference | Emails worth keeping for later. |`),
                }}
              />

              <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-zinc-200 pt-4">
                <input
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(event) => void handleCsvUpload(event)}
                  ref={csvUploadRef}
                  type="file"
                />
                <Button disabled={isSaving} onClick={() => setIsCsvUploadModalOpen(false)} type="button" variant="outline">
                  Cancel
                </Button>
                <Button disabled={isSaving} onClick={() => csvUploadRef.current?.click()} type="button">
                  {labelAction === "upload" ? <Loader /> : <Upload className="h-4 w-4" />}
                  {labelAction === "upload" ? "Uploading..." : "Choose File"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {isProviderImportModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 p-4">
          <div className="flex max-h-[90vh] w-[min(920px,100%)] flex-col rounded-2xl border border-white/70 bg-white/55 p-4 shadow-2xl shadow-slate-900/20 [backdrop-filter:blur(5px)] [-webkit-backdrop-filter:blur(5px)]">
            <div className="flex min-h-0 flex-1 flex-col rounded-xl bg-white/40 shadow-inner ring-1 ring-white/60">
              <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold text-zinc-950">Choose from Providers</h2>
                  <p className="mt-1 max-w-3xl text-sm text-zinc-500">
                    Import existing labels or folders from connected accounts. If a chosen label is missing from another account, Emailable will create it there during sync.
                  </p>
                </div>
                <Button
                  aria-label="Close provider labels modal"
                  disabled={isSaving}
                  onClick={() => setIsProviderImportModalOpen(false)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
                {providerImportError ? <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{providerImportError}</p> : null}
                {isLoadingProviderLabels ? (
                  <div className="rounded-md border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
                    Loading labels and folders from providers...
                  </div>
                ) : providerLabelOptions.length === 0 ? (
                  <div className="rounded-md border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
                    No provider labels or folders were found.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-md border border-zinc-200">
                    <div className="grid min-w-[760px] grid-cols-[48px_1fr_1.6fr] gap-3 border-b border-zinc-200 bg-white/35 px-4 py-3 text-xs font-medium uppercase text-zinc-500">
                      <span />
                      <span>Name</span>
                      <span>Description</span>
                    </div>
                    <div className="divide-y divide-zinc-200">
                      {providerLabelOptions.map((option) => {
                        const isSelected = selectedProviderLabelNames.includes(option.name);
                        const disabled = option.exists;
                        return (
                          <div
                            className={cn(
                              "grid min-w-[760px] grid-cols-[48px_1fr_1.6fr] gap-3 px-4 py-3",
                              disabled ? "bg-zinc-100/60 text-zinc-400" : "bg-white/20",
                            )}
                            key={option.name}
                          >
                            <input
                              checked={isSelected}
                              className="mt-2 h-4 w-4"
                              disabled={disabled || isSaving}
                              onChange={() => toggleProviderLabel(option)}
                              type="checkbox"
                            />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-medium text-zinc-950">{option.name}</p>
                                {disabled ? <Badge className="border-zinc-200 bg-zinc-100 text-zinc-500">Already added</Badge> : null}
                              </div>
                              <p className="mt-1 text-xs text-zinc-500">
                                Found in{" "}
                                {option.accounts
                                  .map((account) => `${providerLabel(account.provider)} ${formatEmailForPrivacy(account.email, privacyMode)}`)
                                  .join(", ")}
                              </p>
                            </div>
                            <div>
                              <textarea
                                className="min-h-20 w-full glass-panel rounded-md border px-3 py-2 text-sm outline-none transition-colors focus:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={disabled || !isSelected || isSaving}
                                maxLength={LABEL_DESCRIPTION_MAX_LENGTH}
                                onChange={(event) =>
                                  setProviderLabelDescriptions((current) => ({
                                    ...current,
                                    [option.name]: event.target.value,
                                  }))
                                }
                                placeholder="Describe when this label should be used."
                                value={providerLabelDescriptions[option.name] ?? ""}
                              />
                              <div className="mt-1 flex justify-end text-xs text-zinc-500">
                                <span>
                                  {(providerLabelDescriptions[option.name] ?? "").length}/{LABEL_DESCRIPTION_MAX_LENGTH}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-200 px-5 py-4">
                <Button disabled={isSaving} onClick={() => setIsProviderImportModalOpen(false)} type="button" variant="outline">
                  Cancel
                </Button>
                <Button disabled={isSaving || isLoadingProviderLabels} onClick={() => void importProviderLabels()} type="button">
                  {labelAction === "provider" ? <Loader /> : <Plus className="h-4 w-4" />}
                  {labelAction === "provider" ? "Importing..." : "Import selected"}
                </Button>
              </div>
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
            <div className="relative">
              <Button
                aria-expanded={isAddLabelMenuOpen}
                aria-label="Add label options"
                className="glass-icon-button h-10 w-10 rounded-full border border-white/70 bg-white/45 p-0 text-zinc-950 shadow-sm hover:bg-white/65"
                disabled={isSaving}
                onClick={() => setIsAddLabelMenuOpen((open) => !open)}
                type="button"
                variant="outline"
              >
                <Plus className="h-5 w-5" />
              </Button>
              {isAddLabelMenuOpen ? (
                <div className="absolute right-0 top-12 z-30 w-56 rounded-xl border border-white/70 bg-white/75 p-1 shadow-xl shadow-slate-900/10 [backdrop-filter:blur(8px)] [-webkit-backdrop-filter:blur(8px)]">
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-700 hover:bg-white/70"
                    onClick={() => {
                      setError(null);
                      setUploadError(null);
                      setIsAddLabelMenuOpen(false);
                      setIsAddLabelModalOpen(true);
                    }}
                    type="button"
                  >
                    <Plus className="h-4 w-4" />
                    Add Manually
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-700 hover:bg-white/70"
                    onClick={() => {
                      setUploadError(null);
                      setIsAddLabelMenuOpen(false);
                      setIsCsvUploadModalOpen(true);
                    }}
                    type="button"
                  >
                    <Upload className="h-4 w-4" />
                    Upload CSV
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-700 hover:bg-white/70"
                    onClick={() => void openProviderImportModal()}
                    type="button"
                  >
                    <Inbox className="h-4 w-4" />
                    Choose from Providers
                  </button>
                </div>
              ) : null}
            </div>
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
  const [activeTab, setActiveTab] = useState<MetricsTab>(() => metricsTabFromPath(window.location.pathname));
  const [logCategory, setLogCategory] = useState("all");
  const [alarms, setAlarms] = useState<LogAlarm[]>([]);
  const [selectedAlarmIds, setSelectedAlarmIds] = useState<string[]>([]);
  const [selectedAlarm, setSelectedAlarm] = useState<LogAlarm | null>(null);
  const [editingAlarm, setEditingAlarm] = useState<LogAlarm | null>(null);
  const [alarmDraft, setAlarmDraft] = useState<LogAlarmDraft>(createEmptyAlarmDraft());
  const [alarmGranularity, setAlarmGranularity] = useState<AlarmGranularity>("day");
  const [alarmSimulation, setAlarmSimulation] = useState<AlarmSimulationPoint[]>([]);
  const [selectedAlarmSimulation, setSelectedAlarmSimulation] = useState<AlarmSimulationPoint[]>([]);
  const [alarmError, setAlarmError] = useState<string | null>(null);
  const [isLoadingAlarms, setIsLoadingAlarms] = useState(false);
  const [isSavingAlarm, setIsSavingAlarm] = useState(false);
  const [isAlarmEditorOpen, setIsAlarmEditorOpen] = useState(false);
  const [isAlarmDeleteConfirmOpen, setIsAlarmDeleteConfirmOpen] = useState(false);
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
    if (activeTab === "alarms") {
      void loadAlarms();
    }
  }, [activeTab, logCategory]);

  useEffect(() => {
    if (!isAlarmEditorOpen) {
      return;
    }
    const timeout = window.setTimeout(() => {
      void loadAlarmSimulation(alarmDraft);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [isAlarmEditorOpen, alarmDraft.logGroup, alarmDraft.periodMinutes, alarmDraft.thresholdCount, alarmGranularity]);

  useEffect(() => {
    if (isAlarmEditorOpen || !selectedAlarm) {
      return;
    }
    void loadAlarmSimulation(alarmToDraft(selectedAlarm), setSelectedAlarmSimulation);
  }, [isAlarmEditorOpen, selectedAlarm?.id, alarmGranularity]);

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

  async function loadAlarms() {
    setIsLoadingAlarms(true);
    setAlarmError(null);
    try {
      const response = await fetch("/api/alarms", { credentials: "include" });
      const data = await response.json();
      if (!response.ok) {
        setAlarmError(data.error ?? "Could not load alarms.");
        return;
      }
      const nextAlarms = data.alarms ?? [];
      setAlarms(nextAlarms);
      setSelectedAlarmIds((current) => current.filter((id) => nextAlarms.some((alarm: LogAlarm) => alarm.id === id)));
      setSelectedAlarm((current) => {
        if (!current) {
          return current;
        }
        const refreshed = nextAlarms.find((alarm: LogAlarm) => alarm.id === current.id);
        return refreshed ?? null;
      });
    } catch {
      setAlarmError("Could not load alarms.");
    } finally {
      setIsLoadingAlarms(false);
    }
  }

  async function loadAlarmSimulation(draft: LogAlarmDraft, setSimulation: (simulation: AlarmSimulationPoint[]) => void = setAlarmSimulation) {
    try {
      const params = new URLSearchParams({
        logGroup: draft.logGroup,
        periodMinutes: String(draft.periodMinutes),
        thresholdCount: String(draft.thresholdCount),
        granularity: alarmGranularity,
      });
      const response = await fetch(`/api/alarms/simulation?${params.toString()}`, { credentials: "include" });
      const data = await response.json();
      if (response.ok) {
        setSimulation(data.simulation ?? []);
      }
    } catch {
      setSimulation([]);
    }
  }

  function startCreateAlarm() {
    const draft = createEmptyAlarmDraft();
    setEditingAlarm(null);
    setAlarmDraft(draft);
    setAlarmSimulation([]);
    setAlarmError(null);
    setIsAlarmEditorOpen(true);
    void loadAlarmSimulation(draft);
  }

  function startEditAlarm(alarm: LogAlarm) {
    const draft = alarmToDraft(alarm);
    setEditingAlarm(alarm);
    setAlarmDraft(draft);
    setAlarmSimulation(alarm.simulation ?? []);
    setAlarmError(null);
    setIsAlarmEditorOpen(true);
    void loadAlarmSimulation(draft);
  }

  function selectAlarmForGraph(alarm: LogAlarm) {
    setSelectedAlarm(alarm);
    setSelectedAlarmSimulation(alarm.simulation ?? []);
    setAlarmError(null);
    void loadAlarmSimulation(alarmToDraft(alarm), setSelectedAlarmSimulation);
  }

  async function saveAlarm() {
    setIsSavingAlarm(true);
    setAlarmError(null);
    try {
      const response = await fetch(editingAlarm ? `/api/alarms/${editingAlarm.id}` : "/api/alarms", {
        method: editingAlarm ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(alarmDraft),
      });
      const data = await response.json();
      if (!response.ok) {
        setAlarmError(data.error ?? "Could not save alarm.");
        return;
      }
      setIsAlarmEditorOpen(false);
      setEditingAlarm(null);
      await loadAlarms();
    } catch {
      setAlarmError("Could not save alarm.");
    } finally {
      setIsSavingAlarm(false);
    }
  }

  async function deleteSelectedAlarms() {
    const ids = editingAlarm ? [editingAlarm.id] : selectedAlarmIds;
    if (!ids.length) {
      return;
    }
    setAlarmError(null);
    try {
      const response = await fetch("/api/alarms", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await response.json();
      if (!response.ok) {
        setAlarmError(data.error ?? "Could not delete alarms.");
        return;
      }
      setIsAlarmDeleteConfirmOpen(false);
      setIsAlarmEditorOpen(false);
      setEditingAlarm(null);
      setSelectedAlarm((current) => (current && ids.includes(current.id) ? null : current));
      setSelectedAlarmSimulation((current) => (selectedAlarm && ids.includes(selectedAlarm.id) ? [] : current));
      setSelectedAlarmIds([]);
      await loadAlarms();
    } catch {
      setAlarmError("Could not delete alarms.");
    }
  }

  function toggleSelectedAlarm(id: string) {
    setSelectedAlarmIds((current) => (current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]));
  }

  function selectTab(tab: MetricsTab) {
    setActiveTab(tab);
    const nextPath = tab === "logs" ? "/metrics/logs" : tab === "alarms" ? "/metrics/alarms" : "/metrics";
    if (stripRuntimeBasePath(window.location.pathname) !== nextPath) {
      window.history.pushState({}, "", getRuntimeUrl(nextPath));
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div>
            <CardTitle>{activeTab === "metrics" ? "Metrics" : activeTab === "logs" ? "Logs" : "Alarms"}</CardTitle>
            <CardDescription>
              {activeTab === "metrics"
                ? "Track rule volume, review status, labeled emails, and AI usage."
                : activeTab === "logs"
                  ? "Review simplified system activity across email, AI, endpoints, webhooks, and MCP server usage."
                  : "Create alerts when certain classes of errors happen repeatedly."}
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
          <MetricsTabPill activeTab={activeTab} onSelect={selectTab} />
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
            {metrics?.aiEnabled ? <AiUsageChartCard data={metrics?.aiUsage ?? []} isLoading={isLoading} /> : null}
          </div>
        </>
      ) : activeTab === "logs" ? (
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
      ) : isAlarmEditorOpen ? (
        <AlarmEditorView
          alarm={editingAlarm}
          draft={alarmDraft}
          error={alarmError}
          isSaving={isSavingAlarm}
          granularity={alarmGranularity}
          onBack={() => {
            setIsAlarmEditorOpen(false);
            setEditingAlarm(null);
          }}
          onChange={setAlarmDraft}
          onGranularityChange={setAlarmGranularity}
          onDelete={() => setIsAlarmDeleteConfirmOpen(true)}
          onSave={() => void saveAlarm()}
          simulation={alarmSimulation}
        />
      ) : (
        <>
          {alarmError ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{alarmError}</p> : null}
          <AlarmResizableSplit
            defaultLeftWidth={56}
            left={
              <AlarmListView
                alarms={alarms}
                isLoading={isLoadingAlarms}
                onCreate={startCreateAlarm}
                onDelete={() => setIsAlarmDeleteConfirmOpen(true)}
                onEditSelected={() => {
                  if (selectedAlarm) {
                    startEditAlarm(selectedAlarm);
                  }
                }}
                onOpen={selectAlarmForGraph}
                onToggle={toggleSelectedAlarm}
                selectedGraphAlarmId={selectedAlarm?.id ?? null}
                selectedIds={selectedAlarmIds}
              />
            }
            right={
              selectedAlarm ? (
                <AlarmSimulationChart
                  data={selectedAlarmSimulation}
                  description="Last 14 days of errors compared against this alarm threshold."
                  granularity={alarmGranularity}
                  onGranularityChange={setAlarmGranularity}
                  title={selectedAlarm.name}
                />
              ) : (
                <Card className="h-full">
                  <CardContent className="flex min-h-80 items-center justify-center pt-6">
                    <p className="rounded-md border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500">Choose an alarm to preview its threshold timeline.</p>
                  </CardContent>
                </Card>
              )
            }
          />
        </>
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
      {isAlarmDeleteConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 p-4">
          <button aria-label="Close delete alarm confirmation" className="absolute inset-0 cursor-default" onClick={() => setIsAlarmDeleteConfirmOpen(false)} type="button" />
          <div className="relative w-full max-w-md rounded-2xl border border-white/70 bg-white/55 p-4 shadow-2xl shadow-slate-900/20 [backdrop-filter:blur(5px)] [-webkit-backdrop-filter:blur(5px)]">
            <div className="rounded-xl bg-white/40 p-5 shadow-inner ring-1 ring-white/60">
              <h3 className="text-lg font-semibold text-zinc-950">Delete alarm?</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600">This permanently deletes the selected alarm configuration. Existing logs are not deleted.</p>
              <div className="mt-5 flex justify-end gap-2">
                <Button onClick={() => setIsAlarmDeleteConfirmOpen(false)} type="button" variant="outline">Cancel</Button>
                <Button className="bg-red-600 text-white hover:bg-red-700" onClick={() => void deleteSelectedAlarms()} type="button">
                  <Trash2 className="h-4 w-4" />
                  Delete
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
          <CardDescription>Configure Emailable's AI providers, tools, and custom automations.</CardDescription>
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
                  Create custom AI system messages that can run after emails are labeled.
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

function AiPromptLibraryPage({ privacyMode: _privacyMode }: { privacyMode: boolean }) {
  return <AiPromptsManager />;
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
  const [isRefreshingMcpTools, setIsRefreshingMcpTools] = useState(false);
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

  async function refreshAllMcpTools() {
    if (isRefreshingMcpTools) {
      return;
    }

    setIsRefreshingMcpTools(true);
    setPageError(null);

    try {
      const response = await fetch("/api/byoai/mcp-clients/refresh-tools", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok) {
        setPageError(data.error ?? "Could not refresh MCP server tools.");
        return;
      }

      const nextClients = ensureSystemMcpClient(data.mcpClients ?? []);
      setMcpClients(nextClients);
      setMcpClient(data.mcpClient ?? (nextClients.length ? nextClients[0] : mcpClient));
      setToast({
        tone: data.failed?.length ? "warning" : "success",
        message: data.message ?? "MCP server tools refreshed.",
      });
    } catch {
      setPageError("Could not refresh MCP server tools.");
    } finally {
      setIsRefreshingMcpTools(false);
    }
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
                    <th className="w-12 px-4 py-3 text-right">
                      <Tooltip align="end" text="Refresh tool names, descriptions, and schemas from every saved MCP server.">
                        <Button
                          aria-label="Refresh all MCP tools"
                          disabled={mcpSectionDisabled || externalMcpClientCount === 0 || isRefreshingMcpTools}
                          onClick={() => void refreshAllMcpTools()}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          {isRefreshingMcpTools ? <Loader /> : <RefreshCw className="h-4 w-4" />}
                        </Button>
                      </Tooltip>
                    </th>
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
      <div className="flex max-h-[92vh] w-full max-w-4xl rounded-2xl border border-white/70 bg-white/35 p-3 shadow-2xl backdrop-blur-[5px]">
        <div className="flex min-h-0 w-full flex-col overflow-hidden rounded-xl border border-white/80 bg-white/40 shadow-sm">
          <div className="shrink-0 border-b border-white/70 p-5">
            <div className="flex items-start justify-between gap-4">
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
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
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
                          <span
                            className="prose prose-xs mt-1 block max-w-none break-words text-zinc-500 [&_*]:break-words [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1"
                            dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(formatMcpToolDescription(tool.description)) }}
                          />
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-white/70 p-5">
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

function formatMcpToolDescription(description?: string) {
  const value = description?.trim() || "No description provided.";
  return value.replace(/\\n/g, "\n");
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

function EmailAccountsPage({ isHomeAssistant, privacyMode }: { isHomeAssistant: boolean; privacyMode: boolean }) {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [providers, setProviders] = useState<EmailProvider[]>([]);
  const [selectedAccountAction, setSelectedAccountAction] = useState<EmailAccount | null>(null);
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
  const [pendingOAuth, setPendingOAuth] = useState<PendingEmailAccountOAuth | null>(() =>
    isHomeAssistant ? readPendingEmailAccountOAuth() : null,
  );
  const [showManualOAuthModal, setShowManualOAuthModal] = useState(false);
  const [manualOAuthUrl, setManualOAuthUrl] = useState("");
  const [manualOAuthError, setManualOAuthError] = useState<string | null>(null);
  const [isCompletingOAuth, setIsCompletingOAuth] = useState(false);
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
  const visibleProviders = providers.filter((provider) => provider.manual || provider.configured);

  useEffect(() => {
    void loadEmailAccounts();
  }, []);

  useEffect(() => {
    if (!isHomeAssistant) {
      setPendingOAuth(null);
      return;
    }

    const pending = readPendingEmailAccountOAuth();
    setPendingOAuth(pending);

    if (pending) {
      void completeDetectedHomeAssistantOAuthCallback(pending);
    }
  }, [isHomeAssistant]);

  useEffect(() => {
    if (!pendingOAuth) {
      return;
    }

    const remainingMs = EMAIL_ACCOUNT_OAUTH_WINDOW_MS - (Date.now() - pendingOAuth.startedAt);
    if (remainingMs <= 0) {
      clearHomeAssistantOAuthPendingState();
      return;
    }

    const timer = window.setTimeout(clearHomeAssistantOAuthPendingState, remainingMs);
    return () => window.clearTimeout(timer);
  }, [pendingOAuth]);

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
      const accountsData = await accountsResponse.json().catch(() => ({}));
      const providersData = await providersResponse.json().catch(() => ({}));
      const pollingData = await pollingResponse.json().catch(() => null);

      if (!accountsResponse.ok) {
        setError(accountsData.error ?? "Could not load email accounts.");
        return;
      }

      setAccounts(accountsData.accounts ?? []);
      setSelectedAccountAction((selected) => {
        if (!selected) {
          return null;
        }
        return (accountsData.accounts ?? []).find((account: EmailAccount) => account.id === selected.id) ?? null;
      });
      if (providersResponse.ok) {
        setProviders(providersData.providers ?? []);
      } else {
        setProviders([]);
      }

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
      setSelectedAccountAction((selected) => {
        if (!selected) {
          return null;
        }
        const status = statuses.get(selected.id);
        return status ? { ...selected, status: status.status, statusMessage: status.statusMessage } : selected;
      });
    } catch {
      setError("Could not check email account statuses.");
      setAccounts((current) => current.map((account) => (account.status === "checking" ? { ...account, status: "unchecked", statusMessage: "Not checked" } : account)));
    } finally {
      setIsCheckingTokens(false);
    }
  }

  function clearHomeAssistantOAuthPendingState() {
    clearPendingEmailAccountOAuth();
    setPendingOAuth(null);
    setShowManualOAuthModal(false);
    setManualOAuthUrl("");
    setManualOAuthError(null);
    setShowProviderChoices(false);
  }

  async function completeDetectedHomeAssistantOAuthCallback(pending: PendingEmailAccountOAuth) {
    const callback = findEmailAccountOAuthCallbackInBrowserUrls();
    if (!callback) {
      return;
    }

    if (callback.provider !== pending.provider) {
      return;
    }

    await completeHomeAssistantOAuthCallback(callback);
  }

  async function completeHomeAssistantOAuthCallback(callback: EmailAccountOAuthCallback) {
    setIsCompletingOAuth(true);
    setManualOAuthError(null);
    setError(null);

    try {
      const data = await completeEmailAccountOAuthCallback(callback);
      if (data.status !== "connected") {
        const message = typeof data.error === "string" ? data.error : "Could not complete the OAuth callback.";
        setManualOAuthError(message);
        setError(message);
        return;
      }

      clearPendingEmailAccountOAuth();
      setPendingOAuth(null);
      setShowManualOAuthModal(false);
      setManualOAuthUrl("");
      const returnUrl = typeof data.returnUrl === "string" ? data.returnUrl : getRuntimeUrl("/settings/email-accounts?emailAccountStatus=connected");
      window.location.replace(returnUrl);
    } catch {
      setManualOAuthError("Could not complete the OAuth callback. Paste the full callback URL and try again.");
      setError("Could not complete the OAuth callback.");
    } finally {
      setIsCompletingOAuth(false);
    }
  }

  async function completeManualOAuthCallback() {
    if (!pendingOAuth) {
      setManualOAuthError("No pending account connection was found. Start the provider connection again.");
      return;
    }

    const callback = parseEmailAccountOAuthCallbackUrl(manualOAuthUrl);
    if (!callback) {
      setManualOAuthError("Paste the full URL from the browser address bar after the provider redirects back to Emailable.");
      return;
    }

    if (callback.provider !== pendingOAuth.provider) {
      setManualOAuthError(`This callback is for ${providerLabel(callback.provider)}, but the pending connection is for ${providerLabel(pendingOAuth.provider)}.`);
      return;
    }

    await completeHomeAssistantOAuthCallback(callback);
  }

  function connectProvider(providerId: string) {
    if (providerId === "imap") {
      setError(null);
      setImapError(null);
      setShowImapModal(true);
      return;
    }

    const connectUrl = getAbsoluteRuntimeUrl(`/api/email-accounts/connect/${providerId}`);
    if (isHomeAssistant) {
      const pending = storePendingEmailAccountOAuth(providerId);
      setPendingOAuth(pending);
      setShowProviderChoices(false);
      setManualOAuthError(null);
    }

    if (window.top && window.top !== window) {
      window.top.location.href = connectUrl;
    } else {
      window.location.href = connectUrl;
    }
  }

  function refreshAccount(account: EmailAccount) {
    setSelectedAccountAction(null);
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

      setSelectedAccountAction(null);
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
              Connect available inbox providers so the app can manage labels or folders, query emails, and read account metadata.
            </CardDescription>
          </div>
          <Button
            disabled={Boolean(pendingOAuth) || isCompletingOAuth}
            onClick={() => setShowProviderChoices((value) => !value)}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Add Email Account
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          {isHomeAssistant && pendingOAuth ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">Waiting for {providerLabel(pendingOAuth.provider)} authorization to return.</p>
                  <p className="mt-1 text-amber-800">
                    Home Assistant sometimes opens the provider callback in its own shell. If Emailable does not finish automatically, complete it manually within 3 minutes.
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    disabled={isCompletingOAuth}
                    onClick={() => {
                      setManualOAuthError(null);
                      setShowManualOAuthModal(true);
                    }}
                    type="button"
                    variant="outline"
                  >
                    Complete manually
                  </Button>
                  <Button disabled={isCompletingOAuth} onClick={clearHomeAssistantOAuthPendingState} type="button" variant="ghost">
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          {showProviderChoices ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {visibleProviders.map((provider) => (
                <button
                  className="glass-panel rounded-md border p-4 text-left transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={Boolean(pendingOAuth) || isCompletingOAuth}
                  key={provider.id}
                  onClick={() => connectProvider(provider.id)}
                  type="button"
                >
                  <p className="text-sm font-medium text-zinc-950">{provider.label}</p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {provider.manual ? "Use IMAP app password" : "Connect account"}
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
              <div className="hidden overflow-hidden rounded-md border border-zinc-200 md:block">
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
              <div className="overflow-hidden rounded-md border border-white/70 bg-white/40 shadow-sm backdrop-blur-xl md:hidden">
                <div className="divide-y divide-zinc-200/80">
                  {accounts.map((account) => (
                    <button
                      className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/70"
                      key={account.id}
                      onClick={() => setSelectedAccountAction(account)}
                      type="button"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-medium text-zinc-950">{formatEmailForPrivacy(account.email, privacyMode)}</p>
                        <p className="mt-0.5 truncate text-sm text-zinc-500">{account.displayName || providerLabel(account.provider)}</p>
                      </div>
                      <EmailAccountStatusBadge account={account} />
                    </button>
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
                    Use this for providers without a dedicated OAuth option. Do not use it for Microsoft accounts.
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
      {showManualOAuthModal && pendingOAuth ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/70 bg-white/55 p-4 shadow-2xl shadow-slate-900/20 [backdrop-filter:blur(5px)] [-webkit-backdrop-filter:blur(5px)]">
            <div className="rounded-xl bg-white/40 p-5 shadow-inner ring-1 ring-white/60">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-950">Complete account connection</h3>
                  <p className="mt-1 text-sm text-zinc-600">
                    Copy the full URL from the browser address bar after {providerLabel(pendingOAuth.provider)} redirects back, then paste it here.
                  </p>
                </div>
                <Button
                  aria-label="Close manual OAuth completion"
                  disabled={isCompletingOAuth}
                  onClick={() => setShowManualOAuthModal(false)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <label className="mt-5 block">
                <span className="mb-1 block text-sm font-medium text-zinc-700">Callback URL</span>
                <textarea
                  className="min-h-28 w-full resize-y rounded-md border border-zinc-200 bg-white/60 px-3 py-2 text-sm outline-none transition-colors focus:border-zinc-400"
                  disabled={isCompletingOAuth}
                  onChange={(event) => {
                    setManualOAuthUrl(event.target.value);
                    setManualOAuthError(null);
                  }}
                  placeholder="https://.../api/email-accounts/callback/gmail?state=...&code=..."
                  value={manualOAuthUrl}
                />
              </label>

              {manualOAuthError ? (
                <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{manualOAuthError}</p>
              ) : null}

              <div className="mt-5 flex justify-end gap-2">
                <Button disabled={isCompletingOAuth} onClick={() => setShowManualOAuthModal(false)} type="button" variant="outline">
                  Close
                </Button>
                <Button disabled={isCompletingOAuth || manualOAuthUrl.trim().length === 0} onClick={() => void completeManualOAuthCallback()} type="button">
                  {isCompletingOAuth ? <Loader /> : null}
                  Complete connection
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {selectedAccountAction ? (
        <EmailAccountActionSheet
          account={selectedAccountAction}
          isDeleting={isDeleting === selectedAccountAction.id}
          onClose={() => setSelectedAccountAction(null)}
          onRefresh={() => refreshAccount(selectedAccountAction)}
          onRemove={() => void removeAccount(selectedAccountAction.id)}
          privacyMode={privacyMode}
        />
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
            notes={["Returns confidence threshold, synced labels, and custom prompt automations with supported template strings rendered."]}
            response={{
              confidenceThreshold: 0.9,
              labels: [
                { name: "Invoice", description: "Use when confidence is at least 0.9." },
                { name: "Client Ops", description: "Operational client messages." },
              ],
              customPrompts: [
                {
                  id: "prompt-id",
                  name: "Calendar follow up",
                  description: "Create follow-up events from labeled emails.",
                  markdown: "When this email needs follow-up, create an appropriate calendar event.",
                  toolChoice: "auto",
                  selectedTools: [{ toolClientId: "system", toolName: "find_email" }],
                },
              ],
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
                <p className="text-sm text-zinc-500">These endpoints use your saved AI platforms and Emailable's internal AI workflows.</p>
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
                  "Uses Emailable's internal reply-writing guidance and creates a provider draft reply from the AI response.",
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
                  "Uses Emailable's internal label triage prompt.",
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

function storePendingEmailAccountOAuth(provider: string) {
  const pending = { provider, startedAt: Date.now() };
  sessionStorage.setItem(EMAIL_ACCOUNT_OAUTH_PENDING_KEY, JSON.stringify(pending));
  return pending;
}

function readPendingEmailAccountOAuth(): PendingEmailAccountOAuth | null {
  const raw = sessionStorage.getItem(EMAIL_ACCOUNT_OAUTH_PENDING_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PendingEmailAccountOAuth>;
    if (typeof parsed.provider !== "string" || typeof parsed.startedAt !== "number" || !Number.isFinite(parsed.startedAt)) {
      sessionStorage.removeItem(EMAIL_ACCOUNT_OAUTH_PENDING_KEY);
      return null;
    }

    const pending = { provider: parsed.provider, startedAt: Number(parsed.startedAt) };
    if (Date.now() - pending.startedAt > EMAIL_ACCOUNT_OAUTH_WINDOW_MS) {
      sessionStorage.removeItem(EMAIL_ACCOUNT_OAUTH_PENDING_KEY);
      return null;
    }

    return pending;
  } catch {
    sessionStorage.removeItem(EMAIL_ACCOUNT_OAUTH_PENDING_KEY);
    return null;
  }
}

function clearPendingEmailAccountOAuth() {
  sessionStorage.removeItem(EMAIL_ACCOUNT_OAUTH_PENDING_KEY);
}

function parseEmailAccountOAuthCallbackUrl(value: string): EmailAccountOAuthCallback | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed, window.location.origin);
    const normalizedPath = stripRuntimeBasePath(url.pathname);
    const match =
      normalizedPath.match(/^\/api\/email-accounts\/callback\/([^/]+)$/) ??
      url.pathname.match(/(?:^|\/)api\/email-accounts\/callback\/([^/]+)$/);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!match || !code || !state) {
      return null;
    }

    return {
      provider: decodeURIComponent(match[1]),
      code,
      state,
    };
  } catch {
    return null;
  }
}

function findEmailAccountOAuthCallbackInBrowserUrls() {
  const candidates = new Set<string>();
  candidates.add(window.location.href);

  if (document.referrer) {
    candidates.add(document.referrer);
  }

  try {
    if (window.parent && window.parent !== window) {
      candidates.add(window.parent.location.href);
    }
  } catch {
    // Cross-origin Home Assistant frames do not expose their URL to the add-on.
  }

  try {
    if (window.top && window.top !== window) {
      candidates.add(window.top.location.href);
    }
  } catch {
    // Cross-origin Home Assistant frames do not expose their URL to the add-on.
  }

  for (const candidate of candidates) {
    const callback = parseEmailAccountOAuthCallbackUrl(candidate);
    if (callback) {
      return callback;
    }
  }

  return null;
}

async function completeEmailAccountOAuthCallback(callback: EmailAccountOAuthCallback) {
  const response = await fetch(`/api/email-accounts/callback/${encodeURIComponent(callback.provider)}/complete`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: callback.code, state: callback.state }),
  });
  const data = await response.json().catch(() => ({}));
  return {
    ...data,
    status: response.ok ? data.status : "failed",
  } as { status?: string; returnUrl?: string; error?: string };
}

async function completeEmailAccountOAuthCallbackFromAppShell() {
  const pending = readPendingEmailAccountOAuth();
  const callback = parseEmailAccountOAuthCallbackUrl(window.location.href) ?? (pending ? findEmailAccountOAuthCallbackInBrowserUrls() : null);
  if (!callback) {
    return;
  }

  if (pending && callback.provider !== pending.provider) {
    return;
  }

  if (!callback.code || !callback.state) {
    clearPendingEmailAccountOAuth();
    window.location.replace(getRuntimeUrl("/settings/email-accounts?emailAccountStatus=failed"));
    return;
  }

  try {
    const data = await completeEmailAccountOAuthCallback(callback);
    clearPendingEmailAccountOAuth();
    const returnUrl = typeof data.returnUrl === "string" ? data.returnUrl : getRuntimeUrl("/settings/email-accounts?emailAccountStatus=failed");
    window.location.replace(returnUrl);
  } catch {
    clearPendingEmailAccountOAuth();
    window.location.replace(getRuntimeUrl("/settings/email-accounts?emailAccountStatus=failed"));
  }
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

function initialPageFromLocation(): Page {
  const normalizedPath = stripRuntimeBasePath(window.location.pathname);
  if (normalizedPath !== "/") {
    return pageFromPath(window.location.pathname);
  }

  if (!shouldRestoreLastPage()) {
    return "overview";
  }

  const storedPage = localStorage.getItem(LAST_PAGE_STORAGE_KEY);
  if (!storedPage || !(storedPage in pagePaths)) {
    return "overview";
  }

  const page = storedPage as Page;
  const path = getRuntimeUrl(pathForPage(page));
  if (path !== window.location.pathname) {
    window.history.replaceState({}, "", path);
  }
  return page;
}

function rememberActivePage(page: Page) {
  if (!shouldRestoreLastPage()) {
    return;
  }

  localStorage.setItem(LAST_PAGE_STORAGE_KEY, page);
}

function shouldRestoreLastPage() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia("(max-width: 767px)").matches;
}

function stripRuntimeBasePath(pathname: string) {
  const basePath = getRuntimeBasePath();
  const withoutBase = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) : pathname;
  return withoutBase.replace(/\/+$/, "") || "/";
}

function metricsTabFromPath(pathname: string): MetricsTab {
  const path = stripRuntimeBasePath(pathname);
  if (path === "/metrics/logs") {
    return "logs";
  }
  if (path === "/metrics/alarms") {
    return "alarms";
  }
  return "metrics";
}

function createEmptyAlarmDraft(): LogAlarmDraft {
  return {
    name: "",
    description: "",
    logGroup: "ai",
    thresholdCount: 1,
    periodMinutes: 60,
  };
}

function alarmToDraft(alarm: LogAlarm): LogAlarmDraft {
  return {
    name: alarm.name,
    description: alarm.description,
    logGroup: alarm.logGroup,
    thresholdCount: alarm.thresholdCount,
    periodMinutes: alarm.periodMinutes,
  };
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

function getCommitmentTone(commitment: InboxCommitment | null | undefined) {
  if (commitment?.isCompleted || commitment?.completedAt) {
    return {
      labelClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
      metaClassName: "text-emerald-800",
      panelClassName: "border-emerald-200/90 bg-emerald-50/90 text-emerald-950",
    };
  }
  const dueAt = commitment?.dueAt ? new Date(commitment.dueAt).getTime() : Number.NaN;
  const hoursUntilDue = Number.isNaN(dueAt) ? Number.POSITIVE_INFINITY : (dueAt - Date.now()) / (60 * 60 * 1000);
  if (hoursUntilDue <= 8) {
    return {
      labelClassName: "border-red-200 bg-red-50 text-red-700",
      metaClassName: "text-red-800",
      panelClassName: "border-red-200/90 bg-red-50/90 text-red-950",
    };
  }
  if (hoursUntilDue <= 24) {
    return {
      labelClassName: "border-amber-200 bg-amber-50 text-amber-700",
      metaClassName: "text-amber-800",
      panelClassName: "border-amber-200/90 bg-amber-50/90 text-amber-950",
    };
  }
  return {
    labelClassName: "border-violet-200 bg-violet-50 text-violet-700",
    metaClassName: "text-violet-800",
    panelClassName: "border-violet-200/90 bg-violet-50/90 text-violet-950",
  };
}

function formatRelativeDuration(value: string, options: { prefix?: string; suffix?: string } = {}) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const diffMs = date.getTime() - Date.now();
  const absoluteSeconds = Math.max(1, Math.round(Math.abs(diffMs) / 1000));
  const units = [
    { label: "Year", seconds: 365 * 24 * 60 * 60 },
    { label: "Month", seconds: 30 * 24 * 60 * 60 },
    { label: "Week", seconds: 7 * 24 * 60 * 60 },
    { label: "Day", seconds: 24 * 60 * 60 },
    { label: "Hour", seconds: 60 * 60 },
    { label: "Minute", seconds: 60 },
    { label: "Second", seconds: 1 },
  ];
  const unit = units.find((candidate) => absoluteSeconds >= candidate.seconds) ?? units[units.length - 1];
  const valueCount = Math.max(1, Math.floor(absoluteSeconds / unit.seconds));
  const unitText = `${unit.label}${valueCount === 1 ? "" : "s"}`;
  const phrase = `${valueCount} ${unitText}`;

  if (diffMs < 0 && options.prefix === "in") {
    return `${phrase} overdue`;
  }

  return [options.prefix, phrase, options.suffix].filter(Boolean).join(" ");
}

function formatDateTimeLocalInput(value: Date) {
  if (Number.isNaN(value.getTime())) {
    return "";
  }

  const offsetMs = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offsetMs).toISOString().slice(0, 16);
}

function getDocumentScrollTop() {
  return Math.max(
    window.scrollY || 0,
    document.documentElement.scrollTop || 0,
    document.body.scrollTop || 0,
    document.scrollingElement?.scrollTop || 0,
  );
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
  const messageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (date >= startOfToday && date < startOfTomorrow) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  const todayUtc = Date.UTC(startOfToday.getFullYear(), startOfToday.getMonth(), startOfToday.getDate());
  const messageDayUtc = Date.UTC(messageDay.getFullYear(), messageDay.getMonth(), messageDay.getDate());
  const daysAgo = Math.floor((todayUtc - messageDayUtc) / 86_400_000);
  if (daysAgo === 1) {
    return "Yesterday";
  }
  if (daysAgo >= 2 && daysAgo <= 6) {
    return `${daysAgo} days ago`;
  }
  if (daysAgo >= 7 && daysAgo < 35) {
    const weeksAgo = Math.floor(daysAgo / 7);
    return `${weeksAgo} ${weeksAgo === 1 ? "week" : "weeks"} ago`;
  }
  if (daysAgo >= 35 && daysAgo < 365) {
    const monthsAgo = Math.max(1, Math.floor(daysAgo / 30));
    return `${monthsAgo} ${monthsAgo === 1 ? "month" : "months"} ago`;
  }
  if (daysAgo >= 365) {
    const yearsAgo = Math.floor(daysAgo / 365);
    return `${yearsAgo} ${yearsAgo === 1 ? "year" : "years"} ago`;
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
  if (inboxMode === "archive") {
    params.set("labelId", labelId);
    params.set("archived", "true");
  }
  if (search) {
    params.set("search", search);
  }
  if (pageToken) {
    params.set("pageToken", pageToken);
  }
  return params;
}

function getInboxSearchSuggestionValue(message: InboxMessage) {
  return message.subject?.trim() || message.sender?.trim() || message.from?.trim() || message.accountEmail;
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
  if (!Object.values(compactState).some((value) => value !== INBOX_PAGE_DONE)) {
    return null;
  }

  return window.btoa(JSON.stringify(compactState)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function getInboxPageStateKey(accountId: string, labelId: string) {
  return labelId ? `${accountId}|${labelId}` : accountId;
}

function parseInboxPageStateKey(key: string) {
  const separatorIndex = key.indexOf("|");
  if (separatorIndex < 0) {
    return { accountId: key, labelId: "" };
  }
  return {
    accountId: key.slice(0, separatorIndex),
    labelId: key.slice(separatorIndex + 1),
  };
}

function mergeInboxMessages(current: InboxMessage[], incoming: InboxMessage[]) {
  const merged = new Map<string, InboxMessage>();

  for (const message of [...current, ...incoming]) {
    const key = getInboxMessageKey(message);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, message);
      continue;
    }

    merged.set(key, {
      ...existing,
      ...message,
      labels: [...new Set([...existing.labels, ...message.labels])],
    });
  }

  return [...merged.values()];
}

function getInboxAllLabelCount(labels: Label[], counts: Record<string, number | null>) {
  if (labels.length === 0) {
    return 0;
  }

  const values = labels.map((label) => counts[label.id]);
  return values.every((value) => typeof value === "number")
    ? values.reduce<number>((total, value) => total + Number(value), 0)
    : null;
}

function getInboxModeDescription(mode: InboxMode) {
  if (mode === "drafts") {
    return "drafts";
  }
  if (mode === "sent") {
    return "sent messages";
  }
  if (mode === "archive") {
    return "archived messages";
  }
  return "inbox messages";
}

function describeInboxSearchScope(mode: InboxMode | "search") {
  if (mode === "archive") {
    return "archived email";
  }
  if (mode === "drafts") {
    return "drafts";
  }
  if (mode === "sent") {
    return "sent email";
  }
  if (mode === "inbox") {
    return "labeled Inbox email";
  }
  return "indexed email";
}

function isLabelFilteredInboxMode(mode: InboxMode) {
  return mode === "inbox" || mode === "archive";
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

function inferSubjectFromPrompt(prompt: string) {
  const cleaned = prompt
    .replace(/\s+/g, " ")
    .replace(/\b(write|draft|compose|email|message|please|polite|short|friendly)\b/gi, "")
    .trim();
  if (!cleaned) {
    return "";
  }
  return cleaned.length > 72 ? `${cleaned.slice(0, 69).trim()}...` : cleaned;
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

  if (provider === "microsoft") {
    return "Microsoft";
  }

  if (provider === "imap") {
    return "IMAP";
  }

  return provider;
}

function EmailAccountActionSheet({
  account,
  isDeleting,
  onClose,
  onRefresh,
  onRemove,
  privacyMode,
}: {
  account: EmailAccount;
  isDeleting: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onRemove: () => void;
  privacyMode: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/20 p-3 md:hidden" onClick={onClose}>
      <div
        className="w-full overflow-hidden rounded-2xl border border-white/70 bg-white/75 p-3 shadow-2xl shadow-slate-900/20 backdrop-blur-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-300" />
        <div className="px-2 pb-3">
          <p className="truncate text-base font-semibold text-zinc-950">{formatEmailForPrivacy(account.email, privacyMode)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge className="w-fit capitalize">{providerLabel(account.provider)}</Badge>
            <EmailAccountStatusBadge account={account} />
          </div>
        </div>
        <div className="grid gap-2">
          <Button className="h-11 justify-start" onClick={onRefresh} type="button" variant="outline">
            <RefreshCw className={cn("h-4 w-4", account.status === "needs_refresh" && "text-amber-600")} />
            Refresh token
          </Button>
          {account.canRemove ? (
            <Button className="h-11 justify-start text-red-600 hover:text-red-700" disabled={isDeleting} onClick={onRemove} type="button" variant="outline">
              {isDeleting ? <Loader /> : <Trash2 className="h-4 w-4" />}
              Delete account
            </Button>
          ) : (
            <p className="rounded-md border border-zinc-200 bg-white/60 px-3 py-3 text-sm text-zinc-500">
              This account is required and cannot be removed.
            </p>
          )}
          <Button className="h-11" onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
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
