import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface TypingUser {
  userId: string;
  name: string;
}

export function useTypingIndicator(conversationId: string | null) {
  const { user } = useAuth();
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    if (!conversationId || !user) return;

    const channel = supabase.channel(`typing-${conversationId}`);
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload.userId === user.id) return;

        setTypingUsers((prev) => {
          const exists = prev.some((u) => u.userId === payload.userId);
          if (!exists) return [...prev, { userId: payload.userId, name: payload.name }];
          return prev;
        });

        // Clear after 3 seconds of no typing
        const existing = timeoutsRef.current.get(payload.userId);
        if (existing) clearTimeout(existing);
        timeoutsRef.current.set(
          payload.userId,
          setTimeout(() => {
            setTypingUsers((prev) => prev.filter((u) => u.userId !== payload.userId));
            timeoutsRef.current.delete(payload.userId);
          }, 3000)
        );
      })
      .on("broadcast", { event: "stop_typing" }, ({ payload }) => {
        setTypingUsers((prev) => prev.filter((u) => u.userId !== payload.userId));
        const existing = timeoutsRef.current.get(payload.userId);
        if (existing) {
          clearTimeout(existing);
          timeoutsRef.current.delete(payload.userId);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      timeoutsRef.current.forEach((t) => clearTimeout(t));
      timeoutsRef.current.clear();
      setTypingUsers([]);
    };
  }, [conversationId, user]);

  const sendTyping = useCallback(
    (name: string) => {
      if (!channelRef.current || !user) return;
      channelRef.current.send({
        type: "broadcast",
        event: "typing",
        payload: { userId: user.id, name },
      });
    },
    [user]
  );

  const sendStopTyping = useCallback(() => {
    if (!channelRef.current || !user) return;
    channelRef.current.send({
      type: "broadcast",
      event: "stop_typing",
      payload: { userId: user.id },
    });
  }, [user]);

  return { typingUsers, sendTyping, sendStopTyping };
}
