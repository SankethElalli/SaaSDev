const BASE = "https://api.songstats.com/enterprise/v1";

async function ssGet(path: string, params: Record<string, string>): Promise<unknown> {
  const apiKey = process.env.SONGSTATS_API_KEY;
  if (!apiKey) throw new Error("SONGSTATS_API_KEY is not configured");

  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { apikey: apiKey },
  });
  if (!res.ok) throw new Error(`Songstats HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SongstatsSpotifyStats {
  monthlyListeners: number | null;
  followersTotal: number | null;
  playlistReachCurrent: number | null;
  playlistsCurrent: number | null;
  popularity: number | null;
  streamsTotal: number | null;
}

export interface SongstatsYouTubeStats {
  viewsTotal: number | null;
  subscribersTotal: number | null;
}

export interface SongstatsTikTokStats {
  followersTotal: number | null;
  likesTotal: number | null;
  videoViewsTotal: number | null;
}

export interface SongstatsInstagramStats {
  followersTotal: number | null;
}

export interface SongstatsSoundCloudStats {
  followersTotal: number | null;
  playsTotal: number | null;
}

export interface SongstatsAppleMusicStats {
  playlistsCurrent: number | null;
  playlistReachCurrent: number | null;
}

export interface SongstatsAllStats {
  spotify: SongstatsSpotifyStats | null;
  youtube: SongstatsYouTubeStats | null;
  tiktok: SongstatsTikTokStats | null;
  instagram: SongstatsInstagramStats | null;
  soundcloud: SongstatsSoundCloudStats | null;
  appleMusic: SongstatsAppleMusicStats | null;
}

export interface SongstatsArtistSearchResult {
  songstatsArtistId: string;
  name: string;
  imageUrl: string | null;
  spotifyArtistId: string | null;
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchArtistByName(query: string): Promise<SongstatsArtistSearchResult | null> {
  // Songstats enterprise search endpoint
  const body = (await ssGet("/artists/search", { q: query })) as {
    result?: string;
    artists?: Array<{
      songstats_artist_id?: string;
      name?: string;
      image_url?: string;
      spotify_artist_id?: string;
    }>;
  };

  const first = body.artists?.[0];
  if (!first?.songstats_artist_id) return null;

  return {
    songstatsArtistId: first.songstats_artist_id,
    name: first.name ?? query,
    imageUrl: first.image_url ?? null,
    spotifyArtistId: first.spotify_artist_id ?? null,
  };
}

// ─── Stats ────────────────────────────────────────────────────────────────────

type StatsParams =
  | { spotifyArtistId: string; songstatsArtistId?: never }
  | { songstatsArtistId: string; spotifyArtistId?: never };

type RawStatsBody = {
  result?: string;
  stats?: Array<{ source: string; data: Record<string, number | null> }>;
};

/** Returns the raw Songstats /artists/stats body — used by the debug route. */
export async function fetchRawStats(params: StatsParams): Promise<RawStatsBody> {
  const queryParams: Record<string, string> = params.spotifyArtistId
    ? { spotify_artist_id: params.spotifyArtistId }
    : { songstats_artist_id: params.songstatsArtistId! };
  return (await ssGet("/artists/stats", queryParams)) as RawStatsBody;
}

export async function fetchAllStats(params: StatsParams): Promise<SongstatsAllStats> {
  const body = await fetchRawStats(params);

  // Songstats source names vary slightly across plans/versions — check all variants.
  const bySource = (...names: string[]): Record<string, number | null> | null => {
    for (const name of names) {
      const found = body.stats?.find((s) => s.source === name);
      if (found) return found.data;
    }
    return null;
  };

  const n = (d: Record<string, number | null> | null, key: string): number | null =>
    d ? (d[key] ?? null) : null;

  const sp = bySource("spotify");
  const yt = bySource("youtube", "youtube_channel", "youtube_music");
  const tt = bySource("tiktok", "tiktok_profile");
  const ig = bySource("instagram");
  const sc = bySource("soundcloud");
  const am = bySource("apple_music", "applemusic", "itunes");

  return {
    spotify: sp
      ? {
          monthlyListeners: n(sp, "monthly_listeners_current"),
          followersTotal: n(sp, "followers_total"),
          playlistReachCurrent: n(sp, "playlist_reach_current"),
          playlistsCurrent: n(sp, "playlists_current"),
          popularity: n(sp, "popularity_current"),
          streamsTotal: n(sp, "streams_total"),
        }
      : null,
    youtube: yt
      ? {
          viewsTotal: n(yt, "views_total") ?? n(yt, "video_views_total"),
          subscribersTotal: n(yt, "subscribers_total") ?? n(yt, "channel_subscribers_total"),
        }
      : null,
    tiktok: tt
      ? {
          followersTotal: n(tt, "followers_total"),
          likesTotal: n(tt, "likes_total") ?? n(tt, "hearts_total"),
          videoViewsTotal: n(tt, "video_views_total") ?? n(tt, "views_total"),
        }
      : null,
    instagram: ig
      ? {
          followersTotal: n(ig, "followers_total"),
        }
      : null,
    soundcloud: sc
      ? {
          followersTotal: n(sc, "followers_total"),
          playsTotal: n(sc, "plays_total") ?? n(sc, "streams_total"),
        }
      : null,
    appleMusic: am
      ? {
          playlistsCurrent: n(am, "playlists_current"),
          playlistReachCurrent: n(am, "playlist_reach_current"),
        }
      : null,
  };
}

// Keep for backward-compat with heatmap route
export async function fetchArtistStats(spotifyArtistId: string): Promise<SongstatsSpotifyStats> {
  const all = await fetchAllStats({ spotifyArtistId });
  return (
    all.spotify ?? {
      monthlyListeners: null,
      followersTotal: null,
      playlistReachCurrent: null,
      playlistsCurrent: null,
      popularity: null,
      streamsTotal: null,
    }
  );
}
