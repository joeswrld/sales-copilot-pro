import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useIsAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (authLoading) return;
    if (!user) { setIsAdmin(false); setLoading(false); return; }

    (async () => {
      // Use the is_admin() RPC which checks both admin_users and user_roles tables
      const { data, error } = await (supabase as any).rpc("is_admin");
      if (active) {
        setIsAdmin(!error && data === true);
        setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [user, authLoading]);

  return { isAdmin, loading: loading || authLoading };
}