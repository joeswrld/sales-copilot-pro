import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import FunnelTracker from "@/components/FunnelTracker";
import AnalyticsTracker from "@/components/AnalyticsTracker";

import { PlanEnforcementProvider } from "@/contexts/PlanEnforcementContext";
import UpgradeModal from "@/components/plan/UpgradeModal";

// 🔒 Error Boundary + global handlers
import { ErrorBoundary, useGlobalErrorHandlers } from "@/components/ErrorBoundary";

// ── Eagerly loaded: these are the pages a first-time / logged-out visitor
// actually lands on. Keeping them in the main bundle means zero extra
// network round-trip or loading flash for the pages that matter most for
// bounce rate. Everything else below is lazy-loaded per-route so an
// anonymous visitor never downloads the dashboard, admin panel, billing,
// live-meeting, etc. just to see the landing or login page.
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";

// ── Lazy-loaded: app pages behind auth, admin-only tooling, and secondary
// marketing/legal pages. Each becomes its own chunk, fetched only when the
// user actually navigates there.
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const AdminAnalyticsPage = lazy(() => import("./pages/AdminAnalyticsPage"));
const AdminActivityPage = lazy(() => import("./pages/AdminActivityPage"));
const AdminSecurityPage = lazy(() => import("./pages/AdminSecurityPage"));
const AdminProductAnalyticsPage = lazy(() => import("./pages/AdminProductAnalyticsPage"));
const AdminSessionReplayPage = lazy(() => import("./pages/AdminSessionReplayPage"));

const DebugInspectorLazy = lazy(() =>
  import("./pages/debugInspector").then((m) => ({ default: m.DebugInspector }))
);

