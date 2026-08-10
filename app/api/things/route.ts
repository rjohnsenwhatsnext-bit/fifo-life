// What there is to see, for what is on screen.
//
// The other layers come from our own file and appear as you move the map. This
// one cannot: attractions, lookouts, waterfalls, museums and beaches are a far
// bigger set than campsites, and pulling every one in the country would be a
// hundred megabytes that goes stale.
//
// It also cannot be a corridor along the whole route, which is what this tried
// first. Overpass has an around clause that takes a list of coordinates and
// treats them as a line, which is exactly the right shape for a road. It works
// perfectly run by hand, and was refused every single time from a Vercel
// address: a union of sixty circles across seventeen hundred kilometres is a
// lot to ask of a donated server and it said no. Chunking it and running the
// chunks one at a time did not change its mind.
//
// So it is a bounding box of what is on screen, which is what the per tap
// lookup has been doing successfully all along and is small enough to be
// welcome. Following a route, they appear as you move along it.

export const runtime = 'nodejs';
export const maxDuration = 30;

const UA = 'thelapmap.com.au (trip planner; contact systems@frontlinetalentgroup.com.au)';

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];

// The things worth pulling off a highway for. Deliberately not everything:
// every bench and bus shelter is tagged too, and a map of those is a map of
// nothing.
const MATCHES = [
  'nwr["tourism"~"^(attraction|viewpoint|museum|gallery|zoo|aquarium|theme_park)$"]',
  'nwr["natural"~"^(waterfall|beach|hot_spring|gorge|cave_entrance)$"]',
  'nwr["historic"~"^(monument|memorial|ruins|castle|wreck|mine|archaeological_site)$"]',
  'nwr["leisure"~"^(nature_reserve|water_park)$"]',
];

// A degree and a half. Past this the query gets heavy enough that Overpass
// starts refusing it, which is the whole reason the corridor version of this
// was abandoned.
const MAX_SPAN = 1.6;

const cache = new Map<string, unknown>();
const stamps = new Map<string, number>();
const HOLD = 6 * 60 * 60 * 1000;

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('bbox') ?? '';
  const parts = raw.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return Response.json({ things: [] });
  }
  const [south, west, north, east] = parts;
  if (north - south > MAX_SPAN || east - west > MAX_SPAN) {
    return Response.json({ things: [], tooBig: true });
  }

  const key = parts.map((n) => n.toFixed(2)).join(',');
  const held = stamps.get(key);
  if (held && Date.now() - held < HOLD && cache.has(key)) {
    return Response.json(cache.get(key));
  }

  const query = '[out:json][timeout:30];('
    + MATCHES.map((m) => `${m}(${south},${west},${north},${east});`).join('')
    + ');out center 300;';

  let elements: Record<string, unknown>[] | null = null;
  for (const mirror of MIRRORS) {
    try {
      const res = await fetch(mirror, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(22000),
      });
      if (!res.ok) continue;
      const body = await res.json();
      elements = body.elements ?? [];
      break;
    } catch { /* the next mirror */ }
  }
  // Every mirror busy is normal rather than broken, and the rest of the map is
  // unaffected, so it says nothing and shows nothing.
  if (elements === null) return Response.json({ things: [], busy: true });

  const things = [];
  for (const el of elements) {
    const tags = (el.tags ?? {}) as Record<string, string>;
    // An unnamed lookout is not worth a pin. Unlike a campsite, where a
    // nameless spot beside a river is exactly what people are after, an
    // attraction with no name is usually a fragment of a bigger thing.
    if (!tags.name) continue;
    const centre = (el.center ?? {}) as { lat?: number; lon?: number };
    const lat = Number(el.lat ?? centre.lat);
    const lng = Number(el.lon ?? centre.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    things.push({
      id: `${el.type}${el.id}`,
      name: tags.name.slice(0, 90),
      what: tags.tourism || tags.natural || tags.historic || tags.leisure || null,
      lat, lng,
      fee: tags.fee === 'no' ? 'free' : tags.fee === 'yes' ? 'paid' : null,
    });
  }

  const out = { things, count: things.length };
  cache.set(key, out);
  stamps.set(key, Date.now());
  return Response.json(out);
}
