import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function ProtectedRoute({
  children,
  fallback,
}: {
  children: ReactNode;
  /** Optional richer loading UI while the auth session resolves. Defaults
   * to a plain spinner, which is fine for most routes; pages with a known
   * slow/first-run entry point (like onboarding) can pass something more
   * descriptive so the wait doesn't read as a blank stall. */
  fallback?: ReactNode;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      fallback ?? (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Mandatory email verification gate — enforced client-side as UX,
  // and re-enforced server-side in every trust-critical edge function
  // (start-trial, delete-account, billing, etc.).
  if (!user.email_confirmed_at && location.pathname !== "/verify-email") {
    return <Navigate to="/verify-email" replace />;
  }

  return <>{children}</>;
}