import { Router, type IRouter } from "express";
import {
  and,
  arrayContains,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  db,
  artistsTable,
  venuesTable,
  eventsTable,
  artistTagsTable,
  profilesTable,
} from "@workspace/db";
import {
  ListDiscoveryTagsQueryParams,
  DiscoverArtistsQueryParams,
} from "@workspace/api-zod";
import { geocodeCity } from "../lib/geocode";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

// Artist ids that carry a tag of the given type whose value matches `value`.
function artistsWithTag(type: string, value: string) {
  return db
    .select({ id: artistTagsTable.artistId })
    .from(artistTagsTable)
    .where(and(eq(artistTagsTable.type, type), ilike(artistTagsTable.tag, value)));
}

// Aggregate of discovery tags with how many distinct artists carry each.
router.get("/discovery/tags", async (req, res) => {
  const { type } = ListDiscoveryTagsQueryParams.parse(req.query);
  const countExpr = sql<number>`count(distinct ${artistTagsTable.artistId})::int`;
  const rows = await db
    .select({
      tag: artistTagsTable.tag,
      type: artistTagsTable.type,
      count: countExpr,
    })
    .from(artistTagsTable)
    .where(type ? eq(artistTagsTable.type, type) : undefined)
    .groupBy(artistTagsTable.tag, artistTagsTable.type)
    .orderBy(desc(countExpr), asc(artistTagsTable.tag));
  res.json(rows);
});

// Discover artists by free text, genre, mood, or theme. Genre/mood match either
// the artist's own arrays or a tag; theme matches tags only.
router.get("/discovery/artists", async (req, res) => {
  const { q, genre, mood, theme } = DiscoverArtistsQueryParams.parse(req.query);
  const filters: SQL[] = [];

  if (q) filters.push(ilike(artistsTable.artistName, `%${q}%`));
  if (genre) {
    const cond = or(
      arrayContains(artistsTable.genres, [genre]),
      inArray(artistsTable.id, artistsWithTag("genre", genre)),
    );
    if (cond) filters.push(cond);
  }
  if (mood) {
    const cond = or(
      arrayContains(artistsTable.moodTags, [mood]),
      inArray(artistsTable.id, artistsWithTag("mood", mood)),
    );
    if (cond) filters.push(cond);
  }
  if (theme) {
    filters.push(inArray(artistsTable.id, artistsWithTag("theme", theme)));
  }

  const rows = await db
    .select()
    .from(artistsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(artistsTable.verified), desc(artistsTable.createdAt));
  res.json(rows);
});

router.get("/map/pins", async (req, res) => {
  // global=true → all pins worldwide; default → all pins with coords (same data,
  // frontend decides what to display based on the toggle / viewport)
  const [artists, venues, events] = await Promise.all([
    db
      .select({
        id: artistsTable.id,
        artistName: artistsTable.artistName,
        latitude: artistsTable.latitude,
        longitude: artistsTable.longitude,
        city: artistsTable.city,
        imageUrl: artistsTable.imageUrl,
        spotifyUrl: artistsTable.spotifyUrl,
      })
      .from(artistsTable)
      .where(
        and(
          isNotNull(artistsTable.latitude),
          isNotNull(artistsTable.longitude),
        ),
      ),
    db
      .select({
        id: venuesTable.id,
        name: venuesTable.name,
        latitude: venuesTable.latitude,
        longitude: venuesTable.longitude,
        city: venuesTable.city,
        imageUrl: venuesTable.imageUrl,
      })
      .from(venuesTable)
      .where(
        and(isNotNull(venuesTable.latitude), isNotNull(venuesTable.longitude)),
      ),
    db
      .select({
        id: eventsTable.id,
        name: eventsTable.name,
        imageUrl: eventsTable.imageUrl,
        latitude: venuesTable.latitude,
        longitude: venuesTable.longitude,
        city: venuesTable.city,
      })
      .from(eventsTable)
      .innerJoin(venuesTable, eq(eventsTable.venueId, venuesTable.id))
      .where(
        and(isNotNull(venuesTable.latitude), isNotNull(venuesTable.longitude)),
      ),
  ]);

  const pins = [
    ...artists.map((a) => ({
      id: a.id,
      kind: "artist" as const,
      name: a.artistName,
      latitude: a.latitude as number,
      longitude: a.longitude as number,
      city: a.city,
      imageUrl: a.imageUrl,
      spotifyUrl: a.spotifyUrl ?? null,
    })),
    ...venues.map((v) => ({
      id: v.id,
      kind: "venue" as const,
      name: v.name,
      latitude: v.latitude as number,
      longitude: v.longitude as number,
      city: v.city,
      imageUrl: v.imageUrl,
    })),
    ...events.map((e) => ({
      id: e.id,
      kind: "event" as const,
      name: e.name,
      latitude: e.latitude as number,
      longitude: e.longitude as number,
      city: e.city,
      imageUrl: e.imageUrl,
    })),
  ];

  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  res.json({ pins });
});

