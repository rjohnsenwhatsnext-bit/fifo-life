import data from '@/data/parks.json';

// The monthly reminder that the map needs rebuilding.
//
// The sites come from a file built by a script somebody has to remember to run.
// It has carried the date it was built since the first version and nothing ever
// looked at it, which is how a map quietly becomes two years out of date while
// presenting itself with exactly the same confidence as one built this morning.
//
// This cannot rebuild the file on its own, and deliberately so: the build takes
// several minutes of somebody else's donated Overpass capacity, it fails in
// ways that need a person to look at them, and the result has to be committed
// and deployed. What it can do is make sure nobody has to remember.

export const runtime = 'nodejs';
export const maxDuration = 20;

const STALE_DAYS = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!secret || given !== secret) {
    return Response.json({ error: 'Not for you.' }, { status: 401 });
  }

  const built = (data as { built?: string }).built ?? null;
  const rows = (data as { parks: unknown[] }).parks.length;
  const days = built ? Math.floor((Date.now() - Date.parse(built)) / 86_400_000) : null;
  const stale = days == null || days > STALE_DAYS;

  if (!stale) return Response.json({ ok: true, days, rows, stale: false });

  // Told by email, because a warning nobody sees is the same as no warning, and
  // this is the one job in the system with nobody watching it.
  const host = process.env.ZOHO_SMTP_HOST;
  const user = process.env.ZOHO_EMAIL;
  const pass = process.env.ZOHO_SMTP_PASSWORD;
  if (host && user && pass) {
    try {
      const nodemailer = (await import('nodemailer')).default;
      const post = nodemailer.createTransport({
        host, port: Number(process.env.ZOHO_SMTP_PORT) || 465, secure: true,
        auth: { user, pass },
      });
      await post.sendMail({
        from: `The Lap Map <${user}>`,
        to: user,
        subject: `The Lap Map data is ${days} days old`,
        text: [
          `The site data was built ${days} days ago and has ${rows} rows in it.`,
          ``,
          `To rebuild it:`,
          `  cd fifo-life`,
          `  node scripts/fetch-parks.mjs`,
          `  vercel --prod`,
          ``,
          `It takes about ten minutes and writes only if every required pass succeeds,`,
          `so a failed run leaves the current data alone.`,
        ].join('\n'),
      });
      return Response.json({ ok: true, days, rows, stale: true, told: true });
    } catch {
      return Response.json({ ok: true, days, rows, stale: true, told: false });
    }
  }

  return Response.json({ ok: true, days, rows, stale: true, told: false });
}
