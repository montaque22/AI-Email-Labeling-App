import { useEffect, useMemo, useState, type ComponentType } from "react";
import { authentication, createDirectus, readMe, rest } from "@directus/sdk";
import {
  CheckCircle2,
  ChevronRight,
  FileCheck2,
  Gauge,
  Inbox,
  LogOut,
  MailCheck,
  Settings,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { cn } from "./lib/utils";

type Page = "overview" | "rules" | "settings";

type AuthUser = {
  email: string;
  name: string;
  picture?: string;
};

type DirectusUser = {
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar?: string | null;
};

const DIRECTUS_URL = "https://directus-p8kk8ck8wogws40kg08w4wcs.212.38.95.147.sslip.io";
const PRODUCTION_APP_URL = "https://n0o0o4okgc0o0s0gkw4g8kcw.212.38.95.147.sslip.io";
const STORAGE_USER_KEY = "email-labeling-user";

const directusClient = createDirectus(DIRECTUS_URL)
  .with(authentication("cookie", { credentials: "include" }))
  .with(rest({ credentials: "include" }));

const loginUrl = `${DIRECTUS_URL}/auth/login/google?redirect=${encodeURIComponent(`${getAppUrl()}/auth/callback`)}`;

function getAppUrl() {
  if (typeof window === "undefined") {
    return PRODUCTION_APP_URL;
  }

  const { hostname, origin } = window.location;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

  return isLocalhost ? origin : PRODUCTION_APP_URL;
}

const navItems = [
  { id: "overview" as const, label: "Overview", icon: Gauge },
  { id: "rules" as const, label: "Rule Review", icon: FileCheck2 },
  { id: "settings" as const, label: "Setup & Settings", icon: Settings },
];

export function App() {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());
  const [activePage, setActivePage] = useState<Page>("overview");

  useEffect(() => {
    if (window.location.pathname === "/auth/callback") {
      return;
    }

    void hydrateUserFromDirectus(setUser);
  }, []);

  if (window.location.pathname === "/auth/callback") {
    return <AuthCallback onAuthenticated={setUser} />;
  }

  return user ? (
    <AuthenticatedLayout
      activePage={activePage}
      onNavigate={setActivePage}
      onSignOut={async () => {
        await signOut();
        setUser(null);
        setActivePage("overview");
      }}
      user={user}
    />
  ) : (
    <HomePage />
  );
}

