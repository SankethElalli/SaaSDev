import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { useEffect, useState, useRef, forwardRef, useImperativeHandle } from "react";
import { Link } from "wouter";
import { Plus, Minus, Crosshair, Mic2, CalendarDays, Ticket } from "lucide-react";
import { useTheme } from "@/contexts/theme";
import { useToast } from "@/hooks/use-toast";

export type ScenePin = {
  id: string;
  kind: "artist" | "venue" | "event";
  name: string;
  latitude: number;
  longitude: number;
  city?: string | null;
  imageUrl?: string | null;
  externalUrl?: string | null;
  genre?: string | null;
  spotifyUrl?: string | null;
};

export type JambasePin = {
  id: string;
  kind: "jambase-event";
  name: string;
  latitude: number;
  longitude: number;
  city?: string | null;
  imageUrl?: string | null;
  startDate: string;
  eventStatus: string;
  venueName: string;
  venueIdentifier: string;
  venueUrl: string;
  ticketUrl?: string | null;
  performers: {
    name: string;
    identifier: string;
    url: string;
    image?: string | null;
    isHeadliner: boolean;
    genre: string[];
  }[];
};

export type MapBounds = {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
};

function fmtNum(n: number | null): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString();
}

function tractionLabel(listeners: number): { label: string; color: string } {
  if (listeners >= 1_000_000) return { label: "Blowing up", color: "#f59e0b" };
  if (listeners >= 100_000)   return { label: "Rising fast", color: "#10b981" };
  if (listeners >= 10_000)    return { label: "Active scene", color: "#3b82f6" };
  return { label: "Local artist", color: "#8b5cf6" };
}

