import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, Zap, Loader2 } from "lucide-react";

interface SubscriptionGateProps {
  children: ReactNode;
  /** Optional custom message */
  message?: string;
}

/**
 * Wraps premium content — renders children only if user has an active subscription.
 * Otherwise shows an upgrade prompt.
 */
export default function SubscriptionGate({ children, message }: SubscriptionGateProps) {
  const { isActive, isLoading, subscribe } = useSubscription();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isActive) {
    return <>{children}</>;
  }

  return (
    <div className="flex items-center justify-center py-20 px-4">
      <Card className="max-w-md w-full text-center border-primary/20">
        <CardHeader className="pb-3">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <Lock className="w-7 h-7 text-primary" />
          </div>
          <CardTitle className="text-xl">Premium Feature</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            {message || "This feature requires an active Fixsense subscription. Subscribe to unlock all premium capabilities."}
          </p>
          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              onClick={() => navigate("/billing")}
              className="w-full"
            >
              <Zap className="w-4 h-4 mr-2" />
              View Plans & Subscribe
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
