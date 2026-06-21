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
      setUploadError("Enter a title before uploading.");
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
    <div className="space-y-4">
      {/* Track list */}
      {tracks.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/10 py-10 text-center">
          <Music2 className="h-8 w-8 text-white/20" />
          <p className="text-sm text-muted-foreground">No tracks uploaded yet</p>
          <p className="text-xs text-muted-foreground/60">Upload up to 3 tracks for other artists to discover</p>
        </div>
      )}

      <div className="space-y-3">
        {tracks.map((track) => (
          <div
            key={track.id}
            className="glass-card rounded-xl border border-white/10 p-4 space-y-2"
          >
            <div className="flex items-center justify-between gap-3 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <Music2 className="h-4 w-4 shrink-0 text-primary" />
                <span className="text-sm font-medium truncate">{track.title}</span>
              </div>
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
            {/* Native audio player */}
            <audio
              controls
              src={track.url}
              className="w-full h-9"
              preload="metadata"
            />
          </div>
        ))}
      </div>

      {/* Upload form */}
      {!atLimit && (
        <div className="glass-card rounded-xl border border-white/10 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Add track ({tracks.length} / {MAX_TRACKS})
          </p>
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
              "w-full rounded-xl bg-gradient-to-br from-primary to-secondary gap-2",
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

      {atLimit && (
        <p className="text-center text-xs text-muted-foreground">
          Maximum {MAX_TRACKS} tracks reached. Delete one to upload another.
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
    <div className="glass-card rounded-xl border border-white/10 p-4 space-y-2">
      <div className="flex items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Music2 className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-sm font-medium truncate">{track.title}</span>
        </div>
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

      {/* Stem picker — expands inline when "Request Stem" is clicked */}
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
