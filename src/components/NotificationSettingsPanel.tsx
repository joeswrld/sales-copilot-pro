import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Volume2, Play, BellOff, Moon, Vibrate } from "lucide-react";
import {
  getNotificationSettings,
  setNotificationSettings,
  subscribeNotificationSettings,
  SOUND_PRESETS,
  type NotificationSettings,
  type SoundId,
} from "@/lib/notificationSettings";
import { playNotificationSound } from "@/lib/notificationSound";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationSettingsPanel({ open, onOpenChange }: Props) {
  const [s, setS] = useState<NotificationSettings>(getNotificationSettings());

  useEffect(() => subscribeNotificationSettings(setS), []);

  const update = (patch: Partial<NotificationSettings>) => setNotificationSettings(patch);
  const updateQuiet = (patch: Partial<NotificationSettings["quietHours"]>) =>
    setNotificationSettings({ quietHours: { ...s.quietHours, ...patch } });

  const test = (id?: SoundId) =>
    playNotificationSound({ force: true, soundOverride: id ?? s.sound, volumeOverride: s.volume });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" /> Notification Settings
          </DialogTitle>
          <DialogDescription>
            Customize how you're alerted to new messages and notifications.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Master enable */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2"><BellOff className="h-4 w-4" /> Enable notification sounds</Label>
              <p className="text-xs text-muted-foreground">Turn all sounds off without leaving the page.</p>
            </div>
            <Switch checked={s.enabled} onCheckedChange={(v) => update({ enabled: v })} />
          </div>

          {/* Do Not Disturb */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2"><Moon className="h-4 w-4" /> Do Not Disturb</Label>
              <p className="text-xs text-muted-foreground">Silence sound &amp; vibration until you turn it off.</p>
            </div>
            <Switch checked={s.dnd} onCheckedChange={(v) => update({ dnd: v })} />
          </div>

          {/* Quiet hours */}
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <Label>Quiet hours</Label>
              <Switch
                checked={s.quietHours.enabled}
                onCheckedChange={(v) => updateQuiet({ enabled: v })}
              />
            </div>
            {s.quietHours.enabled && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <Label className="text-xs text-muted-foreground">From</Label>
                  <Input
                    type="time"
                    value={s.quietHours.start}
                    onChange={(e) => updateQuiet({ start: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">To</Label>
                  <Input
                    type="time"
                    value={s.quietHours.end}
                    onChange={(e) => updateQuiet({ end: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Vibration */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2"><Vibrate className="h-4 w-4" /> Vibration (mobile)</Label>
              <p className="text-xs text-muted-foreground">Buzz device for urgent notifications.</p>
            </div>
            <Switch checked={s.vibration} onCheckedChange={(v) => update({ vibration: v })} />
          </div>

          {/* Volume */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Volume</Label>
              <span className="text-xs text-muted-foreground">{Math.round(s.volume * 100)}%</span>
            </div>
            <Slider
              value={[Math.round(s.volume * 100)]}
              min={0}
              max={100}
              step={5}
              onValueChange={(v) => update({ volume: (v[0] ?? 0) / 100 })}
            />
          </div>

          {/* Sound picker */}
          <div className="space-y-2">
            <Label>Sound</Label>
            <div className="grid gap-2">
              {SOUND_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => update({ sound: preset.id })}
                  className={`flex items-center justify-between rounded-md border p-2 text-left transition-colors ${
                    s.sound === preset.id ? "border-primary bg-primary/10" : "hover:bg-muted"
                  }`}
                >
                  <div>
                    <div className="text-sm font-medium">{preset.label}</div>
                    <div className="text-xs text-muted-foreground">{preset.description}</div>
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); test(preset.id); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); test(preset.id); } }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border hover:bg-background"
                    aria-label={`Test ${preset.label}`}
                  >
                    <Play className="h-3.5 w-3.5" />
                  </span>
                </button>
              ))}
            </div>
          </div>

          <Button onClick={() => test()} variant="secondary" className="w-full">
            <Play className="mr-2 h-4 w-4" /> Test current ringtone
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
