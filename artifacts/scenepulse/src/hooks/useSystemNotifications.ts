import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/auth";

export interface SystemNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

export function useSystemNotifications() {
  const { session } = useAuth();
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);

  const fetch_ = useCallback(async () => {
    const token = session?.access_token;
    if (!token) return;
    try {
      const res = await fetch("/api/notifications", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setNotifications(await res.json() as SystemNotification[]);
    } catch {
      // silent
    }
  }, [session?.access_token]);

  useEffect(() => {
    void fetch_();
    const id = setInterval(fetch_, 30_000);
    return () => clearInterval(id);
  }, [fetch_]);

  const markRead = async (id: string) => {
    const token = session?.access_token;
    if (!token) return;
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    await fetch(`/api/notifications/${id}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  };

  const markAllRead = async () => {
    const token = session?.access_token;
    if (!token) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await fetch("/api/notifications/read-all", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, markRead, markAllRead, refresh: fetch_ };
}
