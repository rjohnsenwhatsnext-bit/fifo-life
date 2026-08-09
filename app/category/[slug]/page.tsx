import { supabase, type Article } from "../../../lib/supabase";

const CATEGORY_COLORS: Record<string, string> = {
  money: "#1a56db", relationships: "#e11d48", health: "#059669", career: "#7c3aed", guides: "#f97316",
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  money: "FIFO incomes are above average — make yours work harder. Budgeting, investing, super and financial planning for roster workers.",
  relationships: "Distance is hard. Real advice on keeping your relationship and family strong while you're away.",
  health: "Shift work, camp food and physical labour take a toll. Fitness, mental health and sleep strategies that actually work on site.",
  career: "Where the work is, what it pays, and how to move up in the industry.",
  guides: "Free and paid PDF guides you can read in camp, on the plane, or at home.",
};

async function getByCategory(category: string): Promise<Article[]> {
  try {
    const { data } = await supabase()
      .from("articles")
      .select("*")
      .eq("site", "fifo")
      .eq("published", true)
      .ilike("category", category)
      .order("published_at", { ascending: false })
      .limit(24);
    return data ?? [];
  } catch {
    return [];
  }
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const label = slug.charAt(0).toUpperCase() + slug.slice(1);
  const color = CATEGORY_COLORS[slug] ?? "#1a56db";
  const articles = await getByCategory(label);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 24px 80px" }}>
      {/* Header */}
      <div style={{ borderBottom: "3px solid " + color, paddingBottom: 24, marginBottom: 40 }}>
        <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color, marginBottom: 10 }}>Category</div>
        <h1 style={{ fontFamily: "system-ui, sans-serif", fontSize: "2.2rem", marginBottom: 12 }}>{label}</h1>
        <p style={{ color: "#6b7280", fontSize: "1.05rem", maxWidth: 600 }}>{CATEGORY_DESCRIPTIONS[slug] ?? `Articles about ${label}.`}</p>
      </div>

      {articles.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0", color: "#9ca3af", fontFamily: "system-ui, sans-serif" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✍️</div>
          <p style={{ fontSize: "1.1rem" }}>Articles coming soon — we're working on it.</p>
        </div>
      ) : (
        <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 36 }}>
          {articles.map(a => (
            <article key={a.id} style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 28 }}>
              <div style={{ color, fontFamily: "system-ui, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>{a.category}</div>
              <h2 style={{ fontSize: "1.1rem", lineHeight: 1.3, marginBottom: 10 }}>
                <a href={`/article/${a.slug}`} style={{ color: "#111" }}>{a.title}</a>
              </h2>
              <p style={{ fontSize: "0.9rem", color: "#6b7280", lineHeight: 1.6, marginBottom: 12 }}>{a.excerpt}</p>
              <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 12, color: "#9ca3af" }}>{a.reading_time} min read</div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
