import { NextResponse } from 'next/server';

// What is around a stop: things to do, camps, drinking water, dump points, fuel.
//
// From OpenStreetMap, because it is the only one of these that is actually
// open. WikiCamps and Hipcamp both hold their data closed, so this will never
// match WikiCamps for station stays and out of the way free camps. What it is
// good at is the things that are mapped as infrastructure rather than reviewed
// as places: dump points, potable water, lookouts, waterfalls and beaches are
// tagged consistently across Australia.
//
// Treat it as a first pass, not a replacement for the app.

export const runtime = 'nodejs';
export const maxDuration = 30;

const UA = 'FamilyTripPlanner/1.0 (personal trip planning; admin@frontlinetalentgroup.com.au)';

// Things to do are matched on ways and relations as well as nodes, because a
// beach, a national park and a gorge are almost never a single point. Those
// come back with a center rather than a lat, which is handled below.
const MATCHES = [
  'nwr["tourism"~"^(attraction|viewpoint|museum|gallery|artwork|picnic_site|zoo|aquarium|theme_park)$"]',
  'nwr["leisure"~"^(park|nature_reserve|swimming_pool|water_park|playground|garden|marina)$"]',
  'nwr["historic"~"^(monument|memorial|ruins|castle|wreck|mine|heritage|building|archaeological_site)$"]',
  'nwr["natural"~"^(waterfall|beach|hot_spring|spring|peak|cave_entrance|gorge)$"]',
  'nwr["tourism"~"^(camp_site|caravan_site)$"]',
  'node["amenity"="drinking_water"]',
  'node["amenity"="sanitary_dump_station"]',
  'node["amenity"="fuel"]',
];

const cache = new Map<string, unknown>();

async function place(query: string) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'au');
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-AU' } });
  if (!res.ok) return null;
  const rows = await res.json();
  if (!rows?.length) return null;
  return { lat: Number(rows[0].lat), lon: Number(rows[0].lon), label: String(rows[0].display_name).split(',')[0] };
}

// Tapping bare country on the map gives a point, not a name. Reverse geocoding
// puts a town on it, because "things to do near here" reads as nonsense when
// the heading has no place in it.
async function whereIsThat(lat: number, lon: number) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('zoom', '12');
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-AU' } });
    if (!res.ok) return null;
    const row = await res.json();
    const a = row?.address ?? {};
    return a.city || a.town || a.village || a.hamlet || a.locality || a.suburb
      || a.municipality || a.county || String(row?.display_name ?? '').split(',')[0] || null;
  } catch { return null; }
}

const km = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const R = 6371;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLon = (bLon - aLon) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.asin(Math.sqrt(h)) * 10) / 10;
};

