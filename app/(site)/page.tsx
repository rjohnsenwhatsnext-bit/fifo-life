import { supabase, type Article } from "@/lib/supabase";
import FtgFooter from "@/app/FtgFooter";
// re-render at most every 5 minutes so daily agent-published articles appear
export const revalidate = 300;


const SAMPLE_ARTICLES: Article[] = [
  {
    id: "1", site: "fifo", slug: "fifo-budgeting-guide", title: "How to Actually Save Money on a FIFO Roster", excerpt: "Most FIFO workers earn well above average — yet a surprising number finish their careers with little to show for it. Here's how to change that.", category: "Money", author: "FIFO Life", reading_time: 8, featured: true, published: true, published_at: new Date().toISOString(), created_at: new Date().toISOString(),
    content: "",
  },
  {
    id: "2", site: "fifo", slug: "long-distance-relationships-fifo", title: "Keeping Your Relationship Strong When You're Fly-In Fly-Out", excerpt: "The 2-weeks-on 1-week-off cycle puts real strain on relationships. Here's what actually works.", category: "Relationships", author: "FIFO Life", reading_time: 6, featured: false, published: true, published_at: new Date().toISOString(), created_at: new Date().toISOString(),
    content: "",
  },
  {
    id: "3", site: "fifo", slug: "mental-health-on-site", title: "Mental Health on Site: What No One Talks About", excerpt: "Isolation, shift work, and being away from family takes a toll. These strategies make a real difference.", category: "Health", author: "FIFO Life", reading_time: 7, featured: false, published: true, published_at: new Date().toISOString(), created_at: new Date().toISOString(),
    content: "",
  },
  {
    id: "4", site: "fifo", slug: "fifo-fitness-on-site", title: "Staying Fit On Site When Motivation is Zero", excerpt: "Camp gyms, 12-hour shifts, terrible food — here's how to stay in shape despite it all.", category: "Health", author: "FIFO Life", reading_time: 5, featured: false, published: true, published_at: new Date().toISOString(), created_at: new Date().toISOString(),
    content: "",
  },
  {
    id: "5", site: "fifo", slug: "best-fifo-jobs-australia-2026", title: "Best FIFO Jobs in Australia Right Now (2026)", excerpt: "Where the work is, what it pays, and how to get your foot in the door at the top sites.", category: "Career", author: "FIFO Life", reading_time: 9, featured: false, published: true, published_at: new Date().toISOString(), created_at: new Date().toISOString(),
    content: "",
  },
];

async function getArticles(): Promise<Article[]> {
  try {
    const { data } = await supabase()
      .from("articles")
      .select("*")
      .eq("site", "fifo")
      .eq("published", true)
      .order("published_at", { ascending: false })
      .limit(20);
    return data?.length ? data : SAMPLE_ARTICLES;
  } catch {
    return SAMPLE_ARTICLES;
  }
}

const CATEGORY_COLORS: Record<string, string> = {
  Money: "#1a56db",
  Relationships: "#e11d48",
  Health: "#059669",
  Career: "#7c3aed",
  Guides: "#f97316",
};

