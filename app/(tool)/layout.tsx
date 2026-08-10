import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./tool.css";

// The planner is a tool, not an article.
//
// It used to be a page inside the magazine, which meant a sticky masthead, a
// seven item nav, a footer and an ad slot wrapped around something people open
// in a car park to work out whether to fill up here or push on. All of that is
// navigation to somewhere else, and on a phone it ate the screen before the map
// got a look in.
//
// A nested layout wraps the root one, it cannot replace it, so hiding the
// chrome with CSS was never going to be honest — the markup and the scripts
// would still be there. Route groups give the two their own roots instead. The
// magazine keeps everything it had; the tool has none of it, and they share a
// domain and nothing else.
//
// The wordmark top left is the tool's own, not the magazine's. It carried the
// FIFO Life logo for a while after this got its own domain, which meant landing
// on thelapmap.com.au and being told you were somewhere else.

export const metadata: Metadata = {
  title: { default: "The Lap Map, Big Lap Trip Planner", template: "%s" },
};

export default function ToolLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
