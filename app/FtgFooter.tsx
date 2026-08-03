// Who is behind this site, and what they can do for you.
//
// FIFO Life had no link to FTG anywhere. Twenty one articles aimed squarely at
// Australian FIFO mining workers, which is precisely the pool FTG recruits
// from, and a reader could finish every one of them without learning the name.
//
// The order here is deliberate and it is not the order that was asked for.
// Nearly every reader of this site is a worker, so recruitment leads: that is a
// real offer to almost all of them. FTG Systems sells back office automation to
// people who own a business, which on this site is a minority, the subbies with
// their own ABN and the ones running a small crew. Putting the software first
// would be leading with the thing that applies to fewer people, and a footer
// that reads as irrelevant gets ignored on every page it appears.

export default function FtgFooter() {
  return (
    <aside
      style={{
        marginTop: 48,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        overflow: "hidden",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ background: "#111827", padding: "24px 28px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#e8721c", marginBottom: 10 }}>
          Who writes this
        </div>
        <div style={{ color: "#f9fafb", fontSize: "1.15rem", fontWeight: 700, lineHeight: 1.4, marginBottom: 10 }}>
          Frontline Talent Group places people on Queensland mine sites.
        </div>
        <p style={{ color: "#d1d5db", fontSize: "0.95rem", lineHeight: 1.65, margin: "0 0 18px" }}>
          Run by people who have actually worked the mines and held supervisor level on site,
          which is why we go to site and profile the culture before we put anyone forward.
        </p>
        <a
          href="https://frontlinetalentgroup.com.au/#eoi"
          style={{
            display: "inline-block", background: "#e8721c", color: "#fff",
            fontWeight: 700, fontSize: 14, padding: "12px 24px", borderRadius: 8,
            textDecoration: "none",
          }}
        >
          Looking for your next roster? →
        </a>
      </div>

      {/* The smaller half, for the readers who own something rather than work
          for somebody. Deliberately understated: on this site that is the
          minority, and overselling it to everyone else costs the whole block
          its credibility. */}
      <div style={{ background: "#f9fafb", padding: "18px 28px", fontSize: "0.9rem", color: "#4b5563", lineHeight: 1.6 }}>
        Run your own show? <strong style={{ color: "#111827" }}>FTG Systems</strong> takes the invoicing,
        quoting and chasing off small trade businesses for a fraction of an admin wage.{" "}
        <a href="https://frontlinetalentgroup.com.au/systems" style={{ color: "#e8721c", fontWeight: 600 }}>
          Have a look
        </a>
        .
      </div>
    </aside>
  );
}
