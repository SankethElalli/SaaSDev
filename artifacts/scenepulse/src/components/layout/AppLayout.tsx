import { Link, useLocation } from "wouter";
import { ArrowLeft, LayoutDashboard, Settings as SettingsIcon, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { NotificationsMenu } from "@/components/NotificationsMenu";

const FULLSCREEN_ROUTES = ["/", "/map"];

function BackToMap() {
  return (
    <Link
      href="/"
      className="fixed left-4 top-4 z-50 flex items-center gap-2 rounded-full glass border border-white/10 px-4 py-2 text-sm font-semibold shadow-lg transition-colors hover:text-primary"
    >
      <ArrowLeft className="h-4 w-4" />
      <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
        ScenePulse
      </span>
    </Link>
  );
}

function AccountNav() {
  const { user, isLoading, signOut } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) return null;

  const pill =
    "flex items-center gap-1.5 rounded-full glass border border-white/10 px-3.5 py-2 text-sm font-semibold shadow-lg transition-colors hover:text-primary";

  return (
    <div className="fixed right-4 top-4 z-50 flex items-center gap-2">
      {user ? (
        <>
          <NotificationsMenu />
          <Link href="/dashboard" className={pill}>
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
          <Link href="/settings" className={pill}>
            <SettingsIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </Link>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              setLocation("/");
            }}
            className={pill}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </>
      ) : (
        <>
          <Link href="/login" className={pill}>
            Sign in
          </Link>
          <Link
            href="/signup"
            className="flex items-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition-opacity hover:opacity-90"
          >
            Sign up
          </Link>
        </>
      )}
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const fullscreen = FULLSCREEN_ROUTES.includes(location);

  if (fullscreen) {
    return (
      <div className="h-[100dvh] w-full bg-background">
        {children}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-background">
      <div
        className="pointer-events-none fixed inset-0 z-[-1] opacity-30 dark:opacity-20"
        style={{
          background:
            "radial-gradient(circle at 50% -20%, var(--primary) 0%, transparent 50%), radial-gradient(circle at -20% 80%, var(--secondary) 0%, transparent 40%)",
          filter: "blur(100px)",
        }}
      />
      <BackToMap />
      <AccountNav />
      <main className="flex flex-1 flex-col pt-16">{children}</main>
    </div>
  );
}
