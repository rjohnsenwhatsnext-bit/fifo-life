import { NextResponse } from 'next/server';
import { dieselNear, dieselIn } from '../../../lib/fuel';

// Diesel prices near a stop.
//
// The map already knows where the servos are; OpenStreetMap has never known
// what they charge. This is the board price, reported by the servo itself under
// the state fuel price schemes, so it is the number on the sign rather than an
// estimate.
//
// Kept behind our own route because the subscriber token is ours and the quota
// is ours. Nothing about the request identifies who asked.

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    // Servos for an area, or for a road, rather than for a point somebody had
    // to guess at. This is how the map asks now: you move it, they appear.
    if (body?.bbox || body?.line) {
      const [south, west, north, east] = String(body.bbox ?? '').split(',').map(Number);
      const line = Array.isArray(body.line) ? body.line as [number, number][] : undefined;
      if (!line && [south, west, north, east].some((n) => !Number.isFinite(n))) {
        return NextResponse.json({ error: 'Where about?' }, { status: 400 });
      }
      // With a road, the box is only there to pick which state feeds to open.
      const bounds = line
        ? {
            south: Math.min(...line.map((p) => p[0])) - 1,
            north: Math.max(...line.map((p) => p[0])) + 1,
            west: Math.min(...line.map((p) => p[1])) - 1,
            east: Math.max(...line.map((p) => p[1])) + 1,
          }
        : { south, west, north, east };

      const { pumps, covered } = await dieselIn(bounds, line, Number(body.within) || 25);
      return NextResponse.json({ pumps, total: pumps.length, covered });
    }

    const at = body?.at;
    if (!Array.isArray(at) || at.length !== 2) {
      return NextResponse.json({ error: 'Need a point on the map.' }, { status: 400 });
    }
    const [lat, lng] = at.map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: 'Need a point on the map.' }, { status: 400 });
    }
    // Wider than the "what is around here" radius on purpose, but still a trip
    // into town rather than a day's towing. Nobody walks to a servo, and on a
    // lap an extra fifty kilometres for thirty cents a litre is worth being
    // offered — two hundred and fifty is a different town's prices.
    const radius = Math.min(Math.max(Number(body?.radius) || 50, 5), 300);

    const { pumps, looked, covered } = await dieselNear(lat, lng, radius);
    if (!pumps.length) {
      // Two different nothings, and they are not the same answer. Somewhere we
      // have data for, an empty list means no servo near you reports. Somewhere
      // we do not, it means we were never told — and saying "no prices" there
      // would read as "diesel is unmapped in Western Australia", which is a lie.
      const note = covered.length
        ? `No reporting servo within ${radius}km. Out that way the nearest one can be a long drive.`
        : looked.length
          ? `No fuel price feed for ${looked.join(' or ')} yet. Queensland, New South Wales and Western Australia are live.`
          : 'That point is not on land we have prices for.';
      return NextResponse.json({ radius, pumps: [], cheapest: null, average: null, covered, note });
    }

    // The average is what to budget on, not the cheapest. You will not always
    // get to the cheap one, and planning the whole lap on the best price in the
    // state is how a budget quietly goes twenty per cent under.
    const average = pumps.reduce((sum, p) => sum + p.price, 0) / pumps.length;

    return NextResponse.json({
      radius,
      covered,
      cheapest: pumps[0],
      average: Math.round(average * 1000) / 1000,
      // Every one of them.
      //
      // An earlier version thinned this down to the cheapest in each patch of
      // country, which draws a tidier map and is the wrong answer: on a trip
      // you need to know where the servos are, not just where the bargains
      // are. Out west that is the difference between a plan and being stuck.
      // The map draws all of them — see the renderer for how it stays quick.
      pumps,
      total: pumps.length,
      note: 'Board prices reported by the servos under the state fuel price schemes. A price is only as current as the last time that site reported.',
    });
  } catch {
    return NextResponse.json({ error: 'Could not reach the fuel feed.' }, { status: 500 });
  }
}
