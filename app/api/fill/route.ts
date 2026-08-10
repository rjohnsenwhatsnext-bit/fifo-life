import data from '@/data/parks.json';
import { dieselIn } from '@/lib/fuel';
import { km, cumulative, project } from '@/lib/geo';

// Where to fill next, from where you actually are.
//
// This is the question the whole planner has been circling. Not "what does the
// trip cost" and not "where are the servos", but the one you ask sitting in a
// caravan park at seven in the morning: I have got this much in the tank, I am
// driving that way, where do I stop.
//
// It answers with three things, and the third is the one that matters:
//
//   The cheapest servo you can reach. Obvious, and on its own it is a trap:
//   the cheapest one you can reach might be twenty kilometres up the road with
//   four hundred of nothing after it.
//
//   The last one you can reach. Your point of no return. Past it you are
//   committed to whatever comes next at whatever it charges.
//
//   What happens if you push past the cheap one. "The next after that is 260km
//   on at $2.49" turns a guess into a decision. Saving nine cents a litre is
//   worth nothing if it puts you on the shoulder.
//
// Existence comes from the map, prices from the state schemes where they exist.
// A servo with no price is still a servo, and out west it is the only one.

export const runtime = 'nodejs';
export const maxDuration = 30;

type Row = { n: string; k: number; a: number; o: number; f: number | null; p: string | null; w: number };
const ROWS = (data as { parks: Row[] }).parks;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const line = Array.isArray(body.line) ? body.line as [number, number][] : [];
  // How far into this road you already are, and how far you can still go.
  const atKm = Math.max(Number(body.atKm) || 0, 0);
  const rangeLeft = Number(body.rangeLeft) || 0;
  const detour = Math.min(Math.max(Number(body.detour) || 10, 1), 60);

  if (line.length < 2) return Response.json({ error: 'No road to look down.' }, { status: 400 });
  if (line.some(([a, o]) => !Number.isFinite(a) || !Number.isFinite(o)
                         || a < -90 || a > 90 || o < -180 || o > 180)) {
    return Response.json({ error: 'That route is not on the map.' }, { status: 400 });
  }
  if (rangeLeft <= 0) return Response.json({ error: 'Need to know how far you can go.' }, { status: 400 });

  const cum = cumulative(line);
  const totalKm = cum[cum.length - 1];

  const south = Math.min(...line.map((p) => p[0])) - 1;
  const north = Math.max(...line.map((p) => p[0])) + 1;
  const west = Math.min(...line.map((p) => p[1])) - 1;
  const east = Math.max(...line.map((p) => p[1])) + 1;

  type Stop = { name: string; lat: number; lng: number; along: number; off: number; ahead: number; price?: number };
  const ahead: Stop[] = [];
  for (const row of ROWS) {
    if (row.k !== 4) continue;
    if (row.a < south || row.a > north || row.o < west || row.o > east) continue;
    const { off, along } = project(row.a, row.o, line, cum);
    if (off > detour) continue;
    // Only what is still in front of you. A servo two hundred kilometres back
    // is not an option and putting it on the list is how somebody turns around.
    if (along <= atKm + 1) continue;
    ahead.push({
      name: row.n, lat: row.a, lng: row.o, along,
      off: Math.round(off * 10) / 10,
      ahead: Math.round(along - atKm),
    });
  }
  ahead.sort((a, b) => a.along - b.along);

  // Prices, matched by position. A servo in the price feed and the same servo
  // in OpenStreetMap almost never share a name.
  try {
    const { pumps } = await dieselIn({ south, west, north, east }, line, detour);
    for (const stop of ahead) {
      let best = Infinity, price: number | undefined;
      for (const pump of pumps) {
        const d = km(stop.lat, stop.lng, pump.lat, pump.lng);
        if (d < best) { best = d; price = pump.price; }
      }
      if (best <= 0.6 && price) stop.price = price;
    }
  } catch { /* prices are the nice half; existence is the necessary one */ }

  // The detour counts twice: out and back. Ten kilometres off the road is
  // twenty off your range, and on a tight run that is the whole difference.
  const reachable = ahead.filter((s) => s.ahead + s.off * 2 <= rangeLeft);
  const priced = reachable.filter((s) => s.price);

  const cheapest = priced.length
    ? priced.reduce((best, s) => (s.price! < best.price! ? s : best))
    : null;
  const last = reachable.length ? reachable[reachable.length - 1] : null;

  // What it costs to drive past the cheap one.
  const afterCheapest = cheapest
    ? ahead.find((s) => s.along > cheapest.along) ?? null
    : null;

  return Response.json({
    atKm: Math.round(atKm),
    totalKm: Math.round(totalKm),
    leftKm: Math.round(totalKm - atKm),
    rangeLeft: Math.round(rangeLeft),
    // Nothing in range is the answer that matters most, and it is the one an
    // empty list would hide.
    stranded: reachable.length === 0 && ahead.length > 0,
    next: ahead[0] ?? null,
    cheapest,
    last,
    afterCheapest,
    reachable: reachable.length,
    ahead: ahead.length,
  });
}
