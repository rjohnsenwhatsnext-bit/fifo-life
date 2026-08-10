import type { Metadata } from "next";
import "../globals.css";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: { default: "FIFO Life — Real Talk for FIFO Workers & Families", template: "%s | FIFO Life" },
  description: "Practical guides, real stories and honest advice for FIFO workers and the families who hold the fort.",
  // Search Console ownership. Next renders this into every page, so it verifies
  // wherever Google happens to look rather than only the homepage.
  verification: { google: "mbXjkukK5BWSPmn57EXiHGcpwJk_VnWDfI98uefHvnk" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Plain async script — React 19 hoists it into <head> in the
            server-rendered HTML, which AdSense's verifier needs to see */}
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7133578381234553"
          crossOrigin="anonymous"
        />
        <Header />
        <main>{children}</main>
        <Footer />
              <Analytics />
      </body>
    </html>
  );
}

function Header() {
  return (
    <header style={{ borderBottom: "2px solid #e5e7eb", background: "#fff", position: "sticky", top: 0, zIndex: 50, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
      <div className="site-header-inner" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ background: "#1a56db", color: "#fff", fontFamily: "system-ui, sans-serif", fontWeight: 900, fontSize: 18, padding: "4px 10px", borderRadius: 4, letterSpacing: "-0.02em" }}>FIFO</div>
          <span style={{ fontFamily: "system-ui, sans-serif", fontWeight: 700, fontSize: 18, color: "#111" }}>Life</span>
        </a>
        <nav className="site-nav" style={{ display: "flex", gap: 28, fontFamily: "system-ui, sans-serif", fontSize: 14, fontWeight: 500, color: "#374151" }}>
          {["Money", "Relationships", "Health", "Career", "Mine Map", "Trip Planner", "Guides"].map(cat => (
            <a key={cat}
              href={
                cat === "Guides" ? "/guides"
                : cat === "Mine Map" ? "/mines"
                : cat === "Trip Planner" ? "https://thelapmap.com.au"
                : `/category/${cat.toLowerCase()}`
              }
            >{cat}</a>
          ))}
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer style={{ borderTop: "1px solid #e5e7eb", background: "#111827", color: "#9ca3af", marginTop: 80 }}>
      <div className="site-footer-grid" style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 24px 32px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 40 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ background: "#1a56db", color: "#fff", fontFamily: "system-ui, sans-serif", fontWeight: 900, fontSize: 16, padding: "3px 8px", borderRadius: 3 }}>FIFO</div>
            <span style={{ fontFamily: "system-ui, sans-serif", fontWeight: 700, fontSize: 16, color: "#fff" }}>Life</span>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.7 }}>Practical guides and honest advice for FIFO workers and the families keeping things together back home.</p>
        </div>
        <div>
          <div style={{ fontFamily: "system-ui, sans-serif", fontWeight: 600, color: "#fff", marginBottom: 14, fontSize: 13, letterSpacing: "0.05em", textTransform: "uppercase" }}>Categories</div>
          {["Money", "Relationships", "Health", "Career", "Mine Map", "Trip Planner", "Guides"].map(cat => (
            <a key={cat}
              href={
                cat === "Guides" ? "/guides"
                : cat === "Mine Map" ? "/mines"
                : cat === "Trip Planner" ? "https://thelapmap.com.au"
                : `/category/${cat.toLowerCase()}`
              }
              style={{ display: "block", fontSize: 14, marginBottom: 8 }}>{cat}</a>
          ))}
        </div>
        <div>
          <div style={{ fontFamily: "system-ui, sans-serif", fontWeight: 600, color: "#fff", marginBottom: 14, fontSize: 13, letterSpacing: "0.05em", textTransform: "uppercase" }}>Guides &amp; Tools</div>
          <p style={{ fontSize: 14, marginBottom: 16, lineHeight: 1.7 }}>Packing checklists, resume cheat sheets, camp survival — written for the industry. Free ones to start, deep dives when you're ready.</p>
          <a href="/guides" style={{ display: "inline-block", background: "#f97316", color: "#fff", fontFamily: "system-ui, sans-serif", fontWeight: 700, fontSize: 13, padding: "8px 16px", borderRadius: 6 }}>Grab the Free Guides →</a>
        </div>
      </div>
      <div style={{ borderTop: "1px solid #1f2937", padding: "20px 24px", textAlign: "center", fontSize: 13 }}>
        © {new Date().getFullYear()} FIFO Life. All rights reserved.
      </div>
    </footer>
  );
}
