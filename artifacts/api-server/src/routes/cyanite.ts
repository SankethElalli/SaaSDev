import { Router, type IRouter } from "express";
import { ilike, inArray, eq, and, or, sql, desc } from "drizzle-orm";
import { db, artistsTable, artistTagsTable } from "@workspace/db";
import {
  parseSpotifyTrackId,
  enqueueSpotifyTrack,
  getSpotifyTrackAnalysis,
  getSimilarTracksFromSpotify,
} from "../lib/cyanite";

const router: IRouter = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Buckets map real-world distance to a sort priority (lower = closer).
// Granular enough that "your city" never mixes with "100 km away".
function proximityBucket(km: number | null): number {
  if (km === null) return 6;
  if (km < 2)   return 0;  // walking distance  (<2 km)
  if (km < 15)  return 1;  // your city         (2–15 km)
  if (km < 60)  return 2;  // greater metro      (15–60 km)
  if (km < 250) return 3;  // nearby cities      (60–250 km)
  if (km < 1000) return 4; // your country       (250–1000 km)
  return 5;                // worldwide          (1000+ km)
}

export function proximityLabel(km: number | null): string {
  if (km === null) return "Worldwide";
  if (km < 2)   return "Walking distance";
  if (km < 15)  return "Your city";
  if (km < 60)  return "Greater metro";
  if (km < 250) return "Nearby cities";
  if (km < 1000) return "Your country";
  return "Worldwide";
}

type MatchedArtist = {
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
};

/**
 * Core query: find ScenePulse artists whose genre/mood tags overlap with a
 * provided list of tags, then sort by proximity to the user → match score.
 *
 * mode "exact"  — tag must equal one of the provided tags (lowercased)
 * mode "fuzzy"  — tag must contain one of the provided tokens as a substring
 */
