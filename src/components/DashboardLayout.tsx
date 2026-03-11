import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Phone, Radio, Settings, CreditCard, Menu, X, Bot,
  Users, Bell, LogOut, ChevronRight, MessageSquare,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/useNotifications";
import { useTeam } from "@/hooks/useTeam";
import { useTeamMessaging } from "@/hooks/useTeamMessaging";
import { MeetingUsageCard } from "@/components/MeetingUsageCard";
import { useMeetingUsage } from "@/hooks/useMeetingUsage";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  icon: React.ElementType;
  href: string;
  badge?: number | string | null;
  subLabel?: ReactNode;
}

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const location = useLocation();
  const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + "/");

  return (
    <Link
      to={item.href}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium group",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
      )}
    >
      <item.icon className={cn("shrink-0 w-4 h-4", isActive ? "text-primary" : "")} />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge != null && (
            <span
              className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
              )}
            >
              {item.badge}
            </span>
          )}
        </>
      )}
    </Link>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { unreadCount } = useNotifications();
  const { team } = useTeam();
  const { totalUnread } = useTeamMessaging(team?.id);
  const { usage } = useMeetingUsage();

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";

  // Build sidebar meeting usage sub-label for Live Calls
  const meetingSubLabel = usage ? (
    usage.isUnlimited ? (
      <span className="text-[10px] text-muted-foreground">∞ Unlimited</span>
    ) : (
      <span
        className={cn(
          "text-[10px] font-medium tabular-nums",
          usage.isAtLimit ? "text-destructive" : usage.isNearLimit ? "text-accent" : "text-muted-foreground"
        )}
      >
        {usage.used}/{usage.limit}
      </span>
    )
  ) : null;

  const navItems: NavItem[] = [
    { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
    {
      label: "Live Call",
      icon: Radio,
      href: "/dashboard/live",
      badge: meetingSubLabel as any,
    },
    { label: "Calls", icon: Phone, href: "/dashboard/calls" },
    { label: "AI Coach", icon: Bot, href: "/dashboard/coach" },
    { label: "Team", icon: Users, href: "/dashboard/team" },
    {
      label: "Messages",
      icon: MessageSquare,
      href: "/dashboard/messages",
      badge: totalUnread > 0 ? totalUnread : null,
    },
    {
      label: "Notifications",
      icon: Bell,
      href: "/dashboard/notifications",
      badge: unreadCount > 0 ? unreadCount : null,
    },
  ];

  const bottomNavItems: NavItem[] = [
    { label: "Billing", icon: CreditCard, href: "/dashboard/billing" },
    { label: "Settings", icon: Settings, href: "/dashboard/settings" },
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-border">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg gradient-accent flex items-center justify-center shrink-0">
            <Radio className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold font-display text-foreground">Fixsense</span>
        </Link>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <div key={item.href}>
            <NavLink item={item} collapsed={false} />
            {/* Inline meeting usage bar under Live Call */}
            {item.href === "/dashboard/live" && usage && !usage.isUnlimited && (
              <div className="ml-9 mr-1 mt-0.5 mb-1">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-muted-foreground">
                    {usage.used} / {usage.limit} meetings
                  </span>
                  {usage.isAtLimit && (
                    <span className="text-[10px] text-destructive font-medium">Limit reached</span>
                  )}
                  {usage.isNearLimit && !usage.isAtLimit && (
                    <span className="text-[10px] text-accent font-medium">
                      {usage.remaining} left
                    </span>
                  )}
                </div>
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-1 rounded-full transition-all",
                      usage.isAtLimit ? "bg-destructive" : usage.isNearLimit ? "bg-accent" : "bg-primary"
                    )}
                    style={{ width: `${usage.pct}%` }}
                  />
                </div>
              </div>
            )}
            {item.href === "/dashboard/live" && usage?.isUnlimited && (
              <div className="ml-9 mr-1 mt-0.5 mb-1">
                <span className="text-[10px] text-primary font-medium">∞ Unlimited meetings</span>
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Meeting usage card in sidebar */}
      {usage && !usage.isUnlimited && (
        <MeetingUsageCard variant="sidebar" />
      )}

      {/* Bottom nav */}
      <div className="px-3 pb-2 space-y-0.5 border-t border-border pt-3">
        {bottomNavItems.map((item) => (
          <NavLink key={item.href} item={item} collapsed={false} />
        ))}
      </div>

      {/* User profile */}
      <div className="px-3 pb-4 pt-2 border-t border-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary uppercase shrink-0">
            {displayName[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{displayName}</p>
            <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 shrink-0"
            onClick={async () => {
              await signOut();
              navigate("/");
            }}
          >
            <LogOut className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-56 flex-col border-r border-border bg-card/50 shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-card border-r border-border">
            <div className="absolute top-3 right-3">
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between h-14 px-4 border-b border-border bg-card/50">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="w-5 h-5" />
          </Button>
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="w-6 h-6 rounded gradient-accent flex items-center justify-center">
              <Radio className="w-3 h-3 text-primary-foreground" />
            </div>
            <span className="font-bold font-display text-foreground">Fixsense</span>
          </Link>
          <div className="w-9" />
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}