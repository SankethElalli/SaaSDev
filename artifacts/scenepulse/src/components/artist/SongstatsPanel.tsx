import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SpotifyStats {
  monthlyListeners: number | null;
  followersTotal: number | null;
  playlistReachCurrent: number | null;
  playlistsCurrent: number | null;
  popularity: number | null;
  streamsTotal: number | null;
}

interface AllStats {
  spotify: SpotifyStats | null;
  youtube: { viewsTotal: number | null; subscribersTotal: number | null } | null;
  tiktok: { followersTotal: number | null; likesTotal: number | null; videoViewsTotal: number | null } | null;
  instagram: { followersTotal: number | null } | null;
  soundcloud: { followersTotal: number | null; playsTotal: number | null } | null;
  appleMusic: { playlistsCurrent: number | null; playlistReachCurrent: number | null } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractSpotifyId(spotifyUrl: string | null | undefined): string | null {
  if (!spotifyUrl) return null;
  const m = spotifyUrl.match(/open\.spotify\.com\/artist\/([A-Za-z0-9]{10,})/);
  return m?.[1] ?? null;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ─── Platform icons (inline SVG) ─────────────────────────────────────────────

function SpotifyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.5 17.3a.75.75 0 0 1-1.03.247c-2.82-1.722-6.37-2.11-10.55-1.157a.75.75 0 1 1-.334-1.462c4.575-1.043 8.504-.594 11.67 1.339a.75.75 0 0 1 .244 1.033zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.227-1.983-8.145-2.558-11.963-1.4a.938.938 0 0 1-.58-1.787c4.363-1.339 9.79-.69 13.52 1.587a.94.94 0 0 1 .313 1.29zm.127-3.403c-3.868-2.298-10.248-2.51-13.944-1.388a1.125 1.125 0 1 1-.653-2.154c4.243-1.287 11.296-1.038 15.753 1.605a1.125 1.125 0 0 1-1.156 1.937z" />
    </svg>
  );
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.27 8.27 0 0 0 4.83 1.55V6.78a4.85 4.85 0 0 1-1.06-.09z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

function SoundCloudIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M1.175 12.225c-.15 0-.269.135-.269.3l-.325 2.325.325 2.325c0 .165.119.3.269.3.15 0 .269-.135.269-.3l.363-2.325-.363-2.325c0-.165-.119-.3-.269-.3zm1.694-.15c-.169 0-.3.131-.3.3l-.3 2.475.3 2.475c0 .169.131.3.3.3.169 0 .3-.131.3-.3l.338-2.475-.338-2.475c0-.169-.131-.3-.3-.3zm1.8-.563c-.188 0-.338.15-.338.338l-.281 3.038.281 3.038c0 .188.15.338.338.338.188 0 .338-.15.338-.338l.319-3.038-.319-3.038c0-.188-.15-.338-.338-.338zm1.781-.675c-.206 0-.375.169-.375.375l-.263 3.713.263 3.713c0 .206.169.375.375.375.206 0 .375-.169.375-.375l.3-3.713-.3-3.713c0-.206-.169-.375-.375-.375zm1.8-.225c-.225 0-.413.188-.413.413l-.244 3.938.244 3.938c0 .225.188.413.413.413.225 0 .413-.188.413-.413l.281-3.938-.281-3.938c0-.225-.188-.413-.413-.413zm1.856-.338c-.244 0-.45.206-.45.45l-.225 4.276.225 4.276c0 .244.206.45.45.45.244 0 .45-.206.45-.45l.256-4.276-.256-4.276c0-.244-.206-.45-.45-.45zm1.913-.15c-.263 0-.488.225-.488.488l-.206 4.426.206 4.426c0 .263.225.488.488.488.263 0 .488-.225.488-.488l.238-4.426-.238-4.426c0-.263-.225-.488-.488-.488zM12 9.75c-.281 0-.525.244-.525.525l-.188 4.576.188 4.576c0 .281.244.525.525.525.281 0 .525-.244.525-.525l.219-4.576-.219-4.576c0-.281-.244-.525-.525-.525zm2.025-.188c-.3 0-.563.263-.563.563l-.169 4.726.169 4.726c0 .3.263.563.563.563.3 0 .563-.263.563-.563l.194-4.726-.194-4.726c0-.3-.263-.563-.563-.563zm2.1.375c-.075-.656-.619-1.163-1.294-1.163-.244 0-.469.075-.656.188-.188-2.325-2.119-4.163-4.5-4.163-1.294 0-2.456.525-3.319 1.369-.375.356-.488.731-.488 1.087v8.681c0 .6.506 1.106 1.106 1.106h9.056c.6 0 1.106-.506 1.106-1.106v-.113c0-.6-.506-1.106-1.106-1.106h-.056c.019-.113.031-.225.031-.338-.001-1.106-.9-2.006-2.006-2.006-.15 0-.3.019-.45.05z" />
    </svg>
  );
}

function AppleMusicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M23.994 6.124a9.23 9.23 0 0 0-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 0 0-1.877-.726 10.496 10.496 0 0 0-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.454.026C4.94.07 4.52.19 4.17.31A4.98 4.98 0 0 0 .31 4.17C.19 4.53.07 4.94.054 5.535c-.01.15-.017.301-.027.452V18.01c.01.15.017.302.027.452.013.2.04.4.082.595A4.98 4.98 0 0 0 4.17 23.69c.36.12.77.24 1.365.256.15.01.301.017.452.027h12.025c.15-.01.301-.017.452-.027.517-.043.98-.156 1.366-.256a4.982 4.982 0 0 0 3.834-3.834c.12-.36.24-.77.256-1.365.01-.15.017-.301.027-.452V6.576c-.011-.15-.017-.301-.027-.452zM15.5 8h-1.5V5.5a2 2 0 0 0-2-2h-1a2 2 0 0 0-2 2V8H7.5A1.5 1.5 0 0 0 6 9.5v7a1.5 1.5 0 0 0 1.5 1.5h8A1.5 1.5 0 0 0 17 16.5v-7A1.5 1.5 0 0 0 15.5 8zm-5-2.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5V8h-2V5.5z" />
    </svg>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PopularityBar({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground text-sm">—</span>;
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums w-6 text-right">{pct}</span>
    </div>
  );
}

interface StatRowProps {
  label: string;
  value: string;
  accent?: string;
}
function StatRow({ label, value, accent = "text-foreground" }: StatRowProps) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-bold tabular-nums", accent)}>{value}</span>
    </div>
  );
}

interface PlatformCardProps {
  icon: React.ReactNode;
  name: string;
  accentColor: string;
  children: React.ReactNode;
}
function PlatformCard({ icon, name, accentColor, children }: PlatformCardProps) {
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className={cn("flex items-center gap-2 px-4 pt-4 pb-3 border-b border-white/5")}>
        <span className={accentColor}>{icon}</span>
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{name}</span>
      </div>
      <div className="px-4 pb-3">{children}</div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  spotifyUrl?: string | null;
  artistName?: string | null;
}

