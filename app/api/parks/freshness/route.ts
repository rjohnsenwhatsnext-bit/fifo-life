import data from '@/data/parks.json';

// How old the map's own data is, for the app to show.
//
// A map presenting two year old campsites with the same confidence as this
// morning's is the quiet failure worth avoiding. Saying the date costs nothing
// and lets somebody judge for themselves.

export const runtime = 'nodejs';

export function GET() {
  const built = (data as { built?: string }).built ?? null;
  const days = built ? Math.floor((Date.now() - Date.parse(built)) / 86_400_000) : null;
  return Response.json({
    built,
    days,
    rows: (data as { parks: unknown[] }).parks.length,
    stale: days != null && days > 60,
  }, { headers: { 'Cache-Control': 'public, s-maxage=3600' } });
}
