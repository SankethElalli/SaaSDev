import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  artistsTable,
  artistAudioAnalysisTable,
  artistLyricAnalysisTable,
  artistTagsTable,
  insertArtistAudioAnalysisSchema,
  insertArtistLyricAnalysisSchema,
} from "@workspace/db";
import { verifyN8nSecret } from "../lib/n8n";
import { verifyCyaniteSignature } from "../lib/cyanite";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Upsert mood/genre tags derived from an analysis run so discovery search picks
// them up. Conflicts on (artistId, tag, type) refresh the score + source.
async function upsertTags(
  artistId: string,
  type: "genre" | "mood" | "theme",
  values: unknown,
  source: string,
) {
  if (!Array.isArray(values)) return;
  const rows = values
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((tag) => ({ artistId, tag, type, source }));
  if (rows.length === 0) return;
  await db
    .insert(artistTagsTable)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        artistTagsTable.artistId,
        artistTagsTable.tag,
        artistTagsTable.type,
      ],
      set: { source },
    });
}

/**
 * Inbound webhook callback from n8n workflows. Secured by a shared secret
 * sent in the `x-webhook-secret` header. Lets automation flows write back
 * into ScenePulse (e.g. mark an artist verified after enrichment).
 */
router.post("/webhooks/n8n/:event", async (req, res) => {
  if (!verifyN8nSecret(req.header("x-webhook-secret") ?? undefined)) {
    res.status(401).json({ error: "Invalid webhook secret" });
    return;
  }

  const { event } = req.params;
  const payload = (req.body ?? {}) as Record<string, unknown>;
  logger.info({ event }, "Received n8n webhook");

  switch (event) {
    case "artist.verify": {
      const artistId = payload["artistId"];
      if (typeof artistId === "string") {
        await db
          .update(artistsTable)
          .set({ verified: true })
          .where(eq(artistsTable.id, artistId));
      }
      break;
    }
    case "artist.audio_analysis": {
      // Cyanite (or compatible) audio features written back by the pipeline.
      const parsed = insertArtistAudioAnalysisSchema.safeParse({
        ...payload,
        source: typeof payload["source"] === "string" ? payload["source"] : "n8n",
      });
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid audio analysis payload" });
        return;
      }
      await db.insert(artistAudioAnalysisTable).values(parsed.data);
      await upsertTags(
        parsed.data.artistId,
        "genre",
        parsed.data.genres,
        parsed.data.source ?? "n8n",
      );
      await upsertTags(
        parsed.data.artistId,
        "mood",
        parsed.data.moods,
        parsed.data.source ?? "n8n",
      );
      break;
    }
    case "artist.lyric_analysis": {
      // Musixmatch + NLP lyric analysis written back by the pipeline.
      const parsed = insertArtistLyricAnalysisSchema.safeParse({
        ...payload,
        source: typeof payload["source"] === "string" ? payload["source"] : "n8n",
      });
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid lyric analysis payload" });
        return;
      }
      await db.insert(artistLyricAnalysisTable).values(parsed.data);
      await upsertTags(
        parsed.data.artistId,
        "theme",
        parsed.data.themes,
        parsed.data.source ?? "n8n",
      );
      break;
    }
    default:
      // Acknowledge unknown events so n8n flows don't fail.
      break;
  }

  res.json({ received: true });
});

/**
 * Inbound webhook from Cyanite. Cyanite POSTs here when an asynchronous job
 * (e.g. an audio analysis) finishes. Setup notes:
 *   - Test events (sent from the Cyanite dashboard) carry no `Signature`
 *     header and must simply receive a 200 so the URL validates.
 *   - Real events are signed with HMAC-SHA512 over the raw body using the
 *     shared `CYANITE_WEBHOOK_SECRET`; we reject anything that fails to verify.
 *   - We always ack with 200 on success — Cyanite retries non-200 responses.
 * The finished analysis itself is fetched from Cyanite's GraphQL API by the
 * enqueue/poll flow; this endpoint is the async-completion notification channel.
 */
router.post("/webhooks/cyanite", (req, res) => {
  const payload = (req.body ?? {}) as Record<string, unknown>;

  if (payload["type"] === "TEST") {
    logger.info("Received Cyanite TEST webhook");
    res.sendStatus(200);
    return;
  }

  const signature = req.header("signature") ?? undefined;
  const rawBody =
    (req as typeof req & { rawBody?: Buffer }).rawBody ??
    Buffer.from(JSON.stringify(payload));

  if (!verifyCyaniteSignature(rawBody, signature)) {
    logger.warn("Rejected Cyanite webhook: invalid or missing signature");
    res.sendStatus(401);
    return;
  }

  logger.info({ type: payload["type"] }, "Received verified Cyanite webhook");
  res.sendStatus(200);
});

export default router;
