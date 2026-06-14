/**
 * GuestJoin.tsx — v2
 *
 * Route: /join/:roomName
 * Public — NO Fixsense auth required. Prospects can join without an account.
 *
 * Fixes from v1:
 *  - Room lookup now goes through `get-guest-room-info` edge function instead
 *    of querying `calls` directly (which was blocked by RLS for anon users).
 *  - Better loading/error states with retry button.
 *  - Daily.co prebuilt iframe with correct allow attributes.
 *  - "Open in new tab" fallback for browsers that block camera in iframes.
 */

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  Loader2, Shield, Users, Video, ExternalLink,
  AlertCircle, RefreshCw, CheckCircle2,
} from "lucide-react";

// ─── Supabase URL for the edge function call ──────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// ─── Room info type ────────────────────────────────────────────────────────────
interface RoomInfo {
  found: boolean;
  room_url: string;
  room_name: string;
  call_name: string;
  status: string;
}

// ─── Fetch room info via public edge function (no auth needed) ─────────────────
async function fetchRoomInfo(roomName: string): Promise<RoomInfo> {
  const fnUrl = `${SUPABASE_URL}/functions/v1/get-guest-room-info?room=${encodeURIComponent(roomName)}`;
  const res = await fetch(fnUrl, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    // If edge function fails, construct URL directly — Daily rooms are public
    return {
      found: false,
      room_url: `https://fixsense.daily.co/${roomName}`,
      room_name: roomName,
      call_name: 'Fixsense Meeting',
      status: 'unknown',
    };
  }

  return res.json();
}

// ─── Status types ──────────────────────────────────────────────────────────────
type PageStatus = 'loading' | 'name_entry' | 'joining' | 'in_meeting' | 'error';

