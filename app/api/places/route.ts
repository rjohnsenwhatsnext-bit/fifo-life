import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

// The shared list of camps and things to do.
//
// Somebody who has actually been there adds a spot, and everybody planning
// through that town sees it from then on. That is the whole idea, and it is
// also the whole risk: there are no accounts on this site, so this is an open
// write on a public page and it will find its way onto a spam list eventually.
//
// Four things stand between it and that:
//   - the anon key the browser holds can read and nothing else, so every write
//     comes through here where it can be checked;
//   - the column constraints repeat the checks in the database, so a mistake in
//     this file cannot get a bad row in;
//   - a hashed address, six additions an hour, which stops the volume attack
//     without keeping anything that identifies a person;
//   - links are refused outright, because a free camp listing has no reason to
//     contain a URL and spam almost always does.
//
// Nothing is ever deleted. Bad entries are hidden, so taking down somebody's
// genuine camp by mistake is one update away from being undone.

export const runtime = 'nodejs';

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const COLUMNS = 'id, kind, name, lat, lng, nightly, what, note, added_by, created_at';

// Salted so the table never holds anything that can be turned back into an
// address, and per deployment so two sites cannot compare notes.
function fingerprint(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
    || req.headers.get('x-real-ip') || 'unknown';
  return createHash('sha256').update(`${process.env.PLACES_SALT ?? ''}:${ip}`).digest('hex').slice(0, 32);
}

const km = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const R = 6371, r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLng = (bLng - aLng) * r;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
};

const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
// Anything that looks like it is trying to send somebody somewhere else.
const linky = (s: string) => /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|ru|cn|io|shop|xyz)\b/i.test(s);

/** What everybody has added near a point. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const lat = Number(url.searchParams.get('lat'));
    const lng = Number(url.searchParams.get('lng'));
    const radius = Math.min(Math.max(Number(url.searchParams.get('radius')) || 50, 5), 300);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: 'Need a point on the map.' }, { status: 400 });
    }

    // A degree of latitude is 111km everywhere; a degree of longitude shrinks
    // as you go south. Boxing the query rather than pulling the whole table and
    // filtering in Node keeps this working when there are ten thousand rows.
    const dLat = radius / 111;
    const dLng = radius / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));

    const { data, error } = await admin()
      .from('trip_places')
      .select(COLUMNS)
      .eq('status', 'live')
      .gte('lat', lat - dLat).lte('lat', lat + dLat)
      .gte('lng', lng - dLng).lte('lng', lng + dLng)
      .limit(200);
    if (error) throw error;

    const places = (data ?? [])
      .map((p) => ({ ...p, directKm: km(lat, lng, p.lat, p.lng) }))
      .filter((p) => p.directKm <= radius)
      .sort((a, b) => a.directKm - b.directKm)
      .slice(0, 40);

    return NextResponse.json({ radius, places });
  } catch {
    return NextResponse.json({ error: 'Could not read the shared list.' }, { status: 500 });
  }
}

/** Add one, for everybody. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const kind = body?.kind === 'thing' ? 'thing' : 'camp';
    const name = clean(body?.name, 80);
    const what = clean(body?.what, 60);
    const note = clean(body?.note, 280);
    const addedBy = clean(body?.addedBy, 40);
    const lat = Number(body?.lat), lng = Number(body?.lng);
    const nightly = body?.nightly === '' || body?.nightly == null ? null : Number(body.nightly);

    if (name.length < 2) return NextResponse.json({ error: 'Give it a name.' }, { status: 400 });
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -44 || lat > -9 || lng < 112 || lng > 154) {
      return NextResponse.json({ error: 'That point is not in Australia.' }, { status: 400 });
    }
    if (nightly != null && (!Number.isFinite(nightly) || nightly < 0 || nightly > 500)) {
      return NextResponse.json({ error: 'Put a sensible nightly rate on it.' }, { status: 400 });
    }
    if ([name, what, note, addedBy].some(linky)) {
      return NextResponse.json({ error: 'No links, sorry. Describe the place instead.' }, { status: 400 });
    }

    const db = admin();
    const ipHash = fingerprint(req);

    // Six an hour. A person adding the camps from one trip will never notice
    // it; a script trying to fill the map will.
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await db.from('trip_places')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash).gte('created_at', hourAgo);
    if ((count ?? 0) >= 6) {
      return NextResponse.json({ error: 'That is plenty for one hour. Come back shortly.' }, { status: 429 });
    }

    // The same camp added twice from two phones in the same car park is one
    // camp. Roughly 300 metres and the same name counts as already there.
    const { data: near } = await db.from('trip_places').select('id, name')
      .eq('status', 'live')
      .gte('lat', lat - 0.003).lte('lat', lat + 0.003)
      .gte('lng', lng - 0.003).lte('lng', lng + 0.003);
    if ((near ?? []).some((p) => p.name.trim().toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: 'That one is already on the map.' }, { status: 409 });
    }

    const { data, error } = await db.from('trip_places').insert({
      kind, name, lat, lng,
      nightly: kind === 'camp' ? nightly : null,
      what: kind === 'thing' ? (what || 'Worth a stop') : null,
      note: note || null,
      added_by: addedBy || null,
      ip_hash: ipHash,
    }).select(COLUMNS).single();
    if (error) throw error;

    return NextResponse.json({ place: { ...data, directKm: 0 } });
  } catch {
    return NextResponse.json({ error: 'Could not add that one.' }, { status: 500 });
  }
}

/** Hide one. Not a delete: the row stays so it can be put back. */
export async function DELETE(req: Request) {
  const key = req.headers.get('x-admin-key');
  if (!key || key !== process.env.PLACES_ADMIN_KEY) {
    return NextResponse.json({ error: 'No.' }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Which one?' }, { status: 400 });
  const { error } = await admin().from('trip_places').update({ status: 'hidden' }).eq('id', id);
  if (error) return NextResponse.json({ error: 'Could not hide it.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
