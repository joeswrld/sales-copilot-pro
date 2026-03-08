import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { 
  LayoutDashboard, Phone, BarChart3, Settings, Zap, Menu, X, 
  Users, Headphones, Bot, LogOut, CreditCard, User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useSettings";
import { useTeamUsage } from "@/hooks/useTeamUsage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: Phone, label: "Calls", href: "/dashboard/calls" },
  { icon: Headphones, label: "Live Call", href: "/dashboard/live" },
  { icon: Bot, label: "AI Coach", href: "/dashboard/ai-coach" },
  { icon: BarChart3, label: "Analytics", href: "/dashboard/analytics" },
  { icon: Users, label: "Team", href: "/dashboard/team" },
  { icon: CreditCard, label: "Billing", href: "/dashboard/billing" },
  { icon: Settings, label: "Settings", href: "/dashboard/settings" },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { profile } = useUserProfile();
  const { teamUsage } = useTeamUsage();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const callsUsed = profile?.calls_used ?? 0;
  const callsLimit = profile?.calls_limit ?? 5;
  const planType = profile?.plan_type ?? "free";
  const usagePercent = callsLimit > 0 ? Math.min((callsUsed / callsLimit) * 100, 100) : 0;

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const displayName = user?.user_metadata?.full_name || user?.email || "User";
  const initial = displayName[0]?.toUpperCase() || "U";

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-300 lg:static lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-accent flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold font-display text-foreground">Fixsense</span>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(item => {
            const active = location.pathname === item.href;
            return (
              <Link key={item.href} to={item.href} onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-primary font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}>
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-sidebar-border">
          <div className="glass rounded-lg p-3 space-y-2.5">
            <p className="text-xs text-muted-foreground capitalize">{planType} Plan</p>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-muted-foreground">Calls</span>
                <span className="text-[11px] font-medium">{callsUsed}/{callsLimit}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${usagePercent}%` }} />
              </div>
            </div>
            {teamUsage && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" /> Team
                  </span>
                  <span className="text-[11px] font-medium">
                    {teamUsage.membersUsed}/{teamUsage.isUnlimited ? "∞" : teamUsage.membersLimit}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      teamUsage.isAtLimit ? "bg-destructive" : teamUsage.isNearLimit ? "bg-accent" : "bg-primary"
                    )}
                    style={{ width: `${teamUsage.isUnlimited ? 0 : teamUsage.membersPct}%` }}
                  />
                </div>
              </div>
            )}
            <Button size="sm" className="w-full text-xs" asChild>
              <Link to="/pricing">Upgrade Plan</Link>
            </Button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border flex items-center justify-between px-4 lg:px-6 shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-muted-foreground hover:text-foreground">
            <Menu className="w-5 h-5" />
          </button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">{displayName}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold ring-offset-background transition-colors hover:bg-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  {initial}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium truncate">{displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="cursor-pointer gap-2">
                  <Link to="/dashboard/profile"><User className="w-4 h-4" /> Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer gap-2">
                  <Link to="/dashboard/settings"><Settings className="w-4 h-4" /> Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer gap-2">
                  <Link to="/dashboard/billing"><CreditCard className="w-4 h-4" /> Billing</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer gap-2 text-destructive focus:text-destructive">
                  <LogOut className="w-4 h-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
