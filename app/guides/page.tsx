const GUIDES = [
  { title: "FIFO Budgeting Blueprint", desc: "A complete budget template and 90-day savings challenge built for fly-in fly-out rosters.", price: "Free", tag: "Money", url: "#" },
  { title: "The FIFO Relationship Survival Guide", desc: "How to maintain a strong relationship with your partner and kids when you're away half the year.", price: "$9.95", tag: "Relationships", url: "#" },
  { title: "Sleep & Recovery on Shift Work", desc: "Why FIFO workers are chronically sleep-deprived and exactly how to fix it.", price: "Free", tag: "Health", url: "#" },
  { title: "Getting Into FIFO: Your First Role", desc: "How to get your first FIFO job with no experience — tickets, resume, medicals explained.", price: "$12.95", tag: "Career", url: "#" },
  { title: "FIFO Fitness: Training on Site", desc: "A practical 4-week program you can run with camp gym equipment and zero motivation.", price: "$7.95", tag: "Health", url: "#" },
  { title: "Mental Health in the Mines", desc: "Real talk about isolation, FIFO stress, and evidence-based tools to stay on top of it.", price: "Free", tag: "Health", url: "#" },
];

const TAG_COLORS: Record<string, string> = {
  Money: "#1a56db", Relationships: "#e11d48", Health: "#059669", Career: "#7c3aed",
};

export default function GuidesPage() {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 24px 80px" }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#f97316", marginBottom: 12 }}>Practical PDFs</div>
        <h1 style={{ fontFamily: "system-ui, sans-serif", fontSize: "2.4rem", marginBottom: 16 }}>FIFO Life Guides</h1>
        <p style={{ color: "#6b7280", fontSize: "1.1rem", maxWidth: 560, margin: "0 auto" }}>No-fluff PDF guides for FIFO workers and their families. Read in camp, on the plane, or at home.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 28 }}>
        {GUIDES.map(g => {
          const color = TAG_COLORS[g.tag] ?? "#1a56db";
          const isFree = g.price === "Free";
          return (
            <div key={g.title} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 28, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ color, fontFamily: "system-ui, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" }}>{g.tag}</div>
                <div style={{ fontFamily: "system-ui, sans-serif", fontWeight: 700, fontSize: 14, color: isFree ? "#059669" : "#111" }}>{g.price}</div>
              </div>
              <h2 style={{ fontFamily: "system-ui, sans-serif", fontSize: "1.05rem", lineHeight: 1.3, marginBottom: 10 }}>{g.title}</h2>
              <p style={{ fontSize: "0.88rem", color: "#6b7280", lineHeight: 1.6, flexGrow: 1, marginBottom: 20 }}>{g.desc}</p>
              <a href={g.url} style={{ display: "block", textAlign: "center", background: isFree ? "#059669" : "#f97316", color: "#fff", fontFamily: "system-ui, sans-serif", fontWeight: 700, fontSize: 13, padding: "10px 0", borderRadius: 6 }}>
                {isFree ? "Download Free" : `Get for ${g.price}`} →
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
