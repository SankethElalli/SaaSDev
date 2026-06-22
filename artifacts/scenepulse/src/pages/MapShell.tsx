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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

interface VibeMatchedArtist {
  id: string;
  artistName: string;
  city: string | null;
  imageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  matchScore: number;
  matchedTags: string[];
  distanceKm: number | null;
  proximityLabel: string;
}

interface HeatArtist {
  artistId: string;
  artistName: string;
  lat: number;
  lng: number;
  traction: number;
  city: string | null;
  imageUrl: string | null;
  genre: string | null;
  spotifyUrl: string | null;
  monthlyListeners: number | null;
}

interface HeatClickResult {
  lat: number;
  lng: number;
  zoom: number;
  radiusKm: number;
  artists: (HeatArtist & { distanceKm: number })[];
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function zoomToRadiusKm(zoom: number): number {
  if (zoom >= 14) return 3;
  if (zoom >= 12) return 8;
  if (zoom >= 10) return 25;
  if (zoom >= 8) return 80;
  if (zoom >= 6) return 250;
  return 500;
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

const FILTERS: { key: FilterKey; label: string; icon: typeof Users }[] = [
  { key: "artist", label: "Artists", icon: Users },
  { key: "live",   label: "Live Tonight", icon: CalendarClock },
  { key: "venue",  label: "Venues", icon: TrendingUp },
  { key: "all",    label: "All", icon: Music4 },
];


export default function MapShell() {
  const { data, isLoading } = useGetMapPins({ query: { staleTime: 60_000, gcTime: 5 * 60_000 } });
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
  const toggleHeatmap = useCallback((v: boolean) => {
    setShowHeatmap(v);
    if (!v) setHeatClickResult(null);
  }, []);

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

  // Map center — initial from sessionStorage; updated live as user pans/zooms.
  const [mapCenter, setMapCenter] = useState<[number, number]>(() => {
    try {
      const lat = parseFloat(sessionStorage.getItem("sp_geo_lat") ?? "");
      const lng = parseFloat(sessionStorage.getItem("sp_geo_lng") ?? "");
      if (!isNaN(lat) && !isNaN(lng)) return [lat, lng];
    } catch {}
    return [20, 0]; // neutral world center until geolocation resolves
  });
  // Live zoom level — used to scope vibe search results to the visible area.
  const [mapZoom, setMapZoom] = useState(12);

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
  const [vibeMatchedArtists, setVibeMatchedArtists] = useState<VibeMatchedArtist[]>([]);
  const [artistStats, setArtistStats] = useState<ArtistStats | null>(null);
  const [artistStatsLoading, setArtistStatsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapRef = useRef<MapHandle>(null);
  // Keep a ref to the live map center so the vibe search always uses the current viewport
  const mapCenterRef = useRef<[number, number]>(mapCenter);

  // Heatmap data from Songstats-weighted /api/map/heatmap
  const [heatArtists, setHeatArtists] = useState<HeatArtist[]>([]);
  const [heatLoading, setHeatLoading] = useState(false);
  const [heatClickResult, setHeatClickResult] = useState<HeatClickResult | null>(null);

  const heatPoints = useMemo<HeatPoint[]>(
    () => heatArtists.map((a) => [a.lat, a.lng, a.traction]),
    [heatArtists],
  );

  useEffect(() => {
    if (!showHeatmap) return;
    if (heatArtists.length > 0) return; // already loaded
    setHeatLoading(true);
    fetch("/api/map/heatmap")
      .then((r) => r.json() as Promise<{ points: HeatArtist[] }>)
      .then((d) => setHeatArtists(d.points ?? []))
      .catch(() => {})
      .finally(() => setHeatLoading(false));
  }, [showHeatmap, heatArtists.length]);

  const handleHeatClick = useCallback((lat: number, lng: number, zoom: number) => {
    if (heatArtists.length === 0) return;
    const radiusKm = zoomToRadiusKm(zoom);
    const nearby = heatArtists
      .map((a) => ({ ...a, distanceKm: Math.round(haversineKm(lat, lng, a.lat, a.lng)) }))
      .filter((a) => a.distanceKm <= radiusKm)
      .sort((a, b) => {
        // Primary: traction (higher = more prominent in the heat)
        // Secondary: distance (closer first within same traction tier)
        const tierA = Math.floor(a.traction * 5);
        const tierB = Math.floor(b.traction * 5);
        if (tierB !== tierA) return tierB - tierA;
        return a.distanceKm - b.distanceKm;
      })
      .slice(0, 25);
    setHeatClickResult({ lat, lng, zoom, radiusKm, artists: nearby });
  }, [heatArtists]);

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
    setMapZoom(bounds.zoom);
    setMapCenter([bounds.centerLat, bounds.centerLng]);
    mapCenterRef.current = [bounds.centerLat, bounds.centerLng];
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

  // Debounced vibe/tag search — runs in both normal and lyricsMode.
  // Spotify-link analysis is lyricsMode-only (slow + credits); tag search always runs.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) { setVibeResults([]); setVibeSearched(false); setCyaniteAnalysis(null); setVibeMatchedArtists([]); return; }
    const spotify = isSpotifyLink(q);
    // Spotify analysis only available in lyricsMode
    if (spotify && !lyricsMode) return;
    setVibeLoading(true);
    // Pass the live map center (not initial state) so proximity sorts to where you're looking
    const [userLat, userLng] = mapCenterRef.current;
    const hasLocation = !(userLat === 20 && userLng === 0); // default world-center = no real location yet
    const locationParams = hasLocation ? `&lat=${userLat}&lng=${userLng}` : "";

    debounceRef.current = setTimeout(async () => {
      if (spotify) {
        // Spotify track URL → Cyanite audio analysis + tag-matched ScenePulse artists
        try {
          const res = await fetch(`/api/cyanite/from-spotify?url=${encodeURIComponent(q)}${locationParams}`);
          const json = (await res.json()) as {
            analysis?: CyaniteAnalysis;
            similarTracks?: { artistName: string; trackName: string; title: string }[];
            matchedArtists?: VibeMatchedArtist[];
          };
          setCyaniteAnalysis(json.analysis ?? null);
          setVibeMatchedArtists(json.matchedArtists ?? []);
          setVibeResults(
            (json.similarTracks ?? []).map((t, i) => ({
              trackId: i + 1,
              trackName: t.trackName || t.title,
              artistName: t.artistName,
              albumName: "",
            })),
          );
        } catch { setVibeResults([]); setCyaniteAnalysis(null); setVibeMatchedArtists([]); }
      } else {
        // Text search → keyword-based tag matching against ScenePulse artists
        setCyaniteAnalysis(null);
        setVibeResults([]);
        try {
          const res = await fetch(`/api/cyanite/tag-search?q=${encodeURIComponent(q)}${locationParams}`);
          const json = (await res.json()) as { matchedArtists?: VibeMatchedArtist[] };
          setVibeMatchedArtists(json.matchedArtists ?? []);
        } catch { setVibeMatchedArtists([]); }
      }
      setVibeLoading(false);
      setVibeSearched(true);
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [lyricsMode, query]);

  const toggleLyricsMode = () => {
    setLyricsMode((m) => {
      if (m) { setQuery(""); setVibeResults([]); setVibeSearched(false); setVibeMatchedArtists([]); setCyaniteAnalysis(null); }
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

  // Global mode: all app-DB pins (they have real registered lat/lng worldwide) plus
  // JamBase venue pins from live events. Jambase performer pins are excluded —
  // Jambase only records where a show is, not where the artist lives.
  const globalDerivedPins = useMemo<ScenePin[]>(() => {
    if (!globalMode) return [];
    const appIds = new Set(pins.map((p) => p.id));
    const newJbVenues = jambaseVenuePins.filter((v) => !appIds.has(v.id));
    return [...pins, ...newJbVenues];
  }, [globalMode, pins, jambaseVenuePins]);

  const visiblePins = useMemo(() => {
    let result: ScenePin[];
    if (globalMode) {
      result = globalDerivedPins;
    } else {
      // Local mode: app-DB pins + JamBase venue pins only.
      // Jambase performer pins are intentionally excluded — Jambase only records
      // where the show is, not where the artist lives, so placing performers at
      // venue coordinates creates a misleading cluster at a single location.
      const appIds = new Set(pins.map((p) => p.id));
      const newJbVenues = jambaseVenuePins.filter((v) => !appIds.has(v.id));
      result = [...pins, ...newJbVenues];
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
  }, [pins, globalDerivedPins, jambaseVenuePins, activeFilter, query, lyricsMode, globalMode]);

  // Show JamBase event pins only for "live" and "all" filters.
  // Hidden for "artist" and "venue" to avoid amber event pins stacking on top of
  // teal venue pins at the same coordinates. Venue pins are already shown via visiblePins.
  const visibleJambasePins = useMemo(() => {
    if (activeFilter !== "live" && activeFilter !== "all") return [];
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

  // IDs of artists matched by Cyanite vibe analysis — highlighted on the map with a glow ring
  const vibeHighlightIds = new Set(vibeMatchedArtists.map((a) => a.id));

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
          highlightedPinIds={vibeHighlightIds.size > 0 ? vibeHighlightIds : undefined}
          onKaraoke={setKaraokePin}
          onBoundsChange={handleBoundsChange}
          onSetlistOpen={(id, name) => setSetlistVenue({ id, name })}
          onHeatClick={handleHeatClick}
        />
      </div>

      {/* Top overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] p-3 sm:p-4">
        <div className="mx-auto flex max-w-7xl items-start justify-between gap-3">

          {/* Left: search + toggles + filters + results */}
          <div className="flex w-full max-w-md flex-col gap-2 min-w-0">

            {/* Search bar */}
            <div
              className={cn(
                "pointer-events-auto flex items-center gap-2 rounded-2xl border px-3 h-11 shadow-xl transition-all duration-300",
                mapStyle === "satellite"
                  ? lyricsMode
                    ? "glass-satellite border-primary/50 shadow-primary/10"
                    : "glass-satellite"
                  : lyricsMode
                    ? "glass border-primary/40 shadow-primary/10"
                    : "glass border-white/10",
              )}
            >
              {vibeLoading ? (
                <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : (
                <Search className={cn("h-4 w-4 shrink-0", mapStyle === "satellite" ? "text-white/50" : "text-muted-foreground")} />
              )}
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={lyricsMode ? "Genre, mood, or Spotify link…" : "Search artists, venues, shows…"}
                className={cn("h-full flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 text-sm", mapStyle === "satellite" ? "text-white placeholder:text-white/40" : "placeholder:text-muted-foreground")}
              />
              {query && (
                <button
                  onClick={() => { setQuery(""); setVibeResults([]); setVibeSearched(false); setArtistStats(null); }}
                  className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <div className="w-px h-5 bg-white/10 shrink-0" />
              <button
                onClick={toggleLyricsMode}
                className={cn(
                  "shrink-0 flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all duration-200",
                  lyricsMode
                    ? "bg-primary/20 text-primary"
                    : mapStyle === "satellite"
                      ? "text-white/50 hover:text-white hover:bg-white/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                )}
                title={lyricsMode ? "Exit vibe search" : "Search by genre, mood or vibe"}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Vibe</span>
              </button>
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

            {/* Vibe mode hint — only shown when lyricsMode active with no query yet */}
            {lyricsMode && !query && (
              <div className="pointer-events-none glass rounded-2xl border border-primary/20 px-3 py-2.5">
                <p className="text-xs text-primary font-semibold mb-0.5">Vibe Search</p>
                <p className="text-[11px] text-white/40 leading-relaxed">
                  Type a mood, genre, or drop a Spotify track link to find similar artists nearby.
                </p>
              </div>
            )}

            {/* Vibe results panel — shows in normal search too when tag matches exist */}
            {vibeSearched && (vibeMatchedArtists.length > 0 || vibeLoading || lyricsMode) && (
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

                {/* Tag-matched ScenePulse artists — grouped by proximity, scoped to zoom */}
                {vibeMatchedArtists.length > 0 && (() => {
                  // Zoom → max radius so results scope to what's actually visible on the map
                  const zoomRadius = (z: number): number => {
                    if (z >= 14) return 2;    // neighborhood
                    if (z >= 12) return 15;   // city
                    if (z >= 10) return 60;   // metro
                    if (z >= 8)  return 250;  // state / region
                    if (z >= 6)  return 1000; // country
                    return Infinity;          // world
                  };
                  const zoomLabel = (z: number): string => {
                    if (z >= 14) return "Neighborhood";
                    if (z >= 12) return "City";
                    if (z >= 10) return "Metro";
                    if (z >= 8)  return "State / Region";
                    if (z >= 6)  return "Country";
                    return "Worldwide";
                  };
                  const maxKm = zoomRadius(mapZoom);
                  // Artists without distanceKm (no user location) always show
                  const scoped = vibeMatchedArtists.filter(
                    (a) => a.distanceKm === null || a.distanceKm <= maxKm,
                  );
                  // Group by proximityLabel, preserving insertion order (already sorted nearby-first)
                  const groups: { label: string; artists: VibeMatchedArtist[] }[] = [];
                  for (const artist of scoped) {
                    const last = groups[groups.length - 1];
                    if (last && last.label === artist.proximityLabel) {
                      last.artists.push(artist);
                    } else {
                      groups.push({ label: artist.proximityLabel, artists: [artist] });
                    }
                  }
                  return (
                    <div className="border-b border-white/10">
                      <div className="flex items-center gap-1.5 px-3 pt-3 pb-2">
                        <MapPin className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-semibold text-white">
                          {scoped.length} artists · {zoomLabel(mapZoom)}
                        </span>
                        {maxKm !== Infinity && (
                          <span className="ml-auto text-[9px] text-white/30">within {maxKm < 1000 ? `${maxKm} km` : "1000+ km"}</span>
                        )}
                      </div>
                      {scoped.length === 0 && (
                        <p className="px-3 pb-3 text-xs text-white/40">No matches in this area — zoom out to see more</p>
                      )}
                      {groups.map((group) => (
                        <div key={group.label}>
                          <div className="px-3 py-1.5 flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">{group.label}</span>
                            {/* Show the actual km range for the bucket so users know the scale */}
                            <span className="text-[9px] text-white/20">
                              {group.label === "Walking distance" && "< 2 km"}
                              {group.label === "Your city" && "2 – 15 km"}
                              {group.label === "Greater metro" && "15 – 60 km"}
                              {group.label === "Nearby cities" && "60 – 250 km"}
                              {group.label === "Your country" && "250 – 1000 km"}
                              {group.label === "Worldwide" && "1000+ km"}
                            </span>
                            <div className="flex-1 h-px bg-white/5" />
                            <span className="text-[9px] text-white/20">{group.artists.length}</span>
                          </div>
                          <div className="divide-y divide-white/5">
                            {group.artists.map((artist) => (
                              <div key={artist.id} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/5 transition-colors">
                                {artist.imageUrl ? (
                                  <img src={artist.imageUrl} alt={artist.artistName} className="w-8 h-8 rounded-full object-cover shrink-0 border border-white/20" />
                                ) : (
                                  <div className="w-8 h-8 rounded-full shrink-0 bg-primary/25 flex items-center justify-center text-[13px] font-bold text-primary">
                                    {artist.artistName.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="text-sm font-semibold text-white truncate">{artist.artistName}</p>
                                    {artist.distanceKm !== null && (
                                      <span className="text-[10px] font-medium text-primary/60 shrink-0 bg-primary/10 px-1.5 py-0.5 rounded-full">
                                        {artist.distanceKm < 1 ? "<1 km" : `${artist.distanceKm} km`}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {artist.city && <span className="text-[9px] text-white/40">{artist.city}</span>}
                                    {artist.matchedTags.slice(0, 3).map((tag) => (
                                      <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary capitalize">{tag}</span>
                                    ))}
                                    {artist.matchedTags.length > 3 && (
                                      <span className="text-[9px] text-white/30">+{artist.matchedTags.length - 3}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {artist.latitude && artist.longitude && (
                                    <button
                                      onClick={() => mapRef.current?.flyTo(artist.latitude!, artist.longitude!)}
                                      className="flex items-center gap-1 rounded-full bg-primary/20 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/40 transition-colors"
                                    >
                                      <MapPin className="h-2.5 w-2.5" />
                                      Find
                                    </button>
                                  )}
                                  <a
                                    href={`/artists/${artist.id}`}
                                    className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[11px] text-white/70 hover:text-white hover:bg-white/20 transition-colors"
                                  >
                                    View
                                  </a>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {vibeResults.length === 0 && vibeMatchedArtists.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-6 text-center px-4">
                    <Music2 className="h-7 w-7 text-white/20" />
                    <p className="text-sm text-white/60">
                      {cyaniteAnalysis ? "No matching artists found" : "No artists found for this vibe"}
                    </p>
                    <p className="text-xs text-white/30">
                      {cyaniteAnalysis
                        ? "Artists need genres/moods set in their profile to appear here"
                        : "Try genre names like \"dark trap\", \"indie folk\", \"lofi beats\""}
                    </p>
                  </div>
                ) : vibeResults.length === 0 ? null : (
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

                {/* Control strip — Local/Global · Traction */}
                <div className="flex items-center gap-2">
                  <div className={cn("border rounded-2xl h-10 px-3 flex items-center gap-3 shadow-lg", mapStyle === "satellite" ? "glass-satellite" : "glass border-white/10")}>
                    {/* Local / Global toggle */}
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
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
                        className="scale-90 data-[state=checked]:bg-primary data-[state=unchecked]:bg-secondary/40"
                      />
                    </label>

                    <div className="w-px h-4 bg-white/10 shrink-0" />

                    {/* Traction heatmap toggle */}
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <Flame className={cn(
                        "h-3.5 w-3.5 shrink-0 transition-colors",
                        showHeatmap ? "text-orange-400" : mapStyle === "satellite" ? "text-white/50" : "text-muted-foreground",
                      )} />
                      <span className={cn(
                        "text-xs font-semibold transition-colors",
                        showHeatmap ? "text-orange-400" : mapStyle === "satellite" ? "text-white/50" : "text-muted-foreground",
                      )}>
                        Traction
                      </span>
                      <Switch
                        checked={showHeatmap}
                        onCheckedChange={toggleHeatmap}
                        className="scale-90 data-[state=checked]:bg-orange-500 data-[state=unchecked]:bg-input"
                      />
                    </label>
                  </div>
                </div>

                {/* Heatmap click results panel */}
                {showHeatmap && heatClickResult && (
                  <div
                    className="pointer-events-auto rounded-2xl border border-orange-500/25 shadow-2xl overflow-hidden max-h-80 flex flex-col"
                    style={{ background: "rgba(18,10,6,0.96)", backdropFilter: "blur(16px)" }}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-orange-500/15 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <Flame className="h-3.5 w-3.5 text-orange-400" />
                        <span className="text-xs font-semibold text-white">
                          {heatClickResult.artists.length > 0
                            ? `${heatClickResult.artists.length} artist${heatClickResult.artists.length === 1 ? "" : "s"} within ${heatClickResult.radiusKm < 1000 ? `${heatClickResult.radiusKm} km` : `${Math.round(heatClickResult.radiusKm / 100) / 10}k km`}`
                            : "No artists in this area"}
                        </span>
                        <span className="text-[9px] text-orange-400/50 uppercase tracking-widest">Traction</span>
                      </div>
                      <button
                        onClick={() => setHeatClickResult(null)}
                        className="text-white/30 hover:text-white transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {heatClickResult.artists.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 py-6 text-center px-4">
                        <Flame className="h-6 w-6 text-orange-400/20" />
                        <p className="text-sm text-white/40">No artists registered here</p>
                        <p className="text-xs text-white/20">
                          {heatClickResult.zoom < 8
                            ? "Zoom in and click again for a smaller area"
                            : "Try clicking on a brighter part of the heatmap"}
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-y-auto divide-y divide-white/5">
                        {heatClickResult.artists.map((artist) => {
                          const intensity = artist.traction;
                          const intensityColor =
                            intensity >= 0.8 ? "#f59e0b" :
                            intensity >= 0.5 ? "#10b981" :
                            intensity >= 0.3 ? "#3b82f6" : "#8b5cf6";
                          const intensityLabel =
                            intensity >= 0.8 ? "Blowing up" :
                            intensity >= 0.5 ? "Rising fast" :
                            intensity >= 0.3 ? "Active scene" : "Local artist";
                          return (
                            <div
                              key={artist.artistId}
                              className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/5 transition-colors"
                            >
                              {artist.imageUrl ? (
                                <img
                                  src={artist.imageUrl}
                                  alt={artist.artistName}
                                  className="w-9 h-9 rounded-full object-cover shrink-0 border border-white/10"
                                />
                              ) : (
                                <div
                                  className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-sm font-bold text-white"
                                  style={{ background: `${intensityColor}33` }}
                                >
                                  {artist.artistName.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="text-sm font-semibold text-white truncate">{artist.artistName}</p>
                                  <span
                                    className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                                    style={{ color: intensityColor, background: `${intensityColor}22` }}
                                  >
                                    {intensityLabel}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {artist.city && (
                                    <span className="text-[10px] text-white/40 truncate">{artist.city}</span>
                                  )}
                                  {artist.distanceKm !== undefined && (
                                    <span className="text-[10px] text-white/25 shrink-0">
                                      {artist.distanceKm < 1 ? "<1" : artist.distanceKm} km away
                                    </span>
                                  )}
                                  {artist.monthlyListeners != null && (
                                    <span className="text-[10px] text-white/30 shrink-0">
                                      {fmtNum(artist.monthlyListeners)} listeners
                                    </span>
                                  )}
                                </div>
                                {artist.genre && (
                                  <span className="text-[9px] text-white/30 capitalize">{artist.genre}</span>
                                )}
                              </div>
                              <div className="flex flex-col gap-1 shrink-0">
                                <Link
                                  href={`/artists/${artist.artistId}`}
                                  className="flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[10px] text-white/60 hover:text-white hover:bg-white/20 transition-colors"
                                >
                                  View
                                </Link>
                                {artist.lat && artist.lng && (
                                  <button
                                    onClick={() => mapRef.current?.flyTo(artist.lat, artist.lng, Math.max(heatClickResult.zoom, 12))}
                                    className="flex items-center gap-1 rounded-lg bg-orange-500/20 px-2 py-1 text-[10px] text-orange-300 hover:bg-orange-500/30 transition-colors"
                                  >
                                    <MapPin className="h-2.5 w-2.5" /> Fly
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Heatmap hint when active but no click yet */}
                {showHeatmap && !heatClickResult && !heatLoading && heatArtists.length > 0 && (
                  <div className="pointer-events-none glass rounded-xl border border-orange-500/20 px-3 py-2">
                    <p className="text-[11px] text-orange-400/80">
                      <Flame className="h-3 w-3 inline mr-1 mb-0.5" />
                      Tap anywhere on the map to see artists in that area
                    </p>
                  </div>
                )}

                {/* Category filters + ID button */}
                {!showHeatmap && (
                  <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
                    {FILTERS.map((f) => {
                      const Icon = f.icon;
                      const active = activeFilter === f.key;
                      const isLive = f.key === "live";
                      return (
                        <button
                          key={f.key}
                          onClick={() => setActiveFilter(f.key)}
                          className={cn(
                            "shrink-0 flex items-center gap-1.5 rounded-full border h-8 px-3 text-xs font-semibold transition-all duration-150",
                            active
                              ? isLive
                                ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                                : "border-primary/50 bg-primary/15 text-primary"
                              : mapStyle === "satellite"
                                ? "glass-satellite text-white/50 hover:text-white hover:border-white/20"
                                : "glass border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20",
                          )}
                        >
                          {isLive && (
                            <span className={cn(
                              "h-1.5 w-1.5 rounded-full shrink-0 transition-colors",
                              active ? "bg-amber-400 animate-pulse" : "bg-muted-foreground/40",
                            )} />
                          )}
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          <span>{f.label}</span>
                        </button>
                      );
                    })}

                    <div className="w-px h-4 bg-white/10 shrink-0" />

                    {/* ID this song */}
                    <button
                      onClick={() => setFingerprintOpen(true)}
                      className={cn(
                        "shrink-0 flex items-center gap-1.5 rounded-full border h-8 px-3 text-xs font-semibold transition-all duration-150",
                        fingerprintOpen
                          ? "border-secondary/50 bg-secondary/15 text-secondary"
                          : mapStyle === "satellite"
                            ? "glass-satellite text-white/50 hover:text-white hover:border-white/20"
                            : "glass border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20",
                      )}
                    >
                      <Fingerprint className="h-3.5 w-3.5 shrink-0" />
                      <span>ID this song</span>
                    </button>
                  </div>
                )}

              </div>
            )}

            {/* Vibe mode action row */}
            {lyricsMode && (
              <div className="pointer-events-auto flex items-center gap-1.5">
                {[
                  { onClick: toggleLyricsMode, icon: <X className="h-3 w-3" />, label: "Exit vibe search" },
                  { onClick: () => setFingerprintOpen(true), icon: <Fingerprint className="h-3 w-3" />, label: "ID a song" },
                ].map(({ onClick, icon, label }) => (
                  <button
                    key={label}
                    onClick={onClick}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border h-8 px-3 text-xs transition-all hover:border-white/20",
                      mapStyle === "satellite"
                        ? "glass-satellite text-white/50 hover:text-white"
                        : "glass border-white/10 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right controls — all icon buttons share the same glass pill style */}
          <div className="pointer-events-auto flex items-center gap-1.5 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMapStyle((s) => s === "satellite" ? "auto" : "satellite")}
              className={cn(
                "h-11 w-11 rounded-2xl border transition-all duration-200 hover:border-primary/50 active:scale-90",
                mapStyle === "satellite"
                  ? "glass-satellite text-white/70 hover:text-white border-primary/60"
                  : "glass border-white/10 hover:text-primary",
              )}
              aria-label={mapStyle === "satellite" ? "Switch to default map" : "Switch to satellite"}
            >
              {mapStyle === "satellite"
                ? <Map className="h-5 w-5" />
                : <Satellite className="h-5 w-5" />
              }
            </Button>
            <ThemeToggle satellite={mapStyle === "satellite"} />
            <NotificationsMenu
              satellite={mapStyle === "satellite"}
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
                  <button className={cn("rounded-2xl ring-2 transition-all duration-200 active:scale-95", mapStyle === "satellite" ? "ring-white/25" : "ring-white/10")}>
                    <Avatar className="h-11 w-11">
                      <AvatarImage src={profile?.avatarUrl ?? undefined} alt={profile?.displayName ?? user.email ?? "Profile"} className="rounded-2xl object-cover" />
                      <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold rounded-2xl">
                        {(profile?.displayName ?? user.email ?? "U").charAt(0).toUpperCase()}
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
                className="h-11 rounded-2xl bg-primary text-primary-foreground px-4 sm:px-5 text-sm font-semibold shadow-md hover:brightness-110 active:scale-95 transition-all duration-200"
              >
                Sign in
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Bottom-left: status / loading chips aligned under the search panel */}
      <div className="pointer-events-none absolute bottom-4 sm:bottom-6 left-3 sm:left-4 z-[1000] flex flex-col items-start gap-2">
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

      {/* Bottom-right: Scene Radio button — stacks directly below zoom controls */}
      <div className="pointer-events-none absolute bottom-4 sm:bottom-6 right-4 z-[1000] flex flex-col items-end">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setRadioActive((v) => !v)}
          className={cn(
            "pointer-events-auto h-11 w-11 rounded-2xl border transition-all duration-200 hover:border-primary/50 active:scale-90",
            mapStyle === "satellite"
              ? "glass-satellite text-white/70 hover:text-white"
              : "glass border-white/10 hover:text-primary",
            radioActive && "border-primary/50 !text-primary bg-primary/10",
          )}
          aria-label="Toggle Scene Radio"
        >
          <Radio className={cn("h-5 w-5", radioActive && "animate-pulse")} />
        </Button>
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
