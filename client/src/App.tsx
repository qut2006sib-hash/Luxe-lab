import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import { useAuth } from "./_core/hooks/useAuth";
import { DashboardLayoutSkeleton } from "./components/DashboardLayoutSkeleton";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { trpc } from "./lib/trpc";
import Login from "./pages/Login";
import LabCatalogPage from "./pages/LabCatalogPage";
import LabOrderPage from "./pages/LabOrderPage";
import LabPage from "./pages/LabPage";
import LabPatientsPage from "./pages/LabPatientsPage";
import SettingsPage from "./pages/SettingsPage";

function Router() {
  const { isAuthenticated, loading } = useAuth();
  const membershipQuery = trpc.organization.current.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });

  if (loading || (isAuthenticated && membershipQuery.isLoading)) {
    return <DashboardLayoutSkeleton />;
  }

  if (isAuthenticated && membershipQuery.error) {
    return (
      <main
        className="flex min-h-screen items-center justify-center p-6"
        dir="rtl"
      >
        <div className="max-w-lg space-y-3 rounded-xl border bg-background p-6 text-center">
          <h1 className="text-xl font-semibold">تعذر فتح المخبر</h1>
          <p className="text-muted-foreground">
            {membershipQuery.error.message}
          </p>
          <button
            className="rounded-lg bg-primary px-4 py-2 text-primary-foreground"
            onClick={() => membershipQuery.refetch()}
          >
            إعادة المحاولة
          </button>
        </div>
      </main>
    );
  }

  if (isAuthenticated && !membershipQuery.data) {
    return (
      <main
        className="flex min-h-screen items-center justify-center p-6"
        dir="rtl"
      >
        <div className="max-w-lg space-y-2 rounded-xl border bg-background p-6 text-center">
          <h1 className="text-xl font-semibold">الحساب غير مرتبط بمخبر</h1>
          <p className="text-muted-foreground">
            يجب أن يضيف مالك النظام هذا الحساب إلى المخبر قبل تسجيل الدخول.
          </p>
        </div>
      </main>
    );
  }

  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Login} />

      {isAuthenticated ? (
        <>
          <Route path="/" component={LabPage} />
          <Route path="/patients" component={LabPatientsPage} />
          <Route path="/catalog" component={LabCatalogPage} />
          <Route path="/orders/:id" component={LabOrderPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/404" component={NotFound} />
        </>
      ) : (
        <Route path="/" component={Login} />
      )}

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
