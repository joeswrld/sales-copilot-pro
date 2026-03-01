import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import DashboardHome from "./pages/DashboardHome";
import CallsList from "./pages/CallsList";
import CallDetail from "./pages/CallDetail";
import LiveCall from "./pages/LiveCall";
import Analytics from "./pages/Analytics";
import TeamPage from "./pages/TeamPage";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/dashboard" element={<DashboardHome />} />
          <Route path="/dashboard/calls" element={<CallsList />} />
          <Route path="/dashboard/calls/:id" element={<CallDetail />} />
          <Route path="/dashboard/live" element={<LiveCall />} />
          <Route path="/dashboard/analytics" element={<Analytics />} />
          <Route path="/dashboard/team" element={<TeamPage />} />
          <Route path="/dashboard/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
