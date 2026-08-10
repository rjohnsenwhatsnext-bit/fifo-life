import data from '@/data/parks.json';
import { dieselIn } from '@/lib/fuel';

// The long stretches with no fuel.
//
// This is the one thing on here that can actually get somebody into trouble.
// Everything else is money: get it wrong and the trip costs more than you
// thought. Get this wrong and you are on the side of the Stuart Highway at four
// in the afternoon with a caravan on the back.
//
// So two rules run through the whole file.
//
// It works off whether a servo exists, not whether it reports a price. The
// price schemes cover Queensland, New South Wales and Western Australia. If
// gaps were measured from the price feeds, a run across South Australia would
// come back as one seven hundred kilometre stretch with no fuel in it, which is
// a lie in the worst possible direction. Existence comes from OpenStreetMap,
// which covers the country. Prices are added on top where we have them.
//
// And it is pessimistic everywhere it has a choice. A servo counts as being on
// your road only if it is genuinely close to it, the range it compares against
// has your reserve already taken off, and anything it is unsure about is
// reported rather than smoothed away.

export const runtime = 'nodejs';
export const maxDuration = 30;

type Row = { n: string; k: number; a: number; o: number; f: number | null; p: string | null; w: number };
const ROWS = (data as { parks: Row[] }).parks;

const R = 6371, RAD = Math.PI / 180;

/** Great circle distance in kilometres. */
function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const dLat = (bLat - aLat) * RAD, dLng = (bLng - aLng) * RAD;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Where a point sits along a road, and how far off it that point is.
 *
 * Returns the distance travelled along the line to the closest approach, and
 * the detour from the road to the thing itself. Both matter: the first orders
 * the servos along your route, the second decides whether it is really on your
 * way or whether you would be driving forty kilometres to get to it.
 */
