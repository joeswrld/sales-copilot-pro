import { ReactNode, useState, useRef, useEffect, useCallback } from "react";
import { Building2 } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Phone, Radio, Settings, CreditCard, Menu, X, Bot,
  Users, LogOut, MessageSquare, ChevronDown, Bell, CheckCheck,
  TrendingUp, AtSign, AlertCircle, Check, ArrowLeft,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/hooks/useNotifications";
import { useTeam } from "@/hooks/useTeam";
import { useTeamMessaging } from "@/hooks/useTeamMessaging";
import { TeamUsageSidebarPill } from "@/components/TeamMinuteUsageComponents";
import { cn } from "@/lib/utils";
import { NotificationDropdown } from "@/components/NotificationDropdown";
import { format, isToday, isYesterday, formatDistanceToNow } from "date-fns";

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
  comment:  { bg: "rgba(14,245,212,.13)",  icon: "#0ef5d4" },
  coaching: { bg: "rgba(34,197,94,.13)",   icon: "#22c55e" },
  mention:  { bg: "rgba(251,191,36,.13)",  icon: "#fbbf24" },
  system:   { bg: "rgba(148,163,184,.13)", icon: "#94a3b8" },
};

function fmtNotifTime(d: string) {
  const dt = new Date(d);
  if (isToday(dt)) {
    const mins = Math.round((Date.now() - dt.getTime()) / 60_000);
    if (mins < 1)  return "Just now";
    if (mins < 60) return `${mins}m ago`;
    return format(dt, "h:mm a");
  }
  if (isYesterday(dt)) return "Yesterday";
  return format(dt, "MMM d");
}

// ─── Global notification styles injected once ─────────────────────────────────

const NOTIF_CSS = `
  @keyframes notif-drop {
    from { opacity:0; transform:translateY(-8px) scale(.97); }
    to   { opacity:1; transform:translateY(0) scale(1); }
  }
  @keyframes notif-sheet {
    from { transform:translateY(100%); }
    to   { transform:translateY(0); }
  }
  @keyframes notif-backdrop {
    from { opacity:0; }
    to   { opacity:1; }
  }
  @keyframes notif-spin {
    to { transform:rotate(360deg); }
  }
  .notif-drop    { animation: notif-drop    .2s cubic-bezier(.22,.68,0,1.2) both; }
  .notif-sheet   { animation: notif-sheet   .32s cubic-bezier(.22,.68,0,1)  both; }
  .notif-backdrop{ animation: notif-backdrop .22s ease both; }

  /* Touch-friendly tap highlight */
  .notif-row { -webkit-tap-highlight-color: transparent; }
  .notif-row:active { background: rgba(26,240,196,.1) !important; }
`;

// ─── Notification item row (shared between desktop + mobile) ─────────────────

interface NotifItem {
  id: string;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
  reference_id: string | null;
}

