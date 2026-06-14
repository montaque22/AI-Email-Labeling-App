import { FormEvent, useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentType, type ReactNode } from "react";
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
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  Download,
  GaugeCircle,
  FileCheck2,
  Gauge,
  GripVertical,
  Inbox,
  LogOut,
  MailCheck,
  Menu,
  Pencil,
  Plus,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { authClient } from "./lib/auth-client";
import { getAbsoluteRuntimeUrl, getRuntimeUrl } from "./lib/runtime-base";
import { cn } from "./lib/utils";

type Page =
  | "overview"
  | "labels"
  | "rules"
  | "metrics"
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
  mcpClient: AiMcpClientConfig;
};

type AiMcpTool = {
  name: string;
  description: string;
  inputSchema?: unknown;
};

type AiMcpClientConfig = {
  serverUrl: string;
  enabled: boolean;
  status: "connected" | "untested" | "failed";
  lastError?: string;
  tools: AiMcpTool[];
  selectedTools: string[];
  hasBearerToken?: boolean;
};

const LABEL_NAME_MAX_LENGTH = 25;
const LABEL_DESCRIPTION_MAX_LENGTH = 200;
const LABEL_NAME_PATTERN = /^[A-Za-z0-9 _-]+$/;
const CONFIDENCE_THRESHOLD_TEMPLATE = "{confidenceThreshold}";

