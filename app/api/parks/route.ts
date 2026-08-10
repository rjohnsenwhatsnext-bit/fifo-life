import data from '@/data/parks.json';
import { indexRoute } from '@/lib/geo';

// Every caravan park and campground in Australia, served from our own copy.
//
// There is no API for BIG4, NRMA or Discovery. The chains publish nothing, and
// BIG4 is a network of independently owned parks that each take their own
// bookings, so there is no single system to connect to even in principle. What
// there is, is OpenStreetMap, where the parks are already mapped by the people
// who use them.
//
// This used to ask Overpass on every pan, which worked for browsing one
// district and could never answer the actual question, which is where you can
// stay on a lap of the country. So the whole country is pulled once by
// scripts/fetch-parks.mjs and read from here: ten thousand sites, no third
// party in the request path, and an answer in single digit milliseconds.
//
// What it gives is locations, and never availability. That is the honest trade:
// showing where every park is beats showing a vacancy that is not there.

export const runtime = 'nodejs';

type Row = { n: string; k: number; a: number; o: number; f: number | null; p: string | null; w: number };

// Imported rather than read from disk so it is part of the bundle and cannot go
// missing in a deploy. Sorted by latitude when it was built, which is what lets
// the band below be found by bisection instead of a scan of ten thousand rows.
const ROWS = (data as { parks: Row[] }).parks;

/** First index whose latitude is at or past `lat`. */
function lowerBound(lat: number): number {
  let lo = 0, hi = ROWS.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ROWS[mid].a < lat) lo = mid + 1; else hi = mid;
  }
  return lo;
}

// What one answer may carry. Past this the pins are a smear and the payload is
// the thing making the map feel slow, so it thins rather than truncating: see
// below.
const CAP = 1400;

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('bbox') ?? '';
  const parts = raw.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return Response.json({ error: 'Where about?' }, { status: 400 });
  }
  const [south, west, north, east] = parts;

  const hits: Row[] = [];
  for (let i = lowerBound(south); i < ROWS.length && ROWS[i].a <= north; i += 1) {
    const row = ROWS[i];
    if (row.o >= west && row.o <= east) hits.push(row);
  }

  // Zoomed out over half the country there are more sites than pixels. Rather
  // than cutting the list off at an arbitrary point, which would empty out one
  // side of the screen, the caravan parks are kept whole and the campgrounds
  // are thinned evenly across the area. The shape of where things are survives;
  // only the density drops, which is what a map is meant to do when you zoom
  // out.
  let out = hits;
  let thinned = false;
  if (hits.length > CAP) {
    // The commercial parks and the dump points are kept whole: there are few
    // of them and they are the ones somebody is hunting for. Campsites and taps
    // are the bulk, so they are what gets thinned.
    const parks = hits.filter((r) => r.k === 1 || r.k === 2);
    const camps = hits.filter((r) => r.k === 0 || r.k === 3);
    const room = Math.max(CAP - parks.length, 0);
    const step = room > 0 ? Math.ceil(camps.length / room) : camps.length + 1;
    out = parks.concat(camps.filter((_, i) => i % step === 0));
    thinned = true;
  }

  return Response.json({
    parks: out.map(shape),
    count: out.length,
    // What is actually out there, so the map can say "showing 1400 of 4000"
    // rather than pretending the thinned set is all of them.
    total: hits.length,
    thinned,
  }, {
    // It changes when the build changes and not otherwise.
    headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
  });
}

/** One row, as the map wants it. Shared so both routes answer the same shape. */
const shape = (r: Row) => ({
  id: `${r.a},${r.o}`,
  name: r.n,
  kind: (['camp', 'caravan', 'dump', 'water'] as const)[r.k] ?? 'camp',
  lat: r.a, lng: r.o,
  fee: r.f === 0 ? 'free' : r.f === 1 ? 'paid' : null,
  phone: r.p,
  site: null,
  power: r.w === 1,
  // Whether OpenStreetMap knows anything about it beyond a name and a point.
  // Seven thousand of the ten do not, and that is worth saying out loud rather
  // than presenting a bare pin with the same confidence as a park with a phone
  // number and a nightly fee on it. It is also the honest answer to "is that a
  // campsite or a picnic ground": nobody recorded enough to be sure, so go and
  // look before you commit to the drive.
  thin: r.f === null && r.w !== 1 && !r.p,
});

