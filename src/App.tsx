import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
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
import { PrivacyPage, TermsPage, SecurityPage, ContactPage } from "./pages/LegalPages";


const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/privacy" element={<PrivacyPage />} />
<Route path="/terms" element={<TermsPage />} />
<Route path="/security" element={<SecurityPage />} />
<Route path="/contact" element={<ContactPage />} />
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/dashboard" element={<ProtectedRoute><DashboardHome /></ProtectedRoute>} />
            <Route path="/dashboard/calls" element={<ProtectedRoute><CallsList /></ProtectedRoute>} />
            <Route path="/dashboard/calls/:id" element={<ProtectedRoute><CallDetail /></ProtectedRoute>} />
            <Route path="/dashboard/live" element={<ProtectedRoute><LiveCall /></ProtectedRoute>} />
            <Route path="/dashboard/live/:id" element={<ProtectedRoute><LiveMeeting /></ProtectedRoute>} />
            <Route path="/dashboard/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
            <Route path="/dashboard/team" element={<ProtectedRoute><TeamPage /></ProtectedRoute>} />
            <Route path="/dashboard/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
            <Route path="/dashboard/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="/dashboard/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/dashboard/billing" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
            <Route path="/dashboard/coach" element={<ProtectedRoute><AIChatPage /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
