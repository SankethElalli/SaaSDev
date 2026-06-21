const BASE = "https://www.lalal.ai/api/v1";

function apiKey(): string {
  const key = process.env.LALAL_API_KEY;
  if (!key) throw new Error("LALAL_API_KEY is not configured");
  return key;
}

function authHeader() {
  return { Authorization: `license ${apiKey()}` };
}

export type LalalStatus = "queued" | "processing" | "success" | "error";

export interface LalalResult {
  status: LalalStatus;
  stemUrl?: string;    // isolated stem (e.g. vocals)
  backUrl?: string;    // background/instrumental
  error?: string;
}

/** Upload an audio file by public URL and return the lalal job id. */
export async function lalalUploadFromUrl(audioUrl: string): Promise<string> {
  const res = await fetch(`${BASE}/upload/`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ url: audioUrl }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`lalal.ai upload failed ${res.status}: ${text}`);
  }
  const json = (await res.json()) as { id?: string; error?: string };
  if (!json.id) throw new Error(`lalal.ai upload: no id returned — ${json.error ?? "unknown error"}`);
  return json.id;
}

/** Start stem splitting. stem="vocals" splits to vocal + instrumental. */
export async function lalalSplit(
  id: string,
  stem = "vocals",
  splitter = "phoenix",
): Promise<void> {
  const res = await fetch(`${BASE}/split/`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ id, stem, splitter }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`lalal.ai split failed ${res.status}: ${text}`);
  }
}

/** Poll split result. Call after lalalSplit. */
export async function lalalGetResult(id: string): Promise<LalalResult> {
  const res = await fetch(`${BASE}/result/?id=${encodeURIComponent(id)}`, {
    headers: authHeader(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`lalal.ai result failed ${res.status}: ${text}`);
  }
  const json = (await res.json()) as {
    status?: string;
    result?: {
      stem_track?: string;
      back_track?: string;
    };
    error?: string;
  };

  const status = (json.status ?? "error") as LalalStatus;
  return {
    status,
    stemUrl: json.result?.stem_track,
    backUrl: json.result?.back_track,
    error: json.error,
  };
}
