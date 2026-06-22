import { Router, type IRouter } from "express";
import { eq, and, or, count } from "drizzle-orm";
import {
  db,
  artistsTable,
  artistTracksTable,
  trackStemRequestsTable,
  trackStemsTable,
  notificationsTable,
  profilesTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { processStemsBackground } from "../lib/lalal";
import { logger } from "../lib/logger";

async function notify(
  profileId: string,
  type: string,
  title: string,
  body: string,
  metadata?: Record<string, unknown>,
) {
  try {
    await db.insert(notificationsTable).values({ profileId, type, title, body, metadata });
  } catch {
    // non-fatal
  }
}

async function getArtistProfileId(artistId: string): Promise<string | null> {
  const [row] = await db
    .select({ profileId: artistsTable.profileId })
    .from(artistsTable)
    .where(eq(artistsTable.id, artistId))
    .limit(1);
  return row?.profileId ?? null;
}

const router: IRouter = Router();

// ─── Tracks ──────────────────────────────────────────────────────────────────

// GET /artists/:id/tracks — public, list an artist's uploaded tracks
router.get("/artists/:id/tracks", async (req, res) => {
  const { id } = req.params;
  const tracks = await db
    .select()
    .from(artistTracksTable)
    .where(eq(artistTracksTable.artistId, id))
    .orderBy(artistTracksTable.createdAt);
  res.json(tracks);
});

// POST /artists/:id/tracks — upload a track (auth, max 3 per artist)
router.post("/artists/:id/tracks", requireAuth, async (req, res) => {
  const { id: artistId } = req.params;
  const { title, url, durationSeconds } = req.body as {
    title?: string;
    url?: string;
    durationSeconds?: number;
  };

  if (!title?.trim() || !url?.trim()) {
    res.status(400).json({ error: "title and url are required" });
    return;
  }

  // Verify ownership
  if (req.userId) {
    const [artist] = await db
      .select({ profileId: artistsTable.profileId })
      .from(artistsTable)
      .where(eq(artistsTable.id, artistId))
      .limit(1);
    if (!artist || artist.profileId !== req.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  // Enforce max 3 tracks
  const [{ value: trackCount }] = await db
    .select({ value: count() })
    .from(artistTracksTable)
    .where(eq(artistTracksTable.artistId, artistId));
  if (Number(trackCount) >= 3) {
    res.status(400).json({ error: "Maximum 3 tracks per artist" });
    return;
  }

  const [inserted] = await db
    .insert(artistTracksTable)
    .values({
      artistId,
      title: title.trim(),
      url: url.trim(),
      durationSeconds: durationSeconds ?? null,
    })
    .returning();

  res.status(201).json(inserted);
});

// DELETE /artists/:id/tracks/:tid
router.delete("/artists/:id/tracks/:tid", requireAuth, async (req, res) => {
  const { id: artistId, tid } = req.params;

  if (req.userId) {
    const [artist] = await db
      .select({ profileId: artistsTable.profileId })
      .from(artistsTable)
      .where(eq(artistsTable.id, artistId))
      .limit(1);
    if (!artist || artist.profileId !== req.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  await db
    .delete(artistTracksTable)
    .where(and(eq(artistTracksTable.id, tid), eq(artistTracksTable.artistId, artistId)));
  res.json({ success: true });
});

// ─── Stem Requests ────────────────────────────────────────────────────────────

// POST /tracks/:trackId/stem-requests — request stems from another artist
router.post("/tracks/:trackId/stem-requests", requireAuth, async (req, res) => {
  const { trackId } = req.params;
  const VALID_STEMS = ["vocals", "instrumental", "drums", "bass", "piano", "guitar"];

  const { requesterArtistId, stemType, message } = req.body as {
    requesterArtistId?: string;
    stemType?: string;
    message?: string;
  };

  if (!requesterArtistId) {
    res.status(400).json({ error: "requesterArtistId is required" });
    return;
  }
  if (!stemType || !VALID_STEMS.includes(stemType)) {
    res.status(400).json({ error: `stemType must be one of: ${VALID_STEMS.join(", ")}` });
    return;
  }

  // Verify the requester owns their artist profile
  if (req.userId) {
    const [requester] = await db
      .select({ profileId: artistsTable.profileId })
      .from(artistsTable)
      .where(eq(artistsTable.id, requesterArtistId))
      .limit(1);
    if (!requester || requester.profileId !== req.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  // Look up the track and its owner
  const [track] = await db
    .select()
    .from(artistTracksTable)
    .where(eq(artistTracksTable.id, trackId))
    .limit(1);
  if (!track) {
    res.status(404).json({ error: "Track not found" });
    return;
  }
  if (track.artistId === requesterArtistId) {
    res.status(400).json({ error: "Cannot request stems from your own track" });
    return;
  }

  // Block duplicate pending requests
  const [existing] = await db
    .select({ id: trackStemRequestsTable.id })
    .from(trackStemRequestsTable)
    .where(
      and(
        eq(trackStemRequestsTable.trackId, trackId),
        eq(trackStemRequestsTable.requesterArtistId, requesterArtistId),
        eq(trackStemRequestsTable.status, "pending"),
      ),
    )
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "A pending request already exists for this track" });
    return;
  }

  const [inserted] = await db
    .insert(trackStemRequestsTable)
    .values({
      trackId,
      requesterArtistId,
      ownerArtistId: track.artistId,
      stemType: stemType!,
      message: message?.trim() ?? null,
    })
    .returning();

  // Notify track owner
  const ownerProfileId = await getArtistProfileId(track.artistId);
  if (ownerProfileId) {
    await notify(
      ownerProfileId,
      "stem_request_received",
      "New stem request",
      `Someone requested the ${stemType} stem from "${track.title}"`,
      { stemRequestId: inserted.id, trackId },
    );
  }

  res.status(201).json(inserted);
});

// GET /artists/:id/stem-requests — list all stem requests involving an artist (auth)
router.get("/artists/:id/stem-requests", requireAuth, async (req, res) => {
  const { id: artistId } = req.params;

  if (req.userId) {
    const [artist] = await db
      .select({ profileId: artistsTable.profileId })
      .from(artistsTable)
      .where(eq(artistsTable.id, artistId))
      .limit(1);
    if (!artist || artist.profileId !== req.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  const requests = await db
    .select({
      id: trackStemRequestsTable.id,
      trackId: trackStemRequestsTable.trackId,
      trackTitle: artistTracksTable.title,
      trackUrl: artistTracksTable.url,
      requesterArtistId: trackStemRequestsTable.requesterArtistId,
      ownerArtistId: trackStemRequestsTable.ownerArtistId,
      status: trackStemRequestsTable.status,
      stemType: trackStemRequestsTable.stemType,
      lalalJobId: trackStemRequestsTable.lalalJobId,
      message: trackStemRequestsTable.message,
      createdAt: trackStemRequestsTable.createdAt,
      updatedAt: trackStemRequestsTable.updatedAt,
    })
    .from(trackStemRequestsTable)
    .leftJoin(artistTracksTable, eq(trackStemRequestsTable.trackId, artistTracksTable.id))
    .where(
      or(
        eq(trackStemRequestsTable.requesterArtistId, artistId),
        eq(trackStemRequestsTable.ownerArtistId, artistId),
      ),
    )
    .orderBy(trackStemRequestsTable.createdAt);

  res.json(requests);
});

// PATCH /stem-requests/:id — approve or decline (owner only)
router.patch("/stem-requests/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body as { status?: string };

  if (!status || !["approved", "declined"].includes(status)) {
    res.status(400).json({ error: "status must be 'approved' or 'declined'" });
    return;
  }

  const [stemReq] = await db
    .select()
    .from(trackStemRequestsTable)
    .where(eq(trackStemRequestsTable.id, id))
    .limit(1);
  if (!stemReq) {
    res.status(404).json({ error: "Stem request not found" });
    return;
  }

  // Only the track owner may approve/decline
  if (req.userId) {
    const [owner] = await db
      .select({ profileId: artistsTable.profileId })
      .from(artistsTable)
      .where(eq(artistsTable.id, stemReq.ownerArtistId))
      .limit(1);
    if (!owner || owner.profileId !== req.userId) {
      res.status(403).json({ error: "Only the track owner can approve or decline" });
      return;
    }
  }

  const [updated] = await db
    .update(trackStemRequestsTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(trackStemRequestsTable.id, id))
    .returning();

  // Notify requester of approve/decline
  const requesterProfileId = await getArtistProfileId(stemReq.requesterArtistId);
  if (requesterProfileId) {
    if (status === "approved") {
      await notify(
        requesterProfileId,
        "stem_request_approved",
        "Stem request approved",
        `Your ${stemReq.stemType} stem request is being processed`,
        { stemRequestId: id, trackId: stemReq.trackId },
      );
    } else {
      await notify(
        requesterProfileId,
        "stem_request_declined",
        "Stem request declined",
        `Your ${stemReq.stemType} stem request was declined`,
        { stemRequestId: id, trackId: stemReq.trackId },
      );
    }
  }

  // On approval: fetch the track URL and dispatch to n8n for lalal.ai processing
  if (status === "approved") {
    const [track] = await db
      .select()
      .from(artistTracksTable)
      .where(eq(artistTracksTable.id, stemReq.trackId))
      .limit(1);

    if (track) {
      // Mark as processing immediately
      await db
        .update(trackStemRequestsTable)
        .set({ status: "processing", updatedAt: new Date() })
        .where(eq(trackStemRequestsTable.id, id));

      // Fire-and-forget background processing — does not block the response
      processStemsBackground(id, track.url, track.title, stemReq.stemType).catch((err) => {
        logger.error({ err, stemRequestId: id }, "Background stem processing crashed");
      });
    }
  }

  res.json(updated);
});

// GET /stem-requests/:id/stems — list ready stems
router.get("/stem-requests/:id/stems", requireAuth, async (req, res) => {
  const { id: stemRequestId } = req.params;

  const [stemReq] = await db
    .select()
    .from(trackStemRequestsTable)
    .where(eq(trackStemRequestsTable.id, stemRequestId))
    .limit(1);
  if (!stemReq) {
    res.status(404).json({ error: "Stem request not found" });
    return;
  }

  // Only requester or owner can view stems
  if (req.userId) {
    const [requester, owner] = await Promise.all([
      db
        .select({ profileId: artistsTable.profileId })
        .from(artistsTable)
        .where(eq(artistsTable.id, stemReq.requesterArtistId))
        .limit(1),
      db
        .select({ profileId: artistsTable.profileId })
        .from(artistsTable)
        .where(eq(artistsTable.id, stemReq.ownerArtistId))
        .limit(1),
    ]);
    const isRequester = requester[0]?.profileId === req.userId;
    const isOwner = owner[0]?.profileId === req.userId;
    if (!isRequester && !isOwner) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  const stems = await db
    .select()
    .from(trackStemsTable)
    .where(eq(trackStemsTable.stemRequestId, stemRequestId));

  res.json(stems);
});

// GET /stem-requests/:id/debug — shows full status + lalal job id (no auth for dev)
router.get("/stem-requests/:id/debug", async (req, res) => {
  const [req_] = await db
    .select()
    .from(trackStemRequestsTable)
    .where(eq(trackStemRequestsTable.id, req.params.id))
    .limit(1);
  if (!req_) { res.status(404).json({ error: "Not found" }); return; }

  const stems = await db
    .select()
    .from(trackStemsTable)
    .where(eq(trackStemsTable.stemRequestId, req.params.id));

  res.json({ request: req_, stems, lalalApiKeySet: !!process.env.LALAL_API_KEY });
});

// GET /debug/lalal — test lalal.ai connectivity
router.get("/debug/lalal", async (_req, res) => {
  const key = process.env.LALAL_API_KEY;
  if (!key) { res.json({ ok: false, error: "LALAL_API_KEY not set" }); return; }
  try {
    const r = await fetch("https://www.lalal.ai/api/v1/result/?id=test-ping", {
      headers: { "X-License-Key": key },
    });
    const body = await r.text();
    res.json({ ok: true, status: r.status, body });
  } catch (e) {
    res.json({ ok: false, error: String(e) });
  }
});

export default router;
