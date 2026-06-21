import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { artistsTable } from "./artists";

export const artistTracksTable = pgTable("artist_tracks", {
  id: uuid("id").primaryKey().defaultRandom(),
  artistId: uuid("artist_id")
    .notNull()
    .references(() => artistsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  url: text("url").notNull(),
  durationSeconds: integer("duration_seconds"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trackStemRequestsTable = pgTable("track_stem_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  trackId: uuid("track_id")
    .notNull()
    .references(() => artistTracksTable.id, { onDelete: "cascade" }),
  requesterArtistId: uuid("requester_artist_id")
    .notNull()
    .references(() => artistsTable.id, { onDelete: "cascade" }),
  ownerArtistId: uuid("owner_artist_id")
    .notNull()
    .references(() => artistsTable.id, { onDelete: "cascade" }),
  // pending → approved/declined → processing → ready/failed
  status: text("status").notNull().default("pending"),
  stemType: text("stem_type").notNull().default("vocals"),
  lalalJobId: text("lalal_job_id"),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trackStemsTable = pgTable("track_stems", {
  id: uuid("id").primaryKey().defaultRandom(),
  stemRequestId: uuid("stem_request_id")
    .notNull()
    .references(() => trackStemRequestsTable.id, { onDelete: "cascade" }),
  stemType: text("stem_type").notNull(), // "vocal" | "instrumental"
  url: text("url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertArtistTrackSchema = createInsertSchema(artistTracksTable).omit({
  id: true,
  createdAt: true,
});
export type InsertArtistTrack = z.infer<typeof insertArtistTrackSchema>;
export type ArtistTrack = typeof artistTracksTable.$inferSelect;

export const insertTrackStemRequestSchema = createInsertSchema(
  trackStemRequestsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTrackStemRequest = z.infer<typeof insertTrackStemRequestSchema>;
export type TrackStemRequest = typeof trackStemRequestsTable.$inferSelect;

export const insertTrackStemSchema = createInsertSchema(trackStemsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTrackStem = z.infer<typeof insertTrackStemSchema>;
export type TrackStem = typeof trackStemsTable.$inferSelect;
