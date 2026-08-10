// Find a town and put the map on it.
//
// The same Nominatim lookup the leg planner already uses, exposed on its own so
// the search box over the map can move the view without adding a leg. Bounded
// to Australia because this is a planner for one country and an unbounded
// search puts you in Bowen, Illinois.

export const runtime = 'nodejs';
export const maxDuration = 20;

const UA = 'thelapmap.com.au (trip planner; contact systems@frontlinetalentgroup.com.au)';
const VIEWBOX = '112.5,-44.0,154.0,-9.5';

// Nominatim asks for no more than one call a second and no hammering. A town
// does not move, so anything looked up once is kept for the life of the server.
const cache = new Map<string, unknown>();

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 80);
  if (q.length < 2) return Response.json({ hits: [] });

  const key = q.toLowerCase();
  if (cache.has(key)) return Response.json({ hits: cache.get(key) });

  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '6');
    url.searchParams.set('countrycodes', 'au');
    url.searchParams.set('viewbox', VIEWBOX);
    url.searchParams.set('bounded', '1');

    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-AU' } });
    if (!res.ok) return Response.json({ hits: [] });

    const rows = await res.json();
    const hits = (Array.isArray(rows) ? rows : []).map((r: Record<string, unknown>) => ({
      lat: Number(r.lat),
      lng: Number(r.lon),
      // "Bowen, Whitsunday Region" rather than the full postal address, which
      // is four lines and unreadable in a dropdown.
      name: String(r.display_name).split(',').slice(0, 2).join(',').trim(),
    })).filter((h: { lat: number; lng: number }) => Number.isFinite(h.lat) && Number.isFinite(h.lng));

    cache.set(key, hits);
    return Response.json({ hits });
  } catch {
    return Response.json({ hits: [] });
  }
}
