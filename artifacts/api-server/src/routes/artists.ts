import { Router, type IRouter } from "express";
import { and, arrayContains, desc, eq, ilike, type SQL } from "drizzle-orm";
import {
  db,
  artistsTable,
  artistAudioAnalysisTable,
  artistLyricAnalysisTable,
  artistTagsTable,
  artistLinksTable,
  artistMediaTable,
  eventsTable,
} from "@workspace/db";
import {
  ListArtistsQueryParams,
  CreateArtistBody,
  GetArtistParams,
  UpdateArtistParams,
  UpdateArtistBody,
  GetArtistProfileParams,
  EnrichArtistParams,
  EnrichArtistBody,
  AddArtistMediaParams,
  AddArtistMediaBody,
  DeleteArtistMediaParams,
} from "@workspace/api-zod";
import { enrichArtist } from "../lib/enrich";
import { requireAuth } from "../lib/auth";
import { geocodeCity } from "../lib/geocode";
import { getDeezerArtistImage } from "../lib/deezer";

const router: IRouter = Router();

router.get("/artists", async (req, res) => {
  const { q, genre, mood } = ListArtistsQueryParams.parse(req.query);
  const filters: SQL[] = [];
  if (q) filters.push(ilike(artistsTable.artistName, `%${q}%`));
  if (genre) filters.push(arrayContains(artistsTable.genres, [genre]));
  if (mood) filters.push(arrayContains(artistsTable.moodTags, [mood]));

  const rows = await db
    .select()
    .from(artistsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(artistsTable.createdAt));
  res.json(rows);
});

router.post("/artists", requireAuth, async (req, res) => {
  const body = CreateArtistBody.parse(req.body);

  // Auto-geocode city → lat/lng when coordinates aren't already supplied
  let { latitude, longitude } = body;
  if ((!latitude || !longitude) && body.city) {
    const geo = await geocodeCity(body.city);
    if (geo) { latitude = geo.latitude; longitude = geo.longitude; }
  }

  // Auto-fetch artist image from Deezer when none is provided
  let imageUrl = body.imageUrl ?? null;
  if (!imageUrl) {
    imageUrl = await getDeezerArtistImage(body.artistName);
  }

  const [artist] = await db
    .insert(artistsTable)
    .values({ ...body, latitude, longitude, imageUrl: imageUrl ?? undefined })
    .returning();

  // Fire-and-forget: sync profile tags + optional Cyanite analysis
  void enrichArtist(artist.id, artist.spotifyUrl ?? null);
  res.status(201).json(artist);
});

// Full aggregate profile: artist + latest analysis + tags + links + media + recent events.
router.get("/artists/:id/profile", async (req, res) => {
  const { id } = GetArtistProfileParams.parse(req.params);

  const [artist] = await db
    .select()
    .from(artistsTable)
    .where(eq(artistsTable.id, id));
  if (!artist) {
    res.status(404).json({ error: "Artist not found" });
    return;
  }

  const [audioRows, lyricRows, tags, links, media, recentEvents] =
    await Promise.all([
      db
        .select()
        .from(artistAudioAnalysisTable)
        .where(eq(artistAudioAnalysisTable.artistId, id))
        .orderBy(desc(artistAudioAnalysisTable.analyzedAt))
        .limit(1),
      db
        .select()
        .from(artistLyricAnalysisTable)
        .where(eq(artistLyricAnalysisTable.artistId, id))
        .orderBy(desc(artistLyricAnalysisTable.analyzedAt))
        .limit(1),
      db
        .select()
        .from(artistTagsTable)
        .where(eq(artistTagsTable.artistId, id))
        .orderBy(desc(artistTagsTable.score)),
      db
        .select()
        .from(artistLinksTable)
        .where(eq(artistLinksTable.artistId, id))
        .orderBy(artistLinksTable.sortOrder),
      db
        .select()
        .from(artistMediaTable)
        .where(eq(artistMediaTable.artistId, id))
        .orderBy(artistMediaTable.sortOrder),
      db
        .select()
        .from(eventsTable)
        .where(eq(eventsTable.artistId, id))
        .orderBy(desc(eventsTable.eventDate))
        .limit(6),
    ]);

  res.json({
    artist,
    audioAnalysis: audioRows[0] ?? null,
    lyricAnalysis: lyricRows[0] ?? null,
    tags,
    links,
    media,
    recentEvents,
  });
});