function NotifRow({
  n,
  onClick,
  isLast,
  isMobile,
}: {
  n: NotifItem;
  onClick: (n: NotifItem) => void;
  isLast: boolean;
  isMobile: boolean;
}) {
  const Icon  = NOTIF_ICON[n.type]  ?? AlertCircle;
  const color = NOTIF_COLOR[n.type] ?? NOTIF_COLOR.system;

  return (
    <div
      className="notif-row"
      onClick={() => onClick(n)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onClick(n)}
      style={{
        display: "flex",
        gap: isMobile ? 14 : 12,
        padding: isMobile ? "15px 18px" : "13px 16px",
        borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,.05)",
        background: n.is_read ? "transparent" : "rgba(26,240,196,.04)",
        cursor: "pointer",
        transition: "background .12s",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* Type icon */}
      <div style={{
        width: isMobile ? 42 : 38,
        height: isMobile ? 42 : 38,
        borderRadius: 11,
        flexShrink: 0,
        background: color.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginTop: 1,
      }}>
        <Icon size={isMobile ? 18 : 17} color={color.icon} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: isMobile ? 14 : 13,
          margin: "0 0 4px",
          lineHeight: 1.45,
          color: n.is_read ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.92)",
          fontWeight: n.is_read ? 400 : 600,
          fontFamily: "system-ui, sans-serif",
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}>
          {n.message}
        </p>
        <span style={{
          fontSize: isMobile ? 12 : 11,
          color: n.is_read ? "rgba(255,255,255,.22)" : "rgba(26,240,196,.75)",
          fontFamily: "system-ui, sans-serif",
        }}>
          {fmtNotifTime(n.created_at)}
        </span>
      </div>

      {/* Status indicator */}
      <div style={{ display: "flex", alignItems: "flex-start", paddingTop: isMobile ? 5 : 3, flexShrink: 0 }}>
        {!n.is_read
          ? <div style={{
              width: isMobile ? 9 : 8,
              height: isMobile ? 9 : 8,
              borderRadius: "50%",
              background: "#1af0c4",
              boxShadow: "0 0 6px rgba(26,240,196,.55)",
              marginTop: 2,
            }} />
          : <Check size={isMobile ? 14 : 12} color="rgba(255,255,255,.2)" />
        }
      </div>
    </div>
  );
}



  // ── Shared panel sections ────────────────────────────────────────────────

  const PanelHeader = ({ mobile }: { mobile: boolean }) => (
    <div style={{
      padding: mobile ? "14px 18px" : "13px 16px",
      borderBottom: "1px solid rgba(255,255,255,.08)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexShrink: 0,
      gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: mobile ? 10 : 8 }}>
        {mobile && (
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(255,255,255,.5)", display: "flex",
              alignItems: "center", padding: 4, marginLeft: -4,
              borderRadius: 6, WebkitTapHighlightColor: "transparent",
            }}
            aria-label="Close notifications"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <span style={{
          fontSize: mobile ? 16 : 15,
          fontWeight: 700,
          color: "#f0f6fc",
          fontFamily: "system-ui, sans-serif",
        }}>
          Notifications
        </span>
        {unreadCount > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 800, lineHeight: 1,
            background: "#1af0c4", color: "#060912",
            borderRadius: 20, padding: "2px 7px",
          }}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>

      {unreadCount > 0 && (
        <button
          onClick={handleMarkAll}
          disabled={markAllRead.isPending}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "rgba(26,240,196,.1)",
            border: "1px solid rgba(26,240,196,.2)",
            borderRadius: 8,
            padding: mobile ? "7px 12px" : "5px 10px",
            cursor: "pointer",
            fontSize: mobile ? 12 : 11,
            fontWeight: 600,
            color: "#1af0c4",
            fontFamily: "system-ui, sans-serif",
            whiteSpace: "nowrap",
            opacity: markAllRead.isPending ? 0.6 : 1,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <CheckCheck size={mobile ? 13 : 11} />
          Mark all read
        </button>
      )}
    </div>
  );

  const PanelBody = ({ mobile }: { mobile: boolean }) => (
    <div style={{
      overflowY: "auto",
      flex: 1,
      WebkitOverflowScrolling: "touch",
    } as React.CSSProperties}>
      {notificationsLoading ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 140 }}>
          <div style={{
            width: 22, height: 22, borderRadius: "50%",
            border: "2.5px solid rgba(26,240,196,.25)",
            borderTopColor: "#1af0c4",
            animation: "notif-spin .7s linear infinite",
          }} />
        </div>
      ) : notifications.length === 0 ? (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center",
          padding: mobile ? "60px 28px" : "52px 24px",
          gap: 14,
        }}>
          <div style={{
            width: mobile ? 60 : 52,
            height: mobile ? 60 : 52,
            borderRadius: 16,
            background: "rgba(255,255,255,.05)",
            border: "1px solid rgba(255,255,255,.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Bell size={mobile ? 26 : 22} color="rgba(255,255,255,.2)" />
          </div>
          <p style={{
            fontSize: mobile ? 15 : 14,
            fontWeight: 600, color: "rgba(255,255,255,.4)",
            margin: 0, fontFamily: "system-ui, sans-serif",
          }}>
            You&apos;re all caught up!
          </p>
          <p style={{
            fontSize: mobile ? 13 : 12,
            color: "rgba(255,255,255,.22)", margin: 0,
            fontFamily: "system-ui, sans-serif", textAlign: "center",
            maxWidth: 240, lineHeight: 1.6,
          }}>
            Coaching updates, team mentions and activity will appear here.
          </p>
        </div>
      ) : (
        <div>
          {notifications.map((n, i) => (
            <NotifRow
              key={n.id}
              n={n}
              onClick={handleNotifClick}
              isLast={i === notifications.length - 1}
              isMobile={mobile}
            />
          ))}
        </div>
      )}
    </div>
  );

  const PanelFooter = ({ mobile }: { mobile: boolean }) => (
    <div style={{
      padding: mobile ? "12px 18px" : "10px 16px",
      paddingBottom: mobile
        ? "calc(12px + env(safe-area-inset-bottom, 0px))"
        : "10px",
      borderTop: "1px solid rgba(255,255,255,.06)",
      display: "flex", justifyContent: "center",
      flexShrink: 0,
    }}>
      <button
        onClick={goToMessages}
        style={{
          fontSize: mobile ? 13 : 12, fontWeight: 500,
          color: "rgba(255,255,255,.38)",
          background: "none", border: "none", cursor: "pointer",
          fontFamily: "system-ui, sans-serif",
          padding: mobile ? "8px 12px" : "4px 8px",
          borderRadius: 6, transition: "color .12s",
          WebkitTapHighlightColor: "transparent",
        }}
        onMouseEnter={e => (e.currentTarget.style.color = "#1af0c4")}
        onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,.38)")}
      >
        View all in Messages →
      </button>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{NOTIF_CSS}</style>

      <div ref={ref} style={{ position: "relative" }}>
        {/* Bell button */}
        <button
          onClick={() => setOpen(v => !v)}
          aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
          aria-expanded={open}
          aria-haspopup="dialog"
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
              aria-hidden="true"
              className="absolute top-1 right-1 w-[7px] h-[7px] rounded-full"
              style={{ background: "#1af0c4", boxShadow: "0 0 6px rgba(26,240,196,0.65)" }}
            />
          )}
        </button>

        {/* ── Desktop popover ──────────────────────────────────────────────── */}
        {open && !isMobile && (
          <div
            role="dialog"
            aria-label="Notifications"
            className="notif-drop"
            style={{
              position: "absolute",
              top: "calc(100% + 10px)",
              right: 0,
              width: "min(380px, calc(100vw - 24px))",
              maxHeight: "min(520px, calc(100vh - 80px))",
              background: "#111827",
              border: "1px solid rgba(255,255,255,.1)",
              borderRadius: 16,
              overflow: "hidden",
              boxShadow: "0 24px 64px rgba(0,0,0,.75), 0 0 0 1px rgba(255,255,255,.04)",
              zIndex: 200,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <PanelHeader mobile={false} />
            <PanelBody   mobile={false} />
            <PanelFooter mobile={false} />
          </div>
        )}
      </div>

      {/* ── Mobile bottom sheet — portalled outside bell ref ──────────────── */}
      {open && isMobile && (
        <div
          role="dialog"
          aria-label="Notifications"
          aria-modal="true"
          style={{ position: "fixed", inset: 0, zIndex: 400 }}
        >
          {/* Backdrop */}
          <div
            className="notif-backdrop"
            onClick={() => setOpen(false)}
            style={{
              position: "absolute", inset: 0,
              background: "rgba(0,0,0,.6)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
            }}
          />

          {/* Sheet */}
          <div
            ref={sheetRef}
            className="notif-sheet"
            style={{
              position: "absolute",
              bottom: 0, left: 0, right: 0,
              height: "min(88vh, 640px)",
              background: "#111827",
              borderRadius: "22px 22px 0 0",
              border: "1px solid rgba(255,255,255,.1)",
              borderBottom: "none",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              willChange: "transform",
            }}
          >
            {/* Drag handle */}
            <div style={{
              display: "flex", justifyContent: "center",
              padding: "14px 0 4px", flexShrink: 0, cursor: "grab",
            }}>
              <div style={{
                width: 44, height: 4, borderRadius: 2,
                background: "rgba(255,255,255,.2)",
              }} />
            </div>

            <PanelHeader mobile={true} />
            <PanelBody   mobile={true} />
            <PanelFooter mobile={true} />
          </div>
        </div>
      )}
    </>
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
  const navigate           = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { unreadCount }    = useNotifications();
  const { team }           = useTeam();
  const { totalUnread }    = useTeamMessaging(team?.id);

  const displayName  = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
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
        {primaryNav.map(item  => <NavLink key={item.href}  item={item} />)}
        <SectionLabel>Workspace</SectionLabel>
        {workspaceNav.map(item => <NavLink key={item.href} item={item} />)}
        <SectionLabel>System</SectionLabel>
        {systemNav.map(item   => <NavLink key={item.href}  item={item} />)}
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

          {/* Right actions */}
          <div className="flex items-center gap-1">
            {/* Notification bell — responsive dropdown/sheet */}
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
              <ChevronDown style={{ width: 12, height: 12 }} className="text-[rgba(255,255,255,0.25)] hidden sm:block" />
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
            <span className={cn("text-[13px] tracking-[-0.01em]", isLast ? "font-semibold text-white" : "font-medium text-[rgba(255,255,255,0.35)]")}>
              {labels[seg] || seg}
            </span>
          </span>
        );
      })}
    </div>
  );
}