export default async function HomePage() {
  const articles = await getArticles();
  const featured = articles.find(a => a.featured) ?? articles[0];
  const rest = articles.filter(a => a.id !== featured.id).slice(0, 8);

  return (
    <>
      {/* Hero */}
      <section style={{ borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
        <div className="home-hero" style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 24px", display: "grid", gridTemplateColumns: "1fr 420px", gap: 48, alignItems: "center" }}>
          <div>
            <div style={{ display: "inline-block", background: CATEGORY_COLORS[featured.category] ?? "#1a56db", color: "#fff", fontFamily: "system-ui, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "3px 10px", borderRadius: 3, marginBottom: 16 }}>
              {featured.category}
            </div>
            <h1 style={{ fontSize: "2.4rem", lineHeight: 1.15, marginBottom: 20, fontFamily: "system-ui, sans-serif" }}>
              <a href={`/article/${featured.slug}`} style={{ color: "#111" }}>{featured.title}</a>
            </h1>
            <p style={{ fontSize: "1.15rem", color: "#4b5563", lineHeight: 1.7, marginBottom: 28 }}>{featured.excerpt}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: "system-ui, sans-serif", fontSize: 13, color: "#6b7280" }}>
              <span>{featured.reading_time} min read</span>
              <span>·</span>
              <span>{new Date(featured.published_at).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</span>
            </div>
            <a href={`/article/${featured.slug}`} style={{ display: "inline-block", marginTop: 28, background: "#1a56db", color: "#fff", fontFamily: "system-ui, sans-serif", fontWeight: 700, fontSize: 14, padding: "12px 24px", borderRadius: 6 }}>
              Read Article →
            </a>
          </div>
          <div style={{ borderRadius: 12, overflow: "hidden", height: 300, position: "relative" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/hero-fifo.jpg"
              alt="FIFO worker walking to the plane at sunrise, bag in hand"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "24px 20px 14px", background: "linear-gradient(transparent, rgba(0,0,0,0.65))", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>FIFO Life</div>
              <div style={{ fontSize: 12.5, opacity: 0.9 }}>Real talk. Real advice.</div>
            </div>
          </div>
        </div>
      </section>

      {/* Ad slot — leaderboard (fills when AdSense is approved) */}
      <div style={{ maxWidth: 1200, margin: "24px auto 0", padding: "0 24px" }}>
        <div id="ad-leaderboard" style={{ height: 100, borderRadius: 8, background: "repeating-linear-gradient(45deg,#f6f7f8,#f6f7f8 12px,#f1f2f4 12px,#f1f2f4 24px)", border: "1px dashed #e0e3e7", display: "flex", alignItems: "center", justifyContent: "center", color: "#b6bcc4", fontFamily: "system-ui, sans-serif", fontSize: 11, letterSpacing: 1 }}>AD</div>
      </div>

      {/* Article grid */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "56px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
          <h2 style={{ fontFamily: "system-ui, sans-serif", fontSize: "1.5rem" }}>Latest Articles</h2>
          <div style={{ display: "flex", gap: 8 }}>
            {["Money", "Relationships", "Health", "Career"].map(cat => (
              <a key={cat} href={`/category/${cat.toLowerCase()}`} style={{ fontFamily: "system-ui, sans-serif", fontSize: 12, fontWeight: 600, color: CATEGORY_COLORS[cat], background: "#f3f4f6", padding: "4px 12px", borderRadius: 20, border: `1px solid ${CATEGORY_COLORS[cat]}33` }}>{cat}</a>
            ))}
          </div>
        </div>

        <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32 }}>
          {rest.map(article => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>

        {/* Ad slot — in-content */}
        <div id="ad-incontent" style={{ height: 250, marginTop: 40, borderRadius: 8, background: "repeating-linear-gradient(45deg,#f6f7f8,#f6f7f8 12px,#f1f2f4 12px,#f1f2f4 24px)", border: "1px dashed #e0e3e7", display: "flex", alignItems: "center", justifyContent: "center", color: "#b6bcc4", fontFamily: "system-ui, sans-serif", fontSize: 11, letterSpacing: 1 }}>AD</div>
      </section>

      {/* PDF Guides CTA */}
      <section style={{ background: "#111827", color: "#fff", padding: "56px 24px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#f97316", marginBottom: 16 }}>Free Downloads</div>
          <h2 style={{ fontFamily: "system-ui, sans-serif", fontSize: "2rem", marginBottom: 16 }}>PDF Guides for FIFO Workers</h2>
          <p style={{ color: "#9ca3af", fontSize: "1.05rem", lineHeight: 1.7, marginBottom: 32 }}>
            Practical guides you can read on the plane, in camp, or during downtime. Budgeting, relationships, fitness, career — no fluff.
          </p>
          <a href="/guides" style={{ display: "inline-block", background: "#f97316", color: "#fff", fontFamily: "system-ui, sans-serif", fontWeight: 700, fontSize: 15, padding: "14px 32px", borderRadius: 8 }}>
            Download Free Guides →
          </a>
        </div>
      </section>

        <div style={{ maxWidth: 780, margin: "0 auto", padding: "0 24px 64px" }}>
          <FtgFooter />
        </div>
    </>
  );
}

function ArticleCard({ article }: { article: Article }) {
  const color = CATEGORY_COLORS[article.category] ?? "#1a56db";
  return (
    <article style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 28 }}>
      <div style={{ display: "inline-block", color, fontFamily: "system-ui, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
        {article.category}
      </div>
      <h3 style={{ fontSize: "1.1rem", lineHeight: 1.3, marginBottom: 10 }}>
        <a href={`/article/${article.slug}`} style={{ color: "#111" }}>{article.title}</a>
      </h3>
      <p style={{ fontSize: "0.9rem", color: "#6b7280", lineHeight: 1.6, marginBottom: 12 }}>{article.excerpt}</p>
      <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 12, color: "#9ca3af" }}>
        {article.reading_time} min read · {new Date(article.published_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
      </div>
    </article>
  );
}
