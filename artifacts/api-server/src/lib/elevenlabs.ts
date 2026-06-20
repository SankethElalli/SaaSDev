const TTS_BASE = "https://api.elevenlabs.io/v1/text-to-speech";

export class ElevenLabsError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "ElevenLabsError";
  }
}

export async function generateSpeech(
  text: string,
  voiceId?: string,
  modelId = "eleven_turbo_v2",
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new ElevenLabsError("ELEVENLABS_API_KEY is not configured");

  const voice = voiceId ?? process.env.ELEVENLABS_VOICE_ID;
  if (!voice) throw new ElevenLabsError("ELEVENLABS_VOICE_ID is not configured");

  // Trim to safe limit (ElevenLabs free tier max per request)
  const safeText = text.length > 4000 ? text.slice(0, 4000) : text;

  const res = await fetch(`${TTS_BASE}/${encodeURIComponent(voice)}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: safeText,
      model_id: modelId,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ElevenLabsError(
      `ElevenLabs API error ${res.status}${detail ? `: ${detail}` : ""}`,
      res.status,
    );
  }

  return Buffer.from(await res.arrayBuffer());
}
