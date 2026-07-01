import { supabase, type Article } from "../../../lib/supabase";
import { notFound } from "next/navigation";

const SAMPLE_CONTENT = `
<p>If you're working FIFO, chances are you're earning more than most Australians. The industry pays well — and it should, given what you put up with. But here's the uncomfortable truth: a surprising number of FIFO workers reach the end of their working life without much to show for it financially.</p>

<p>The cycle is easy to fall into. You earn well, you spend well during your R&R, and somehow the money disappears. The weeks off feel like a reward, and spending feels justified. Then you're back on site, and the cycle repeats.</p>

<h2>Why FIFO workers struggle to save</h2>

<p>It's not a lack of income. It's a combination of factors that are specific to the FIFO lifestyle:</p>

<ul>
<li><strong>Compressed spending</strong> — all your leisure spending happens in one or two weeks, making it feel like you have more to spend than you do</li>
<li><strong>Guilt spending</strong> — buying things for family as a way of compensating for being away</li>
<li><strong>No visibility</strong> — when you're on site, it's easy to lose track of what's being spent back home</li>
<li><strong>The lifestyle creep trap</strong> — a higher income leads to higher expenses, and before long your savings rate hasn't moved</li>
</ul>

<h2>The simple framework that works</h2>

<p>Before anything else, you need one rule: <strong>pay yourself first, before R&R starts.</strong> Set up an automatic transfer the day your pay hits. Non-negotiable, no exceptions.</p>

<p>Here's a simple split that works for most FIFO workers:</p>

<ul>
<li><strong>50%</strong> — living expenses and bills (mortgage, car, groceries)</li>
<li><strong>20%</strong> — savings and investments (automated, untouchable)</li>
<li><strong>20%</strong> — R&R spending (your fun money — spend it guilt-free)</li>
<li><strong>10%</strong> — buffer/emergency fund</li>
</ul>

<h2>Tools that actually help</h2>

<p>A shared account that both you and your partner can see in real time removes the guesswork. Apps like Up Bank or Rabobank have decent budgeting tools built in. The key is visibility — you need to be able to see what's being spent while you're on site, not discover it when you get home.</p>

<blockquote>The best financial decision most FIFO workers can make isn't investment-related. It's automating savings before lifestyle spending gets a chance to absorb it.</blockquote>

<p>If you want a practical starting point, download our free FIFO Budgeting Guide below — it includes a simple spreadsheet template and a 90-day savings challenge designed specifically for roster workers.</p>
`;

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

const CATEGORY_COLORS: Record<string, string> = {
  Money: "#1a56db", Relationships: "#e11d48", Health: "#059669", Career: "#7c3aed", Guides: "#f97316",
};

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticle(slug);

  const display: Article = article ?? {
    id: "sample", site: "fifo", slug, featured: false, published: true,
    title: "How to Actually Save Money on a FIFO Roster",
    excerpt: "Most FIFO workers earn well above average — yet a surprising number finish their careers with little to show for it. Here's how to change that.",
    content: SAMPLE_CONTENT,
    category: "Money", author: "FIFO Life", reading_time: 8,
    published_at: new Date().toISOString(), created_at: new Date().toISOString(),
  };

  const color = CATEGORY_COLORS[display.category] ?? "#1a56db";

  return (
    <article style={{ maxWidth: 780, margin: "0 auto", padding: "48px 24px 80px" }}>
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
      <div className="prose" dangerouslySetInnerHTML={{ __html: display.content || SAMPLE_CONTENT }} />

      {/* CTA */}
      <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: "32px", marginTop: 48, textAlign: "center" }}>
        <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#f97316", marginBottom: 12 }}>Free Download</div>
        <h3 style={{ fontFamily: "system-ui, sans-serif", fontSize: "1.4rem", marginBottom: 12 }}>FIFO Budgeting Guide</h3>
        <p style={{ color: "#6b7280", marginBottom: 24, fontSize: "0.95rem" }}>A practical PDF guide with budget templates and a 90-day savings challenge built for FIFO workers.</p>
        <a href="/guides" style={{ display: "inline-block", background: "#f97316", color: "#fff", fontFamily: "system-ui, sans-serif", fontWeight: 700, fontSize: 14, padding: "12px 28px", borderRadius: 8 }}>
          Download Free →
        </a>
      </div>
    </article>
  );
}
