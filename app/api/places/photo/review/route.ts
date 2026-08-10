import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// The queue, and the two buttons.
//
// A moderation step that lives in a SQL console is a moderation step that does
// not happen, and photos that never get approved are the same as photos nobody
// can upload. So this is a plain list with yes and no on it.
//
// Behind a shared secret rather than a login, because there is exactly one
// person doing this and giving him an account system to review four photos a
// week would be the tail wagging the dog. The secret goes in a header, never a
// query string, so it does not end up in a log.

export const runtime = 'nodejs';

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const BUCKET = 'site-photos';

function allowed(req: Request) {
  const want = process.env.PHOTO_REVIEW_SECRET;
  if (!want) return false;
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  return given === want;
}

/** What is waiting. */
export async function GET(req: Request) {
  if (!allowed(req)) return NextResponse.json({ error: 'Not for you.' }, { status: 401 });

  const db = admin();
  const { data } = await db.from('place_photos')
    .select('id, path, site_name, lat, lng, added_by, created_at, source')
    .eq('approved', false).eq('hidden', false)
    .order('created_at', { ascending: true })
    .limit(40);

  if (!data?.length) return NextResponse.json({ waiting: [] });

  const { data: signed } = await db.storage.from(BUCKET)
    .createSignedUrls(data.map((r) => r.path), 60 * 30);
  const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return NextResponse.json({
    waiting: data.map((r) => ({
      id: r.id,
      url: byPath.get(r.path) ?? null,
      site: r.site_name,
      at: `${r.lat.toFixed(4)},${r.lng.toFixed(4)}`,
      by: r.added_by,
      when: r.created_at,
      // Shown so a run of bad uploads from one source can be spotted and dealt
      // with in one go.
      source: r.source?.slice(0, 8),
    })),
  });
}

/** Yes, no, or no to everything from that source. */
export async function POST(req: Request) {
  if (!allowed(req)) return NextResponse.json({ error: 'Not for you.' }, { status: 401 });

  const db = admin();
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? '');
  const verdict = String(body.verdict ?? '');

  if (!id) return NextResponse.json({ error: 'Which one?' }, { status: 400 });

  if (verdict === 'yes') {
    const { error } = await db.from('place_photos')
      .update({ approved: true, reviewed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return NextResponse.json({ error: 'Could not approve that.' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (verdict === 'no' || verdict === 'source') {
    const { data: row } = await db.from('place_photos').select('path, source').eq('id', id).single();
    if (!row) return NextResponse.json({ error: 'Gone already.' }, { status: 404 });

    // A rejected photo is deleted from storage rather than hidden. Text that
    // turns out to be fine can be unhidden later; a rejected image is rejected
    // because it should not be on the server at all.
    if (verdict === 'source' && row.source) {
      const { data: all } = await db.from('place_photos')
        .select('id, path').eq('source', row.source).eq('approved', false);
      const paths = (all ?? []).map((r) => r.path);
      if (paths.length) await db.storage.from(BUCKET).remove(paths);
      await db.from('place_photos').delete().eq('source', row.source).eq('approved', false);
      return NextResponse.json({ ok: true, removed: paths.length });
    }

    await db.storage.from(BUCKET).remove([row.path]);
    await db.from('place_photos').delete().eq('id', id);
    return NextResponse.json({ ok: true, removed: 1 });
  }

  return NextResponse.json({ error: 'Yes or no?' }, { status: 400 });
}