export function SongstatsPanel({ spotifyUrl, artistName }: Props) {
  const spotifyId = extractSpotifyId(spotifyUrl);
  const [data, setData] = useState<AllStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!spotifyId && !artistName) return;

    setLoading(true);
    setError(null);
    setData(null);

    // Pass both params so the backend can fall back to name search when
    // Spotify ID yields no data from Songstats.
    const qs = new URLSearchParams();
    if (spotifyId) qs.set("spotifyArtistId", spotifyId);
    if (artistName) qs.set("artistName", artistName);

    fetch(`/api/songstats/artist-stats?${qs.toString()}`)
      .then((r) => {
        if (!r.ok) return r.json().then((e) => Promise.reject(e.error ?? "Failed"));
        return r.json() as Promise<AllStats | Record<string, unknown>>;
      })
      .then((raw) => {
        // Normalise: handle both the new nested format and the old flat format
        // so the panel keeps working during backend deploy transitions.
        let d: AllStats;
        if ("spotify" in raw || "youtube" in raw || "tiktok" in raw) {
          // New nested format from the updated backend
          d = raw as AllStats;
        } else {
          // Old flat format — convert to nested so the rest of the UI works
          const flat = raw as Record<string, number | null>;
          const hasFlat = Object.values(flat).some((v) => v !== null && v !== undefined);
          if (!hasFlat) {
            setError("No streaming data found for this artist yet.");
            return;
          }
          d = {
            spotify: {
              monthlyListeners: (flat.monthlyListeners as number | null) ?? null,
              followersTotal: (flat.followersTotal as number | null) ?? null,
              playlistReachCurrent: (flat.playlistReachCurrent as number | null) ?? null,
              playlistsCurrent: (flat.playlistsCurrent as number | null) ?? null,
              popularity: (flat.popularity as number | null) ?? null,
              streamsTotal: (flat.streamsTotal as number | null) ?? null,
            },
            youtube: null,
            tiktok: null,
            instagram: null,
            soundcloud: null,
            appleMusic: null,
          };
        }
        const hasAny =
          d.spotify || d.youtube || d.tiktok || d.instagram || d.soundcloud || d.appleMusic;
        if (!hasAny) setError("No streaming data found for this artist yet.");
        else setData(d);
      })
      .catch((e) => setError(typeof e === "string" ? e : "Could not load streaming data."))
      .finally(() => setLoading(false));
  }, [spotifyId, artistName]);

  if (!spotifyId && !artistName) return null;

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#1DB954]/15">
          <SpotifyIcon className="w-4 h-4 text-[#1DB954]" />
        </div>
        <h2 className="text-xl font-semibold">Streaming Traction</h2>
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#1DB954]/70 bg-[#1DB954]/10 rounded-md px-2 py-0.5">
          via Songstats
        </span>
      </div>

      {loading && (
        <div className="glass-card rounded-2xl p-6 flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span className="text-sm">Fetching live streaming data…</span>
        </div>
      )}

      {!loading && error && (
        <div className="glass-card rounded-2xl p-5 text-sm text-muted-foreground border border-white/5">
          {error}
        </div>
      )}

      {!loading && data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

          {/* Spotify */}
          {data.spotify && (
            <PlatformCard
              icon={<SpotifyIcon className="w-4 h-4" />}
              name="Spotify"
              accentColor="text-[#1DB954]"
            >
              {data.spotify.popularity != null && (
                <div className="py-2.5 border-b border-white/5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                    Popularity Score
                  </p>
                  <PopularityBar value={data.spotify.popularity} />
                </div>
              )}
              <StatRow label="Monthly Listeners" value={fmt(data.spotify.monthlyListeners)} />
              <StatRow label="Followers" value={fmt(data.spotify.followersTotal)} />
              <StatRow label="Playlist Reach" value={fmt(data.spotify.playlistReachCurrent)} />
              <StatRow label="On Playlists" value={fmt(data.spotify.playlistsCurrent)} />
              {data.spotify.streamsTotal != null && (
                <StatRow label="Total Streams" value={fmt(data.spotify.streamsTotal)} />
              )}
            </PlatformCard>
          )}

          {/* YouTube */}
          {data.youtube && (data.youtube.subscribersTotal != null || data.youtube.viewsTotal != null) && (
            <PlatformCard
              icon={<YouTubeIcon className="w-4 h-4" />}
              name="YouTube"
              accentColor="text-[#FF0000]"
            >
              <StatRow label="Subscribers" value={fmt(data.youtube.subscribersTotal)} />
              <StatRow label="Total Views" value={fmt(data.youtube.viewsTotal)} />
            </PlatformCard>
          )}

          {/* TikTok */}
          {data.tiktok && (data.tiktok.followersTotal != null || data.tiktok.likesTotal != null) && (
            <PlatformCard
              icon={<TikTokIcon className="w-4 h-4" />}
              name="TikTok"
              accentColor="text-white"
            >
              <StatRow label="Followers" value={fmt(data.tiktok.followersTotal)} />
              <StatRow label="Total Likes" value={fmt(data.tiktok.likesTotal)} />
              {data.tiktok.videoViewsTotal != null && (
                <StatRow label="Video Views" value={fmt(data.tiktok.videoViewsTotal)} />
              )}
            </PlatformCard>
          )}

          {/* Instagram */}
          {data.instagram && data.instagram.followersTotal != null && (
            <PlatformCard
              icon={<InstagramIcon className="w-4 h-4" />}
              name="Instagram"
              accentColor="text-[#E1306C]"
            >
              <StatRow label="Followers" value={fmt(data.instagram.followersTotal)} />
            </PlatformCard>
          )}

          {/* SoundCloud */}
          {data.soundcloud && (data.soundcloud.followersTotal != null || data.soundcloud.playsTotal != null) && (
            <PlatformCard
              icon={<SoundCloudIcon className="w-4 h-4" />}
              name="SoundCloud"
              accentColor="text-[#FF5500]"
            >
              <StatRow label="Followers" value={fmt(data.soundcloud.followersTotal)} />
              <StatRow label="Total Plays" value={fmt(data.soundcloud.playsTotal)} />
            </PlatformCard>
          )}

          {/* Apple Music */}
          {data.appleMusic && (data.appleMusic.playlistsCurrent != null || data.appleMusic.playlistReachCurrent != null) && (
            <PlatformCard
              icon={<AppleMusicIcon className="w-4 h-4" />}
              name="Apple Music"
              accentColor="text-[#FC3C44]"
            >
              <StatRow label="On Playlists" value={fmt(data.appleMusic.playlistsCurrent)} />
              <StatRow label="Playlist Reach" value={fmt(data.appleMusic.playlistReachCurrent)} />
            </PlatformCard>
          )}

        </div>
      )}
    </section>
  );
}
