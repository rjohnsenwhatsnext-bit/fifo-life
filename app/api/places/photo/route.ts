import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { judge } from '@/lib/moderate';

// A photo of a site, from somebody who was there.
//
// This is the thing that makes the map worth using rather than a copy of
// OpenStreetMap with better pins. Nobody has photographs of ten thousand
// Australian campsites; the people who stay at them do, one at a time.
//
// The rules are the same as the shared camps next door, with one addition that
// matters. There are no accounts here, so an upload is an anonymous write of
// arbitrary bytes to a public site. Text spam gets hidden and forgotten. An
// image is a different order of problem, and it would be sitting on our domain.
// So the bucket is private, nothing is served without a signed link, and no
// link is signed for a photo that has not been approved. The person who
// uploaded it sees it immediately because they still have it on their phone.
// Everybody else waits.

export const runtime = 'nodejs';
export const maxDuration = 45;

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const BUCKET = 'site-photos';

// A shade over a megabyte of base64, which is a 1400px JPEG. The phone shrinks
// it before it gets here; this is the backstop.
const MAX = 1_500_000;

function fingerprint(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
    || req.headers.get('x-real-ip') || 'unknown';
  return createHash('sha256').update(`${process.env.PLACES_SALT ?? ''}:${ip}`).digest('hex').slice(0, 32);
}

/** The id the parks route hands out, rebuilt from a point. */
const keyFor = (lat: number, lng: number) => `${lat},${lng}`;

/** What is approved for a site. Signed, because the bucket is shut. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const lat = Number(url.searchParams.get('lat'));
    const lng = Number(url.searchParams.get('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ photos: [] });
    }

    const db = admin();
    // Within about fifty metres rather than an exact key match: an OSM site
    // moves slightly between edits and a photo should not be orphaned by
    // somebody nudging a node.
    const pad = 0.0005;
    const { data } = await db.from('place_photos')
      .select('id, path, added_by, created_at, caption')
      .eq('approved', true).eq('hidden', false)
      .gte('lat', lat - pad).lte('lat', lat + pad)
      .gte('lng', lng - pad).lte('lng', lng + pad)
      .order('created_at', { ascending: false })
      .limit(8);

    if (!data?.length) return NextResponse.json({ photos: [] });

    const { data: signed } = await db.storage.from(BUCKET)
      .createSignedUrls(data.map((r) => r.path), 60 * 60 * 6);
    const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

    return NextResponse.json({
      photos: data.map((r) => ({
        id: r.id,
        url: byPath.get(r.path) ?? null,
        by: r.added_by || 'a traveller',
        when: r.created_at,
        // Written by the model when it checked the photo. Doing double duty as
        // alt text, so the map is readable by somebody using a screen reader
        // without anybody having to type a description.
        caption: r.caption || '',
      })).filter((p) => p.url),
    });
  } catch {
    return NextResponse.json({ photos: [] });
  }
}

export async function POST(req: Request) {
  try {
    const db = admin();
    const body = await req.json().catch(() => ({}));

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const image = typeof body.image === 'string' ? body.image : '';
    const name = String(body.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const by = String(body.addedBy ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: 'Which site?' }, { status: 400 });
    }
    if (!image.startsWith('data:image/jpeg') && !image.startsWith('data:image/webp')) {
      return NextResponse.json({ error: 'Send a photo.' }, { status: 400 });
    }
    if (image.length > MAX) {
      return NextResponse.json({ error: 'That photo is too big.' }, { status: 413 });
    }

    const source = fingerprint(req);

    // Four an hour from one place. Enough for somebody to put up a few shots of
    // where they stayed, not enough to be worth automating.
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await db.from('place_photos')
      .select('id', { count: 'exact', head: true })
      .eq('source', source).gte('created_at', hourAgo);
    if ((count ?? 0) >= 4) {
      return NextResponse.json({ error: 'That is a few for one hour. Try again later.' }, { status: 429 });
    }

    const [meta, base64] = image.split(',');
    const type = meta.includes('webp') ? 'image/webp' : 'image/jpeg';
    const bytes = Buffer.from(base64, 'base64');
    if (!bytes.length) return NextResponse.json({ error: 'That photo did not arrive.' }, { status: 400 });

    // Looked at before it is stored, not after.
    //
    // Uploading first and checking second means a rejected photo existed on the
    // server, however briefly, and that is exactly the thing worth not doing.
    // The check costs about a quarter of a cent and two seconds, and the person
    // is still standing there holding the phone, so they find out now.
    const verdict = await judge(base64, type as 'image/jpeg' | 'image/webp');
    if (verdict.decision === 'reject') {
      return NextResponse.json({
        error: verdict.reason || 'That one is not a photo of a place, so it has not been added.',
      }, { status: 422 });
    }

    const path = `${lat.toFixed(4)}_${lng.toFixed(4)}/${crypto.randomUUID()}.${type === 'image/webp' ? 'webp' : 'jpg'}`;
    const { error: upErr } = await db.storage.from(BUCKET)
      .upload(path, bytes, { contentType: type, upsert: false });
    if (upErr) throw upErr;

    const { error } = await db.from('place_photos').insert({
      site_key: keyFor(lat, lng),
      lat, lng,
      site_name: name || null,
      path,
      added_by: by || null,
      source,
      // Clear on sight goes straight up. Anything the model would not commit to
      // waits for a person, which is what the queue is for now.
      approved: verdict.decision === 'ok',
      reviewed_at: verdict.decision === 'ok' ? new Date().toISOString() : null,
      caption: verdict.caption || null,
      checked_by: verdict.decision === 'ok' ? 'haiku' : null,
      check_note: verdict.decision === 'unsure' ? (verdict.reason || 'not sure') : null,
    });
    if (error) {
      // Do not leave the file behind if the row failed: an orphan in a private
      // bucket is a photo nobody can review and nobody can delete.
      await db.storage.from(BUCKET).remove([path]);
      throw error;
    }

    // Signed straight back, so the person who sent it sees their own photo on
    // the site immediately even though nobody else can yet.
    const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(path, 60 * 60);

    return NextResponse.json({
      ok: true,
      pending: verdict.decision !== 'ok',
      url: signed?.signedUrl ?? null,
      caption: verdict.caption || null,
    });
  } catch {
    return NextResponse.json({ error: 'Could not add that photo.' }, { status: 500 });
  }
}
