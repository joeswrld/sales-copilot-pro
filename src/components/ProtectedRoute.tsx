import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
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
