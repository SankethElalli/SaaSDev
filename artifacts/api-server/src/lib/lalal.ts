import { eq } from "drizzle-orm";
import { db, artistsTable, artistTracksTable, trackStemRequestsTable, trackStemsTable, notificationsTable } from "@workspace/db";
import { logger } from "./logger";

const BASE = "https://www.lalal.ai/api/v1";

function apiKey(): string {
  const key = process.env.LALAL_API_KEY;
  if (!key) throw new Error("LALAL_API_KEY is not configured");
  return key;
}

export type LalalStatus = "queued" | "processing" | "success" | "error";

export interface LalalResult {
  status: LalalStatus;
  stemUrl?: string;
  backUrl?: string;
  error?: string;
}

/** Download audio from URL then upload raw binary to lalal.ai. Returns job id. */
async function uploadBinary(audioUrl: string, trackTitle: string): Promise<string> {
  logger.info({ audioUrl }, "Downloading audio for lalal.ai upload");
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) throw new Error(`Failed to download audio: ${audioRes.status}`);
  const buffer = await audioRes.arrayBuffer();
  logger.info({ bytes: buffer.byteLength }, "Audio downloaded, uploading to lalal.ai");

  const filename = trackTitle.replace(/[^a-zA-Z0-9_-]/g, "_") + ".mp3";
  const res = await fetch(`${BASE}/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-License-Key": apiKey(),
    },
    body: buffer,
  });

  const text = await res.text();
  logger.info({ status: res.status, body: text }, "lalal.ai upload response");

  if (!res.ok) throw new Error(`lalal.ai upload failed ${res.status}: ${text}`);

  const json = JSON.parse(text) as { id?: string; error?: string };
  if (!json.id) throw new Error(`lalal.ai upload: no id — ${json.error ?? "unknown"}`);
  return json.id;
}

async function split(id: string, stem: string, splitter: string): Promise<void> {
  const res = await fetch(`${BASE}/split`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-License-Key": apiKey(),
    },
    body: JSON.stringify({ id, stem, splitter }),
  });
  const text = await res.text();
  logger.info({ status: res.status, body: text, id, stem }, "lalal.ai split response");
  if (!res.ok) throw new Error(`lalal.ai split failed ${res.status}: ${text}`);
}

async function getResult(id: string): Promise<LalalResult> {
  const res = await fetch(`${BASE}/result?id=${encodeURIComponent(id)}`, {
    headers: { "X-License-Key": apiKey() },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`lalal.ai result failed ${res.status}: ${text}`);
  }
  const json = (await res.json()) as {
    status?: string;
    // lalal.ai v1 uses "split", not "result"
    split?: { stem_track?: string; back_track?: string };
    result?: { stem_track?: string; back_track?: string };
    error?: string;
  };
  const urls = json.split ?? json.result;
  logger.info({ json }, "lalal.ai result payload");
  return {
    status: (json.status ?? "error") as LalalStatus,
    stemUrl: urls?.stem_track,
    backUrl: urls?.back_track,
    error: json.error,
  };
}

async function poll(id: string, maxAttempts = 30, intervalMs = 10_000): Promise<LalalResult> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const result = await getResult(id);
    if (result.status === "success" || result.status === "error") return result;
    logger.info({ lalalId: id, attempt: i + 1, status: result.status }, "lalal.ai polling");
  }
  throw new Error("lalal.ai polling timed out after 5 minutes");
}

async function notify(profileId: string, type: string, title: string, body: string, metadata?: Record<string, unknown>) {
  try {
    await db.insert(notificationsTable).values({ profileId, type, title, body, metadata });
  } catch { /* non-fatal */ }
}

/**
 * Full background pipeline: download → upload → split → poll → save stems → notify.
 * Call without await so the HTTP response is not blocked.
 */
export async function processStemsBackground(
  stemRequestId: string,
  trackUrl: string,
  trackTitle: string,
  stemType: string,
  splitter = "phoenix",
): Promise<void> {
  logger.info({ stemRequestId, stemType }, "Starting lalal.ai stem processing");

  // Fetch the stem request to get requester info
  const [stemReq] = await db
    .select()
    .from(trackStemRequestsTable)
    .where(eq(trackStemRequestsTable.id, stemRequestId))
    .limit(1);
  if (!stemReq) { logger.warn({ stemRequestId }, "Stem request not found"); return; }

  const [requesterArtist] = await db
    .select({ profileId: artistsTable.profileId })
    .from(artistsTable)
    .where(eq(artistsTable.id, stemReq.requesterArtistId))
    .limit(1);

  const requesterProfileId = requesterArtist?.profileId;

  try {
    // Upload binary to lalal.ai
    const lalalId = await uploadBinary(trackUrl, trackTitle);
    logger.info({ stemRequestId, lalalId }, "Uploaded to lalal.ai");

    // Save job id
    await db
      .update(trackStemRequestsTable)
      .set({ lalalJobId: lalalId, updatedAt: new Date() })
      .where(eq(trackStemRequestsTable.id, stemRequestId));

    // Normalize stem type to lalal.ai's expected values
    // "instrumental" → request "vocals" split (back_track is the instrumental)
    // "drums" → lalal.ai uses singular "drum"
    const lalalStem = stemType === "instrumental" ? "vocals" : stemType === "drums" ? "drum" : stemType;

    // Start split
    await split(lalalId, lalalStem, splitter);
    logger.info({ stemRequestId, lalalId }, "Split started");

    // Poll until done
    const result = await poll(lalalId);

    if (result.status === "error" || (!result.stemUrl && !result.backUrl)) {
      throw new Error(result.error ?? "lalal.ai returned error status");
    }

    // Save stems
    const stems: { stemRequestId: string; stemType: string; url: string }[] = [];
    if (result.stemUrl) stems.push({ stemRequestId, stemType: "vocal", url: result.stemUrl });
    if (result.backUrl) stems.push({ stemRequestId, stemType: "instrumental", url: result.backUrl });

    if (stems.length > 0) await db.insert(trackStemsTable).values(stems);

    await db
      .update(trackStemRequestsTable)
      .set({ status: "ready", updatedAt: new Date() })
      .where(eq(trackStemRequestsTable.id, stemRequestId));

    logger.info({ stemRequestId }, "Stems ready");

    // Notify requester
    if (requesterProfileId) {
      await notify(
        requesterProfileId,
        "stems_ready",
        "Stems ready to download!",
        `Your ${stemType} stems from "${trackTitle}" are ready`,
        { stemRequestId },
      );
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err: errMsg, stemRequestId }, "lalal.ai processing failed");

    // Nested try so a DB/RLS error here doesn't hide the real error
    try {
      await db
        .update(trackStemRequestsTable)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(trackStemRequestsTable.id, stemRequestId));
    } catch (dbErr) {
      logger.error({ dbErr: String(dbErr), stemRequestId }, "Could not set status=failed — RLS likely blocking update");
    }

    if (requesterProfileId) {
      try {
        await notify(
          requesterProfileId,
          "stems_failed",
          "Stem processing failed",
          errMsg,
          { stemRequestId },
        );
      } catch { /* non-fatal */ }
    }
  }
}
