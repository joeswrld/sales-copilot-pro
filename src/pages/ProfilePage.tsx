import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { User, Mail, Shield, Trash2, Save, Calendar } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useSettings";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { profile, isLoading, updateProfile } = useUserProfile();

  const [fullName, setFullName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const displayName = fullName ?? profile?.full_name ?? "";
  const email = user?.email ?? profile?.email ?? "";
  const initial = (displayName || email)?.[0]?.toUpperCase() || "U";
  const createdAt = user?.created_at ? format(new Date(user.created_at), "MMMM d, yyyy") : "—";

  const handleSaveName = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName ?? displayName, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) throw error;

      // Also update auth metadata
      await supabase.auth.updateUser({ data: { full_name: fullName ?? displayName } });
      toast({ title: "Profile updated" });
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleGdprToggle = (checked: boolean) => {
    updateProfile.mutate({ gdpr_consent: checked });
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") return;
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("delete-account", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Account deleted", description: "Your account has been permanently removed." });
      await signOut();
      navigate("/");
    } catch (err: any) {
      toast({ title: "Failed to delete account", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteConfirmText("");
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Profile</h1>
          <p className="text-sm text-muted-foreground">Manage your personal information and account settings</p>
        </div>

        {/* Profile Info Card */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="bg-primary/20 text-primary text-xl font-bold">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="font-display">{displayName || "No name set"}</CardTitle>
                <CardDescription className="flex items-center gap-1.5 mt-0.5">
                  <Mail className="w-3.5 h-3.5" />
                  {email}
                </CardDescription>
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge variant="secondary" className="text-[10px] capitalize">{profile?.plan_type ?? "free"} plan</Badge>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Joined {createdAt}
                  </span>
                </div>
              </div>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <User className="w-3.5 h-3.5" /> Full Name
              </Label>
              <div className="flex gap-2">
                <Input
                  id="fullName"
                  value={fullName ?? profile?.full_name ?? ""}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                  className="flex-1"
                />
                <Button
                  size="sm"
                  onClick={handleSaveName}
                  disabled={saving || (fullName ?? profile?.full_name ?? "") === (profile?.full_name ?? "")}
                  className="gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <Mail className="w-3.5 h-3.5" /> Email
              </Label>
              <Input value={email} disabled className="opacity-60" />
              <p className="text-[11px] text-muted-foreground">Email cannot be changed here. Contact support if needed.</p>
            </div>
          </CardContent>
        </Card>

        {/* Usage Card */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base font-display">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Calls used this period</span>
              <span className="text-sm font-medium">{profile?.calls_used ?? 0} / {profile?.calls_limit ?? 5}</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(((profile?.calls_used ?? 0) / (profile?.calls_limit ?? 5)) * 100, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Privacy Card */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base font-display flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" /> Privacy & Data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">GDPR Consent</p>
                <p className="text-xs text-muted-foreground">Allow processing of personal data per GDPR regulations</p>
              </div>
              <Switch
                checked={profile?.gdpr_consent ?? false}
                onCheckedChange={handleGdprToggle}
              />
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="bg-card border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base font-display text-destructive flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> Danger Zone
            </CardTitle>
            <CardDescription>
              Permanently delete your account and all associated data. This action cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-2">
                  <Trash2 className="w-4 h-4" />
                  Delete Account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <p>
                      This will permanently delete your account, including all calls, transcripts,
                      analytics, team memberships, and subscriptions. This action is <strong>irreversible</strong>.
                    </p>
                    <p className="text-sm">
                      Type <strong>DELETE</strong> below to confirm:
                    </p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder='Type "DELETE" to confirm'
                  className="mt-2"
                />
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setDeleteConfirmText("")}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAccount}
                    disabled={deleteConfirmText !== "DELETE" || deleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleting ? "Deleting..." : "Permanently Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
