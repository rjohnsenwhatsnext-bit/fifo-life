import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mining & FIFO Guides",
  description:
    "No-fluff PDF guides for mining and FIFO workers — resumes, first swing survival, supervisor shift diaries, operator logs and money plans. Instant download.",
};

// Always fetch the live catalogue — Next's fetch cache survives deploys,
// which left stale (unpublished) product states on the page
export const dynamic = "force-dynamic";

type Product = {
  id: string;
  name: string;
  description: string;
  formatted_price: string;
  short_url: string;
  thumbnail_url: string | null;
  published: boolean;
  deleted?: boolean;
};

const MINING_KEYWORDS = [
  "fifo", "mining", "mine", "swing", "roster", "camp",
  "supervisor", "operator", "site diary", "shift diary",
  "resume", "green to gold", "ticket", "drill", "haul",
];

function isMining(name: string): boolean {
  const n = name.toLowerCase();
  return MINING_KEYWORDS.some(k => n.includes(k));
}

function tagFor(name: string): { tag: string; color: string } {
  const n = name.toLowerCase();
  if (n.includes("money") || n.includes("wealth") || n.includes("budget")) return { tag: "Money", color: "#1a56db" };
  if (n.includes("resume") || n.includes("green to gold") || n.includes("breaking into")) return { tag: "Career", color: "#7c3aed" };
  if (n.includes("supervisor")) return { tag: "Supervisors", color: "#b45309" };
  if (n.includes("operator")) return { tag: "Operators", color: "#059669" };
  return { tag: "Site Life", color: "#f97316" };
}

async function getGuides(): Promise<Product[]> {
  const token = process.env.GUMROAD_ACCESS_TOKEN;
  if (!token) return [];
  try {
    const r = await fetch("https://api.gumroad.com/v2/products", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!r.ok) return [];
    const data = await r.json();
    // Gumroad's `published` flag is unreliable (misreports live products as
    // unpublished). Ground truth: a live product's public page returns 200,
    // a dead/unpublished one 404s.
    const candidates: Product[] = (data.products ?? []).filter(
      (p: Product) => !p.deleted && isMining(p.name) && p.short_url
    );
    const checks = await Promise.all(
      candidates.map(async (p) => {
        try {
          const head = await fetch(p.short_url, { method: "HEAD", cache: "no-store" });
          if (!head.ok) return null;
          return { ...p, thumbnail_url: await resolveCover(p) };
        } catch {
          return null;
        }
      })
    );
    return checks.filter((p): p is Product => p !== null);
  } catch {
    return [];
  }
}

// Strip HTML that Gumroad sometimes wraps descriptions in
function cleanDesc(html: string): string {
  return (html || "").replace(/<[^>]+>/g, "").trim();
}

// Covers live in Supabase storage (Gumroad's API can't accept cover images),
// keyed by product-name slug. Fall back to Gumroad's thumbnail if one was
// added manually in the dashboard.
const COVERS_BASE =
  "https://fnakmbssslvqbpggvopo.supabase.co/storage/v1/object/public/covers";

function coverSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function resolveCover(p: Product): Promise<string | null> {
  const url = `${COVERS_BASE}/${coverSlug(p.name)}.jpg`;
  try {
    const head = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (head.ok) return url;
  } catch {}
  return p.thumbnail_url || null;
}

const FREE_GUIDES = [
  {
    title: "The First Swing Packing Checklist",
    desc: "Everything to pack before your first FIFO swing — and what to leave home. Save it, pack once, never think about it again.",
    tag: "Site Life",
    color: "#f97316",
    file: "/downloads/first-swing-packing-checklist.pdf",
    cover: "https://fnakmbssslvqbpggvopo.supabase.co/storage/v1/object/public/covers/the-first-swing-packing-checklist.jpg",
  },
  {
    title: "The 7-Second Mining Resume Cheat Sheet",
    desc: "What recruiters actually scan for before deciding your future — and the instant-bin mistakes to fix tonight.",
    tag: "Career",
    color: "#7c3aed",
    file: "/downloads/mining-resume-cheat-sheet.pdf",
    cover: "https://fnakmbssslvqbpggvopo.supabase.co/storage/v1/object/public/covers/the-7-second-mining-resume-cheat-sheet.jpg",
  },
  {
    title: "Camp Life: The Unwritten Rules",
    desc: "The etiquette nobody explains at induction — corridors, laundry, the wet mess and your reputation.",
    tag: "Site Life",
    color: "#f97316",
    file: "/downloads/camp-life-unwritten-rules.pdf",
    cover: "https://fnakmbssslvqbpggvopo.supabase.co/storage/v1/object/public/covers/camp-life-the-unwritten-rules.jpg",
  },
];

