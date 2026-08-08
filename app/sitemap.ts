import type { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";

// The list Google actually reads to find out this site exists.
//
// Twenty one articles were published here and the site had no sitemap and no
// robots file, so nothing ever told a search engine that any of it was here.
// On a month old site with no inbound links, that is the difference between
// being indexed and being invisible: crawlers find new sites by being told,
// not by chance.
//
// Generated rather than written out, so an article published tonight is in the
// sitemap tonight. A sitemap that has to be updated by hand is a sitemap that
// goes stale in a fortnight.

export const revalidate = 3600;

const SITE = "https://fifolife.au";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed: MetadataRoute.Sitemap = [
    { url: SITE, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/guides`, changeFrequency: "weekly", priority: 0.7 },
    // The two tools. They earn links and they answer a question somebody typed
    // into a search box, which an article about rosters does not, so they sit
    // above the category pages rather than at the bottom. The mine map was
    // missing from here entirely, which meant the one page most likely to be
    // found was the one nothing pointed a crawler at.
    { url: `${SITE}/mines`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE}/planner`, changeFrequency: "monthly", priority: 0.9 },
  ];

  try {
    const { data } = await supabase()
      .from("articles")
      .select("slug, category, published_at, created_at")
      .eq("site", "fifo")
      .eq("published", true)
      .order("published_at", { ascending: false })
      .limit(5000);

    const articles = (data ?? []).map((a) => ({
      url: `${SITE}/article/${a.slug}`,
      lastModified: new Date(a.published_at ?? a.created_at ?? Date.now()),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    }));

    // Category pages are real pages that rank in their own right, and they are
    // how a crawler walks from one article to its neighbours.
    const categories = [...new Set((data ?? []).map((a) => a.category).filter(Boolean))]
      .map((c) => ({
        url: `${SITE}/category/${String(c).toLowerCase()}`,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));

    return [...fixed, ...categories, ...articles];
  } catch {
    // A database hiccup should cost the article list, not the whole sitemap.
    return fixed;
  }
}
