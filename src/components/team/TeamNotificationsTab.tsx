import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bell, MessageSquare, TrendingUp, AtSign, AlertCircle,
  CheckCheck, Check
} from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { format } from "date-fns";

const typeIcons: Record<string, typeof Bell> = {
  comment: MessageSquare,
  coaching: TrendingUp,
  mention: AtSign,
  system: AlertCircle,
};

const typeColors: Record<string, string> = {
  comment: "bg-primary/10 text-primary",
  coaching: "bg-emerald-400/10 text-emerald-400",
  mention: "bg-amber-400/10 text-amber-400",
  system: "bg-muted text-muted-foreground",
};

// Demo notifications for empty state
const demoNotifications = [
  { type: "comment", message: "Manager commented on your Acme demo meeting: \"Great discovery questions!\"", time: "2 hours ago" },
  { type: "coaching", message: "Your meeting score improved from 7.1 to 8.3 this week.", time: "5 hours ago" },
  { type: "mention", message: "Sarah mentioned you in a discussion on the TechNova intro call.", time: "Yesterday" },
  { type: "system", message: "Team weekly performance report is ready.", time: "Yesterday" },
  { type: "coaching", message: "New AI coaching insight: Your talk ratio improved by 8% this month.", time: "2 days ago" },
  { type: "comment", message: "Daniel replied to your feedback on the Enterprise QBR meeting.", time: "2 days ago" },
];

export default function TeamNotificationsTab() {
  const { notifications, notificationsLoading, unreadCount, markRead, markAllRead } = useNotifications();

  const hasRealNotifications = notifications.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold font-display flex items-center gap-2">
            Inbox
            {unreadCount > 0 && (
              <Badge className="bg-primary text-primary-foreground text-xs h-5 px-1.5">{unreadCount}</Badge>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">Team notifications and coaching updates</p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="gap-2 text-xs"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all read
          </Button>
        )}
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <ScrollArea className="h-[550px]">
            {notificationsLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
            ) : hasRealNotifications ? (
              <div className="divide-y divide-border">
                {notifications.map(n => {
                  const Icon = typeIcons[n.type] ?? Bell;
                  const colorClass = typeColors[n.type] ?? typeColors.system;
                  return (
                    <div
                      key={n.id}
                      className={`flex gap-3 p-4 transition-colors cursor-pointer hover:bg-secondary/20 ${!n.is_read ? "bg-primary/5" : ""}`}
                      onClick={() => !n.is_read && markRead.mutate(n.id)}
                    >
                      <div className={`p-2 rounded-lg shrink-0 ${colorClass}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-relaxed ${!n.is_read ? "font-medium" : "text-muted-foreground"}`}>
                          {n.message}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {format(new Date(n.created_at), "MMM d, h:mm a")}
                        </p>
                      </div>
                      {!n.is_read && (
                        <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Demo/empty state showing example notifications */
              <div className="divide-y divide-border">
                {demoNotifications.map((n, i) => {
                  const Icon = typeIcons[n.type] ?? Bell;
                  const colorClass = typeColors[n.type] ?? typeColors.system;
                  return (
                    <div key={i} className={`flex gap-3 p-4 ${i < 2 ? "bg-primary/5" : ""}`}>
                      <div className={`p-2 rounded-lg shrink-0 ${colorClass}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-relaxed ${i < 2 ? "font-medium" : "text-muted-foreground"}`}>
                          {n.message}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">{n.time}</p>
                      </div>
                      {i < 2 && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />}
                    </div>
                  );
                })}
                <div className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">These are example notifications. Real notifications will appear as your team uses the platform.</p>
                </div>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