// What sort of thing it is, said the way somebody would say it out loud.
function describe(tags: Record<string, any>) {
  const t = tags.tourism, l = tags.leisure, h = tags.historic, n = tags.natural;
  if (n === 'waterfall') return 'waterfall';
  if (n === 'beach') return 'beach';
  if (n === 'hot_spring' || n === 'spring') return 'hot spring';
  if (n === 'peak') return 'lookout climb';
  if (n === 'cave_entrance') return 'cave';
  if (n === 'gorge') return 'gorge';
  if (t === 'viewpoint') return 'lookout';
  if (t === 'museum') return 'museum';
  if (t === 'gallery') return 'gallery';
  if (t === 'artwork') return 'public art';
  if (t === 'picnic_site') return 'picnic spot';
  if (t === 'zoo' || t === 'aquarium') return t;
  if (t === 'theme_park') return 'theme park';
  if (t === 'attraction') return 'attraction';
  if (l === 'nature_reserve') return 'nature reserve';
  if (l === 'park' || l === 'garden') return 'park';
  if (l === 'swimming_pool' || l === 'water_park') return 'swimming';
  if (l === 'playground') return 'playground';
  if (l === 'marina') return 'marina';
  if (h) return String(h).replace(/_/g, ' ');
  return 'attraction';
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const near = String(body.near ?? '').trim();
    const at = Array.isArray(body.at) && body.at.length === 2
      ? [Number(body.at[0]), Number(body.at[1])] as [number, number]
      : null;
    const radius = Math.min(Math.max(Number(body.radius) || 30, 5), 100);
    if (!near && !at) return NextResponse.json({ error: 'Where about?' }, { status: 400 });

    const key = at ? `${at[0].toFixed(3)},${at[1].toFixed(3)}:${radius}` : `${near.toLowerCase()}:${radius}`;
    if (cache.has(key)) return NextResponse.json(cache.get(key));

    // A point off the map needs no geocoding, only a name to put on it.
    const found = at
      ? { lat: at[0], lon: at[1], label: (await whereIsThat(at[0], at[1])) ?? 'this spot' }
      : await place(near);
    if (!found) return NextResponse.json({ error: `Could not find ${near}.` }, { status: 404 });

    const metres = radius * 1000;
    const query = `[out:json][timeout:25];(
      ${MATCHES.map((m) => `${m}(around:${metres},${found.lat},${found.lon});`).join('\n      ')}
    );out center 200;`;

    // The public Overpass servers are free, donated, and frequently at
    // capacity. One being busy is normal rather than broken, so it tries the
    // others before giving up on somebody who is trying to plan a trip.
    const MIRRORS = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.osm.ch/api/interpreter',
    ];
    let data: { elements?: Record<string, unknown>[] } | null = null;
    for (const mirror of MIRRORS) {
      try {
        const res = await fetch(mirror, {
          method: 'POST',
          headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) continue;
        data = await res.json();
        break;
      } catch { /* try the next one */ }
    }
    if (!data) {
      return NextResponse.json({
        error: 'The map servers are all busy just now. The distance still works, and this is worth another go in a minute.',
      }, { status: 502 });
    }

    const places = (data.elements ?? []).map((el: Record<string, any>) => {
      const tags = el.tags ?? {};
      // Ways and relations carry a center instead of a point.
      const lat = typeof el.lat === 'number' ? el.lat : el.center?.lat;
      const lon = typeof el.lon === 'number' ? el.lon : el.center?.lon;
      if (typeof lat !== 'number' || typeof lon !== 'number') return null;

      const kind = tags.amenity === 'sanitary_dump_station' ? 'dump'
        : tags.amenity === 'drinking_water' ? 'water'
        : tags.amenity === 'fuel' ? 'fuel'
        : (tags.tourism === 'camp_site' || tags.tourism === 'caravan_site') ? 'camp'
        : 'thing';

      // An unnamed lookout is still worth a stop. An unnamed park bench is not,
      // and without a name there is no way to tell them apart, so things to do
      // have to be named to make the list.
      if (kind === 'thing' && !tags.name) return null;

      // fee=no is the closest OSM gets to "free camp", and plenty of genuinely
      // free spots are simply untagged, so unknown is said rather than guessed.
      const fee = tags.fee === 'no' ? 'free' : tags.fee === 'yes' ? 'paid' : 'unknown';
      const charge = String(tags.charge ?? tags['fee:amount'] ?? '');
      const dollars = charge.match(/(\d+(?:\.\d+)?)/);

      // The things that decide whether a site is any good with a van aboard.
      const has = (key: string, ...yes: string[]) => {
        const v = String(tags[key] ?? '').toLowerCase();
        return v && v !== 'no' && (yes.length === 0 || yes.includes(v));
      };
      const amenities = [
        has('power_supply') && 'power',
        (has('shower') || has('showers')) && 'showers',
        has('toilets') && 'toilets',
        has('drinking_water') && 'water',
        has('sanitary_dump_station') && 'dump',
        has('internet_access') && 'internet',
        tags.dog === 'yes' && 'dogs ok',
        has('tents') && 'tents',
        has('caravans') && 'caravans',
      ].filter(Boolean) as string[];

      return {
        kind,
        name: tags.name || tags.brand
          || (kind === 'dump' ? 'Dump point' : kind === 'water' ? 'Drinking water'
            : kind === 'fuel' ? 'Service station' : 'Camp site'),
        what: kind === 'thing' ? describe(tags) : undefined,
        // Free text worth passing through when somebody has written it.
        hours: kind === 'thing' && tags.opening_hours ? String(tags.opening_hours) : undefined,
        site: kind === 'thing' ? (tags.website || tags['contact:website'] || undefined) : undefined,
        free: kind === 'thing' ? (tags.fee === 'no' ? true : tags.fee === 'yes' ? false : undefined) : undefined,
        diesel: kind === 'fuel'
          ? (tags['fuel:diesel'] === 'no' ? 'no diesel' : tags['fuel:diesel'] === 'yes' ? 'diesel' : undefined)
          : undefined,
        brand: kind === 'fuel' ? (tags.brand || undefined) : undefined,
        open24: kind === 'fuel' && /24\/7/.test(String(tags.opening_hours ?? '')) ? true : undefined,
        fee: kind === 'camp' ? fee : undefined,
        charge: kind === 'camp' && charge ? charge : undefined,
        nightly: kind === 'camp' && dollars ? Number(dollars[1]) : undefined,
        amenities: kind === 'camp' && amenities.length ? amenities : undefined,
        // Straight line, and labelled as such. A camp 8 km away as the crow
        // flies can be 40 by road on the wrong side of a river.
        directKm: km(found.lat, found.lon, lat, lon),
        lat, lon,
      };
    })
      .filter(Boolean)
      .filter((x: any) => x.directKm <= radius)
      .sort((a: any, b: any) => a.directKm - b.directKm);

    // The same lookout gets mapped as a node and again as part of a way often
    // enough that a list of twenty is really a list of eleven.
    const seen = new Set<string>();
    const things = places.filter((x: any) => {
      if (x.kind !== 'thing') return false;
      const k = `${x.name.toLowerCase()}|${x.what}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 20);

    const answer = {
      at: found.label,
      atPoint: [found.lat, found.lon],
      radius,
      things,
      camps: places.filter((x: any) => x.kind === 'camp').slice(0, 12),
      water: places.filter((x: any) => x.kind === 'water').slice(0, 6),
      dump: places.filter((x: any) => x.kind === 'dump').slice(0, 6),
      fuel: places.filter((x: any) => x.kind === 'fuel').slice(0, 10),
      note: 'From OpenStreetMap, so it is what volunteers have mapped rather than a tourism guide. Good on lookouts, waterfalls, beaches and parks; thin on tours and anything that needs booking.',
    };
    cache.set(key, answer);
    return NextResponse.json(answer);
  } catch {
    return NextResponse.json({ error: 'Lookup failed.' }, { status: 500 });
  }
}