async function findArtistsByTags(
  tags: string[],
  opts: { userLat?: number; userLng?: number; mode?: "exact" | "fuzzy" } = {},
): Promise<MatchedArtist[]> {
  if (tags.length === 0) return [];

  const { userLat, userLng, mode = "exact" } = opts;

  let whereCondition;
  if (mode === "fuzzy") {
    const conditions = tags.map(
      (t) => sql`lower(${artistTagsTable.tag}) LIKE ${"%" + t.toLowerCase() + "%"}`,
    );
    whereCondition = and(
      inArray(artistTagsTable.type, ["genre", "mood"]),
      conditions.length === 1 ? conditions[0] : or(...conditions),
    );
  } else {
    const tagsLower = tags.map((t) => t.toLowerCase());
    const tagArray = sql`ARRAY[${sql.join(
      tagsLower.map((t) => sql`${t}`),
      sql`, `,
    )}]::text[]`;
    whereCondition = and(
      inArray(artistTagsTable.type, ["genre", "mood"]),
      sql`lower(${artistTagsTable.tag}) = ANY(${tagArray})`,
    );
  }

  const rows = await db
    .select({
      id: artistsTable.id,
      artistName: artistsTable.artistName,
      city: artistsTable.city,
      imageUrl: artistsTable.imageUrl,
      latitude: artistsTable.latitude,
      longitude: artistsTable.longitude,
      matchScore: sql<number>`count(${artistTagsTable.id})`.as("match_score"),
      matchedTags: sql<string[]>`array_agg(${artistTagsTable.tag})`.as("matched_tags"),
    })
    .from(artistsTable)
    .innerJoin(artistTagsTable, eq(artistTagsTable.artistId, artistsTable.id))
    .where(whereCondition)
    .groupBy(
      artistsTable.id,
      artistsTable.artistName,
      artistsTable.city,
      artistsTable.imageUrl,
      artistsTable.latitude,
      artistsTable.longitude,
    )
    .orderBy(desc(sql`count(${artistTagsTable.id})`))
    .limit(20);

  // Add proximity data then re-sort: bucket (nearby → regional → worldwide) first,
  // match score within each bucket.
  const withDist: MatchedArtist[] = rows.map((a) => {
    const km =
      userLat != null && userLng != null && a.latitude != null && a.longitude != null
        ? haversineKm(userLat, userLng, a.latitude, a.longitude)
        : null;
    return {
      ...a,
      distanceKm: km !== null ? Math.round(km) : null,
      proximityLabel: proximityLabel(km),
    };
  });

  withDist.sort((a, b) => {
    const ba = proximityBucket(a.distanceKm);
    const bb = proximityBucket(b.distanceKm);
    if (ba !== bb) return ba - bb;
    return b.matchScore - a.matchScore;
  });

  return withDist;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /cyanite/from-spotify?url=<spotify track url|uri|id>&lat=<float>&lng=<float>
 *
 * Cyanite audio analysis of a Spotify track.  Returns:
 *   - analysis: genre/mood/energy tags from Cyanite
 *   - similarTracks: Cyanite global similar-track list
 *   - matchedArtists: ScenePulse artists whose tags match, sorted nearby-first
 */
router.get("/cyanite/from-spotify", async (req, res) => {
  const url = typeof req.query.url === "string" ? req.query.url.trim() : "";
  if (!url) { res.status(400).json({ error: "url is required" }); return; }

  const trackId = parseSpotifyTrackId(url);
  if (!trackId) { res.status(400).json({ error: "Not a valid Spotify track link or id" }); return; }

  const userLat = typeof req.query.lat === "string" ? parseFloat(req.query.lat) : undefined;
  const userLng = typeof req.query.lng === "string" ? parseFloat(req.query.lng) : undefined;

  await enqueueSpotifyTrack(trackId);

  let analysis;
  let similar;
  try {
    [analysis, similar] = await Promise.all([
      getSpotifyTrackAnalysis(trackId),
      getSimilarTracksFromSpotify(trackId, 20),
    ]);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Cyanite request failed" });
    return;
  }

  // Name-match similar-track artists against local ScenePulse roster
  const artistNames = [...new Set(similar.map((t) => t.artistName).filter(Boolean))];
  const localMatches = await Promise.all(
    artistNames.map(async (name) => {
      const rows = await db
        .select({ id: artistsTable.id })
        .from(artistsTable)
        .where(ilike(artistsTable.artistName, name))
        .limit(1);
      return rows[0] ? { name, artistId: rows[0].id } : null;
    }),
  );
  const matchedByName = new Map(
    localMatches
      .filter((m): m is { name: string; artistId: string } => m !== null)
      .map((m) => [m.name, m.artistId]),
  );

  // Tag-based match: use Cyanite genre + mood tags to find ScenePulse artists,
  // sorted by proximity to the user (map center) first.
  const analysisTags = [...(analysis.genreTags ?? []), ...(analysis.moodTags ?? [])];
  const matchedArtists = await findArtistsByTags(analysisTags, {
    userLat: Number.isFinite(userLat) ? userLat : undefined,
    userLng: Number.isFinite(userLng) ? userLng : undefined,
    mode: "exact",
  });

  res.json({
    spotifyTrackId: trackId,
    analysis,
    similarTracks: similar.map((t) => ({
      ...t,
      localArtistId: matchedByName.get(t.artistName) ?? null,
    })),
    artistNames,
    matchedArtists,
  });
});

/**
 * GET /cyanite/tag-search?q=<genre/mood text>&lat=<float>&lng=<float>
 *
 * Text-based vibe search: splits the query into keywords, does partial-match
 * against artist_tags (genre + mood), returns ScenePulse artists sorted
 * nearby-first then by how many tags match.
 */
router.get("/cyanite/tag-search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) { res.status(400).json({ error: "q is required" }); return; }

  const userLat = typeof req.query.lat === "string" ? parseFloat(req.query.lat) : undefined;
  const userLng = typeof req.query.lng === "string" ? parseFloat(req.query.lng) : undefined;

  // Tokenise: split on spaces/commas, drop very short tokens and common stop-words
  const STOP = new Set(["the", "and", "with", "for", "but", "very", "a", "an", "is", "i", "me"]);
  const tokens = q
    .toLowerCase()
    .split(/[\s,]+/)
    .map((t) => t.replace(/[^a-z0-9-]/g, ""))
    .filter((t) => t.length >= 3 && !STOP.has(t));

  if (tokens.length === 0) {
    res.json({ matchedArtists: [], tokens: [] });
    return;
  }

  const matchedArtists = await findArtistsByTags(tokens, {
    userLat: Number.isFinite(userLat) ? userLat : undefined,
    userLng: Number.isFinite(userLng) ? userLng : undefined,
    mode: "fuzzy",
  });

  res.json({ matchedArtists, tokens });
});

export default router;
