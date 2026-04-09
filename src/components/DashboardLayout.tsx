import { ReactNode, useState } from "react";
import { Building2 } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Phone, Radio, Settings, CreditCard, Menu, X, Bot,
  Users, LogOut, MessageSquare, ChevronDown, Bell, Timer,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/hooks/useNotifications";
import { useTeam } from "@/hooks/useTeam";
import { useTeamMessaging } from "@/hooks/useTeamMessaging";
import { TeamUsageSidebarPill } from "@/components/TeamMinuteUsageComponents";
import { formatMinutes } from "@/config/plans";
import { cn } from "@/lib/utils";

function FixsenseLogo({ size = 28 }: { size?: number }) {
  return (
    <img src="/fixsense_icon_logo (2).png" alt="Fixsense" width={size} height={size}
      style={{ borderRadius: Math.round(size * 0.22), objectFit: "cover", flexShrink: 0, display: "block" }} />
  );
}

interface NavItem { label: string; icon: React.ElementType; href: string; badge?: number | string | null; }

function NavLink({ item }: { item: NavItem }) {
  const location = useLocation();
  const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + "/");
  return (
    <Link to={item.href} className={cn(
      "group relative flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-150 text-[13px] font-medium",
      isActive ? "bg-[rgba(255,255,255,0.07)] text-white" : "text-[rgba(255,255,255,0.45)] hover:text-[rgba(255,255,255,0.85)] hover:bg-[rgba(255,255,255,0.04)]"
    )}>
      {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 rounded-r-full bg-[#4FFFFF] opacity-90" />}
      <item.icon className={cn("shrink-0 transition-colors", isActive ? "text-[#4FFFFF]" : "text-[rgba(255,255,255,0.35)] group-hover:text-[rgba(255,255,255,0.65)]")} style={{ width: 15, height: 15 }} />
      <span className="flex-1 truncate tracking-[-0.01em]">{item.label}</span>
      {item.badge != null && (
        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums", isActive ? "bg-[rgba(79,255,255,0.15)] text-[#4FFFFF]" : "bg-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.6)]")}>
          {item.badge}
        </span>
      )}
    </Link>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="px-3 pt-4 pb-1 text-[10px] font-semibold tracking-[0.1em] uppercase text-[rgba(255,255,255,0.22)] select-none">{children}</p>;
}

function MinuteUsagePill() {
  const navigate = useNavigate();
  const { usage } = useMinuteUsage();
  if (!usage) return null;

  if (usage.isUnlimited) {
    return (
      <div className="mx-3 mt-3 mb-1 px-3 py-1.5 rounded-md cursor-pointer hover:opacity-80 transition-opacity"
        style={{ background: "rgba(26,240,196,0.08)", border: "1px solid rgba(26,240,196,0.15)" }}
        onClick={() => navigate("/dashboard/billing")}>
        <span className="text-[10px] font-semibold text-[#1af0c4] tracking-wide">∞ Unlimited minutes</span>
      </div>
    );
  }

  const hoursUsed  = (usage.minutesUsed / 60).toFixed(1);
  const hoursLimit = (usage.minuteLimit / 60).toFixed(0);
  const minsLeft   = Math.max(0, usage.minutesRemaining as number);
  const hoursLeft  = (minsLeft / 60).toFixed(1);

  return (
    <div className="mx-3 mt-3 mb-1 px-3 py-2 rounded-md cursor-pointer hover:opacity-80 transition-opacity"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
      onClick={() => navigate("/dashboard/billing")}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-[rgba(255,255,255,0.38)] font-medium tracking-wide uppercase flex items-center gap-1">
          <Timer style={{ width: 9, height: 9 }} /> Minutes
        </span>
        <span className={cn("text-[11px] font-semibold tabular-nums",
          usage.isAtLimit ? "text-red-400" : usage.isNearLimit ? "text-amber-400" : "text-[rgba(255,255,255,0.55)]")}>
          {hoursUsed}h / {hoursLimit}h
        </span>
      </div>
      <div className="h-[3px] rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500",
          usage.isAtLimit ? "bg-red-500" : usage.isNearLimit ? "bg-amber-400" : "bg-[#1af0c4]")}
          style={{ width: `${Math.min(usage.pct, 100)}%` }} />
      </div>
      <p className={cn("text-[9.5px] mt-1",
        usage.isAtLimit ? "text-red-400 font-medium" : usage.isNearLimit ? "text-amber-400" : "text-[rgba(255,255,255,0.22)]")}>
        {usage.isAtLimit ? "Limit reached · Upgrade" : `${hoursLeft}h remaining`}
      </p>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { unreadCount } = useNotifications();
  const { team } = useTeam();
  const { totalUnread } = useTeamMessaging(team?.id);

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const emailInitial = displayName[0]?.toUpperCase() || "U";
  const messagesUnread = totalUnread + unreadCount;

  const primaryNav: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Live Call", icon: Radio, href: "/dashboard/live" },
  { label: "Calls", icon: Phone, href: "/dashboard/calls" },
  { label: "Deals", icon: Building2, href: "/dashboard/deals" },
  { label: "AI Coach", icon: Bot, href: "/dashboard/coach" },
];
  const workspaceNav: NavItem[] = [
    { label: "Team",     icon: Users,         href: "/dashboard/team" },
    { label: "Messages", icon: MessageSquare, href: "/dashboard/messages", badge: messagesUnread > 0 ? messagesUnread : null },
  ];
  const systemNav: NavItem[] = [
    { label: "Billing",  icon: CreditCard, href: "/dashboard/billing" },
    { label: "Settings", icon: Settings,   href: "/dashboard/settings" },
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full" style={{ fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif" }}>
      <div className="px-4 pt-5 pb-4">
        <Link to="/dashboard" className="flex items-center gap-2.5 group">
          <FixsenseLogo size={28} />
          <span className="text-[15px] font-bold tracking-[-0.03em] text-white">Fixsense</span>
        </Link>
      </div>
      <div className="mx-4 mb-1 h-px bg-[rgba(255,255,255,0.06)]" />
      <TeamUsageSidebarPill />
      <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-0.5">
        <SectionLabel>Main</SectionLabel>
        {primaryNav.map(item => <NavLink key={item.href} item={item} />)}
        <SectionLabel>Workspace</SectionLabel>
        {workspaceNav.map(item => <NavLink key={item.href} item={item} />)}
        <SectionLabel>System</SectionLabel>
        {systemNav.map(item => <NavLink key={item.href} item={item} />)}
      </nav>
      <div className="mx-3 mb-4 mt-2 rounded-md overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-[rgba(255,255,255,0.04)] transition-colors cursor-pointer"
          onClick={async () => { await signOut(); navigate("/"); }}>
          <div className="w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0 uppercase"
            style={{ background: "linear-gradient(135deg, rgba(26,240,196,0.2) 0%, rgba(11,191,160,0.2) 100%)", border: "1px solid rgba(26,240,196,0.2)", color: "#1af0c4" }}>
            {emailInitial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-[rgba(255,255,255,0.85)] truncate leading-none mb-0.5">{displayName}</p>
            <p className="text-[10px] text-[rgba(255,255,255,0.32)] truncate leading-none">{user?.email}</p>
          </div>
          <LogOut style={{ width: 13, height: 13 }} className="text-[rgba(255,255,255,0.25)] shrink-0" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex" style={{ background: "#0a0e1a" }}>
      <aside className="hidden md:flex w-[220px] flex-col shrink-0 relative"
        style={{ background: "#0d1120", borderRight: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent 0%, rgba(26,240,196,0.5) 40%, rgba(11,191,160,0.4) 60%, transparent 100%)" }} />
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 backdrop-blur-sm" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[220px] flex flex-col"
            style={{ background: "#0d1120", borderRight: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="absolute top-3 right-3 z-10">
              <button onClick={() => setMobileOpen(false)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-[rgba(255,255,255,0.4)] hover:text-white hover:bg-[rgba(255,255,255,0.08)] transition-colors">
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 flex items-center justify-between px-5 shrink-0 sticky top-0 z-30"
          style={{ background: "rgba(10,14,26,0.92)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3">
            <button className="md:hidden w-7 h-7 rounded-md flex items-center justify-center text-[rgba(255,255,255,0.5)] hover:text-white hover:bg-[rgba(255,255,255,0.07)] transition-colors" onClick={() => setMobileOpen(true)}>
              <Menu style={{ width: 16, height: 16 }} />
            </button>
            <div className="flex md:hidden items-center gap-2">
              <FixsenseLogo size={22} />
              <span className="text-[13px] font-bold tracking-[-0.02em] text-white">Fixsense</span>
            </div>
            <div className="hidden md:block"><BreadcrumbPath /></div>
          </div>
          <div className="flex items-center gap-1">
            <button className="relative w-8 h-8 rounded-md flex items-center justify-center text-[rgba(255,255,255,0.38)] hover:text-[rgba(255,255,255,0.75)] hover:bg-[rgba(255,255,255,0.06)] transition-colors" onClick={() => navigate("/dashboard/messages")}>
              <Bell style={{ width: 15, height: 15 }} />
              {messagesUnread > 0 && <span className="absolute top-1 right-1 w-[7px] h-[7px] rounded-full" style={{ background: "#1af0c4", boxShadow: "0 0 6px rgba(26,240,196,0.6)" }} />}
            </button>
            <button className="flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-md transition-colors hover:bg-[rgba(255,255,255,0.06)]" onClick={() => navigate("/dashboard/profile")}>
              <div className="w-6 h-6 rounded-[5px] flex items-center justify-center text-[10px] font-bold uppercase"
                style={{ background: "rgba(26,240,196,0.15)", border: "1px solid rgba(26,240,196,0.2)", color: "#1af0c4" }}>
                {emailInitial}
              </div>
              <span className="hidden sm:block text-[12px] font-medium text-[rgba(255,255,255,0.55)] max-w-[100px] truncate">{displayName}</span>
              <ChevronDown style={{ width: 12, height: 12 }} className="text-[rgba(255,255,255,0.25)] hidden sm:block" />
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto" style={{ background: "#0a0e1a" }}>
          <div className="p-5 md:p-7 min-h-full">{children}</div>
        </main>
      </div>
    </div>
  );
}

function BreadcrumbPath() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);
  const labels: Record<string, string> = { dashboard:"Dashboard", calls:"Calls", live:"Live Call", analytics:"Analytics", team:"Team", messages:"Messages", settings:"Settings", billing:"Billing", coach:"AI Coach", profile:"Profile" };
  if (segments.length === 1) return <span className="text-[13px] font-semibold text-white tracking-[-0.01em]">Dashboard</span>;
  return (
    <div className="flex items-center gap-1.5">
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        if (seg.includes("-") && seg.length > 20) return null;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-[rgba(255,255,255,0.2)] text-[11px]">/</span>}
            <span className={cn("text-[13px] tracking-[-0.01em]", isLast ? "font-semibold text-white" : "font-medium text-[rgba(255,255,255,0.35)]")}>
              {labels[seg] || seg}
            </span>
          </span>
        );
      })}
    </div>
  );
}