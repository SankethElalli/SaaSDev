import { useState, useMemo } from "react";
import { Bell, CalendarClock, Music4, CheckCheck, Scissors, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useSystemNotifications, type SystemNotification } from "@/hooks/useSystemNotifications";

type SceneNotification = {
  id: string;
  icon: typeof Bell;
  title: string;
  body: string;
  time: string;
  accent: string;
  read: boolean;
  onRead?: () => void;
};

export interface LiveEvent {
  id: string;
  name: string;
  venueName: string;
  startDate: string;
  performers: { name: string; isHeadliner: boolean }[];
}

interface Props {
  liveEvents?: LiveEvent[];
  newArtistCount?: number;
}

function formatEventDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffH = Math.round(diffMs / 3_600_000);
    if (diffH < 0) return "Tonight";
    if (diffH < 2) return "Starting soon";
    if (diffH < 24) return `In ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return "Tomorrow";
    if (diffD < 7) return `In ${diffD} days`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function formatAge(isoDate: string): string {
  try {
    const diffMs = Date.now() - new Date(isoDate).getTime();
    const diffM = Math.round(diffMs / 60_000);
    if (diffM < 1) return "Just now";
    if (diffM < 60) return `${diffM}m ago`;
    const diffH = Math.round(diffM / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return `${Math.round(diffH / 24)}d ago`;
  } catch {
    return "";
  }
}

const STEM_ICON_MAP: Record<string, typeof Bell> = {
  stem_request_received: Scissors,
  stem_request_approved: Check,
  stem_request_declined: X,
  stems_ready: Scissors,
};

const STEM_ACCENT_MAP: Record<string, string> = {
  stem_request_received: "text-amber-400",
  stem_request_approved: "text-blue-400",
  stem_request_declined: "text-red-400",
  stems_ready: "text-green-400",
};

function toSceneNotification(
  sn: SystemNotification,
  onRead: () => void,
): SceneNotification {
  return {
    id: `sys-${sn.id}`,
    icon: STEM_ICON_MAP[sn.type] ?? Bell,
    title: sn.title,
    body: sn.body ?? "",
    time: formatAge(sn.createdAt),
    accent: STEM_ACCENT_MAP[sn.type] ?? "text-primary",
    read: sn.read,
    onRead,
  };
}

export function NotificationsMenu({ liveEvents = [], newArtistCount = 0 }: Props) {
  const [open, setOpen] = useState(false);
  const [sceneReadIds, setSceneReadIds] = useState<Set<string>>(new Set());
  const { notifications: sysNotifs, markRead, markAllRead } = useSystemNotifications();

  const notifications = useMemo<SceneNotification[]>(() => {
    const list: SceneNotification[] = [];

    // System notifications (stem events) — most recent first
    for (const sn of sysNotifs.slice(0, 10)) {
      list.push(toSceneNotification(sn, () => void markRead(sn.id)));
    }

    // Live events
    for (const ev of liveEvents.slice(0, 3)) {
      const headliner = ev.performers.find((p) => p.isHeadliner) ?? ev.performers[0];
      const who = headliner?.name ?? ev.name;
      list.push({
        id: `ev-${ev.id}`,
        icon: CalendarClock,
        title: "Live near you",
        body: `${who} at ${ev.venueName}`,
        time: formatEventDate(ev.startDate),
        accent: "text-[hsl(330_85%_60%)]",
        read: sceneReadIds.has(`ev-${ev.id}`),
        onRead: () => setSceneReadIds((prev) => new Set(prev).add(`ev-${ev.id}`)),
      });
    }

    // New artists
    if (newArtistCount > 0) {
      const nid = "new-artists";
      list.push({
        id: nid,
        icon: Music4,
        title: "New in your scene",
        body: `${newArtistCount} artist${newArtistCount > 1 ? "s" : ""} added recently`,
        time: "Today",
        accent: "text-[hsl(280_80%_58%)]",
        read: sceneReadIds.has(nid),
        onRead: () => setSceneReadIds((prev) => new Set(prev).add(nid)),
      });
    }

    if (list.length === 0) {
      list.push({
        id: "tip",
        icon: Music4,
        title: "Explore your scene",
        body: "Zoom into your city to discover local artists and live shows.",
        time: "Now",
        accent: "text-[hsl(190_80%_52%)]",
        read: true,
      });
    }

    return list;
  }, [sysNotifs, liveEvents, newArtistCount, sceneReadIds]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = () => {
    void markAllRead();
    setSceneReadIds(new Set(notifications.map((n) => n.id)));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="group relative h-11 w-11 rounded-2xl glass border border-white/10 transition-all duration-200 hover:border-primary/50 hover:text-primary active:scale-90"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5 transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-6" />
          {unreadCount > 0 && (
            <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-secondary animate-pulse" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="glass-card w-80 border-white/10 p-0">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-secondary/20 px-2 py-0.5 text-[10px] font-bold text-secondary">
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {notifications.map((n) => {
            const Icon = n.icon;
            return (
              <button
                key={n.id}
                onClick={() => n.onRead?.()}
                className={cn(
                  "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5",
                  !n.read && "bg-white/[0.03]",
                )}
              >
                <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/5", n.accent)}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium leading-tight text-foreground">{n.title}</span>
                    {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{n.body}</span>
                  <span className="mt-1 block text-[10px] uppercase tracking-wide text-muted-foreground/70">{n.time}</span>
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