function TractionMini({ spotifyUrl }: { spotifyUrl?: string | null }) {
  const [stats, setStats] = useState<{ monthlyListeners: number | null; popularity: number | null } | null>(null);
  const [loading, setLoading] = useState(false);

  const spotifyId = spotifyUrl?.match(/open\.spotify\.com\/artist\/([A-Za-z0-9]{10,})/)?.[1] ?? null;

  useEffect(() => {
    if (!spotifyId) return;
    setLoading(true);
    fetch(`/api/songstats/artist-stats?spotifyArtistId=${spotifyId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setStats({ monthlyListeners: d.monthlyListeners, popularity: d.popularity }); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [spotifyId]);

  if (!spotifyId) return null;

  const heat = stats?.monthlyListeners != null ? tractionLabel(stats.monthlyListeners) : null;

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
      {loading && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>Loading traction…</span>}
      {!loading && heat && stats && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: heat.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {heat.label}
            </span>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>via Spotify</span>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", lineHeight: 1 }}>{fmtNum(stats.monthlyListeners)}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>monthly listeners</div>
            </div>
            {stats.popularity != null && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                  <div style={{ width: 48, height: 4, borderRadius: 9999, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
                    <div style={{ width: `${stats.popularity}%`, height: "100%", background: "linear-gradient(90deg,#1DB954,#3dffa0)", borderRadius: 9999 }} />
                  </div>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{stats.popularity}</span>
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>popularity</div>
              </div>
            )}
          </div>
        </div>
      )}
      {!loading && !heat && stats !== null && (
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>No streaming data yet</span>
      )}
    </div>
  );
}

const KIND_COLOR: Record<string, string> = {
  artist: "hsl(280 80% 58%)",
  venue: "hsl(190 80% 52%)",
  event: "hsl(330 85% 60%)",
  "jambase-event": "hsl(38 95% 55%)",
};

const KIND_LABEL: Record<string, string> = {
  artist: "Artist",
  venue: "Venue",
  event: "Event",
  "jambase-event": "Live Tonight",
};

function buildIcon(pin: ScenePin | JambasePin) {
  const color = KIND_COLOR[pin.kind] ?? KIND_COLOR.event;
  const isLive = pin.kind === "jambase-event";
  const initial = pin.name.charAt(0).toUpperCase();
  const grad = `linear-gradient(135deg,${color},rgba(0,0,0,0.6))`;

  // For JamBase event pins without an event image, fall back to the headliner's
  // photo so the pin always shows a face rather than just a letter.
  const headlinerImage =
    pin.kind === "jambase-event"
      ? (pin.performers.find((p) => p.isHeadliner)?.image ??
         pin.performers[0]?.image ??
         null)
      : null;
  const imageUrl = pin.imageUrl ?? headlinerImage ?? null;

  // The photo is layered on top of a gradient + initial. If the image fails to
  // load, the gradient and initial stay visible.
  const photo = imageUrl
    ? `<div style="position:absolute;inset:0;background-image:url('${imageUrl}');background-size:cover;background-position:center;background-repeat:no-repeat;"></div>`
    : "";
  const pulse = isLive
    ? `<div style="position:absolute;top:-4px;right:-4px;width:12px;height:12px;border-radius:9999px;background:#f59e0b;border:2px solid #0b0b14;animation:scene-pulse 1.5s infinite;z-index:2;"></div>`
    : "";

  const html = `
    <div style="position:relative;width:48px;height:60px;filter:drop-shadow(0 4px 6px rgba(0,0,0,0.5)) drop-shadow(0 8px 18px rgba(0,0,0,0.35));">
      <div style="position:relative;width:48px;height:48px;border-radius:9999px;border:2.5px solid #fff;outline:2px solid ${color};outline-offset:0;box-shadow:0 0 0 4px rgba(0,0,0,0.25), 0 0 20px ${color}80;overflow:hidden;background:${grad};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:19px;letter-spacing:-0.5px;">${initial}${photo}${pulse}</div>
      <div style="position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:12px solid ${color};filter:drop-shadow(0 3px 3px rgba(0,0,0,0.4));"></div>
    </div>`;

  return L.divIcon({
    html,
    className: "scene-pin",
    iconSize: [46, 56],
    iconAnchor: [23, 56],
    popupAnchor: [0, -52],
  });
}

// Breathing "you are here" marker — a glowing blue dot with two pulsing rings.
const USER_DOT_ICON = L.divIcon({
  className: "",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  html: `<div style="position:relative;width:28px;height:28px">
    <div class="sp-user-ring-outer"></div>
    <div class="sp-user-ring-inner"></div>
    <div class="sp-user-core"></div>
  </div>`,
});

function formatEventDate(d: string) {
  try {
    return new Date(d).toLocaleString("en-IN", {
      weekday: "short", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return d; }
}

// Starts continuous location watching immediately on mount and keeps the dot updated.
function UserLocationWatcher({ onPosition }: { onPosition: (pos: L.LatLng) => void }) {
  const map = useMap();
  useMapEvents({ locationfound(e) { onPosition(e.latlng); } });
  useEffect(() => {
    map.locate({ watch: true, enableHighAccuracy: true, maxZoom: 15 });
    return () => { map.stopLocate(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function MapControls({ userPos }: { userPos: L.LatLng | null }) {
  const map = useMap();
  const { toast } = useToast();
  const btn = "h-9 w-9 grid place-items-center rounded-lg text-foreground/90 hover:bg-white/10 transition-colors";

  useEffect(() => {
    const onError = (e: L.ErrorEvent) => {
      toast({ title: "Location unavailable", description: e.message || "Check permissions.", variant: "destructive" });
    };
    map.on("locationerror", onError);
    return () => { map.off("locationerror", onError); };
  }, [map, toast]);

  return (
    <div className="absolute right-4 bottom-24 z-[1000] flex flex-col gap-1 rounded-xl glass border border-white/10 p-1">
      <button className={btn} aria-label="Zoom in" onClick={() => map.zoomIn()}><Plus className="h-4 w-4" /></button>
      <button className={btn} aria-label="Zoom out" onClick={() => map.zoomOut()}><Minus className="h-4 w-4" /></button>
      <button
        className={btn}
        aria-label="My location"
        onClick={() => {
          if (userPos) map.flyTo(userPos, Math.max(map.getZoom(), 14), { duration: 0.6 });
          else map.locate({ setView: true, maxZoom: 15, enableHighAccuracy: true });
        }}
      >
        <Crosshair className="h-4 w-4" />
      </button>
    </div>
  );
}

// Dynamically sets minZoom so the world always fills the viewport — no whitespace.
function MinZoomController() {
  const map = useMap();
  useEffect(() => {
    const update = () => {
      const { x, y } = map.getSize();
      // Smallest zoom where one world tile-row/column covers the full container.
      const minZ = Math.ceil(Math.log2(Math.max(x, y) / 256));
      map.setMinZoom(Math.max(2, minZ));
      // If we're already zoomed out too far, snap back up.
      if (map.getZoom() < map.getMinZoom()) map.setZoom(map.getMinZoom());
    };
    update();
    map.on("resize", update);
    return () => { map.off("resize", update); };
  }, [map]);
  return null;
}

// World bounds in Web Mercator — prevents panning past the edges of the earth.
const WORLD_BOUNDS = L.latLngBounds(L.latLng(-85.051129, -180), L.latLng(85.051129, 180));

function BoundsTracker({ onBoundsChange }: { onBoundsChange: (b: MapBounds) => void }) {
  const map = useMap();
  useEffect(() => {
    const emit = () => {
      const b = map.getBounds();
      onBoundsChange({ swLat: b.getSouth(), swLng: b.getWest(), neLat: b.getNorth(), neLng: b.getEast() });
    };
    emit();
    map.on("moveend", emit);
    map.on("zoomend", emit);
    return () => { map.off("moveend", emit); map.off("zoomend", emit); };
  }, [map, onBoundsChange]);
  return null;
}

// Adjusts the map view when the user switches between Local and Global scope.
function ScopeViewController({
  globalMode,
  localCenter,
  localZoom,
}: {
  globalMode: boolean;
  localCenter: [number, number];
  localZoom: number;
}) {
  const map = useMap();
  const prevGlobal = useRef<boolean | null>(null);
  // Keep latest local view in refs so the effect doesn't re-run (and re-fly)
  // when the default center/zoom array literals are recreated on render.
  const centerRef = useRef(localCenter);
  const zoomRef = useRef(localZoom);
  centerRef.current = localCenter;
  zoomRef.current = localZoom;
  useEffect(() => {
    // Only react to an actual Local <-> Global transition
    if (prevGlobal.current === null) {
      prevGlobal.current = globalMode;
      return;
    }
    if (prevGlobal.current === globalMode) return;
    prevGlobal.current = globalMode;
    if (globalMode) {
      map.flyTo([20, 0], 2, { duration: 0.8 });
    } else {
      map.flyTo(centerRef.current, zoomRef.current, { duration: 0.8 });
    }
  }, [globalMode, map]);
  return null;
}

// Imperative handle exposed to the parent so it can flyTo any coordinate.
export type MapHandle = {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
};

function MapController({ mapRef }: { mapRef: React.Ref<MapHandle> }) {
  const map = useMap();
  useImperativeHandle(
    mapRef,
    () => ({
      flyTo(lat, lng, zoom = 14) {
        map.flyTo([lat, lng], zoom, { duration: 0.6 });
      },
    }),
    [map],
  );
  return null;
}

// HeatmapLayer — dynamic import keeps window.L assignment before plugin load
export type HeatPoint = [number, number, number?];

// Track whether leaflet.heat has been dynamically imported yet
let heatPluginLoaded = false;

function HeatmapLayer({ points }: { points: HeatPoint[] }) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (points.length === 0) {
      if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
      return;
    }

    let cancelled = false;

    const run = async () => {
      // leaflet.heat is a UMD plugin that reads `window.L` at load time.
      // Assign L to window BEFORE dynamically importing it.
      if (!(window as any).L) (window as any).L = L;

      if (!heatPluginLoaded) {
        await import("leaflet.heat");
        heatPluginLoaded = true;
      }

      if (cancelled) return;

      if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const heat = (L as any).heatLayer(points, {
        radius: 40,
        blur: 22,
        maxZoom: 17,
        max: 1.0,
        minOpacity: 0.45,
        gradient: {
          0.0:  "#4f46e5",
          0.25: "#9333ea",
          0.5:  "#db2777",
          0.72: "#ea580c",
          0.88: "#f97316",
          1.0:  "#fbbf24",
        },
      });
      heat.addTo(map);
      layerRef.current = heat;
    };

    run().catch(console.error);

    return () => {
      cancelled = true;
      if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
    };
  }, [map, points]);

  return null;
}

export type MapStyle = "auto" | "dark" | "light" | "satellite";

export const SceneMap = forwardRef<
  MapHandle,
  {
    pins: ScenePin[];
    jambasePins?: JambasePin[];
    heatPoints?: HeatPoint[];
    center?: [number, number];
    zoom?: number;
    mapStyle?: MapStyle;
    showHeatmap?: boolean;
    globalMode?: boolean;
    onKaraoke?: (pin: ScenePin) => void;
    onBoundsChange?: (b: MapBounds) => void;
    onSetlistOpen?: (venueIdentifier: string, venueName: string) => void;
  }
>(function SceneMap(
  {
    pins,
    jambasePins = [],
    heatPoints = [],
    center = [20, 0],
    zoom = 2,
    mapStyle = "auto",
    showHeatmap = false,
    globalMode = false,
    onKaraoke,
    onBoundsChange,
    onSetlistOpen,
  },
  ref,
) {
  const { resolved } = useTheme();
  const effective = mapStyle === "auto" ? resolved : mapStyle;
  const [userPos, setUserPos] = useState<L.LatLng | null>(null);

  const TILES = {
    // Light: full Voyager — colored roads, green parks, blue water, POI icons
    light: { url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", sub: "abcd", overlay: null as string | null, overlayOpacity: 0 },
    // Dark: CartoDB Dark Matter base + Voyager (no labels) blended via mix-blend-mode:color
    // borrows hue/saturation from Voyager (greens, blues) but keeps dark luminance from dark_all
    dark:  { url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", sub: "abcd", overlay: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png", overlayOpacity: 1 },
    // Satellite: clean ArcGIS imagery — no label overlay to preserve the original look
    satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", sub: "", overlay: null as string | null, overlayOpacity: 0 },
  };
  const tile = effective === "satellite" ? TILES.satellite : effective === "light" ? TILES.light : TILES.dark;

  return (
    <div className={`h-full w-full${effective === "dark" ? " sp-map-dark" : ""}`}>
      <style>{`
        /* Pin pulse (live events) */
        @keyframes scene-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.4);opacity:.6}}
        /* User dot rings */
        @keyframes sp-ring-out{0%{transform:translate(-50%,-50%) scale(1);opacity:.55}100%{transform:translate(-50%,-50%) scale(3.4);opacity:0}}
        @keyframes sp-core-breathe{0%,100%{box-shadow:0 0 0 0 rgba(59,130,246,.6),0 0 10px 3px rgba(59,130,246,.35)}50%{box-shadow:0 0 0 5px rgba(59,130,246,.15),0 0 18px 6px rgba(59,130,246,.55)}}
        .sp-user-ring-outer{position:absolute;top:50%;left:50%;width:28px;height:28px;border-radius:50%;background:rgba(59,130,246,.4);animation:sp-ring-out 2.6s ease-out infinite}
        .sp-user-ring-inner{position:absolute;top:50%;left:50%;width:28px;height:28px;border-radius:50%;background:rgba(59,130,246,.22);animation:sp-ring-out 2.6s ease-out 1.0s infinite}
        .sp-user-core{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:15px;height:15px;border-radius:50%;background:#3b82f6;border:2.5px solid #fff;animation:sp-core-breathe 2.6s ease-in-out infinite;box-shadow:0 0 10px 3px rgba(59,130,246,.45)}
        /* Pin marker reset — prevent Leaflet default icon styles leaking */
        .scene-pin{background:none !important;border:none !important;}
        /* Sharper tile rendering */
        .leaflet-tile{image-rendering:-webkit-optimize-contrast;image-rendering:crisp-edges;}
        /* Dark mode color blending: isolate the tile pane so the two layers blend with
           each other, not the rest of the page. mix-blend-mode:color takes only the
           hue+saturation from Voyager (greens, blues, road colors) but keeps dark_all's
           luminance — dark background stays dark, colors pop through. */
        .sp-map-dark .leaflet-tile-pane{isolation:isolate;}
        /* soft-light lifts lighter areas in Voyager (parks, water, roads) relative to the dark
           base — the background stays dark while colored features pop. saturate(6) on the
           overlay pre-amplifies Voyager's hues so even subtle soft-light boosts are vivid. */
        .sp-map-dark .sp-color-overlay{mix-blend-mode:soft-light;filter:saturate(6);opacity:0.95;}
        /* Popup polish */
        .scene-popup .leaflet-popup-content-wrapper{background:rgba(13,13,26,0.92);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,0.5);color:#fff;padding:0;}
        .scene-popup .leaflet-popup-content{margin:0;width:auto !important;}
        .scene-popup .leaflet-popup-tip-container{display:none;}
        .scene-popup .leaflet-popup-close-button{color:rgba(255,255,255,0.4) !important;top:8px !important;right:10px !important;font-size:18px !important;}
      `}</style>
      <MapContainer
        center={center}
        zoom={zoom}
        minZoom={2}
        maxBounds={WORLD_BOUNDS}
        maxBoundsViscosity={1.0}
        zoomControl={false}
        attributionControl={false}
        className="h-full w-full"
        style={{ height: "100%", width: "100%", background: effective === "light" ? "#f0ece4" : "#0d0d1a" }}
      >
        <TileLayer key={`${effective}-base`} url={tile.url} subdomains={tile.sub} maxZoom={20} noWrap />
        {tile.overlay && (
          <TileLayer key={`${effective}-overlay`} url={tile.overlay} subdomains="abcd" maxZoom={20} noWrap opacity={tile.overlayOpacity} className="sp-color-overlay" />
        )}

        <MapController mapRef={ref} />
        <ScopeViewController globalMode={globalMode} localCenter={center} localZoom={zoom} />

        {/* Heatmap overlay — always rendered when showHeatmap is true */}
        {showHeatmap && <HeatmapLayer points={heatPoints.length > 0 ? heatPoints : [
          ...pins.filter(p => p.kind === "artist" && p.spotifyUrl).map(p => [p.latitude, p.longitude, 0.5] as HeatPoint),
          ...jambasePins.map(p => [p.latitude, p.longitude, 1.0] as HeatPoint),
        ]} />}

        {/* Pins — always rendered when heatmap is off */}
        {!showHeatmap && pins.map((pin) => (
          <Marker key={`local-${pin.kind}-${pin.id}`} position={[pin.latitude, pin.longitude]} icon={buildIcon(pin)}>
            <Popup className="scene-popup">
              <div className="w-52">
                {pin.imageUrl && (
                  <div className="h-24 w-full rounded-lg bg-cover bg-center" style={{ backgroundImage: `url('${pin.imageUrl}'), ${`linear-gradient(135deg, ${KIND_COLOR[pin.kind]}, rgba(0,0,0,0.6))`}` }} />
                )}
                <div className="mt-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: KIND_COLOR[pin.kind] }}>
                    {KIND_LABEL[pin.kind]}
                  </span>
                  <p className="text-sm font-bold leading-tight text-foreground">{pin.name}</p>
                  {pin.city && <p className="text-xs text-muted-foreground">{pin.city}</p>}
                  {pin.genre && <p className="text-[10px] text-muted-foreground/70 capitalize">{pin.genre}</p>}
                </div>
                {pin.kind === "artist" && <TractionMini spotifyUrl={pin.spotifyUrl} />}
                <div className="mt-2 flex flex-col gap-1.5">
                  {pin.externalUrl ? (
                    <a
                      href={pin.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-90"
                    >
                      View details
                    </a>
                  ) : (
                    <Link
                      href={`/${pin.kind}s/${pin.id}`}
                      className="inline-flex w-full items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-90"
                    >
                      View profile
                    </Link>
                  )}
                  {pin.kind === "artist" && onKaraoke && (
                    <button
                      onClick={() => onKaraoke(pin)}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                    >
                      <Mic2 className="h-3 w-3" /> Synced Lyrics
                    </button>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* JamBase live-gig pins */}
        {!showHeatmap && jambasePins.map((pin) => (
          <Marker key={`jb-${pin.id}`} position={[pin.latitude, pin.longitude]} icon={buildIcon(pin)}>
            <Popup className="scene-popup">
              <div className="w-60">
                {pin.imageUrl && (
                  <div className="h-20 w-full rounded-lg bg-cover bg-center" style={{ backgroundImage: `url('${pin.imageUrl}'), linear-gradient(135deg, hsl(38 95% 55%), rgba(0,0,0,0.6))` }} />
                )}
                <div className="mt-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                      Live Tonight
                    </span>
                  </div>
                  <p className="text-xs font-bold leading-tight text-foreground">{pin.venueName}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{formatEventDate(pin.startDate)}</p>
                  {pin.city && <p className="text-[10px] text-muted-foreground/60">{pin.city}</p>}
                </div>

                {pin.performers.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Performing</p>
                    <div className="flex flex-wrap gap-1">
                      {pin.performers.slice(0, 4).map((p) => (
                        <a key={p.identifier} href={p.url} target="_blank" rel="noopener noreferrer"
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80 ${
                            p.isHeadliner
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              : "bg-white/5 text-white/60 border border-white/10"
                          }`}
                        >{p.name}</a>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-2.5 flex flex-col gap-1.5">
                  {pin.ticketUrl && (
                    <a href={pin.ticketUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black transition-opacity hover:opacity-90"
                    >
                      <Ticket className="h-3 w-3" /> Get Tickets
                    </a>
                  )}
                  {onSetlistOpen && (
                    <button
                      onClick={() => onSetlistOpen(pin.venueIdentifier, pin.venueName)}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <CalendarDays className="h-3 w-3" /> Past Shows
                    </button>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {userPos && (
          <Marker position={userPos} icon={USER_DOT_ICON} zIndexOffset={1000}>
            <Popup className="scene-popup"><p className="text-sm font-semibold px-3 py-2">You are here</p></Popup>
          </Marker>
        )}
        <UserLocationWatcher onPosition={setUserPos} />
        <MapControls userPos={userPos} />
        <MinZoomController />
        {onBoundsChange && <BoundsTracker onBoundsChange={onBoundsChange} />}
      </MapContainer>
    </div>
  );
});