// Trigger the enrichment pipeline for an artist. Dispatches to n8n, which runs
// Spotify -> Cyanite (audio) -> Musixmatch (lyrics) and writes results back via
// the analysis webhooks. No AI is used anywhere in this flow.
router.post("/artists/:id/enrich", async (req, res) => {
  const { id } = EnrichArtistParams.parse(req.params);
  const body = EnrichArtistBody.parse(req.body ?? {});

  const [artist] = await db
    .select()
    .from(artistsTable)
    .where(eq(artistsTable.id, id));
  if (!artist) {
    res.status(404).json({ error: "Artist not found" });
    return;
  }

  const spotifyUrl = body.spotifyUrl ?? artist.spotifyUrl ?? undefined;

  // Run in-app enrichment — fire-and-forget so the HTTP response is immediate
  void enrichArtist(artist.id, spotifyUrl ?? null);

  res.status(202).json({
    artistId: artist.id,
    status: "queued",
    message: "Enrichment started. Tags and audio analysis will populate shortly.",
  });
});

// --- Artist media gallery ---

router.post("/artists/:id/media", requireAuth, async (req, res) => {
  const { id } = AddArtistMediaParams.parse(req.params);
  const body = AddArtistMediaBody.parse(req.body);

  const [artist] = await db
    .select({ profileId: artistsTable.profileId })
    .from(artistsTable)
    .where(eq(artistsTable.id, id));
  if (!artist) {
    res.status(404).json({ error: "Artist not found" });
    return;
  }
  if (req.userId && artist.profileId !== req.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [media] = await db
    .insert(artistMediaTable)
    .values({
      artistId: id,
      type: body.type ?? "image",
      url: body.url,
      thumbnailUrl: body.thumbnailUrl,
      caption: body.caption,
      sortOrder: body.sortOrder ?? 0,
    })
    .returning();
  res.status(201).json(media);
});

router.delete("/artists/:id/media/:mediaId", requireAuth, async (req, res) => {
  const { id, mediaId } = DeleteArtistMediaParams.parse(req.params);

  const [artist] = await db
    .select({ profileId: artistsTable.profileId })
    .from(artistsTable)
    .where(eq(artistsTable.id, id));
  if (!artist) {
    res.status(404).json({ error: "Artist not found" });
    return;
  }
  if (req.userId && artist.profileId !== req.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db
    .delete(artistMediaTable)
    .where(
      and(eq(artistMediaTable.id, mediaId), eq(artistMediaTable.artistId, id)),
    );
  res.json({ success: true });
});

router.get("/artists/:id", async (req, res) => {
  const { id } = GetArtistParams.parse(req.params);
  const [artist] = await db
    .select()
    .from(artistsTable)
    .where(eq(artistsTable.id, id));
  if (!artist) {
    res.status(404).json({ error: "Artist not found" });
    return;
  }
  res.json(artist);
});

router.patch("/artists/:id", requireAuth, async (req, res) => {
  const { id } = UpdateArtistParams.parse(req.params);
  const body = UpdateArtistBody.parse(req.body);

  const [existing] = await db
    .select()
    .from(artistsTable)
    .where(eq(artistsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Artist not found" });
    return;
  }
  if (req.userId && existing.profileId !== req.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Convert empty-string URLs to null so the DB column is properly cleared.
  const toNull = (v: string | undefined) => (v === "" ? null : v);
  const patch = {
    ...body,
    spotifyUrl:   toNull(body.spotifyUrl),
    instagramUrl: toNull(body.instagramUrl),
    youtubeUrl:   toNull(body.youtubeUrl),
    websiteUrl:   toNull(body.websiteUrl),
  };

  const [artist] = await db
    .update(artistsTable)
    .set(patch)
    .where(eq(artistsTable.id, id))
    .returning();

  const spotifyUrlChanged =
    body.spotifyUrl !== undefined && body.spotifyUrl !== existing.spotifyUrl;
  // Re-enrich whenever any URL field changes or Spotify URL is updated
  if (spotifyUrlChanged || body.genres !== undefined || body.moodTags !== undefined) {
    void enrichArtist(artist.id, artist.spotifyUrl ?? null);
  }

  res.json(artist);
});

export default router;
