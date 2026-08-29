import type { Metadata, Viewport } from "next";
import "./van.css";
import Van from "./van";

// The van checklist, next to the trip planner.
//
// Same tool, two jobs. The planner answers "how long can we go"; this answers
// "is the van ready to". Both get opened in the same places by the same person,
// so they share a domain, a look and an installed app rather than being two
// things to find.
//
// Inside the planner's PWA scope on thelapmap.com.au, where the manifest claims
// "/", so somebody who installed the trip planner already has this without
// installing anything else.

export const viewport: Viewport = {
  themeColor: "#0a1411",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Your Van: Jobs, Packing and What to Buy",
  description:
    "A checklist for the van. What needs doing before it goes anywhere, what to pack, and what to pick up on the way. Works offline, saved on your phone, no account.",
  alternates: { canonical: "https://thelapmap.com.au/van" },
  openGraph: {
    title: "Your Van, on The Lap Map",
    description:
      "Jobs, packing and shopping for the van. Works offline and there is no login.",
    url: "https://thelapmap.com.au/van",
    type: "website",
  },
};

export default function VanPage() {
  return (
    <div className="tool-shell">
      <header className="tool-bar">
        {/* Back to the planner, which is the tool's front door on this domain.
            A page you can only reach by typing its address does not exist. */}
        <a className="tool-back" href="/">
          <span className="tool-back-mark">The Lap</span>
          <span className="tool-back-word">Map</span>
        </a>
        <div className="tool-title">
          <h1>Your van</h1>
          <p>What needs doing, what to pack, and what to grab on the way.</p>
        </div>
      </header>

      <Van />

      <section className="tool-words">
        <h2>Why this is three lists and not one</h2>
        <p>
          They empty at different moments. Jobs get ticked in the shed the week before, packing
          gets ticked on the morning you leave, and the shopping gets ticked in a supermarket in a
          town you have never been to. One list holding all three means scrolling past the tyres to
          find the tea bags.
        </p>
        <p>
          Packing is the one that repeats. It is the same list every trip, near enough, so it has
          an untick rather than only a delete: the point of writing it down once is not writing it
          again. Jobs and shopping are different every time, so they only clear.
        </p>
        <h2>There is no account, on purpose</h2>
        <p>
          The lists are saved in this browser and nowhere else. Nothing is sent anywhere, there is
          nothing to sign into, and there is no copy of your van on a server belonging to anybody.
          It also means it works with no signal, which is where a van checklist actually gets used.
          The trade is that the lists live on the phone that wrote them, and clearing your browser
          data clears them.
        </p>
      </section>
    </div>
  );
}
