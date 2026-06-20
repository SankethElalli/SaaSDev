import { Router, type IRouter } from "express";
import { desc, eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  db,
  collaborationRequestsTable,
  artistsTable,
} from "@workspace/db";
import {
  ListArtistCollaborationsParams,
  CreateCollaborationRequestBody,
  UpdateCollaborationRequestParams,
  UpdateCollaborationRequestBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

const fromArtist = alias(artistsTable, "from_artist");
const toArtist = alias(artistsTable, "to_artist");

const collabSelection = {
  id: collaborationRequestsTable.id,
  fromArtistId: collaborationRequestsTable.fromArtistId,
  toArtistId: collaborationRequestsTable.toArtistId,
  message: collaborationRequestsTable.message,
  status: collaborationRequestsTable.status,
  createdAt: collaborationRequestsTable.createdAt,
  fromArtistName: fromArtist.artistName,
  toArtistName: toArtist.artistName,
};

function enrichedCollabQuery() {
  return db
    .select(collabSelection)
    .from(collaborationRequestsTable)
    .leftJoin(
      fromArtist,
      eq(collaborationRequestsTable.fromArtistId, fromArtist.id),
    )
    .leftJoin(
      toArtist,
      eq(collaborationRequestsTable.toArtistId, toArtist.id),
    );
}

router.get("/artists/:id/collaborations", async (req, res) => {
  const { id } = ListArtistCollaborationsParams.parse(req.params);
  const rows = await enrichedCollabQuery()
    .where(
      or(
        eq(collaborationRequestsTable.fromArtistId, id),
        eq(collaborationRequestsTable.toArtistId, id),
      ),
    )
    .orderBy(desc(collaborationRequestsTable.createdAt));
  res.json(rows);
});

router.post("/collaborations", requireAuth, async (req, res) => {
  const body = CreateCollaborationRequestBody.parse(req.body);
  if (body.fromArtistId === body.toArtistId) {
    res.status(400).json({ error: "Cannot collaborate with yourself" });
    return;
  }

  if (req.userId) {
    const [sender] = await db
      .select({ profileId: artistsTable.profileId })
      .from(artistsTable)
      .where(eq(artistsTable.id, body.fromArtistId));
    if (!sender || sender.profileId !== req.userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  const [inserted] = await db
    .insert(collaborationRequestsTable)
    .values({
      fromArtistId: body.fromArtistId,
      toArtistId: body.toArtistId,
      message: body.message,
    })
    .returning();

  const [enriched] = await enrichedCollabQuery().where(
    eq(collaborationRequestsTable.id, inserted.id),
  );
  res.status(201).json(enriched);
});

router.patch("/collaborations/:id", requireAuth, async (req, res) => {
  const { id } = UpdateCollaborationRequestParams.parse(req.params);
  const body = UpdateCollaborationRequestBody.parse(req.body);

  const [existing] = await db
    .select()
    .from(collaborationRequestsTable)
    .where(eq(collaborationRequestsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Collaboration request not found" });
    return;
  }

  if (req.userId) {
    const [senderArtist, recipientArtist] = await Promise.all([
      db
        .select({ profileId: artistsTable.profileId })
        .from(artistsTable)
        .where(eq(artistsTable.id, existing.fromArtistId))
        .limit(1),
      db
        .select({ profileId: artistsTable.profileId })
        .from(artistsTable)
        .where(eq(artistsTable.id, existing.toArtistId))
        .limit(1),
    ]);
    const ownsFrom = senderArtist[0]?.profileId === req.userId;
    const ownsTo = recipientArtist[0]?.profileId === req.userId;

    if (!ownsFrom && !ownsTo) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Only the recipient may accept or decline — the sender can only withdraw
    // (cancel their own pending request). This prevents a sender accepting their
    // own outgoing request.
    if ((body.status === "accepted" || body.status === "declined") && !ownsTo) {
      res.status(403).json({ error: "Only the recipient may accept or decline a collaboration request" });
      return;
    }
  }

  const [updated] = await db
    .update(collaborationRequestsTable)
    .set({ status: body.status })
    .where(eq(collaborationRequestsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Collaboration request not found" });
    return;
  }

  const [enriched] = await enrichedCollabQuery().where(
    eq(collaborationRequestsTable.id, id),
  );
  res.json(enriched);
});

export default router;
