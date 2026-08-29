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

    </div>
  );
}
