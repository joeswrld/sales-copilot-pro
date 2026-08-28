/**
 * MentionTextarea — textarea with @ autocomplete for team members.
 * Returns the raw text via onChange, and a list of mentioned user IDs via onMentionsChange.
 */
import { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from "react";

export interface MentionMember {
  user_id: string;
  full_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onMentionsChange?: (userIds: string[]) => void;
  onSubmit?: () => void;
  onTyping?: () => void;
  members: MentionMember[];
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export interface MentionTextareaHandle {
  focus: () => void;
}

const MentionTextarea = forwardRef<MentionTextareaHandle, Props>(function MentionTextarea(
  { value, onChange, onMentionsChange, onSubmit, onTyping, members: membersProp, placeholder, disabled, style }, ref
) {
  const members = membersProp ?? [];
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [tokenStart, setTokenStart] = useState<number | null>(null);

  useImperativeHandle(ref, () => ({ focus: () => taRef.current?.focus() }));

  // Detect @-token at cursor
  const checkToken = () => {
    const ta = taRef.current;
    if (!ta) return;
    const pos = ta.selectionStart ?? 0;
    const before = value.slice(0, pos);
    const m = before.match(/(?:^|\s)@([A-Za-z0-9._-]{0,40})$/);
    if (m) {
      setOpen(true);
      setQuery(m[1].toLowerCase());
      setTokenStart(pos - m[1].length - 1);
      setHighlight(0);
    } else {
      setOpen(false);
      setQuery("");
      setTokenStart(null);
    }
  };

  useEffect(() => { checkToken(); /* eslint-disable-next-line */ }, [value]);

  const matches = useMemo(() => {
    if (!open) return [];
    return members
      .filter(m => {
        const n = (m.full_name || m.email || "").toLowerCase();
        return !query || n.includes(query);
      })
      .slice(0, 6);
  }, [members, open, query]);

  // Recompute mentions on value change
  useEffect(() => {
    if (!onMentionsChange) return;
    const ids = new Set<string>();
    const lc = value.toLowerCase();
    members.forEach(m => {
      const handles = [
        m.full_name && m.full_name.split(" ")[0].toLowerCase(),
        m.full_name && m.full_name.toLowerCase(),
        m.email && m.email.split("@")[0].toLowerCase(),
      ].filter(Boolean) as string[];
      if (handles.some(h => new RegExp(`(?:^|\\s)@${escapeRe(h)}(?=\\s|$|[.,;!?])`).test(lc))) {
        ids.add(m.user_id);
      }
    });
    onMentionsChange(Array.from(ids));
  }, [value, members, onMentionsChange]);

  const insert = (m: MentionMember) => {
    if (tokenStart == null || !taRef.current) return;
    const handle = (m.full_name?.split(" ")[0] || m.email?.split("@")[0] || "user").replace(/\s/g, "");
    const pos = taRef.current.selectionStart ?? value.length;
    const next = value.slice(0, tokenStart) + "@" + handle + " " + value.slice(pos);
    onChange(next);
    setOpen(false);
    setTimeout(() => {
      const newPos = tokenStart + handle.length + 2;
      taRef.current?.setSelectionRange(newPos, newPos);
      taRef.current?.focus();
    }, 0);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && matches.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setHighlight(h => (h + 1) % matches.length); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setHighlight(h => (h - 1 + matches.length) % matches.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insert(matches[highlight]); return; }
      if (e.key === "Escape")    { e.preventDefault(); setOpen(false); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit?.(); }
  };

  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <textarea
        ref={taRef}
        value={value}
        disabled={disabled}
        onChange={e => { onChange(e.target.value); onTyping?.(); }}
        onKeyDown={handleKey}
        onClick={checkToken}
        onKeyUp={checkToken}
        placeholder={placeholder}
        rows={1}
        style={{
          width: "100%", background: "transparent", border: "none", outline: "none",
          resize: "none", fontSize: 14, color: "#17170F",
          fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", lineHeight: 1.5, maxHeight: 100, overflowY: "auto",
          ...style,
        }}
      />
      {open && matches.length > 0 && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: 0,
          background: "#FFFFFF", border: "1px solid rgba(23,23,15,.12)",
          borderRadius: 10, padding: 4, minWidth: 220, maxWidth: 300,
          boxShadow: "0 8px 24px -6px rgba(20,20,15,.18), 0 0 0 1px rgba(20,20,15,.03)", zIndex: 200,
        }}>
          <div style={{ fontSize: 10, color: "rgba(23,23,15,.35)", padding: "4px 8px", fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" }}>
            Mention a teammate
          </div>
          {matches.map((m, i) => {
            const label = m.full_name || m.email?.split("@")[0] || "Unknown";
            return (
              <button key={m.user_id} onMouseDown={e => { e.preventDefault(); insert(m); }}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "7px 8px", border: "none", borderRadius: 7, cursor: "pointer",
                  background: i === highlight ? "rgba(34,49,92,.08)" : "transparent",
                  color: "#17170F", textAlign: "left",
                }}>
                {m.avatar_url ? (
                  <img src={m.avatar_url} alt="" style={{ width: 22, height: 22, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                    background: "rgba(167,139,250,.16)", color: "#7c5ce0",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700,
                  }}>{(label[0] || "?").toUpperCase()}</div>
                )}
                <span style={{ fontSize: 12.5, fontWeight: 500, flex: 1 }}>{label}</span>
                {m.email && <span style={{ fontSize: 10.5, color: "rgba(23,23,15,.35)" }}>@{m.email.split("@")[0]}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default MentionTextarea;

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/** Render text with @mentions highlighted. */
export function renderWithMentions(text: string, color = "#22315C") {
  const parts = text.split(/(@[A-Za-z0-9._-]+)/g);
  return parts.map((p, i) =>
    p.startsWith("@")
      ? <span key={i} style={{ color, fontWeight: 600 }}>{p}</span>
      : <span key={i}>{p}</span>
  );
}