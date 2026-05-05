import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import AdminPanel from "./pages/AdminPanel";
import { PlanEnforcementProvider } from "@/contexts/PlanEnforcementContext";
import UpgradeModal from "@/components/plan/UpgradeModal";

// 🔒 Error Boundary + global handlers
import { ErrorBoundary, useGlobalErrorHandlers } from "@/components/ErrorBoundary";

import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import DashboardHome from "./pages/DashboardHome";
import CallsList from "./pages/CallsList";
import CallDetail from "./pages/CallDetail";
import LiveCall from "./pages/LiveCall";
import LiveMeeting from "./pages/LiveMeeting";
import Analytics from "./pages/Analytics";
import TeamPage from "./pages/TeamPage";
import SettingsPage from "./pages/SettingsPage";
import AIChatPage from "./pages/AIChatPage";
import BillingPage from "./pages/BillingPage";
import PricingPage from "./pages/PricingPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ProfilePage from "./pages/ProfilePage";
import MessagesPage from "./pages/MessagesPage";
import NotFound from "./pages/NotFound";
import TestimonialsPage from "./pages/TestimonialsPage";
import OnboardingPage from "./pages/OnboardingPage";
import GoogleCalendarCallback from "./pages/GoogleCalendarCallback";
import { DebugInspector } from "./pages/debugInspector";
import MeetingJoin from "@/pages/MeetingJoin";
import ClipSharePage from "@/pages/ClipSharePage";
import PWABanner from "@/components/PWABanner";
import DealsPage from "@/pages/DealsPage";
import IntegrationsDashboardPage from "./pages/IntegrationsPage";
import Changelogpage from "./pages/Changelogpage";
import InviteLanding from "./pages/InviteLanding";
import DealDetailPage from "./pages/DealDetailPage";
import SecurityCompliancePage from "./pages/SecurityCompliancePage";

import {
  PrivacyPage,
  TermsPage,
  SecurityPage,
  ContactPage,
} from "./pages/LegalPages";

import {
  IntegrationsPage,
  AboutPage,
  BlogPage,
  CareersPage,
  PressPage,
} from "./pages/MarketingPages";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        // Don't retry on 401/403/404
        if ([401, 403, 404].includes(error?.status)) return false;
        return failureCount < 2;
      },
    },
  },
});

// Inner component so we can use hooks inside providers
function AppWithGlobalHandlers({ children }: { children: React.ReactNode }) {
  useGlobalErrorHandlers();
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <PlanEnforcementProvider>
        <UpgradeModal />
        <DebugInspector />
        <PWABanner />

        <Routes>
          {/* Public */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/testimonials" element={<TestimonialsPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/invite/:token" element={<InviteLanding />} />

          {/* Marketing */}
          <Route path="/changelog" element={<Changelogpage />} />

          {/* Legal */}
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/security" element={<SecurityPage />} />
          <Route path="/contact" element={<ContactPage />} />

          {/* OAuth */}
          <Route
            path="/auth/google/callback"
            element={<GoogleCalendarCallback />}
          />

          {/* Admin */}
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <ErrorBoundary>
                  <AdminPanel />
                </ErrorBoundary>
              </AdminRoute>
            }
          />

          {/* Protected — each wrapped in its own ErrorBoundary */}
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <OnboardingPage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <DashboardHome />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />

          <Route
            path="/calls"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <CallsList />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />

          <Route
            path="/calls/:id"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <CallDetail />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />

          <Route
            path="/live"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <LiveCall />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />

          <Route
            path="/live/:id"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <LiveMeeting />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />

          <Route
            path="/deals"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <DealsPage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/deals/:id"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <DealDetailPage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />

          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <Analytics />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />

          <Route
            path="/team"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <TeamPage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />

          <Route
            path="/messages"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <MessagesPage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />

          {/* 🔒 SettingsPage now protected */}
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <SettingsPage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />

          {/* 🔒 IntegrationsDashboardPage now protected */}
          <Route
            path="/dashboard/integrations"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <IntegrationsDashboardPage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />

          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <ProfilePage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />

          <Route
            path="/billing"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <BillingPage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />

          <Route
            path="/coach"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <AIChatPage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />

          <Route
            path="/security-compliance"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <SecurityCompliancePage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />

          {/* Public dynamic */}
          <Route path="/clip/:shareToken" element={<ClipSharePage />} />
          <Route path="/meet/:roomName" element={<MeetingJoin />} />

          {/* Fallback */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </PlanEnforcementProvider>
    </BrowserRouter>
  );
}

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          {/* Global error boundary wraps everything */}
          <ErrorBoundary>
            <AppWithGlobalHandlers>
              <AppRoutes />
            </AppWithGlobalHandlers>
          </ErrorBoundary>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;