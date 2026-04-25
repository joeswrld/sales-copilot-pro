import { ReactNode, useState, useRef, useEffect } from "react";
import { Building2 } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Phone, Radio, Settings, CreditCard, Menu, X, Bot,
  Users, LogOut, MessageSquare, ChevronDown, Bell, CheckCheck,
  TrendingUp, AtSign, AlertCircle, Check,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/hooks/useNotifications";
import { useTeam } from "@/hooks/useTeam";
import { useTeamMessaging } from "@/hooks/useTeamMessaging";
import { TeamUsageSidebarPill } from "@/components/TeamMinuteUsageComponents";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";

// ─── Logo ─────────────────────────────────────────────────────────────────────

function FixsenseLogo({ size = 28 }: { size?: number }) {
  return (
    <img
      src="/fixsense_icon_logo (2).png"
      alt="Fixsense"
      width={size}
      height={size}
      style={{
        borderRadius: Math.round(size * 0.22),
        objectFit: "cover",
        flexShrink: 0,
        display: "block",
      }}
    />
  );
}

// ─── Nav types ────────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  icon: React.ElementType;
  href: string;
  badge?: number | string | null;
}

// ─── Notification helpers ─────────────────────────────────────────────────────

const NOTIF_ICON: Record<string, React.ElementType> = {
  comment:  MessageSquare,
  coaching: TrendingUp,
  mention:  AtSign,
  system:   AlertCircle,
};

const NOTIF_COLOR: Record<string, { bg: string; icon: string }> = {
  comment:  { bg: "rgba(14,245,212,.12)",  icon: "#0ef5d4" },
  coaching: { bg: "rgba(34,197,94,.12)",   icon: "#22c55e" },
  mention:  { bg: "rgba(251,191,36,.12)",  icon: "#fbbf24" },
  system:   { bg: "rgba(148,163,184,.12)", icon: "#94a3b8" },
};

function fmtNotifTime(d: string) {
  const dt = new Date(d);
  if (isToday(dt))     return format(dt, "h:mm a");
  if (isYesterday(dt)) return "Yesterday";
  return format(dt, "MMM d");
}

// ─── Notification Dropdown ────────────────────────────────────────────────────

