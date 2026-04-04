import DashboardLayout from "@/components/DashboardLayout";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Clock, Users, TrendingUp, AlertCircle, CheckCircle,
  Loader2, Pencil, Save, X, BarChart3, Target, Sparkles, MessageSquare,
  Bot, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCallDetail, useUpdateCall } from "@/hooks/useCalls";
import { format } from "date-fns";
import { useState, useEffect, useRef, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

import TranscriptClipSelector from "@/components/coaching/TranscriptClipSelector";
import { useCallClips } from "@/hooks/useCoachingClips";

interface Objection {
  text?: string;
  type?: string;
  handled?: boolean;
  response?: string;
  suggestion?: string;
  confidence?: number;
}

interface TranscriptLine {
  time?: string;
  timestamp?: string;
  speaker: string;
  text: string;
}

const MEETING_TYPE_LABELS: Record<string, string> = {
  discovery: "Discovery Call",
  demo: "Product Demo",
  follow_up: "Follow-up",
  negotiation: "Negotiation",
  other: "Other",
};

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sales-coach-chat`;

function parseTimeToSeconds(time?: string) {
  if (!time) return 0;
  const parts = time.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export default function CallDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { call, summary } = useCallDetail(id);
  const { data: callClips = [] } = useCallClips(id);
  const updateCall = useUpdateCall();

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");

  const callData = call.data;
  const summaryData = summary.data;

  const objections = (summaryData?.objections as Objection[]) || [];
  const rawTranscript = (summaryData?.transcript as TranscriptLine[]) || [];

  const normalizedTranscript = useMemo(() => {
    if (!Array.isArray(rawTranscript)) return [];

    return rawTranscript.map((line, index) => {
      const start = parseTimeToSeconds(line.time || line.timestamp);
      const nextLine = rawTranscript[index + 1];

      const end = nextLine
        ? parseTimeToSeconds(nextLine.time || nextLine.timestamp)
        : start + 5;

      return {
        ...line,
        start,
        end,
      };
    });
  }, [rawTranscript]);

  const recordingUrl =
    callData?.recording_url || callData?.audio_url || null;

  if (call.isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!callData) {
    return (
      <DashboardLayout>
        <div className="text-center py-20">
          <p className="text-muted-foreground">Call not found.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link to="/dashboard/calls">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>

          <div className="flex-1">
            {editing ? (
              <div className="flex gap-2">
                <Input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                />
                <Button onClick={async () => {
                  await updateCall.mutateAsync({ id: callData.id, name: editName });
                  setEditing(false);
                }}>
                  <Save />
                </Button>
                <Button onClick={() => setEditing(false)}>
                  <X />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2 items-center">
                <h1 className="text-xl font-bold">{callData.name}</h1>
                <button onClick={() => {
                  setEditing(true);
                  setEditName(callData.name);
                }}>
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Transcript + Clip Selector */}
        {Array.isArray(normalizedTranscript) && normalizedTranscript.length > 0 && (
          <div className="glass rounded-xl p-5">
            <h2 className="font-display font-semibold mb-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Transcript
            </h2>

            <TranscriptClipSelector
              callId={callData.id}
              callTitle={callData.name}
              transcriptLines={normalizedTranscript}
              recordingUrl={recordingUrl || ""}
              existingClipCount={callClips.length}
              disabled={!recordingUrl}
            />
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}