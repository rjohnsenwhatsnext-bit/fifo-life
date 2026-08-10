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

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/",
          has: [{ type: "host", value: LAP_MAP }],
          destination: "/planner",
        },
        {
          source: "/",
          has: [{ type: "host", value: `www.${LAP_MAP}` }],
          destination: "/planner",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
