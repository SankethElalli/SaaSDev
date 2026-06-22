import { useRef, useState } from "react";
import { Music2, Trash2, Upload, Loader2, Plus, Scissors, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { uploadFile } from "@/lib/storage";

export interface ArtistTrack {
  id: string;
  artistId: string;
  title: string;
  url: string;
  durationSeconds?: number | null;
  createdAt: string;
}

interface Props {
  tracks: ArtistTrack[];
  adding: boolean;
  deletingId: string | null;
  onAdd: (track: { title: string; url: string }) => void;
  onDelete: (trackId: string) => void;
}

const MAX_TRACKS = 3;

export function TrackManager({ tracks, adding, deletingId, onAdd, onDelete }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const atLimit = tracks.length >= MAX_TRACKS;
  const busy = uploading || adding;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!title.trim()) {
      setUploadError("Enter a title first.");
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const url = await uploadFile("Tracks", file);
      onAdd({ title: title.trim(), url });
      setTitle("");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      {/* Upload card — always first */}
      {atLimit ? (
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <div className="w-8 h-8 rounded-xl bg-muted/50 flex items-center justify-center shrink-0">
            <Music2 className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            {MAX_TRACKS} / {MAX_TRACKS} tracks uploaded — delete one to add another.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/[0.03] p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Upload className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm font-semibold text-primary">Upload a track</span>
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {tracks.length} / {MAX_TRACKS}
            </span>
          </div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Track title"
            className="bg-white/5 border-white/10"
            disabled={busy}
          />
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={busy || !title.trim()}
            className={cn(
              "w-full rounded-xl bg-primary text-primary-foreground gap-2",
              busy && "opacity-60",
            )}
          >
            {busy
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
              : <><Upload className="h-4 w-4" /> Choose audio file</>
            }
          </Button>
          {uploadError && (
            <p className="text-xs text-destructive">{uploadError}</p>
          )}
        </div>
      )}

      {/* Track cards — one by one as uploaded */}
      {tracks.map((track) => (
        <div
          key={track.id}
          className="glass-card rounded-2xl border border-white/10 p-4 space-y-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Music2 className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-semibold flex-1 truncate">{track.title}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              disabled={deletingId === track.id}
              onClick={() => onDelete(track.id)}
              aria-label="Delete track"
            >
              {deletingId === track.id
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Trash2 className="h-3.5 w-3.5" />
              }
            </Button>
          </div>
          <audio
            controls
            src={track.url}
            className="w-full h-9"
            preload="metadata"
          />
        </div>
      ))}

      {tracks.length === 0 && !atLimit && (
        <p className="text-center text-xs text-muted-foreground/60 py-2">
          No tracks yet — upload your first track above.
        </p>
      )}
    </div>
  );
}

const STEM_OPTIONS = [
  { value: "vocals",       label: "Vocals"       },
  { value: "instrumental", label: "Instrumental"  },
  { value: "drums",        label: "Drums"         },
  { value: "bass",         label: "Bass"          },
  { value: "piano",        label: "Piano"         },
  { value: "guitar",       label: "Guitar"        },
] as const;

// Public-facing track card — shows on another artist's profile with "Request Stem"
export function PublicTrackCard({
  track,
  myArtistId,
  ownerArtistId,
  onRequestStem,
  requesting,
  requested,
}: {
  track: ArtistTrack;
  myArtistId?: string | null;
  ownerArtistId: string;
  onRequestStem: (trackId: string, stemType: string) => void;
  requesting?: boolean;
  requested?: boolean;
}) {
  const canRequest = myArtistId && myArtistId !== ownerArtistId;
  const [picking, setPicking] = useState(false);
  const [stemType, setStemType] = useState("vocals");

  return (
    <div className="glass-card rounded-2xl border border-white/10 p-4 space-y-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Music2 className="h-4 w-4 text-primary" />
        </div>
        <span className="text-sm font-semibold flex-1 truncate">{track.title}</span>
        {canRequest && !picking && !requested && (
          <Button
            size="sm"
            variant="ghost"
            disabled={requesting}
            onClick={() => setPicking(true)}
            className="shrink-0 gap-1.5 rounded-lg h-8 px-3 text-xs text-secondary hover:text-secondary hover:bg-secondary/10"
          >
            <Scissors className="h-3 w-3" />
            Request Stem
          </Button>
        )}
        {canRequest && requested && (
          <span className="shrink-0 rounded-lg border border-primary/40 px-3 py-1 text-xs text-primary">
            Requested
          </span>
        )}
      </div>

      {picking && !requested && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/10">
          <Scissors className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground">Which stem?</span>
          <select
            value={stemType}
            onChange={(e) => setStemType(e.target.value)}
            className="flex-1 min-w-[120px] rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {STEM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <Button
            size="sm"
            className="h-7 px-3 text-xs gap-1"
            disabled={requesting}
            onClick={() => {
              onRequestStem(track.id, stemType);
              setPicking(false);
            }}
          >
            {requesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Send
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground"
            onClick={() => setPicking(false)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      <audio
        controls
        src={track.url}
        className="w-full h-9"
        preload="metadata"
      />
    </div>
  );
}
