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
              <div className="p-12 text-center space-y-3">
                <Bell className="w-10 h-10 mx-auto text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
                <p className="text-xs text-muted-foreground/70">You'll see notifications here when teammates comment on meetings, send messages, or join your team.</p>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
