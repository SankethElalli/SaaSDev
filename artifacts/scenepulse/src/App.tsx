import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/auth";
import { ThemeProvider } from "@/contexts/theme";
import { AppLayout } from "@/components/layout/AppLayout";
import NotFound from "@/pages/not-found";

// Pages
import MapShell from "@/pages/MapShell";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Dashboard from "@/pages/Dashboard";
import Onboarding from "@/pages/Onboarding";
import AuthCallback from "@/pages/AuthCallback";
import ArtistDetail from "@/pages/ArtistDetail";
import Discover from "@/pages/Discover";
import Venues from "@/pages/Venues";
import VenueDetail from "@/pages/VenueDetail";
import EventDetail from "@/pages/EventDetail";
import Settings from "@/pages/Settings";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) setLocation("/login");
  }, [isLoading, user, setLocation]);

  if (isLoading) return <div className="flex-1 flex items-center justify-center">Loading...</div>;
  if (!user) return null;

  return <Component {...rest} />;
}

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={MapShell} />
        <Route path="/welcome" component={Landing} />
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />
        <Route path="/auth/callback" component={AuthCallback} />

        <Route path="/onboarding"><ProtectedRoute component={Onboarding} /></Route>
        <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
        <Route path="/map" component={MapShell} />
        <Route path="/settings"><ProtectedRoute component={Settings} /></Route>
        
        <Route path="/discover" component={Discover} />
        <Route path="/artists/:id" component={ArtistDetail} />

        <Route path="/venues" component={Venues} />
        <Route path="/venues/:id" component={VenueDetail} />

        <Route path="/events/:id" component={EventDetail} />
        
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
