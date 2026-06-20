import { Router, type IRouter } from "express";
import {
  searchByTheme,
  getTopTrackByArtist,
  getSyncedLyrics,
  getPlainLyrics,
  fingerprintByLyrics,
} from "../lib/musixmatch";

const router: IRouter = Router();

function requireQ(req: import("express").Request, res: import("express").Response): string | null {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q || q.length > 200) {
    res.status(400).json({ error: "q is required (max 200 chars)" });
    return null;
  }
  return q;
}

// GET /musixmatch/search?q=heartbreak
// Lyric-theme / semantic search. Returns tracks + de-duped artist names.
router.get("/musixmatch/search", async (req, res) => {
  const q = requireQ(req, res);
  if (!q) return;
  const tracks = await searchByTheme(q);
  const artistNames = [...new Set(tracks.map((t) => t.artistName))];
  res.json({ tracks, artistNames });
});

// GET /musixmatch/synced-lyrics?artist=<name>[&trackName=<name>]
// Fetches LRC synced lyrics for a specific track or the artist's top Musixmatch track.
// Falls back to plain lyrics when subtitles are unavailable.
router.get("/musixmatch/synced-lyrics", async (req, res) => {
  const artist =
    typeof req.query.artist === "string" ? req.query.artist.trim() : "";
  if (!artist || artist.length > 200) {
    res.status(400).json({ error: "artist is required (max 200 chars)" });
    return;
  }
  const trackNameHint =
    typeof req.query.trackName === "string" ? req.query.trackName.trim() : "";

  // If caller provides the exact track name (from Spotify top-track), prefer that.
  let track: Awaited<ReturnType<typeof getTopTrackByArtist>> = null;
  if (trackNameHint) {
    const candidates = await searchByTheme(`${trackNameHint} ${artist}`, 5);
    track = candidates.find(
      (t) => t.artistName.toLowerCase().includes(artist.toLowerCase()),
    ) ?? null;
  }

  // Fall back to the artist's generic top track from Musixmatch.
  if (!track) track = await getTopTrackByArtist(artist);
  if (!track) {
    res.status(404).json({ error: "Artist not found on Musixmatch" });
    return;
  }

  const [synced, plain] = await Promise.all([
    track.hasSubtitles ? getSyncedLyrics(track.trackId) : null,
    null as ReturnType<typeof getPlainLyrics> | null,
  ]);

  const fallback =
    !synced && track.hasLyrics ? await getPlainLyrics(track.trackId) : null;

  res.json({ track, synced, plain: fallback });
});

// GET /musixmatch/fingerprint?q=<partial lyrics>
// Identifies a track from distinctive lyrics heard at a gig.
router.get("/musixmatch/fingerprint", async (req, res) => {
  const q = requireQ(req, res);
  if (!q) return;
  try {
    const tracks = await fingerprintByLyrics(q);
    res.json({ tracks });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Musixmatch error";
    res.status(502).json({ error: msg, tracks: [] });
  }
});

export default router;