function HomePage() {
  return (
    <main className="min-h-screen bg-stone-50 text-zinc-950">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-zinc-950 text-white">
            <MailCheck className="h-5 w-5" />
          </div>
          <span className="text-sm font-semibold">AI Email Labeling Assistant</span>
        </div>
        <Button asChild variant="ghost">
          <a href={loginUrl}>Login</a>
        </Button>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl grid-cols-1 items-center gap-10 px-5 py-12 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="max-w-2xl">
          <Badge className="mb-5 bg-white">Gmail SSO</Badge>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">
            Label Gmail faster with rules you can review.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-zinc-600">
            Connect your Gmail account, review suggested labeling rules, and keep your inbox organized with an
            assistant built for transparent decisions.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <a href={loginUrl}>
                Login with Google
                <ChevronRight className="h-4 w-4" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href={loginUrl}>
                Sign up
                <ChevronRight className="h-4 w-4" />
              </a>
            </Button>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Google sign-in is handled securely through Directus.
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
            <div>
              <p className="text-sm font-medium">Inbox labeling preview</p>
              <p className="text-xs text-zinc-500">Connected through your Gmail account</p>
            </div>
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="mt-4 space-y-3">
            {[
              ["Vendor invoices", "Finance", "98% confidence"],
              ["Customer escalations", "Urgent", "91% confidence"],
              ["Product newsletters", "Read later", "87% confidence"],
            ].map(([subject, label, confidence]) => (
              <div className="flex items-center justify-between rounded-md border border-zinc-100 p-3" key={subject}>
                <div>
                  <p className="text-sm font-medium">{subject}</p>
                  <p className="text-xs text-zinc-500">{confidence}</p>
                </div>
                <Badge>{label}</Badge>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function AuthCallback({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [status, setStatus] = useState<"loading" | "error">("loading");

  useEffect(() => {
    async function finishLogin() {
      try {
        await directusClient.refresh();
        const me = await directusClient.request(readMe());
        const user = mapDirectusUser(me as DirectusUser);

        storeUser(user);
        onAuthenticated(user);

        window.history.replaceState({}, "", "/");
        window.location.href = "/";
      } catch (err) {
        console.error("Auth failed:", err);
        setStatus("error");
      }
    }

    void finishLogin();
  }, [onAuthenticated]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-5 text-zinc-950">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-zinc-950 text-white">
            {status === "loading" ? <Sparkles className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </div>
          <CardTitle>{status === "loading" ? "Finishing login" : "Login failed"}</CardTitle>
          <CardDescription>
            {status === "loading"
              ? "We are confirming your Directus session and preparing your dashboard."
              : "We could not confirm your session. Please try signing in again."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === "loading" ? (
            <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-zinc-950" />
            </div>
          ) : (
            <Button asChild className="w-full">
              <a href={loginUrl}>
                Try again
                <ChevronRight className="h-4 w-4" />
              </a>
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function AuthenticatedLayout({
  activePage,
  onNavigate,
  onSignOut,
  user,
}: {
  activePage: Page;
  onNavigate: (page: Page) => void;
  onSignOut: () => void;
  user: AuthUser;
}) {
  const title = useMemo(() => navItems.find((item) => item.id === activePage)?.label ?? "Overview", [activePage]);

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
            const isActive = activePage === item.id;

            return (
              <button
                className={cn(
                  "flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950",
                  isActive && "bg-zinc-950 text-white hover:bg-zinc-950 hover:text-white",
                )}
                key={item.id}
                onClick={() => onNavigate(item.id)}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
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
            {navItems.map((item) => (
              <Button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                size="sm"
                variant={activePage === item.id ? "default" : "outline"}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </header>
        <main className="p-5 lg:p-8">
          {activePage === "overview" && <OverviewPage />}
          {activePage === "rules" && <RuleReviewPage />}
          {activePage === "settings" && <SettingsPage />}
        </main>
      </div>
    </div>
  );
}

function OverviewPage() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={MailCheck} label="Emails analyzed" value="1,284" />
        <MetricCard icon={Sparkles} label="Suggested labels" value="42" />
        <MetricCard icon={CheckCircle2} label="Rules approved" value="18" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Latest Gmail labeling recommendations and approvals.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {["Finance rule approved", "Urgent customer email detected", "Newsletter pattern found"].map((item) => (
            <div className="flex items-center justify-between rounded-md border border-zinc-100 p-3" key={item}>
              <span className="text-sm font-medium">{item}</span>
              <Badge>Today</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function RuleReviewPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rule Review</CardTitle>
        <CardDescription>Placeholder for reviewing suggested Gmail labeling rules.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
          Rule review workflow will go here.
        </div>
      </CardContent>
    </Card>
  );
}

function SettingsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Setup & Settings</CardTitle>
        <CardDescription>Placeholder for Gmail connection, account, and labeling preferences.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
          Setup and settings controls will go here.
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription>{label}</CardDescription>
        <Icon className="h-4 w-4 text-zinc-500" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function mapDirectusUser(user: DirectusUser): AuthUser {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();

  return {
    email: user.email ?? "Gmail user",
    name: name || user.email || "Gmail user",
    picture: user.avatar ? `${DIRECTUS_URL}/assets/${user.avatar}` : undefined,
  };
}

async function hydrateUserFromDirectus(setUser: (user: AuthUser | null) => void) {
  try {
    const me = await directusClient.request(readMe());
    const user = mapDirectusUser(me as DirectusUser);
    storeUser(user);
    setUser(user);
  } catch {
    clearStoredUser();
    setUser(null);
  }
}

async function signOut() {
  try {
    await directusClient.logout();
  } catch {
    // Local state still needs to clear even if the remote session is already gone.
  } finally {
    clearStoredUser();
  }
}

function readStoredUser(): AuthUser | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_USER_KEY);
    return stored ? (JSON.parse(stored) as AuthUser) : null;
  } catch {
    return null;
  }
}

function storeUser(user: AuthUser) {
  window.localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
}

function clearStoredUser() {
  window.localStorage.removeItem(STORAGE_USER_KEY);
}