function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const ref  = useRef<HTMLDivElement>(null);
  const { notifications, notificationsLoading, unreadCount, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const handleNotifClick = (n: { id: string; is_read: boolean; reference_id: string | null }) => {
    if (!n.is_read) markRead.mutate(n.id);
    if (n.reference_id) {
      // Navigate to messages if it's a comment/mention notification
      navigate("/dashboard/messages");
      setOpen(false);
    }
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          "relative w-8 h-8 rounded-md flex items-center justify-center transition-colors",
          open
            ? "bg-[rgba(255,255,255,0.1)] text-white"
            : "text-[rgba(255,255,255,0.38)] hover:text-[rgba(255,255,255,0.75)] hover:bg-[rgba(255,255,255,0.06)]"
        )}
      >
        <Bell style={{ width: 15, height: 15 }} />
        {unreadCount > 0 && (
          <span
            className="absolute top-1 right-1 w-[7px] h-[7px] rounded-full"
            style={{ background: "#1af0c4", boxShadow: "0 0 6px rgba(26,240,196,0.6)" }}
          />
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 360,
            maxHeight: 480,
            background: "#111827",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
            zIndex: 200,
            display: "flex",
            flexDirection: "column",
            // Slide-in animation
            animation: "notif-drop .18s ease",
          }}
        >
          <style>{`
            @keyframes notif-drop {
              from { opacity:0; transform:translateY(-6px) scale(.98); }
              to   { opacity:1; transform:translateY(0)    scale(1); }
            }
          `}</style>

          {/* Header */}
          <div style={{
            padding: "14px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                fontSize: 14, fontWeight: 700, color: "#f0f6fc",
                fontFamily: "system-ui, sans-serif",
              }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 800,
                  background: "#1af0c4", color: "#060912",
                  borderRadius: 10, padding: "1px 7px",
                }}>
                  {unreadCount}
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    background: "rgba(26,240,196,.1)",
                    border: "1px solid rgba(26,240,196,.2)",
                    borderRadius: 7, padding: "4px 10px",
                    cursor: "pointer", fontSize: 11,
                    color: "#1af0c4", fontFamily: "system-ui,sans-serif",
                  }}
                >
                  <CheckCheck size={11} />
                  Mark all read
                </button>
              )}
              <button
                onClick={() => { navigate("/dashboard/messages"); setOpen(false); }}
                style={{
                  background: "rgba(255,255,255,.06)",
                  border: "1px solid rgba(255,255,255,.1)",
                  borderRadius: 7, padding: "4px 10px",
                  cursor: "pointer", fontSize: 11,
                  color: "rgba(255,255,255,.6)", fontFamily: "system-ui,sans-serif",
                }}
              >
                See all
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {notificationsLoading ? (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 120 }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid rgba(26,240,196,.3)", borderTopColor: "#1af0c4", animation: "spin .7s linear infinite" }} />
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 20px", gap: 10 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Bell size={20} color="rgba(255,255,255,.25)" />
                </div>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,.35)", margin: 0, fontFamily: "system-ui,sans-serif" }}>
                  You're all caught up!
                </p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,.2)", margin: 0, fontFamily: "system-ui,sans-serif", textAlign: "center", maxWidth: 200 }}>
                  Notifications about coaching, mentions, and team activity appear here.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {notifications.map((n, idx) => {
                  const Icon  = NOTIF_ICON[n.type]  ?? AlertCircle;
                  const color = NOTIF_COLOR[n.type] ?? NOTIF_COLOR.system;
                  const isLast = idx === notifications.length - 1;
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleNotifClick(n)}
                      style={{
                        display: "flex",
                        gap: 12,
                        padding: "12px 16px",
                        borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,.04)",
                        background: n.is_read ? "transparent" : "rgba(26,240,196,.04)",
                        cursor: "pointer",
                        transition: "background .12s",
                        position: "relative",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = n.is_read ? "rgba(255,255,255,.03)" : "rgba(26,240,196,.07)")}
                      onMouseLeave={e => (e.currentTarget.style.background = n.is_read ? "transparent" : "rgba(26,240,196,.04)")}
                    >
                      {/* Icon badge */}
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: color.bg, flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        marginTop: 1,
                      }}>
                        <Icon size={16} color={color.icon} />
                      </div>

                      {/* Text */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontSize: 13, margin: "0 0 3px", lineHeight: 1.45,
                          color: n.is_read ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.9)",
                          fontWeight: n.is_read ? 400 : 600,
                          fontFamily: "system-ui,sans-serif",
                          // Two-line clamp
                          overflow: "hidden", textOverflow: "ellipsis",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}>
                          {n.message}
                        </p>
                        <span style={{
                          fontSize: 11,
                          color: n.is_read ? "rgba(255,255,255,.22)" : "rgba(26,240,196,.7)",
                          fontFamily: "system-ui,sans-serif",
                        }}>
                          {fmtNotifTime(n.created_at)}
                        </span>
                      </div>

                      {/* Unread dot + read-tick */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, paddingTop: 2, flexShrink: 0 }}>
                        {!n.is_read
                          ? <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#1af0c4", boxShadow: "0 0 6px rgba(26,240,196,.5)" }} />
                          : <Check size={12} color="rgba(255,255,255,.2)" />
                        }
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "10px 16px",
            borderTop: "1px solid rgba(255,255,255,.06)",
            display: "flex",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            <button
              onClick={() => { navigate("/dashboard/messages"); setOpen(false); }}
              style={{
                fontSize: 12, color: "rgba(255,255,255,.4)",
                background: "none", border: "none", cursor: "pointer",
                fontFamily: "system-ui,sans-serif",
                transition: "color .12s",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "#1af0c4")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,.4)")}
            >
              View all notifications →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Nav link ─────────────────────────────────────────────────────────────────

