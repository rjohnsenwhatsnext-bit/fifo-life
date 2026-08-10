import { supabase } from "@/lib/supabase";

// The sitemap, per domain.
//
// The magazine's sitemap is generated from the articles table so that something
// published tonight is listed tonight. That part was right and is unchanged.
//
// What was wrong is that thelapmap.com.au served the same file: thirty five
// fifolife.au URLs and not one of its own. A crawler arriving at the new domain
// was handed a list of pages on a different site and nothing at all about the
// one it was standing on, which is a fair explanation for a domain that is not
// being indexed.
//
// The planner is one page, so its sitemap is short and hand written. It does not
// need generating; it needs to exist.

export const dynamic = 'force-dynamic';

type Entry = { loc: string; lastmod?: string; changefreq?: string; priority?: number };

function xml(entries: Entry[]) {
  const body = entries.map((e) => [
    '  <url>',
    `    <loc>${e.loc}</loc>`,
    e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : '',
    e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : '',
    e.priority != null ? `    <priority>${e.priority}</priority>` : '',
    '  </url>',
  ].filter(Boolean).join('\n')).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

const send = (entries: Entry[]) => new Response(xml(entries), {
  headers: {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  },
});

export async function GET(req: Request) {
  const host = (req.headers.get('host') ?? '').toLowerCase();

  if (host.includes('thelapmap')) {
    const site = 'https://thelapmap.com.au';
    return send([
      { loc: site, changefreq: 'weekly', priority: 1 },
      // The root rewrites to the planner on this host, so both are the same
      // page. Both are listed because both get linked to from outside.
      { loc: `${site}/planner`, changefreq: 'weekly', priority: 0.9 },
    ]);
  }

  const site = 'https://fifolife.au';
  const fixed: Entry[] = [
    { loc: site, changefreq: 'daily', priority: 1 },
    { loc: `${site}/guides`, changefreq: 'weekly', priority: 0.7 },
    { loc: `${site}/mines`, changefreq: 'monthly', priority: 0.9 },
  ];

  try {
    const { data } = await supabase()
      .from('articles')
      .select('slug, category, published_at, created_at')
      .eq('site', 'fifo')
      .eq('published', true)
      .order('published_at', { ascending: false })
      .limit(5000);

    const articles: Entry[] = (data ?? []).map((a) => ({
      loc: `${site}/article/${a.slug}`,
      lastmod: new Date(a.published_at ?? a.created_at ?? Date.now()).toISOString().slice(0, 10),
      changefreq: 'monthly',
      priority: 0.8,
    }));

    // Category pages rank in their own right, and they are how a crawler walks
    // from one article to its neighbours.
    const categories: Entry[] = [...new Set((data ?? []).map((a) => a.category).filter(Boolean))]
      .map((c) => ({
        loc: `${site}/category/${String(c).toLowerCase()}`,
        changefreq: 'weekly',
        priority: 0.6,
      }));

    return send([...fixed, ...categories, ...articles]);
  } catch {
    // A database hiccup should cost the article list, not the whole sitemap.
    return send(fixed);
  }
}
