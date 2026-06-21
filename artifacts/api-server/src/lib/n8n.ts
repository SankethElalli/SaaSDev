import { logger } from "./logger";

const N8N_WEBHOOK_URL = process.env["N8N_WEBHOOK_URL"];
const N8N_WEBHOOK_SECRET = process.env["N8N_WEBHOOK_SECRET"];

/**
 * Best-effort outbound event dispatch to an n8n workflow webhook.
 * If N8N_WEBHOOK_URL is not configured, this is a no-op so the app keeps
 * working without n8n wired up. Never throws — failures are logged only.
 */
export async function dispatchN8nEvent(
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!N8N_WEBHOOK_URL) {
    logger.warn({ event }, "N8N_WEBHOOK_URL not set — skipping dispatch");
    return;
  }

  logger.info({ event, url: N8N_WEBHOOK_URL }, "Dispatching n8n event");

  try {
    const res = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(N8N_WEBHOOK_SECRET
          ? { "x-webhook-secret": N8N_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify({ event, payload, sentAt: new Date().toISOString() }),
    });
    logger.info({ event, status: res.status }, "n8n dispatch response");
  } catch (err) {
    logger.warn({ err, event }, "Failed to dispatch n8n event");
  }
}

/** Verify an inbound webhook call from n8n using the shared secret. */
export function verifyN8nSecret(secret: string | undefined): boolean {
  if (!N8N_WEBHOOK_SECRET) return false;
  return secret === N8N_WEBHOOK_SECRET;
}