function NavLink({ item }: { item: NavItem }) {
  const location = useLocation();
  const isActive =
    location.pathname === item.href ||
    location.pathname.startsWith(item.href + "/");

  return (
    <Link
      to={item.href}
      className={cn(
        "group relative flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-150 text-[13px] font-medium",
        isActive
          ? "bg-[rgba(255,255,255,0.07)] text-white"
          : "text-[rgba(255,255,255,0.45)] hover:text-[rgba(255,255,255,0.85)] hover:bg-[rgba(255,255,255,0.04)]"
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 rounded-r-full bg-[#4FFFFF] opacity-90" />
      )}
      <item.icon
        className={cn(
          "shrink-0 transition-colors",
          isActive
            ? "text-[#4FFFFF]"
            : "text-[rgba(255,255,255,0.35)] group-hover:text-[rgba(255,255,255,0.65)]"
        )}
        style={{ width: 15, height: 15 }}
      />
      <span className="flex-1 truncate tracking-[-0.01em]">{item.label}</span>
      {item.badge != null && (
        <span
          className={cn(
            "text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums",
            isActive
              ? "bg-[rgba(79,255,255,0.15)] text-[#4FFFFF]"
              : "bg-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.6)]"
          )}
        >
          {item.badge}
        </span>
      )}
    </Link>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pt-4 pb-1 text-[10px] font-semibold tracking-[0.1em] uppercase text-[rgba(255,255,255,0.22)] select-none">
      {children}
    </p>
  );
}

// ─── Main Layout ──────────────────────────────────────────────────────────────

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { unreadCount } = useNotifications();
  const { team } = useTeam();
  const { totalUnread } = useTeamMessaging(team?.id);

  const displayName =
    user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const emailInitial = displayName[0]?.toUpperCase() || "U";
  const messagesUnread = totalUnread + unreadCount;

  const primaryNav: NavItem[] = [
    { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
    { label: "Live Call",  icon: Radio,           href: "/dashboard/live" },
    { label: "Calls",      icon: Phone,           href: "/dashboard/calls" },
    { label: "Deals",      icon: Building2,       href: "/dashboard/deals" },
    { label: "AI Coach",   icon: Bot,             href: "/dashboard/coach" },
  ];
  const workspaceNav: NavItem[] = [
    { label: "Team",     icon: Users,         href: "/dashboard/team" },
    {
      label: "Messages", icon: MessageSquare, href: "/dashboard/messages",
      badge: messagesUnread > 0 ? messagesUnread : null,
    },
  ];
  const systemNav: NavItem[] = [
    { label: "Billing",  icon: CreditCard, href: "/dashboard/billing" },
    { label: "Settings", icon: Settings,   href: "/dashboard/settings" },
  ];

  const handleSignOut = async () => {
    try { await signOut(); navigate("/"); } catch { navigate("/"); }
  };

  const SidebarContent = () => (
    <div
      className="flex flex-col h-full"
      style={{ fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif" }}
    >
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

      {/* User card */}
      <div className="mx-3 mb-4 mt-2 rounded-md overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
        <div
          className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-[rgba(255,255,255,0.04)] transition-colors cursor-pointer"
          onClick={handleSignOut}
        >
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0 uppercase"
            style={{
              background: "linear-gradient(135deg, rgba(26,240,196,0.2) 0%, rgba(11,191,160,0.2) 100%)",
              border: "1px solid rgba(26,240,196,0.2)",
              color: "#1af0c4",
            }}
          >
            {emailInitial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-[rgba(255,255,255,0.85)] truncate leading-none mb-0.5">
              {displayName}
            </p>
            <p className="text-[10px] text-[rgba(255,255,255,0.32)] truncate leading-none">
              {user?.email}
            </p>
          </div>
          <LogOut style={{ width: 13, height: 13 }} className="text-[rgba(255,255,255,0.25)] shrink-0" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex" style={{ background: "#0a0e1a" }}>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex w-[220px] flex-col shrink-0 relative"
        style={{ background: "#0d1120", borderRight: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent 0%, rgba(26,240,196,0.5) 40%, rgba(11,191,160,0.4) 60%, transparent 100%)" }}
        />
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 backdrop-blur-sm"
            style={{ background: "rgba(0,0,0,0.6)" }}
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="absolute left-0 top-0 bottom-0 w-[220px] flex flex-col"
            style={{ background: "#0d1120", borderRight: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="absolute top-3 right-3 z-10">
              <button
                onClick={() => setMobileOpen(false)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-[rgba(255,255,255,0.4)] hover:text-white hover:bg-[rgba(255,255,255,0.08)] transition-colors"
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header */}
        <header
          className="h-12 flex items-center justify-between px-5 shrink-0 sticky top-0 z-30"
          style={{
            background: "rgba(10,14,26,0.92)",
            backdropFilter: "blur(20px)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              className="md:hidden w-7 h-7 rounded-md flex items-center justify-center text-[rgba(255,255,255,0.5)] hover:text-white hover:bg-[rgba(255,255,255,0.07)] transition-colors"
              onClick={() => setMobileOpen(true)}
            >
              <Menu style={{ width: 16, height: 16 }} />
            </button>
            {/* Mobile logo */}
            <div className="flex md:hidden items-center gap-2">
              <FixsenseLogo size={22} />
              <span className="text-[13px] font-bold tracking-[-0.02em] text-white">Fixsense</span>
            </div>
            {/* Desktop breadcrumb */}
            <div className="hidden md:block">
              <BreadcrumbPath />
            </div>
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-1">
            {/* ── Notification bell with dropdown ── */}
            <NotificationDropdown />

            {/* User menu */}
            <button
              className="flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-md transition-colors hover:bg-[rgba(255,255,255,0.06)]"
              onClick={() => navigate("/dashboard/profile")}
            >
              <div
                className="w-6 h-6 rounded-[5px] flex items-center justify-center text-[10px] font-bold uppercase"
                style={{
                  background: "rgba(26,240,196,0.15)",
                  border: "1px solid rgba(26,240,196,0.2)",
                  color: "#1af0c4",
                }}
              >
                {emailInitial}
              </div>
              <span className="hidden sm:block text-[12px] font-medium text-[rgba(255,255,255,0.55)] max-w-[100px] truncate">
                {displayName}
              </span>
              <ChevronDown
                style={{ width: 12, height: 12 }}
                className="text-[rgba(255,255,255,0.25)] hidden sm:block"
              />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto" style={{ background: "#0a0e1a" }}>
          <div className="p-5 md:p-7 min-h-full">{children}</div>
        </main>
      </div>
    </div>
  );
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function BreadcrumbPath() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);
  const labels: Record<string, string> = {
    dashboard: "Dashboard", calls: "Calls",   live: "Live Call",
    analytics: "Analytics", team: "Team",     messages: "Messages",
    settings:  "Settings",  billing: "Billing", coach: "AI Coach",
    profile:   "Profile",   deals: "Deals",
  };

  if (segments.length === 1)
    return <span className="text-[13px] font-semibold text-white tracking-[-0.01em]">Dashboard</span>;

  return (
    <div className="flex items-center gap-1.5">
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        if (seg.includes("-") && seg.length > 20) return null;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-[rgba(255,255,255,0.2)] text-[11px]">/</span>}
            <span
              className={cn(
                "text-[13px] tracking-[-0.01em]",
                isLast
                  ? "font-semibold text-white"
                  : "font-medium text-[rgba(255,255,255,0.35)]"
              )}
            >
              {labels[seg] || seg}
            </span>
          </span>
        );
      })}
    </div>
  );
}