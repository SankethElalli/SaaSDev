import { Router, type IRouter } from "express";
import { eq, and, or, count } from "drizzle-orm";
import {
  db,
  artistsTable,
  artistTracksTable,
  trackStemRequestsTable,
  trackStemsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { dispatchN8nEvent } from "../lib/n8n";

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

  // On approval: fetch the track URL and dispatch to n8n for lalal.ai processing
  if (status === "approved") {
    const [track] = await db
      .select()
      .from(artistTracksTable)
      .where(eq(artistTracksTable.id, stemReq.trackId))
      .limit(1);

    if (track) {
      // Mark as processing
      await db
        .update(trackStemRequestsTable)
        .set({ status: "processing", updatedAt: new Date() })
        .where(eq(trackStemRequestsTable.id, id));

      await dispatchN8nEvent("stem.process", {
        stemRequestId: id,
        trackId: stemReq.trackId,
        trackUrl: track.url,
        stem: stemReq.stemType,
        splitter: "phoenix",
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

export default router;
