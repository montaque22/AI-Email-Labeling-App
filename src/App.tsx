import { useMemo, useState } from "react";
import { GoogleLogin, GoogleOAuthProvider, type CredentialResponse } from "@react-oauth/google";
import { jwtDecode } from "jwt-decode";
import {
  BarChart3,
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

type GoogleJwtPayload = {
  email?: string;
  name?: string;
  picture?: string;
};

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const navItems = [
  { id: "overview" as const, label: "Overview", icon: Gauge },
  { id: "rules" as const, label: "Rule Review", icon: FileCheck2 },
  { id: "settings" as const, label: "Setup & Settings", icon: Settings },
];

export function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activePage, setActivePage] = useState<Page>("overview");

  const content = user ? (
    <AuthenticatedLayout
      activePage={activePage}
      onNavigate={setActivePage}
      onSignOut={() => {
        setUser(null);
        setActivePage("overview");
      }}
      user={user}
    />
  ) : (
    <HomePage onSignIn={setUser} />
  );

  if (!googleClientId) {
    return content;
  }

  return <GoogleOAuthProvider clientId={googleClientId}>{content}</GoogleOAuthProvider>;
}

function HomePage({ onSignIn }: { onSignIn: (user: AuthUser) => void }) {
  const signInDemoUser = () =>
    onSignIn({
      email: "you@example.com",
      name: "Demo User",
    });

  const handleGoogleSuccess = (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      signInDemoUser();
      return;
    }

    const payload = jwtDecode<GoogleJwtPayload>(credentialResponse.credential);
    onSignIn({
      email: payload.email ?? "you@example.com",
      name: payload.name ?? "Gmail User",
      picture: payload.picture,
    });
  };

  return (
    <main className="min-h-screen bg-stone-50 text-zinc-950">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-zinc-950 text-white">
            <MailCheck className="h-5 w-5" />
          </div>
          <span className="text-sm font-semibold">AI Email Labeling Assistant</span>
        </div>
        <Button variant="ghost" onClick={signInDemoUser}>
          Login
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
            <Button size="lg" onClick={signInDemoUser}>
              Continue with Gmail
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={signInDemoUser}>
              Sign up
            </Button>
          </div>
          {googleClientId ? (
            <div className="mt-4">
              <GoogleLogin onSuccess={handleGoogleSuccess} onError={signInDemoUser} useOneTap />
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">
              Add a Google OAuth client ID to enable live Gmail SSO.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
            <div>
              <p className="text-sm font-medium">Inbox labeling preview</p>
              <p className="text-xs text-zinc-500">Connected as you@example.com</p>
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
  icon: React.ComponentType<{ className?: string }>;
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
