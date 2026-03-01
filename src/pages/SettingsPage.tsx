import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ExternalLink } from "lucide-react";

const integrations = [
  { name: "Zoom", desc: "Connect Zoom to auto-join meetings", connected: true, icon: "Z" },
  { name: "Google Meet", desc: "Record and transcribe Google Meet calls", connected: false, icon: "G" },
  { name: "Microsoft Teams", desc: "Full Teams integration with AI bot", connected: false, icon: "T" },
  { name: "Salesforce", desc: "Auto-log calls and update deal stages", connected: true, icon: "S" },
  { name: "HubSpot", desc: "Sync call data with HubSpot CRM", connected: false, icon: "H" },
  { name: "Slack", desc: "Get real-time notifications for insights", connected: false, icon: "Sl" },
];

export default function SettingsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold font-display">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your integrations and preferences</p>
        </div>

        {/* Integrations */}
        <section>
          <h2 className="font-display font-semibold mb-4">Integrations</h2>
          <div className="space-y-3">
            {integrations.map(int => (
              <div key={int.name} className="glass rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-sm font-bold text-muted-foreground">
                    {int.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{int.name}</p>
                    <p className="text-xs text-muted-foreground">{int.desc}</p>
                  </div>
                </div>
                <Button variant={int.connected ? "outline" : "default"} size="sm" className="gap-1.5">
                  {int.connected ? "Connected" : "Connect"}
                  {!int.connected && <ExternalLink className="w-3 h-3" />}
                </Button>
              </div>
            ))}
          </div>
        </section>

        {/* Preferences */}
        <section>
          <h2 className="font-display font-semibold mb-4">Preferences</h2>
          <div className="glass rounded-xl divide-y divide-border">
            {[
              { label: "Auto-join meetings", desc: "AI bot automatically joins scheduled meetings", on: true },
              { label: "Real-time objection alerts", desc: "Get notified when objections are detected", on: true },
              { label: "Post-call email summary", desc: "Receive call summary via email after each call", on: false },
              { label: "CRM auto-sync", desc: "Automatically log calls and update deal stages", on: true },
            ].map(pref => (
              <div key={pref.label} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium">{pref.label}</p>
                  <p className="text-xs text-muted-foreground">{pref.desc}</p>
                </div>
                <Switch defaultChecked={pref.on} />
              </div>
            ))}
          </div>
        </section>

        {/* Security */}
        <section>
          <h2 className="font-display font-semibold mb-4">Security & Compliance</h2>
          <div className="glass rounded-xl p-5">
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { label: "Encryption", status: "AES-256 at rest, TLS in transit" },
                { label: "GDPR", status: "Compliant" },
                { label: "SOC2", status: "Certified" },
              ].map(s => (
                <div key={s.label}>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-sm font-medium text-success">{s.status}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
