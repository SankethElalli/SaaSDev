import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

// GET /notifications — notifications for the logged-in user (profileId === userId)
router.get("/notifications", requireAuth, async (req, res) => {
  const items = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.profileId, req.userId!))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);
  res.json(items);
});

// PATCH /notifications/read-all — must come before /:id/read to avoid route clash
router.patch("/notifications/read-all", requireAuth, async (req, res) => {
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(eq(notificationsTable.profileId, req.userId!));
  res.json({ success: true });
});

// PATCH /notifications/:id/read
router.patch("/notifications/:id/read", requireAuth, async (req, res) => {
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(eq(notificationsTable.id, req.params.id));
  res.json({ success: true });
});

export default router;
