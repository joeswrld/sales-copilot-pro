import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChangeItem {
  type: "new" | "improved" | "fixed";
  text: string;
}

interface ChangelogEntry {
  id: string;
  version: string;
  title: string;
  summary: string;
  release_date: string;
  badge: string | null;
  changes: ChangeItem[];
  is_published: boolean;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useInView(threshold = 0.08) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } }, { threshold });
    obs.observe(el); return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const { ref, inView } = useInView();
  return (
    <div ref={ref} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? "translateY(0)" : "translateY(24px)",
      transition: `opacity 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms`
    }}>
      {children}
    </div>
  );
}

function Logo({ size = 28 }: { size?: number }) {
  return <img src="/fixsense_icon_logo (2).png" alt="Fixsense" width={size} height={size}
    style={{ width: size, height: size, borderRadius: Math.round(size * 0.24), objectFit: "cover", display: "block", flexShrink: 0 }} />;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ChangelogPage() {
  const [scrolled, setScrolled] = useState(false);
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [nlEmail, setNlEmail] = useState("");
  const [nlDone, setNlDone] = useState(false);
  const [nlLoading, setNlLoading] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // ── Fetch changelog from Supabase ─────────────────────────────────────────
  const fetchEntries = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("changelog_entries" as any)
        .select("*")
        .eq("is_published", true)
        .order("release_date", { ascending: false });

      if (err) throw err;
      const parsed = (data || []).map((row: any) => ({
        ...row,
        changes: Array.isArray(row.changes) ? row.changes : JSON.parse(row.changes || "[]"),
      })) as ChangelogEntry[];
      setEntries(parsed);
      if (parsed.length > 0) setActiveId(parsed[0].id);
    } catch (e: any) {
      setError("Failed to load changelog. Please refresh.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEntries(); }, []);

  // ── Realtime subscription for new entries ─────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("changelog_realtime")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "changelog_entries",
      }, () => {
        fetchEntries(); // re-fetch on any change
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Intersection observer for TOC ────────────────────────────────────────
  useEffect(() => {
    if (entries.length === 0) return;
    const obs = new IntersectionObserver(
      entries_ev => {
        entries_ev.forEach(e => { if (e.isIntersecting) setActiveId(e.target.id); });
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    entries.forEach(({ id }) => {
      const el = document.getElementById(`cl-${id}`);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [entries]);

  const handleNl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlEmail.trim()) return;
    setNlLoading(true);
    await new Promise(r => setTimeout(r, 900));
    setNlDone(true);
    setNlLoading(false);
  };

  const TAG_COLORS: Record<string, { color: string; bg: string; border: string }> = {
    new:      { color: "#22c55e", bg: "rgba(34,197,94,.1)",    border: "rgba(34,197,94,.2)" },
    improved: { color: "#0ef5d4", bg: "rgba(14,245,212,.08)",  border: "rgba(14,245,212,.2)" },
    fixed:    { color: "#f59e0b", bg: "rgba(245,158,11,.08)",  border: "rgba(245,158,11,.2)" },
  };

  const NAV = [
    { label: "Features", href: "/#features" },
    { label: "How It Works", href: "/#how" },
    { label: "Pricing", href: "/pricing" },
    { label: "Changelog", href: "/changelog" },
  ];

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600;700&family=Syne+Mono&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
    .cl{
      --bg:#050810;--bg2:#0a0d18;--bg3:#0f1220;
      --ink:#f0f2f8;--ink2:rgba(240,242,248,0.65);--mu:rgba(240,242,248,0.38);--mu2:rgba(240,242,248,0.18);
      --br:rgba(255,255,255,.07);--br2:rgba(255,255,255,.04);
      --cyan:#0ef5d4;--cyan2:rgba(14,245,212,0.12);--cyan3:rgba(14,245,212,0.06);
      --fd:'Syne',system-ui,sans-serif;--fb:'DM Sans',system-ui,sans-serif;--fm:'Syne Mono',monospace;
      background:var(--bg);color:var(--ink);font-family:var(--fb);-webkit-font-smoothing:antialiased;overflow-x:hidden;line-height:1.6;min-height:100vh;
    }
    /* NAV */
    .nav{position:fixed;top:0;left:0;right:0;z-index:100;height:60px;display:flex;align-items:center;padding:0 24px;transition:all .3s;}
    .nav.sc{background:rgba(5,8,16,0.95);backdrop-filter:blur(20px);border-bottom:1px solid var(--br);}
    .nav-i{max-width:1140px;width:100%;margin:0 auto;display:flex;align-items:center;justify-content:space-between;}
    .nav-logo{display:flex;align-items:center;gap:9px;text-decoration:none;}
    .nav-name{font-family:var(--fd);font-size:16px;font-weight:700;color:var(--ink);letter-spacing:-.03em;}
    .nav-links{display:flex;align-items:center;gap:28px;}
    .nav-link{font-size:13.5px;font-weight:500;color:var(--mu);text-decoration:none;transition:color .2s;}
    .nav-link:hover,.nav-link.act{color:var(--ink);}
    .nav-link.act{color:var(--cyan);}
    .btn-cta{font-size:13px;font-weight:600;color:var(--bg);background:var(--cyan);border:none;padding:8px 20px;border-radius:8px;font-family:var(--fb);cursor:pointer;text-decoration:none;transition:all .15s;}
    .btn-cta:hover{opacity:.88;transform:translateY(-1px);}
    .btn-ghost{font-size:13px;font-weight:500;color:var(--mu);background:none;border:none;padding:8px 14px;border-radius:8px;font-family:var(--fb);cursor:pointer;text-decoration:none;transition:color .15s;}
    .btn-ghost:hover{color:var(--ink);}
    @media(max-width:768px){.nav-links{display:none;}}

    /* HERO */
    .hero{padding:130px 24px 80px;text-align:center;position:relative;overflow:hidden;}
    .hero-orb{position:absolute;top:-100px;left:50%;transform:translateX(-50%);width:700px;height:500px;background:radial-gradient(ellipse,rgba(14,245,212,0.05) 0%,transparent 65%);pointer-events:none;}
    .hero-pill{display:inline-flex;align-items:center;gap:8px;background:rgba(14,245,212,.08);border:1px solid rgba(14,245,212,.2);border-radius:100px;padding:6px 16px 6px 6px;font-size:12px;font-weight:600;color:var(--cyan);margin-bottom:24px;}
    .hero-dot{width:7px;height:7px;border-radius:50%;background:var(--cyan);box-shadow:0 0 8px var(--cyan);animation:pulse 2.2s ease-in-out infinite;}
    @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.85)}}
    .hero-h{font-family:var(--fd);font-size:clamp(34px,6vw,68px);font-weight:800;line-height:1.05;letter-spacing:-.05em;color:var(--ink);max-width:760px;margin:0 auto 18px;}
    .hero-h .c{color:var(--cyan);}
    .hero-sub{font-size:clamp(15px,2vw,18px);color:var(--ink2);line-height:1.7;max-width:520px;margin:0 auto 24px;}
    .hero-meta{display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap;}
    .hero-meta-pill{display:inline-flex;align-items:center;gap:7px;background:rgba(255,255,255,.03);border:1px solid var(--br);border-radius:20px;padding:5px 14px;font-size:12px;color:var(--mu);}
    .meta-dot{width:5px;height:5px;border-radius:50%;background:var(--cyan);}

    /* SUBSCRIBE BAND */
    .sub-band{background:var(--bg2);border-top:1px solid var(--br);border-bottom:1px solid var(--br);padding:32px 24px;}
    .sub-band-i{max-width:800px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap;}
    .sub-text h3{font-family:var(--fd);font-size:16px;font-weight:700;color:var(--ink);margin:0 0 4px;}
    .sub-text p{font-size:13px;color:var(--mu);margin:0;}
    .sub-form{display:flex;gap:8px;flex-wrap:wrap;}
    .sub-input{background:rgba(255,255,255,.05);border:1px solid var(--br);border-radius:10px;padding:10px 14px;font-size:13px;font-family:var(--fb);color:var(--ink);outline:none;min-width:220px;transition:border-color .15s;}
    .sub-input:focus{border-color:rgba(14,245,212,.4);}
    .sub-input::placeholder{color:var(--mu);}
    .sub-btn{background:var(--cyan);color:var(--bg);border:none;border-radius:9px;padding:10px 18px;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--fb);white-space:nowrap;transition:all .15s;}
    .sub-btn:hover{opacity:.88;}
    .sub-btn:disabled{opacity:.5;cursor:not-allowed;}
    .sub-ok{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--cyan);background:var(--cyan2);border:1px solid rgba(14,245,212,.2);border-radius:9px;padding:10px 18px;}

    /* LAYOUT */
    .layout{max-width:1100px;margin:0 auto;padding:72px 24px 96px;display:grid;grid-template-columns:220px 1fr;gap:56px;align-items:start;}
    @media(max-width:900px){.layout{grid-template-columns:1fr;gap:24px;padding:40px 20px 80px;} .toc{display:none;}}

    /* TOC */
    .toc{position:sticky;top:80px;background:var(--bg2);border:1px solid var(--br);border-radius:14px;padding:18px 14px;}
    .toc-title{font-size:9.5px;font-weight:700;color:var(--mu);text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;font-family:var(--fm);}
    .toc-link{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:7px;border-left:2px solid transparent;font-size:12.5px;font-weight:500;color:var(--mu);text-decoration:none;transition:all .15s;margin-bottom:2px;}
    .toc-link:hover{color:var(--ink);background:rgba(255,255,255,.03);}
    .toc-link.act{color:var(--cyan);background:var(--cyan3);border-left-color:var(--cyan);}
    .toc-badge{font-size:9px;font-weight:700;color:var(--cyan);background:var(--cyan2);border-radius:4px;padding:1px 6px;font-family:var(--fm);}

    /* CONTENT */
    .content{min-width:0;}
    .entry{padding-bottom:56px;border-bottom:1px solid var(--br);margin-bottom:56px;scroll-margin-top:80px;}
    .entry:last-child{border-bottom:none;margin-bottom:0;}
    .entry-top{display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap;}
    .entry-version{font-family:var(--fm);font-size:13px;font-weight:700;color:var(--ink);}
    .entry-date{font-size:12px;color:var(--mu);}
    .entry-badge{font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;border-radius:5px;padding:3px 9px;}
    .badge-latest{background:var(--cyan);color:var(--bg);}
    .badge-hotfix{background:rgba(248,113,113,.15);color:#f87171;border:1px solid rgba(248,113,113,.2);}
    .badge-default{background:rgba(255,255,255,.06);color:var(--mu);}
    .entry-title{font-family:var(--fd);font-size:24px;font-weight:800;color:var(--ink);letter-spacing:-.04em;margin-bottom:10px;}
    .entry-summary{font-size:14.5px;color:var(--ink2);line-height:1.75;margin-bottom:24px;}
    .changes{display:flex;flex-direction:column;gap:10px;}
    .change{display:flex;align-items:flex-start;gap:10px;}
    .change-tag{display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;flex-shrink:0;margin-top:1px;font-family:var(--fm);white-space:nowrap;border:1px solid;}
    .change-text{font-size:14px;color:var(--ink2);line-height:1.6;}

    /* LOADING / ERROR */
    .loading-state{display:flex;align-items:center;justify-content:center;padding:80px 24px;flex-direction:column;gap:16px;}
    .spinner{width:28px;height:28px;border:2px solid var(--br);border-top-color:var(--cyan);border-radius:50%;animation:spin 1s linear infinite;}
    @keyframes spin{to{transform:rotate(360deg);}}
    .error-state{text-align:center;padding:60px 24px;color:var(--mu);}
    .empty-state{text-align:center;padding:80px 24px;}

    /* FOOTER */
    .footer{background:var(--bg2);padding:56px 24px 28px;border-top:1px solid var(--br);}
    .footer-i{max-width:1100px;margin:0 auto;}
    .footer-top{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:48px;margin-bottom:44px;padding-bottom:40px;border-bottom:1px solid var(--br2);}
    .footer-brand-logo{display:flex;align-items:center;gap:9px;margin-bottom:12px;}
    .footer-brand-name{font-family:var(--fd);font-size:15px;font-weight:700;color:var(--ink);letter-spacing:-.02em;}
    .footer-brand-desc{font-size:13px;color:var(--mu);line-height:1.65;max-width:230px;}
    .footer-col-title{font-size:10.5px;font-weight:700;color:var(--mu);text-transform:uppercase;letter-spacing:.1em;margin-bottom:14px;}
    .footer-link{display:block;font-size:13px;color:var(--mu);text-decoration:none;margin-bottom:9px;transition:color .2s;}
    .footer-link:hover{color:var(--ink);}
    .footer-bottom{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;}
    .footer-legal{font-size:12px;color:var(--mu2);}
    .footer-legal-links{display:flex;gap:18px;}
    .footer-ll{font-size:12px;color:var(--mu2);text-decoration:none;transition:color .2s;}
    .footer-ll:hover{color:var(--mu);}
    @media(max-width:1024px){.footer-top{grid-template-columns:1fr 1fr;}}
    @media(max-width:640px){.footer-top{grid-template-columns:1fr;}.footer-bottom{flex-direction:column;align-items:flex-start;}}
  `;

  const badgeClass = (badge: string | null) => {
    if (!badge) return "";
    if (badge.toLowerCase() === "latest") return "badge-latest";
    if (badge.toLowerCase() === "hotfix") return "badge-hotfix";
    return "badge-default";
  };

  return (
    <div className="cl">
      <style>{css}</style>

      {/* NAV */}
      <nav className={`nav ${scrolled ? "sc" : ""}`}>
        <div className="nav-i">
          <Link to="/" className="nav-logo">
            <Logo size={26} />
            <span className="nav-name">Fixsense</span>
          </Link>
          <div className="nav-links">
            {NAV.map(l => (
              <a key={l.label} href={l.href} className={`nav-link ${l.href === "/changelog" ? "act" : ""}`}>{l.label}</a>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Link to="/login" className="btn-ghost">Sign in</Link>
            <Link to="/login" className="btn-cta">Start Free →</Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-orb" />
        <FadeIn delay={40}>
          <div className="hero-pill">
            <div className="hero-dot" />
            What's New
          </div>
        </FadeIn>
        <FadeIn delay={80}>
          <h1 className="hero-h">
            Every update.<br /><span className="c">In one place.</span>
          </h1>
        </FadeIn>
        <FadeIn delay={130}>
          <p className="hero-sub">
            We ship fast and tell you about every change, fix, and feature — in real time, from the platform itself.
          </p>
        </FadeIn>
        <FadeIn delay={160}>
          <div className="hero-meta">
            {entries.length > 0 && (
              <div className="hero-meta-pill">
                <div className="meta-dot" />
                {entries[0].version} is live
              </div>
            )}
            {entries.length > 0 && (
              <div className="hero-meta-pill">
                Updated {fmtDate(entries[0].release_date)}
              </div>
            )}
            <div className="hero-meta-pill">
              {entries.length} releases tracked
            </div>
          </div>
        </FadeIn>
      </section>

      {/* SUBSCRIBE BAND */}
      <div className="sub-band">
        <div className="sub-band-i">
          <div className="sub-text">
            <h3>Stay up to date</h3>
            <p>Get an email whenever we ship something new.</p>
          </div>
          {nlDone ? (
            <span className="sub-ok">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="6" fill="rgba(14,245,212,.2)"/>
                <path d="M4 7l2 2 4-4" stroke="#0ef5d4" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Subscribed!
            </span>
          ) : (
            <form className="sub-form" onSubmit={handleNl}>
              <input
                className="sub-input"
                type="email"
                placeholder="your@email.com"
                value={nlEmail}
                onChange={e => setNlEmail(e.target.value)}
                required
              />
              <button className="sub-btn" type="submit" disabled={nlLoading}>
                {nlLoading ? "Subscribing…" : "Subscribe"}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* MAIN LAYOUT */}
      {loading ? (
        <div className="loading-state">
          <div className="spinner" />
          <p style={{ fontSize: 14, color: "var(--mu)" }}>Loading changelog…</p>
        </div>
      ) : error ? (
        <div className="error-state">
          <p style={{ fontSize: 14, color: "#f87171", marginBottom: 12 }}>{error}</p>
          <button onClick={fetchEntries} style={{ background: "var(--cyan)", color: "var(--bg)", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--fb)" }}>
            Retry
          </button>
        </div>
      ) : entries.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: 14, color: "var(--mu)" }}>No changelog entries yet. Check back soon.</p>
        </div>
      ) : (
        <div className="layout">
          {/* TOC */}
          <aside className="toc">
            <div className="toc-title">Versions</div>
            {entries.map(entry => (
              <a
                key={entry.id}
                href={`#cl-${entry.id}`}
                className={`toc-link ${activeId === entry.id ? "act" : ""}`}
              >
                <span style={{ flex: 1 }}>{entry.version}</span>
                {entry.badge && <span className="toc-badge">{entry.badge}</span>}
              </a>
            ))}
          </aside>

          {/* ENTRIES */}
          <div className="content">
            {entries.map((entry, idx) => (
              <FadeIn key={entry.id} delay={idx * 50}>
                <div className="entry" id={`cl-${entry.id}`}>
                  {/* Header */}
                  <div className="entry-top">
                    <span className="entry-version">{entry.version}</span>
                    {entry.badge && (
                      <span className={`entry-badge ${badgeClass(entry.badge)}`}>{entry.badge}</span>
                    )}
                    <span className="entry-date">{fmtDate(entry.release_date)}</span>
                  </div>

                  <h2 className="entry-title">{entry.title}</h2>
                  <p className="entry-summary">{entry.summary}</p>

                  {/* Changes */}
                  <div className="changes">
                    {entry.changes.map((change, i) => {
                      const tc = TAG_COLORS[change.type] || TAG_COLORS.new;
                      return (
                        <div key={i} className="change">
                          <span
                            className="change-tag"
                            style={{ color: tc.color, background: tc.bg, borderColor: tc.border }}
                          >
                            {change.type}
                          </span>
                          <div className="change-text">{change.text}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-i">
          <div className="footer-top">
            <div>
              <div className="footer-brand-logo"><Logo size={22} /><span className="footer-brand-name">Fixsense</span></div>
              <p className="footer-brand-desc">AI-powered sales call intelligence for modern revenue teams.</p>
            </div>
            <div>
              <div className="footer-col-title">Product</div>
              {[["/#features","Features"],["/#pricing","Pricing"],["/integrations","Integrations"],["/changelog","Changelog"]].map(([h,l])=>(
                <a key={h} href={h} className="footer-link">{l}</a>
              ))}
            </div>
            <div>
              <div className="footer-col-title">Company</div>
              {[["/about","About"],["/blog","Blog"],["/careers","Careers"],["/testimonials","Stories"]].map(([h,l])=>(
                <Link key={h} to={h} className="footer-link">{l}</Link>
              ))}
            </div>
            <div>
              <div className="footer-col-title">Legal</div>
              {[["/privacy","Privacy Policy"],["/terms","Terms of Service"],["/security","Security"],["/contact","Contact"]].map(([h,l])=>(
                <Link key={h} to={h} className="footer-link">{l}</Link>
              ))}
            </div>
          </div>
          <div className="footer-bottom">
            <span className="footer-legal">© {new Date().getFullYear()} Fixsense, Inc. All rights reserved.</span>
            <div className="footer-legal-links">
              <Link to="/privacy" className="footer-ll">Privacy</Link>
              <Link to="/terms" className="footer-ll">Terms</Link>
              <Link to="/security" className="footer-ll">Security</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}