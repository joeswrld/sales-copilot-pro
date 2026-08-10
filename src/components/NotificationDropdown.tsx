/**
 * NotificationDropdown.tsx
 *
 * Drop-in replacement for the NotificationDropdown section inside DashboardLayout.tsx
 *
 * Fixes:
 *  - Mobile bottom-sheet now renders in a React Portal at document.body so it
 *    always escapes any parent stacking context (the sticky header z-30, etc.)
 *  - z-index raised to 9999 on the portal so nothing can occlude it
 *  - Swipe-down to dismiss still works
 *  - Desktop popover behaviour unchanged
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Bell, CheckCheck, TrendingUp, AtSign, AlertCircle,
  MessageSquare, Check, ArrowLeft, Calendar, Users, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/hooks/useNotifications";
import { format, isToday, isYesterday } from "date-fns";
import { safeInternalPath } from "@/lib/safeLink";

// ─── Notification helpers ─────────────────────────────────────────────────────

const NOTIF_ICON: Record<string, React.ElementType> = {
  comment:  MessageSquare,
  coaching: TrendingUp,
  mention:  AtSign,
  system:   AlertCircle,
  meeting:  Calendar,
  deal:     BarChart3,
  team:     Users,
  call:     Bell,
};

const NOTIF_COLOR: Record<string, { bg: string; icon: string }> = {
  comment:  { bg: "rgba(34,49,92,.09)",   icon: "#22315C" },
  coaching: { bg: "rgba(47,107,79,.10)",  icon: "#2F6B4F" },
  mention:  { bg: "rgba(138,90,32,.10)",  icon: "#8A5A20" },
  system:   { bg: "rgba(23,23,15,.07)",   icon: "rgba(23,23,15,.5)" },
  meeting:  { bg: "rgba(34,49,92,.09)",   icon: "#22315C" },
  deal:     { bg: "rgba(102,66,161,.10)", icon: "#6642A1" },
  team:     { bg: "rgba(34,49,92,.09)",   icon: "#22315C" },
  call:     { bg: "rgba(138,90,32,.10)",  icon: "#8A5A20" },
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

// ─── Injected CSS ─────────────────────────────────────────────────────────────

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
  .notif-row { -webkit-tap-highlight-color: transparent; }
  .notif-row:active { background: rgba(34,49,92,.06) !important; }
`;

// ─── Notification item row ────────────────────────────────────────────────────

interface NotifItem {
  id: string;
  type: string;
  title: string | null;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
  reference_id: string | null;
}

function NotifRow({
  n, onClick, isLast, isMobile,
}: {
  n: NotifItem; onClick: (n: NotifItem) => void; isLast: boolean; isMobile: boolean;
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
        borderBottom: isLast ? "none" : "1px solid rgba(23,23,15,.07)",
        background: n.is_read ? "transparent" : "rgba(34,49,92,.035)",
        cursor: "pointer",
        transition: "background .12s",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <div style={{
        width: isMobile ? 42 : 38, height: isMobile ? 42 : 38,
        borderRadius: 11, flexShrink: 0, background: color.bg,
        display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1,
      }}>
        <Icon size={isMobile ? 18 : 17} color={color.icon} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {n.title && (
          <p style={{
            fontSize: isMobile ? 13 : 12,
            margin: "0 0 2px", lineHeight: 1.3,
            color: n.is_read ? "rgba(23,23,15,.65)" : "rgba(23,23,15,.95)",
            fontWeight: 700,
            fontFamily: "'Inter', system-ui, sans-serif",
            letterSpacing: "-0.01em",
          }}>
            {n.title}
          </p>
        )}
        <p style={{
          fontSize: isMobile ? 14 : 13,
          margin: "0 0 4px", lineHeight: 1.45,
          color: n.is_read ? "rgba(23,23,15,.55)" : "rgba(23,23,15,.82)",
          fontWeight: n.is_read ? 400 : (n.title ? 400 : 600),
          fontFamily: "'Inter', system-ui, sans-serif",
          overflow: "hidden", textOverflow: "ellipsis",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        }}>
          {n.message}
        </p>
        <span style={{
          fontSize: isMobile ? 12 : 11,
          color: n.is_read ? "rgba(23,23,15,.32)" : "#22315C",
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
        }}>
          {fmtNotifTime(n.created_at)}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", paddingTop: isMobile ? 5 : 3, flexShrink: 0 }}>
        {!n.is_read
          ? <div style={{ width: isMobile ? 9 : 8, height: isMobile ? 9 : 8, borderRadius: "50%", background: "#22315C", boxShadow: "0 0 6px rgba(34,49,92,.35)", marginTop: 2 }} />
          : <Check size={isMobile ? 14 : 12} color="rgba(23,23,15,.25)" />
        }
      </div>
    </div>
  );
}

// ─── NotificationDropdown ─────────────────────────────────────────────────────

export function NotificationDropdown() {
  const [open, setOpen]   = useState(false);
  const bellRef           = useRef<HTMLDivElement>(null);
  const popoverRef        = useRef<HTMLDivElement>(null);
  const sheetRef          = useRef<HTMLDivElement>(null);
  const navigate          = useNavigate();

  // Detect mobile — update on resize
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 640
  );
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", check, { passive: true });
    return () => window.removeEventListener("resize", check);
  }, []);

  const {
    notifications, notificationsLoading,
    unreadCount, markRead, markAllRead,
  } = useNotifications();

  // Close popover on outside click (desktop)
  useEffect(() => {
    if (!open || isMobile) return;
    const h = (e: MouseEvent) => {
      if (
        bellRef.current    && !bellRef.current.contains(e.target as Node) &&
        popoverRef.current && !popoverRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, isMobile]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open]);

  // Lock body scroll when mobile sheet is open
  useEffect(() => {
    if (open && isMobile) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [open, isMobile]);

  // Swipe-down to dismiss (mobile)
  useEffect(() => {
    if (!open || !isMobile || !sheetRef.current) return;
    const sheet = sheetRef.current;
    let startY = 0, currentY = 0;

    const onTouchStart = (e: TouchEvent) => { startY = e.touches[0].clientY; };
    const onTouchMove  = (e: TouchEvent) => {
      currentY = e.touches[0].clientY;
      const delta = Math.max(0, currentY - startY);
      sheet.style.transform = `translateY(${delta}px)`;
      sheet.style.transition = "none";
    };
    const onTouchEnd = () => {
      const delta = currentY - startY;
      sheet.style.transition = "transform .28s cubic-bezier(.22,.68,0,1)";
      if (delta > 110) {
        sheet.style.transform = "translateY(100%)";
        setTimeout(() => setOpen(false), 260);
      } else {
        sheet.style.transform = "translateY(0)";
      }
    };

    sheet.addEventListener("touchstart", onTouchStart, { passive: true });
    sheet.addEventListener("touchmove",  onTouchMove,  { passive: true });
    sheet.addEventListener("touchend",   onTouchEnd,   { passive: true });
    return () => {
      sheet.removeEventListener("touchstart", onTouchStart);
      sheet.removeEventListener("touchmove",  onTouchMove);
      sheet.removeEventListener("touchend",   onTouchEnd);
    };
  }, [open, isMobile]);

  const handleNotifClick = useCallback((n: NotifItem) => {
    if (!n.is_read) markRead.mutate(n.id);
    setOpen(false);
    const safe = safeInternalPath(n.link);
    if (safe) {
      navigate(safe);
    } else if (n.reference_id) {
      navigate("/messages");
    }
  }, [markRead, navigate]);

  const handleMarkAll = () => markAllRead.mutate();
  const goToMessages  = () => { navigate("/messages"); setOpen(false); };

  // ── Shared sub-components ──────────────────────────────────────────────────

  const PanelHeader = ({ mobile }: { mobile: boolean }) => (
    <div style={{
      padding: mobile ? "14px 18px" : "13px 16px",
      borderBottom: "1px solid rgba(23,23,15,.09)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      flexShrink: 0, gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: mobile ? 10 : 8 }}>
        {mobile && (
          <button
            onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(23,23,15,.5)", display: "flex", alignItems: "center", padding: 4, marginLeft: -4, borderRadius: 6, WebkitTapHighlightColor: "transparent" }}
            aria-label="Close notifications"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <span style={{ fontSize: mobile ? 16 : 15, fontWeight: 700, color: "#17170F", fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: "-0.02em" }}>
          Notifications
        </span>
        {unreadCount > 0 && (
          <span style={{ fontSize: 10, fontWeight: 800, lineHeight: 1, background: "#22315C", color: "#FAFAF8", borderRadius: 20, padding: "2px 7px" }}>
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
            background: "rgba(34,49,92,.07)", border: "1px solid rgba(34,49,92,.22)",
            borderRadius: 8, padding: mobile ? "7px 12px" : "5px 10px",
            cursor: "pointer", fontSize: mobile ? 12 : 11, fontWeight: 600,
            color: "#22315C", fontFamily: "'Inter', system-ui, sans-serif", whiteSpace: "nowrap",
            opacity: markAllRead.isPending ? 0.6 : 1, WebkitTapHighlightColor: "transparent",
          }}
        >
          <CheckCheck size={mobile ? 13 : 11} /> Mark all read
        </button>
      )}
    </div>
  );

  const PanelBody = ({ mobile }: { mobile: boolean }) => (
    <div style={{ overflowY: "auto", flex: 1, WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
      {notificationsLoading ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 140 }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", border: "2.5px solid rgba(34,49,92,.2)", borderTopColor: "#22315C", animation: "notif-spin .7s linear infinite" }} />
        </div>
      ) : notifications.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: mobile ? "60px 28px" : "52px 24px", gap: 14 }}>
          <div style={{ width: mobile ? 60 : 52, height: mobile ? 60 : 52, borderRadius: 16, background: "rgba(23,23,15,.04)", border: "1px solid rgba(23,23,15,.09)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Bell size={mobile ? 26 : 22} color="rgba(23,23,15,.25)" />
          </div>
          <p style={{ fontSize: mobile ? 15 : 14, fontWeight: 600, color: "rgba(23,23,15,.55)", margin: 0, fontFamily: "'Inter', system-ui, sans-serif" }}>
            You&apos;re all caught up!
          </p>
          <p style={{ fontSize: mobile ? 13 : 12, color: "rgba(23,23,15,.35)", margin: 0, fontFamily: "'Inter', system-ui, sans-serif", textAlign: "center", maxWidth: 240, lineHeight: 1.6 }}>
            Coaching updates, team mentions and activity will appear here.
          </p>
        </div>
      ) : (
        <div>
          {notifications.map((n, i) => (
            <NotifRow
              key={n.id} n={n} onClick={handleNotifClick}
              isLast={i === notifications.length - 1} isMobile={mobile}
            />
          ))}
        </div>
      )}
    </div>
  );

  const PanelFooter = ({ mobile }: { mobile: boolean }) => (
    <div style={{
      padding: mobile ? "12px 18px" : "10px 16px",
      paddingBottom: mobile ? "calc(12px + env(safe-area-inset-bottom, 0px))" : "10px",
      borderTop: "1px solid rgba(23,23,15,.07)",
      display: "flex", justifyContent: "center", flexShrink: 0,
    }}>
      <button
        onClick={goToMessages}
        style={{ fontSize: mobile ? 13 : 12, fontWeight: 500, color: "rgba(23,23,15,.42)", background: "none", border: "none", cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif", padding: mobile ? "8px 12px" : "4px 8px", borderRadius: 6, transition: "color .12s", WebkitTapHighlightColor: "transparent" }}
        onMouseEnter={e => (e.currentTarget.style.color = "#22315C")}
        onMouseLeave={e => (e.currentTarget.style.color = "rgba(23,23,15,.42)")}
      >
        View all in Messages →
      </button>
    </div>
  );

  // ── Bell button (always rendered at its natural position) ──────────────────

  const bellButton = (
    <div ref={bellRef} style={{ position: "relative" }}>
      <style>{NOTIF_CSS}</style>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "relative w-8 h-8 rounded-md flex items-center justify-center transition-colors",
          open
            ? "bg-[rgba(23,23,15,0.07)] text-[#17170F]"
            : "text-[rgba(23,23,15,0.45)] hover:text-[rgba(23,23,15,0.85)] hover:bg-[rgba(23,23,15,0.05)]"
        )}
      >
        <Bell style={{ width: 15, height: 15 }} />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 w-[7px] h-[7px] rounded-full"
            style={{ background: "#22315C", boxShadow: "0 0 6px rgba(34,49,92,0.45)" }}
          />
        )}
      </button>

      {/* ── Desktop popover (stays in normal flow) ─────────────────────────── */}
      {open && !isMobile && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Notifications"
          className="notif-drop"
          style={{
            position: "absolute",
            top: "calc(100% + 10px)",
            right: 0,
            width: "min(380px, calc(100vw - 24px))",
            maxHeight: "min(520px, calc(100vh - 80px))",
            background: "#FFFFFF",
            border: "1px solid rgba(23,23,15,.1)",
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "0 1px 2px rgba(23,23,15,.04), 0 24px 64px -24px rgba(23,23,15,.35), 0 0 0 1px rgba(23,23,15,.04)",
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
  );

  // ── Mobile bottom sheet — portalled to document.body ──────────────────────

  const mobileSheet = open && isMobile && typeof document !== "undefined"
    ? createPortal(
        <div
          role="dialog"
          aria-label="Notifications"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            // ↓ Must be above everything including the sticky header (z-30 = 30)
            zIndex: 9999,
            // pointer events only on children
            pointerEvents: "none",
          }}
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
              pointerEvents: "auto",
            }}
          />

          {/* Sheet */}
          <div
            ref={sheetRef}
            className="notif-sheet"
            style={{
              position: "absolute",
              bottom: 0, left: 0, right: 0,
              // Tall enough to be useful, respects safe areas
              height: "min(88vh, 640px)",
              background: "#FFFFFF",
              borderRadius: "22px 22px 0 0",
              border: "1px solid rgba(23,23,15,.1)",
              borderBottom: "none",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              willChange: "transform",
              pointerEvents: "auto",
            }}
          >
            {/* Drag handle */}
            <div style={{ display: "flex", justifyContent: "center", padding: "14px 0 4px", flexShrink: 0, cursor: "grab" }}>
              <div style={{ width: 44, height: 4, borderRadius: 2, background: "rgba(23,23,15,.15)" }} />
            </div>

            <PanelHeader mobile={true} />
            <PanelBody   mobile={true} />
            <PanelFooter mobile={true} />
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      {bellButton}
      {mobileSheet}
    </>
  );
}