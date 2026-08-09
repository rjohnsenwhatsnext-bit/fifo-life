import type { Metadata } from "next";
import "./planner.css";
import "./trip.css";
import Planner from "./planner";

export const metadata: Metadata = {
  title: "Big Lap Trip Planner, What It Costs and How Long You Can Go",
  description:
    "Work out how long your money lasts on the road. Put in what you have saved, plan the legs on a map, tap any town to see what there is to do, and see the week by week cost of towing a van around Australia.",
  alternates: { canonical: "https://fifolife.au/planner" },
  openGraph: {
    title: "Big Lap Trip Planner",
    description:
      "How long can you actually go? Starting money, real road distances, national park rates, and what there is to do in every town you stop in.",
    url: "https://fifolife.au/planner",
    type: "website",
  },
};

// The planner moved onto the site.
//
// It started as one family's spreadsheet with a house sale and a business in
// it, which is a plan rather than a tool: nobody else's numbers fit. Stripped
// back to the two questions everybody actually asks, how long does the money
// last and what is out there, it is the same shape as the mine map. Somebody
// works out whether the life is possible before they work out the details.
//
// Nothing is sent anywhere. The plan lives in the browser it was typed into,
// which is also why there is no sign up: a tool that asks for an email before
// it answers anything is one people leave.

export default function PlannerPage() {
  return (
    <main className="tool-page" style={{ maxWidth: 1180, margin: "0 auto", padding: "40px 20px 90px" }}>
      <p style={{
        fontSize: 12, letterSpacing: ".2em", textTransform: "uppercase",
        color: "#e8721c", fontWeight: 700, margin: "0 0 8px",
      }}>
        Before you go
      </p>

      <h1 style={{
        fontSize: "clamp(30px, 5.5vw, 46px)", lineHeight: 1.08, margin: "0 0 14px",
        letterSpacing: "-.02em",
      }}>
        How long can you actually go for?
      </h1>

      <p style={{ fontSize: 17, lineHeight: 1.6, color: "#b8b8b8", maxWidth: 680, margin: "0 0 12px" }}>
        Put in what you have saved and what a week on the road costs you, and it tells you how
        many months that is. Plan the legs on the map and it works out the real road distance
        and the fuel at what you actually get towing, not what the brochure says.
      </p>

      <p style={{ fontSize: 17, lineHeight: 1.6, color: "#b8b8b8", maxWidth: 680, margin: "0 0 26px" }}>
        Tap any town on the map and it will tell you what there is to do there: the lookouts,
        the falls, the beaches, the free camps, where the drinking water and the dump points are.
        National park nights price themselves on the published per person rate with the family cap,
        because getting that wrong overstates a lap of Queensland by hundreds.
      </p>

      <Planner />

      <section style={{ maxWidth: 720, margin: "56px auto 0", fontSize: 16, lineHeight: 1.65, color: "#b8b8b8" }}>
        <h2 style={{ fontSize: 24, color: "#fff", margin: "0 0 12px", letterSpacing: "-.01em" }}>
          Why the number is usually wrong
        </h2>
        <p style={{ margin: "0 0 16px" }}>
          Most people work out a lap by taking a monthly figure and multiplying it. Two things go
          wrong. A month is 4.33 weeks, not four, so a year of spending comes out a month short.
          And nobody tows four hundred kilometres a day seven days a week: you move, then you sit
          somewhere for a few days, so fuel follows how many driving days there are rather than a
          flat distance. Both are handled here, which is usually the difference between the plan
          and what the bank account does.
        </p>
        <p style={{ margin: "0 0 16px" }}>
          The other one is sites. A powered site in a tourist town in July is not the same money as
          a national park in the shoulder season, and the mix is what decides whether you last six
          months or fourteen. Put a couple of real legs in and the per night figure it gives you
          back is usually a shock, in a useful way.
        </p>
        <p style={{ margin: 0 }}>
          Nothing here is financial advice and nothing you type leaves your browser. There is no
          login, because a tool that wants your email before it answers anything is not a tool.
        </p>
      </section>
    </main>
  );
}
