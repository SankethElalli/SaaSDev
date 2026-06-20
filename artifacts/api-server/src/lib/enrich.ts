import {
  db,
  artistsTable,
  artistAudioAnalysisTable,
  artistTagsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  enqueueSpotifyTrack,
  getSpotifyTrackAnalysis,
  isSpotifyTrackInput,
  parseSpotifyTrackId,
} from "./cyanite";
import { logger } from "./logger";

async function upsertTags(
  artistId: string,
  type: "genre" | "mood" | "theme",
  values: string[],
  source: string,
) {
  const rows = values
    .filter((v) => typeof v === "string" && v.trim().length > 0)
    .map((tag) => ({ artistId, tag, type, source }));
  if (rows.length === 0) return;
  await db
    .insert(artistTagsTable)
    .values(rows)
    .onConflictDoUpdate({
      target: [artistTagsTable.artistId, artistTagsTable.tag, artistTagsTable.type],
      set: { source },
    });
}

/**
 * In-app enrichment — replaces the n8n pipeline entirely.
 *
 * Always runs:
 *   - Syncs the artist's manually-entered genres and moodTags into artist_tags
 *     so discovery search picks them up immediately.
 *
 * Runs when a Spotify *track* URL/ID is provided:
 *   - Enqueues the track with Cyanite, then polls once for a finished result.
 *   - Stores the audio analysis in artist_audio_analysis.
 *   - Upserts Cyanite genre + mood tags into artist_tags.
 *
 * Designed to be called fire-and-forget (don't await in the HTTP response path).
 */
export async function enrichArtist(
  artistId: string,
  spotifyInput?: string | null,
): Promise<void> {
  try {
    const [artist] = await db
      .select({ genres: artistsTable.genres, moodTags: artistsTable.moodTags })
      .from(artistsTable)
      .where(eq(artistsTable.id, artistId));

    if (!artist) return;

    // 1. Sync manual profile tags immediately
    await upsertTags(artistId, "genre", artist.genres ?? [], "profile");
    await upsertTags(artistId, "mood", artist.moodTags ?? [], "profile");

    // 2. Cyanite audio analysis — only for Spotify track URLs/IDs, not artist URLs
    if (!spotifyInput || !isSpotifyTrackInput(spotifyInput)) return;

    const trackId = parseSpotifyTrackId(spotifyInput);
    if (!trackId) return;

    await enqueueSpotifyTrack(trackId);

    // Poll once after a short delay — Cyanite usually finishes within seconds for
    // already-cached tracks. If still processing, the manual /enrich endpoint can
    // be called again later.
    await new Promise((r) => setTimeout(r, 3000));
    const analysis = await getSpotifyTrackAnalysis(trackId);

    if (analysis.status !== "finished") {
      logger.info({ artistId, trackId, status: analysis.status }, "Cyanite analysis not ready yet");
      return;
    }

    await db.insert(artistAudioAnalysisTable).values({
      artistId,
      genres: analysis.genreTags ?? [],
      moods: analysis.moodTags ?? [],
      energy: analysis.arousal ?? null,
      valence: analysis.valence ?? null,
      tempo: analysis.bpm ?? null,
      source: "cyanite",
      raw: analysis as Record<string, unknown>,
    });

    await upsertTags(artistId, "genre", analysis.genreTags ?? [], "cyanite");
    await upsertTags(artistId, "mood", analysis.moodTags ?? [], "cyanite");

    logger.info({ artistId, trackId }, "Cyanite enrichment complete");
  } catch (err) {
    logger.error({ artistId, err }, "enrichArtist failed");
  }
}
