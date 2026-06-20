import { Router, type IRouter } from "express";
import { generateSpeech, ElevenLabsError } from "../lib/elevenlabs";

const router: IRouter = Router();

interface RadioArtist { name: string; genre?: string | null }
interface RadioVenue  { name: string; city?: string | null }
interface RadioLiveEvent {
  name: string;
  venueName: string;
  startDate: string;
  performers: { name: string; genre: string[] }[];
}

interface RadioBody {
  lat: number;
  lng: number;
  city?: string;
  artists: RadioArtist[];
  venues: RadioVenue[];
  liveEvents: RadioLiveEvent[];
}

function buildScript(body: RadioBody): string {
  const city = body.city?.trim() || "your area";

  // Live events — up to 3
  const liveLines: string[] = body.liveEvents.slice(0, 3).map((e) => {
    const headliner = e.performers.find((p) => p.name) ?? e.performers[0];
    const who = headliner ? headliner.name : e.name;
    return `${who} at ${e.venueName}`;
  });

  // Local artists — up to 3
  const artistLines: string[] = body.artists.slice(0, 3).map((a) =>
    a.genre ? `${a.name} (${a.genre})` : a.name,
  );

  const parts: string[] = [];

  parts.push(`You're listening to Scene Radio — your live guide to the music scene near ${city}.`);

  if (liveLines.length > 0) {
    parts.push(
      liveLines.length === 1
        ? `Tonight, catch ${liveLines[0]}.`
        : `Tonight's shows: ${liveLines.join(", ")}.`,
    );
  }

  if (artistLines.length > 0) {
    parts.push(
      artistLines.length === 1
        ? `Local artist on the map: ${artistLines[0]}.`
        : `Local artists on the map include ${artistLines.join(", ")}.`,
    );
  }

  if (liveLines.length === 0 && artistLines.length === 0) {
    parts.push("The scene is quiet right now — zoom out or explore a new area to discover more artists and shows.");
  }

  parts.push("Stay tuned, keep exploring, and support your local scene. This is Scene Radio.");

  const script = parts.join(" ");
  // Hard cap at 1200 chars to stay well within free-tier limits
  return script.length > 1200 ? script.slice(0, 1197) + "..." : script;
}

// POST /radio/generate
router.post("/radio/generate", async (req, res) => {
  const body = req.body as Partial<RadioBody>;

  if (typeof body.lat !== "number" || typeof body.lng !== "number") {
    res.status(400).json({ error: "lat and lng are required numbers" });
    return;
  }

  const clean: RadioBody = {
    lat: body.lat,
    lng: body.lng,
    city: typeof body.city === "string" ? body.city : undefined,
    artists:    Array.isArray(body.artists)    ? body.artists    : [],
    venues:     Array.isArray(body.venues)     ? body.venues     : [],
    liveEvents: Array.isArray(body.liveEvents) ? body.liveEvents : [],
  };

  const script = buildScript(clean);

  try {
    const audio = await generateSpeech(script);
    res.set("Content-Type", "audio/mpeg");
    res.set("Content-Length", String(audio.length));
    res.set("Cache-Control", "no-store");
    res.end(audio);
  } catch (err) {
    if (err instanceof ElevenLabsError) {
      res.status(503).json({ error: "TTS service unavailable", message: err.message });
      return;
    }
    throw err;
  }
});

export default router;
