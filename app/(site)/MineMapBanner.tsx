// The map, made the first thing on the site.
//
// The homepage led with whichever article was flagged featured. The best
// performing article on this site has been read fifteen times, and thirty of
// the sixty six published have never been read at all, so the front page was
// leading with the weakest thing on it.
//
// The map is the only asset here nobody else has: five hundred and thirty nine
// mines, plotted, from satellite. An article about FIFO tax deductions competes
// with every accountant in Australia. A map of every mine in the country
// competes with nobody, and it is the only page a stranger would link to
// unprompted, which is the currency a new site is short of.
//
// Deliberately not the map itself. Leaflet and five hundred markers on first
// paint would make the homepage slow for someone who came to read something,
// and a slow homepage loses the visit before the map ever draws. This is the
// invitation; the map is one tap away.

const STATS = [
  { n: 347, label: "operating", tone: "#4ade80" },
  { n: 56, label: "in development", tone: "#fbbf24" },
  { n: 136, label: "care and maintenance", tone: "#60a5fa" },
];

export default function MineMapBanner() {
  return (
    <section
      aria-labelledby="minemap-heading"
      style={{
        background: "#0d0d0d",
        borderBottom: "1px solid #1f1f1f",
        // The dark band against the light page below is the point: it reads as
        // a different kind of thing rather than another article card.
        backgroundImage:
          "radial-gradient(1100px 380px at 22% -10%, rgba(232,114,28,.16), transparent 60%)",
      }}
    >
      <div
        className="minemap-banner"
        style={{
          maxWidth: 1200, margin: "0 auto", padding: "clamp(38px, 6vw, 62px) 24px",
          display: "grid", gridTemplateColumns: "1fr auto", gap: 40, alignItems: "center",
        }}
      >
        <div>
          <p style={{
            fontSize: 12, letterSpacing: ".2em", textTransform: "uppercase",
            color: "#e8721c", fontWeight: 700, margin: "0 0 10px",
          }}>
            Where the work is
          </p>

          <h1 id="minemap-heading" style={{
            fontSize: "clamp(28px, 4.6vw, 44px)", lineHeight: 1.08,
            letterSpacing: "-.02em", margin: "0 0 14px", color: "#fff",
          }}>
            Every mine in Australia, from above
          </h1>

          <p style={{
            fontSize: 17, lineHeight: 1.62, color: "#b8b8b8",
            maxWidth: 620, margin: "0 0 22px",
          }}>
            Satellite, not a road map. You can see the pit, the camp and how far the
            airstrip is from both, which tells you more about a swing than any job ad will.
          </p>

          <div style={{
            display: "flex", flexWrap: "wrap", gap: "10px 26px", margin: "0 0 26px",
          }}>
            {STATS.map((s) => (
              <span key={s.label} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span aria-hidden="true" style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: s.tone, display: "inline-block",
                  transform: "translateY(-1px)",
                }} />
                <strong style={{ color: "#fff", fontSize: 20, fontVariantNumeric: "tabular-nums" }}>
                  {s.n}
                </strong>
                <span style={{ color: "#8a8a8a", fontSize: 14.5 }}>{s.label}</span>
              </span>
            ))}
          </div>

          <a href="/mines" style={{
            display: "inline-block", background: "#e8721c", color: "#0d0d0d",
            fontFamily: "system-ui, sans-serif", fontWeight: 700, fontSize: 15,
            padding: "13px 26px", borderRadius: 6, textDecoration: "none",
          }}>
            Open the map
          </a>
        </div>

        {/* A quiet count, so the scale is legible before the map is opened. */}
        <div className="minemap-count" style={{ textAlign: "right", color: "#5f5f5f" }}>
          <div style={{
            fontSize: "clamp(54px, 9vw, 92px)", lineHeight: 1, color: "#1c1c1c",
            fontWeight: 800, letterSpacing: "-.04em", fontVariantNumeric: "tabular-nums",
          }}>
            539
          </div>
          <div style={{ fontSize: 13, letterSpacing: ".14em", textTransform: "uppercase", marginTop: 6 }}>
            sites mapped
          </div>
        </div>
      </div>

      {/* The big number is decoration, and the first thing to go on a phone. */}
      <style>{`
        @media (max-width: 760px) {
          .minemap-banner { grid-template-columns: 1fr; gap: 24px; }
          .minemap-count { display: none; }
        }
      `}</style>
    </section>
  );
}
