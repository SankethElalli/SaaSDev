import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import {
  Search,
  Sparkles,
  Users,
  CalendarClock,
  TrendingUp,
  Music4,
  Map,
  Satellite,
  Fingerprint,
  X,
  Music2,
  MapPin,
  Radio,
  Globe,
  LocateFixed,
  Flame,
} from "lucide-react";
import { useGetMapPins, useGetProfile, useGetMyArtist, getGetProfileQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  SceneMap,
  type ScenePin,
  type JambasePin,
  type MapBounds,
  type MapStyle,
  type HeatPoint,
  type MapHandle,
} from "@/components/map/SceneMap";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationsMenu } from "@/components/NotificationsMenu";
import { KaraokeModal } from "@/components/musixmatch/KaraokeModal";
import { SceneRadio } from "@/components/radio/SceneRadio";
import { FingerprintPanel } from "@/components/musixmatch/FingerprintPanel";
import { SetlistPanel } from "@/components/jambase/SetlistPanel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface MxTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  albumName: string;
}

interface CyaniteAnalysis {
  status: "finished" | "processing" | "notAuthorized" | "unavailable";
  genreTags?: string[];
  moodTags?: string[];
  instrumentTags?: string[];
  characterTags?: string[];
  energyLevel?: string | null;
  bpm?: number | null;
}

const SPOTIFY_TRACK_RE =
  /(?:open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/|spotify:track:)([a-zA-Z0-9]{22})/;

const SPOTIFY_ARTIST_RE =
  /open\.spotify\.com\/(?:intl-[a-z]+\/)?artist\/([A-Za-z0-9]{22})/;

function isSpotifyLink(value: string): boolean {
  return SPOTIFY_TRACK_RE.test(value.trim());
}

function extractSpotifyArtistId(value: string): string | null {
  return value.trim().match(SPOTIFY_ARTIST_RE)?.[1] ?? null;
}

function fmtNum(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString();
}

interface ArtistStats {
  spotifyArtistId: string;
  monthlyListeners: number | null;
  followersTotal: number | null;
  popularity: number | null;
  playlistReachCurrent: number | null;
  playlistsCurrent: number | null;
}

function prettyTag(tag: string): string {
  return tag.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeArtistName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]/g, "");
}

type FilterKey = "all" | "artist" | "venue" | "event" | "live";

const FILTERS: {
  key: FilterKey;
  label: string;
  icon: typeof Users;
  badge?: string;
}[] = [
  { key: "artist", label: "Artists", icon: Users },
  { key: "live", label: "Live Tonight", icon: CalendarClock, badge: "JAMBASE" },
  { key: "venue", label: "Venues", icon: TrendingUp },
  { key: "all", label: "All", icon: Music4 },
];


