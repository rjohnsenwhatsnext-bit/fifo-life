import type { Metadata, Viewport } from "next";
import "./planner.css";
import "./trip.css";
import Planner from "./planner";

// Installable, because of where it gets used.
//
// The planning happens at a kitchen table months out; the using happens in a
// car park at Gympie with one bar of signal, working out whether to fill up
// here or push on. That is a home screen icon, not a browser tab somebody has
// to go and find. Scoped to /planner so installing the tool does not turn the
// whole magazine into an app.
export const viewport: Viewport = {
  themeColor: "#0f172a",
  // Lets the layout paint under the notch and the home bar, which the CSS then
  // pads back out of with env(safe-area-inset-*).
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  // The page itself does not pinch.
  //
  // On a document that would be wrong — people zoom to read. Here it is a tool
  // with a map in it, and a pinch meant to zoom the map that catches the page
  // instead leaves the whole layout scaled and shifted with no obvious way
  // back. Locking the page means a pinch can only mean one thing, and the map
  // still zooms because Leaflet handles that itself.
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  manifest: "/planner/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "The Lap Map",
    // Dark bar to match the map, rather than a white strip above a navy page.
    statusBarStyle: "black-translucent",
  },
  icons: { apple: "/apple-touch-icon.png" },
  // Next emits the standardised mobile-web-app-capable, which only recent
  // Safari reads. Apple's own name is what older iPhones look for, and without
  // it they open the saved icon in a browser with the address bar still there.
  other: { "apple-mobile-web-app-capable": "yes" },
  title: "The Lap Map: Big Lap Trip Planner, What It Costs and How Long You Can Go",
  description:
    "Work out how long your money lasts on the road. Put in what you have saved, plan the legs on a map, tap any town to see what there is to do, and see the week by week cost of towing a van around Australia.",
  // The planner has its own domain now, so that is the address search
  // engines should hold. fifolife.au/planner still works and still serves the
  // same thing — it just points at the new one rather than competing with it.
  alternates: { canonical: "https://thelapmap.com.au" },
  openGraph: {
    title: "The Lap Map, Big Lap Trip Planner",
    description:
      "How long can you actually go? Starting money, real road distances, national park rates, and what there is to do in every town you stop in.",
    url: "https://thelapmap.com.au",
    type: "website",
  },
};

// A tool, not an article.
//
// The heading and three paragraphs of explanation used to sit above the map,
// which meant the thing somebody came for started below the fold on every
// phone. So the tool opens the page and the writing goes underneath it, where
// it still earns its keep with a search engine and stays out of the way of the
// person who already knows what this is.

export default function PlannerPage() {
  return (
    <div className="tool-shell">
      <header className="tool-bar">
        {/* The tool has its own name and its own domain now. It was still
            wearing the magazine's logo, which told somebody who arrived at
            thelapmap.com.au that they were somewhere else. */}
        <a className="tool-back" href="/">
          <span className="tool-back-mark">The Lap</span>
          <span className="tool-back-word">Map</span>
        </a>
        <div className="tool-title">
          <h1>The Lap Map</h1>
          <p>How long the money lasts, what the road costs, and what is in every town you stop in.</p>
        </div>
      </header>

      <Planner />

      <section className="tool-words">
        <h2>Why the number is usually wrong</h2>
        <p>
          Most people work out a lap by taking a monthly figure and multiplying it. Two things go
          wrong. A month is 4.33 weeks, not four, so a year of spending comes out a month short.
          And nobody tows four hundred kilometres a day seven days a week: you move, then you sit
          somewhere for a few days, so fuel follows how many driving days there are rather than a
          flat distance. Both are handled here, which is usually the difference between the plan
          and what the bank account does.
        </p>
        <p>
          The other one is sites. A powered site in a tourist town in July is not the same money as
          a national park in the shoulder season, and the mix is what decides whether you last six
          months or fourteen. Put a couple of real legs in and the per night figure it gives you
          back is usually a shock, in a useful way.
        </p>
        <p>
          Diesel comes off the state fuel price reporting scheme, so the figure on the map is the
          one on the board rather than a guess. Camps and things to do are a mix of OpenStreetMap
          and what other travellers have added.
        </p>
        <p>
          Nothing here is financial advice and your plan never leaves your browser. There is no
          login, because a tool that wants your email before it answers anything is not a tool.
        </p>
      </section>
    </div>
  );
}
