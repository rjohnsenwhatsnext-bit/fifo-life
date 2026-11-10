import type { Metadata } from "next";
import { supabase, type Article } from "@/lib/supabase";
import { notFound } from "next/navigation";
import ViewPing from "./ViewPing";
import FtgFooter from "@/app/FtgFooter";

async function getArticle(slug: string): Promise<Article | null> {
  try {
    const { data } = await supabase()
      .from("articles")
      .select("*")
      .eq("slug", slug)
      .eq("site", "fifo")
      .single();
    return data;
  } catch {
    return null;
  }
}

// Each article's own title and description in search results, instead of the
// site default on every page (Search Console, 10 Nov 2026).
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) return { title: "Article not found", robots: { index: false } };
  const url = `https://fifolife.au/article/${article.slug}`;
  return {
    title: article.title,
    description: article.excerpt ?? undefined,
    alternates: { canonical: url },
    openGraph: { type: "article", url, title: article.title, description: article.excerpt ?? undefined, publishedTime: article.published_at ?? undefined, authors: article.author ? [article.author] : undefined },
  };
}

const CATEGORY_COLORS: Record<string, string> = {
  Money: "#1a56db", Relationships: "#e11d48", Health: "#059669", Career: "#7c3aed", Guides: "#f97316",
};

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticle(slug);

  // An unknown slug is a real 404. It used to render a sample article with a
  // 200, which Google reads as one thin page repeated at every made up address.
  if (!article) notFound();
  const display: Article = article;

  const color = CATEGORY_COLORS[display.category] ?? "#1a56db";

  return (
    <article style={{ maxWidth: 780, margin: "0 auto", padding: "48px 24px 80px" }}>
      <ViewPing site="fifo" slug={display.slug} />
      {/* Breadcrumb */}
      <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 13, color: "#6b7280", marginBottom: 24 }}>
        <a href="/" style={{ color: "#6b7280" }}>Home</a>
        <span style={{ margin: "0 8px" }}>›</span>
        <a href={`/category/${display.category.toLowerCase()}`} style={{ color }}>{display.category}</a>
      </div>

      {/* Category tag */}
      <div style={{ display: "inline-block", color, fontFamily: "system-ui, sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>
        {display.category}
      </div>

      {/* Title */}
      <h1 style={{ fontFamily: "system-ui, sans-serif", fontSize: "2.4rem", lineHeight: 1.15, marginBottom: 20 }}>
        {display.title}
      </h1>

      {/* Meta */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: "system-ui, sans-serif", fontSize: 13, color: "#6b7280", paddingBottom: 24, borderBottom: "1px solid #e5e7eb", marginBottom: 40 }}>
        <span style={{ fontWeight: 600, color: "#374151" }}>{display.author}</span>
        <span>·</span>
        <span>{new Date(display.published_at).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</span>
        <span>·</span>
        <span>{display.reading_time} min read</span>
      </div>

      {/* Excerpt */}
      <p style={{ fontSize: "1.25rem", lineHeight: 1.7, color: "#374151", marginBottom: 32, fontStyle: "italic", borderLeft: `4px solid ${color}`, paddingLeft: 20 }}>
        {display.excerpt}
      </p>

      {/* Content */}
      <div className="prose" dangerouslySetInnerHTML={{ __html: display.content }} />

      {/* CTA */}
      <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: "32px", marginTop: 48, textAlign: "center" }}>
        <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#f97316", marginBottom: 12 }}>Free Download</div>
        <h3 style={{ fontFamily: "system-ui, sans-serif", fontSize: "1.4rem", marginBottom: 12 }}>FIFO Budgeting Guide</h3>
        <p style={{ color: "#6b7280", marginBottom: 24, fontSize: "0.95rem" }}>A practical PDF guide with budget templates and a 90-day savings challenge built for FIFO workers.</p>
        <a href="/guides" style={{ display: "inline-block", background: "#f97316", color: "#fff", fontFamily: "system-ui, sans-serif", fontWeight: 700, fontSize: 14, padding: "12px 28px", borderRadius: 8 }}>
          Download Free →
        </a>
      </div>
      <FtgFooter />
    </article>
  );
}