export default async function GuidesPage() {
  const guides = await getGuides();

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 24px 80px" }}>
      {/* Gumroad overlay checkout — buyers never leave the page */}
      <script src="https://gumroad.com/js/gumroad.js" async />

      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#f97316", marginBottom: 12 }}>
          Practical PDFs · Instant Download
        </div>
        <h1 style={{ fontFamily: "system-ui, sans-serif", fontSize: "2.4rem", marginBottom: 16 }}>
          Mining &amp; FIFO Guides
        </h1>
        <p style={{ color: "#6b7280", fontSize: "1.1rem", maxWidth: 600, margin: "0 auto" }}>
          No-fluff guides written for the industry — first swing survival, mining resumes,
          supervisor shift diaries, operator career logs and roster-proof money plans.
          Read in camp, on the plane, or at home.
        </p>
      </div>

      {/* Free minis — the hook */}
      <div style={{ marginBottom: 56 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 20 }}>
          <h2 style={{ fontFamily: "system-ui, sans-serif", fontSize: "1.4rem" }}>Free downloads</h2>
          <span style={{ color: "#059669", fontFamily: "system-ui, sans-serif", fontSize: 13, fontWeight: 700 }}>No email, no signup — just take them</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 28 }}>
          {FREE_GUIDES.map(g => (
            <div key={g.title} style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column", background: "#fff" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.cover} alt={g.title} style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderBottom: "1px solid #e5e7eb" }} />
              <div style={{ padding: 26, display: "flex", flexDirection: "column", flexGrow: 1 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ color: g.color, fontFamily: "system-ui, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" }}>{g.tag}</div>
                <div style={{ fontFamily: "system-ui, sans-serif", fontWeight: 700, fontSize: 13, color: "#059669" }}>FREE</div>
              </div>
              <h3 style={{ fontFamily: "system-ui, sans-serif", fontSize: "1.02rem", lineHeight: 1.35, marginBottom: 10 }}>{g.title}</h3>
              <p style={{ fontSize: "0.88rem", color: "#6b7280", lineHeight: 1.6, flexGrow: 1, marginBottom: 20 }}>{g.desc}</p>
              <a
                href={g.file}
                download
                style={{ display: "block", textAlign: "center", background: "#059669", color: "#fff", fontFamily: "system-ui, sans-serif", fontWeight: 700, fontSize: 13, padding: "11px 0", borderRadius: 6, textDecoration: "none" }}
              >
                Download free →
              </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 20 }}>
        <h2 style={{ fontFamily: "system-ui, sans-serif", fontSize: "1.4rem" }}>The full guides</h2>
        <span style={{ color: "#6b7280", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>Deep dives — instant PDF download after checkout</span>
      </div>

      {guides.length === 0 ? (
        <div style={{ textAlign: "center", border: "1px dashed #d1d5db", borderRadius: 12, padding: "64px 24px", color: "#6b7280" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⛏️</div>
          <p style={{ fontFamily: "system-ui, sans-serif", fontWeight: 600, fontSize: 18, color: "#111", marginBottom: 8 }}>
            New guides landing shortly
          </p>
          <p style={{ maxWidth: 420, margin: "0 auto", lineHeight: 1.6 }}>
            The first drop — FIFO survival, mining resumes and supervisor shift diaries —
            is being finalised now. Check back soon.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 28 }}>
          {guides.map(g => {
            const { tag, color } = tagFor(g.name);
            return (
              <div key={g.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column", background: "#fff" }}>
                {g.thumbnail_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.thumbnail_url} alt={g.name} style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderBottom: "1px solid #e5e7eb" }} />
                )}
                <div style={{ padding: 24, display: "flex", flexDirection: "column", flexGrow: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ color, fontFamily: "system-ui, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" }}>{tag}</div>
                    <div style={{ fontFamily: "system-ui, sans-serif", fontWeight: 700, fontSize: 15 }}>{g.formatted_price}</div>
                  </div>
                  <h2 style={{ fontFamily: "system-ui, sans-serif", fontSize: "1.05rem", lineHeight: 1.35, marginBottom: 10 }}>{g.name}</h2>
                  <p style={{ fontSize: "0.88rem", color: "#6b7280", lineHeight: 1.6, flexGrow: 1, marginBottom: 20 }}>
                    {cleanDesc(g.description).slice(0, 160)}
                  </p>
                  <a
                    className="gumroad-button"
                    href={`${g.short_url}?wanted=true`}
                    style={{ display: "block", textAlign: "center", background: "#f97316", color: "#fff", fontFamily: "system-ui, sans-serif", fontWeight: 700, fontSize: 13, padding: "11px 0", borderRadius: 6, textDecoration: "none" }}
                  >
                    Get the guide — {g.formatted_price} →
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, marginTop: 40 }}>
        Secure checkout &amp; instant PDF delivery. Questions? admin@frontlinetalentgroup.com.au
      </p>
    </div>
  );
}
