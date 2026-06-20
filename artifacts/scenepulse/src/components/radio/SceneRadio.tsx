import { useEffect, useRef, useState } from "react";
import { Radio, Play, Pause, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface RadioArtist { name: string; genre?: string | null }
interface RadioVenue  { name: string; city?: string | null }
interface RadioLiveEvent {
  name: string;
  venueName: string;
  startDate: string;
  performers: { name: string; genre: string[] }[];
}

interface Props {
  lat: number;
  lng: number;
  city?: string;
  artists: RadioArtist[];
  venues: RadioVenue[];
  liveEvents: RadioLiveEvent[];
  onStop: () => void;
}

type RadioState = "loading" | "playing" | "paused" | "error";

export function SceneRadio({ lat, lng, city, artists, venues, liveEvents, onStop }: Props) {
  const [state, setState] = useState<RadioState>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/radio/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng, city, artists, venues, liveEvents }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { message?: string };
          throw new Error(err.message ?? `Server error ${res.status}`);
        }
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => { if (!cancelled) setState("paused"); };
        audio.onerror = () => {
          if (!cancelled) { setState("error"); setErrorMsg("Playback failed"); }
        };
        audio.play().then(() => {
          if (!cancelled) setState("playing");
        }).catch((e: Error) => {
          if (!cancelled) { setState("error"); setErrorMsg(e.message); }
        });
      })
      .catch((e: Error) => {
        if (!cancelled) { setState("error"); setErrorMsg(e.message); }
      });

    return () => {
      cancelled = true;
      audioRef.current?.pause();
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (state === "playing") {
      audio.pause();
      setState("paused");
    } else if (state === "paused") {
      audio.play().catch(() => {});
      setState("playing");
    }
  };

  const handleStop = () => {
    audioRef.current?.pause();
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    onStop();
  };

  const statusLabel =
    state === "loading" ? "Tuning in to your scene…" :
    state === "playing" ? "On air" :
    state === "paused"  ? "Paused" :
    errorMsg ?? "Could not generate radio";

  return (
    <div className="fixed bottom-0 inset-x-0 z-[1001] flex justify-center pb-5 px-4 pointer-events-none">
      <div className="pointer-events-auto glass border border-primary/30 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-2xl shadow-primary/20 w-full max-w-sm">

        {/* Icon / spinner */}
        <div className="shrink-0 h-8 w-8 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
          {state === "loading" ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          ) : (
            <Radio className={cn("h-3.5 w-3.5 text-primary", state === "playing" && "animate-pulse")} />
          )}
        </div>

        {/* Label */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground leading-tight">Scene Radio</p>
          <p className={cn(
            "text-[11px] truncate leading-tight mt-0.5",
            state === "error" ? "text-destructive" : "text-muted-foreground",
          )}>
            {statusLabel}
          </p>
        </div>

        {/* Play / Pause */}
        {(state === "playing" || state === "paused") && (
          <button
            onClick={togglePlayback}
            className="shrink-0 h-8 w-8 rounded-full bg-primary/20 hover:bg-primary/30 border border-primary/30 flex items-center justify-center text-primary transition-colors active:scale-95"
            aria-label={state === "playing" ? "Pause" : "Play"}
          >
            {state === "playing"
              ? <Pause className="h-3.5 w-3.5" />
              : <Play className="h-3.5 w-3.5 ml-0.5" />
            }
          </button>
        )}

        {/* Stop */}
        <button
          onClick={handleStop}
          className="shrink-0 h-8 w-8 rounded-full glass border border-white/10 hover:border-white/20 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors active:scale-95"
          aria-label="Stop Scene Radio"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
