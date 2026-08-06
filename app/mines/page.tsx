import type { Metadata } from "next";
import MinesMap from "./MinesMap";

export const metadata: Metadata = {
  title: "Australian Mine Map, Every Operating Site",
  description:
    "Satellite map of every operating mine, development project and site in care and maintenance across Australia. See the pit, the camp and the airstrip before you take the job.",
  alternates: { canonical: "https://fifolife.au/mines" },
};

// The map moved here from the directory.
//
// It was sitting on a site people visit to read a review of one mine they have
// already been offered work at. The person who needs a map is at the other end
// of that: they do not know where the work is yet, they are working out whether
// a swing to the Pilbara is a different life to a swing to the Bowen Basin, and
// that is the question this whole site exists to answer.

export default function MinesPage() {
  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 20px 90px" }}>
      <p style={{
        fontSize: 12, letterSpacing: ".2em", textTransform: "uppercase",
        color: "#e8721c", fontWeight: 700, margin: "0 0 8px",
      }}>
        Where the work is
      </p>

      <h1 style={{
        fontSize: "clamp(30px, 5.5vw, 46px)", lineHeight: 1.08, margin: "0 0 14px",
        letterSpacing: "-.02em",
      }}>
        Every mine in Australia, from above
      </h1>

      <p style={{ fontSize: 17, lineHeight: 1.6, color: "#b8b8b8", maxWidth: 660, margin: "0 0 26px" }}>
        Satellite, not a road map. You can see the pit, the ROM pad, the camp and how far
        the airstrip is from all of it, which tells you more about a swing than any job ad will.
        Green is operating, amber is under development, blue is care and maintenance.
      </p>

      <MinesMap />

      <div style={{
        marginTop: 34, padding: "22px 24px", border: "1px solid #2a2a2a",
        borderRadius: 6, background: "#141414", maxWidth: 720,
      }}>
        <h2 style={{ fontSize: 19, margin: "0 0 8px" }}>Before you take the job</h2>
        <p style={{ color: "#b8b8b8", fontSize: 15.5, lineHeight: 1.6, margin: 0 }}>
          A site an hour off a highway and a site three hours down a haul road are the same
          roster on paper and a completely different two weeks. Look at what is around it,
          then read what people who have worked there say about the camp.
        </p>
      </div>
    </main>
  );
}
