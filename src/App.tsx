import { FormEvent, useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentType, type ReactNode } from "react";
import {
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Download,
  GaugeCircle,
  FileCheck2,
  Gauge,
  Inbox,
  LogOut,
  MailCheck,
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
import { cn } from "./lib/utils";

type Page = "overview" | "labels" | "rules" | "metrics" | "settings" | "confidence-threshold" | "email-accounts" | "endpoints";
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
  fromEmail: string;
  fromName: string;
  subject: string;
  snippet: string;
  confidence: number;
  labelsApplied: string[];
  isPending: boolean;
  reason?: string | null;
  userQuestion?: string | null;
  ruleSuggestion?: string | null;
  recommendedAction?: string | null;
  createdAt: string;
  updatedAt: string;
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

type OverviewData = {
  todayLabeled: number;
  syncedLabels: number;
  pendingRules: number;
  nonPendingRules: number;
  recentRules: EmailRule[];
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
  { id: "settings" as const, label: "Settings", icon: Settings },
];

const settingsSubItems = [
  { id: "confidence-threshold" as const, label: "Confidence Threshold" },
  { id: "email-accounts" as const, label: "Email Accounts" },
  { id: "endpoints" as const, label: "Endpoints" },
];

export function App() {
  const session = authClient.useSession();
  const [activePage, setActivePage] = useState<Page>("overview");
  const [ruleToOpen, setRuleToOpen] = useState<string | null>(null);
  const user = session.data?.user ? mapAuthUser(session.data.user) : null;

  function navigate(page: Page) {
    setActivePage(page);
    if (page !== "rules") {
      setRuleToOpen(null);
    }
  }

  function openRuleReview(emailId: string) {
    setRuleToOpen(emailId);
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
      onSignOut={async () => {
        await authClient.signOut();
        await session.refetch();
        navigate("overview");
      }}
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
                className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none transition-colors focus:border-zinc-400"
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
              className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none transition-colors focus:border-zinc-400"
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
              className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none transition-colors focus:border-zinc-400"
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
  onSignOut,
  ruleToOpen,
  user,
}: {
  activePage: Page;
  onNavigate: (page: Page) => void;
  onOpenRuleReview: (emailId: string) => void;
  onSignOut: () => void;
  ruleToOpen: string | null;
  user: AuthUser;
}) {
  const title = useMemo(() => getPageTitle(activePage), [activePage]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-zinc-200 bg-white md:flex md:flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-zinc-200 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-zinc-950 text-white">
            <Inbox className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Email Labeling</p>
            <p className="text-xs text-zinc-500">{user.email}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id || (item.id === "settings" && isSettingsPage(activePage));

            return (
              <div key={item.id}>
                <button
                  className={cn(
                    "flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950",
                    isActive && "bg-zinc-950 text-white hover:bg-zinc-950 hover:text-white",
                  )}
                  onClick={() => onNavigate(item.id)}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
                {item.id === "settings" && isSettingsPage(activePage) ? (
                  <div className="mt-1 space-y-1 pl-7">
                    {settingsSubItems.map((subItem) => (
                      <button
                        className={cn(
                          "flex min-h-9 w-full items-center rounded-md px-3 text-left text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-950",
                          activePage === subItem.id && "bg-zinc-100 text-zinc-950",
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
        <div className="border-t border-zinc-200 p-3">
          <Button className="w-full justify-start" variant="ghost" onClick={onSignOut}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="md:pl-64">
        <header className="sticky top-0 z-10 flex min-h-16 flex-col gap-3 border-b border-zinc-200 bg-white/95 px-5 py-3 backdrop-blur md:h-16 md:flex-row md:items-center md:justify-between md:py-0">
          <div>
            <p className="text-xs font-medium uppercase text-zinc-500">Dashboard</p>
            <h2 className="text-xl font-semibold">{title}</h2>
          </div>
          <div className="hidden items-center gap-3 md:flex">
            {user.picture ? <img alt="" className="h-8 w-8 rounded-full" src={user.picture} /> : null}
            <div className="text-right">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-zinc-500">{user.email}</p>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto md:hidden">
            {[...navItems, ...(isSettingsPage(activePage) ? settingsSubItems : [])].map((item) => (
              <Button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                size="sm"
                variant={
                  activePage === item.id || (item.id === "settings" && isSettingsPage(activePage))
                    ? "default"
                    : "outline"
                }
              >
                {item.label}
              </Button>
            ))}
          </div>
        </header>
        <main className="p-5 lg:p-8">
          {activePage === "overview" && <OverviewPage onNavigate={onNavigate} onOpenRuleReview={onOpenRuleReview} />}
          {activePage === "labels" && <LabelsPage />}
          {activePage === "rules" && <RuleReviewPage initialEmailId={ruleToOpen} />}
          {activePage === "metrics" && <MetricsPage />}
          {activePage === "settings" && <SettingsPage onNavigate={onNavigate} />}
          {activePage === "confidence-threshold" && <ConfidenceThresholdPage />}
          {activePage === "email-accounts" && <EmailAccountsPage />}
          {activePage === "endpoints" && <EndpointsPage />}
        </main>
      </div>
    </div>
  );
}

function OverviewPage({
  onNavigate,
  onOpenRuleReview,
}: {
  onNavigate: (page: Page) => void;
  onOpenRuleReview: (emailId: string) => void;
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

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          icon={MailCheck}
          label="Number of emails labeled today"
          loading={isLoading}
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
          actionLabel="Review rules"
          icon={CheckCircle2}
          label="Non-pending vs pending rules"
          loading={isLoading}
          onAction={() => onNavigate("rules")}
          value={`${formatNumber(nonPendingRules)} / ${formatNumber(pendingRules)}`}
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
                  <p className="mt-1 truncate text-sm text-zinc-500">{rule.fromEmail}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-600">
                    {rule.recommendedAction || rule.reason || "No recommendation provided."}
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

function LabelsPage() {
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
    if (ids.length === 0) {
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
        body: JSON.stringify({ ids }),
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
    }
  }

  function toggleSelected(labelId: string) {
    setSelectedIds((current) =>
      current.includes(labelId) ? current.filter((id) => id !== labelId) : [...current, labelId],
    );
  }

  function toggleAllSelected() {
    setSelectedIds((current) => (current.length === labels.length ? [] : labels.map((label) => label.id)));
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
          className="fixed right-5 top-5 z-50 w-[min(420px,calc(100vw-2.5rem))] rounded-md border border-red-200 bg-white p-4 text-sm text-red-700 shadow-lg"
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
      <div className="grid gap-4 md:grid-cols-[220px_260px_1fr]">
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
        <Card>
          <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between md:space-y-0">
            <div>
              <CardTitle>Add Label</CardTitle>
              <CardDescription>Create labels that can be used by rules and reviews.</CardDescription>
            </div>
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
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-[minmax(0,220px)_1fr_auto]" onSubmit={handleAddLabel}>
              <div>
                <input
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none transition-colors focus:border-zinc-400"
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
                    className="h-10 min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none transition-colors focus:border-zinc-400"
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
              <Button className="self-start" disabled={isSaving} type="submit">
                {labelAction === "create" ? <Loader /> : <Plus className="h-4 w-4" />}
                {labelAction === "create" ? "Adding..." : "Add Label"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between md:space-y-0">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle>Labels</CardTitle>
              <Badge>{labels.length} total</Badge>
            </div>
            <CardDescription>Manage label names and descriptions.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={labels.length === 0 || isSaving} onClick={toggleAllSelected} type="button" variant="outline">
              {selectedIds.length === labels.length && labels.length > 0 ? "Clear selection" : "Select all"}
            </Button>
            <Button
              disabled={selectedIds.length === 0 || isSaving}
              onClick={() => void deleteLabels(selectedIds)}
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
            <div className="overflow-hidden rounded-md border border-zinc-200">
              <div className="grid grid-cols-[44px_1fr_1.5fr_160px] gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-medium uppercase text-zinc-500">
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
                      className="grid grid-cols-[44px_1fr_1.5fr_160px] items-start gap-3 px-4 py-3"
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
                              className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none transition-colors focus:border-zinc-400"
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
                                className="h-10 min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none transition-colors focus:border-zinc-400"
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
                                {failedSyncs.map((sync) => `${providerLabel(sync.provider)} ${sync.email}: ${sync.lastError}`).join("; ")}
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
                              onClick={() => void deleteLabels([label.id])}
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Metrics</CardTitle>
          <CardDescription>Track rule volume, review status, labeled emails, and draft creation.</CardDescription>
        </CardHeader>
      </Card>

      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <TimelineChartCard
          data={metrics?.rulesCreated ?? []}
          isLoading={isLoading}
          title="Rules Created"
        />
        <RuleStatusDonut
          isLoading={isLoading}
          pending={metrics?.ruleStatus.pending ?? 0}
          nonPending={metrics?.ruleStatus.nonPending ?? 0}
        />
        <TimelineChartCard
          data={metrics?.emailsLabeled ?? []}
          isLoading={isLoading}
          title="Emails Labeled"
        />
        <TimelineChartCard
          data={metrics?.draftsCreated ?? []}
          isLoading={isLoading}
          title="Drafts Created"
        />
      </div>
    </div>
  );
}

function RuleReviewPage({ initialEmailId }: { initialEmailId: string | null }) {
  const [rules, setRules] = useState<EmailRule[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.9);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pendingFilter, setPendingFilter] = useState<RulePendingFilter>("all");
  const [groupBy, setGroupBy] = useState<RuleGroupBy>("none");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedRule, setSelectedRule] = useState<EmailRule | null>(null);
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([]);
  const [draftLabels, setDraftLabels] = useState<string[]>([]);
  const [recommendedAction, setRecommendedAction] = useState("");
  const [draggingLabel, setDraggingLabel] = useState<string | null>(null);
  const [isLabelDropActive, setIsLabelDropActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasLabelChanges = selectedRule ? !sameStringSet(draftLabels, selectedRule.labelsApplied) : false;
  const groupedRules = groupRules(rules, groupBy);
  const visibleRuleIds = rules.map((rule) => rule.emailId);
  const allVisibleRulesSelected = visibleRuleIds.length > 0 && visibleRuleIds.every((emailId) => selectedRuleIds.includes(emailId));

  useEffect(() => {
    void loadRuleReviewData();
  }, [page, pageSize, pendingFilter, search]);

  useEffect(() => {
    if (initialEmailId) {
      void loadRuleDetails(initialEmailId);
    }
  }, [initialEmailId]);

  useEffect(() => {
    if (selectedRule && !rules.some((rule) => rule.emailId === selectedRule.emailId)) {
      selectRule(null);
    }
  }, [rules, selectedRule]);

  async function loadRuleReviewData() {
    setIsLoading(true);
    setError(null);

    try {
      const [rulesResponse, labelsResponse, thresholdResponse] = await Promise.all([
        fetch(
          `/api/email-rules?page=${page}&pageSize=${pageSize}&status=${pendingFilter}&search=${encodeURIComponent(search)}`,
          { credentials: "include" },
        ),
        fetch("/api/labels", { credentials: "include" }),
        fetch("/api/settings/confidence-threshold", { credentials: "include" }),
      ]);
      const rulesData = await rulesResponse.json();
      const labelsData = await labelsResponse.json();
      const thresholdData = await thresholdResponse.json();

      if (!rulesResponse.ok) {
        setError(rulesData.error ?? "Could not load email rules.");
        return;
      }

      setRules(rulesData.rules ?? []);
      setTotal(rulesData.total ?? 0);
      setLabels(labelsData.labels ?? []);
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
    setRecommendedAction(rule?.recommendedAction ?? "");
    setError(null);
  }

  function addDraftLabel(labelName: string) {
    setDraftLabels((current) => (current.includes(labelName) ? current : [...current, labelName]));
  }

  function removeDraftLabel(labelName: string) {
    setDraftLabels((current) => current.filter((label) => label !== labelName));
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

  async function saveRuleReview() {
    if (!selectedRule || !hasLabelChanges || recommendedAction.length > 200) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/email-rules/${encodeURIComponent(selectedRule.emailId)}/review`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labelsApplied: draftLabels, recommendedAction }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not save rule.");
        return;
      }

      setRules((current) => current.map((rule) => (rule.emailId === data.rule.emailId ? data.rule : rule)));
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
        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between md:space-y-0">
          <div>
            <CardTitle>Rule Review</CardTitle>
            <CardDescription>Review suggested email labeling rules and export the rule table.</CardDescription>
          </div>
          <Button disabled={isExporting} onClick={() => void exportRules()} type="button">
            <Download className="h-4 w-4" />
            {isExporting ? "Exporting..." : "Export CSV"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <form className="grid gap-3 md:grid-cols-[1fr_160px_170px_220px]" onSubmit={applyRuleSearch}>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-zinc-500">Search</span>
              <div className="flex gap-2">
                <input
                  className="h-10 min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none transition-colors focus:border-zinc-400"
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
                className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
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
                className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
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
                className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
                onChange={(event) => setGroupBy(event.target.value as RuleGroupBy)}
                value={groupBy}
              >
                <option value="none">No grouping</option>
                <option value="isPending">Pending status</option>
                <option value="fromEmail">From email</option>
              </select>
            </label>
            <div className="flex items-end justify-between gap-2">
              <Button disabled={page <= 1 || isLoading} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button" variant="outline">
                Previous
              </Button>
              <span className="pb-2 text-sm text-zinc-500">
                {page}/{totalPages}
              </span>
              <Button disabled={page >= totalPages || isLoading} onClick={() => setPage((value) => value + 1)} type="button" variant="outline">
                Next
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className={cn("grid gap-5 transition-all duration-300", selectedRule ? "xl:grid-cols-[minmax(0,1fr)_460px]" : "grid-cols-1")}>
        <Card>
          <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between md:space-y-0">
            <div>
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
                    {groupBy !== "none" ? <p className="mb-2 text-xs font-medium uppercase text-zinc-500">{group.label}</p> : null}
                    <div className="divide-y divide-zinc-200 overflow-hidden rounded-md border border-zinc-200">
                      {group.rules.map((rule) => {
                        const isRuleSelected = selectedRuleIds.includes(rule.emailId);

                        return (
                        <div
                          className={cn(
                            "grid w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 md:grid-cols-[32px_1fr_140px]",
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
                                <p className="truncate text-sm font-medium text-zinc-950">{rule.fromEmail}</p>
                              </div>
                              <p className="mt-2 line-clamp-2 text-sm leading-5 text-zinc-600">
                                {rule.recommendedAction || rule.reason || "No reason provided."}
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
                          <div className="flex items-start justify-end">
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

        {selectedRule ? (
        <Card className="transition-all duration-300 xl:sticky xl:top-5">
          <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between md:space-y-0">
            <div>
              <CardTitle>Rule Details</CardTitle>
              <CardDescription>Review labels and guidance.</CardDescription>
            </div>
            <Button aria-label="Close rule details" onClick={() => selectRule(null)} size="icon" type="button" variant="outline">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-950">{selectedRule.fromName}</p>
                      <p className="text-sm text-zinc-500">{selectedRule.fromEmail}</p>
                    </div>
                    <Badge className={selectedRule.isPending ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>
                      {selectedRule.isPending ? "Pending" : "Reviewed"}
                    </Badge>
                  </div>
                  <p className="mt-4 text-sm font-medium text-zinc-950">{selectedRule.subject}</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">{selectedRule.snippet}</p>
                </div>

                <div className="grid gap-3">
                  <div className="rounded-md bg-zinc-50 p-3">
                    <p className="text-xs font-medium uppercase text-zinc-500">Reason</p>
                    <p className="mt-1 text-sm text-zinc-700">{selectedRule.reason || "No reason provided."}</p>
                  </div>
                  <div className="rounded-md bg-zinc-50 p-3">
                    <p className="text-xs font-medium uppercase text-zinc-500">Rule suggestion</p>
                    <p className="mt-1 text-sm text-zinc-700">{selectedRule.ruleSuggestion || "No suggestion provided."}</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase text-zinc-500">Available labels</p>
                    <div
                      className={cn(
                        "max-h-72 space-y-2 overflow-auto rounded-md border border-zinc-200 p-2 transition-colors",
                        draggingLabel && "border-blue-200 bg-blue-50/40",
                      )}
                    >
                      {labels.map((label) => (
                        <button
                          className={cn(
                            "w-full cursor-grab rounded-md border border-zinc-200 bg-white px-3 py-2 text-left text-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 active:cursor-grabbing",
                            draggingLabel === label.name && "border-blue-300 bg-blue-50 opacity-70",
                          )}
                          draggable
                          key={label.id}
                          onClick={() => addDraftLabel(label.name)}
                          onDragEnd={() => {
                            setDraggingLabel(null);
                            setIsLabelDropActive(false);
                          }}
                          onDragStart={(event) => {
                            event.dataTransfer.setData("text/plain", label.name);
                            setDraggingLabel(label.name);
                          }}
                          type="button"
                        >
                          {label.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase text-zinc-500">Labels applied</p>
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
                          <div className="flex items-center justify-between gap-2 rounded-md bg-zinc-100 px-3 py-2 text-sm" key={label}>
                            <span>{label}</span>
                            <button className="cursor-pointer text-zinc-500 hover:text-zinc-950" onClick={() => removeDraftLabel(label)} type="button">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-zinc-700">Recommended action</span>
                  <textarea
                    className="min-h-24 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-zinc-400"
                    maxLength={200}
                    onChange={(event) => setRecommendedAction(event.target.value)}
                    value={recommendedAction}
                  />
                  <span className="mt-1 block text-right text-xs text-zinc-500">{recommendedAction.length}/200</span>
                </label>

                <div className="flex justify-end gap-2">
                  <Button disabled={isSaving} onClick={() => selectRule(selectedRule)} type="button" variant="outline">
                    Cancel
                  </Button>
                  <Button disabled={isSaving} onClick={() => void deleteSelectedRule()} type="button" variant="outline">
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                  <Button disabled={isSaving || !hasLabelChanges || recommendedAction.length > 200} onClick={() => void saveRuleReview()} type="button">
                    <Save className="h-4 w-4" />
                    Save
                  </Button>
                </div>
              </div>
          </CardContent>
        </Card>
        ) : null}
      </div>
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EmailAccountsPage() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [providers, setProviders] = useState<EmailProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [showProviderChoices, setShowProviderChoices] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    window.location.href = `/api/email-accounts/connect/${providerId}`;
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
              Connect Gmail, Microsoft, and Yahoo inboxes so the app can manage labels or folders, query emails, and
              read account metadata.
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
                    "rounded-md border border-zinc-200 bg-white p-4 text-left transition-colors hover:bg-zinc-50",
                    !provider.configured && "cursor-not-allowed opacity-60",
                  )}
                  disabled={!provider.configured}
                  key={provider.id}
                  onClick={() => connectProvider(provider.id)}
                  type="button"
                >
                  <p className="text-sm font-medium text-zinc-950">{provider.label}</p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {provider.configured ? "Connect account" : "OAuth credentials not configured"}
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
              <div className="grid grid-cols-[1fr_140px_140px_120px] gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-medium uppercase text-zinc-500">
                <span>Account</span>
                <span>Provider</span>
                <span>Source</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-zinc-200">
                {accounts.map((account) => (
                  <div className="grid grid-cols-[1fr_140px_140px_120px] items-center gap-3 px-4 py-3" key={account.id}>
                    <div>
                      <p className="text-sm font-medium text-zinc-950">{account.email}</p>
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
    </div>
  );
}

function EndpointsPage() {
  const [apiKeys, setApiKeys] = useState<IntegrationApiKey[]>([]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [keyName, setKeyName] = useState("n8n");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadApiKeys();
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
              className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none transition-colors focus:border-zinc-400"
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
              <code className="mt-2 block overflow-x-auto rounded-md bg-white p-3 text-xs text-zinc-900">{newToken}</code>
            </div>
          ) : null}

          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          <div className="overflow-hidden rounded-md border border-zinc-200">
            <div className="grid grid-cols-[1fr_140px_120px] gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-medium uppercase text-zinc-500">
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
            path="/api/integrations/labels"
            title="Get labels"
            response={[
              { name: "Invoice", description: "Use when confidence is at least 0.9." },
              { name: "Client Ops", description: "Operational client messages." },
            ]}
          />
          <EndpointDoc
            method="GET"
            path="/api/integrations/confidence-threshold"
            title="Get confidence threshold"
            response={{ confidenceThreshold: 0.9 }}
          />
          <EndpointDoc
            method="POST"
            path="/api/integrations/email-rules"
            title="Add an email rule"
            notes={["isPending is optional. If omitted, the API sets it to true."]}
            payload={{
              emailId: "19e394a85255976b",
              threadId: "19e394a85255976b",
              fromEmail: "someone@gmail.com",
              fromName: "Michael Montaque",
              subject: "Hello",
              snippet: "world",
              confidence: 1,
              labelsApplied: ["AI/Low Priority"],
              isPending: false,
              reason: "Looks like a test email.",
            }}
            response={{
              rule: {
                id: "7c0d8b6d-3cb5-40d0-9f0d-f6a0a9160ee5",
                emailId: "19e394a85255976b",
                labelsApplied: ["AI/Low Priority"],
                isPending: false,
              },
            }}
          />
          <EndpointDoc
            method="PUT"
            path="/api/integrations/email-rules/:emailId"
            title="Modify an email rule"
            payload={{
              confidence: 0.86,
              labelsApplied: ["Needs Review"],
              isPending: true,
              userQuestion: "Should this be escalated?",
            }}
            response={{
              rule: {
                emailId: "19e394a85255976b",
                confidence: 0.86,
                labelsApplied: ["Needs Review"],
                isPending: true,
              },
            }}
          />
          <EndpointDoc
            method="DELETE"
            path="/api/integrations/email-rules/:emailId"
            title="Delete an email rule"
            response={{ deleted: 1 }}
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
            title="Add labels to an email"
            payload={{
              accountEmail: "user@gmail.com",
              emailId: "188c1f2d7e1a1234",
              labels: ["Invoice", "Client Ops"],
            }}
            response={{
              accountEmail: "user@gmail.com",
              emailId: "188c1f2d7e1a1234",
              added: [
                { name: "Invoice", providerLabelId: "Label_123" },
                { name: "Client Ops", providerLabelId: "Label_456" },
              ],
            }}
          />
          <EndpointDoc
            method="POST"
            path="/api/integrations/email/labels/remove"
            title="Remove labels from an email"
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
        </CardContent>
      </Card>
    </div>
  );
}

function EndpointDoc({
  method,
  path,
  title,
  payload,
  response,
  notes,
}: {
  method: string;
  path: string;
  title: string;
  payload?: Record<string, unknown>;
  response: Record<string, unknown> | Array<Record<string, unknown>>;
  notes?: string[];
}) {
  return (
    <details className="rounded-md border border-zinc-200 bg-white">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-950">
        {title}
        <span className="ml-2 rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600">
          {method} {path}
        </span>
      </summary>
      <div className="space-y-3 border-t border-zinc-200 p-4">
        {notes?.length ? (
          <div className="rounded-md bg-zinc-50 p-3 text-sm text-zinc-600">
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
                className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none transition-colors focus:border-zinc-400"
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
            <div className="grid grid-cols-[120px_1fr] border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-medium uppercase text-zinc-500">
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
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription>{label}</CardDescription>
        <Icon className="h-4 w-4 text-zinc-500" />
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-2xl font-semibold">{loading ? "..." : value}</p>
        {actionLabel && onAction ? (
          <Button onClick={onAction} size="sm" type="button" variant="outline">
            {actionLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TimelineChartCard({ data, isLoading, title }: { data: TimelinePoint[]; isLoading: boolean; title: string }) {
  const maxValue = Math.max(1, ...data.map((point) => Number(point.value)));
  const points = data.map((point, index) => {
    const x = data.length <= 1 ? 50 : (index / (data.length - 1)) * 100;
    const y = 100 - (Number(point.value) / maxValue) * 82 - 8;
    return { ...point, x, y };
  });
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const total = data.reduce((sum, point) => sum + Number(point.value), 0);

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
            <svg className="h-44 w-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100" role="img">
              <title>{title}</title>
              {[20, 40, 60, 80].map((line) => (
                <line className="stroke-zinc-100" key={line} x1="0" x2="100" y1={line} y2={line} />
              ))}
              {path ? <path className="fill-none stroke-zinc-950" d={path} strokeLinecap="round" strokeWidth="2.5" vectorEffect="non-scaling-stroke" /> : null}
              {points.map((point) => (
                <circle className="fill-white stroke-zinc-950" cx={point.x} cy={point.y} key={point.date} r="2.5" vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
            <div className="flex justify-between text-xs text-zinc-500">
              <span>{formatShortDate(data[0]?.date)}</span>
              <span>{formatShortDate(data[data.length - 1]?.date)}</span>
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
  const circumference = 2 * Math.PI * 44;
  const reviewedDash = total > 0 ? (nonPending / total) * circumference : 0;

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
              <svg className="h-56 w-56 -rotate-90" viewBox="0 0 100 100" role="img">
                <title>Pending vs non-pending rules</title>
                <circle className="fill-none stroke-amber-200" cx="50" cy="50" r="44" strokeWidth="12" />
                <circle
                  className="fill-none stroke-emerald-500"
                  cx="50"
                  cy="50"
                  r="44"
                  strokeDasharray={`${reviewedDash} ${circumference - reviewedDash}`}
                  strokeLinecap="round"
                  strokeWidth="12"
                />
              </svg>
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

function isSettingsPage(page: Page) {
  return page === "settings" || page === "confidence-threshold" || page === "email-accounts" || page === "endpoints";
}

function getPageTitle(page: Page) {
  if (page === "confidence-threshold") {
    return "Confidence Threshold";
  }

  if (page === "email-accounts") {
    return "Email Accounts";
  }

  if (page === "endpoints") {
    return "Endpoints";
  }

  return navItems.find((item) => item.id === page)?.label ?? "Overview";
}

function providerLabel(provider: string) {
  if (provider === "gmail" || provider === "google") {
    return "Gmail";
  }

  if (provider === "microsoft") {
    return "Microsoft";
  }

  if (provider === "yahoo") {
    return "Yahoo";
  }

  return provider;
}