// GET /map/heatmap — returns artist pins with Songstats-based traction weights.
// Only artists with a Spotify URL are included; traction is 0–1 weighted by
// monthly listeners. Artists without a Spotify URL are excluded entirely.
router.get("/map/heatmap", async (_req, res) => {
  const artists = await db
    .select({
      id: artistsTable.id,
      artistName: artistsTable.artistName,
      latitude: artistsTable.latitude,
      longitude: artistsTable.longitude,
      city: artistsTable.city,
      imageUrl: artistsTable.imageUrl,
      genres: artistsTable.genres,
      spotifyUrl: artistsTable.spotifyUrl,
      verified: artistsTable.verified,
    })
    .from(artistsTable)
    .where(
      and(
        isNotNull(artistsTable.latitude),
        isNotNull(artistsTable.longitude),
        isNotNull(artistsTable.spotifyUrl),
      ),
    );

  const { fetchArtistStats } = await import("../lib/songstats");

  const extractSpotifyId = (url: string | null): string | null => {
    if (!url) return null;
    const m = url.match(/open\.spotify\.com\/artist\/([A-Za-z0-9]{10,})/);
    return m?.[1] ?? null;
  };

  const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
    Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

  type HeatResult = {
    lat: number; lng: number; traction: number;
    artistId: string; artistName: string;
    city: string | null; imageUrl: string | null;
    genre: string | null; spotifyUrl: string | null;
    monthlyListeners: number | null;
  };

  // Worker-pool: at most 10 Songstats calls in-flight at once so a large artist
  // roster doesn't open hundreds of simultaneous connections.
  const CONCURRENCY = 10;
  const results: HeatResult[] = new Array(artists.length);
  let cursor = 0;

  async function worker() {
    while (cursor < artists.length) {
      const idx = cursor++;
      const a = artists[idx];
      const spotifyId = extractSpotifyId(a.spotifyUrl ?? null);
      // All artists here have a spotifyUrl; use 0.2 as the floor while
      // Songstats data is unavailable or the artist is very small.
      let traction = 0.2;
      let monthlyListeners: number | null = null;
      if (spotifyId) {
        try {
          const stats = await withTimeout(fetchArtistStats(spotifyId), 5000);
          if (stats?.monthlyListeners != null && stats.monthlyListeners > 0) {
            monthlyListeners = stats.monthlyListeners;
            traction = Math.min(1.0, 0.1 + (stats.monthlyListeners / 10_000_000) * 0.9);
          }
        } catch { /* keep floor traction */ }
      }
      results[idx] = {
        lat: a.latitude as number,
        lng: a.longitude as number,
        traction,
        artistId: a.id,
        artistName: a.artistName,
        city: a.city ?? null,
        imageUrl: a.imageUrl ?? null,
        genre: a.genres?.[0] ?? null,
        spotifyUrl: a.spotifyUrl ?? null,
        monthlyListeners,
      };
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, artists.length) }, worker),
  );

  res.json({ points: results });
});

// POST /map/geocode-backfill — admin-only: fill in missing lat/lng for artists
// and venues that have a city but no coordinates.
router.post("/map/geocode-backfill", requireAuth, async (req, res) => {
  // Verify caller is an admin profile
  const [callerProfile] = await db
    .select({ role: profilesTable.role })
    .from(profilesTable)
    .where(eq(profilesTable.id, req.userId!))
    .limit(1);
  if (!callerProfile || callerProfile.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const [artistsNoCoords, venuesNoCoords] = await Promise.all([
    db
      .select({ id: artistsTable.id, city: artistsTable.city })
      .from(artistsTable)
      .where(
        and(
          isNull(artistsTable.latitude),
          isNotNull(artistsTable.city),
        ),
      ),
    db
      .select({ id: venuesTable.id, city: venuesTable.city })
      .from(venuesTable)
      .where(
        and(
          isNull(venuesTable.latitude),
          isNotNull(venuesTable.city),
        ),
      ),
  ]);

  let updated = 0;
  let failed = 0;

  for (const a of artistsNoCoords) {
    if (!a.city) continue;
    const geo = await geocodeCity(a.city);
    if (geo) {
      await db
        .update(artistsTable)
        .set({ latitude: geo.latitude, longitude: geo.longitude })
        .where(eq(artistsTable.id, a.id));
      updated++;
    } else {
      failed++;
    }
    // Respect Nominatim rate limit: 1 req/sec
    await new Promise((r) => setTimeout(r, 1100));
  }

  for (const v of venuesNoCoords) {
    if (!v.city) continue;
    const geo = await geocodeCity(v.city);
    if (geo) {
      await db
        .update(venuesTable)
        .set({ latitude: geo.latitude, longitude: geo.longitude })
        .where(eq(venuesTable.id, v.id));
      updated++;
    } else {
      failed++;
    }
    await new Promise((r) => setTimeout(r, 1100));
  }

  res.json({
    message: "Backfill complete",
    updated,
    failed,
    total: artistsNoCoords.length + venuesNoCoords.length,
  });
});

router.get("/dashboard/summary", async (_req, res) => {
  const [artistCount, venueCount, eventCount, upcomingEventCount] =
    await Promise.all([
      db.$count(artistsTable),
      db.$count(venuesTable),
      db.$count(eventsTable),
      db.$count(eventsTable, eq(eventsTable.status, "upcoming")),
    ]);

  const [featuredArtists, upcomingEvents] = await Promise.all([
    db
      .select()
      .from(artistsTable)
      .orderBy(desc(artistsTable.verified), desc(artistsTable.createdAt))
      .limit(6),
    db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.status, "upcoming"))
      .orderBy(asc(eventsTable.eventDate))
      .limit(6),
  ]);

  res.json({
    artistCount,
    venueCount,
    eventCount,
    upcomingEventCount,
    featuredArtists,
    upcomingEvents,
  });
});

export default router;