const navItems = [
  { id: "overview" as const, label: "Overview", icon: Gauge },
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
  const [activePage, setActivePage] = useState<Page>("overview");
  const [ruleToOpen, setRuleToOpen] = useState<string | null>(null);
  const [ruleInitialFilter, setRuleInitialFilter] = useState<RulePendingFilter | null>(null);
  const user = session.data?.user ? mapAuthUser(session.data.user) : null;

  function navigate(page: Page) {
    setActivePage(page);
    setRuleInitialFilter(null);
    if (page !== "rules") {
      setRuleToOpen(null);
    }
  }

  function openRuleReview(emailId: string) {
    setRuleToOpen(emailId);
    setRuleInitialFilter(null);
    setActivePage("rules");
  }

  function openPendingRuleReview() {
    setRuleToOpen(null);
    setRuleInitialFilter("pending");
    setActivePage("rules");
  }

  if (session.isPending) {
    return <LoadingScreen />;
  }

  return user ? (
    <AuthenticatedLayout
      activePage={activePage}
      onNavigate={navigate}
      onOpenRuleReview={openRuleReview}
      onOpenPendingRuleReview={openPendingRuleReview}
      onSignOut={async () => {
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

    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
      errorCallbackURL: "/",
      newUserCallbackURL: "/",
    });
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

        <Button className="w-full" disabled={!authConfig.googleOAuthEnabled} onClick={handleGoogleLogin} type="button">
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

  useEffect(() => {
    localStorage.setItem("emailable-privacy-mode", String(privacyMode));
  }, [privacyMode]);

  useEffect(() => {
    localStorage.setItem("emailable-sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  return (
    <div className="min-h-screen bg-transparent text-zinc-950">
      <aside className={cn("fixed inset-y-0 left-0 hidden border-r border-white/60 bg-white/55 shadow-sm backdrop-blur-2xl transition-all md:flex md:flex-col", sidebarCollapsed ? "w-20" : "w-64")}>
        <div className={cn("flex h-16 items-center border-b border-zinc-200 px-4", sidebarCollapsed ? "justify-center" : "justify-between gap-3")}>
          <div className={cn("flex min-w-0 items-center gap-3", sidebarCollapsed && "justify-center")}>
            <EmailableLogo className="h-9 w-9 shrink-0" />
            {!sidebarCollapsed ? (
              <div className="min-w-0">
                <p className="truncate bg-gradient-to-r from-cyan-500 via-blue-600 to-violet-600 bg-clip-text text-xl font-bold text-transparent">
                  Emailable
                </p>
              </div>
            ) : null}
          </div>
          {!sidebarCollapsed ? (
            <Button aria-label="Collapse menu" onClick={() => setSidebarCollapsed(true)} size="icon" type="button" variant="ghost">
              <Menu className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        {sidebarCollapsed ? (
          <div className="border-b border-zinc-200 p-3">
            <Button aria-label="Expand menu" className="w-full" onClick={() => setSidebarCollapsed(false)} size="icon" type="button" variant="ghost">
              <Menu className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
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
          <Button className={cn("w-full", sidebarCollapsed ? "justify-center px-0" : "justify-start")} variant="ghost" onClick={onSignOut} title={sidebarCollapsed ? "Sign out" : undefined}>
            <LogOut className="h-4 w-4" />
            {!sidebarCollapsed ? "Sign out" : null}
          </Button>
        </div>
      </aside>

      <div className={cn("min-w-0 transition-all", sidebarCollapsed ? "md:pl-20" : "md:pl-64")}>
        <header className="sticky top-0 z-10 flex min-h-16 flex-col gap-3 border-b border-white/60 bg-white/55 px-5 py-3 shadow-sm backdrop-blur-xl md:h-16 md:flex-row md:items-center md:justify-between md:py-0">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-zinc-500">Dashboard</p>
            <h2 className="truncate text-xl font-semibold">{title}</h2>
          </div>
          <div className="hidden min-w-0 items-center gap-3 md:flex">
            <UserAvatar className="h-8 w-8" user={user} />
            <div className="min-w-0 text-right">
              <p className="truncate text-sm font-medium">{formatEmailTextForPrivacy(user.name, privacyMode)}</p>
              <p className="truncate text-xs text-zinc-500">{formatEmailForPrivacy(user.email, privacyMode)}</p>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto md:hidden">
            {[
              ...navItems,
              ...(isAiPromptsPage(activePage) ? aiPromptSubItems : []),
              ...(isSettingsPage(activePage) ? settingsSubItems : []),
            ].map((item) => (
              <Button
                className={cn(
                  activePage === item.id ||
                    (item.id === "settings" && isSettingsPage(activePage)) ||
                    (item.id === "ai-prompts" && isAiPromptsPage(activePage))
                    ? "border-white/70 bg-white/70 text-zinc-950 shadow-sm hover:bg-white/80"
                    : undefined,
                )}
                key={item.id}
                onClick={() => onNavigate(item.id)}
                size="sm"
                variant="outline"
              >
                {item.label}
              </Button>
            ))}
          </div>
        </header>
        <main className="min-h-[calc(100vh-4rem)] min-w-0 overflow-x-hidden p-4 sm:p-5 lg:p-8">
          {activePage === "overview" && (
            <OverviewPage
              onNavigate={onNavigate}
              onOpenPendingRuleReview={onOpenPendingRuleReview}
              onOpenRuleReview={onOpenRuleReview}
              privacyMode={privacyMode}
            />
          )}
          {activePage === "labels" && <LabelsPage privacyMode={privacyMode} />}
          {activePage === "rules" && <RuleReviewPage initialEmailId={ruleToOpen} initialPendingFilter={ruleInitialFilter} privacyMode={privacyMode} />}
          {activePage === "metrics" && <MetricsPage />}
          {activePage === "ai-prompts" && <AiPromptsPage onNavigate={onNavigate} />}
          {activePage === "ai-byoai" && <ByoAiPage />}
          {activePage === "ai-prompt-library" && <AiPromptLibraryPage privacyMode={privacyMode} />}
          {activePage === "settings" && <SettingsPage onNavigate={onNavigate} />}
          {activePage === "confidence-threshold" && <ConfidenceThresholdPage />}
          {activePage === "email-accounts" && <EmailAccountsPage privacyMode={privacyMode} />}
          {activePage === "endpoints" && <EndpointsPage />}
          {activePage === "webhook" && <WebhookPage />}
          {activePage === "mcp-server" && <McpServerPage />}
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

function LabelsPage({ privacyMode }: { privacyMode: boolean }) {
  const [labels, setLabels] = useState<Label[]>([]);
  const [connectedAccountCount, setConnectedAccountCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [activeDescriptionInput, setActiveDescriptionInput] = useState<"new" | "edit" | null>(null);
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
  const newDescriptionRef = useRef<HTMLInputElement | null>(null);
  const editDescriptionRef = useRef<HTMLInputElement | null>(null);
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

  function insertConfidenceThresholdTemplate(kind: "new" | "edit") {
    const input = kind === "new" ? newDescriptionRef.current : editDescriptionRef.current;

    if (!input || document.activeElement !== input) {
      return;
    }

    const value = kind === "new" ? newDescription : editDescription;
    const selectionStart = input.selectionStart ?? value.length;
    const selectionEnd = input.selectionEnd ?? selectionStart;
    const nextValue =
      value.slice(0, selectionStart) + CONFIDENCE_THRESHOLD_TEMPLATE + value.slice(selectionEnd);

    if (nextValue.length > LABEL_DESCRIPTION_MAX_LENGTH) {
      setError(`Label description must be ${LABEL_DESCRIPTION_MAX_LENGTH} characters or less.`);
      return;
    }

    if (kind === "new") {
      setNewDescription(nextValue);
    } else {
      setEditDescription(nextValue);
    }

    window.requestAnimationFrame(() => {
      input.focus();
      const nextCursor = selectionStart + CONFIDENCE_THRESHOLD_TEMPLATE.length;
      input.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function isTemplateButtonEnabled(kind: "new" | "edit") {
    return activeDescriptionInput === kind;
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
          <div className="w-[min(460px,100%)] glass-panel rounded-md border p-5 shadow-xl">
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
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[220px_260px_minmax(0,1fr)]">
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
        <Card className="min-w-0 lg:col-span-2 xl:col-span-1">
          <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between md:space-y-0">
            <div className="min-w-0">
              <CardTitle>Add Label</CardTitle>
              <CardDescription>Create labels that can be used by rules and reviews.</CardDescription>
            </div>
            <div className="shrink-0">
              <input
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => void handleCsvUpload(event)}
                ref={csvUploadRef}
                type="file"
              />
              <Button className="w-full sm:w-auto" disabled={isSaving} onClick={() => csvUploadRef.current?.click()} type="button" variant="outline">
                {labelAction === "upload" ? <Loader /> : <Upload className="h-4 w-4" />}
                {labelAction === "upload" ? "Uploading..." : "Upload CSV"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 2xl:grid-cols-[minmax(0,220px)_1fr_auto]" onSubmit={handleAddLabel}>
              <div>
                <input
                  className="h-10 w-full glass-panel rounded-md border px-3 text-sm outline-none transition-colors focus:border-zinc-400"
                  maxLength={LABEL_NAME_MAX_LENGTH}
                  onChange={(event) => setNewName(event.target.value)}
                  pattern="[A-Za-z0-9 _-]+"
                  placeholder="Name"
                  required
                  title="Letters, numbers, spaces, hyphens, and underscores only"
                  value={newName}
                />
                <div className="mt-1 flex justify-end text-xs text-zinc-500">
                  <span>
                    {newName.length}/{LABEL_NAME_MAX_LENGTH}
                  </span>
                </div>
              </div>
              <div>
                <div className="flex gap-2">
                  <input
                    className="h-10 min-w-0 flex-1 glass-panel rounded-md border px-3 text-sm outline-none transition-colors focus:border-zinc-400"
                    maxLength={LABEL_DESCRIPTION_MAX_LENGTH}
                    onBlur={() => window.setTimeout(() => setActiveDescriptionInput(null), 0)}
                    onChange={(event) => setNewDescription(event.target.value)}
                    onFocus={() => setActiveDescriptionInput("new")}
                    placeholder="Description"
                    ref={newDescriptionRef}
                    value={newDescription}
                  />
                  <Button
                    aria-label="Insert confidence threshold template"
                    disabled={!isTemplateButtonEnabled("new")}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insertConfidenceThresholdTemplate("new")}
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    <Tooltip text="Insert {confidenceThreshold}. Saved labels keep the template, and read-only views show your current threshold value.">
                      <GaugeCircle className="h-4 w-4" />
                    </Tooltip>
                  </Button>
                </div>
                <div className="mt-1 flex justify-end text-xs text-zinc-500">
                  <span>
                    {newDescription.length}/{LABEL_DESCRIPTION_MAX_LENGTH}
                  </span>
                </div>
              </div>
              <Button className="self-start 2xl:w-auto" disabled={isSaving} type="submit">
                {labelAction === "create" ? <Loader /> : <Plus className="h-4 w-4" />}
                {labelAction === "create" ? "Adding..." : "Add Label"}
              </Button>
            </form>
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
                            <div className="flex gap-2">
                              <input
	                                className="h-10 min-w-0 flex-1 glass-panel rounded-md border px-3 text-sm outline-none transition-colors focus:border-zinc-400"
	                                maxLength={LABEL_DESCRIPTION_MAX_LENGTH}
	                                onBlur={() => window.setTimeout(() => setActiveDescriptionInput(null), 0)}
                                onChange={(event) => setEditDescription(event.target.value)}
                                onFocus={() => setActiveDescriptionInput("edit")}
                                ref={editDescriptionRef}
                                value={editDescription}
                              />
                              <Button
	                                aria-label="Insert confidence threshold template"
	                                disabled={!isTemplateButtonEnabled("edit")}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => insertConfidenceThresholdTemplate("edit")}
                                size="icon"
                                type="button"
                                variant="outline"
                              >
                                <Tooltip text="Insert {confidenceThreshold}. Saved labels keep the template, and read-only views show your current threshold value.">
                                  <GaugeCircle className="h-4 w-4" />
                                </Tooltip>
                              </Button>
                            </div>
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
  const [activeTab, setActiveTab] = useState<"metrics" | "logs">("metrics");
  const [logCategory, setLogCategory] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logsError, setLogsError] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div>
            <CardTitle>{activeTab === "metrics" ? "Metrics" : "Logs"}</CardTitle>
            <CardDescription>
              {activeTab === "metrics"
                ? "Track rule volume, review status, labeled emails, and draft creation."
                : "Review simplified system activity across AI, endpoints, webhooks, and MCP server usage."}
            </CardDescription>
          </div>
          {activeTab === "logs" ? (
            <select
              className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none transition-colors focus:border-zinc-400"
              onChange={(event) => setLogCategory(event.target.value)}
              value={logCategory}
            >
              <option value="all">All</option>
              <option value="ai">AI</option>
              <option value="endpoints">Endpoints</option>
              <option value="webhook">Webhook Events</option>
              <option value="mcp-server">MCP Server</option>
            </select>
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="inline-flex rounded-md border border-zinc-200 bg-white p-1">
            <button
              className={cn("rounded px-3 py-1.5 text-sm font-medium", activeTab === "metrics" ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-50")}
              onClick={() => setActiveTab("metrics")}
              type="button"
            >
              Metrics
            </button>
            <button
              className={cn("rounded px-3 py-1.5 text-sm font-medium", activeTab === "logs" ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-50")}
              onClick={() => setActiveTab("logs")}
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
  const [draggingLabel, setDraggingLabel] = useState<string | null>(null);
  const [isLabelDropActive, setIsLabelDropActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
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
    setSelectedRule(rule);
    setDraftLabels(rule?.labelsApplied ?? []);
    setDraftLabelReasons(rule?.labelReasons ?? {});
    setError(null);
  }

  function addDraftLabel(labelName: string) {
    setDraftLabels([labelName]);
    setDraftLabelReasons((current) => ({ ...current, [labelName]: current[labelName] ?? "" }));
  }

  function removeDraftLabel(labelName: string) {
    setDraftLabels((current) => current.filter((label) => label !== labelName));
    setDraftLabelReasons((current) => {
      const next = { ...current };
      delete next[labelName];
      return next;
    });
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
        setAddRuleStep(null);
      }
      selectRule(data.rule);
    } catch {
      setError("Could not save rule.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteSelectedRule() {
    if (!selectedRule) {
      return;
    }

    setIsSaving(true);
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
          <Card className="min-h-[720px] max-h-[92vh] w-full max-w-5xl min-w-0 overflow-hidden">
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
              <div className="min-w-0">
                <CardTitle>Add Rule</CardTitle>
                <CardDescription>Search connected email accounts and choose an email to review.</CardDescription>
              </div>
              <Button aria-label="Close add rule" onClick={closeAddRuleModal} size="icon" type="button" variant="outline">
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="max-h-[calc(92vh-96px)] overflow-y-auto overflow-x-hidden">
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
          </Card>
        </div>
        ) : null}

        {selectedRule ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
        <Card className="max-h-[92vh] w-full max-w-5xl min-w-0 overflow-hidden">
          <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <div className="min-w-0">
              <CardTitle>Rule Details</CardTitle>
              <CardDescription>Choose the single best label for this email.</CardDescription>
            </div>
            <Button aria-label="Close rule details" onClick={() => (addRuleStep === "review" ? closeAddRuleModal() : selectRule(null))} size="icon" type="button" variant="outline">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="max-h-[calc(92vh-96px)] overflow-y-auto overflow-x-hidden">
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
                    <Badge className={selectedRule.isPending ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>
                      {selectedRule.isPending ? "Pending" : "Reviewed"}
                    </Badge>
                  </div>
                  <p className="mt-4 text-sm font-medium text-zinc-950">{selectedRule.subject}</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">{selectedRule.snippet}</p>
                </div>

                <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                  <div className="min-w-0">
                    <p className="mb-2 text-xs font-medium uppercase text-zinc-500">Available labels</p>
                    <div
                      className={cn(
                        "max-h-72 space-y-2 overflow-auto rounded-md border border-zinc-200 p-2 transition-colors",
                        draggingLabel && "border-blue-200 bg-blue-50/40",
                      )}
                    >
                      {availableLabels.map((label) => (
                        <button
                          className={cn(
                            "w-full glass-panel rounded-md border px-3 py-2 text-left text-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50",
                            draftLabels.includes(label.name)
                              ? "cursor-not-allowed border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-200 hover:bg-emerald-50"
                              : "cursor-grab active:cursor-grabbing",
                            draggingLabel === label.name && "border-blue-300 bg-blue-50 opacity-70",
                          )}
                          disabled={draftLabels.includes(label.name)}
                          draggable={!draftLabels.includes(label.name)}
                          key={label.id}
                          onClick={() => addDraftLabel(label.name)}
                          onDragEnd={() => {
                            setDraggingLabel(null);
                            setIsLabelDropActive(false);
                          }}
                          onDragStart={(event) => {
                            if (draftLabels.includes(label.name)) {
                              event.preventDefault();
                              return;
                            }

                            event.dataTransfer.setData("text/plain", label.name);
                            setDraggingLabel(label.name);
                          }}
                          type="button"
                        >
                          <span className="block font-medium text-zinc-950">{label.name}</span>
                          <span className="mt-1 block text-xs leading-5 text-zinc-500">
                            {renderLabelDescription(label.description, confidenceThreshold.toFixed(2))}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-medium uppercase text-zinc-500">Selected label</p>
                      <span className="text-xs text-zinc-500">{draftLabels.length === 1 ? "Ready" : "Choose one"}</span>
                    </div>
                    <div
                      className={cn(
                        "min-h-72 space-y-2 rounded-md border border-dashed border-zinc-300 p-2 transition-colors",
                        draggingLabel && "border-blue-300 bg-blue-50/40",
                        isLabelDropActive && "border-emerald-400 bg-emerald-50",
                      )}
                      onDragEnter={() => setIsLabelDropActive(true)}
                      onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                          setIsLabelDropActive(false);
                        }
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setIsLabelDropActive(true);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        addDraftLabel(event.dataTransfer.getData("text/plain"));
                        setDraggingLabel(null);
                        setIsLabelDropActive(false);
                      }}
                    >
                      {draftLabels.length === 0 ? (
                        <p className="p-3 text-sm text-zinc-500">Drop labels here.</p>
                      ) : (
                        draftLabels.map((label) => (
                          <div className="min-w-0 rounded-md bg-zinc-100 p-3 text-sm" key={label}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="min-w-0 truncate font-medium text-zinc-950">{label}</span>
                              <button className="cursor-pointer text-zinc-500 hover:text-zinc-950" onClick={() => removeDraftLabel(label)} type="button">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <label className="mt-2 block">
                              <span className="mb-1 block text-xs font-medium uppercase text-zinc-500">When to use this label</span>
                              <textarea
                                className="min-h-20 w-full glass-panel rounded-md border px-3 py-2 text-sm outline-none transition-colors focus:border-zinc-400"
                                maxLength={200}
                                onChange={(event) => updateDraftLabelReason(label, event.target.value)}
                                placeholder="Explain when the AI should choose this label."
                                value={draftLabelReasons[label] ?? ""}
                              />
                              <span className="mt-1 block text-right text-xs text-zinc-500">
                                {(draftLabelReasons[label] ?? "").length}/200
                              </span>
                            </label>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  {addRuleStep === "review" ? (
                    <Button disabled={isSaving} onClick={goBackToAddRuleSearch} type="button" variant="outline">
                      Previous
                    </Button>
                  ) : null}
                  <Button disabled={isSaving} onClick={() => (addRuleStep === "review" ? closeAddRuleModal() : selectRule(selectedRule))} type="button" variant="outline">
                    Cancel
                  </Button>
                  {addRuleStep === "review" ? null : (
                  <Button disabled={isSaving} onClick={() => void deleteSelectedRule()} type="button" variant="outline">
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                  )}
                  <Tooltip text={selectedReviewReason ? "Mark this rule reviewed and apply the selected label." : "A reason helps the AI make better future choices, but you can still review this rule."}>
                    <span>
                      <Button className={cn(canReviewRule && reviewedButtonClass)} disabled={isSaving || !canReviewRule} onClick={() => void saveRuleReview()} type="button">
                        <Save className="h-4 w-4" />
                        Reviewed
                      </Button>
                    </span>
                  </Tooltip>
                </div>
              </div>
          </CardContent>
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
  return (
    <div className="space-y-6">
      <AiPromptEditorPage promptKey="email-label" />
      <AiPromptEditorPage promptKey="draft-reply" privacyMode={privacyMode} />
    </div>
  );
}

function ByoAiPage() {
  const [providers, setProviders] = useState<Record<string, AiProviderDefinition>>({});
  const [platforms, setPlatforms] = useState<AiPlatformDraft[]>([]);
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
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isTogglingAi, setIsTogglingAi] = useState(false);
  const [isSavingMcp, setIsSavingMcp] = useState(false);
  const [isTogglingMcp, setIsTogglingMcp] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [pageError, setPageError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "warning"; message: string } | null>(null);
  const hasConnectedPlatform = platforms.some((platform) => platform.status === "connected");
  const mcpSectionDisabled = !hasConnectedPlatform;
  const canEnableMcp = aiEnabled && hasConnectedPlatform && mcpClient.status === "connected";

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
    setPlatforms((current) => [...current, draft]);
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
    } catch {
      setErrors((current) => ({ ...current, [platform.id]: "Could not test this AI platform." }));
    } finally {
      setSavingId(null);
    }
  }

  async function deletePlatform(platform: AiPlatformDraft) {
    if (platform.isDraft) {
      setPlatforms((current) => current.filter((entry) => entry.id !== platform.id));
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

  async function saveMcpClient() {
    setIsSavingMcp(true);
    setPageError(null);

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
        setPageError(data.error ?? "Could not connect to the MCP server.");
        return;
      }

      setMcpClient(data.mcpClient);
      setMcpForm((current) => ({ ...current, bearerToken: "" }));
      setToast({ tone: "success", message: "MCP server tools loaded." });
    } catch {
      setPageError("Could not connect to the MCP server.");
    } finally {
      setIsSavingMcp(false);
    }
  }

  async function updateMcpClientSettings(next: Partial<Pick<AiMcpClientConfig, "enabled" | "selectedTools">>) {
    setIsTogglingMcp(true);
    setPageError(null);

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
        setPageError(data.error ?? "Could not update MCP client settings.");
        return;
      }

      setMcpClient(data.mcpClient);
    } catch {
      setPageError("Could not update MCP client settings.");
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
      <Card className={cn(aiEnabled && "animate-pulse border-emerald-300 shadow-[0_0_28px_rgba(16,185,129,0.28)] ring-1 ring-emerald-200")}>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Bring your own artificial intelligence (BYOAI)</CardTitle>
            <CardDescription>
              Add your own API keys to let Emailable handle the AI logic for choosing labels and drafting replies.
            </CardDescription>
          </div>
          <AiEnableSwitch
            canEnable={canEnableAi}
            disabled={isLoading || isTogglingAi}
            enabled={aiEnabled}
            onChange={(value) => void toggleAiEnabled(value)}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          {pageError ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{pageError}</p> : null}

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-zinc-600">{platforms.length}/3 platforms configured</p>
            <Button disabled={isLoading || platforms.length >= 3} onClick={addPlatform} type="button">
              <Plus className="h-4 w-4" />
              Add AI Platform
            </Button>
          </div>

          {isLoading ? (
            <p className="rounded-md border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500">
              Loading AI platforms...
            </p>
          ) : platforms.length === 0 ? (
            <p className="rounded-md border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500">
              No AI platforms yet.
            </p>
          ) : (
            <div className="space-y-4">
              {platforms.map((platform, index) => {
                const definition = providers[platform.provider];
                const isOllama = platform.provider === "ollama";
                return (
                  <Card key={platform.id}>
                    <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle className="text-base">{platform.providerLabel}</CardTitle>
                          <Badge className={index === 0 ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"}>
                            {index === 0 ? "Default" : "Fallback"}
                          </Badge>
                          {platform.status === "connected" ? (
                            <Badge className="bg-emerald-50 text-emerald-700">Connected</Badge>
                          ) : (
                            <Badge className="bg-zinc-100 text-zinc-600">Not saved</Badge>
                          )}
                        </div>
                        <CardDescription>
                          Save tests the connection before this platform can be used by AI endpoints.
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-1">
                        <GripVertical className="h-4 w-4 text-zinc-400" />
                        <Button disabled={index === 0 || Boolean(savingId)} onClick={() => void movePlatform(index, -1)} size="icon" type="button" variant="outline">
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button disabled={index === platforms.length - 1 || Boolean(savingId)} onClick={() => void movePlatform(index, 1)} size="icon" type="button" variant="outline">
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {errors[platform.id] ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errors[platform.id]}</p> : null}
                      {messages[platform.id] ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{messages[platform.id]}</p> : null}

                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="block">
                          <span className="mb-1 block text-sm font-medium text-zinc-700">Platform</span>
                          <select
                            className="h-10 w-full glass-panel rounded-md border px-3 text-sm outline-none transition-colors focus:border-zinc-400"
                            disabled={savingId === platform.id}
                            onChange={(event) => updatePlatform(platform.id, { provider: event.target.value })}
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
                          <InputField
                            label="Model"
                            onChange={(value) => updatePlatform(platform.id, { model: value })}
                            placeholder="llama3.1"
                            value={platform.model}
                          />
                        ) : (
                          <label className="block">
                            <span className="mb-1 block text-sm font-medium text-zinc-700">Model</span>
                            <select
                              className="h-10 w-full glass-panel rounded-md border px-3 text-sm outline-none transition-colors focus:border-zinc-400"
                              disabled={savingId === platform.id}
                              onChange={(event) => updatePlatform(platform.id, { model: event.target.value })}
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
                          <InputField
                            label="Ollama URL"
                            onChange={(value) => updatePlatform(platform.id, { baseUrl: value })}
                            placeholder="http://localhost:11434"
                            value={platform.baseUrl}
                          />
                          <InputField
                            label="Optional bearer token"
                            onChange={(value) => updatePlatform(platform.id, { bearerToken: value })}
                            placeholder={platform.hasBearerToken ? "Saved token. Re-enter to change." : "Bearer token"}
                            type="password"
                            value={platform.bearerToken}
                          />
                        </div>
                      ) : (
                        <InputField
                          label="API Key"
                          onChange={(value) => updatePlatform(platform.id, { apiKey: value })}
                          placeholder={platform.hasApiKey ? "Saved key. Re-enter to test or change." : "Paste API key"}
                          type="password"
                          value={platform.apiKey}
                        />
                      )}

                      <div className="flex flex-wrap justify-end gap-2">
                        <Button disabled={savingId === platform.id} onClick={() => void deletePlatform(platform)} type="button" variant="outline">
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                        <Button disabled={savingId === platform.id} onClick={() => void savePlatform(platform)} type="button">
                          {savingId === platform.id ? <Loader /> : <Save className="h-4 w-4" />}
                          Save
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
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
          <Tooltip text={canEnableMcp ? "Enable MCP tool references for AI endpoints." : "Save a connected AI platform, enable AI, and save valid MCP server details first."}>
            <span>
              <AiEnableSwitch
                canEnable={canEnableMcp}
                disabled={!canEnableMcp || isTogglingMcp || isSavingMcp}
                enabled={mcpClient.enabled}
                label="Enable"
                onChange={(enabled) => void updateMcpClientSettings({ enabled })}
              />
            </span>
          </Tooltip>
        </CardHeader>
        <CardContent className="space-y-4">
          {mcpSectionDisabled ? (
            <p className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
              Add and save at least one working AI platform before configuring MCP client tools.
            </p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <InputField
              disabled={mcpSectionDisabled || isSavingMcp}
              label="MCP server URL"
              onChange={(value) => setMcpForm((current) => ({ ...current, serverUrl: value }))}
              placeholder="https://example.com/mcp"
              type="url"
              value={mcpForm.serverUrl}
            />
            <InputField
              disabled={mcpSectionDisabled || isSavingMcp}
              label="Optional bearer token"
              onChange={(value) => setMcpForm((current) => ({ ...current, bearerToken: value }))}
              placeholder={mcpClient.hasBearerToken ? "Saved token. Re-enter to change." : "Bearer token"}
              type="password"
              value={mcpForm.bearerToken}
            />
          </div>
          <div className="flex justify-end">
            <Button disabled={mcpSectionDisabled || isSavingMcp || !mcpForm.serverUrl.trim()} onClick={() => void saveMcpClient()} type="button">
              {isSavingMcp ? <Loader /> : <Save className="h-4 w-4" />}
              Save MCP Server
            </Button>
          </div>
          {mcpClient.status === "connected" ? (
            <div className="space-y-3 rounded-md border border-zinc-200 p-4">
              <div>
                <p className="text-sm font-medium text-zinc-950">Available tools</p>
                <p className="text-sm text-zinc-500">Select the MCP tools Emailable should reference when calling AI endpoints.</p>
              </div>
              {mcpClient.tools.length === 0 ? (
                <p className="text-sm text-zinc-500">No tools were returned by this MCP server.</p>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {mcpClient.tools.map((tool) => (
                    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-200 p-3 text-sm hover:bg-zinc-50" key={tool.name}>
                      <input
                        checked={mcpClient.selectedTools.includes(tool.name)}
                        disabled={!mcpClient.enabled || isTogglingMcp}
                        onChange={() => toggleMcpTool(tool.name)}
                        type="checkbox"
                      />
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
        </CardContent>
      </Card>
    </div>
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
  const [isEmailExamplesOpen, setIsEmailExamplesOpen] = useState(true);
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
		                  <CardTitle className="text-base">Email examples</CardTitle>
		                  <CardDescription>
		                    Find sent emails from connected Gmail accounts and insert them as markdown tables with To, Subject, and
		                    BodyText fields.
		                  </CardDescription>
                    </div>
                    <Button
                      className="shrink-0"
                      onClick={() => setIsEmailExamplesOpen((current) => !current)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {isEmailExamplesOpen ? "Collapse" : "Expand"}
                    </Button>
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
  const [isConnectingImap, setIsConnectingImap] = useState(false);
  const [showProviderChoices, setShowProviderChoices] = useState(false);
  const [showImapModal, setShowImapModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imapError, setImapError] = useState<string | null>(null);

  useEffect(() => {
    void loadEmailAccounts();
  }, []);

  async function loadEmailAccounts() {
    setIsLoading(true);
    setError(null);

    try {
      const [accountsResponse, providersResponse] = await Promise.all([
        fetch("/api/email-accounts", { credentials: "include" }),
        fetch("/api/email-accounts/providers", { credentials: "include" }),
      ]);
      const accountsData = await accountsResponse.json();
      const providersData = await providersResponse.json();

      if (!accountsResponse.ok) {
        setError(accountsData.error ?? "Could not load email accounts.");
        return;
      }

      setAccounts(accountsData.accounts ?? []);
      setProviders(providersData.providers ?? []);
    } catch {
      setError("Could not load email accounts.");
    } finally {
      setIsLoading(false);
    }
  }

  function connectProvider(providerId: string) {
    if (providerId === "imap") {
      setError(null);
      setImapError(null);
      setShowImapModal(true);
      return;
    }

    window.location.href = getRuntimeUrl(`/api/email-accounts/connect/${providerId}`);
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
            <div className="overflow-hidden rounded-md border border-zinc-200">
              <div className="grid grid-cols-[1fr_140px_140px_120px] gap-3 border-b border-zinc-200 glass-panel px-4 py-3 text-xs font-medium uppercase text-zinc-500">
                <span>Account</span>
                <span>Provider</span>
                <span>Source</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-zinc-200">
                {accounts.map((account) => (
                  <div className="grid grid-cols-[1fr_140px_140px_120px] items-center gap-3 px-4 py-3" key={account.id}>
                    <div>
                      <p className="text-sm font-medium text-zinc-950">{formatEmailForPrivacy(account.email, privacyMode)}</p>
                      <p className="text-sm text-zinc-500">{account.displayName || "No display name"}</p>
                    </div>
                    <Badge className="w-fit capitalize">{providerLabel(account.provider)}</Badge>
                    <span className="text-sm text-zinc-600">
                      {account.source === "sso" ? "Signed-in account" : "Connected account"}
                    </span>
                    <div className="flex justify-end">
                      {account.canRemove ? (
                        <Button
                          disabled={isDeleting === account.id}
                          onClick={() => void removeAccount(account.id)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Remove
                        </Button>
                      ) : (
                        <span className="text-right text-xs text-zinc-500">Required</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {showImapModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto glass-surface rounded-md shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-200 p-5">
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
            <div className="space-y-5 p-5">
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
}: {
  canEnable: boolean;
  disabled?: boolean;
  enabled: boolean;
  label?: string;
  onChange: (enabled: boolean) => void;
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
      <Tooltip text="Add and save a working AI platform before enabling AI.">
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
                  "Requires Enable AI to be on.",
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
                  "Requires Enable AI to be on.",
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

function McpServerPage() {
  const [apiKeys, setApiKeys] = useState<IntegrationApiKey[]>([]);
  const [keyName, setKeyName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
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
            <Button disabled={isSaving} onClick={() => void createMcpKey()} type="button">
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
          <EndpointDoc
            method="TOOL"
            path="create_draft_reply"
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
  return (
    <details className="glass-panel rounded-md border">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-950">
        {title}
        {statusBadge ? <span className="ml-2">{statusBadge}</span> : null}
        <span className="ml-2 rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600">
          {method} {path}
        </span>
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

  return <Tooltip text="Enable this by turning on Enable AI after saving a working AI platform.">{badge}</Tooltip>;
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

function Tooltip({ children, text }: { children: ReactNode; text: string }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-64 -translate-x-1/2 rounded-md bg-zinc-950 px-3 py-2 text-left text-xs font-normal leading-5 text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
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

function mapAuthUser(user: { email?: string | null; name?: string | null; image?: string | null }): AuthUser {
  return {
    email: user.email ?? "Signed-in user",
    name: user.name || user.email || "Signed-in user",
    picture: user.image,
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

  function flushParagraph() {
    if (paragraph.length > 0) {
      html.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  }

  function flushList() {
    if (listItems.length > 0) {
      html.push(`<ul>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`);
      listItems = [];
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

    if (isMarkdownTableAt(lines, index)) {
      flushParagraph();
      flushList();
      const table = readMarkdownTable(lines, index);
      html.push(renderMarkdownTable(table.rows));
      index = table.nextIndex - 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
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
      listItems.push(listItem[1]);
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
    .replace(/_([^_]+)_/g, "<em>$1</em>");
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

function getPageTitle(page: Page) {
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

function logCategoryLabel(category: string) {
  if (category === "ai") {
    return "AI";
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
