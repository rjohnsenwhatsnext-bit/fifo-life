// A picture of the place.
//
// Where the photos come from matters more than how they are shown, so: they
// come from Wikimedia Commons, which is freely licensed and requires only that
// the photographer is credited. That credit is carried through to the pin and
// shown, because a photo lifted from somebody's holiday park website is
// somebody else's copyright no matter how good it would look, and a travel app
// that quietly reuses other people's photography is a letter from a lawyer
// waiting to happen.
//
// So coverage is honest rather than complete. A well known national park will
// have pictures; a nameless bush campsite two hours down a dirt road will not,
// and nothing is invented to fill the gap. Where travellers add their own
// photos through the app, those are ours to show and will be better than any of
// this — that is the version worth building toward.

export const runtime = 'nodejs';
export const maxDuration = 20;

const UA = 'thelapmap.com.au (trip planner; contact systems@frontlinetalentgroup.com.au)';

// Photos of a place do not change. Held for the life of the server, keyed to
// the rounded point, so panning back and forth costs nothing.
const cache = new Map<string, unknown>();

type Shot = { thumb: string; full: string; by: string; licence: string; title: string };

/**
 * Images Commons holds near a point.
 *
 * Radius is deliberately tight. Ten kilometres would find something for
 * everywhere in the country and none of it would be the campsite you tapped,
 * which is worse than showing nothing: a wrong photo of the wrong place is the
 * one thing that makes somebody stop trusting the whole map.
 */
async function commonsNear(lat: number, lng: number, metres: number): Promise<Shot[]> {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');
  url.searchParams.set('generator', 'geosearch');
  url.searchParams.set('ggscoord', `${lat}|${lng}`);
  url.searchParams.set('ggsradius', String(metres));
  url.searchParams.set('ggslimit', '12');
  url.searchParams.set('ggsnamespace', '6');           // files only
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|extmetadata');
  url.searchParams.set('iiurlwidth', '640');

  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) return [];
  const body = await res.json();
  const pages = body?.query?.pages ?? {};

  const shots: Shot[] = [];
  const stems = new Set<string>();
  for (const page of Object.values(pages) as Record<string, unknown>[]) {
    const info = (page.imageinfo as Record<string, unknown>[] | undefined)?.[0];
    if (!info) continue;
    const meta = (info.extmetadata ?? {}) as Record<string, { value?: string }>;
    const thumb = String(info.thumburl ?? '');
    if (!thumb) continue;

    // What gets thrown out, and why there is so much of it.
    //
    // Commons geosearch answers "what freely licensed files exist near this
    // point", which is not the question anybody is asking. Satellite and aerial
    // imagery is geotagged and tells you nothing about whether to stay
    // somewhere. Neither do maps, plans, signs and plaques. This only catches
    // what a filename can catch, which is the honest limit of the approach.
    const title = String(page.title ?? '').replace(/^File:/, '');
    if (/\.(svg|pdf|tiff?)$/i.test(title)) continue;
    if (/\b(map|plan|diagram|logo|coat of arms|locator|chart|graph|flag|sign|plaque|schematic|cadastr)/i.test(title)) continue;
    if (/\b(satellite|landsat|sentinel|modis|orthophoto|aerial|from the air|nasa|copernicus|space station|topograph)/i.test(title)) continue;

    // Commons is full of near duplicates: the same photo uploaded as -8, -8 (1)
    // and -8 (2). Three shots of one goanna is not three photos of a campsite.
    const stem = title.toLowerCase()
      .replace(/\.[a-z0-9]+$/, '')
      .replace(/[\s_-]*\(\d+\)$/, '')
      .replace(/[\s_-]*\d{1,3}$/, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    if (stems.has(stem)) continue;
    stems.add(stem);

    shots.push({
      thumb,
      full: String(info.descriptionurl ?? info.url ?? ''),
      // Stripped of the markup Commons puts in the credit field.
      by: String(meta.Artist?.value ?? 'Unknown').replace(/<[^>]*>/g, '').trim().slice(0, 80) || 'Unknown',
      licence: String(meta.LicenseShortName?.value ?? '').replace(/<[^>]*>/g, '').trim().slice(0, 40),
      title: title.replace(/\.[a-z0-9]+$/i, '').slice(0, 90),
    });
  }
  return shots;
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const lat = Number(q.get('lat'));
  const lng = Number(q.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: 'Where about?' }, { status: 400 });
  }

  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (cache.has(key)) return Response.json(cache.get(key));

  try {
    // Close in first. Only if that finds nothing does it widen, and even then
    // not far enough to start showing the next town.
    let shots = await commonsNear(lat, lng, 800);
    let near = true;
    if (!shots.length) {
      shots = await commonsNear(lat, lng, 3000);
      near = false;
    }

    const body = {
      photos: shots.slice(0, 6),
      // The map says "nearby" rather than "this place" when it had to widen,
      // because at three kilometres it is the district, not the campsite.
      exact: near,
      source: 'Wikimedia Commons',
    };
    cache.set(key, body);
    return Response.json(body, {
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
    });
  } catch {
    return Response.json({ photos: [], exact: false, source: 'Wikimedia Commons' });
  }
}
