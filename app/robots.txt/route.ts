// robots.txt, per domain.
//
// This used to be a static file that named fifolife.au as the host and pointed
// at fifolife.au's sitemap. Which was correct until the planner got a domain of
// its own, and then quietly wrong in the worst way: thelapmap.com.au was
// serving a robots file telling every crawler that the canonical host was a
// different site, and pointing them at a sitemap containing thirty five URLs
// none of which were on thelapmap.com.au.
//
// A new domain with no inbound links is entirely dependent on being told it
// exists. Being told it is somebody else's is worse than saying nothing.
//
// A route handler rather than the metadata export, because the metadata export
// is generated once with no request to look at, and the whole point here is
// answering differently depending on which host asked.

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  const host = (req.headers.get('host') ?? '').toLowerCase();
  const lap = host.includes('thelapmap');
  const site = lap ? 'https://thelapmap.com.au' : 'https://fifolife.au';

  const body = [
    'User-Agent: *',
    'Allow: /',
    '',
    `Host: ${site}`,
    `Sitemap: ${site}/sitemap.xml`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
