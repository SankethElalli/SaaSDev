import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, profilesTable, artistsTable, venuesTable } from "@workspace/db";
import {
  UpsertProfileBody,
  UpdateProfileBody,
  UpdateProfileParams,
  GetProfileParams,
  GetMyArtistParams,
  GetMyVenueParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// The artist/venue record a user owns (role-specific dashboards). Returns the
// most recently created one if a profile somehow owns several.
router.get("/profiles/:id/artist", async (req, res) => {
  const { id } = GetMyArtistParams.parse(req.params);
  const [artist] = await db
    .select()
    .from(artistsTable)
    .where(eq(artistsTable.profileId, id))
    .orderBy(desc(artistsTable.createdAt))
    .limit(1);
  if (!artist) {
    res.status(404).json({ error: "No artist profile yet" });
    return;
  }
  res.json(artist);
});

router.get("/profiles/:id/venue", async (req, res) => {
  const { id } = GetMyVenueParams.parse(req.params);
  const [venue] = await db
    .select()
    .from(venuesTable)
    .where(eq(venuesTable.profileId, id))
    .orderBy(desc(venuesTable.createdAt))
    .limit(1);
  if (!venue) {
    res.status(404).json({ error: "No venue profile yet" });
    return;
  }
  res.json(venue);
});

router.get("/profiles/:id", async (req, res) => {
  const { id } = GetProfileParams.parse(req.params);
  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.id, id));
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json(profile);
});

router.post("/profiles", async (req, res) => {
  const body = UpsertProfileBody.parse(req.body);
  const [profile] = await db
    .insert(profilesTable)
    .values(body)
    .onConflictDoUpdate({
      target: profilesTable.id,
      set: {
        email: body.email,
        ...(body.role ? { role: body.role } : {}),
        ...(body.displayName !== undefined
          ? { displayName: body.displayName }
          : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
        ...(body.bio !== undefined ? { bio: body.bio } : {}),
        ...(body.city !== undefined ? { city: body.city } : {}),
        ...(body.websiteUrl !== undefined
          ? { websiteUrl: body.websiteUrl }
          : {}),
      },
    })
    .returning();

  res.json(profile);
});

router.patch("/profiles/:id", async (req, res) => {
  const { id } = UpdateProfileParams.parse(req.params);
  const body = UpdateProfileBody.parse(req.body);
  const [profile] = await db
    .update(profilesTable)
    .set(body)
    .where(eq(profilesTable.id, id))
    .returning();
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json(profile);
});

export default router;