export default function MapShell() {
  const { data, isLoading } = useGetMapPins();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [authOpen, setAuthOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [mapStyle, setMapStyle] = useState<MapStyle>("auto");

  // Global / local scope toggle
  const [globalMode, setGlobalMode] = useState(false);

  // Heatmap overlay toggle
  const [showHeatmap, setShowHeatmap] = useState(false);

  // Load user's city for local filtering
  const { data: profile } = useGetProfile(user?.id ?? "", {
    query: {
      enabled: !!user?.id,
      queryKey: getGetProfileQueryKey(user?.id ?? ""),
    },
  });

  // Load artist profile to get stored lat/lng (only for artist role).
  // retry: false prevents spamming 404s when the artist row doesn't exist yet.
  const { data: myArtist } = useGetMyArtist(user?.id ?? "", {
    query: {
      enabled: !!user?.id && profile?.role === "artist",
      retry: false,
      retryOnMount: false,
    },
  });

  // Map center — read from sessionStorage so re-visiting the page starts at the same spot.
  const [mapCenter] = useState<[number, number]>(() => {
    try {
      const lat = parseFloat(sessionStorage.getItem("sp_geo_lat") ?? "");
      const lng = parseFloat(sessionStorage.getItem("sp_geo_lng") ?? "");
      if (!isNaN(lat) && !isNaN(lng)) return [lat, lng];
    } catch {}
    return [20, 0]; // neutral world center until geolocation resolves
  });

  // Request the browser's real location on mount; cache it so next visit is instant.
  useEffect(() => {
    if (!navigator.geolocation) return;
    const alreadyCached = !!sessionStorage.getItem("sp_geo_lat");
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude: lat, longitude: lng } }) => {
        try {
          sessionStorage.setItem("sp_geo_lat", String(lat));
          sessionStorage.setItem("sp_geo_lng", String(lng));
        } catch {}
        // Only fly if we didn't already have a cached position (so we don't
        // override a position the profile-based centering already set).
        if (!alreadyCached) {
          mapRef.current?.flyTo(lat, lng, 12);
        }
      },
      () => {}, // permission denied — keep current center
      { timeout: 10000, maximumAge: 5 * 60 * 1000 },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fly to the user's onboarding location once it's known — never overrides their stored data
  const hasCenteredRef = useRef(false);
  useEffect(() => {
    if (hasCenteredRef.current) return;

    // Artist: use stored coordinates directly
    if (myArtist?.latitude && myArtist?.longitude) {
      hasCenteredRef.current = true;
      mapRef.current?.flyTo(myArtist.latitude, myArtist.longitude, 11);
      return;
    }

    // Fan / venue: geocode their city name via Nominatim
    const city = profile?.city;
    if (!city || profile?.role === "artist") return;
    hasCenteredRef.current = true;
    fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`,
      { headers: { "Accept-Language": "en" } },
    )
      .then((r) => r.json() as Promise<{ lat: string; lon: string }[]>)
      .then(([hit]) => {
        if (hit) mapRef.current?.flyTo(parseFloat(hit.lat), parseFloat(hit.lon), 11);
      })
      .catch(() => {});
  }, [myArtist, profile]);
  // Vibe / lyrics search mode
  const [lyricsMode, setLyricsMode] = useState(false);
  const [vibeResults, setVibeResults] = useState<MxTrack[]>([]);
  const [vibeLoading, setVibeLoading] = useState(false);
  const [vibeSearched, setVibeSearched] = useState(false);
  const [cyaniteAnalysis, setCyaniteAnalysis] = useState<CyaniteAnalysis | null>(null);
  const [artistStats, setArtistStats] = useState<ArtistStats | null>(null);
  const [artistStatsLoading, setArtistStatsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapRef = useRef<MapHandle>(null);

  // Heatmap data from Songstats-weighted /api/map/heatmap
  const [heatPoints, setHeatPoints] = useState<HeatPoint[]>([]);
  const [heatLoading, setHeatLoading] = useState(false);

  useEffect(() => {
    if (!showHeatmap) return;
    if (heatPoints.length > 0) return; // already loaded
    setHeatLoading(true);
    fetch("/api/map/heatmap")
      .then((r) => r.json() as Promise<{ points: Array<{ lat: number; lng: number; traction: number }> }>)
      .then((d) => {
        setHeatPoints((d.points ?? []).map((p) => [p.lat, p.lng, p.traction] as HeatPoint));
      })
      .catch(() => {})
      .finally(() => setHeatLoading(false));
  }, [showHeatmap, heatPoints.length]);

  // Enriched images keyed by pin id — filled lazily from Deezer for pins with no imageUrl
  const [enrichedImages, setEnrichedImages] = useState<Record<string, string>>({});

  // JamBase live pins
  const [jambasePins, setJambasePins] = useState<JambasePin[]>([]);
  const [jambaseLoading, setJambaseLoading] = useState(false);
  const [bboxTooLarge, setBboxTooLarge] = useState(false);
  const boundsRef = useRef<MapBounds | null>(null);
  const jbDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const globalModeRef = useRef(globalMode);
  globalModeRef.current = globalMode;

  // Scene Radio
  const [radioActive, setRadioActive] = useState(false);

  // Karaoke modal
  const [karaokePin, setKaraokePin] = useState<ScenePin | null>(null);

  // Fingerprint panel
  const [fingerprintOpen, setFingerprintOpen] = useState(false);

  // Setlist panel
  const [setlistVenue, setSetlistVenue] = useState<{ id: string; name: string } | null>(null);

  const pins = (data?.pins ?? []) as ScenePin[];

  // Lazily enrich images from Deezer for any pin (app-DB or JamBase-derived) that
  // has no imageUrl. At most 20 in-flight at once; results stored in enrichedImages
  // so the map icons re-render with real photos as they arrive.
  useEffect(() => {
    // Collect all named entities that need an image
    const missing: { id: string; name: string }[] = [];
    const seen = new Set<string>();

    for (const p of pins) {
      if (!p.imageUrl && !seen.has(p.id)) {
        seen.add(p.id);
        missing.push({ id: p.id, name: p.name });
      }
    }
    for (const p of jambasePins) {
      // performers inside jambase events
      for (const perf of p.performers) {
        if (!perf.image && perf.identifier && !seen.has(perf.identifier)) {
          seen.add(perf.identifier);
          missing.push({ id: perf.identifier, name: perf.name });
        }
      }
      // venue itself
      if (!p.imageUrl && p.venueIdentifier && !seen.has(p.venueIdentifier)) {
        seen.add(p.venueIdentifier);
        missing.push({ id: p.venueIdentifier, name: p.venueName });
      }
    }

    // Only request those not already enriched
    const toFetch = missing.filter((m) => !enrichedImages[m.id]);
    if (toFetch.length === 0) return;

    let cancelled = false;
    const CONCURRENCY = 20;
    let cursor = 0;

    const worker = async () => {
      while (cursor < toFetch.length) {
        const item = toFetch[cursor++];
        try {
          const res = await fetch(`/api/images/artist?name=${encodeURIComponent(item.name)}`);
          if (!res.ok || cancelled) continue;
          const json = (await res.json()) as { imageUrl: string | null };
          if (json.imageUrl && !cancelled) {
            setEnrichedImages((prev) => ({ ...prev, [item.id]: json.imageUrl! }));
          }
        } catch { /* ignore */ }
      }
    };

    Promise.all(Array.from({ length: Math.min(CONCURRENCY, toFetch.length) }, worker));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, jambasePins]);

  // Fetch JamBase live pins when bounds change (Local mode — viewport scoped)
  const handleBoundsChange = useCallback((bounds: MapBounds) => {
    boundsRef.current = bounds;
    if (globalMode) return; // Global mode fetches worldwide hubs separately
    if (jbDebounceRef.current) clearTimeout(jbDebounceRef.current);
    jbDebounceRef.current = setTimeout(async () => {
      const b = boundsRef.current;
      if (!b || globalModeRef.current) return; // bail if we've switched to Global
      const latSpan = b.neLat - b.swLat;
      const lngSpan = b.neLng - b.swLng;
      if (latSpan > 25 || lngSpan > 25) {
        // Viewport is too wide for JamBase — clear existing pins and flag it
        setBboxTooLarge(true);
        setJambasePins([]);
        setJambaseLoading(false);
        return;
      }
      setBboxTooLarge(false);
      setJambaseLoading(true);
      try {
        const res = await fetch(
          `/api/jambase/events?swLat=${b.swLat}&swLng=${b.swLng}&neLat=${b.neLat}&neLng=${b.neLng}`,
        );
        const json = (await res.json()) as { pins?: JambasePin[] };
        // Ignore a stale local response if the user switched to Global meanwhile
        if (!globalModeRef.current) setJambasePins(json.pins ?? []);
      } catch {
        // silently fail — local pins still show
      }
      if (!globalModeRef.current) setJambaseLoading(false);
    }, 800);
  }, [globalMode]);

  // Global mode: fetch live events from major music hubs worldwide
  useEffect(() => {
    if (!globalMode) return;
    // Cancel any pending local viewport fetch so it can't overwrite global pins
    if (jbDebounceRef.current) clearTimeout(jbDebounceRef.current);
    let cancelled = false;
    setBboxTooLarge(false);
    setJambaseLoading(true);
    fetch("/api/jambase/events/global")
      .then((r) => r.json() as Promise<{ pins?: JambasePin[] }>)
      .then((json) => {
        if (!cancelled) setJambasePins(json.pins ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setJambaseLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [globalMode]);

  // Spotify artist URL detection — works in both normal and vibe mode.
  // Whenever the user pastes an artist URL we fetch Songstats immediately.
  useEffect(() => {
    const id = extractSpotifyArtistId(query);
    if (!id) {
      setArtistStats(null);
      return;
    }
    let cancelled = false;
    setArtistStatsLoading(true);
    setArtistStats(null);
    fetch(`/api/songstats/artist-stats?spotifyArtistId=${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!cancelled && d) {
          setArtistStats({
            spotifyArtistId: id,
            monthlyListeners: d.monthlyListeners ?? null,
            followersTotal: d.followersTotal ?? null,
            popularity: d.popularity ?? null,
            playlistReachCurrent: d.playlistReachCurrent ?? null,
            playlistsCurrent: d.playlistsCurrent ?? null,
          });
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setArtistStatsLoading(false); });
    return () => { cancelled = true; };
  }, [query]);

  // Debounced vibe search
  useEffect(() => {
    if (!lyricsMode) { setVibeResults([]); setVibeSearched(false); setCyaniteAnalysis(null); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) { setVibeResults([]); setVibeSearched(false); setCyaniteAnalysis(null); return; }
    setVibeLoading(true);
    const spotify = isSpotifyLink(q);
    debounceRef.current = setTimeout(async () => {
      if (spotify) {
        try {
          const res = await fetch(`/api/cyanite/from-spotify?url=${encodeURIComponent(q)}`);
          const json = (await res.json()) as {
            analysis?: CyaniteAnalysis;
            similarTracks?: { artistName: string; trackName: string; title: string }[];
          };
          setCyaniteAnalysis(json.analysis ?? null);
          setVibeResults(
            (json.similarTracks ?? []).map((t, i) => ({
              trackId: i + 1,
              trackName: t.trackName || t.title,
              artistName: t.artistName,
              albumName: "",
            })),
          );
        } catch { setVibeResults([]); setCyaniteAnalysis(null); }
      } else {
        setCyaniteAnalysis(null);
        try {
          const res = await fetch(`/api/musixmatch/search?q=${encodeURIComponent(q)}`);
          const json = (await res.json()) as { tracks?: MxTrack[] };
          setVibeResults(json.tracks ?? []);
        } catch { setVibeResults([]); }
      }
      setVibeLoading(false);
      setVibeSearched(true);
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [lyricsMode, query]);

  const toggleLyricsMode = () => {
    setLyricsMode((m) => {
      if (m) { setQuery(""); setVibeResults([]); setVibeSearched(false); }
      return !m;
    });
  };

  // Unique venue pins derived from JamBase events — works in both local and global
  // mode so the "Venues" filter always shows real venue locations from live data.
  const jambaseVenuePins = useMemo<ScenePin[]>(() => {
    const seen = new globalThis.Map<string, ScenePin>();
    for (const ev of jambasePins) {
      if (ev.venueIdentifier && !seen.has(ev.venueIdentifier)) {
        seen.set(ev.venueIdentifier, {
          id: ev.venueIdentifier,
          kind: "venue",
          name: ev.venueName,
          latitude: ev.latitude,
          longitude: ev.longitude,
          city: ev.city ?? null,
          imageUrl: ev.imageUrl ?? null,
          externalUrl: ev.venueUrl ?? null,
        });
      }
    }
    return [...seen.values()];
  }, [jambasePins]);

  // Artist pins derived from JamBase performers — works in both local and global mode.
  // This ensures the "Artists" filter always shows real artists even when nobody
  // has self-registered in the app yet.
  const jambaseArtistPins = useMemo<ScenePin[]>(() => {
    const seen = new globalThis.Map<string, ScenePin>();
    for (const ev of jambasePins) {
      ev.performers.forEach((p, i) => {
        if (!p.identifier || seen.has(p.identifier)) return;
        seen.set(p.identifier, {
          id: p.identifier,
          kind: "artist",
          name: p.name,
          // Nudge overlapping performers off the exact venue coordinate
          latitude: ev.latitude + (i % 4) * 0.012,
          longitude: ev.longitude + (Math.floor(i / 4)) * 0.012,
          city: ev.city ?? null,
          imageUrl: p.image ?? null,
          externalUrl: p.url ?? null,
          genre: p.genre[0] ?? null,
        });
      });
    }
    return [...seen.values()];
  }, [jambasePins]);

  const localArtistNames = useMemo(
    () => new Set([
      ...pins.filter((p) => p.kind === "artist").map((p) => p.name.toLowerCase()),
      ...jambaseArtistPins.map((p) => p.name.toLowerCase()),
    ]),
    [pins, jambaseArtistPins],
  );
  const localArtistNamesNorm = useMemo(
    () => new Set([
      ...pins.filter((p) => p.kind === "artist").map((p) => normalizeArtistName(p.name)),
      ...jambaseArtistPins.map((p) => normalizeArtistName(p.name)),
    ]),
    [pins, jambaseArtistPins],
  );

  // Global mode: combine JamBase-derived artists + venues (no app-DB worldwide dataset)
  const globalDerivedPins = useMemo<ScenePin[]>(() => {
    if (!globalMode) return [];
    return [...jambaseArtistPins, ...jambaseVenuePins];
  }, [globalMode, jambaseArtistPins, jambaseVenuePins]);

  const visiblePins = useMemo(() => {
    let result: ScenePin[];
    if (globalMode) {
      result = globalDerivedPins;
    } else {
      // Local mode: app-DB pins + JamBase performers + JamBase venues.
      // Deduplicate JamBase entries that are already in the app DB.
      const appIds = new Set(pins.map((p) => p.id));
      const newJbArtists = jambaseArtistPins.filter((a) => !appIds.has(a.id));
      const newJbVenues = jambaseVenuePins.filter((v) => !appIds.has(v.id));
      result = [...pins, ...newJbArtists, ...newJbVenues];
    }

    if (activeFilter === "live") return [];
    if (activeFilter !== "all") {
      result = result.filter((p) => p.kind === activeFilter);
    }
    if (!lyricsMode && query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || (p.city ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [pins, globalDerivedPins, jambaseArtistPins, jambaseVenuePins, activeFilter, query, lyricsMode, globalMode]);

  // Show JamBase event pins for "live", "all", and "venue" filters.
  // Hidden for "artist" because performers are now shown as individual artist pins.
  const visibleJambasePins = useMemo(() => {
    if (activeFilter === "artist" || activeFilter === "event") return [];
    if (!lyricsMode && query.trim()) {
      const q = query.toLowerCase();
      return jambasePins.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.venueName.toLowerCase().includes(q) ||
          p.performers.some((pf) => pf.name.toLowerCase().includes(q)),
      );
    }
    return jambasePins;
  }, [jambasePins, activeFilter, query, lyricsMode]);

  const handleFindOnMap = (artistName: string) => {
    const nameLower = artistName.toLowerCase();
    // Search app-DB artists first, then JamBase-derived artist pins
    const allArtists = [
      ...pins.filter((p) => p.kind === "artist"),
      ...jambaseArtistPins,
    ];
    const pin =
      allArtists.find((p) => p.name.toLowerCase() === nameLower) ??
      allArtists.find((p) => p.name.toLowerCase().includes(nameLower));
    setLyricsMode(false);
    setQuery(artistName);
    if (pin) {
      mapRef.current?.flyTo(pin.latitude, pin.longitude);
    } else {
      toast({
        title: `${artistName} isn't on the map yet`,
        description: "This artist hasn't been added to your local scene.",
        duration: 3000,
      });
    }
  };

  const localMatches = vibeResults.filter((t) => localArtistNamesNorm.has(normalizeArtistName(t.artistName)));

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <div className="absolute inset-0">
        <SceneMap
          ref={mapRef}
          pins={visiblePins.map((p) =>
            enrichedImages[p.id] && !p.imageUrl ? { ...p, imageUrl: enrichedImages[p.id] } : p
          )}
          jambasePins={visibleJambasePins.map((p) => ({
            ...p,
            imageUrl: p.imageUrl ?? enrichedImages[p.venueIdentifier] ?? null,
            performers: p.performers.map((perf) => ({
              ...perf,
              image: perf.image ?? enrichedImages[perf.identifier] ?? null,
            })),
          }))}
          heatPoints={heatPoints}
          center={mapCenter}
          zoom={mapCenter[0] === 20 && mapCenter[1] === 0 ? 2 : 12}
          mapStyle={mapStyle}
          showHeatmap={showHeatmap}
          globalMode={globalMode}
          onKaraoke={setKaraokePin}
          onBoundsChange={handleBoundsChange}
          onSetlistOpen={(id, name) => setSetlistVenue({ id, name })}
        />
      </div>

      {/* Top overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] p-3 sm:p-4">
        <div className="mx-auto flex max-w-7xl items-start justify-between gap-2 sm:gap-3">

          {/* Left: search + filters + vibe results */}
          <div className="flex w-full max-w-xl flex-col gap-2 sm:gap-3 min-w-0">

            {/* Search bar */}
            <div
              className={cn(
                "pointer-events-auto flex items-center gap-2 rounded-2xl border px-3 py-2 shadow-xl transition-all duration-300",
                lyricsMode ? "glass border-primary/40 shadow-primary/20" : "glass border-white/10",
              )}
            >
              {vibeLoading ? (
                <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : (
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={lyricsMode ? "Type a vibe, mood, or paste lyrics…" : "Search artists, venues, shows…"}
                className="h-7 sm:h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 text-sm"
              />
              {query && (
                <button
                  onClick={() => { setQuery(""); setVibeResults([]); setVibeSearched(false); setArtistStats(null); }}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <Button
                size="icon"
                onClick={toggleLyricsMode}
                className={cn(
                  "h-7 w-7 sm:h-8 sm:w-8 shrink-0 rounded-xl transition-all duration-200",
                  lyricsMode
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/40"
                    : "bg-gradient-to-br from-primary to-secondary",
                )}
                aria-label="Toggle vibe search"
                title={lyricsMode ? "Exit vibe search" : "Search by lyric vibe or mood"}
              >
                <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
            </div>

            {/* Spotify artist stats card — shown whenever a Spotify artist URL is pasted */}
            {(artistStatsLoading || artistStats) && (
              <div
                className="pointer-events-auto rounded-2xl border border-[#1DB954]/30 shadow-2xl overflow-hidden"
                style={{ background: "rgba(10,20,15,0.96)", backdropFilter: "blur(16px)" }}
              >
                {artistStatsLoading ? (
                  <div className="flex items-center gap-2 px-4 py-3">
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#1DB954] border-t-transparent" />
                    <span className="text-xs text-white/50">Fetching Spotify stats…</span>
                  </div>
                ) : artistStats && (
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-[#1DB954] shrink-0"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.5 17.3a.75.75 0 0 1-1.03.247c-2.82-1.722-6.37-2.11-10.55-1.157a.75.75 0 1 1-.334-1.462c4.575-1.043 8.504-.594 11.67 1.339a.75.75 0 0 1 .244 1.033zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.227-1.983-8.145-2.558-11.963-1.4a.938.938 0 0 1-.58-1.787c4.363-1.339 9.79-.69 13.52 1.587a.94.94 0 0 1 .313 1.29zm.127-3.403c-3.868-2.298-10.248-2.51-13.944-1.388a1.125 1.125 0 1 1-.653-2.154c4.243-1.287 11.296-1.038 15.753 1.605a1.125 1.125 0 0 1-1.156 1.937z"/></svg>
                        <span className="text-xs font-bold text-[#1DB954] uppercase tracking-widest">Songstats</span>
                      </div>
                      <a
                        href={`https://open.spotify.com/artist/${artistStats.spotifyArtistId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-white/30 hover:text-[#1DB954] transition-colors"
                      >
                        Open in Spotify ↗
                      </a>
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      <div>
                        <div className="text-lg font-bold text-white leading-none">
                          {fmtNum(artistStats.monthlyListeners)}
                        </div>
                        <div className="text-[10px] text-white/40 mt-0.5">monthly listeners</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-white leading-none">
                          {fmtNum(artistStats.followersTotal)}
                        </div>
                        <div className="text-[10px] text-white/40 mt-0.5">followers</div>
                      </div>
                      {artistStats.playlistsCurrent != null && (
                        <div>
                          <div className="text-lg font-bold text-white leading-none">
                            {fmtNum(artistStats.playlistsCurrent)}
                          </div>
                          <div className="text-[10px] text-white/40 mt-0.5">playlists</div>
                        </div>
                      )}
                      {artistStats.playlistReachCurrent != null && (
                        <div>
                          <div className="text-lg font-bold text-white leading-none">
                            {fmtNum(artistStats.playlistReachCurrent)}
                          </div>
                          <div className="text-[10px] text-white/40 mt-0.5">playlist reach</div>
                        </div>
                      )}
                    </div>

                    {/* Popularity bar */}
                    {artistStats.popularity != null && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-white/40">Spotify popularity</span>
                          <span className="text-[10px] font-semibold text-white/70">{artistStats.popularity}/100</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#1DB954] to-[#3dffa0] transition-all duration-700"
                            style={{ width: `${artistStats.popularity}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Find on map */}
                    {(() => {
                      const match = [...visiblePins, ...jambaseArtistPins].find(
                        (p) => p.kind === "artist" && p.spotifyUrl?.includes(artistStats.spotifyArtistId)
                      );
                      return match ? (
                        <button
                          onClick={() => mapRef.current?.flyTo(match.latitude, match.longitude)}
                          className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#1DB954]/15 border border-[#1DB954]/30 px-3 py-1.5 text-xs font-semibold text-[#1DB954] hover:bg-[#1DB954]/25 transition-colors"
                        >
                          <MapPin className="h-3 w-3" /> Find on map
                        </button>
                      ) : null;
                    })()}

                    {/* All nulls = no data from Songstats */}
                    {artistStats.monthlyListeners == null && artistStats.followersTotal == null && (
                      <p className="text-xs text-white/30 mt-1">
                        No data found — artist may not be indexed by Songstats yet.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Vibe mode hint */}
            {lyricsMode && !query && (
              <div className="pointer-events-none glass rounded-xl border border-primary/20 px-3 py-2">
                <p className="text-xs text-primary font-medium mb-0.5">Vibe Search active</p>
                <p className="text-[11px] text-muted-foreground">
                  Type a mood like <span className="text-foreground">"heartbreak"</span>, paste lyrics, or drop a{" "}
                  <span className="text-foreground">Spotify track link</span> to find similar artists.
                </p>
              </div>
            )}

            {/* Vibe results panel */}
            {lyricsMode && vibeSearched && (
              <div
                className="pointer-events-auto rounded-2xl border border-white/15 shadow-2xl overflow-hidden max-h-72 overflow-y-auto"
                style={{ background: "rgba(12,10,22,0.96)", backdropFilter: "blur(16px)" }}
              >
                {/* Cyanite track analysis (Spotify link mode) */}
                {cyaniteAnalysis && (
                  <div className="border-b border-white/10 px-3 py-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-semibold text-white">Track analysis</span>
                      <span className="ml-auto text-[9px] text-white/30 uppercase tracking-widest">Cyanite</span>
                    </div>
                    {cyaniteAnalysis.status === "finished" ? (
                      <div className="space-y-1.5">
                        {(cyaniteAnalysis.moodTags?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap gap-1 items-center">
                            <span className="text-[10px] text-white/40 w-12">Mood</span>
                            {cyaniteAnalysis.moodTags!.slice(0, 5).map((t) => (
                              <span key={t} className="rounded-full bg-primary/25 px-2 py-0.5 text-[10px] text-primary">{prettyTag(t)}</span>
                            ))}
                          </div>
                        )}
                        {(cyaniteAnalysis.genreTags?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap gap-1 items-center">
                            <span className="text-[10px] text-white/40 w-12">Genre</span>
                            {cyaniteAnalysis.genreTags!.slice(0, 5).map((t) => (
                              <span key={t} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/70">{prettyTag(t)}</span>
                            ))}
                          </div>
                        )}
                        {(cyaniteAnalysis.bpm || cyaniteAnalysis.energyLevel) && (
                          <p className="text-[10px] text-white/40">
                            {cyaniteAnalysis.bpm ? `${Math.round(cyaniteAnalysis.bpm)} BPM` : ""}
                            {cyaniteAnalysis.bpm && cyaniteAnalysis.energyLevel ? " · " : ""}
                            {cyaniteAnalysis.energyLevel ? `${prettyTag(cyaniteAnalysis.energyLevel)} energy` : ""}
                          </p>
                        )}
                      </div>
                    ) : cyaniteAnalysis.status === "processing" ? (
                      <p className="text-[11px] text-white/50">Cyanite is still analysing this track — check back shortly.</p>
                    ) : cyaniteAnalysis.status === "notAuthorized" ? (
                      <p className="text-[11px] text-white/50">
                        Mood/genre tagging isn't enabled for Spotify tracks on this Cyanite plan. Showing similar artists below instead.
                      </p>
                    ) : (
                      <p className="text-[11px] text-white/50">
                        Track analysis is currently unavailable — showing similar artists below.
                      </p>
                    )}
                  </div>
                )}
                {vibeResults.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-6 text-center px-4">
                    <Music2 className="h-7 w-7 text-white/20" />
                    <p className="text-sm text-white/60">
                      {cyaniteAnalysis ? "No similar artists found" : "No tracks found for this vibe"}
                    </p>
                    <p className="text-xs text-white/30">
                      {cyaniteAnalysis ? "Try a different track" : "Try a different mood or fewer lyrics"}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-white/10">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-semibold text-white">
                          {cyaniteAnalysis ? `${vibeResults.length} similar tracks` : `${vibeResults.length} tracks matched`}
                        </span>
                        {localMatches.length > 0 && (
                          <span className="rounded-full bg-primary/30 px-2 py-0.5 text-[10px] font-bold text-primary">
                            {localMatches.length} on map
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-white/30 uppercase tracking-widest">{cyaniteAnalysis ? "Cyanite" : "Musixmatch"}</span>
                    </div>
                    <div className="divide-y divide-white/5">
                      {vibeResults.map((track) => {
                        const isLocal = localArtistNamesNorm.has(normalizeArtistName(track.artistName));
                        return (
                          <div key={track.trackId} className={cn("flex items-center gap-3 px-3 py-2.5", isLocal && "bg-primary/10")}>
                            <Music2 className="h-4 w-4 shrink-0 text-white/25" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{track.trackName}</p>
                              <p className="text-xs text-white/50 truncate">
                                {track.artistName}{track.albumName ? ` · ${track.albumName}` : ""}
                              </p>
                            </div>
                            {isLocal ? (
                              <button
                                onClick={() => handleFindOnMap(track.artistName)}
                                className="shrink-0 flex items-center gap-1 rounded-full bg-primary/30 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/50 transition-colors"
                              >
                                <MapPin className="h-3 w-3" />
                                On map
                              </button>
                            ) : (
                              <span className="shrink-0 text-[10px] text-white/25 italic">not local</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Toggle switches + filter buttons */}
            {!lyricsMode && (
              <div className="pointer-events-auto flex flex-col gap-2">

                {/* Toggle row — Local and Heatmap */}
                <div className="glass border border-white/10 rounded-2xl px-3 py-2 flex items-center gap-4 shadow-lg w-fit">
                  {/* Local / Global */}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    {globalMode
                      ? <Globe className="h-3.5 w-3.5 text-secondary shrink-0" />
                      : <LocateFixed className="h-3.5 w-3.5 text-primary shrink-0" />
                    }
                    <span className={cn(
                      "text-xs font-semibold transition-colors",
                      globalMode ? "text-secondary" : "text-primary",
                    )}>
                      {globalMode ? "Global" : "Local"}
                    </span>
                    <Switch
                      checked={!globalMode}
                      onCheckedChange={(v) => setGlobalMode(!v)}
                      className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-secondary/50"
                    />
                  </label>

                  <div className="w-px h-4 bg-white/10 shrink-0" />

                  {/* Heatmap */}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <Flame className={cn(
                      "h-3.5 w-3.5 shrink-0 transition-colors",
                      showHeatmap ? "text-orange-400" : "text-muted-foreground",
                    )} />
                    <div className="flex flex-col leading-none">
                      <span className={cn(
                        "text-xs font-semibold transition-colors",
                        showHeatmap ? "text-orange-400" : "text-muted-foreground",
                      )}>
                        Traction
                      </span>
                      {showHeatmap && (
                        <span className="text-[9px] text-orange-400/60 uppercase tracking-wide">Spotify listeners</span>
                      )}
                    </div>
                    <Switch
                      checked={showHeatmap}
                      onCheckedChange={setShowHeatmap}
                      className="data-[state=checked]:bg-orange-500 data-[state=unchecked]:bg-input"
                    />
                  </label>
                </div>

                {/* Category filter — segmented toggle buttons */}
                {!showHeatmap && (
                  <div className="flex overflow-x-auto gap-1.5 scrollbar-none pb-0.5">
                    {FILTERS.map((f) => {
                      const Icon = f.icon;
                      const active = activeFilter === f.key;
                      return (
                        <button
                          key={f.key}
                          onClick={() => setActiveFilter(f.key)}
                          className={cn(
                            "shrink-0 flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-md transition-all duration-150",
                            active
                              ? f.key === "live"
                                ? "border-amber-500/60 bg-amber-500/20 text-amber-300 shadow-amber-500/10"
                                : "border-primary/60 bg-primary/20 text-foreground shadow-primary/10"
                              : "glass border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20",
                          )}
                        >
                          {f.key === "live" && active && (
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                          )}
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          <span>{f.label}</span>
                          {f.badge && (
                            <span className="hidden sm:inline rounded-md bg-foreground/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-foreground/70">
                              {f.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}

                    {/* Fingerprint button */}
                    <button
                      onClick={() => setFingerprintOpen(true)}
                      className={cn(
                        "shrink-0 flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-md transition-all duration-150",
                        fingerprintOpen
                          ? "border-secondary/60 bg-secondary/20 text-foreground"
                          : "glass border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20",
                      )}
                    >
                      <Fingerprint className="h-3.5 w-3.5 shrink-0" />
                      <span>ID this song</span>
                      <span className="hidden sm:inline rounded-md bg-foreground/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-foreground/70">
                        LIVE
                      </span>
                    </button>
                  </div>
                )}

              </div>
            )}

            {/* Exit vibe mode row */}
            {lyricsMode && (
              <div className="pointer-events-auto flex items-center gap-2">
                <button
                  onClick={toggleLyricsMode}
                  className="flex items-center gap-1.5 rounded-full glass border border-white/10 px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3 w-3" />
                  Exit vibe search
                </button>
                <button
                  onClick={() => setFingerprintOpen(true)}
                  className="flex items-center gap-1.5 rounded-full glass border border-white/10 px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Fingerprint className="h-3 w-3" />
                  ID a song instead
                </button>
              </div>
            )}
          </div>

          {/* Right controls */}
          <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Map style toggle — cycles auto ↔ satellite like ThemeToggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMapStyle((s) => s === "satellite" ? "auto" : "satellite")}
              className={cn(
                "h-11 w-11 rounded-2xl glass border border-white/10 transition-all duration-200 hover:border-primary/50 hover:text-primary active:scale-90",
                mapStyle === "satellite" && "border-primary/50 text-primary",
              )}
              aria-label={mapStyle === "satellite" ? "Switch to default map" : "Switch to satellite"}
            >
              {mapStyle === "satellite"
                ? <Map className="h-5 w-5 transition-transform duration-300" />
                : <Satellite className="h-5 w-5 transition-transform duration-300" />
              }
            </Button>
            <ThemeToggle />
            <NotificationsMenu
              liveEvents={jambasePins.slice(0, 4).map((p) => ({
                id: p.id,
                name: p.name,
                venueName: p.venueName,
                startDate: p.startDate,
                performers: p.performers.map((pf) => ({ name: pf.name, isHeadliner: pf.isHeadliner })),
              }))}
              newArtistCount={pins.filter((p) => p.kind === "artist").length > 0 ? Math.min(pins.filter((p) => p.kind === "artist").length, 5) : 0}
            />
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="rounded-2xl ring-2 ring-white/10 transition hover:ring-primary/50">
                    <Avatar className="h-9 w-9 sm:h-11 sm:w-11">
                      <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-white text-sm">
                        {(user.email ?? "U").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="glass-card border-white/10">
                  <DropdownMenuItem asChild><Link href="/dashboard">Dashboard</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link href="/settings">Profile & settings</Link></DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => signOut()}>Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                onClick={() => setAuthOpen(true)}
                className="h-9 sm:h-11 rounded-2xl bg-gradient-to-br from-primary to-secondary px-3 sm:px-5 text-sm font-semibold shadow-lg shadow-primary/20 transition-all duration-200 hover:shadow-primary/40 hover:brightness-110 active:scale-95"
              >
                Sign in
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Status chips — bottom right */}
      {/* Scene Radio — floating button bottom-left */}
      <div className="pointer-events-none absolute bottom-24 left-4 z-[1000]">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setRadioActive((v) => !v)}
          className={cn(
            "pointer-events-auto h-11 w-11 rounded-2xl glass border border-white/10 transition-all duration-200 hover:border-primary/50 hover:text-primary active:scale-90",
            radioActive && "border-primary/50 text-primary bg-primary/10",
          )}
          aria-label="Toggle Scene Radio"
        >
          <Radio className={cn("h-5 w-5", radioActive && "animate-pulse")} />
        </Button>
      </div>

      <div className="pointer-events-none absolute bottom-4 sm:bottom-6 right-3 sm:right-4 z-[1000] flex flex-col items-end gap-2">
        {heatLoading && (
          <span className="flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs text-orange-300/90">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
            Pulling Spotify traction…
          </span>
        )}
        {!heatLoading && showHeatmap && heatPoints.length > 0 && (
          <span className="flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs text-orange-300/90">
            <Flame className="h-3 w-3 text-orange-400" />
            {heatPoints.length} artists · intensity = monthly listeners
          </span>
        )}
        {jambaseLoading && (
          <span className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-300/90">
            <Radio className="h-3 w-3 animate-pulse" />
            Loading live shows…
          </span>
        )}
        {!jambaseLoading && bboxTooLarge && (activeFilter === "live" || activeFilter === "all") && (
          <button
            onClick={() => mapRef.current?.flyTo(
              (boundsRef.current ? (boundsRef.current.swLat + boundsRef.current.neLat) / 2 : 20),
              (boundsRef.current ? (boundsRef.current.swLng + boundsRef.current.neLng) / 2 : 0),
              8,
            )}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-300/90 hover:bg-amber-500/20 transition-colors"
          >
            <Radio className="h-3 w-3" />
            Zoom in for live shows — tap to focus
          </button>
        )}
        {!jambaseLoading && !bboxTooLarge && visibleJambasePins.length > 0 && (
          <span className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-300/90">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            {visibleJambasePins.length} live {visibleJambasePins.length === 1 ? "show" : "shows"} nearby
          </span>
        )}
        {isLoading && (
          <span className="rounded-full glass border border-white/10 px-3 py-1 text-xs text-muted-foreground">
            Loading the scene…
          </span>
        )}
        {!isSupabaseConfigured && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-300/90">
            Demo mode · accounts disabled
          </span>
        )}
      </div>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />

      {karaokePin && (
        <KaraokeModal
          artistName={karaokePin.name}
          artistImageUrl={karaokePin.imageUrl}
          spotifyUrl={karaokePin.spotifyUrl ?? undefined}
          onClose={() => setKaraokePin(null)}
        />
      )}

      <FingerprintPanel
        open={fingerprintOpen}
        onClose={() => setFingerprintOpen(false)}
        onFindOnMap={handleFindOnMap}
      />

      {setlistVenue && (
        <SetlistPanel
          venueIdentifier={setlistVenue.id}
          venueName={setlistVenue.name}
          onClose={() => setSetlistVenue(null)}
        />
      )}

      {radioActive && (
        <SceneRadio
          lat={mapCenter[0]}
          lng={mapCenter[1]}
          city={profile?.city ?? visiblePins[0]?.city ?? undefined}
          artists={visiblePins
            .filter((p) => p.kind === "artist")
            .slice(0, 10)
            .map((p) => ({ name: p.name, genre: p.genre }))}
          venues={visiblePins
            .filter((p) => p.kind === "venue")
            .slice(0, 8)
            .map((p) => ({ name: p.name, city: p.city }))}
          liveEvents={jambasePins.slice(0, 6).map((p) => ({
            name: p.name,
            venueName: p.venueName,
            startDate: p.startDate,
            performers: p.performers,
          }))}
          onStop={() => setRadioActive(false)}
        />
      )}
    </div>
  );
}