const DashboardHome = lazy(() => import("./pages/DashboardHome"));
const CallsList = lazy(() => import("./pages/CallsList"));
const CallDetail = lazy(() => import("./pages/CallDetail"));
const LiveCall = lazy(() => import("./pages/LiveCall"));
const LiveMeeting = lazy(() => import("./pages/LiveMeeting"));
const Analytics = lazy(() => import("./pages/Analytics"));
const TeamPage = lazy(() => import("./pages/TeamPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const AIChatPage = lazy(() => import("./pages/AIChatPage"));
const BillingPage = lazy(() => import("./pages/BillingPage"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const VerifyEmailPage = lazy(() => import("./pages/VerifyEmailPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const MessagesPage = lazy(() => import("./pages/MessagesPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const TestimonialsPage = lazy(() => import("./pages/TestimonialsPage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const GoogleCalendarCallback = lazy(() => import("./pages/GoogleCalendarCallback"));

const GuestJoin = lazy(() => import("@/pages/GuestJoin"));
// MeetingEntry sits in front of every Fixsense Meeting link and resolves
// Host vs Guest from the authenticated user + DB ownership before handing
// off to LiveMeeting (host) or GuestJoin (guest) — see MeetingEntry.tsx.
const MeetingEntry = lazy(() => import("@/pages/MeetingEntry"));
const ClipSharePage = lazy(() => import("@/pages/ClipSharePage"));
const DealsPage = lazy(() => import("@/pages/DealsPage"));
const CrmPage = lazy(() => import("@/pages/CrmPage"));
const InterviewsPage = lazy(() => import("@/pages/InterviewsPage"));
const Changelogpage = lazy(() => import("./pages/Changelogpage"));
const InviteLanding = lazy(() => import("./pages/InviteLanding"));
const DealDetailPage = lazy(() => import("./pages/DealDetailPage"));
const CandidatesPage = lazy(() => import("@/pages/CandidatesPage"));
const CandidateDetailPage = lazy(() => import("@/pages/CandidateDetailPage"));
const PipelinePage = lazy(() => import("@/pages/PipelinePage"));
const SubmissionsPage = lazy(() => import("@/pages/SubmissionsPage"));
const JobsPage = lazy(() => import("@/pages/JobsPage"));
const JobDetailPage = lazy(() => import("@/pages/JobDetailPage"));
const PlacementsPage = lazy(() => import("@/pages/PlacementsPage"));
const PublicJobApplicationPage = lazy(() => import("@/pages/PublicJobApplicationPage"));
const ClientPortalPage = lazy(() => import("@/pages/ClientPortalPage"));
const SecurityCompliancePage = lazy(() => import("./pages/SecurityCompliancePage"));

const PrivacyPage = lazy(() => import("./pages/LegalPages").then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import("./pages/LegalPages").then((m) => ({ default: m.TermsPage })));
const SecurityPage = lazy(() => import("./pages/LegalPages").then((m) => ({ default: m.SecurityPage })));
const ContactPage = lazy(() => import("./pages/LegalPages").then((m) => ({ default: m.ContactPage })));

const IntegrationsPage = lazy(() => import("./pages/MarketingPages").then((m) => ({ default: m.IntegrationsPage })));
const AboutPage = lazy(() => import("./pages/MarketingPages").then((m) => ({ default: m.AboutPage })));
const BlogPage = lazy(() => import("./pages/MarketingPages").then((m) => ({ default: m.BlogPage })));
const CareersPage = lazy(() => import("./pages/MarketingPages").then((m) => ({ default: m.CareersPage })));
const PressPage = lazy(() => import("./pages/MarketingPages").then((m) => ({ default: m.PressPage })));

// PWABanner / CookieConsent are mounted globally on every route, including
// the landing page, so they stay lazy too — deferred just past first paint
// instead of blocking it.
const PWABanner = lazy(() => import("@/components/PWABanner"));
const CookieConsent = lazy(() => import("@/components/CookieConsent"));

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

// Minimal, near-instant fallback for lazy routes. Deliberately plain (no
// spinner import, no extra chunk) so it never itself becomes a loading
// bottleneck.
function RouteFallback() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#FAFAF8",
      }}
      aria-busy="true"
      aria-label="Loading"
    />
  );
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <PlanEnforcementProvider>
        <UpgradeModal />
        <Suspense fallback={null}>
          <DebugInspectorLazy />
        </Suspense>
        <FunnelTracker />
        <AnalyticsTracker />

        <Suspense fallback={null}>
          <PWABanner />
          <CookieConsent />
        </Suspense>

        <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Public */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/testimonials" element={<TestimonialsPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
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
          <Route
            path="/admin/security"
            element={
              <AdminRoute>
                <ErrorBoundary>
                  <AdminSecurityPage />
                </ErrorBoundary>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/analytics"
            element={
              <AdminRoute>
                <ErrorBoundary>
                  <AdminAnalyticsPage />
                </ErrorBoundary>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/product"
            element={
              <AdminRoute>
                <ErrorBoundary>
                  <AdminProductAnalyticsPage />
                </ErrorBoundary>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/product/session/:sessionId"
            element={
              <AdminRoute>
                <ErrorBoundary>
                  <AdminSessionReplayPage />
                </ErrorBoundary>
              </AdminRoute>
            }
          />

          <Route
            path="/admin/activity"
            element={
              <AdminRoute>
                <ErrorBoundary>
                  <AdminActivityPage />
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

          {/* Legacy sales Deals UI — kept live until CRM is confirmed fully
              functional in production. Do not remove/redirect early. */}
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

          {/* Recruitment CRM — client-centric view over recruiting_clients */}
          <Route
            path="/crm"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <CrmPage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />

          {/* Team-wide interview agenda — per-candidate scheduling stays on
              CandidateDetailPage; this is the cross-candidate overview. */}
          <Route
            path="/interviews"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <InterviewsPage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />

          <Route
            path="/candidates"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <CandidatesPage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/candidates/:id"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <CandidateDetailPage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/pipeline"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <PipelinePage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/submissions"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <SubmissionsPage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/jobs"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <JobsPage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/jobs/:id"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <JobDetailPage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/placements"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <PlacementsPage />
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
          <Route path="/apply/:slug" element={<PublicJobApplicationPage />} />
          <Route path="/portal/:slug" element={<ClientPortalPage />} />

          {/* Canonical Fixsense meeting URL (NO auth required to load this
              route — MeetingEntry itself decides Host vs Guest).
              Format: https://fixsense.com.ng/meeting/{roomId}
              MeetingEntry resolves the logged-in user against DB meeting
              ownership: the meeting's creator is sent to the Host page
              (/live/:id, LiveMeeting.tsx); everyone else — signed out,
              or signed in but not the owner — gets GuestJoin, exactly as
              before. See MeetingEntry.tsx for the ownership check. */}
          <Route path="/meeting/:roomName" element={<MeetingEntry />} />
          {/* Legacy aliases — keep so previously shared links keep working */}
          <Route path="/join/:roomName" element={<MeetingEntry />} />
          <Route path="/meet/:roomName" element={<MeetingEntry />} />

          {/* Fallback */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
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