// ─── Component ─────────────────────────────────────────────────────────────────
export default function GuestJoin() {
  const { roomName } = useParams<{ roomName: string }>();
  const [searchParams] = useSearchParams();

  const [status, setStatus] = useState<PageStatus>('loading');
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [iframeSrc, setIframeSrc] = useState('');
  const [loadAttempts, setLoadAttempts] = useState(0);

  // Pre-fill name from URL param
  useEffect(() => {
    const n = searchParams.get('name');
    if (n) setNameInput(decodeURIComponent(n));
  }, [searchParams]);

  // Load room info
  const loadRoom = useCallback(async () => {
    if (!roomName) {
      setErrorMsg('No room name in URL. Please ask the host for a new link.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    try {
      const info = await fetchRoomInfo(roomName);
      setRoomInfo(info);
      setStatus('name_entry');
    } catch (e: any) {
      setErrorMsg(e?.message || 'Could not load meeting. Please try again.');
      setStatus('error');
    }
  }, [roomName]);

  useEffect(() => { loadRoom(); }, [loadRoom]);

  // Join: build iframe URL and show it
  const handleJoin = useCallback(() => {
    if (!roomInfo) return;
    const name = nameInput.trim() || 'Guest';
    setDisplayName(name);

    // Daily.co prebuilt URL with display name
    const url = new URL(roomInfo.room_url);
    url.searchParams.set('userName', name);
    // Daily prebuilt UI params for better UX
    url.searchParams.set('skipMediaPermissionPrompt', 'false');

    setIframeSrc(url.toString());
    setStatus('in_meeting');
  }, [roomInfo, nameInput]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleJoin();
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c13' }}>
        <div className="text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
            style={{
              background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.1))',
              border: '1px solid rgba(99,102,241,0.25)',
            }}>
            <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
          </div>
          <p className="text-sm text-white/40">Loading meeting…</p>
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0a0c13' }}>
        <div className="text-center space-y-5 max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7 text-red-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white mb-1">Couldn't load meeting</h1>
            <p className="text-sm text-white/40">{errorMsg}</p>
          </div>
          <button
            onClick={() => { setLoadAttempts(a => a + 1); loadRoom(); }}
            className="flex items-center gap-2 mx-auto px-4 py-2.5 rounded-xl text-sm font-medium text-white/80 transition-colors"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <RefreshCw className="w-4 h-4" /> Try Again
          </button>
          <p className="text-xs text-white/20">
            If the problem persists, ask the host to resend the meeting link.
          </p>
        </div>
      </div>
    );
  }

  // ── In Meeting (iframe) ────────────────────────────────────────────────────
  if (status === 'in_meeting') {
    const directUrl = `${roomInfo?.room_url}?userName=${encodeURIComponent(displayName)}`;

    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#0a0c13' }}>
        {/* Minimal top bar */}
        <div
          className="flex items-center justify-between px-4 py-2.5 shrink-0"
          style={{
            background: 'rgba(13,15,24,0.98)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: '#22c55e', boxShadow: '0 0 6px rgba(34,197,94,0.8)' }}
            />
            <span className="text-sm font-semibold text-white">
              {roomInfo?.call_name || 'Fixsense Meeting'}
            </span>
            {displayName && (
              <span className="text-xs text-white/30">· {displayName}</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] text-white/20 flex items-center gap-1">
              <Shield className="w-3 h-3" /> End-to-end encrypted
            </span>
            <a
              href={directUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors px-2.5 py-1.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in new tab
            </a>
          </div>
        </div>

        {/* Daily.co iframe */}
        <iframe
          src={iframeSrc}
          allow="camera; microphone; display-capture; autoplay; clipboard-write; fullscreen; speaker-selection"
          allowFullScreen
          className="flex-1 w-full border-0"
          title="Fixsense Meeting"
          style={{ minHeight: 'calc(100vh - 44px)' }}
        />
      </div>
    );
  }

  // ── Name Entry (pre-join lobby) ────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0a0c13' }}>
      <div className="w-full max-w-sm space-y-6">

        {/* Brand / meeting info */}
        <div className="text-center space-y-3">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
            style={{
              background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.15))',
              border: '1px solid rgba(99,102,241,0.3)',
            }}
          >
            <Users className="w-8 h-8 text-indigo-400" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Join Meeting</h1>
            {roomInfo?.call_name && roomInfo.call_name !== 'Fixsense Meeting' && (
              <p className="text-sm font-medium text-indigo-300/80">{roomInfo.call_name}</p>
            )}
            <p className="text-sm text-white/35 mt-1">
              Enter your name to join this Fixsense meeting
            </p>
          </div>

          {/* Room status pill */}
          {roomInfo?.status === 'live' && (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
              style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#4ade80' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Meeting is live
            </div>
          )}
        </div>

        {/* Name input */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-white/50 block">
            Your display name
          </label>
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. John Smith"
            maxLength={60}
            autoFocus
            className="w-full h-12 rounded-xl px-4 text-sm text-white placeholder:text-white/20 focus:outline-none transition-all"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
            onFocus={(e) => {
              e.target.style.border = '1px solid rgba(99,102,241,0.5)';
              e.target.style.background = 'rgba(99,102,241,0.05)';
            }}
            onBlur={(e) => {
              e.target.style.border = '1px solid rgba(255,255,255,0.1)';
              e.target.style.background = 'rgba(255,255,255,0.04)';
            }}
          />
        </div>

        {/* Join button */}
        <button
          onClick={handleJoin}
          className="w-full h-12 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98]"
          style={{
            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
            boxShadow: '0 4px 20px rgba(99,102,241,0.35)',
          }}
        >
          Join Meeting
        </button>

        {/* Direct Daily.co fallback */}
        {roomInfo?.room_url && (
          <div className="text-center">
            <a
              href={`${roomInfo.room_url}?userName=${encodeURIComponent(nameInput.trim() || 'Guest')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-white/25 hover:text-white/50 transition-colors underline underline-offset-2"
            >
              Open directly in Daily.co instead →
            </a>
          </div>
        )}

        {/* Trust signals */}
        <div className="flex items-center justify-center gap-4 pt-1">
          <span className="text-[11px] text-white/20 flex items-center gap-1">
            <Shield className="w-3 h-3" /> No account needed
          </span>
          <span className="text-white/10">·</span>
          <span className="text-[11px] text-white/20 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Free to join
          </span>
        </div>
      </div>
    </div>
  );
}