/**
 * How far a point is from a line, in kilometres.
 *
 * Equirectangular rather than haversine: over the tens of kilometres that
 * matter here the error is metres, and this runs ten thousand times against
 * every segment of a route, so the cheap one is the right one.
 */
function kmToSegment(lat: number, lng: number,
                     aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, r = Math.PI / 180;
  // Flatten to kilometres around the midpoint, so the maths is plain geometry.
  const cos = Math.cos(((aLat + bLat) / 2) * r);
  const px = lng * r * cos * R, py = lat * r * R;
  const ax = aLng * r * cos * R, ay = aLat * r * R;
  const bx = bLng * r * cos * R, by = bLat * r * R;

  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  // A zero length segment is a point, which happens on a doubled coordinate.
  let t = len === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * Everything within a corridor of the road you are actually driving.
 *
 * A bounding box around a run from Brisbane to Cape York contains most of
 * Queensland, and almost none of it is on the way. This asks the question the
 * traveller is asking: what is near the road, out to a distance they would
 * genuinely turn off for.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const line = Array.isArray(body.line) ? body.line as [number, number][] : [];
  const within = Math.min(Math.max(Number(body.within) || 20, 2), 120);

  if (line.length < 2) return Response.json({ parks: [], count: 0, total: 0 });

  // The route can be thousands of points. Thinned to something that still
  // traces the road, because the corridor is twenty kilometres wide and a
  // hundred metres of detail cannot move an answer.
  const step = Math.max(1, Math.floor(line.length / 400));
  const path = line.filter((_, i) => i % step === 0 || i === line.length - 1);

  // Only rows whose latitude could possibly be in range are considered, which
  // takes the ten thousand down to the few hundred worth measuring.
  const lats = path.map((p) => p[0]);
  const pad = within / 111;
  const south = Math.min(...lats) - pad, north = Math.max(...lats) + pad;

  // Which segments are worth measuring for a given point. Without this, a lap
  // of the country measured every camp against the whole road: 8.8 million
  // calculations and 313ms, because the latitude band that makes a single
  // highway cheap excludes nothing when the route spans the continent.
  const grid = indexRoute(path, within);

  const hits: Row[] = [];
  for (let i = lowerBound(south); i < ROWS.length && ROWS[i].a <= north; i += 1) {
    const row = ROWS[i];
    const segs = grid.near(row.a, row.o);
    if (!segs) continue;                       // nowhere near the road at all
    let best = Infinity;
    for (let s = 0; s < segs.length; s += 1) {
      const j = segs[s];
      const d = kmToSegment(row.a, row.o, path[j - 1][0], path[j - 1][1], path[j][0], path[j][1]);
      if (d < best) best = d;
      if (best <= within) break;
    }
    if (best <= within) hits.push(row);
  }

  // Thinned exactly like the bounding box answer, and for the same reason.
  //
  // A lap corridor finds thirteen thousand camps. That is two megabytes down a
  // phone on the Barkly and thirteen thousand markers for Leaflet to hold, and
  // no one has ever looked at thirteen thousand pins. The bbox path learned
  // this and capped; this one was returning everything and reporting
  // thinned: false, which is how the map got slow on exactly the trip it was
  // built for.
  let out = hits;
  let thinned = false;
  if (hits.length > CAP) {
    const parks = hits.filter((r) => r.k === 1 || r.k === 2);
    const camps = hits.filter((r) => r.k === 0 || r.k === 3);
    const room = Math.max(CAP - parks.length, 0);
    const step = room > 0 ? Math.ceil(camps.length / room) : camps.length + 1;
    out = parks.concat(camps.filter((_, i) => i % step === 0));
    thinned = true;
  }

  return Response.json({
    parks: out.map(shape),
    count: out.length,
    // What is really in the corridor, so the map can say "1,400 of 13,033"
    // rather than quietly pretending the thinned set is the lot.
    total: hits.length,
    thinned,
    corridor: within,
  });
}
