import { Router, type IRouter } from "express";
import { fetchAllStats, fetchRawStats, searchArtistByName } from "../lib/songstats";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * GET /songstats/artist-stats
 *
 * Accepts one of:
 *   ?spotifyArtistId=<id>   — direct Spotify artist ID
 *   ?artistName=<name>       — stage name; Songstats search used as fallback
 *
 * Strategy:
 *   1. If spotifyArtistId provided → fetch stats directly
 *   2. If all platforms are null (artist not indexed by Spotify ID) and
 *      artistName is also provided → retry via name search
 *   3. If only artistName → search then fetch
 */
router.get("/songstats/artist-stats", async (req, res) => {
  const spotifyArtistId =
    typeof req.query.spotifyArtistId === "string" ? req.query.spotifyArtistId.trim() : "";
  const artistName =
    typeof req.query.artistName === "string" ? req.query.artistName.trim() : "";

  if (!spotifyArtistId && !artistName) {
    res.status(400).json({ error: "spotifyArtistId or artistName is required" });
    return;
  }

  try {
    if (spotifyArtistId) {
      const stats = await fetchAllStats({ spotifyArtistId });

      // If Songstats has no data for this Spotify ID at all, try name-based lookup
      const hasAny = stats.spotify || stats.youtube || stats.tiktok ||
        stats.instagram || stats.soundcloud || stats.appleMusic;

      if (!hasAny && artistName) {
        logger.info({ spotifyArtistId, artistName }, "Spotify ID yielded no Songstats data — trying name search");
        const found = await searchArtistByName(artistName).catch(() => null);
        if (found) {
          const nameStats = await fetchAllStats({ songstatsArtistId: found.songstatsArtistId });
          res.json(nameStats);
          return;
        }
      }

      res.json(stats);
      return;
    }

    // No Spotify ID — search by artist name
    const found = await searchArtistByName(artistName);
    if (!found) {
      res.status(404).json({ error: `Artist "${artistName}" not found on Songstats` });
      return;
    }

    const stats = await fetchAllStats({ songstatsArtistId: found.songstatsArtistId });
    res.json(stats);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, spotifyArtistId, artistName }, "Songstats artist-stats failed");
    res.status(502).json({ error: msg });
  }
});

/**
 * GET /songstats/raw-stats?spotifyArtistId=<id>
 *
 * Returns the unprocessed Songstats /artists/stats body so you can see
 * exactly which sources and field names the API is sending back.
 * Useful for debugging missing platform data.
 */
router.get("/songstats/raw-stats", async (req, res) => {
  const spotifyArtistId =
    typeof req.query.spotifyArtistId === "string" ? req.query.spotifyArtistId.trim() : "";
  if (!spotifyArtistId) {
    res.status(400).json({ error: "spotifyArtistId is required" });
    return;
  }
  try {
    const raw = await fetchRawStats({ spotifyArtistId });
    res.json(raw);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
