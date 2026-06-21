import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, notificationsTable, profilesTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

// GET /notifications — all notifications for the logged-in user
router.get("/notifications", requireAuth, async (req, res) => {
  const [profile] = await db
    .select({ id: profilesTable.id })
    .from(profilesTable)
    .where(eq(profilesTable.userId, req.userId!))
    .limit(1);

  if (!profile) { res.json([]); return; }

  const items = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.profileId, profile.id))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  res.json(items);
});

// PATCH /notifications/:id/read — mark one as read
router.patch("/notifications/:id/read", requireAuth, async (req, res) => {
  const [profile] = await db
    .select({ id: profilesTable.id })
    .from(profilesTable)
    .where(eq(profilesTable.userId, req.userId!))
    .limit(1);

  if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }

  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.id, req.params.id), eq(notificationsTable.profileId, profile.id)));

  res.json({ success: true });
});

// PATCH /notifications/read-all — mark all as read
router.patch("/notifications/read-all", requireAuth, async (req, res) => {
  const [profile] = await db
    .select({ id: profilesTable.id })
    .from(profilesTable)
    .where(eq(profilesTable.userId, req.userId!))
    .limit(1);

  if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }

  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(eq(notificationsTable.profileId, profile.id));

  res.json({ success: true });
});

export default router;
