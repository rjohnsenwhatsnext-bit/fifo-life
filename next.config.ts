import type { NextConfig } from "next";

// The planner has its own front door.
//
// thelapmap.com.au serves the trip planner at its root while fifolife.au keeps
// serving it at /planner, off one deployment. A rewrite rather than a redirect,
// so the address bar stays on the new domain instead of bouncing somebody to
// the magazine the moment they arrive.
//
// Only the root is rewritten. Everything else — /api/fuel, /api/places, the
// static chunks — has to pass through untouched, and a blanket /:path* rule
// would send the planner's own API calls to /planner/api/... and break the map.

const LAP_MAP = "thelapmap.com.au";
const MAGAZINE = "fifolife.au";

const nextConfig: NextConfig = {
  // The planner left the magazine.
  //
  // It was on both: thelapmap.com.au at the root and fifolife.au/planner, off
  // one deployment. Two addresses serving the same page is two pages competing
  // for the same searches, and the one with the matching domain name should
  // win rather than have to.
  //
  // Permanent, and to the new home rather than a 404, so the links that already
  // point at fifolife.au/planner keep working and hand their standing to the
  // domain that is meant to have it. The nav and the sitemaps were already
  // pointing at thelapmap.com.au; this is the last thing that was not.
  //
  // Host conditioned, so it only ever fires for the magazine. The rewrite below
  // still resolves thelapmap.com.au to /planner internally, and redirects are
  // evaluated before rewrites, so the tool's own address is untouched.
  async redirects() {
    return [MAGAZINE, `www.${MAGAZINE}`].flatMap((host) => [
      { source: "/planner", has: [{ type: "host" as const, value: host }],
        destination: `https://${LAP_MAP}`, permanent: true },
      // Sub paths keep their prefix. Only the root is rewritten on the new
      // domain, so /planner/manifest.webmanifest lives at /planner there too
      // and stripping the prefix would have sent the app's own manifest to a
      // 404.
      { source: "/planner/:path*", has: [{ type: "host" as const, value: host }],
        destination: `https://${LAP_MAP}/planner/:path*`, permanent: true },
      // The van checklist is the tool's other half and belongs on the tool's
      // own domain, the same as the planner. Without this it would also answer
      // on the magazine, which splits the address people share and hands two
      // domains the standing that should sit with one.
      { source: "/van", has: [{ type: "host" as const, value: host }],
        destination: `https://${LAP_MAP}/van`, permanent: true },
    ]);
  },

  // The rewrite that used to serve the planner at thelapmap.com.au's root is
  // gone with it. The Lap Map is its own project and its own deployment since
  // 30 Aug 2026, so this app no longer answers on that domain at all.
  //
  // The redirects above stay, and matter more than they did: they are what
  // keeps every link and every search result pointing at fifolife.au/planner
  // working, and hands their standing to the tool's own address rather than
  // stranding them on a 404 here.
};

export default nextConfig;
