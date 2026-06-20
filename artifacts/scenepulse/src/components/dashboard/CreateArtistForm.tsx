import { useState } from "react";
import { useCreateArtist, getGetMyArtistQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { LocateFixed, Loader2, MapPin, Music2, X } from "lucide-react";
import { detectCity, getCurrentCoords } from "@/lib/geo";

const GENRE_SUGGESTIONS = [
  "Hip-Hop", "R&B", "Pop", "Rock", "Indie", "Electronic", "Jazz",
  "Soul", "Folk", "Metal", "Classical", "Reggae", "Blues", "Punk",
  "Lo-fi", "Ambient", "Trap", "Drill", "Afrobeats", "Latin",
];

function GenreInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState("");

  const add = (genre: string) => {
    const g = genre.trim();
    if (g && !value.includes(g)) onChange([...value, g]);
    setInput("");
  };
  const remove = (genre: string) => onChange(value.filter((v) => v !== genre));
  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault();
      add(input);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {value.map((g) => (
          <span key={g} className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-medium">
            {g}
            <button type="button" onClick={() => remove(g)}><X className="h-2.5 w-2.5" /></button>
          </span>
        ))}
      </div>
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => { if (input.trim()) add(input); }}
        placeholder="Type a genre and press Enter…"
        className="bg-background/50"
      />
      <div className="flex flex-wrap gap-1">
        {GENRE_SUGGESTIONS.filter((g) => !value.includes(g)).slice(0, 10).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => add(g)}
            className="px-2 py-0.5 rounded-full border border-white/10 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
          >
            {g}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CreateArtistForm({
  profileId,
  defaultCity,
}: {
  profileId: string;
  defaultCity?: string | null;
}) {
  const create = useCreateArtist();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [artistName, setArtistName] = useState("");
  const [city, setCity] = useState(defaultCity ?? "");
  const [detectedCoords, setDetectedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [detectingCity, setDetectingCity] = useState(false);
  const [bio, setBio] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");

  const handleDetectCity = async () => {
    setDetectingCity(true);
    try {
      const [cityResult, coords] = await Promise.all([detectCity(), getCurrentCoords()]);
      if (cityResult) {
        setCity(cityResult);
        if (coords) setDetectedCoords(coords);
      } else {
        toast({ title: "Could not detect location", description: "Allow location access and try again.", variant: "destructive" });
      }
    } finally {
      setDetectingCity(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!artistName.trim() || !city.trim()) return;
    create.mutate(
      {
        data: {
          profileId,
          artistName: artistName.trim(),
          city: city.trim(),
          bio: bio.trim() || undefined,
          genres: genres.length ? genres : undefined,
          latitude: detectedCoords?.lat,
          longitude: detectedCoords?.lng,
          spotifyUrl: spotifyUrl.trim() || undefined,
          instagramUrl: instagramUrl.trim() || undefined,
          youtubeUrl: youtubeUrl.trim() || undefined,
          websiteUrl: websiteUrl.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Artist profile created!", description: "You're now on the ScenePulse map." });
          void qc.invalidateQueries({ queryKey: getGetMyArtistQueryKey(profileId) });
        },
        onError: () => toast({ title: "Could not create profile", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="w-full max-w-lg mx-auto">
      <div className="text-center mb-8">
        <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-4">
          <Music2 className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">Set up your artist profile</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          This is what fans and venues see when they click your pin on the map.
        </p>
      </div>

      <div className="glass-card p-8 rounded-3xl">
        <form onSubmit={submit} className="space-y-5">

          <div className="space-y-2">
            <Label htmlFor="artistName">Artist / Band name <span className="text-destructive">*</span></Label>
            <Input
              id="artistName"
              placeholder="Stage name or band name"
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
              required
              className="bg-background/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="city">
              <MapPin className="inline h-3.5 w-3.5 mr-1 text-muted-foreground" />
              Based in <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="city"
                value={city}
                onChange={(e) => { setCity(e.target.value); setDetectedCoords(null); }}
                placeholder="e.g. Bengaluru, India"
                className="bg-background/50"
                required
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                disabled={detectingCity}
                onClick={() => void handleDetectCity()}
                title="Auto-detect my location"
                className="shrink-0"
              >
                {detectingCity ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
              </Button>
            </div>
            {detectedCoords && (
              <p className="text-xs text-green-500 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
                Exact location captured — you'll appear precisely on the map
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Genres</Label>
            <GenreInput value={genres} onChange={setGenres} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="spotifyUrl">
              <svg viewBox="0 0 24 24" className="inline h-3.5 w-3.5 mr-1 fill-[#1DB954]"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.5 17.3a.75.75 0 0 1-1.03.247c-2.82-1.722-6.37-2.11-10.55-1.157a.75.75 0 1 1-.334-1.462c4.575-1.043 8.504-.594 11.67 1.339a.75.75 0 0 1 .244 1.033zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.227-1.983-8.145-2.558-11.963-1.4a.938.938 0 0 1-.58-1.787c4.363-1.339 9.79-.69 13.52 1.587a.94.94 0 0 1 .313 1.29zm.127-3.403c-3.868-2.298-10.248-2.51-13.944-1.388a1.125 1.125 0 1 1-.653-2.154c4.243-1.287 11.296-1.038 15.753 1.605a1.125 1.125 0 0 1-1.156 1.937z"/></svg>
              Spotify Artist URL
            </Label>
            <Input
              id="spotifyUrl"
              placeholder="https://open.spotify.com/artist/…"
              value={spotifyUrl}
              onChange={(e) => setSpotifyUrl(e.target.value)}
              className="bg-background/50"
            />
            <p className="text-[11px] text-muted-foreground">Paste from your Spotify profile → Share → Copy link.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea
              id="bio"
              placeholder="Tell fans and venues about your sound, influences, and what makes you unique…"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="bg-background/50 resize-none"
            />
          </div>

          <details className="group">
            <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground select-none list-none flex items-center gap-1.5">
              <span className="text-xs border border-white/10 rounded px-1.5 py-0.5 group-open:rotate-90 inline-block transition-transform">▶</span>
              Add social links (optional)
            </summary>
            <div className="mt-3 space-y-3 pl-1">
              <div className="space-y-1">
                <Label htmlFor="instagram" className="text-xs">Instagram URL</Label>
                <Input id="instagram" placeholder="https://instagram.com/…" value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} className="bg-background/50 h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="youtube" className="text-xs">YouTube URL</Label>
                <Input id="youtube" placeholder="https://youtube.com/…" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} className="bg-background/50 h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="website" className="text-xs">Website</Label>
                <Input id="website" placeholder="https://yoursite.com" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} className="bg-background/50 h-8 text-sm" />
              </div>
            </div>
          </details>

          <Button
            type="submit"
            className="w-full"
            disabled={create.isPending || !artistName.trim() || !city.trim()}
          >
            {create.isPending ? "Creating…" : "Put me on the map"}
          </Button>

        </form>
      </div>
    </div>
  );
}
