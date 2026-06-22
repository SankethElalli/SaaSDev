import { Router, type IRouter } from "express";
import {
  fetchEventsByBbox,
  fetchGlobalLiveEvents,
  fetchVenueSetlistHistory,
  type JbEvent,
} from "../lib/jambase";

const router: IRouter = Router();

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

// Map a JamBase event to a ScenePin-compatible pin (with extra JamBase fields).
function eventToPin(e: JbEvent) {
  return {
    id: e.identifier,
    kind: "jambase-event" as const,
    name: e.name,
    latitude: e.location.geo!.latitude,
    longitude: e.location.geo!.longitude,
    city: e.location.address?.addressLocality ?? null,
    imageUrl: e.image ?? e.location.image ?? null,
    startDate: e.startDate,
    eventStatus: e.eventStatus,
    venueName: e.location.name,
    venueIdentifier: e.location.identifier,
    venueUrl: e.location.url,
    ticketUrl: e.offers?.[0]?.url ?? null,
    performers: e.performer.map((p) => ({
      name: p.name,
      identifier: p.identifier,
      url: p.url,
      image: p.image ?? null,
      isHeadliner: p.isHeadliner ?? false,
      genre: p.genre ?? [],
    })),
  };
}

const hasGeo = (e: JbEvent) =>
  e.location?.geo?.latitude != null && e.location?.geo?.longitude != null;

// GET /jambase/events/global
// Aggregated live events from major music hubs worldwide (for Global mode).
router.get("/jambase/events/global", async (_req, res) => {
  try {
    const events = await fetchGlobalLiveEvents();
    const pins = events.filter(hasGeo).map(eventToPin);
    res.json({ pins, total: pins.length });
  } catch {
    // Never fail the map — return empty on any upstream error
    res.json({ pins: [], total: 0 });
  }
});

// GET /jambase/events?swLat=&swLng=&neLat=&neLng=
// Returns live gig pins from JamBase for the current map viewport bounding box.
router.get("/jambase/events", async (req, res) => {
  const { swLat, swLng, neLat, neLng } = req.query as Record<string, string>;
  if (!swLat || !swLng || !neLat || !neLng) {
    res.status(400).json({ error: "swLat, swLng, neLat, neLng are required" });
    return;
  }
  const raw = {
    swLat: parseFloat(swLat),
    swLng: parseFloat(swLng),
    neLat: parseFloat(neLat),
    neLng: parseFloat(neLng),
  };
  if ([raw.swLat, raw.swLng, raw.neLat, raw.neLng].some(isNaN)) {
    res.status(400).json({ error: "Coordinates must be numbers" });
    return;
  }

  // Clamp to valid geographic ranges — Leaflet can report out-of-range bounds
  // when zoomed/panned out, which JamBase rejects with a 400.
  const bbox = {
    swLat: clamp(raw.swLat, -90, 90),
    neLat: clamp(raw.neLat, -90, 90),
    swLng: clamp(raw.swLng, -180, 180),
    neLng: clamp(raw.neLng, -180, 180),
  };

  // JamBase rejects bounding boxes wider than ~25 degrees — return empty gracefully
  const latSpan = bbox.neLat - bbox.swLat;
  const lngSpan = bbox.neLng - bbox.swLng;
  if (latSpan > 25 || lngSpan > 25) {
    res.json({ pins: [], total: 0 });
    return;
  }

  try {
    const events = await fetchEventsByBbox(bbox);
    const pins = events.filter(hasGeo).map(eventToPin);
    res.json({ pins, total: pins.length });
  } catch {
    // Never fail the map — return empty on any upstream error
    res.json({ pins: [], total: 0 });
  }
});

// GET /jambase/venue-setlists?venueId=jambase:62091
// Returns past event history for a venue (setlist history).
router.get("/jambase/venue-setlists", async (req, res) => {
  const venueId = typeof req.query.venueId === "string" ? req.query.venueId.trim() : "";
  if (!venueId) {
    res.status(400).json({ error: "venueId is required" });
    return;
  }

  const events = await fetchVenueSetlistHistory(venueId);
  res.json({
    events: events.map((e) => ({
      identifier: e.identifier,
      name: e.name,
      url: e.url,
      startDate: e.startDate,
      performers: e.performer.map((p) => ({
        name: p.name,
        identifier: p.identifier,
        url: p.url,
        isHeadliner: p.isHeadliner ?? false,
      })),
    })),
  });
});

export default router;
