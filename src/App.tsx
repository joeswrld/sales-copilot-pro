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

const queryClient = new QueryClient();

// BrowserRouter must be the outermost wrapper so that
// PlanEnforcementProvider and UpgradeModal can use useNavigate.
function AppRoutes() {
  return (
    <BrowserRouter>
      <PlanEnforcementProvider>
        {/* Global upgrade modal — rendered once at root level */}
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
          <Route path="/integrations" element={<IntegrationsPage />} />
          <Route path="/changelog" element={<Changelogpage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/careers" element={<CareersPage />} />
          <Route path="/press" element={<PressPage />} />

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

          {/* Protected */}
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <OnboardingPage />
              </ProtectedRoute>
            }
          />
        

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardHome />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/calls"
            element={
              <ProtectedRoute>
                <CallsList />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/calls/:id"
            element={
              <ProtectedRoute>
                <CallDetail />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/live"
            element={
              <ProtectedRoute>
                <LiveCall />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/live/:id"
            element={
              <ProtectedRoute>
                <LiveMeeting />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/deals"
            element={
              <ProtectedRoute>
                <DealsPage />
              </ProtectedRoute>
            }
          />
          <Route path="/dashboard/deals/:id" element={<ProtectedRoute><DealDetailPage /></ProtectedRoute>} />

          <Route
            path="/dashboard/analytics"
            element={
              <ProtectedRoute>
                <Analytics />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/team"
            element={
              <ProtectedRoute>
                <TeamPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/messages"
            element={
              <ProtectedRoute>
                <MessagesPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/integrations"
            element={
              <ProtectedRoute>
                <IntegrationsDashboardPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/billing"
            element={
              <ProtectedRoute>
                <BillingPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/coach"
            element={
              <ProtectedRoute>
                <AIChatPage />
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
          <AppRoutes />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;