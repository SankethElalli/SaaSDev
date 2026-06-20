import { useState, useRef } from "react";
import { Fingerprint, Search, X, MapPin, Loader2, Music2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface MxTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  albumName: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onFindOnMap: (artistName: string) => void;
}

export function FingerprintPanel({ open, onClose, onFindOnMap }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MxTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const tooShort = query.trim().length > 0 && query.trim().length < 10;

  const search = async () => {
    const q = query.trim();
    if (!q || q.length < 10) return;
    setLoading(true);
    setSearched(false);
    setError(null);
    try {
      const res = await fetch(
        `/api/musixmatch/fingerprint?q=${encodeURIComponent(q)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Server error ${res.status}`);
      }
      const data = (await res.json()) as { tracks: MxTrack[] };
      setResults(data.tracks ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setResults([]);
    }
    setLoading(false);
    setSearched(true);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") search();
  };

  const handleFindOnMap = (artistName: string) => {
    onFindOnMap(artistName);
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[9000] bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed bottom-0 inset-x-0 z-[9001] flex justify-center pointer-events-none">
        <div className="pointer-events-auto w-full max-w-lg rounded-t-3xl glass border border-white/10 shadow-2xl px-5 pt-4 pb-safe-bottom pb-8">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />

          <div className="flex items-center gap-3 mb-1">
            <Fingerprint className="h-5 w-5 text-primary shrink-0" />
            <h3 className="font-bold text-base text-foreground">Lyrics Fingerprint</h3>
            <button
              onClick={onClose}
              className="ml-auto rounded-full p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-4 ml-8">
            Heard something live? Type <strong>8+ distinctive words</strong> you caught to identify the song.
          </p>

          <div className="flex gap-2 mb-1">
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder="e.g. 'keep bleeding keep bleeding love tonight'"
              className="flex-1 rounded-xl bg-white/5 border-white/10 placeholder:text-muted-foreground/50"
              autoFocus
            />
            <Button
              onClick={search}
              disabled={loading || tooShort || !query.trim()}
              className="rounded-xl bg-gradient-to-br from-primary to-secondary shrink-0"
              size="icon"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>

          {tooShort && (
            <p className="text-[11px] text-amber-400/80 ml-1 mb-3">
              Type at least 8 distinctive words for an accurate match
            </p>
          )}
          {!tooShort && <div className="mb-4" />}

          {!searched && !loading && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Music2 className="h-8 w-8 text-white/20" />
              <p className="text-xs text-muted-foreground">
                Unique phrases work best — avoid very common words
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive mb-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {searched && !error && results.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-6">
              No matches — try more distinctive words or a longer phrase
            </p>
          )}

          {results.length > 0 && (
            <div className="flex flex-col gap-2">
              {results.map((track) => (
                <div
                  key={track.trackId}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border border-white/10 glass px-3 py-2.5",
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {track.trackName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {track.artistName}
                      {track.albumName ? ` · ${track.albumName}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-primary hover:text-primary hover:bg-primary/10 gap-1.5 rounded-lg h-8 px-2.5"
                    onClick={() => handleFindOnMap(track.artistName)}
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="text-xs">Find</span>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
