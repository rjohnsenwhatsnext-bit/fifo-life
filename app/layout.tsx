import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FIFO Life — Real Talk for FIFO Workers & Families", template: "%s | FIFO Life" },
  description: "Practical guides, real stories and honest advice for FIFO workers and the families who hold the fort.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}

function Header() {
  return (
    <header style={{ borderBottom: "2px solid #e5e7eb", background: "#fff", position: "sticky", top: 0, zIndex: 50, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ background: "#1a56db", color: "#fff", fontFamily: "system-ui, sans-serif", fontWeight: 900, fontSize: 18, padding: "4px 10px", borderRadius: 4, letterSpacing: "-0.02em" }}>FIFO</div>
          <span style={{ fontFamily: "system-ui, sans-serif", fontWeight: 700, fontSize: 18, color: "#111" }}>Life</span>
        </a>
        <nav style={{ display: "flex", gap: 28, fontFamily: "system-ui, sans-serif", fontSize: 14, fontWeight: 500, color: "#374151" }}>
          {["Money", "Relationships", "Health", "Career", "Guides"].map(cat => (
            <a key={cat} href={`/category/${cat.toLowerCase()}`}>{cat}</a>
          ))}
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer style={{ borderTop: "1px solid #e5e7eb", background: "#111827", color: "#9ca3af", marginTop: 80 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 24px 32px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 40 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ background: "#1a56db", color: "#fff", fontFamily: "system-ui, sans-serif", fontWeight: 900, fontSize: 16, padding: "3px 8px", borderRadius: 3 }}>FIFO</div>
            <span style={{ fontFamily: "system-ui, sans-serif", fontWeight: 700, fontSize: 16, color: "#fff" }}>Life</span>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.7 }}>Practical guides and honest advice for FIFO workers and the families keeping things together back home.</p>
        </div>
        <div>
          <div style={{ fontFamily: "system-ui, sans-serif", fontWeight: 600, color: "#fff", marginBottom: 14, fontSize: 13, letterSpacing: "0.05em", textTransform: "uppercase" }}>Categories</div>
          {["Money", "Relationships", "Health", "Career", "Guides"].map(cat => (
            <a key={cat} href={`/category/${cat.toLowerCase()}`} style={{ display: "block", fontSize: 14, marginBottom: 8 }}>{cat}</a>
          ))}
        </div>
        <div>
          <div style={{ fontFamily: "system-ui, sans-serif", fontWeight: 600, color: "#fff", marginBottom: 14, fontSize: 13, letterSpacing: "0.05em", textTransform: "uppercase" }}>Free Guides</div>
          <p style={{ fontSize: 14, marginBottom: 16, lineHeight: 1.7 }}>Download our free PDF guides — budgeting, relationships, health and more for FIFO workers.</p>
          <a href="/guides" style={{ display: "inline-block", background: "#f97316", color: "#fff", fontFamily: "system-ui, sans-serif", fontWeight: 700, fontSize: 13, padding: "8px 16px", borderRadius: 6 }}>Browse Guides →</a>
        </div>
      </div>
      <div style={{ borderTop: "1px solid #1f2937", padding: "20px 24px", textAlign: "center", fontSize: 13 }}>
        © {new Date().getFullYear()} FIFO Life. All rights reserved.
      </div>
    </footer>
  );
}
