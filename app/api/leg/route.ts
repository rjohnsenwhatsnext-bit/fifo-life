import { NextResponse } from 'next/server';

// Working out how far a leg actually is.
//
// WikiCamps has no public API and its data is not ours to take, so the road
// distance comes from OpenStreetMap: Nominatim to turn a town into a point, and
// OSRM to drive between them. Both are free and properly licensed, and both are
// run on donated infrastructure, so this asks for one leg at a time and caches
// what it gets rather than hammering them.
//
// It is never the only way to get a distance. Anybody who has done the drive
// knows it better than a routing engine, so the field stays editable and this
// is a convenience, not a dependency.

export const runtime = 'nodejs';

const UA = 'FamilyFreedomPlanner/1.0 (personal trip planning; admin@frontlinetalentgroup.com.au)';

// Australia, roughly. Keeps "Springfield" out of Missouri.
const VIEWBOX = '112.5,-44.0,154.0,-9.5';

const cache = new Map<string, unknown>();

async function place(query: string) {
  const key = `place:${query.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key) as { lat: number; lon: number; label: string } | null;

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'au');
  url.searchParams.set('viewbox', VIEWBOX);
  url.searchParams.set('bounded', '1');

  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-AU' } });
  if (!res.ok) return null;
  const rows = await res.json();
  if (!rows?.length) { cache.set(key, null); return null; }

  const found = {
    lat: Number(rows[0].lat),
    lon: Number(rows[0].lon),
    label: String(rows[0].display_name).split(',').slice(0, 2).join(',').trim(),
  };
  cache.set(key, found);
  return found;
}

// What somebody would call the spot they just tapped. Falls back to the
// coordinates rather than leaving a leg with no name on it.
async function reverseName(lat: number, lon: number) {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lon));
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('zoom', '12');
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-AU' } });
    if (!res.ok) return `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
    const row = await res.json();
    const a = row?.address ?? {};
    return a.town || a.city || a.village || a.locality || a.suburb || a.county
      || String(row?.display_name ?? '').split(',')[0] || `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  } catch {
    return `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const from = String(body.from ?? '').trim();
    const to = String(body.to ?? '').trim();
    const havePoints = Array.isArray(body.fromAt) && Array.isArray(body.toAt);
    if (!havePoints && (!from || !to)) {
      return NextResponse.json({ error: 'Both ends of the leg are needed.' }, { status: 400 });
    }

    // Either end can arrive as a name typed in or as a point clicked on the
    // map. A point is already exact, so it is only reverse geocoded to give it
    // a name somebody will recognise later.
    const at = async (name: string, point: unknown) => {
      if (Array.isArray(point) && point.length === 2) {
        const [lat, lon] = point as [number, number];
        return { lat, lon, label: name || await reverseName(lat, lon) };
      }
      return place(name);
    };
    const [a, b] = await Promise.all([at(from, body.fromAt), at(to, body.toAt)]);
    if (!a) return NextResponse.json({ error: `Could not find ${from}.` }, { status: 404 });
    if (!b) return NextResponse.json({ error: `Could not find ${to}.` }, { status: 404 });

    const key = `route:${a.lat},${a.lon}:${b.lat},${b.lon}`;
    if (cache.has(key)) return NextResponse.json(cache.get(key));

    // The simplified geometry is enough to draw the road at this zoom and is a
    // fraction of the full one, which matters when it is going into a saved plan.
    const osrm = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=simplified&geometries=geojson`;
    const res = await fetch(osrm, { headers: { 'User-Agent': UA } });
    if (!res.ok) {
      return NextResponse.json({ error: 'Could not work out the road distance. Type it in instead.' }, { status: 502 });
    }
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) {
      return NextResponse.json({ error: 'No road route between those two. Type the distance in.' }, { status: 404 });
    }

    const answer = {
      km: Math.round(route.distance / 1000),
      // Towing is not a car. The engine's estimate is for a car on the open
      // road, and adding a fifth is closer to a caravan than pretending it is
      // not there.
      hours: Math.round((route.duration / 3600) * 1.2 * 10) / 10,
      from: a.label,
      to: b.label,
      fromAt: [a.lat, a.lon] as [number, number],
      toAt: [b.lat, b.lon] as [number, number],
      // Leaflet wants lat,lon and GeoJSON gives lon,lat. Swapped here rather
      // than in the map, so the map never has to know where it came from.
      line: (route.geometry?.coordinates ?? []).map((c: [number, number]) => [c[1], c[0]]),
    };
    cache.set(key, answer);
    return NextResponse.json(answer);
  } catch {
    return NextResponse.json({ error: 'Lookup failed. Type the distance in.' }, { status: 500 });
  }
}