function project(lat: number, lng: number, path: [number, number][], cum: number[]) {
  let bestOff = Infinity, bestAlong = 0;
  for (let i = 1; i < path.length; i += 1) {
    const [aLat, aLng] = path[i - 1];
    const [bLat, bLng] = path[i];
    const cos = Math.cos(((aLat + bLat) / 2) * RAD);
    const px = lng * RAD * cos * R, py = lat * RAD * R;
    const ax = aLng * RAD * cos * R, ay = aLat * RAD * R;
    const bx = bLng * RAD * cos * R, by = bLat * RAD * R;
    const dx = bx - ax, dy = by - ay;
    const len = dx * dx + dy * dy;
    let t = len === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len;
    t = Math.max(0, Math.min(1, t));
    const off = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (off < bestOff) {
      bestOff = off;
      bestAlong = cum[i - 1] + t * Math.hypot(dx, dy);
    }
  }
  return { off: bestOff, along: bestAlong };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const line = Array.isArray(body.line) ? body.line as [number, number][] : [];
  const tank = Number(body.tankLitres) || 0;
  const per100 = Number(body.consumption) || 0;
  // How much you refuse to arrive on. A tank is not a range: a headwind, a
  // detour or a servo that has shut takes the last tenth of it without asking.
  //
  // Written the long way on purpose. Number(undefined) is NaN, and ?? only
  // catches null and undefined, so the obvious one line version defaulted the
  // reserve to NaN and quietly turned the entire range into null. A safety
  // number that silently becomes nothing is worse than one that is wrong.
  const askedReserve = Number(body.reserve);
  const reserve = Number.isFinite(askedReserve)
    ? Math.min(Math.max(askedReserve, 0), 0.5)
    : 0.1;
  // Ten kilometres off the highway is a servo you would use. Forty is a trip.
  const detour = Math.min(Math.max(Number(body.detour) || 10, 1), 60);

  if (line.length < 2) return Response.json({ gaps: [], range: 0 });

  // Coordinates that are not coordinates. Without this, a stray 999 puts a
  // point off the planet and every distance measured from it is nonsense.
  if (line.some(([a, o]) => !Number.isFinite(a) || !Number.isFinite(o)
                         || a < -90 || a > 90 || o < -180 || o > 180)) {
    return Response.json({ gaps: [], range: 0, error: 'That route is not on the map.' }, { status: 400 });
  }

  const range = per100 > 0 ? (tank / (per100 / 100)) * (1 - reserve) : 0;

  // No tank size, or no consumption, means no range, and no range means there
  // is nothing to compare a stretch against.
  //
  // This is the single most dangerous line in the file. The gap test skipped a
  // stretch only when `range > 0 && run <= range`, so with a range of zero the
  // test never passed and every stretch of road became a gap. Somebody who had
  // not filled in their fuel figures yet got a screen full of red warnings
  // about running out of fuel between towns three kilometres apart. A safety
  // warning that cries wolf is worse than no warning at all, because the next
  // one is ignored too.
  if (range <= 0) {
    return Response.json({
      gaps: [], range: 0, tankRange: 0, reserve, servos: 0, priced: 0,
      longest: 0, totalKm: 0,
      needs: 'Put your tank size and towing consumption in and this will work out the long stretches with no fuel.',
    });
  }

  // Distance along the road to each point of it.
  const cum: number[] = [0];
  for (let i = 1; i < line.length; i += 1) {
    cum[i] = cum[i - 1] + km(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]);
  }
  const total = cum[cum.length - 1];

  // Every servo, from the map rather than from a price feed.
  const south = Math.min(...line.map((p) => p[0])) - 1;
  const north = Math.max(...line.map((p) => p[0])) + 1;
  const west = Math.min(...line.map((p) => p[1])) - 1;
  const east = Math.max(...line.map((p) => p[1])) + 1;

  const onRoad: { name: string; lat: number; lng: number; along: number; off: number; price?: number }[] = [];
  for (const row of ROWS) {
    if (row.k !== 4) continue;
    if (row.a < south || row.a > north || row.o < west || row.o > east) continue;
    const { off, along } = project(row.a, row.o, line, cum);
    if (off > detour) continue;
    onRoad.push({ name: row.n, lat: row.a, lng: row.o, along, off: Math.round(off * 10) / 10 });
  }
  onRoad.sort((a, b) => a.along - b.along);

  // Prices where a scheme covers it. Matched by position, because a servo in
  // the price feed and the same servo in OpenStreetMap rarely share a name.
  try {
    const { pumps } = await dieselIn({ south, west, north, east }, line, detour);
    for (const stop of onRoad) {
      let best = Infinity, price: number | undefined;
      for (const pump of pumps) {
        const d = km(stop.lat, stop.lng, pump.lat, pump.lng);
        if (d < best) { best = d; price = pump.price; }
      }
      // Within a few hundred metres is the same servo. Further and it is the
      // one across the road, which is near enough for a price on a plan.
      if (best <= 0.6 && price) stop.price = price;
    }
  } catch { /* no prices is fine; existence is the safety critical half */ }

  // The stretches. Start of the road to the first servo, between each pair, and
  // the last one to the end.
  const marks = [
    { name: 'the start', along: 0, off: 0, price: undefined as number | undefined, edge: true },
    ...onRoad.map((s) => ({ ...s, edge: false })),
    { name: 'the end', along: total, off: 0, price: undefined as number | undefined, edge: true },
  ];

  const gaps = [];
  for (let i = 1; i < marks.length; i += 1) {
    const run = marks[i].along - marks[i - 1].along;
    if (range > 0 && run <= range) continue;
    gaps.push({
      km: Math.round(run),
      from: marks[i - 1].name,
      to: marks[i].name,
      // How far into the trip it starts, so it can be found on the map and read
      // as "three hundred kilometres in" rather than as an abstract warning.
      atKm: Math.round(marks[i - 1].along),
      // What it costs you beyond the range you actually have.
      over: Math.round(run - range),
      lastPrice: marks[i - 1].price ?? null,
    });
  }

  const longest = marks.slice(1).reduce((worst, mark, i) =>
    Math.max(worst, mark.along - marks[i].along), 0);

  return Response.json({
    // Range with the reserve already off it, which is the number worth
    // comparing anything against.
    range: Math.round(range),
    tankRange: per100 > 0 ? Math.round(tank / (per100 / 100)) : 0,
    reserve,
    servos: onRoad.length,
    priced: onRoad.filter((s) => s.price).length,
    longest: Math.round(longest),
    gaps,
    totalKm: Math.round(total),
  });
}
