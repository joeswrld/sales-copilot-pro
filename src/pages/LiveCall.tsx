import DashboardLayout from "@/components/DashboardLayout";
import SubscriptionGate from "@/components/SubscriptionGate";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, Link2, CalendarPlus, Video, Loader2, Clock, Trash2, ExternalLink, AlertTriangle, Users, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useLiveCall } from "@/hooks/useLiveCall";
import { useScheduledCalls } from "@/hooks/useScheduledCalls";
import { useIntegrations } from "@/hooks/useSettings";
import { toast } from "sonner";
import { format } from "date-fns";

function detectProvider(url: string): string | null {
  if (/zoom\.(us|com)/i.test(url)) return "zoom";
  if (/meet\.google\.com/i.test(url)) return "google_meet";
  return null;
}

const MEETING_TYPES = [
  { value: "discovery", label: "Discovery Call" },
  { value: "demo", label: "Product Demo" },
  { value: "follow_up", label: "Follow-up" },
  { value: "negotiation", label: "Negotiation" },
  { value: "other", label: "Other" },
];

export default function LiveCall() {
  const navigate = useNavigate();
  const { liveCall, isLive, isLoading, startCall } = useLiveCall();
  const { scheduledCalls, isLoading: schedLoading, scheduleMeeting, cancelScheduled } = useScheduledCalls();
  const { integrations } = useIntegrations();

  // Create Meeting state
  const [createOpen, setCreateOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingType, setMeetingType] = useState("discovery");
  const [participants, setParticipants] = useState("");
  const [platform, setPlatform] = useState("google_meet");

  // Join Meeting state
  const [joinUrl, setJoinUrl] = useState("");

  // Schedule state
  const [schedOpen, setSchedOpen] = useState(false);
  const [schedTitle, setSchedTitle] = useState("");
  const [schedProvider, setSchedProvider] = useState("google_meet");
  const [schedUrl, setSchedUrl] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [schedType, setSchedType] = useState("discovery");
  const [schedParticipants, setSchedParticipants] = useState("");

  const isProviderConnected = (provider: string) =>
    integrations.some((i) => i.provider === provider && i.status === "connected");

  // If a live call exists, redirect to the meeting page
  if (isLive && liveCall?.id) {
    navigate(`/dashboard/live/${liveCall.id}`);
  }

  const handleCreateMeeting = async () => {
    if (!meetingTitle.trim()) {
      toast.error("Please enter a meeting title");
      return;
    }
    if (!isProviderConnected(platform)) {
      toast.error(`Please connect ${platform === "zoom" ? "Zoom" : "Google Meet"} in Settings first`);
      return;
    }
    try {
      const participantList = participants
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);

      const call = await startCall.mutateAsync({
        platform: platform === "zoom" ? "Zoom" : "Google Meet",
        meeting_id: crypto.randomUUID(),
        name: meetingTitle,
        meeting_type: meetingType,
        participants: participantList,
      });
      setCreateOpen(false);
      navigate(`/dashboard/live/${call.id}`);
    } catch (err: any) {
      if (err?.message === "PLAN_LIMIT_REACHED") {
        toast.error("You've reached your plan limit. Upgrade to Pro for unlimited calls.");
      } else {
        toast.error("Failed to create meeting");
      }
    }
  };

  const handleJoinMeeting = async () => {
    if (!joinUrl.trim()) {
      toast.error("Please paste a meeting URL");
      return;
    }
    const detected = detectProvider(joinUrl);
    if (!detected) {
      toast.error("Unsupported meeting URL. Use a Zoom or Google Meet link.");
      return;
    }
    if (!isProviderConnected(detected)) {
      toast.error(`Please connect ${detected === "zoom" ? "Zoom" : "Google Meet"} in Settings first`);
      return;
    }
    try {
      const call = await startCall.mutateAsync({
        platform: detected === "zoom" ? "Zoom" : "Google Meet",
        meeting_id: joinUrl,
      });
      navigate(`/dashboard/live/${call.id}`);
    } catch (err: any) {
      if (err?.message === "PLAN_LIMIT_REACHED") {
        toast.error("You've reached your plan limit. Upgrade to Pro.");
      } else {
        toast.error("Failed to join meeting");
      }
    }
  };

  const handleSchedule = async () => {
    if (!schedTitle.trim() || !schedTime) {
      toast.error("Please fill in all fields");
      return;
    }
    await scheduleMeeting.mutateAsync({
      title: schedTitle,
      meeting_provider: schedProvider,
      meeting_url: schedUrl || undefined,
      scheduled_time: new Date(schedTime).toISOString(),
    });
    setSchedOpen(false);
    setSchedTitle("");
    setSchedUrl("");
    setSchedTime("");
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const zoomConnected = isProviderConnected("zoom");
  const meetConnected = isProviderConnected("google_meet");
  const anyMeetingConnected = zoomConnected || meetConnected;

  return (
    <DashboardLayout>
      <SubscriptionGate message="Live call analysis requires an active Fixsense subscription.">
        <div className="space-y-8 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold font-display">Live Call</h1>
          <p className="text-sm text-muted-foreground">Start, join, or schedule sales meetings with real-time AI analysis</p>
        </div>

        {/* Integration status banner */}
        {!anyMeetingConnected && (
          <div className="glass rounded-xl p-4 border border-destructive/20 bg-destructive/5 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">No meeting integrations connected</p>
              <p className="text-xs text-muted-foreground mt-1">
                Connect Zoom or Google Meet in{" "}
                <button onClick={() => navigate("/dashboard/settings")} className="text-primary underline">
                  Settings
                </button>{" "}
                to start using live calls.
              </p>
            </div>
          </div>
        )}

        {/* Action cards */}
        <div className="grid md:grid-cols-3 gap-4">
          {/* Create Meeting */}
          <div className="glass rounded-xl p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Video className="w-5 h-5 text-primary" />
              </div>
              <h2 className="font-display font-semibold">Create Meeting</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4 flex-1">Create a new meeting with title, participants, and type for AI-powered analysis.</p>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2" disabled={!anyMeetingConnected}>
                  <Mic className="w-4 h-4" />
                  Create Meeting
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Create Meeting</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label>Meeting Title</Label>
                    <Input
                      value={meetingTitle}
                      onChange={(e) => setMeetingTitle(e.target.value)}
                      placeholder="Q4 Discovery Call with Acme Corp"
                    />
                  </div>
                  <div>
                    <Label>Meeting Type</Label>
                    <Select value={meetingType} onValueChange={setMeetingType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEETING_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Participants (comma-separated emails)</Label>
                    <Input
                      value={participants}
                      onChange={(e) => setParticipants(e.target.value)}
                      placeholder="jane@acme.com, john@acme.com"
                    />
                  </div>
                  <div>
                    <Label>Platform</Label>
                    <Select value={platform} onValueChange={setPlatform}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="google_meet" disabled={!meetConnected}>
                          Google Meet {!meetConnected && "(not connected)"}
                        </SelectItem>
                        <SelectItem value="zoom" disabled={!zoomConnected}>
                          Zoom {!zoomConnected && "(not connected)"}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleCreateMeeting}
                    disabled={startCall.isPending}
                    className="w-full gap-2"
                  >
                    {startCall.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    <Video className="w-4 h-4" />
                    Start Meeting
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Join Meeting */}
          <div className="glass rounded-xl p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Link2 className="w-5 h-5 text-accent" />
              </div>
              <h2 className="font-display font-semibold">Join Meeting</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4 flex-1">Paste a Zoom or Google Meet URL to join with AI analysis.</p>
            <Input
              placeholder="https://meet.google.com/abc-def-ghi"
              value={joinUrl}
              onChange={(e) => setJoinUrl(e.target.value)}
              className="mb-3"
            />
            <Button
              onClick={handleJoinMeeting}
              disabled={startCall.isPending || !joinUrl.trim()}
              variant="secondary"
              className="gap-2"
            >
              {startCall.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              <ExternalLink className="w-4 h-4" />
              Join Meeting
            </Button>
          </div>

          {/* Schedule Meeting */}
          <div className="glass rounded-xl p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                <CalendarPlus className="w-5 h-5 text-muted-foreground" />
              </div>
              <h2 className="font-display font-semibold">Schedule</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4 flex-1">Schedule a meeting for later and get reminded.</p>
            <Dialog open={schedOpen} onOpenChange={setSchedOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <CalendarPlus className="w-4 h-4" />
                  Schedule Meeting
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Schedule a Meeting</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label>Title</Label>
                    <Input
                      value={schedTitle}
                      onChange={(e) => setSchedTitle(e.target.value)}
                      placeholder="Q4 Sales Review"
                    />
                  </div>
                  <div>
                    <Label>Meeting Type</Label>
                    <Select value={schedType} onValueChange={setSchedType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEETING_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Participants (comma-separated)</Label>
                    <Input
                      value={schedParticipants}
                      onChange={(e) => setSchedParticipants(e.target.value)}
                      placeholder="jane@acme.com, john@acme.com"
                    />
                  </div>
                  <div>
                    <Label>Platform</Label>
                    <Select value={schedProvider} onValueChange={setSchedProvider}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="google_meet">Google Meet</SelectItem>
                        <SelectItem value="zoom">Zoom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Meeting URL (optional)</Label>
                    <Input
                      value={schedUrl}
                      onChange={(e) => setSchedUrl(e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <Label>Date & Time</Label>
                    <Input
                      type="datetime-local"
                      value={schedTime}
                      onChange={(e) => setSchedTime(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={handleSchedule}
                    disabled={scheduleMeeting.isPending}
                    className="w-full"
                  >
                    {scheduleMeeting.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    Schedule
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Upcoming meetings */}
        {scheduledCalls.length > 0 && (
          <section>
            <h2 className="font-display font-semibold mb-3">Upcoming Meetings</h2>
            <div className="space-y-2">
              {scheduledCalls.map((sc) => (
                <div key={sc.id} className="glass rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{sc.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(sc.scheduled_time), "MMM d, yyyy 'at' h:mm a")} · {sc.meeting_provider === "zoom" ? "Zoom" : "Google Meet"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {sc.meeting_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setJoinUrl(sc.meeting_url!);
                        }}
                      >
                        Join
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => cancelScheduled.mutate(sc.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Integration status */}
        <section>
          <h2 className="font-display font-semibold mb-3">Integration Status</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { provider: "zoom", name: "Zoom", connected: zoomConnected },
              { provider: "google_meet", name: "Google Meet", connected: meetConnected },
              { provider: "slack", name: "Slack", connected: isProviderConnected("slack") },
            ].map((int) => (
              <div key={int.provider} className="glass rounded-xl p-4 flex items-center justify-between">
                <span className="text-sm font-medium">{int.name}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    int.connected
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {int.connected ? "Connected" : "Not connected"}
                </span>
              </div>
            ))}
          </div>
        </section>
        </div>
      </SubscriptionGate>
    </DashboardLayout>
  );
}
